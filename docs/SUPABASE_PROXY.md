# ⚠️ DEPERECATED / ARCHIVED

> **Дата архивации**: 2026-02-19  
> **Причина**: Полный переход на Yandex Cloud Functions + Yandex Managed
> PostgreSQL.  
> **Статус**: ❌ НЕ ИСПОЛЬЗУЕТСЯ. Supabase и Vercel удалены из проекта.

---

# Supabase Proxy на Vercel (ARCHIVED)

> **Дата создания**: 2025-12-06  
> **Статус**: ❌ Архиив  
> **Причина**: Обход блокировки Supabase в РФ (было актуально в 2025)

---

## Проблема

**Supabase (`*.supabase.co`) заблокирован в России** провайдерами (РКН).

Пользователи из РФ не могут напрямую обращаться к:

- `https://ukqolcziqcuplqfgrmsh.supabase.co/auth/v1/*` — авторизация
- `https://ukqolcziqcuplqfgrmsh.supabase.co/rest/v1/*` — PostgREST API (таблицы)
- `https://ukqolcziqcuplqfgrmsh.supabase.co/storage/v1/*` — файлы/фото

---

## Решение

**Прокси через Vercel Serverless Functions**.

Vercel находится вне РФ блокировок → может проксировать запросы к Supabase.

### Схема

```
Браузер (РФ)
    ↓ (heys-v2-web.vercel.app)
Vercel Edge (Европа)
    ↓ (fetch)
Supabase (AWS)
```

---

## Архитектура до и после

### ДО (прямые запросы к Supabase)

```javascript
// В heys_storage_supabase_v1.js
const supabase = createClient(
  'https://ukqolcziqcuplqfgrmsh.supabase.co', // ❌ Заблокировано в РФ
  ANON_KEY,
);
```

### ПОСЛЕ (через прокси)

```javascript
// В heys_storage_supabase_v1.js
const PROXY_URL = 'https://heys-v2-web.vercel.app/api/supabase';
const supabase = createClient(
  PROXY_URL, // ✅ Работает везде
  ANON_KEY,
);
```

---

## Структура API прокси

```
apps/web/api/
├── supabase/
│   ├── auth/v1/
│   │   ├── token.js      # POST /api/supabase/auth/v1/token — логин
│   │   └── logout.js     # POST /api/supabase/auth/v1/logout — выход
│   ├── rest/v1/
│   │   └── [...path].js  # (не используется, Vercel не поддерживает nested catch-all)
│   ├── [...path].js      # Fallback (не работает надёжно)
│   └── debug-env.js      # Debug: проверка env переменных
├── rest.js               # ✅ Главный прокси для таблиц
├── storage.js            # ✅ Прокси для файлов/фото
├── debug-rest.js         # Debug: инспекция Vercel rewrites
└── health.ts             # Health check
```

---

## Vercel Rewrites (vercel.json)

```json
{
  "rewrites": [
    {
      "source": "/api/supabase/rest/v1/:table",
      "destination": "/api/rest?table=:table"
    },
    {
      "source": "/api/supabase/storage/v1/:path(.*)",
      "destination": "/api/storage?storagePath=:path"
    }
  ]
}
```

### Почему rewrites?

Vercel **не поддерживает catch-all `[...path].js`** в глубоко вложенных папках
(`/api/supabase/rest/v1/`).

**Решение**: Rewrite на плоский файл + передача параметров через query string.

---

## Как работает rest.js

```
1. Браузер: GET /api/supabase/rest/v1/kv_store?select=k,v
2. Vercel rewrite добавляет table=kv_store:
   → /api/rest?table=kv_store&select=k,v
3. rest.js извлекает table из query
4. Формирует URL: https://supabase.co/rest/v1/kv_store?select=k,v
5. Делает fetch и возвращает ответ
```

---

## Environment Variables (Vercel)

В Vercel Dashboard → Settings → Environment Variables:

| Имя                      | Значение                                   |
| ------------------------ | ------------------------------------------ |
| `VITE_SUPABASE_URL`      | `https://ukqolcziqcuplqfgrmsh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs...`                  |

