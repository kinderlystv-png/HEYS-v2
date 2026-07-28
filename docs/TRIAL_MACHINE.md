# 🎫 HEYS Trial Machine

> **v3.0** | 2026-02-09 | Документация триал-системы (curator picks start date)

---

## 📊 Quick Reference

### Статусы подписки (`subscription_status`)

| Статус          | Описание                               | Запись | Чтение |
| --------------- | -------------------------------------- | ------ | ------ |
| `none`          | Нет подписки, не одобрен               | ❌     | ❌     |
| `trial_pending` | Куратор одобрил, дата старта в будущем | ✅     | ✅     |
| `trial`         | Пробный период (7 дней от start_date)  | ✅     | ✅     |
| `active`        | Оплаченная подписка                    | ✅     | ✅     |
| `read_only`     | Триал/подписка истекла                 | ❌     | ✅     |

### Тарифы (`PLANS`)

| Тариф    | Цена/мес | Описание                             |
| -------- | -------- | ------------------------------------ |
| **Base** | 1 990 ₽  | Приложение + 1 чек-ин/неделю (async) |
| **Pro**  | 12 990 ₽ | + Ведение дневника + чат + созвон    |
| **Pro+** | 19 990 ₽ | + 7/7 режим + mid-week чек-ин        |

### Константы

```javascript
TRIAL_DAYS = 7; // Длительность триала (дней)
```

---

## 🔄 Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                   TRIAL LIFECYCLE (v3.0)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   [Потенциальный клиент]                                             │
│          │                                                           │
│          ▼                                                           │
│   ┌──────────────┐                                                   │
│   │  Landing     │  Оставляет заявку (имя, телефон, мессенджер)      │
│   │  heyslab.ru  │  → leads таблица                                 │
│   └──────┬───────┘                                                   │
│          │  heys-api-leads → INSERT INTO leads                       │
│          ▼                                                           │
│   ┌──────────────┐                                                   │
│   │    LEADS     │  Куратор видит в админке (секция «Лиды с сайта»)  │
│   │   (новый)    │  Связывается с клиентом, обсуждает программу      │
│   └──────┬───────┘                                                   │
│          │                                                           │
│          ▼  admin_convert_lead(lead_id, pin)                         │
│   ┌──────────────┐                                                   │
│   │   CLIENT     │  Создан аккаунт (phone + PIN)                     │
│   │  + QUEUED    │  Добавлен в trial_queue (status='queued')         │
│   └──────┬───────┘                                                   │
│          │                                                           │
│          ├── Куратор отклоняет ──→ status = 'rejected'               │
│          │                                                           │
│          ▼  Куратор: admin_activate_trial(client_id, start_date)     │
│   ┌──────────────┐                                                   │
│   │ start_date = │  Если сегодня → сразу TRIAL (7 дней)             │
│   │   сегодня?   │  Если будущая дата → TRIAL_PENDING               │
│   └──────┬───────┘                                                   │
│          │                                                           │
│    ┌─────┴─────┐                                                     │
│    ▼           ▼                                                     │
│  TRIAL    trial_pending                                              │
│ (7 дней)  (ждём дату)                                                │
│    │           │                                                     │
│    │     дата наступила                                              │
│    │           │                                                     │
│    │      ┌────▼───┐                                                 │
│    │      │ TRIAL  │                                                 │
│    │      │(7 дней)│                                                 │
│    │      └────┬───┘                                                 │
│    │           │                                                     │
│    ├───────────┤                                                     │
│    ▼           ▼                                                     │
│  ┌──────┐  ┌──────────┐  ┌───────────┐                               │
│  │ОПЛАТА│  │  ИСТЁК   │  │ ОТМЕНЁН   │                               │
│  │active│  │read_only │  │ canceled  │                               │
│  └──────┘  └──────────┘  └───────────┘                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Ключевой принцип

**Куратор полностью контролирует триал.** Он выбирает дату начала:

- Сегодня → триал сразу (7 дней)
- Будущая дата → trial_pending, автоматический переход в trial когда наступит

---

## 🏗️ Архитектура системы

