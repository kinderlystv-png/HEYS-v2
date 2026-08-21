# HEYS Disaster Recovery Runbook

**Version**: 1.0  
**Last Updated**: 2026-01-23  
**Severity Levels**: P0 (Critical) | P1 (High) | P2 (Medium) | P3 (Low)

---

## 🚨 Emergency Contacts

| Role                 | Contact            | Availability |
| -------------------- | ------------------ | ------------ |
| Database Admin       | [TBD]              | 24/7         |
| DevOps Lead          | [TBD]              | 24/7         |
| Yandex Cloud Support | +7 (495) 739-70-00 | 24/7         |
| On-Call Engineer     | [TBD]              | Rotation     |

---

## Scenario 1: Connection Pool Exhaustion (P1)

### Symptoms

- ❌ Errors: "timeout acquiring client from pool"
- ❌ High response latency (>5s)
- ❌ Pool utilization >95%
- ❌ `waitingCount > 10` in metrics

### Immediate Actions (5 minutes)

1. **Check pool metrics**

   ```bash
   yc serverless function logs heys-api-rpc --filter "[Pool-Metrics]" --since 10m
   ```

2. **Identify blocked connections**

   ```sql
   -- Connect to PostgreSQL
   SELECT pid, state, wait_event, query_start, query
   FROM pg_stat_activity
   WHERE datname = 'heys_production'
     AND state = 'active'
   ORDER BY query_start;
   ```

3. **Emergency pool size increase**

   ```bash
   # Quick fix: increase pool size
   yc serverless function version create \
     --function-name=heys-api-rpc \
     --environment POOL_MAX_SIZE=10 \
     --source-path ./heys-api-rpc.zip
   ```

4. **Monitor recovery**
   ```bash
   # Watch metrics in real-time
   watch -n 5 'yc serverless function logs heys-api-rpc --filter "[Pool-Metrics]" --since 1m'
   ```

### Root Cause Analysis (30 minutes)

1. Check for slow queries
2. Review application logs for connection leaks
3. Analyze traffic patterns (DDoS?)
4. Verify no code changes released recently

### Long-term Fix

- [ ] Tune pool size based on load (see `POOL_TUNING_GUIDE.md`)
- [ ] Add query timeout enforcement
- [ ] Implement circuit breaker pattern
- [ ] Set up alerting for pool utilization >80%

---

## Scenario 2: Database Connection Failure (P0)

### Symptoms

- ❌ All functions returning 500 errors
- ❌ Logs: "ECONNREFUSED" or "connection timeout"
- ❌ Health checks failing

### Immediate Actions (2 minutes)

1. **Check database status**

   ```bash
   # Via Yandex Cloud Console
   # Managed PostgreSQL → Clusters → heys_production → Status

   # Or via CLI
   yc managed-postgresql cluster get heys_production --format json | jq '.status'
   ```

2. **Verify network connectivity**

   ```bash
   # From any Cloud Function
   yc serverless function invoke heys-api-rpc --data '{"test": "connection"}'
   ```

3. **Check for maintenance window**
   ```bash
   yc managed-postgresql cluster list-operations --cluster-name heys_production
   ```

### Recovery Steps

**If database is down:**

```bash
# 1. Contact Yandex Cloud Support IMMEDIATELY
# 2. Check for automatic failover
yc managed-postgresql cluster list-hosts --cluster-name heys_production

# 3. If no automatic recovery, manual failover
yc managed-postgresql cluster start-failover \
  --cluster-name heys_production \
  --host <master-host-name>
```

**If network issue:**

```bash
# 1. Check security groups
yc vpc security-group list

# 2. Verify Cloud Functions subnet has access to DB
# Console → VPC → Subnets → Check routing
```

**If credentials issue:**

```bash
# 1. Verify password in function environment
yc serverless function version list --function-name heys-api-rpc

# 2. Reset password if needed
yc managed-postgresql user update heys_admin \
  --cluster-name heys_production \
  --password <new-password>

# 3. Update all functions with new password
./update-all-functions-password.sh <new-password>
```

---

## Scenario 3: Backup Failure (P2)

### Symptoms

- ⚠️ Telegram alert: "Backup failed"
- ⚠️ No recent backups in S3 bucket
- ⚠️ Managed PostgreSQL backup failed

### Immediate Actions (10 minutes)

1. **Проверить что Yandex Managed PG backup продолжает идти**

   ```bash
   yc managed-postgresql cluster list-backups c9qk0squejja8jast509 --format json \
     | jq -r '.[0] | "latest:\(.created_at) size:\(.size)"'
   # Если latest старше 36ч — реальная проблема.
   ```

