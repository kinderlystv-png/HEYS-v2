/**
 * Сведённый кусок home-widgets: кадр «Клетчатка · Неделя».
 * 2×2 — ключ, 26 px сегодня, «норма N», столбики 44 px с пунктиром.
 * Высоты 34/22/40… кадра — демо доли; продукт считает value/max × 40.
 * FAB, add-hero и mini 3 px не открывал.
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

describe('Клетчатка · Неделя — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const weekAt = uiSrc.indexOf("if (variantId === 'week')");
  const week = uiSrc.slice(weekAt, uiSrc.indexOf("if (variantId === 'add')", weekAt));
  const barsFn = uiSrc.slice(
    uiSrc.indexOf('function v4WeekBars'),
    uiSrc.indexOf('function formatHoursColon'),
  );
  const foodWeek = uiSrc.slice(
    uiSrc.indexOf('function FoodQualityVariantBody') >= 0
      ? uiSrc.indexOf('function FoodQualityVariantBody')
      : uiSrc.indexOf("v4Kicker('Качество · 7 дней')"),
    uiSrc.indexOf("if (variantId === 'why')"),
  );

  it('читает строки кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Клетчатка · Неделя · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Клетчатка · Неделя · 02')).toBe('«Клетчатка · 7 дней» — ключ');
    expect(contractValue(canvas, 'Клетчатка · Неделя · 03'))
      .toBe('выравнивание baseline, зазор 5px, отступ сверху 8px');
    expect(contractValue(canvas, 'Клетчатка · Неделя · 04'))
      .toBe('«18» — моноцифры: шрифт 600 26px/.9 Figtree, трекинг -.03em, цвет var(--tx)');
    expect(contractValue(canvas, 'Клетчатка · Неделя · 05'))
      .toBe('«норма 26» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Клетчатка · Неделя · 06'))
      .toBe('позиция relative, выравнивание flex-end, зазор 4px, высота 44px, отступ сверху auto');
    expect(contractValue(canvas, 'Клетчатка · Неделя · 07'))
      .toBe('позиция absolute, разделитель сверху 1.5px dashed rgba(var(--ink),.22)');
    expect(contractValue(canvas, 'Клетчатка · Неделя · 08'))
      .toBe('флекс 1, высота 34px, радиус 3px 3px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Клетчатка · Неделя · 14'))
      .toBe('флекс 1, высота 28px, радиус 3px 3px 0 0, фон var(--gr2)');
    expect(contractValue(canvas, 'Клетчатка · Неделя · текст'))
      .toBe('39 › Клетчатка · 7 дней › 18 › г сегодня › норма 26');
  });

  it('держит вид 2×2: шапка, норма справа, plotPx 40 и пунктир; качество еды без opts', () => {
    expect(variantsSrc).toMatch(/fiber:\s*\[[\s\S]*?id:\s*'week'[\s\S]*?title:\s*'Неделя'[\s\S]*?size:\s*'2x2'/);
    expect(week).toContain("v4Kicker('Клетчатка · 7 дней')");
    expect(week).toContain('widget-v4-fiber-week__head');
    expect(week).toContain('widget-v4-fiber-week__value');
    expect(week).toContain(", 'г сегодня')");
    expect(week).toContain('widget-v4-fiber-week__norm');
    expect(week).toContain("'норма ' + norm");
    expect(week).toContain("v4WeekBars(week, max, 'widget-v4-fiber-week__bars', { plotPx: 40, norm })");
    expect(week).not.toContain('widget-v4-goal-hero');
    expect(week).not.toContain('widget-v4-muted');
    expect(barsFn).toContain('widget-v4-weekbars__norm');
    expect(barsFn).toContain('plotPx');
    expect(foodWeek).toContain('v4WeekBars(week, 10)');
    expect(foodWeek).not.toContain('plotPx');
  });

  it('держит числа шапки и поля; общий weekbars 34 px и mini 3 px живы', () => {
    const head = rules.get('.widget-v4-fiber-week__head');
    expect(head['align-items']).toBe('baseline');
    expect(head.gap).toBe('5px');
    expect(head['margin-top']).toBe('8px');

    const value = rules.get('.widget-v4-fiber-week__value');
    expect(value['font-size']).toBe('26px');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('0.9');
    expect(value['letter-spacing']).toBe('-0.03em');

    const norm = rules.get('.widget-v4-fiber-week__norm');
    expect(norm['font-size']).toBe('9px');
    expect(norm['font-weight']).toBe('600');
    expect(norm['margin-left']).toBe('auto');
    expect(norm.color).toContain('--v4-ink-data');

    const bars = rules.get('.widget-v4-weekbars.widget-v4-fiber-week__bars');
    expect(bars.position).toBe('relative');
    expect(bars.height).toBe('44px');
    expect(bars['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-weekbars').height).toBe('34px');
    expect(rules.get('.widget-v4-weekbars')['align-items']).toBe('flex-end');
    expect(rules.get('.widget-v4-weekbars').gap).toBe('4px');

    const line = rules.get('.widget-v4-weekbars__norm');
    expect(line.position).toBe('absolute');
    expect(line['border-top']).toContain('1.5px');
    expect(line['border-top']).toContain('dashed');
    expect(line['border-top']).toContain('--v4-ink-rgb');
    expect(line['border-top']).toContain('0.22');

    const past = rules.get('.widget-v4-fiber-week__bars .widget-v4-weekbars__bar');
    expect(past['border-radius']).toBe('3px 3px 0 0');
    expect(past.background).toBe('#b7c29b');
    expect(past.opacity).toBe('1');
    const today = rules.get('.widget-v4-fiber-week__bars .widget-v4-weekbars__bar.is-today');
    expect(today.background).toContain('--v4-ok-fill');

    expect(rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-hero').gap).toBe('3px');
    expect(rules.get('.widget-v4-fiber-add__head').gap).toBe('6px');
  });

  it('цвет числа, нормы и сегодняшнего столбика — роли, песок ≠ синий; прошлые литерал', () => {
    expect(rules.get('.widget-v4-val--neutral').color).toContain('--v4-ink');
    expect(rules.get('.widget-v4-fiber-week__norm').color).toContain('--v4-ink-data');
    const sandInk = palette.match(/:root[\s\S]*?--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const blueInk = blueBlock.match(/--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandFill = palette.match(/:root[\s\S]*?--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueFill = blueBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandRgb = palette.match(/:root[\s\S]*?--v4-ink-rgb:\s*([^;]+);/)?.[1].trim();
    const blueRgb = blueBlock.match(/--v4-ink-rgb:\s*([^;]+);/)?.[1].trim();
    expect(sandInk).toBe('#201e1d');
    expect(blueInk).toBe('#101826');
    expect(sandFill).toBe('#7a8a5e');
    expect(blueFill).toBe('#4f9a78');
    expect(sandRgb).toBe('0, 0, 0');
    expect(blueRgb).toBe('16, 24, 38');
    expect(sandInk).not.toBe(blueInk);
    expect(sandFill).not.toBe(blueFill);
    expect(css).toContain('background: #b7c29b');
  });

  it('демо 18 из 26 даёт сегодняшний столбик 28 px — как в кадре 14', () => {
    expect(Math.round((18 / 26) * 40)).toBe(28);
  });
});
