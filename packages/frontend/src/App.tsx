import { AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { StoreProvider, useStore } from './store.js';
import { Loading, Card } from './components/ui.js';
import { formatMoney } from './lib/format.js';
import { haptic } from './lib/telegram.js';
import ProductionScreen from './screens/ProductionScreen.js';
import UpgradesScreen from './screens/UpgradesScreen.js';
import MarketScreen from './screens/MarketScreen.js';
import ContractsScreen from './screens/ContractsScreen.js';
import AuctionScreen from './screens/AuctionScreen.js';
import EventsScreen from './screens/EventsScreen.js';
import ProfileScreen from './screens/ProfileScreen.js';

type TabId = 'production' | 'upgrades' | 'market' | 'contracts' | 'auction' | 'events' | 'profile';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'production', label: 'Завод', icon: '🏭' },
  { id: 'market', label: 'Рынок', icon: '📈' },
  { id: 'contracts', label: 'Контракты', icon: '📜' },
  { id: 'auction', label: 'Аукцион', icon: '🔨' },
  { id: 'events', label: 'События', icon: '⚡' },
  { id: 'upgrades', label: 'Технологии', icon: '🧪' },
  { id: 'profile', label: 'Профиль', icon: '👤' },
];

function GameShell() {
  const { phase, error, state, refresh } = useStore();
  const [tab, setTab] = useState<TabId>('production');

  if (phase === 'boot') return <Loading label="Подключение…" />;

  if (phase === 'no-telegram') {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <Card className="max-w-sm text-center">
          <div className="text-4xl">🤖</div>
          <p className="mt-3 font-bold">Откройте игру через Telegram</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Mini App работает внутри Telegram. Запустите бота и нажмите «Играть».
          </p>
        </Card>
      </div>
    );
  }

  if (phase === 'auth-error') {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <Card className="max-w-sm text-center">
          <div className="text-4xl">⚠️</div>
          <p className="mt-3 font-bold text-rose-600">Не удалось войти</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{error}</p>
          <button
            type="button"
            className="mt-4 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => void refresh()}
          >
            Повторить
          </button>
        </Card>
      </div>
    );
  }

  if (!state) return <Loading />;

  const money = formatMoney(state.player.money);

  return (
    <div className="min-h-full pb-16">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-800/90">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <span className="font-bold text-slate-900 dark:text-slate-100">Sintex Tycoon</span>
          <span className="font-semibold text-emerald-600">💰 {money}</span>
        </div>
      </header>

      <main>
        <AnimatePresence mode="wait">
          {tab === 'production' && <ProductionScreen key="production" />}
          {tab === 'upgrades' && <UpgradesScreen key="upgrades" />}
          {tab === 'market' && <MarketScreen key="market" />}
          {tab === 'contracts' && <ContractsScreen key="contracts" />}
          {tab === 'auction' && <AuctionScreen key="auction" />}
          {tab === 'events' && <EventsScreen key="events" />}
          {tab === 'profile' && <ProfileScreen key="profile" />}
        </AnimatePresence>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95"
        aria-label="Навигация"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-7">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => {
                haptic();
                setTab(t.id);
              }}
              className={`flex flex-col items-center py-2 text-[10px] font-medium ${
                tab === t.id ? 'text-brand-500' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="mt-1">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <GameShell />
    </StoreProvider>
  );
}
