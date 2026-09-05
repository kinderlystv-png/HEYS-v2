#!/usr/bin/env node
/**
 * Task 111 — registration wheel shared layer (17 frame rows + contract line).
 * Per-key merge; no --rehash.
 */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'registration';
const REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/registration.v4.dc.html:57';

const BODY_WHEEL =
  '.mc-wheel-value--current 700 22px/1.35 var(--v4-act-text); .mc-wheel-value--prev/next 600 13px/1.75 color-mix ink 22%; .mc-wheel-values::before капсула --v4-hero 32px — 500-pwa-and-offline.css:5275-5347';

const BIRTH_WHEEL =
  '.profile-personal-wheel-card .mc-wheel-value--current 700 15.5px/2 var(--v4-ink); prev/next 600 12.5px/2.1 ink 40% — 500-pwa-and-offline.css:5492-5505';

const ROWS = [
  ['Регистрация · рост и вес · 12', '=', `рост · предыдущее: ${BODY_WHEEL}`],
  ['Регистрация · рост и вес · 13', '=', `рост · текущее: ${BODY_WHEEL}; profile-body max-width 140 — 500-pwa-and-offline.css:5508-5512`],
  ['Регистрация · рост и вес · 14', '=', `рост · следующее: ${BODY_WHEEL}`],
  ['Регистрация · возраст меньше 18 · 09', '=', `день · предыдущее: ${BIRTH_WHEEL}`],
  ['Регистрация · возраст меньше 18 · 10', '=', `день · текущее: ${BIRTH_WHEEL}`],
  ['Регистрация · возраст меньше 18 · 11', '=', `день · следующее: ${BIRTH_WHEEL}`],
  ['Регистрация · возраст меньше 18 · 12', '=', `месяц · предыдущее: ${BIRTH_WHEEL}`],
  ['Регистрация · возраст меньше 18 · 13', '=', `месяц · текущее: ${BIRTH_WHEEL}`],
  ['Регистрация · возраст меньше 18 · 14', '=', `месяц · следующее: ${BIRTH_WHEEL}`],
  ['Регистрация · возраст меньше 18 · 15', '=', `год · предыдущее: ${BIRTH_WHEEL}`],
  ['Регистрация · возраст меньше 18 · 16', '=', `год · текущее: ${BIRTH_WHEEL}`],
  ['Регистрация · возраст меньше 18 · 17', '=', `год · следующее: ${BIRTH_WHEEL}`],
  ['Регистрация · возраст меньше 18 · 18', '=', `капсула строки даты: .mc-wheel-values::before — 500-pwa-and-offline.css:5275-5287`],
  ['Регистрация · возраст меньше 18 · 19', '=', `тройное колесо gap 6 — profile-personal-wheel-card gap 6 — 500-pwa-and-offline.css:5443-5445`],
  ['Регистрация · ниже нормы имт · 11', '=', `рост · предыдущее: ${BODY_WHEEL}`],
  ['Регистрация · ниже нормы имт · 12', '=', `рост · текущее: ${BODY_WHEEL}`],
  ['Регистрация · ниже нормы имт · 13', '=', `рост · следующее: ${BODY_WHEEL}`],
  ['вид колеса значений', '=', `общий слой сведён по ${REF}; тело 22/700 --v4-act-text, дата 15.5/700 --v4-ink; registration-wheel-v4-palette.test.js sand+blue`],
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
console.log(`task111: set ${ROWS.length} rows to =`);