2. **Проверить per-client KV-snapshot функцию (heys-client-daily-backup)**

   ```bash
   yc serverless function logs heys-client-daily-backup --since 36h
   aws s3 ls s3://heys-backups/client-daily/$(date +%Y-%m-%d)/ \
     --endpoint-url https://storage.yandexcloud.net
   ```

3. **Размер БД**

   ```sql
   SELECT pg_database_size('heys_production') / 1024 / 1024 / 1024 AS size_gb;
   ```

4. **Manual one-off backup (если YC автомат сломан)**

   ```bash
   # Запрос внеочередного backup через YC CLI:
   yc managed-postgresql cluster backup c9qk0squejja8jast509

   # Или ручной pg_dump:
   pg_dump -h <host> -p 6432 -U heys_admin -F c -b heys_production \
     > manual_backup_$(date +%Y%m%d_%H%M%S).dump
   ```

### Root Cause Investigation

**Check common issues:**

```bash
# 1. YC quota issues?
yc compute quota list --format json | jq '.[] | select(.metric=="managed-postgresql.backupStorageSize")'

# 2. Cluster status?
yc managed-postgresql cluster get c9qk0squejja8jast509 --format json \
  | jq '{status, health, config: .config.backup_window_start}'

# 3. PostgreSQL locks?
SELECT * FROM pg_locks WHERE NOT granted;
```

### Resolution

- [ ] Fix S3 credentials in function env
- [ ] Increase backup function timeout if DB >50GB
- [ ] Clean up /tmp in backup function
- [ ] Schedule backup during low-traffic window

---

## Scenario 4: Complete Data Loss (P0)

**⚠️ CRITICAL: Follow this procedure exactly**

### Prerequisites

- [ ] Confirm data loss (not just application issue)
- [ ] Identify last known good backup
- [ ] Get approval from management
- [ ] Notify all stakeholders

### Recovery from Managed PostgreSQL Backup

```bash
# 1. List available backups
yc managed-postgresql backup list --folder-id <folder-id>

# 2. Choose backup to restore
BACKUP_ID=<backup-id>

# 3. Restore to NEW cluster (safer than overwriting)
yc managed-postgresql cluster restore \
  --backup-id=$BACKUP_ID \
  --name=heys-production-restored \
  --environment=production \
  --network-name=default \
  --host zone-id=ru-central1-a,subnet-id=<subnet-id> \
  --postgresql-version=14

# 4. Wait for cluster to be ready (10-30 minutes)
watch yc managed-postgresql cluster get heys-production-restored

# 5. Verify data integrity
psql -h <new-cluster-host> -p 6432 -U heys_admin -d heys_production -c "SELECT COUNT(*) FROM clients;"

# 6. Update DNS or reconfigure functions to point to new cluster
```

### Recovery from per-client KV snapshot (heys-client-daily-backup)

> Это восстановление **только** данных одного клиента из ежедневного снапшота
> KV. Для восстановления **всей БД** используй YC Managed PG restore (раздел
> выше "Recovery from Yandex Managed PG backup").

```bash
# 1. Find snapshot for desired client and date
aws s3 ls s3://heys-backups/client-daily/<YYYY-MM-DD>/ \
  --endpoint-url https://storage.yandexcloud.net | grep <CLIENT_UUID>

# 2. Download
aws s3 cp s3://heys-backups/client-daily/<YYYY-MM-DD>/<clientId>.json.gz /tmp/ \
  --endpoint-url https://storage.yandexcloud.net

# 3. Decompress and review
gunzip /tmp/<clientId>.json.gz
cat /tmp/<clientId>.json | jq .

# 4. Restore via existing script
node yandex-cloud-functions/heys-client-daily-backup/restore-client-backup.js \
  --client-id <UUID> --date <YYYY-MM-DD> --dry-run

# live (after dry-run looks right):
node yandex-cloud-functions/heys-client-daily-backup/restore-client-backup.js \
  --client-id <UUID> --date <YYYY-MM-DD>

# 4. Verify restoration
psql -h <host> -p 6432 -U heys_admin -d heys_production -c "
  SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
  FROM pg_tables
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
  LIMIT 10;
"
```

### Post-Recovery Checklist

- [ ] Verify all critical tables exist
- [ ] Check row counts match expected values
- [ ] Test authentication (login works)
- [ ] Test payment processing
- [ ] Verify subscriptions are intact
- [ ] Run application smoke tests
- [ ] Monitor error rates for 1 hour
- [ ] Send all-clear notification

