#!/usr/bin/env node
/**
 * Task 136 — home-widgets «Шторка · … · 09/10» (safe-area + scrim).
 * Per-key merge; no --rehash.
 */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'home-widgets';

const WIDGETS = [
  'Калории',
  'Кольца БЖУ',
  'Вода',
  'Сон',
  'Оценка дня',
  'Тепловая карта',
  'Риск-радар',
  'Тренд здоровья',
  'Инсулиновая волна',
  'Вес',
];

const FACT_SAFE_AREA =
  '.widget-wd-sheet padding: 16px 16px calc(18px + env(safe-area-inset-bottom, 0px)) — apps/web/styles/modules/730-widgets-dashboard.css:13880; кадр «Шторка · … · 10» рисует телефон без выреза, safe-area добавляет продукт';

const FACT_SCRIM =
  '.widget-wd-sheet__scrim background var(--scrim) + backdrop-filter blur(var(--v4-modal-backdrop-blur, 2.5px)) — 730-widgets-dashboard.css:13863-13865; роль --scrim песок 002-ui-v4-palette-roles.css:302 rgba(42,26,12,.5) (синий :592 rgba(16,24,38,.45))';

const ROWS = [];
for (const widget of WIDGETS) {
  ROWS.push([`Шторка · ${widget} · 09`, '=', FACT_SCRIM]);
  ROWS.push([`Шторка · ${widget} · 10`, '=', FACT_SAFE_AREA]);
}

const handoffKeys = new Set(ROWS.map((r) => r[0]));
const zone = readZone(ZONE);
if (!zone) {
  console.error('zone not found', ZONE);
  process.exit(1);
}

const foreignBefore = snapshotForeignRowStrings(zone.rows, handoffKeys);

for (const [key, verdict, fact] of ROWS) {
  const row = zone.rows[key];
  if (!row) {
    console.error('missing key', key);
    process.exit(1);
  }
  row.v = verdict;
  row.f = fact;
}

assertForeignRowsUnchanged(foreignBefore, zone.rows);
writeZone(ZONE, zone);
console.log(`task136-home-widgets-shutter: set ${ROWS.length} rows (${WIDGETS.length}×09 + ${WIDGETS.length}×10)`);
