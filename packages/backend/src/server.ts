import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

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
