/**
 * Сведённый кусок: кадр «Шаги · Месяц».
 * 2×2 — ключ отдельно, герой 26px/.9 + «в день» + «цель N», ряд 44 px с пунктиром.
 * Высоты 30/26/40… — стенд; продукт считает value/max × 40.
 * Неделю, воду, динамику F/C/H/G/D/E не открывал.
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

describe('Шаги · Месяц — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function StepsVariantBody');
  const monthAt = uiSrc.indexOf("if (variantId === 'month')", bodyAt);
  const weekAt = uiSrc.indexOf('// 2×1 «Неделя»', monthAt);
  const month = uiSrc.slice(monthAt, weekAt);
  const bars = uiSrc.slice(
    uiSrc.indexOf('function v4StepsBars'),
    uiSrc.indexOf('function StepsVariantBody'),
  );

  it('читает четырнадцать строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Шаги · Месяц · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Шаги · Месяц · 02')).toBe('«Шаги · месяц» — ключ');
    expect(contractValue(canvas, 'Шаги · Месяц · 03'))
      .toBe('выравнивание baseline, зазор 5px, отступ сверху 8px');
    expect(contractValue(canvas, 'Шаги · Месяц · 04'))
      .toBe('«8 870» — моноцифры: шрифт 600 26px/.9 Figtree, трекинг -.03em, цвет var(--tx)');
    expect(contractValue(canvas, 'Шаги · Месяц · 05'))
      .toBe('«цель 10 000» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Шаги · Месяц · 06'))
      .toBe('позиция relative, выравнивание flex-end, зазор 2px, высота 44px, отступ сверху auto');
    expect(contractValue(canvas, 'Шаги · Месяц · 07'))
      .toBe('позиция absolute, разделитель сверху 1.5px dashed rgba(var(--ink),.22)');
    expect(contractValue(canvas, 'Шаги · Месяц · 08'))
      .toBe('флекс 1, высота 30px, радиус 1px 1px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Шаги · Месяц · 09'))
      .toBe('флекс 1, высота 26px, радиус 1px 1px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Шаги · Месяц · 10'))
      .toBe('флекс 1, высота 40px, радиус 1px 1px 0 0, фон var(--gr2)');
    expect(contractValue(canvas, 'Шаги · Месяц · 11'))
      .toBe('флекс 1, высота 22px, радиус 1px 1px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Шаги · Месяц · 12'))
      .toBe('флекс 1, высота 37px, радиус 1px 1px 0 0, фон var(--gr2)');
    expect(contractValue(canvas, 'Шаги · Месяц · 13'))
      .toBe('флекс 1, высота 33px, радиус 1px 1px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Шаги · Месяц · текст'))
      .toBe('36 › Шаги · месяц › 8 870 › в день › цель 10 000');
  });

  it('держит month 2×2: ключ, герой, пунктир и столбики из данных; неделя не делит', () => {
    expect(variantsSrc).toMatch(/steps:\s*\[[\s\S]*?id:\s*'month'[\s\S]*?size:\s*'2x2'/);
    expect(month).toContain('widget-v4-steps--month');
    expect(month).toContain("v4Kicker('Шаги · месяц')");
    expect(month).toContain('widget-v4-steps__hero--month');
    expect(month).toContain('widget-v4-steps__goal');
    expect(month).toContain('`цель ${formatRuThousands(goal)}`');
    expect(month).toContain("v4StepsBars(data?.month, goal, 'widget-v4-stepbars--month', { plotPx: 40, showNorm: true })");
    expect(month).not.toContain('widget-v4-steps--week');
    expect(month).not.toContain('widget-v4-row--tight');
    expect(bars).toContain('widget-v4-stepbars__norm');
    expect(bars).toContain('plotPx');
    expect(bars).toContain('showNorm');
  });

  it('держит герой и ряд 44 px; radius 1 только у месяца; соседей не ломает', () => {
    const hero = rules.get('.widget-v4-steps--month .widget-v4-steps__hero--month');
    expect(hero['align-items']).toBe('baseline');
    expect(hero.gap).toBe('5px');
    expect(hero['margin-top']).toBe('8px');

    const value = rules.get('.widget-v4-steps--month .widget-v4-steps__hero--month .widget-v4-steps__value');
    expect(value['font-size']).toBe('26px');
    expect(value['line-height']).toBe('0.9');
    expect(value['letter-spacing']).toBe('-0.03em');
    expect(value.color).toContain('--v4-ink');

    const goal = rules.get('.widget-v4-steps--month .widget-v4-steps__goal');
    expect(goal['margin-left']).toBe('auto');

    const meta = rules.get('.widget-v4-row__meta');
    expect(meta['font-size']).toBe('9px');
    expect(meta.color).toContain('--v4-ink-data');

    const barsRow = rules.get('.widget-v4-stepbars--month');
    expect(barsRow.position).toBe('relative');
    expect(rules.get('.widget-v4-stepbars')['align-items']).toBe('flex-end');
    expect(barsRow.gap).toBe('2px');
    expect(barsRow.height).toBe('44px');
    expect(rules.get('.widget-v4-stepbars')['margin-top']).toBe('auto');

    const norm = rules.get('.widget-v4-stepbars__norm');
    expect(norm.position).toBe('absolute');
    expect(norm.top).toBe('8px');
    expect(norm['border-top']).toContain('1.5px dashed');

    const monthBar = rules.get('.widget-v4-stepbars--month .widget-v4-stepbars__bar');
    expect(monthBar['border-radius']).toBe('1px 1px 0 0');

    const weekBar = rules.get('.widget-v4-stepbars__bar');
    expect(weekBar['border-radius']).toBe('2px 2px 0 0');

    expect(rules.get('.widget-wd__compact-val')['font-size']).toBe('17px');
    expect(rules.get('.widget-wd__weeks').height).toBe('24px');
  });

  it('чернила героя и --gr2 различают наборы; обычный столбик — один литерал', () => {
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const sandInk = palette.match(/:root[\s\S]*?--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueInk = blueBlock.match(/--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandData = palette.match(/:root[\s\S]*?--v4-ink-data:\s*rgba\(var\(--v4-ink-rgb\),\s*([0-9.]+)\)/)?.[1];
    const blueData = blueBlock.match(/--v4-ink-data:\s*rgba\(var\(--v4-ink-rgb\),\s*([0-9.]+)\)/)?.[1];
    const sandFill = palette.match(/:root[\s\S]*?--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueFill = blueBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(sandInk).toBeTruthy();
    expect(blueInk).toBeTruthy();
    expect(sandInk).not.toBe(blueInk);
    expect(sandData).toBe('0.56');
    expect(blueData).toBe('0.64');
    expect(sandFill).toBe('#7a8a5e');
    expect(blueFill).toBe('#4f9a78');
    expect(sandFill).not.toBe(blueFill);
    expect(css).toMatch(/\.widget-v4-stepbars__bar \{[^}]*background:\s*#b7c29b/);
  });
});
