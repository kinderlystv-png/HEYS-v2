#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_READ_SINCE = '2026-06-14 22:00+03';
const DEFAULT_WRITE_SINCE = '2026-06-14 00:00+03';

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  node scripts/security/strict-readiness-check.mjs [options]

Options:
  --read-since <timestamp>            Start of SEC-024 REST read warn window.
                                      Default: ${DEFAULT_READ_SINCE}
  --write-since <timestamp>           Start of SEC-004 write-context warn window.
                                      Default: ${DEFAULT_WRITE_SINCE}, or
                                      --source-fix-deployed-at when provided.
  --source-fix-deployed-at <timestamp>
                                      Marks the deployed source-fix boundary for
                                      SEC-004. Without it, write strict remains
                                      deploy-blocked even if logs are clean.
  --gate <read|write|all>             Gate used by --fail-on-not-ready.
                                      Default: all.
  --fail-on-not-ready                 Exit 1 when a strict flip is not ready.
  --events                            Print matching audit rows for diagnosis.
  --event-limit <n>                   Max rows per event section. Default: 50.
  --json                              Print machine-readable JSON.
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    readSince: DEFAULT_READ_SINCE,
    writeSince: '',
    sourceFixDeployedAt: '',
    gate: 'all',
    failOnNotReady: false,
    events: false,
    eventLimit: 50,
    json: false,
  };

  function value(current, index) {
    if (current.includes('=')) return current.slice(current.indexOf('=') + 1);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`${current} requires a value`);
    }
    return next;
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--fail-on-not-ready') {
      args.failOnNotReady = true;
      continue;
    }
    if (arg === '--gate' || arg.startsWith('--gate=')) {
      args.gate = value(arg, i);
      if (!arg.includes('=')) i += 1;
      if (!['read', 'write', 'all'].includes(args.gate)) {
        throw new Error('--gate must be one of: read, write, all');
      }
      continue;
    }
    if (arg === '--events') {
      args.events = true;
      continue;
    }
    if (arg === '--event-limit' || arg.startsWith('--event-limit=')) {
      args.eventLimit = Number(value(arg, i));
      if (!arg.includes('=')) i += 1;
      if (!Number.isInteger(args.eventLimit) || args.eventLimit < 1 || args.eventLimit > 500) {
        throw new Error('--event-limit must be an integer from 1 to 500');
      }
      continue;
    }
    if (arg === '--json') {
      args.json = true;
      continue;
    }
    if (arg === '--read-since' || arg.startsWith('--read-since=')) {
      args.readSince = value(arg, i);
      if (!arg.includes('=')) i += 1;
      continue;
    }
    if (arg === '--write-since' || arg.startsWith('--write-since=')) {
      args.writeSince = value(arg, i);
      if (!arg.includes('=')) i += 1;
      continue;
    }
    if (arg === '--source-fix-deployed-at' || arg.startsWith('--source-fix-deployed-at=')) {
      args.sourceFixDeployedAt = value(arg, i);
      if (!arg.includes('=')) i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.writeSince) {
    args.writeSince = args.sourceFixDeployedAt || DEFAULT_WRITE_SINCE;
  }

  return args;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function psqlRows(sql) {
  const output = execFileSync(
    'bash',
    ['scripts/db/psql.sh', '-X', '-q', '-At', '-F', '\t', '-c', sql],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
}

function toCountMap(rows, keyIndex = 0, countIndex = 1) {
  return Object.fromEntries(rows.map((row) => [row[keyIndex], Number(row[countIndex] || 0)]));
}

function countTotal(counts) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function eventRows(sql) {
  return psqlRows(sql).map((row) => ({
    id: Number(row[0]),
    createdAt: row[1],
    clientId: row[2] || null,
    key: row[3] || null,
    action: row[4],
    allowed: row[5] === 't' || row[5] === 'true',
    reason: row[6] || null,
  }));
}

function auditEvents(args) {
  const limit = Number(args.eventLimit);
  const commonSelect = `
      SELECT id::text,
             to_char(created_at, 'YYYY-MM-DD HH24:MI:SSOF') AS created_at,
             COALESCE(client_id::text, '') AS client_id,
             REPLACE(REPLACE(COALESCE(key, ''), E'\\t', ' '), E'\\n', ' ') AS key,
             action,
             allowed::text,
             REPLACE(REPLACE(COALESCE(reason, ''), E'\\t', ' '), E'\\n', ' ') AS reason
        FROM data_loss_audit
  `;

  const events = {};

  if (args.gate === 'read' || args.gate === 'all') {
    events.readWindow = eventRows(`
      ${commonSelect}
       WHERE (action LIKE 'rest_read_%warn' OR action IN ('context_required', 'context_missing_warn'))
         AND created_at > TIMESTAMPTZ ${sqlLiteral(args.readSince)}
       ORDER BY created_at
       LIMIT ${limit};
    `);
  }

  if (args.gate === 'write' || args.gate === 'all') {
    events.writeWindow = eventRows(`
      ${commonSelect}
       WHERE action = 'context_missing_warn'
         AND created_at > TIMESTAMPTZ ${sqlLiteral(args.writeSince)}
       ORDER BY created_at
       LIMIT ${limit};
    `);
  }

  return events;
}

function collect(args) {
  const readWarnCounts = toCountMap(
    psqlRows(`
      SELECT action, count(*)
        FROM data_loss_audit
       WHERE action LIKE 'rest_read_%warn'
         AND created_at > TIMESTAMPTZ ${sqlLiteral(args.readSince)}
       GROUP BY action
       ORDER BY action;
    `),
  );

  const contextCounts = toCountMap(
    psqlRows(`
      SELECT action, count(*)
        FROM data_loss_audit
       WHERE action IN ('context_required', 'context_missing_warn')
         AND created_at > TIMESTAMPTZ ${sqlLiteral(args.readSince)}
       GROUP BY action
       ORDER BY action;
    `),
  );

  const writeWarnCounts = toCountMap(
    psqlRows(`
      SELECT COALESCE(reason, '(none)') AS reason, count(*)
        FROM data_loss_audit
       WHERE action = 'context_missing_warn'
         AND created_at > TIMESTAMPTZ ${sqlLiteral(args.writeSince)}
       GROUP BY reason
       ORDER BY reason;
    `),
  );

  const readWarnTotal = countTotal(readWarnCounts);
  const writeWarnTotal = countTotal(writeWarnCounts);
  const readReady = readWarnTotal === 0;
  const sourceFixDeployed = Boolean(args.sourceFixDeployedAt);
  const writeReady = sourceFixDeployed && writeWarnTotal === 0;

  const result = {
    generatedAt: new Date().toISOString(),
    safety: 'read-only check; does not deploy, edit gateway specs, or flip env flags',
    sec024ReadStrict: {
      since: args.readSince,
      ready: readReady,
      status: readReady ? 'ready' : 'not_ready_warn_events_present',
      warnCounts: readWarnCounts,
      contextCounts,
    },
    sec004WriteStrict: {
      since: args.writeSince,
      sourceFixDeployedAt: args.sourceFixDeployedAt || null,
      ready: writeReady,
      status: !sourceFixDeployed
        ? 'blocked_source_fix_not_deployed'
        : writeWarnTotal === 0
          ? 'ready'
          : 'not_ready_warn_events_present',
      warnCountsByReason: writeWarnCounts,
    },
  };

  if (args.events) {
    result.auditEvents = auditEvents(args);
  }

  return result;
}

function printCounts(counts) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'none';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function printText(result) {
  console.log('Strict readiness check');
  console.log(`Safety: ${result.safety}`);
  console.log('');
  console.log('SEC-024 REST read strict');
  console.log(`  since: ${result.sec024ReadStrict.since}`);
  console.log(`  status: ${result.sec024ReadStrict.status}`);
  console.log(`  rest read warn counts: ${printCounts(result.sec024ReadStrict.warnCounts)}`);
  console.log(`  related context counts: ${printCounts(result.sec024ReadStrict.contextCounts)}`);
  console.log('');
  console.log('SEC-004 write-context strict');
  console.log(`  since: ${result.sec004WriteStrict.since}`);
  console.log(
    `  source fix deployed at: ${result.sec004WriteStrict.sourceFixDeployedAt || 'not provided'}`,
  );
  console.log(`  status: ${result.sec004WriteStrict.status}`);
  console.log(
    `  context_missing_warn by reason: ${printCounts(result.sec004WriteStrict.warnCountsByReason)}`,
  );

  if (result.auditEvents) {
    console.log('');
    console.log('Audit events');
    if (result.auditEvents.readWindow) {
      printEventList('  read window', result.auditEvents.readWindow);
    }
    if (result.auditEvents.writeWindow) {
      printEventList('  write window', result.auditEvents.writeWindow);
    }
  }
}

function printEventList(label, events) {
  console.log(`${label}: ${events.length === 0 ? 'none' : ''}`);
  for (const event of events) {
    console.log(
      `    #${event.id} ${event.createdAt} ${event.action} allowed=${event.allowed}` +
        ` client=${event.clientId || '-'} key=${event.key || '-'} reason=${event.reason || '-'}`,
    );
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = collect(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result);
  }

  const gateReady = {
    read: result.sec024ReadStrict.ready,
    write: result.sec004WriteStrict.ready,
    all: result.sec024ReadStrict.ready && result.sec004WriteStrict.ready,
  }[args.gate];
  if (args.failOnNotReady && !gateReady) {
    process.exit(1);
  }
} catch (err) {
  console.error(`strict-readiness-check failed: ${err.message}`);
  process.exit(2);
}
