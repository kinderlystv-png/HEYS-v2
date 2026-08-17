#!/usr/bin/env node
'use strict';

/**
 * Добавить MCP_TELEMETRY_SECRET в heys-app-secrets (полный payload, не только новый ключ).
 *
 *   node scripts/lockbox-add-mcp-telemetry-secret.mjs [--dry-run]
 *
 * Печатает только id версии и факт добавления ключа, не значение секрета.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const LOCKBOX_ID = 'e6qrvefs3vn66jiamfk4';
const KEY = 'MCP_TELEMETRY_SECRET';
const dryRun = process.argv.includes('--dry-run');

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' });
}

const raw = run('yc', ['lockbox', 'payload', 'get', '--id', LOCKBOX_ID, '--format', 'json']);
const payload = JSON.parse(raw);
const entries = Array.isArray(payload.entries) ? payload.entries : payload;

if (!Array.isArray(entries)) {
  console.error('Unexpected lockbox payload shape');
  process.exit(1);
}

const hasKey = entries.some((e) => e.key === KEY);
if (hasKey) {
  console.log(`Lockbox ${LOCKBOX_ID}: ключ ${KEY} уже есть — пропуск.`);
  process.exit(0);
}

const secret = crypto.randomBytes(32).toString('hex');
const next = entries.map((e) => ({
  key: e.key,
  text_value: e.textValue || e.text_value || e.value,
}));
next.push({ key: KEY, text_value: secret });

const payloadArg = JSON.stringify(next);
if (dryRun) {
  console.log(`dry-run: добавил бы ${KEY} (${next.length} ключей всего)`);
  process.exit(0);
}

const out = run('yc', [
  'lockbox', 'secret', 'add-version',
  '--id', LOCKBOX_ID,
  '--payload', payloadArg,
]);
console.log(`Lockbox ${LOCKBOX_ID}: добавлен ${KEY}.`);
console.log(out.trim());
