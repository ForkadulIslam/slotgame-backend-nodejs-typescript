import { createClient } from 'redis';

/**
 * Industry-standard Financial Analytics Utility
 * Supports both Live and Simulation tracks.
 * Optimized for bulk updates during simulations.
 */
export async function recordSpinStats(
    redis: ReturnType<typeof createClient>, 
    userId: number | string, 
    bet: number, 
    win: number,
    gameId: string = 'classic',
    isSimulation: boolean = false,
    count: number = 1, // Added count for bulk updates
    isFreeGame: boolean = false // Added to track free spin status
) {
    const today = new Date().toISOString().split('T')[0];
    const prefix = isSimulation ? 'sim_stats' : 'stats';
    
    // Key Definitions
    const globalKey = `${prefix}:global`;
    const dailyKey = `${prefix}:daily:${today}`;
    const playerKey = `${prefix}:player:${userId}`;
    const gameKey = `${prefix}:game:${gameId}`;
    const logQueueKey = 'spin_logs_queue';

    try {
        const multi = redis.multi();

        // 1. Update Aggregate Counters (Handles both single and bulk)
        const targets = [globalKey, dailyKey, playerKey, gameKey];
        targets.forEach(key => {
            multi.hIncrByFloat(key, 'total_bet', bet);
            multi.hIncrByFloat(key, 'total_win', win);
            multi.hIncrBy(key, 'total_spins', count); // Increments by total count
        });

        // 2. Update specific Player Health metrics
        multi.hIncrByFloat(playerKey, 'net_pnl', bet - win);

        // 3. Buffer Detailed Log (ONLY for Live Spins - NEVER bulked)
        if (!isSimulation) {
            const logEntry = JSON.stringify({
                userId,
                gameId,
                bet,
                win,
                timestamp: Date.now(),
                isFreeGame: isFreeGame // Now correctly tracks free spins
            });
            multi.lPush(logQueueKey, logEntry);
        }

        await multi.exec();

    } catch (error) {
        console.error(`[Stats] Failed to record ${isSimulation ? 'SIM' : 'LIVE'} stats:`, error);
    }
}
