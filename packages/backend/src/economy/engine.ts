import { Prisma, type Building } from '@prisma/client';
import { BUILDING_MAP, type ResourceKind } from './catalog.js';

export interface EngineModifiers {
  productionBps: number; // 10000 = neutral, 12500 = +25%
  energyCostBps: number; // 7500 = -25% energy consumption
  throughputBps: number; // 7000 = -30% throughput (strike)
  wheatPenaltyBps: number; // 5000 = -50% raw wheat output (drought)
}

export const NEUTRAL_MODIFIERS: EngineModifiers = {
  productionBps: 10000,
  energyCostBps: 10000,
  throughputBps: 10000,
  wheatPenaltyBps: 10000,
};

export type BlockedBy = 'none' | 'workers' | 'inputs';

export interface AccrualBuildingReport {
  buildingId: string;
  kind: string;
  cycles: number;
  produced: Partial<Record<ResourceKind, bigint>>;
  consumed: Partial<Record<ResourceKind, bigint>>;
  blockedBy: BlockedBy;
}

export type ResourceMap = Map<string, bigint>;

export function getResource(resources: ResourceMap, kind: string): bigint {
  return resources.get(kind) ?? 0n;
}

export function addResource(resources: ResourceMap, kind: string, delta: bigint): void {
  resources.set(kind, getResource(resources, kind) + delta);
}

function workerFactor(assigned: number, needed: number): number {
  if (needed <= 0) return 1;
  if (assigned <= 0) return 0;
  if (assigned >= needed) return 1;
  return 0.5 + 0.5 * (assigned / needed);
}

/**
 * Pure computation of completed production cycles since lastCollectedAt.
 * Cycles are limited by time, stock of inputs and stock of energy.
 * Level multiplies output quantity (applied in applyCycles), not cycle speed.
 */
export function computeCycles(
  building: Pick<Building, 'kind' | 'level' | 'assignedWorkers' | 'lastCollectedAt'>,
  resources: ResourceMap,
  mods: EngineModifiers,
  now: Date,
): { cycles: bigint; blockedBy: BlockedBy } {
  const def = BUILDING_MAP.get(building.kind);
  if (!def) return { cycles: 0n, blockedBy: 'none' };

  const elapsedSec = Math.max(0, Math.floor((now.getTime() - building.lastCollectedAt.getTime()) / 1000));
  const factor = workerFactor(building.assignedWorkers, def.workersNeeded);
  if (factor <= 0) return { cycles: 0n, blockedBy: 'workers' };

  const factorScaled = BigInt(Math.round(factor * 10000));
  const prodBps = BigInt(mods.productionBps);
  const throughputBps = BigInt(mods.throughputBps);
  let outputBps = prodBps;
  if (def.output.kind === 'WHEAT' && def.inputs.length === 0) {
    outputBps = (prodBps * BigInt(mods.wheatPenaltyBps)) / 10000n;
  }

  // cycles = elapsed / cycleSec * factor * (prodBps/10000) * (throughputBps/10000)
  const timeCycles =
    (BigInt(elapsedSec) * factorScaled * outputBps * throughputBps) /
    (BigInt(def.cycleSeconds) * 10000n * 10000n * 10000n);

  if (timeCycles <= 0n) return { cycles: 0n, blockedBy: 'none' };

  let limit = timeCycles;
  for (const input of def.inputs) {
    const stock = getResource(resources, input.kind);
    const possible = stock / input.qty;
    if (possible < limit) limit = possible;
  }
  if (def.energyPerCycle > 0n) {
    const perCycle = (def.energyPerCycle * BigInt(mods.energyCostBps)) / 10000n;
    if (perCycle > 0n) {
      const possible = getResource(resources, 'ENERGY') / perCycle;
      if (possible < limit) limit = possible;
    }
  }
  if (limit <= 0n) return { cycles: 0n, blockedBy: 'inputs' };
  return { cycles: limit, blockedBy: 'none' };
}

/** Apply cycles to the in-memory resource map and build the report entry. */
export function applyCycles(
  building: Pick<Building, 'id' | 'kind' | 'level' | 'assignedWorkers' | 'lastCollectedAt'>,
  resources: ResourceMap,
  mods: EngineModifiers,
  now: Date,
): AccrualBuildingReport {
  const def = BUILDING_MAP.get(building.kind);
  const report: AccrualBuildingReport = {
    buildingId: building.id,
    kind: building.kind,
    cycles: 0,
    produced: {},
    consumed: {},
    blockedBy: 'none',
  };
  if (!def) return report;

  const { cycles, blockedBy } = computeCycles(building, resources, mods, now);
  report.blockedBy = blockedBy;
  if (cycles <= 0n) return report;

  for (const input of def.inputs) {
    const consumed = input.qty * cycles;
    addResource(resources, input.kind, -consumed);
    report.consumed[input.kind] = consumed;
  }
  if (def.energyPerCycle > 0n) {
    const energyUsed = (def.energyPerCycle * BigInt(mods.energyCostBps) * cycles) / 10000n;
    addResource(resources, 'ENERGY', -energyUsed);
    report.consumed.ENERGY = energyUsed;
  }
  const produced = def.output.qty * cycles * BigInt(building.level);
  addResource(resources, def.output.kind, produced);
  report.produced[def.output.kind] = produced;
  report.cycles = Number(cycles);
  return report;
}

/** Persist the accrued resource map inside a transaction; rejects negatives. */
export async function persistResources(
  tx: Prisma.TransactionClient,
  playerId: string,
  resources: ResourceMap,
): Promise<void> {
  for (const [kind, qty] of resources) {
    if (qty < 0n) throw new Error(`NEGATIVE_RESOURCE:${kind}`);
    await tx.resource.upsert({
      where: { playerId_kind: { playerId, kind } },
      create: { playerId, kind, qty },
      update: { qty },
    });
  }
}
