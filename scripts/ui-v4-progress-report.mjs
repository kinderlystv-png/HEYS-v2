#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCanvasPackage } from './lib/ui-v4-canvas-index.mjs';
import {
  parseContractAssertions,
  validateContractAssertions,
} from './lib/ui-v4-assertions.mjs';
import { readAllZones } from './lib/ui-v4-verdicts.mjs';
import { UI_V4_VISUAL_CASES } from '../apps/web/scripts/ui-v4-visual-fixture.mjs';

export const VERDICTS = Object.freeze(['=', '≠', '?', '—']);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function invariant(condition, message) {
  if (!condition) throw new Error(`[ui-v4-progress] ${message}`);
}

function blankVerdictCounts() {
  return Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0]));
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] || 0) + amount;
}

function percentage(count, total) {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(1));
}

function sortedObject(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right, 'en')));
}

function frameHasEvidence(entry) {
  const evidence = entry.evidence;
  if (Array.isArray(evidence)) return evidence.some((item) => item.trim());
  return typeof evidence === 'string' && Boolean(evidence.trim());
}

function validateVerdictZone(zoneId, zone, canvas) {
  invariant(isObject(zone), `verdict zone "${zoneId}" must be an object`);
  invariant(typeof zone.canvas === 'string' && zone.canvas, `zone "${zoneId}" has no canvas file`);
  invariant(zone.canvas === canvas.file, `zone "${zoneId}" points to ${zone.canvas}, expected ${canvas.file}`);
  invariant(isObject(zone.rows), `zone "${zoneId}" rows must be an object`);

  const canvasRowIds = canvas.contractRows.map((row) => row.identity);
  const canvasRowSet = new Set(canvasRowIds);
  invariant(canvasRowSet.size === canvasRowIds.length, `canvas "${canvas.file}" has duplicate contract rows`);

  const verdictRowIds = Object.keys(zone.rows);
  const missingRows = canvasRowIds.filter((identity) => !Object.hasOwn(zone.rows, identity));
  const extraRows = verdictRowIds.filter((identity) => !canvasRowSet.has(identity));
  invariant(missingRows.length === 0, `zone "${zoneId}" is missing ${missingRows.length} contract rows`);
  invariant(extraRows.length === 0, `zone "${zoneId}" has ${extraRows.length} rows absent from Canvas`);

  const counts = blankVerdictCounts();
  for (const [identity, row] of Object.entries(zone.rows)) {
    invariant(isObject(row), `zone "${zoneId}" row "${identity}" must be an object`);
    invariant(VERDICTS.includes(row.v), `zone "${zoneId}" row "${identity}" has invalid verdict "${row.v}"`);
    counts[row.v] += 1;
  }

  invariant(isObject(zone.frames), `zone "${zoneId}" frames must be an object`);
  for (const [identity, frame] of Object.entries(zone.frames)) {
    invariant(isObject(frame), `zone "${zoneId}" frame "${identity}" must be an object`);
    invariant(
      typeof frame.evidence === 'string' || Array.isArray(frame.evidence),
      `zone "${zoneId}" frame "${identity}" evidence must be a string or array`,
    );
    if (Array.isArray(frame.evidence)) {
      invariant(
        frame.evidence.every((item) => typeof item === 'string'),
        `zone "${zoneId}" frame "${identity}" evidence array must contain only strings`,
      );
    }
  }

  return counts;
}

function validateCanvas(canvas) {
  invariant(isObject(canvas), 'canvas entry must be an object');
  invariant(typeof canvas.zoneId === 'string' && canvas.zoneId, 'canvas entry has no zoneId');
  invariant(typeof canvas.file === 'string' && canvas.file, `canvas "${canvas.zoneId}" has no file`);
  invariant(Array.isArray(canvas.contractRows), `canvas "${canvas.file}" has no contract rows`);
  invariant(Array.isArray(canvas.productFrames), `canvas "${canvas.file}" has no product frames`);
  invariant(
    Array.isArray(canvas.malformedContractRows) && canvas.malformedContractRows.length === 0,
    `canvas "${canvas.file}" has malformed contract rows`,
  );
  for (const row of canvas.contractRows) {
    invariant(typeof row?.identity === 'string' && row.identity, `canvas "${canvas.file}" has an unnamed contract row`);
  }
  for (const frame of canvas.productFrames) {
    invariant(typeof frame?.identity === 'string' && frame.identity, `canvas "${canvas.file}" has an unnamed product frame`);
  }
}

function validateVisualCases(visualCases, knownZoneIds) {
  invariant(Array.isArray(visualCases), 'visual cases must be an array');
  const ids = new Set();
  for (const item of visualCases) {
    invariant(isObject(item), 'visual case must be an object');
    invariant(typeof item.id === 'string' && item.id, 'visual case has no id');
    invariant(!ids.has(item.id), `duplicate visual case id "${item.id}"`);
    ids.add(item.id);
    invariant(typeof item.zone === 'string' && knownZoneIds.has(item.zone), `visual case "${item.id}" has unknown zone "${item.zone}"`);
    invariant(typeof item.status === 'string' && item.status, `visual case "${item.id}" has no status`);
    invariant(typeof item.gate === 'string' && item.gate, `visual case "${item.id}" has no gate`);
  }
}

