import { describe, expect, it } from 'vitest';

import {
  ALLOWED_MISMATCH_REASON_CODES,
  ALLOWED_NA_KINDS,
  inspectVerdictSchema,
  legacyVerdictKeysDigest,
  readAllZones,
  resolveDecisionRef,
  VERDICT_SCHEMA_VERSION,
} from '../../../scripts/lib/ui-v4-verdicts.mjs';
import {
  classifyUnknownMismatchReason,
  findMissingCodeMarkedNotApplicable,
  findUnknownEvidenceMismatches,
  inspectVerdictSemantics,
} from '../../../scripts/ui-v4-check-verdict-semantics.mjs';

describe('UI v4 verdict semantics', () => {
  it.each([
    ['Полный контракт строки не подтверждён текущими source/tests.', 'not-confirmed'],
    ['Точное визуальное соответствие не проверено.', 'not-checked'],
    ['Точная геометрия canvas требует визуального pixel-review.', 'review-required'],
    ['Точное визуальное совпадение не заявляется.', 'match-not-claimed'],
    [
      'Canvas-кадр «История» не воспроизводится в runtime один-в-один.',
      'generic-frame-non-reproduction',
    ],
    [
      'FinishScreen реализует метрики, но точная композиция/типографика canvas-кадра не совпадает.',
      'unsubstantiated-visual-mismatch',
    ],
  ])('считает неизвестностью основание «%s»', (reason, kind) => {
    expect(classifyUnknownMismatchReason(reason)).toBe(kind);
  });

  it.each([
    'Тап скрывает действие локально, но maybeAckFullyHiddenEntries подтверждает запись на сервере; контракт требует никогда не подтверждать сервер с перехода.',
    'Отдельного сравнения назначенного плана с выполненным объёмом в runtime нет.',
    '.sb-round даёт зазор 7 px против 6 px кадра.',
    'Строка показывает статус «Не подтверждено» красным текстом.',
  ])('не путает конкретное расхождение с неизвестностью: %s', (reason) => {
    expect(classifyUnknownMismatchReason(reason)).toBeNull();
  });

  it('проверяет только ≠', () => {
    const data = {
      zones: {
        strength: {
          rows: {
            unknown: { v: '≠', f: 'Контракт не подтверждён текущими source/tests.' },
            honestDebt: { v: '?', f: 'Контракт не подтверждён текущими source/tests.' },
            mismatch: { v: '≠', f: 'В runtime нет отдельного сравнения.' },
          },
        },
      },
    };
    expect(findUnknownEvidenceMismatches(data)).toEqual([
      expect.objectContaining({ zoneId: 'strength', key: 'unknown', kind: 'not-confirmed' }),
    ]);
  });

  it('принимает только закрытые enum для типизированных ≠ и —', () => {
    expect(ALLOWED_MISMATCH_REASON_CODES).toEqual([
      'logic-invariant',
      'accessibility',
      'platform',
      'canvas-conflict',
      'owner-decision',
    ]);
    expect(ALLOWED_NA_KINDS).toEqual(['handoff', 'foreign-zone', 'demo-only', 'designer-removed']);

    const data = {
      zones: {
        typed: {
          verdictSchema: VERDICT_SCHEMA_VERSION,
          rows: {
            mismatch: {
              v: '≠',
              f: 'Canvas просит 10 px, platform требует минимум 12 px.',
              reasonCode: 'platform',
              decisionRef: 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
            },
            notApplicable: { v: '—', f: 'Строка относится к demo.', naKind: 'demo-only' },
          },
        },
      },
    };

    expect(inspectVerdictSchema(data).problems).toEqual([]);
  });

  it('decisionRef обязан разрешаться в существующую строку или heading repo-файла', () => {
    expect(resolveDecisionRef('docs/ui/UI_V4_HANDOFF_CODEX.md:1').ok).toBe(true);
    expect(resolveDecisionRef('docs/ui/UI_V4_HANDOFF_CODEX.md:999999')).toMatchObject({
      ok: false,
      kind: 'missing-line',
    });
    expect(
      resolveDecisionRef('docs/ui/UI_V4_HANDOFF_CODEX.md#несуществующий-раздел'),
    ).toMatchObject({
      ok: false,
      kind: 'missing-anchor',
    });
    expect(resolveDecisionRef('decision:42')).toMatchObject({ ok: false, kind: 'missing-target' });
    expect(resolveDecisionRef('../outside.md:1')).toMatchObject({
      ok: false,
      kind: 'missing-target',
    });
  });

  it('fail-closed отклоняет частичный ≠, placeholder-ссылку и неизвестные enum', () => {
    const data = {
      zones: {
        typed: {
          rows: {
            partial: { v: '≠', f: 'Есть отличие.', reasonCode: 'platform' },
            placeholder: {
              v: '≠',
              f: 'Есть отличие.',
              reasonCode: 'canvas-conflict',
              decisionRef: 'TBD',
            },
            inventedMismatch: {
              v: '≠',
              f: 'Есть отличие.',
              reasonCode: 'not-implemented',
              decisionRef: 'decision:42',
            },
            inventedNa: { v: '—', f: 'Кода нет.', naKind: 'missing-code' },
          },
        },
      },
    };

    expect(inspectVerdictSchema(data).problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'partial', kind: 'invalid-decision-ref' }),
        expect.objectContaining({ key: 'placeholder', kind: 'invalid-decision-ref' }),
        expect.objectContaining({ key: 'inventedMismatch', kind: 'invalid-reason-code' }),
        expect.objectContaining({ key: 'inventedNa', kind: 'invalid-na-kind' }),
      ]),
    );
  });

  it('не разрешает переносить typed-поля на другой символ вердикта', () => {
    const data = {
      zones: {
        typed: {
          rows: {
            equal: { v: '=', f: 'Совпало.', naKind: 'handoff' },
            unknown: { v: '?', f: 'Нужно проверить.', decisionRef: 'decision:42' },
            na: { v: '—', f: 'Не относится.', naKind: 'handoff', reasonCode: 'platform' },
            mismatch: {
              v: '≠',
              f: 'Отличается.',
              reasonCode: 'platform',
              decisionRef: 'decision:42',
              naKind: 'handoff',
            },
          },
        },
      },
    };

    expect(inspectVerdictSchema(data).problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'equal', kind: 'unexpected-schema-fields' }),
        expect.objectContaining({ key: 'unknown', kind: 'unexpected-schema-fields' }),
        expect.objectContaining({ key: 'na', kind: 'unexpected-mismatch-decision' }),
        expect.objectContaining({ key: 'mismatch', kind: 'unexpected-na-kind' }),
      ]),
    );
  });

  it('разрешает legacy только в пределах baseline и даёт новой зоне нулевой бюджет', () => {
    const data = {
      zones: {
        migrating: {
          rows: {
            oldMismatch: { v: '≠', f: 'Старое основание.' },
            oldNa: { v: '—', f: 'Старая классификация.' },
          },
        },
        newZone: { rows: { untyped: { v: '—', f: 'Нет классификации.' } } },
      },
    };
    const baseline = {
      migrating: {
        mismatch: [1, legacyVerdictKeysDigest(['oldMismatch'])],
        notApplicable: [1, legacyVerdictKeysDigest(['oldNa'])],
      },
    };
    const state = inspectVerdictSchema(data, { baseline });

    expect(state.legacyByZone.migrating).toEqual({ mismatch: 1, notApplicable: 1 });
    expect(state.problems).toEqual([
      expect.objectContaining({
        zoneId: 'newZone',
        kind: 'legacy-baseline-exceeded',
        category: 'notApplicable',
        actual: 1,
        allowed: 0,
      }),
    ]);
  });

  it('после закрытия зоны typed-v1 прежний baseline больше не действует', () => {
    const data = {
      zones: {
        closed: {
          verdictSchema: VERDICT_SCHEMA_VERSION,
          rows: { regressed: { v: '≠', f: 'Снова нет typed-полей.' } },
        },
      },
    };
    const baseline = {
      closed: {
        mismatch: [10, legacyVerdictKeysDigest(['irrelevant'])],
        notApplicable: [10, legacyVerdictKeysDigest(['irrelevant'])],
      },
    };

    expect(inspectVerdictSchema(data, { baseline }).problems).toEqual([
      expect.objectContaining({
        zoneId: 'closed',
        kind: 'legacy-baseline-exceeded',
        category: 'mismatch',
        actual: 1,
        allowed: 0,
      }),
    ]);
  });

  it('не пропускает подмену legacy-ключа при прежнем количестве строк', () => {
    const data = {
      zones: {
        migrating: { rows: { replacement: { v: '—', f: 'Новая нетипизированная строка.' } } },
      },
    };
    const baseline = {
      migrating: {
        mismatch: [0, legacyVerdictKeysDigest([])],
        notApplicable: [1, legacyVerdictKeysDigest(['original'])],
      },
    };

    expect(inspectVerdictSchema(data, { baseline }).problems).toEqual([
      expect.objectContaining({
        zoneId: 'migrating',
        kind: 'legacy-baseline-keys-changed',
        category: 'notApplicable',
      }),
    ]);
  });

  it('требует уменьшить baseline вместе с типизацией legacy-строки', () => {
    const data = { zones: { migrating: { rows: {} } } };
    const baseline = {
      migrating: {
        mismatch: [1, legacyVerdictKeysDigest(['fixed'])],
        notApplicable: [0, legacyVerdictKeysDigest([])],
      },
    };

    expect(inspectVerdictSchema(data, { baseline }).problems).toEqual([
      expect.objectContaining({
        zoneId: 'migrating',
        kind: 'legacy-baseline-must-decrease',
        category: 'mismatch',
      }),
    ]);
  });

  it('отклоняет неизвестную версию схемы', () => {
    const data = { zones: { zone: { verdictSchema: 'typed-v2', rows: {} } } };
    expect(inspectVerdictSchema(data).problems).toEqual([
      expect.objectContaining({ zoneId: 'zone', kind: 'invalid-schema-version' }),
    ]);
  });

  it('не даёт объявить отсутствующий обязательный код как —', () => {
    const data = {
      zones: {
        zone: {
          rows: {
            absent: {
              v: '—',
              f: 'Обязательный экран в runtime не реализован.',
              naKind: 'handoff',
            },
            elsewhere: {
              v: '—',
              f: 'В этой зоне экрана нет: он проверяется в registration.',
              naKind: 'foreign-zone',
            },
          },
        },
      },
    };

    expect(findMissingCodeMarkedNotApplicable(data)).toEqual([
      expect.objectContaining({ key: 'absent', kind: 'required-code-marked-not-applicable' }),
    ]);
  });

  it('текущий repository snapshot укладывается в миграционный baseline', () => {
    const state = inspectVerdictSemantics(readAllZones());
    expect(state.schemaProblems).toEqual([]);
  });
});
