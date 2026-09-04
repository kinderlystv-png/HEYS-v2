/**
 * Сведённый кусок: кадр «Динамика · G сброшено и кривая».
 * Дефолт curve — «Вес за месяц», остаток, дельта, линия 58×24 / 2 / r 2.4.
 * Шапка «Сброшено за месяц», лист «Только цифра» и график 2×2 не открывал.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readRules } from './canvas-razbor-helpers.js';

const WEB_DIR = path.resolve(__dirname, '..');
const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css');
const PALETTE = path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css');
const UI = path.join(WEB_DIR, 'heys_widgets_ui_v1.js');
const VARIANTS = path.join(WEB_DIR, 'heys_widgets_variants_v4.js');
const DYN = path.join(WEB_DIR, 'heys_widgets_weight_dynamics_v4.js');

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`))?.[1] || '';
}

describe('Динамика · G сброшено и кривая — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const dynSrc = fs.readFileSync(DYN, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function renderWeightDynamicsBody');
  const curveAt = uiSrc.indexOf('// curve (default)', bodyAt);
  const tileAt = uiSrc.indexOf('function CrashRiskDynamicsVariantTile', curveAt);
  const curve = uiSrc.slice(curveAt, tileAt > curveAt ? tileAt : curveAt + 800);
  const tileFn = uiSrc.slice(tileAt, uiSrc.indexOf('function CrashRiskWidgetContent', tileAt));
  const sparkAt = uiSrc.indexOf('function WeightDynamicsSparkSvg');
  const sparkEnd = uiSrc.indexOf('function WeightDynamicsChartSvg', sparkAt);
  const spark = uiSrc.slice(sparkAt, sparkEnd > sparkAt ? sparkEnd : sparkAt + 800);
  const crashBlock = variantsSrc.match(/crashRisk:\s*\[([\s\S]*?)\n\s*\]/)?.[1] || '';

  it('читает двенадцать строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · 01'))
      .toBe('плитка');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · 03'))
      .toBe('«Вес за месяц» — ключ');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · 04'))
      .toBe('«до цели 3,6» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · 05'))
      .toBe('выравнивание flex-end, распределение space-between, зазор 8px, отступ сверху auto');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · 06'))
      .toBe('выравнивание baseline, зазор 3px');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · 07'))
      .toBe('«−1,8» — моноцифры');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · 08'))
      .toBe('флекс none, отступ снизу 2px');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · рисунок 01'))
      .toBe('поле рисунка 58×24 (viewBox 0 0 58 24)');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · рисунок 02'))
      .toBe('ломаная, точки 2,6 11,9 20,7 29,13 38,12 47,17 56,19, линия currentColor, толщина 2');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · рисунок 03'))
      .toBe('точка r 2.4 в (56,19), заливка currentColor');
    expect(contractValue(canvas, 'Динамика · G сброшено и кривая · текст'))
      .toBe('Вес за месяц › до цели 3,6 › −1,8 › кг');
  });

  it('держит дефолт curve: ключ, остаток, ряд, линия 58×24; лист и шапки соседей живы', () => {
    expect(crashBlock).toMatch(/id:\s*'curve'[\s\S]*?isDefault:\s*true/);
    expect(crashBlock).toMatch(/id:\s*'number_only'[\s\S]*?sheet:\s*false/);
    expect(tileFn).toContain("'widget-wd'");
    expect(tileFn).toContain("'widget-v4-stack'");
    expect(curve).toContain('widget-wd__head');
    expect(curve).toContain('windowLabel');
    expect(curve).toContain('headerRight');
    expect(curve).toContain('widget-wd__curve-row');
    expect(curve).toContain('WeightDynamicsSparkSvg');
    expect(curve).not.toContain('weightDynamicsDeltaKicker');
    expect(curve).not.toContain("'Вес по неделям'");
    expect(spark).toContain("viewBox: '0 0 58 24'");
    expect(spark).toContain('width: 58');
    expect(spark).toContain('height: 24');
    expect(spark).toContain('strokeWidth: 2');
    expect(spark).toContain('r: 2.4');
    expect(dynSrc).toContain("label: 'Вес за месяц'");
    expect(dynSrc).toContain('remainderLabel = `до цели ${abs}`');
    expect(uiSrc).toContain("className: 'widget-wd__remainder");
    expect(uiSrc).toContain('return dyn.remainderLabel');
    expect(uiSrc).toContain("'Вес по неделям'");
    expect(uiSrc).toContain('Сброшено за ${short}');
    expect(uiSrc).toContain('widget-trend-compact--sheet');
  });

  it('держит геометрию шапки, ряда и спарклайна; график 2×2 не делит', () => {
    const head = rules.get('.widget-wd__head');
    expect(head['justify-content']).toBe('space-between');
    expect(head['align-items']).toBe('baseline');

    const rem = rules.get('.widget-wd__remainder');
    expect(rem['font-size']).toBe('9px');
    expect(rem['font-weight']).toBe('600');
    expect(rem['line-height']).toBe('1');
    expect(rem.color).toContain('--v4-ink-data');
    expect(rem['font-variant-numeric']).toBe('tabular-nums');

    const row = rules.get('.widget-wd__curve-row');
    expect(row['align-items']).toBe('flex-end');
    expect(row['justify-content']).toBe('space-between');
    expect(row.gap).toBe('8px');
    expect(row['margin-top']).toBe('auto');

    const delta = rules.get('.widget-wd__delta');
    expect(delta['align-items']).toBe('baseline');
    expect(delta.gap).toBe('3px');
    expect(delta['font-variant-numeric']).toBe('tabular-nums');

    const sparkRule = rules.get('.widget-wd__spark');
    expect(sparkRule.flex).toBe('none');
    expect(sparkRule['margin-bottom']).toBe('2px');
    expect(rules.get('.widget-wd__spark.widget-v4-val--good').color)
      .toContain('--v4-sand-ok-text');

    expect(rules.get('.widget-wd__chart.widget-v4-val--good').color)
      .toContain('--v4-sand-ok-fill');
    expect(rules.get('.widget-trend-compact--sheet .widget-trend-compact__spark polyline')['stroke-width'])
      .toBe('2');
  });

  it('остаток и шалфей числа следуют набору; песок ≠ синий у данных', () => {
    const root = palette.slice(palette.indexOf(':root {'), palette.indexOf('[data-theme-id="sand"]'));
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const role = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(role(root, '--v4-ink-data')).toBe('rgba(var(--v4-ink-rgb), 0.56)');
    expect(role(blue, '--v4-ink-data')).toBe('rgba(var(--v4-ink-rgb), 0.64)');
    expect(role(root, '--v4-ink-data')).not.toBe(role(blue, '--v4-ink-data'));
    expect(role(sand, '--v4-ink-rgb')).toBe('0, 0, 0');
    expect(role(blue, '--v4-ink-rgb')).toBe('16, 24, 38');
    expect(role(sand, '--v4-sand-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-sand-ok-text')).toBe('#5c6a45');
    expect(role(sand, '--v4-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-ok-text')).toBe('#1f6e4d');
  });
});
