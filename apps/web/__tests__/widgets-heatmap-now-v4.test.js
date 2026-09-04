/**
 * Сведённый кусок home-widgets: кадр «Тепловая карта · Как сейчас».
 * 2×1 — ключ «Тепловая карта», счёт «5 из 7», семь полос 9 px.
 * Серию, месяц целиком, воду и шаги не открывал.
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

describe('Тепловая карта · Как сейчас — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function HeatmapVariantBody');
  const bodyEnd = uiSrc.indexOf('function HeatmapWidgetContent', bodyAt);
  const body = uiSrc.slice(bodyAt, bodyEnd);
  const weekBarAt = body.indexOf("if (size === '2x1' || size === '3x1' || variantId === 'week_bar')");
  const size2x2At = body.indexOf("if (size === '2x2' || variantId === 'month_grid')", weekBarAt);
  const weekBar = body.slice(weekBarAt, size2x2At);

  it('читает девять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Тепловая карта · Как сейчас · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Тепловая карта · Как сейчас · 02'))
      .toBe('распределение space-between, выравнивание center');
    expect(contractValue(canvas, 'Тепловая карта · Как сейчас · 03'))
      .toBe('«Тепловая карта» — ключ');
    expect(contractValue(canvas, 'Тепловая карта · Как сейчас · 04'))
      .toBe('«5 из 7» — моноцифры: шрифт 700 9.5px/1 Figtree, цвет var(--gr)');
    expect(contractValue(canvas, 'Тепловая карта · Как сейчас · 05'))
      .toBe('зазор 4px, отступ сверху auto');
    expect(contractValue(canvas, 'Тепловая карта · Как сейчас · 06'))
      .toBe('флекс 1, высота 9px, радиус 3px, фон var(--gr2)');
    expect(contractValue(canvas, 'Тепловая карта · Как сейчас · 07'))
      .toBe('флекс 1, высота 9px, радиус 3px, фон rgba(var(--ink),.08)');
    expect(contractValue(canvas, 'Тепловая карта · Как сейчас · 08'))
      .toBe('флекс 1, высота 9px, радиус 3px, фон var(--ovl)');
    expect(contractValue(canvas, 'Тепловая карта · Как сейчас · текст'))
      .toBe('19 › Тепловая карта › 5 из 7');
  });

  it('держит week_bar 2×1: ключ, счёт filled из 7, три тона полос', () => {
    expect(variantsSrc).toMatch(
      /heatmap:\s*\[[\s\S]*?id:\s*'week_bar'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'2x1'/,
    );
    expect(weekBar).toContain("v4Kicker('Тепловая карта')");
    expect(weekBar).toContain('widget-v4-row__meta--count');
    expect(weekBar).toContain('v4HeatmapMetaState(filled, 7)');
    expect(weekBar).toContain('`${filled} из 7`');
    expect(weekBar).toContain('widget-v4-heat');
    expect(weekBar).toContain("return 'd3'");
    expect(weekBar).toContain("return 'd2'");
    expect(weekBar).toContain("return 'd1'");
    expect(weekBar).not.toContain('widget-heatmap__month-grid');
    expect(body.slice(size2x2At)).toContain("v4Kicker('Тепловая карта')");
    expect(body.slice(size2x2At)).toContain('widget-heatmap__month-grid');
  });

  it('держит шапку center и ряд полос 9 px; соседей не ломает', () => {
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');

    const heatRow = rules.get('.widget-heatmap .widget-v4-row--tight');
    expect(heatRow['align-items']).toBe('center');

    const stack = rules.get('.widget-heatmap--2x1.widget-v4-stack');
    expect(stack['justify-content']).toBe('space-between');

    const heat = rules.get('.widget-v4-heat');
    expect(heat.gap).toBe('4px');
    expect(heat['margin-top']).toBe('auto');

    const bar = rules.get('.widget-v4-heat__bar');
    expect(bar.flex).toBe('1');
    expect(bar.height).toBe('9px');
    expect(bar['border-radius']).toBe('3px');

    expect(rules.get('.widget-v4-week-bars--inline').height).toBe('22px');
    expect(rules.get('.widget-heatmap__month-grid')['grid-template-columns'])
      .toMatch(/repeat\(7,\s*(minmax\(0,\s*)?1fr\)/);
  });

  it('цвет счётчика и полос — роли; песок ≠ синий на --v4-ok-text и --v4-ok-fill', () => {
    const sandBlock = palette.slice(0, palette.indexOf('[data-theme-id="sand-dark"]'));
    const blueBlock = palette.slice(
      palette.indexOf('[data-theme-id="blue"]'),
      palette.indexOf('[data-theme-id="blue-dark"]'),
    );
    const sandOkText = sandBlock.match(/--v4-ok-text:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueOkText = blueBlock.match(/--v4-ok-text:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandOkFill = sandBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueOkFill = blueBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandLine = sandBlock.match(/--v4-line:\s*([^;]+);/)?.[1];
    const blueLine = blueBlock.match(/--v4-line:\s*([^;]+);/)?.[1];
    const sandOverlap = sandBlock.match(/--v4-wave-overlap:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueOverlap = blueBlock.match(/--v4-wave-overlap:\s*(#[0-9a-f]{6})/i)?.[1];

    expect(sandOkText).toBe('#5c6a45');
    expect(blueOkText).toBe('#1f6e4d');
    expect(sandOkText).not.toBe(blueOkText);
    expect(sandOkFill).toBe('#7a8a5e');
    expect(blueOkFill).toBe('#4f9a78');
    expect(sandOkFill).not.toBe(blueOkFill);
    expect(sandLine).toBe('rgba(0, 0, 0, 0.08)');
    expect(blueLine).toBe('rgba(0, 0, 0, 0.08)');
    expect(sandOverlap).toBe('#d99a63');
    expect(blueOverlap).toBe('#b03a24');
    expect(sandOverlap).not.toBe(blueOverlap);

    expect(rules.get('.widget-heatmap .widget-v4-row__meta--count.widget-v4-val--good').color)
      .toContain('--v4-ok-text');
    expect(rules.get('.widget-v4-heat__bar--d3').background).toContain('--v4-ok-fill');
    expect(rules.get('.widget-v4-heat__bar--d1').background).toContain('--v4-line');
    expect(rules.get('.widget-v4-heat__bar--d2').background).toContain('--v4-wave-overlap');

    const countMeta = rules.get('.widget-v4-row__meta--count');
    expect(countMeta['font-size']).toBe('9.5px');
    expect(countMeta['font-weight']).toBe('700');
    expect(rules.get('.widget-v4-row__meta')['line-height']).toBe('1');
  });
});
