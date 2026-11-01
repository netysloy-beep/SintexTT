import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.js';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Screen } from '../components/ui.js';
import { formatMoney, formatTimeLeft } from '../lib/format.js';

interface ProfileResponse {
  player: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    money: string;
    workers: number;
    trucks: number;
    streak: number;
    suspicion: number;
    referredBy: string | null;
    referralCount: number;
    createdAt: string;
  };
  stats: { buildingCount: number; contractsDelivered: number; contractsFailed: number };
  daily: { available: boolean; reward: string; streak: number };
  techs: { owned: string[] };
  boosters: { active: { boosterId: string; expiresAt: string; def: { name: string; description: string } | null }[] };
  guild: { id: string; name: string } | null;
}

export default function ProfileScreen() {
  const { state, refresh } = useStore();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guildName, setGuildName] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.get<ProfileResponse>('/profile'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки профиля');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state || !data) return <Loading />;

  const claimDaily = async () => {
    setBusy('daily');
    setError(null);
    try {
      const res = await api.post<{ reward: string; streak: number }>('/daily');
      setNotice(`Ежедневный бонус получен: ${formatMoney(res.reward)} (серия: ${res.streak})`);
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка бонуса');
    } finally {
      setBusy(null);
    }
  };

  const guildAction = async (action: 'create' | 'join') => {
    if (guildName.trim().length < 3) return;
    setBusy(action);
    setError(null);
    try {
      await api.post(action === 'create' ? '/guilds' : '/guilds/join', { name: guildName.trim() });
      setNotice(action === 'create' ? 'Торговый союз создан.' : 'Вы вступили в союз.');
      setGuildName('');
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка союза');
    } finally {
      setBusy(null);
    }
  };

  const p = data.player;
  const referralLink = `https://t.me/${import.meta.env.VITE_BOT_USERNAME ?? 'your_bot'}/app?startapp=ref_${p.telegramId}`;

  return (
    <Screen title="Профиль">
      {error && <ErrorState message={error} onRetry={() => setError(null)} />}
      {notice && (
        <Card className="border border-emerald-200 bg-emerald-50 dark:bg-emerald-900 dark:text-emerald-100">
          <p className="text-sm">{notice}</p>
        </Card>
      )}

      <Card>
        <p className="font-semibold">
          {p.firstName ?? p.username ?? `Игрок ${p.telegramId}`}
          {p.username && <span className="ml-1 text-sm text-slate-500">@{p.username}</span>}
        </p>
        <p className="mt-1 text-2xl font-bold text-emerald-600">💰 {formatMoney(p.money)}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <Badge>👷 Рабочие: {p.workers}</Badge>
          <Badge>🚚 Грузовики: {p.trucks}</Badge>
          <Badge>🔥 Серия: {p.streak}</Badge>
          {p.suspicion > 0 && <Badge tone="warn">🕵️ Подозрение: {p.suspicion}</Badge>}
        </div>
      </Card>

      <Card>
        <p className="font-semibold">Ежедневный бонус</p>
        {data.daily.available ? (
          <>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Доступен бонус {formatMoney(data.daily.reward)} (серия {data.daily.streak}).
            </p>
            <div className="mt-2">
              <Button disabled={busy !== null} onClick={() => void claimDaily()}>Забрать</Button>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Бонус уже получен. Возвращайтесь завтра — серия {data.daily.streak} 🔥
          </p>
        )}
      </Card>

      <Card>
        <p className="font-semibold">Статистика</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700">
            <p>Зданий</p>
            <p className="font-semibold">{data.stats.buildingCount}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700">
            <p>Контрактов доставлено</p>
            <p className="font-semibold">{data.stats.contractsDelivered}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700">
            <p>Контрактов провалено</p>
            <p className="font-semibold">{data.stats.contractsFailed}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700">
            <p>Рефералов</p>
            <p className="font-semibold">{p.referralCount}</p>
          </div>
        </div>
      </Card>

      <Card>
        <p className="font-semibold">Технологии</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {data.techs.owned.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Пока не открыто — покупайте во вкладке «Технологии».</p>
          )}
          {data.techs.owned.map((t) => (
            <Badge key={t} tone="good">{t}</Badge>
          ))}
        </div>
      </Card>

      <Card>
        <p className="font-semibold">Активные бустеры</p>
        {data.boosters.active.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Нет активных бустеров — выиграйте их на аукционе.
          </p>
        ) : (
          data.boosters.active.map((b) => (
            <div key={b.boosterId} className="mt-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-700">
              <p className="font-medium">{b.def?.name ?? b.boosterId}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {b.def?.description} · осталось {formatTimeLeft(b.expiresAt)}
              </p>
            </div>
          ))
        )}
      </Card>

      <Card>
        <p className="font-semibold">Торговый союз</p>
        {data.guild ? (
          <p className="mt-1 text-sm">
            Вы в союзе <span className="font-semibold">{data.guild.name}</span> 🤝
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Создайте свой союз или вступите в существующий по названию.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={guildName}
                maxLength={24}
                placeholder="Название союза"
                onChange={(e) => setGuildName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                aria-label="Название союза"
              />
              <Button disabled={busy !== null || guildName.trim().length < 3} onClick={() => void guildAction('create')}>
                Создать
              </Button>
              <Button variant="ghost" disabled={busy !== null || guildName.trim().length < 3} onClick={() => void guildAction('join')}>
                Вступить
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card>
        <p className="font-semibold">Реферальная программа</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Приглашайте друзей — оба получите бонус к старту.
        </p>
        <button
          type="button"
          className="mt-2 w-full break-all rounded-xl bg-slate-100 px-3 py-2 text-left text-xs dark:bg-slate-700"
          onClick={() => void navigator.clipboard?.writeText(referralLink).then(() => setNotice('Ссылка скопирована'))}
        >
          {referralLink}
        </button>
      </Card>
    </Screen>
  );
}
