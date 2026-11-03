import { Prisma, type Contract, type Player } from '@prisma/client';
import { BUILDING_MAP, RESOURCE_KINDS, type ResourceKind } from './catalog.js';
import { addSpread } from '../lib/money.js';

export const OFFER_TTL_MINUTES = 90; // unaccepted offers expire
export const ACTIVE_WINDOW_MINUTES = 45; // delivery window after accept

function pickRandom<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

/** Resources the player can actually produce with their buildings (raw fallback). */
async function producibleKinds(tx: Prisma.TransactionClient, playerId: string): Promise<ResourceKind[]> {
  const buildings = await tx.building.findMany({ where: { playerId } });
  const set = new Set<ResourceKind>();
  for (const b of buildings) {
    const def = BUILDING_MAP.get(b.kind);
    if (def) set.add(def.output.kind);
  }
  const pool = [...set].filter((k) => k !== 'ENERGY');
  if (pool.length === 0) return ['WHEAT', 'WOOD'];
  return pool;
}

/** Generate up to 2 fresh contract offers for a player inside a tx. */
export async function generateOffers(
  tx: Prisma.TransactionClient,
  player: Player,
  now: Date,
  rng: () => number = Math.random,
): Promise<Contract[]> {
  // Drop offers the player cannot possibly fulfil (e.g. after losing buildings).
  const pool = await producibleKinds(tx, player.id);
  await tx.contract.deleteMany({
    where: { playerId: player.id, status: 'OFFERED', resource: { notIn: pool } },
  });

  const openCount = await tx.contract.count({
    where: { playerId: player.id, status: 'OFFERED' },
  });
  if (openCount >= 2) return [];

  const created: Contract[] = [];
  for (let i = openCount; i < 2; i += 1) {
    const resource = pickRandom(pool, rng);
    const qty = 20n + BigInt(Math.floor(rng() * 60)); // 20..80 units
    // Reward: slightly above the sell price of the resource (~15% premium).
    const priceRow = await tx.marketPrice.findUnique({ where: { kind: resource } });
    const marketPrice = priceRow?.price ?? 50n;
    const unit = addSpread(marketPrice, 1500); // premium to sell price
    const reward = unit * qty;
    const penalty = (reward * 4000n) / 10000n; // 40% of reward
    created.push(
      await tx.contract.create({
        data: {
          playerId: player.id,
          resource,
          qty,
          reward,
          penalty,
          status: 'OFFERED',
          deadline: new Date(now.getTime() + OFFER_TTL_MINUTES * 60 * 1000),
        },
      }),
    );
  }
  return created;
}

export async function acceptContract(
  tx: Prisma.TransactionClient,
  player: Player,
  contract: Contract,
  busyTrucks: number,
  totalTrucks: number,
  now: Date,
): Promise<void> {
  if (contract.status !== 'OFFERED') throw new Error('CONTRACT_NOT_OFFERED');
  if (contract.deadline <= now) throw new Error('CONTRACT_EXPIRED');
  if (busyTrucks >= totalTrucks) throw new Error('NO_FREE_TRUCKS');
  await tx.contract.update({
    where: { id: contract.id },
    data: {
      status: 'ACTIVE',
      truckLocked: true,
      deadline: new Date(now.getTime() + ACTIVE_WINDOW_MINUTES * 60 * 1000),
    },
  });
}

export async function deliverContract(
  tx: Prisma.TransactionClient,
  contract: Contract,
  resources: Map<string, bigint>,
): Promise<void> {
  if (contract.status !== 'ACTIVE') throw new Error('CONTRACT_NOT_ACTIVE');
  const stock = resources.get(contract.resource) ?? 0n;
  if (stock < contract.qty) throw new Error('INSUFFICIENT_STOCK');
  resources.set(contract.resource, stock - contract.qty);
  await tx.contract.update({
    where: { id: contract.id },
    data: { status: 'DELIVERED', truckLocked: false, deliveredQty: contract.qty },
  });
}

/** Worker: resolve ACTIVE past deadline as FAILED, stale OFFERED as EXPIRED. */
export async function resolveContracts(tx: Prisma.TransactionClient, now: Date): Promise<number> {
  const staleActive = await tx.contract.findMany({
    where: { status: 'ACTIVE', deadline: { lte: now } },
    take: 500,
  });
  for (const c of staleActive) {
    const player = await tx.player.findUnique({ where: { id: c.playerId } });
    if (player) {
      const charge = player.money >= c.penalty ? c.penalty : player.money;
      await tx.player.update({ where: { id: player.id }, data: { money: player.money - charge } });
    }
    await tx.contract.update({ where: { id: c.id }, data: { status: 'FAILED', truckLocked: false } });
  }
  const staleOffers = await tx.contract.updateMany({
    where: { status: 'OFFERED', deadline: { lte: now } },
    data: { status: 'EXPIRED' },
  });
  return staleActive.length + staleOffers.count;
}
