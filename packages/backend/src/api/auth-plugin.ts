import type { FastifyInstance, FastifyRequest } from 'fastify';
import { resolveSession } from '../lib/session.js';

declare module 'fastify' {
  interface FastifyRequest {
    player?: { id: string; telegramId: bigint; username: string | null; firstName: string | null };
  }
}

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return; // public route
    const token = header.slice('Bearer '.length);
    const player = await resolveSession(token);
    if (player) req.player = player;
  });
}

export function getPlayer(req: FastifyRequest): { id: string; telegramId: bigint; username: string | null; firstName: string | null } {
  if (!req.player) {
    const err = new Error('UNAUTHORIZED');
    Object.assign(err, { statusCode: 401, code: 'UNAUTHORIZED' });
    throw err;
  }
  return req.player;
}
