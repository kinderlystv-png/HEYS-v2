#!/usr/bin/env node
import crypto from 'node:crypto';
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

/** @type {Map<string, [string, string, string, object, string]>} key → [key, verdict, fact, options, source] */
const batchMap = new Map();
const perFileCounts = {};

function queueRow(source, rowKey, verdict, fact, options = {}) {
  if (batchMap.has(rowKey) && batchMap.get(rowKey)[4] !== source) {
    console.warn(`override ${rowKey}: ${batchMap.get(rowKey)[4]} → ${source}`);
  }
  batchMap.set(rowKey, [rowKey, verdict, fact, options, source]);
  perFileCounts[source] = (perFileCounts[source] || 0) + 1;
}

const handoffDir = path.join(ROOT, 'scripts');
const handoffPattern = /^\.sb-.+-verdict-handoff(?:-\d+)?\.json$/;
const extraHandoffs = [
  '.sb-neq-audit-handoff.json',
  '.sb-catalog-custom-exercise-handoff.json',
  '.sb-catalog-custom-exercise-01-07-handoff.json',
];
const handoffFiles = [
  ...fs.readdirSync(handoffDir)
    .filter((name) => handoffPattern.test(name))
    .sort()
    .map((name) => path.join(handoffDir, name)),
  ...extraHandoffs
    .filter((name) => fs.existsSync(path.join(handoffDir, name)))
    .map((name) => path.join(handoffDir, name)),
];

const loadedHandoffs = [];
const handoffRowCounts = {};
let skippedMissing = 0;
/** @type {string[]} exact contract line keys skipped because absent from zone */
const missingKeys = [];

function ingestStandardRow(source, row) {
  const rowKey = row.key || row.contractLine;
  if (!rowKey) {
    console.warn(`skip row without key in ${source}`);
    return;
  }
  if (!rows[rowKey]) {
    skippedMissing += 1;
    if (!missingKeys.includes(rowKey)) missingKeys.push(rowKey);
    console.warn(`skip missing contract key in ${source}: ${rowKey}`);
    return;
  }
  const verdict = row.verdict ?? row.recommend;
  let fact = row.f ?? row.fDraft ?? '';
  if (!verdict) {
    console.warn(`skip row without verdict in ${source}: ${rowKey}`);
    return;
  }
  if (!fact) {
    console.warn(`skip row without fact in ${source}: ${rowKey}`);
    return;
  }
  if (row.note) fact = `${fact} ${row.note}`;
  const options = row.options || {};
  if (verdict === '—') {
    if (!options['na-kind']) {
      options['na-kind'] = rowKey === 'границы' || rowKey === 'границы (scope)' ? 'handoff' : 'foreign-zone';
    }
  }
  if (row['na-kind']) options['na-kind'] = row['na-kind'];
  if (row.reasonCode) options['reason-code'] = row.reasonCode;
  if (row.decisionRef) options['decision-ref'] = row.decisionRef;
  if (verdict === '≠') {
    if (!options['reason-code']) options['reason-code'] = 'canvas-conflict';
    if (!options['decision-ref']) {
      options['decision-ref'] = row.decisionRef
        || 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:754';
    }
  }
  queueRow(source, rowKey, verdict, fact, options);
}

function ingestNeqAuditRow(source, row) {
  const rowKey = row.key;
  if (!rowKey) return;
  if (!rows[rowKey]) {
    skippedMissing += 1;
    if (!missingKeys.includes(rowKey)) missingKeys.push(rowKey);
    console.warn(`skip missing contract key in ${source}: ${rowKey}`);
    return;
  }
  const verdict = row.recommend;
  if (!verdict) return;
  let fact = row.fDraft || '';
  if (row.note) fact = fact ? `${fact} ${row.note}` : row.note;
  const options = {};
  if (verdict === '≠') {
    options['reason-code'] = 'canvas-conflict';
    options['decision-ref'] = 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:754';
  }
  queueRow(source, rowKey, verdict, fact, options);
}

