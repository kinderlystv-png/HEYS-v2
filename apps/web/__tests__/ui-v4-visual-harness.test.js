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
import {
  CANVAS_PACK_DIR,
  parseCanvasHtml,
  resolveCanvasFrame,
} from '../../../scripts/lib/ui-v4-canvas-index.mjs';

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
        'strength-plan-feed-sand',
        'strength-builder-collapsed-sand',
        'strength-superset-create-sand',
        'norm-correction-lowered-sand',
      ]),
    );
    for (const item of UI_V4_VISUAL_CASES.filter((entry) => entry.kind === 'demo-food-copy-empty')) {
      expect(item.viewport).toEqual(
        item.themeId === 'sand'
          ? { width: 399, height: 812 }
          : { width: 375, height: 812 },
      );
      expect(['sand', 'sand-dark', 'blue', 'blue-dark']).toContain(item.themeId);
    }
    expect(UI_V4_VISUAL_CASES.find((entry) => entry.kind === 'demo-food-copy-existing')?.viewport)
      .toEqual({ width: 399, height: 812 });
    expect(UI_V4_VISUAL_CASES.find((entry) => entry.kind === 'demo-food-move-existing')?.viewport)
      .toEqual({ width: 399, height: 812 });
    for (const item of UI_V4_VISUAL_CASES.filter((entry) =>
      ['demo-food-copy-existing', 'demo-food-move-existing'].includes(entry.kind))) {
      expect(item.themeId).toBe('sand');
    }
    expect(
      UI_V4_VISUAL_CASES.filter((entry) => entry.gate === 'pixel').map((entry) => entry.zone).sort(),
    ).toEqual([...UI_V4_PIXEL_GATE_ZONES].sort());
    expect(
      UI_V4_VISUAL_CASES.filter((entry) => entry.status === 'dom-gate').map((entry) => entry.zone).sort(),
    ).toEqual([...UI_V4_DOM_GATE_ZONES].sort());
  });

  it('fail-closed привязывает парный capture к точному Canvas oid и уникальному runtime-корню', () => {
    const paired = UI_V4_VISUAL_CASES.filter((item) => item.canvasFrame);
    expect(paired.map((item) => item.id)).toContain('strength-finish-sand');
    expect(paired.map((item) => item.id)).toContain('strength-plan-feed-sand');
    expect(paired.map((item) => item.id)).toContain('strength-builder-collapsed-sand');
    expect(paired.map((item) => item.id)).toContain('strength-superset-create-sand');
    expect(paired.map((item) => item.id)).toContain('norm-correction-lowered-sand');
    expect(paired.map((item) => item.id)).toContain('food-copy-empty-target-sand');
    expect(paired.map((item) => item.id)).toContain('food-copy-existing-target-sand');
    expect(paired.map((item) => item.id)).toContain('food-move-existing-target-sand');
    for (const item of paired) {
      expect(item.captureSelector, item.id).toBeTruthy();
      expect(item.canvasFrame.palette, item.id).toBe(item.themeId);
      const canvasPath = path.join(CANVAS_PACK_DIR, item.canvasFrame.file);
      const canvas = parseCanvasHtml(fs.readFileSync(canvasPath, 'utf8'), {
        file: item.canvasFrame.file,
      });
      const frame = resolveCanvasFrame(canvas, item.canvasFrame);
      expect(frame.oid, item.id).toBe(item.canvasFrame.oid);
      expect(frame.label, item.id).toBe(item.canvasFrame.label);
      expect(frame.canonicalLocator.key, item.id).toBeTruthy();
    }
    const planFeed = paired.find((item) => item.id === 'strength-plan-feed-sand');
    expect(planFeed.canvasFrame).toMatchObject({
      file: 'strength-builder.v4.dc.html',
      label: 'План в ленте дня',
      oid: 'И3',
      palette: 'sand',
      captureSelector: ':scope > .sc',
    });
    expect(paired.find((item) => item.id === 'strength-builder-collapsed-sand')?.canvasFrame)
      .toMatchObject({
        file: 'strength-builder.v4.dc.html',
        label: 'Конструктор · список свёрнут',
        oid: 'А2',
        palette: 'sand',
      });
    expect(paired.find((item) => item.id === 'strength-superset-create-sand')?.canvasFrame)
      .toMatchObject({
        file: 'strength-builder.v4.dc.html',
        label: 'Связка · создание',
        oid: 'З1',
        palette: 'sand',
      });
    const finish = paired.find((item) => item.id === 'strength-finish-sand');
    expect(finish).toMatchObject({
      viewport: { width: 375, height: 1346 },
      captureSelector: '.sb-finish-screen',
      canvasFrame: {
        file: 'strength-builder.v4.dc.html',
        label: 'Конструктор · итоги',
        oid: 'Б3',
        palette: 'sand',
      },
    });
    const normLowered = paired.find((item) => item.id === 'norm-correction-lowered-sand');
    expect(normLowered).toMatchObject({
      viewport: { width: 375, height: 620 },
      captureSelector: '#ui-v4-norm-correction-lowered-host > .norm-correction-screen',
      canvasFrame: {
        file: 'norm-correction.v4.dc.html',
        label: 'Сверка · норма снизилась',
        oid: 'NC5',
        palette: 'sand',
      },
    });
    const reportsWhatIf = paired.find((item) => item.id === 'reports-whatif-inline-sand');
    expect(reportsWhatIf).toMatchObject({
      viewport: { width: 375, height: 706 },
      captureSelector: '#ui-v4-reports-whatif-host',
      canvasFrame: {
        file: 'reports-insights.v4.dc.html',
        label: 'Инсайты · что если',
        oid: 'RI-WI1',
        palette: 'sand',
        pixelAlign: true,
      },
    });
    const foodCopyEmpty = paired.find((item) => item.id === 'food-copy-empty-target-sand');
    expect(foodCopyEmpty).toMatchObject({
      viewport: { width: 399, height: 812 },
      captureSelector: '.copy-meal-modal.meal-transfer-v4__sheet',
      canvasFrame: {
        file: 'food-meal.v4.dc.html',
        label: 'Действие · копировать без целей',
        oid: 'FM10A',
        palette: 'sand',
        pixelAlign: true,
      },
    });
    expect(paired.find((item) => item.id === 'food-move-existing-target-sand')).toMatchObject({
      viewport: { width: 399, height: 812 },
      captureSelector: '.move-modal.meal-transfer-v4__sheet--move',
      canvasFrame: {
        file: 'food-meal.v4.dc.html',
        label: 'Действие · перенести',
        oid: 'FM11',
        palette: 'sand',
        pixelAlign: true,
      },
    });
  });

  it('снимает element-boundary пары runtime↔Canvas и сохраняет diff без resize', () => {
    const captureSource = fs.readFileSync(
      path.resolve(__dirname, '../scripts/ui-v4-visual-capture.mjs'),
      'utf8',
    );
    expect(captureSource).toContain("await captureRoot.screenshot({ path: file, animations: 'disabled' })");
    expect(captureSource).toContain("await frame.screenshot({ path: file, animations: 'disabled' })");
    expect(captureSource).toContain("await boundary.screenshot({ path: file, animations: 'disabled' })");
    expect(captureSource).toContain("result.comparison.source = 'live-canvas-pair'");
    expect(captureSource).toContain('actualMeta.width !== expectedMeta.width');
    expect(captureSource).not.toContain('resize(');
    expect(captureSource).not.toContain('VERDICT_PATH');
  });

  it('food-meal visual capture fail-closed проверяет контраст выбранной цели', () => {
    const captureSource = fs.readFileSync(
      path.resolve(__dirname, '../scripts/ui-v4-visual-capture.mjs'),
      'utf8',
    );
    expect(captureSource).toContain('data-copy-meal-target-label="new-meal"');
    expect(captureSource).toContain('getImageData(0, 0, 1, 1)');
    expect(captureSource).toContain('visualChecks.contrastRatio < 4.5');
    expect(captureSource).toContain('visualChecks.productCount !== 8');
    expect(captureSource).toContain('!visualChecks.canScrollProducts');
    expect(captureSource).toContain("visualChecks.primaryText !== 'Копировать (8)'");
    expect(captureSource).toContain('data-move-meal-target="visual-lunch"');
    expect(captureSource).toContain("visualChecks.selectedMoveTarget !== 'visual-lunch'");
    expect(captureSource).toContain("visualChecks.dateLabel !== 'Вчера, 26 августа'");
  });

  it('reports what-if capture доказывает реальный observed-pattern расчёт', () => {
    const captureSource = fs.readFileSync(
      path.resolve(__dirname, '../scripts/ui-v4-visual-capture.mjs'),
      'utf8',
    );
    expect(captureSource).toContain('window.__uiV4ReportsWhatIfEngineEvidence');
    expect(captureSource).toContain("visualChecks.engine.simulate?.action !== 'add_protein'");
    expect(captureSource).toContain('!visualChecks.engine.simulate?.requireObserved');
    expect(captureSource).toContain('Math.round(Number(visualChecks.engine.projectedScore)) !== 75');
    expect(captureSource).toContain("visualChecks.score.before !== '72'");
    expect(captureSource).toContain("visualChecks.score.after !== '75'");
    expect(captureSource).toContain("visualChecks.score.delta !== '+3'");
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
