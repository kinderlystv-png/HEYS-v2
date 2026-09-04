#!/usr/bin/env node
// Storozh: HIGH-risk batch verdict writers must use per-key fresh read (etalon).
//
//   node scripts/ui-v4-check-verdict-batch-writers.mjs
//
// Pass = script uses setVerdictKey / patchZoneRow / per-key readZone in loop, or
// delegates to ui-v4-set-verdict.mjs per key.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'scripts');

/** Scope from 2026-09-04 refactor task — only these are required etalon today. */
export const PRIORITY_HIGH_RISK = [
  '.sb-750-verdict-batch-apply.mjs',
  '.sb-750-verdict-batch-apply-selftest.mjs',
  '.sb-750-b1b2-verdict-apply.mjs',
  '.sb-custom-exercise-verdict-apply.mjs',
  '.sb-proposal-outcome-block-verdicts.mjs',
  '.sb-restore-g1-cycle-verdicts.mjs',
  '.sb-set-cycle-verdicts.mjs',
  '.sb-set-a1-a2-verdicts.mjs',
  '.sb-set-superset-boundaries-verdicts.mjs',
  '.sb-set-superset-create-verdicts.mjs',
  'ui-v4-import-verdicts.mjs',
  '.hw-gamification-verdicts.mjs',
  '.hw-set-fiber-now-verdicts.mjs',
  '.hw-set-footer-mono-verdicts.mjs',
  '.hw-set-remaining-q-verdicts.mjs',
  '.hw-set-weight-verdicts.mjs',
  '.hw-set-rings-verdicts.mjs',
  '.hw-set-insulin-wave-verdicts.mjs',
  'ui-v4-check-contract-drift.mjs',
];

const ETALON_MARKERS = [
  'setVerdictKey',
  'patchZoneRow',
  'deleteZoneRow',
];

/** Delegates each key to CLI (spawn), not merely imports applyVerdictToRow. */
function delegatesPerKeyToCli(source) {
  return (
    /spawnSync\s*\(\s*['"]node['"][\s\S]*?ui-v4-set-verdict\.mjs/s.test(source)
    || /execFileSync\s*\(\s*['"]node['"][\s\S]*?ui-v4-set-verdict\.mjs/s.test(source)
  );
}

/** Per-key loop: readZone inside for/for-of/for-await before writeZone in same file. */
function hasPerKeyReadLoop(source) {
  return /for\s*\([^)]*\)\s*\{[^}]*readZone\s*\(/s.test(source)
    || /for\s*\([^)]*\)\s*\{[\s\S]*?readZone\s*\([\s\S]*?writeZone\s*\(/s.test(source);
}

export function classifyVerdictWriter(source, fileName) {
  if (!source.includes('writeZone') && !source.includes('writeFileSync')) {
    return { fileName, risk: 'none', reason: 'no zone write' };
  }
  if (ETALON_MARKERS.some((m) => source.includes(m))) {
    return { fileName, risk: 'ok', reason: 'etalon marker' };
  }
  if (delegatesPerKeyToCli(source)) {
    return { fileName, risk: 'ok', reason: 'spawn ui-v4-set-verdict per key' };
  }
  if (hasPerKeyReadLoop(source)) {
    return { fileName, risk: 'ok', reason: 'per-key read loop' };
  }
  const readCount = (source.match(/\breadZone\s*\(/g) || []).length;
  const writeCount = (source.match(/\bwriteZone\s*\(/g) || []).length;
  if (readCount >= 2 && writeCount >= 1) {
    return { fileName, risk: 'ok', reason: `${readCount}× readZone` };
  }
  if (source.includes('readAllZones') && source.includes('writeZone')) {
    return { fileName, risk: 'high', reason: 'readAllZones → writeZone batch' };
  }
  if (readCount === 1 && writeCount >= 1) {
    return { fileName, risk: 'high', reason: 'single readZone → writeZone' };
  }
  if (source.includes('writeFileSync') && source.includes('verdicts/')) {
    return { fileName, risk: 'high', reason: 'direct verdict JSON writeFileSync' };
  }
  return { fileName, risk: 'unknown', reason: 'unclassified writer' };
}

export function scanPriorityWriters(root = ROOT) {
  const results = [];
  for (const fileName of PRIORITY_HIGH_RISK) {
    const filePath = path.join(root, 'scripts', fileName);
    if (!fs.existsSync(filePath)) {
      results.push({ fileName, risk: 'missing', reason: 'file not found' });
      continue;
    }
    const source = fs.readFileSync(filePath, 'utf8');
    results.push(classifyVerdictWriter(source, fileName));
  }
  return results;
}

function runCli() {
  const results = scanPriorityWriters();
  const high = results.filter((r) => r.risk === 'high');
  const ok = results.filter((r) => r.risk === 'ok');
  const other = results.filter((r) => !['ok', 'high'].includes(r.risk));

  console.log(`Priority HIGH-risk writers: ${PRIORITY_HIGH_RISK.length}`);
  console.log(`  etalon OK: ${ok.length}`);
  console.log(`  still HIGH: ${high.length}`);
  if (other.length) console.log(`  other: ${other.length}`);

  if (high.length) {
    console.error('\n❌ Batch writers without per-key fresh read:');
    for (const row of high) console.error(`  ${row.fileName} — ${row.reason}`);
  }
  for (const row of ok) {
    console.log(`  ✓ ${row.fileName} (${row.reason})`);
  }

  if (high.length) process.exit(1);
  console.log('\nAll priority batch writers use etalon pattern.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
