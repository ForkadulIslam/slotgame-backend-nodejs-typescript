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
import { acquireLock, releaseLock } from './src/utils/redis-lock.js';
import { recordSpinStats } from './src/utils/stats.js';

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
    console.log(process.env.REDIS_HOST);
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
        // Enable keyspace notifications for expired events (Ex)
        // 'E' for Keyevent events, 'x' for Expired events
        await redisClient.configSet('notify-keyspace-events', 'Ex');
        console.log('Successfully connected to Redis and enabled expiration triggers!');
    } catch (err) {
        console.error('Failed to connect to Redis:', err);
    }
})();

const INACTIVITY_THRESHOLD = 60; // 1 minute in seconds

async function refreshInactivityTrigger(sessionId: string) {
    await redisClient.set(`inactivity_trigger:${sessionId}`, '', { EX: INACTIVITY_THRESHOLD });
}



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
        if (userData.status === 'success' && userData.data && userData.data.balanceLock) {
            return {
                balanceLock: userData.data.balanceLock,
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
    lastActivityTime: number; // Heartbeat for RAM cleanup
    baseCredits: number; // The balance currently synced in Laravel
}

const activeSessions = new Map<string, GameSession>();

const createNewSession = (gameId: string = "classic"): GameSession => {
    const game = gameRegistry[gameId] || gameRegistry["classic"];
    const config = new game.SwfgConfig();
    const combinationsGenerator = new SymbolsCombinationsGenerator(config);
    const winCalculator = new game.SwfgSessionWinCalculator(config);
    const session = new game.SwfgSession(config, combinationsGenerator, winCalculator);
    const serializer = new VideoSlotWithFreeGamesSessionSerializer();
    return { 
        session, 
        serializer, 
        scenarios: game.customScenarios,
        lastActivityTime: Date.now(), // Initial heartbeat
        baseCredits: 0
    };
}

const getOrCreateSession = (sessionId: string, gameId?: string): GameSession => {
    if (!activeSessions.has(sessionId)) {
        activeSessions.set(sessionId, createNewSession(gameId));
    }
    const container = activeSessions.get(sessionId)!;
    container.lastActivityTime = Date.now(); // Update heartbeat on every access
    return container;
}

// --- RAM Cleanup Logic ---
const RAM_CLEANUP_THRESHOLD = 10 * 60 * 1000; // 10 Minutes
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [sessionId, container] of activeSessions.entries()) {
        if (now - container.lastActivityTime > RAM_CLEANUP_THRESHOLD) {
            activeSessions.delete(sessionId);
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        console.log(`[RAM Cleanup] Purged ${cleanedCount} inactive sessions from memory.`);
    }
}, 60000); // Check every minute





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

