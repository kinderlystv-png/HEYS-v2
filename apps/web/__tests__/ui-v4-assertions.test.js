import { describe, expect, it } from 'vitest';

import {
  assertAssertionVerdictGate,
  hashContractRow,
  inspectAssertionVerdictGate,
  parseContractAssertions,
  UI_V4_ASSERTION_PARSER_VERSION,
  validateContractAssertions,
} from '../../../scripts/lib/ui-v4-assertions.mjs';

describe('UI v4 typed assertions v2', () => {
  it('parses a safe multi-kind element row and preserves reversible source spans', () => {
    const row = {
      identity: 'Стык · Главная · 06',
      value: '«Эксперт» — шрифт 600 10px/1 Figtree, цвет var(--ink-2)',
      index: 47,
    };
    const parsed = parseContractAssertions(row);

    expect(parsed).toMatchObject({
      parserVersion: UI_V4_ASSERTION_PARSER_VERSION,
      identity: row.identity,
      value: row.value,
      index: 47,
      sourceHash: hashContractRow(row),
      parseStatus: 'parsed',
      unsupportedFragments: [],
    });
    expect(parsed.assertions).toEqual([
      expect.objectContaining({ kind: 'text', property: 'content', expected: 'Эксперт' }),
      expect.objectContaining({
        kind: 'typography',
        property: 'font',
        expected: {
          weight: 600,
          size: { value: 10, unit: 'px' },
          lineHeight: { value: 1, unit: 'number' },
          family: 'Figtree',
        },
      }),
      expect.objectContaining({
        kind: 'color',
        property: 'color',
        expected: { css: 'var(--ink-2)' },
      }),
    ]);
    for (const assertion of parsed.assertions) {
      expect(row.value.slice(assertion.sourceSpan.start, assertion.sourceSpan.end)).toBe(
        assertion.sourceSpan.text,
      );
    }
    expect(validateContractAssertions(parsed)).toEqual({ ok: true, problems: [] });
  });

  it('parses dimensions, padding and CSS tokens without inventing omitted units', () => {
    const parsed = parseContractAssertions({
      identity: 'frame · 01',
      value: 'поля 18px 18px 0, ширина 34%, высота 3px, радиус 999px, фон var(--acs)',
    });

    expect(parsed.parseStatus).toBe('parsed');
    expect(parsed.assertions.map(({ kind, property, expected }) => ({ kind, property, expected })))
      .toEqual([
        {
          kind: 'dimensions',
          property: 'padding',
          expected: {
            values: [
              { value: 18, unit: 'px' },
              { value: 18, unit: 'px' },
              { value: 0, unit: 'px' },
            ],
          },
        },
        {
          kind: 'dimensions',
          property: 'width',
          expected: { values: [{ value: 34, unit: '%' }] },
        },
        {
          kind: 'dimensions',
          property: 'height',
          expected: { values: [{ value: 3, unit: 'px' }] },
        },
        {
          kind: 'dimensions',
          property: 'border-radius',
          expected: { values: [{ value: 999, unit: 'px' }] },
        },
        { kind: 'color', property: 'background', expected: { css: 'var(--acs)' } },
      ]);

    const bareNumber = parseContractAssertions({ identity: 'radius', value: 'радиус 999' });
    expect(bareNumber).toMatchObject({
      parseStatus: 'parsed',
      assertions: [
        expect.objectContaining({
          kind: 'dimensions',
          property: 'border-radius',
          expected: { values: [{ value: 999, unit: 'px' }] },
        }),
      ],
    });
  });

  it('parses PICK layout/typography patterns merged from canvas razbor helpers', () => {
    const parsed = parseContractAssertions({
      identity: 'frame · 01',
      value: 'направление column, выключка center, регистр uppercase, трекинг -.02em, интерлиньяж 1.2, обрез hidden, позиция relative',
    });

    expect(parsed.parseStatus).toBe('parsed');
    expect(parsed.assertions.map(({ property, expected }) => ({ property, expected }))).toEqual(
      expect.arrayContaining([
        { property: 'flex-direction', expected: 'column' },
        { property: 'text-align', expected: 'center' },
        { property: 'text-transform', expected: 'uppercase' },
        { property: 'letter-spacing', expected: { value: -0.02, unit: 'em' } },
        { property: 'line-height', expected: { value: 1.2, unit: 'number' } },
        { property: 'overflow', expected: 'hidden' },
        { property: 'position', expected: 'relative' },
      ]),
    );
  });

  it('parses min sizes, slash padding, ink tone and role-token colors', () => {
    const parsed = parseContractAssertions({
      identity: 'frame · 02',
      value: 'поля 16/18/0 px, высота от 48px, ширина от 0, 12,5 px/600, тоном --ac, тоном чернил 62 %',
    });

    expect(parsed.parseStatus).toBe('parsed');
    expect(parsed.assertions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'dimensions',
        property: 'padding',
        expected: {
          values: [
            { value: 16, unit: 'px' },
            { value: 18, unit: 'px' },
            { value: 0, unit: 'px' },
          ],
        },
      }),
      expect.objectContaining({ property: 'min-height' }),
      expect.objectContaining({ property: 'min-width' }),
      expect.objectContaining({ property: 'font-size', expected: { value: 12.5, unit: 'px' } }),
      expect.objectContaining({ property: 'color', expected: { css: '--ac' } }),
      expect.objectContaining({ property: 'color', expected: { css: 'var(--ink-2)' } }),
    ]));
  });

  it('parses inset ring, margin auto and ui-role label prefixes', () => {
    const parsed = parseContractAssertions({
      identity: 'frame · 03',
      value: 'подвал: направление column, зазор 8px, рамка inset 0 0 0 2px var(--acs), отступ сверху auto, отступы 38px auto 0',
    });

    expect(parsed.parseStatus).toBe('parsed');
    expect(parsed.assertions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'semantic', property: 'ui-role', expected: 'подвал' }),
      expect.objectContaining({ property: 'box-shadow', expected: 'inset 0 0 0 2px var(--acs)' }),
      expect.objectContaining({
        property: 'margin-top',
        expected: { values: [{ value: 0, unit: 'auto' }] },
      }),
    ]));
  });

  it('parses SVG graphics rows from frame breakdown', () => {
    const parsed = parseContractAssertions({
      identity: 'draw · 01',
      value: 'поле рисунка 17×17 (viewBox 0 0 24 24), точка r 7 в (11,11), кривая, точки M9 6l6 6-6 6',
    });

    expect(parsed.parseStatus).toBe('parsed');
    expect(parsed.assertions).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: 'svg-viewport' }),
      expect.objectContaining({ property: 'svg-circle', expected: { r: 7, center: '11,11' } }),
      expect.objectContaining({ property: 'svg-path', expected: 'M9 6l6 6-6 6' }),
    ]));
  });

  it('parses layout, opacity and an explicit semantic role', () => {
    const parsed = parseContractAssertions({
      identity: 'loader',
      value: "выравнивание center, зазор 9px, прозрачность 0,28, role='status'",
    });

    expect(parsed.parseStatus).toBe('parsed');
    expect(parsed.assertions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'layout', property: 'align-items', expected: 'center' }),
      expect.objectContaining({ kind: 'dimensions', property: 'gap' }),
      expect.objectContaining({
        kind: 'color',
        property: 'opacity',
        expected: { value: 0.28, unit: 'number' },
      }),
      expect.objectContaining({ kind: 'semantic', property: 'role', expected: 'status' }),
    ]));
  });

  it('marks mixed prose partial and fully unknown prose unsupported', () => {
    const partial = parseContractAssertions({
      identity: 'mixed',
      value: 'ширина 44px, а дальше как в соседнем кадре',
    });
    expect(partial).toMatchObject({ parseStatus: 'partial' });
    expect(partial.assertions).toHaveLength(1);
    expect(partial.unsupportedFragments).toEqual([
      expect.objectContaining({ text: 'а дальше как в соседнем кадре' }),
    ]);

    const unsupported = parseContractAssertions({
      identity: 'semantic prose',
      value: 'двойное нажатие не создаёт новую запись',
    });
    expect(unsupported).toMatchObject({ parseStatus: 'unsupported', assertions: [] });
    expect(unsupported.unsupportedFragments).toEqual([
      expect.objectContaining({ text: 'двойное нажатие не создаёт новую запись' }),
    ]);
  });

  it('detects source drift and inconsistent claimed parse status', () => {
    const parsed = parseContractAssertions({ identity: 'size', value: 'ширина 44px' });
    parsed.value = 'ширина 45px';
    parsed.parseStatus = 'partial';

    expect(validateContractAssertions(parsed)).toEqual({
      ok: false,
      problems: expect.arrayContaining([
        expect.objectContaining({ kind: 'source-hash-drift' }),
        expect.objectContaining({ kind: 'source-span-drift' }),
        expect.objectContaining({ kind: 'inconsistent-partial-status' }),
      ]),
    });
  });

  it('fails closed when a caller drops a parsed assertion but keeps the source hash', () => {
    const parsed = parseContractAssertions({
      identity: 'size',
      value: 'ширина 44px, высота 48px',
    });
    parsed.assertions.pop();

    expect(validateContractAssertions(parsed).problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'uncovered-source' }),
    ]));
  });

  it("allows '=' only for fully parsed rows with matched evidence for every assertion", () => {
    const parsed = parseContractAssertions({
      identity: 'size',
      value: 'ширина 44px, высота 48px',
    });
    const evidence = parsed.assertions.map((assertion) => ({
      assertionId: assertion.id,
      status: 'matched',
      actual: assertion.expected,
    }));

    expect(inspectAssertionVerdictGate({ parsed, verdict: { v: '=' }, evidence })).toEqual({
      ok: true,
      problems: [],
    });
    expect(() => assertAssertionVerdictGate({
      parsed,
      verdict: { v: '=' },
      evidence: evidence.slice(0, 1),
    })).toThrow(/gate failed/);

    const partial = parseContractAssertions({
      identity: 'partial',
      value: 'ширина 44px и по смыслу как раньше',
    });
    expect(inspectAssertionVerdictGate({
      parsed: partial,
      verdict: { v: '=' },
      evidence: [{ assertionId: partial.assertions[0].id, status: 'matched' }],
    }).problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'equal-requires-fully-parsed-row' }),
    ]));
  });

  it("allows '≠' only with a mismatched assertion and a typed resolvable decision", () => {
    const parsed = parseContractAssertions({ identity: 'size', value: 'ширина 44px' });
    const mismatchEvidence = [{ assertionId: parsed.assertions[0].id, status: 'mismatched' }];
    const verdict = {
      v: '≠',
      reasonCode: 'platform',
      decisionRef: 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
    };

    expect(inspectAssertionVerdictGate({ parsed, verdict, evidence: mismatchEvidence })).toEqual({
      ok: true,
      problems: [],
    });
    expect(inspectAssertionVerdictGate({
      parsed,
      verdict: { v: '≠', reasonCode: 'invented', decisionRef: 'TBD' },
      evidence: [{ assertionId: parsed.assertions[0].id, status: 'matched' }],
    }).problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'mismatch-requires-mismatched-assertion' }),
      expect.objectContaining({ kind: 'invalid-reason-code' }),
      expect.objectContaining({ kind: 'invalid-decision-ref' }),
    ]));
  });

  it("allows '—' only with a closed naKind and keeps '?' as explicit debt", () => {
    const parsed = parseContractAssertions({ identity: 'size', value: 'ширина 44px' });
    expect(inspectAssertionVerdictGate({
      parsed,
      verdict: { v: '—', naKind: 'demo-only' },
    })).toEqual({ ok: true, problems: [] });
    expect(inspectAssertionVerdictGate({ parsed, verdict: { v: '—' } }).problems).toEqual([
      expect.objectContaining({ kind: 'invalid-na-kind' }),
    ]);
    expect(inspectAssertionVerdictGate({ parsed, verdict: { v: '?' } })).toEqual({
      ok: true,
      problems: [],
    });
  });
});
