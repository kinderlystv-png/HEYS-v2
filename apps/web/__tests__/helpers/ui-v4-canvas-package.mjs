import {
  buildReverseCoverageReport,
  readCanvasPackage,
} from '../../../../scripts/lib/ui-v4-canvas-index.mjs';

export function summarizeCanvasPackageTotals(canvases) {
  const report = buildReverseCoverageReport(canvases, {});
  return report.totals;
}

export function expectedCanvasZoneIds(canvases = readCanvasPackage()) {
  return canvases.map((canvas) => canvas.zoneId).sort((left, right) => left.localeCompare(right, 'en'));
}

export function totalContractRows(canvases) {
  return canvases.reduce((sum, canvas) => sum + canvas.contractRows.length, 0);
}

/** Parses `node scripts/ui-v4-check-contract-drift.mjs --list` stdout. */
export function parseContractDriftList(stdout) {
  const zones = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+строк\s+(\d+)\s+вердикты/);
    if (!match) continue;
    zones.push({ zoneId: match[1], rows: Number(match[2]) });
  }
  return zones;
}
