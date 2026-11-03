import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { getPlayer } from '../auth-plugin.js';
import { sendJSON } from '../types.js';
import { badRequest } from '../../lib/errors.js';
import { AppError } from '../../lib/errors.js';
import { rateLimit } from '../../lib/rate-limit.js';

const MIN_BET = 1000n; // $10
const MAX_BET = 2_000_000n; // $20,000

function parseBet(raw: unknown): bigint {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw badRequest('INVALID_AMOUNT', 'bet must be a string integer (cents)');
  }
  try {
    const v = BigInt(raw);
    if (v < MIN_BET) throw badRequest('BET_TOO_SMALL', 'Минимальная ставка $10');
    if (v > MAX_BET) throw badRequest('BET_TOO_LARGE', 'Максимальная ставка $20,000');
    return v;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw badRequest('INVALID_AMOUNT', 'bet must be an integer string');
  }
}

/** Provably simple coin flip: 50/50, server-side randomness, rate limited. */
export async function casinoRoutes(app: FastifyInstance): Promise<void> {
  app.post('/casino/flip', async (req, reply) => {
    const player = getPlayer(req);
    const allowed = await rateLimit('casino', player.id, 12, 60);
    if (!allowed) throw new AppError(429, 'CASINO_RATE_LIMIT', 'Слишком часто — подождите минуту');

    const body = req.body as { bet?: string; side?: string };
    const bet = parseBet(body.bet);
    const side = body.side === 'HEADS' || body.side === 'TAILS' ? body.side : null;
    if (!side) throw badRequest('INVALID_SIDE', 'side must be HEADS or TAILS');

    const money = await prisma.$transaction(async (tx) => {
      const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
      if (p.money < bet) throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Недостаточно средств');
      const result = randomInt(0, 2) === 0 ? 'HEADS' : 'TAILS';
      const won = result === side;
      const next = won ? p.money + bet : p.money - bet;
      await tx.player.update({ where: { id: p.id }, data: { money: next } });
      return { result, won, money: next };
    });

    return sendJSON(reply, 200, {
      result: money.result,
      side,
      won: money.won,
      payout: money.won ? (bet * 2n).toString() : '0',
      money: money.money.toString(),
    });
  });
}
