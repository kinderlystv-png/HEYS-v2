#!/usr/bin/env node
'use strict';

/**
 * p50 duration_ms по инструментам из выгрузки yc logging read.
 *
 *   yc logging read --group-id e23ndggvq798r3v3eepq \
 *     --filter 'message: "mcp_call"' --since 72h --limit 1000 --format json \
 *     > ops/mcp-call-baseline-pre-deploy.json
 *   node scripts/mcp-baseline-p50.mjs ops/mcp-call-baseline-pre-deploy.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { extractRecord } = require(path.join(ROOT, 'yandex-cloud-functions/shared/mcp-logging-read.js'));

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function parseRecords(raw) {
  const text = fs.readFileSync(raw, 'utf8').trim();
  if (!text || text === '[]') return [];
  let entries;
  try {
    entries = JSON.parse(text);
  } catch {
    entries = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
  if (!Array.isArray(entries)) entries = [entries];
  const records = [];
  for (const entry of entries) {
    const rec = extractRecord(entry.json_payload || entry.jsonPayload || entry.message || entry);
    if (rec) records.push(rec);
  }
  return records;
}

const input = process.argv[2] || path.join(ROOT, 'ops/mcp-call-baseline-pre-deploy.json');
const records = parseRecords(input);
const byTool = new Map();

for (const rec of records) {
  const tool = rec.tool || '(unknown)';
  if (!byTool.has(tool)) byTool.set(tool, []);
  const ms = Number(rec.duration_ms);
  if (Number.isFinite(ms)) byTool.get(tool).push(ms);
}

const summary = {
  source: path.resolve(input),
  captured_at: new Date().toISOString(),
  total_records: records.length,
  tools: {},
};

for (const [tool, values] of [...byTool.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const sorted = values.slice().sort((a, b) => a - b);
  summary.tools[tool] = {
    calls: sorted.length,
    p50_ms: percentile(sorted, 50),
    p95_ms: percentile(sorted, 95),
    max_ms: sorted[sorted.length - 1] ?? null,
  };
}

const outPath = input.replace(/\.json$/i, '') + '.p50.json';
fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(summary, null, 2));
if (!records.length) {
  console.error('\nЗаписей mcp_call нет — расширь --since или проверь group-id/фильтр.');
  process.exit(2);
}
