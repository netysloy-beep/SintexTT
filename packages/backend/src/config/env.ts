import { config as loadDotenv } from 'dotenv';

loadDotenv();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer for ${name}: ${raw}`);
  }
  return parsed;
}

/** REDIS_URL wins; Render Key Value exposes REDIS_HOST / REDIS_PORT instead. */
function redisUrlEnv(): string {
  const direct = process.env.REDIS_URL?.trim();
  if (direct) return direct;
  const host = process.env.REDIS_HOST?.trim();
  if (host) {
    const port = (process.env.REDIS_PORT ?? '6379').trim();
    return `redis://${host}:${port}`;
  }
  throw new Error('Missing required environment variable: REDIS_URL (or REDIS_HOST/REDIS_PORT)');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: intEnv('PORT', 3000),
  databaseUrl: requireEnv('DATABASE_URL'),
  redisUrl: redisUrlEnv(),
  botToken: process.env.BOT_TOKEN && process.env.BOT_TOKEN.length > 10 ? process.env.BOT_TOKEN.trim() : undefined,
  botWebappUrl: process.env.BOT_WEBAPP_URL?.trim() || undefined,
  sessionTtlHours: intEnv('SESSION_TTL_HOURS', 168),
  initDataMaxAgeHours: intEnv('INITDATA_MAX_AGE_HOURS', 24),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== ''),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  crons: {
    marketTick: process.env.MARKET_TICK_CRON ?? '* * * * *',
    events: process.env.EVENTS_CRON ?? '0 */3 * * *',
    contracts: process.env.CONTRACTS_CRON ?? '0 */2 * * *',
    contractsResolve: process.env.CONTRACTS_RESOLVE_CRON ?? '* * * * *',
    auctionOpen: process.env.AUCTION_OPEN_CRON ?? '0 18 * * *',
    auctionClose: process.env.AUCTION_CLOSE_CRON ?? '10 18 * * *',
  },
};
