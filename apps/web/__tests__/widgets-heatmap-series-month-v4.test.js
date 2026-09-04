/**
 * Сведённый кусок home-widgets: «Тепловая карта · Серия» и «Месяц целиком».
 * Как сейчас (week_bar) не открывал — закрыт в widgets-heatmap-now-v4.test.js.
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

describe('Тепловая карта · Серия и Месяц целиком — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function HeatmapVariantBody');
  const bodyEnd = uiSrc.indexOf('function HeatmapWidgetContent', bodyAt);
  const body = uiSrc.slice(bodyAt, bodyEnd);
  const streakAt = body.indexOf("if (variantId === 'streak')");
  const weekBarAt = body.indexOf("if (size === '2x1' || size === '3x1' || variantId === 'week_bar')");
  const monthAt = body.indexOf("if (variantId === 'month_grid')");
  const monthEnd = body.indexOf('const weekDays = days.slice(-7)', monthAt);
  const streakBlock = body.slice(streakAt, weekBarAt);
  const monthBlock = body.slice(monthAt, monthEnd);

  it('читает строки «Серия» из актуального data-v', () => {
    expect(contractValue(canvas, 'Тепловая карта · Серия · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Тепловая карта · Серия · 02')).toBe('«Серия» — ключ');
    expect(contractValue(canvas, 'Тепловая карта · Серия · 03'))
      .toBe('выравнивание baseline, зазор 3px, отступ сверху auto');
    expect(contractValue(canvas, 'Тепловая карта · Серия · 04'))
      .toBe('«2» — моноцифры: шрифт 600 21px/1 Figtree, трекинг -.02em');
    expect(contractValue(canvas, 'Тепловая карта · Серия · текст')).toBe('20 › Серия › дня');
  });

  it('читает строки «Месяц целиком» из актуального data-v', () => {
    expect(contractValue(canvas, 'Тепловая карта · Месяц целиком · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Тепловая карта · Месяц целиком · 02'))
      .toBe('«Месяц целиком» — ключ');
    expect(contractValue(canvas, 'Тепловая карта · Месяц целиком · 03'))
      .toBe('колонки repeat(7,1fr), зазор 4px, отступ сверху 9px');
    expect(contractValue(canvas, 'Тепловая карта · Месяц целиком · 04'))
      .toBe('радиус 3px, фон var(--gr2)');
    expect(contractValue(canvas, 'Тепловая карта · Месяц целиком · 05'))
      .toBe('радиус 3px, фон var(--ovl)');
    expect(contractValue(canvas, 'Тепловая карта · Месяц целиком · 06'))
      .toBe('радиус 3px, фон rgba(var(--ink),.08)');
    expect(contractValue(canvas, 'Тепловая карта · Месяц целиком · 07'))
      .toBe('радиус 3px, фон var(--acs)');
    expect(contractValue(canvas, 'Тепловая карта · Месяц целиком · 08'))
      .toBe('«18 из 28 дней в норме» — моноцифры: отступ сверху auto, шрифт 600 9.5px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Тепловая карта · Месяц целиком · текст'))
      .toBe('21 › Месяц целиком › 18 из 28 дней в норме');
  });

  it('держит streak 1×1 и month_grid 2×2 в variants и ui', () => {
    expect(variantsSrc).toMatch(
      /heatmap:\s*\[[\s\S]*?id:\s*'streak'[\s\S]*?title:\s*'Серия'[\s\S]*?size:\s*'1x1'/,
    );
    expect(variantsSrc).toMatch(
      /heatmap:\s*\[[\s\S]*?id:\s*'month_grid'[\s\S]*?title:\s*'Месяц целиком'[\s\S]*?size:\s*'2x2'/,
    );
    expect(streakBlock).toContain("v4Kicker('Серия')");
    expect(streakBlock).toContain('widget-v4-mini__value--pair');
    expect(streakBlock).toContain("className: 'widget-v4-unit' }, 'дня')");
    expect(monthBlock).toContain("v4Kicker('Месяц целиком')");
    expect(monthBlock).toContain('widget-heatmap__month-grid');
    expect(monthBlock).toContain('widget-v4-heat__bar--');
    expect(monthBlock).toContain('widget-heatmap__cell--today');
    expect(monthBlock).toContain('`${filled28} из 28 дней в норме`');
    expect(streakBlock).not.toContain('widget-heatmap__month-grid');
  });

  it('держит геометрию серии и сетки месяца', () => {
    const miniValue = rules.get('.widget-v4-mini__value');
    expect(miniValue['font-size']).toBe('1.3125rem');
    expect(miniValue['font-weight']).toBe('600');
    expect(miniValue['line-height']).toBe('1');
    expect(miniValue['letter-spacing']).toBe('-0.02em');
    expect(miniValue['margin-top']).toBe('auto');

    const monthGrid = rules.get('.widget-heatmap__month-grid');
    expect(monthGrid['grid-template-columns']).toMatch(/repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
    expect(monthGrid.gap).toBe('4px');
    expect(monthGrid['margin-top']).toBe('9px');

    const monthCell = rules.get('.widget-heatmap__cell--month');
    expect(monthCell['border-radius']).toBe('3px');
    expect(monthCell['aspect-ratio']).toBe('1');

    const monthMeta = rules.get('.widget-heatmap__month-meta');
    expect(monthMeta['font-size']).toBe('9.5px');
    expect(monthMeta['font-weight']).toBe('600');
    expect(monthMeta['line-height']).toBe('1');
    expect(monthMeta['margin-top']).toBe('auto');
  });

  it('цвет клеток месяца — роли; песок ≠ синий на fill/overlap/act', () => {
    const sandBlock = palette.slice(0, palette.indexOf('[data-theme-id="sand-dark"]'));
    const blueBlock = palette.slice(
      palette.indexOf('[data-theme-id="blue"]'),
      palette.indexOf('[data-theme-id="blue-dark"]'),
    );
    const sandOkFill = sandBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueOkFill = blueBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandOverlap = sandBlock.match(/--v4-wave-overlap:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueOverlap = blueBlock.match(/--v4-wave-overlap:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandAct = sandBlock.match(/--v4-act:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueAct = blueBlock.match(/--v4-act:\s*(#[0-9a-f]{6})/i)?.[1];

    expect(sandOkFill).toBe('#7a8a5e');
    expect(blueOkFill).toBe('#4f9a78');
    expect(sandOkFill).not.toBe(blueOkFill);
    expect(sandOverlap).toBe('#d99a63');
    expect(blueOverlap).toBe('#b03a24');
    expect(sandOverlap).not.toBe(blueOverlap);
    expect(sandAct).toBe('#c67139');
    expect(blueAct).toBe('#1d5e96');
    expect(sandAct).not.toBe(blueAct);

    expect(rules.get('.widget-heatmap__cell--month.widget-v4-heat__bar--d3').background)
      .toContain('--v4-ok-fill');
    expect(rules.get('.widget-heatmap__cell--month.widget-v4-heat__bar--d2').background)
      .toContain('--v4-wave-overlap');
    expect(rules.get('.widget-heatmap__cell--month.widget-v4-heat__bar--d1').background)
      .toContain('--v4-line');
    expect(rules.get('.widget-heatmap__cell--month.widget-heatmap__cell--today').background)
      .toContain('--v4-act');
    expect(rules.get('.widget-heatmap__month-meta').color).toContain('--v4-ink-data');
  });
});
