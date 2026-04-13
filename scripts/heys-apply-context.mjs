#!/usr/bin/env node
/**
 * POST planning context → planning_context_agent_ingest (Cursor / CI).
 *
 * Env (минимум):
 *   HEYS_PLANNING_AGENT_SECRET
 *   HEYS_TARGET_CLIENT_ID
 *
 * CLI:
 *   node scripts/heys-apply-context.mjs [options] [file]
 *   cat ctx.txt | node scripts/heys-apply-context.mjs [options]
 *
 * Options:
 *   --dry-run              dryRun + applyNow false
 *   --idempotency-key K    иначе стабильный sha256 от текста (повтор того же снапшота = replay)
 *   --parent-ingest-id ID  audit.parentIngestId с прошлого ответа API
 *   --target-client-id U   переопределить env UUID
 *   --source S             default heys_cursor_agent
 *   --random-idempotency   вместо стабильного хэша (каждый вызов новый ключ)
 */

import crypto from 'crypto';
import { readFile } from 'fs/promises';
import process from 'process';

const API = 'https://api.heyslab.ru/rpc?fn=planning_context_agent_ingest';
const ORIGIN = 'https://app.heyslab.ru';

function usage() {
  console.error(`Usage: node scripts/heys-apply-context.mjs [options] [file]
Options:
  --dry-run
  --idempotency-key <string>   (min 8 chars; default: hash of snapshot body)
  --parent-ingest-id <id>
  --target-client-id <uuid>
  --source <string>
  --random-idempotency
Environment:
  HEYS_PLANNING_AGENT_SECRET  (required)
  HEYS_TARGET_CLIENT_ID     (required unless --target-client-id)
  HEYS_DAYS_LAST5_TEXT, HEYS_RAW_PROMPT_TEXT, HEYS_MAX_NOW_TASKS, HEYS_INGEST_SOURCE`);
}

function parseArgs(argv) {
  const flags = {
    dryRun: false,
    idempotencyKey: null,
    parentIngestId: null,
    targetClientId: null,
    source: null,
    randomIdempotency: false,
  };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--random-idempotency') flags.randomIdempotency = true;
    else if (a === '--idempotency-key' && argv[i + 1]) flags.idempotencyKey = String(argv[++i]).trim();
    else if (a === '--parent-ingest-id' && argv[i + 1]) flags.parentIngestId = String(argv[++i]).trim();
    else if (a === '--target-client-id' && argv[i + 1]) flags.targetClientId = String(argv[++i]).trim();
    else if (a === '--source' && argv[i + 1]) flags.source = String(argv[++i]).trim();
    else if (a.startsWith('--')) {
      console.error('Unknown option:', a);
      usage();
      process.exit(2);
    } else positional.push(a);
  }
  return { flags, positional };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const { flags, positional } = parseArgs(process.argv);

  const secret = process.env.HEYS_PLANNING_AGENT_SECRET;
  let targetClientId = (flags.targetClientId || process.env.HEYS_TARGET_CLIENT_ID || '').trim();
  if (!secret || !targetClientId) {
    usage();
    process.exit(2);
  }

  let text;
  const file = positional[0];
  if (file) {
    text = await readFile(file, 'utf8');
  } else if (!process.stdin.isTTY) {
    text = await readStdin();
  } else {
    usage();
    process.exit(2);
  }

  const snapshotText = text.trim();
  if (!snapshotText) {
    console.error('Empty input');
    process.exit(2);
  }

  const dryRun = flags.dryRun || process.env.HEYS_DRY_RUN === '1';
  let idempotencyKey = flags.idempotencyKey || process.env.HEYS_IDEMPOTENCY_KEY || '';
  if (!idempotencyKey) {
    if (flags.randomIdempotency) {
      idempotencyKey = `cursor-${crypto.randomBytes(16).toString('hex')}`;
    } else {
      const h = crypto.createHash('sha256').update(snapshotText, 'utf8').digest('hex');
      idempotencyKey = `cursor-${h.slice(0, 40)}`;
    }
  }
  if (idempotencyKey.length < 8) {
    console.error('idempotencyKey must be at least 8 characters');
    process.exit(2);
  }

  const parentIngestId =
    flags.parentIngestId ||
    (process.env.HEYS_PARENT_INGEST_ID && String(process.env.HEYS_PARENT_INGEST_ID).trim()) ||
    null;

  const body = {
    targetClientId,
    idempotencyKey,
    snapshotText,
    daysLast5Text: process.env.HEYS_DAYS_LAST5_TEXT || '',
    rawPromptText: process.env.HEYS_RAW_PROMPT_TEXT || '',
    applyNow: !dryRun,
    dryRun,
    source: flags.source || process.env.HEYS_INGEST_SOURCE || 'heys_cursor_agent',
    policy: {
      antiDuplicateFirst: true,
      maxNowTasks: Number(process.env.HEYS_MAX_NOW_TASKS || 3),
    },
  };
  if (parentIngestId) body.parentIngestId = parentIngestId;

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Origin: ORIGIN,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    json = { _raw: raw };
  }

  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
