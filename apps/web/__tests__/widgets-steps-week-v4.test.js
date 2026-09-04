/**
 * Сведённый кусок: кадр «Шаги · Неделя».
 * 2×1 — ключ «Шаги» nowrap, «в среднем N», ряд столбиков 30 px.
 * Высоты 26/21/30/17/29/25/27 — стенд; продукт считает value/max × 30.
 * Месяц, воду, динамику F/C/H/G/D/E не открывал.
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

describe('Шаги · Неделя — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function StepsVariantBody');
  const monthAt = uiSrc.indexOf("if (variantId === 'month')", bodyAt);
  const weekAt = uiSrc.indexOf('// 2×1 «Неделя»', monthAt);
  const weekEnd = uiSrc.indexOf('function StepsWidgetContent', weekAt);
  const month = uiSrc.slice(monthAt, weekAt);
  const week = uiSrc.slice(weekAt, weekEnd);
  const bars = uiSrc.slice(
    uiSrc.indexOf('function v4StepsBars'),
    uiSrc.indexOf('function StepsVariantBody'),
  );

  it('читает тринадцать строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Шаги · Неделя · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Шаги · Неделя · 02'))
      .toBe('распределение space-between, выравнивание baseline, зазор 6px');
    expect(contractValue(canvas, 'Шаги · Неделя · 03'))
      .toBe('«Шаги» — ключ: перенос nowrap');
    expect(contractValue(canvas, 'Шаги · Неделя · 04'))
      .toBe('«в среднем 8 940» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Шаги · Неделя · 05'))
      .toBe('выравнивание flex-end, зазор 3px, высота 30px, отступ сверху auto');
    expect(contractValue(canvas, 'Шаги · Неделя · 06'))
      .toBe('флекс 1, высота 26px, радиус 2px 2px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Шаги · Неделя · 07'))
      .toBe('флекс 1, высота 21px, радиус 2px 2px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Шаги · Неделя · 08'))
      .toBe('флекс 1, высота 30px, радиус 2px 2px 0 0, фон var(--gr2)');
    expect(contractValue(canvas, 'Шаги · Неделя · 09'))
      .toBe('флекс 1, высота 17px, радиус 2px 2px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Шаги · Неделя · 10'))
      .toBe('флекс 1, высота 29px, радиус 2px 2px 0 0, фон var(--gr2)');
    expect(contractValue(canvas, 'Шаги · Неделя · 11'))
      .toBe('флекс 1, высота 25px, радиус 2px 2px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Шаги · Неделя · 12'))
      .toBe('флекс 1, высота 27px, радиус 2px 2px 0 0, фон #b7c29b');
    expect(contractValue(canvas, 'Шаги · Неделя · текст'))
      .toBe('35 › Шаги › в среднем 8 940');
  });

  it('держит week 2×1: ключ, среднее, столбики из данных; месяц не делит', () => {
    expect(variantsSrc).toMatch(/steps:\s*\[[\s\S]*?id:\s*'week'[\s\S]*?size:\s*'2x1'[\s\S]*?isDefault:\s*true/);
    expect(week).toContain('widget-v4-steps--week');
    expect(week).toContain("v4Kicker('Шаги')");
    expect(week).toContain('widget-v4-row--tight');
    expect(week).toContain('widget-v4-row__meta');
    expect(week).toContain('`в среднем ${formatRuThousands(avg)}`');
    expect(week).toContain('v4StepsBars(data?.week, goal)');
    expect(week).not.toContain("v4Kicker('Шаги · месяц')");
    expect(week).not.toContain('widget-v4-stepbars--month');
    expect(month).toContain("v4Kicker('Шаги · месяц')");
    expect(month).not.toContain('widget-v4-steps--week');
    expect(bars).toContain('widget-v4-stepbars__bar');
    expect(bars).toContain("Math.max(2, Math.round((value / max) * 30)) + 'px'");
    expect(bars).toContain('is-goal');
    expect(uiSrc).toContain("'Мес'");
    expect(uiSrc).toContain("'Вес по неделям'");
    expect(uiSrc).toContain('function WeightDynamicsChartSvg');
    expect(uiSrc).toContain('widget-wd__bar-track');
  });

  it('держит шапку и ряд 30 px; nowrap только у недели; соседей не ломает', () => {
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');

    const tight = rules.get('.widget-v4-row--tight');
    expect(tight['align-items']).toBe('baseline');
    expect(tight.gap).toBe('6px');

    const key = rules.get('.widget-v4-steps--week .widget-v4-kicker');
    expect(key['white-space']).toBe('nowrap');

    const meta = rules.get('.widget-v4-row__meta');
    expect(meta['font-size']).toBe('9px');
    expect(meta['font-weight']).toBe('600');
    expect(meta['line-height']).toBe('1');
    expect(meta.color).toContain('--v4-ink-data');
    expect(meta['font-variant-numeric']).toBe('tabular-nums');

    const barsRow = rules.get('.widget-v4-stepbars');
    expect(barsRow['align-items']).toBe('flex-end');
    expect(barsRow.gap).toBe('3px');
    expect(barsRow.height).toBe('30px');
    expect(barsRow['margin-top']).toBe('auto');

    const bar = rules.get('.widget-v4-stepbars__bar');
    expect(bar.flex).toBe('1');
    expect(bar['border-radius']).toBe('2px 2px 0 0');
    expect(bar.background).toBe('#b7c29b');
    expect(rules.get('.widget-v4-stepbars__bar.is-goal').background)
      .toContain('--v4-ok-fill');

    expect(rules.get('.widget-wd__compact-val')['font-size']).toBe('17px');
    expect(rules.get('.widget-wd__weeks').height).toBe('24px');
    expect(rules.get('.widget-wd__bar-track').height).toBe('5px');
    expect(rules.get('.widget-wd__chart.widget-v4-val--good').color)
      .toContain('--v4-sand-ok-fill');
  });

  it('чернила шапки и --gr2 различают наборы; обычный столбик — один литерал', () => {
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const sandData = palette.match(/:root[\s\S]*?--v4-ink-data:\s*rgba\(var\(--v4-ink-rgb\),\s*([0-9.]+)\)/)?.[1];
    const blueData = blueBlock.match(/--v4-ink-data:\s*rgba\(var\(--v4-ink-rgb\),\s*([0-9.]+)\)/)?.[1];
    const sandFill = palette.match(/:root[\s\S]*?--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueFill = blueBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(sandData).toBe('0.56');
    expect(blueData).toBe('0.64');
    expect(sandFill).toBe('#7a8a5e');
    expect(blueFill).toBe('#4f9a78');
    expect(sandData).not.toBe(blueData);
    expect(sandFill).not.toBe(blueFill);
    expect(css).toMatch(/\.widget-v4-stepbars__bar \{[\s\S]*?background:\s*#b7c29b/);
  });
});
