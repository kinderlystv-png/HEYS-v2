#!/usr/bin/env node
/**
 * Task 86 — post-line verdict review for strength-builder (68 rows).
 * Does NOT call --rehash. Updates v/f/reasonCode/decisionRef only.
 */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'strength-builder';
const OUTCOME_REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:2381';
const CALM_REF = 'docs/ui/UI_V4_FINDINGS.md:62';

const OUTCOME_ACCEPT = {
  '01': 'Л10 ·01 «шапка»: отдельного ProposalAcceptedScreen нет — Parts экспортирует ProposalCard/Review/Outcome (heys_strength_proposal_ui_v1.js:1762-1765); accept → kernel без полноэкранной шапки Л10.',
  '02': 'Л10 ·02 «✕» 36×36 --c1 ink56%: общий .sb-icon-btn на finish (heys_strength_finish_ui_v1.js:303-305, 750-strength-builder.css:2052-2060), не на экране «правка принята».',
  '03': 'Л10 ·03 центр шапки flex:1 column gap 3px: .sb-head-title gap 3px есть на finish-head (750:2062-2069), экран Л10 не монтируется.',
  '04': 'Л10 ·04 «Верх тела B»: dayLabel в ProposalCard (proposal_ui_v1.js:308-313), не в title полноэкранного исхода Л10.',
  '05': 'Л10 ·05 «правка принята в 09:21»: fmtCuratorEditClock только для CuratorEditScreen (proposal_ui_v1.js:540-544); клиентский subtitle resolvedAt не рендерится.',
  '06': 'Л10 ·06 пилюля «принято» --gr-bg/--gr: badgeYes в CURATOR_EDIT_STYLE (proposal_ui_v1.js:512-518) — кураторский кадр Л9, не шапка Л10.',
  '07': 'Л10 ·07 область прокрутки: после acceptPlanProposal UI остаётся в BuilderScreen — нет .sb-list исхода accept (strength-proposal-ui.test.js:63-76).',
  '08': 'Л10 ·08 .grp mt12 --gr-bg: ProposalOutcome section (750:4487+) — copy «легла не полностью», не карточка «План обновлён» Л10.',
  '09': 'Л10 ·09 «План обновлён · 2 изменения» 700 12.5px --gr: rg «План обновлён» apps/web/strength — 0 совпадений.',
  '10': 'Л10 ·10 проза «Сделанное осталось…»: похожая фраза в ProposalCard (proposal_ui_v1.js:304) на карточке дня, не на экране Л10.',
  '11': 'Л10 ·11 ярус «Что осталось как было»: ProposalReview frozen-block (proposal_ui_v1.js:385-397) — другой UI, полноэкранный ярус Л10 отсутствует.',
  '12': 'Л10 ·12 список .cd: клиентский partial-outcome — .sb-proposal-outcome-list (750:4506), не .cd блоки кадра Л10.',
  '13': 'Л10 ·13 строка списка: .sb-proposal-outcome-row flex (750:4512-4520), не .cd .row геометрия Л10.',
  '14': 'Л10 ·14 «Тяга штанги · 3 подхода» color --tx: frozen rows в ProposalReview (.sb-proposal-frozen-list), не полноэкранный список Л10.',
  '15': 'Л10 ·15 «заморожено» mono --gr 11.5px: метка «заморожено» на строках исхода Л10 не рендерится в клиентском runtime.',
  '16': 'Л10 ·16 строка без разделителя: .sb-proposal-outcome-row:first-child border-top (750:4521) — иной паттерн, не border none Л10.',
  '17': 'Л10 ·17 baseline gap 6px для old→new веса: зачёркнутое старое + новое --ac в исходе Л10 не реализовано.',
  '18': 'Л10 ·18 «75» mono ink56%: зачёркнутое старое значение веса на экране исхода accept отсутствует.',
  '19': 'Л10 ·19 «70 кг» mono --ac: aheadOutcomeLabel (proposal_ui_v1.js:253-254) только в списке ProposalCard/Review, не формат Л10.',
  '20': 'Л10 ·20 «убран из плана» --ac2: kind=removed в describePlanEdit, полноэкранный список снятых упражнений Л10 не рендерится.',
  '21': 'Л10 ·21 CTA «Продолжить тренировку» mt12: текст в TrainingDoneCard (superset_ui_v1.js:2284) на карточке дня, не на экране Л10.',
  '22': 'Л10 ·22 сноска про «исход виден составом»: footnote Л10 не рендерится — accept возвращает в builder без поясняющего блока.',
};

