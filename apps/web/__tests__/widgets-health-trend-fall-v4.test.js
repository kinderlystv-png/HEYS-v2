/**
 * Сведённый кусок home-widgets: кадр «Тренд здоровья · падение».
 * Тот же компакт 2×1: число и ломаная --val-bad.
 * Порог ±2 и семь прогонов не открывал. Рост и мёртвую зону не ломал.
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

describe('Тренд здоровья · падение — сведённый кусок', () => {
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
    expect(contractValue(canvas, 'Тренд здоровья · падение · 01'))
      .toBe('плитка: ширина 143px, высота 64px, флекс none, фон var(--gr-bg)');
    expect(contractValue(canvas, 'Тренд здоровья · падение · 02'))
      .toBe('распределение space-between, выравнивание baseline, зазор 6px');
    expect(contractValue(canvas, 'Тренд здоровья · падение · 03'))
      .toBe('«Тренд · 14 дней» — ключ');
    expect(contractValue(canvas, 'Тренд здоровья · падение · 04'))
      .toBe('выравнивание flex-end, распределение space-between, зазор 8px, отступ сверху auto');
    expect(contractValue(canvas, 'Тренд здоровья · падение · 05'))
      .toBe('«−6» — моноцифры: шрифт 600 26px/1 Figtree, цвет var(--val-bad)');
    expect(contractValue(canvas, 'Тренд здоровья · падение · 06'))
      .toBe('флекс none, отступ снизу 2px, цвет var(--val-bad)');
    expect(contractValue(canvas, 'Тренд здоровья · падение · рисунок 01'))
      .toBe('поле рисунка 58×24 (viewBox 0 0 58 24)');
    expect(contractValue(canvas, 'Тренд здоровья · падение · рисунок 02'))
      .toBe('ломаная, точки 2,5 11,7 20,6 29,11 38,14 47,17 56,20, линия currentColor, толщина 2.5');
    expect(contractValue(canvas, 'Тренд здоровья · падение · рисунок 03'))
      .toBe('точка r 3.5 в (56,20), заливка currentColor');
    expect(contractValue(canvas, 'Тренд здоровья · падение · текст'))
      .toBe('Тренд · 14 дней › −6');
  });

  it('держит вид: bad-тон числа и --bad ломаной; порог ±2 не переписывал', () => {
    expect(compact).toContain('v4HealthTrendState');
    expect(compact).toContain('v4ValueStateClass');
    expect(compact).toContain('v4HealthTrendSparkClass');
    expect(uiSrc).toContain('const V4_HEALTH_TREND_DEAD_ZONE = 2');
    expect(uiSrc).toMatch(/function v4HealthTrendSparkClass\(state\) \{[\s\S]*?return 'widget-v4-spark--bad'/);
    expect(uiSrc).toMatch(/function v4ValueStateClass\(state\) \{[\s\S]*?return 'widget-v4-val--bad'/);
    expect(compact).toContain("viewBox: '0 0 58 24'");
  });

  it('держит число и ломаную --val-bad; рост и зона живы', () => {
    const value = rules.get('.widget-trend-compact__value');
    expect(value['font-size']).toBe('26px');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(rules.get('.widget-trend-compact__value.widget-v4-val--bad').color)
      .toContain('--v4-val-bad');
    expect(rules.get('.widget-v4-val--bad').color).toContain('--v4-bad-text');
    expect(rules.get('.widget-trend-compact__value.widget-v4-val--good').color)
      .toContain('--v4-ok-text');
    expect(rules.get('.widget-trend-compact__value.widget-v4-val--neutral').color)
      .toContain('--v4-ink');

    const spark = rules.get('.widget-trend-compact__spark');
    expect(spark.flex).toBe('none');
    expect(spark['margin-bottom']).toBe('2px');
    expect(rules.get('.widget-trend-compact__spark.widget-v4-spark--bad').color)
      .toContain('--v4-val-bad');
    expect(rules.get('.widget-trend-compact__spark.widget-v4-spark--bad polyline').stroke)
      .toContain('--v4-val-bad');
    expect(rules.get('.widget-trend-compact__spark.widget-v4-spark--ok').color)
      .toContain('--v4-ok-fill');
    expect(rules.get('.widget-trend-compact__spark.widget-v4-spark--flat').color)
      .toContain('--v4-ink-mark');

    expect(rules.get('.widget-v4-sleepready-review .widget-v4-goal-value')['font-size'])
      .toBe('26px');
    expect(rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip')['font-size'])
      .toBe('8.5px');
    expect(rules.get('.widget-v4-rhythm-empty__line').height).toBe('12px');
  });

  it('val-bad в светлых совпадает, bad-text нет; тёмные val-bad другие', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const sandDark = palette.slice(palette.indexOf('[data-theme-id="sand-dark"]'), palette.indexOf('[data-theme-id="blue"]'));
    const role = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(role(sand, '--v4-val-bad')).toBe('#a8382b');
    expect(role(blue, '--v4-val-bad')).toBe('#a8382b');
    expect(role(sandDark, '--v4-val-bad')).toBe('#e08a72');
    expect(role(sand, '--v4-val-bad')).not.toBe(role(sandDark, '--v4-val-bad'));
    expect(role(sand, '--v4-bad-text')).toBe('#a83c22');
    expect(role(blue, '--v4-bad-text')).toBe('#b03a24');
    expect(role(sand, '--v4-bad-text')).not.toBe(role(blue, '--v4-bad-text'));
    expect(role(sand, '--v4-ok-text')).toBe('#5c6a45');
    expect(role(sand, '--v4-ink')).toBe('#201e1d');
    expect(role(blue, '--v4-ink')).toBe('#101826');
  });
});
