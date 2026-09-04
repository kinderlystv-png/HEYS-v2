#!/usr/bin/env node
/**
 * Restore G1 «Программа · цикл · 01–33» verdicts from commit 744b9bab8.
 * Per-key setVerdictKey — fresh read before each write.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_COMMIT = '744b9bab8';
const ZONE_ID = 'strength-builder';

const { readZone, setVerdictKey } = await import(
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

let applied = 0;
for (const key of keys) {
  const src = sourceZone.rows[key];
  if (src.v !== '=') {
    console.error(`${key}: source verdict is ${src.v}, expected =`);
    process.exit(1);
  }
  if (!readZone(ZONE_ID)?.rows?.[key]) {
    console.error(`missing key in live zone: ${key}`);
    process.exit(1);
  }
  const result = setVerdictKey(ZONE_ID, key, { verdict: src.v, fact: src.f, options: {} }, {
    root: ROOT,
    skipIf: (row) => row.v === src.v && row.f === src.f,
  });
  if (result.skipped) continue;
  const live = readZone(ZONE_ID).rows[key];
  if (live.h !== src.h) {
    console.warn(`warn: h differs for ${key} (live ${live.h} vs source ${src.h}) — h not overwritten`);
  }
  applied += 1;
}

console.log(`restored ${applied} keys from ${SOURCE_COMMIT} (${keys.length} total G1 cycle 01–33)`);
for (const key of keys) {
  const row = readZone(ZONE_ID).rows[key];
  console.log(`  ${key}: v=${row.v} h=${row.h}`);
}