const OUTCOME_DECLINE = {
  '01': 'Л11 ·01 «шапка»: экран «Исход · отказ» не монтируется — declinePlanProposal меняет status (strength-proposal-ui.test.js), без полноэкранного Л11.',
  '02': 'Л11 ·02 «✕» 36×36: .sb-icon-btn в ProposalReview head (proposal_ui_v1.js:369) — экран разбора до отказа, не исход Л11 после decline.',
  '03': 'Л11 ·03 центр шапки column gap 3px: .sb-head-title в ProposalReview (proposal_ui_v1.js:370-374), не post-decline шапка Л11.',
  '04': 'Л11 ·04 «Верх тела B»: dayLabel в ProposalReview subtitle (proposal_ui_v1.js:372-373), не title экрана исхода отказа.',
  '05': 'Л11 ·05 «предложение отклонено»: subtitle post-decline не рендерится — rg apps/web/strength «предложение отклонено» — 0.',
  '06': 'Л11 ·06 область прокрутки: после decline UI без полноэкранного scroll-контейнера исхода — proposal.status=declined в kernel.',
  '07': 'Л11 ·07 .grp mt12: карточка «План остался прежним» на --c1 (канвас Л11 ·08) не реализована как отдельный экран.',
  '08': 'Л11 ·08 «План остался прежним» 700 12.5px --tx: rg apps/web/strength «План остался прежним» — 0.',
  '09': 'Л11 ·09 проза про Артёма: explanatory copy исхода отказа не рендерится после declinePlanProposal.',
  '10': 'Л11 ·10 список .cd mt10: post-decline list .cd не монтируется — остаётся прежний план без итогового экрана.',
  '11': 'Л11 ·11 строка списка: нет DOM строки исхода отказа с прежними значениями плана.',
  '12': 'Л11 ·12 «Жим лёжа · подход 4» --tx: строка плана после отказа не показывается на отдельном экране Л11.',
  '13': 'Л11 ·13 «75 кг» mono --tx: mono-значение веса в списке исхода отказа не рендерится.',
  '14': 'Л11 ·14 строка без разделителя: border-none паттерн .cd Л11 отсутствует в runtime.',
  '15': 'Л11 ·15 «остаётся в плане» ink56%: статусная подпись строки исхода отказа не реализована.',
  '16': 'Л11 ·16 вторичная «Посмотреть, что он предлагал» mt12: ближайший «Посмотреть» — ProposalStrip (proposal_ui_v1.js:442), не кнопка исхода Л11.',
  '17': 'Л11 ·17 сноска про тихий отказ: footnote Л11 не рендерится в клиентском UI после decline.',
};

const OUTCOME_NO_ANSWER = {
  '01': 'Л12 ·01 «шапка»: finish .sb-finish-head (finish_ui_v1.js:302-311) — экран итогов тренировки, не dedicated «Исход · без ответа».',
  '02': 'Л12 ·02 «✕» 36×36: .sb-icon-btn на finish-head (finish_ui_v1.js:303-305), не шапка полноэкранного исхода «без ответа».',
  '03': 'Л12 ·03 центр шапки column gap 3px: .sb-finish-head .sb-head-title (750:2062-2069) — finish, не Л12 outcome.',
  '04': 'Л12 ·04 «Тренировка завершена»: title finish-screen (finish_ui_v1.js:307) совпадает по тексту, но это FinishScreen, не кадр Л12 исхода proposal.',
  '05': 'Л12 ·05 «54:30 · 23 подхода»: finish metrics через MetricTile (finish_ui_v1.js:316-320), не subtitle формата Л12 про expired proposal.',
  '06': 'Л12 ·06 область прокрутки: .sb-finish-list scroll на finish, не scroll-контейнер исхода «без ответа» Л12.',
  '07': 'Л12 ·07 .grp mt12 --gr-bg: ProposalOutcome (finish_ui_v1.js:349) — partial reject block, не карточка «Тренировка закрыта» Л12.',
  '08': 'Л12 ·08 «Тренировка закрыта» 700 12.5px --gr: rg apps/web/strength «Тренировка закрыта» — 0.',
  '09': 'Л12 ·09 проза про непринятое предложение: copy исхода expired proposal не рендерится на finish.',
  '10': 'Л12 ·10 список .cd mt10: нет .cd списка исхода «без ответа» — только finish detail rows.',
  '11': 'Л12 ·11 строка списка: DOM строки исхода expired proposal отсутствует.',
  '12': 'Л12 ·12 «Сделано по прежнему плану» --tx: строка summary исхода Л12 не реализована.',
  '13': 'Л12 ·13 «23 подхода» mono --tx: счётчик подходов на finish в другом формате (setCounts), не mono-строка Л12.',
  '14': 'Л12 ·14 строка без разделителя: border-none .cd паттерн Л12 отсутствует.',
  '15': 'Л12 ·15 «не принято» ink56%: статусная подпись expired proposal на клиентском экране не рендерится.',
  '16': 'Л12 ·16 сноска про неблокирующее предложение: footnote Л12 не реализован — expire через kernel без UI исхода.',
};

