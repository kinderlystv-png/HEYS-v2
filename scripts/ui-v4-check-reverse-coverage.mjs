#!/usr/bin/env node

import { readAllZones } from './lib/ui-v4-verdicts.mjs';
import {
  buildReverseCoverageReport,
  readCanvasPackage,
} from './lib/ui-v4-canvas-index.mjs';

function parseArgs(argv) {
  const options = { zones: [], list: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--zone') {
      const zoneId = argv[index + 1];
      if (!zoneId || zoneId.startsWith('--')) throw new Error('После --zone нужен id зоны.');
      options.zones.push(zoneId);
      index += 1;
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }
  return options;
}

function sample(items, limit = 5) {
  const head = items.slice(0, limit).map((item) => `«${item}»`).join(', ');
  return items.length > limit ? `${head} и ещё ${items.length - limit}` : head;
}

function printList(report) {
  for (const zone of report.zones) {
    const rowDebt = zone.contract.missing.length + zone.contract.extra.length;
    const frameDebt = zone.frames.missing.length + zone.frames.missingEvidence.length;
    console.log(
      `${zone.zoneId.padEnd(19)} ` +
        `строки ${String(zone.contract.covered).padStart(4)}/${String(zone.contract.total).padEnd(4)} ` +
        `кадры ${String(zone.frames.covered).padStart(3)}/${String(zone.frames.total).padEnd(3)} ` +
        `долг ${rowDebt + frameDebt} ` +
        `дубли ${zone.contract.duplicates.length + zone.frames.duplicates.length}`,
    );
  }
}

function printReport(report) {
  const totals = report.totals;
  console.log(
    `UI v4 reverse coverage: канвасов ${totals.canvases}, ` +
      `строк ${totals.contractCovered}/${totals.contractRows}, ` +
      `продуктовых кадров ${totals.framesCovered}/${totals.productFrames}.`,
  );
  console.log(`Scope кадров: ${JSON.stringify(totals.frameScope)}.`);

  for (const zone of report.zones.filter((item) => !item.ok)) {
    console.error(`\n❌ ${zone.zoneId} (${zone.canvas})`);
    if (!zone.verdictPresent) console.error('  нет verdict-файла зоны');
    else if (!zone.canvasMatches) console.error('  поле canvas в verdict-файле не совпадает');
    if (zone.contract.missing.length) {
      console.error(`  строки без точного verdict-ключа: ${sample(zone.contract.missing)}`);
    }
    if (zone.contract.extra.length) {
      console.error(`  verdict-строки без строки канваса: ${sample(zone.contract.extra)}`);
    }
    if (zone.contract.duplicates.length) {
      console.error(
        `  дубли строк: ${sample(zone.contract.duplicates.map((item) => item.identity))}`,
      );
    }
    if (zone.contract.malformed.length) {
      console.error(`  неразобранные .spec-строки: ${zone.contract.malformed.length}`);
    }
    if (!zone.frames.frameSchemaPresent) {
      console.error(
        `  схема verdict ещё не содержит frames/evidence; ` +
          `${zone.frames.total} продуктовых кадров честно считаются непокрытыми`,
      );
    } else {
      if (zone.frames.missing.length) {
        console.error(`  кадры без точного verdict-ключа: ${sample(zone.frames.missing)}`);
      }
      if (zone.frames.missingEvidence.length) {
        console.error(`  кадры без evidence: ${sample(zone.frames.missingEvidence)}`);
      }
      if (zone.frames.extra.length) {
        console.error(`  verdict-кадры без кадра канваса: ${sample(zone.frames.extra)}`);
      }
    }
    if (zone.frames.duplicates.length) {
      console.error(
        `  дубли меток продуктовых кадров: ${sample(zone.frames.duplicates.map((item) => item.identity))}`,
      );
    }
    if (zone.frames.unknownDemo.length) {
      console.error(`  кадры с неизвестным data-demo: ${zone.frames.unknownDemo.length}`);
    }
  }

  if (report.verdictsWithoutCanvas.length) {
    console.error(`\n❌ Verdict-зоны без root canvas: ${report.verdictsWithoutCanvas.join(', ')}`);
  }
  if (!report.ok) {
    console.error(
      '\nGate read-only: ничего не записано. Полный scaffold недостающих frames/evidence доступен через --json.',
    );
  }
}

function run() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  const allCanvases = readCanvasPackage();
  const available = new Set(allCanvases.map((canvas) => canvas.zoneId));
  const unknown = options.zones.filter((zoneId) => !available.has(zoneId));
  if (unknown.length) {
    console.error(`Неизвестная зона: ${unknown.join(', ')}. Есть: ${[...available].join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const selected = options.zones.length
    ? allCanvases.filter((canvas) => options.zones.includes(canvas.zoneId))
    : allCanvases;
  const allVerdicts = readAllZones().zones;
  const selectedVerdicts = Object.fromEntries(
    Object.entries(allVerdicts).filter(([zoneId]) => selected.some((canvas) => canvas.zoneId === zoneId)),
  );
  const report = buildReverseCoverageReport(selected, selectedVerdicts);

  if (options.json) console.log(JSON.stringify(report, null, 2));
  else if (options.list) printList(report);
  else printReport(report);

  if (!options.list && !report.ok) process.exitCode = 1;
}

run();
