#!/usr/bin/env node
/** Task 116 — CycleReportScreen + PeriodReportScreen verdicts (no --rehash). */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'strength-builder';
const UI = 'heys_strength_proposal_ui_v1.js';
const CSS = '750-strength-builder.css';
const TEST = 'strength-proposal-v4-canvas-contract.test.js';

const ROWS = [
  ['вид · отчёт цикла', '=', `CycleReportScreen Г2: ${UI}:1850+ sb-finish-head+✕ «Отчёт по циклу»+cycleReportHeaderKey; planVsDoneBodyEl reuse .sb-plan-vs-*; вход CycleScreen .sb-cycle-report-link→openCycleReport; ${TEST}`],
  ['вид · отчёт за период', '=', `PeriodReportScreen Г6: ${UI}:1959+ sb-finish-head «Отчёт за период»; .sb-period-outcomes четыре исхода; debt card+CTA+footnote; ${CSS}:7628+; ${TEST}`],
  ['Программа · назначено против сделано · 03', '=', `${UI}:1862 — заголовок «Отчёт по циклу» на CycleReportScreen (Г2), не in-session PlanVsDoneScreen`],
  ['Программа · отчёт за период · 01', '=', `${UI}:1965+ — .sb-finish-head шапка PeriodReportScreen; ${TEST}`],
  ['Программа · отчёт за период · 02', '=', `${CSS} .sb-period-report .sb-head-title flex column gap 3px`],
  ['Программа · отчёт за период · 03', '=', `${UI}:1970 — «Отчёт за период» заголовок экрана`],
  ['Программа · отчёт за период · 04', '=', `${UI}:1722 cycleReportHeaderKey → «недели 1–2 · N назначено» в .sb-head-sub`],
  ['Программа · отчёт за период · 05', '=', `${CSS} .sb-period-scroll overflow-y auto padding 12px 16px 24px`],
  ['Программа · отчёт за период · 06', '=', `${CSS} .sb-period-outcomes margin-top 12px`],
  ['Программа · отчёт за период · 07', '=', `${CSS} .sb-period-outcome-row flex space-between`],
  ['Программа · отчёт за период · 08', '=', `${CSS} .sb-period-outcome-label color var(--tx)`],
  ['Программа · отчёт за период · 09', '=', `${CSS} .sb-period-outcome-val.is-ok color var(--gr) 700 12.5px`],
  ['Программа · отчёт за период · 10', '=', `${CSS} .sb-period-outcome-detail 11px/1.3 ink 56%`],
  ['Программа · отчёт за период · 11', '=', `${CSS} .sb-period-outcome-val tone tx для перенесено`],
  ['Программа · отчёт за период · 12', '=', `${CSS} .sb-period-outcome-val.is-bad color var(--val-bad)`],
  ['Программа · отчёт за период · 13', '=', `${CSS} .sb-period-outcome-row.is-last border-bottom none`],
  ['Программа · отчёт за период · 14', '=', `${CSS} .sb-period-outcome-val.is-muted 600 ink 55%`],
  ['Программа · отчёт за период · 15', '=', `${CSS} .sb-period-debt-card margin-top 10px background var(--tint)`],
  ['Программа · отчёт за период · 16', '=', `${UI}:1979 PERIOD_REPORT_DEBT_TITLE ac2 12.5px/700`],
  ['Программа · отчёт за период · 17', '=', `${UI}:1980 PERIOD_REPORT_DEBT_PROSE 12px ink 60%`],
  ['Программа · отчёт за период · 18', '=', `${CSS} .sb-period-cta margin-top 12px min-height 48px`],
  ['Программа · отчёт за период · 19', '=', `${UI}:1987 PERIOD_REPORT_FOOTNOTE сноска`],
  ['Программа · отчёт за период · текст', '=', `${TEST} PeriodReportScreen smoke: исходы, debt card, footnote copy chain`],
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
console.log(`task116 report screens: set ${ROWS.length} rows`);
