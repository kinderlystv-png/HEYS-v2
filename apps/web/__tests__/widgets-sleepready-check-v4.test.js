/**
 * Сведённый кусок home-widgets: кадр «Готовность ко сну · Чек-лист».
 * 2×1 — ключ, «N из M», чипы точками 8.5 / gap 4, ряд gap 10.
 * «50» — клетка стенда. Ритм, еду, клетчатку и белок не открывал.
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

describe('Готовность ко сну · Чек-лист — сведённый кусок', () => {
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

  it('читает десять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Готовность ко сну · Чек-лист · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Готовность ко сну · Чек-лист · 02'))
      .toBe('распределение space-between, выравнивание baseline, зазор 6px');
    expect(contractValue(canvas, 'Готовность ко сну · Чек-лист · 03')).toBe('«К вечеру» — ключ');
    expect(contractValue(canvas, 'Готовность ко сну · Чек-лист · 04'))
      .toBe('«2 из 3» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Готовность ко сну · Чек-лист · 05'))
      .toBe('зазор 10px, отступ сверху auto, перенос строк wrap');
    expect(contractValue(canvas, 'Готовность ко сну · Чек-лист · 06'))
      .toBe('выравнивание center, зазор 4px, шрифт 600 8.5px/1 Figtree, цвет var(--gr)');
    expect(contractValue(canvas, 'Готовность ко сну · Чек-лист · 07'))
      .toBe('ширина 6px, высота 6px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Готовность ко сну · Чек-лист · 08'))
      .toBe('выравнивание center, зазор 4px, шрифт 600 8.5px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Готовность ко сну · Чек-лист · 09'))
      .toBe('ширина 6px, высота 6px, радиус 999px, фон rgba(var(--ink),.08)');
    expect(contractValue(canvas, 'Готовность ко сну · Чек-лист · текст'))
      .toBe('50 › К вечеру › 2 из 3 › вода › еда до сна › шаги');
  });

  it('держит вид 2×1: ключ, счётчик и чипы; разбор без класса чек-листа', () => {
    expect(variantsSrc).toMatch(/sleepReady:\s*\[[\s\S]*?id:\s*'checklist'[\s\S]*?title:\s*'Чек-лист'[\s\S]*?size:\s*'2x1'/);
    expect(check).toContain("v4Kicker('К вечеру')");
    expect(check).toContain('widget-v4-row__meta');
    expect(check).toContain('`${data.done} из ${data.total}`');
    expect(check).toContain('widget-v4-checklist--dots');
    expect(check).toContain('widget-v4-checklist__chip');
    expect(check).toContain('widget-v4-checklist__dot');
    expect(check).toContain('item.label.toLowerCase()');
    expect(check).toContain('droppedText');
    expect(review).toContain('widget-v4-goal-hero');
    expect(review).toContain('widget-v4-checklist__row');
    expect(review).not.toContain('widget-v4-sleepready-check');
    expect(review).not.toContain('widget-v4-checklist--dots');
  });

  it('держит ряд 10 px и чип 8.5 / gap 4; разбор и соседи живы', () => {
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');
    const tight = rules.get('.widget-v4-row--tight');
    expect(tight['align-items']).toBe('baseline');
    expect(tight.gap).toBe('6px');

    const meta = rules.get('.widget-v4-row__meta');
    expect(meta['font-size']).toBe('9px');
    expect(meta['font-weight']).toBe('600');
    expect(meta['line-height']).toBe('1');
    expect(meta.color).toContain('--v4-ink-data');

    const dots = rules.get('.widget-v4-sleepready-check .widget-v4-checklist--dots');
    expect(dots.gap).toBe('10px');
    expect(rules.get('.widget-v4-checklist--dots')['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-checklist--dots')['flex-wrap']).toBe('wrap');

    const chip = rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip');
    expect(chip.gap).toBe('4px');
    expect(chip['font-size']).toBe('8.5px');
    expect(chip['font-weight']).toBe('600');
    expect(chip['line-height']).toBe('1');
    expect(rules.get('.widget-v4-checklist__chip')['align-items']).toBe('center');
    expect(rules.get('.widget-v4-checklist__chip').color).toContain('--v4-ink-data');

    const done = rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip.is-done');
    expect(done.color).toContain('--v4-ok-text');
    expect(done.color).not.toContain('--v4-sand-ok-text');

    const openDot = rules.get('.widget-v4-sleepready-check .widget-v4-checklist__dot');
    expect(openDot.background).toContain('--v4-line');
    expect(openDot.opacity).toBe('1');
    expect(rules.get('.widget-v4-checklist__dot').width).toBe('6px');
    expect(rules.get('.widget-v4-checklist__dot').height).toBe('6px');
    expect(rules.get('.widget-v4-checklist__dot')['border-radius']).toBe('999px');

    const doneDot = rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip.is-done .widget-v4-checklist__dot');
    expect(doneDot.background).toContain('--v4-ok-fill');
    expect(doneDot.opacity).toBe('1');

    const sharedChip = rules.get('.widget-v4-checklist__chip');
    expect(sharedChip['font-size']).toBe('9.5px');
    expect(sharedChip.gap).toBe('5px');
    expect(rules.get('.widget-v4-checklist__chip.is-done').color).toContain('--v4-sand-ok-text');

    const reviewRow = rules.get('.widget-v4-checklist__row');
    expect(reviewRow.gap).toBe('8px');
    expect(reviewRow['font-size']).toBe('10px');
    expect(rules.get('.widget-v4-checklist').gap).toBe('5px');

    expect(rules.get('.widget-v4-rhythm-empty__line').height).toBe('12px');
    expect(rules.get('.widget-v4-rhythm-intervals__value')['font-size']).toBe('26px');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value')['font-size'])
      .toBe('21px');
  });

  it('шалфей и линия следуют набору; песок ≠ синий у текста и заливки', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const okText = (block) => block.match(/--v4-ok-text:\s*([^;]+);/)?.[1]?.trim();
    const okFill = (block) => block.match(/--v4-ok-fill:\s*([^;]+);/)?.[1]?.trim();
    const line = (block) => block.match(/--v4-line:\s*([^;]+);/)?.[1]?.trim();
    expect(okText(sand)).toBe('#5c6a45');
    expect(okText(blue)).toBe('#1f6e4d');
    expect(okText(sand)).not.toBe(okText(blue));
    expect(okFill(sand)).toBe('#7a8a5e');
    expect(okFill(blue)).toBe('#4f9a78');
    expect(okFill(sand)).not.toBe(okFill(blue));
    expect(line(sand)).toBe('rgba(0, 0, 0, 0.08)');
    expect(line(blue)).toBe('rgba(0, 0, 0, 0.08)');
    expect(palette).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.56)');
    expect(blue).toContain('--v4-ink-data: rgba(var(--v4-ink-rgb), 0.64)');
  });
});
