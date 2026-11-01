import { describe, expect, it } from 'vitest';
import { openDailyAuction, placeBid, closeAuctions, MIN_INCREMENT_BPS } from '../src/economy/auction.js';

type Tx = {
  auctionLot: {
    findUnique: (a: { where: { kind: string } }) => Promise<unknown>;
    create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    findMany: (a: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    update: (a: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  auctionBid: {
    findFirst: (a: Record<string, unknown>) => Promise<{ id: string; playerId: string; amount: bigint; escrowed: boolean } | null>;
    create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    deleteMany: (a: { where: { id: string } }) => Promise<{ count: number }>;
    findMany: (a: Record<string, unknown>) => Promise<{ id: string; playerId: string; amount: bigint; escrowed: boolean }[]>;
    update: (a: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  player: {
    update: (a: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  playerBooster: {
    create: (a: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<{ id: string; money: bigint }[]>;
};

/** In-memory fake of the Prisma transaction client for auction flows. */
function makeTx(): Tx & { lots: Map<string, unknown>; bids: Map<string, unknown>; players: Map<string, { money: bigint }> } {
  const lots = new Map<string, Record<string, unknown>>();
  const bids = new Map<string, Record<string, unknown>>();
  const players = new Map<string, { money: bigint }>([
    ['p1', { money: 1000000n }],
    ['p2', { money: 1000000n }],
  ]);
  const tx = {
    lots, bids, players,
    auctionLot: {
      findUnique: async ({ where }: { where: { kind: string } }) => lots.get(where.kind) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `lot-${lots.size + 1}`;
        lots.set(data.kind as string, { id, ...data });
        return { id };
      },
      findMany: async () => [...lots.values()],
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const lot = [...lots.values()].find((l) => l.id === where.id);
        if (lot) Object.assign(lot, data);
        return lot;
      },
    },
    auctionBid: {
      findFirst: async (a: Record<string, unknown>) => {
        const where = a.where as { lotId: string };
        const list = [...bids.values()].filter((b) => b.lotId === where.lotId);
        list.sort((x, y) => (y.amount as bigint) - (x.amount as bigint));
        return list[0] ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `bid-${bids.size + 1}`;
        bids.set(id, { id, ...data });
        return { id };
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        bids.delete(where.id);
        return { count: 1 };
      },
      findMany: async (a: Record<string, unknown>) => {
        const where = a.where as { lotId: string; escrowed?: boolean };
        return [...bids.values()].filter(
          (b) => b.lotId === where.lotId && (where.escrowed === undefined || b.escrowed === where.escrowed),
        );
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const bid = bids.get(where.id);
        if (bid) Object.assign(bid, data);
        return bid;
      },
    },
    player: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const p = players.get(where.id);
        if (!p) throw new Error('PLAYER_NOT_FOUND');
        if (data.money && typeof data.money === 'object') {
          const inc = (data.money as { increment?: bigint }).increment;
          const dec = (data.money as { decrement?: bigint }).decrement;
          if (inc !== undefined) p.money += inc;
          if (dec !== undefined) p.money -= dec;
        }
        return p;
      },
    },
    playerBooster: {
      create: async () => ({}),
    },
    $queryRaw: async (_s: TemplateStringsArray, id: string) => {
      const p = players.get(id as string);
      return p ? [{ id, money: p.money }] : [];
    },
  } as unknown as Tx & { lots: Map<string, unknown>; bids: Map<string, unknown>; players: Map<string, { money: bigint }> };
  return tx;
}

const NOW = new Date('2026-01-15T18:00:00Z');
const LATER = new Date('2026-01-15T18:05:00Z');
const AFTER_CLOSE = new Date('2026-01-15T18:20:00Z');

describe('auction', () => {
  it('opens one lot per booster per UTC day and is idempotent', async () => {
    const tx = makeTx();
    expect(await openDailyAuction(tx as never, NOW)).toBe(3);
    expect(await openDailyAuction(tx as never, LATER)).toBe(0);
  });

  it('escrows funds, rejects low and repeated top bids, refunds on outbid', async () => {
    const tx = makeTx();
    await openDailyAuction(tx as never, NOW);
    const lot = [...tx.lots.values()].find((l) => l.boosterId === 'golden_gear') as { id: string };

    await placeBid(tx as never, { lotId: lot.id, playerId: 'p1', amount: 100000n }, LATER);
    expect(tx.players.get('p1')!.money).toBe(900000n);

    // Too low (needs +5%).
    await expect(
      placeBid(tx as never, { lotId: lot.id, playerId: 'p2', amount: 100000n }, LATER),
    ).rejects.toThrow('BID_TOO_LOW');

    // Same player cannot top their own bid via new escrow.
    await expect(
      placeBid(tx as never, { lotId: lot.id, playerId: 'p1', amount: 200000n }, LATER),
    ).rejects.toThrow('ALREADY_TOP_BIDDER');

    // p2 outbids: p1 is refunded.
    await placeBid(tx as never, { lotId: lot.id, playerId: 'p2', amount: 150000n }, LATER);
    expect(tx.players.get('p1')!.money).toBe(1000000n);
    expect(tx.players.get('p2')!.money).toBe(850000n);
  });

  it('rejects bids outside the window and on closed lots', async () => {
    const tx = makeTx();
    await openDailyAuction(tx as never, NOW);
    const lot = [...tx.lots.values()][0] as { id: string };
    await expect(
      placeBid(tx as never, { lotId: lot.id, playerId: 'p1', amount: 100n }, AFTER_CLOSE),
    ).rejects.toThrow('LOT_NOT_IN_WINDOW');

    await closeAuctions(tx as never, AFTER_CLOSE);
    await expect(
      placeBid(tx as never, { lotId: lot.id, playerId: 'p1', amount: 100000n }, LATER),
    ).rejects.toThrow('LOT_CLOSED');
  });

  it('rejects bids beyond the available funds', async () => {
    const tx = makeTx();
    await openDailyAuction(tx as never, NOW);
    const lot = [...tx.lots.values()][0] as { id: string };
    await expect(
      placeBid(tx as never, { lotId: lot.id, playerId: 'p1', amount: 2000000n }, LATER),
    ).rejects.toThrow('INSUFFICIENT_FUNDS');
  });

  it('closing grants the booster to the top bidder and consumes escrow', async () => {
    const tx = makeTx();
    await openDailyAuction(tx as never, NOW);
    const lot = [...tx.lots.values()].find((l) => l.boosterId === 'golden_gear') as { id: string };
    await placeBid(tx as never, { lotId: lot.id, playerId: 'p1', amount: 100000n }, LATER);
    await closeAuctions(tx as never, AFTER_CLOSE);
    const closed = [...tx.lots.values()].find((l) => l.id === lot.id) as { winnerId: string };
    expect(closed.winnerId).toBe('p1');
    expect(tx.players.get('p1')!.money).toBe(900000n); // escrow consumed
  });

  it('minimum increment is 5%', () => {
    expect(MIN_INCREMENT_BPS).toBe(500n);
  });
});
