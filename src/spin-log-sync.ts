import dotenv from 'dotenv';
dotenv.config();
import { createClient } from 'redis';

const BATCH_SIZE = 1000;
const MIN_BATCH_FOR_SYNC = 10; 
const SYNC_INTERVAL_MS = 60000; // 1 minute heartbeat
const LOG_QUEUE_KEY = 'spin_logs_queue';

const redisClient = createClient({
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
    }
});

redisClient.on('error', (err) => console.error('[SpinLogWorker] Redis Error:', err));

/**
 * Adaptive Sync Logic
 */
async function syncLogs(force: boolean = false) {
    let logsToSync: any[] = [];
    try {
        const queueLen = await redisClient.lLen(LOG_QUEUE_KEY) as number;
        if (queueLen === 0) return;

        if (!force && queueLen < MIN_BATCH_FOR_SYNC) return;

        console.log(`[SpinLogWorker] Found ${queueLen} logs. Syncing batch of ${BATCH_SIZE}...`);

        const rawLogs = await redisClient.lPopCount(LOG_QUEUE_KEY, BATCH_SIZE);
        if (!rawLogs || rawLogs.length === 0) return;

        logsToSync = rawLogs.map((log: any) => JSON.parse(log.toString()));

        const backendUrl = process.env.BACKEND_API_BASE_URL;
        const response = await fetch(`${backendUrl}/api/batch_spin_logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs: logsToSync }),
        });

        if (!response.ok) {
            throw new Error(`Backend Sync Failed: ${response.status}`);
        }

        console.log(`[SpinLogWorker] Successfully synced ${logsToSync.length} logs.`);

        if (queueLen > BATCH_SIZE) {
            setTimeout(() => syncLogs(false), 2000);
        }

    } catch (error: any) {
        console.error('[SpinLogWorker] Error:', error.message);
        
        // --- DATA SAFETY: PUSH BACK ON FAILURE ---
        if (logsToSync.length > 0) {
            console.log(`[SpinLogWorker] RELIABILITY ALERT: Pushing ${logsToSync.length} logs back to Redis...`);
            const multi = redisClient.multi();
            logsToSync.forEach(log => {
                multi.lPush(LOG_QUEUE_KEY, JSON.stringify(log));
            });
            await multi.exec();
        }
    }
}

(async () => {
    console.log('Starting Adaptive Spin Log Batch Sync Worker...');
    await redisClient.connect();
    
    // Heartbeat Sync: Every 10 seconds, force a sync even if the batch is small
    setInterval(() => syncLogs(true), SYNC_INTERVAL_MS);
    
    // Initial run
    syncLogs(true);
})();