---

## Scenario 5: Slow Query Performance (P2)

### Symptoms

- 🐌 API response time >2s
- 🐌 Pool utilization high but queries slow
- 🐌 Database CPU >80%

### Immediate Actions

1. **Identify slow queries**

   ```sql
   -- Top 10 slowest queries
   SELECT
     query,
     calls,
     mean_exec_time,
     max_exec_time,
     stddev_exec_time
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

2. **Check for missing indexes**

   ```sql
   -- Tables with high seq scans
   SELECT
     schemaname,
     tablename,
     seq_scan,
     seq_tup_read,
     idx_scan,
     seq_tup_read / seq_scan as avg_seq_read
   FROM pg_stat_user_tables
   WHERE seq_scan > 0
   ORDER BY seq_tup_read DESC
   LIMIT 10;
   ```

3. **Kill long-running queries** (if blocking others)

   ```sql
   -- Find blockers
   SELECT
     pid,
     now() - query_start as duration,
     state,
     query
   FROM pg_stat_activity
   WHERE state = 'active'
     AND now() - query_start > interval '30 seconds'
   ORDER BY duration DESC;

   -- Kill specific query
   SELECT pg_terminate_backend(pid);
   ```

### Resolution

- Add missing indexes
- Optimize query patterns
- Enable query result caching
- Consider read replicas for heavy reads

---

## Scenario 6: Cloud Function Timeout (P2)

### Symptoms

- ⏱️ Functions timing out after 600s
- ⏱️ Logs show incomplete operations
- ⏱️ Users reporting "Request timeout"

### Immediate Actions

1. **Increase timeout temporarily**

   ```bash
   yc serverless function version create \
     --function-name=<function-name> \
     --execution-timeout=900s \
     --source-path ./<function>.zip
   ```

2. **Check for blocking operations**
   ```bash
   # Review logs for slow operations
   yc serverless function logs <function-name> --filter "duration" --since 1h
   ```

### Long-term Fix

- Optimize slow operations
- Split into smaller async jobs
- Use Cloud Tasks for long operations
- Implement pagination for large datasets

---

## Scenario 7: Client Data Corruption/Loss (P1)

### Symptoms

- 🔴 Client reports missing or incorrect meals/day data
- 🔴 Dashboard shows another client's data (cross-contamination)
- 🔴 Day entries disappeared after app update or sync failure

### Prerequisites

Per-client daily backups run at 04:00 MSK via `heys-client-daily-backup`
function. Snapshots stored in S3:
`s3://heys-backups/client-daily/YYYY-MM-DD/<clientId>.json.gz` Retention: 365
days.

### Immediate Actions

1. **Identify affected client and date range**

   ```sql
   -- Check current state in client_kv_store
   SELECT k, updated_at
   FROM client_kv_store
   WHERE client_id = '<CLIENT_ID>'
     AND k LIKE 'heys_%_dayv2_%'
   ORDER BY updated_at DESC
   LIMIT 20;
   ```

2. **Verify backup availability**

   ```bash
   # List available backups for a client
   aws s3 ls s3://heys-backups/client-daily/ \
     --endpoint-url https://storage.yandexcloud.net \
     --recursive | grep "<CLIENT_ID>"
   ```

3. **Dry-run restore to assess impact**
   ```bash
   cd yandex-cloud-functions/heys-client-daily-backup
   node restore-client-backup.js \
     --client-id=<CLIENT_ID> \
     --date=<YYYY-MM-DD> \
     --dry-run
   ```
   Review the diff output: `insert`, `update`, `unchanged`, `skipped` counts.

### Recovery Steps

4. **Execute restore (with optional key filter)**

   ```bash
   # Restore all keys
   node restore-client-backup.js \
     --client-id=<CLIENT_ID> \
     --date=<YYYY-MM-DD>

   # Or restore only specific key prefixes
   node restore-client-backup.js \
     --client-id=<CLIENT_ID> \
     --date=<YYYY-MM-DD> \
     --keys=heys_dayv2,heys_profile
   ```

5. **Verify restored data**

   ```sql
   SELECT k, updated_at
   FROM client_kv_store
   WHERE client_id = '<CLIENT_ID>'
     AND k LIKE 'heys_%_dayv2_%'
   ORDER BY updated_at DESC
   LIMIT 20;
   ```

6. **Force client resync** — ask client to pull-to-refresh in the app, or
   curator to re-open the client card.

