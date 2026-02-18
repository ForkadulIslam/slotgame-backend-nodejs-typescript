import dotenv from 'dotenv';
dotenv.config();
import { createClient } from 'redis';
import AsyncLock from 'async-lock';
import { updateBackendWithUserBalance } from './session-finalizer.js'; 

// --- Configuration ---
const INACTIVITY_THRESHOLD_MS = 30 * 1000; // 1 minute
const POLLING_INTERVAL_MS = 30 * 1000; // 30 seconds
const SESSION_KEY_PREFIX = 'slot_ptr_';
const USER_SESSION_MAPPING_PREFIX = 'user_session:';

const lock = new AsyncLock();
let redisClient;

// --- Helper Functions (copied from app.js for standalone use) ---

export async function updateBackendWithUserBalance(userId, balance) {
    const backendApiBaseUrl = process.env.BACKEND_API_BASE_URL;
    if (!backendApiBaseUrl) {
        console.error('BACKEND_API_BASE_URL is not defined in environment variables.');
        throw new Error('Backend API base URL is not configured.');
    }
    try {
        console.log('Backend call');
        const updateApiUrl = `${backendApiBaseUrl}/api/user_balance_update`;
        const balanceUnlock = true;
        const response = await fetch(updateApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, balance, balanceUnlock}),
        });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error posting user data for userId ${userId}:`, error.message);
        throw new Error(`Failed to post user data to backend: ${error.message}`);
    }
}



// --- Main Worker Logic ---

/**
 * Scans for all active sessions, checks for inactivity, and finalizes them.
 */
async function processInactiveSessions() {
    const scanIterator = await redisClient.scanIterator({
        MATCH: `${SESSION_KEY_PREFIX}*`,
        COUNT: 100 // Process in batches of 100
    });
    const allSessionKeys = [];
    for await (const keyBatch of scanIterator){
        allSessionKeys.push(...keyBatch);
    }
    
    for await (const key of allSessionKeys) {
        const sessionId = key.substring(SESSION_KEY_PREFIX.length);
        // Use a lock to prevent multiple workers from processing the same session
        await lock.acquire(sessionId, async () => {
            try {
                const stateJSON = await redisClient.get(key);

                if (!stateJSON) {
                    console.log(`Worker: [${sessionId}] State was empty, skipping.`);
                    return; // Key was deleted since scan, skip
                }
                const state = JSON.parse(stateJSON);

                // Check for lastActivityTime, if it's past the threshold, and if it's not already synced
                if (!state.isSynced && state.lastActivityTime && (Date.now() - state.lastActivityTime > INACTIVITY_THRESHOLD_MS)) {
                    // Update the main backend
                    await updateBackendWithUserBalance(state.userId, state.credits);
                    // Mark the session as synced and save it back to Redis, keeping the original TTL
                    state.isSynced = true;
                    await redisClient.set(key, JSON.stringify(state), { KEEPTTL: true }); 
                }
            } catch (error) {
                console.error(`Worker: [${sessionId}] Error processing session: ${error.message}`);
            }
        }).catch(err => {
            // This catches errors if the lock is already held, preventing crashes.
            // console.log(`Worker: Could not acquire lock for session ${sessionId}, another process may be handling it.`);
        });
    }
}


// --- Service Initialization ---

(async () => {
    console.log('Starting session finalizer worker...');
    
    redisClient = createClient({
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD,
        socket: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT
        }
    });

    redisClient.on('error', (err) => console.error('Worker Redis Client Error', err));

    try {
        await redisClient.connect();
        console.log('Worker: Successfully connected to Redis!');
        
        // Start the polling mechanism
        setInterval(() => {
            lock.acquire('worker-process', async () => {
                await processInactiveSessions();
            }).catch(() => {
                console.log('Worker: Previous processing cycle is still running. Skipping this interval.');
            });
        }, POLLING_INTERVAL_MS);

    } catch (err) {
        console.error('Worker: Failed to connect to Redis. Shutting down.', err);
        process.exit(1);
    }
})();
