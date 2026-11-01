/**
 * All money is stored as BigInt cents. Resources are BigInt pieces.
 * Arithmetic helpers below never use floating point for balances.
 */

/** Multiply a price-per-unit by a quantity (both BigInt). */
export function mulQty(pricePerUnit: bigint, qty: bigint): bigint {
  return pricePerUnit * qty;
}

/** Apply a percentage (in basis points, 10000 = 100%) to an amount, rounded down. */
export function applyBps(amount: bigint, bps: number): bigint {
  return (amount * BigInt(Math.trunc(bps))) / 10000n;
}

/** Add a spread (basis points) to a price for buying: ceil. */
export function addSpread(price: bigint, bps: number): bigint {
  return (price * (10000n + BigInt(Math.trunc(bps)))) / 10000n + ((price * (10000n + BigInt(Math.trunc(bps)))) % 10000n === 0n ? 0n : 1n);
}

/** Subtract a spread (basis points) from a price for selling: floor. */
export function subSpread(price: bigint, bps: number): bigint {
  return (price * (10000n - BigInt(Math.trunc(bps)))) / 10000n;
}

/** Clamp a value to a minimum (used to prevent negative balances). */
export function floorZero(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

/** Ratio as basis points: part/whole*10000, integer. */
export function ratioBps(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number((part * 10000n) / whole);
}
