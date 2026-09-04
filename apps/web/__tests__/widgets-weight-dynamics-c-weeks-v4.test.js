/**
 * Сведённый кусок: кадр «Динамика · C столбики».
 * Вид weeks — «Вес по неделям», боковая дельта 700 10px, ряд 24 px.
 * Высоты 24/19/20/13 — стенд; продукт берёт heightPct. H-полосу 5/7 не открывал.
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

describe('Динамика · C столбики — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const dynSrc = fs.readFileSync(DYN, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function renderWeightDynamicsBody');
  const weeksAt = uiSrc.indexOf("if (variant === 'weeks')", bodyAt);
  const toGoalAt = uiSrc.indexOf("if (variant === 'to_goal')", weeksAt);
  const weeks = uiSrc.slice(weeksAt, toGoalAt > weeksAt ? toGoalAt : weeksAt + 500);
  const barsAt = uiSrc.indexOf('function WeightDynamicsWeekBars');
  const bars = uiSrc.slice(barsAt, uiSrc.indexOf('function useWeightDynamicsMotion', barsAt));
  const crashBlock = variantsSrc.match(/crashRisk:\s*\[([\s\S]*?)\n\s*\]/)?.[1] || '';

  it('читает десять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Динамика · C столбики · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Динамика · C столбики · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Динамика · C столбики · 03'))
      .toBe('«Вес по неделям» — ключ');
    expect(contractValue(canvas, 'Динамика · C столбики · 04'))
      .toBe('«−1,8» — моноцифры: шрифт 700 10px/1 Figtree');
    expect(contractValue(canvas, 'Динамика · C столбики · 05'))
      .toBe('выравнивание flex-end, зазор 4px, высота 24px, отступ сверху auto');
    expect(contractValue(canvas, 'Динамика · C столбики · 06'))
      .toBe('флекс 1, высота 24px, радиус 2px, фон rgba(var(--ink),.13)');
    expect(contractValue(canvas, 'Динамика · C столбики · 07'))
      .toBe('флекс 1, высота 19px, радиус 2px, фон rgba(var(--ink),.13)');
    expect(contractValue(canvas, 'Динамика · C столбики · 08'))
      .toBe('флекс 1, высота 20px, радиус 2px, фон rgba(var(--ink),.13)');
    expect(contractValue(canvas, 'Динамика · C столбики · 09'))
      .toBe('флекс 1, высота 13px, радиус 2px, фон var(--gr2)');
    expect(contractValue(canvas, 'Динамика · C столбики · текст'))
      .toBe('Вес по неделям › −1,8');
  });

  it('держит weeks: ключ, боковая дельта, столбики из данных; соседей не ломает', () => {
    expect(crashBlock).toMatch(/id:\s*'weeks'[\s\S]*?sheet:\s*true/);
    expect(crashBlock).toMatch(/id:\s*'curve'[\s\S]*?isDefault:\s*true/);
    expect(crashBlock).toMatch(/id:\s*'number_only'[\s\S]*?sheet:\s*false/);
    expect(weeks).toContain("'Вес по неделям'");
    expect(weeks).toContain('widget-wd__head');
    expect(weeks).toContain('widget-wd__side-delta');
    expect(weeks).toContain('WeightDynamicsWeekBars');
    expect(weeks).not.toContain('weightDynamicsDeltaKicker');
    expect(weeks).not.toContain('WeightDynamicsSparkSvg');
    expect(weeks).not.toContain('WeightDynamicsProgressBar');
    expect(bars).toContain('widget-wd__weeks');
    expect(bars).toContain('widget-wd__week-col');
    expect(bars).toContain('--wd-week-h');
    expect(bars).toContain('bar.heightPct');
    expect(dynSrc).toContain('heightPct: Math.round(20 + ((max - c.avg) / span) * 80)');
    expect(uiSrc).toContain('WeightDynamicsSparkSvg');
    expect(uiSrc).toContain('widget-wd__bar-track');
    expect(css).toMatch(/\.widget-wd__bar-track\s*\{[^}]*height:\s*5px/);
    expect(css).toMatch(/\.widget-wd__bar-track\s*\{[^}]*margin-top:\s*7px/);
    expect(uiSrc).toContain('Сброшено за ${short}');
    expect(uiSrc).toContain('widget-trend-compact--sheet');
  });

  it('держит ряд 24 px; живая 2×1 не сжимает; px столбиков не хардкод', () => {
    const row = rules.get('.widget-wd__weeks');
    expect(row['align-items']).toBe('flex-end');
    expect(row.gap).toBe('4px');
    expect(row.height).toBe('24px');
    expect(row['margin-top']).toBe('auto');
    expect(rules.get('.widget--crashRisk.widget--2x1 .widget-wd:not(.widget-wd--preview) .widget-wd__weeks'))
      .toBeUndefined();

    const col = rules.get('.widget-wd__week-col');
    expect(col.flex).toBe('1');
    expect(col['border-radius']).toBe('2px');
    expect(col.background).toBe('rgba(0, 0, 0, 0.13)');
    expect(col.height).toBe('var(--wd-week-h, 20%)');
    expect(rules.get('.widget-wd__week-col.widget-v4-val--good').background)
      .toContain('--v4-ok-fill');

    const side = rules.get('.widget-wd__side-delta');
    expect(side['font-size']).toBe('10px');
    expect(side['font-weight']).toBe('700');
    expect(side['line-height']).toBe('1');

    expect(rules.get('.widget-wd__bar-track').height).toBe('5px');
    expect(rules.get('.widget-wd__bar-track')['margin-top']).toBe('7px');
    expect(rules.get('.widget-wd__spark').flex).toBe('none');
    expect(rules.get('.widget-wd__chart.widget-v4-val--good').color)
      .toContain('--v4-sand-ok-fill');
  });

  it('последний столбик --gr2 различает наборы; дорожка 13 % одна на светлых', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const role = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(role(sand, '--v4-ok-fill')).toBe('#7a8a5e');
    expect(role(blue, '--v4-ok-fill')).toBe('#4f9a78');
    expect(role(sand, '--v4-ok-fill')).not.toBe(role(blue, '--v4-ok-fill'));
    expect(role(sand, '--v4-sand-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-sand-ok-text')).toBe('#5c6a45');
  });
});
