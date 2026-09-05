#!/usr/bin/env node
/** Task 122 part 3 — finding 09: E1 rest column rows 23–28. */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'strength-builder';
const SUPERSET = 'heys_strength_superset_ui_v1.js';
const CSS = '750-strength-builder.css';
const TEST = 'strength-builder-calm-canvas-contract.test.js';

const FACT = [
  `Кадр Е1 колонка отдыха сведена: .sb-rest-cd-row margin-top 10px; .sb-rest-copy column gap 3px;`,
  `.sb-rest-cd-title color var(--tx); .sb-rest-cd-sub 11px ink 56%; .sb-rest-manual--e1 700 11.5px var(--ac) lowercase «вручную»;`,
  `.sb-rest-cd[aria-hidden=true] скрывает live countdown от SR (намеренно, иначе озвучка каждую секунду);`,
  `${SUPERSET}:1984+ ${CSS}:3809+ ${TEST} rows 40–42.`,
].join(' ');

const ROWS = [
  ['Подход · таблица ввода · 23', '=', FACT],
  ['Подход · таблица ввода · 24', '=', FACT],
  ['Подход · таблица ввода · 25', '=', FACT],
  ['Подход · таблица ввода · 26', '=', FACT],
  ['Подход · таблица ввода · 27', '=', FACT],
  ['Подход · таблица ввода · 28', '=', FACT],
];

const handoffKeys = new Set(ROWS.map((r) => r[0]));
const zone = readZone(ZONE);
const foreignBefore = snapshotForeignRowStrings(zone.rows, handoffKeys);

for (const [key, verdict, fact] of ROWS) {
  const row = zone.rows[key];
  if (!row) {
    console.error('missing key', key);
    process.exit(1);
  }
  row.v = verdict;
  row.f = fact;
  delete row.reasonCode;
  delete row.decisionRef;
  delete row.naKind;
}

assertForeignRowsUnchanged(foreignBefore, zone.rows);
writeZone(ZONE, zone);
console.log(`task122 finding09 rest: set ${ROWS.length} rows`);
