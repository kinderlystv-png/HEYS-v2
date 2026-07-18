#!/usr/bin/env node
'use strict';

const { execFile } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { listFunctions } = require('./function-inventory.cjs');

const ROOT = resolve(__dirname, '..');
const APP_LOCKBOX_ID = 'e6qrvefs3vn66jiamfk4';
const COMMAND_TIMEOUT_MS = Number(process.env.HEYS_OPS_CHECK_TIMEOUT_MS || 12000);
const TELEGRAM_TIMEOUT_MS = Number(process.env.HEYS_OPS_TELEGRAM_TIMEOUT_MS || 15000);

const FUNCTIONS = listFunctions({ group: 'automations', autoOnly: true });

const TRIGGERS = [
  { name: 'heys-client-bot-poll', cron: '0/1 * * * ? *', tag: '$latest', payloadIncludes: '"poll":"heys-client-bot"' },
  { name: 'heys-start-bot-poll', cron: '0/1 * * * ? *', tag: '$latest', payloadIncludes: '"poll":"heys-start-bot"' },
  { name: 'heys-bot-client-keepwarm', cron: '0/1 * * * ? *', tag: '$latest', payloadIncludes: '"warmup":"heys-bot-client"' },
  { name: 'heys-maintenance-trial-queue', cron: '0/5 * * * ? *', tag: '$latest', payloadIncludes: '"trigger_id":"trial_queue"' },
  { name: 'heys-maintenance-ops-canary', cron: '0 * * * ? *', tag: '$latest', payloadIncludes: '"trigger_id":"ops_canary"' },
  { name: 'heys-maintenance-daily', cron: '0 3 * * ? *', tag: '$latest' },
  { name: 'heys-maintenance-daily-cleanup', cron: '30 3 * * ? *', tag: '$latest', payloadIncludes: '"trigger_id":"daily_cleanup"' },
  { name: 'heys-maintenance-daily-report', cron: '0 4 * * ? *', tag: '$latest', payloadIncludes: '"trigger_id":"daily_report"' },
  { name: 'heys-maintenance-kv-cleanup-weekly', cron: '0 2 ? * SUN *', tag: '$latest', payloadIncludes: '"trigger_id":"kv_cleanup"' },
  { name: 'heys-maintenance-weekly-report', cron: '0 16 ? * SUN *', tag: '$latest', payloadIncludes: '"trigger_id":"weekly_report"' },
  { name: 'heys-client-daily-backup-timer', cron: '0 1 * * ? *', tag: '$latest' },
  { name: 'heys-cron-security-alerts-timer', cron: '*/15 * * * ? *', tag: '$latest' },
  { name: 'heys-cron-reminders-timer', cron: '*/15 * * * ? *', tag: '$latest' },
  { name: 'heys-cron-trial-drip-timer', cron: '0 7 * * ? *', tag: '$latest' },
  { name: 'heys-cron-photo-cleanup-timer', cron: '0 6 ? * MON *', tag: '$latest' },
  { name: 'heys-cron-speechkit-transcribe-timer', cron: '0/1 * * * ? *', tag: '$latest' },
  { name: 'heys-snapshot-demo-hourly', cron: '0 * ? * * *', tag: '$latest' },
];

const TELEGRAM_BOTS = [
  { label: 'support', key: 'TELEGRAM_BOT_TOKEN' },
  { label: 'client', key: 'TELEGRAM_CLIENT_BOT_TOKEN' },
  { label: 'start', key: 'HEYS_START_BOT_TOKEN' },
];

const EXPECTED_HEARTBEAT_TASKS = Object.freeze([
  'backup_chain',
  'cron_photo_cleanup',
  'cron_reminders',
  'cron_security_alerts',
  'cron_speechkit_transcribe',
  'cron_trial_drip',
  'daily_cleanup',
  'daily_report',
  'kv_health',
  'ops_canary',
  'telegram_client_poll',
  'telegram_curator_poll',
  'telegram_start_poll',
  'trial_queue',
  'weekly_report',
  'snapshot_demo',
]);

const EXPECTED_APP_LOCKBOX_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CLIENT_BOT_TOKEN',
  'HEYS_START_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'HEYS_START_WEBHOOK_SECRET',
  'INTERNAL_CRON_TOKEN',
  'APP_URL',
  'VAPID_PRIVATE_KEY',
];

