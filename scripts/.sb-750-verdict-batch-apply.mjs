#!/usr/bin/env node
/**
 * Apply strength-builder verdict handoffs incrementally.
 *
 *   node scripts/.sb-750-verdict-batch-apply.mjs
 *   node scripts/.sb-750-verdict-batch-apply.mjs --file=scripts/.sb-catalog-custom-exercise-handoff.json
 *
 * Without --file: loads all matching handoff JSON files in scripts/ (union of keys only).
 * With --file: applies ONE handoff; inline-equals block is skipped unless --with-inline.
 *
 * Safety: before write, asserts every row outside the handoff key union is byte-identical
 * to the fresh read snapshot (v, f, h, typed fields).
 *
 * neq-audit stale protection: when ingesting .sb-neq-audit-handoff.json, a recommend «≠»
 * is skipped if the live row is already «=» (prevents reverting resolved blocks like G1 cycle).
 * Pass --allow-downgrade to force neq-audit downgrades.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { readZone, setVerdictKey, shouldSkipStaleHandoff } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href
);

const ZONE_ID = 'strength-builder';
const HANDOFF_DIR = path.join(ROOT, 'scripts');
const HANDOFF_PATTERN = /^\.sb-.+-verdict-handoff(?:-\d+)?\.json$/;
const NEQ_AUDIT_FILE = '.sb-neq-audit-handoff.json';
const EXTRA_HANDOFFS = [
  NEQ_AUDIT_FILE,
  '.sb-catalog-custom-exercise-handoff.json',
  '.sb-catalog-custom-exercise-01-07-handoff.json',
];

function parseArgs(argv) {
  const files = [];
  let withInline = false;
  let allowDowngrade = false;
  for (const arg of argv) {
    if (arg.startsWith('--file=')) {
      const rel = arg.slice('--file='.length);
      files.push(path.isAbsolute(rel) ? rel : path.join(ROOT, rel));
      continue;
    }
    if (arg === '--with-inline') {
      withInline = true;
      continue;
    }
    if (arg === '--allow-downgrade') {
      allowDowngrade = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { files, withInline, allowDowngrade };
}

function usage() {
  console.log(`Usage:
  node scripts/.sb-750-verdict-batch-apply.mjs [--file=<handoff.json>] [--with-inline] [--allow-downgrade]

  --file=...          Apply only keys listed in this handoff (repeatable).
  --with-inline       Include inline-equals block (default only for full glob run).
  --allow-downgrade   Let neq-audit overwrite existing «=» with «≠».

Glob run (no --file) applies the union of keys from all handoff files plus inline-equals.
Single --file run touches only that file's keys; foreign rows must stay identical.`);
}

export function listDefaultHandoffFiles() {
  const fromDir = fs.readdirSync(HANDOFF_DIR)
    .filter((name) => HANDOFF_PATTERN.test(name))
    .sort()
    .map((name) => path.join(HANDOFF_DIR, name));
  const extras = EXTRA_HANDOFFS
    .filter((name) => fs.existsSync(path.join(HANDOFF_DIR, name)))
    .map((name) => path.join(HANDOFF_DIR, name));
  return [...fromDir, ...extras.filter((p) => !fromDir.includes(p))];
}

function hashContractValue(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function rowSnapshot(row) {
  return JSON.stringify(row);
}

function collectInlineEquals() {
  return [
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
}

/**
 * @param {Record<string, object>} rows live zone rows (mutated for seeding only)
 * @param {object} ctx
 */
