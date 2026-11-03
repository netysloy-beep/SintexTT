import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { getPlayer } from '../auth-plugin.js';
import { sendJSON } from '../types.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { RESOURCE_KINDS, type ResourceKind } from '../../economy/catalog.js';

/** Admins are configured via ADMIN_TELEGRAM_IDS (comma-separated). */
const ADMIN_TELEGRAM_IDS: bigint[] = (process.env.ADMIN_TELEGRAM_IDS ?? '8544442910')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .map((s) => {
    try {
      return BigInt(s);
    } catch {
      return 0n;
    }
  })
  .filter((id) => id > 0n);

function assertAdmin(telegramId: bigint): void {
  if (!ADMIN_TELEGRAM_IDS.includes(telegramId)) {
    throw forbidden('FORBIDDEN', 'Admin access required');
  }
}

function tryBigInt(raw: string): bigint | null {
  try {
    const v = BigInt(raw);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

function parseBigIntField(raw: unknown, field: string): bigint {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw badRequest('INVALID_AMOUNT', `${field} must be a string integer`);
  }
  const v = tryBigInt(raw);
  if (v === null) throw badRequest('INVALID_AMOUNT', `${field} must be a positive integer`);
  return v;
}

function parseSignedBigIntField(raw: unknown, field: string): bigint {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw badRequest('INVALID_AMOUNT', `${field} must be a string integer`);
  }
  try {
    return BigInt(raw);
  } catch {
    throw badRequest('INVALID_AMOUNT', `${field} must be an integer string`);
  }
}

function playerSummary(p: {
  id: string;
  telegramId: bigint;
  username: string | null;
  firstName: string | null;
  money: bigint;
  workers: number;
  trucks: number;
  streak: number;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: p.id,
    telegramId: p.telegramId.toString(),
    username: p.username,
    firstName: p.firstName,
    money: p.money.toString(),
    workers: p.workers,
    trucks: p.trucks,
    streak: p.streak,
    createdAt: p.createdAt.toISOString(),
  };
}

