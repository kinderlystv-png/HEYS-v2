/**
 * Сведённый кусок home-widgets: кадр «Тренд здоровья · Компакт».
 * Шторка превью 2×1 — толщина 2 / r 2.4. Не живой компакт 2×1 и не now 2×2.
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

describe('Тренд здоровья · Компакт — сведённый кусок шторки', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function HealthTrendVariantBody');
  const compactAt = uiSrc.indexOf("if (isShort || variantId === 'compact')", bodyAt);
  const nowAt = uiSrc.indexOf('// === 2×2', compactAt);
  const nextFn = uiSrc.indexOf('function HealthTrendWidgetContent', nowAt);
  const compact = uiSrc.slice(compactAt, nowAt > compactAt ? nowAt : compactAt + 2500);
  const now = uiSrc.slice(nowAt, nextFn > nowAt ? nextFn : nowAt + 2500);

  it('читает десять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Тренд здоровья · Компакт · 01'))
      .toBe('плитка');
    expect(contractValue(canvas, 'Тренд здоровья · Компакт · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Тренд здоровья · Компакт · 03'))
      .toBe('«Тренд · 14 дней» — ключ');
    expect(contractValue(canvas, 'Тренд здоровья · Компакт · 04'))
      .toBe('выравнивание flex-end, распределение space-between, зазор 8px, отступ сверху auto');
    expect(contractValue(canvas, 'Тренд здоровья · Компакт · 05'))
      .toBe('«+8» — моноцифры');
    expect(contractValue(canvas, 'Тренд здоровья · Компакт · 06'))
      .toBe('флекс none, отступ снизу 2px');
    expect(contractValue(canvas, 'Тренд здоровья · Компакт · рисунок 01'))
      .toBe('поле рисунка 58×24 (viewBox 0 0 58 24)');
    expect(contractValue(canvas, 'Тренд здоровья · Компакт · рисунок 02'))
      .toBe('ломаная, точки 2,19 13,17 24,18 35,11 46,8 56,5, линия currentColor, толщина 2');
    expect(contractValue(canvas, 'Тренд здоровья · Компакт · рисунок 03'))
      .toBe('точка r 2.4 в (56,5), заливка currentColor');
    expect(contractValue(canvas, 'Тренд здоровья · Компакт · текст'))
      .toBe('26 › Тренд · 14 дней › +8');
  });

  it('держит превью шторки: --sheet, 2 / 2.4; живой 2×1 и now без этого класса', () => {
    expect(variantsSrc).toMatch(/healthTrend:\s*\[[\s\S]*?id:\s*'compact'[\s\S]*?title:\s*'Компакт'[\s\S]*?size:\s*'2x1'/);
    expect(compact).toContain("const sheetCompact = Boolean(meta.preview)");
    expect(compact).toContain('widget-trend-compact--sheet');
    expect(compact).toContain('widget-trend-compact__head');
    expect(compact).toContain("`Тренд · ${formatRuUnit(periodDays, 'дней')}`");
    expect(compact).toContain('widget-trend-compact__value');
    expect(compact).toContain("viewBox: '0 0 58 24'");
    expect(compact).toContain('strokeWidth: compactSpark.strokeWidth || 2.5');
    expect(compact).toContain('...(sheetCompact ? { strokeWidth: 2 } : {})');
    expect(compact).toContain('r: compactSparkLast.r || 2.4');
    expect(compact).toContain('...(sheetCompact ? { r: 2.4 } : {})');
    expect(compact).toContain('HEALTH_SPARK_BOX_COMPACT');
    expect(now).toContain('widget-trend-now');
    expect(now).not.toContain('widget-trend-compact--sheet');
    expect(now).toContain("viewBox: '0 0 130 40'");
    expect(uiSrc).toContain('const HEALTH_SPARK_BOX_COMPACT = { left: 2, right: 56, top: 4, bottom: 18, dotR: 3.5 }');
    expect(uiSrc).toContain('const HEALTH_SPARK_BOX_LARGE = { left: 3.5, right: 126.5, top: 3.5, bottom: 36.5, dotR: 3.5 }');
    expect(uiSrc).toContain('const V4_HEALTH_TREND_DEAD_ZONE = 2');
  });

  it('держит раскладку компакта и тонкую линию только у --sheet', () => {
    const head = rules.get('.widget-trend-compact__head');
    expect(head['justify-content']).toBe('space-between');
    expect(head['align-items']).toBe('baseline');

    const row = rules.get('.widget-trend-compact__row');
    expect(row['align-items']).toBe('flex-end');
    expect(row['justify-content']).toBe('space-between');
    expect(row.gap).toBe('8px');
    expect(row['margin-top']).toBe('auto');

    const value = rules.get('.widget-trend-compact__value');
    expect(value['font-variant-numeric']).toBe('tabular-nums');
    expect(rules.get('.widget-trend-compact__value.widget-v4-val--good').color)
      .toContain('--v4-ok-text');

    const spark = rules.get('.widget-trend-compact__spark');
    expect(spark.flex).toBe('none');
    expect(spark['margin-bottom']).toBe('2px');
    expect(rules.get('.widget-trend-compact__spark.widget-v4-spark--ok').color)
      .toContain('--v4-ok-fill');

    expect(rules.get('.widget-trend-compact--sheet .widget-trend-compact__spark polyline')['stroke-width'])
      .toBe('2');
    expect(rules.get('.widget-trend-compact--sheet .widget-trend-compact__spark circle').r)
      .toBe('2.4');

    expect(rules.get('.widget-trend-now .widget-v4-hero-num__val.widget-v4-val--good').color)
      .toContain('--v4-ok-text');
    expect(rules.get('.widget-trend-compact__value')['font-size']).toBe('26px');
    expect(rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip')['font-size'])
      .toBe('8.5px');
  });

  it('currentColor линии следует --gr2 набора; песок ≠ синий', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const role = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(role(sand, '--v4-ok-fill')).toBe('#7a8a5e');
    expect(role(blue, '--v4-ok-fill')).toBe('#4f9a78');
    expect(role(sand, '--v4-ok-fill')).not.toBe(role(blue, '--v4-ok-fill'));
    expect(role(sand, '--v4-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-ok-text')).toBe('#1f6e4d');
    expect(role(sand, '--v4-ok-text')).not.toBe(role(blue, '--v4-ok-text'));
    expect(role(sand, '--v4-ok-bg')).toBe('#eaefe0');
    expect(role(blue, '--v4-ok-bg')).toBe('#e4efe7');
  });
});