app.post('/start-session', async (req, res) => {
    const { userId, gameId } = req.body;
    if (!userId) {
        return res.status(400).json({
            status: 'error',
            message: 'User ID is required to start a session.'
        });
    }

    try {
        await lock.acquire(userId, async () => {

            try {
                await balanceLock(userId);
            } catch (error: any) {
                res.status(500).json({
                    status: 'error',
                    message: 'Failed to lock user balance : ' + error.message
                });
                return;
            }

            const defaultBoosterConfig = {
                active: true,
                multiplier: 1,
                no_of_spin_round: 10,
                uses_left: 15,
                spin_interval: 50
            };

            let initialUserBalance: number | undefined;
            let currentBoosterConfig = defaultBoosterConfig;
            let username: string | undefined;
            let isSynced = false;
            let lastActivityTime = Date.now();
            let spin_count = 0;

            // Check for existing session in Redis to recover state or detect variant change
            const oldSessionId = await getUserSessionId(userId);
            //console.log(oldSessionId);
            if (oldSessionId) {
                const existingSessionState = await getPlayerState(oldSessionId);
                if (existingSessionState) {
                    initialUserBalance = existingSessionState.credits;
                    currentBoosterConfig = existingSessionState.booster || defaultBoosterConfig;
                    username = existingSessionState.username;
                    lastActivityTime = Date.now();
                    spin_count = existingSessionState.spin_count || 0;
                }
            }

            // Fetch balance from external API if no session exists or if balance recovery failed
            if (initialUserBalance === undefined || isNaN(initialUserBalance)) {
                try {
                    const fetchedData = await fetchUserData(userId);
                    initialUserBalance = fetchedData.initialUserBalance;
                    username = fetchedData.username;
                } catch (error: any) {
                    res.status(500).json({
                        status: 'error',
                        message: 'Failed to fetch user data from the external API: ' + error.message
                    });
                    return; 
                }
            }

            if (initialUserBalance! < 0) {
                 res.status(400).json({
                    status: 'error',
                    message: 'User balance is below zero, cannot start a session.'
                });
                return;
            }

            // --- Generate a fresh Session ID for the new session ---
            const sessionId = uuidv4();
            
            // --- Initialize the new session ---
            const container = getOrCreateSession(sessionId, gameId);
            const { session, serializer } = container;
            
            session.setCreditsAmount(initialUserBalance!);
            container.baseCredits = initialUserBalance!; // Set the "Laravel" balance as base

            const initialState = {
                userId: userId,
                username: username,
                credits: session.getCreditsAmount(),
                baseCredits: initialUserBalance!, // Persist baseCredits in Redis
                spin_count: spin_count,
                booster: currentBoosterConfig,
                isSynced: isSynced,
                lastActivityTime: lastActivityTime,
                gameId: gameId || 'classic',
                freeGamesNum: 0,
                freeGamesSum: 0,
                freeGamesBank: 0
            };

            // --- Atomically save new session state and update user mapping in Redis ---
            await Promise.all([
                savePlayerState(sessionId, initialState),
                setUserSessionId(userId, sessionId),
                refreshInactivityTrigger(sessionId)
            ]);
            
            // --- Crucial Cleanup: Purge the old session from memory and Redis to enforce "one session per user" ---
            if (oldSessionId) {
                await deletePlayerState(oldSessionId);
                activeSessions.delete(oldSessionId); 
            }

            const initialData = serializer.getInitialData(session);
            res.json({
                status: 'success',
                message: 'Session started successfully.',
                data: { sessionId, ...initialData }
            });

        }); // End of lock
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: `Failed to acquire session lock: ${error.message}` });
    }
});

