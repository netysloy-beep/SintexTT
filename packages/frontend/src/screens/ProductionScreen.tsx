import { useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { useStore } from '../store.js';
import { Button, Card, Screen, Badge, ErrorState, Loading } from '../components/ui.js';
import { formatMoney, formatQty } from '../lib/format.js';
import { haptic } from '../lib/telegram.js';

export default function ProductionScreen() {
  const { state, refresh } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!state) return <Loading />;
  const { buildings, resources, catalog, player } = state;
  const defByKind = new Map(catalog.buildings.map((b) => [b.kind, b]));

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      haptic();
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка запроса');
    } finally {
      setBusy(null);
    }
  };

  const freeWorkers = player.workers - player.workersAssigned;

  return (
    <Screen title="Производство">
      <Card>
        <div className="flex items-center justify-between text-sm">
          <span>👷 Рабочие: {player.workersAssigned}/{player.workers}</span>
          <Badge tone={freeWorkers > 0 ? 'good' : 'warn'}>Свободно: {freeWorkers}</Badge>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span>🚚 Грузовики: {player.trucksBusy}/{player.trucks}</span>
          <Button variant="ghost" onClick={() => act('collect', () => api.post('/collect'))} disabled={busy === 'collect'}>
            Собрать всё
          </Button>
        </div>
      </Card>

      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      <Card>
        <h2 className="mb-2 font-semibold">Ресурсы</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {resources.map((r) => (
            <div key={r.kind} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-700">
              <span>{r.label}</span>
              <span className="font-semibold">{formatQty(r.qty)}</span>
            </div>
          ))}
        </div>
      </Card>

      {buildings.length === 0 && (
        <Card className="text-center text-sm text-slate-500">Постройте первое здание из списка ниже.</Card>
      )}

      {buildings.map((b) => {
        const def = defByKind.get(b.kind);
        if (!def) return null;
        return (
          <Card key={b.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{def.name} · ур. {b.level}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{def.description}</p>
                <p className="mt-1 text-xs">
                  Цикл {def.cycleSeconds}с → {formatQty(def.output.qty)} {def.output.kind}
                  {def.inputs.length > 0 && ` (нужно: ${def.inputs.map((i) => `${formatQty(i.qty)} ${i.kind}`).join(', ')})`}
                </p>
              </div>
              <Badge tone={b.assignedWorkers >= b.workersNeeded ? 'good' : 'bad'}>
                {b.assignedWorkers}/{b.workersNeeded} 👷
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...Array(def.workersNeeded + 1).keys()].map((n) => (
                <Button
                  key={n}
                  variant={b.assignedWorkers === n ? 'primary' : 'ghost'}
                  className="!px-3 !py-1"
                  disabled={busy === `assign-${b.id}` || n > freeWorkers + b.assignedWorkers}
                  onClick={() => act(`assign-${b.id}`, () => api.post(`/buildings/${b.id}/assign`, { count: n }))}
                >
                  {n}👷
                </Button>
              ))}
            </div>
            <div className="mt-3">
              <Button
                variant="ghost"
                disabled={busy === `up-${b.id}` || b.level >= def.maxLevel}
                onClick={() => act(`up-${b.id}`, () => api.post(`/buildings/${b.id}/upgrade`))}
              >
                {b.level >= def.maxLevel ? 'Максимум' : 'Улучшить'}
              </Button>
            </div>
          </Card>
        );
      })}

      <h2 className="font-semibold">Построить новое</h2>
      {catalog.buildings.map((def) => {
        const owned = buildings.filter((b) => b.kind === def.kind).length;
        const cost = BigInt(def.baseCost) * BigInt(owned + 1);
        const affordable = BigInt(player.money) >= cost;
        return (
          <Card key={def.kind}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{def.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{def.description}</p>
                <p className="mt-1 text-sm font-semibold">💰 {formatMoney(cost.toString())}</p>
              </div>
              <Button
                disabled={!affordable || busy === `build-${def.kind}`}
                onClick={() => act(`build-${def.kind}`, () => api.post('/buildings', { kind: def.kind }))}
              >
                Построить
              </Button>
            </div>
          </Card>
        );
      })}
    </Screen>
  );
}
