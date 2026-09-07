#!/usr/bin/env node
/**
 * Package 48 — accept 5 changed contract rows (messenger×3, tips×1, reports-insights×1).
 * Run AFTER --rehash per zone.
 */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const P48 = 'Пакет 48: контракт перечитан, продукт сверен (ОТВЕТ-отступления §тач-цели, ОТВЕТ-findings).';

const ROWS = [
  {
    zone: 'messenger',
    key: 'тач-цели',
    fact:
      'ui-v4-check-touch-target-visible 0 violations on 1000-messenger.css; шапка/chip/pill/offline 44 px видимым размером; ' +
      '.msg-audio-wave 22 px — не цель (scrub по дорожке, норма 44 к ведению не применяется, пакет 48); ' +
      '.messenger-show-older min-height 44 без ::after — messenger-empty-applied-geometry.test.js',
  },
  {
    zone: 'messenger',
    key: 'вид · тред',
    fact:
      '1000-messenger.css:409-432 padding 6/14/0 gap 8; meta/time/разделитель даты 10.5px/600 --v4-ink-2 (56 %); ' +
      'контракт: минимум 4,5 на --bg/--c1/--c2 — messenger-thread-padding.test.js + messenger-thread-v4-palette.test.js',
  },
  {
    zone: 'messenger',
    key: 'Мессенджер · тред с карточкой дня · 05',
    fact:
      '1000-messenger.css .messenger-show-older min-height 44px padding 0 14px radius 999px --v4-c1 11.5px/600 --v4-ink-2 center — ' +
      'messenger-empty-applied-geometry.test.js chromium @375 sand+blue+sand-dark',
  },
  {
    zone: 'reports-insights',
    key: 'тач-цели',
    fact:
      'Замер chromium 375 px 06.09: .reports-v4-period-pill и .reports-v4-measure__cta min-height 44px (733-ui-v4-reports.css). ' +
      'Пакет 48: столбик энергии — цель вся колонка дня (шаг сетки), «Развернуть неделю» — вся строка 44; припуск ±8 запрещён',
  },
  {
    zone: 'tips',
    key: 'всплывающий совет и тосты',
    fact:
      'heys_toast_v1: совет — .advice-v4-toast-card (крестик 26, область 44, без «Позже»); полоса автоскрытия нейтральная 3px ink 30 %; ' +
      'роль подтверждения снята в undo-bar.v4.dc.html — tips-v4-canvas-razbor.test.js кадр «Открыть»',
  },
];

function applyZone(zoneId, entries) {
  const scopeKeys = new Set(entries.map((e) => e.key));
  const foreignBefore = snapshotForeignRowStrings(readZone(zoneId).rows, scopeKeys);

  for (const entry of entries) {
    const fact = entry.fact.includes('Пакет 48') ? entry.fact : `${entry.fact} ${P48}`;
    const result = setVerdictKey(zoneId, entry.key, { verdict: '=', fact, options: {} });
    if (result.skipped) {
      console.error('skipped', zoneId, entry.key, result.reason, result.message);
      process.exit(1);
    }
    console.log(`${zoneId} · ${entry.key} → =`);
  }

  assertForeignRowsUnchanged(foreignBefore, readZone(zoneId).rows, scopeKeys);
}

const byZone = new Map();
for (const row of ROWS) {
  if (!byZone.has(row.zone)) byZone.set(row.zone, []);
  byZone.get(row.zone).push(row);
}

for (const [zoneId, entries] of byZone) {
  applyZone(zoneId, entries);
}

console.log(`\npackage48: ${ROWS.length} rows → =`);
