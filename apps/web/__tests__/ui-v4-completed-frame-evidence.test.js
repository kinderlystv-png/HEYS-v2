import { describe, expect, it } from 'vitest';

import { readCanvasPackage } from '../../../scripts/lib/ui-v4-canvas-index.mjs';
import { readAllZones } from '../../../scripts/lib/ui-v4-verdicts.mjs';
import {
  COMPLETED_FRAME_EVIDENCE,
  materializeCompletedFrameEvidence,
} from '../scripts/ui-v4-completed-frame-evidence.mjs';

describe('восемь завершённых кадров: построчное evidence', () => {
  const canvases = readCanvasPackage();
  const canvasRows = canvases.flatMap((canvas) => canvas.contractRows);
  const materialized = materializeCompletedFrameEvidence(canvasRows);

  it('покрывает каждую строку восьми кадров без пакетного вердикта по статусу кадра', () => {
    expect(COMPLETED_FRAME_EVIDENCE.map((frame) => frame.oid)).toEqual(['REG1', 'А1б', 'Б2', 'И3', 'А2', 'З1', 'Б3', 'NC5']);
    expect(materialized).toHaveLength(281);
    expect(new Set(materialized.map((row) => row.rowIdentity)).size).toBe(281);
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
      const actual = verdicts[expected.zoneId].rows[expected.rowIdentity];
      expect(actual.v, expected.rowIdentity).toBe(expected.verdict);
      expect(actual.evidence, expected.rowIdentity).toEqual(expected.evidence);
    }
  });
});