function ingestOutOfScopeCssRow(source, row) {
  const rowKey = row.key || row.contractLine;
  if (!rowKey) return;
  if (!rows[rowKey]) {
    skippedMissing += 1;
    if (!missingKeys.includes(rowKey)) missingKeys.push(rowKey);
    console.warn(`skip missing contract key in ${source} (outOfScopeCss): ${rowKey}`);
    return;
  }
  const verdict = row.verdict ?? row.recommend ?? '=';
  let fact = row.f ?? row.fDraft ?? rows[rowKey].f ?? '';
  if (!fact) {
    fact = verdict === '≠'
      ? `Кадр ${rowKey}: сверка 750-strength-builder.css; handoff ${source}.`
      : `750-strength-builder.css — кадр ${rowKey}; handoff ${source}.`;
  }
  const options = row.options || {};
  if (verdict === '≠') {
    if (!options['reason-code']) options['reason-code'] = 'canvas-conflict';
    if (!options['decision-ref']) {
      options['decision-ref'] = row.decisionRef
        || 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:754';
    }
  }
  queueRow(source, rowKey, verdict, fact, options);
}

function ingestOutOfScopeRuntimeRow(source, row) {
  const rowKey = row.key || row.contractLine;
  if (!rowKey) return;
  if (!rows[rowKey]) {
    skippedMissing += 1;
    if (!missingKeys.includes(rowKey)) missingKeys.push(rowKey);
    console.warn(`skip missing contract key in ${source} (outOfScopeRuntime): ${rowKey}`);
    return;
  }
  const verdict = row.verdict ?? row.recommend ?? '?';
  let fact = row.f ?? row.fDraft ?? rows[rowKey].f ?? '';
  if (!fact) {
    console.warn(`skip row without fact in ${source} (outOfScopeRuntime): ${rowKey}`);
    return;
  }
  if (row.note) fact = `${fact} ${row.note}`;
  const options = row.options || {};
  if (verdict === '≠') {
    if (!options['reason-code']) options['reason-code'] = 'canvas-conflict';
    if (!options['decision-ref']) {
      options['decision-ref'] = row.decisionRef
        || 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:754';
    }
  }
  queueRow(source, rowKey, verdict, fact, options);
}

function countHandoffRows(handoff) {
  return (handoff.rows?.length || 0)
    + (handoff.outOfScopeCssRows?.length || 0)
    + (handoff.outOfScopeRuntimeRows?.length || 0);
}

function hashContractValue(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
}

/** Handoff-only keys absent from canvas contract — seed before row ingest. */
function seedMetaContractKeys(source, handoff) {
  const entries = handoff.meta?.contractKeys;
  if (!Array.isArray(entries) || !entries.length) return 0;
  let seeded = 0;
  for (const entry of entries) {
    const rowKey = entry.key;
    if (!rowKey || rows[rowKey]) continue;
    const dataV = entry.dataV || rowKey;
    rows[rowKey] = {
      v: '?',
      f: `Handoff meta (${source}); verdict pending apply. ${entry.source || ''}`.trim(),
      h: entry.h || hashContractValue(dataV),
    };
    if (entry.naKind) rows[rowKey].naKind = entry.naKind;
    seeded += 1;
  }
  return seeded;
}

for (const filePath of handoffFiles) {
  const source = path.basename(filePath);
  const handoff = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  loadedHandoffs.push(source);
  handoffRowCounts[source] = countHandoffRows(handoff);
  const seeded = seedMetaContractKeys(source, handoff);
  if (seeded) console.log(`  ${source}: seeded ${seeded} meta contract keys`);
  const ingest = source === '.sb-neq-audit-handoff.json' ? ingestNeqAuditRow : ingestStandardRow;
  for (const row of handoff.rows || []) ingest(source, row);
  for (const row of handoff.outOfScopeCssRows || []) ingestOutOfScopeCssRow(source, row);
  for (const row of handoff.outOfScopeRuntimeRows || []) ingestOutOfScopeRuntimeRow(source, row);
}

