#!/usr/bin/env node
'use strict';

/**
 * Выгрузка mcp_call из Cloud Logging для baseline p50.
 *
 * yc logging read с --since ≥8h часто отдаёт [] (лимит CLI ~7h, не «нет
 * трафика»). См. MCP_TELEMETRY_ROADMAP.md § «Ловушка yc logging read».
 * Обход — несколько окон по 6h с --since/--until RFC-3339.
 *
 *   node scripts/mcp-baseline-fetch.mjs
 *   node scripts/mcp-baseline-p50.mjs ops/mcp-call-baseline-pre-deploy.json
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GROUP_ID = process.env.MCP_LOG_GROUP_ID || 'e23ndggvq798r3v3eepq';
const FILTER = 'message: "mcp_call"';
const CHUNK_HOURS = 6;
const LOOKBACK_HOURS = Number(process.env.MCP_BASELINE_HOURS || 72);
const LIMIT = Number(process.env.MCP_BASELINE_LIMIT || 1000);
const OUT = process.argv[2] || path.join(ROOT, 'ops/mcp-call-baseline-pre-deploy.json');

function runYc(sinceIso, untilIso) {
  const raw = execFileSync(
    'yc',
    [
      'logging', 'read',
      `--group-id=${GROUP_ID}`,
      `--filter=${FILTER}`,
      `--since=${sinceIso}`,
      `--until=${untilIso}`,
      `--limit=${LIMIT}`,
      '--format=json',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '[]') return [];
  return JSON.parse(trimmed);
}

const endMs = Date.now();
const chunkMs = CHUNK_HOURS * 60 * 60 * 1000;
const lookbackMs = LOOKBACK_HOURS * 60 * 60 * 1000;
const byUid = new Map();

for (let cursor = endMs - lookbackMs; cursor < endMs; cursor += chunkMs) {
  const sinceIso = new Date(cursor).toISOString();
  const untilIso = new Date(Math.min(cursor + chunkMs, endMs)).toISOString();
  const chunk = runYc(sinceIso, untilIso);
  for (const entry of chunk) {
    if (entry && entry.uid) byUid.set(entry.uid, entry);
  }
  process.stderr.write(`chunk ${sinceIso} → ${untilIso}: ${chunk.length} rows (unique ${byUid.size})\n`);
}

const merged = [...byUid.values()].sort(
  (a, b) => String(a.timestamp).localeCompare(String(b.timestamp)),
);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ out: OUT, unique_rows: merged.length }, null, 2));
if (!merged.length) process.exit(2);