const STARTER_BUILDING_KINDS = ['farm', 'lumberCamp', 'powerPlant'];

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/players', async (req, reply) => {
    const me = getPlayer(req);
    assertAdmin(me.telegramId);
    const search = ((req.query as { search?: string }).search ?? '').trim();
    let where: Prisma.PlayerWhereInput = {};
    if (search.length > 0) {
      const or: Prisma.PlayerWhereInput[] = [
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
      ];
      const tg = tryBigInt(search);
      if (tg !== null) or.push({ telegramId: tg });
      where = { OR: or };
    }
    const players = await prisma.player.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return sendJSON(reply, 200, { players: players.map(playerSummary) });
  });

  app.get('/admin/players/:id', async (req, reply) => {
    const me = getPlayer(req);
    assertAdmin(me.telegramId);
    const { id } = req.params as { id: string };
    const p = await prisma.player.findUnique({
      where: { id },
      include: { resources: true, buildings: true },
    });
    if (!p) throw notFound('PLAYER_NOT_FOUND', 'Player not found');
    return sendJSON(reply, 200, {
      player: playerSummary(p),
      resources: p.resources.map((r) => ({ kind: r.kind, qty: r.qty.toString() })),
      buildings: p.buildings.map((b) => ({
        id: b.id,
        kind: b.kind,
        level: b.level,
        assignedWorkers: b.assignedWorkers,
      })),
    });
  });

  app.post('/admin/grant', async (req, reply) => {
    const me = getPlayer(req);
    assertAdmin(me.telegramId);
    const body = req.body as {
      playerId?: string;
      moneyDelta?: string;
      workersDelta?: number;
      trucksDelta?: number;
      resources?: { kind?: string; qtyDelta?: string }[];
    };
    if (!body.playerId) throw badRequest('INVALID_INPUT', 'playerId is required');

    const moneyDelta =
      body.moneyDelta === undefined ? undefined : parseSignedBigIntField(body.moneyDelta, 'moneyDelta');
    const resources = (body.resources ?? []).map((r) => {
      if (!r.kind || !RESOURCE_KINDS.includes(r.kind as ResourceKind)) {
        throw badRequest('UNKNOWN_RESOURCE', `Unknown resource kind: ${String(r.kind)}`);
      }
      if (r.qtyDelta === undefined) throw badRequest('INVALID_AMOUNT', 'qtyDelta is required');
      return {
        kind: r.kind as ResourceKind,
        qtyDelta: parseSignedBigIntField(r.qtyDelta, 'qtyDelta'),
      };
    });

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.player.findUnique({ where: { id: body.playerId }, include: { resources: true } });
      if (!p) throw notFound('PLAYER_NOT_FOUND', 'Player not found');

      const data: Prisma.PlayerUpdateInput = {};
      if (moneyDelta !== undefined) {
        const next = p.money + moneyDelta;
        if (next < 0n) throw badRequest('NEGATIVE_RESULT', 'Money would go negative');
        data.money = next;
      }
      if (body.workersDelta !== undefined && body.workersDelta !== 0) {
        const next = p.workers + body.workersDelta;
        if (next < 0) throw badRequest('NEGATIVE_RESULT', 'Workers would go negative');
        data.workers = next;
      }
      if (body.trucksDelta !== undefined && body.trucksDelta !== 0) {
        const next = p.trucks + body.trucksDelta;
        if (next < 0) throw badRequest('NEGATIVE_RESULT', 'Trucks would go negative');
        data.trucks = next;
      }
      if (Object.keys(data).length > 0) {
        await tx.player.update({ where: { id: p.id }, data });
      }

      for (const r of resources) {
        const existing = p.resources.find((x) => x.kind === r.kind);
        if (existing) {
          const next = existing.qty + r.qtyDelta;
          if (next < 0n) throw badRequest('NEGATIVE_RESULT', `Qty for ${r.kind} would go negative`);
          await tx.resource.update({ where: { id: existing.id }, data: { qty: next } });
        } else {
          if (r.qtyDelta < 0n) throw badRequest('NEGATIVE_RESULT', `Qty for ${r.kind} would go negative`);
          await tx.resource.create({ data: { playerId: p.id, kind: r.kind, qty: r.qtyDelta } });
        }
      }

      return tx.player.findUniqueOrThrow({ where: { id: p.id }, include: { resources: true } });
    });

    return sendJSON(reply, 200, {
      player: playerSummary(updated),
      resources: updated.resources.map((r) => ({ kind: r.kind, qty: r.qty.toString() })),
    });
  });

  app.post('/admin/set', async (req, reply) => {
    const me = getPlayer(req);
    assertAdmin(me.telegramId);
    const body = req.body as {
      playerId?: string;
      money?: string;
      workers?: number;
      trucks?: number;
      streak?: number;
      suspicion?: number;
    };
    if (!body.playerId) throw badRequest('INVALID_INPUT', 'playerId is required');
    const data: Prisma.PlayerUpdateInput = {};
    if (body.money !== undefined) data.money = parseBigIntField(body.money, 'money');
    if (body.workers !== undefined) {
      if (!Number.isInteger(body.workers) || body.workers < 0) throw badRequest('INVALID_INPUT', 'workers must be a non-negative integer');
      data.workers = body.workers;
    }
    if (body.trucks !== undefined) {
      if (!Number.isInteger(body.trucks) || body.trucks < 0) throw badRequest('INVALID_INPUT', 'trucks must be a non-negative integer');
      data.trucks = body.trucks;
    }
    if (body.streak !== undefined) {
      if (!Number.isInteger(body.streak) || body.streak < 0) throw badRequest('INVALID_INPUT', 'streak must be a non-negative integer');
      data.streak = body.streak;
    }
    if (body.suspicion !== undefined) {
      if (!Number.isInteger(body.suspicion) || body.suspicion < 0) throw badRequest('INVALID_INPUT', 'suspicion must be a non-negative integer');
      data.suspicion = body.suspicion;
    }
    if (Object.keys(data).length === 0) throw badRequest('INVALID_INPUT', 'Nothing to set');

    const updated = await prisma.player.update({ where: { id: body.playerId }, data });
    return sendJSON(reply, 200, { player: playerSummary(updated) });
  });

  app.post('/admin/reset', async (req, reply) => {
    const me = getPlayer(req);
    assertAdmin(me.telegramId);
    const body = req.body as { playerId?: string };
    if (!body.playerId) throw badRequest('INVALID_INPUT', 'playerId is required');
    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.player.findUnique({ where: { id: body.playerId } });
      if (!p) throw notFound('PLAYER_NOT_FOUND', 'Player not found');
      await tx.resource.deleteMany({ where: { playerId: p.id } });
      await tx.building.deleteMany({ where: { playerId: p.id } });
      for (const kind of STARTER_BUILDING_KINDS) {
        await tx.building.create({ data: { playerId: p.id, kind, level: 1, assignedWorkers: 0 } });
      }
      return tx.player.update({
        where: { id: p.id },
        data: { money: 500000n, workers: 4, trucks: 1, streak: 0, suspicion: 0 },
      });
    });
    return sendJSON(reply, 200, { player: playerSummary(updated) });
  });

  app.post('/admin/delete', async (req, reply) => {
    const me = getPlayer(req);
    assertAdmin(me.telegramId);
    const body = req.body as { playerId?: string };
    if (!body.playerId) throw badRequest('INVALID_INPUT', 'playerId is required');
    if (body.playerId === me.id) throw badRequest('CANNOT_DELETE_SELF', 'You cannot delete your own account');
    const p = await prisma.player.findUnique({ where: { id: body.playerId } });
    if (!p) throw notFound('PLAYER_NOT_FOUND', 'Player not found');
    await prisma.player.delete({ where: { id: p.id } });
    return sendJSON(reply, 200, { deleted: true });
  });
}
