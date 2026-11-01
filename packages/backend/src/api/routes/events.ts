import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { getPlayer } from '../auth-plugin.js';
import { sendJSON } from '../types.js';
import { notFound, tooMany } from '../../lib/errors.js';
import { rateLimit } from '../../lib/rate-limit.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { EVENT_DEFS, respondToEvent, type EventKind } from '../../economy/events.js';

const respondSchema = {
  body: {
    type: 'object',
    required: ['responseId'],
    properties: { responseId: { type: 'string', minLength: 1, maxLength: 40 } },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1, maxLength: 40 } },
  },
};

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.get('/events', async (req, reply) => {
    const player = getPlayer(req);
    const events = await prisma.gameEvent.findMany({
      where: { playerId: player.id, resolved: false, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'asc' },
    });
    return sendJSON(reply, 200, {
      active: events.map((ev) => ({
        id: ev.id,
        kind: ev.kind,
        payload: ev.payload,
        expiresAt: ev.expiresAt.toISOString(),
        def: EVENT_DEFS[ev.kind as EventKind] ?? null,
      })),
    });
  });

  app.post('/events/:id/respond', { schema: respondSchema }, async (req, reply) => {
    const player = getPlayer(req);
    if (!(await rateLimit('events', player.id, 20, 60))) {
      throw tooMany('RATE_LIMITED', 'Too many event responses, slow down');
    }
    const { id } = req.params as { id: string };
    const { responseId } = req.body as { responseId: string };

    const doRespond = async () =>
      prisma.$transaction(async (tx) => {
        const now = new Date();
        const event = await tx.gameEvent.findFirst({ where: { id, playerId: player.id } });
        if (!event) throw notFound('EVENT_NOT_FOUND', 'Event not found');
        const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
        const result = await respondToEvent(tx, p, event, responseId, now);
        await tx.player.update({ where: { id: player.id }, data: { money: result.money } });
        return { message: result.message, money: result.money.toString() };
      });

    const idemKey = req.headers['idempotency-key'];
    if (idemKey) {
      const res = await withIdempotency(`event:${player.id}:${idemKey}`, async () => ({
        statusCode: 200,
        body: await doRespond(),
      }));
      return sendJSON(reply, res.statusCode, res.body);
    }
    return sendJSON(reply, 200, await doRespond());
  });
}
