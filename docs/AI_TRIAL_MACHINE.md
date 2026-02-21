# Trial Machine v3.0 — Curator-Controlled Flow

> Этот файл содержит детальное описание Trial Machine для AI-агентов. Краткое
> описание см. в `.github/copilot-instructions.md` → Domain Knowledge.

## Subscription Statuses

| Status          | Description                              |
| --------------- | ---------------------------------------- |
| `none`          | Нет подписки                             |
| `trial_pending` | Одобрен, но дата старта в будущем (v3.0) |
| `trial`         | Активный триал (7 дней)                  |
| `active`        | Оплаченная подписка                      |
| `read_only`     | Триал/подписка истекла                   |

## Onboarding Flow

1. **Лендинг** → лид в `leads` таблицу (via `heys-api-leads` cloud function)
2. **Админка куратора** → видит лиды в секции «Лиды с сайта» (🌐)
3. **Конвертация лида** → `admin_convert_lead(lead_id, pin)` → создаёт клиента +
   добавляет в `trial_queue` (`status='queued'`)
4. **Активация триала** → куратор выбирает дату старта →
   `admin_activate_trial(client_id, start_date)`:
   - `start_date = сегодня` → `trial` немедленно (7 дней от NOW())
   - `start_date > сегодня` → `trial_pending` (ждём дату)
5. **Дата наступила** → `get_effective_subscription_status` переводит в `trial`
   (7 дней)
6. **Триал истёк** → `read_only` → paywall

## RPC Functions

```javascript
// Список лидов с лендинга
await HEYS.YandexAPI.rpc('admin_get_leads', { p_status: 'new' }); // new|converted|all

// Конвертация лида в клиента
await HEYS.YandexAPI.rpc('admin_convert_lead', {
  p_lead_id: 'uuid', // ⚠️ UUID, не INT!
  p_pin: '1234',
  p_curator_id: curatorId, // optional
});

// Активация триала с выбором даты
await HEYS.YandexAPI.rpc('admin_activate_trial', {
  p_client_id: clientId,
  p_start_date: '2026-02-15', // DATE format, default = CURRENT_DATE
  p_trial_days: 7, // default = 7
  p_curator_session_token: token, // optional
});
// Returns: { success, status, trial_started_at, trial_ends_at, is_future }
```

## Data Type Gotchas

- `leads.id` = **UUID** (не INT!)
- `clients` не имеет `created_at` (only `updated_at`)
- `trial_queue.status` CHECK:
  `('queued','offer','assigned','canceled','canceled_by_purchase','expired')`
- `trial_queue_events.event_type` CHECK:
  `('queued','offer_sent','claimed','offer_expired','canceled','canceled_by_purchase','purchased')`

## Adaptive Thresholds v2.0

- **3-Tier system:**
  - Tier 1 (FULL): 14+ days → computed thresholds, confidence up to 1.0
  - Tier 2 (PARTIAL): 7-13 days → hybrid compute + defaults
  - Tier 3 (DEFAULT): <7 days → prior-based defaults
- CASCADE strategy with `isCurrentPeriodCovered`
- Adaptive TTL (12-72h) based on behavior stability
- Event invalidation on goal/weight/pattern change
- Missing `profile` is **not fatal** — graceful degradation

## Advanced Confidence Layer v3.5.0

- Functions: `bayesianCorrelation`, `confidenceIntervalForCorrelation`,
  `detectOutliers`
- Reliable insights at any sample size (3d → 30d+)
- Detailed docs: `HEYS_Insights_v5_Deep_Analytics_c7.md` Section 8
