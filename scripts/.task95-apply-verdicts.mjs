#!/usr/bin/env node
/**
 * Task 95 lane 1 — ProgramDone geometry + L10–L12 composite text rows.
 * Per-key merge; no --rehash.
 */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'strength-builder';
const REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:2907';

const ROWS = [
  ['Программа пройдена · 01', '=', 'Л01 шапка: ProgramDoneScreen .sb-head.sb-finish-head — heys_strength_proposal_ui_v1.js ProgramDoneScreen'],
  ['Программа пройдена · 02', '=', 'Л02 column gap 3px: .sb-root.program-done .sb-head-title — 750-strength-builder.css:4247-4252'],
  ['Программа пройдена · 03', '=', 'Л03 «Программа пройдена» title b — ProgramDoneScreen head'],
  ['Программа пройдена · 04', '=', 'Л04 date range .program-done-date tabular-nums: programDoneDateRange — proposal_ui_v1.js'],
  ['Программа пройдена · 05', '=', 'Л05 badge .program-done-badge --gr-bg/--gr — 750-strength-builder.css:5686-5693; contract test sand palette'],
  ['Программа пройдена · 06', '=', 'Л06 scroll .sb-list.sb-finish-list — ProgramDoneScreen'],
  ['Программа пройдена · 11', '=', 'Л11 .program-done-stats gap 8px margin-top 10px — 750-strength-builder.css:5728-5732'],
  ['Программа пройдена · 12', '=', 'Л12 .program-done-stat flex column gap 4px padding 10px 12px radius 14px --c1 — 750-strength-builder.css:5734-5742'],
  ['Программа пройдена · 13', '=', 'Л13 .program-done-stat-label 600 9.5px/.12em uppercase — 750-strength-builder.css:5744-5749'],
  ['Программа пройдена · 14', '=', 'Л14 .program-done-stat b 800 19px tabular-nums --tx — 750-strength-builder.css:5751-5755'],
  ['Программа пройдена · 15', '=', 'Л15 .program-done-tier ярус «Что выросло» color var(--ac) — 750-strength-builder.css:5757-5763'],
  ['Программа пройдена · 16', '=', 'Л16 список .program-done-growth (.cd) — ProgramDoneScreen'],
  ['Программа пройдена · 17', '=', 'Л17 .program-done-growth-row flex baseline space-between — 750-strength-builder.css:5771-5780'],
  ['Программа пройдена · 18', '=', 'Л18 имя упражнения color var(--tx) — .program-done-growth-row'],
  ['Программа пройдена · 19', '=', 'Л19 .program-done-growth-val 700 12.5px color var(--gr) — 750-strength-builder.css:5786-5791; sand+blue contract test'],
  ['Программа пройдена · 20', '=', 'Л20 .program-done-growth-row.is-last border-bottom none — 750-strength-builder.css:5782-5784'],
  ['Программа пройдена · 21', '=', 'Л21 .program-done-secondary margin-top 9px min-height 48px — 750-strength-builder.css:5793-5805'],
  ['Программа пройдена · 22', '=', 'Л22 .program-done-skips 500 11px/1.55 + PROGRAM_DONE_SKIP_TAIL — ProgramDoneScreen'],
  ['Программа пройдена · 23', '=', 'Л23 .program-done-cta margin-top 10px min-height 48px — 750-strength-builder.css:5814-5818'],
  ['Программа пройдена · 24', '=', 'Л24 .program-done-note 500 11px/1.4 center margin-top 6px — 750-strength-builder.css:5820-5825'],
  ['Программа пройдена · текст', '=', 'Составная цепочка Г5: ProgramDoneScreen DOM — strength-proposal-v4-canvas-contract.test.js «ProgramDoneScreen · текст»'],
  ['Исход · правка принята · текст', '=', 'Л10 composite: ProposalOutcomeScreen accepted + buildAcceptedOutcomeSnapshot — strength-proposal-v4-canvas-contract.test.js «Л10–Л12 · текст»'],
  ['Исход · отказ · текст', '=', 'Л11 composite: ProposalOutcomeScreen declined + buildDeclinedOutcomeSnapshot — strength-proposal-v4-canvas-contract.test.js «Л10–Л12 · текст»'],
  ['Исход · без ответа · текст', '=', 'Л12 composite: ProposalOutcomeScreen expired + buildExpiredOutcomeSnapshot — strength-proposal-v4-canvas-contract.test.js «Л10–Л12 · текст»'],
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
console.log(`task95: set ${ROWS.length} rows to =`);
