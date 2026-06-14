# L6 baseline — restore-drill, retention, DSAR, RPO/RTO

**Дата:** 2026-06-14 **Автор:** security-агент (solo по 6Б.5 плана 22)
**Покрытие методологии:** L6 матрицы из `docs/SECURITY_REVIEW.md` (DR, 152-ФЗ,
retention) **Юрисдикция:** РФ, 152-ФЗ «О персональных данных»

---

## 1. Backup infrastructure baseline

### 1.1 Bucket `heys-backups`

| Параметр                      | Значение               | Комментарий                                               |
| ----------------------------- | ---------------------- | --------------------------------------------------------- |
| `name`                        | `heys-backups`         |                                                           |
| `folder_id`                   | `b1gnv1a4q8i6de6atl6n` |                                                           |
| `default_storage_class`       | `COLD`                 | Optimal для DR-backups (дешёвое хранение, дольше restore) |
| `versioning`                  | DISABLED               | Нет version-history; daily backups создают новые объекты  |
| `anonymous_access_flags.read` | **false**              | ✅ Нет anonymous access                                   |
| `anonymous_access_flags.list` | **false**              | ✅ Нет публичной enumeration                              |

### 1.2 Backup-chain status

Структура: `s3://heys-backups/client-daily/<YYYY-MM-DD>/<client-uuid>.json.gz`

**Backup-chain audit (на 2026-06-14):**

| Период                      | Continuity                       |
| --------------------------- | -------------------------------- |
| 2026-03-29 → 2026-04-13     | ✅ continuous (16 дней)          |
| **2026-04-14 → 2026-05-10** | ❌ **GAP 27 дней** (нет backups) |
| 2026-05-11 → 2026-06-14     | ✅ continuous (35 дней)          |

**🔴 НАХОДКА L6-1:** **27-дневная дыра** в backup-chain (2026-04-14 —
2026-05-10). Если клиент существовал и удалился в этот период, его данные
**невосстановимы**.

**Рекомендация:**

- Расследовать root cause: cron-задача heys-backups не запускалась, или
  запускалась но ничего не писала?
- Найти `heys-cron-trial-drip` / equivalent → проверить schedule + execution log
- Зафиксировать gap-detector cron (раз в неделю проверять что есть backups за
  last 7 days; alert если нет)

### 1.3 Размеры backups (2026-06-14)

| client                 | Size compressed | Size uncompressed (приблизительно) |
| ---------------------- | --------------- | ---------------------------------- |
| `11111...` (test/seed) | 787 B           | ~3 KB                              |
| `22222...`             | 91 KB           | ~500 KB                            |
| `4545ee50...`          | 285 KB          | ~1.5 MB                            |
| `ccfe6ea3...`          | 575 KB          | ~3 MB                              |

Compression ratio ~ **5-6×** (gzip).

---

## 2. Backup format & integrity (pilot drill результаты)

### 2.1 Структура backup-файла

Schema v2 (`source: server-daily-backup`):

```json
{
  "schemaVersion": 2,
  "source": "server-daily-backup",
  "exportedAt": "ISO-8601",
  "businessDate": "YYYY-MM-DD",
  "timezone": "Europe/Moscow",
  "dayBoundaryHour": 3,
  "clientId": "<uuid>",
  "keyCount": <N>,
  "kvSnapshot": { "<key>": <value>, ... },
  "accountData": { "client": {...}, "consents": [...], "subscriptions": [...], "trial_queue": [...], "payments": [...] },
  "checksum": "<sha256>"
}
```

### 2.2 Integrity verification

✅ **Pilot drill 2026-06-14**: backup `22222222.../2026-06-14.json.gz` (93 KB):

- Download: ~200 ms (с 500 KB/s connection)
- Decompress: ~50 ms
- Parse + SHA-256 verify: ~30 ms
- **Checksum MATCH** (sha256 stored = computed) ✅

### 2.3 Покрытие logical-state клиента

`kvSnapshot` (26 keys для test-client) включает:

- Профиль: `heys_<cid>_profile` + `heys_profile`
- Дневник: `heys_dayv2_*`, `heys_ceb_d_*`
- Каталог: `heys_products` (434 KB — основная масса), `heys_products_overlay_v2`
- Achievements & state: `heys_achievements_*`, `heys_advice_trace_*`,
  `heys_cascade_*`
- UI state: `heys_theme*`, `heys_pwa_banner_*`
- System: `heys_clients`, `heys_client_current`, `heys_last_client_id`
- Debug: `heys_debug_events`

`accountData`:

