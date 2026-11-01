import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.js';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Screen } from '../components/ui.js';
import { formatMoney, formatTimeLeft } from '../lib/format.js';

interface EventDefDto {
  kind: string;
  title: string;
  description: string;
  responses: { responseId: string; label: string; cost: string; effect: string }[];
}

interface ActiveEvent {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  expiresAt: string;
  def: EventDefDto | null;
}

export default function EventsScreen() {
  const { refresh } = useStore();
  const [active, setActive] = useState<ActiveEvent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ active: ActiveEvent[] }>('/events');
      setActive(res.active);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки событий');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const respond = async (ev: ActiveEvent, responseId: string) => {
    setBusy(`${ev.id}:${responseId}`);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ message: string; money: string }>(`/events/${ev.id}/respond`, { responseId });
      setNotice(res.message);
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка ответа');
    } finally {
      setBusy(null);
    }
  };

  if (!active) return <Loading />;

  return (
    <Screen title="События">
      {error && <ErrorState message={error} onRetry={() => setError(null)} />}
      {notice && (
        <Card className="border border-emerald-200 bg-emerald-50 dark:bg-emerald-900 dark:text-emerald-100">
          <p className="text-sm">{notice}</p>
        </Card>
      )}

      {active.length === 0 && (
        <EmptyState title="Спокойно на горизонте" hint="Форс-мажоры случаются каждые несколько часов. Будьте готовы!" />
      )}

      {active.map((ev) => (
        <Card key={ev.id}>
          <div className="flex items-start justify-between">
            <p className="font-semibold">{ev.def?.title ?? ev.kind}</p>
            <Badge tone="warn">Активно</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{ev.def?.description}</p>
          {typeof ev.payload.resource === 'string' && (
            <p className="mt-1 text-sm font-medium text-amber-600">Ресурс: {ev.payload.resource}</p>
          )}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Истекает через {formatTimeLeft(ev.expiresAt)}
          </p>
          <div className="mt-3 space-y-2">
            {(ev.def?.responses ?? []).map((r) => (
              <div key={r.responseId} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-700">
                <p className="font-medium">{r.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{r.effect}</p>
                <div className="mt-2">
                  <Button
                    disabled={busy !== null}
                    onClick={() => void respond(ev, r.responseId)}
                  >
                    {r.cost !== '0' ? `Заплатить ${formatMoney(r.cost)}` : 'Выбрать'}
                  </Button>
                </div>
              </div>
            ))}
            {(ev.def?.responses ?? []).length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Реагировать не нужно — событие сработает само и истечёт по таймеру.
              </p>
            )}
          </div>
        </Card>
      ))}
    </Screen>
  );
}