const CANARY_INVOKES = [
  { name: 'heys-bot-client', data: { warmup: 'heys-bot-client' } },
  { name: 'heys-bot-client', data: { poll: 'heys-client-bot', window_ms: 1000 } },
  { name: 'heys-bot-client', data: { poll: 'heys-start-bot', window_ms: 1000 } },
  { name: 'heys-maintenance', data: { trigger_id: 'ops_canary' } },
];

const RUNBOOKS = {
  status_issues: {
    title: 'Запустить строгий ops-check и смотреть список issues',
    command: 'pnpm ops:heys:status --strict',
  },
  plaintext_env: {
    title: 'Проверить секреты в env и Lockbox',
    command: 'pnpm ops:heys:secrets --strict',
  },
  telegram_webhook: {
    title: 'Безопасно снять webhook без drop pending updates',
    command: 'pnpm ops:heys:fix-safe --strict',
  },
  canary_failed: {
    title: 'Запустить automation canary вручную',
    command: 'pnpm ops:heys:canary --strict',
  },
};

function execFileText(cmd, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(cmd, args, {
      cwd: options.cwd || ROOT,
      timeout: options.timeout || COMMAND_TIMEOUT_MS,
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      env: process.env,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        error.stdout = stdout;
        reject(error);
        return;
      }
      resolvePromise(stdout);
    });
  });
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function ycJson(args) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const stdout = await execFileText('yc', [...args, '--format', 'json']);
      return JSON.parse(stdout || 'null');
    } catch (e) {
      lastError = e;
      if (attempt < 2) await delay(750);
    }
  }
  throw lastError;
}

async function gitText(args) {
  return (await execFileText('git', args, { cwd: ROOT })).trim();
}

function parseGitStatusLines(output) {
  return String(output || '').split(/\r?\n/).filter(Boolean);
}

function redact(value) {
  if (value == null) return value;
  const s = String(value);
  if (s.length <= 8) return '<redacted>';
  return `${s.slice(0, 3)}...${s.slice(-3)}`;
}

function isAllowedSecretValue(key, value) {
  if (!/(TOKEN|SECRET|PASSWORD|PRIVATE_KEY)/.test(key)) return true;
  if (/_SHA256$/.test(key)) return true;
  if (/^LOCKBOX_.*_SECRET_ID$/.test(key)) return true;
  if (key.startsWith('HEYS_DEPLOY_')) return true;
  if (String(value || '').startsWith('__IN_LOCKBOX__')) return true;
  return false;
}

function findPlaintextSecretEnv(env = {}) {
  return Object.entries(env)
    .filter(([key, value]) => !isAllowedSecretValue(key, value))
    .map(([key]) => key)
    .sort();
}

function latestVersion(versions = []) {
  return versions.find((v) => Array.isArray(v.tags) && v.tags.includes('$latest')) || versions[0] || null;
}

function evaluateTrigger(expected, trigger) {
  const problems = [];
  const timer = trigger?.rule?.timer || {};
  const invoke = timer.invoke_function_with_retry || {};
  if (!trigger) problems.push('missing');
  if (trigger && trigger.status !== 'ACTIVE') problems.push(`status=${trigger.status}`);
  if (expected.cron && timer.cron_expression !== expected.cron) {
    problems.push(`cron=${timer.cron_expression || 'missing'}`);
  }
  if (expected.tag && invoke.function_tag !== expected.tag) {
    problems.push(`tag=${invoke.function_tag || 'missing'}`);
  }
  if (expected.payloadIncludes && !String(timer.payload || '').includes(expected.payloadIncludes)) {
    problems.push('payload_mismatch');
  }
  return problems;
}

function evaluateWebhookInfo(bot) {
  const problems = [];
  if (!bot.configured) problems.push('token_missing');
  if (bot.error) problems.push(`error=${bot.error}`);
  if (bot.webhookConfigured) problems.push('webhook_on');
  if (Number(bot.pending_update_count || 0) > 0) problems.push(`pending=${bot.pending_update_count}`);
  if (bot.last_error_message) problems.push(`last_error=${bot.last_error_message}`);
  return problems;
}

