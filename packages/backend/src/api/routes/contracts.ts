import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { getPlayer } from '../auth-plugin.js';
import { sendJSON } from '../types.js';
import { notFound, tooMany } from '../../lib/errors.js';
import { rateLimit } from '../../lib/rate-limit.js';
import { acceptContract, deliverContract } from '../../economy/contracts.js';
import { accrueForPlayer } from '../../economy/state.js';
import { effectiveTrucks } from '../../economy/market.js';
import { persistResources } from '../../economy/engine.js';

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1, maxLength: 40 } },
};

export async function contractRoutes(app: FastifyInstance): Promise<void> {
  app.get('/contracts', async (req, reply) => {
    const player = getPlayer(req);
    const data = await prisma.$transaction(async (tx) => {
      await accrueForPlayer(tx, player.id);
      const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
      const contracts = await tx.contract.findMany({
        where: { playerId: player.id, status: { in: ['OFFERED', 'ACTIVE'] } },
        orderBy: { deadline: 'asc' },
      });
      const recent = await tx.contract.findMany({
        where: { playerId: player.id, status: { in: ['DELIVERED', 'FAILED', 'EXPIRED'] } },
        orderBy: { deadline: 'desc' },
        take: 10,
      });
      const busyTrucks = contracts.filter((c) => c.truckLocked).length;
      const boosters = await tx.playerBooster.findMany({ where: { playerId: player.id } });
      return {
        contracts,
        recent,
        trucksTotal: effectiveTrucks(p.trucks, boosters, new Date()),
        trucksBusy: busyTrucks,
      };
    });
    return sendJSON(reply, 200, {
      trucksTotal: data.trucksTotal,
      trucksBusy: data.trucksBusy,
      offers: data.contracts.filter((c) => c.status === 'OFFERED').map(serializeContract),
      active: data.contracts.filter((c) => c.status === 'ACTIVE').map(serializeContract),
      recent: data.recent.map(serializeContract),
    });
  });

  app.post('/contracts/:id/accept', { schema: { params: idParamsSchema } }, async (req, reply) => {
    const player = getPlayer(req);
    if (!(await rateLimit('contract', player.id, 20, 60))) {
      throw tooMany('RATE_LIMITED', 'Too many contract requests, slow down');
    }
    const { id } = req.params as { id: string };
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const contract = await tx.contract.findFirst({ where: { id, playerId: player.id } });
      if (!contract) throw notFound('CONTRACT_NOT_FOUND', 'Contract not found');
      const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
      const boosters = await tx.playerBooster.findMany({ where: { playerId: player.id } });
      const active = await tx.contract.findMany({ where: { playerId: player.id, status: 'ACTIVE' } });
      const busyTrucks = active.filter((c) => c.truckLocked).length;
      await acceptContract(tx, p, contract, busyTrucks, effectiveTrucks(p.trucks, boosters, now), now);
    });
    return sendJSON(reply, 200, { ok: true });
  });

  app.post('/contracts/:id/deliver', { schema: { params: idParamsSchema } }, async (req, reply) => {
    const player = getPlayer(req);
    if (!(await rateLimit('deliver', player.id, 20, 60))) {
      throw tooMany('RATE_LIMITED', 'Too many deliver requests, slow down');
    }
    const { id } = req.params as { id: string };
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const contract = await tx.contract.findFirst({ where: { id, playerId: player.id } });
      if (!contract) throw notFound('CONTRACT_NOT_FOUND', 'Contract not found');
      const resources = await accrueForPlayer(tx, player.id, now);
      await deliverContract(tx, contract, resources);
      await persistResources(tx, player.id, resources);
      const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
      await tx.player.update({ where: { id: player.id }, data: { money: p.money + contract.reward } });
      return { reward: contract.reward.toString(), money: (p.money + contract.reward).toString() };
    });
    return sendJSON(reply, 200, result);
  });
}

function serializeContract(c: {
  id: string;
  resource: string;
  qty: bigint;
  reward: bigint;
  penalty: bigint;
  status: string;
  deadline: Date;
}): Record<string, unknown> {
  return {
    id: c.id,
    resource: c.resource,
    qty: c.qty.toString(),
    reward: c.reward.toString(),
    penalty: c.penalty.toString(),
    status: c.status,
    deadline: c.deadline.toISOString(),
  };
}
