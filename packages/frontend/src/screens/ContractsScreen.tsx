import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.js';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Screen } from '../components/ui.js';
import { formatMoney, formatQty, formatTimeLeft } from '../lib/format.js';

interface ContractsResponse {
  trucksTotal: number;
  trucksBusy: number;
  offers: ContractDto[];
  active: ContractDto[];
  recent: ContractDto[];
}

interface ContractDto {
  id: string;
  resource: string;
  qty: string;
  reward: string;
  penalty: string;
  status: string;
  deadline: string;
}

export default function ContractsScreen() {
  const { state, refresh } = useStore();
  const [data, setData] = useState<ContractsResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<ContractsResponse>('/contracts'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки контрактов');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state || !data) return <Loading />;
  const labels: Record<string, string> = Object.fromEntries(state.resources.map((r) => [r.kind, r.label]));
  const stockByKind: Record<string, bigint> = Object.fromEntries(
    state.resources.map((r) => [r.kind, BigInt(r.qty)]),
  );

  const act = async (id: string, action: 'accept' | 'deliver') => {
    setBusy(id);
    setError(null);
    try {
      await api.post(`/contracts/${id}/${action}`);
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка запроса');
    } finally {
      setBusy(null);
    }
  };

  const contractCard = (c: ContractDto, mode: 'offer' | 'active' | 'recent') => (
    <Card key={c.id}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">
            {labels[c.resource] ?? c.resource} × {formatQty(c.qty)}
          </p>
          <p className="text-sm text-emerald-600">Награда: {formatMoney(c.reward)}</p>
          <p className="text-sm text-rose-500">Штраф за срыв: {formatMoney(c.penalty)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Дедлайн: {formatTimeLeft(c.deadline)}
          </p>
        </div>
        {mode === 'offer' && (
          <Button disabled={busy === c.id} onClick={() => void act(c.id, 'accept')}>Взять</Button>
        )}
        {mode === 'active' && (
          <Button
            disabled={busy === c.id || (stockByKind[c.resource] ?? 0n) < BigInt(c.qty)}
            onClick={() => void act(c.id, 'deliver')}
          >
            Доставить
          </Button>
        )}
        {mode === 'recent' && (
          <Badge tone={c.status === 'DELIVERED' ? 'good' : 'bad'}>
            {c.status === 'DELIVERED' ? 'Выполнен' : c.status === 'FAILED' ? 'Провален' : 'Истёк'}
          </Badge>
        )}
      </div>
    </Card>
  );

  return (
    <Screen title="Контракты">
      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      <Card>
        <p className="text-sm">
          🚚 Грузовики: {data.trucksBusy}/{data.trucksTotal} занято
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Каждый активный контракт занимает один грузовик до доставки.
        </p>
      </Card>

      <h2 className="font-semibold">Активные</h2>
      {data.active.length === 0 && <EmptyState title="Нет активных контрактов" hint="Возьмите предложение из списка ниже." />}
      {data.active.map((c) => contractCard(c, 'active'))}

      <h2 className="font-semibold">Предложения</h2>
      {data.offers.length === 0 && <EmptyState title="Предложений нет" hint="Новые предложения появляются каждые 2 часа." />}
      {data.offers.map((c) => contractCard(c, 'offer'))}

      {data.recent.length > 0 && (
        <>
          <h2 className="font-semibold">История</h2>
          {data.recent.map((c) => contractCard(c, 'recent'))}
        </>
      )}
    </Screen>
  );
}
