#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { applyVerdictToRow } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/ui-v4-set-verdict.mjs')).href
);
const { readZone, writeZone } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href
);

const zone = readZone('strength-builder');
const rows = zone.rows;

function set(key, verdict, fact, options = {}) {
  if (!rows[key]) throw new Error(`missing key: ${key}`);
  applyVerdictToRow(rows[key], { verdict, fact, options }, ROOT);
}

const batches = [];

const handoffDir = path.join(ROOT, 'scripts');
const handoffPattern = /^\.sb-.+-verdict-handoff\.json$/;
const handoffFiles = fs.readdirSync(handoffDir)
  .filter((name) => handoffPattern.test(name))
  .sort()
  .map((name) => path.join(handoffDir, name));

const loadedHandoffs = [];
const missingHandoffs = [
  '.sb-history-verdict-handoff.json',
  '.sb-proposal-verdict-handoff.json',
].filter((name) => !handoffFiles.some((p) => path.basename(p) === name));

for (const filePath of handoffFiles) {
  const handoff = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  loadedHandoffs.push(path.basename(filePath));
  for (const row of handoff.rows) {
    const rowKey = row.key || row.contractLine;
    if (!rowKey) {
      console.warn(`skip row without key in ${path.basename(filePath)}`);
      continue;
    }
    const options = row.options || {};
    if (row.verdict === '—') {
      if (!options['na-kind']) {
        options['na-kind'] = row.key === 'границы' ? 'handoff' : 'foreign-zone';
      }
    }
    if (row['na-kind']) options['na-kind'] = row['na-kind'];
    if (row.reasonCode) options['reason-code'] = row.reasonCode;
    if (row.decisionRef) options['decision-ref'] = row.decisionRef;
    batches.push([rowKey, row.verdict, row.f, options]);
  }
}

// Inline rows not yet in separate handoff chats (D1 history geometry, proposal L2)
const inlineEquals = [
  ['История упражнения · 01', '.sb-history-screen .sb-finish-head — flex, padding 16px 18px 0; strength-builder-history-v4-canvas-contract.test.js row 01.'],
  ['История упражнения · 02', '.sb-icon-btn 36×36, radius 999px, bg var(--c1); contract test row 02 computed.'],
  ['История упражнения · 04', '.sb-head-title b «Жим лёжа» — 15px/700 var(--tx); contract test row 04.'],
  ['История упражнения · 08', '.sb-finish-metric.is-accent — bg var(--tint), inset 1.5px var(--acs); contract test row 08.'],
  ['История упражнения · 10', 'Рекord chip 75×8 — 17px/800 var(--ac); contract test row 10.'],
  ['История упражнения · 12', 'Максимум 95 кг — 17px/800 var(--tx); contract test row 12.'],
  ['История упражнения · 13', '.sb-finish-tier uppercase 10px var(--ac); contract test row 13.'],
  ['История упражнения · 19', '.sb-history-badge.is-record — bg var(--tint), color var(--ac); contract test row 19.'],
  ['История упражнения · 21', '.sb-history-set 32px pill, bg var(--bg), inset border; contract test row 21.'],
  ['История упражнения · 22', '.sb-history-session > b tonnage 12.5px/600 var(--tx); contract test row 22.'],
  ['История упражнения · 23', '.sb-history-badge.is-quiet «по плану» — color rgba(var(--ink),.56); contract test row 23.'],
  ['История упражнения · 25', '.sb-history-badge.is-warning «дискомфорт» — bg var(--tint), color var(--ac2); contract test row 25.'],
  ['История упражнения · 30', '.sb-history-growth-note — 11px/500 rgba(var(--ink),.56); contract test row 30.'],
  ['История упражнения · 36', '.sb-history-chart .sb-finish-chart height 112px, gap 6px; contract test row 36.'],
  ['История упражнения · 49', '.sb-finish-footnote 11px/500 rgba(var(--ink),.56); contract test row 49.'],
  ['История упражнения · текст', 'HistoryScreen DOM: рекорд/95 кг/теги/10 чипов — strength-builder-history-v4-canvas-contract.test.js первый it.'],
  ['Правка легла не полностью · 06', '.sb-proposal-outcome — bg var(--tint), radius 14px, padding 12px; 750-strength-builder.css:4357-4361.'],
  ['Правка легла не полностью · 07', '.sb-proposal-outcome-title — 700 12.5px/1.35 var(--ac2); ProposalOutcome heys_strength_proposal_ui_v1.js.'],
  ['Правка легла не полностью · 08', '.sb-proposal-outcome-prose — 500 11.5px rgba(var(--ink),.56); strength-proposal-v4-canvas-contract.test.js.'],
  ['Правка легла не полностью · 11', '.sb-proposal-outcome-main b — 600 12px var(--tx); applied/rejected rows.'],
  ['Правка легла не полностью · 12', '.is-applied .sb-proposal-outcome-detail — color var(--gr); 750-strength-builder.css.'],
  ['Правка легла не полностью · 13', '.is-applied .sb-proposal-outcome-mark «✓» — color var(--gr); proposal contract test.'],
  ['Правка легла не полностью · 14', '.is-rejected .sb-proposal-outcome-detail — color var(--ac2); CSS is-rejected row.'],
  ['Правка легла не полностью · 15', '.is-rejected .sb-proposal-outcome-mark «—» — color var(--ac2); proposal contract test.'],
  ['Правка легла не полностью · текст', 'ProposalOutcome copy «легла не полностью» + applied/rejected — strength-proposal-v4-canvas-contract.test.js.'],
  ['Программа пройдена · 07', '.program-done-hero — margin-top 12px, padding 12px, radius 14px, bg var(--gr-bg); 750-strength-builder.css:4634-4640.'],
  ['Программа пройдена · 08', '.program-done-hero-label — 600 10.5px/.12em uppercase rgba(var(--ink),.56); heys_strength_proposal_ui_v1.js.'],
  ['Программа пройдена · 09', '.program-done-hero b — 800 30px/1 tabular-nums var(--tx); strength-proposal-v4-canvas-contract.test.js «9 из 12».'],
  ['Программа пройдена · 10', '.program-done-hero p — 500 11.5px/1.4 rgba(var(--ink),.56); ProgramDoneScreen copy.'],
  ['Правка · клиент уже начал · 01', '.sb-proposal-review .sb-head — gap 10px, padding 16px 18px 0; 750-strength-builder.css:4108-4114.'],
  ['Правка · клиент уже начал · 02', '.sb-proposal-review .sb-head-title column gap 3px; 750-strength-builder.css:4116-4122.'],
];

for (const [key, fact] of inlineEquals) batches.push([key, '=', fact, {}]);

for (const [key, verdict, fact, options] of batches) {
  set(key, verdict, fact, options);
}

writeZone('strength-builder', zone);
const counts = { '=': 0, '?': 0, '≠': 0, '—': 0 };
for (const row of Object.values(rows)) counts[row.v] = (counts[row.v] || 0) + 1;
console.log(`handoff loaded: ${loadedHandoffs.join(', ') || '(none)'}`);
if (missingHandoffs.length) console.log(`handoff missing (expected from other chats): ${missingHandoffs.join(', ')}`);
console.log(`applied ${batches.length} verdict updates`);
console.log(`totals: =${counts['=']} · ?=${counts['?']} · ≠=${counts['≠']} · —=${counts['—']} · всего ${Object.keys(rows).length}`);