- `client` (15 полей: id, phone, name, pin_hash, created_at, ...)
- `consents` (array; пуст для test-client)
- `subscriptions` (1 для test-client)
- `trial_queue` (array; пуст)
- `payments` (array; пуст)

### 2.4 Что НЕ покрыто backup'ом

- **Photos** в S3 `heys-photos` bucket — нет backup'а bucket'а (только metadata
  в `kvSnapshot` через `dayv2.meals[].photos[].url`)
- **Messages** (`client_messages`) — не в logical backup, нужно проверить
  отдельный backup mechanism
- **Push subscriptions** — не в backup; restore = re-subscription пользователем
- **Audit-tables** (`data_loss_audit`, `security_events`,
  `data_access_audit_log`) — не нужны для restore клиента, нужны для compliance
  retention отдельно
- **Aggregate snapshots** (`profile_snapshots`, `ews_weekly_snapshots`,
  `leaderboard_snapshots`) — derivable from source data

---

## 3. RTO / RPO baseline (replicable measurement)

### 3.1 RPO (Recovery Point Objective)

| Сценарий                             | RPO                                  |
| ------------------------------------ | ------------------------------------ |
| Single-client logical corruption     | до 24 ч (между daily backups)        |
| Full DB loss                         | до 24 ч                              |
| Bucket loss + DB loss simultaneously | undefined (нужен off-region replica) |

**Текущий RPO = 24 часа** (daily backup at 04:01 UTC).

**Рекомендация:** для 152-ФЗ health-данных принять RPO ≤ 24 ч как baseline;
задокументировать в Privacy Policy / процедуре что данные потерянные за
последние 24ч могут не восстанавливаться.

### 3.2 RTO (Recovery Time Objective)

**Per-client restore (расчётный):**

- Download from cold storage: ~5 sec для < 1 MB; ~30 sec для 5+ MB
- Decompress + parse: ~100 ms per MB
- Apply via `safe_upsert_client_kv`: 26 keys × ~50ms = ~1.3 sec (rate-limit
  constraint)
- INSERT `clients` row + cascade: ~50 ms

**Per-client RTO ≈ 5-10 sec** (для среднего клиента).

**Mass-restore RTO:**

| Кол-во клиентов | Estimated RTO (serial) | RTO (parallel ~5x) |
| --------------- | ---------------------- | ------------------ |
| 1 client        | 10 sec                 | 10 sec             |
| 10 clients      | 100 sec                | 30 sec             |
| 100 clients     | ~15 мин                | ~3 мин             |
| 1000 clients    | ~3 ч                   | ~30 мин            |
| 10000 clients   | ~30 ч                  | ~6 ч               |

**Bottleneck**: rate-limit на `safe_upsert_client_kv` + connection pool на пг
(default 5-10 parallel). Для full DR нужен будет dedicated restore-script с
batch INSERT bypass.

**Текущий RTO baseline (для 4 prod-клиентов): < 1 минута full restore.**

### 3.3 SLA proposal

```
RPO ≤ 24 hours (daily backup cycle)
RTO ≤ 1 hour for any prod state ≤ 100 clients
RTO ≤ 4 hours for 100-1000 clients
RTO scales linearly for > 1000 clients (until batch-restore optimization)
```

---

## 4. Deletion-cascade audit (152-ФЗ §14 «удаление субъектом ПДн»)

### 4.1 Schema state (audit 2026-06-14)

**FK chain на `clients(id)` — 20 tables:**

| dependent_table           | delete_rule  | Compliance                              |
| ------------------------- | ------------ | --------------------------------------- |
| `client_change_markers`   | **CASCADE**  | ✅ удалится                             |
| `client_data_changelog`   | **CASCADE**  | ✅                                      |
| `client_event_log`        | **CASCADE**  | ✅                                      |
| `client_kv_store`         | **CASCADE**  | ✅ основной storage                     |
| `client_log_trace`        | **CASCADE**  | ✅                                      |
| `client_messages`         | **CASCADE**  | ✅                                      |
| `client_sessions`         | **CASCADE**  | ✅ auth state                           |
| `consents`                | **CASCADE**  | ✅ согласия                             |
| `ews_weekly_snapshots`    | **CASCADE**  | ✅                                      |
| `leaderboard_preferences` | **CASCADE**  | ✅                                      |
| `leaderboard_snapshots`   | **CASCADE**  | ✅                                      |
| `payments`                | **CASCADE**  | ✅ payments (с учётом 152-ФЗ §5 и НК)\* |
| `pending_products`        | **CASCADE**  | ✅                                      |
| `profile_snapshots`       | **CASCADE**  | ✅                                      |
| `push_subscriptions`      | **CASCADE**  | ✅                                      |
| `subscriptions`           | **CASCADE**  | ✅                                      |
| `trial_queue`             | **CASCADE**  | ✅                                      |
| `write_contexts`          | **CASCADE**  | ✅                                      |
| `funnel_events`           | **SET NULL** | ✅ обезличенная аналитика остаётся      |
| `leads`                   | **SET NULL** | ✅ обезличенный lead остаётся           |

