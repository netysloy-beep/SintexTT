const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

const TOKEN_KEY = 'econ_token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Exchange Telegram initData for a session token. */
export async function authInit(initData: string): Promise<void> {
  const res = await request<{ token: string }>('POST', '/auth/init', { initData });
  setToken(res.token);
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method === 'POST') headers['Idempotency-Key'] = idempotencyKey();

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      if (data.error) code = data.error;
      if (data.message) message = data.message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
};

/** Shared API response shapes used across screens. */
export interface FullStateResponse {
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
  buildings: { id: string; kind: string; level: number; assignedWorkers: number; workersNeeded: number }[];
  catalog: {
    buildings: { kind: string; name: string; description: string; baseCost: string; cycleSeconds: number; workersNeeded: number; output: { kind: string; qty: string }; inputs: { kind: string; qty: string }[]; energyPerCycle: string; maxLevel: number }[];
    techs: { techId: string; name: string; description: string; cost: string; requires: string[] }[];
    boosters: { boosterId: string; name: string; description: string; durationHours: number }[];
  };
}
