/**
 * Сведённый кусок home-widgets: кадр «Готовность ко сну · пункт без данных».
 * 2×1 — ключ, «N из M», строка 8.5 вместо чипов.
 * 143×64 — клетка стенда. Чек-лист, ритм, сон и окно не открывал.
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

describe('Готовность ко сну · пункт без данных — сведённый кусок', () => {
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
  const droppedFn = uiSrc.slice(
    uiSrc.indexOf('function sleepReadyDroppedText'),
    bodyAt,
  );

  it('читает семь строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Готовность ко сну · пункт без данных · 01'))
      .toBe('плитка: ширина 143px, высота 64px, флекс none');
    expect(contractValue(canvas, 'Готовность ко сну · пункт без данных · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Готовность ко сну · пункт без данных · 03'))
      .toBe('«К вечеру» — ключ');
    expect(contractValue(canvas, 'Готовность ко сну · пункт без данных · 04'))
      .toBe('«1 из 2» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Готовность ко сну · пункт без данных · 05'))
      .toBe('зазор 10px, отступ сверху auto');
    expect(contractValue(canvas, 'Готовность ко сну · пункт без данных · 06'))
      .toBe('«шаги без цели — пункт выпал из счёта» — шрифт 600 8.5px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Готовность ко сну · пункт без данных · текст'))
      .toBe('К вечеру › 1 из 2 › шаги без цели — пункт выпал из счёта');
  });

  it('держит объяснение вместо чипов; чек-лист и разбор живы', () => {
    expect(variantsSrc).toMatch(/sleepReady:\s*\[[\s\S]*?id:\s*'checklist'[\s\S]*?title:\s*'Чек-лист'[\s\S]*?size:\s*'2x1'/);
    expect(uiSrc).toContain("steps: 'без цели'");
    expect(droppedFn).toContain('SLEEP_READY_MISSING_REASON');
    expect(droppedFn).toContain('пункт выпал');
    expect(droppedFn).toContain('из счёта');
    expect(check).toContain("v4Kicker('К вечеру')");
    expect(check).toContain('widget-v4-sleepready-check__dropped');
    expect(check).toContain('droppedText');
    expect(check).toContain('widget-v4-checklist__chip');
    expect(check).not.toContain("'widget-v4-muted'");
    expect(review).toContain('widget-v4-goal-hero');
    expect(review).toContain('widget-v4-checklist__row');
    expect(review).toContain("'нет данных за день'");
    expect(review).not.toContain('widget-v4-sleepready-check__dropped');
  });

  it('держит строку 8.5 / 600; muted 10/700 и чипы чек-листа живы', () => {
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');
    const tight = rules.get('.widget-v4-row--tight');
    expect(tight['align-items']).toBe('baseline');

    const meta = rules.get('.widget-v4-row__meta');
    expect(meta['font-size']).toBe('9px');
    expect(meta['font-weight']).toBe('600');
    expect(meta.color).toContain('--v4-ink-data');

    const dots = rules.get('.widget-v4-sleepready-check .widget-v4-checklist--dots');
    expect(dots.gap).toBe('10px');
    expect(rules.get('.widget-v4-checklist--dots')['margin-top']).toBe('auto');

    const dropped = rules.get('.widget-v4-sleepready-check__dropped');
    expect(dropped['font-size']).toBe('8.5px');
    expect(dropped['font-weight']).toBe('600');
    expect(dropped['line-height']).toBe('1');
    expect(dropped.color).toContain('--v4-ink-data');

    const muted = rules.get('.widget-v4-muted');
    expect(muted['font-size']).toBe('10px');
    expect(muted['font-weight']).toBe('700');
    expect(muted.color).toContain('--v4-ink-data');

    const chip = rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip');
    expect(chip['font-size']).toBe('8.5px');
    expect(chip.gap).toBe('4px');
    expect(rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip.is-done').color)
      .toContain('--v4-ok-text');
    expect(rules.get('.widget-v4-checklist__row').gap).toBe('8px');
    expect(rules.get('.widget-v4-rhythm-empty__line').height).toBe('12px');
    expect(rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-value')['font-size'])
      .toBe('21px');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value')['font-size'])
      .toBe('21px');
  });

  it('чернила строки следуют набору; песок .56 ≠ синий .64', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    expect(palette).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.56)');
    expect(blue).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.64)');
    const ink = (block) => block.match(/--v4-ink:\s*([^;]+);/)?.[1]?.trim();
    expect(ink(sand)).toBe('#201e1d');
    expect(ink(blue)).toBe('#101826');
    expect(ink(sand)).not.toBe(ink(blue));
  });
});
