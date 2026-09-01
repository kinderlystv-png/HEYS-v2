import { describe, expect, it } from 'vitest';

import {
  classifyUnknownMismatchReason,
  findUnknownEvidenceMismatches,
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
});