### Компоненты системы

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├──────────────────────────────┬──────────────────────────────────┤
│  heys_subscription_v1.js     │  Core: STATUS, getStatus(),      │
│                              │  activateTrialTimer(),            │
│                              │  canWrite(), useSubscription()   │
├──────────────────────────────┼──────────────────────────────────┤
│  heys_subscriptions_v1.js    │  UI: PLANS, PlanCard,            │
│                              │  SubscriptionSection             │
├──────────────────────────────┼──────────────────────────────────┤
│  heys_trial_queue_v1.js      │  Queue: requestTrial(),          │
│                              │  getQueueStatus(),               │
│                              │  useTrialQueue(), AdminUI        │
├──────────────────────────────┼──────────────────────────────────┤
│  heys_paywall_v1.js          │  Paywall: PaywallModal           │
│                              │  (read_only → предложение оплаты)│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          BACKEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  heys-api-rpc (Yandex Cloud Function)                            │
│  ├── request_trial                    (public)                   │
│  ├── get_trial_queue_status           (session)                  │
│  ├── cancel_trial_queue               (session)                  │
│  ├── get_public_trial_capacity        (public)                   │
│  ├── get_subscription_status_by_session (session)                │
│  ├── activate_trial_timer_by_session  (session) ← DEPRECATED    │
│  ├── admin_activate_trial             (admin)   ← v3.0 +date    │
│  ├── admin_reject_request             (admin)                    │
│  ├── admin_get_leads                  (admin)   ← NEW v3.0      │
│  └── admin_convert_lead               (admin)   ← NEW v3.0      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         DATABASE                                 │
├─────────────────────────────────────────────────────────────────┤
│  subscriptions (source of truth)                                 │
│  ├── trial_approved_at   │ Когда куратор одобрил                │
│  ├── trial_started_at    │ Дата старта (куратор выбирает)       │
│  ├── trial_ends_at       │ trial_started_at + 7 days            │
│  ├── active_until        │ Оплаченная подписка до               │
│  └── canceled_at         │ Отмена подписки                      │
├─────────────────────────────────────────────────────────────────┤
│  trial_queue                                                     │
│  ├── status              │ queued | assigned | canceled         │
│  ├── client_id           │ FK → clients                         │
│  └── assigned_at         │ Когда куратор одобрил                │
├─────────────────────────────────────────────────────────────────┤
│  clients (denormalized, для обратной совместимости)               │
│  ├── subscription_status │ Копия из get_effective_status        │
│  ├── trial_started_at    │ Копия из subscriptions               │
│  └── trial_ends_at       │ Копия из subscriptions               │
└─────────────────────────────────────────────────────────────────┘
```

### Вычисляемый статус (SQL)

```sql
-- get_effective_subscription_status(client_id) — v3.0
CASE
  WHEN active_until > NOW()                                           THEN 'active'
  WHEN trial_started_at <= NOW() AND trial_ends_at > NOW()            THEN 'trial'
  WHEN trial_approved_at IS NOT NULL AND trial_started_at > NOW()     THEN 'trial_pending'
  WHEN trial_started_at IS NOT NULL OR active_until IS NOT NULL       THEN 'read_only'
  ELSE 'none'
END
```

---

## 🔌 API Reference

### JS API: `HEYS.Subscription`

```javascript
// Статусы
HEYS.Subscription.STATUS = {
  NONE: 'none',
  TRIAL_PENDING: 'trial_pending',
  TRIAL: 'trial',
  ACTIVE: 'active',
  READ_ONLY: 'read_only',
};

// Получить статус (v3.0: no auto-trigger, curator controls start date)
const status = await HEYS.Subscription.getStatus();

// Хелперы
HEYS.Subscription.canWrite(status); // true for trial_pending, trial, active
HEYS.Subscription.shouldShowPaywall(status); // true for read_only
HEYS.Subscription.isActive(status); // true for trial_pending, trial, active

// React hook
const {
  status,
  isLoading,
  isTrialPending,
  isTrial,
  isActive,
  isReadOnly,
  canWrite,
  meta,
  refresh,
} = HEYS.Subscription.useSubscription();
```

### JS API: `HEYS.TrialQueue`

```javascript
// Запрос в очередь (с лендинга или приложения)
await HEYS.TrialQueue.requestTrial('landing');

// Статус в очереди
await HEYS.TrialQueue.getQueueStatus();

// Отмена заявки
await HEYS.TrialQueue.cancelQueue();

