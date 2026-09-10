import { describe, expect, it } from 'vitest';

import { readCanvasPackage } from '../../../scripts/lib/ui-v4-canvas-index.mjs';
import { readAllZones } from '../../../scripts/lib/ui-v4-verdicts.mjs';
import {
  COMPLETED_FRAME_EVIDENCE,
  materializeCompletedFrameEvidence,
} from '../scripts/ui-v4-completed-frame-evidence.mjs';

function evidenceTestRefs(items) {
  return items
    .map((item) => item.replace(/^(?:dom|computed-style|semantic(?:-test)?): /, ''))
    .sort();
}

describe('восемь завершённых кадров: построчное evidence', () => {
  const canvases = readCanvasPackage();
  const canvasRows = canvases.flatMap((canvas) => canvas.contractRows);
  const materialized = materializeCompletedFrameEvidence(canvasRows);

  it('покрывает каждую строку восьми кадров без пакетного вердикта по статусу кадра', () => {
    // NC5 стоит дважды: пакет 3 сентября развёл экран на две ветки, «норма
    // снизилась» и «· без обхватов», и у каждой свой кадр при общем oid.
    expect(COMPLETED_FRAME_EVIDENCE.map((frame) => frame.oid)).toEqual(['REG1', 'А1б', 'Б2', 'И3', 'А2', 'З1', 'Б3', 'NC5', 'NC5']);
    // 299 с пакета 47 (33435e3bf): дизайнер убрал две строки из канваса
    // strength-builder — «спокойнее · 48» (сноска «Сделанное») и
    // «итоги · 59» (отступ кнопки «Готово»); не переименование.
    // 319 с пакета 52: третья ветка сверки «только талия» — двадцать строк
    // кадра по решению владельца 10 сентября. Рост числа здесь законен ровно
    // тогда, когда у новых строк есть построчное доказательство: это проверяет
    // утверждение ниже, и оно же не даст поднять счётчик под зелёный цвет.
    expect(materialized).toHaveLength(319);
    expect(new Set(materialized.map((row) => row.rowIdentity)).size).toBe(319);
    expect(materialized.every((row) => row.evidence.length > 0)).toBe(true);
  });

  it('оставляет unsupported строку вопросом, а ≠ требует проверяемого решения', () => {
    for (const row of materialized) {
      if (row.evidence.some((item) => item.startsWith('unsupported:'))) expect(row.verdict).toBe('?');
      if (row.verdict === '≠') {
        expect(row.reasonCode).toBeTruthy();
        expect(row.decisionRef).toMatch(/^docs\//);
      }
    }
  });

  it('snapshot содержит ровно материализованные вердикты и evidence', () => {
    const verdicts = readAllZones().zones;
    for (const expected of materialized) {
      if (expected.verdict === '?') continue;
      const actual = verdicts[expected.zoneId].rows[expected.rowIdentity];
      // Материализатор считает вердикт по evidence; typed «≠» с reasonCode
      // сильнее автоматического «=» — решение сводившего зону (А1б · 05).
      const typedDeviationWins = actual.v === '≠'
        && actual.reasonCode
        && actual.decisionRef;
      if (typedDeviationWins) {
        if (actual.evidence) {
          expect(evidenceTestRefs(actual.evidence), expected.rowIdentity)
            .toEqual(evidenceTestRefs(expected.evidence));
        }
        continue;
      }
      expect(actual.v, expected.rowIdentity).toBe(expected.verdict);
      if (actual.evidence) {
        expect(evidenceTestRefs(actual.evidence), expected.rowIdentity)
          .toEqual(evidenceTestRefs(expected.evidence));
      }
    }
  });
});
