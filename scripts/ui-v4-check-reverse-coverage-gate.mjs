#!/usr/bin/env node
// Gate wrapper: reverse-coverage + явный scope/remainder по кадрам.

import { readAllZones } from './lib/ui-v4-verdicts.mjs';
import {
  DUPLICATE_FRAME_BASELINE,
  buildReverseCoverageReport,
  readCanvasPackage,
} from './lib/ui-v4-canvas-index.mjs';

function nonProductFrames(frameScope) {
  const product = frameScope.stop ?? 0;
  const total = Object.values(frameScope).reduce((sum, count) => sum + count, 0);
  return total - product;
}

function run() {
  const allCanvases = readCanvasPackage();
  const allVerdicts = readAllZones().zones;
  const report = buildReverseCoverageReport(allCanvases, allVerdicts);

  const totals = report.totals;
  const frameScope = totals.frameScope || {};
  const nonProduct = nonProductFrames(frameScope);
  const duplicateTips = totals.duplicateFrameIdentities ?? 0;
  const [tipsAllowed] = DUPLICATE_FRAME_BASELINE.tips || [0];

  console.log(
    `UI v4 reverse coverage: канвасов ${totals.canvases}, ` +
      `строк ${totals.contractCovered}/${totals.contractRows}, ` +
      `продуктовых кадров ${totals.framesCovered}/${totals.productFrames}.`,
  );
  console.log(`Scope кадров (product): stop ${frameScope.stop ?? 0}.`);
  console.log(
    `Вне scope gate (не product / не ключ evidence): protocol ${frameScope.protocol ?? 0} · ` +
      `loop ${frameScope.loop ?? 0} · none ${frameScope.none ?? 0} — всего ${nonProduct}.`,
  );
  console.log(
    `Дубли меток кадров: ${duplicateTips} (tips baseline ${tipsAllowed}; рост > ${tipsAllowed} роняет этот гейт).`,
  );

  if (!report.ok) {
    for (const zone of report.zones.filter((item) => !item.ok)) {
      console.error(`\n❌ ${zone.zoneId} (${zone.canvas})`);
      if (!zone.verdictPresent) console.error('  нет verdict-файла зоны');
      else if (!zone.canvasMatches) console.error('  поле canvas в verdict-файле не совпадает');
      if (zone.contract.missing.length) {
        console.error(`  строки без verdict-ключа: ${zone.contract.missing.length}`);
      }
      if (zone.contract.extra.length) {
        console.error(`  verdict-строки без строки канваса: ${zone.contract.extra.length}`);
      }
      if (zone.frames.missing.length) {
        console.error(`  кадры без verdict-ключа: ${zone.frames.missing.length}`);
      }
      if (zone.frames.missingEvidence.length) {
        console.error(`  кадры без evidence: ${zone.frames.missingEvidence.length}`);
      }
    }
    if (report.verdictsWithoutCanvas.length) {
      console.error(`\n❌ Verdict-зоны без root canvas: ${report.verdictsWithoutCanvas.join(', ')}`);
    }
    process.exitCode = 1;
    return;
  }

  if (duplicateTips > tipsAllowed) {
    console.error(`❌ Дубли меток кадров tips: ${duplicateTips} > baseline ${tipsAllowed}`);
    process.exitCode = 1;
  }
}

run();
