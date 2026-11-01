import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { getPlayer } from '../auth-plugin.js';
import { sendJSON } from '../types.js';
import { badRequest, notFound, tooMany } from '../../lib/errors.js';
import { rateLimit } from '../../lib/rate-limit.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { BUILDING_MAP, upgradeCost } from '../../economy/catalog.js';
import { accrueForPlayer } from '../../economy/state.js';

const buildBodySchema = {
  type: 'object',
  required: ['kind'],
  properties: { kind: { type: 'string', minLength: 1, maxLength: 40 } },
  additionalProperties: false,
};

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1, maxLength: 40 } },
};

const assignSchema = {
  body: {
    type: 'object',
    required: ['count'],
    properties: { count: { type: 'integer', minimum: 0, maximum: 50 } },
    additionalProperties: false,
  },
  params: idParamsSchema,
};

export async function buildingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/buildings', { schema: { body: buildBodySchema } }, async (req, reply) => {
    const player = getPlayer(req);
    if (!(await rateLimit('build', player.id, 20, 60))) {
      throw tooMany('RATE_LIMITED', 'Too many build requests, slow down');
    }
    const { kind } = req.body as { kind: string };
    const def = BUILDING_MAP.get(kind);
    if (!def) throw badRequest('UNKNOWN_BUILDING', `Unknown building kind: ${kind}`);

    const doBuild = async () =>
      prisma.$transaction(async (tx) => {
        const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
        const owned = await tx.building.count({ where: { playerId: player.id, kind } });
        // Each additional building of the same kind costs proportionally more.
        const cost = def.baseCost * BigInt(owned + 1);
        if (p.money < cost) throw new Error('INSUFFICIENT_FUNDS');
        await tx.player.update({ where: { id: player.id }, data: { money: p.money - cost } });
        const building = await tx.building.create({
          data: { playerId: player.id, kind, level: 1, assignedWorkers: 0 },
        });
        return { buildingId: building.id, cost: cost.toString(), money: (p.money - cost).toString() };
      });

    // Idempotent only when the client sends an Idempotency-Key header.
    const idemKey = req.headers['idempotency-key'];
    if (idemKey) {
      const res = await withIdempotency(`build:${player.id}:${idemKey}`, async () => ({
        statusCode: 200,
        body: await doBuild(),
      }));
      return sendJSON(reply, res.statusCode, res.body);
    }
    return sendJSON(reply, 200, await doBuild());
  });

  app.post('/buildings/:id/upgrade', { schema: { params: idParamsSchema } }, async (req, reply) => {
    const player = getPlayer(req);
    if (!(await rateLimit('upgrade', player.id, 30, 60))) {
      throw tooMany('RATE_LIMITED', 'Too many upgrade requests, slow down');
    }
    const { id } = req.params as { id: string };
    const result = await prisma.$transaction(async (tx) => {
      const building = await tx.building.findFirst({ where: { id, playerId: player.id } });
      if (!building) throw notFound('BUILDING_NOT_FOUND', 'Building not found');
      const def = BUILDING_MAP.get(building.kind);
      if (!def) throw notFound('UNKNOWN_BUILDING', 'Building definition missing');
      if (building.level >= def.maxLevel) throw badRequest('MAX_LEVEL', 'Building is at max level');
      const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
      const cost = upgradeCost(def, building.level);
      if (p.money < cost) throw new Error('INSUFFICIENT_FUNDS');
      await tx.player.update({ where: { id: player.id }, data: { money: p.money - cost } });
      await tx.building.update({ where: { id }, data: { level: building.level + 1 } });
      return {
        buildingId: id,
        newLevel: building.level + 1,
        cost: cost.toString(),
        money: (p.money - cost).toString(),
      };
    });
    return sendJSON(reply, 200, result);
  });

  app.post('/buildings/:id/assign', { schema: assignSchema }, async (req, reply) => {
    const player = getPlayer(req);
    const { id } = req.params as { id: string };
    const { count } = req.body as { count: number };
    const result = await prisma.$transaction(async (tx) => {
      const building = await tx.building.findFirst({ where: { id, playerId: player.id } });
      if (!building) throw notFound('BUILDING_NOT_FOUND', 'Building not found');
      const def = BUILDING_MAP.get(building.kind);
      if (!def) throw notFound('UNKNOWN_BUILDING', 'Building definition missing');
      if (count > def.workersNeeded) throw badRequest('TOO_MANY_WORKERS', 'More workers than the building needs');
      const all = await tx.building.findMany({ where: { playerId: player.id } });
      const assignedElsewhere = all
        .filter((b) => b.id !== id)
        .reduce((acc, b) => acc + b.assignedWorkers, 0);
      const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
      if (assignedElsewhere + count > p.workers) {
        throw badRequest('NOT_ENOUGH_WORKERS', 'Not enough free workers');
      }
      await tx.building.update({ where: { id }, data: { assignedWorkers: count } });
      return { buildingId: id, assignedWorkers: count, workersFree: p.workers - assignedElsewhere - count };
    });
    return sendJSON(reply, 200, result);
  });

  app.post('/collect', async (req, reply) => {
    const player = getPlayer(req);
    if (!(await rateLimit('collect', player.id, 30, 60))) {
      throw tooMany('RATE_LIMITED', 'Too many collect requests, slow down');
    }
    const resources = await prisma.$transaction((tx) => accrueForPlayer(tx, player.id));
    return sendJSON(reply, 200, {
      collected: Object.fromEntries([...resources.entries()].map(([k, v]) => [k, v.toString()])),
    });
  });
}
