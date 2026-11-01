import { describe, expect, it } from 'vitest';
import { applyCycles, computeCycles, NEUTRAL_MODIFIERS, type ResourceMap } from '../src/economy/engine.js';

function farm(assigned: number, minutesAgo: number, level = 1) {
  return {
    id: 'b1',
    kind: 'farm',
    level,
    assignedWorkers: assigned,
    lastCollectedAt: new Date(Date.now() - minutesAgo * 60 * 1000),
  };
}

describe('computeCycles', () => {
  it('produces ~4 wheat per minute at full staffing', () => {
    const res: ResourceMap = new Map();
    const { cycles } = computeCycles(farm(2, 10), res, NEUTRAL_MODIFIERS, new Date());
    expect(cycles).toBe(10n); // 600s / 60s per cycle
  });

  it('halts without workers', () => {
    const { cycles, blockedBy } = computeCycles(farm(0, 10), new Map(), NEUTRAL_MODIFIERS, new Date());
    expect(cycles).toBe(0n);
    expect(blockedBy).toBe('workers');
  });

  it('limits cycles by input stock (mill needs 2 wheat per cycle)', () => {
    const mill = {
      id: 'b2', kind: 'mill', level: 1, assignedWorkers: 2,
      lastCollectedAt: new Date(Date.now() - 60 * 60 * 1000),
    };
    const res: ResourceMap = new Map([['WHEAT', 5n]]); // only 2 full cycles possible
    const { cycles, blockedBy } = computeCycles(mill, res, NEUTRAL_MODIFIERS, new Date());
    expect(cycles).toBe(2n);
    expect(blockedBy).toBe('none');
  });

  it('limits cycles by energy stock', () => {
    const mill = {
      id: 'b3', kind: 'mill', level: 1, assignedWorkers: 2,
      lastCollectedAt: new Date(Date.now() - 60 * 60 * 1000),
    };
    const res: ResourceMap = new Map([['WHEAT', 1000n], ['ENERGY', 3n]]);
    const { cycles } = computeCycles(mill, res, NEUTRAL_MODIFIERS, new Date());
    expect(cycles).toBe(3n);
  });

  it('applies drought penalty only to raw wheat production', () => {
    const drought = { ...NEUTRAL_MODIFIERS, wheatPenaltyBps: 5000 };
    const { cycles } = computeCycles(farm(2, 10), new Map(), drought, new Date());
    expect(cycles).toBe(5n); // 50% of 10
  });

  it('level multiplies output quantity, not cycles', () => {
    const res: ResourceMap = new Map();
    const report = applyCycles(farm(2, 10, 3), res, NEUTRAL_MODIFIERS, new Date());
    expect(report.cycles).toBe(10);
    expect(report.produced.WHEAT).toBe(4n * 10n * 3n);
    expect(res.get('WHEAT')).toBe(120n);
  });

  it('consumes inputs and energy when producing', () => {
    const mill = {
      id: 'b4', kind: 'mill', level: 1, assignedWorkers: 2,
      lastCollectedAt: new Date(Date.now() - 90 * 1000),
    };
    const res: ResourceMap = new Map([['WHEAT', 10n], ['ENERGY', 10n]]);
    const report = applyCycles(mill, res, NEUTRAL_MODIFIERS, new Date());
    expect(report.cycles).toBe(1);
    expect(res.get('WHEAT')).toBe(8n);
    expect(res.get('ENERGY')).toBe(9n);
    expect(res.get('FLOUR')).toBe(2n);
  });
});
