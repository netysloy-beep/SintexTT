import { Queue, Worker } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { driftTick } from '../economy/market.js';
import { spawnRandomEvent, resolveExpiredEvents } from '../economy/events.js';
import { generateOffers, resolveContracts } from '../economy/contracts.js';
import { openDailyAuction, closeAuctions } from '../economy/auction.js';
import { pruneIdempotency } from '../lib/idempotency.js';

function repeatable(name: string, cron: string, handler: (jobId: string) => Promise<void>): void {
  const queue = new Queue(name, { connection: redis, prefix: 'econ' });
  void queue.add(
    'tick',
    {},
    { repeat: { pattern: cron }, jobId: `${name}-repeat`, removeOnComplete: 100, removeOnFail: 100 },
  );
  const worker = new Worker(name, async () => handler(`${name}-${Date.now()}`), {
    connection: redis,
    prefix: 'econ',
    lockDuration: 60000,
  });
  worker.on('failed', (job, err) => logger.error({ name, err: err.message }, 'job failed'));
}

async function withLock(lockId: string, owner: string, ttlMs: number, fn: () => Promise<void>): Promise<void> {
  // JobLock row prevents duplicate execution across worker replicas.
  const existing = await prisma.jobLock.findUnique({ where: { id: lockId } });
  const now = Date.now();
  if (existing && existing.expiresAt.getTime() > now && existing.ownerId !== owner) return;
  await prisma.jobLock.upsert({
    where: { id: lockId },
    create: { id: lockId, ownerId: owner, expiresAt: new Date(now + ttlMs) },
    update: { ownerId: owner, expiresAt: new Date(now + ttlMs) },
  });
  await fn();
}

/**
 * Generate starting content right at boot so new players see contracts,
 * an event and auction lots immediately instead of waiting hours for crons.
 * All generators are idempotent (offers capped, one unresolved event, one lot set per day).
 */
async function bootstrapContent(): Promise<void> {
  try {
    const now = new Date();
    const players = await prisma.player.findMany({ select: { id: true } });
    for (const p of players) {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.player.findUniqueOrThrow({ where: { id: p.id } });
        await generateOffers(tx, fresh, now);
        await spawnRandomEvent(tx, fresh, now);
      });
    }
    const lots = await prisma.$transaction((tx) => openDailyAuction(tx, now));
    await prisma.$transaction((tx) => resolveExpiredEvents(tx, now));
    logger.info({ players: players.length, lots }, 'bootstrap content ready');
  } catch (err) {
    logger.error({ err }, 'bootstrap content failed');
  }
}

async function main(): Promise<void> {
  // Market price drift every minute.
  let tickIndex = 0;
  repeatable('market-tick', env.crons.marketTick, async (jobId) => {
    await withLock('market-tick', jobId, 50_000, async () => {
      const prices = await prisma.marketPrice.findMany();
      const updates = driftTick(prices, tickIndex++);
      for (const [kind, price] of updates) {
        await prisma.marketPrice.update({ where: { kind }, data: { price } });
        await prisma.pricePoint.create({ data: { kind, price } });
      }
    });
  });

  // Force-majeure events every 3 hours.
  repeatable('events', env.crons.events, async (jobId) => {
    await withLock('events', jobId, 5 * 60_000, async () => {
      const players = await prisma.player.findMany({ select: { id: true } });
      for (const p of players) {
        await prisma.$transaction(async (tx) => {
          const fresh = await tx.player.findUniqueOrThrow({ where: { id: p.id } });
          await spawnRandomEvent(tx, fresh, new Date());
        });
      }
      await prisma.$transaction((tx) => resolveExpiredEvents(tx, new Date()));
    });
  });

  // Contract offers every 2 hours + resolution every minute.
  repeatable('contracts', env.crons.contracts, async (jobId) => {
    await withLock('contracts', jobId, 5 * 60_000, async () => {
      const players = await prisma.player.findMany({ select: { id: true } });
      for (const p of players) {
        await prisma.$transaction(async (tx) => {
          const fresh = await tx.player.findUniqueOrThrow({ where: { id: p.id } });
          await generateOffers(tx, fresh, new Date());
        });
      }
    });
  });
  repeatable('contracts-resolve', env.crons.contractsResolve, async (jobId) => {
    await withLock('contracts-resolve', jobId, 50_000, async () => {
      await prisma.$transaction((tx) => resolveContracts(tx, new Date()));
    });
  });

  // Daily auction open/close.
  repeatable('auction-open', env.crons.auctionOpen, async (jobId) => {
    await withLock('auction-open', jobId, 5 * 60_000, async () => {
      const created = await prisma.$transaction((tx) => openDailyAuction(tx, new Date()));
      logger.info({ created }, 'auction lots opened');
    });
  });
  repeatable('auction-close', env.crons.auctionClose, async (jobId) => {
    await withLock('auction-close', jobId, 5 * 60_000, async () => {
      const closed = await prisma.$transaction((tx) => closeAuctions(tx, new Date()));
      logger.info({ closed }, 'auction lots closed');
    });
  });

  // Idempotency housekeeping daily.
  repeatable('idempotency-prune', '30 3 * * *', async (jobId) => {
    await withLock('idempotency-prune', jobId, 3600_000, async () => {
      const removed = await pruneIdempotency();
      logger.info({ removed }, 'idempotency records pruned');
    });
  });

  // Fill the world with content immediately on boot.
  void bootstrapContent();

  logger.info('workers started');
}

void main();
