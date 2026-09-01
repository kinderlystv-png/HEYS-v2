import { describe, expect, it } from 'vitest';

import {
  applyVerdictToRow,
  parseVerdictArgs,
} from '../../../scripts/ui-v4-set-verdict.mjs';

describe('UI v4 verdict setter typed-v1', () => {
  it('записывает доказуемое ≠ и удаляет чужие typed-поля', () => {
    const row = { v: '?', f: 'Не проверено.', naKind: 'handoff', h: 'hash' };
    applyVerdictToRow(row, {
      verdict: '≠',
      fact: 'Платформа требует минимальную цель 44 px.',
      options: {
        'reason-code': 'platform',
        'decision-ref': 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
      },
    });
    expect(row).toEqual({
      v: '≠',
      f: 'Платформа требует минимальную цель 44 px.',
      h: 'hash',
      reasonCode: 'platform',
      decisionRef: 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
    });
  });

  it('не меняет строку при неполном ≠', () => {
    const row = { v: '?', f: 'Нужно проверить.', h: 'hash' };
    expect(() => applyVerdictToRow(row, {
      verdict: '≠',
      fact: 'Есть отличие.',
      options: { 'reason-code': 'platform' },
    })).toThrow(/decision-ref/);
    expect(row).toEqual({ v: '?', f: 'Нужно проверить.', h: 'hash' });
  });

  it('требует naKind для — и очищает его при переходе в =', () => {
    const row = { v: '?', f: 'Нужно проверить.', h: 'hash' };
    applyVerdictToRow(row, {
      verdict: '—',
      fact: 'Демонстрационная подпись, не продуктовый контракт.',
      options: { 'na-kind': 'demo-only' },
    });
    expect(row.naKind).toBe('demo-only');

    applyVerdictToRow(row, { verdict: '=', fact: 'Совпало с DOM.', options: {} });
    expect(row).toEqual({ v: '=', f: 'Совпало с DOM.', h: 'hash' });
  });

  it('разбирает positional fact и typed flags независимо от порядка', () => {
    expect(parseVerdictArgs([
      'zone', 'key', '≠', 'Конкретный', 'факт',
      '--decision-ref', 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
      '--reason-code', 'logic-invariant',
    ])).toEqual({
      zone: 'zone',
      key: 'key',
      verdict: '≠',
      fact: 'Конкретный факт',
      options: {
        'decision-ref': 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
        'reason-code': 'logic-invariant',
      },
    });
  });
});
