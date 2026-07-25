# EWS Weekly Cloud Sync — Deployment Guide

> Версия: 1.1.0  
> Дата: 2026-02-16 (упд. 2026-02-26)  
> Автор: GitHub Copilot + Anton

## Что реализовано

### 1. EWS Badge Fix ✅

**Проблема**: Badge не показывался когда warnings = 0  
**Решение**: Зелёный badge "✅ все отлично" теперь отображается всегда

**Изменения:**

- `apps/web/heys_app_shell_v1.js` (v1.1): логика `ewsData && ewsData.count > 0`
  → `ewsData &&`
- `apps/web/styles/modules/000-base-and-gamification.css`: добавлен
  `.ews-badge--ok` (зелёный)

### 2. Облачная синхронизация Weekly Snapshots ✅

**Проблема**: Weekly tracking хранился только в localStorage → потеря при смене
устройства  
**Решение**: Автоматическая синхронизация с PostgreSQL через RPC

**Архитектура:**

```
┌─────────────────────────────────────────────────────────┐
│ Client (PWA)                                            │
│ ┌───────────────────────────────────────────────────┐   │
│ │ pi_early_warning.js v4.2                          │   │
│ │ ┌──────────────────┐  ┌─────────────────────┐    │   │
│ │ │ loadWeeklyProgress│◄─┤ localStorage cache  │    │   │
│ │ └────────┬─────────┘  └─────────────────────┘    │   │
│ │          │                                         │   │
│ │          ▼                                         │   │
│ │ ┌───────────────────────────────────────────────┐ │   │
│ │ │  ☁️ YandexAPI.rpc (cloud sync)               │ │   │
│ │ │  - get_weekly_snapshots_by_session            │ │   │
│ │ │  - upsert_weekly_snapshot_by_session          │ │   │
│ │ └───────────────────┬───────────────────────────┘ │   │
│ └─────────────────────│─────────────────────────────┘   │
└───────────────────────│─────────────────────────────────┘
                        │
                        ▼ HTTPS (api.heyslab.ru/rpc)
┌─────────────────────────────────────────────────────────┐
│ Yandex Cloud Function: heys-api-rpc                     │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ RPC Handler (index.js)                              │ │
│ │ - ALLOWED_FUNCTIONS validation                      │ │
│ │ - FUNCTION_TYPE_MAPPINGS                            │ │
│ │ - Session token validation                          │ │
│ └───────────────────┬─────────────────────────────────┘ │
└─────────────────────│───────────────────────────────────┘
                      │
                      ▼ PostgreSQL RPC call
┌─────────────────────────────────────────────────────────┐
│ Yandex Cloud PostgreSQL (heys_production)              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Table: ews_weekly_snapshots                         │ │
│ │ - client_id (FK → clients)                          │ │
│ │ - week_start, week_end (DATE)                       │ │
│ │ - warnings_count, global_score                      │ │
│ │ - severity_breakdown (JSONB)                        │ │
│ │ - top_warnings (JSONB)                              │ │
│ │ - UNIQUE(client_id, week_start)                     │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ RPC Functions (SECURITY DEFINER)                    │ │
│ │ 1. upsert_weekly_snapshot_by_session                │ │
│ │    - Validates session_token                        │ │
│ │    - Upserts snapshot for current client            │ │
│ │    - Returns { success, snapshot_id, message }      │ │
│ │                                                     │ │
│ │ 2. get_weekly_snapshots_by_session                  │ │
│ │    - Validates session_token                        │ │
│ │    - Returns last N weeks (default: 4)              │ │
│ │    - Sorted DESC by week_start                      │ │
│ │                                                     │ │
│ │ 3. delete_old_weekly_snapshots_by_session           │ │
│ │    - Retention policy: 26 weeks (6 months)          │ │
│ │    - Optional cleanup function                      │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ RLS Policies                                        │ │
│ │ - Curator READ: own clients only                    │ │
│ │ - Curator WRITE: own clients only                   │ │
│ │ - heys_rpc: full access (runtime user)              │ │
│ │ - heys_rest: full access (runtime user)             │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Поведение:**

1. **Load (startup)**:
   - Проверяет облако (timeout 3s)
   - Если успех → кеширует в localStorage
   - Если ошибка → fallback to localStorage
   - 🔑 **Ключ localStorage**: `heys_ews_weekly_v1` (versioned, encrypted)

2. **Save (detectEarlyWarnings)**:
   - localStorage сохраняется всегда (быстро, offline)
   - Облако синхронизируется асинхронно (non-blocking)
   - Если cloud sync fail → не критично (localStorage работает)

3. **Интеграция с heysSyncCompleted (Cascade Guard v6.2)**:
   - `detectEarlyWarnings()` вызывается после `heysSyncCompleted{phase:'full'}`
     (**Phase B**)
   - Phase A (`phaseA: true`) — EWS **не использует** (Phase A не включает
     `heys_dayv2_*`, необходимых для анализа недельных паттернов)
   - Результат: EWS гарантированно работает с полным набором исторических данных
   - См. [SYNC_REFERENCE.md §2 + §12](../SYNC_REFERENCE.md) для деталей о Phase
     A/B

4. **Backfilling**:
   - Анализирует последние 4 недели исторических данных
   - Для каждой недели запускает `detect()` → создаёт snapshot
   - Загружает snapshots в облако + localStorage
   - Вызов:
     `await HEYS.InsightsPI.earlyWarning.backfillWeeklySnapshots(allDays, profile, pIndex)`

**Файлы:**

- `database/2026-02-16_ews_weekly_snapshots.sql` — таблица
- `database/2026-02-16_ews_weekly_snapshots_rpc.sql` — RPC функции
- `yandex-cloud-functions/heys-api-rpc/index.js` — RPC handler (3 новые функции)
- `apps/web/insights/pi_early_warning.js` v4.2:
  - `loadWeeklyProgress()` — async, cloud-first
  - `saveWeeklyProgress()` — async, localStorage + cloud
  - `backfillWeeklySnapshots()` — NEW, создаёт snapshots за 4 недели
  - `calculateWeeklyProgress()` — async
  - `detectEarlyWarnings()` — async

---

## Deployment Steps

### 🔴 WARNING: Эти шаги КРИТИЧНЫ! Неправильный порядок может сломать production.

### 1. Применить SQL миграции (PostgreSQL)

```bash
cd ~/HEYS-v2/yandex-cloud-functions/heys-api-rpc

