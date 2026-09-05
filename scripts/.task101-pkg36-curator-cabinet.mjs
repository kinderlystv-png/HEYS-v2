#!/usr/bin/env node
/** Task 101 package 36 — curator-cabinet zone verdicts (after rehash). */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'curator-cabinet';

const ROWS = [
  ['границы', '—', 'Контракт 5 сент: вкладка от ряда вкладок до последней строки; карточка поправки — числа norm-correction.v4.dc.html, лист-обёртка и строка клиента — curator-cabinet.v4.dc.html:759'],
  ['источник', '—', 'Контракт 5 сент: панель/состояния/пустоты — этот канвас; числа поправки — norm-correction; вкладки клиента — reports-insights «Куратор и вкладки» — curator-cabinet.v4.dc.html:760'],
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
  row.naKind = 'handoff';
}

assertForeignRowsUnchanged(foreignBefore, zone.rows);
writeZone(ZONE, zone);
console.log(`task101 pkg36 curator-cabinet: set ${ROWS.length} rows`);
