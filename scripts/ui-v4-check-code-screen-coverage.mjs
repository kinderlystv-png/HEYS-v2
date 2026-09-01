#!/usr/bin/env node

import { readCanvasPackage } from './lib/ui-v4-canvas-index.mjs';
import {
  buildCodeScreenCoverageReport,
  readProductScreenRoots,
  readScreenCoverageRegistry,
} from './lib/ui-v4-screen-roots.mjs';

const args = new Set(process.argv.slice(2));
const known = new Set(['--json', '--list']);
const unknown = [...args].filter((arg) => !known.has(arg));
if (unknown.length) {
  console.error(`Неизвестные аргументы: ${unknown.join(', ')}`);
  process.exitCode = 2;
} else {
  const roots = readProductScreenRoots();
  const report = buildCodeScreenCoverageReport(
    roots,
    readCanvasPackage(),
    readScreenCoverageRegistry(),
  );

  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.has('--list')) {
    for (const root of roots) {
      const location = root.locations[0];
      console.log(`${root.identity}\t${location.file}:${location.lines[0]}`);
    }
  } else {
    const t = report.totals;
    console.log(
      `UI v4 code→canvas: корней ${t.codeRoots}, покрыто ${t.covered}, ` +
      `исключено ${t.excluded}, пробелов ${t.gaps}, ждут разбора ${t.pending}.`,
    );
    if (t.missing) {
      console.error(`❌ Новые корни без записи: ${report.missing.map((item) => item.identity).join(', ')}`);
    }
    if (t.gaps) {
      console.error(`❌ Подтверждённые пробелы канваса: ${report.gaps.map((item) => item.identity).join(', ')}`);
    }
    if (t.pending) {
      console.error(`❌ Ещё не разобраны: ${report.pending.slice(0, 12).map((item) => item.identity).join(', ')}${t.pending > 12 ? '…' : ''}`);
    }
    if (t.invalid) console.error(`❌ Неверные mappings: ${report.invalid.map((item) => item.identity).join(', ')}`);
    if (t.stale) console.error(`❌ Устаревшие записи: ${report.stale.join(', ')}`);
  }

  if (!args.has('--list') && !report.ok) process.exitCode = 1;
}
