#!/usr/bin/env node
/**
 * Polosa 6 · task 106 · date-remainders — 3 changed + 1 NEW row (5 сентября).
 * Run after: node scripts/ui-v4-check-contract-drift.mjs --rehash date-remainders
 */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'date-remainders';
const TEST = 'apps/web/__tests__/polosa6-task106-date-remainders-touch-44px.test.js';

const ROWS = [
  [
    'стрелки',
    '=',
    '000-base:8050 .date-picker-day-nav width/height 44 px видимым кружком, ::after expander снят; :8085 --disabled opacity 0.4; heys_day_pickers.js:360 правая остаётся в DOM с aria-disabled — ' +
      `${TEST} 4/4 + date-remainders-v4-smoke «капсула даты»`,
  ],
  [
    'тач-цели',
    '=',
    'Пакет 5 сентября: капсула min-height 44 px (:8103), чужой день height 44 (:8190), стрелки 44×44 без ::after; ночная капсула 36 px — исключение «ночь до 03:00»; ' +
      `${TEST} TOUCH_CONTRACT_LINES + computed sand=blue`,
  ],
  [
    'Капсула · ночь на 21 августа · 03',
    '=',
    '000-base:8043 .date-picker-day-nav width/height 44 px, radius 999, background --v4-surface, color --v4-ink-2; кадр обновлён 5 сентября с 34 на 44; ' +
      `${TEST} computed + date-remainders-v4-canvas-razbor ·03`,
  ],
  [
    'Капсула · ночь на 21 августа · 04',
    '=',
    '000-base:8152 .date-picker-trigger--night height 36 px по строке «ночь до 03:00»; кадр рисует 44 — отступление в date-remainders-v4-canvas-razbor EXCEPTIONS ·04|height; гейт razbor ·04',
  ],
  [
    'Дата · сегодня, прокручено · 47',
    '=',
    '000-base:8103 trigger min-height 44 px в .hdr-sticky-strip (:3966 padding 16/18/10, тень на подложке :4012, не на капсуле); кадр рисует box-shadow на капсуле — верен контракт «вид липкой капсулы»',
  ],
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
  console.log(`${key} → ${verdict}`);
}

assertForeignRowsUnchanged(foreignBefore, zone.rows);
writeZone(ZONE, zone);
console.log(`polosa6-task106: set ${ROWS.length} rows`);
