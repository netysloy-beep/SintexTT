import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.js';
import { Badge, Button, Card, ErrorState, Loading, Screen } from '../components/ui.js';
import { formatMoney } from '../lib/format.js';

const RESOURCES: { kind: string; label: string }[] = [
  { kind: 'WHEAT', label: '🌾 Пшеница' },
  { kind: 'FLOUR', label: '🌾 Мука' },
  { kind: 'BREAD', label: '🍞 Хлеб' },
  { kind: 'WOOD', label: '🪵 Дерево' },
  { kind: 'PLANKS', label: '🪵 Доски' },
  { kind: 'FURNITURE', label: '🪑 Мебель' },
  { kind: 'ENERGY', label: '⚡ Энергия' },
];

interface AdminPlayer {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  money: string;
  workers: number;
  trucks: number;
  streak: number;
  createdAt: string;
}

interface AdminDetail {
  player: AdminPlayer;
  resources: { kind: string; qty: string }[];
  buildings: { id: string; kind: string; level: number; assignedWorkers: number }[];
}

function dollarsToCents(input: string): string | null {
  const v = Number.parseFloat(input.replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return null;
  return String(Math.round(v * 100));
}

export default function AdminScreen() {
  const { refresh } = useStore();
  const [search, setSearch] = useState('');
  const [list, setList] = useState<AdminPlayer[] | null>(null);
  const [selected, setSelected] = useState<AdminDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moneyInput, setMoneyInput] = useState('');
  const [setMoneyInput, setSetMoneyInput] = useState('');
  const [workersInput, setWorkersInput] = useState('');
  const [trucksInput, setTrucksInput] = useState('');
  const [resKind, setResKind] = useState('WHEAT');
  const [resQty, setResQty] = useState('');

  const loadList = useCallback(async (q: string) => {
    try {
      const res = await api.get<{ players: AdminPlayer[] }>(
        `/admin/players${q ? `?search=${encodeURIComponent(q)}` : ''}`,
      );
      setList(res.players);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }, []);

  useEffect(() => {
    void loadList('');
  }, [loadList]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setSelected(await api.get<AdminDetail>(`/admin/players/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }, []);

  const act = async (fn: () => Promise<void>, okMsg: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(okMsg);
      if (selected) await loadDetail(selected.player.id);
      await Promise.all([loadList(search), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const grantMoney = () => {
    const cents = dollarsToCents(moneyInput);
    if (!cents || !selected) return;
    void act(async () => {
      await api.post('/admin/grant', { playerId: selected.player.id, moneyDelta: cents });
      setMoneyInput('');
    }, 'Деньги выданы');
  };

  const grantUnits = () => {
    const workers = workersInput ? Number.parseInt(workersInput, 10) : 0;
    const trucks = trucksInput ? Number.parseInt(trucksInput, 10) : 0;
    if (!selected || (!workers && !trucks)) return;
    void act(async () => {
      await api.post('/admin/grant', {
        playerId: selected.player.id,
        ...(workers ? { workersDelta: workers } : {}),
        ...(trucks ? { trucksDelta: trucks } : {}),
      });
      setWorkersInput('');
      setTrucksInput('');
    }, 'Юниты выданы');
  };

  const grantResource = () => {
    const qty = resQty.trim();
    if (!selected || !qty) return;
    void act(async () => {
      await api.post('/admin/grant', {
        playerId: selected.player.id,
        resources: [{ kind: resKind, qtyDelta: qty }],
      });
      setResQty('');
    }, 'Ресурс выдан');
  };

  const setMoney = () => {
    const cents = dollarsToCents(setMoneyInput);
    if (!cents || !selected) return;
    void act(async () => {
      await api.post('/admin/set', { playerId: selected.player.id, money: cents });
      setSetMoneyInput('');
    }, 'Баланс установлен');
  };

  const resetAccount = () => {
    if (!selected) return;
    if (!window.confirm('Сбросить аккаунт игрока до стартового состояния?')) return;
    void act(async () => {
      await api.post('/admin/reset', { playerId: selected.player.id });
    }, 'Аккаунт сброшен');
  };

  const deleteAccount = () => {
    if (!selected) return;
    if (!window.confirm('УДАЛИТЬ игрока безвозвратно?')) return;
    void act(async () => {
      await api.post('/admin/delete', { playerId: selected.player.id });
      setSelected(null);
    }, 'Игрок удалён');
  };

  const doSearch = () => void loadList(search.trim());

  return (
    <Screen title="🛠️ Админ-панель">
      {notice && <Card className="border border-emerald-200 text-sm text-emerald-700 dark:text-emerald-300">{notice}</Card>}
      {error && <ErrorState message={error} onRetry={() => void loadList(search)} />}

      <Card>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ник, имя или Telegram ID"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
          />
          <Button onClick={doSearch}>Найти</Button>
        </div>
      </Card>

      {list === null ? (
        <Loading />
      ) : (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Игроки ({list.length})</p>
          <div className="space-y-2">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void loadDetail(p.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                  selected?.player.id === p.id
                    ? 'bg-brand-50 dark:bg-slate-700'
                    : 'bg-slate-50 dark:bg-slate-700/40'
                }`}
              >
                <span className="font-semibold">{p.firstName ?? p.username ?? p.telegramId}</span>
                {p.username && <span className="ml-1 text-slate-400">@{p.username}</span>}
                <span className="float-right font-semibold text-emerald-600">{formatMoney(p.money)}</span>
              </button>
            ))}
            {list.length === 0 && <p className="text-sm text-slate-400">Никого не найдено</p>}
          </div>
        </Card>
      )}

      {selected && (
        <>
          <Card>
            <p className="font-bold">
              {selected.player.firstName ?? selected.player.username ?? 'Игрок'}{' '}
              <span className="text-xs text-slate-400">TG {selected.player.telegramId}</span>
            </p>
            <p className="mt-1 text-sm">
              Баланс: <span className="font-semibold text-emerald-600">{formatMoney(selected.player.money)}</span>
              {' '}· Рабочие: {selected.player.workers} · Фургоны: {selected.player.trucks} · Серия: {selected.player.streak}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {selected.resources.map((r) => (
                <Badge key={r.kind}>{r.kind}: {r.qty}</Badge>
              ))}
              {selected.buildings.map((b) => (
                <Badge key={b.id} tone="warn">{b.kind} ур.{b.level}</Badge>
              ))}
            </div>
          </Card>

          <Card>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Выдать (добавить)</p>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={moneyInput}
                  onChange={(e) => setMoneyInput(e.target.value)}
                  placeholder="Деньги, $ (напр. 5000)"
                  inputMode="decimal"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                />
                <Button onClick={grantMoney} disabled={busy}>💰 +</Button>
              </div>
              <div className="flex gap-2">
                <input
                  value={workersInput}
                  onChange={(e) => setWorkersInput(e.target.value)}
                  placeholder="Рабочие ±"
                  inputMode="numeric"
                  className="w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                />
                <input
                  value={trucksInput}
                  onChange={(e) => setTrucksInput(e.target.value)}
                  placeholder="Фургоны ±"
                  inputMode="numeric"
                  className="w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                />
                <Button onClick={grantUnits} disabled={busy}>👷+</Button>
              </div>
              <div className="flex gap-2">
                <select
                  value={resKind}
                  onChange={(e) => setResKind(e.target.value)}
                  className="w-1/2 rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                >
                  {RESOURCES.map((r) => (
                    <option key={r.kind} value={r.kind}>{r.label}</option>
                  ))}
                </select>
                <input
                  value={resQty}
                  onChange={(e) => setResQty(e.target.value)}
                  placeholder="Кол-во ±"
                  inputMode="numeric"
                  className="w-1/3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                />
                <Button onClick={grantResource} disabled={busy}>📦+</Button>
              </div>
            </div>
          </Card>

          <Card>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Установить баланс (точно)</p>
            <div className="flex gap-2">
              <input
                value={setMoneyInput}
                onChange={(e) => setSetMoneyInput(e.target.value)}
                placeholder="Новый баланс, $"
                inputMode="decimal"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              />
              <Button variant="ghost" onClick={setMoney} disabled={busy}>=</Button>
            </div>
          </Card>

          <Card className="flex gap-2">
            <Button variant="danger" onClick={resetAccount} disabled={busy}>♻️ Сброс аккаунта</Button>
            <Button variant="danger" onClick={deleteAccount} disabled={busy}>🗑 Удалить</Button>
          </Card>
        </>
      )}
    </Screen>
  );
}
