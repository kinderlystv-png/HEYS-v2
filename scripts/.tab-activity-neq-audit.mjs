#!/usr/bin/env node
/**
 * Перепроверка всех «≠» в tab-activity.json — 2026-09-04.
 * Три проверки: строка канваса (data-v) · блок [data-contract] · код/CSS.
 * Per-key merge via patchZoneRow — строки вне RESOLVE не трогаем.
 */
import { patchZoneRow, readZone } from './lib/ui-v4-verdicts.mjs';

const Q = 'причина не найдена, 2026-09-04';

/** Решения: keep ≠ | demote ? */
const RESOLVE = {
  'вид · календарь зарядки': {
    v: '?',
    f: `${Q}: tab-activity.v4.dc.html «вид · календарь зарядки» 31.08 — «Сегодня» обводкой 1,5 px; 731-ui-v4-activity.css:689-691 inset box-shadow. Прежний ≠ про конфликт заливки 16 % с ответом №23 не подтверждён`,
  },
  'Актив · день собран · 28': {
    v: '?',
    f: `${Q}: tab-activity.v4.dc.html ·28 — rgba(var(--ink),.56); 731-ui-v4-activity.css:458 var(--v4-ink-data). Прежний ≠ «45 % вместо 42 %» не найден`,
  },
};

const zone = readZone('tab-activity');
if (!zone?.rows) {
  console.error('tab-activity: зона не найдена');
  process.exit(1);
}

const neqBefore = Object.entries(zone.rows).filter(([, r]) => r.v === '≠');
let confirmed = 0;
let demoted = 0;

for (const [key] of neqBefore) {
  const patch = RESOLVE[key];
  if (patch) {
    patchZoneRow('tab-activity', key, (row) => {
      row.v = patch.v;
      row.f = patch.f;
    });
    demoted += 1;
  } else {
    confirmed += 1;
  }
}

console.log(JSON.stringify({
  verified: neqBefore.length,
  confirmed_ne: confirmed,
  demoted_to_q: demoted,
  demoted_keys: Object.keys(RESOLVE),
}, null, 2));