app.post('/spin', async (req, res) => {
    
    const { bet, sessionId } = req.body; 

    // Numeric validation for bet
    const numericBet = parseFloat(bet);
    if (!sessionId || isNaN(numericBet) || numericBet <= 0) {
        return res.status(400).json({ error: 'Missing or invalid sessionId/bet amount' });
    }

    // Acquire a distributed lock with a 30s safety TTL and unique token
    const lockToken = await acquireLock(redisClient, sessionId, 30);
    if (!lockToken) {
        return res.status(429).json({ error: 'A spin is already in progress or session is being finalized.' });
    }

    try {
        // Fetch state INSIDE the lock to prevent race conditions
        const state = await getPlayerState(sessionId);
        if (!state) {
            return res.status(400).json({ error: 'Invalid or expired sessionId' });
        }

        const activeSessionId = await getUserSessionId(state.userId);
        if (activeSessionId !== sessionId) {
            return res.status(403).json({ error: 'Session is no longer active.' });
        }

        // Re-hydrate session with the correct variant stored in state
        const container = getOrCreateSession(sessionId, state.gameId);
        const { session: userSession, serializer: userSessionSerializer } = container;

        // Restore baseCredits to container for health monitoring
        container.baseCredits = state.baseCredits || state.credits; 

        // Re-hydrate balance from Redis into the game engine
        userSession.setCreditsAmount(state.credits);

        // Validate Balance
        if (userSession.getCreditsAmount() < numericBet) {
            return res.status(400).json({ error: 'Insufficient credits' });
        }

        // Increment spin count and execute
        state.spin_count++;
        userSession.setBet(numericBet);

        const roundData = await getRoundData(userSession, userSessionSerializer) as VideoSlotWithFreeGamesRoundNetworkData;

        // Calculate totalWin summary for the stats
        let totalWin = 0;
        if (roundData.winningLines) {
            Object.values(roundData.winningLines).forEach(line => {
                totalWin += line.winAmount;
            });
        }
        if (roundData.winningScatters) {
            Object.values(roundData.winningScatters).forEach(scatter => {
                totalWin += scatter.winAmount;
            });
        }

        // Detect if this was a Free Spin for accurate financial stats
        const isFreeSpin = roundData.freeGamesNum !== undefined && roundData.freeGamesNum > 0;
        const betForStats = isFreeSpin ? 0 : numericBet;
        if(isFreeSpin){
            console.log(`====${roundData.freeGamesNum}===`)
        }
        // Record Stats
        await recordSpinStats(redisClient, state.userId, betForStats, totalWin, state.gameId, false, 1, isFreeSpin);

        // Update state with new balance, safety net fields, and activity time
        state.credits = userSession.getCreditsAmount();
        state.freeGamesNum = userSession.getFreeGamesNum();
        state.freeGamesSum = userSession.getFreeGamesSum();
        state.freeGamesBank = userSession.getFreeGamesBank();
        state.lastActivityTime = Date.now();
        state.isSynced = false;

        // Persist the updated state back to Redis and refresh heartbeat
        await Promise.all([
            savePlayerState(sessionId, state),
            refreshInactivityTrigger(sessionId)
        ]);

        res.json({
            ...roundData,
            spin_count: state.spin_count,
            credits: state.credits // Return updated credits for UI sync
        });

    } catch (error: any) {
        console.error("Error during spin:", error);
        res.status(500).json({ error: error.message || "An error occurred during the spin." });
    } finally {
        // Safe release: only unlocks if the token still matches
        await releaseLock(redisClient, sessionId, lockToken);
    }
});

app.get('/user-session-status', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
        return res.status(400).json({ error: "Query parameter 'sessionId' is required." });
    }

    try {
        // 1. Fetch the state from Redis (Source of Truth)
        const state = await getPlayerState(sessionId);
        if (!state) {
            return res.status(404).json({ 
                status: 'error', 
                message: "Session not found or expired. Please start a new one." 
            });
        }

        // 2. Security Check: Verify this is still the active session for the user
        const activeSessionId = await getUserSessionId(state.userId);
        if (activeSessionId !== sessionId) {
            return res.status(403).json({ 
                status: 'error', 
                message: "This session is no longer active." 
            });
        }

        // 3. Re-hydrate: Retrieve/Create the engine and restore variant & balance
        const container = getOrCreateSession(sessionId, state.gameId);
        const { session, serializer } = container;
        
        session.setCreditsAmount(state.credits);
        container.baseCredits = state.baseCredits || state.credits; // Restore baseCredits

        // 4. Get the initial game data (Reels, Symbols, etc.)
        const initialData = await getInitialData(session, serializer);

        // 5. Return complete state for frontend recovery
        res.json({
            status: 'success',
            data: {
                sessionId,
                ...initialData,
                credits: state.credits,
                spin_count: state.spin_count,
                username: state.username,
                booster: state.booster,
                gameId: state.gameId
            }
        });
    } catch (error) {
        console.error("Error during session status recovery:", error);
        res.status(500).json({ status: 'error', message: "Internal server error during recovery." });
    }
});


