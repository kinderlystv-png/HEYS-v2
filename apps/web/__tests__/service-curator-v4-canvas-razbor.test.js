import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/service-curator.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/400-water-and-hydration.css');
const SOURCE = path.resolve(__dirname, '../day/_advice.js');

const FRAME = 'Служебное · за входом куратора';
const SERVICE = [
  [2, '.advice-service-header', ['align', 'gap', 'padding']],
  [3, '.advice-service-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [5, '.advice-service-note', ['radius', 'padding', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [6, '.advice-service-section-label', ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform', 'color']],
  [7, '.advice-service-list', ['background', 'radius', 'padding']],
  [8, '.advice-service-row', ['align', 'gap', 'padding']],
  [10, '.advice-service-row__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [11, '.advice-service-row__hint', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [13, '.advice-service-footer-note', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [14, '.advice-service-footer-tag', ['padding', 'fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform', 'color', 'textAlign']],
];

describe('Служебное за входом куратора · текущий кадр canvas', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));
  const source = fs.readFileSync(SOURCE, 'utf8');

  it('совпадает с отдельным owner-canvas после переноса из date-remainders', () => {
    expect(compare({ razbor, rules, frame: FRAME, pairs: SERVICE })).toEqual([]);
  });

  it('дословная копия и три действия принадлежат живому экрану', () => {
    for (const text of [
      'Раздел виден только по входу куратора. Клиент сюда не попадает ни из шапки, ни из настроек.',
      'Техлог',
      'Что и почему сработало за день',
      'Диагностика',
      'Почему совет не показался',
      'Пул правил',
      'Какие правила активны сейчас',
      'служебный раздел',
    ]) expect(source).toContain(text);
  });

  it('фиксирует полный охват предметных строк кадра', () => {
    const report = coverage({ razbor, calls: [{ frame: FRAME, pairs: SERVICE }] });
    expect(report.perFrame.find((item) => item.frame === FRAME)?.covered).toBe(10);
  });
});
