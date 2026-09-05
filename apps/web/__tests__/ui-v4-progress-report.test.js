import { describe, expect, it } from 'vitest';

import { readCanvasPackage } from '../../../scripts/lib/ui-v4-canvas-index.mjs';
import {
  buildUiV4ProgressReport,
  formatUiV4ProgressReport,
} from '../../../scripts/ui-v4-progress-report.mjs';
import { UI_V4_VISUAL_CASES } from '../scripts/ui-v4-visual-fixture.mjs';
import { readCommittedVerdictZones } from './helpers/committed-verdict-zones.mjs';
import {
  expectedCanvasZoneIds,
  totalContractRows,
} from './helpers/ui-v4-canvas-package.mjs';

function fixture(overrides = {}) {
  return {
    verdicts: {
      zones: {
        alpha: {
          canvas: 'alpha.v4.dc.html',
          rows: {
            one: { v: '=' },
            two: { v: '≠' },
            three: { v: '?' },
            four: { v: '—' },
          },
          frames: {
            Screen: { evidence: ['source:test'] },
          },
        },
      },
    },
    canvases: [
      {
        zoneId: 'alpha',
        file: 'alpha.v4.dc.html',
        contractRows: [
          { identity: 'one', value: 'ширина 44px' },
          { identity: 'two', value: 'высота 48px и как раньше' },
          { identity: 'three', value: 'двойное нажатие не создаёт запись' },
          { identity: 'four', value: '«Готово»' },
        ],
        productFrames: [{ identity: 'Screen' }, { identity: 'Screen' }],
        malformedContractRows: [],
      },
    ],
    visualCases: [
      {
        id: 'alpha-auto',
        zone: 'alpha',
        status: 'automated',
        gate: 'diagnostic',
        canvasFrame: { file: 'alpha.v4.dc.html', label: 'Screen', oid: 'A1', palette: 'sand' },
      },
      { id: 'alpha-pending', zone: 'alpha', status: 'scenario-pending', gate: 'pixel-pending' },
    ],
    ...overrides,
  };
}

// Разбор канваса читает весь пакет контракта, и в одиночку набор идёт
// около 4-5 секунд — впритык к лимиту vitest по умолчанию (5 с). В общем
// прогоне он его перешагивал и падал по времени, а не по расхождению.
describe('UI v4 progress report', { timeout: 45_000 }, () => {
  it('deterministically aggregates verdict, frame and visual readiness metrics', () => {
    const report = buildUiV4ProgressReport(fixture());

    expect(report.verdicts).toEqual({
      total: 4,
      counts: { '=': 1, '≠': 1, '?': 1, '—': 1 },
      percentages: { '=': 25, '≠': 25, '?': 25, '—': 25 },
    });
    expect(report.frames).toMatchObject({
      productOccurrences: 2,
      uniqueProductFrames: 1,
      evidenced: 1,
      duplicateIdentityGroups: 1,
      duplicateOccurrences: 1,
      evidencePercent: 100,
    });
    expect(report.assertions).toEqual({
      rows: 4,
      parsed: 2,
      partial: 1,
      unsupported: 1,
      assertions: 3,
      fullyParsedPercent: 50,
      debt: {
        rows: 1,
        parsed: 0,
        partial: 0,
        unsupported: 1,
        assertions: 0,
        fullyParsedPercent: 0,
      },
    });
    expect(report.visuals).toEqual({
      cases: 2,
      zonesCovered: 1,
      canvasZones: 1,
      canonicalMapped: 1,
      byStatus: { automated: 1, 'scenario-pending': 1 },
      byGate: { diagnostic: 1, 'pixel-pending': 1 },
    });
    expect(formatUiV4ProgressReport(report)).toContain(
      'alpha: =1 ≠1 ?1 —1; frames 1/1 (+1 duplicate identity groups)',
    );
  });

  it.each([
    ['invalid verdict', (data) => { data.verdicts.zones.alpha.rows.one.v = '!'; }, /invalid verdict/],
    ['missing Canvas row', (data) => { delete data.verdicts.zones.alpha.rows.one; }, /missing 1 contract rows/],
    ['malformed Canvas row', (data) => { data.canvases[0].malformedContractRows.push({ index: 0 }); }, /malformed contract rows/],
    ['invalid frame evidence', (data) => { data.verdicts.zones.alpha.frames.Screen.evidence = [42]; }, /only strings/],
    ['duplicate visual id', (data) => { data.visualCases[1].id = data.visualCases[0].id; }, /duplicate visual case id/],
  ])('fails closed on %s', (_label, mutate, expected) => {
    const data = fixture();
    mutate(data);
    expect(() => buildUiV4ProgressReport(data)).toThrow(expected);
  });

  it('loads the current canonical package without silently changing the denominator', { timeout: 90_000 }, () => {
    // Canvas package is the contract denominator; verdict rows come from git HEAD so
    // local WIP under docs/ui/verdicts cannot fake a closed debt gap.
    const canvases = readCanvasPackage();
    const inputs = {
      verdicts: readCommittedVerdictZones(),
      canvases,
      visualCases: UI_V4_VISUAL_CASES,
    };
    const zoneIds = expectedCanvasZoneIds(canvases);

    expect(Object.keys(inputs.verdicts.zones).sort()).toEqual(zoneIds);
    expect(canvases.length).toBe(zoneIds.length);
    expect(new Set(inputs.visualCases.map((item) => item.zone)).size)
      .toBeLessThanOrEqual(canvases.length);

    const canvasRows = totalContractRows(canvases);
    let verdictRows = 0;
    let missingContractRows = 0;
    let extraVerdictRows = 0;
    for (const canvas of canvases) {
      const zone = inputs.verdicts.zones[canvas.zoneId];
      const canvasKeys = new Set(canvas.contractRows.map((row) => row.identity));
      const verdictKeys = Object.keys(zone.rows);
      missingContractRows += canvas.contractRows.filter((row) => !zone.rows[row.identity]).length;
      extraVerdictRows += verdictKeys.filter((key) => !canvasKeys.has(key)).length;
      verdictRows += verdictKeys.length;
    }
    const coveredVerdictRows = verdictRows - extraVerdictRows;
    expect(missingContractRows - extraVerdictRows).toBe(canvasRows - verdictRows);
    expect(verdictRows).toBeGreaterThan(0);
    expect(coveredVerdictRows).toBeLessThanOrEqual(canvasRows);
    expect(coveredVerdictRows).toBe(canvasRows - missingContractRows);

    const report = buildUiV4ProgressReport(inputs);
    expect(report.verdicts.total).toBe(coveredVerdictRows);
    expect(report.assertions.rows).toBe(canvasRows);
  });
});