function evaluateHeartbeatRows(rows = [], expectedTasks = []) {
  const stale = rows
    .filter((row) => row.stale === true || row.stale === 't')
    .map((row) => `${row.task}:${row.minutes_ago || row.hours_ago || '?'}m`);
  const present = new Set(rows.map((row) => row.task));
  const missing = expectedTasks
    .filter((task) => !present.has(task))
    .map((task) => `${task}:missing`);
  return [...stale, ...missing];
}

function evaluateBackupRow(row) {
  if (!row) return ['missing'];
  const problems = [];
  if (row.status !== 'ok') problems.push(`status=${row.status}`);
  if (Number(row.hours_ago || 0) > 30) problems.push(`age=${row.hours_ago}h`);
  if (Number(row.error_count || 0) > 0) problems.push(`errors=${row.error_count}`);
  return problems;
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx);
    let value = trimmed.slice(idx + 1);
    value = value.replace(/^['"]|['"]$/g, '');
    out[key] = value;
  }
  return out;
}

async function loadLockboxSecrets() {
  try {
    const payload = await ycJson(['lockbox', 'payload', 'get', '--id', APP_LOCKBOX_ID]);
    return Object.fromEntries((payload.entries || []).map((e) => [e.key || e.text_key, e.text_value || e.value || e.payload]));
  } catch {
    return {};
  }
}

async function fetchWebhookInfo(label, token) {
  if (!token || String(token).startsWith('__IN_LOCKBOX__')) return { label, configured: false };
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: controller.signal });
      const json = await res.json().catch(() => ({}));
      const info = json.result || {};
      return {
        label,
        configured: true,
        ok: Boolean(json.ok),
        webhookConfigured: Boolean(info.url),
        pending_update_count: Number(info.pending_update_count || 0),
        last_error_message: info.last_error_message || null,
      };
    } catch (e) {
      lastError = e;
      if (attempt < 2) await delay(750);
    } finally {
      clearTimeout(timer);
    }
  }
  return { label, configured: true, error: lastError?.message || 'telegram_check_failed' };
}

