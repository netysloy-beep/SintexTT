import { describe, expect, it } from 'vitest';

/**
 * Database-level concurrency tests. They run only when DATABASE_URL points to
 * a Postgres instance (e.g. `docker compose up postgres` + migrate), and are
 * skipped otherwise so `pnpm test` stays green without infrastructure.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)('database concurrency', () => {
  it('concurrent daily claims pay exactly once', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const player = await prisma.player.create({
        data: { telegramId: BigInt(Date.now()), money: 100000n },
      });
      const { claimDaily } = await import('../../src/economy/daily.js');
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          prisma.$transaction(async (tx) => {
            const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
            return claimDaily(tx, fresh, new Date());
          }),
        ),
      );
      const paid = results.filter((r) => r.status === 'fulfilled');
      expect(paid.length).toBe(1);
      const after = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
      expect(after.money).toBe(100000n + (paid[0].status === 'fulfilled' ? paid[0].value.reward : 0n));
    } finally {
      await prisma.$disconnect();
    }
  });

  it('concurrent market sells cannot oversell stock', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const player = await prisma.player.create({
        data: { telegramId: BigInt(Date.now()), money: 100000n },
      });
      await prisma.resource.create({ data: { playerId: player.id, kind: 'WHEAT', qty: 10n } });
      const { executeTrade } = await import('../../src/economy/market.js');
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          prisma.$transaction(async (tx) => {
            const rows = await tx.resource.findMany({ where: { playerId: player.id, kind: 'WHEAT' } });
            const resources = new Map(rows.map((r) => [r.kind, r.qty]));
            const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
            const res = await executeTrade(tx, player.id, 'WHEAT', 5n, 'sell', 800, resources, p.money);
            await tx.player.update({ where: { id: player.id }, data: { money: res.money } });
            await tx.resource.updateMany({ where: { playerId: player.id, kind: 'WHEAT' }, data: { qty: resources.get('WHEAT')! } });
            return res;
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled');
      expect(ok.length).toBeLessThanOrEqual(2); // 10 units, 5 per trade
      const finalRes = await prisma.resource.findFirst({ where: { playerId: player.id, kind: 'WHEAT' } });
      expect(finalRes!.qty).toBeGreaterThanOrEqual(0n);
    } finally {
      await prisma.$disconnect();
    }
  });
});
