import dotenv from 'dotenv';
dotenv.config();
import { createClient } from 'redis';
import { updateBackendWithUserBalance } from './utils/backend.js';
import { acquireLock, releaseLock } from './utils/redis-lock.js';

const SAFETY_SCAN_INTERVAL_MS = 2 * 60 * 1000;
const SESSION_KEY_PREFIX = 'slot_ptr_';
const TRIGGER_KEY_PREFIX = 'inactivity_trigger:';

const redisConfig = {
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
    }
};

let redisClient: ReturnType<typeof createClient>;
let subscriber: ReturnType<typeof createClient>;

async function finalizeSession(sessionId: string) {
    const key = `${SESSION_KEY_PREFIX}${sessionId}`;
    const lockToken = await acquireLock(redisClient, sessionId, 60);
    if (!lockToken) return;

    try {
        const stateJSON = await redisClient.get(key);
        if (!stateJSON) return;

        const state = JSON.parse(stateJSON.toString());

        if (!state.isSynced) {
            console.log(`[Worker] Finalizing session ${sessionId} for user ${state.userId}`);
            await updateBackendWithUserBalance(state.userId, state.credits);
            
            state.isSynced = true;
            await redisClient.set(key, JSON.stringify(state), { KEEPTTL: true });
            
            console.log(`[Worker] Successfully synced session ${sessionId}`);
        }
    } catch (error: any) {
        console.error(`[Worker] Error finalizing session ${sessionId}:`, error.message);
    } finally {
        await releaseLock(redisClient, sessionId, lockToken);
    }
}

async function runSafetyScan() {
    console.log('[Worker] Starting safety scan...');
    try {
        const scanIterator = (redisClient as any).scanIterator({
            MATCH: `${SESSION_KEY_PREFIX}*`,
            COUNT: 100 
        });

        for await (const entry of scanIterator) {
            const keys = Array.isArray(entry) ? entry : [entry];
            for (const key of keys) {
                const keyStr = typeof key === 'string' ? key : key.toString();
                const sessionId = keyStr.substring(SESSION_KEY_PREFIX.length);
                
                const triggerExists = await redisClient.exists(`${TRIGGER_KEY_PREFIX}${sessionId}`);
                if (!triggerExists) {
                    await finalizeSession(sessionId);
                }
            }
        }
        console.log('[Worker] Safety scan complete.');
    } catch (error: any) {
        console.error('[Worker] Safety scan failed:', error.message);
    }
}

(async () => {
    console.log('Starting Trigger-Based Session Finalizer...');

    redisClient = createClient(redisConfig);
    subscriber = createClient(redisConfig);

    redisClient.on('error', (err) => console.error('[Worker] Redis Client Error', err));
    subscriber.on('error', (err) => console.error('[Worker] Subscriber Error', err));

    try {
        await Promise.all([redisClient.connect(), subscriber.connect()]);
        console.log('[Worker] Connected to Redis.');

        await redisClient.configSet('notify-keyspace-events', 'Ex');

        const expiredChannel = '__keyevent@0__:expired';
        await subscriber.subscribe(expiredChannel, async (message) => {
            if (message.startsWith(TRIGGER_KEY_PREFIX)) {
                console.log(`[Worker] Trigger received: ${message}`);
                const sessionId = message.substring(TRIGGER_KEY_PREFIX.length);
                await finalizeSession(sessionId);
            }
        });
        console.log(`[Worker] Subscribed to ${expiredChannel}`);

        setInterval(runSafetyScan, SAFETY_SCAN_INTERVAL_MS);
        await runSafetyScan();

    } catch (err) {
        console.error('[Worker] Critical startup error:', err);
        process.exit(1);
    }
})();
