import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { getPlayer } from '../auth-plugin.js';
import { sendJSON } from '../types.js';
import { tooMany } from '../../lib/errors.js';
import { rateLimit } from '../../lib/rate-limit.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { currentSpreadBps, executeTrade } from '../../economy/market.js';
import { accrueForPlayer } from '../../economy/state.js';
import { RESOURCE_KINDS, type ResourceKind } from '../../economy/catalog.js';

const tradeBodySchema = {
  type: 'object',
  required: ['kind', 'qty', 'side'],
  properties: {
    kind: { type: 'string', enum: [...RESOURCE_KINDS] },
    qty: { type: 'integer', minimum: 1, maximum: 100000 },
    side: { type: 'string', enum: ['buy', 'sell'] },
  },
  additionalProperties: false,
};

export async function marketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/market', async (req, reply) => {
    const player = getPlayer(req);
    const data = await prisma.$transaction(async (tx) => {
      const now = new Date();
      await accrueForPlayer(tx, player.id, now);
      const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
      const techs = await tx.playerTech.findMany({ where: { playerId: player.id } });
      const boosters = await tx.playerBooster.findMany({ where: { playerId: player.id } });
      const spread = currentSpreadBps(techs, boosters, now);
      const prices = await tx.marketPrice.findMany();
      const history = await tx.pricePoint.findMany({
        orderBy: { recordedAt: 'asc' },
        take: 200,
      });
      return { p, spread, prices, history };
    });

    const historyByKind = new Map<string, { t: string; price: string }[]>();
    for (const h of data.history) {
      const list = historyByKind.get(h.kind) ?? [];
      list.push({ t: h.recordedAt.toISOString(), price: h.price.toString() });
      historyByKind.set(h.kind, list);
    }

    return sendJSON(reply, 200, {
      spreadBps: data.spread,
      money: data.p.money.toString(),
      prices: data.prices.map((r) => ({
        kind: r.kind,
        price: r.price.toString(),
        history: historyByKind.get(r.kind) ?? [],
      })),
    });
  });

  app.post('/market/trade', { schema: { body: tradeBodySchema } }, async (req, reply) => {
    const player = getPlayer(req);
    if (!(await rateLimit('trade', player.id, 30, 60))) {
      throw tooMany('RATE_LIMITED', 'Too many trade requests, slow down');
    }
    const body = req.body as { kind: ResourceKind; qty: number; side: 'buy' | 'sell' };
    const qty = BigInt(body.qty);

    const doTrade = async () =>
      prisma.$transaction(async (tx) => {
        const now = new Date();
        const resources = await accrueForPlayer(tx, player.id, now);
        const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
        const techs = await tx.playerTech.findMany({ where: { playerId: player.id } });
        const boosters = await tx.playerBooster.findMany({ where: { playerId: player.id } });
        const spread = currentSpreadBps(techs, boosters, now);
        const result = await executeTrade(
          tx, player.id, body.kind, qty, body.side, spread, resources, p.money,
        );
        await tx.player.update({ where: { id: player.id }, data: { money: result.money } });
        for (const [kind, q] of resources) {
          await tx.resource.upsert({
            where: { playerId_kind: { playerId: player.id, kind } },
            create: { playerId: player.id, kind, qty: q },
            update: { qty: q },
          });
        }
        return {
          side: body.side,
          kind: body.kind,
          qty: qty.toString(),
          unitPrice: result.unitPrice.toString(),
          total: result.total.toString(),
          newMarketPrice: result.newPrice.toString(),
          money: result.money.toString(),
        };
      });

    const idemKey = req.headers['idempotency-key'];
    if (idemKey) {
      const res = await withIdempotency(`trade:${player.id}:${idemKey}`, async () => ({
        statusCode: 200,
        body: await doTrade(),
      }));
      return sendJSON(reply, res.statusCode, res.body);
    }
    return sendJSON(reply, 200, await doTrade());
  });
}