# 1.1. Применить миграцию таблицы
node apply_migrations.js 2026-02-16_ews_weekly_snapshots.sql

# 1.2. Проверить что таблица создана
psql -h rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net \
     -p 6432 \
     -U heys_admin \
     -d heys_production \
     -c "SELECT * FROM ews_weekly_snapshots LIMIT 1;"
# Ожидаемый результат: "0 rows" (пустая таблица)

# 1.3. Применить миграцию RPC функций
node apply_migrations.js 2026-02-16_ews_weekly_snapshots_rpc.sql

# 1.4. Проверить что функции созданы
psql -h rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net \
     -p 6432 \
     -U heys_admin \
     -d heys_production \
     -c "\\df public.upsert_weekly_snapshot_by_session"
# Ожидаемый результат: функция найдена

psql -h rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net \
     -p 6432 \
     -U heys_admin \
     -d heys_production \
     -c "\\df public.get_weekly_snapshots_by_session"
# Ожидаемый результат: функция найдена
```

**Если psql не установлен:**

- Используйте Yandex Cloud Console → Managed Service for PostgreSQL → SQL
- Или `apply_migrations.js` (автоматически подключается к PostgreSQL)

### 2. Деплой Cloud Function (heys-api-rpc)

```bash
cd ~/HEYS-v2/yandex-cloud-functions

# 2.1. Деплой heys-api-rpc с обновлённым RPC handler
./deploy-all.sh heys-api-rpc

# 2.2. Проверка деплоя (health check)
./health-check.sh