### Post-Recovery

- [ ] Confirm client sees correct data in the app
- [ ] Check if other clients are affected (cross-contamination scenario)
- [ ] Investigate root cause (unscoped keys, sync race, code bug)
- [ ] If cross-contamination: check for unscoped `heys_dayv2_*` keys without
      `clientId` prefix and migrate them

### Notes

- The restore script uses a single transaction — either all keys restore or
  none.
- `--dry-run` never writes to DB; always run it first.
- Backup includes `v_encrypted` (base64) and `key_version` fields.
- SHA-256 checksum in S3 metadata is verified before restore.

---

## Emergency Rollback Procedure

**When to use**: New deployment causes widespread issues

```bash
# 1. List recent versions
yc serverless function version list --function-name=heys-api-rpc

# 2. Identify last known good version
GOOD_VERSION=<version-id>

# 3. Rollback
yc serverless function set-tag \
  --name=heys-api-rpc \
  --tag="\$latest" \
  --version-id=$GOOD_VERSION

# 4. Verify rollback
yc serverless function get heys-api-rpc --format json | jq '.tags'

# 5. Test functionality
curl -X POST https://api.heyslab.ru/rpc?fn=get_public_trial_capacity
```

**Rollback all functions at once:**

```bash
#!/bin/bash
FUNCTIONS=(heys-api-rpc heys-api-rest heys-api-auth heys-api-leads heys-api-payments)
GOOD_COMMIT="7004c88"  # Commit before issues

for func in "${FUNCTIONS[@]}"; do
  echo "Rolling back $func..."
  # Find version by commit or timestamp
  yc serverless function version list --function-name=$func
  # Manual selection or script logic here
done
```

---

## Communication Templates

### Incident Notification

```
🚨 INCIDENT: [Brief Description]

Severity: P[0-3]
Status: [Investigating / Mitigating / Resolved]
Started: [Timestamp]
Impact: [What's affected]

Current Actions:
- [Action 1]
- [Action 2]

ETA: [Estimated resolution time]

Updates: Every 15 minutes
```

### Resolution Notification

```
✅ RESOLVED: [Brief Description]

Duration: [HH:MM]
Root Cause: [Brief explanation]
Fix Applied: [What was done]

Follow-up Actions:
- [ ] Post-mortem scheduled for [date]
- [ ] Monitoring improvements
- [ ] Preventive measures

Thank you for your patience.
```

---

## Post-Incident Checklist

After any P0 or P1 incident:

- [ ] Document timeline of events
- [ ] Identify root cause
- [ ] Document resolution steps
- [ ] Update runbook with learnings
- [ ] Schedule post-mortem meeting
- [ ] Implement preventive measures
- [ ] Update monitoring/alerting
- [ ] Share incident report with team

---

## Scenario 8: Reaper Shutdown on Billing Block (P0)

Инцидент 2026-08-02: отрицательный баланс (−1010 ₽) → `yc.iam.reaper` погасил
ресурсы в 16:04 МСК. Прод лежал несколько часов.

### Symptoms

- 🔴 `api.heyslab.ru` отдаёт 403 «API Gateway is stopped» либо не отвечает
- 🔴 `app.heyslab.ru` и `heyslab.ru` не отвечают, TLS reset
- 🔴 CI «Deploy to Yandex Cloud» падает на шаге «Verify production build
  metadata» с пустым `REMOTE_HASH` — артефакт выложен, но верификация не может
  достучаться до фронта
- 🟢 Cloud Functions при этом остаются `ACTIVE` — их reaper не гасит

- 🔴 Молчат Telegram-боты, не уходят напоминания, не идут бэкапы, не
  расшифровываются голосовые — при полностью живом API
- 🔴 Workflow «API Health Monitor», шаг «Check Automation Dead-Man»: красный,
  `stale: true`, `minutes_ago` примерно равно времени с момента гашения

### Immediate Actions

Поднимать нужно **четыре класса ресурсов**, а не один. Проверять каждый — по
факту, а не по одному успешному `curl`.

