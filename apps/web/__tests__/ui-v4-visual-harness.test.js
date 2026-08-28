import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildUiV4VisualSnapshot,
  UI_V4_CANVAS_ZONES,
  UI_V4_DOM_GATE_ZONES,
  UI_V4_PIXEL_GATE_ZONES,
  UI_V4_VISUAL_CASES,
  UI_V4_VISUAL_CLOCK,
} from '../scripts/ui-v4-visual-fixture.mjs';

const ROOT = path.resolve(__dirname, '../../..');

describe('UI v4 visual harness', () => {
  it('явно учитывает все зоны текущего Canvas-реестра', () => {
    const verdicts = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'docs/ui/ui-v4-contract-verdicts.json'), 'utf8'),
    );
    expect([...UI_V4_CANVAS_ZONES].sort()).toEqual(Object.keys(verdicts.zones).sort());
    expect(new Set(UI_V4_VISUAL_CASES.map((item) => item.zone))).toEqual(
      new Set(UI_V4_CANVAS_ZONES),
    );
  });

  it('имеет уникальные id и проверяемый корень у каждого автоматического сценария', () => {
    const ids = UI_V4_VISUAL_CASES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of UI_V4_VISUAL_CASES.filter((entry) => entry.status === 'automated')) {
      expect(item.rootSelector, item.id).toBeTruthy();
    }
    expect(
      UI_V4_VISUAL_CASES.filter((entry) => entry.status === 'automated').map((entry) => entry.id),
    ).toEqual(
      expect.arrayContaining([
        'water-custom-volume',
        'cycle-day-picker',
        'tips-sheet',
        'registration-personal',
        'curator-edits-default',
      ]),
    );
    expect(
      UI_V4_VISUAL_CASES.filter((entry) => entry.gate === 'pixel').map((entry) => entry.zone).sort(),
    ).toEqual([...UI_V4_PIXEL_GATE_ZONES].sort());
    expect(
      UI_V4_VISUAL_CASES.filter((entry) => entry.status === 'dom-gate').map((entry) => entry.zone).sort(),
    ).toEqual([...UI_V4_DOM_GATE_ZONES].sort());
  });

  it('разрешает pixel-gate только зонам без вопросов и несовпадений', () => {
    const verdicts = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'docs/ui/ui-v4-contract-verdicts.json'), 'utf8'),
    );
    for (const zone of UI_V4_PIXEL_GATE_ZONES) {
      const unresolved = Object.entries(verdicts.zones[zone].rows)
        .filter(([, row]) => !['=', '—'].includes(row.v))
        .map(([key, row]) => `${key}: ${row.v}`);
      expect(unresolved, zone).toEqual([]);
    }
  });

  it('использует фиксированные синтетические данные без идентификаторов клиента', () => {
    const snapshot = buildUiV4VisualSnapshot();
    const serialized = JSON.stringify(snapshot);
    expect(snapshot.generatedAt).toBe(UI_V4_VISUAL_CLOCK.iso);
    expect(snapshot.pseudonym).toBe('Визуальный стенд');
    expect(serialized).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    );
    expect(serialized).not.toMatch(/(?:phone|session[_-]?token|client[_-]?id)/i);
  });
});
