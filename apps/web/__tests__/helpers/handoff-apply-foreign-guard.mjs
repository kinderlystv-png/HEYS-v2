import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { applyVerdictToRow } from '../../../../scripts/ui-v4-set-verdict.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../../..');

/** Per-key JSON.stringify snapshot for rows outside the handoff key set. */
export function snapshotForeignRowStrings(rows, handoffKeys) {
  const snap = new Map();
  for (const [key, row] of Object.entries(rows)) {
    if (!handoffKeys.has(key)) snap.set(key, JSON.stringify(row));
  }
  return snap;
}

export function loadHandoffKeys(handoffPath) {
  const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  const keys = new Set();
  for (const section of ['rows', 'outOfScopeCssRows', 'outOfScopeRuntimeRows']) {
    for (const row of handoff[section] || []) {
      const key = row.key || row.contractLine;
      if (key) keys.add(key);
    }
  }
  for (const entry of handoff.meta?.contractKeys || []) {
    if (entry?.key) keys.add(entry.key);
  }
  return keys;
}

/**
 * @returns {{ key: string, kind: 'deleted'|'mutated', before: string, after?: string }[]}
 */
export function collectForeignViolations(beforeSnap, afterRows) {
  const violations = [];
  for (const [key, before] of beforeSnap.entries()) {
    const afterRow = afterRows[key];
    if (!afterRow) {
      violations.push({ key, kind: 'deleted', before });
      continue;
    }
    const after = JSON.stringify(afterRow);
    if (after !== before) {
      violations.push({ key, kind: 'mutated', before, after });
    }
  }
  return violations;
}

export function formatForeignViolations(violations) {
  if (!violations.length) return '';
  const lines = violations.map((v) => {
    if (v.kind === 'deleted') return `${v.key}: deleted (was ${v.before})`;
    return `${v.key}: mutated (${v.before} → ${v.after})`;
  });
  return `${violations.length} foreign row violation(s):\n${lines.join('\n')}`;
}

/**
 * Reference scoped apply: mutate only handoff keys; throw if any foreign row changes.
 */
export async function referenceScopedApply(zone, handoffPath, root = ROOT) {
  const { ingestHandoffFile } = await import(
    pathToFileURL(path.join(root, 'scripts/.sb-750-verdict-batch-apply.mjs')).href
  );
  const rows = zone.rows;
  const ctx = {
    batchMap: new Map(),
    perFileCounts: {},
    handoffRowCounts: {},
    loadedHandoffs: [],
    missingKeys: [],
    skippedMissing: 0,
    skippedNeqStale: 0,
    allowDowngrade: false,
    log: () => {},
  };

  ingestHandoffFile(handoffPath, rows, ctx);
  const handoffKeys = new Set(ctx.batchMap.keys());
  const beforeSnap = snapshotForeignRowStrings(rows, handoffKeys);

  for (const [key, verdict, fact, options] of ctx.batchMap.values()) {
    const row = rows[key];
    if (!row) continue;
    if (row.v === verdict && row.f === fact) continue;
    applyVerdictToRow(row, { verdict, fact, options }, root);
  }

  const violations = collectForeignViolations(beforeSnap, rows);
  if (violations.length) {
    throw new Error(`referenceScopedApply foreign guard: ${formatForeignViolations(violations)}`);
  }

  return { zone, handoffKeys, batchMap: ctx.batchMap };
}

/** Pre-fix failure mode: zone.rows trimmed to handoff keys only (wholesale wipe). */
export function simulateWholesaleRowWipe(zone, handoffKeys) {
  const trimmed = {};
  for (const key of handoffKeys) {
    if (zone.rows[key]) trimmed[key] = zone.rows[key];
  }
  return { ...zone, rows: trimmed };
}

/**
 * Pre-fix broken apply: keep only handoff keys, apply handoff, drop every foreign row.
 * Mirrors the wholesale wipe that removed G1-cycle and other foreign verdicts.
 */
export function runPreFixBrokenApply(zone, handoffPath, root = ROOT) {
  const handoffKeys = loadHandoffKeys(handoffPath);
  const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  const rows = {};
  for (const key of handoffKeys) {
    if (zone.rows[key]) rows[key] = JSON.parse(JSON.stringify(zone.rows[key]));
  }
  for (const row of handoff.rows || []) {
    const key = row.key || row.contractLine;
    if (!key || !rows[key]) continue;
    applyVerdictToRow(rows[key], {
      verdict: row.verdict ?? row.recommend,
      fact: row.f ?? row.fDraft ?? '',
      options: row.options || {},
    }, root);
  }
  return { ...zone, rows };
}

/**
 * Run production buildBatchMap + applyBatchMap against a fixture zone written to the real zone path.
 * Restores the production file in finally.
 */
export async function runProductionApplyOnFixture(fixtureZone, handoffPath, root = ROOT) {
  const zonePath = path.join(root, 'docs/ui/verdicts/strength-builder.json');
  const backupPath = path.join(os.tmpdir(), `heys-sb-zone-backup-${process.pid}.json`);
  fs.copyFileSync(zonePath, backupPath);
  fs.writeFileSync(zonePath, `${JSON.stringify(fixtureZone, null, 2)}\n`, 'utf8');

  try {
    const { buildBatchMap, applyBatchMap } = await import(
      pathToFileURL(path.join(root, 'scripts/.sb-750-verdict-batch-apply.mjs')).href
    );
    const { readZone } = await import(
      pathToFileURL(path.join(root, 'scripts/lib/ui-v4-verdicts.mjs')).href
    );

    const handoffKeys = loadHandoffKeys(handoffPath);
    const beforeSnap = snapshotForeignRowStrings(fixtureZone.rows, handoffKeys);

    const ctx = buildBatchMap([handoffPath], { withInline: false, allowDowngrade: false, log: () => {} });
    let applyError = null;
    try {
      applyBatchMap(ctx.batchMap, { dryRun: false, log: () => {} });
    } catch (error) {
      applyError = error;
    }

    const afterZone = readZone('strength-builder');
    const violations = collectForeignViolations(beforeSnap, afterZone.rows);

    return {
      handoffKeys,
      beforeSnap,
      violations,
      applyError,
      afterZone,
      queued: ctx.batchMap.size,
    };
  } finally {
    fs.copyFileSync(backupPath, zonePath);
    fs.unlinkSync(backupPath);
  }
}
