import { useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.js';
import { Badge, Button, Card, ErrorState, Loading, Screen } from '../components/ui.js';
import { formatMoney } from '../lib/format.js';

interface ProfileResponse {
  techs: { owned: string[] };
}

export default function UpgradesScreen() {
  const { state } = useStore();
  const [owned, setOwned] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get<ProfileResponse>('/profile');
      setOwned(res.techs.owned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  };

  if (!state) return <Loading />;
  if (owned === null && error === null) {
    void load();
    return <Loading />;
  }
  if (owned === null) return <Screen title="Технологии"><ErrorState message={error ?? ''} onRetry={() => setError(null)} /></Screen>;

  const unlock = async (techId: string) => {
    setBusy(techId);
    setError(null);
    try {
      await api.post(`/techs/${techId}/unlock`);
      const res = await api.get<ProfileResponse>('/profile');
      setOwned(res.techs.owned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка запроса');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Технологии">
      {error && <ErrorState message={error} onRetry={() => setError(null)} />}
      {state.catalog.techs.map((t) => {
        const isOwned = owned.includes(t.techId);
        const missing = t.requires.filter((r) => !owned.includes(r));
        const affordable = BigInt(state.player.money) >= BigInt(t.cost);
        return (
          <Card key={t.techId}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{t.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                <p className="mt-1 text-sm">💰 {formatMoney(t.cost)}</p>
                {t.requires.length > 0 && (
                  <p className="mt-1 text-xs text-slate-400">Требует: {t.requires.join(', ')}</p>
                )}
              </div>
              {isOwned ? (
                <Badge tone="good">Изучено</Badge>
              ) : (
                <Button disabled={busy === t.techId || missing.length > 0 || !affordable} onClick={() => void unlock(t.techId)}>
                  Изучить
                </Button>
              )}
            </div>
            {missing.length > 0 && <p className="mt-2 text-xs text-amber-600">Сначала изучьте: {missing.join(', ')}</p>}
          </Card>
        );
      })}
    </Screen>
  );
}
