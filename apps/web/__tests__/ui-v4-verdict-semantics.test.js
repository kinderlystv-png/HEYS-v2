import { describe, expect, it } from 'vitest';

import {
  ALLOWED_MISMATCH_REASON_CODES,
  ALLOWED_NA_KINDS,
  classifyMismatchVerdictRow,
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

/** invariant: legacy/typed «≠» и legacy «—» считаются из rows, не литералом. */
function countLegacyVerdictRows(rows) {
  const list = Object.values(rows);
  return {
    neqInFile: list.filter((row) => row.v === '≠').length,
    legacyNaInFile: list.filter(
      (row) => row.v === '—' && !Object.prototype.hasOwnProperty.call(row, 'naKind'),
    ).length,
  };
}

function expectLegacyCountsMatchRows(counted, rows, { requireNeq = true } = {}) {
  const { neqInFile, legacyNaInFile } = countLegacyVerdictRows(rows);
  expect(counted.mismatch + counted.typedMismatch).toBe(neqInFile);
  expect(counted.notApplicable).toBe(legacyNaInFile);
  if (requireNeq) expect(neqInFile).toBeGreaterThan(0);
}

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
    [
      'Нужна построчная visual/runtime-сверка: прежнее основание описывало непроверенное совпадение кадра.',
      'needs-line-by-line-review',
    ],
    [
      'Прежнее основание описывало непроверенное совпадение кадра, а не отличие этой строки.',
      'prior-basis-unverified-match',
    ],
    [
      'Прежнее основание описывало совпадение кадра, а не отличие этой строки.',
      'basis-described-match',
    ],
    [
      'Нужна построчная сверка по source/tests: прежнее основание прямо сообщало, что полный контракт строки не подтверждён.',
      'needs-source-review',
    ],
    [
      'Возвращено в вопрос до замера.',
      'returned-pending-measurement',
    ],
  ])('считает неизвестностью основание «%s»', (reason, kind) => {
    expect(classifyUnknownMismatchReason(reason)).toBe(kind);
  });

  it.each([
    [
      'Точное визуальное соответствие не проверено построчно в runtime.',
      'not-checked',
      'not-checked',
    ],
    [
      'Предстоит проверить точное соответствие кадру.',
      'pending-verification',
      null,
    ],
  ])('pending-паттерн «%s»', (reason, kindWithPending, kindWithoutPending) => {
    expect(classifyUnknownMismatchReason(reason, { includePending: true })).toBe(kindWithPending);
    expect(classifyUnknownMismatchReason(reason)).toBe(kindWithoutPending);
  });

  it('не путает подтверждённую сверку с долгом проверки', () => {
    expect(
      classifyUnknownMismatchReason('Сверено гейтом: совпадает с кадром на 375 px.', {
        includePending: true,
      }),
    ).toBeNull();
    expect(
      classifyUnknownMismatchReason('Проверено замером на стенде, совпадает с контрактом.', {
        includePending: true,
      }),
    ).toBeNull();
  });

  it('не ловит «построчно не сводится» как долг сверки', () => {
    expect(
      classifyUnknownMismatchReason(
        'Знак HEYS: логотип бренда вставляется готовым файлом, построчно не сводится.',
        { includePending: true },
      ),
    ).toBeNull();
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
        expect.objectContaining({ key: 'inventedMismatch', kind: 'invalid-decision-ref' }),
        expect.objectContaining({ key: 'inventedNa', kind: 'invalid-na-kind' }),
        expect.objectContaining({
          zoneId: 'typed',
          kind: 'legacy-baseline-exceeded',
          category: 'typedMismatch',
        }),
      ]),
    );
  });

  it('fail-closed отклоняет неизвестную форму «≠» с лишними ключами', () => {
    const data = {
      zones: {
        typed: {
          rows: {
            alien: {
              v: '≠',
              f: 'Есть отличие.',
              reasonCode: 'platform',
              decisionRef: 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
              surprise: true,
            },
          },
        },
      },
    };

    expect(inspectVerdictSchema(data).problems).toEqual([
      expect.objectContaining({
        key: 'alien',
        kind: 'unknown-mismatch-form',
        form: 'typed-v1-extra-keys',
        extraKeys: ['surprise'],
      }),
    ]);
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
        expect.objectContaining({
          key: 'mismatch',
          kind: 'unknown-mismatch-form',
          form: 'neq-with-naKind',
        }),
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

    // invariant: счётчик legacy сходится с fixture rows, не с зашитыми 1/0/1.
    expectLegacyCountsMatchRows(state.legacyByZone.migrating, data.zones.migrating.rows, {
      requireNeq: false,
    });
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

  it('home-widgets считает все «≠»: legacy + typed сходится с файлом зоны', () => {
    const zones = readAllZones();
    const state = inspectVerdictSemantics(zones, new Set(['home-widgets']));
    expect(state.schemaProblems).toEqual([]);

    // Прежняя редакция сторожила три литерала (72 + 10 + 1356) и падала на
    // починке: закрытие одной строки зоны делало красным того, кто чинил.
    // Сторожим то, ради чего проверка заведена, — что счётчик не теряет «≠»:
    // legacy и typed вместе дают ровно столько, сколько их в файле зоны.
    expectLegacyCountsMatchRows(
      state.legacyByZone['home-widgets'],
      zones.zones['home-widgets'].rows,
    );
  });

  it('classifyMismatchVerdictRow различает legacy, typed-v1 и лишние ключи', () => {
    expect(
      classifyMismatchVerdictRow({
        v: '≠',
        f: 'Старое основание.',
        h: 'abc',
      }),
    ).toEqual({ form: 'legacy' });
    expect(
      classifyMismatchVerdictRow({
        v: '≠',
        f: 'Canvas просит 10 px.',
        h: 'abc',
        reasonCode: 'platform',
        decisionRef: 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
      }),
    ).toEqual({ form: 'typed-v1' });
    expect(
      classifyMismatchVerdictRow({
        v: '≠',
        f: 'Есть evidence.',
        h: 'abc',
        reasonCode: 'platform',
        decisionRef: 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
        evidence: ['dom: test'],
      }),
    ).toEqual({ form: 'typed-v1' });
    expect(
      classifyMismatchVerdictRow({
        v: '≠',
        f: 'Лишний ключ.',
        h: 'abc',
        reasonCode: 'platform',
        decisionRef: 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
        surprise: true,
      }),
    ).toEqual({ form: 'typed-v1-extra-keys', extraKeys: ['surprise'] });
  });

  // Читает все 28 файлов зон — 17 681 строку — и в одиночку укладывается в 4,9 с
  // при умолчании vitest в 5 с. На полном прогоне под нагрузкой не укладывается:
  // 6 сентября упал по «Test timed out in 5000ms» при зелёном одиночном. Работа
  // тяжёлая по существу, поэтому поднят порог, а не урезана проверка.
  it('текущий repository snapshot укладывается в миграционный baseline', () => {
    const state = inspectVerdictSemantics(readAllZones());
    expect(state.schemaProblems).toEqual([]);
  }, 60_000);
});
