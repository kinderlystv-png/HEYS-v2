// Разбор кадров water-add против продуктового CSS.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/water-add.v4.dc.html',
);
const WIDGETS_CSS = path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css');
const WATER_CSS = path.resolve(__dirname, '../styles/modules/400-water-and-hydration.css');

const CUSTOM_SHEET = [
  [2, '.water-custom-sheet__stepper', ['align', 'justify', 'gap', 'marginTop']],
  [3, ['.water-custom-sheet__step', '.water-custom-sheet__step--sub'], ['width', 'height', 'padding']],
  [4, '.water-custom-sheet__value', ['fontWeight', 'fontSize', 'tracking']],
  [5, '.water-custom-sheet__unit', ['fontWeight', 'fontSize']],
  [6, '.water-custom-sheet__presets', ['gap', 'marginTop']],
  [7, '.water-custom-sheet__preset', ['flex']],
];

const COVERAGE_FLOOR = 6;

function mergedRules() {
  const widgets = readRules(fs.readFileSync(WIDGETS_CSS, 'utf8'));
  const water = readRules(fs.readFileSync(WATER_CSS, 'utf8'));
  for (const [sel, decl] of water) {
    if (sel === 'localVars') continue;
    widgets.set(sel, { ...widgets.get(sel), ...decl });
  }
  return widgets;
}

describe('water-add · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = mergedRules();
  const widgetsCss = fs.readFileSync(WIDGETS_CSS, 'utf8');
  const waterCss = fs.readFileSync(WATER_CSS, 'utf8');

  it('кадр «В3 · уменьшенное движение» — reduce-motion у плитки', () => {
    expect(razbor.has('Вода · В3 · уменьшенное движение|1')).toBe(true);
    expect(widgetsCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.widget-water--v4 \.widget-water__fill/);
    expect(widgetsCss).toMatch(/\.widget-water__fill::before[\s\S]*animation:\s*none/);
  });

  it('кадр «Кольцо» — минус в ряду объёмов, не в шапке', () => {
    expect(razbor.get('Вода · карточка · Кольцо|2')).toContain('«−200»');
    expect(waterCss).toMatch(/\.water-review__chip--in-row[\s\S]*height:\s*1\.875rem/);
    expect(waterCss).toMatch(/\.water-review__chip--quick[\s\S]*flex:\s*1/);
  });

  it('кадр «свой объём · лист» совпадает с water-custom-sheet', () => {
    expect(compare({ razbor, rules, frame: 'Вода · свой объём · лист', pairs: CUSTOM_SHEET })).toEqual([]);
  });

  it('чипы FAB — геометрия из кадра «вид · ряд чипов объёма»', () => {
    expect(waterCss).toMatch(/\.water-fab-vol \{[\s\S]*?height: 30px/);
    expect(waterCss).toMatch(/\.water-fab-vol--minus \{[\s\S]*?margin-right: 5px/);
    expect(waterCss).toContain('border: 2px solid var(--water-fab-outline)');
  });

  it('гейт называет охват разбора', () => {
    const report = coverage({
      razbor,
      calls: [{ frame: 'Вода · свой объём · лист', pairs: CUSTOM_SHEET }],
    });
    expect(report.covered).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  });
});
