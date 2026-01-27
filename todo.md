# HEYS — Активные задачи

> Обновлено: 2026-01-24

---

## ✅ Фаза 0: PWA Recovery — ЗАВЕРШЕНО

> **Статус**: ✅ Все задачи выполнены (2026-01-21) **Детали**: Service Worker с
> auto-recovery, Recovery UI, Timeout watchdog

---

## ✅ Фаза 1: Database Resilience — ЗАВЕРШЕНО

> **Статус**: ✅ Merged в main (PR #30, 2026-01-24)

## 🟡 UI: Унификация таблиц продуктов — 2–4 часа

> **Цель**: единый вывод личной и общей базы продуктов.

- [ ] **PROMPT**: `docs/tasks/2026-01-27-unify-product-tables.md`

## 🔐 Фаза 3: Безопасность — 3 часа

> **Цель**: Audit logging для 152-ФЗ + шифрование health_data.

- [ ] **PROMPT**: `docs/tasks/2026-01-24-security-audit-log-encryption.md`

- [ ] **3.1** Создать audit_log таблицу
  - Триггеры на `clients`, `client_kv_store`
  - Логирование INSERT/UPDATE/DELETE с user_id, ip, timestamp
  - **Файл**: `database/2026-01-XX_audit_log.sql`

- [ ] **3.2** Шифрование health_data (Phase 2)
  - Колонка `v_encrypted BYTEA` в `client_kv_store`
  - Функции `encrypt_kv()` / `decrypt_kv()` с AES-256
  - Ключ в Yandex KMS / Lockbox

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

---

## 📊 Фаза 2: Мониторинг и Алерты — 3 часа

> **Проблема**: Система "слепа" — нет алертов о падениях и ошибках. **Цель**:
> Глубокий health check + UptimeRobot + Telegram алерты.

- [x] **2.1** Расширить health check
  - ✅ `yandex-cloud-functions/shared/health-check.js`
  - ✅ `yandex-cloud-functions/shared/pool-metrics.js`

- [ ] **2.2** Security alerting в maintenance
  - `checkSecurityAlerts()`: >10 событий/час → Telegram alert
  - **Файл**: `yandex-cloud-functions/heys-maintenance/index.js`

- [ ] **2.3** UptimeRobot для доступности
  - Monitoring `/health` каждые 5 минут
  - Alert в Telegram при downtime

---

## 📋 Фаза 4: Operations & DR — 4 часа

> **Цель**: Готовность к инцидентам и масштабированию.

- [x] **4.1** Создать Disaster Recovery Runbook
  - ✅ `DISASTER_RECOVERY_RUNBOOK.md` (493 строки)

- [ ] **4.2** Feature flag для ограничения регистраций
  - `MAX_ACTIVE_TRIALS` check в `start_trial_by_session`
  - Если >N активных триалов → "очередь заполнена"

- [ ] **4.3** Backup test procedure
  - Документировать процесс восстановления
  - Тестировать еженедельно на staging

---

## 🟢 Сегодня выполнено (2026-01-24)

### Storage Layer Refactoring

- [x] Unified storage helpers (`readStoredValue`/`writeStoredValue`) в 27
      модулях
- [x] Hidden products feature в `heys_storage_layer_v1.js`
- [x] Fallback lookup для products across clientId scopes

### Gamification UI

- [x] Weekly challenge card с progress indicators
- [x] Achievement details popup со stories
- [x] Rank ceremony modal с Lottie анимацией
- [x] Dark mode support

### Advice System

- [x] Storage helpers в advice модули
- [x] Improved advice persistence

### Day Modules

- [x] Recovery logging с throttling
- [x] Storage helpers в day modules

### Code Quality

- [x] JSDoc improvements для storage modules
- [x] Code formatting (IIFE spacing)
- [x] CSS styles для steps/APS

---

_Выполненные задачи → [done.md](./done.md)_ TODOEOF wc -l todo.md
