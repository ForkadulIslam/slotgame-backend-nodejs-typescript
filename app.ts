import dotenv from 'dotenv';
dotenv.config();
import { createClient } from 'redis';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import {
    gameRegistry
} from './src/games/activeGame.js';
import { getRoundData, getCustomScenarioData, getInitialData } from "./src/data.js";


import {
    SymbolsCombinationsGenerator,
    VideoSlotWithFreeGamesSession,
    VideoSlotWithFreeGamesSessionSerializer,
    VideoSlotWithFreeGamesRoundNetworkData,
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
    scenarios: any;
}

const activeSessions = new Map<string, GameSession>();

const createNewSession = (gameId: string = "classic"): GameSession => {
    const game = gameRegistry[gameId] || gameRegistry["classic"];
    const config = new game.SwfgConfig();
    const combinationsGenerator = new SymbolsCombinationsGenerator(config);
    const winCalculator = new game.SwfgSessionWinCalculator(config);
    const session = new game.SwfgSession(config, combinationsGenerator, winCalculator);
    const serializer = new VideoSlotWithFreeGamesSessionSerializer();
    return { session, serializer, scenarios: game.customScenarios };
}

const getOrCreateSession = (sessionId: string, gameId?: string): GameSession => {
    if (!activeSessions.has(sessionId)) {
        console.log(`Creating new session for id: ${sessionId} (Variant: ${gameId || 'default/classic'})`);
        activeSessions.set(sessionId, createNewSession(gameId));
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
    const { userId, gameId } = req.body;
    if (!userId) {
        return res.status(400).json({
            status: 'error',
            message: 'User ID is required to start a session.'
        });
    }

    const sessionId = uuidv4();
    getOrCreateSession(sessionId, gameId); // Create session with optional gameId
    res.json({ 
        status: 'success', 
        data: { sessionId } 
    });
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

    try {
        const { session, serializer, scenarios } = getOrCreateSession(sessionId);
        
        const isValidScenario = scenarios.some((s:any) => s[0] === scenarioId);
        if (!isValidScenario) {
            return res.status(400).json({ error: `Invalid scenario id: ${scenarioId}` });
        }

        const data = await getCustomScenarioData(session, serializer, scenarios, scenarioId);
        res.json(data);
    } catch (error) {
        console.error(`Error during simulation for scenario ${scenarioId}:`, error);
        res.status(500).json({ error: `An error occurred during the simulation.` });
    }
});


app.get('/user-session-simulation', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const iterations = parseInt(req.query.iterations as string) || 10000;

    if (!sessionId) {
        return res.status(400).json({ error: "Query parameter 'sessionId' is required." });
    }

    try {
        
        const { session, serializer } = getOrCreateSession(sessionId);
        session.setCreditsAmount(10000);
        session.setBet(1);
        let totalNormalRounds = 0;
        let totalFreeRounds = 0;
        let totalNormalWin = 0;
        let totalFreeWin = 0;
        let normalWinCount = 0;
        let freeSpinTriggerCount = 0;
        let totalBet = 0;
        let maxWin = 0;
        const wins: number[] = [];

        for(let i=0; i < iterations; i++){
            let data = await getRoundData(session, serializer) as VideoSlotWithFreeGamesRoundNetworkData;
            const isFreeGame = data.freeGamesNum !== undefined && data.freeGamesNum > 0;
            
            let roundWin = 0;
            if (data.winningLines) {
                Object.values(data.winningLines).forEach(line => {
                    roundWin += line.winAmount;
                });
            }
            if (data.winningScatters) {
                Object.values(data.winningScatters).forEach(scatter => {
                    roundWin += scatter.winAmount;
                });
            }

            maxWin = Math.max(maxWin, roundWin);
            wins.push(roundWin);

            if (isFreeGame) {
                totalFreeRounds++;
                totalFreeWin += roundWin;
            } else {
                totalNormalRounds++;
                totalNormalWin += roundWin;
                totalBet += data.bet;
                if (roundWin > 0) {
                    normalWinCount++;
                }
                if (data.wonFreeGamesNumber !== undefined && data.wonFreeGamesNumber > 0) {
                    freeSpinTriggerCount++;
                }
            }
        }

        const normalRtp = totalBet > 0 ? totalNormalWin / totalBet : 0;
        const freeRtp = totalBet > 0 ? totalFreeWin / totalBet : 0;
        const totalRtp = totalBet > 0 ? (totalNormalWin + totalFreeWin) / totalBet : 0;
        const hitFrequency = totalNormalRounds > 0 ? normalWinCount / totalNormalRounds : 0;
        const freeSpinTriggerFrequency = totalNormalRounds > 0 ? freeSpinTriggerCount / totalNormalRounds : 0;

        // Volatility calculation (Standard Deviation)
        const mean = (totalNormalWin + totalFreeWin) / iterations;
        const squareDiffs = wins.map(win => Math.pow(win - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / iterations;
        const volatility = Math.sqrt(avgSquareDiff);

        res.json({
            normalRoundsCount: totalNormalRounds,
            freeRoundsCount: totalFreeRounds,
            normalRtp: parseFloat(normalRtp.toFixed(4)),
            freeRtp: parseFloat(freeRtp.toFixed(4)),
            totalRtp: parseFloat(totalRtp.toFixed(4)),
            hitFrequency: parseFloat(hitFrequency.toFixed(4)),
            freeSpinTriggerFrequency: parseFloat(freeSpinTriggerFrequency.toFixed(4)),
            volatility: parseFloat(volatility.toFixed(4)),
            maxWin: parseFloat(maxWin.toFixed(2)),
            bonusContribution: totalNormalWin + totalFreeWin > 0 ? parseFloat((totalFreeWin / (totalNormalWin + totalFreeWin)).toFixed(4)) : 0,
            details: {
                totalNormalWin: parseFloat(totalNormalWin.toFixed(2)),
                totalFreeWin: parseFloat(totalFreeWin.toFixed(2)),
                totalBet: parseFloat(totalBet.toFixed(2)),
                avgWinPerTrigger: freeSpinTriggerCount > 0 ? parseFloat((totalFreeWin / freeSpinTriggerCount).toFixed(2)) : 0
            }
        });

    } catch (error) {
        console.error("Error during simulation:", error);
        res.status(500).json({ error: "An error occurred during the simulation." });
    }
})

const port = process.env.PORT || 3002;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