// React hook
const {
  capacity,
  queueStatus,
  isLoading,
  requestTrial,
  cancelQueue,
  isPending,
  isAssigned,
} = HEYS.TrialQueue.useTrialQueue();

// Admin API (для кураторов)
await HEYS.TrialQueue.admin.getQueueList();
await HEYS.TrialQueue.admin.activateTrial(clientId, '2026-02-15'); // v3.0: with start date
await HEYS.TrialQueue.admin.rejectApplication(clientId, reason);
await HEYS.TrialQueue.admin.getLeads('new'); // v3.0: leads from landing
await HEYS.TrialQueue.admin.convertLead(leadId, '1234'); // v3.0: create client from lead
```

### RPC API (Backend)

| Функция                              | Доступ  | Описание                                  |
| ------------------------------------ | ------- | ----------------------------------------- |
| `request_trial`                      | Public  | Создать заявку в очередь                  |
| `get_trial_queue_status`             | Session | Статус заявки (pending/assigned/rejected) |
| `cancel_trial_queue`                 | Session | Отменить заявку                           |
| `get_public_trial_capacity`          | Public  | Свободных слотов / принимает ли очередь   |
| `get_subscription_status_by_session` | Session | Статус подписки (вычисляемый)             |
| `activate_trial_timer_by_session`    | Session | @deprecated v3.0 (куратор выбирает дату)  |
| `admin_activate_trial`               | Admin   | Активировать триал с выбором даты (v3.0)  |
| `admin_reject_request`               | Admin   | Отклонить заявку                          |
| `admin_extend_subscription`          | Admin   | Продлить доступ клиента с ownership gate  |
| `admin_get_leads`                    | Admin   | Список лидов с лендинга (v3.0)            |
| `admin_convert_lead`                 | Admin   | Создать клиента из лида (v3.0)            |

### Серверный write guard

```sql
-- subscription_can_write(client_id) проверяется на каждую запись в KV:
-- save_client_kv, upsert_client_kv, batch_upsert_client_kv, delete_client_kv
-- Разрешает: active, trial
-- Блокирует: trial_pending, read_only, none
```

---

## 📁 File Structure

```
apps/web/
├── heys_subscription_v1.js       # Core: STATUS, getStatus(), activateTrialTimer()
├── heys_subscriptions_v1.js      # UI: PLANS, PlanCard, SubscriptionSection
├── heys_trial_queue_v1.js        # Queue: requestTrial(), AdminUI
└── heys_paywall_v1.js            # Paywall: PaywallModal

database/
├── 2025-01-09_simplified_trial_queue.sql     # Trial queue (pending → assigned)
├── 2025-12-24_subscriptions_and_sessions_yc.sql  # Subscriptions + sessions (YC)
├── 2025-12-25_subscription_write_guard.sql   # Write guard (KV protection)
├── 2025-01-10_fix_subscription_sync.sql      # Fix clients↔subscriptions sync
├── 2026-02-04_extend_trials.sql              # legacy admin_extend_trial (runtime retired)
├── 2026-02-08_trial_machine_fix.sql          # v2.0: trial_approved_at + timer split
└── 2026-02-09_trial_machine_v3.sql           # v3.0: curator picks start date + leads
```

---

## 🔧 Troubleshooting

| Проблема                       | Причина                                | Решение                                         |
| ------------------------------ | -------------------------------------- | ----------------------------------------------- |
| Клиент не может писать данные  | Статус `none` или `read_only`          | Проверить `subscriptions` таблицу               |
| Таймер 7 дней не стартовал     | start_date в будущем (`trial_pending`) | Дождаться даты или изменить в админке           |
| Статус `trial_pending` висит   | Дата старта ещё не наступила           | Проверить `subscriptions.trial_started_at`      |
| «Нет свободных слотов»         | `is_accepting = false`                 | Куратор включает приём в админ-панели           |
| clients.status ≠ subscriptions | Десинхронизация таблиц                 | Миграция из `2025-01-10_fix_*` + `2026-02-08_*` |

---

## Changelog

| Версия | Дата       | Изменения                                                    |
| ------ | ---------- | ------------------------------------------------------------ |
| v3.0   | 2026-02-09 | Curator picks start date, leads management, date picker UI   |
| v2.0   | 2026-02-08 | Curator-gated flow, trial_approved_at, timer на первый логин |
| v1.0   | 2025-01-10 | Первоначальная версия документации                           |
