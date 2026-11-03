import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

/**
 * Render free tier spins services down after ~15 minutes without inbound
 * traffic, which makes the first request take 50+ seconds. Ping our own
 * /health and the web app every few minutes so both stay warm.
 */
const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;

function startKeepalive(): void {
  const selfUrl = process.env.SELF_URL?.trim() || 'https://sintex-backend-rl3r.onrender.com/health';
  const targets = [selfUrl, ...(env.botWebappUrl ? [env.botWebappUrl] : [])].filter(
    (t, i, arr) => arr.indexOf(t) === i,
  );

  const ping = async (): Promise<void> => {
    for (const target of targets) {
      try {
        const res = await fetch(target, { method: 'GET' });
        res.body?.cancel().catch(() => {
          // ignore stream cancellation errors
        });
      } catch {
        // Ignore ping failures; the next tick will retry.
      }
    }
  };

  void ping();
  setInterval(() => void ping(), KEEPALIVE_INTERVAL_MS);
  logger.info({ targets }, 'keepalive started');
}

async function main(): Promise<void> {
  const app = await buildApp();
  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
    logger.info(`backend listening on :${env.port}`);
  } catch (err) {
    logger.error({ err }, 'failed to start');
    await prisma.$disconnect();
    process.exit(1);
  }

  startKeepalive();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
