/**
 * Сведённый кусок: кадр «Динамика · D до цели».
 * Вид to_goal — «До цели», темп / мес, остаток, полоса 5/7 (та же, что у H).
 * C ряд 24, G-кривую, лист и график 2×2 не открывал.
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

describe('Динамика · D до цели — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function renderWeightDynamicsBody');
  const goalAt = uiSrc.indexOf("if (variant === 'to_goal')", bodyAt);
  const numAt = uiSrc.indexOf("if (variant === 'number_only')", goalAt);
  const goal = uiSrc.slice(goalAt, numAt > goalAt ? numAt : goalAt + 700);
  const crashBlock = variantsSrc.match(/crashRisk:\s*\[([\s\S]*?)\n\s*\]/)?.[1] || '';

  it('читает десять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Динамика · D до цели · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Динамика · D до цели · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Динамика · D до цели · 03'))
      .toBe('«До цели» — ключ');
    expect(contractValue(canvas, 'Динамика · D до цели · 04'))
      .toBe('«−1,8 / мес» — моноцифры: шрифт 700 10px/1 Figtree');
    expect(contractValue(canvas, 'Динамика · D до цели · 05'))
      .toBe('отступ сверху auto');
    expect(contractValue(canvas, 'Динамика · D до цели · 06'))
      .toBe('выравнивание baseline, зазор 4px');
    expect(contractValue(canvas, 'Динамика · D до цели · 07'))
      .toBe('«3,6» — моноцифры');
    expect(contractValue(canvas, 'Динамика · D до цели · 08'))
      .toBe('высота 5px, радиус 999px, фон rgba(var(--ink),.08), отступ сверху 7px');
    expect(contractValue(canvas, 'Динамика · D до цели · 09'))
      .toBe('ширина 62%, высота 5px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Динамика · D до цели · текст'))
      .toBe('До цели › −1,8 / мес › 3,6 › кг');
  });

  it('держит to_goal: ключ, темп, остаток, полоса; соседей не ломает', () => {
    expect(crashBlock).toMatch(/id:\s*'to_goal'[\s\S]*?sheet:\s*true/);
    expect(crashBlock).toMatch(/id:\s*'curve'[\s\S]*?isDefault:\s*true/);
    expect(crashBlock).toMatch(/id:\s*'number_only'[\s\S]*?sheet:\s*false/);
    expect(goal).toContain("'До цели'");
    expect(goal).toContain('widget-wd__head');
    expect(goal).toContain('widget-wd__side-delta');
    expect(goal).toContain('monthRate');
    expect(goal).toContain('widget-wd__goal-main');
    expect(goal).toContain('WeightDynamicsProgressBar');
    expect(goal).not.toContain('weightDynamicsDeltaKicker');
    expect(goal).not.toContain("'Вес по неделям'");
    expect(goal).not.toContain('WeightDynamicsSparkSvg');
    expect(uiSrc).toContain(' / мес');
    expect(uiSrc).toContain("'Вес по неделям'");
    expect(uiSrc).toContain('WeightDynamicsSparkSvg');
    expect(uiSrc).toContain('Сброшено за ${short}');
    expect(uiSrc).toContain('widget-trend-compact--sheet');
  });

  it('держит геометрию остатка и полосу 5/7; ряд C 24 не делит', () => {
    const main = rules.get('.widget-wd__goal-main');
    expect(main['align-items']).toBe('baseline');
    expect(main.gap).toBe('4px');
    expect(main['margin-top']).toBe('auto');
    expect(main['font-variant-numeric']).toBe('tabular-nums');

    const side = rules.get('.widget-wd__side-delta');
    expect(side['font-size']).toBe('10px');
    expect(side['font-weight']).toBe('700');
    expect(side['line-height']).toBe('1');

    const track = rules.get('.widget-wd__bar-track');
    expect(track.height).toBe('5px');
    expect(track['border-radius']).toBe('999px');
    expect(track['margin-top']).toBe('7px');
    expect(track.background).toContain('--v4-line');
    const fill = rules.get('.widget-wd__bar-fill');
    expect(fill.background).toContain('--v4-ok-fill');
    expect(fill.width).toBe('var(--wd-bar-pct, 0%)');

    expect(rules.get('.widget-wd__weeks').height).toBe('24px');
    expect(rules.get('.widget-wd__spark').flex).toBe('none');
    expect(rules.get('.widget-wd__chart.widget-v4-val--good').color)
      .toContain('--v4-sand-ok-fill');
    expect(css).not.toMatch(/widget-wd__bar-track[^{]*\{[^}]*height:\s*4px/);
  });

  it('темп и заливка следуют набору; песок ≠ синий у --gr2', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const role = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(role(sand, '--v4-line')).toBe('rgba(0, 0, 0, 0.08)');
    expect(role(blue, '--v4-line')).toBe('rgba(0, 0, 0, 0.08)');
    expect(role(sand, '--v4-ok-fill')).toBe('#7a8a5e');
    expect(role(blue, '--v4-ok-fill')).toBe('#4f9a78');
    expect(role(sand, '--v4-ok-fill')).not.toBe(role(blue, '--v4-ok-fill'));
    expect(role(sand, '--v4-sand-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-sand-ok-text')).toBe('#5c6a45');
  });
});
