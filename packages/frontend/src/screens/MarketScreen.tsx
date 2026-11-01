import { useCallback, useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import { useStore } from '../store.js';
import { Button, Card, ErrorState, Loading, Screen } from '../components/ui.js';
import { formatMoney } from '../lib/format.js';

interface MarketResponse {
  spreadBps: number;
  money: string;
  prices: { kind: string; price: string; history: { t: string; price: string }[] }[];
}

interface ResourceLabels {
  [kind: string]: string;
}

export default function MarketScreen() {
  const { state, refresh } = useStore();
  const [data, setData] = useState<MarketResponse | null>(null);
  const [selected, setSelected] = useState<string>('WHEAT');
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<MarketResponse>('/market'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки рынка');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (!state || !data) return <Loading />;
  const labels: ResourceLabels = Object.fromEntries(state.resources.map((r) => [r.kind, r.label]));
  const current = data.prices.find((p) => p.kind === selected) ?? data.prices[0];
  if (!current) {
    return <Screen title="Рынок"><Loading /></Screen>;
  }

  const chartData = current.history.slice(-30).map((h) => ({
    t: new Date(h.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    price: Number(h.price) / 100,
  }));

  const spread = data.spreadBps / 100;
  const price = BigInt(current.price);
  const buyUnit = price + (price * BigInt(data.spreadBps)) / 10000n + 1n;
  const sellUnit = price - (price * BigInt(data.spreadBps)) / 10000n;
  const money = BigInt(data.money);

  const trade = async (side: 'buy' | 'sell') => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/market/trade', { kind: selected, qty, side });
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сделки');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Рынок">
      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      <div className="flex flex-wrap gap-2">
        {data.prices.map((p) => (
          <Button
            key={p.kind}
            variant={p.kind === selected ? 'primary' : 'ghost'}
            className="!px-3 !py-1"
            onClick={() => setSelected(p.kind)}
          >
            {labels[p.kind] ?? p.kind}
          </Button>
        ))}
      </div>

      <Card>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {labels[current.kind] ?? current.kind} · спред {spread}%
        </p>
        <p className="text-2xl font-bold">💰 {formatMoney(current.price)}</p>
        <div className="mt-2 h-40">
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={40} />
                <Tooltip formatter={(v: number) => v.toFixed(2)} />
                <Line type="monotone" dataKey="price" stroke="#1e8fff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="pt-16 text-center text-sm text-slate-400">Накапливаем историю цен…</p>
          )}
        </div>
      </Card>

      <Card>
        <p className="text-sm">Количество: {qty}</p>
        <input
          type="range"
          min={1}
          max={200}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="mt-2 w-full accent-brand-500"
          aria-label="Количество"
        />
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700">
            <p>Покупка</p>
            <p className="font-semibold">≈ {formatMoney((buyUnit * BigInt(qty)).toString())}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700">
            <p>Продажа</p>
            <p className="font-semibold">≈ {formatMoney((sellUnit * BigInt(qty)).toString())}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            className="flex-1"
            disabled={busy || money < buyUnit * BigInt(qty)}
            onClick={() => void trade('buy')}
          >
            Купить
          </Button>
          <Button variant="danger" className="flex-1" disabled={busy} onClick={() => void trade('sell')}>
            Продать
          </Button>
        </div>
      </Card>
    </Screen>
  );
}
