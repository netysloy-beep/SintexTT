import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { validateInitData, parseReferral } from '../src/lib/initdata.js';

const BOT_TOKEN = '123456789:TEST-TOKEN-abcdef';

function makeInitData(params: Record<string, string>, authDate: Date, botToken = BOT_TOKEN): string {
  const withHash = { ...params, auth_date: String(Math.floor(authDate.getTime() / 1000)) };
  const pairs = Object.entries(withHash)
    .filter(([k]) => k !== 'hash')
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(pairs).digest('hex');
  const url = new URLSearchParams(withHash);
  url.set('hash', hash);
  return url.toString();
}

const USER = JSON.stringify({ id: 42, first_name: 'Nety', username: 'nety' });

describe('validateInitData', () => {
  it('accepts fresh, correctly signed initData', () => {
    const data = makeInitData({ user: USER, start_param: 'ref_7' }, new Date());
    const res = validateInitData(data, BOT_TOKEN, 24);
    expect(res.user.id).toBe(42);
    expect(res.startParam).toBe('ref_7');
  });

  it('rejects a tampered payload (hash mismatch)', () => {
    const data = makeInitData({ user: USER }, new Date());
    const tampered = data.replace('first_name', 'first_namX');
    expect(() => validateInitData(tampered, BOT_TOKEN, 24)).toThrow('INVALID_HASH');
  });

  it('rejects data signed with another bot token', () => {
    const data = makeInitData({ user: USER }, new Date(), '999:OTHER');
    expect(() => validateInitData(data, BOT_TOKEN, 24)).toThrow('INVALID_HASH');
  });

  it('rejects expired initData', () => {
    const old = new Date(Date.now() - 48 * 3600 * 1000);
    const data = makeInitData({ user: USER }, old);
    expect(() => validateInitData(data, BOT_TOKEN, 24)).toThrow('EXPIRED_INIT_DATA');
  });

  it('rejects bots and malformed users', () => {
    const botUser = JSON.stringify({ id: 42, is_bot: true });
    const data = makeInitData({ user: botUser }, new Date());
    expect(() => validateInitData(data, BOT_TOKEN, 24)).toThrow('BOT_NOT_ALLOWED');
  });
});

describe('parseReferral', () => {
  it('parses ref_ ids', () => {
    expect(parseReferral('ref_12345')).toBe('12345');
    expect(parseReferral('refnope')).toBeNull();
    expect(parseReferral(undefined)).toBeNull();
  });
});
