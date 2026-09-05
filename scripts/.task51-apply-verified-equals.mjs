#!/usr/bin/env node
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.
/**
 * Task 51 полоса 2 — применить проверенные ≠→= (два метода: handoff + vitest).
 * Orphan keys: rename/delete по scripts/.sb-task48-orphan-keys-handoff.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deleteZoneRow, patchZoneRow, readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORPHAN_HANDOFF = path.join(ROOT, 'scripts/.sb-task48-orphan-keys-handoff.json');

const CHECKIN_FACTS = {
  'Чек-ин · вчера по ощущениям · 19':
    '715-yesterday-verify.css:946-948 .yv-v4-slider-track-wrap height 26px (контракт); кадр stop 24px устарел. Computed sand+blue 26px — checkin-morning-v4-exception-geometry.test.js:75.',
  'Чек-ин · вчера по ощущениям · 22':
    '715-yesterday-verify.css .yv-slider-ticks margin-top 8px (контракт); кадр 7px. Computed sand+blue 8px — checkin-morning-v4-exception-geometry.test.js.',
  'Чек-ин · сила для пачки · 24':
    '715-yesterday-verify.css .yv-canvas-foot gap 8px (контракт); кадр 6px. Computed sand+blue 8px — exception-geometry test.',
  'Чек-ин · цель по шагам · 24':
    '500-pwa-and-offline.css .mc-pill min-height 44px (контракт); кадр 38px. Computed sand+blue 44px — exception-geometry test.',
  'Чек-ин · цель по шагам · 25':
    '500-pwa-and-offline.css .mc-pill min-height 44px (контракт); кадр 38px. Computed sand+blue 44px — exception-geometry test.',
  'Чек-ин · замеры просрочены · 32':
    '500-pwa-and-offline.css .mc-rest-row--overdue background var(--v4-tint); computed sand #f6e6dd / blue #fbe6e2 — exception-geometry test (fixed-code).',
  'Чек-ин · замеры просрочены · 35':
    '500-pwa-and-offline.css .mc-rest-overdue-badge font-size 10px (контракт); кадр 9.5px. Computed sand+blue 10px — exception-geometry test.',
  'Добавки · добавление · 08':
    '500-pwa-and-offline.css .mc-supp-flow-tier margin 13px 0 7px (EXCEPTION razbor :89); кадр 14/0/7. Computed sand+blue — exception-geometry test.',
  'Чек-ин · шаги своё число · 19':
    'heys_steps_v1.js inline marginTop 26px без карточки/рефида, 14px с карточкой или рефидом (контракт); кадр 20px. Симуляция — exception-geometry test.',
};

const LEGACY_FACTS = {
  'Новый уровень · 0 мс · 05':
    '.game-v4-sheet__hero--cream background var(--v4-hero) + sand-lock; computed sand/blue #efe3cf — polosa4-task41-legacy-surface-v4.test.js. position:relative без overflow:hidden — именованное отступление в правиле.',
  'Новый уровень · 420 мс · 05':
    'Тот же .game-v4-sheet__hero--cream var(--v4-hero); computed sand/blue — polosa4-task41-legacy-surface-v4.test.js.',
  'Новый уровень · 1200 мс · 05':
    'Тот же .game-v4-sheet__hero--cream var(--v4-hero); computed sand/blue — polosa4-task41-legacy-surface-v4.test.js.',
  'Новый уровень · 1600 мс · 05':
    'Тот же .game-v4-sheet__hero--cream var(--v4-hero); computed sand/blue — polosa4-task41-legacy-surface-v4.test.js.',
  'Питание · приём раскрыт · текст':
    'nutrition-v4-meal-row__num/__kcal/__items/__add на --v4-hero, --v4-act-text, --v4-ink-2; computed sand/blue различаются по палитре — polosa4-task41-legacy-surface-v4.test.js.',
  'Инсайты · ярус Питание · 06':
    '.meal-rec-card--v4 border none, box-shadow none, background var(--v4-card); .meal-rec-v4__why var(--v4-ink-2); computed sand/blue — polosa4-task41-legacy-surface-v4.test.js.',
  'Настройки · настроить подробно · 03':
    '.notify-detail__handle rgba(var(--v4-ink-rgb), 0.14), не --v4-track — polosa4-task41-legacy-surface-v4.test.js.',
  'Настройки · чипы быстрых действий · 27':
    '.hdr-settings-sheet__scroll padding-bottom calc(56px + safe-area); chip --v4-ink-rgb 14% — polosa4-task41-legacy-surface-v4.test.js.',
};

const STRENGTH_TASK38_FACTS = {
  'отчёт называет дыру':
    'BuilderPlanVsDoneScreen .sb-plan-vs-hole «Пропущенная не считается сделанной» + disclosure copy — heys_strength_builder_ui_v1.js; strength-builder-task38-canvas-conflict.test.js.',
  'Куратор и зал · 13':
    'CuratorPlanStrip mid-session showActions:true — pill «Начать по плану» в .sb-cur-plan-actions — heys_strength_builder_ui_v1.js; task38 test.',
  'Куратор и зал · 14':
    'CuratorPlanStrip mid-session showActions:true — pill «Своя» рядом с «Начать по плану» — heys_strength_builder_ui_v1.js; task38 test.',
};

function applyEquals(zoneId, entries) {
  let n = 0;
  for (const [key, fact] of Object.entries(entries)) {
    const zone = readZone(zoneId);
    if (!zone?.rows?.[key]) {
      console.log(`skip missing ${zoneId} :: ${key}`);
      continue;
    }
    if (zone.rows[key].v === '=') {
      console.log(`skip already = ${zoneId} :: ${key}`);
      continue;
    }
    setVerdictKey(zoneId, key, { verdict: '=', fact, options: {} });
    n += 1;
    console.log(`= ${zoneId} :: ${key}`);
  }
  return n;
}

function applyOrphanHandoff() {
  const handoff = JSON.parse(fs.readFileSync(ORPHAN_HANDOFF, 'utf8'));
  const zoneId = handoff.zone || 'strength-builder';
  const log = { renames: [], deletes: [], skipped: [] };

  for (const row of handoff.rows || []) {
    const key = row.key;
    const zone = readZone(zoneId);
    if (!zone?.rows?.[key]) {
      log.skipped.push({ key, action: row.action, reason: 'orphan key absent' });
      continue;
    }
    if (row.action === 'delete') {
      deleteZoneRow(zoneId, key);
      log.deletes.push(key);
      console.log(`delete orphan ${key}`);
      continue;
    }
    if (row.action === 'rename' && row.renameTo) {
      const target = readZone(zoneId)?.rows?.[row.renameTo];
      if (target?.v === '=') {
        deleteZoneRow(zoneId, key);
        log.renames.push({ from: key, to: row.renameTo, note: 'target already =' });
      } else if (!target) {
        patchZoneRow(zoneId, key, (srcRow, liveZone) => {
          liveZone.rows[row.renameTo] = { ...srcRow };
          delete liveZone.rows[key];
        });
        log.renames.push({ from: key, to: row.renameTo });
      } else {
        deleteZoneRow(zoneId, key);
        log.renames.push({ from: key, to: row.renameTo, note: 'dropped orphan, target kept' });
      }
      console.log(`rename orphan ${key} → ${row.renameTo}`);
    }
  }
  return log;
}

let total = 0;
const orphanLog = applyOrphanHandoff();
total += applyEquals('checkin-morning', CHECKIN_FACTS);
total += applyEquals('gamification', LEGACY_FACTS);
total += applyEquals('nutrition-tab', { 'Питание · приём раскрыт · текст': LEGACY_FACTS['Питание · приём раскрыт · текст'] });
total += applyEquals('reports-insights', { 'Инсайты · ярус Питание · 06': LEGACY_FACTS['Инсайты · ярус Питание · 06'] });
total += applyEquals('settings-system', {
  'Настройки · настроить подробно · 03': LEGACY_FACTS['Настройки · настроить подробно · 03'],
  'Настройки · чипы быстрых действий · 27': LEGACY_FACTS['Настройки · чипы быстрых действий · 27'],
});
total += applyEquals('strength-builder', STRENGTH_TASK38_FACTS);

console.log(JSON.stringify({ appliedEquals: total, orphanLog }, null, 2));