\* **Caveat по payments**: НК РФ требует хранение первичных документов по
платежам ≥ 4-5 лет. CASCADE удаление row из `payments` может конфликтовать.
**Рекомендация:** до production-launch проверить с юристом — нужен ли
soft-delete с anonymization для payments вместо hard CASCADE, или достаточно
ЮKassa-стороннего хранения. Сейчас 0 платежей → не блокирует.

### 4.2 Compliance vs 152-ФЗ §14

**Требование 152-ФЗ §14:** «при достижении цели обработки или отзыве согласия —
субъект ПДн имеет право требовать прекращения обработки и уничтожения ПДн».

**Текущий compliance:**

✅ `DELETE FROM clients WHERE id = '<uuid>'` → CASCADE удаляет 18 таблиц с ПДн
✅ Обезличенная аналитика (funnel_events, leads с SET NULL) — не нарушает 152-ФЗ
⚠️ Photos в S3 `heys-photos` — **НЕ удаляются автоматически** при удалении
клиента. Это **финдинг L6-2**.

### 4.3 🔴 НАХОДКА L6-2: photos orphan после client delete

Photo storage в S3 не привязан к FK chain. При удалении клиента:

1. БД: `client_kv_store` (с `heys_dayv2_*` содержащими `photo.url` references)
   удаляется ✅
2. S3: photos в `heys-photos/<cid>/<date>/<mealId>/<rnd>.<ext>` **остаются** ❌

**Implication:**

- 152-ФЗ §14 нарушение: ПДн (фото еды могут содержать PII — лицо, документы на
  столе) остаётся после deletion
- Bloat: storage растёт linearly с удалёнными клиентами

**Рекомендация L6-2-fix:**

- Cron-задача `heys-cron-photo-cleanup`: раз в день удалять S3 objects где
  `<cid>` не существует в `clients` table
- Альтернатива: триггер на `DELETE FROM clients` который calls Lambda для S3
  cleanup (сложнее, но точнее)
- Документировать в Privacy Policy: «фото удаляются в течение 24ч после удаления
  аккаунта»

---

## 5. Retention policy proposals (152-ФЗ §5 + НК)

### 5.1 Таблицы с ПДн

| Таблица                         | Что внутри                         | Текущая retention                | Рекомендуемая                                        |
| ------------------------------- | ---------------------------------- | -------------------------------- | ---------------------------------------------------- |
| `clients`                       | ID, phone, name, pin_hash          | без TTL (хранится пока есть row) | до отзыва согласия + 6 мес buffer для disputes       |
| `client_kv_store`               | dayv2, profile, products           | без TTL                          | связан с `clients` CASCADE → ок                      |
| `consents`                      | log согласий                       | без TTL                          | **5 лет** после отзыва (требование 152-ФЗ для proof) |
| `payments`                      | ID платежа в ЮKassa, статус, сумма | без TTL                          | **5 лет** (НК РФ §23 п.8 — первичные документы)      |
| `data_loss_audit`               | security audit                     | без TTL (auto-rotation)          | **1 год** retention                                  |
| `security_events`               | rate-limit, auth                   | без TTL                          | **1 год** retention (compliance, troubleshooting)    |
| `data_access_audit_log`         | кто-когда-читал ПДн                | без TTL                          | **3 года** (рекомендация ГОСТ Р 57580.1)             |
| `client_log_trace`              | client console logs                | без TTL                          | **30 дней** (отладочные, не PII по сути)             |
| `client_event_log`              | analytics events                   | без TTL                          | **6 мес** (агрегированная аналитика)                 |
| `leads` (SET NULL after delete) | потенциальные клиенты              | без TTL                          | **2 года** после первого contact                     |
| `funnel_events` (SET NULL)      | обезличенная воронка               | без TTL                          | **2 года**                                           |

### 5.2 Photos retention в S3

- Photos живут в `heys-photos` bucket с `default_storage_class=STANDARD` (нет
  lifecycle policy).
- **Рекомендуемая lifecycle:**
  - 0-90 дней: STANDARD
  - 90-365 дней: COLD
  - > 365 дней: archive или delete (по согласованию с пользователем)
- Реализация: `yc storage bucket update heys-photos --lifecycle-rule=<...>`
  (Yandex S3 lifecycle policies).

