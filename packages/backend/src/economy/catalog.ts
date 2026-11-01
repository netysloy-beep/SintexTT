export type ResourceKind = 'WHEAT' | 'FLOUR' | 'BREAD' | 'WOOD' | 'PLANKS' | 'FURNITURE' | 'ENERGY';

export const RESOURCE_KINDS: readonly ResourceKind[] = [
  'WHEAT', 'FLOUR', 'BREAD', 'WOOD', 'PLANKS', 'FURNITURE', 'ENERGY',
] as const;

export const RESOURCE_LABELS: Record<ResourceKind, string> = {
  WHEAT: 'Пшеница',
  FLOUR: 'Мука',
  BREAD: 'Хлеб',
  WOOD: 'Древесина',
  PLANKS: 'Доски',
  FURNITURE: 'Мебель',
  ENERGY: 'Энергия',
};

/** Base market prices in cents per unit. */
export const BASE_PRICES: Record<ResourceKind, bigint> = {
  WHEAT: 30n,
  FLOUR: 80n,
  BREAD: 200n,
  WOOD: 25n,
  PLANKS: 70n,
  FURNITURE: 250n,
  ENERGY: 40n,
};

export interface BuildingDef {
  kind: string;
  name: string;
  description: string;
  baseCost: bigint; // cents
  costGrowthBps: number; // price growth per level, basis points (16000 = x1.6)
  maxLevel: number;
  cycleSeconds: number;
  workersNeeded: number;
  output: { kind: ResourceKind; qty: bigint };
  inputs: { kind: ResourceKind; qty: bigint }[];
  energyPerCycle: bigint;
}

export const BUILDINGS: BuildingDef[] = [
  {
    kind: 'farm', name: 'Ферма', description: 'Выращивает пшеницу — основа всех цепочек.',
    baseCost: 50000n, costGrowthBps: 16000, maxLevel: 10, cycleSeconds: 60, workersNeeded: 2,
    output: { kind: 'WHEAT', qty: 4n }, inputs: [], energyPerCycle: 0n,
  },
  {
    kind: 'mill', name: 'Мельница', description: 'Пшеница → Мука. Потребляет энергию.',
    baseCost: 90000n, costGrowthBps: 17000, maxLevel: 10, cycleSeconds: 90, workersNeeded: 2,
    output: { kind: 'FLOUR', qty: 2n }, inputs: [{ kind: 'WHEAT', qty: 2n }], energyPerCycle: 1n,
  },
  {
    kind: 'bakery', name: 'Пекарня', description: 'Мука → Хлеб. Самый маржинальный продукт.',
    baseCost: 160000n, costGrowthBps: 18000, maxLevel: 10, cycleSeconds: 120, workersNeeded: 3,
    output: { kind: 'BREAD', qty: 1n }, inputs: [{ kind: 'FLOUR', qty: 2n }], energyPerCycle: 2n,
  },
  {
    kind: 'lumberCamp', name: 'Лесопилка', description: 'Заготавливает древесину.',
    baseCost: 45000n, costGrowthBps: 16000, maxLevel: 10, cycleSeconds: 60, workersNeeded: 2,
    output: { kind: 'WOOD', qty: 5n }, inputs: [], energyPerCycle: 0n,
  },
  {
    kind: 'plankMill', name: 'Пильный цех', description: 'Древесина → Доски. Потребляет энергию.',
    baseCost: 85000n, costGrowthBps: 17000, maxLevel: 10, cycleSeconds: 90, workersNeeded: 2,
    output: { kind: 'PLANKS', qty: 2n }, inputs: [{ kind: 'WOOD', qty: 2n }], energyPerCycle: 1n,
  },
  {
    kind: 'workshop', name: 'Мастерская', description: 'Доски → Мебель. Люкс-товар.',
    baseCost: 150000n, costGrowthBps: 18000, maxLevel: 10, cycleSeconds: 150, workersNeeded: 3,
    output: { kind: 'FURNITURE', qty: 1n }, inputs: [{ kind: 'PLANKS', qty: 2n }], energyPerCycle: 3n,
  },
  {
    kind: 'powerPlant', name: 'Электростанция', description: 'Даёт энергию для переработки.',
    baseCost: 70000n, costGrowthBps: 16500, maxLevel: 10, cycleSeconds: 60, workersNeeded: 1,
    output: { kind: 'ENERGY', qty: 6n }, inputs: [], energyPerCycle: 0n,
  },
];

export const BUILDING_MAP = new Map(BUILDINGS.map((b) => [b.kind, b]));

export interface TechDef {
  techId: string;
  name: string;
  description: string;
  cost: bigint; // cents
  requires: string[];
}

export const TECHS: TechDef[] = [
  {
    techId: 'automation', name: 'Автоматизация', description: '+25% к производству всех зданий.',
    cost: 400000n, requires: [],
  },
  {
    techId: 'hr', name: 'HR-отдел', description: '+2 рабочих.',
    cost: 250000n, requires: [],
  },
  {
    techId: 'logistics', name: 'Логистика', description: '+1 грузовик.',
    cost: 300000n, requires: [],
  },
  {
    techId: 'insulation', name: 'Энергоэффективность', description: '-25% потребление энергии.',
    cost: 350000n, requires: ['automation'],
  },
  {
    techId: 'trading', name: 'Трейдинг', description: 'Спред рынка снижен с 8% до 4%.',
    cost: 500000n, requires: ['logistics'],
  },
];

export const TECH_MAP = new Map(TECHS.map((t) => [t.techId, t]));

export interface BoosterDef {
  boosterId: string;
  name: string;
  description: string;
  durationHours: number;
}

export const BOOSTERS: BoosterDef[] = [
  {
    boosterId: 'golden_gear', name: 'Золотая шестерня',
    description: '+50% к производству всех зданий на 24 часа.',
    durationHours: 24,
  },
  {
    boosterId: 'market_oracle', name: 'Оракул рынка',
    description: 'Спред рынка 1% на 24 часа.',
    durationHours: 24,
  },
  {
    boosterId: 'union_charm', name: 'Талисман союза',
    description: '+2 грузовика на 24 часа.',
    durationHours: 24,
  },
];

export const BOOSTER_MAP = new Map(BOOSTERS.map((b) => [b.boosterId, b]));

/** Upgrade cost of a building to the next level (cents). */
export function upgradeCost(def: BuildingDef, currentLevel: number): bigint {
  // baseCost * (1 + growth)^ (level-1); growth in bps, integer BigInt math.
  const growth = BigInt(def.costGrowthBps);
  let factor = 10000n;
  for (let i = 1; i < currentLevel; i += 1) factor = (factor * (10000n + growth)) / 10000n;
  return (def.baseCost * factor) / 10000n;
}
