import dotenv from 'dotenv';
dotenv.config();
import { createClient } from 'redis';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid'; // Import uuid
import { createGameSession } from './src/games/simple-slot/slot5_4_reels.js'; // Import the factory
import { runFreeGamesSimulation } from './src/games/simple-slot/free-game-config.js';
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
    origin: function (origin, callback) {
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
let redisClient;
const SESSION_EXPIRY = 3600 * 24; // 24 Hours



(async () => {
    redisClient = createClient({
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD,
        socket: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT
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
async function fetchUserData(userId) {
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

async function balanceLock(userId) {
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
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

/**
 * We only save the "Truth" - the balance.
 * If you have a Free Spin session that persists across refreshes, 
 * you would save that state here too.
 */
async function savePlayerState(sessionId, stateObject) {
    await redisClient.set(`slot_ptr_${sessionId}`, JSON.stringify(stateObject), { EX: SESSION_EXPIRY });
}

async function getPlayerState(sessionId) {
    const data = await redisClient.get(`slot_ptr_${sessionId}`);
    return data ? JSON.parse(data) : null;
}

async function deletePlayerState(sessionId) {
    await redisClient.del(`slot_ptr_${sessionId}`);
}

async function setUserSessionId(userId, sessionId) {
    await redisClient.set(`user_session:${userId}`, sessionId, { EX: SESSION_EXPIRY });
}

async function getUserSessionId(userId) {
    return await redisClient.get(`user_session:${userId}`);
}

async function deleteUserSessionMapping(userId) {
    await redisClient.del(`user_session:${userId}`);
}





//console.log(runFreeGamesSimulation(1, 20));
app.get('/', (req, res)=>{
    res.json('Live server');
})

app.post('/start-session', async (req, res) => {
    const { userId } = req.body;
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
            } catch (error) {
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

            let initialUserBalance;
            let currentBoosterConfig = defaultBoosterConfig;
            let username;
            let isSynced = false;
            let lastActivityTime = Date.now();

            // Check for existing session
            const oldSessionId = await getUserSessionId(userId);
            if (oldSessionId) {
                const existingSessionState = await getPlayerState(oldSessionId);
                if (existingSessionState) {
                    initialUserBalance = existingSessionState.credits;
                    currentBoosterConfig = existingSessionState.booster || defaultBoosterConfig;
                    username = existingSessionState.username;
                    lastActivityTime = existingSessionState.lastActivityTime;
                }
            }

            // If initialUserBalance not set from an old session, or if old session was invalid/missing state, fetch from API
            if (initialUserBalance === undefined) {
                try {
                    const fetchedData = await fetchUserData(userId);
                    initialUserBalance = fetchedData.initialUserBalance;
                    username = fetchedData.username;
                } catch (error) {
                    // Since this is inside a lock, we can't return directly.
                    // Instead, we'll send the response and let the lock release.
                    res.status(500).json({
                        status: 'error',
                        message: 'Failed to fetch user data from the external API: ' + error.message
                    });
                    return; 
                }
            }

            if (initialUserBalance < 0) {
                 res.status(400).json({
                    status: 'error',
                    message: 'User balance is below zero, cannot start a session.'
                });
                return;
            }

            // --- Create the new session FIRST ---
            const sessionId = uuidv4(); // Generate a unique ID for the new session
            const { session, serializer } = createGameSession();
            session.setCreditsAmount(initialUserBalance);

            const initialState = {
                userId: userId,
                username: username,
                credits: session.getCreditsAmount(),
                spin_count: 0,
                booster: currentBoosterConfig,
                isSynced: isSynced,
                lastActivityTime: lastActivityTime
            };

            // --- Atomically save new session state and update user mapping ---
            await Promise.all([
                savePlayerState(sessionId, initialState),
                setUserSessionId(userId, sessionId) // This overwrites the old mapping safely
            ]);
            
            // --- Clean up the old session AFTER the new one is active ---
            if (oldSessionId) {
                await deletePlayerState(oldSessionId);
            }

            const initialData = serializer.getInitialData(session);
            res.json({
                status: 'success',
                message: 'Session started successfully.',
                data: { sessionId, ...initialData }
            });

        }); // End of lock
    } catch (error) {
        // This will catch errors if the lock fails or times out
        res.status(500).json({ status: 'error', message: `Failed to acquire session lock: ${error.message}` });
    }
});
app.post('/spin', async (req, res) => { // Made the function async
    
    
    const { bet, sessionId } = req.body; // Client must send their sessionId
    const state = await getPlayerState(sessionId);
    if (!sessionId || !state) {
        return res.status(400).json({ error: 'Invalid or missing sessionId' });
    }
    if (!bet) {
        return res.status(400).json({ error: 'Bet amount is required' });
    }

    try {
        await lock.acquire(sessionId, async () => {

            // Increment spin count
            state.spin_count++;

            const { session: userSession, serializer: userSessionSerializer } = createGameSession();

            // Re-hydrate: Inject the balance from Redis into the Pokie object
            userSession.setCreditsAmount(state.credits);

            // Validate Balance
            if (userSession.getCreditsAmount() < bet) {
                return res.status(400).json({ error: 'Insufficient credits' });
            }

            userSession.setBet(bet);
            userSession.play();


            const roundData = userSessionSerializer.getRoundData(userSession);
            let totalWin = 0;
            if (roundData.winningLines && Object.values(roundData.winningLines).length > 0) {
                totalWin += Object.values(roundData.winningLines).reduce((sum, line) => sum + line.winAmount, 0);
            }
            if (roundData.winningScatters && Object.values(roundData.winningScatters).length > 0) {
                totalWin += Object.values(roundData.winningScatters).reduce((sum, scatter) => sum + scatter.winAmount, 0);
            }


            // Check if Scatter1 has a win
            let freeGamesResult = null;
            if (roundData.winningScatters && roundData.winningScatters.Scatter1) {
                // If Scatter1 wins, check for booster conditions
                //console.log(state.booster);
                if (state.booster && state.booster.active && state.booster.uses_left > 0 && state.spin_count > state.booster.spin_interval) {
                    // Booster conditions met, trigger enhanced free games
                    let baseCredit = userSession.getCreditsAmount();
                    freeGamesResult = runFreeGamesSimulation(baseCredit, bet, state.booster.no_of_spin_round, state.booster.multiplier);
                    baseCredit += freeGamesResult.freeGamesTotalWin;
                    userSession.setCreditsAmount(baseCredit);
                    state.booster.uses_left--; // Decrement booster uses
                    state.spin_count = 0; // Reset spin count
                }
            }
            if (roundData.winningScatters && roundData.winningScatters.Scatter2) {
                // If Scatter1 wins, trigger the free games simulation and return its results
            }


            // Update the state object with the new balance and activity time
            state.credits = userSession.getCreditsAmount();
            state.lastActivityTime = Date.now(); // Track activity
            state.isSynced = false; // Mark session as dirty on spin

            // Persist the NEW, full state object back to Redis
            await savePlayerState(sessionId, state);

            const responseData = {...roundData,  totalWin, freeGamesResult, spin_count: state.spin_count }
            res.json(responseData);
        }, { timeout: 0 });
    }
    catch (error) {
        // Errors from within the async block passed to acquire will be caught here.
        res.status(500).json({ error: error.message });
    }

});

app.post('/update-backend-with-user-balance', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ status: 'error', message: 'User ID is required.' });
    }

    try {
        await lock.acquire(userId, async () => {
            const sessionId = await getUserSessionId(userId);
            if (!sessionId) {
                return res.status(404).json({ status: 'error', message: `No active session found for userId: ${userId}` });
            }

            const state = await getPlayerState(sessionId);
            if (!state) {
                return res.status(404).json({ status: 'error', message: `Session state not found in Redis for sessionId: ${sessionId}` });
            }

            const currentBalance = state.credits;

            // AWAIT the call to updateBackendWithUserBalace to ensure client receives accurate status
            const updateResponseFromBackend = await updateBackendWithUserBalance(userId, currentBalance);

            res.json({
                status: 'success',
                message: `User balance for userId ${userId} successfully updated on backend.`,
                backendResult: updateResponseFromBackend // Include response from the backend update for client
            });
        }, { timeout: 0 }); // Use a timeout if you want to handle cases where the lock is held for too long
    } catch (error) {
        console.error(`Error processing /update-backend for userId ${userId}:`, error.message);
        res.status(500).json({ status: 'error', message: `Failed to process balance update request: ${error.message}` });
    }
});



const port = process.env.PORT || 3002

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
