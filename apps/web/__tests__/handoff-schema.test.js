/**
 * Verdict handoff schema validation (Task 76).
 */
import { describe, expect, it } from 'vitest';

import {
  HandoffValidationError,
  normalizeHandoffRow,
  pickContractKey,
  pickFact,
  pickVerdict,
  validateHandoff,
} from '../../../scripts/lib/handoff-schema.mjs';

describe('handoff schema', () => {
  const minimalValid = {
    zoneId: 'strength-builder',
    rows: [{
      contractKey: 'тест · 01',
      verdict: '=',
      fact: 'apps/web/foo.js:1',
    }],
  };

  it('accepts canonical shape', () => {
    const out = validateHandoff(minimalValid);
    expect(out.zoneId).toBe('strength-builder');
    expect(out.rows[0]).toMatchObject({
      contractKey: 'тест · 01',
      verdict: '=',
      fact: 'apps/web/foo.js:1',
    });
  });

  it('normalizes legacy aliases', () => {
    const out = validateHandoff({
      zone: 'checkin-morning',
      rows: [{
        contractLine: 'Чек-ин · 01',
        recommend: '?',
        fDraft: 'draft fact',
      }],
    });
    expect(out.zoneId).toBe('checkin-morning');
    expect(out.rows[0].contractKey).toBe('Чек-ин · 01');
    expect(out.rows[0].verdict).toBe('?');
    expect(out.rows[0].fact).toBe('draft fact');
  });

  it('uses --zone override when top-level zone missing', () => {
    const out = validateHandoff({ rows: [{ key: 'k', verdict: '=', fact: 'f' }] }, { zoneId: 'water-add' });
    expect(out.zoneId).toBe('water-add');
  });

  it('fails on missing contract key', () => {
    expect(() => validateHandoff({
      zoneId: 'strength-builder',
      rows: [{ verdict: '=', fact: 'x' }],
    })).toThrow(HandoffValidationError);
    try {
      validateHandoff({ zoneId: 'z', rows: [{ verdict: '=', fact: 'x' }] });
    } catch (err) {
      expect(err.code).toBe('missing-contract-key');
    }
  });

  it('fails on missing verdict in rows section', () => {
    expect(() => validateHandoff({
      zoneId: 'strength-builder',
      rows: [{ contractKey: 'k', fact: 'f' }],
    })).toThrow(/missing verdict/);
  });

  it('fails on missing fact in rows section', () => {
    expect(() => validateHandoff({
      zoneId: 'strength-builder',
      rows: [{ contractKey: 'k', verdict: '=' }],
    })).toThrow(/missing fact/);
  });

  it('fails on missing zoneId', () => {
    expect(() => validateHandoff({
      rows: [{ contractKey: 'k', verdict: '=', fact: 'f' }],
    })).toThrow(/missing zoneId/);
  });

  it('fails on empty handoff (no row sections)', () => {
    expect(() => validateHandoff({ zoneId: 'z', summary: {} })).toThrow(/no apply rows/);
  });

  it('allows optional fact in outOfScopeCssRows', () => {
    const out = validateHandoff({
      zoneId: 'strength-builder',
      outOfScopeCssRows: [{ contractKey: 'кадр · 01' }],
    });
    expect(out.outOfScopeCssRows[0].contractKey).toBe('кадр · 01');
    expect(out.outOfScopeCssRows[0].fact).toBeUndefined();
  });

  it('requires fact in outOfScopeRuntimeRows', () => {
    expect(() => validateHandoff({
      zoneId: 'strength-builder',
      outOfScopeRuntimeRows: [{ contractKey: 'k', verdict: '?' }],
    })).toThrow(/missing fact/);
  });

  it('pick* helpers resolve aliases', () => {
    const row = { key: 'a', recommend: '≠', f: 'fact' };
    expect(pickContractKey(row)).toBe('a');
    expect(pickVerdict(row)).toBe('≠');
    expect(pickFact(row)).toBe('fact');
  });

  it('normalizeHandoffRow throws with path', () => {
    try {
      normalizeHandoffRow({}, 'rows', 2, { filePath: 'test.json' });
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HandoffValidationError);
      expect(err.path).toContain('test.json: rows[2]');
    }
  });
});
