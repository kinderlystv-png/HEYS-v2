/**
 * Сведённый кусок home-widgets: кадр «Белок · По приёмам».
 * 2×2 — ключ, «из N», 26 px, полосы 5 px. Ширины 68/84/24/48 — демо 34/50…
 * продукт считает grams/maxMeal. Ритм «Интервалы» и закрытый белок не открывал.
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

describe('Белок · По приёмам — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const proteinAt = uiSrc.indexOf('function ProteinVariantBody');
  const meals = uiSrc.slice(proteinAt, uiSrc.indexOf("if (variantId === 'add')", proteinAt));
  const add = uiSrc.slice(
    uiSrc.indexOf("if (variantId === 'add')", proteinAt),
    uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-protein' }", proteinAt),
  );
  const now = uiSrc.slice(
    uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-protein' }", proteinAt),
    uiSrc.indexOf('function ProteinWidgetContent', proteinAt),
  );
  const intervalsAt = uiSrc.indexOf("v4Kicker('Ритм · интервалы')");
  const intervals = uiSrc.slice(intervalsAt, uiSrc.indexOf('function MealRhythmWidgetContent', intervalsAt));

  it('читает строки кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Белок · По приёмам · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Белок · По приёмам · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Белок · По приёмам · 03')).toBe('«Белок · по приёмам» — ключ');
    expect(contractValue(canvas, 'Белок · По приёмам · 04'))
      .toBe('«из 140» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Белок · По приёмам · 05'))
      .toBe('выравнивание baseline, зазор 5px, отступ сверху 7px');
    expect(contractValue(canvas, 'Белок · По приёмам · 06'))
      .toBe('«112» — моноцифры: шрифт 600 26px/.9 Figtree, трекинг -.03em, цвет var(--tx)');
    expect(contractValue(canvas, 'Белок · По приёмам · 07'))
      .toBe('направление column, зазор 6px, отступ сверху auto');
    expect(contractValue(canvas, 'Белок · По приёмам · 08'))
      .toBe('выравнивание center, зазор 7px');
    expect(contractValue(canvas, 'Белок · По приёмам · 09'))
      .toBe('«8:40» — моноцифры: флекс none, ширина 34px, шрифт 600 8.5px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Белок · По приёмам · 11'))
      .toBe('ширина 68%, высота 5px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Белок · По приёмам · 14'))
      .toBe('ширина 24%, высота 5px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Белок · По приёмам · текст'))
      .toBe('42 › Белок · по приёмам › из 140 › 112 › 8:40 › 34 › 13:05 › 42 › 16:40 › 12 › 19:30 › 24');
  });

  it('держит вид 2×2: шапка, герой 26 px, полосы от maxMeal; add и now живы', () => {
    expect(variantsSrc).toMatch(/protein:\s*\[[\s\S]*?id:\s*'by_meal'[\s\S]*?title:\s*'По приёмам'[\s\S]*?size:\s*'2x2'/);
    expect(meals).toContain('widget-v4-protein-meals');
    expect(meals).toContain("v4Kicker('Белок · по приёмам')");
    expect(meals).toContain('`из ${target}`');
    expect(meals).toContain('widget-v4-protein-meals__hero');
    expect(meals).toContain('widget-v4-protein-meals__value');
    expect(meals).toContain('widget-v4-protein-meals__bars');
    expect(meals).toContain('grams / maxMeal');
    expect(meals).toContain("'приёмов не было'");
    expect(meals).not.toContain('widget-v4-goal-hero');
    expect(meals).not.toContain('widget-v4-val--good');
    expect(add).toContain('widget-v4-protein-add');
    expect(now).toContain('v4GoalBar');
    expect(now).toContain(", 'г')");
    expect(intervals).toContain('widget-v4-val--good');
    expect(intervals).toContain('6 * 60');
  });

  it('держит числа героя и полос; общий mealbars ритма 4 px / gap 5 жив', () => {
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');
    const tight = rules.get('.widget-v4-row--tight');
    expect(tight['align-items']).toBe('baseline');

    const hero = rules.get('.widget-v4-protein-meals__hero');
    expect(hero['align-items']).toBe('baseline');
    expect(hero.gap).toBe('5px');
    expect(hero['margin-top']).toBe('7px');

    const value = rules.get('.widget-v4-protein-meals__value');
    expect(value['font-size']).toBe('26px');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('0.9');
    expect(value['letter-spacing']).toBe('-0.03em');

    const bars = rules.get('.widget-v4-mealbars.widget-v4-protein-meals__bars');
    expect(bars.gap).toBe('6px');
    expect(bars['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-mealbars').gap).toBe('5px');
    expect(rules.get('.widget-v4-mealbars')['margin-top']).toBe('8px');
    expect(rules.get('.widget-v4-mealbars__row')['align-items']).toBe('center');
    expect(rules.get('.widget-v4-mealbars__row').gap).toBe('7px');

    const time = rules.get('.widget-v4-protein-meals__bars .widget-v4-mealbars__time');
    expect(time.width).toBe('34px');
    expect(time['font-size']).toBe('8.5px');
    expect(rules.get('.widget-v4-mealbars__time')['font-size']).toBe('9.5px');

    const track = rules.get('.widget-v4-protein-meals__bars .widget-v4-mealbars__track');
    expect(track.height).toBe('5px');
    expect(rules.get('.widget-v4-mealbars__track').height).toBe('4px');
    expect(rules.get('.widget-v4-mealbars__track').background).toContain('--v4-line');

    const fill = rules.get('.widget-v4-protein-meals__bars .widget-v4-mealbars__fill');
    expect(fill.background).toContain('--v4-ok-fill');
    expect(rules.get('.widget-v4-mealbars__fill').background).toBe('currentColor');

    const num = rules.get('.widget-v4-protein-meals__bars .widget-v4-mealbars__num');
    expect(num['font-size']).toBe('8.5px');
    expect(num.color).toContain('--v4-ink');
    expect(rules.get('.widget-v4-mealbars__num').color).toContain('--v4-ink-data');

    expect(rules.get('.widget-v4-protein-add__head').gap).toBe('6px');
    expect(rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-hero').gap).toBe('3px');
  });

  it('цвет числа и заливки — роли, песок ≠ синий; 68 % кадра = 34/50 демо', () => {
    const sandInk = palette.match(/:root[\s\S]*?--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const blueInk = blueBlock.match(/--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandFill = palette.match(/:root[\s\S]*?--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueFill = blueBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(sandInk).toBe('#201e1d');
    expect(blueInk).toBe('#101826');
    expect(sandFill).toBe('#7a8a5e');
    expect(blueFill).toBe('#4f9a78');
    expect(sandInk).not.toBe(blueInk);
    expect(sandFill).not.toBe(blueFill);
    expect(Math.round((34 / 50) * 100)).toBe(68);
    expect(Math.round((42 / 50) * 100)).toBe(84);
    expect(Math.round((12 / 50) * 100)).toBe(24);
    expect(Math.round((24 / 50) * 100)).toBe(48);
    expect(Math.round((34 / 42) * 100)).toBe(81);
  });
});
