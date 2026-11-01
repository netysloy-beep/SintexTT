import Redis from 'ioredis';
import { env } from '../config/env.js';

export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: false,
});

redis.on('error', (err) => {
  // Keep the process alive; BullMQ/ioredis will reconnect on its own.
  console.error('redis error:', err.message);
});
