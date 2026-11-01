import { Prisma } from '@prisma/client';
import { BOOSTERS, BOOSTER_MAP } from './catalog.js';

export const MIN_INCREMENT_BPS = 500n; // new bid must be >= current * 1.05
export const OPEN_MINUTES = 10; // bidding window length

function dayKey(now: Date): string {
  // UTC day so the schedule is timezone-independent.
  return now.toISOString().slice(0, 10);
}

/** Open the daily auction: one lot per booster, idempotent per UTC day. */
export async function openDailyAuction(tx: Prisma.TransactionClient, now: Date): Promise<number> {
  const day = dayKey(now);
  let created = 0;
  for (const booster of BOOSTERS) {
    const kind = `${booster.boosterId}:${day}`;
    const existing = await tx.auctionLot.findUnique({ where: { kind } });
    if (existing) continue;
    await tx.auctionLot.create({
      data: {
        boosterId: booster.boosterId,
        kind,
        startAt: now,
        closeAt: new Date(now.getTime() + OPEN_MINUTES * 60 * 1000),
        status: 'OPEN',
      },
    });
    created += 1;
  }
  return created;
}

export interface BidContext {
  lotId: string;
  playerId: string;
  amount: bigint;
}

export interface BidResult {
  outbidPlayerId: string | null;
  refunded: bigint;
}

/**
 * Place a bid with escrow inside a transaction. Concurrency-safe:
 * the caller locks the lot row (SELECT ... FOR UPDATE) before invoking.
 * Rules: lot OPEN, within window, amount >= current*1.05, funds available.
 * The previous top bid of this player (and the previous top bidder) is refunded.
 */
export async function placeBid(tx: Prisma.TransactionClient, ctx: BidContext, now: Date): Promise<BidResult> {
  const lot = await tx.auctionLot.findUnique({ where: { id: ctx.lotId } });
  if (!lot) throw new Error('LOT_NOT_FOUND');
  if (lot.status !== 'OPEN') throw new Error('LOT_CLOSED');
  if (now < lot.startAt || now > lot.closeAt) throw new Error('LOT_NOT_IN_WINDOW');

  const topBid = await tx.auctionBid.findFirst({
    where: { lotId: lot.id },
    orderBy: { amount: 'desc' },
  });

  if (topBid) {
    const minNext = (topBid.amount * (10000n + MIN_INCREMENT_BPS)) / 10000n;
    if (ctx.amount < minNext) throw new Error('BID_TOO_LOW');
    if (topBid.playerId === ctx.playerId) throw new Error('ALREADY_TOP_BIDDER');
  }
  if (ctx.amount <= 0n) throw new Error('INVALID_AMOUNT');

  // Lock the bidder's row and check funds.
  const rows = await tx.$queryRaw<{ id: string; money: bigint }[]>`
    SELECT "id", "money" FROM "Player" WHERE "id" = ${ctx.playerId} FOR UPDATE
  `;
  const player = rows[0];
  if (!player) throw new Error('PLAYER_NOT_FOUND');
  if (player.money < ctx.amount) throw new Error('INSUFFICIENT_FUNDS');

  // Refund the previous top bidder (their escrow is released).
  let outbidPlayerId: string | null = null;
  let refunded = 0n;
  if (topBid) {
    await tx.player.update({
      where: { id: topBid.playerId },
      data: { money: { increment: topBid.amount } },
    });
    await tx.auctionBid.deleteMany({ where: { id: topBid.id } });
    outbidPlayerId = topBid.playerId;
    refunded = topBid.amount;
  }

  // Escrow the new bid.
  await tx.player.update({
    where: { id: ctx.playerId },
    data: { money: { decrement: ctx.amount } },
  });
  await tx.auctionBid.create({
    data: { lotId: lot.id, playerId: ctx.playerId, amount: ctx.amount, escrowed: true },
  });

  return { outbidPlayerId, refunded };
}

/** Close finished lots: winner gets the booster, escrow is consumed. */
export async function closeAuctions(tx: Prisma.TransactionClient, now: Date): Promise<number> {
  const lots = await tx.auctionLot.findMany({
    where: { status: 'OPEN', closeAt: { lte: now } },
    take: 50,
  });
  let closed = 0;
  for (const lot of lots) {
    const topBid = await tx.auctionBid.findFirst({
      where: { lotId: lot.id },
      orderBy: { amount: 'desc' },
    });
    if (topBid) {
      await tx.playerBooster.create({
        data: {
          playerId: topBid.playerId,
          boosterId: lot.boosterId,
          expiresAt: new Date(
            now.getTime() + (BOOSTER_MAP.get(lot.boosterId)?.durationHours ?? 24) * 3600 * 1000,
          ),
        },
      });
      await tx.auctionLot.update({
        where: { id: lot.id },
        data: { status: 'CLOSED', winnerId: topBid.playerId, winnerBid: topBid.amount },
      });
      // The winning escrow is consumed by marking the bid non-refundable.
      await tx.auctionBid.update({
        where: { id: topBid.id },
        data: { escrowed: false },
      });
      // Any stray lower bids (should not exist) get refunded defensively.
      const strays = await tx.auctionBid.findMany({ where: { lotId: lot.id, escrowed: true } });
      for (const stray of strays) {
        await tx.player.update({ where: { id: stray.playerId }, data: { money: { increment: stray.amount } } });
        await tx.auctionBid.update({ where: { id: stray.id }, data: { escrowed: false } });
      }
    } else {
      await tx.auctionLot.update({ where: { id: lot.id }, data: { status: 'CLOSED' } });
    }
    closed += 1;
  }
  return closed;
}
