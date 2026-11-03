import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { stateRoutes } from './state.js';
import { buildingRoutes } from './buildings.js';
import { marketRoutes } from './market.js';
import { contractRoutes } from './contracts.js';
import { auctionRoutes } from './auction.js';
import { eventRoutes } from './events.js';
import { profileRoutes } from './profile.js';
import { adminRoutes } from './admin.js';
import { casinoRoutes } from './casino.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await authRoutes(app);
  await stateRoutes(app);
  await buildingRoutes(app);
  await marketRoutes(app);
  await contractRoutes(app);
  await auctionRoutes(app);
  await eventRoutes(app);
  await profileRoutes(app);
  await adminRoutes(app);
  await casinoRoutes(app);
}