⚠️ **Важно**: Можно использовать как `SUPABASE_*` так и `VITE_SUPABASE_*` — код
проверяет оба варианта.

---

## Проблемы и решения (хронология)

### 1. Node.js версия

**Ошибка**: Build fail — несовместимость Node 24 vs 20  
**Решение**: `.nvmrc` → `20.x`

### 2. 404 на API routes

**Ошибка**: Catch-all `[...path].ts` не работает  
**Решение**: Явные эндпоинты (`token.js`, `logout.js`) + rewrites

### 3. Edge runtime не деплоится

**Ошибка**: Edge functions игнорируются  
**Решение**: Node serverless runtime (убрали
`export const config = { runtime: 'edge' }`)

### 4. TypeScript + ESM проблемы

**Ошибка**: 500 ошибки при вызове функций  
**Решение**: Переписали на чистый JavaScript

### 5. 401 Invalid API key

**Ошибка**: Hardcoded ключ был старый  
**Решение**: `process.env.SUPABASE_ANON_KEY`

### 6. Env vars не видны

**Ошибка**: Переменные названы `VITE_SUPABASE_*`  
**Решение**: Fallback: `process.env.SUPABASE_* || process.env.VITE_SUPABASE_*`

### 7. ERR_CONTENT_DECODING_FAILED

**Ошибка**: Браузер не может декодировать ответ  
**Причина**: Дублирование `content-encoding: gzip` — Supabase возвращает сжатый
ответ, мы распаковываем через `arrayBuffer()`, но проксируем заголовок сжатия  
**Решение**: Фильтруем заголовки:

```javascript
const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length'];
```

### 8. PGRST100 failed to parse filter

**Ошибка**: Имя таблицы парсится как фильтр  
**Причина**: Vercel rewrite меняет `req.url`, теряется путь  
**Решение**: Передача `table` через query param в rewrite

---

## Тестирование

### Проверить env переменные

```
https://heys-v2-web.vercel.app/api/supabase/debug-env
```

Ожидаемый ответ:

```json
{
  "hasUrl": true,
  "hasAnonKey": true,
  "urlPrefix": "https://ukqolcziq..."
}
```

### Проверить REST прокси

```
https://heys-v2-web.vercel.app/api/supabase/rest/v1/kv_store?select=k,v
```

### Проверить debug (что видит handler)

```
https://heys-v2-web.vercel.app/api/debug-rest
```

---

## Логи успешной работы

```
✅ Вход выполнен: poplanton@mail.ru
👤 Клиент: 73a55ec7...
📅 [DAY SYNC] Loaded day ... with steps: 3520
✅ Синхронизация завершена | клиент: 73a55ec7... | ключей: 43
☁️ Сохранено в облако: day:2 products:1
```

---

## Что можно удалить после стабилизации

- `apps/web/api/debug-env.js`
- `apps/web/api/debug-rest.js`
- `apps/web/api/supabase/[...path].js` (не используется)
- `apps/web/api/supabase/rest/v1/[...path].js` (не используется)

---

## Полезные команды

```bash
# Локальная разработка (без прокси)
pnpm dev

# Деплой на Vercel
git push  # Автоматический деплой через GitHub интеграцию

# Проверить логи Vercel
vercel logs heys-v2-web.vercel.app
```

---

## Связанные файлы

| Файл                                   | Описание                                |
| -------------------------------------- | --------------------------------------- |
| `apps/web/heys_storage_supabase_v1.js` | Клиент Supabase с поддержкой прокси     |
| `apps/web/vercel.json`                 | Конфигурация Vercel (rewrites, headers) |
| `apps/web/api/rest.js`                 | Главный прокси для REST API             |
| `apps/web/api/storage.js`              | Прокси для Storage (фото)               |

---

## Changelog

| Дата       | Изменения                                             |
| ---------- | ----------------------------------------------------- |
| 2025-12-06 | Первоначальная настройка прокси, решение всех проблем |
