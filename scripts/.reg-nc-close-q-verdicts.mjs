#!/usr/bin/env node
// Close REG1 + NC5 «?» rows from materialized completed-frame evidence.
// Per-key merge via readZone/writeZone; scope = rows still «?» in registration/norm-correction.
import { materializeCompletedFrameEvidence } from '../apps/web/scripts/ui-v4-completed-frame-evidence.mjs';
import { readCanvasPackage } from './lib/ui-v4-canvas-index.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';
import { applyVerdictToRow, readZone, writeZone } from './lib/ui-v4-verdicts.mjs';

const ZONES = ['registration', 'norm-correction'];
const materialized = materializeCompletedFrameEvidence(
  readCanvasPackage().flatMap((canvas) => canvas.contractRows),
);
const byZone = new Map(ZONES.map((zoneId) => [zoneId, new Map()]));

for (const entry of materialized) {
  if (!ZONES.includes(entry.zoneId)) continue;
  byZone.get(entry.zoneId).set(entry.rowIdentity, entry);
}

for (const zoneId of ZONES) {
  const zone = readZone(zoneId);
  const scopeKeys = new Set(
    Object.keys(zone.rows).filter((key) => zone.rows[key].v === '?' && byZone.get(zoneId).has(key)),
  );
  const foreignBefore = snapshotForeignRowStrings(zone.rows, scopeKeys);
  const summary = { '=': 0, '≠': 0, '?': 0 };

  for (const key of scopeKeys) {
    const entry = byZone.get(zoneId).get(key);
    const row = zone.rows[key];
    const options = {};
    if (entry.verdict === '≠') {
      options['reason-code'] = entry.reasonCode;
      options['decision-ref'] = entry.decisionRef;
    }
    applyVerdictToRow(row, { verdict: entry.verdict, fact: entry.fact, options });
    row.evidence = [...entry.evidence];
    summary[entry.verdict] += 1;
    console.log(`${key}  ? → ${entry.verdict}`);
  }

  assertForeignRowsUnchanged(foreignBefore, zone.rows);
  writeZone(zoneId, zone);
  console.log(`${zoneId}: ${scopeKeys.size} rows`, summary);
}
