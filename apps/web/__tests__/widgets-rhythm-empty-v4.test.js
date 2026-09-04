/**
 * Сведённый кусок home-widgets: кадр «Ритм приёмов · нет данных».
 * 2×1 — ключ, пустая лента 12 px, подпись «приёмов не было».
 * 143×64 — клетка стенда, не правило тела. Живую ленту и интервалы не открывал.
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

describe('Ритм приёмов · нет данных — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function MealRhythmVariantBody');
  const liveAt = uiSrc.indexOf(
    "return React.createElement('div', { className: 'widget-v4-stack widget-v4-rhythm widget-v4-rhythm-day' }",
    bodyAt,
  );
  const emptyAt = uiSrc.indexOf('widget-v4-rhythm-empty', bodyAt);
  const live = uiSrc.slice(liveAt, emptyAt);
  const empty = uiSrc.slice(emptyAt, uiSrc.indexOf('function ruMealsWord', emptyAt));
  const intervals = uiSrc.slice(
    uiSrc.indexOf("if (variantId === 'intervals')", bodyAt),
    liveAt,
  );

  it('читает семь строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Ритм приёмов · нет данных · 01'))
      .toBe('плитка: ширина 143px, высота 64px, флекс none');
    expect(contractValue(canvas, 'Ритм приёмов · нет данных · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Ритм приёмов · нет данных · 03')).toBe('«Ритм приёмов» — ключ');
    expect(contractValue(canvas, 'Ритм приёмов · нет данных · 04'))
      .toBe('выравнивание center, высота 12px, отступ сверху auto');
    expect(contractValue(canvas, 'Ритм приёмов · нет данных · 05'))
      .toBe('флекс 1, высота 3px, радиус 999px, фон rgba(var(--ink),.08)');
    expect(contractValue(canvas, 'Ритм приёмов · нет данных · 06'))
      .toBe('«приёмов не было» — моноцифры: шрифт 600 8px/1 Figtree, цвет rgba(var(--ink),.56), отступ сверху 4px');
    expect(contractValue(canvas, 'Ритм приёмов · нет данных · текст'))
      .toBe('Ритм приёмов › приёмов не было');
  });

  it('держит пустую ленту без точек и риски; живая лента и интервалы живы', () => {
    expect(variantsSrc).toMatch(/mealRhythm:\s*\[[\s\S]*?id:\s*'day_line'[\s\S]*?title:\s*'Лента дня'[\s\S]*?size:\s*'2x1'/);
    expect(empty).toContain("v4Kicker('Ритм приёмов')");
    expect(empty).toContain('widget-v4-rhythm-empty__line');
    expect(empty).toContain('widget-v4-rhythm-empty__track');
    expect(empty).toContain('widget-v4-rhythm-empty__label');
    expect(empty).toContain("'приёмов не было'");
    expect(empty).not.toContain('widget-v4-rhythm__now');
    expect(empty).not.toContain('widget-v4-rhythm__dot');
    expect(empty).not.toContain('widget-v4-row__meta');
    expect(empty).not.toContain("'6:00'");
    expect(live).toContain('widget-v4-rhythm__now');
    expect(live).toContain("'6:00'");
    expect(live).toContain('за день');
    expect(intervals).toContain('интервалов пока нет');
    expect(intervals).toContain('widget-v4-rhythm-intervals');
  });

  it('держит поле 12 px и дорожку 3 px; живая лента 14/8 жива', () => {
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');
    const tight = rules.get('.widget-v4-row--tight');
    expect(tight['align-items']).toBe('baseline');

    const line = rules.get('.widget-v4-rhythm-empty__line');
    expect(line['align-items']).toBe('center');
    expect(line.height).toBe('12px');
    expect(line['margin-top']).toBe('auto');

    const track = rules.get('.widget-v4-rhythm-empty__track');
    expect(track.flex).toBe('1');
    expect(track.height).toBe('3px');
    expect(track['border-radius']).toBe('999px');
    expect(track.background).toContain('--v4-line');

    const label = rules.get('.widget-v4-rhythm-empty__label');
    expect(label['font-size']).toBe('8px');
    expect(label['font-weight']).toBe('600');
    expect(label['line-height']).toBe('1');
    expect(label['margin-top']).toBe('4px');
    expect(label.color).toContain('--v4-ink-data');

    expect(rules.get('.widget-v4-rhythm__line').height).toBe('14px');
    expect(rules.get('.widget-v4-rhythm__dot').width).toBe('8px');
    expect(rules.get('.widget-v4-rhythm__now').width).toBe('2px');
    expect(rules.get('.widget-v4-rhythm-intervals__value')['font-size']).toBe('26px');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value')['font-size'])
      .toBe('21px');
  });

  it('дорожка и подпись следуют набору; песок ≠ синий у чернил', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const ink = (block) => block.match(/--v4-ink:\s*([^;]+);/)?.[1]?.trim();
    const line = (block) => block.match(/--v4-line:\s*([^;]+);/)?.[1]?.trim();
    expect(ink(sand)).toBe('#201e1d');
    expect(ink(blue)).toBe('#101826');
    expect(ink(sand)).not.toBe(ink(blue));
    expect(line(sand)).toBe('rgba(0, 0, 0, 0.08)');
    expect(line(blue)).toBe('rgba(0, 0, 0, 0.08)');
    expect(palette).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.56)');
    expect(blue).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.64)');
  });
});
