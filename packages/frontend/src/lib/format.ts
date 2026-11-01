/** Money comes as BigInt-string cents; render with 2 decimals. */
export function formatMoney(cents: string | number): string {
  const value = typeof cents === 'bigint' ? cents : BigInt(cents);
  const abs = value < 0n ? -value : value;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  const sign = value < 0n ? '-' : '';
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${wholeStr},${frac}`;
}

export function formatMoneyShort(cents: string): string {
  const value = BigInt(cents);
  if (value >= 100000000n) return `${(Number(value / 1000000n) / 100).toFixed(1)}M`;
  if (value >= 100000n) return `${(Number(value / 100n)).toFixed(0)}`;
  return formatMoney(cents);
}

export function formatQty(qty: string): string {
  return BigInt(qty).toString();
}

export function formatTimeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'истекло';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч ${minutes % 60} мин`;
}
