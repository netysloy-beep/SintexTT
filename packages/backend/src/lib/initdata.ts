import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: Date;
  startParam?: string;
}

function parseInitData(initData: string): URLSearchParams {
  return new URLSearchParams(initData);
}

/**
 * Validate Telegram WebApp initData per official spec:
 * secret_key = HMAC_SHA256(bot_token, "WebAppData");
 * expected   = hex(HMAC_SHA256(data_check_string, secret_key)).
 * Also rejects bots and data older than maxAgeHours.
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeHours: number,
  now: Date = new Date(),
): ValidatedInitData {
  const params = parseInitData(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    throw new Error('INVALID_HASH');
  }

  // data_check_string: ALL fields except hash (including signature), sorted, joined by \n.
  // Per the official Telegram spec example: delete only 'hash' from the params.
  const params2 = new URLSearchParams(initData);
  params2.delete('hash');
  const dataCheckString = [...params2.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('INVALID_HASH');
  }

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw) throw new Error('MISSING_AUTH_DATE');
  const authDate = new Date(Number.parseInt(authDateRaw, 10) * 1000);
  if (Number.isNaN(authDate.getTime())) throw new Error('INVALID_AUTH_DATE');

  const ageMs = now.getTime() - authDate.getTime();
  if (ageMs < -5 * 60 * 1000 || ageMs > maxAgeHours * 3600 * 1000) {
    throw new Error('EXPIRED_INIT_DATA');
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new Error('MISSING_USER');
  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    throw new Error('INVALID_USER');
  }
  if (typeof user.id !== 'number' || !Number.isInteger(user.id) || user.id <= 0) {
    throw new Error('INVALID_USER');
  }
  if (user.is_bot) throw new Error('BOT_NOT_ALLOWED');

  return { user, authDate, startParam: params.get('start_param') ?? undefined };
}

/** Extract referral payload from a bot deep-link start param like "ref_12345". */
export function parseReferral(startParam: string | undefined): string | null {
  if (!startParam) return null;
  const match = /^ref_(\d{1,20})$/.exec(startParam);
  return match ? match[1]! : null;
}