//This endpoint is to be used for testing specific scenerio by demo session;
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
        const state = await getPlayerState(sessionId);

        if (!state) {
            return res.status(400).json({ error: 'Invalid or expired sessionId' });
        }

        const activeSessionId = await getUserSessionId(state.userId);
        if (activeSessionId !== sessionId) {
            return res.status(403).json({ error: 'Session is no longer active.' });
        }

        const { session, serializer, scenarios } = getOrCreateSession(sessionId, state?.gameId);
        session.setCreditsAmount(state.credits);

        
        const isValidScenario = scenarios.some((s:any) => s[0] === scenarioId);
        if (!isValidScenario) {
            return res.status(400).json({ error: `Invalid scenario id: ${scenarioId}` });
        }

        state.spin_count++;
        const data = await getCustomScenarioData(session, serializer, scenarios, scenarioId) as VideoSlotWithFreeGamesRoundNetworkData;
        state.credits = session.getCreditsAmount();
        state.freeGamesNum = session.getFreeGamesNum();
        state.freeGamesSum = session.getFreeGamesSum();
        state.freeGamesBank = session.getFreeGamesBank();
        state.lastActivityTime = Date.now();
        state.isSynced = false;

        await Promise.all([
            savePlayerState(sessionId, state),
            refreshInactivityTrigger(sessionId)
        ]);
        res.json({
            ...data,
            spin_count: state.spin_count,
            credits: state.credits // Return updated credits for UI sync
        });
    } catch (error) {
        console.error(`Error during simulation for scenario ${scenarioId}:`, error);
        res.status(500).json({ error: `An error occurred during the simulation.` });
    }
});


