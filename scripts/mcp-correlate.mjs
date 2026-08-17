#!/usr/bin/env node
'use strict';

/**
 * Связка стенограммы с вызовами mcp_call по окну времени, не по session_id.
 *
 *   node scripts/mcp-correlate.mjs --transcript transcript/2026-08-17.md --logs calls.json
 *
 * `calls.json` — массив записей mcp_call или сырой вывод
 * `yc serverless function logs`. Без текста запроса в логе: реплика берётся
 * из стенограммы, тайминги — из лога.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const correlate = require(path.join(ROOT, 'yandex-cloud-functions/heys-mcp/lib/mcp-correlate.js'));

function arg(name, fallback) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  const prefixed = argv.find((item) => item.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

const transcriptPath = arg('--transcript');
const logsPath = arg('--logs');
const date = arg('--date') || (transcriptPath && path.basename(transcriptPath, '.md')) || null;
const windowMs = Number(arg('--window-ms', String(correlate.DEFAULT_WINDOW_MS)));

if (!transcriptPath || !logsPath) {
  console.error('Нужны --transcript <файл> и --logs <файл>.');
  process.exit(1);
}

const exchanges = correlate.parseExchanges(fs.readFileSync(transcriptPath, 'utf8'), { date });
const calls = correlate.parseLogText(fs.readFileSync(logsPath, 'utf8'));
const report = correlate.correlate({ exchanges, calls, windowMs });

for (const row of report) {
  const tools = row.tools.length ? row.tools.join(' → ') : '(нет вызовов в окне)';
  const kin = row.kin ? ` «${row.kin.slice(0, 80)}${row.kin.length > 80 ? '…' : ''}»` : '';
  console.log(`${row.heading || '??:??'}${kin}: ${row.calls.length} вызовов, ${row.total_ms} мс — ${tools}`);
}

if (!report.length) {
  console.log('В стенограмме нет меток [mcp session=…].');
}
