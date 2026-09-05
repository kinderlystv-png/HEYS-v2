import { describe, expect, it } from 'vitest';

import { parseContractAssertions } from '../../../scripts/lib/ui-v4-assertions.mjs';
import {
  buildEvidence,
  describeElement,
  describeReads,
  matchRowAgainstScreen,
} from '../../../scripts/lib/ui-v4-dom-measure.mjs';
import { evaluateDomEvidence } from '../../../scripts/lib/ui-v4-dom-evidence.mjs';
import {
  buildRowReport,
  frameLabelFromIdentity,
  groupRowsForMeasurement,
  summarizeReportRows,
} from '../../../scripts/ui-v4-measure-zone.mjs';

describe('UI v4 DOM measure chain', () => {
  it('chains parse → describeReads → screen evidence → matchRowAgainstScreen → evaluateDomEvidence', () => {
    const parsed = parseContractAssertions({
      identity: 'Клавиатура · 01',
      value: 'высота 42px, радиус 14px, фон #f7efe2',
    });
    const plan = describeReads([parsed]);

    expect(plan.styleProps).toEqual(expect.arrayContaining(['height', 'borderRadius', 'backgroundColor']));
    expect(plan.needText).toBe(false);

    const element = {
      tag: 'button',
      cls: 'heys-key',
      rect: { w: 42, h: 42 },
      style: {
        height: '42px',
        borderRadius: '14px',
        backgroundColor: 'rgb(247, 239, 226)',
      },
      tokens: {},
    };
    const selector = describeElement(element, 0);
    const evidence = buildEvidence({ parsed, selector, element });
    const evaluate = ({ parsed: parsedDoc, evidence: evidenceRows }) =>
      evaluateDomEvidence({ parsed: parsedDoc, evidence: evidenceRows });
    const match = matchRowAgainstScreen({ parsed, elements: [element], evaluate });

    expect(match.strength).toBe(3);
    expect(match.status).toBe('matched');
    expect(match.hits).toBe(1);
    expect(evidence).toHaveLength(3);
  });

  it('reports strength 1 as matched but non-promotable in row report', () => {
    const parsed = parseContractAssertions({
      identity: 'Отступ · 01',
      value: 'отступ сверху 14px',
    });
    const element = {
      tag: 'div',
      cls: 'pad',
      rect: { w: 100, h: 20 },
      style: { marginTop: '14px' },
      tokens: {},
    };
    const evaluate = ({ parsed: parsedDoc, evidence }) =>
      evaluateDomEvidence({ parsed: parsedDoc, evidence });
    const match = matchRowAgainstScreen({ parsed, elements: [element], evaluate });
    const report = buildRowReport({ parsed, matchResult: match, existingVerdict: { v: '=' } });

    expect(match.strength).toBe(1);
    expect(match.status).toBe('matched');
    expect(report.proposal).toBeNull();
    expect(report.excludedStrength1).toBe(true);
  });

  it('groups only strength≥2 rows with visual cases and counts skips', () => {
    const caseByLabel = new Map([
      ['Кадр A', { id: 'case-a', zone: 'demo', canvasFrame: { label: 'Кадр A' }, status: 'automated' }],
    ]);
    const contractRows = [
      { identity: 'Кадр A · 01', value: 'высота 42px, ширина 42px' },
      { identity: 'Кадр A · 02', value: 'отступ сверху 14px' },
      { identity: 'Кадр B · 01', value: 'высота 42px, ширина 42px' },
    ];
    const { groups, skipped } = groupRowsForMeasurement({
      contractRows,
      verdictRows: {
        'Кадр A · 01': { v: '=' },
        'Кадр A · 02': { v: '=' },
        'Кадр B · 01': { v: '=' },
      },
      caseByLabel,
    });

    expect(groups.size).toBe(1);
    expect(groups.get('case-a').rows).toHaveLength(2);
    expect(skipped.unmappedNoVisualCase).toBe(1);
    expect(frameLabelFromIdentity('Кадр A · 01')).toBe('Кадр A');
  });

  it('summarizes confirmsExistingEq separately from proposals', () => {
    const rows = [
      {
        existingVerdict: '=',
        confirmsExistingEq: true,
        mismatchesExistingEq: false,
        proposal: '=',
        status: 'matched',
        excludedStrength1: false,
      },
      {
        existingVerdict: '=',
        confirmsExistingEq: false,
        mismatchesExistingEq: true,
        proposal: '≠',
        status: 'mismatched',
        excludedStrength1: false,
      },
      {
        existingVerdict: '=',
        confirmsExistingEq: false,
        mismatchesExistingEq: false,
        proposal: null,
        status: 'matched',
        excludedStrength1: true,
      },
    ];
    const summary = summarizeReportRows(
      rows,
      { unmappedNoVisualCase: 0, unsupportedParse: 0, filteredNonEq: 0 },
      'demo',
      null,
    );

    expect(summary.confirmsExistingEq).toBe(1);
    expect(summary.mismatchesExistingEq).toBe(1);
    expect(summary.proposals).toBe(2);
    expect(summary.existingEqMeasured).toBe(3);
  });
});
