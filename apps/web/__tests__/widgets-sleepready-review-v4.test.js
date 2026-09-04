/**
 * Сведённый кусок home-widgets: кадр «Готовность ко сну · Разбор».
 * 2×2 — ключ, «до отбоя», герой 26 px, ряды с точками 7 px.
 * «51» — клетка стенда. Чек-лист, dropped, ритм и окно не открывал.
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

describe('Готовность ко сну · Разбор — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function SleepReadyVariantBody');
  const reviewAt = uiSrc.indexOf("if (variantId === 'review')", bodyAt);
  const checkAt = uiSrc.indexOf('widget-v4-sleepready-check', bodyAt);
  const review = uiSrc.slice(reviewAt, checkAt);
  const check = uiSrc.slice(checkAt, uiSrc.indexOf('function SleepReadyWidgetContent', checkAt));

  it('читает тринадцать строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 03')).toBe('«К вечеру» — ключ');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 04'))
      .toBe('«до отбоя 2:40» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 05'))
      .toBe('выравнивание baseline, зазор 5px, отступ сверху 7px');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 06'))
      .toBe('«2» — моноцифры: шрифт 600 26px/.9 Figtree, трекинг -.03em, цвет var(--tx)');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 07'))
      .toBe('направление column, зазор 8px, отступ сверху auto');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 08'))
      .toBe('выравнивание center, зазор 7px');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 09'))
      .toBe('флекс none, ширина 7px, высота 7px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 10'))
      .toBe('«Вода» — моноцифры: флекс 1, шрифт 600 10px/1 Figtree, цвет var(--tx)');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 11'))
      .toBe('«2,4 из 2,7 л» — моноцифры: шрифт 600 8.5px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · 12'))
      .toBe('флекс none, ширина 7px, высота 7px, радиус 999px, фон rgba(var(--ink),.08)');
    expect(contractValue(canvas, 'Готовность ко сну · Разбор · текст'))
      .toBe('51 › К вечеру › до отбоя 2:40 › из 3 закрыто › Вода › 2,4 из 2,7 л › Еда до сна › окно 2 ч 40 м › Шаги › 6 240 из 10 000');
  });

  it('держит вид 2×2: герой, ряды с точками; чек-лист без класса разбора', () => {
    expect(variantsSrc).toMatch(/sleepReady:\s*\[[\s\S]*?id:\s*'review'[\s\S]*?title:\s*'Разбор'[\s\S]*?size:\s*'2x2'/);
    expect(review).toContain('widget-v4-sleepready-review');
    expect(review).toContain("v4Kicker('К вечеру')");
    expect(review).toContain('до отбоя');
    expect(review).toContain('formatHoursColon(window.minutes)');
    expect(review).toContain('widget-v4-goal-hero');
    expect(review).toContain('из ${data.total} закрыто');
    expect(review).toContain('widget-v4-sleepready-review__dot');
    expect(review).toContain('widget-v4-checklist__row');
    expect(review).toContain('sleepReadyItemText');
    expect(review).not.toContain('widget-v4-checklist--dots');
    expect(review).not.toContain('widget-v4-sleepready-check');
    expect(check).toContain('widget-v4-sleepready-check');
    expect(check).toContain('widget-v4-sleepready-check__dropped');
    expect(check).toContain('widget-v4-checklist__chip');
    expect(check).not.toContain('widget-v4-sleepready-review');
  });

  it('держит герой 26 px и ряды 7 px; чек-лист 8.5 и соседи живы', () => {
    const hero = rules.get('.widget-v4-sleepready-review .widget-v4-goal-hero');
    expect(hero['align-items'] || rules.get('.widget-v4-goal-hero')['align-items']).toBe('baseline');
    expect(hero.gap).toBe('5px');
    expect(hero['margin-top']).toBe('7px');
    expect(rules.get('.widget-v4-goal-hero')['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-goal-hero').gap).toBe('4px');

    const value = rules.get('.widget-v4-sleepready-review .widget-v4-goal-value');
    expect(value['font-size']).toBe('26px');
    expect(value['line-height']).toBe('0.9');
    expect(value['letter-spacing']).toBe('-0.03em');
    expect(value.color).toContain('--v4-ink');
    expect(rules.get('.widget-v4-stack .widget-v4-goal-value')['font-size']).toBe('19px');
    expect(rules.get('.widget-v4-rhythm-intervals__value')['font-size']).toBe('26px');
    expect(rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-value')['font-size'])
      .toBe('21px');

    const list = rules.get('.widget-v4-sleepready-review .widget-v4-checklist');
    expect(list.gap).toBe('8px');
    expect(list['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-checklist').gap).toBe('5px');
    expect(rules.get('.widget-v4-checklist')['margin-top']).toBe('8px');

    const row = rules.get('.widget-v4-sleepready-review .widget-v4-checklist__row');
    expect(row['align-items']).toBe('center');
    expect(row.gap).toBe('7px');
    expect(rules.get('.widget-v4-checklist__row')['align-items']).toBe('baseline');
    expect(rules.get('.widget-v4-checklist__row').gap).toBe('8px');

    const label = rules.get('.widget-v4-sleepready-review .widget-v4-checklist__label');
    expect(label.flex).toBe('1');
    expect(label['font-size']).toBe('10px');
    expect(label['font-weight']).toBe('600');
    expect(label.color).toContain('--v4-ink');
    expect(rules.get('.widget-v4-sleepready-review .widget-v4-checklist__row.is-done .widget-v4-checklist__label').color)
      .toContain('--v4-ink');
    expect(rules.get('.widget-v4-checklist__row.is-done .widget-v4-checklist__label').color)
      .toContain('--v4-sand-ok-text');

    const val = rules.get('.widget-v4-sleepready-review .widget-v4-checklist__value');
    expect(val['font-size']).toBe('8.5px');
    expect(val['font-weight']).toBe('600');
    expect(val.color).toContain('--v4-ink-data');
    expect(rules.get('.widget-v4-checklist__value').color).toContain('--v4-ink');

    const dot = rules.get('.widget-v4-sleepready-review__dot');
    expect(dot.flex).toBe('none');
    expect(dot.width).toBe('7px');
    expect(dot.height).toBe('7px');
    expect(dot['border-radius']).toBe('999px');
    expect(dot.background).toContain('--v4-line');
    expect(rules.get('.widget-v4-sleepready-review .widget-v4-checklist__row.is-done .widget-v4-sleepready-review__dot').background)
      .toContain('--v4-ok-fill');

    const chip = rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip');
    expect(chip['font-size']).toBe('8.5px');
    expect(chip.gap).toBe('4px');
    expect(rules.get('.widget-v4-sleepready-check__dropped')['font-size']).toBe('8.5px');
    expect(rules.get('.widget-v4-checklist__dot').width).toBe('6px');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value')['font-size'])
      .toBe('21px');
    expect(rules.get('.widget-v4-rhythm-empty__line').height).toBe('12px');
  });

  it('шалфей точек и чернила следуют набору; песок ≠ синий', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const okFill = (block) => block.match(/--v4-ok-fill:\s*([^;]+);/)?.[1]?.trim();
    const ink = (block) => block.match(/--v4-ink:\s*([^;]+);/)?.[1]?.trim();
    const line = (block) => block.match(/--v4-line:\s*([^;]+);/)?.[1]?.trim();
    expect(okFill(sand)).toBe('#7a8a5e');
    expect(okFill(blue)).toBe('#4f9a78');
    expect(okFill(sand)).not.toBe(okFill(blue));
    expect(ink(sand)).toBe('#201e1d');
    expect(ink(blue)).toBe('#101826');
    expect(ink(sand)).not.toBe(ink(blue));
    expect(line(sand)).toBe('rgba(0, 0, 0, 0.08)');
    expect(line(blue)).toBe('rgba(0, 0, 0, 0.08)');
    expect(palette).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.56)');
    expect(blue).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.64)');
  });
});
