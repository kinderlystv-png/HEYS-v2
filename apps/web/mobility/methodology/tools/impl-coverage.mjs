#!/usr/bin/env node
// impl-coverage.mjs — source coverage guard for the mobility implementation map.
//
// This is not a semantic verifier. It catches mechanical drift:
//   1) every methodology unit has an IMPLEMENTATION_MAP row;
//   2) every Q-* reference from cards exists in the Q pool;
//   3) all source/test/integration artifacts required by the current map exist.
//
// Run from repo root or this directory:
//   node apps/web/mobility/methodology/tools/impl-coverage.mjs

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = dirname(fileURLToPath(import.meta.url));
const methodDir = resolve(toolDir, '..');
const mobilityDir = resolve(methodDir, '..');
const webDir = resolve(mobilityDir, '..');
const testsDir = resolve(webDir, '__tests__');

const read = (path) => readFileSync(path, 'utf8');
const rel = (path) => path.replace(resolve(webDir, '..', '..') + '/', '');
const byId = (a, b) => a.localeCompare(b, undefined, { numeric: true });

const METH = read(join(methodDir, 'METHODOLOGY.md'));
const MAP = read(join(methodDir, 'IMPLEMENTATION_MAP.md'));

const required = new Set();

// Methodology units.
for (const m of METH.matchAll(/^### (\d+\.\d+)\./gm)) required.add(m[1]);
for (const m of METH.matchAll(/^### Блок ([A-Z])\./gm)) required.add('block-' + m[1]);
for (const m of METH.matchAll(/^\|\s*(S\d+)\s*\|/gm)) required.add(m[1]);

// Part-level units without subsections or block lists.
for (const m of METH.matchAll(/^## Часть (\d+)\./gm)) {
  const n = m[1];
  const hasSub = new RegExp(`^### ${n}\\.\\d`, 'm').test(METH);
  const hasBlocks = n === '4' && /^### Блок /m.test(METH);
  if (!hasSub && !hasBlocks) required.add('part-' + n);
}

// Mobility map intentionally splits part 6 into concrete rows and adds part-2
// as an aggregate model row. Keep these style differences explicit.
const coverageAliases = {
  'part-6': ['6.m', '6.p', '6.c', '6.s']
};
const allowedExtraRows = new Set(['part-2']);

const provided = new Set();
for (const m of MAP.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)) {
  if (!m[1].startsWith('Q-')) provided.add(m[1]);
}

const isCovered = (id) => {
  if (provided.has(id)) return true;
  const aliases = coverageAliases[id] || [];
  return aliases.length > 0 && aliases.every((alias) => provided.has(alias));
};

const missing = [...required].filter((id) => !isCovered(id)).sort(byId);
const orphan = [...provided].filter((id) => {
  if (required.has(id) || allowedExtraRows.has(id)) return false;
  return !Object.values(coverageAliases).some((aliases) => aliases.includes(id));
}).sort(byId);

console.log(`Methodology units: ${required.size} · map rows: ${provided.size}`);
if (missing.length) {
  console.log(`\n❌ Missing in map (${missing.length}):`);
  console.log('   ' + missing.join(', '));
}
if (orphan.length) {
  console.log(`\n⚠️  Orphan map rows (${orphan.length}):`);
  console.log('   ' + orphan.join(', '));
}
if (!missing.length && !orphan.length) {
  console.log('\n✅ Methodology ↔ map coverage is complete.');
}

// Q pool consistency.
const QID = /`(Q-[0-9A-Za-z.\-]+-\d+)`/g;
const poolQ = new Set();
for (const m of MAP.matchAll(/^\|\s*`(Q-[0-9A-Za-z.\-]+-\d+)`\s*\|/gm)) poolQ.add(m[1]);

const cardQ = new Set();
for (const line of MAP.split('\n')) {
  if (/^\s*\|/.test(line)) continue;
  for (const m of line.matchAll(QID)) cardQ.add(m[1]);
}

const qNotInPool = [...cardQ].filter((q) => !poolQ.has(q)).sort(byId);
const qOpen = (MAP.match(/🔵 open\s*\|/g) || []).length;
const qDone = (MAP.match(/✅ решено\s*\|/g) || []).length;

if (qNotInPool.length) {
  console.log(`\n❌ Q referenced but missing from pool (${qNotInPool.length}):`);
  console.log('   ' + qNotInPool.join(', '));
}
console.log(`\nQ pool: total ${poolQ.size} · open ${qOpen} · done ${qDone}`);

// Required source/test artifacts from the current map/protocol.
const requiredArtifacts = [
  join(mobilityDir, 'heys_mobility_axis_catalog_v1.js'),
  join(mobilityDir, 'heys_mobility_validators_v1.js'),
  join(mobilityDir, 'heys_mobility_atom_catalog_v1.js'),
  join(mobilityDir, 'heys_mobility_mode_engine_v1.js'),
  join(mobilityDir, 'heys_mobility_routine_builder_v1.js'),
  join(mobilityDir, 'heys_mobility_breath_runner_v1.js'),
  join(mobilityDir, 'heys_mobility_routine_runner_v1.js'),
  join(mobilityDir, 'heys_mobility_assessment_v1.js'),
  join(mobilityDir, 'heys_mobility_onboarding_v1.js'),
  join(mobilityDir, 'heys_mobility_readiness_v1.js'),
  join(mobilityDir, 'heys_mobility_bibliography_v1.js'),
  join(mobilityDir, 'heys_mobility_records_store_v1.js'),
  join(mobilityDir, 'heys_mobility_progression_v1.js'),
  join(mobilityDir, 'heys_mobility_calendar_v1.js'),
  join(mobilityDir, 'heys_mobility_ui_v1.js'),
  join(mobilityDir, 'heys_mobility_entry_v1.js'),
  join(webDir, 'heys_mobility_boot_stub_v1.js'),
  join(methodDir, 'VISUAL_PROMPTS.md'),
  join(webDir, 'heys_training_step_v1.js'),
  join(webDir, 'heys_day_stats_bundle_loader_v1.js'),
  join(webDir, 'heys_day_trainings_v1.js'),
  join(webDir, 'scripts', 'bundle-mobility.cjs'),
  join(testsDir, 'mobility-validators.test.js'),
  join(testsDir, 'mobility-catalog.test.js'),
  join(testsDir, 'mobility-builder.test.js'),
  join(testsDir, 'mobility-runner.test.js'),
  join(testsDir, 'mobility-assessment-readiness.test.js'),
  join(testsDir, 'mobility-bibliography.test.js'),
  join(testsDir, 'mobility-records-progression.test.js'),
  join(testsDir, 'mobility-calendar.test.js'),
  join(testsDir, 'mobility-ui.test.js'),
  join(testsDir, 'mobility-entry.test.js'),
  join(testsDir, 'training-step-drums-tab.test.js')
];

const missingArtifacts = requiredArtifacts.filter((path) => !existsSync(path));
if (missingArtifacts.length) {
  console.log(`\n❌ Missing required artifacts (${missingArtifacts.length}):`);
  missingArtifacts.forEach((path) => console.log('   ' + rel(path)));
} else {
  console.log(`✅ Required source/test artifacts exist: ${requiredArtifacts.length}/${requiredArtifacts.length}.`);
}

const todo = (MAP.match(/⬜/g) || []).length;
const draft = (MAP.match(/🟫/g) || []).length;
console.log(`Raw visual markers in map text (legend included): ⬜ ${todo} · 🟫 ${draft}`);

const fail = missing.length || orphan.length || qNotInPool.length || missingArtifacts.length;
process.exit(fail ? 1 : 0);
