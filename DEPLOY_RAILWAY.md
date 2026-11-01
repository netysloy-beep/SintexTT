# 🚂 Деплой на Railway

Railway умеет разворачивать проекты из `docker-compose.yml` — все 8 сервисов (postgres, redis, migrate, backend, worker, bot, frontend) поднимутся автоматически из этого репозитория.

## Шаг 1. Аккаунт

1. Зайдите на [railway.app](https://railway.app) → **Login with GitHub**.
2. Тариф Hobby ($5/мес, включает кредиты) — для стабильно работающего бота.

## Шаг 2. Создание проекта из репозитория

1. **New Project** → **Deploy from GitHub repo** → выберите `netysloy-beep/SintexTT`.
2. Railway увидит `docker-compose.yml` и создаст сервисы из него.
3. Добавьте переменные окружения (Variables, на уровне проекта — применятся ко всем сервисам):

```
BOT_TOKEN=<ваш токен от @BotFather>
BOT_WEBAPP_URL=https://<домен-фронтенда>   # впишем после шага 3
CORS_ORIGINS=https://<домен-фронтенда>
DATABASE_URL=postgresql://econ:econ@postgres:5432/econ?schema=public
REDIS_URL=redis://redis:6379
```

4. Присвойте сервису `frontend` публичный домен: **Settings → Networking → Generate Domain** (получите `https://xxx.up.railway.app`).
5. Впишите этот домен в `BOT_WEBAPP_URL` и `CORS_ORIGINS` — Railway перезапустит сервисы сам.

## Шаг 3. Домены и тома

- `backend` — домен не обязателен (фронтенд проксирует `/api`), но можно выдать и ему.
- `postgres` — прикрепите **Volume** (`/var/lib/postgresql/data`), иначе данные пропадут при рестарте.
- `frontend` отдаёт Mini App и проксирует `/api/` на `backend:3000` (см. `nginx.conf`).

## Шаг 4. Настройка бота в @BotFather

1. [@BotFather](https://t.me/BotFather) → `/mybots` → ваш бот → **Bot Settings** → **Menu Button** → введите `BOT_WEBAPP_URL` (домен фронтенда из шага 2.4) и текст «🎮 Играть».
2. `/setinline` и прочее — по желанию.

## Шаг 5. Проверка

- Откройте бота в Telegram → `/start` → кнопка «Открыть игру».
- Логи: Railway → сервис `backend` / `bot` / `worker` → **Deployments → Logs**.
- `migrate` применяет миграции и seed автоматически при каждом деплое.

## ⚠️ Безопасность токена

Если токен когда-либо был отправлен в открытом виде (чат, скриншот), обновите его:
@BotFather → `/mybots` → **API Token** → **Revoke current token** → новый токен впишите в Variables на Railway.
