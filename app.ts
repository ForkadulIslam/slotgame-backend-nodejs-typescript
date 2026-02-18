import dotenv from 'dotenv';
dotenv.config();
import { createClient } from 'redis';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import {
    customScenarios as scenarios,
} from './src/games/slot-with-free-games/index.js';
import { getRoundData, getCustomScenarioData, getInitialData } from "./src/data.js";
import {SwfgConfig} from "./src/games/slot-with-free-games/SwfgConfig.js";
import {SwfgSession} from "./src/games/slot-with-free-games/SwfgSession.js";
import {SwfgSessionWinCalculator} from "./src/games/slot-with-free-games/SwfgSessionWinCalculator.js";
import {
    SymbolsCombinationsGenerator,
    VideoSlotWithFreeGamesSession,
    VideoSlotWithFreeGamesSessionSerializer,
    LinesDefinitionsFor5x4,
    CustomLinesDefinitions
} from "pokie";

import AsyncLock from 'async-lock'; // Added import for async-lock
import { updateBackendWithUserBalance } from './session-finalizer.js';

const app = express();
const allowedOrigins = [
    'https://game.bdflc.org', 
    'http://localhost:3002', // Update this if your local port is different (e.g., 5173 or 3001)
    'http://localhost:5173'  // Common Vite/React port
];
app.use(express.json());
app.use(cors({
    origin: function (origin:any, callback:any) {
        // Allow requests with no origin (like mobile apps, curl, or Postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Recommended if you use sessions/cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
const lock = new AsyncLock(); // Created an instance of AsyncLock

// --- Redis Client Setup ---
let redisClient: ReturnType<typeof createClient>;
const SESSION_EXPIRY = 3600 * 24; // 24 Hours
(async () => {
    redisClient = createClient({
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD,
        socket: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || '6379', 10)
        }
    });

    redisClient.on('error', (err) => console.error('Redis Client Error', err));

    try {
        await redisClient.connect();
        console.log('Successfully connected to Redis!');
    } catch (err) {
        console.error('Failed to connect to Redis:', err);
    }
})();



// Helper function to fetch user data from the external API
async function fetchUserData(userId:any) {
    const backendApiBaseUrl = process.env.BACKEND_API_BASE_URL;
    if (!backendApiBaseUrl) {
        throw new Error('LARAVEL_API_BASE_URL is not defined in environment variables.');
    }
    try {
        const userApiUrl = `${backendApiBaseUrl}/api/user_by_id/${userId}`;
        const response = await fetch(userApiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const userData = await response.json();
        if (userData.status === 'success' && userData.data && userData.data.balance) {
            return {
                initialUserBalance: parseFloat(userData.data.balance),
                username: userData.data.username,
            };
        } else {
            throw new Error('Could not retrieve user balance or username from the external API.');
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
        throw new Error('Failed to fetch user data from the external API.');
    }
}

async function balanceLock(userId:any) {
    const backendApiBaseUrl = process.env.BACKEND_API_BASE_URL;
    if (!backendApiBaseUrl) {
        throw new Error('LARAVEL_API_BASE_URL is not defined in environment variables.');
    }
    try {
        const userApiUrl = `${backendApiBaseUrl}/api/balance_lock`;
        const response = await fetch(userApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId}),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const userData = await response.json();
        if (userData.status === 'success' && userData.data && userData.data.balanceLoct) {
            return {
                balanceLoct: userData.data.balanceLoct,
            };
        } else {
            throw new Error('Could not lock user balance.');
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
        throw new Error('Failed to fetch user data from the external API.');
    }
}


/**
 * We only save the "Truth" - the balance.
 * If you have a Free Spin session that persists across refreshes, 
 * you would save that state here too.
 */
async function savePlayerState(sessionId: string, stateObject: any) {
    await redisClient.set(`slot_ptr_${sessionId}`, JSON.stringify(stateObject), { EX: SESSION_EXPIRY });
}

async function getPlayerState(sessionId: string): Promise<any | null> {
    const data = await redisClient.get(`slot_ptr_${sessionId}`);
    return data ? JSON.parse(data.toString()) : null;
}

async function deletePlayerState(sessionId: string): Promise<void> {
    await redisClient.del(`slot_ptr_${sessionId}`);
}

async function setUserSessionId(userId: string, sessionId: string): Promise<void> {
    await redisClient.set(`user_session:${userId}`, sessionId, { EX: SESSION_EXPIRY });
}

async function getUserSessionId(userId: string): Promise<string | null> {
    const data = await redisClient.get(`user_session:${userId}`);
    return data ? data.toString() : null;
}

async function deleteUserSessionMapping(userId: string): Promise<void> {
    await redisClient.del(`user_session:${userId}`);
}




// Session management
interface GameSession {
    session: VideoSlotWithFreeGamesSession;
    serializer: VideoSlotWithFreeGamesSessionSerializer;
}

const activeSessions = new Map<string, GameSession>();

const createNewSession = (): GameSession => {
    const config = new SwfgConfig();
    config.setReelsNumber(5);
    config.setReelsSymbolsNumber(4);
    config.setAvailableBets([1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 50, 100, 150, 200, 300, 400, 500, 1000]);
    config.setAvailableSymbols(["Ace", "King", "Queen", "Jack", "Ten", "Nine", "Wild", "Scatter1", "Scatter2"]);
    config.setWildSymbols(["Wild"]);
    config.setScatterSymbols(["Scatter1", "Scatter2"]);
    const defaultLinesDefinitions = new LinesDefinitionsFor5x4();
    const customLinesDefinitions = new CustomLinesDefinitions();
    customLinesDefinitions.setLineDefinition("0", defaultLinesDefinitions.getLineDefinition("0"));
    customLinesDefinitions.setLineDefinition("1", defaultLinesDefinitions.getLineDefinition("1"));
    customLinesDefinitions.setLineDefinition("2", defaultLinesDefinitions.getLineDefinition("2"));
    customLinesDefinitions.setLineDefinition("3", defaultLinesDefinitions.getLineDefinition("3"));
    customLinesDefinitions.setLineDefinition("4", defaultLinesDefinitions.getLineDefinition("4"));
    customLinesDefinitions.setLineDefinition("5", defaultLinesDefinitions.getLineDefinition("5"));
    customLinesDefinitions.setLineDefinition("6", defaultLinesDefinitions.getLineDefinition("6"));
    customLinesDefinitions.setLineDefinition("7", defaultLinesDefinitions.getLineDefinition("7"));
    customLinesDefinitions.setLineDefinition("8", defaultLinesDefinitions.getLineDefinition("8"));
    customLinesDefinitions.setLineDefinition("9", defaultLinesDefinitions.getLineDefinition("9"));
    customLinesDefinitions.setLineDefinition("10", defaultLinesDefinitions.getLineDefinition("10"));
    customLinesDefinitions.setLineDefinition("11", defaultLinesDefinitions.getLineDefinition("11"));
    customLinesDefinitions.setLineDefinition("12", [0, 1, 0, 1, 0]);
    customLinesDefinitions.setLineDefinition("13", [1, 2, 1, 2, 1]);
    customLinesDefinitions.setLineDefinition("14", [2, 3, 2, 3, 2]);
    customLinesDefinitions.setLineDefinition("15", [1, 0, 1, 0, 1]);
    customLinesDefinitions.setLineDefinition("16", [2, 1, 2, 1, 2]);
    customLinesDefinitions.setLineDefinition("17", [3, 2, 3, 2, 3]);
    customLinesDefinitions.setLineDefinition("18", [0, 1, 2, 3, 2]);
    customLinesDefinitions.setLineDefinition("19", [3, 2, 1, 0, 1]);
    customLinesDefinitions.setLineDefinition("20", [0, 2, 0, 2, 0]);
    customLinesDefinitions.setLineDefinition("21", [1, 3, 1, 3, 1]);
    customLinesDefinitions.setLineDefinition("22", [1, 0, 0, 0, 1]);
    customLinesDefinitions.setLineDefinition("23", [2, 3, 3, 3, 2]);
    customLinesDefinitions.setLineDefinition("24", [0, 2, 1, 2, 0]);
    config.setLinesDefinitions(customLinesDefinitions);

    const combinationsGenerator = new SymbolsCombinationsGenerator(config);
    const winCalculator = new SwfgSessionWinCalculator(config);
    const session = new SwfgSession(config, combinationsGenerator, winCalculator);
    const serializer = new VideoSlotWithFreeGamesSessionSerializer();
    return { session, serializer };
}

const getOrCreateSession = (sessionId: string): GameSession => {
    if (!activeSessions.has(sessionId)) {
        console.log(`Creating new session for id: ${sessionId}`);
        activeSessions.set(sessionId, createNewSession());
    }
    return activeSessions.get(sessionId)!;
}





// Route to test Redis connection
app.get('/test-redis', async (req, res) => {
    if (!redisClient || !redisClient.isReady) {
        return res.status(500).json({ error: 'Redis client is not connected.' });
    }
    try {
        const testKey = 'test-key';
        const testValue = 'Hello Redis!';
        await redisClient.set(testKey, testValue, { EX: 10 }); // Set with 10s expiry
        const value = await redisClient.get(testKey);
        res.json({ status: 'success', value });
    } catch (error:any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});


app.get('/', (req, res)=>{
    res.json('Live server');
})

app.post('/start-session', (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({
            status: 'error',
            message: 'User ID is required to start a session.'
        });
    }

    const sessionId = uuidv4();
    getOrCreateSession(sessionId); // Create session on request
    res.json({ sessionId });
});

app.get('/user-session-status', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
        return res.status(400).json({ error: "Query parameter 'sessionId' is required." });
    }

    try {
        const { session, serializer } = getOrCreateSession(sessionId);
        const data = await getInitialData(session, serializer);
        res.json(data);
    } catch (error) {
        console.error("Error during initial data fetch:", error);
        res.status(500).json({ error: "An error occurred during the initial data fetch." });
    }
});

app.get('/spin', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
        return res.status(400).json({ error: "Query parameter 'sessionId' is required." });
    }

    try {
        const { session, serializer } = getOrCreateSession(sessionId);
        const data = await getRoundData(session, serializer);
        res.json(data);
    } catch (error) {
        console.error("Error during spin:", error);
        res.status(500).json({ error: "An error occurred during the spin." });
    }
});

app.get('/simulation', async (req, res) => {
    const scenarioId = req.query.id as string;
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
        return res.status(400).json({ error: "Query parameter 'sessionId' is required." });
    }
    if (!scenarioId) {
        return res.status(400).json({ error: "Query parameter 'id' is required." });
    }

    const isValidScenario = scenarios.some(s => s[0] === scenarioId);
    if (!isValidScenario) {
        return res.status(400).json({ error: `Invalid scenario id: ${scenarioId}` });
    }

    try {
        const { session, serializer } = getOrCreateSession(sessionId);
        const data = await getCustomScenarioData(session, serializer, scenarios, scenarioId);
        res.json(data);
    } catch (error) {
        console.error(`Error during simulation for scenario ${scenarioId}:`, error);
        res.status(500).json({ error: `An error occurred during the simulation.` });
    }
});

const port = process.env.PORT || 3002;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