```bash
# 1. Шлюзы — ВО ВСЕХ папках, не только в текущей
yc resource-manager folder list
for f in $(yc resource-manager folder list --format json | jq -r '.[].id'); do
  yc serverless api-gateway list --folder-id "$f"
done
yc serverless api-gateway start <gateway-id>

# 2. Кластер БД
yc managed-postgresql cluster list
yc managed-postgresql cluster start heys-production

# 3. ВМ фронта — её проще всего пропустить
yc compute instance list
yc compute instance start app-heyslab-proxy

# 4. Таймер-триггеры — они НЕ видны ни в одной проверке HTTP
#    (инцидент 2026-08-02: reaper поставил на паузу все 19 во всех папках)
for f in $(yc resource-manager folder list --format json | jq -r '.[].id'); do
  yc serverless trigger list --folder-id "$f" --format json \
    | jq -r '.[] | select(.status != "ACTIVE") | "\(.id) \(.name)"'
done
yc serverless trigger resume <trigger-id> --folder-id <F>
```

Порядок: кластер → шлюзы → ВМ фронта → триггеры.

### Ловушки, на которых уже обожглись

- **`yc ... list` показывает только текущую папку.** В первый заход подняли три
  шлюза из пяти: `mine2d` и `bakshepchet` остались лежать и вскрылись случайно,
  когда пользователь принёс ссылку на лаунчер. Всегда обходить папки списком.
- **«API отвечает, приложение молчит» — смотреть ВМ, а не шлюз.**
  `app.heyslab.ru` и `heyslab.ru` резолвятся в `158.160.53.194` — это ВМ
  `app-heyslab-proxy`, а не бакет и не CDN. После поднятия шлюза и кластера
  `api.heyslab.ru/health` уже отвечал 200, и это создало ложное ощущение, что
  восстановление закончено.
- **Недоступность фронта из агентской среды легко списать на песочницу.**
  Проверка: посторонний домен из той же среды открывается, а `heyslab.ru` — нет.
  В том инциденте то же самое видел и CI из GitHub.
- **Триггеры не видит ни одна HTTP-проверка.** `/health`, фронт и функции могут
  отвечать 200, пока боты молчат, напоминания не уходят, бэкапы не идут, а
  голосовые не расшифровываются. Единственный сигнал — dead-man's switch в «API
  Health Monitor»: `stale: true` и `minutes_ago`, совпадающее с временем
  гашения. В инциденте 2026-08-02 это заметили спустя ~4 часа и случайно.
- CDN-ресурсы `heyslab.ru`, `try.heyslab.ru`, `genda.heyslab.ru` числятся
  неактивными — трафик идёт через ту же ВМ, поднимать их не требуется.

### Verification

```bash
curl -s https://api.heyslab.ru/health                 # 200
curl -s -o /dev/null -w '%{http_code}\n' https://app.heyslab.ru/   # 200
curl -s https://app.heyslab.ru/build-meta.json        # hash == текущий коммит
```

```bash
# Триггеры: во всех папках не должно остаться ничего, кроме ACTIVE
for f in $(yc resource-manager folder list --format json | jq -r '.[].id'); do
  yc serverless trigger list --folder-id "$f" --format json \
    | jq -r --arg f "$f" '[.[] | select(.status != "ACTIVE")] | "\($f): \(length) не ACTIVE"'
done
```

Отдельно дождаться зелёного «Check Automation Dead-Man»: у опросов Telegram
`minutes_ago` падает до единиц за минуту, у часовых задач (`snapshot_demo`,
`trial_queue`) — только на следующем запуске, до тех пор `stale: true` там
ожидаем и паникой не является.

Если CI-деплой упал только на верификации, а фронт уже поднят — перезапустить
проваленные джобы (`gh run rerun <id> --failed`), заново деплоить не нужно:
артефакт был выложен до падения.

---

## Scenario 9: Личный каталог продуктов схлопнулся (P1)

Проверено 2026-08-22 прогоном на тестовом клиенте
`11111111-1111-1111-1111-111111111111`, включая проверку от обратного. Отдельный
сценарий от «Scenario 7», потому что общий `restore-client-backup.js` для
каталога **недостаточен** — причина ниже.

### Симптомы

- 🔴 Алерт `products_catalog_shrink` в Telegram (сторож в
  `heys-cron-security-alerts`, порог — падение вдвое при потере ≥10 позиций).
- 🔴 Человек говорит, что пропали его продукты; на новом устройстве каталог
  пустой, на старом ещё виден (живёт из локального хранилища).

### Почему нельзя просто восстановить ключ

Каталог — это **пара** ключей в `client_kv_store`:

| Ключ                                    | Что внутри                          |
| --------------------------------------- | ----------------------------------- |
| `heys_products_overlay_v2`              | массив позиций                      |
| `heys_products_overlay_v2_rpc_manifest` | сторож целостности: `rowCount`, хеш |

