# HEYS MVP — Активные задачи

> Обновлено: 2025-12-27

---

## ✅ Триал-машина — E2E ТЕСТИРОВАНИЕ ПРОЙДЕНО

### 🎫 Backend (выполнено 2025-12-26)

- [x] Таблица `subscriptions` (client_id, status computed, trial_started_at,
      trial_ends_at, active_until)
- [x] Таблица `client_sessions` (session_token, client_id, expires_at)
- [x] RPC: `get_subscription_status_by_session(token)` — статус по сессии
- [x] RPC: `start_trial_by_session(token, days)` — старт триала (идемпотентно)
- [x] RPC: `subscription_can_write(client_id)` — write guard на сервере
- [x] Write guard на `save_client_kv`, `upsert_client_kv`,
      `batch_upsert_client_kv`, `delete_client_kv`
- [x] Trial Queue: `get_public_trial_capacity`, `request_trial`,
      `claim_trial_offer`
- [x] GRANT для heys_rpc роли
- [x] **KV Session Functions Fixed** (Bug #6, 2025-12-27):
  - [x] TYPE_HINTS `::jsonb` для JSONB параметров
  - [x] JSON.stringify() для pg driver JSONB
  - [x] Колонки `k`/`v` вместо `key`/`value` в 4 функциях
  - [x] PRIMARY KEY `(client_id, k)` вместо `(user_id, client_id, k)`

### 🖥️ Frontend (готов, ждёт тестирования)

- [x] `heys_subscription_v1.js` — `HEYS.Subscription` (getStatus, startTrial,
      useSubscription)
- [x] `heys_paywall_v1.js` — `HEYS.Paywall` (ReadOnlyBanner, showPaywall,
      canWriteSync)
- [x] Интеграция в `heys_morning_checkin_v1.js` — автостарт триала при
      регистрации
- [x] Интеграция в `heys_day_v12.js` — блокировка add water/meal/product

### 🧪 E2E Tests (пройдены 2025-12-27)

```bash
✅ verify_client_pin_v3 — Login работает, возвращает session_token
✅ get_subscription_status_by_session — "trial", days_left: 6
✅ batch_upsert_client_kv_by_session — {"saved": 1, "success": true}
✅ get_client_kv_by_session — {"found": true, "value": {...}}
✅ upsert_client_kv_by_session — {"success": true}
✅ delete_client_kv_by_session — {"deleted": true/false}
```

---

## 🟢 Текущие задачи

### 1. 🧪 E2E тестирование read_only режима ✅ ПРОЙДЕНО

**Описание**: Проверить блокировку записи при истёкшем триале  
**Время**: ~30 минут  
**Статус**: ✅ ПРОЙДЕНО 2025-12-27

**Чеклист:**

- [x] ~~Создать тестового клиента через куратора~~
- [x] ~~Авторизоваться — получить session_token~~
- [x] ~~Пройти утренний чек-ин — должен автоматически стартовать триал~~
- [x] ~~Проверить статус = "trial"~~
- [x] ~~Добавить продукт через KV sync — работает~~
- [x] Вручную истечь триал в БД
- [x] Проверить статус = "read_only" ✅
- [x] Попробовать batch_upsert — `{"error":"subscription_required"}` ✅
- [x] Проверить чтение — работает ✅

---

## 🔴 Блокеры (ждут внешних действий)

### 2. 💳 ЮKassa + Налоги

**Статус**: ⏸️ Ожидает регистрации и решения по налогам

**Блокеры:**

- [ ] Решение по юр.схеме: ИП (ПСН+УСН) или только УСН
- [ ] ОКВЭД: 63.11 (SaaS), 62.01, 62.09, 63.99.1 — НЕ медицина
- [ ] Регистрация в ЮKassa (shopId + secretKey)
- [ ] Фискализация: облачная касса + ОФД или "Чеки от ЮKassa"

**Код готов:**

- [x] Cloud Function `heys-api-payments`
- [x] Frontend интеграция (handlePayment, checkPendingPayment)
- [x] API Gateway роуты

**После разблокировки:**

- [ ] Деплой функции с секретами
- [ ] Webhook в ЮKassa
- [ ] Тестирование в sandbox
- [ ] Активация подписки при `payment_succeeded`

---

## ✅ Выполнено

- [x] **🎫 Триал-машина** — backend + frontend + smoke tests (2025-12-26)
- [x] **🔒 Read-only режим** — write guard + paywall UI (2025-12-26)
- [x] SMS.ru интеграция — отправитель "HEYS" работает
- [x] SMS прокси через API server (CORS bypass)
- [x] Юридика — согласия, ПЭП, SMS верификация
- [x] Landing page — форма, Telegram уведомления
- [x] Yandex Cloud PostgreSQL — миграция данных
- [x] Cloud Functions — RPC, REST, SMS, Leads, Health, Auth
- [x] **Платежи код** — Cloud Function + Frontend интеграция
- [x] **Consents RPC** — 4 функции (log, check, revoke, get) работают
- [x] **RU инфраструктура (152-ФЗ)** — PostgreSQL на Yandex.Cloud

---

## 📋 Порядок работы

```
1. 🔄 Триал-машина ← СЕЙЧАС (не зависит от платежей!)
   ↓
2. Read-only режим
   ↓
3. ⏸️ ЮKassa + Налоги (блокер)
   ↓
4. Активация подписок
```
