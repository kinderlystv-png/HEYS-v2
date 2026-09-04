#!/usr/bin/env node
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { setVerdictKey } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href
);

const D2 = 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:792';

const rows = [
  ['Правка легла не полностью · 01', '≠', 'Кадр Д2: шапка .top; продукт — .sb-finish-head с ✕ и «Тренировка завершена» heys_strength_finish_ui_v1.js:302-311.', { 'reason-code': 'canvas-conflict', 'decision-ref': D2 }],
  ['Правка легла не полностью · 02', '≠', 'Кадр: column gap 3px в .top; продукт: row head с icon-btn + title column — 750:1931-1957.', { 'reason-code': 'canvas-conflict', 'decision-ref': D2 }],
  ['Правка легла не полностью · 03', '≠', 'Контракт «Верх тела B · завершена»; продукт b «Тренировка завершена» finish_ui:307.', { 'reason-code': 'canvas-conflict', 'decision-ref': D2 }],
  ['Правка легла не полностью · 04', '≠', 'Контракт mono «18 подходов · 4 120 кг · 52 мин»; продукт — плитки .sb-finish-metrics finish_ui:316-320.', { 'reason-code': 'canvas-conflict', 'decision-ref': D2 }],
  ['Правка легла не полностью · 05', '=', 'ProposalOutcome внутри .sb-list.sb-finish-list overflow-y:auto — 750:155-158, finish_ui:313-349.'],
  ['Правка легла не полностью · 09', '=', '.sb-proposal-outcome-list margin-top 10px — 750:4389-4393; strength-proposal-v4-canvas-contract.test.js computed.'],
  ['Правка легла не полностью · 10', '=', '.sb-proposal-outcome-row flex space-between gap 8px padding 7px 0 — 750:4395-4402; contract test display:flex.'],
  ['Правка легла не полностью · 16', '=', 'Разделители border-top; :first-child border-top:0 — 750:4401-4406; последняя строка без нижней границы по канону.'],
  ['Правка легла не полностью · 17', '≠', 'Канвас .sm-сноска; ProposalOutcome не рендерит footnote — heys_strength_proposal_ui_v1.js:451-494 (CSS .sb-proposal-outcome-footnote заготовлен).', { 'reason-code': 'canvas-conflict', 'decision-ref': D2 }],
  ['Правка легла не полностью · текст', '=', 'DOM ProposalOutcome: title/prose/Жим лёжа/Тяга/легло/не легло — strength-proposal-v4-canvas-contract.test.js D2 it.'],
];

for (const [key, verdict, fact, options = {}] of rows) {
  setVerdictKey('strength-builder', key, { verdict, fact, options }, { root: ROOT });
}
console.log(`closed ${rows.length} proposal-outcome rows`);
