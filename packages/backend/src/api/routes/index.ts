import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { stateRoutes } from './state.js';
import { buildingRoutes } from './buildings.js';
import { marketRoutes } from './market.js';
import { contractRoutes } from './contracts.js';
import { auctionRoutes } from './auction.js';
import { eventRoutes } from './events.js';
import { profileRoutes } from './profile.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await Promise.resolve(); // keep signature async for future extensions
  await authRoutes(app);
  await stateRoutes(app);
  await buildingRoutes(app);
  await marketRoutes(app);
  await contractRoutes(app);
  await auctionRoutes(app);
  await eventRoutes(app);
  await profileRoutes(app);
}