export function buildUiV4ProgressReport({ verdicts, canvases, visualCases }) {
  invariant(isObject(verdicts?.zones), 'verdicts.zones must be an object');
  invariant(Array.isArray(canvases) && canvases.length > 0, 'canvas package is empty');

  const canvasZoneIds = canvases.map((canvas) => {
    validateCanvas(canvas);
    return canvas.zoneId;
  });
  const knownZoneIds = new Set(canvasZoneIds);
  invariant(knownZoneIds.size === canvasZoneIds.length, 'canvas package has duplicate zone ids');

  const verdictZoneIds = Object.keys(verdicts.zones);
  const missingVerdictZones = canvasZoneIds.filter((zoneId) => !Object.hasOwn(verdicts.zones, zoneId));
  const extraVerdictZones = verdictZoneIds.filter((zoneId) => !knownZoneIds.has(zoneId));
  invariant(missingVerdictZones.length === 0, `missing verdict zones: ${missingVerdictZones.join(', ')}`);
  invariant(extraVerdictZones.length === 0, `verdict zones without Canvas: ${extraVerdictZones.join(', ')}`);
  validateVisualCases(visualCases, knownZoneIds);

  const globalCounts = blankVerdictCounts();
  const perZone = {};
  let productFrameOccurrences = 0;
  let uniqueProductFrames = 0;
  let frameEvidence = 0;
  let duplicateFrameIdentityGroups = 0;
  let duplicateFrameOccurrences = 0;
  let missingFrameEntries = 0;
  let missingFrameEvidence = 0;
  let extraFrameEntries = 0;
  const assertionTotals = { parsed: 0, partial: 0, unsupported: 0, assertions: 0 };

  for (const canvas of [...canvases].sort((left, right) => left.zoneId.localeCompare(right.zoneId, 'en'))) {
    const zone = verdicts.zones[canvas.zoneId];
    const verdictCounts = validateVerdictZone(canvas.zoneId, zone, canvas);
    const rowTotal = Object.values(verdictCounts).reduce((sum, count) => sum + count, 0);
    for (const verdict of VERDICTS) globalCounts[verdict] += verdictCounts[verdict];

    const assertionCounts = { parsed: 0, partial: 0, unsupported: 0, assertions: 0 };
    for (const row of canvas.contractRows) {
      const parsed = parseContractAssertions({ ...row, file: canvas.file });
      const validation = validateContractAssertions(parsed);
      invariant(
        validation.ok,
        `typed assertions for "${canvas.zoneId}" row "${row.identity}" are invalid`,
      );
      assertionCounts[parsed.parseStatus] += 1;
      assertionCounts.assertions += parsed.assertions.length;
    }
    for (const key of Object.keys(assertionTotals)) assertionTotals[key] += assertionCounts[key];

    const frameIds = canvas.productFrames.map((frame) => frame.identity);
    const uniqueFrameIds = new Set(frameIds);
    const frameEntries = Object.keys(zone.frames);
    const missingEntries = [...uniqueFrameIds].filter((identity) => !Object.hasOwn(zone.frames, identity));
    const extraEntries = frameEntries.filter((identity) => !uniqueFrameIds.has(identity));
    const expectedWithoutEvidence = [...uniqueFrameIds].filter(
      (identity) => Object.hasOwn(zone.frames, identity) && !frameHasEvidence(zone.frames[identity]),
    );
    const evidenced = [...uniqueFrameIds].filter(
      (identity) => Object.hasOwn(zone.frames, identity) && frameHasEvidence(zone.frames[identity]),
    ).length;
    const occurrenceCounts = frameIds.reduce((counts, identity) => {
      increment(counts, identity);
      return counts;
    }, {});
    const duplicateGroups = Object.values(occurrenceCounts).filter((count) => count > 1).length;
    const duplicateOccurrences = frameIds.length - uniqueFrameIds.size;

    productFrameOccurrences += frameIds.length;
    uniqueProductFrames += uniqueFrameIds.size;
    frameEvidence += evidenced;
    duplicateFrameIdentityGroups += duplicateGroups;
    duplicateFrameOccurrences += duplicateOccurrences;
    missingFrameEntries += missingEntries.length;
    missingFrameEvidence += expectedWithoutEvidence.length;
    extraFrameEntries += extraEntries.length;

    perZone[canvas.zoneId] = {
      rows: {
        total: rowTotal,
        counts: verdictCounts,
        percentages: Object.fromEntries(
          VERDICTS.map((verdict) => [verdict, percentage(verdictCounts[verdict], rowTotal)]),
        ),
      },
      frames: {
        occurrences: frameIds.length,
        unique: uniqueFrameIds.size,
        evidenced,
        missingEntries: missingEntries.length,
        missingEvidence: expectedWithoutEvidence.length,
        duplicateIdentityGroups: duplicateGroups,
        duplicateOccurrences,
        extraEntries: extraEntries.length,
      },
      assertions: assertionCounts,
    };
  }

  const rowTotal = Object.values(globalCounts).reduce((sum, count) => sum + count, 0);
  const byStatus = {};
  const byGate = {};
  const visualZones = new Set();
  let canonicalMapped = 0;
  for (const item of visualCases) {
    increment(byStatus, item.status);
    increment(byGate, item.gate);
    visualZones.add(item.zone);
    if (item.canvasFrame !== undefined) {
      invariant(isObject(item.canvasFrame), `visual case "${item.id}" canvasFrame must be an object`);
      for (const field of ['file', 'label', 'oid', 'palette']) {
        invariant(
          typeof item.canvasFrame[field] === 'string' && item.canvasFrame[field].trim(),
          `visual case "${item.id}" canvasFrame has no ${field}`,
        );
      }
      canonicalMapped += 1;
    }
  }

  return {
    schemaVersion: 1,
    verdicts: {
      total: rowTotal,
      counts: globalCounts,
      percentages: Object.fromEntries(
        VERDICTS.map((verdict) => [verdict, percentage(globalCounts[verdict], rowTotal)]),
      ),
    },
    frames: {
      canvases: canvases.length,
      productOccurrences: productFrameOccurrences,
      uniqueProductFrames,
      evidenced: frameEvidence,
      missingEntries: missingFrameEntries,
      missingEvidence: missingFrameEvidence,
      duplicateIdentityGroups: duplicateFrameIdentityGroups,
      duplicateOccurrences: duplicateFrameOccurrences,
      extraEntries: extraFrameEntries,
      evidencePercent: percentage(frameEvidence, uniqueProductFrames),
    },
    assertions: {
      rows: rowTotal,
      ...assertionTotals,
      fullyParsedPercent: percentage(assertionTotals.parsed, rowTotal),
    },
    visuals: {
      cases: visualCases.length,
      zonesCovered: visualZones.size,
      canvasZones: canvases.length,
      canonicalMapped,
      byStatus: sortedObject(Object.entries(byStatus)),
      byGate: sortedObject(Object.entries(byGate)),
    },
    zones: perZone,
  };
}

