/**
 * Сведённый кусок: кадр «Динамика · H сброшено и остаток».
 * Вид bar_remainder — «Вес за месяц», «осталось N», дельта, полоса 5 px / 7.
 * Шапка «Сброшено за месяц», лист «Только цифра», G-кривая и график 2×2 не открывал.
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
const DYN = path.join(WEB_DIR, 'heys_widgets_weight_dynamics_v4.js');

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`))?.[1] || '';
}

describe('Динамика · H сброшено и остаток — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const dynSrc = fs.readFileSync(DYN, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function renderWeightDynamicsBody');
  const barAt = uiSrc.indexOf("if (variant === 'bar_remainder')", bodyAt);
  const chartAt = uiSrc.indexOf('// Кадр «Динамика · E график 2×2»', barAt);
  const bar = uiSrc.slice(barAt, chartAt > barAt ? chartAt : barAt + 600);
  const curveAt = uiSrc.indexOf('// curve (default)', bodyAt);
  const curve = uiSrc.slice(curveAt, uiSrc.indexOf('function CrashRiskDynamicsVariantTile', curveAt));
  const crashBlock = variantsSrc.match(/crashRisk:\s*\[([\s\S]*?)\n\s*\]/)?.[1] || '';

  it('читает девять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Динамика · H сброшено и остаток · 01'))
      .toBe('плитка');
    expect(contractValue(canvas, 'Динамика · H сброшено и остаток · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Динамика · H сброшено и остаток · 03'))
      .toBe('«Вес за месяц» — ключ');
    expect(contractValue(canvas, 'Динамика · H сброшено и остаток · 04'))
      .toBe('«осталось 3,6» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Динамика · H сброшено и остаток · 05'))
      .toBe('выравнивание baseline, зазор 3px, отступ сверху auto');
    expect(contractValue(canvas, 'Динамика · H сброшено и остаток · 06'))
      .toBe('«−1,8» — моноцифры');
    expect(contractValue(canvas, 'Динамика · H сброшено и остаток · 07'))
      .toBe('высота 5px, радиус 999px, фон rgba(var(--ink),.08), отступ сверху 7px');
    expect(contractValue(canvas, 'Динамика · H сброшено и остаток · 08'))
      .toBe('ширина 62%, высота 5px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Динамика · H сброшено и остаток · текст'))
      .toBe('Вес за месяц › осталось 3,6 › −1,8 › кг');
  });

  it('держит bar_remainder: ключ, «осталось N», полоса; соседей не ломает', () => {
    expect(crashBlock).toMatch(/id:\s*'bar_remainder'[\s\S]*?sheet:\s*true/);
    expect(crashBlock).toMatch(/id:\s*'curve'[\s\S]*?isDefault:\s*true/);
    expect(crashBlock).toMatch(/id:\s*'number_only'[\s\S]*?sheet:\s*false/);
    expect(bar).toContain('widget-wd__head');
    expect(bar).toContain('windowLabel');
    expect(bar).toContain('headerRight');
    expect(bar).toContain('widget-wd__num-row');
    expect(bar).toContain('WeightDynamicsProgressBar');
    expect(bar).not.toContain('weightDynamicsDeltaKicker');
    expect(bar).not.toContain("'Вес по неделям'");
    expect(bar).not.toContain('WeightDynamicsSparkSvg');
    expect(curve).toContain('WeightDynamicsSparkSvg');
    expect(dynSrc).toContain("label: 'Вес за месяц'");
    expect(dynSrc).toContain('remainderShort = `осталось ${abs}`');
    expect(uiSrc).toContain("if (variant === 'bar_remainder' || variant === 'to_goal')");
    expect(uiSrc).toContain('return dyn.remainderShort');
    expect(uiSrc).toContain("'Вес по неделям'");
    expect(uiSrc).toContain('Сброшено за ${short}');
    expect(uiSrc).toContain('widget-trend-compact--sheet');
  });

  it('держит полосу 5 px / отступ 7; живая 2×1 не сжимает', () => {
    const track = rules.get('.widget-wd__bar-track');
    expect(track.height).toBe('5px');
    expect(track['border-radius']).toBe('999px');
    expect(track['margin-top']).toBe('7px');
    expect(track.background).toContain('--v4-line');

    const fill = rules.get('.widget-wd__bar-fill');
    expect(fill.height).toBe('100%');
    expect(fill['border-radius']).toBe('999px');
    expect(fill.background).toContain('--v4-ok-fill');
    expect(fill.width).toBe('var(--wd-bar-pct, 0%)');

    expect(rules.get('.widget--crashRisk.widget--2x1 .widget-wd:not(.widget-wd--preview) .widget-wd__bar-track'))
      .toBeUndefined();
    expect(css).not.toMatch(/widget-wd__bar-track[^{]*\{[^}]*height:\s*4px/);

    const rem = rules.get('.widget-wd__remainder');
    expect(rem['font-size']).toBe('9px');
    expect(rem['font-weight']).toBe('600');
    expect(rem.color).toContain('--v4-ink-data');

    const row = rules.get('.widget-wd__num-row');
    expect(row['margin-top']).toBe('auto');
    const delta = rules.get('.widget-wd__delta');
    expect(delta['align-items']).toBe('baseline');
    expect(delta.gap).toBe('3px');

    expect(rules.get('.widget-wd__spark').flex).toBe('none');
    expect(rules.get('.widget-wd__chart.widget-v4-val--good').color)
      .toContain('--v4-sand-ok-fill');
    expect(rules.get('.widget--crashRisk.widget--2x1 .widget-wd:not(.widget-wd--preview) .widget-wd__weeks').height)
      .toBe('22px');
  });

  it('дорожка и заливка следуют набору; песок ≠ синий у --gr2', () => {
    const root = palette.slice(palette.indexOf(':root {'), palette.indexOf('[data-theme-id="sand"]'));
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const role = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(role(sand, '--v4-line')).toBe('rgba(0, 0, 0, 0.08)');
    expect(role(blue, '--v4-line')).toBe('rgba(0, 0, 0, 0.08)');
    expect(role(root, '--v4-ink-data')).toBe('rgba(var(--v4-ink-rgb), 0.56)');
    expect(role(blue, '--v4-ink-data')).toBe('rgba(var(--v4-ink-rgb), 0.64)');
    expect(role(sand, '--v4-ok-fill')).toBe('#7a8a5e');
    expect(role(blue, '--v4-ok-fill')).toBe('#4f9a78');
    expect(role(sand, '--v4-ok-fill')).not.toBe(role(blue, '--v4-ok-fill'));
  });
});
