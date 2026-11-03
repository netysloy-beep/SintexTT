import { redis } from './redis.js';

/**
 * Fixed-window rate limiter backed by Redis. Returns true when allowed.
 * Keyed by `${prefix}:${playerId}` with a per-window counter.
 * Fails open when Redis is unavailable so gameplay never breaks.
 */
export async function rateLimit(
  prefix: string,
  playerId: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const key = `rl:${prefix}:${playerId}`;
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const windowKey = `${key}:${window}`;
    const count = await redis.incr(windowKey);
    if (count === 1) {
      await redis.expire(windowKey, windowSeconds + 1);
    }
    return count <= limit;
  } catch {
    return true;
  }
}
