# 🏭 Sintex Tycoon — Telegram Mini App: экономическая стратегия

Production-ready шаблон Telegram Mini App в жанре экономической стратегии / симулятора управления: цепочки производства, логистика, живой рынок, форс-мажоры, контракты, ежедневный аукцион и кланы. Вся экономика — **серверная**; клиент только отображает.

## Стек

- **Frontend**: TypeScript, React, Vite, Tailwind CSS, @telegram-apps/sdk-react, Framer Motion, Recharts
- **Backend**: TypeScript, Node.js, Fastify, grammY (бот), BullMQ (воркеры)
- **Данные**: PostgreSQL + Prisma ORM (миграции + seed), Redis (кэш, очереди, rate limiting, идемпотентность)
- **Инфраструктура**: Docker Compose, pnpm workspaces

## Скриншот-описание экранов

`🏭 Завод` · `📈 Рынок` · `📜 Контракты` · `🔨 Аукцион` · `⚡ События` · `🧪 Технологии` · `👤 Профиль`

## Быстрый старт (Docker Compose)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/netysloy-beep/SintexTT.git
cd SintexTT

# 2. Установить зависимости (нужен pnpm: corepack enable)
pnpm install

# 3. Скопировать и заполнить .env
cp .env.example .env
#   BOT_TOKEN — токен от @BotFather
#   BOT_WEBAPP_URL — публичный HTTPS URL фронтенда (Mini App)

# 4. Запустить всё: postgres, redis, миграции, seed, backend, worker, bot, frontend
docker compose up --build
```

Что поднимается:

| Сервис | Описание | Порт (host) |
| --- | --- | --- |
| `postgres` | PostgreSQL 16 | 5432 |
| `redis` | Redis 7 | 6379 |
| `migrate` | `prisma migrate deploy` + seed (разовый) | — |
| `backend` | Fastify API | 3000 |
| `worker` | BullMQ-воркеры (рынок, события, контракты, аукцион) | — |
| `bot` | grammY-бот (long polling) | — |
| `frontend` | Vite dev-сервер | 5173 |

Миграции и seed применяются автоматически сервисом `migrate` перед стартом backend.

## Получение токена бота у @BotFather

1. Откройте [@BotFather](https://t.me/BotFather) → `/newbot` → задайте имя и username.
2. Скопируйте токен в `.env` → `BOT_TOKEN`.
3. `/mybots` → ваш бот → **Bot Settings → Menu Button** — укажите `BOT_WEBAPP_URL` и название «Играть».
4. Для реального деплоя `BOT_WEBAPP_URL` должен быть HTTPS (Telegram требует).

## Запуск без Docker (локальная разработка)

```bash
pnpm install
cp .env.example .env   # укажите локальные DATABASE_URL/REDIS_URL
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend exec prisma db seed
pnpm --filter backend dev      # API на :3000
pnpm --filter backend worker   # фоновые задачи
pnpm --filter backend bot      # Telegram-бот
pnpm --filter frontend dev     # Vite на :5173 (проксирует /api → :3000)
```

## Проверка (typecheck, lint, тесты)

```bash
./scripts/verify.sh        # всё сразу
# или по шагам:
pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test
pnpm --filter frontend typecheck && pnpm --filter frontend lint
```

Тесты: юниты экономики (engine, market, auction, contracts, daily, money, initdata) + интеграционные concurrency-тесты (запускаются при доступной `DATABASE_URL`).

## Архитектура

```
packages/
├── backend/
│   ├── prisma/            # schema.prisma, миграции, seed
│   ├── src/
│   │   ├── api/           # Fastify: плагин авторизации + маршруты
│   │   ├── bot/           # grammY: команды, WebApp-кнопки, рефералы
│   │   ├── economy/       # серверная экономика: engine, market, events, contracts, auction, daily
│   │   ├── lib/           # prisma, redis, money (BigInt), initdata, session, idempotency, rate-limit
│   │   └── workers/       # BullMQ: market-tick, events, contracts, auction open/close
│   └── tests/
└── frontend/
    └── src/
        ├── components/    # UI-кит: Card, Button, Badge, Screen, Loading, EmptyState, ErrorState
        ├── screens/       # Production, Market, Contracts, Auction, Events, Upgrades, Profile
        ├── lib/           # API-клиент, форматтеры, Telegram SDK
        └── store.tsx      # boot/auth/ready состояние
