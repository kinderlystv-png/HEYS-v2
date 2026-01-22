# HEYS — Активные задачи

> Обновлено: 2026-01-21

---

## ✅ Фаза 0: PWA Recovery (блокер белого экрана) — ЗАВЕРШЕНО

> **Проблема**: После splash "HEYS Nutrition Tracker" — белый экран на телефоне.
> **Причина**: 5 точек "тихого" empty-div fallback + SW файл отсутствует (404).
> **Цель**: Автоматическое восстановление без ручной очистки кэша.
> **Статус**: ✅ Все задачи выполнены (2026-01-21)

### Phase 0.1: Критические исправления ✅

 - [x] **0.1.1** Создать Service Worker `apps/web/sw.js`
  - ✅ Создан полноценный SW с Cache-First/Network-First стратегиями
  - ✅ Boot failure counter в IndexedDB
  - ✅ Auto-recovery: >2 failures за 5 мин → caches.delete() + skipWaiting()

 - [x] **0.1.2** Recovery UI в `heys_app_root_component_v1.js`
  - ✅ RecoveryScreen компонент с кнопками "Обновить" и "Сбросить кэш"

 - [x] **0.1.3** Recovery UI в `heys_app_root_v1.js`
  - ✅ Fallback с визуальной ошибкой вместо empty-div

 - [x] **0.1.4** Recovery UI в `heys_app_v12.js`
  - ✅ Если AppEntry.start отсутствует → показывает RecoveryScreen

 - [x] **0.1.5** Расширить dependency checks в `heys_app_dependency_loader_v1.js`
  - ✅ Добавлены HEYS.AppRootImpl и HEYS.AppRootComponent.createApp

 - [x] **0.1.6** Обработка ошибок загрузки критических скриптов
  - ✅ `onerror` handler на heys_app_v12.js и heys_app_entry_v1.js → Recovery UI

### Phase 0.2: Глобальная защита ✅

 - [x] **0.2.1** Pre-React error handler в `index.html`
  - ✅ window.onerror + unhandledrejection ПЕРЕД всеми скриптами
  - ✅ showRecoveryUI() экспортирован как window.__heysShowRecoveryUI

 - [x] **0.2.2** Timeout watchdog (15 сек)
  - ✅ setTimeout 15s → если !__heysAppReady → Recovery UI
  - ✅ Флаг __heysAppReady = true в heys_app_initialize_v1.js

 - [x] **0.2.3** SW регистрация: vanilla JS primary
  - ✅ Комментарий в index.html исправлен (heys_platform_apis_v1.js)
  - ✅ service-worker-manager.ts оставлен как secondary (не мешает)

### Phase 0.3: SW Update & Offline UI ✅

 - [x] **0.3.1** showUpdateNotification() в `heys_platform_apis_v1.js`
  - ✅ Системный banner: "Доступно обновление" + кнопка "Обновить"

 - [x] **0.3.2** showOfflineNotification()
  - ✅ Banner: "📴 Офлайн режим — данные сохраняются локально"
  - ✅ Автоскрытие при возвращении online

 - [x] **0.3.3** Централизованный debug-логгер для fallback hooks
  - ✅ HEYS._getModule() + HEYS._debugMissingModule()
  - ✅ Логирование только при DEBUG_MODE (localStorage.heys_debug='1')
  - ✅ 30+ fallback hooks покрыты в heys_app_root_impl_v1.js и heys_app_initialize_v1.js

### Phase 0.4: Quick Fixes (добавлено) ✅

 - [x] **0.4.1** Синхронизировать manifest path
  - ✅ sw.js теперь использует /manifest.json (как index.html)
  - Было: /manifest.webmanifest → 404 в precache

 - [x] **0.4.2** Исправить тип сообщения SW
  - ✅ sw.js теперь шлёт CACHES_CLEARED (не CACHE_CLEARED)
  - Было: несовпадение с listener в heys_platform_apis_v1.js

### CSS стили баннеров ✅

 - [x] Добавлены BEM-стили в `styles/heys-components.css`
  - .heys-system-banner, .heys-system-banner--update, .heys-system-banner--offline

### Phase 0.5: Unified SW Update UX — 2-3 часа (опционально)

> **Проблема**: 4 разных UI для уведомлений об обновлениях (badge, banner, modal, toast).
> **Риск**: Дублирование логики, конфликтующие модалки, ~130 строк inline CSS.
> **Цель**: Единая система с ненавязчивым UX (badge по умолчанию, modal для ручной проверки).

**Файлы с пересечением:**

**План:**

  - Сейчас в `heys_pwa_module_v1.js:131` и `:271`
  - Экспортировать как `HEYS.PlatformAPIs.showUpdateBadge/Modal()`

  - ~80 строк inline в `showUpdateBadge()` → `.heys-update-badge`, `.heys-update-badge__btn`
  - ~60 строк inline в `showUpdateModal()` → `.heys-update-modal`, `.heys-update-modal__stage`
  - **Файл**: `styles/heys-components.css`

  - `heys_pwa_module_v1.js:checkServerVersion()` дублирует логику из `heys_app_update_checks_v1.js`
  - Оставить один источник правды в `update_checks`

  - `HEYS.PWA.showUpdateBadge` → `HEYS.PlatformAPIs.showUpdateBadge`
  - `HEYS.PWA.showUpdateModal` → `HEYS.PlatformAPIs.showUpdateModal`
  - `window.showUpdateModal` → deprecated alias

  - Оставить только VERSION, isNewerVersion(), aliases
  - Удалить дублирующиеся функции

**UX решение:**
- **Auto-detect update** → Badge (ненавязчивый, сверху экрана)
- **Ручная проверка (HEYS.checkForUpdates)** → Modal с прогрессом
- **Offline/Online** → Banner (системный, снизу)
- **React интеграция** → Toast через `useUpdateNotifications` hook