//This endpoint is to be used for testing and provided with demo user id and session
app.get('/user-session-simulation', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const iterations = parseInt(req.query.iterations as string) || 10000;

    if (!sessionId) {
        return res.status(400).json({ error: "Query parameter 'sessionId' is required." });
    }

    try {
        const state = await getPlayerState(sessionId);
        const { session, serializer } = getOrCreateSession(sessionId, state?.gameId);
        const userId = state?.userId || 'sim-user';
        const gameId = state?.gameId || 'classic';

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

        // --- BULK STATS RECORDING (One Redis round-trip for 10,000+ spins) ---
        const totalSimWin = totalNormalWin + totalFreeWin;
        await recordSpinStats(redisClient, userId, totalBet, totalSimWin, gameId, true, iterations);

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

app.get('/admin/health', async (req, res) => {
    const apiKey = req.headers['x-admin-key'];
    const expectedKey = process.env.ADMIN_API_KEY || 'default_admin_secret';

    if (apiKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid admin API key' });
    }

    // Calculate Total Liability and Net Floating PnL
    let totalLiability = 0;
    let netFloatingPnl = 0;

    for (const container of activeSessions.values()) {
        const currentCredits = container.session.getCreditsAmount();
        totalLiability += currentCredits;
        netFloatingPnl += (currentCredits - container.baseCredits);
    }

    const mem = process.memoryUsage();
    res.json({
        status: 'success',
        timestamp: Date.now(),
        active_sessions: activeSessions.size,
        total_liability: parseFloat(totalLiability.toFixed(2)),
        net_floating_pnl: parseFloat(netFloatingPnl.toFixed(2)),
        memory: {
            rss: (mem.rss / 1024 / 1024).toFixed(2) + ' MB',
            heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
            heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
            external: (mem.external / 1024 / 1024).toFixed(2) + ' MB'
        },
        uptime: parseFloat(process.uptime().toFixed(2)),
        node_version: process.version
    });
});

app.get('/admin/player-stats', async (req, res) => {
    const apiKey = req.headers['x-admin-key'];
    const expectedKey = process.env.ADMIN_API_KEY || 'default_admin_secret';
    const userId = req.query.userId as string;

    if (apiKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid admin API key' });
    }

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId parameter' });
    }

    try {
        // Fetch player metrics from Redis
        const [stats, simStats] = await Promise.all([
            redisClient.hGetAll(`stats:player:${userId}`),
            redisClient.hGetAll(`sim_stats:player:${userId}`)
        ]);

        const formatPlayerStats = (raw: any) => {
            const bet = parseFloat(raw.total_bet || '0');
            const win = parseFloat(raw.total_win || '0');
            const spins = parseInt(raw.total_spins || '0', 10);
            const net_pnl = parseFloat(raw.net_pnl || '0'); 
            const artp = bet > 0 ? (win / bet) * 100 : 0;
            const house_edge = bet > 0 ? (net_pnl / bet) * 100 : 0;

            return {
                total_bet: parseFloat(bet.toFixed(2)),
                total_win: parseFloat(win.toFixed(2)),
                total_spins: spins,
                net_pnl: parseFloat(net_pnl.toFixed(2)),
                artp: parseFloat(artp.toFixed(2)) + '%',
                house_edge: parseFloat(house_edge.toFixed(2)) + '%',
                status: net_pnl > 0 ? 'Profitable (Company)' : 'Unprofitable (Company)'
            };
        };

        // --- NEW: Security Audit for Withdrawals ---
        const liveRaw = stats as any;
        const liveSpins = parseInt(liveRaw.total_spins || '0', 10);
        const liveBet = parseFloat(liveRaw.total_bet || '0');
        const liveWin = parseFloat(liveRaw.total_win || '0');
        const liveRtp = liveBet > 0 ? (liveWin / liveBet) * 100 : 0;

        const securityAudit = {
            is_new_member: liveSpins < 100,
            loyalty_tier: liveSpins > 1000 ? 'Silver' : (liveSpins > 100 ? 'Bronze' : 'Newbie'),
            is_high_risk: liveRtp > 300 && liveSpins < 50, // Flag if winning >300% on <50 spins
            recommended_limit: liveSpins < 100 ? 100 : (liveSpins < 1000 ? 1000 : 5000),
            turnover_volume: liveBet, // Laravel will compare this to deposits
            withdrawal_verdict: (liveSpins > 50 && liveRtp < 150) ? 'Safe' : 'Manual Review Required'
        };

        if (Object.keys(stats).length === 0 && Object.keys(simStats).length === 0) {
            return res.status(404).json({ error: `No stats found for player ID: ${userId}` });
        }

        res.json({
            status: 'success',
            userId: userId,
            timestamp: Date.now(),
            live: formatPlayerStats(stats),
            simulation: formatPlayerStats(simStats),
            security_audit: securityAudit
        });
    } catch (error: any) {
        console.error(`[AdminPlayerStats] Error fetching player ${userId}:`, error);
        res.status(500).json({ error: 'Failed to fetch player-level statistics' });
    }
});

app.get('/admin/stats', async (req, res) => {
    const apiKey = req.headers['x-admin-key'];
    const expectedKey = process.env.ADMIN_API_KEY || 'default_admin_secret';

    if (apiKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid admin API key' });
    }

    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch raw counters from Redis
        const [globalStats, dailyStats, simGlobalStats, simDailyStats] = await Promise.all([
            redisClient.hGetAll('stats:global'),
            redisClient.hGetAll(`stats:daily:${today}`),
            redisClient.hGetAll('sim_stats:global'),
            redisClient.hGetAll(`sim_stats:daily:${today}`)
        ]);

        // Fetch Stats for each game variant
        const gameIds = Object.keys(gameRegistry);
        const gameStatsPromises = gameIds.map(id => redisClient.hGetAll(`stats:game:${id}`));
        const gameStatsResults = await Promise.all(gameStatsPromises);

        const formatStats = (raw: any) => {
            const bet = parseFloat(raw.total_bet || '0');
            const win = parseFloat(raw.total_win || '0');
            const spins = parseInt(raw.total_spins || '0', 10);
            const ggr = bet - win;
            const artp = bet > 0 ? (win / bet) * 100 : 0;

            return {
                total_bet: parseFloat(bet.toFixed(2)),
                total_win: parseFloat(win.toFixed(2)),
                total_spins: spins,
                ggr: parseFloat(ggr.toFixed(2)),
                artp: parseFloat(artp.toFixed(2)) + '%'
            };
        };

        const gamesBreakdown: any = {};
        gameIds.forEach((id, index) => {
            gamesBreakdown[id] = formatStats(gameStatsResults[index]);
        });

        res.json({
            status: 'success',
            timestamp: Date.now(),
            live: {
                global: formatStats(globalStats),
                today: formatStats(dailyStats),
                games: gamesBreakdown
            },
            simulation: {
                global: formatStats(simGlobalStats),
                today: formatStats(simDailyStats)
            }
        });
    } catch (error: any) {
        console.error('[AdminStats] Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Failed to fetch real-time statistics' });
    }
});

const port = process.env.PORT || 3002;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

