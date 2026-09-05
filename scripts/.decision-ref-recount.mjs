#!/usr/bin/env node
/**
 * Task 27a — read-only recount of decisionRef vs f-field canvas anchors.
 * Usage: node scripts/.decision-ref-recount.mjs [zone.json path]
 * Default: docs/ui/verdicts/strength-builder.json
 */

import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const DEFAULT_PATH = 'docs/ui/verdicts/strength-builder.json';
const HYPOTHESIS = { totalNeq: 279, at754: 187, ref754Suffix: ':754' };

const filePath = resolve(process.cwd(), process.argv[2] || DEFAULT_PATH);
const zone = JSON.parse(readFileSync(filePath, 'utf8'));
const zoneName = basename(filePath, '.json');

/** @param {string} decisionRef */
function lineFromDecisionRef(decisionRef) {
  if (!decisionRef) return null;
  const hash = decisionRef.lastIndexOf('#');
  const colon = decisionRef.lastIndexOf(':');
  if (colon > hash && colon >= 0) {
    const n = Number(decisionRef.slice(colon + 1));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** @param {string} f */
function extractAnchors(f) {
  if (!f) return { canvasLines: [], hashes: [], paths: [], raw: [] };

  const canvasLines = new Set();
  const hashes = new Set();
  const paths = new Set();
  const raw = [];

  for (const m of f.matchAll(/(?:Канвас|Контракт)\s*:([0-9]+)/gi)) {
    const n = Number(m[1]);
    canvasLines.add(n);
    raw.push({ kind: 'label', line: n, text: m[0] });
  }

  for (const m of f.matchAll(/([^\s:]+\.v4\.dc\.html):([0-9]+)/gi)) {
    const n = Number(m[2]);
    canvasLines.add(n);
    paths.add(`${m[1]}:${n}`);
    raw.push({ kind: 'canvas-path', line: n, text: m[0] });
  }

  for (const m of f.matchAll(/([^\s#:]+(?:\/[^\s#:]+)+):([0-9]+)/g)) {
    if (/\.v4\.dc\.html$/i.test(m[1]) || m[1].includes('/')) {
      const n = Number(m[2]);
      if (n >= 200) {
        paths.add(`${m[1]}:${n}`);
        if (/strength-builder\.v4\.dc\.html$/i.test(m[1])) canvasLines.add(n);
        raw.push({ kind: 'repo-path', line: n, text: m[0] });
      }
    }
  }

  for (const m of f.matchAll(/#([a-z0-9][a-z0-9-]*)/gi)) {
    hashes.add(`#${m[1]}`);
    raw.push({ kind: 'hash', text: `#${m[1]}` });
  }

  // Bare :NNNN — canvas contract lines (≥2000), not code refs like catalog_ui:446 or 750:5831
  for (const m of f.matchAll(/(?:^|[\s([«"—·])\:([0-9]{4,})(?:\b|[^0-9])/g)) {
    const n = Number(m[1]);
    if (n >= 2000) {
      canvasLines.add(n);
      raw.push({ kind: 'bare-colon', line: n, text: `:${n}` });
    }
  }

  return {
    canvasLines: [...canvasLines].sort((a, b) => a - b),
    hashes: [...hashes],
    paths: [...paths],
    raw,
  };
}

function isNeqRow(row) {
  return row && row.v === '≠';
}

const rows = Object.entries(zone.rows || {});
const neqRows = rows.filter(([, row]) => isNeqRow(row));

const byDecisionRef = new Map();
for (const [, row] of neqRows) {
  const ref = row.decisionRef || '(none)';
  byDecisionRef.set(ref, (byDecisionRef.get(ref) || 0) + 1);
}

const top10 = [...byDecisionRef.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

const dominantRef = top10[0]?.[0] ?? null;
const dominantLine = lineFromDecisionRef(dominantRef);

const at754Ref = [...byDecisionRef.entries()].find(([ref]) => ref.endsWith(':754'));
const at754Count = at754Ref?.[1] ?? 0;
const ref754 = at754Ref?.[0] ?? null;

const ref754Rows = neqRows.filter(([, row]) => row.decisionRef === ref754);

let fAnchorDiffersFrom754 = 0;
let fHasCanvasAnchor754 = 0;
let fNoCanvasAnchor754 = 0;
const mismatchExamples = [];

for (const [key, row] of ref754Rows) {
  const { canvasLines } = extractAnchors(row.f || '');
  if (canvasLines.length === 0) {
    fNoCanvasAnchor754 += 1;
    continue;
  }
  fHasCanvasAnchor754 += 1;
  const differs = canvasLines.some((line) => line !== 754);
  if (differs) {
    fAnchorDiffersFrom754 += 1;
    if (mismatchExamples.length < 5) {
      mismatchExamples.push({ key, canvasLines, f: (row.f || '').slice(0, 140) });
    }
  }
}

// Dominant-ref mismatch (same logic for whatever ref wins top-1)
let dominantMismatch = 0;
let dominantHasAnchor = 0;
let dominantNoAnchor = 0;
if (dominantRef && dominantLine != null) {
  const domRows = neqRows.filter(([, row]) => row.decisionRef === dominantRef);
  for (const [, row] of domRows) {
    const { canvasLines } = extractAnchors(row.f || '');
    if (canvasLines.length === 0) {
      dominantNoAnchor += 1;
      continue;
    }
    dominantHasAnchor += 1;
    if (canvasLines.some((line) => line !== dominantLine)) dominantMismatch += 1;
  }
}

const reasonCodes = {};
for (const [, row] of neqRows) {
  const rc = row.reasonCode || '(none)';
  reasonCodes[rc] = (reasonCodes[rc] || 0) + 1;
}

console.log(`=== decisionRef recount · ${zoneName} ===`);
console.log(`file: ${filePath}`);
console.log(`canvas: ${zone.canvas || '(unknown)'}`);
console.log('');
console.log('--- totals ---');
console.log(`total rows:        ${rows.length}`);
console.log(`v = ≠:             ${neqRows.length}`);
console.log(`with reasonCode:   ${neqRows.filter(([, r]) => r.reasonCode).length}`);
console.log('');
console.log('--- reasonCode (≠ rows) ---');
for (const [code, n] of Object.entries(reasonCodes).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${code}: ${n}`);
}
console.log('');
console.log('--- top 10 decisionRef (≠ rows) ---');
for (const [ref, n] of top10) {
  const short = ref.length > 90 ? `…${ref.slice(-87)}` : ref;
  console.log(`  ${n}\t${short}`);
}
console.log('');
console.log('--- :754 slice ---');
console.log(`≠ at …:754:        ${at754Count}`);
console.log(`f has canvas line: ${fHasCanvasAnchor754}`);
console.log(`f no canvas line:  ${fNoCanvasAnchor754}`);
console.log(`f anchor ≠ :754:   ${fAnchorDiffersFrom754}`);
console.log('');
console.log(`--- dominant ref (line ${dominantLine}) ---`);
console.log(`f has canvas line: ${dominantHasAnchor}`);
console.log(`f no canvas line:  ${dominantNoAnchor}`);
console.log(`f anchor ≠ ref:    ${dominantMismatch}`);
console.log('');
console.log('--- vs user hypothesis (DO NOT trust) ---');
console.log(
  `hypothesis: ${HYPOTHESIS.at754}/${HYPOTHESIS.totalNeq} at :754`,
);
console.log(
  `actual:     ${at754Count}/${neqRows.length} at :754`,
);
console.log(
  `Δ total ≠:   ${neqRows.length - HYPOTHESIS.totalNeq} (${neqRows.length} vs ${HYPOTHESIS.totalNeq})`,
);
console.log(
  `Δ at :754:   ${at754Count - HYPOTHESIS.at754} (${at754Count} vs ${HYPOTHESIS.at754})`,
);
console.log(
  `hypothesis implied f≠:754 among :754 rows ≈ ${HYPOTHESIS.at754}; actual f anchor ≠ :754 = ${fAnchorDiffersFrom754}`,
);
const match =
  neqRows.length === HYPOTHESIS.totalNeq && at754Count === HYPOTHESIS.at754;
console.log(match ? 'hypothesis MATCHES current file' : 'hypothesis DOES NOT MATCH current file');
if (mismatchExamples.length) {
  console.log('');
  console.log('--- sample f anchor ≠ :754 ---');
  for (const ex of mismatchExamples) {
    console.log(`  [${ex.key}] lines=${ex.canvasLines.join(',')} · ${ex.f}`);
  }
}