**Breaking Changes:** Нет (aliases сохраняют совместимость)

---

## 🔧 Фаза 1: Database Resilience — 6 часов

> **Проблема**: Каждый запрос создаёт новое DB соединение → исчерпание лимита.
> **Цель**: Connection pooling + автоматические бэкапы.

- [ ] **1.1** Создать shared DB pool module
  - Единый `Pool` с конфигом `{max: 3, idleTimeoutMillis: 10000}`
  - Экспорт `getPool()` и `withClient(fn)`
  - **Файл**: `yandex-cloud-functions/shared/db-pool.js`

- [ ] **1.2** Рефакторинг heys-api-rpc на pool
  - Заменить `new Client()` на `getPool().connect()` + `release()`
  - **Файл**: `yandex-cloud-functions/heys-api-rpc/index.js`

- [ ] **1.3** Рефакторинг heys-api-rest на pool
  - **Файл**: `yandex-cloud-functions/heys-api-rest/index.js`

- [ ] **1.4** Рефакторинг heys-api-auth на pool
  - **Файл**: `yandex-cloud-functions/heys-api-auth/index.js`

- [ ] **1.5** Рефакторинг heys-api-leads на pool
  - **Файл**: `yandex-cloud-functions/heys-api-leads/index.js`

- [ ] **1.6** Рефакторинг heys-api-payments на pool (5 мест!)
  - **Файл**: `yandex-cloud-functions/heys-api-payments/index.js`

- [ ] **1.7** Включить автобэкап в Yandex Cloud
  - Console: Managed PostgreSQL → Backup
  - `backup-window: 03:00`, `retain: 7 days`

- [ ] **1.8** Создать backup Cloud Function
  - pg_dump → gzip → S3 bucket `heys-backups`
  - Cron триггер ежедневно в 03:00
  - **Папка**: `yandex-cloud-functions/heys-backup/`

---

## 📊 Фаза 2: Мониторинг и Алерты — 3 часа

> **Проблема**: Система "слепа" — нет алертов о падениях и ошибках.
> **Цель**: Глубокий health check + UptimeRobot + Telegram алерты.

- [ ] **2.1** Расширить health check
  - Добавить проверку DB connectivity
  - Response latency, вернуть 503 при degraded
  - **Файл**: `yandex-cloud-functions/heys-api-health/index.js`

- [ ] **2.2** Security alerting в maintenance
  - `checkSecurityAlerts()`: >10 событий/час → Telegram alert
  - **Файл**: `yandex-cloud-functions/heys-maintenance/index.js`

- [ ] **2.3** UptimeRobot для доступности
  - Monitoring `/health` каждые 5 минут
  - Alert в Telegram при downtime

---

## 🔐 Фаза 3: Безопасность — 3 часа

> **Цель**: Audit logging для 152-ФЗ + шифрование health_data.

- [ ] **3.1** Создать audit_log таблицу
  - Триггеры на `clients`, `client_kv_store`
  - Логирование INSERT/UPDATE/DELETE с user_id, ip, timestamp
  - **Файл**: `database/2026-01-21_audit_log.sql`

- [ ] **3.2** Документировать rate limiting
  - Описание `pin_login_attempts` механизма
  - **Файл**: `docs/SECURITY_RUNBOOK.md`

- [ ] **3.3** Шифрование health_data (Phase 2)
  - Колонка `v_encrypted BYTEA` в `client_kv_store`
  - Функции `encrypt_kv()` / `decrypt_kv()` с AES-256
  - Ключ в Yandex KMS

---

## 📋 Фаза 4: Operations & DR — 4 часа

> **Цель**: Готовность к инцидентам и масштабированию.

- [ ] **4.1** Создать Incident Runbook
  - Сценарии: DB down, API 5xx, payment fail, security breach
  - Чеклисты действий и контакты
  - **Файл**: `docs/operations/INCIDENT_RUNBOOK.md`

- [ ] **4.2** Feature flag для ограничения регистраций
  - `MAX_ACTIVE_TRIALS` check в `start_trial_by_session`
  - Если >N активных триалов → "очередь заполнена"

- [ ] **4.3** Backup test procedure
  - Документировать процесс восстановления
  - Тестировать еженедельно на staging

---

## ✅ Рефакторинг завершён

Архитектурный рефакторинг всех крупных модулей завершён. Детали → [done.md](./done.md)

---

## 🔴 Блокеры (ждут бизнес-решений)

### 💳 ЮKassa + Налоги

**Статус**: ⏸️ Ожидает решения по юридической схеме

**Блокеры (НЕ технические!):**

- [ ] Решение по юр.схеме: ИП (ПСН+УСН) или только УСН
- [ ] ОКВЭД: 63.11 (SaaS), 62.01, 62.09, 63.99.1 — НЕ медицина
- [ ] Регистрация в ЮKassa (shopId + secretKey)
- [ ] Фискализация: облачная касса + ОФД или "Чеки от ЮKassa"

**Код готов!** Cloud Function `heys-api-payments` + Frontend интеграция.

**После разблокировки (~2-4 часа):**

- [ ] Деплой функции с секретами
- [ ] Webhook в ЮKassa
- [ ] Тестирование в sandbox
- [ ] Активация подписки при `payment_succeeded`

---

_Выполненные задачи → [done.md](./done.md)_

---

## 🟢 Стратегические улучшения (выполнено)

- [x] ~~Перевести модалки на `createRoot` (React 18)~~ — выполнено 2026-01-18
  - Влияние: `apps/web/heys_step_modal_v1.js`, `apps/web/heys_confirm_modal_v1.js`
