/**
 * Сведённый кусок home-widgets: кадр «Ритм приёмов · Интервалы».
 * 2×2 — ключ, счётчик, среднее 26 px, три полосы 5 px.
 * Ширины 88/72/57 — демо; продукт minutes/360. Ленту дня и белок не ломает.
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

describe('Ритм приёмов · Интервалы — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function MealRhythmVariantBody');
  const intervalsAt = uiSrc.indexOf("if (variantId === 'intervals')", bodyAt);
  const dayAt = uiSrc.indexOf('widget-v4-rhythm-day', bodyAt);
  const intervals = uiSrc.slice(intervalsAt, dayAt);
  const day = uiSrc.slice(dayAt, uiSrc.indexOf('function ruMealsWord', dayAt));
  const proteinMeals = uiSrc.slice(
    uiSrc.indexOf('function ProteinVariantBody'),
    uiSrc.indexOf("if (variantId === 'add')", uiSrc.indexOf('function ProteinVariantBody')),
  );

  it('читает пятнадцать строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 03')).toBe('«Ритм · интервалы» — ключ');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 04'))
      .toBe('«4 приёма» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 05'))
      .toBe('выравнивание baseline, зазор 5px, отступ сверху 7px');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 06'))
      .toBe('«3:37» — моноцифры: шрифт 600 26px/.9 Figtree, трекинг -.03em, цвет var(--tx)');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 07'))
      .toBe('направление column, зазор 6px, отступ сверху auto');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 08'))
      .toBe('выравнивание center, зазор 7px');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 09'))
      .toBe('«8:40 → 13:05» — моноцифры: флекс none, ширина 74px, шрифт 600 8.5px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 10'))
      .toBe('флекс 1, высота 5px, радиус 999px, фон rgba(var(--ink),.08)');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 11'))
      .toBe('ширина 88%, высота 5px, радиус 999px, фон #b7c29b');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 12'))
      .toBe('«4 ч 25 м» — моноцифры: флекс none, шрифт 600 8.5px/1 Figtree, цвет var(--tx)');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 13'))
      .toBe('ширина 72%, высота 5px, радиус 999px, фон #b7c29b');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · 14'))
      .toBe('ширина 57%, высота 5px, радиус 999px, фон #b7c29b');
    expect(contractValue(canvas, 'Ритм приёмов · Интервалы · текст'))
      .toBe('49 › Ритм · интервалы › 4 приёма › 3:37 › в среднем между приёмами › 8:40 → 13:05 › 4 ч 25 м › 13:05 → 16:40 › 3 ч 35 м › 16:40 → 19:30 › 2 ч 50 м');
  });

  it('держит вид 2×2, своё поле и три полосы; ленту и белок не ломает', () => {
    expect(variantsSrc).toMatch(/mealRhythm:\s*\[[\s\S]*?id:\s*'intervals'[\s\S]*?title:\s*'Интервалы'[\s\S]*?size:\s*'2x2'/);
    expect(intervals).toContain("v4Kicker('Ритм · интервалы')");
    expect(intervals).toContain('widget-v4-rhythm-intervals__hero');
    expect(intervals).toContain('widget-v4-rhythm-intervals__value');
    expect(intervals).toContain('formatHoursColon');
    expect(intervals).toContain('widget-v4-rhythm-intervals__bars');
    expect(intervals).toContain('6 * 60');
    expect(intervals).toContain('formatHoursWords');
    expect(intervals).toContain('slice(-3)');
    expect(intervals).not.toContain('widget-v4-goal-hero');
    expect(intervals).not.toContain('widget-v4-val--good');
    expect(intervals).not.toContain('widget-v4-rhythm-day');
    expect(day).toContain('widget-v4-rhythm__line');
    expect(day).toContain('widget-v4-rhythm__dot');
    expect(proteinMeals).toContain('widget-v4-protein-meals__bars');
    expect(proteinMeals).toContain('grams / maxMeal');
  });

  it('держит 26 px, время 74 px, полосы 5 px; общий mealbars и белок живы', () => {
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');
    const tight = rules.get('.widget-v4-row--tight');
    expect(tight['align-items']).toBe('baseline');

    const hero = rules.get('.widget-v4-rhythm-intervals__hero');
    expect(hero['align-items']).toBe('baseline');
    expect(hero.gap).toBe('5px');
    expect(hero['margin-top']).toBe('7px');

    const value = rules.get('.widget-v4-rhythm-intervals__value');
    expect(value['font-size']).toBe('26px');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('0.9');
    expect(value['letter-spacing']).toBe('-0.03em');
    expect(value.color).toContain('--v4-ink');

    const bars = rules.get('.widget-v4-mealbars.widget-v4-rhythm-intervals__bars');
    expect(bars.gap).toBe('6px');
    expect(bars['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-mealbars').gap).toBe('5px');
    expect(rules.get('.widget-v4-mealbars__track').height).toBe('4px');

    expect(rules.get('.widget-v4-mealbars__row')['align-items']).toBe('center');
    expect(rules.get('.widget-v4-mealbars__row').gap).toBe('7px');

    const time = rules.get('.widget-v4-rhythm-intervals__bars .widget-v4-mealbars__time');
    expect(time.width).toBe('74px');
    expect(time['font-size']).toBe('8.5px');
    expect(time['line-height']).toBe('1');
    expect(rules.get('.widget-v4-protein-meals__bars .widget-v4-mealbars__time').width)
      .toBe('34px');

    const track = rules.get('.widget-v4-rhythm-intervals__bars .widget-v4-mealbars__track');
    expect(track.height).toBe('5px');
    expect(rules.get('.widget-v4-mealbars__track').background).toContain('--v4-line');

    const fill = rules.get('.widget-v4-rhythm-intervals__bars .widget-v4-mealbars__fill');
    expect(fill.height).toBe('5px');
    expect(fill.background).toBe('#b7c29b');
    expect(rules.get('.widget-v4-protein-meals__bars .widget-v4-mealbars__fill').background)
      .toContain('--v4-ok-fill');

    const num = rules.get('.widget-v4-rhythm-intervals__bars .widget-v4-mealbars__num');
    expect(num['font-size']).toBe('8.5px');
    expect(num.color).toContain('--v4-ink');

    expect(rules.get('.widget-v4-rhythm__line').height).toBe('14px');
    expect(rules.get('.widget-v4-rhythm__dot').width).toBe('8px');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value')['font-size'])
      .toBe('21px');
  });

  it('число --v4-ink на двух наборах; заливка #b7c29b одна; 88 % — демо', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const ink = (block) => block.match(/--v4-ink:\s*([^;]+);/)?.[1]?.trim();
    expect(ink(sand)).toBe('#201e1d');
    expect(ink(blue)).toBe('#101826');
    expect(ink(sand)).not.toBe(ink(blue));
    expect(palette).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.56)');
    expect(blue).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.64)');
    expect(rules.get('.widget-v4-row__meta').color).toContain('--v4-ink-data');
    expect(rules.get('.widget-v4-mealbars__time').color).toContain('--v4-ink-data');
    expect(Math.round((265 / 360) * 100)).toBe(74);
    expect(Math.round((215 / 360) * 100)).toBe(60);
    expect(Math.round((170 / 360) * 100)).toBe(47);
  });
});
