import dotenv from 'dotenv';
dotenv.config();
import { createClient } from 'redis';

const BATCH_SIZE = 100;
const MIN_BATCH_FOR_SYNC = 10; // Only sync if we have at least 10 logs (saves Laravel resources)
const SYNC_INTERVAL_MS = 10000; // 10 seconds heartbeat
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
 * @param force If true, it will sync even if the batch is smaller than MIN_BATCH_FOR_SYNC
 */
async function syncLogs(force: boolean = false) {
    try {
        // 1. Check queue length
        const queueLen = await redisClient.lLen(LOG_QUEUE_KEY) as number;
        
        // Stop if empty
        if (queueLen === 0) return;

        // Adaptive Check: Wait for a decent batch size unless it's a "forced" heartbeat sync
        if (!force && queueLen < MIN_BATCH_FOR_SYNC) {
            return;
        }

        console.log(`[SpinLogWorker] Found ${queueLen} logs. Processing batch (Force: ${force})...`);

        // 2. Pop a batch of logs
        const rawLogs = await redisClient.lPopCount(LOG_QUEUE_KEY, BATCH_SIZE);
        if (!rawLogs || rawLogs.length === 0) return;

        const logs = rawLogs.map((log: any) => JSON.parse(log.toString()));

        // 3. Send Batch to Laravel Backend
        const backendUrl = process.env.BACKEND_API_BASE_URL;
        if (!backendUrl) throw new Error('BACKEND_API_BASE_URL not defined');

        const response = await fetch(`${backendUrl}/api/batch_spin_logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backend Sync Failed: ${response.status} - ${errorText}`);
        }

        console.log(`[SpinLogWorker] Successfully synced ${logs.length} logs to Laravel.`);

        // 4. Immediate Follow-up (Backlog Clearance)
        // If there's still a massive queue, don't wait for the next interval
        if (queueLen > BATCH_SIZE) {
            setImmediate(() => syncLogs(false));
        }

    } catch (error: any) {
        console.error('[SpinLogWorker] Error during sync:', error.message);
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
