import { describe, expect, it } from 'vitest';
import { addSpread, subSpread, applyBps, floorZero, ratioBps } from '../src/lib/money.js';

describe('money math (BigInt cents)', () => {
  it('addSpread adds the given bps with ceil', () => {
    expect(addSpread(100n, 800)).toBe(108n); // +8%
    expect(addSpread(101n, 800)).toBe(110n); // 109.08 -> ceil
  });

  it('subSpread subtracts the given bps with floor', () => {
    expect(subSpread(100n, 800)).toBe(92n); // -8%
    expect(subSpread(99n, 800)).toBe(91n); // 91.08 -> floor
  });

  it('applyBps floors', () => {
    expect(applyBps(1000n, 1500)).toBe(150n);
    expect(applyBps(999n, 1000)).toBe(99n);
  });

  it('floorZero clamps negatives', () => {
    expect(floorZero(-5n)).toBe(0n);
    expect(floorZero(5n)).toBe(5n);
  });

  it('ratioBps handles zero whole', () => {
    expect(ratioBps(1n, 0n)).toBe(0);
    expect(ratioBps(1n, 4n)).toBe(2500);
  });
});
