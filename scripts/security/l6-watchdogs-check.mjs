#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

const FILES = {
  backupRunLogSql: 'database/2026-06-14_backup_run_log.sql',
  dailyBackup: 'yandex-cloud-functions/heys-client-daily-backup/index.js',
  securityAlerts: 'yandex-cloud-functions/heys-cron-security-alerts/index.js',
  photoCleanupSql: 'database/2026-06-14_photo_cleanup_log.sql',
  photoCleanup: 'yandex-cloud-functions/heys-cron-photo-cleanup/index.js',
  securityReview: 'docs/SECURITY_REVIEW.md',
  l6Baseline: 'docs/SECURITY_REVIEW_l6_baseline.md',
  retentionDraft: 'docs/legal/operator/heys-retention-policy-draft.md',
  retentionRunbook: 'docs/legal/operator/heys-retention-job-runbook.md',
  dsarDraft: 'docs/legal/operator/heys-dsar-procedure-draft.md',
};

const checks = [];

function abs(rel) {
  return path.join(ROOT, rel);
}

function read(rel) {
  return fs.readFileSync(abs(rel), 'utf8');
}

function ok(label) {
  checks.push({ status: 'OK', label });
}

function fail(label, detail = '') {
  checks.push({ status: 'FAIL', label, detail });
}

function requireFile(key) {
  const rel = FILES[key];
  if (fs.existsSync(abs(rel))) {
    ok(`file exists: ${rel}`);
  } else {
    fail(`missing file: ${rel}`);
  }
}

function requireIncludes(key, needles, label) {
  const rel = FILES[key];
  const text = read(rel);
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) {
    fail(label, `missing in ${rel}: ${missing.join(', ')}`);
  } else {
    ok(label);
  }
}

function checkSec021BackupWatchdog() {
  requireIncludes(
    'backupRunLogSql',
    [
      'CREATE TABLE IF NOT EXISTS backup_run_log',
      "status IN ('ok', 'partial', 'failed')",
      'GRANT INSERT, SELECT ON backup_run_log TO heys_admin',
      'GRANT SELECT ON backup_run_log TO heys_rpc',
    ],
    'SEC-021 backup_run_log migration is present',
  );

  requireIncludes(
    'dailyBackup',
    [
      'SEC-021',
      'INSERT INTO backup_run_log',
      "results.failed === 0 ? 'ok'",
      'backup_run_log INSERT failed (non-fatal)',
    ],
    'SEC-021 daily backup writes non-fatal success markers',
  );

  requireIncludes(
    'securityAlerts',
    [
      "key: 'backup_chain_gap'",
      'last_ok_run_at',
      'hours_since_last_ok',
      "NOW() - INTERVAL '30 hours'",
      'backup_run_log',
    ],
    'SEC-021 security alert detects silent backup gaps',
  );
}

function checkSec022PhotoCleanup() {
  requireIncludes(
    'photoCleanupSql',
    [
      'CREATE TABLE IF NOT EXISTS photo_cleanup_log',
      "status IN ('ok', 'partial', 'failed')",
      'orphan_candidates_count',
      'deleted_count',
      'GRANT INSERT, SELECT ON photo_cleanup_log TO heys_admin',
    ],
    'SEC-022 photo_cleanup_log migration is present',
  );

  requireIncludes(
    'photoCleanup',
    [
      'heys-cron-photo-cleanup',
      "const DRY_RUN = process.env.DRY_RUN !== '0'",
      'const SOFT_GRACE_DAYS = 7',
      'const HARD_CAP_PER_RUN',
      'listClientPrefixes',
      'checkClientsExist',
      'getPreviousOrphans',
      'deletePrefix',
      'INSERT INTO photo_cleanup_log',
    ],
    'SEC-022 photo cleanup cron has safety gates and audit log',
  );
}

function checkDocsAligned() {
  requireIncludes(
    'securityReview',
    [
      '| SEC-021 |',
      'mitigated (watchdog deployed)',
      '| SEC-022 |',
      'fixed + deployed',
      'DRY_RUN=1',
    ],
    'security review records SEC-021/022 status',
  );

  requireIncludes(
    'l6Baseline',
    [
      '27-дневная дыра',
      'photos orphan',
      'heys-cron-photo-cleanup',
    ],
    'L6 baseline records original findings',
  );

  requireIncludes(
    'retentionDraft',
    [
      'heys-cron-photo-cleanup',
      'backup_chain_gap',
      'heys-retention-job-runbook.md',
      'DRY_RUN=0',
    ],
    'retention draft keeps follow-up actions visible',
  );

  requireIncludes(
    'retentionRunbook',
    [
      'dry-run-first',
      'client_log_trace',
      'security_events',
      'data_loss_audit',
      'data_access_audit_log',
      'photo_cleanup_log',
      'backup_run_log',
      'ROLLBACK',
    ],
    'retention job runbook covers audit/debug cleanup safely',
  );

  requireIncludes(
    'dsarDraft',
    [
      'S3 cleanup',
      'DRY_RUN=1',
      'DRY_RUN=0',
    ],
    'DSAR draft keeps photo cleanup activation visible',
  );
}

function printResult() {
  for (const item of checks) {
    const suffix = item.detail ? ` — ${item.detail}` : '';
    console.log(`${item.status}: ${item.label}${suffix}`);
  }
  const failures = checks.filter((item) => item.status === 'FAIL');
  if (failures.length) {
    console.error(`L6 watchdog check failed: ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log(`L6 watchdog check OK (${checks.length} checks)`);
}

try {
  for (const key of Object.keys(FILES)) requireFile(key);
  checkSec021BackupWatchdog();
  checkSec022PhotoCleanup();
  checkDocsAligned();
  printResult();
} catch (err) {
  console.error(`L6 watchdog check failed: ${err.message}`);
  process.exit(1);
}
