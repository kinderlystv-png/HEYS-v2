# Telegram Mini App — продовый сценарий запуска

> Цель: получить повторяемый процесс сборки и выката mini-app для Telegram с соблюдением требований безопасности.

## 🐛 Troubleshooting

**Если авторизация не работает ("Failed to fetch")** → см. **[TELEGRAM_AUTHORIZATION_DEBUG.md](./TELEGRAM_AUTHORIZATION_DEBUG.md)**

**Новая функция:** Debug Console 🐛 встроена в mini-app для отладки без браузерных DevTools!

## 1. Подготовка окружения

1. Обновите зависимости и соберите workspace:

```bash
pnpm install
pnpm run build
```

2. Создайте `.env.production` (не храните его в git) и заполните значения:

```dotenv
NODE_ENV=production
API_PORT=4001
DATABASE_NAME=projectB
VITE_API_URL=https://api.heys.app
API_ALLOWED_ORIGINS=https://mini.heys.app
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=prod-service-role-key
TELEGRAM_BOT_TOKEN=__PROD_TOKEN__
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
TELEGRAM_CURATOR_MAP=123456789=00000000-0000-4000-8000-aaaaaaaaaaaa,987654321=00000000-0000-4000-8000-bbbbbbbbbbbb
```

> `TELEGRAM_CURATOR_MAP` обязательно должен покрывать **все** ID из `TELEGRAM_ALLOWED_USER_IDS`, чтобы backend смог сопоставить Telegram пользователя с Supabase curator аккаунтом.

3. Убедитесь, что домен Telegram mini-app добавлен в `apps/tg-mini/vite.config.ts → server.allowedHosts`.

4. Проверьте Supabase:
   - Таблицы `clients`, `client_kv_store`, `kv_store` содержат production-данные и включают RLS политики из `database_clients_rls_policies.sql`.
   - В колонке `client_id` нет «пустых» записей; все необходимые ключи (`weight`, `steps`, `calories` и т.д.) присутствуют в `client_kv_store`.
   - Каждый `supabaseUserId` из `TELEGRAM_CURATOR_MAP` существует в `auth.users` и имеет доступ к тем же клиентам, что и в UI HEYS.
   - Service-role ключ хранится в секрет-хранилище (1Password, Doppler и т.п.) и не попадает в логи.

## 2. Backend (packages/core)

1. Соберите core-пакет, чтобы обновить `dist/server/router.js`:

```bash
pnpm --filter @heys/core run build
```

2. Перед выкатом прогоните Supabase-ориентированные тесты (они мокают сеть, так что можно запускать в CI/CD):

```bash
pnpm --filter @heys/core test -- router.supabase.test.ts
```

3. Запустите сервер в production-режиме (pm2/systemd зависит от окружения):

```bash
NODE_ENV=production API_PORT=4001 API_ALLOWED_ORIGINS=https://mini.heys.app SUPABASE_URL=$SUPABASE_URL SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY TELEGRAM_ALLOWED_USER_IDS=123456789,987654321 TELEGRAM_CURATOR_MAP=$TELEGRAM_CURATOR_MAP TELEGRAM_BOT_TOKEN=$PROD_TOKEN node packages/core/src/server.js
```

4. Проверьте здоровье:

```bash
curl https://api.heys.app/health
```

## 3. Frontend (apps/tg-mini)

1. Соберите mini-app:

```bash
pnpm --filter @heys/tg-mini run build
```

Артефакты появятся в `apps/tg-mini/dist/`.

2. Загрузите содержимое `dist/` на выбранный статический хостинг (S3+CloudFront, Cloudflare Pages, Vercel и т.д.).

3. Настройте заголовки:
   - `Cache-Control: public, max-age=60` для `index.html`
   - `Cache-Control: public, max-age=31536000, immutable` для js/css

## 4. BotFather и домены

1. Добавьте боевой домен (например, `https://mini.heys.app`) в **Allowed Domains**.
2. Задайте WebApp URL того же домена.
3. Если веб-приложение развёрнуто по подпути (например, `/telegram`), укажите полный URL.
4. При смене домена обязательно обновите `API_ALLOWED_ORIGINS` и `server.allowedHosts`.

## 5. Чеклист валидации

- ✅ `curl /health` возвращает `status: OK` и `environment: production`
- ✅ Telegram mini-app открывается по production-URL вне ngrok
- ✅ Авторизация проходит только для whitelisted `TELEGRAM_ALLOWED_USER_IDS`
- ✅ Каждому Telegram ID соответствует Supabase curator в `TELEGRAM_CURATOR_MAP`; запрос `GET /api/curator/clients` возвращает данные из Supabase без 403/404
- ✅ Запросы из mini-app уходят на `https://api.heys.app`, ошибок CORS нет
- ✅ В логах backend нет предупреждений о неизвестных Origin/Telegram ID
- ✅ Маршруты `/api/curator/client/:clientId` и `/api/curator/client/:clientId/day/:dayKey` отдают актуальные значения ключей (`weight`, `calories`, `steps` и т.д.) из Supabase
- ✅ В логах `packages/core` нет fallback-сообщений вида `Supabase unavailable, using mocks`

## 6. Роллбек

1. Оставьте предыдущую стабильную версию `dist/` в отдельной папке/облаке.
2. При инциденте переключите статику на предыдущий артефакт и перезапустите backend с прежней версией `packages/core/dist`.
3. Верните BotFather к старому URL (если менялся домен).

## 7. Артефакты после сборки

| Компонент | Путь | Назначение |
| --- | --- | --- |
| Backend | `packages/core/dist/**` | JS/типовые файлы, которые читает `server.js` |
| Mini-app | `apps/tg-mini/dist/**` | Production bundle для загрузки на статику |
| Инфра | `.env.production` | Runtime-переменные (хранить в секретах) |

После выполнения чек-листа отметьте пункт 6 плана как завершённый и переходите к итоговым тестам.
