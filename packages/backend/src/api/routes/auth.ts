import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { validateInitData, parseReferral } from '../../lib/initdata.js';
import { createSession } from '../../lib/session.js';
import { prisma } from '../../lib/prisma.js';
import { ensurePlayer } from '../../users.js';
import { unauthorized } from '../../lib/errors.js';
import { sendJSON } from '../types.js';

export const authSchema = {
  body: {
    type: 'object',
    required: ['initData'],
    properties: {
      initData: { type: 'string', minLength: 16, maxLength: 4096 },
    },
    additionalProperties: false,
  },
};

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/init', { schema: authSchema }, async (req, reply) => {
    const { initData } = req.body as { initData: string };
    if (!env.botToken) {
      throw unauthorized('BOT_TOKEN_MISSING', 'BOT_TOKEN is not configured on the server');
    }
    let validated;
    try {
      validated = validateInitData(initData, env.botToken, env.initDataMaxAgeHours);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'INVALID_INIT_DATA';
      throw unauthorized(code, 'Invalid Telegram initData');
    }

    const refTelegramId = parseReferral(validated.startParam);
    const player = await prisma.$transaction(async (tx) =>
      ensurePlayer(tx, {
        telegramId: BigInt(validated.user.id),
        username: validated.user.username ?? null,
        firstName: validated.user.first_name ?? null,
        referrerTelegramId: refTelegramId ? BigInt(refTelegramId) : null,
      }),
    );
    const token = await createSession(player.id, env.sessionTtlHours);
    return sendJSON(reply, 200, {
      token,
      player: {
        id: player.id,
        telegramId: player.telegramId.toString(),
        username: player.username,
        firstName: player.firstName,
      },
    });
  });
}
