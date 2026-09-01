import { describe, expect, it } from 'vitest';

import {
  buildUiV4ProgressReport,
  formatUiV4ProgressReport,
  loadCanonicalProgressInputs,
} from '../../../scripts/ui-v4-progress-report.mjs';

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
        contractRows: ['one', 'two', 'three', 'four'].map((identity) => ({ identity })),
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

describe('UI v4 progress report', () => {
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

  it('loads the current canonical package without silently changing the denominator', () => {
    const report = buildUiV4ProgressReport(loadCanonicalProgressInputs());

    expect(report.verdicts.total).toBeGreaterThan(15_000);
    expect(report.frames.productOccurrences).toBeGreaterThan(report.frames.uniqueProductFrames);
    expect(report.visuals.zonesCovered).toBe(report.visuals.canvasZones);
    expect(Object.keys(report.zones)).toHaveLength(report.visuals.canvasZones);
  });
});