const CALM = {
  '04': 'А1б ·04: builder_ui is-exercise-open рендерит имя упражнения (Г4 ·01) — rg exerciseWorkProgressKey heys_strength_builder_ui_v1.js; канвас «Силовая · грудь, спина, плечи». calm-canvas-contract CANVAS_CONFLICTS А1б:04.',
  '05': 'А1б ·05: .sb-head-sub «подход N из M» (builder_ui exerciseWorkProgressKey) vs «пн, 8 авг · начата в 18:40». calm-canvas-contract CANVAS_CONFLICTS А1б:05.',
  '14': 'А1б ·14: .sb-ex--collapsed .sb-ex-title b 12.5px (750-strength-builder.css:3391) vs 13px канваса. calm-canvas-contract CANVAS_CONFLICTS А1б:14.',
  '28': 'А1б ·28: .is-weight-entry.is-exercise-open .sb-aps-head padding 0 (builder_ui:1886, 750) vs 10px. calm-canvas-contract CANVAS_CONFLICTS А1б:28.',
  '30': 'А1б ·30: .sb-aps-head > span:last-child computed --gr (#5c6a45 sand) vs ink .56. calm-canvas-contract sand+blue CANVAS_CONFLICTS А1б:30.',
  '31': 'А1б ·31: .is-weight-entry.is-exercise-open .sb-aps gap 0 vs 6px. calm-canvas-contract CANVAS_CONFLICTS А1б:31.',
  '33': 'А1б ·33: .sb-ap.is-done .sb-ap-num --gr vs ink .62. calm-canvas-contract sand+blue CANVAS_CONFLICTS А1б:33.',
  '35': 'А1б ·35: .sb-ap.is-current .sb-ap-num --acs (#c67139 sand) vs bg #fffaf1. calm-canvas-contract sand+blue CANVAS_CONFLICTS А1б:35.',
  '36': 'А1б ·36: кольцо активного поля inset 1.5px (Г4) vs 2px канваса А1б. calm-canvas-contract CANVAS_CONFLICTS А1б:36.',
  '44': 'А1б ·44: .sb-ex--collapsed .sb-ex-title b 12.5px pending card (750:3391) vs 13px. calm-canvas-contract CANVAS_CONFLICTS А1б:44.',
};

function applyOutcome(group, facts) {
  const keys = Object.keys(facts);
  for (const num of keys) {
    const key = `${group} · ${num}`;
    const row = data.rows[key];
    if (!row || row.v !== '?') {
      throw new Error(`Expected ? at ${key}, got ${row?.v}`);
    }
    row.v = '≠';
    row.f = facts[num];
    row.reasonCode = 'canvas-conflict';
    row.decisionRef = OUTCOME_REF;
    if (row.evidence) delete row.evidence;
  }
  return keys.length;
}

function applyCalm() {
  let n = 0;
  for (const num of Object.keys(CALM)) {
    const key = `Конструктор · тренировка идёт · спокойнее · ${num}`;
    const row = data.rows[key];
    if (!row || row.v !== '?') {
      throw new Error(`Expected ? at ${key}, got ${row?.v}`);
    }
    row.v = '≠';
    row.f = CALM[num];
    row.reasonCode = 'canvas-conflict';
    row.decisionRef = CALM_REF;
    n += 1;
  }
  return n;
}

const data = readZone(ZONE);

// Ключи, которые этот скрипт вправе менять. Всё остальное в зоне — чужое.
const OWNED = new Set([
  ...Object.keys(OUTCOME_ACCEPT).map((n) => `Исход · правка принята · ${n}`),
  ...Object.keys(OUTCOME_DECLINE).map((n) => `Исход · отказ · ${n}`),
  ...Object.keys(OUTCOME_NO_ANSWER).map((n) => `Исход · без ответа · ${n}`),
  ...Object.keys(CALM).map((n) => `Конструктор · тренировка идёт · спокойнее · ${n}`),
]);

const counts = {
  accept: applyOutcome('Исход · правка принята', OUTCOME_ACCEPT),
  decline: applyOutcome('Исход · отказ', OUTCOME_DECLINE),
  noAnswer: applyOutcome('Исход · без ответа', OUTCOME_NO_ANSWER),
  calm: applyCalm(),
};

// writeZone пишет файл зоны ЦЕЛИКОМ из снимка, прочитанного выше. В общем
// дереве между чтением и записью в ту же зону могла написать другая полоса —
// и её строки исчезли бы молча, без падения и без следа. Поэтому перед записью
// зона перечитывается, и чужие строки сверяются со снимком: разошлись — падаем,
// а не затираем. Это тот же инвариант, что у lib/handoff-batch-apply.
const foreignBefore = snapshotForeignRowStrings(data.rows, OWNED);
const fresh = readZone(ZONE);
assertForeignRowsUnchanged(foreignBefore, fresh.rows);
for (const key of OWNED) fresh.rows[key] = data.rows[key];

writeZone(ZONE, fresh);

console.log('Task 86 verdicts applied:', counts);
console.log('Total:', Object.values(counts).reduce((a, b) => a + b, 0));