```

### Безопасность

- Валидация Telegram `initData` (HMAC-SHA256, `auth_date` freshness) → выдача короткоживущей сессии (Bearer).
- Все деньги и ресурсы — `BigInt` (центы), без floating point.
- Все мутации — в транзакциях Prisma; `SELECT ... FOR UPDATE` на лоте аукциона и игроке.
- Идемпотентность по `Idempotency-Key` для ставок, ответов на события и наград.
- Rate limiting на чувствительные эндпоинты, CORS-белый список, healthcheck `/health`.
- Время — UTC.

## API (все под `/api`, авторизация: `Authorization: Bearer <token>`)

| Метод | Путь | Описание |
| --- | --- | --- |
| POST | `/auth/init` | Обмен `initData` → сессионный токен |
| GET | `/state` | Полное состояние игрока, ресурсов, зданий, каталог |
| GET | `/buildings` · POST `/buildings/:kind/build` · POST `/buildings/:id/upgrade` · POST `/buildings/:id/assign` | Стройка, апгрейд, назначение рабочих |
| GET | `/market` | Цены, история, котировки |
| POST | `/market/trade` | Покупка/продажа `{ kind, qty, side }` |
| GET | `/contracts` | Предложения, активные, история |
| POST | `/contracts/:id/accept` · POST `/contracts/:id/deliver` | Взять/доставить контракт |
| GET | `/auction` | Лоты и топ-ставки |
| POST | `/auction/:lotId/bid` | Ставка `{ amount }` (центов) + `Idempotency-Key` |
| GET | `/events` | Активные форс-мажоры |
| POST | `/events/:id/respond` | Реакция `{ responseId }` |
| GET | `/profile` · POST `/daily` | Профиль, статистика, ежедневный бонус |
| POST | `/techs/:techId/unlock` | Открыть технологию |
| POST | `/guilds` · POST `/guilds/join` | Создать/вступить в торговый союз |
| GET | `/health` | Healthcheck |

## Команды бота

- `/start` — приветствие + кнопка «Играть» (WebApp); `/start ref_<id>` — реферальный вход
- `/app` — открыть Mini App
- `/stats` — краткая сводка по империи
- `/ref` — персональная реферальная ссылка
- `/help` — список команд

## Игровые механики

1. **Производство**: здания производят ресурсы по циклам (Ферма → Мельница → Пекарня → Магазин); рабочие назначаются на здания, грузовики — на контракты.
2. **Рынок**: цены двигаются спросом/предложением каждые N минут; спред уменьшается технологией «Трейдинг».
3. **Форс-мажоры**: засуха, забастовка, скачок цен, налоговый рейд — реагируйте взяткой, премией или оплатой.
4. **Контракты**: предложения каждые 2 часа; за срыв — штраф; грузовик занят до доставки.
5. **Аукцион**: ежедневно по расписанию; escrow-ставки, возврат при перебитии, серверная сериализация одновременных ставок.
6. **Технологии и бустеры**: автоматизация, HR, логистика, энергоэффективность; бустеры выигрываются на аукционе.

## Деплой

1. Подготовьте VPS с Docker и публичным доменом с HTTPS (например, за Caddy/Traefik/Nginx).
2. `git clone` → `cp .env.example .env` → заполните прод-значения (`BOT_WEBAPP_URL`, `CORS_ORIGINS`, `NODE_ENV=production`).
3. `docker compose up -d --build` — миграции применятся автоматически.
4. В @BotFather задайте Menu Button на `BOT_WEBAPP_URL`.
5. Логи: `docker compose logs -f backend worker bot`.

## Переменные окружения

См. `.env.example` — все переменные с комментариями. Секреты не хардкодятся и не коммитятся (`.env` в `.gitignore`).
