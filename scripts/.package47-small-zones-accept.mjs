#!/usr/bin/env node
/**
 * Package 47 — accept 10 small zones: snapshot drift keys → rehash → restore verdicts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);

const ZONES = [
  'cycle',
  'settings-system',
  'registration',
  'gamification',
  'tips',
  'login',
  'questionnaire',
  'first-run',
  'curator-edits',
  'spinners',
];

const P47 = 'Пакет 47: проза контракта переведена на var(--ink-2); --v4-ink-prose снят (ОТВЕТ-22 §2).';

const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);

function contractRows(html) {
  const m = html.match(
    /<div class="ctr" data-contract="[^"]+">([\s\S]*?)<\/div>\s*\n\s*<div class="(?:pl|secH)/,
  );
  if (!m) return new Map();
  const rows = new Map();
  for (const row of m[1].matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)) {
    rows.set(row[1], row[2]);
  }
  return rows;
}

function driftKeys(zoneId) {
  const html = fs.readFileSync(path.join(PACK, `${zoneId}.v4.dc.html`), 'utf8');
  const current = contractRows(html);
  const verdicts = readZone(zoneId).rows || {};
  const keys = [];
  for (const [key, value] of current) {
    const row = verdicts[key];
    if (!row?.h || row.h !== hash(value)) keys.push(key);
  }
  return keys;
}

function snapshotZone(zoneId) {
  const keys = driftKeys(zoneId);
  const rows = readZone(zoneId).rows || {};
  return keys.map((key) => {
    const r = rows[key] || {};
    return {
      key,
      v: r.v,
      f: r.f,
      naKind: r.naKind,
      reasonCode: r.reasonCode,
      decisionRef: r.decisionRef,
    };
  });
}

function appendP47(fact) {
  if (!fact) return P47;
  if (fact.includes('Пакет 47')) return fact;
  return `${fact} ${P47}`.trim();
}

function restoreZone(zoneId, snapshot) {
  const scopeKeys = new Set(snapshot.map((r) => r.key));
  const foreignBefore = snapshotForeignRowStrings(readZone(zoneId).rows, scopeKeys);

  let eq = 0;
  let neq = 0;
  for (const row of snapshot) {
    const options = {};
    if (row.v === '—') options['na-kind'] = row.naKind || 'foreign-zone';
    if (row.v === '≠') {
      if (row.reasonCode) options['reason-code'] = row.reasonCode;
      if (row.decisionRef) options['decision-ref'] = row.decisionRef;
    }
    setVerdictKey(zoneId, row.key, {
      verdict: row.v,
      fact: appendP47(row.f),
      options,
    });
    if (row.v === '=') eq += 1;
    if (row.v === '≠') neq += 1;
  }

  assertForeignRowsUnchanged(foreignBefore, readZone(zoneId).rows);
  return { eq, neq, total: snapshot.length };
}

const snapshots = {};
for (const zoneId of ZONES) {
  snapshots[zoneId] = snapshotZone(zoneId);
  console.log(`${zoneId}: drift ${snapshots[zoneId].length} keys`);
}

for (const zoneId of ZONES) {
  execFileSync(process.execPath, ['scripts/ui-v4-check-contract-drift.mjs', '--rehash', zoneId], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

const totals = { eq: 0, neq: 0, total: 0 };
for (const zoneId of ZONES) {
  const stats = restoreZone(zoneId, snapshots[zoneId]);
  totals.eq += stats.eq;
  totals.neq += stats.neq;
  totals.total += stats.total;
  console.log(`✓ ${zoneId}: = ${stats.eq}, ≠ ${stats.neq}, keys ${stats.total}`);
}

for (const zoneId of ZONES) {
  try {
    execFileSync(process.execPath, ['scripts/ui-v4-check-contract-drift.mjs', '--zone', zoneId], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    console.log(`drift gate ${zoneId}: OK`);
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    console.error(`drift gate ${zoneId}: FAIL\n${out.slice(0, 500)}`);
    process.exitCode = 1;
  }
}

console.log(`\npackage47 small zones: = ${totals.eq}, ≠ ${totals.neq}, total ${totals.total}`);