# Ожидаемый вывод:
# ✅ RPC: OK (HTTP 200)
# ✅ Health: {"status":"ok","timestamp":"..."}
```

**Если health-check fail:**

```bash
# Перезадеплой всех функций
./deploy-all.sh

# Проверка логов
yc logging read --group-id <log_group_id> --limit 50
```

### 3. Деплой Frontend (PWA)

```bash
cd ~/HEYS-v2

# 3.1. Build production bundle
pnpm build

# 3.2. Проверка что pi_early_warning.js?v=23 включён
grep "pi_early_warning.js?v=" apps/web/index.html
# Ожидаемый результат: "pi_early_warning.js?v=23"

# 3.3. Деплой на app.heyslab.ru (через ваш CI/CD)
# Через основной workflow `.github/workflows/deploy-yandex.yml`.
```

### 4. Тестирование

#### 4.1. Проверка RPC endpoints

```bash
# Test 1: Health check
curl -s https://api.heyslab.ru/health

# Test 2: RPC call (требуется валидный session_token)
curl -X POST https://api.heyslab.ru/rpc?fn=get_weekly_snapshots_by_session \
  -H "Content-Type: application/json" \
  -H "Origin: https://app.heyslab.ru" \
  -d '{"p_weeks_count": 4}'

# Ожидаемый результат (если нет snapshots):
# []

# Ожидаемый результат (если есть snapshots):
# [{"week_start":"2026-02-15","week_end":"2026-02-22",...}]
```

#### 4.2. Проверка в браузере

1. Откройте `https://app.heyslab.ru`
2. Откройте DevTools → Console
3. Найдите логи:
   ```
   [HEYS.InsightsPI] ✅ Early Warning System v4.2 loaded (25 checks + trends + priority + global score + weekly progress + cloud sync)
   ews / weekly 🔄 load.cloud.start
   ews / weekly ☁️ load.cloud.success: {weeksLoaded: 1, source: 'cloud'}
   ```
4. Проверьте badge в header:
   - Если warnings = 0 → зелёный badge "✅"
   - Если warnings > 0 → оранжевый/красный badge с цифрой

#### 4.3. Тест backfilling

Откройте DevTools Console на `app.heyslab.ru`:

```javascript
// Загрузить все исторические дни
const allDays = [];
for (let i = 0; i < 30; i++) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const dateStr = d.toISOString().split('T')[0];
  const dayData = HEYS.utils.lsGet(`heys_dayv2_${dateStr}`);
  if (dayData) allDays.push({ ...dayData, date: dateStr });
}

// Запустить backfilling
const profile = HEYS.store.get('heys_profile');
const pIndex = HEYS.products.getAll();

HEYS.InsightsPI.earlyWarning
  .backfillWeeklySnapshots(allDays, profile, pIndex, 4)
  .then((result) => {
    console.log('Backfill result:', result);
    // Ожидаемый результат:
    // { success: true, weeksCreated: 4, snapshots: [...] }
  });
```

**Ожидаемые логи:**

```
ews / weekly 🔄 backfill.start: {totalDays: 30, weeksToBackfill: 4}
ews / weekly 🔄 backfill.week_1: {weekStart: '2026-02-15', weekEnd: '2026-02-22'}
ews / weekly 🧮 backfill.compute_week_1: {daysInWeek: 7}
ews / weekly ✅ backfill.week_1.created: {warnings: 13, globalScore: 100}
ews / weekly ☁️ backfill.week_1.uploaded
...
ews / weekly ✅ backfill.complete: {weeksCreated: 4, weeksRequested: 4}
```

### 5. Rollback Plan (если что-то пошло не так)

#### 5.1. Rollback Frontend

```bash
# Откатить index.html к предыдущей версии
git checkout HEAD~1 apps/web/index.html
pnpm build
# Загрузить на app.heyslab.ru
```

#### 5.2. Rollback Cloud Function

```bash
cd ~/HEYS-v2/yandex-cloud-functions

# Откатить index.js к предыдущей версии
git checkout HEAD~1 heys-api-rpc/index.js

# Перезадеплой
./deploy-all.sh heys-api-rpc
```

