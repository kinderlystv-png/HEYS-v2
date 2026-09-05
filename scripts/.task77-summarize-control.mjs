#!/usr/bin/env node
// Summarize Task 77 control JSON from ui-v4-measure-zone.mjs (owner runs locally).
//
// Usage:
//   node scripts/.task77-summarize-control.mjs scripts/.task77-hw-control.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) {
  process.stderr.write('Usage: node scripts/.task77-summarize-control.mjs <report.json>\n');
  process.exit(1);
}

const reportPath = path.resolve(ROOT, input);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const rows = report.rows || [];
const summary = report.summary || {};

const total = rows.length;
const confirmed = rows.filter((row) => row.status === 'matched').length;
const mismatch = rows.filter((row) => row.status === 'mismatched').length;
const inconclusive = rows.filter((row) => row.status === 'inconclusive').length;
const strength1Excluded = rows.filter((row) => row.excludedStrength1 || row.strength < 2).length;
const proposals = rows.filter((row) => row.proposal).length;
const confirmsExistingEq = rows.filter((row) => row.confirmsExistingEq).length;
const mismatchesExistingEq = rows.filter((row) => row.mismatchesExistingEq).length;

const out = {
  file: path.relative(ROOT, reportPath),
  zone: summary.zone || null,
  total,
  confirmed,
  mismatch,
  inconclusive,
  strength1Excluded,
  proposals,
  confirmsExistingEq,
  mismatchesExistingEq,
  skipped: {
    filteredNonEq: summary.filteredNonEq || 0,
    unmappedNoVisualCase: summary.unmappedNoVisualCase || 0,
    unsupportedParse: summary.unsupportedParse || 0,
  },
  limitation: summary.limitation || null,
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
