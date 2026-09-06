/**
 * Zone-agnostic verdict handoff batch apply core.
 * Extracted from scripts/.sb-750-verdict-batch-apply.mjs (Task 76).
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  HANDOFF_ROW_SECTIONS,
  pickContractKey,
  pickFact,
  pickVerdict,
  validateHandoff,
  validateHandoffFile,
} from './handoff-schema.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const SB_DECISION_REF_DEFAULT =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:754';

/**
 * @param {import('./handoff-schema.mjs').HandoffRowSection[]} sections
 */
export function countNormalizedRows(handoff) {
  return HANDOFF_ROW_SECTIONS.reduce((sum, section) => sum + (handoff[section]?.length || 0), 0);
}

export function hashContractValue(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function defaultDecisionRef(zoneId, handoff, row) {
  if (row.decisionRef) return row.decisionRef;
  if (handoff.meta?.decisionRefDefault) return handoff.meta.decisionRefDefault;
  if (zoneId === 'strength-builder') return SB_DECISION_REF_DEFAULT;
  return null;
}

function buildOptions(row, zoneId, handoff) {
  const options = { ...(row.options || {}) };
  if (row['na-kind']) options['na-kind'] = row['na-kind'];
  if (row.reasonCode) options['reason-code'] = row.reasonCode;
  if (row.decisionRef) options['decision-ref'] = row.decisionRef;
  return options;
}

function finalizeVerdict(row, options, zoneId, handoff) {
  let verdict = row.verdict;
  if (verdict === '!') verdict = '=';
  if (verdict === '—' && !options['na-kind']) {
    const key = row.contractKey;
    options['na-kind'] = key === 'границы' || key === 'границы (scope)' ? 'handoff' : 'foreign-zone';
  }
  if (verdict === '≠') {
    if (!options['reason-code']) options['reason-code'] = 'canvas-conflict';
    if (!options['decision-ref']) {
      const ref = defaultDecisionRef(zoneId, handoff, row);
      if (ref) options['decision-ref'] = ref;
    }
  }
  return verdict;
}

function queueRow(ctx, source, rowKey, verdict, fact, options = {}, handoffH = null) {
  if (ctx.batchMap.has(rowKey) && ctx.batchMap.get(rowKey)[5] !== source) {
    ctx.log(`override ${rowKey}: ${ctx.batchMap.get(rowKey)[5]} → ${source}`);
  }
  ctx.batchMap.set(rowKey, [rowKey, verdict, fact, options, handoffH, source]);
  ctx.perFileCounts[source] = (ctx.perFileCounts[source] || 0) + 1;
}

function shouldSkipNeqDowngrade(rows, rowKey, verdict, allowDowngrade, handoffH, shouldSkipStaleHandoff) {
  return shouldSkipStaleHandoff(rows[rowKey], verdict, {
    allowDowngrade,
    handoffH,
    handoff: true,
  }).skip;
}

/**
 * @param {string} source basename
 * @param {ReturnType<typeof validateHandoff>} handoff
 * @param {Record<string, object>} rows live zone rows (mutated for seeding only)
 * @param {object} ctx
 * @param {{ readVerdicts: Function, shouldSkipStaleHandoff: Function }} deps
 */
export function ingestValidatedHandoff(source, handoff, rows, ctx, deps) {
  const isNeqAudit = source === '.sb-neq-audit-handoff.json';
  ctx.loadedHandoffs.push(source);
  ctx.handoffRowCounts[source] = countNormalizedRows(handoff);

  const seeded = seedMetaContractKeys(source, handoff, rows);
  if (seeded) ctx.log(`  ${source}: seeded ${seeded} meta contract keys`);

  for (const row of handoff.rows) {
    ingestStandardRow(source, handoff, row, rows, ctx, isNeqAudit, deps.shouldSkipStaleHandoff);
  }
  for (const row of handoff.outOfScopeCssRows) {
    ingestOutOfScopeCssRow(source, handoff, row, rows, ctx);
  }
  for (const row of handoff.outOfScopeRuntimeRows) {
    ingestOutOfScopeRuntimeRow(source, handoff, row, rows, ctx);
  }
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

function ingestStandardRow(source, handoff, row, rows, ctx, isNeqAudit, shouldSkipStaleHandoff) {
  const rowKey = row.contractKey;
  if (!rows[rowKey]) {
    ctx.skippedMissing += 1;
    if (!ctx.missingKeys.includes(rowKey)) ctx.missingKeys.push(rowKey);
    ctx.log(`skip missing contract key in ${source}: ${rowKey}`);
    return;
  }

  let verdict = row.verdict;
  let fact = row.fact ?? '';
  if (isNeqAudit) {
    if (shouldSkipNeqDowngrade(rows, rowKey, verdict, ctx.allowDowngrade, row.h ?? null, shouldSkipStaleHandoff)) {
      ctx.skippedNeqStale += 1;
      return;
    }
  }

  if (row.note) fact = `${fact} ${row.note}`;
  const options = buildOptions(row, handoff.zoneId, handoff);
  verdict = finalizeVerdict({ ...row, verdict }, options, handoff.zoneId, handoff);
  queueRow(ctx, source, rowKey, verdict, fact, options, row.h ?? null);
}

function ingestOutOfScopeCssRow(source, handoff, row, rows, ctx) {
  const rowKey = row.contractKey;
  if (!rows[rowKey]) {
    ctx.skippedMissing += 1;
    if (!ctx.missingKeys.includes(rowKey)) ctx.missingKeys.push(rowKey);
    ctx.log(`skip missing contract key in ${source} (outOfScopeCss): ${rowKey}`);
    return;
  }
  const verdict = row.verdict ?? '=';
  let fact = row.fact ?? rows[rowKey].f ?? '';
  if (!fact) {
    fact = verdict === '≠'
      ? `Кадр ${rowKey}: CSS handoff ${source}.`
      : `CSS — кадр ${rowKey}; handoff ${source}.`;
  }
  const options = buildOptions(row, handoff.zoneId, handoff);
  const finalVerdict = finalizeVerdict({ ...row, verdict }, options, handoff.zoneId, handoff);
  queueRow(ctx, source, rowKey, finalVerdict, fact, options, row.h ?? null);
}

function ingestOutOfScopeRuntimeRow(source, handoff, row, rows, ctx) {
  const rowKey = row.contractKey;
  if (!rows[rowKey]) {
    ctx.skippedMissing += 1;
    if (!ctx.missingKeys.includes(rowKey)) ctx.missingKeys.push(rowKey);
    ctx.log(`skip missing contract key in ${source} (outOfScopeRuntime): ${rowKey}`);
    return;
  }
  const verdict = row.verdict ?? '?';
  let fact = row.fact ?? '';
  if (row.note) fact = `${fact} ${row.note}`;
  const options = buildOptions(row, handoff.zoneId, handoff);
  const finalVerdict = finalizeVerdict({ ...row, verdict }, options, handoff.zoneId, handoff);
  queueRow(ctx, source, rowKey, finalVerdict, fact, options, row.h ?? null);
}

/**
 * @param {string} filePath
 * @param {Record<string, object>} rows
 * @param {object} ctx
 * @param {{ zoneId?: string, shouldSkipStaleHandoff: Function }} opts
 */
export function ingestHandoffFile(filePath, rows, ctx, opts) {
  const handoff = validateHandoffFile(filePath, { zoneId: opts.zoneId });
  if (opts.zoneId && handoff.zoneId !== opts.zoneId) {
    throw new Error(`handoff zoneId «${handoff.zoneId}» does not match --zone «${opts.zoneId}»`);
  }
  ingestValidatedHandoff(path.basename(filePath), handoff, rows, ctx, {
    shouldSkipStaleHandoff: opts.shouldSkipStaleHandoff,
  });
  return handoff;
}

export function snapshotForeignRowStrings(rows, handoffKeys) {
  const snap = new Map();
  for (const [key, row] of Object.entries(rows)) {
    if (!handoffKeys.has(key)) snap.set(key, JSON.stringify(row));
  }
  return snap;
}

export function assertForeignRowsUnchanged(beforeSnap, afterRows) {
  const violations = [];
  for (const [key, before] of beforeSnap.entries()) {
    const afterRow = afterRows[key];
    if (!afterRow) {
      violations.push(`${key}: deleted`);
      continue;
    }
    const after = JSON.stringify(afterRow);
    if (after !== before) violations.push(`${key}: mutated`);
  }
  if (violations.length) {
    throw new Error(`foreign row guard: ${violations.length} violation(s): ${violations.slice(0, 5).join('; ')}`);
  }
}

/**
 * @param {string} zoneId
 * @param {string[]} handoffFiles absolute paths
 * @param {{ withInline?: boolean, allowDowngrade?: boolean, log?: Function, root?: string, inlineEquals?: [string,string][] }} opts
 */
export async function buildBatchMap(zoneId, handoffFiles, opts = {}) {
  const root = opts.root ?? ROOT;
  const { readZone, shouldSkipStaleHandoff } = await import(
    pathToFileURL(path.join(root, 'scripts/lib/ui-v4-verdicts.mjs')).href
  );

  const zone = readZone(zoneId);
  if (!zone) throw new Error(`zone ${zoneId} not found`);
  const rows = zone.rows;
  const ctx = {
    batchMap: new Map(),
    perFileCounts: {},
    handoffRowCounts: {},
    loadedHandoffs: [],
    missingKeys: [],
    skippedMissing: 0,
    skippedNeqStale: 0,
    allowDowngrade: opts.allowDowngrade ?? false,
    log: opts.log ?? (() => {}),
    zoneId,
  };

  for (const filePath of handoffFiles) {
    ingestHandoffFile(filePath, rows, ctx, {
      zoneId,
      shouldSkipStaleHandoff,
    });
  }

  if (opts.withInline && opts.inlineEquals?.length) {
    for (const [key, fact] of opts.inlineEquals) {
      queueRow(ctx, 'inline-equals', key, '=', fact, {});
    }
  }

  return ctx;
}

/**
 * @param {string} zoneId
 * @param {Map} batchMap
 * @param {{ dryRun?: boolean, allowDowngrade?: boolean, log?: Function, root?: string, foreignGuard?: boolean }} opts
 */
export async function applyBatchMap(zoneId, batchMap, opts = {}) {
  const root = opts.root ?? ROOT;
  const { readZone, setVerdictKey } = await import(
    pathToFileURL(path.join(root, 'scripts/lib/ui-v4-verdicts.mjs')).href
  );

  const beforeZone = readZone(zoneId);
  if (!beforeZone) throw new Error(`zone ${zoneId} not found`);
  const handoffKeys = new Set(batchMap.keys());
  const foreignBefore = opts.foreignGuard
    ? snapshotForeignRowStrings(beforeZone.rows, handoffKeys)
    : null;

  let applied = 0;
  let skippedSame = 0;
  let skippedStale = 0;

  for (const [key, verdict, fact, options, handoffH] of batchMap.values()) {
    const zone = readZone(zoneId);
    if (!zone) throw new Error(`zone ${zoneId} not found`);
    const row = zone.rows[key];
    if (!row) continue;

    if (row.v === verdict && row.f === fact) {
      skippedSame += 1;
      continue;
    }

    const result = setVerdictKey(
      zoneId,
      key,
      { verdict, fact, options },
      { handoff: true, handoffH, allowDowngrade: opts.allowDowngrade, dryRun: opts.dryRun, root },
    );
    if (result.skipped) {
      if (result.reason === 'skipIf') continue;
      skippedStale += 1;
      if (result.message && opts.log) opts.log(`skip ${key}: ${result.message}`);
      continue;
    }
    applied += 1;
  }

  const live = readZone(zoneId);
  const rows = live?.rows || {};
  if (foreignBefore && !opts.dryRun) {
    assertForeignRowsUnchanged(foreignBefore, rows);
  }

  const counts = { '=': 0, '?': 0, '≠': 0, '—': 0 };
  for (const row of Object.values(rows)) counts[row.v] = (counts[row.v] || 0) + 1;

  return { applied, skippedSame, skippedStale, counts, handoffKeys, rows };
}

/**
 * @param {{ zoneId: string, files?: string[], withInline?: boolean, allowDowngrade?: boolean, dryRun?: boolean, log?: Function, root?: string, inlineEquals?: [string,string][] }} opts
 */
export async function runBatchApply(opts) {
  const { zoneId, files = [], withInline = false, allowDowngrade = false, dryRun = false, log = console.log } = opts;
  const handoffFiles = files;
  const ctx = await buildBatchMap(zoneId, handoffFiles, {
    withInline,
    allowDowngrade,
    log,
    root: opts.root,
    inlineEquals: opts.inlineEquals,
  });
  const result = await applyBatchMap(zoneId, ctx.batchMap, {
    dryRun,
    allowDowngrade,
    log,
    root: opts.root,
    foreignGuard: true,
  });
  return { ...result, ...ctx, handoffFiles };
}

export { validateHandoff, validateHandoffFile, pickContractKey, pickVerdict, pickFact };
