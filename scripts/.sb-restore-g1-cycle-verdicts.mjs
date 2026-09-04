#!/usr/bin/env node
/**
 * Restore G1 «Программа · цикл · 01–33» verdicts from commit 744b9bab8.
 * Per-key patch via applyVerdictToRow — no full file rewrite.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_COMMIT = '744b9bab8';
const ZONE_ID = 'strength-builder';

const { applyVerdictToRow } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/ui-v4-set-verdict.mjs')).href
);
const { readZone, writeZone } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href
);

const sourceJson = execSync(`git show ${SOURCE_COMMIT}:docs/ui/verdicts/strength-builder.json`, {
  cwd: ROOT,
  encoding: 'utf8',
});
const sourceZone = JSON.parse(sourceJson);
const keyRe = /^Программа · цикл · (0[1-9]|[12][0-9]|3[0-3])$/;

const keys = Object.keys(sourceZone.rows).filter((k) => keyRe.test(k)).sort();
if (keys.length !== 33) {
  console.error(`expected 33 G1 keys, found ${keys.length}`);
  process.exit(1);
}

const zone = readZone(ZONE_ID);
let applied = 0;
for (const key of keys) {
  const src = sourceZone.rows[key];
  if (src.v !== '=') {
    console.error(`${key}: source verdict is ${src.v}, expected =`);
    process.exit(1);
  }
  const row = zone.rows[key];
  if (!row) {
    console.error(`missing key in live zone: ${key}`);
    process.exit(1);
  }
  if (row.v === src.v && row.f === src.f) continue;
  applyVerdictToRow(row, { verdict: src.v, fact: src.f, options: {} }, ROOT);
  if (row.h !== src.h) {
    console.warn(`warn: h differs for ${key} (live ${row.h} vs source ${src.h}) — h not overwritten`);
  }
  applied += 1;
}

writeZone(ZONE_ID, zone);
console.log(`restored ${applied} keys from ${SOURCE_COMMIT} (${keys.length} total G1 cycle 01–33)`);
for (const key of keys) {
  const row = zone.rows[key];
  console.log(`  ${key}: v=${row.v} h=${row.h}`);
}
