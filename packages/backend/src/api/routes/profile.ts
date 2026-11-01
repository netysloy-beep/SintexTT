import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { getPlayer } from '../auth-plugin.js';
import { sendJSON } from '../types.js';
import { badRequest, conflict, tooMany } from '../../lib/errors.js';
import { rateLimit } from '../../lib/rate-limit.js';

import { claimDaily, computeDaily } from '../../economy/daily.js';
import { TECH_MAP, TECHS, BOOSTERS } from '../../economy/catalog.js';

const techParamsSchema = {
  type: 'object',
  required: ['techId'],
  properties: { techId: { type: 'string', minLength: 1, maxLength: 40 } },
};

const guildBodySchema = {
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string', minLength: 3, maxLength: 24 } },
  additionalProperties: false,
};

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/profile', async (req, reply) => {
    const player = getPlayer(req);
    const data = await prisma.$transaction(async (tx) => {
      const p = await tx.player.findUniqueOrThrow({
        where: { id: player.id },
        include: { techs: true, boosters: true, guild: true },
      });
      const buildings = await tx.building.findMany({ where: { playerId: player.id } });
      const delivered = await tx.contract.count({ where: { playerId: player.id, status: 'DELIVERED' } });
      const failed = await tx.contract.count({ where: { playerId: player.id, status: 'FAILED' } });
      const referrals = await tx.player.count({ where: { referredBy: player.id } });
      const daily = computeDaily(p, new Date());
      return { p, buildings, delivered, failed, referrals, daily };
    });

    const p = data.p;
    return sendJSON(reply, 200, {
      player: {
        id: p.id,
        telegramId: p.telegramId.toString(),
        username: p.username,
        firstName: p.firstName,
        money: p.money.toString(),
        workers: p.workers,
        trucks: p.trucks,
        streak: p.streak,
        suspicion: p.suspicion,
        referredBy: p.referredBy,
        referralCount: data.referrals,
        createdAt: p.createdAt.toISOString(),
      },
      stats: {
        buildingCount: data.buildings.length,
        contractsDelivered: data.delivered,
        contractsFailed: data.failed,
      },
      daily: {
        available: !data.daily.alreadyClaimed,
        reward: data.daily.reward.toString(),
        streak: data.daily.streak,
      },
      techs: {
        owned: p.techs.map((t) => t.techId),
        all: TECHS,
      },
      boosters: {
        active: p.boosters
          .filter((b) => b.expiresAt > new Date())
          .map((b) => ({
            boosterId: b.boosterId,
            expiresAt: b.expiresAt.toISOString(),
            def: BOOSTERS.find((x) => x.boosterId === b.boosterId) ?? null,
          })),
      },
      guild: p.guild ? { id: p.guild.id, name: p.guild.name } : null,
    });
  });

  app.post('/daily', async (req, reply) => {
    const player = getPlayer(req);
    if (!(await rateLimit('daily', player.id, 5, 60))) {
      throw tooMany('RATE_LIMITED', 'Too many daily requests, slow down');
    }
    const result = await prisma.$transaction(async (tx) => {
      const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
      return claimDaily(tx, p, new Date());
    });
    return sendJSON(reply, 200, { reward: result.reward.toString(), streak: result.streak });
  });

  app.get('/techs', async (req, reply) => {
    getPlayer(req);
    return sendJSON(reply, 200, { techs: TECHS });
  });

  app.post('/techs/:techId/unlock', { schema: { params: techParamsSchema } }, async (req, reply) => {
    const player = getPlayer(req);
    const { techId } = req.params as { techId: string };
    const def = TECH_MAP.get(techId);
    if (!def) throw badRequest('UNKNOWN_TECH', `Unknown technology: ${techId}`);

    const result = await prisma.$transaction(async (tx) => {
      const p = await tx.player.findUniqueOrThrow({
        where: { id: player.id },
        include: { techs: true },
      });
      if (p.techs.some((t) => t.techId === techId)) {
        throw new Error('TECH_ALREADY_OWNED');
      }
      const missing = def.requires.filter((r) => !p.techs.some((t) => t.techId === r));
      if (missing.length > 0) throw new Error('TECH_LOCKED');
      if (p.money < def.cost) throw new Error('INSUFFICIENT_FUNDS');
      const data: { workers?: number; trucks?: number } = {};
      if (techId === 'hr') data.workers = p.workers + 2;
      if (techId === 'logistics') data.trucks = p.trucks + 1;
      await tx.player.update({
        where: { id: player.id },
        data: { money: p.money - def.cost, ...data },
      });
      await tx.playerTech.create({ data: { playerId: player.id, techId } });
      return { techId, cost: def.cost.toString(), money: (p.money - def.cost).toString() };
    });
    return sendJSON(reply, 200, result);
  });

  app.post('/guilds', { schema: { body: guildBodySchema } }, async (req, reply) => {
    const player = getPlayer(req);
    if (!(await rateLimit('guild', player.id, 5, 300))) {
      throw tooMany('RATE_LIMITED', 'Too many guild requests, slow down');
    }
    const { name } = req.body as { name: string };
    const result = await prisma.$transaction(async (tx) => {
      const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
      if (p.guildId) throw new Error('ALREADY_IN_GUILD');
      const taken = await tx.guild.findUnique({ where: { name } });
      if (taken) throw new Error('GUILD_NAME_TAKEN');
      const guild = await tx.guild.create({ data: { name, ownerId: player.id } });
      await tx.player.update({ where: { id: player.id }, data: { guildId: guild.id } });
      return { guildId: guild.id, name: guild.name };
    });
    return sendJSON(reply, 200, result);
  });

  app.post('/guilds/join', { schema: { body: guildBodySchema } }, async (req, reply) => {
    const player = getPlayer(req);
    const { name } = req.body as { name: string };
    const result = await prisma.$transaction(async (tx) => {
      const p = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
      if (p.guildId) throw conflict('ALREADY_IN_GUILD', 'Leave your current guild first');
      const guild = await tx.guild.findUnique({ where: { name } });
      if (!guild) throw badRequest('GUILD_NOT_FOUND', 'Guild not found');
      await tx.player.update({ where: { id: player.id }, data: { guildId: guild.id } });
      return { guildId: guild.id, name: guild.name };
    });
    return sendJSON(reply, 200, result);
  });
}
