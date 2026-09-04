/**
 * Сведённый кусок home-widgets: кадр «Ритм приёмов · Лента дня».
 * 2×1 — ключ, счётчик, полоса 6:00–24:00, точки, риска сейчас.
 * «48» — клетка стенда. Интервалы, качество еды и клетчатку не открывал.
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

describe('Ритм приёмов · Лента дня — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function MealRhythmVariantBody');
  const intervalsAt = uiSrc.indexOf("if (variantId === 'intervals')", bodyAt);
  const dayAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-stack widget-v4-rhythm widget-v4-rhythm-day' }", bodyAt);
  const day = uiSrc.slice(dayAt, uiSrc.indexOf('function ruMealsWord', dayAt));
  const intervals = uiSrc.slice(intervalsAt, dayAt);
  const foodNowAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-foodquality' }");
  const foodNow = uiSrc.slice(foodNowAt, uiSrc.indexOf('function FoodQualityWidgetContent', foodNowAt));

  it('читает десять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Ритм приёмов · Лента дня · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Ритм приёмов · Лента дня · 02'))
      .toBe('распределение space-between, выравнивание baseline, зазор 6px');
    expect(contractValue(canvas, 'Ритм приёмов · Лента дня · 03')).toBe('«Ритм приёмов» — ключ');
    expect(contractValue(canvas, 'Ритм приёмов · Лента дня · 04'))
      .toBe('«4 за день» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Ритм приёмов · Лента дня · 05'))
      .toBe('позиция relative, высота 14px, отступ сверху auto');
    expect(contractValue(canvas, 'Ритм приёмов · Лента дня · 06'))
      .toBe('позиция absolute, высота 3px, сдвиг translateY(-50%), радиус 999px, фон rgba(var(--ink),.08)');
    expect(contractValue(canvas, 'Ритм приёмов · Лента дня · 07'))
      .toBe('позиция absolute, сдвиг translate(-50%,-50%), ширина 8px, высота 8px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Ритм приёмов · Лента дня · 08'))
      .toBe('позиция absolute, ширина 2px, фон var(--tx)');
    expect(contractValue(canvas, 'Ритм приёмов · Лента дня · 09'))
      .toBe('моноцифры: распределение space-between, шрифт 600 8px/1 Figtree, цвет rgba(var(--ink),.56), отступ сверху 4px');
    expect(contractValue(canvas, 'Ритм приёмов · Лента дня · текст'))
      .toBe('48 › Ритм приёмов › 4 за день › 6:00 › 24:00');
  });

  it('держит вид 2×1, шапку, точки и риску в живой ветке day_line', () => {
    expect(variantsSrc).toMatch(/mealRhythm:\s*\[[\s\S]*?id:\s*'day_line'[\s\S]*?title:\s*'Лента дня'[\s\S]*?size:\s*'2x1'/);
    expect(day).toContain("v4Kicker('Ритм приёмов')");
    expect(day).toContain('widget-v4-row--tight');
    expect(day).toContain('widget-v4-row__meta');
    expect(day).toContain('за день');
    expect(day).toContain('widget-v4-rhythm__line');
    expect(day).toContain('widget-v4-rhythm__track');
    expect(day).toContain('widget-v4-rhythm__now');
    expect(day).toContain('widget-v4-rhythm__dot');
    expect(day).toContain('widget-v4-rhythm__scale');
    expect(day).toContain("'6:00'");
    expect(day).toContain("'24:00'");
    expect(day).toContain('rhythmLeftPct');
    expect(day).not.toContain('widget-v4-mealbars');
    expect(intervals).toContain("v4Kicker('Ритм · интервалы')");
    expect(intervals).not.toContain('widget-v4-rhythm-day');
    expect(foodNow).toContain('widget-v4-goal-value--empty');
  });

  it('держит поле 14 px, точки 8 px и риску 2 px; соседей не ломает', () => {
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');
    const tight = rules.get('.widget-v4-row--tight');
    expect(tight['align-items']).toBe('baseline');
    expect(tight.gap).toBe('6px');

    const meta = rules.get('.widget-v4-row__meta');
    expect(meta['font-size']).toBe('9px');
    expect(meta['font-weight']).toBe('600');
    expect(meta['line-height']).toBe('1');
    expect(meta.color).toContain('--v4-ink-data');

    const line = rules.get('.widget-v4-rhythm__line');
    expect(line.position).toBe('relative');
    expect(line.height).toBe('14px');
    expect(line['margin-top']).toBe('auto');

    const track = rules.get('.widget-v4-rhythm__track');
    expect(track.position).toBe('absolute');
    expect(track.height).toBe('3px');
    expect(track.transform).toBe('translateY(-50%)');
    expect(track['border-radius']).toBe('999px');
    expect(track.background).toContain('--v4-line');
    expect(track.background).not.toContain('--v4-track');

    const dot = rules.get('.widget-v4-rhythm__dot');
    expect(dot.width).toBe('8px');
    expect(dot.height).toBe('8px');
    expect(dot.transform).toBe('translate(-50%, -50%)');
    expect(dot['border-radius']).toBe('999px');
    expect(dot.background).toContain('--v4-ok-fill');
    expect(dot.background).not.toContain('--v4-sand-ok-fill');

    const now = rules.get('.widget-v4-rhythm__now');
    expect(now.position).toBe('absolute');
    expect(now.width).toBe('2px');
    expect(now.top).toBe('0');
    expect(now.bottom).toBe('0');
    expect(now.background).toContain('--v4-ink');
    expect(now.background).not.toContain('--v4-ink-3');

    const scale = rules.get('.widget-v4-rhythm__scale');
    expect(scale['justify-content']).toBe('space-between');
    expect(scale['font-size']).toBe('8px');
    expect(scale['font-weight']).toBe('600');
    expect(scale['line-height']).toBe('1');
    expect(scale['margin-top']).toBe('4px');
    expect(scale.color).toContain('--v4-ink-data');

    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value')['font-size'])
      .toBe('21px');
    expect(rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-value--empty').color)
      .toContain('--v4-ink-3');
  });

  it('точки и риска следуют набору; песок ≠ синий', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const okFill = (block) => block.match(/--v4-ok-fill:\s*([^;]+);/)?.[1]?.trim();
    const ink = (block) => block.match(/--v4-ink:\s*([^;]+);/)?.[1]?.trim();
    const line = (block) => block.match(/--v4-line:\s*([^;]+);/)?.[1]?.trim();
    expect(okFill(sand)).toBe('#7a8a5e');
    expect(okFill(blue)).toBe('#4f9a78');
    expect(okFill(sand)).not.toBe(okFill(blue));
    expect(ink(sand)).toBe('#201e1d');
    expect(ink(blue)).toBe('#101826');
    expect(line(sand)).toBe('rgba(0, 0, 0, 0.08)');
    expect(line(blue)).toBe('rgba(0, 0, 0, 0.08)');
    expect(blue).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.64)');
    expect(palette).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.56)');
  });
});
