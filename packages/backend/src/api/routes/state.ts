import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { getPlayer } from '../auth-plugin.js';
import { sendJSON } from '../types.js';
import { buildFullState } from '../../economy/state.js';
import { BUILDINGS, TECHS, BOOSTERS } from '../../economy/catalog.js';

export async function stateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/state', async (req, reply) => {
    const player = getPlayer(req);
    const state = await prisma.$transaction((tx) => buildFullState(tx, player.id));
    return sendJSON(reply, 200, {
      ...state,
      catalog: {
        buildings: BUILDINGS,
        techs: TECHS,
        boosters: BOOSTERS,
      },
    });
  });

  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));
}
