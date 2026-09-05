#!/usr/bin/env node
/** Task 101 package 36 — strength-builder zone verdicts (after rehash). */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'strength-builder';

const ROWS = [
  ['вид · отчёт цикла', '=', 'PlanVsDoneScreen Г2: .sb-plan-vs-done .sb-plan-vs-cell.is-assigned — background var(--bg), inset 1px rgba(var(--ink),.1) — 731-ui-v4-activity.css:1808-1810; смоук strength-builder-plan-vs-done-v4-canvas-contract.test.js'],
  ['структура канона разнесена по всем кадрам', '—', 'Пакет 36: строка scope канваса — contract-snapshot.js + data-canonref на 34 кадрах; не поведение продукта — strength-builder.v4.dc.html:2456+'],
  ['чего нет в этом заходе', '—', 'Handoff: разбор 16c–16d исходной сборки не найден; кадр «Программа · цикл» сверен по правилам канваса — strength-builder.v4.dc.html:2456; naKind handoff'],
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
  if (verdict === '—') row.naKind = 'handoff';
}

assertForeignRowsUnchanged(foreignBefore, zone.rows);
writeZone(ZONE, zone);
console.log(`task101 pkg36 strength-builder: set ${ROWS.length} rows`);
