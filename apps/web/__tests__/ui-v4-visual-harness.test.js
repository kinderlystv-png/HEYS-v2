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
const VERDICTS_DIR = path.join(ROOT, 'docs/ui/verdicts');

/** Вердикты лежат по файлу на зону — см. scripts/lib/ui-v4-verdicts.mjs. */
const listZones = () => fs.readdirSync(VERDICTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -'.json'.length));
const readZone = (zone) => JSON.parse(
  fs.readFileSync(path.join(VERDICTS_DIR, `${zone}.json`), 'utf8'),
);

describe('UI v4 visual harness', () => {
  it('явно учитывает все зоны текущего Canvas-реестра', () => {
    expect([...UI_V4_CANVAS_ZONES].sort()).toEqual(listZones().sort());
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
        'food-copy-empty-target-sand',
        'food-copy-empty-target-sand-dark',
        'food-copy-empty-target-blue',
        'food-copy-empty-target-blue-dark',
        'food-copy-existing-target-sand',
        'food-move-existing-target-sand',
        'reports-whatif-inline-sand',
        'reports-weight-prediction-sand',
        'strength-finish-sand',
      ]),
    );
    for (const item of UI_V4_VISUAL_CASES.filter((entry) => entry.kind === 'demo-food-copy-empty')) {
      expect(item.viewport).toEqual({ width: 375, height: 812 });
      expect(['sand', 'sand-dark', 'blue', 'blue-dark']).toContain(item.themeId);
    }
    for (const item of UI_V4_VISUAL_CASES.filter((entry) =>
      ['demo-food-copy-existing', 'demo-food-move-existing'].includes(entry.kind))) {
      expect(item.viewport).toEqual({ width: 375, height: 812 });
      expect(item.themeId).toBe('sand');
    }
    expect(
      UI_V4_VISUAL_CASES.filter((entry) => entry.gate === 'pixel').map((entry) => entry.zone).sort(),
    ).toEqual([...UI_V4_PIXEL_GATE_ZONES].sort());
    expect(
      UI_V4_VISUAL_CASES.filter((entry) => entry.status === 'dom-gate').map((entry) => entry.zone).sort(),
    ).toEqual([...UI_V4_DOM_GATE_ZONES].sort());
  });

  it('food-meal visual capture fail-closed проверяет контраст выбранной цели', () => {
    const captureSource = fs.readFileSync(
      path.resolve(__dirname, '../scripts/ui-v4-visual-capture.mjs'),
      'utf8',
    );
    expect(captureSource).toContain('data-copy-meal-target-label="new-meal"');
    expect(captureSource).toContain('getImageData(0, 0, 1, 1)');
    expect(captureSource).toContain('visualChecks.contrastRatio < 4.5');
  });

  it('разрешает pixel-gate только зонам без вопросов и несовпадений', () => {
    for (const zone of UI_V4_PIXEL_GATE_ZONES) {
      const unresolved = Object.entries(readZone(zone).rows)
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
