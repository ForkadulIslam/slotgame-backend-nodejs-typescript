import dotenv from 'dotenv';
dotenv.config();
import { createClient } from 'redis';
import { acquireLock, releaseLock } from './utils/redis-lock.js';

async function runTest() {
    const redisClient = createClient({
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD,
        socket: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || '6379', 10)
        }
    });

    await redisClient.connect();
    console.log('Connected to Redis for testing...');

    const testKey = 'test-lock-key';

    console.log('\n--- Test 1: Mutual Exclusion ---');
    const token1 = await acquireLock(redisClient, testKey, 10);
    console.log(`Process 1 acquired lock: ${token1 ? 'SUCCESS (Token: ' + token1 + ')' : 'FAILED'}`);

    const token2 = await acquireLock(redisClient, testKey, 10);
    console.log(`Process 2 attempted acquire: ${token2 ? 'SUCCESS (Error!)' : 'BLOCKED (Correct)'}`);

    console.log('\n--- Test 2: Token-Based Safety (Wrong Token) ---');
    await releaseLock(redisClient, testKey, 'wrong-token-123');
    const checkLock = await redisClient.get(`lock:${testKey}`);
    console.log(`Lock still exists after wrong token release: ${checkLock === token1 ? 'YES (Correct)' : 'NO (Error!)'}`);

    console.log('\n--- Test 3: Correct Release ---');
    await releaseLock(redisClient, testKey, token1!);
    const checkLockAfterRelease = await redisClient.get(`lock:${testKey}`);
    console.log(`Lock exists after correct release: ${checkLockAfterRelease ? 'YES (Error!)' : 'NO (Correct)'}`);

    console.log('\n--- Test 4: Re-acquisition ---');
    const token3 = await acquireLock(redisClient, testKey, 10);
    console.log(`Can re-acquire after release: ${token3 ? 'SUCCESS' : 'FAILED'}`);
    await releaseLock(redisClient, testKey, token3!);

    console.log('\n--- Test 5: Automatic TTL Expiry ---');
    await acquireLock(redisClient, testKey, 2); // 2 second TTL
    console.log('Lock acquired with 2s TTL. Waiting 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    const checkLockAfterExpiry = await redisClient.get(`lock:${testKey}`);
    console.log(`Lock exists after expiry: ${checkLockAfterExpiry ? 'YES (Error!)' : 'NO (Correct)'}`);

    await redisClient.disconnect();
    console.log('\nAll tests completed.');
}

runTest().catch(console.error);