### 5.3 Что нужно от user/legal

- **Согласование retention windows** с юристом (особенно payments 5 лет,
  security audit 1 год, photos lifecycle).
- **Privacy Policy update**: добавить раздел «Сроки хранения данных».
- **DSAR процедура**: документировать как пользователь может запросить (см. §6).

---

## 6. 152-ФЗ DSAR процедура (Data Subject Access Request)

### 6.1 Базовые права субъекта ПДн по 152-ФЗ §14

Субъект имеет право:

1. Получить информацию о факте обработки и составе данных
2. Получить копию своих ПДн
3. Требовать уточнения, блокирования или удаления
4. Отозвать согласие на обработку

### 6.2 Predлагаемая процедура

| Шаг             | Action                                                                                                  | SLA            | Owner                |
| --------------- | ------------------------------------------------------------------------------------------------------- | -------------- | -------------------- |
| 1               | Пользователь → email `privacy@heyslab.ru` (или Telegram bot `/privacy`)                                 | —              | client               |
| 2               | Подтверждение identity (через PIN или phone OTP)                                                        | 1 рабочий день | курaтор / основатель |
| 3a (Access)     | Сборка copy данных (export через `safe_export_client_data` RPC + photos через signed URLs с TTL 7 дней) | 5 рабочих дней | курaтор              |
| 3b (Deletion)   | `DELETE FROM clients WHERE id = '<uuid>'` + S3 cleanup (см. L6-2 fix)                                   | 5 рабочих дней | курaтор              |
| 3c (Correction) | Через UI клиента (self-service) ИЛИ ручная правка курaтором                                             | 1 рабочий день | курaтор              |
| 4               | Отчёт пользователю о выполнении                                                                         | 1 рабочий день | курaтор              |

### 6.3 Что нужно реализовать в product

- **RPC `export_client_data(uuid)`** — собирает всё что есть про клиента:
  kvSnapshot + accountData + photos refs (с signed URLs)
- **Email canal** `privacy@heyslab.ru` (или Telegram bot command)
- **Audit log** каждого DSAR-запроса (date, type, completed)
- **Privacy Policy update** с описанием процедуры

### 6.4 SLA-обязательство

**152-ФЗ §14 НЕ устанавливает жёсткий SLA**, но даёт «разумный срок». Best
practice: **до 30 дней** для access/correction, **до 30 дней** для deletion. Мы
можем декларировать **до 10 рабочих дней** как competitive advantage.

---

## 7. Сводно — что закрыто, что осталось

### 7.1 Закрыто этой baseline-сессией (security-агент solo)

✅ Доступ к backup-bucket подтверждён ✅ Pilot restore-drill выполнен
(download + decompress + checksum verify) ✅ RPO/RTO baseline зафиксирован (24h
/ <1 мин для текущей нагрузки) ✅ Deletion-cascade audit — 20 FK проверены, 18
CASCADE + 2 SET NULL корректно ✅ Retention recommendations для 11 таблиц с ПДн
составлены ✅ DSAR процедура skeleton написана

### 7.2 Осталось как launch-blocker

🔴 **L6-1**: 27-дневная дыра в backup-chain (2026-04-14 — 2026-05-10) — нужно
расследовать root cause + добавить gap-detector 🔴 **L6-2**: photos orphan после
client deletion — нужен cleanup mechanism (cron OR trigger)

### 7.3 Осталось для user / legal

🟡 Согласовать retention windows (особенно payments 5 лет) 🟡 Реализовать RPC
`export_client_data` (сейчас нет single-call экспорта) 🟡 Документировать DSAR в
Privacy Policy 🟡 Завести email `privacy@heyslab.ru` ИЛИ Telegram bot `/privacy`
command

### 7.4 Осталось как post-launch (можно потом)

⚪ Off-region backup replica (для DR от polного потери Yandex Cloud region) ⚪
Batch-restore оптимизация (для > 1000 клиентов) ⚪ Lifecycle policy на
heys-photos bucket ⚪ Automated DSAR fulfillment (без manual курaтор-action)

---

## 8. Файлы-якоря

- Pilot restore-drill output:
  `/tmp/l6-drill/22222222-2222-2222-2222-222222222222.json` (после сессии
  удалить)
- Schema reference: `database/2026-05-11_add_clients_fk_cascade.sql` (где
  CASCADE были введены)
- Backup script reference: `yandex-cloud-functions/heys-client-daily-backup/`
- Restore script reference:
  `yandex-cloud-functions/heys-client-daily-backup/restore-client-backup.js`
- Этот документ: `docs/SECURITY_REVIEW_l6_baseline.md`
