#!/usr/bin/env node
/**
 * Task 92 — L10–L12 proposal outcome screens (55 rows).
 * Per-key merge; no --rehash.
 */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'strength-builder';
const REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:2381';

const ROWS = [
  ['Исход · правка принята · 01', '=', 'Л10 ·01 шапка: ProposalOutcomeScreen .sb-head.sb-finish-head — heys_strength_proposal_ui_v1.js ProposalOutcomeScreen'],
  ['Исход · правка принята · 02', '=', 'Л10 ·02 ✕ 36×36: .sb-icon-btn в ProposalOutcomeScreen head — finish shell reuse 750-strength-builder.css:2052-2060'],
  ['Исход · правка принята · 03', '=', 'Л10 ·03 .sb-head-title flex:1 column gap 3px — 750-strength-builder.css:2062-2069 на .sb-proposal-resolution'],
  ['Исход · правка принята · 04', '=', 'Л10 ·04 dayLabel title: buildAcceptedOutcomeSnapshot dayLabel → ProposalOutcomeScreen b — proposal_ui_v1.js'],
  ['Исход · правка принята · 05', '=', 'Л10 ·05 subtitle resolvedAt: fmtCuratorEditClock в buildAcceptedOutcomeSnapshot — proposal_ui_v1.js'],
  ['Исход · правка принята · 06', '=', 'Л10 ·06 пилюля «принято»: .sb-proposal-resolution-badge --gr-bg/--gr — 750-strength-builder.css'],
  ['Исход · правка принята · 07', '=', 'Л10 ·07 scroll: .sb-list.sb-finish-list на ProposalOutcomeScreen — 750-strength-builder.css:2082+'],
  ['Исход · правка принята · 08', '=', 'Л10 ·08 hero .grp mt12 --gr-bg: .sb-proposal-resolution-hero.is-ok — 750-strength-builder.css'],
  ['Исход · правка принята · 09', '=', 'Л10 ·09 «План обновлён · N изменений» 700 12.5px --gr: heroTitle buildAcceptedOutcomeSnapshot — proposal_ui_v1.js'],
  ['Исход · правка принята · 10', '=', 'Л10 ·10 проза frozen copy: heroProse buildAcceptedOutcomeSnapshot — proposal_ui_v1.js'],
  ['Исход · правка принята · 11', '=', 'Л10 ·11 tier «Что осталось как было»: .sb-proposal-resolution-tier — ProposalOutcomeScreen'],
  ['Исход · правка принята · 12', '=', 'Л10 ·12 список frozen: .sb-proposal-resolution-list — ProposalOutcomeScreen'],
  ['Исход · правка принята · 13', '=', 'Л10 ·13 строка: .sb-proposal-resolution-row flex — 750-strength-builder.css'],
  ['Исход · правка принята · 14', '=', 'Л10 ·14 имя упражнения --tx: .sb-proposal-resolution-main — 750-strength-builder.css'],
  ['Исход · правка принята · 15', '=', 'Л10 ·15 «заморожено» --gr 11.5px: .sb-proposal-resolution-mark.is-ok — 750-strength-builder.css'],
  ['Исход · правка принята · 16', '=', 'Л10 ·16 border none last row: .sb-proposal-resolution-row.is-last — 750-strength-builder.css'],
  ['Исход · правка принята · 17', '=', 'Л10 ·17 baseline gap 6px: .sb-proposal-resolution-weight gap 6px — 750-strength-builder.css'],
  ['Исход · правка принята · 18', '=', 'Л10 ·18 old weight ink56% strike: .sb-proposal-resolution-weight .is-old — 750-strength-builder.css'],
  ['Исход · правка принята · 19', '=', 'Л10 ·19 new weight --ac: .sb-proposal-resolution-weight .is-new — 750-strength-builder.css'],
  ['Исход · правка принята · 20', '=', 'Л10 ·20 «убран из плана» --ac2: mark is-warn в changed removed — proposal_ui_v1.js'],
  ['Исход · правка принята · 21', '=', 'Л10 ·21 CTA «Продолжить тренировку» mt12: .sb-proposal-resolution-btn — ProposalOutcomeScreen'],
  ['Исход · правка принята · 22', '=', 'Л10 ·22 footnote составом: ACCEPTED_OUTCOME_FOOTNOTE .sb-proposal-resolution-footnote — proposal_ui_v1.js'],
  ['Исход · отказ · 01', '=', 'Л11 ·01 шапка: ProposalOutcomeScreen variant declined — proposal_ui_v1.js'],
  ['Исход · отказ · 02', '=', 'Л11 ·02 ✕: .sb-icon-btn на declined outcome head — ProposalOutcomeScreen'],
  ['Исход · отказ · 03', '=', 'Л11 ·03 head column gap 3px: .sb-head-title — 750-strength-builder.css:2062-2069'],
  ['Исход · отказ · 04', '=', 'Л11 ·04 dayLabel title: buildDeclinedOutcomeSnapshot — proposal_ui_v1.js'],
  ['Исход · отказ · 05', '=', 'Л11 ·05 «предложение отклонено»: subtitle buildDeclinedOutcomeSnapshot — proposal_ui_v1.js'],
  ['Исход · отказ · 06', '=', 'Л11 ·06 scroll: .sb-finish-list на declined outcome — ProposalOutcomeScreen'],
  ['Исход · отказ · 07', '=', 'Л11 ·07 hero .grp mt12 --c1: .sb-proposal-resolution-hero.is-neutral — 750-strength-builder.css'],
  ['Исход · отказ · 08', '=', 'Л11 ·08 «План остался прежним» --tx: heroTitle buildDeclinedOutcomeSnapshot — proposal_ui_v1.js'],
  ['Исход · отказ · 09', '=', 'Л11 ·09 проза про куратора: heroProse buildDeclinedOutcomeSnapshot — proposal_ui_v1.js'],
  ['Исход · отказ · 10', '=', 'Л11 ·10 список mt10: .sb-proposal-resolution-list.is-spaced — 750-strength-builder.css'],
  ['Исход · отказ · 11', '=', 'Л11 ·11 строка списка: .sb-proposal-resolution-row — ProposalOutcomeScreen'],
  ['Исход · отказ · 12', '=', 'Л11 ·12 имя строки --tx: .sb-proposal-resolution-main — buildDeclinedOutcomeSnapshot rows'],
  ['Исход · отказ · 13', '=', 'Л11 ·13 «75 кг» mono --tx: row.value .sb-proposal-resolution-mark — proposal_ui_v1.js'],
  ['Исход · отказ · 14', '=', 'Л11 ·14 border none: .sb-proposal-resolution-row.is-last — 750-strength-builder.css'],
  ['Исход · отказ · 15', '=', 'Л11 ·15 «остаётся в плане» ink56%: row.status .is-muted — buildDeclinedOutcomeSnapshot'],
  ['Исход · отказ · 16', '=', 'Л11 ·16 «Посмотреть, что он предлагал»: .sb-proposal-resolution-btn-secondary — ProposalOutcomeScreen'],
  ['Исход · отказ · 17', '=', 'Л11 ·17 footnote тихий отказ: DECLINED_OUTCOME_FOOTNOTE — proposal_ui_v1.js'],
  ['Исход · без ответа · 01', '=', 'Л12 ·01 шапка: ProposalOutcomeScreen variant expired — proposal_ui_v1.js'],
  ['Исход · без ответа · 02', '=', 'Л12 ·02 ✕: .sb-icon-btn expired outcome — ProposalOutcomeScreen'],
  ['Исход · без ответа · 03', '=', 'Л12 ·03 head column gap 3px: .sb-head-title expired — 750-strength-builder.css'],
  ['Исход · без ответа · 04', '=', 'Л12 ·04 «Тренировка завершена»: dayLabel buildExpiredOutcomeSnapshot — proposal_ui_v1.js'],
  ['Исход · без ответа · 05', '=', 'Л12 ·05 elapsed·подходы subtitle: fmtElapsedMinSec + countDoneApproaches — proposal_ui_v1.js'],
  ['Исход · без ответа · 06', '=', 'Л12 ·06 scroll: .sb-finish-list expired outcome — ProposalOutcomeScreen'],
  ['Исход · без ответа · 07', '=', 'Л12 ·07 hero --gr-bg: .sb-proposal-resolution-hero.is-ok expired — 750-strength-builder.css'],
  ['Исход · без ответа · 08', '=', 'Л12 ·08 «Тренировка закрыта» --gr: heroTitle buildExpiredOutcomeSnapshot — proposal_ui_v1.js'],
  ['Исход · без ответа · 09', '=', 'Л12 ·09 проза непринятое: heroProse buildExpiredOutcomeSnapshot — proposal_ui_v1.js'],
  ['Исход · без ответа · 10', '=', 'Л12 ·10 список mt10: .sb-proposal-resolution-list.is-spaced expired — 750-strength-builder.css'],
  ['Исход · без ответа · 11', '=', 'Л12 ·11 строка: .sb-proposal-resolution-row expired rows — ProposalOutcomeScreen'],
  ['Исход · без ответа · 12', '=', 'Л12 ·12 «Сделано по прежнему плану» --tx: rows[0].name buildExpiredOutcomeSnapshot'],
  ['Исход · без ответа · 13', '=', 'Л12 ·13 «N подходов» mono --tx: rows[0].value .sb-proposal-resolution-mark — proposal_ui_v1.js'],
  ['Исход · без ответа · 14', '=', 'Л12 ·14 border none: .sb-proposal-resolution-row.is-last — 750-strength-builder.css'],
  ['Исход · без ответа · 15', '=', 'Л12 ·15 «не принято» ink56%: rows[1] muted mark — buildExpiredOutcomeSnapshot'],
  ['Исход · без ответа · 16', '=', 'Л12 ·16 footnote: EXPIRED_OUTCOME_FOOTNOTE — proposal_ui_v1.js'],
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
console.log(`task92: set ${ROWS.length} outcome rows to =`);
