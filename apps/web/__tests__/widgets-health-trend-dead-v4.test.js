/**
 * Сведённый кусок home-widgets: кадр «Тренд здоровья · мёртвая зона».
 * Тот же компакт 2×1: число --tx, ломаная чернил 30 %.
 * Порог ±2 и семь прогонов не открывал. Рост 26 px/--gr/--gr2 не ломал.
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

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`))?.[1] || '';
}

describe('Тренд здоровья · мёртвая зона — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function HealthTrendVariantBody');
  const compactAt = uiSrc.indexOf("if (isShort || variantId === 'compact')", bodyAt);
  const largeAt = uiSrc.indexOf('HEALTH_SPARK_BOX_LARGE', compactAt);
  const compact = uiSrc.slice(compactAt, largeAt > compactAt ? largeAt : compactAt + 2500);

  it('читает десять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Тренд здоровья · мёртвая зона · 01'))
      .toBe('плитка: ширина 143px, высота 64px, флекс none, фон var(--gr-bg)');
    expect(contractValue(canvas, 'Тренд здоровья · мёртвая зона · 02'))
      .toBe('распределение space-between, выравнивание baseline, зазор 6px');
    expect(contractValue(canvas, 'Тренд здоровья · мёртвая зона · 03'))
      .toBe('«Тренд · 14 дней» — ключ');
    expect(contractValue(canvas, 'Тренд здоровья · мёртвая зона · 04'))
      .toBe('выравнивание flex-end, распределение space-between, зазор 8px, отступ сверху auto');
    expect(contractValue(canvas, 'Тренд здоровья · мёртвая зона · 05'))
      .toBe('«−1» — моноцифры: шрифт 600 26px/1 Figtree, цвет var(--tx)');
    expect(contractValue(canvas, 'Тренд здоровья · мёртвая зона · 06'))
      .toBe('флекс none, отступ снизу 2px, цвет rgba(var(--ink),.3)');
    expect(contractValue(canvas, 'Тренд здоровья · мёртвая зона · рисунок 01'))
      .toBe('поле рисунка 58×24 (viewBox 0 0 58 24)');
    expect(contractValue(canvas, 'Тренд здоровья · мёртвая зона · рисунок 02'))
      .toBe('ломаная, точки 2,13 11,12 20,14 29,12 38,13 47,12 56,13, линия currentColor, толщина 2.5');
    expect(contractValue(canvas, 'Тренд здоровья · мёртвая зона · рисунок 03'))
      .toBe('точка r 3.5 в (56,13), заливка currentColor');
    expect(contractValue(canvas, 'Тренд здоровья · мёртвая зона · текст'))
      .toBe('Тренд · 14 дней › −1');
  });

  it('держит вид: нейтральный тон числа и --flat ломаной; порог ±2 не переписывал', () => {
    expect(compact).toContain('v4HealthTrendState');
    expect(compact).toContain('v4ValueStateClass');
    expect(compact).toContain('v4HealthTrendSparkClass');
    expect(compact).toContain('widget-trend-compact__value');
    expect(compact).toContain('widget-trend-compact__spark');
    expect(uiSrc).toContain('const V4_HEALTH_TREND_DEAD_ZONE = 2');
    expect(uiSrc).toMatch(/function v4HealthTrendSparkClass\(state\) \{[\s\S]*?return 'widget-v4-spark--flat'/);
    expect(uiSrc).toMatch(/function v4ValueStateClass\(state\) \{[\s\S]*?return 'widget-v4-val--neutral'/);
    expect(compact).toContain("viewBox: '0 0 58 24'");
    expect(uiSrc).not.toContain('V4_HEALTH_TREND_DEAD_ZONE = 0');
  });

  it('держит число --tx и ломаную 30 %; рост --gr/--gr2 жив', () => {
    const value = rules.get('.widget-trend-compact__value');
    expect(value['font-size']).toBe('26px');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(rules.get('.widget-trend-compact__value.widget-v4-val--neutral').color)
      .toContain('--v4-ink');
    expect(rules.get('.widget-trend-compact__value.widget-v4-val--good').color)
      .toContain('--v4-ok-text');

    const spark = rules.get('.widget-trend-compact__spark');
    expect(spark.flex).toBe('none');
    expect(spark['margin-bottom']).toBe('2px');
    expect(rules.get('.widget-trend-compact__spark.widget-v4-spark--flat').color)
      .toContain('--v4-ink-mark');
    expect(rules.get('.widget-trend-compact__spark.widget-v4-spark--flat polyline').stroke)
      .toContain('--v4-ink-mark');
    expect(rules.get('.widget-trend-compact__spark.widget-v4-spark--ok').color)
      .toContain('--v4-ok-fill');

    expect(rules.get('.widget-v4-sleepready-review .widget-v4-goal-value')['font-size'])
      .toBe('26px');
    expect(rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip')['font-size'])
      .toBe('8.5px');
    expect(rules.get('.widget-v4-rhythm-empty__line').height).toBe('12px');
  });

  it('чернила числа и метки ломаной следуют набору; песок ≠ синий', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const role = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(role(sand, '--v4-ink')).toBe('#201e1d');
    expect(role(blue, '--v4-ink')).toBe('#101826');
    expect(role(sand, '--v4-ink')).not.toBe(role(blue, '--v4-ink'));
    expect(role(sand, '--v4-ink-rgb')).toBe('0, 0, 0');
    expect(role(blue, '--v4-ink-rgb')).toBe('16, 24, 38');
    expect(role(sand, '--v4-ink-rgb')).not.toBe(role(blue, '--v4-ink-rgb'));
    expect(palette).toContain('--v4-ink-mark: rgba(var(--v4-ink-rgb), 0.3)');
    expect(role(sand, '--v4-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-ok-text')).toBe('#1f6e4d');
  });
});
