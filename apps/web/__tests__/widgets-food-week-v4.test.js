/**
 * Сведённый кусок home-widgets: кадр «Качество еды · Неделя».
 * 2×2 — ключ, 26 px сегодня, «из 10 сегодня», среднее справа, столбики 44 px.
 * Высоты 28/32/20… кадра — демо доли; продукт считает value/max × 40.
 * Клетчатку, «Как сейчас» и «Что снизило» не открывал.
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

describe('Качество еды · Неделя — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function FoodQualityVariantBody');
  const whyAt = uiSrc.indexOf("if (variantId === 'why')", bodyAt);
  const week = uiSrc.slice(bodyAt, whyAt);
  const barsFn = uiSrc.slice(
    uiSrc.indexOf('function v4WeekBars'),
    uiSrc.indexOf('function formatHoursColon'),
  );
  const fiberWeek = uiSrc.slice(
    uiSrc.indexOf('function FiberVariantBody'),
    uiSrc.indexOf('function ProteinVariantBody'),
  );

  it('читает строки кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Качество еды · Неделя · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Качество еды · Неделя · 02')).toBe('«Качество · 7 дней» — ключ');
    expect(contractValue(canvas, 'Качество еды · Неделя · 03'))
      .toBe('выравнивание baseline, зазор 5px, отступ сверху 8px');
    expect(contractValue(canvas, 'Качество еды · Неделя · 04'))
      .toBe('«8» — моноцифры: шрифт 600 26px/.9 Figtree, трекинг -.03em, цвет var(--tx)');
    expect(contractValue(canvas, 'Качество еды · Неделя · 05'))
      .toBe('«в среднем 7,3» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Качество еды · Неделя · 06'))
      .toBe('выравнивание flex-end, зазор 4px, высота 44px, отступ сверху auto');
    expect(contractValue(canvas, 'Качество еды · Неделя · 07'))
      .toBe('флекс 1, высота 28px, радиус 3px 3px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Качество еды · Неделя · 12'))
      .toBe('флекс 1, высота 32px, радиус 3px 3px 0 0, фон var(--gr2)');
    expect(contractValue(canvas, 'Качество еды · Неделя · текст'))
      .toBe('47 › Качество · 7 дней › из 10 сегодня › в среднем 7,3');
  });

  it('держит вид 2×2: шапка, среднее справа, plotPx 40; без goal-hero и muted', () => {
    expect(variantsSrc).toMatch(/foodQuality:\s*\[[\s\S]*?id:\s*'week'[\s\S]*?title:\s*'Неделя'[\s\S]*?size:\s*'2x2'/);
    expect(week).toContain("v4Kicker('Качество · 7 дней')");
    expect(week).toContain('widget-v4-foodquality-week__head');
    expect(week).toContain('widget-v4-foodquality-week__value');
    expect(week).toContain(", 'из 10 сегодня')");
    expect(week).toContain('widget-v4-foodquality-week__avg');
    expect(week).toContain('`в среднем ${formatScoreRu(data.avgWeek)}`');
    expect(week).toContain("v4WeekBars(week, max, 'widget-v4-foodquality-week__bars', { plotPx: 40 })");
    expect(week).not.toContain('widget-v4-goal-hero');
    expect(week).not.toContain('widget-v4-muted');
    expect(week).not.toContain('widget-v4-fiber-week');
    expect(barsFn).toContain('plotPx');
    expect(fiberWeek).toContain('widget-v4-fiber-week__norm');
    expect(fiberWeek).toContain('norm');
  });

  it('держит числа шапки и поля; fiber-week 44 px и mini 21 px живы', () => {
    const head = rules.get('.widget-v4-foodquality-week__head');
    expect(head['align-items']).toBe('baseline');
    expect(head.gap).toBe('5px');
    expect(head['margin-top']).toBe('8px');

    const value = rules.get('.widget-v4-foodquality-week__value');
    expect(value['font-size']).toBe('26px');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('0.9');
    expect(value['letter-spacing']).toBe('-0.03em');

    const avg = rules.get('.widget-v4-foodquality-week__avg');
    expect(avg['font-size']).toBe('9px');
    expect(avg['font-weight']).toBe('600');
    expect(avg['margin-left']).toBe('auto');
    expect(avg.color).toContain('--v4-ink-data');

    const bars = rules.get('.widget-v4-weekbars.widget-v4-foodquality-week__bars');
    expect(bars.height).toBe('44px');
    expect(bars['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-weekbars').height).toBe('34px');
    expect(rules.get('.widget-v4-weekbars')['align-items']).toBe('flex-end');
    expect(rules.get('.widget-v4-weekbars').gap).toBe('4px');

    const past = rules.get('.widget-v4-foodquality-week__bars .widget-v4-weekbars__bar');
    expect(past['border-radius']).toBe('3px 3px 0 0');
    expect(past.background).toBe('#b7c29b');
    expect(past.opacity).toBe('1');
    const today = rules.get('.widget-v4-foodquality-week__bars .widget-v4-weekbars__bar.is-today');
    expect(today.background).toContain('--v4-ok-fill');

    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value')['font-size']).toBe('21px');
    expect(rules.get('.widget-v4-fiber-week__head').gap).toBe('5px');
  });

  it('цвет числа, среднего и сегодняшнего столбика — роли, песок ≠ синий; прошлые литерал', () => {
    expect(rules.get('.widget-v4-val--neutral').color).toContain('--v4-ink');
    expect(rules.get('.widget-v4-foodquality-week__avg').color).toContain('--v4-ink-data');
    const sandInk = palette.match(/:root[\s\S]*?--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const blueInk = blueBlock.match(/--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandFill = palette.match(/:root[\s\S]*?--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueFill = blueBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandData = palette.match(/:root[\s\S]*?--v4-ink-data:\s*rgba\(var\(--v4-ink-rgb\),\s*([0-9.]+)\)/)?.[1];
    const blueData = blueBlock.match(/--v4-ink-data:\s*rgba\(var\(--v4-ink-rgb\),\s*([0-9.]+)\)/)?.[1];
    expect(sandInk).toBe('#201e1d');
    expect(blueInk).toBe('#101826');
    expect(sandData).toBe('0.56');
    expect(blueData).toBe('0.64');
    expect(sandFill).toBe('#7a8a5e');
    expect(blueFill).toBe('#4f9a78');
    expect(sandInk).not.toBe(blueInk);
    expect(sandFill).not.toBe(blueFill);
    expect(css).toContain('background: #b7c29b');
    expect(Math.round((8 / 10) * 40)).toBe(32);
    expect(Math.round((7 / 10) * 40)).toBe(28);
  });
});
