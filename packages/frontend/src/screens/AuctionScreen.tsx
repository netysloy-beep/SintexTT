import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.js';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Screen } from '../components/ui.js';
import { formatMoney, formatTimeLeft } from '../lib/format.js';

interface LotDto {
  id: string;
  booster: { boosterId: string; name: string; description: string } | null;
  startAt: string;
  closeAt: string;
  status: string;
  topBid: { amount: string; isMine: boolean } | null;
  winnerId: string | null;
}

interface AuctionResponse {
  now: string;
  money: string;
  minIncrementBps: number;
  lots: LotDto[];
}

export default function AuctionScreen() {
  const { state, refresh } = useStore();
  const [data, setData] = useState<AuctionResponse | null>(null);
  const [bidDrafts, setBidDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<AuctionResponse>('/auction'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки аукциона');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  if (!state || !data) return <Loading />;
  const money = BigInt(data.money);
  const open = data.lots.filter((l) => l.status === 'OPEN' && new Date(l.closeAt) > new Date(data.now));
  const finished = data.lots.filter((l) => l.status !== 'OPEN');

  const minBidFor = (lot: LotDto): bigint => {
    const top = lot.topBid ? BigInt(lot.topBid.amount) : 0n;
    if (!lot.topBid) return 10000n; // стартовая ставка $100
    return top + (top * BigInt(data.minIncrementBps)) / 10000n + 1n;
  };

  const placeBid = async (lot: LotDto) => {
    const raw = bidDrafts[lot.id];
    if (!raw) return;
    const amount = BigInt(Math.round(Number(raw) * 100));
    setBusy(lot.id);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ amount: string; outbid: boolean; money: string }>(
        `/auction/${lot.id}/bid`,
        { amount: Number(amount) },
      );
      setNotice(res.outbid ? 'Ставка принята. Предыдущий участник перебит и получил возврат.' : 'Ставка принята.');
      setBidDrafts((d) => ({ ...d, [lot.id]: '' }));
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка ставки');
    } finally {
      setBusy(null);
    }
  };

  const lotCard = (lot: LotDto) => {
    const minBid = minBidFor(lot);
    const draft = bidDrafts[lot.id] ?? '';
    const parsed = Number(draft);
    const valid = draft !== '' && Number.isFinite(parsed) && Math.round(parsed * 100) >= Number(minBid) && parsed <= 1000000000;
    return (
      <Card key={lot.id}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold">🏅 {lot.booster?.name ?? 'Артефакт'}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{lot.booster?.description}</p>
          </div>
          <Badge tone={lot.status === 'OPEN' ? 'good' : 'default'}>
            {lot.status === 'OPEN' ? 'Идёт' : 'Закрыт'}
          </Badge>
        </div>
        {lot.status === 'OPEN' && (
          <>
            <p className="mt-2 text-sm">
              Топ-ставка:{' '}
              {lot.topBid ? (
                <>
                  <span className="font-semibold">{formatMoney(lot.topBid.amount)}</span>
                  {lot.topBid.isMine && <span className="ml-1 text-emerald-600">(ваша)</span>}
                </>
              ) : (
                'нет'
              )}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Закрытие через {formatTimeLeft(lot.closeAt)} · мин. шаг +{data.minIncrementBps / 100}%
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={Number(minBid) / 100}
                step="1"
                value={draft}
                placeholder={`от ${Number(minBid) / 100}`}
                onChange={(e) => setBidDrafts((d) => ({ ...d, [lot.id]: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                aria-label="Сумма ставки"
              />
              <Button
                disabled={busy === lot.id || !valid || money < minBid}
                onClick={() => void placeBid(lot)}
              >
                Ставка
              </Button>
            </div>
          </>
        )}
        {lot.status !== 'OPEN' && lot.topBid && (
          <p className="mt-2 text-sm">
            Победила ставка <span className="font-semibold">{formatMoney(lot.topBid.amount)}</span>
            {lot.winnerId === state.player.id && <span className="ml-1 text-emerald-600">— вы выиграли!</span>}
          </p>
        )}
      </Card>
    );
  };

  return (
    <Screen title="Аукцион">
      {error && <ErrorState message={error} onRetry={() => setError(null)} />}
      {notice && (
        <Card className="border border-emerald-200 bg-emerald-50 dark:bg-emerald-900 dark:text-emerald-100">
          <p className="text-sm">{notice}</p>
        </Card>
      )}

      <Card>
        <p className="text-sm">🔨 Ежедневный аукцион артефактов-бустеров.</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ставки блокируются (escrow) и возвращаются при перебитии. Деньги резервируются до закрытия лота.
        </p>
      </Card>

      <h2 className="font-semibold">Открытые лоты</h2>
      {open.length === 0 && (
        <EmptyState title="Лотов нет" hint="Аукцион открывается каждый день по расписанию." />
      )}
      {open.map(lotCard)}

      {finished.length > 0 && (
        <>
          <h2 className="font-semibold">Завершённые</h2>
          {finished.slice(0, 5).map(lotCard)}
        </>
      )}
    </Screen>
  );
}