export function ingestHandoffFile(filePath, rows, ctx) {
  const source = path.basename(filePath);
  const handoff = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const isNeqAudit = source === NEQ_AUDIT_FILE;
  ctx.loadedHandoffs.push(source);
  ctx.handoffRowCounts[source] = countHandoffRows(handoff);

  const seeded = seedMetaContractKeys(source, handoff, rows);
  if (seeded) ctx.log(`  ${source}: seeded ${seeded} meta contract keys`);

  const ingest = isNeqAudit ? ingestNeqAuditRow : ingestStandardRow;
  for (const row of handoff.rows || []) ingest(source, row, rows, ctx, isNeqAudit);
  for (const row of handoff.outOfScopeCssRows || []) ingestOutOfScopeCssRow(source, row, rows, ctx);
  for (const row of handoff.outOfScopeRuntimeRows || []) ingestOutOfScopeRuntimeRow(source, row, rows, ctx);
}

function countHandoffRows(handoff) {
  return (handoff.rows?.length || 0)
    + (handoff.outOfScopeCssRows?.length || 0)
    + (handoff.outOfScopeRuntimeRows?.length || 0);
}

function seedMetaContractKeys(source, handoff, rows) {
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

function queueRow(ctx, source, rowKey, verdict, fact, options = {}, handoffH = null) {
  if (ctx.batchMap.has(rowKey) && ctx.batchMap.get(rowKey)[5] !== source) {
    ctx.log(`override ${rowKey}: ${ctx.batchMap.get(rowKey)[5]} → ${source}`);
  }
  ctx.batchMap.set(rowKey, [rowKey, verdict, fact, options, handoffH, source]);
  ctx.perFileCounts[source] = (ctx.perFileCounts[source] || 0) + 1;
}

function shouldSkipNeqDowngrade(rows, rowKey, verdict, allowDowngrade, handoffH) {
  return shouldSkipStaleHandoff(rows[rowKey], verdict, {
    allowDowngrade,
    handoffH,
    handoff: true,
  }).skip;
}

function ingestStandardRow(source, row, rows, ctx) {
  const rowKey = row.key || row.contractLine;
  if (!rowKey) {
    ctx.log(`skip row without key in ${source}`);
    return;
  }
  if (!rows[rowKey]) {
    ctx.skippedMissing += 1;
    if (!ctx.missingKeys.includes(rowKey)) ctx.missingKeys.push(rowKey);
    ctx.log(`skip missing contract key in ${source}: ${rowKey}`);
    return;
  }
  const verdict = row.verdict ?? row.recommend;
  let fact = row.f ?? row.fDraft ?? '';
  if (!verdict) {
    ctx.log(`skip row without verdict in ${source}: ${rowKey}`);
    return;
  }
  if (!fact) {
    ctx.log(`skip row without fact in ${source}: ${rowKey}`);
    return;
  }
  if (row.note) fact = `${fact} ${row.note}`;
  const options = { ...(row.options || {}) };
  if (verdict === '—') {
    if (!options['na-kind']) {
      options['na-kind'] = rowKey === 'границы' || rowKey === 'границы (scope)' ? 'handoff' : 'foreign-zone';
    }
  }
  if (row['na-kind']) options['na-kind'] = row['na-kind'];
  if (row.reasonCode) options['reason-code'] = row.reasonCode;
  if (row.decisionRef) options['decision-ref'] = row.decisionRef;
  const handoffH = row.h ?? null;
  if (verdict === '≠') {
    if (!options['reason-code']) options['reason-code'] = 'canvas-conflict';
    if (!options['decision-ref']) {
      options['decision-ref'] = row.decisionRef
        || 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:754';
    }
  }
  queueRow(ctx, source, rowKey, verdict, fact, options, handoffH);
}

function ingestNeqAuditRow(source, row, rows, ctx, isNeqAudit) {
  const rowKey = row.key;
  if (!rowKey) return;
  if (!rows[rowKey]) {
    ctx.skippedMissing += 1;
    if (!ctx.missingKeys.includes(rowKey)) ctx.missingKeys.push(rowKey);
    ctx.log(`skip missing contract key in ${source}: ${rowKey}`);
    return;
  }
  const verdict = row.recommend;
  if (!verdict) return;
  if (isNeqAudit && shouldSkipNeqDowngrade(rows, rowKey, verdict, ctx.allowDowngrade, row.h ?? null)) {
    ctx.skippedNeqStale += 1;
    return;
  }
  let fact = row.fDraft || '';
  if (row.note) fact = fact ? `${fact} ${row.note}` : row.note;
  const options = {};
  if (verdict === '≠') {
    options['reason-code'] = 'canvas-conflict';
    options['decision-ref'] = 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:754';
  }
  queueRow(ctx, source, rowKey, verdict, fact, options, row.h ?? null);
}

function ingestOutOfScopeCssRow(source, row, rows, ctx) {
  const rowKey = row.key || row.contractLine;
  if (!rowKey) return;
  if (!rows[rowKey]) {
    ctx.skippedMissing += 1;
    if (!ctx.missingKeys.includes(rowKey)) ctx.missingKeys.push(rowKey);
    ctx.log(`skip missing contract key in ${source} (outOfScopeCss): ${rowKey}`);
    return;
  }
  const verdict = row.verdict ?? row.recommend ?? '=';
  let fact = row.f ?? row.fDraft ?? rows[rowKey].f ?? '';
  if (!fact) {
    fact = verdict === '≠'
      ? `Кадр ${rowKey}: сверка 750-strength-builder.css; handoff ${source}.`
      : `750-strength-builder.css — кадр ${rowKey}; handoff ${source}.`;
  }
  const options = { ...(row.options || {}) };
  if (verdict === '≠') {
    if (!options['reason-code']) options['reason-code'] = 'canvas-conflict';
    if (!options['decision-ref']) {
      options['decision-ref'] = row.decisionRef
        || 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:754';
    }
  }
  queueRow(ctx, source, rowKey, verdict, fact, options, row.h ?? null);
}

function ingestOutOfScopeRuntimeRow(source, row, rows, ctx) {
  const rowKey = row.key || row.contractLine;
  if (!rowKey) return;
  if (!rows[rowKey]) {
    ctx.skippedMissing += 1;
    if (!ctx.missingKeys.includes(rowKey)) ctx.missingKeys.push(rowKey);
    ctx.log(`skip missing contract key in ${source} (outOfScopeRuntime): ${rowKey}`);
    return;
  }
  const verdict = row.verdict ?? row.recommend ?? '?';
  let fact = row.f ?? row.fDraft ?? rows[rowKey].f ?? '';
  if (!fact) {
    ctx.log(`skip row without fact in ${source} (outOfScopeRuntime): ${rowKey}`);
    return;
  }
  if (row.note) fact = `${fact} ${row.note}`;
  const options = { ...(row.options || {}) };
  if (verdict === '≠') {
    if (!options['reason-code']) options['reason-code'] = 'canvas-conflict';
    if (!options['decision-ref']) {
      options['decision-ref'] = row.decisionRef
        || 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:754';
    }
  }
  queueRow(ctx, source, rowKey, verdict, fact, options, row.h ?? null);
}

export function buildBatchMap(handoffFiles, { withInline = false, allowDowngrade = false, log = console.log } = {}) {
  const zone = readZone(ZONE_ID);
  if (!zone) throw new Error(`zone ${ZONE_ID} not found`);
  const rows = zone.rows;
  const ctx = {
    batchMap: new Map(),
    perFileCounts: {},
    handoffRowCounts: {},
    loadedHandoffs: [],
    missingKeys: [],
    skippedMissing: 0,
    skippedNeqStale: 0,
    allowDowngrade,
    log,
  };

  for (const filePath of handoffFiles) {
    if (!fs.existsSync(filePath)) throw new Error(`handoff not found: ${filePath}`);
    ingestHandoffFile(filePath, rows, ctx);
  }

  if (withInline) {
    for (const [key, fact] of collectInlineEquals()) {
      queueRow(ctx, 'inline-equals', key, '=', fact, {});
    }
  }

  return ctx;
}

export function applyBatchMap(batchMap, { dryRun = false, allowDowngrade = false, log = console.log } = {}) {
  let applied = 0;
  let skippedSame = 0;
  let skippedStale = 0;

  for (const [key, verdict, fact, options, handoffH] of batchMap.values()) {
    const zone = readZone(ZONE_ID);
    if (!zone) throw new Error(`zone ${ZONE_ID} not found`);
    const row = zone.rows[key];
    if (!row) continue;

    if (row.v === verdict && row.f === fact) {
      skippedSame += 1;
      continue;
    }

    const result = setVerdictKey(
      ZONE_ID,
      key,
      { verdict, fact, options },
      { handoff: true, handoffH, allowDowngrade, dryRun, root: ROOT },
    );
    if (result.skipped) {
      if (result.reason === 'skipIf') continue;
      skippedStale += 1;
      if (result.message) log(`skip ${key}: ${result.message}`);
      continue;
    }
    applied += 1;
  }

  const live = readZone(ZONE_ID);
  const rows = live?.rows || {};
  const counts = { '=': 0, '?': 0, '≠': 0, '—': 0 };
  for (const row of Object.values(rows)) counts[row.v] = (counts[row.v] || 0) + 1;

  return { applied, skippedSame, skippedStale, counts, handoffKeys: new Set(batchMap.keys()), rows };
}

export function runBatchApply({ files = [], withInline = false, allowDowngrade = false, dryRun = false, log = console.log } = {}) {
  const handoffFiles = files.length ? files : listDefaultHandoffFiles();
  const useInline = files.length ? withInline : true;
  const ctx = buildBatchMap(handoffFiles, { withInline: useInline, allowDowngrade, log });
  const result = applyBatchMap(ctx.batchMap, { dryRun, allowDowngrade, log });
  return { ...result, ...ctx, handoffFiles };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return 0;
  }

  const { applied, skippedSame, skippedMissing, skippedNeqStale, skippedStale, counts, batchMap, perFileCounts, handoffRowCounts, loadedHandoffs, missingKeys, handoffFiles } = runBatchApply({
    files: args.files,
    withInline: args.withInline,
    allowDowngrade: args.allowDowngrade,
  });

  console.log(`handoff files (${loadedHandoffs.length}):`);
  for (const name of loadedHandoffs) {
    console.log(`  ${name}: ${handoffRowCounts[name]} rows in file, ${perFileCounts[name] || 0} queued`);
  }
  if (perFileCounts['inline-equals']) {
    console.log(`  inline-equals: ${perFileCounts['inline-equals']} rows queued`);
  }
  const proposalFile = '.sb-proposal-ui-verdict-handoff.json';
  if (loadedHandoffs.includes(proposalFile)) {
    const proposalHandoff = JSON.parse(fs.readFileSync(path.join(HANDOFF_DIR, proposalFile), 'utf8'));
    const proposalExpected = (proposalHandoff.rows?.length || 0) + (proposalHandoff.outOfScopeCssRows?.length || 0);
    const proposalQueued = perFileCounts[proposalFile] || 0;
    if (proposalQueued !== proposalExpected) {
      console.warn(`proposal handoff queued ${proposalQueued} rows (expected ${proposalExpected} = rows+outOfScopeCss)`);
    }
  }
  console.log(`mode: ${args.files.length ? `single/multi file (${args.files.length})` : 'glob all handoffs'}`);
  console.log(`unique keys queued: ${batchMap.size}; applied ${applied}; skipped unchanged ${skippedSame}; skipped missing ${skippedMissing}; skipped stale neq ${skippedNeqStale}; skipped stale apply ${skippedStale || 0}`);
  if (missingKeys.length) {
    console.log(`missing keys (${missingKeys.length}):`);
    for (const key of missingKeys) console.log(`  ${key}`);
  }
  console.log(`totals: =${counts['=']} · ?=${counts['?']} · ≠=${counts['≠']} · —=${counts['—']} · всего ${Object.keys(readZone(ZONE_ID).rows).length}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
