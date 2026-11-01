# ▶️ Деплой на Render

[Render](https://render.com) — альтернатива Railway с той же авторизацией через GitHub. Репозиторий уже готов: в корне лежит `render.yaml` (Blueprint), который создаёт всё автоматически.

## Структура на Render

| Сервис Render | Что это | План |
| --- | --- | --- |
| `sintex-backend` | API + воркеры + Telegram-бот в одном процессе (`dist/all.js`) | Starter (~$7/мес) |
| `sintex-frontend` | Статика Mini App (nginx), проксирует `/api` на backend | Free |
| `sintex-pg` | PostgreSQL | Free* |
| `sintex-redis` | Redis (BullMQ, rate limits, идемпотентность) | Free |

\* Free Postgres на Render удаляется через 30 дней без активности — при необходимости апгрейдните до Basic ($7/мес).

## Шаг 1. Регистрация

1. Откройте [dashboard.render.com](https://dashboard.render.com) → **Get Started for Free** → **Sign up with GitHub**.
2. Разрешите доступ к репозиторию `netysloy-beep/SintexTT` (при первом входе Render спросит, какие репозитории открыть).

## Шаг 2. Создание Blueprint

1. **New → Blueprint** → выберите репозиторий **SintexTT** → **Apply**.
2. Render прочитает `render.yaml` и спросит значения трёх переменных (sync: false):
   - `BOT_TOKEN` — токен от @BotFather;
   - `BOT_WEBAPP_URL` — пока можно ввести заглушку `https://example.com`, поправим на шаге 3;
   - `CORS_ORIGINS` — так же заглушку `https://example.com`.
3. Дождитесь деплоя (5–10 минут: сборка Docker, миграции, seed).
4. Откройте сервис `sintex-frontend` → **Settings → Domains** — скопируйте выданный URL вида `https://sintex-frontend.onrender.com`.

## Шаг 3. Переменные окружения

1. В `sintex-backend` → **Environment** обновите:
   - `BOT_WEBAPP_URL` = `https://sintex-frontend.onrender.com`
   - `CORS_ORIGINS` = `https://sintex-frontend.onrender.com`
   - `BOT_TOKEN` = ваш токен (если не вводили на шаге 2).
2. Render перезапустит сервис автоматически.

## Шаг 4. Настройка @BotFather

1. [@BotFather](https://t.me/BotFather) → `/mybots` → ваш бот → **Bot Settings → Menu Button** → введите URL фронтенда и текст «🎮 Играть».
2. Откройте бота → `/start` → кнопка «Открыть игру».

## Проверка

- `sintex-backend` → **Logs**: ищите `backend listening on :10000`, `workers started`, `bot started (polling)`.
- `https://sintex-backend.onrender.com/health` (если выдали домен backend'у) → `{"status":"ok"}`.
- Миграции и seed применяются автоматически при каждом деплое.

## Частые проблемы

- **«Build failed»** → вкладка Logs сборки; чаще всего проблема в отсутствии доступа к репозиторию (Шаг 1.2).
- **Бот молчит** → проверьте, что `BOT_TOKEN` заполнен, и в логах нет `BOT_TOKEN is not set; bot disabled`.
- **Mini App не открывается** → `BOT_WEBAPP_URL` должен быть точным HTTPS-URL из шага 2.4.
- **Free Postgres истёк** → апгрейд `sintex-pg` до Basic, данные перенесутся.

## Стоимость

~$7/мес (Starter backend) + $0 (frontend, Redis, Postgres free). Для развития проекта хватает с запасом.

## Локальный запуск не меняется

`docker compose up --build` работает как раньше — Blueprint затрагивает только Render.
