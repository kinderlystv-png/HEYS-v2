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

1. **Check backup function logs**

   ```bash
   yc serverless function logs heys-backup --since 24h
   ```

2. **Verify S3 bucket access**

   ```bash
   aws s3 ls s3://heys-backups/ --endpoint-url https://storage.yandexcloud.net
   ```

3. **Check disk space on database**

   ```sql
   SELECT pg_database_size('heys_production') / 1024 / 1024 / 1024 as size_gb;
   ```

4. **Manual backup if needed**

   ```bash
   # Run backup function manually
   yc serverless function invoke heys-backup

   # Or manual pg_dump
   pg_dump -h <host> -p 6432 -U heys_admin -F c -b heys_production > manual_backup_$(date +%Y%m%d_%H%M%S).dump
   ```

### Root Cause Investigation

**Check common issues:**

```bash
# 1. S3 credentials expired?
aws s3 ls s3://heys-backups/ --endpoint-url https://storage.yandexcloud.net

# 2. Timeout (database too large)?
yc serverless function version list --function-name heys-backup | grep timeout

# 3. Disk space in /tmp?
# Check logs for "No space left on device"

# 4. PostgreSQL locks?
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

### Recovery from S3 Backup

```bash
# 1. Download latest backup
aws s3 cp s3://heys-backups/heys-production-latest.dump.gz /tmp/ \
  --endpoint-url https://storage.yandexcloud.net

# 2. Decompress
gunzip /tmp/heys-production-latest.dump.gz

# 3. Restore to database
pg_restore \
  -h <host> \
  -p 6432 \
  -U heys_admin \
  -d heys_production \
  --clean \
  --if-exists \
  --verbose \
  /tmp/heys-production-latest.dump

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
