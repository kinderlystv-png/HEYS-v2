#!/usr/bin/env node
/** Task 101 package 36 — checkin-morning chip touch rows (contract still 36 + expander). */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'checkin-morning';

const ROWS = [
  ['Добавки · добавление · 10', '=', 'Л10 .mc-supp-flow-chip.is-on: min-height 36px + ::after expander до 44 — 500-pwa-and-offline.css:3038-3063; morning-checkin-v4-contract-geometry.test.js «чип добавки: видимые 36, нажимаемые 44»'],
  ['Добавки · добавление · 11', '=', 'Л11 .mc-supp-flow-chip (off): min-height 36px, padding 0 13px, radius 999px, bg var(--c1) — 500-pwa-and-offline.css:3038-3052; ::after expander — :3056-3063'],
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
}

assertForeignRowsUnchanged(foreignBefore, zone.rows);
writeZone(ZONE, zone);
console.log(`task101 pkg36 checkin-morning: set ${ROWS.length} rows`);
