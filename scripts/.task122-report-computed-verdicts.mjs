#!/usr/bin/env node
/** Task 122 part 1 — report screen computed verdict facts (sand+blue). */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'strength-builder';
const TEST = 'strength-proposal-v4-canvas-contract.test.js';
const CSS731 = '731-ui-v4-activity.css';
const CSS750 = '750-strength-builder.css';

const ROWS = [
  ['вид · отчёт цикла', '=', `CycleReportScreen Г2 computed sand+blue: .sb-plan-vs-dot.is-summary bg var(--gr); .sb-plan-vs-cell.is-positive .sb-plan-vs-cell-val color var(--gr); .sb-plan-vs-cell.is-assigned bg var(--bg) — ${CSS731}:1726+1825+1855; ${TEST}`],
  ['вид · отчёт за период', '=', `PeriodReportScreen Г6 computed sand+blue: .sb-period-outcome-val.is-ok var(--gr); .is-bad var(--val-bad); .sb-period-outcome-detail rgba(var(--ink),.56); .sb-period-debt-card var(--tint); .sb-period-debt-title var(--ac2) — ${CSS750}:7710+; ${TEST}`],
  ['Программа · отчёт за период · 09', '=', `${CSS750}:7701-7703 .sb-period-outcome-val.is-ok color var(--gr) 700 12.5px; computed sand #5c6a45 · blue #5c6a45 — ${TEST}`],
  ['Программа · отчёт за период · 12', '=', `${CSS750}:7705-7707 .sb-period-outcome-val.is-bad color var(--val-bad); computed sand #a83c22 · blue #a8382b — ${TEST}`],
  ['Программа · отчёт за период · 15', '=', `${CSS750}:7714-7719 .sb-period-debt-card background var(--tint); computed sand #f6e6dd · blue #e2ecf6 — ${TEST}`],
  ['Программа · отчёт за период · 16', '=', `${CSS750}:7721-7724 .sb-period-debt-title color var(--ac2); computed sand #a1471c · blue #1d5e96 — ${TEST}`],
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
console.log(`task122 report computed: set ${ROWS.length} rows`);
