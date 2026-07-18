#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..', '..');
const PSQL_WRAPPER = path.join(SCRIPT_DIR, 'psql.sh');

const RETENTION_POLICIES = Object.freeze([
  { id: 'debug_trace', table: 'client_log_trace', timestamp: 'captured_at', days: 30, policy: '30 days' },
  { id: 'security_events', table: 'security_events', timestamp: 'created_at', days: 365, policy: '1 year' },
  { id: 'data_loss_audit', table: 'data_loss_audit', timestamp: 'created_at', days: 365, policy: '1 year' },
  { id: 'access_audit', table: 'data_access_audit_log', timestamp: 'created_at', days: 1095, policy: '3 years' },
  { id: 'messages_inventory', table: 'client_messages', timestamp: 'created_at', days: null, policy: 'account lifetime; legal sign-off pending' },
]);

function assertIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return value;
}

function buildPolicySql(policy) {
  const table = assertIdentifier(policy.table);
  const timestamp = assertIdentifier(policy.timestamp);
  const cutoff = Number.isInteger(policy.days)
    ? `t.${timestamp} < now() - make_interval(days => ${policy.days})`
    : 'FALSE';
  return `
    SELECT CASE WHEN to_regclass('public.${table}') IS NULL THEN
      json_build_object('id', ${sqlLiteral(policy.id)}, 'table', ${sqlLiteral(table)}, 'exists', false)::text
    ELSE (
      SELECT json_build_object(
        'id', ${sqlLiteral(policy.id)},
        'table', ${sqlLiteral(table)},
        'exists', true,
        'policy', ${sqlLiteral(policy.policy)},
        'totalRows', count(*)::bigint,
        'tableBytes', pg_total_relation_size('public.${table}'::regclass)::bigint,
        'oldestAt', min(t.${timestamp}),
        'newestAt', max(t.${timestamp}),
        'candidateRows', count(*) FILTER (WHERE ${cutoff})::bigint,
        'candidateRowBytes', coalesce(sum(pg_column_size(t)) FILTER (WHERE ${cutoff}), 0)::bigint
      )::text
      FROM public.${table} AS t
    ) END;
  `;
}

function sqlLiteral(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function runPsql(sql) {
  const result = spawnSync(PSQL_WRAPPER, ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt'], {
    cwd: ROOT_DIR,
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'psql failed').trim());
  return result.stdout.trim();
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
}

function collectReport(policies = RETENTION_POLICIES) {
  return policies.map((policy) => JSON.parse(runPsql(buildPolicySql(policy))));
}

function printReport(report) {
  console.log('HEYS retention report (read-only; no rows changed)');
  for (const row of report) {
    if (!row.exists) {
      console.log(`${row.table}: table missing`);
      continue;
    }
    console.log(`${row.table}: total=${row.totalRows}, candidates=${row.candidateRows}, candidate_bytes=${formatBytes(row.candidateRowBytes)}, table_bytes=${formatBytes(row.tableBytes)}, oldest=${row.oldestAt || 'n/a'}, policy=${row.policy}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length > 0 && !argv.every((arg) => arg === '--json')) {
    throw new Error('This command is read-only and supports only --json');
  }
  const report = collectReport();
  if (argv.includes('--json')) console.log(JSON.stringify({ readOnly: true, report }, null, 2));
  else printReport(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Retention report failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export { RETENTION_POLICIES, buildPolicySql, formatBytes };
