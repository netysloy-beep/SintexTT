import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, authInit, getToken, type FullStateResponse } from './lib/api.js';
import { getInitData } from './lib/telegram.js';

export type Phase = 'boot' | 'no-telegram' | 'auth-error' | 'ready';

interface StoreValue {
  phase: Phase;
  error: string | null;
  state: FullStateResponse | null;
  refresh: () => Promise<void>;
  loading: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('boot');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<FullStateResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await api.get<FullStateResponse>('/state');
      setState(fresh);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const initData = getInitData();
      if (!initData && !getToken()) {
        if (!cancelled) setPhase('no-telegram');
        return;
      }
      try {
        if (initData) await authInit(initData);
        else if (!getToken()) throw new Error('NO_TOKEN');
        await refresh();
        if (!cancelled) setPhase('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setPhase('auth-error');
        }
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const value = useMemo<StoreValue>(
    () => ({ phase, error, state, refresh, loading }),
    [phase, error, state, refresh, loading],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
