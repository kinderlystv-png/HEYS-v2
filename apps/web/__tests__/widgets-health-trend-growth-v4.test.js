/**
 * Сведённый кусок home-widgets: кадр «Тренд здоровья · рост».
 * 2×1 компакт — ключ «Тренд · N дней», +8 26 px/--gr, ломаная --gr2.
 * Семь прогонов спарклайна и мёртвая зона ±2 не открывал.
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

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`))?.[1] || '';
}

describe('Тренд здоровья · рост — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function HealthTrendVariantBody');
  const compactAt = uiSrc.indexOf("if (isShort || variantId === 'compact')", bodyAt);
  const largeAt = uiSrc.indexOf('HEALTH_SPARK_BOX_LARGE', compactAt);
  const compact = uiSrc.slice(compactAt, largeAt > compactAt ? largeAt : compactAt + 2500);
  const emptyAt = uiSrc.indexOf('if (!hasData)', bodyAt);
  const empty = uiSrc.slice(emptyAt, compactAt);

  it('читает десять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Тренд здоровья · рост · 01'))
      .toBe('плитка: ширина 143px, высота 64px, флекс none, фон var(--gr-bg)');
    expect(contractValue(canvas, 'Тренд здоровья · рост · 02'))
      .toBe('распределение space-between, выравнивание baseline, зазор 6px');
    expect(contractValue(canvas, 'Тренд здоровья · рост · 03'))
      .toBe('«Тренд · 14 дней» — ключ');
    expect(contractValue(canvas, 'Тренд здоровья · рост · 04'))
      .toBe('выравнивание flex-end, распределение space-between, зазор 8px, отступ сверху auto');
    expect(contractValue(canvas, 'Тренд здоровья · рост · 05'))
      .toBe('«+8» — моноцифры: шрифт 600 26px/1 Figtree, цвет var(--gr)');
    expect(contractValue(canvas, 'Тренд здоровья · рост · 06'))
      .toBe('флекс none, отступ снизу 2px, цвет var(--gr2)');
    expect(contractValue(canvas, 'Тренд здоровья · рост · рисунок 01'))
      .toBe('поле рисунка 58×24 (viewBox 0 0 58 24)');
    expect(contractValue(canvas, 'Тренд здоровья · рост · рисунок 02'))
      .toBe('ломаная, точки 2,18 11,16 20,17 29,12 38,9 47,6 56,4, линия currentColor, толщина 2.5');
    expect(contractValue(canvas, 'Тренд здоровья · рост · рисунок 03'))
      .toBe('точка r 3.5 в (56,4), заливка currentColor');
    expect(contractValue(canvas, 'Тренд здоровья · рост · текст'))
      .toBe('Тренд · 14 дней › +8');
  });

  it('держит вид 2×1: короткий ключ, дельта, коробка 58×24; пустое и 2×2 без этого класса', () => {
    expect(variantsSrc).toMatch(/healthTrend:\s*\[[\s\S]*?id:\s*'compact'[\s\S]*?size:\s*'2x1'/);
    expect(compact).toContain('widget-trend-compact');
    expect(compact).toContain('widget-trend-compact__head');
    expect(compact).toContain("`Тренд · ${formatRuUnit(periodDays, 'дней')}`");
    expect(compact).toContain('widget-trend-compact__value');
    expect(compact).toContain('widget-trend-compact__spark');
    expect(compact).toContain("viewBox: '0 0 58 24'");
    expect(compact).toContain('width: 58');
    expect(compact).toContain('height: 24');
    expect(compact).toContain('HEALTH_SPARK_BOX_COMPACT');
    expect(compact).toContain('v4HealthTrendState');
    expect(compact).toContain('v4HealthTrendSparkClass');
    expect(compact).not.toContain("`Тренд здоровья · ${formatRuUnit(periodDays, 'дней')}`");
    expect(empty).toContain("`Тренд здоровья · ${formatRuUnit(periodDays, 'дней')}`");
    expect(uiSrc).toContain('const HEALTH_SPARK_BOX_COMPACT = { left: 2, right: 56, top: 4, bottom: 18, dotR: 3.5 }');
    expect(uiSrc).toContain('const V4_HEALTH_TREND_DEAD_ZONE = 2');
  });

  it('держит ключ 6 px, число 26 px/--gr, ломаную --gr2; соседи живы', () => {
    const head = rules.get('.widget-trend-compact__head');
    expect(head['justify-content']).toBe('space-between');
    expect(head['align-items']).toBe('baseline');
    expect(head.gap).toBe('6px');

    const row = rules.get('.widget-trend-compact__row');
    expect(row['align-items']).toBe('flex-end');
    expect(row['justify-content']).toBe('space-between');
    expect(row.gap).toBe('8px');
    expect(row['margin-top']).toBe('auto');

    const value = rules.get('.widget-trend-compact__value');
    expect(value['font-size']).toBe('26px');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(rules.get('.widget-trend-compact__value.widget-v4-val--good').color)
      .toContain('--v4-ok-text');
    expect(rules.get('.widget-v4-val--good').color).toContain('--v4-sand-ok-text');

    const spark = rules.get('.widget-trend-compact__spark');
    expect(spark.flex).toBe('none');
    expect(spark['margin-bottom']).toBe('2px');
    expect(rules.get('.widget-trend-compact__spark.widget-v4-spark--ok').color)
      .toContain('--v4-ok-fill');
    expect(rules.get('.widget-v4-spark--ok polyline').stroke).toContain('--v4-ok-fill');

    expect(rules.get('body:has(.widgets-tab) .widget--healthTrend').background)
      .toContain('--v4-ok-bg');
    expect(rules.get('.widget-v4-catalog__preview--2x1').width).toBe('143px');
    expect(rules.get('.widget-v4-catalog__preview--2x1').height).toBe('64px');

    expect(rules.get('.widget-v4-sleepready-review .widget-v4-goal-value')['font-size'])
      .toBe('26px');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value')['font-size'])
      .toBe('21px');
    expect(rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip')['font-size'])
      .toBe('8.5px');
    expect(rules.get('.widget-v4-rhythm-empty__line').height).toBe('12px');
  });

  it('шалфей числа и ломаной следует набору; песок ≠ синий; sand-ok на синем не --gr', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const role = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(role(sand, '--v4-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-ok-text')).toBe('#1f6e4d');
    expect(role(sand, '--v4-ok-text')).not.toBe(role(blue, '--v4-ok-text'));
    expect(role(sand, '--v4-ok-fill')).toBe('#7a8a5e');
    expect(role(blue, '--v4-ok-fill')).toBe('#4f9a78');
    expect(role(sand, '--v4-ok-fill')).not.toBe(role(blue, '--v4-ok-fill'));
    expect(role(sand, '--v4-ok-bg')).toBe('#eaefe0');
    expect(role(blue, '--v4-ok-bg')).toBe('#e4efe7');
    expect(role(sand, '--v4-ok-bg')).not.toBe(role(blue, '--v4-ok-bg'));
    expect(role(sand, '--v4-sand-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-sand-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-sand-ok-text')).not.toBe(role(blue, '--v4-ok-text'));
  });
});
