import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { getPlayer } from '../auth-plugin.js';
import { sendJSON } from '../types.js';
import { tooMany } from '../../lib/errors.js';
import { rateLimit } from '../../lib/rate-limit.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { placeBid, MIN_INCREMENT_BPS } from '../../economy/auction.js';
import { BOOSTER_MAP } from '../../economy/catalog.js';

const bidSchema = {
  body: {
    type: 'object',
    required: ['amount'],
    properties: {
      amount: {
        type: 'integer',
        minimum: 1,
        maximum: 100000000000, // <= $1M per bid
      },
    },
    additionalProperties: false,
  },
};

export async function auctionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auction', async (req, reply) => {
    const player = getPlayer(req);
    const now = new Date();
    const lots = await prisma.auctionLot.findMany({
      orderBy: { startAt: 'desc' },
      take: 30,
    });
    const topBids = await Promise.all(
      lots.map(async (lot) => {
        const bid = await prisma.auctionBid.findFirst({
          where: { lotId: lot.id },
          orderBy: { amount: 'desc' },
        });
        return { lotId: lot.id, bid };
      }),
    );
    const bidByLot = new Map(topBids.map((t) => [t.lotId, t.bid]));

    const me = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    return sendJSON(reply, 200, {
      now: now.toISOString(),
      money: me.money.toString(),
      minIncrementBps: Number(MIN_INCREMENT_BPS),
      lots: lots.map((lot) => {
        const bid = bidByLot.get(lot.id);
        return {
          id: lot.id,
          booster: BOOSTER_MAP.get(lot.boosterId) ?? null,
          startAt: lot.startAt.toISOString(),
          closeAt: lot.closeAt.toISOString(),
          status: lot.status,
          topBid: bid ? { amount: bid.amount.toString(), isMine: bid.playerId === player.id } : null,
          winnerId: lot.winnerId,
        };
      }),
    });
  });

  app.post('/auction/:lotId/bid', { schema: bidSchema }, async (req, reply) => {
    const player = getPlayer(req);
    if (!(await rateLimit('bid', player.id, 20, 60))) {
      throw tooMany('RATE_LIMITED', 'Too many bid requests, slow down');
    }
    const { lotId } = req.params as { lotId: string };
    const { amount } = req.body as { amount: number };
    const amountBig = BigInt(amount);

    const doBid = async () =>
      prisma.$transaction(async (tx) => {
        const now = new Date();
        // Serialize concurrent bidders on the lot row.
        await tx.$queryRaw`SELECT "id" FROM "AuctionLot" WHERE "id" = ${lotId} FOR UPDATE`;
        const result = await placeBid(
          tx,
          { lotId, playerId: player.id, amount: amountBig },
          now,
        );
        const me = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
        return {
          amount: amountBig.toString(),
          outbid: result.outbidPlayerId !== null,
          money: me.money.toString(),
        };
      });

    const idemKey = req.headers['idempotency-key'];
    if (idemKey) {
      const res = await withIdempotency(`bid:${player.id}:${idemKey}`, async () => ({
        statusCode: 200,
        body: await doBid(),
      }));
      return sendJSON(reply, res.statusCode, res.body);
    }
    return sendJSON(reply, 200, await doBid());
  });
}
