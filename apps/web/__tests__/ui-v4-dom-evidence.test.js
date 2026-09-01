import { describe, expect, it } from 'vitest';

import { parseContractAssertions } from '../../../scripts/lib/ui-v4-assertions.mjs';
import {
  evaluateDomEvidence,
  inspectDomEvidenceVerdictGate,
} from '../../../scripts/lib/ui-v4-dom-evidence.mjs';

function spec(parsed, assertion, actual, overrides = {}) {
  return {
    assertionId: assertion.id,
    sourceHash: parsed.sourceHash,
    selector: `[data-test="${assertion.id}"]`,
    source: 'runtime',
    property: assertion.property,
    actual,
    ...overrides,
  };
}

describe('UI v4 DOM evidence engine', () => {
  it('matches dimensions with decimal comma, zero units and equivalent box shorthand', () => {
    const parsed = parseContractAssertions({
      identity: 'box',
      value: 'поля 10,5px 13px 0, ширина 44%',
    });
    const [padding, width] = parsed.assertions;
    const result = evaluateDomEvidence({
      parsed,
      evidence: [
        spec(parsed, padding, { computedStyle: { padding: '10.5px 13px 0px 13px' } }),
        spec(parsed, width, { computedStyle: { width: '44%' } }),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.evidence.map(({ status }) => status)).toEqual(['matched', 'matched']);
  });

  it('keeps percentage versus resolved pixels inconclusive without an explicit basis', () => {
    const parsed = parseContractAssertions({ identity: 'bar', value: 'ширина 34%' });
    const result = evaluateDomEvidence({
      parsed,
      evidence: [spec(parsed, parsed.assertions[0], { geometry: { width: 127.5 } })],
    });

    expect(result.evidence[0]).toMatchObject({
      status: 'inconclusive',
      reason: 'unsupported-or-incomparable-actual',
    });
  });

  it('matches font shorthand/family and converts a unitless line-height to computed pixels', () => {
    const parsed = parseContractAssertions({
      identity: 'caption',
      value: 'шрифт 600 10px/1 Figtree',
    });
    const result = evaluateDomEvidence({
      parsed,
      evidence: [spec(parsed, parsed.assertions[0], {
        computedStyle: {
          fontWeight: '600',
          fontSize: '10px',
          lineHeight: '10px',
          fontFamily: '"Figtree", sans-serif',
        },
      })],
    });
    const shorthand = evaluateDomEvidence({
      parsed,
      evidence: [spec(parsed, parsed.assertions[0], '600 10px/10px "Figtree", sans-serif')],
    });

    expect(result.evidence[0]).toMatchObject({ status: 'matched' });
    expect(shorthand.evidence[0]).toMatchObject({ status: 'matched' });
  });

  it('normalizes CSS tokens, rgba values and resolved computed colors', () => {
    const token = parseContractAssertions({ identity: 'token', value: 'фон var(--acs)' });
    const literal = parseContractAssertions({ identity: 'literal', value: 'цвет #ff000080' });
    const tokenResult = evaluateDomEvidence({
      parsed: token,
      evidence: [spec(token, token.assertions[0], {
        declared: 'var( --acs )',
        resolved: 'rgb(12 34 56)',
      })],
    });
    const literalResult = evaluateDomEvidence({
      parsed: literal,
      evidence: [spec(literal, literal.assertions[0], {
        declared: 'rgba(255, 0, 0, 0.5019607843)',
        resolved: 'rgba(255, 0, 0, 0.5019607843)',
      })],
    });

    expect(tokenResult.evidence[0].status).toBe('matched');
    expect(literalResult.evidence[0].status).toBe('matched');
  });

  it('normalizes Unicode whitespace without reordering visible text', () => {
    const parsed = parseContractAssertions({ identity: 'copy', value: '«Привет мир» —' });
    const assertion = parsed.assertions[0];
    const matched = evaluateDomEvidence({
      parsed,
      evidence: [spec(parsed, assertion, { text: 'Привет\u00a0\nмир' })],
    });
    const reordered = evaluateDomEvidence({
      parsed,
      evidence: [spec(parsed, assertion, { text: 'мир Привет' })],
    });

    expect(matched.evidence[0].status).toBe('matched');
    expect(reordered.evidence[0].status).toBe('mismatched');
  });

  it('matches explicit semantic evidence and reports an actual semantic mismatch', () => {
    const parsed = parseContractAssertions({ identity: 'loader', value: "role='status'" });
    const assertion = parsed.assertions[0];
    expect(evaluateDomEvidence({
      parsed,
      evidence: [spec(parsed, assertion, { semantic: { role: 'status' } }, { source: 'canvas' })],
    }).evidence[0].status).toBe('matched');
    expect(evaluateDomEvidence({
      parsed,
      evidence: [spec(parsed, assertion, { semantic: { role: 'alert' } })],
    }).evidence[0].status).toBe('mismatched');
  });

  it('fails closed on missing, duplicate and stale evidence identity', () => {
    const parsed = parseContractAssertions({
      identity: 'size',
      value: 'ширина 44px, высота 48px',
    });
    const [width] = parsed.assertions;
    const duplicate = spec(parsed, width, { computedStyle: { width: '44px' } });
    const result = evaluateDomEvidence({
      parsed,
      evidence: [duplicate, { ...duplicate }, spec(parsed, parsed.assertions[1], {
        computedStyle: { height: '48px' },
      }, { sourceHash: 'stale' })],
    });

    expect(result.ok).toBe(false);
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ assertionId: width.id, status: 'inconclusive', reason: 'duplicate-evidence' }),
      expect.objectContaining({ status: 'inconclusive', reason: 'stale-source-hash' }),
    ]));
    expect(result.problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'duplicate-evidence' }),
      expect.objectContaining({ kind: 'stale-source-hash' }),
    ]));

    const missing = evaluateDomEvidence({ parsed, evidence: [] });
    expect(missing.evidence.every((item) => item.status === 'inconclusive')).toBe(true);
  });

  it("cannot authorize '=' for partial, inconclusive or mismatched evidence", () => {
    const parsed = parseContractAssertions({ identity: 'size', value: 'ширина 44px' });
    const assertion = parsed.assertions[0];
    const inconclusive = inspectDomEvidenceVerdictGate({
      parsed,
      verdict: { v: '=' },
      evidence: [spec(parsed, assertion, { computedStyle: { width: '44px' } }, { selector: '' })],
    });
    const mismatched = inspectDomEvidenceVerdictGate({
      parsed,
      verdict: { v: '=' },
      evidence: [spec(parsed, assertion, { computedStyle: { width: '45px' } })],
    });
    const partial = parseContractAssertions({
      identity: 'partial',
      value: 'ширина 44px и дальше как раньше',
    });
    const partialGate = inspectDomEvidenceVerdictGate({
      parsed: partial,
      verdict: { v: '=' },
      evidence: [spec(partial, partial.assertions[0], { computedStyle: { width: '44px' } })],
    });

    expect(inconclusive.ok).toBe(false);
    expect(inconclusive.problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'equal-requires-conclusive-evidence' }),
      expect.objectContaining({ kind: 'missing-matched-evidence' }),
    ]));
    expect(mismatched.ok).toBe(false);
    expect(mismatched.problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'missing-matched-evidence' }),
    ]));
    expect(partialGate.ok).toBe(false);
    expect(partialGate.problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'equal-requires-fully-parsed-row' }),
    ]));
  });
});