#### 5.3. Rollback Database (НЕ РЕКОМЕНДУЕТСЯ!)

**⚠️ ОПАСНО!** Удаление таблицы удалит ВСЕ snapshots.

```sql
-- Только если критично:
DROP TABLE IF EXISTS public.ews_weekly_snapshots CASCADE;
DROP FUNCTION IF EXISTS public.upsert_weekly_snapshot_by_session;
DROP FUNCTION IF EXISTS public.get_weekly_snapshots_by_session;
DROP FUNCTION IF EXISTS public.delete_old_weekly_snapshots_by_session;
```

**Лучше:** Оставить таблицу как есть, откатить только frontend/backend.

---

## Monitoring

### Метрики для мониторинга

1. **API Health**:
   - `curl https://api.heyslab.ru/health` → HTTP 200
   - GitHub Actions: `.github/workflows/api-monitor.yml` (каждые 15 мин)

2. **RPC Call Success Rate**:
   - Логи Yandex Cloud: фильтр `"get_weekly_snapshots_by_session"`
   - Ожидаемая latency: < 300ms (load), < 500ms (save)

3. **Storage Size**:
   - Check PostgreSQL table size:
     ```sql
     SELECT pg_size_pretty(pg_total_relation_size('ews_weekly_snapshots'));
     ```
   - Ожидаемый размер: ~1 KB на snapshot × 4 weeks × N clients

4. **Client-side Errors**:
   - Browser Console: фильтр `"ews / weekly ❌"`
   - Sentry/frontend monitoring (если настроен)

### Алерты

- **502 Bad Gateway** на `api.heyslab.ru` → автоматический редеплой (GitHub
  Actions)
- **Table lock** в PostgreSQL → проверить slow queries
- **localStorage quota exceeded** → очистить старые `heys_dayv2_*` keys

---

## FAQ

**Q: Что если пользователь очистил localStorage?**  
A: Облако — source of truth. При следующем запуске данные загрузятся из облака и
закешируются локально.

**Q: Что если cloud sync fail?**  
A: localStorage продолжает работать. Sync повторится при следующем вызове
`detectEarlyWarnings()`.

**Q: Как часто происходит синхронизация?**  
A: При каждом вызове `detectEarlyWarnings()` (обычно 1 раз в день при открытии
приложения).

**Q: Backfilling обязательно запускать?**  
A: Нет, опционально. Если не запустить, weekly tracking начнёт накапливаться с
первого запуска v4.2.

**Q: Сколько хранится исторических данных?**  
A: localStorage: 4 недели (auto-pruning). PostgreSQL: 26 недель (6 месяцев,
retention policy).

**Q: Можно ли отключить cloud sync?**  
A: Да, в `pi_early_warning.js` измените `CLOUD_SYNC_CONFIG.ENABLED = false`. Но
это НЕ РЕКОМЕНДУЕТСЯ.

---

## Контакты

- Миграции: `database/2026-02-16_ews_weekly_snapshots*.sql`
- RPC функции: `yandex-cloud-functions/heys-api-rpc/index.js` строки 245-247
- Frontend: `apps/web/insights/pi_early_warning.js` v4.2
- Monitoring: `yandex-cloud-functions/health-check.sh`
- Документация: `HEYS_Insights_v5_Deep_Analytics_c7.md` (обновить после деплоя)

---

## Change Log

- **2026-02-26**: v1.1.0
  - ✅ Добавлена интеграция с `heysSyncCompleted` Phase B (Cascade Guard v6.2)
  - ✅ Указан ключ localStorage: `heys_ews_weekly_v1`
  - ✅ Пояснено почему Phase A не подходит для EWS (нет `heys_dayv2_*`)

- **2026-02-16**: Initial release v1.0.0
  - ✅ EWS Badge fix (зелёный "все ок")
  - ✅ Облачная синхронизация weekly snapshots
  - ✅ Backfilling из исторических данных
  - ✅ PostgreSQL table + RPC functions
  - ✅ RLS policies для безопасности
