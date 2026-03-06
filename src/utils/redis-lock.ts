import { v4 as uuidv4 } from 'uuid';

/**
 * A simple distributed lock using Redis SET NX.
 * @param redisClient The Redis client instance.
 * @param lockKey The key to lock.
 * @param ttlSeconds How long the lock remains valid (safety fallback).
 * @returns A unique token (string) if lock acquired, null otherwise.
 */
export async function acquireLock(redisClient: any, lockKey: string, ttlSeconds: number = 30): Promise<string | null> {
    const token = uuidv4();
    try {
        const result = await redisClient.set(`lock:${lockKey}`, token, {
            NX: true,
            EX: ttlSeconds
        });
        return result === 'OK' ? token : null;
    } catch (error) {
        console.error(`[Lock] Failed to acquire lock for ${lockKey}:`, error);
        return null;
    }
}

/**
 * Releases a distributed lock safely by checking the token.
 * @param redisClient The Redis client instance.
 * @param lockKey The key to unlock.
 * @param token The token received when the lock was acquired.
 */
export async function releaseLock(redisClient: any, lockKey: string, token: string): Promise<void> {
    if (!token) return;
    
    // Lua script ensures atomicity: only delete if the value matches the token
    const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    `;

    try {
        await redisClient.eval(script, {
            keys: [`lock:${lockKey}`],
            arguments: [token]
        });
    } catch (error) {
        console.error(`[Lock] Failed to release lock for ${lockKey}:`, error);
    }
}
