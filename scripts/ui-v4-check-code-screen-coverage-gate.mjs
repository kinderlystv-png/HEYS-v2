#!/usr/bin/env node
// Gate wrapper: code→canvas registry + scope/remainder (gap — осознанный долг).

import { readCanvasPackage } from './lib/ui-v4-canvas-index.mjs';
import {
  buildCodeScreenCoverageReport,
  readProductScreenRoots,
  readScreenCoverageRegistry,
} from './lib/ui-v4-screen-roots.mjs';

function run() {
  const roots = readProductScreenRoots();
  const report = buildCodeScreenCoverageReport(
    roots,
    readCanvasPackage(),
    readScreenCoverageRegistry(),
  );
  const t = report.totals;

  console.log(
    `UI v4 code→canvas: корней ${t.codeRoots}, покрыто ${t.covered}, ` +
      `исключено ${t.excluded}, пробелов ${t.gaps}, ждут разбора ${t.pending}.`,
  );
  console.log(
    `Охват gate: ${t.covered + t.excluded + t.gaps}/${t.codeRoots} корней в реестре; ` +
      `вне реестра (не проверялось): ${t.missing}.`,
  );
  if (t.gaps) {
    console.log(
      `Подтверждённые пробелы канваса (status gap, не fail): ${t.gaps} — ` +
        `${report.gaps.slice(0, 8).map((item) => item.identity).join(', ')}` +
        `${t.gaps > 8 ? '…' : ''}`,
    );
  }
  if (t.pending) {
    console.log(`Ждут разбора (unreviewed): ${t.pending}`);
  }

  if (t.missing) {
    console.error(`❌ Новые корни без записи: ${report.missing.map((item) => item.identity).join(', ')}`);
  }
  if (t.invalid) {
    console.error(`❌ Неверные mappings: ${report.invalid.map((item) => item.identity).join(', ')}`);
  }
  if (t.stale) {
    console.error(`❌ Устаревшие записи: ${report.stale.join(', ')}`);
  }
  if (t.pending) {
    console.error(
      `❌ Ещё не разобраны: ${report.pending.slice(0, 12).map((item) => item.identity).join(', ')}` +
        `${t.pending > 12 ? '…' : ''}`,
    );
  }

  if (!report.ok) process.exitCode = 1;
}

run();
