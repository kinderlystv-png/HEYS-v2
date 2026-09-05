#!/usr/bin/env node
/**
 * Polosa 2 · task 102 — messenger package 36 acceptance (4 drift rows; тач-цели нет в канвасе HEAD).
 */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const DECISION_REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/messenger.v4.dc.html:116';

const KEYS = [
  '«Ждём» — вторая строка шапки',
  'подсказка «время и граммы» — рабочая',
  'вид · шапка',
  'вид · строка «Ждём»',
];

const PATCHES = [
  {
    key: '«Ждём» — вторая строка шапки',
    verdict: '≠',
    fact:
      'heys_messenger_v1.js:2535 DayChecklistRow шаблоны/API сведены; 1000-messenger.css:313-340 chips min-height 44px — data-v «чипы 30 px»',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': DECISION_REF },
  },
  {
    key: 'подсказка «время и граммы» — рабочая',
    verdict: '≠',
    fact:
      'heys_messenger_v1.js:2424 FoodHintCard + shouldShowFoodHint streak=10; 1000-messenger.css:1859 pills min-height 44px — data-v «пилюль 32 px»',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': DECISION_REF },
  },
  {
    key: 'вид · шапка',
    verdict: '≠',
    fact:
      '1000-messenger.css:148-377 padding 14/12/10/18, avatar 38px, title 14.5/700, subtitle 11/500, buttons 44px round — data-v «кнопки 40 px»',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': DECISION_REF },
  },
  {
    key: 'вид · строка «Ждём»',
    verdict: '≠',
    fact:
      '1000-messenger.css:279-340 padding 8/18/10, label 9.5/.14em, chips min-height 44px padding 0/11 — data-v «чипы 30 px»',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': DECISION_REF },
  },
];

function main() {
  const zone = readZone('messenger');
  const keySet = new Set(KEYS);
  const foreignBefore = snapshotForeignRowStrings(zone.rows, keySet);

  for (const patch of PATCHES) {
    const result = setVerdictKey(
      'messenger',
      patch.key,
      { verdict: patch.verdict, fact: patch.fact, options: patch.options },
      { allowDowngrade: true },
    );
    if (result.skipped) {
      console.warn(`skip ${patch.key}: ${result.reason}`);
    }
  }

  const live = readZone('messenger');
  assertForeignRowsUnchanged(foreignBefore, live.rows);

  console.log(JSON.stringify({
    applied: PATCHES.length,
    rows: PATCHES.map((p) => ({ key: p.key, v: live.rows[p.key].v })),
    note: 'тач-цели: строки нет в messenger.v4.dc.html HEAD — вердикт не ставился',
  }, null, 2));
}

main();
