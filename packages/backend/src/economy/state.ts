import { Prisma } from '@prisma/client';
import { applyCycles, persistResources, type ResourceMap } from './engine.js';
import { collectModifiers, effectiveTrucks } from './market.js';
import { RESOURCE_KINDS, RESOURCE_LABELS, BUILDING_MAP, type ResourceKind } from './catalog.js';

export interface FullState {
  player: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    money: string;
    workers: number;
    workersAssigned: number;
    trucks: number;
    trucksBusy: number;
    streak: number;
    suspicion: number;
    dailyAvailable: boolean;
    guildId: string | null;
  };
  resources: { kind: string; label: string; qty: string }[];
  buildings: {
    id: string;
    kind: string;
    level: number;
    assignedWorkers: number;
    workersNeeded: number;
  }[];
}

/**
 * Accrue production for a player inside a transaction and persist it.
 * Returns the updated resource map; the caller continues with more queries.
 */
export async function accrueForPlayer(
  tx: Prisma.TransactionClient,
  playerId: string,
  now: Date = new Date(),
): Promise<ResourceMap> {
  const player = await tx.player.findUnique({ where: { id: playerId } });
  if (!player) throw new Error('PLAYER_NOT_FOUND');
  const [resourceRows, buildings, techs, boosters, events] = await Promise.all([
    tx.resource.findMany({ where: { playerId } }),
    tx.building.findMany({ where: { playerId } }),
    tx.playerTech.findMany({ where: { playerId } }),
    tx.playerBooster.findMany({ where: { playerId } }),
    tx.gameEvent.findMany({ where: { playerId, resolved: false } }),
  ]);

  const resources: ResourceMap = new Map(resourceRows.map((r) => [r.kind, r.qty]));
  const mods = collectModifiers(events, techs, boosters, now);

  const producedIds: string[] = [];
  for (const b of buildings) {
    const report = applyCycles(b, resources, mods, now);
    if (report.cycles > 0) producedIds.push(b.id);
  }
  // Only buildings that completed cycles move their clock forward; buildings
  // blocked by missing inputs keep their elapsed time for a later catch-up.
  for (const id of producedIds) {
    await tx.building.update({
      where: { id },
      data: { lastCollectedAt: now },
    });
  }
  await persistResources(tx, playerId, resources);
  return resources;
}

export async function buildFullState(tx: Prisma.TransactionClient, playerId: string, now: Date = new Date()): Promise<FullState> {
  const resources = await accrueForPlayer(tx, playerId, now);
  const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
  const buildings = await tx.building.findMany({ where: { playerId } });
  const boosters = await tx.playerBooster.findMany({ where: { playerId } });
  const activeContracts = await tx.contract.findMany({
    where: { playerId, status: 'ACTIVE' },
  });

  const workersAssigned = buildings.reduce((acc, b) => acc + b.assignedWorkers, 0);
  const trucksBusy = activeContracts.filter((c) => c.truckLocked).length;
  const lastDaily = player.lastDailyAt;
  const today = now.toISOString().slice(0, 10);

  const out: FullState = {
    player: {
      id: player.id,
      telegramId: player.telegramId.toString(),
      username: player.username,
      firstName: player.firstName,
      money: player.money.toString(),
      workers: player.workers,
      workersAssigned,
      trucks: effectiveTrucks(player.trucks, boosters, now),
      trucksBusy,
      streak: player.streak,
      suspicion: player.suspicion,
      dailyAvailable: !lastDaily || lastDaily.toISOString().slice(0, 10) !== today,
      guildId: player.guildId,
    },
    resources: RESOURCE_KINDS.map((kind) => ({
      kind,
      label: RESOURCE_LABELS[kind as ResourceKind],
      qty: (resources.get(kind) ?? 0n).toString(),
    })),
    buildings: buildings.map((b) => ({
      id: b.id,
      kind: b.kind,
      level: b.level,
      assignedWorkers: b.assignedWorkers,
      workersNeeded: BUILDING_MAP.get(b.kind)?.workersNeeded ?? 0,
    })),
  };
  return out;
}
