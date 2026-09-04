/**
 * Сведённый кусок home-widgets: кадр «Оценка дня · Семь дней».
 * 2×1 — ключ «Оценка · 7 дней», число 16 px, ряд столбиков 22 px.
 * Высоты 13/17/9… кадра — демо доли; продукт считает score/max × 100 %.
 * «Как сейчас», «Из чего сложилась», воду и шаги не открывал.
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

describe('Оценка дня · Семь дней — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function DayScoreVariantBody');
  const bodyEnd = uiSrc.indexOf('function DayScoreWidgetContent', bodyAt);
  const body = uiSrc.slice(bodyAt, bodyEnd);
  const factorsAt = body.indexOf("if (resolvedVariant === 'factors')");
  const weekAt = body.indexOf('// Кадр «Шторка · Оценка дня», вид «Семь дней»');
  const weekEnd = body.indexOf('\n    }\n\n    return React.createElement', weekAt);
  const week = body.slice(weekAt, weekEnd);

  it('читает тринадцать строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Оценка дня · Семь дней · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Оценка дня · Семь дней · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Оценка дня · Семь дней · 03'))
      .toBe('«Оценка · 7 дней» — ключ');
    expect(contractValue(canvas, 'Оценка дня · Семь дней · 04'))
      .toBe('«6,2» — моноцифры: шрифт 600 16px/1 Figtree, цвет var(--ac)');
    expect(contractValue(canvas, 'Оценка дня · Семь дней · 05'))
      .toBe('выравнивание flex-end, зазор 4px, высота 22px, отступ сверху auto');
    expect(contractValue(canvas, 'Оценка дня · Семь дней · 06'))
      .toBe('флекс 1, высота 13px, радиус 2px, фон rgba(var(--ink),.13)');
    expect(contractValue(canvas, 'Оценка дня · Семь дней · 12'))
      .toBe('флекс 1, высота 14px, радиус 2px, фон var(--acs)');
    expect(contractValue(canvas, 'Оценка дня · Семь дней · текст'))
      .toBe('18 › Оценка · 7 дней › 6,2');
  });

  it('держит week_chart 2×1: ключ, число без /10, столбики под шапкой', () => {
    expect(variantsSrc).toMatch(
      /dayScore:\s*\[[\s\S]*?id:\s*'week_chart'[\s\S]*?title:\s*'Семь дней'[\s\S]*?size:\s*'2x1'/,
    );
    expect(week).toContain("v4Kicker('Оценка · 7 дней')");
    expect(week).toContain('widget-day-score__week-score');
    expect(body).toContain('widget-v4-week-bars--inline');
    expect(week).toContain('weekBarCols(weekScores)');
    expect(week).not.toContain("React.createElement('span', { className: 'widget-v4-unit' }, ' / 10')");
    expect(factorsAt).toBeGreaterThan(0);
    expect(body).toContain('widget-v4-week-bars__col--today');
    expect(body).toContain('widget-v4-week-bars__col--past');
    expect(body).toContain('Math.round((day.score / maxScore) * 100)');
    expect(body.slice(factorsAt, weekAt)).toContain("v4Kicker('Оценка дня')");
    expect(body.slice(factorsAt, weekAt)).not.toContain('widget-v4-week-bars--inline');
  });

  it('держит шапку space-between/baseline и ряд 22 px; соседей не ломает', () => {
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');

    const weekRow = rules.get('.widget-day-score--week .widget-v4-row');
    expect(weekRow['align-items']).toBe('baseline');

    const barsBase = rules.get('.widget-v4-week-bars');
    expect(barsBase['align-items']).toBe('flex-end');
    expect(barsBase.gap).toBe('4px');

    const barsInline = rules.get('.widget-v4-week-bars--inline');
    expect(barsInline.height).toBe('22px');
    expect(barsInline['margin-top']).toBe('auto');

    const col = rules.get('.widget-v4-week-bars__col');
    expect(col.flex).toBe('1');
    expect(col['border-radius']).toBe('2px');

    expect(rules.get('.widget-v4-week-bars').height).toBe('48px');
    expect(rules.get('.widget-v4-stepbars').height).toBe('30px');
    expect(rules.get('.widget-v4-stepbars--month').height).toBe('44px');
  });

  it('цвет числа и столбиков — роли, песок ≠ синий на тёмных; прошлые --v4-track', () => {
    expect(body).toContain('--v4-sand-act-text');
    const sandInk = palette.match(/:root[\s\S]*?--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const blueInk = blueBlock.match(/--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandDarkBlock = palette.slice(palette.indexOf('[data-theme-id="sand-dark"]'));
    const blueDarkBlock = palette.slice(palette.indexOf('[data-theme-id="blue-dark"]'));
    const sandDarkTrack = sandDarkBlock.match(/--v4-track:\s*([^;]+);/)?.[1];
    const blueDarkTrack = blueDarkBlock.match(/--v4-track:\s*([^;]+);/)?.[1];
    expect(sandInk).toBe('#201e1d');
    expect(blueInk).toBe('#101826');
    expect(sandInk).not.toBe(blueInk);
    expect(sandDarkTrack).toBe('rgba(242, 237, 230, 0.12)');
    expect(blueDarkTrack).toBe('rgba(238, 243, 248, 0.12)');
    expect(sandDarkTrack).not.toBe(blueDarkTrack);
    expect(rules.get('.widget-v4-week-bars__col--past').background).toContain('--v4-track');
    expect(rules.get('.widget-v4-week-bars__col--today').background).toContain('--v4-sand-act');
    expect(css).toMatch(/\.widget-v4-week-bars__col--past \{[^}]*--v4-track/);
    expect(css).toMatch(/\.widget-v4-week-bars__col--today \{[^}]*--v4-sand-act/);
  });
});