Клиент собирает каталог через `codec.assemble()`
([apps/web/heys_overlay_shard_codec_v1.js](../apps/web/heys_overlay_shard_codec_v1.js)):
сверяет хеш строк с хешем в манифесте, затем длину с `rowCount`. Любое
несовпадение → `generation_mismatch` / `row_count_mismatch` → **каталог молча
выбрасывается**, ошибки в интерфейсе не будет.

Отсюда две ловушки:

1. Восстановить строки и оставить старый манифест — данные не примут.
2. Перенести манифест из снимка «как есть» — тоже может не приняться: пара
   внутри снимка бывает рассогласована, потому что бэкап добросовестно копирует
   рассогласованность из прода (см. «Известное состояние» ниже).

Поэтому манифест **пересчитывается по восстановленным строкам тем же кодеком**,
что и в приложении. Единственный источник правды — строки.

### Процедура

```bash
cd yandex-cloud-functions/heys-client-daily-backup
source ../../scripts/db/get-pg-password.sh
export PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net PG_PORT=6432 \
       PG_DATABASE=heys_production PG_USER=heys_admin PG_PASSWORD="$PGPASSWORD"
```

1. **Разбор без записи** — сколько позиций вернётся и что говорит манифест
   снимка:

   ```bash
   node restore-products-catalog.js --client-id <UUID> --date <YYYY-MM-DD>
   ```

   Убедиться, что «Строк в снимке» — это ожидаемый размер каталога, а не уже
   схлопнувшееся состояние. Если снимок за эту дату уже поломан — брать более
   раннюю дату (хранение 365 дней).

2. **Запись** — оба ключа одной транзакцией:

   ```bash
   node restore-products-catalog.js --client-id <UUID> --date <YYYY-MM-DD> --apply
   ```

   Скрипт сам: кладёт прежнее состояние рядом под `*__before_restore_<стамп>`,
   пишет строки и пересчитанный манифест в одной транзакции, перечитывает пару
   **из БД** и прогоняет `assemble()`. Не сошлось — `ROLLBACK`, в БД ничего не
   меняется.

3. **Подтверждение, что данные приняты.** Успех выглядит так:

   ```
   ✅ Восстановлено 146 позиций, assemble → complete.
   ```

   `complete` — это и есть «клиент примет». Независимая перепроверка:

   ```bash
   ../../scripts/db/psql.sh -t -A -F'|' -c "
     SELECT k, CASE WHEN k LIKE '%manifest%' THEN v->>'rowCount'
                    ELSE jsonb_array_length(v)::text END
     FROM client_kv_store WHERE client_id='<UUID>'
       AND k LIKE 'heys_products_overlay_v2%' ORDER BY k;"
   ```

   Оба числа должны совпасть.

4. **На устройстве человека** — перезайти в приложение и убедиться, что каталог
   виден. До этого шага восстановление не закончено.

5. **Откат**, если восстановили не то: значения лежат рядом под
   `*__before_restore_<стамп>`, вернуть их той же парой в одной транзакции.

### Если снимка нет или он тоже пуст

Легаси-зеркало `heys_products` (сжатая строка) пишется «заодно» и переживало
инцидент 21.08. Это запасной, а не основной путь: расшифровать штатным
алгоритмом, дальше — тот же пересчёт манифеста кодеком.

### Известное состояние прода (2026-08-22)

У двух из трёх клиентов пара уже рассогласована в живой базе: строки
обновляются, манифест остаётся от прошлой публикации.

| Клиент     | Строк | `rowCount` манифеста | Вердикт `assemble()`  |
| ---------- | ----- | -------------------- | --------------------- |
| `4545ee50` | 296   | 278                  | не собирается         |
| `ccfe6ea3` | 151   | 146                  | `generation_mismatch` |
| `02e1aff8` | 7     | 7                    | `complete`            |

То есть облачный каталог у этих клиентов сейчас не приезжает на новое
устройство, хотя на старом виден из локального хранилища. Причина — в пути
записи (строки публикуются без пересчёта манифеста), она **не устранена**: это
отдельный дефект, а не задача восстановления. Процедура выше приводит пару в
согласованное состояние, но следующая публикация продуктов снова её разведёт,
пока дефект записи не починен.

---

## Testing Recovery Procedures

**Quarterly DR drill:**

1. Schedule maintenance window
2. Test backup restoration to separate environment
3. Verify all functions work with restored data
4. Measure RTO (Recovery Time Objective)
5. Measure RPO (Recovery Point Objective)
6. Document gaps and improvements
7. Update runbook

---

**This is a living document. Update after each incident with new learnings.**
