#!/usr/bin/env node
/**
 * Selftest: single-handoff apply must not mutate foreign verdict rows.
 *
 *   node scripts/.sb-750-verdict-batch-apply-selftest.mjs
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { readZone } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href);
const { buildBatchMap, applyBatchMap } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/.sb-750-verdict-batch-apply.mjs')).href
);

const HANDOFF = path.join(ROOT, 'scripts/.sb-catalog-custom-exercise-handoff.json');
const ZONE_ID = 'strength-builder';
const G1_PREFIX = 'Программа · цикл · ';

function rowDigest(row) {
  return crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 16);
}

function g1Keys(rows) {
  return Object.keys(rows)
    .filter((k) => /^Программа · цикл · (0[1-9]|[12][0-9]|3[0-3])$/.test(k))
    .sort();
}

function loadHandoffKeys(filePath) {
  const handoff = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const keys = new Set();
  for (const section of ['rows', 'outOfScopeCssRows', 'outOfScopeRuntimeRows']) {
    for (const row of handoff[section] || []) {
      const key = row.key || row.contractLine;
      if (key) keys.add(key);
    }
  }
  return keys;
}

function snapshotZone(zone, excludeKeys) {
  const snap = {};
  for (const [key, row] of Object.entries(zone.rows)) {
    if (!excludeKeys.has(key)) snap[key] = JSON.parse(JSON.stringify(row));
  }
  return snap;
}

function assertForeignUnchanged(before, after, label) {
  const violations = [];
  for (const [key, row] of Object.entries(before)) {
    const next = after.rows[key];
    if (!next) {
      violations.push(`${key}: deleted`);
      continue;
    }
    if (rowDigest(row) !== rowDigest(next)) violations.push(key);
  }
  if (violations.length) {
    console.error(`FAIL ${label}: ${violations.length} foreign keys changed`);
    for (const key of violations.slice(0, 10)) console.error(`  ${key}`);
    return false;
  }
  return true;
}

function assertG1Unchanged(beforeG1, afterRows) {
  const violations = [];
  for (const [key, row] of Object.entries(beforeG1)) {
    const next = afterRows[key];
    if (!next || row.v !== next.v || row.f !== next.f || row.h !== next.h) {
      violations.push(key);
    }
  }
  if (violations.length) {
    console.error(`FAIL G1 cycle: ${violations.length} keys changed`);
    for (const key of violations) {
      console.error(`  ${key}: was ${beforeG1[key].v}/${beforeG1[key].h} now ${afterRows[key]?.v}/${afterRows[key]?.h}`);
    }
    return false;
  }
  return true;
}

function main() {
  const handoffKeys = loadHandoffKeys(HANDOFF);
  console.log(`handoff: ${path.basename(HANDOFF)} (${handoffKeys.size} keys)`);

  const zoneBefore = readZone(ZONE_ID);
  const g1Before = {};
  for (const key of g1Keys(zoneBefore.rows)) g1Before[key] = JSON.parse(JSON.stringify(zoneBefore.rows[key]));
  console.log(`G1 snapshot: ${Object.keys(g1Before).length} keys (${Object.values(g1Before).filter((r) => r.v === '=').length} already =)`);

  const foreignBefore = snapshotZone(zoneBefore, handoffKeys);

  const ctx = buildBatchMap([HANDOFF], { withInline: false, log: () => {} });
  if (ctx.batchMap.size !== handoffKeys.size) {
    console.warn(`warn: queued ${ctx.batchMap.size} vs handoff ${handoffKeys.size} (missing keys skipped)`);
  }

  const { applied, skippedSame, skippedStale } = applyBatchMap(ctx.batchMap, { dryRun: false, allowDowngrade: false, log: () => {} });
  console.log(`apply: ${applied} changed, ${skippedSame} unchanged, ${skippedStale} stale`);

  const zoneAfter = readZone(ZONE_ID);
  let ok = assertG1Unchanged(g1Before, zoneAfter.rows);
  ok = assertForeignUnchanged(foreignBefore, zoneAfter, 'foreign rows') && ok;

  const handoffChanged = [];
  for (const key of handoffKeys) {
    const b = zoneBefore.rows[key];
    const a = zoneAfter.rows[key];
    if (rowDigest(b) !== rowDigest(a)) handoffChanged.push(key);
  }
  console.log(`handoff keys touched: ${handoffChanged.length}/${handoffKeys.size}`);

  if (!ok) {
    console.error('SELFTEST FAILED');
    process.exit(1);
  }
  console.log('SELFTEST OK: G1 cycle 01–33 and all foreign keys unchanged');
  return 0;
}

process.exit(main());
