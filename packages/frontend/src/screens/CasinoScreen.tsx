import { useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.js';
import { Button, Card, Screen } from '../components/ui.js';
import { formatMoney } from '../lib/format.js';
import { haptic } from '../lib/telegram.js';

const PRESETS = ['10', '50', '250', '1000'];

interface FlipResponse {
  result: 'HEADS' | 'TAILS';
  side: 'HEADS' | 'TAILS';
  won: boolean;
  payout: string;
  money: string;
}

export default function CasinoScreen() {
  const { state, refresh } = useStore();
  const [bet, setBet] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<FlipResponse | null>(null);
  const [history, setHistory] = useState<{ won: boolean; bet: string }[]>([]);

  if (!state) return null;

  const flip = async (side: 'HEADS' | 'TAILS') => {
    const parsed = Number.parseFloat(bet.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Некорректная ставка');
      return;
    }
    const cents = String(Math.round(parsed * 100));
    setBusy(true);
    setError(null);
    haptic();
    try {
      const res = await api.post<FlipResponse>('/casino/flip', { bet: cents, side });
      setLast(res);
      setHistory((h) => [{ won: res.won, bet: cents }, ...h].slice(0, 10));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="🎰 Подпольное казино">
      <Card className="text-center">
        <p className="text-xs uppercase text-slate-400">Ваш баланс</p>
        <p className="text-xl font-bold text-emerald-600">💰 {formatMoney(state.player.money)}</p>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Монетка 50/50. Выигрыш — ставка ×2. Мин. $10, макс. $20,000.
        </p>
      </Card>

      <Card>
        <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Ставка, $</p>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setBet(p)}
              className={`flex-1 rounded-xl px-2 py-2 text-sm font-semibold ${
                bet === p ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
              }`}
            >
              ${p}
            </button>
          ))}
        </div>
        <input
          value={bet}
          onChange={(e) => setBet(e.target.value)}
          placeholder="Своя сумма"
          inputMode="decimal"
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
        />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => void flip('HEADS')} disabled={busy} className="py-4 text-base">
          🪙 Орёл
        </Button>
        <Button variant="ghost" onClick={() => void flip('TAILS')} disabled={busy} className="py-4 text-base">
          🪙 Решка
        </Button>
      </div>

      {error && <Card className="text-sm text-rose-600 dark:text-rose-400">{error}</Card>}

      {last && (
        <Card className="text-center">
          <div className="text-4xl">{last.result === 'HEADS' ? '🦅' : '🐕'}</div>
          <p className="mt-2 font-bold">
            {last.won ? 'Выигрыш!' : 'Мимо...'}{' '}
            <span className={last.won ? 'text-emerald-600' : 'text-rose-500'}>
              {last.won ? `+${formatMoney(last.payout)}` : '−ставка'}
            </span>
          </p>
          <p className="text-sm text-slate-400">Выпало: {last.result === 'HEADS' ? 'Орёл' : 'Решка'}</p>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Последние</p>
          <div className="flex flex-wrap gap-1">
            {history.map((h, i) => (
              <span
                key={i}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  h.won
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200'
                }`}
              >
                {h.won ? 'W' : 'L'} ${Number(h.bet) / 100}
              </span>
            ))}
          </div>
        </Card>
      )}
    </Screen>
  );
}
