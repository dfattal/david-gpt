/**
 * Redis Connection Module
 * Manages Redis client connection for BullMQ job queue
 */

import Redis from 'ioredis';

let redisClient: Redis | null = null;

/**
 * Get or create Redis client connection
 */
export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,     // Required for BullMQ
    // Connection retry strategy
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // Reconnection on error
    reconnectOnError(err) {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        // Only reconnect when the error contains "READONLY"
        return true;
      }
      return false;
    },
  });

  // Connection event handlers
  redisClient.on('connect', () => {
    console.log('✅ Redis client connected');
  });

  redisClient.on('error', (error) => {
    console.error('❌ Redis connection error:', error);
  });

  redisClient.on('close', () => {
    console.log('🔌 Redis connection closed');
  });

  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('🔌 Redis connection closed gracefully');
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient?.status === 'ready';
}