// Inline rows not yet in separate handoff chats (proposal L2, program-done hero)
const inlineEquals = [
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
  ['Правка · клиент уже начал · 01', '.sb-proposal-started .sb-head — gap 10px, padding 16px 18px 0; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 02', '.sb-builder-screen .sb-icon-btn — 36×36, radius 999px, bg var(--c1), font 600 13px; 750:3278-3291.'],
  ['Правка · клиент уже начал · 20', '.sb-proposal-started-detail — flex gap 8px, margin 9px 0 0 33px, padding 8px 10px, radius 11px, bg var(--c2); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 21', '.sb-proposal-started-detail-label — flex 1, 600 11px/1.3 var(--tx); ProposalStartedScreen heys_strength_builder_ui_v1.js.'],
  ['Правка · клиент уже начал · 22', '.sb-proposal-started-detail-old — 700 11px tabular-nums rgba(var(--ink),.56) line-through; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 23', '.sb-proposal-started-detail-new — 700 11.5px tabular-nums var(--ac); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 26', '.sb-proposal-started-card.is-plain — padding 11px 12px, radius 14px, bg transparent; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 27', '.sb-proposal-started-card.is-plain .sb-proposal-started-num — inset rgba(var(--ink),.1), color rgba(var(--ink),.62); 750.'],
  ['Правка · клиент уже начал · 29', '.sb-proposal-started-tag.is-empty — 700 9.5px/.1em uppercase rgba(var(--ink),.56); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · рисунок 01', 'proposalLockIcon svg 11×11 viewBox 0 0 24 24 — heys_strength_builder_ui_v1.js; strength-builder-proposal-started-v4-canvas-contract.test.js.'],
  ['Правка · клиент уже начал · рисунок 02', 'proposalLockIcon rect 16×10 rx 2.5 — heys_strength_builder_ui_v1.js proposalLockIcon().'],
  ['Правка · клиент уже начал · рисунок 03', 'proposalLockIcon path M8 11V7a4 4 0 0 1 8 0v4 — heys_strength_builder_ui_v1.js proposalLockIcon().'],
  ['Ввод · время под нагрузкой · 08', '.is-time-entry.is-exercise-open .sb-aps-head > span:nth-child(3) text-align center; 750-strength-builder.css.'],
  ['Ввод · время под нагрузкой · 09', '.is-time-entry.is-exercise-open .sb-aps-head > span:last-child color var(--gr); 750-strength-builder.css.'],
  ['Ввод · время под нагрузкой · 10', '.is-time-entry.is-exercise-open .sb-ap.is-done .sb-ap-num bg var(--gr-bg) color var(--gr); 750.'],
  ['Ввод · время под нагрузкой · 12', '.is-time-entry.is-exercise-open .sb-ap.is-current .sb-ap-num bg var(--acs) color var(--on-acs); 750.'],
  ['Ввод · время под нагрузкой · 13', '.is-time-entry.is-exercise-open .sb-ap.is-current .sb-ap-field box-shadow inset 1.5px var(--acs); 750.'],
  ['Ввод · время под нагрузкой · 14', '.is-exercise-open .sb-ap-check.is-blocked — rgba ink .06/.24 inset 1px; 750-strength-builder.css:3653.'],
  ['Ввод · время под нагрузкой · 22', '.sb-time-entry-footnote — copy про колонку «Вес»; heys_strength_builder_ui_v1.js + 750-strength-builder.css.'],
];

for (const [key, fact] of inlineEquals) queueRow('inline-equals', key, '=', fact, {});

let applied = 0;
let skippedSame = 0;
for (const [key, verdict, fact, options] of batchMap.values()) {
  const row = rows[key];
  if (!row) continue;
  if (row.v === verdict && row.f === fact) {
    skippedSame += 1;
    continue;
  }
  set(key, verdict, fact, options);
  applied += 1;
}

writeZone('strength-builder', zone);
const counts = { '=': 0, '?': 0, '≠': 0, '—': 0 };
for (const row of Object.values(rows)) counts[row.v] = (counts[row.v] || 0) + 1;
console.log(`handoff files (${loadedHandoffs.length}):`);
for (const name of loadedHandoffs) {
  console.log(`  ${name}: ${handoffRowCounts[name]} rows in file, ${perFileCounts[name] || 0} queued`);
}
if (perFileCounts['inline-equals']) {
  console.log(`  inline-equals: ${perFileCounts['inline-equals']} rows queued`);
}
const proposalFile = '.sb-proposal-ui-verdict-handoff.json';
if (loadedHandoffs.includes(proposalFile)) {
  const proposalHandoff = JSON.parse(fs.readFileSync(path.join(handoffDir, proposalFile), 'utf8'));
  const proposalExpected = (proposalHandoff.rows?.length || 0) + (proposalHandoff.outOfScopeCssRows?.length || 0);
  const proposalQueued = perFileCounts[proposalFile] || 0;
  if (proposalQueued !== proposalExpected) {
    console.warn(`proposal handoff queued ${proposalQueued} rows (expected ${proposalExpected} = rows+outOfScopeCss)`);
  }
}
console.log(`unique keys queued: ${batchMap.size}; applied ${applied}; skipped unchanged ${skippedSame}; skipped missing ${skippedMissing}`);
if (missingKeys.length) {
  console.log(`missing keys (${missingKeys.length}):`);
  for (const key of missingKeys) console.log(`  ${key}`);
}
console.log(`totals: =${counts['=']} · ?=${counts['?']} · ≠=${counts['≠']} · —=${counts['—']} · всего ${Object.keys(rows).length}`);