async function deleteWebhookSafe(label, token) {
  if (!token || String(token).startsWith('__IN_LOCKBOX__')) {
    return { label, ok: false, skipped: 'token_missing' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`, {
      method: 'POST',
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { label, ok: Boolean(json.ok), description: json.description || null };
  } catch (e) {
    return { label, ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function queryDbJson(sql) {
  const stdout = await execFileText('bash', ['scripts/db/psql.sh', '-X', '-A', '-t', '-c', `COPY (${sql}) TO STDOUT WITH CSV HEADER`], { cwd: ROOT });
  const [header, ...lines] = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (!header) return [];
  const keys = header.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(keys.map((key, i) => {
      const raw = values[i];
      if (raw === 't') return [key, true];
      if (raw === 'f') return [key, false];
      if (/^-?\d+(\.\d+)?$/.test(raw || '')) return [key, Number(raw)];
      return [key, raw];
    }));
  });
}

async function collectDeadManStatus(query = queryDbJson) {
  const [heartbeatRows, backupRows] = await Promise.all([
    query(`
      SELECT task,
             round(extract(epoch FROM now() - last_ok_at) / 60)::int AS minutes_ago,
             (last_ok_at < now() - max_silence) AS stale
        FROM maintenance_heartbeat
       ORDER BY task
    `),
    query(`
      SELECT status,
             round(extract(epoch FROM now() - run_at) / 3600)::int AS hours_ago,
             success_count::int,
             error_count::int
        FROM backup_run_log
       ORDER BY run_at DESC
       LIMIT 1
    `),
  ]);
  const issues = [];
  const heartbeatIssues = evaluateHeartbeatRows(heartbeatRows, EXPECTED_HEARTBEAT_TASKS);
  issues.push(...heartbeatIssues.map((issue) => `heartbeat:${issue}`));
  const backup = backupRows[0] || null;
  const backupIssues = evaluateBackupRow(backup);
  issues.push(...backupIssues.map((issue) => `backup:${issue}`));
  return {
    ok: issues.length === 0,
    issues,
    heartbeats: heartbeatRows,
    backup,
  };
}

async function collectStatus() {
  const issues = [];
  const functions = [];
  for (const name of FUNCTIONS) {
    try {
      const versions = await ycJson(['serverless', 'function', 'version', 'list', '--function-name', name]);
      const latest = latestVersion(versions);
      const env = latest?.environment || {};
      const sourcePath = `yandex-cloud-functions/${name}`;
      const sourceCommitRaw = await gitText(['log', '--format=%h %cI', '--max-count=1', '--', sourcePath]).catch(() => '');
      const [sourceCommit = '', sourceCommitDate = ''] = sourceCommitRaw.split(/\s+/, 2);
      const dirtySource = parseGitStatusLines(await gitText(['status', '--porcelain', '--', sourcePath]).catch(() => ''));
      const deployedCommit = env.HEYS_DEPLOY_COMMIT || null;
      const plaintextSecrets = findPlaintextSecretEnv(env);
      const functionIssues = [];
      if (!latest || !(latest.tags || []).includes('$latest')) functionIssues.push('missing_latest');
      if (plaintextSecrets.length) functionIssues.push(`plaintext_env=${plaintextSecrets.join('|')}`);
      if (!deployedCommit) functionIssues.push('deploy_commit_missing');
      if (deployedCommit && sourceCommit && !sourceCommit.startsWith(String(deployedCommit).slice(0, sourceCommit.length))) {
        functionIssues.push(`drift=${deployedCommit}->${sourceCommit}`);
      }
      if (dirtySource.length) {
        functionIssues.push(`dirty_source=${dirtySource.length}`);
        const latestCreatedAt = latest?.created_at ? Date.parse(latest.created_at) : 0;
        const sourceCommittedAt = sourceCommitDate ? Date.parse(sourceCommitDate) : 0;
        if (latestCreatedAt && sourceCommittedAt && latestCreatedAt > sourceCommittedAt + 60 * 1000) {
          functionIssues.push(`hotpatch_newer_than_commit=${latest.created_at}`);
        }
      }
      if (functionIssues.length) issues.push(...functionIssues.map((p) => `${name}:${p}`));
      functions.push({
        name,
        latest: latest?.id || null,
        created_at: latest?.created_at || null,
        deployed_commit: deployedCommit,
        source_commit: sourceCommit,
        source_commit_date: sourceCommitDate || null,
        dirty_source_files: dirtySource.length,
        plaintext_secret_keys: plaintextSecrets,
        issues: functionIssues,
      });
    } catch (e) {
      issues.push(`${name}:version_check_failed=${e.message}`);
      functions.push({ name, error: e.message, issues: ['version_check_failed'] });
    }
  }

  let triggerMap = new Map();
  try {
    const triggerList = await ycJson(['serverless', 'trigger', 'list']);
    triggerMap = new Map((triggerList || []).map((trigger) => [trigger.name, trigger]));
  } catch (e) {
    issues.push(`triggers:list_failed=${e.message}`);
  }

  const triggers = TRIGGERS.map((expected) => {
    const trigger = triggerMap.get(expected.name) || null;
    const triggerIssues = evaluateTrigger(expected, trigger);
    if (triggerIssues.length) issues.push(...triggerIssues.map((p) => `${expected.name}:${p}`));
    return { name: expected.name, issues: triggerIssues };
  });

  const envFile = parseEnvFile(resolve(__dirname, '.env'));
  const lockbox = await loadLockboxSecrets();
  const telegram = await Promise.all(TELEGRAM_BOTS.map(async (bot) => {
    const token = lockbox[bot.key] || envFile[bot.key] || process.env[bot.key];
    const info = await fetchWebhookInfo(bot.label, token);
    const tgIssues = evaluateWebhookInfo(info);
    if (tgIssues.length) issues.push(...tgIssues.map((p) => `telegram:${bot.label}:${p}`));
    return { ...info, token: undefined };
  }));

  const backupPromise = queryDbJson(`
    SELECT status,
           round(extract(epoch FROM now() - run_at) / 3600)::int AS hours_ago,
           success_count::int,
           error_count::int
      FROM backup_run_log
     ORDER BY run_at DESC
     LIMIT 1
  `).catch((e) => {
    issues.push(`db:backup_check_failed=${e.message}`);
    return [];
  });

  const heartbeatPromise = queryDbJson(`
    SELECT task,
           round(extract(epoch FROM now() - last_ok_at) / 60)::int AS minutes_ago,
           (last_ok_at < now() - max_silence) AS stale
      FROM maintenance_heartbeat
     ORDER BY task
  `).catch((e) => {
    issues.push(`db:heartbeat_check_failed=${e.message}`);
    return [];
  });

  const [backupRows, heartbeatRows] = await Promise.all([backupPromise, heartbeatPromise]);
  const backup = backupRows[0] || null;
  const backupIssues = evaluateBackupRow(backup);
  if (backupIssues.length) issues.push(...backupIssues.map((p) => `backup:${p}`));
  const staleHeartbeats = evaluateHeartbeatRows(heartbeatRows, EXPECTED_HEARTBEAT_TASKS);
  if (staleHeartbeats.length) issues.push(...staleHeartbeats.map((p) => `heartbeat:${p}`));

  return { ok: issues.length === 0, issues, functions, triggers, telegram, backup, heartbeats: heartbeatRows };
}

async function collectSecretInventory() {
  const lockbox = await loadLockboxSecrets();
  const envFile = parseEnvFile(resolve(__dirname, '.env'));
  const functions = [];
  for (const name of FUNCTIONS) {
    try {
      const versions = await ycJson(['serverless', 'function', 'version', 'list', '--function-name', name]);
      const latest = latestVersion(versions);
      const env = latest?.environment || {};
      const secretKeys = Object.keys(env).filter((key) => /(TOKEN|SECRET|PASSWORD|PRIVATE_KEY)/.test(key)).sort();
      functions.push({
        name,
        secret_env_keys: secretKeys,
        plaintext_secret_keys: findPlaintextSecretEnv(env),
        placeholder_secret_keys: secretKeys.filter((key) => String(env[key] || '').startsWith('__IN_LOCKBOX__')),
        hash_keys: Object.keys(env).filter((key) => /_SHA256$/.test(key)).sort(),
      });
    } catch (e) {
      functions.push({ name, error: e.message });
    }
  }
  const lockboxKeys = Object.keys(lockbox).sort();
  const missingLockboxKeys = EXPECTED_APP_LOCKBOX_KEYS.filter((key) => !lockbox[key]);
  const localPlaintextKeys = Object.entries(envFile)
    .filter(([key, value]) => /(TOKEN|SECRET|PASSWORD|PRIVATE_KEY)/.test(key) && !String(value || '').startsWith('__IN_LOCKBOX__'))
    .map(([key]) => key)
    .sort();
  const plaintextFunctionKeys = functions.flatMap((f) => (f.plaintext_secret_keys || []).map((key) => `${f.name}:${key}`));
  return {
    ok: missingLockboxKeys.length === 0 && plaintextFunctionKeys.length === 0,
    lockbox_keys: lockboxKeys,
    missing_lockbox_keys: missingLockboxKeys,
    local_plaintext_keys: localPlaintextKeys,
    plaintext_function_keys: plaintextFunctionKeys,
    functions,
  };
}

async function remediateSafeTelegramWebhooks() {
  const envFile = parseEnvFile(resolve(__dirname, '.env'));
  const lockbox = await loadLockboxSecrets();
  const actions = [];
  for (const bot of TELEGRAM_BOTS) {
    const token = lockbox[bot.key] || envFile[bot.key] || process.env[bot.key];
    const before = await fetchWebhookInfo(bot.label, token);
    if (!before.webhookConfigured) {
      actions.push({ label: bot.label, action: 'skip', reason: 'webhook_off' });
      continue;
    }
    const deleted = await deleteWebhookSafe(bot.label, token);
    const after = await fetchWebhookInfo(bot.label, token);
    actions.push({
      label: bot.label,
      action: 'deleteWebhook',
      drop_pending_updates: false,
      ok: deleted.ok && !after.webhookConfigured,
      pending_before: before.pending_update_count,
      pending_after: after.pending_update_count,
      webhook_after: after.webhookConfigured,
      error: deleted.error || null,
    });
  }
  return { ok: actions.every((a) => a.action === 'skip' || a.ok), actions };
}

async function runCanaries() {
  const results = [];
  for (const item of CANARY_INVOKES) {
    try {
      const stdout = await execFileText('yc', [
        'serverless',
        'function',
        'invoke',
        item.name,
        '--data',
        JSON.stringify(item.data),
      ], { timeout: Math.max(COMMAND_TIMEOUT_MS, 15000) });
      results.push({ name: item.name, data: item.data, ok: true, output: stdout.trim().slice(0, 500) });
    } catch (e) {
      results.push({ name: item.name, data: item.data, ok: false, error: e.message, stderr: String(e.stderr || '').slice(0, 500) });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}

async function recordStatusIncidents(status) {
  const issues = status.issues || [];
  if (issues.length === 0) {
    await execFileText('bash', ['scripts/db/psql.sh', '-X', '-q', '-c', "SELECT public.resolve_ops_incident('ops-checker', 'status_issues')"], { cwd: ROOT });
    return { recorded: 0, resolved: true };
  }
  const runbook = issues.some((issue) => /(plaintext|Lockbox|secret|token)/i.test(issue)) ? RUNBOOKS.plaintext_env
    : issues.some((issue) => /webhook/i.test(issue)) ? RUNBOOKS.telegram_webhook
      : RUNBOOKS.status_issues;
  const details = JSON.stringify({
    issues: issues.slice(0, 50),
    runbook_title: runbook.title,
    runbook_command: runbook.command,
  }).replace(/'/g, "''");
  await execFileText('bash', ['scripts/db/psql.sh', '-X', '-q', '-c',
    `SELECT public.record_ops_incident('ops-checker', 'status_issues', 'critical', 'Ops checker found issues', '${details}'::jsonb)`,
  ], { cwd: ROOT });
  return { recorded: 1, resolved: false };
}

function printHuman(status) {
  console.log(status.ok ? '✅ HEYS ops status: OK' : '🚨 HEYS ops status: CHECK REQUIRED');
  if (status.issues.length) {
    console.log('\nIssues:');
    for (const issue of status.issues) console.log(`- ${issue}`);
  }
  console.log('\nFunctions:');
  for (const f of status.functions) {
    const suffix = f.issues?.length ? ` (${f.issues.join(', ')})` : '';
    console.log(`- ${f.name}: server=${f.deployed_commit || 'unknown'} source=${f.source_commit || 'unknown'}${suffix}`);
  }
  console.log('\nTelegram:');
  for (const t of status.telegram) {
    console.log(`- ${t.label}: pending=${t.pending_update_count ?? 'unknown'} webhook=${t.webhookConfigured ? 'on' : 'off'}${t.error ? ` error=${t.error}` : ''}`);
  }
  console.log(`\nBackup: ${status.backup ? `${status.backup.status}, ${status.backup.hours_ago}h ago, errors=${status.backup.error_count}` : 'unknown'}`);
  console.log('Heartbeats:');
  for (const h of status.heartbeats) {
    console.log(`- ${h.task}: ${h.minutes_ago}m ago${h.stale ? ' STALE' : ''}`);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--dead-man')) {
    const status = await collectDeadManStatus();
    if (args.has('--json')) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(status.ok ? '✅ Automation dead-man: OK' : '🚨 Automation dead-man: CHECK REQUIRED');
      for (const issue of status.issues) console.log(`- ${issue}`);
    }
    if (args.has('--strict') && !status.ok) process.exitCode = 1;
    return;
  }
  if (args.has('--secrets')) {
    const inventory = await collectSecretInventory();
    console.log(JSON.stringify(inventory, null, 2));
    if (args.has('--strict') && !inventory.ok) process.exitCode = 1;
    return;
  }
  if (args.has('--fix-safe')) {
    const remediation = await remediateSafeTelegramWebhooks();
    console.log(JSON.stringify(remediation, null, 2));
    if (args.has('--strict') && !remediation.ok) process.exitCode = 1;
    return;
  }
  if (args.has('--canary')) {
    const canary = await runCanaries();
    console.log(JSON.stringify(canary, null, 2));
    if (args.has('--strict') && !canary.ok) process.exitCode = 1;
    return;
  }
  const status = await collectStatus();
  if (args.has('--record-incidents')) {
    await recordStatusIncidents(status);
  }
  if (args.has('--json')) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    printHuman(status);
  }
  if (args.has('--strict') && !status.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`ops status failed: ${redact(e.message)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  FUNCTIONS,
  TRIGGERS,
  redact,
  findPlaintextSecretEnv,
  evaluateTrigger,
  evaluateWebhookInfo,
  evaluateHeartbeatRows,
  evaluateBackupRow,
  latestVersion,
  EXPECTED_HEARTBEAT_TASKS,
  collectDeadManStatus,
  collectSecretInventory,
  remediateSafeTelegramWebhooks,
  runCanaries,
};