export function loadCanonicalProgressInputs() {
  return {
    verdicts: readAllZones(),
    canvases: readCanvasPackage(),
    visualCases: UI_V4_VISUAL_CASES,
  };
}

export function formatUiV4ProgressReport(report) {
  const lines = [
    'UI v4 convergence progress',
    '',
    `Verdicts: ${report.verdicts.total}`,
    ...VERDICTS.map(
      (verdict) => `  ${verdict}  ${report.verdicts.counts[verdict]} (${report.verdicts.percentages[verdict].toFixed(1)}%)`,
    ),
    '',
    `Frames: ${report.frames.evidenced}/${report.frames.uniqueProductFrames} evidenced unique (${report.frames.evidencePercent.toFixed(1)}%)`,
    `  ${report.frames.productOccurrences} product occurrences; ${report.frames.duplicateIdentityGroups} duplicate identity groups (${report.frames.duplicateOccurrences} extra occurrences)`,
    `  missing entries ${report.frames.missingEntries}; missing evidence ${report.frames.missingEvidence}; extra entries ${report.frames.extraEntries}`,
    '',
    `Typed assertions: ${report.assertions.parsed}/${report.assertions.rows} fully parsed (${report.assertions.fullyParsedPercent.toFixed(1)}%)`,
    `  partial ${report.assertions.partial}; unsupported ${report.assertions.unsupported}; assertions ${report.assertions.assertions}`,
    '',
    `Visual cases: ${report.visuals.cases}; zones ${report.visuals.zonesCovered}/${report.visuals.canvasZones}; canonical mappings ${report.visuals.canonicalMapped}`,
    `  status: ${Object.entries(report.visuals.byStatus).map(([key, value]) => `${key}=${value}`).join(', ')}`,
    `  gate: ${Object.entries(report.visuals.byGate).map(([key, value]) => `${key}=${value}`).join(', ')}`,
    '',
    'Per zone:',
  ];

  for (const [zoneId, zone] of Object.entries(report.zones)) {
    const counts = VERDICTS.map((verdict) => `${verdict}${zone.rows.counts[verdict]}`).join(' ');
    lines.push(
      `  ${zoneId}: ${counts}; frames ${zone.frames.evidenced}/${zone.frames.unique}` +
        (zone.frames.duplicateIdentityGroups
          ? ` (+${zone.frames.duplicateIdentityGroups} duplicate identity groups)`
          : ''),
    );
  }
  return `${lines.join('\n')}\n`;
}

export function runCli(argv = process.argv.slice(2), io = process) {
  const supported = new Set(['--json', '--help']);
  const unknown = argv.filter((argument) => !supported.has(argument));
  if (unknown.length) throw new Error(`[ui-v4-progress] unknown arguments: ${unknown.join(', ')}`);
  if (argv.includes('--help')) {
    io.stdout.write('Usage: node scripts/ui-v4-progress-report.mjs [--json]\n');
    return;
  }

  const report = buildUiV4ProgressReport(loadCanonicalProgressInputs());
  io.stdout.write(argv.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : formatUiV4ProgressReport(report));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
