/**
 * Сведённый кусок home-widgets: кадр «Оценка дня · Из чего сложилась».
 * 2×1 — шапка, пять полос факторов. «Как сейчас» и «Семь дней» не открывал.
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

describe('Оценка дня · Из чего сложилась — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function DayScoreVariantBody');
  const bodyEnd = uiSrc.indexOf('function DayScoreWidgetContent', bodyAt);
  const body = uiSrc.slice(bodyAt, bodyEnd);
  const factorsAt = body.indexOf("if (resolvedVariant === 'factors')");
  const weekAt = body.indexOf('// Кадр «Шторка · Оценка дня», вид «Семь дней»');
  const factors = body.slice(factorsAt, weekAt);

  it('читает одиннадцать строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · 03')).toBe('«Оценка дня» — ключ');
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · 04'))
      .toBe('«6,2» — моноцифры: шрифт 600 16px/1 Figtree, цвет var(--ac)');
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · 05')).toBe('зазор 5px, отступ сверху auto');
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · 06'))
      .toBe('флекс 1, ширина от 0, выключка center');
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · 07'))
      .toBe('высота 5px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · 08'))
      .toBe('«еда» — шрифт 600 8px/1 Figtree, цвет rgba(var(--ink),.56), отступ сверху 5px');
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · 09'))
      .toBe('высота 5px, радиус 999px, фон var(--ovl)');
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · 10'))
      .toBe('высота 5px, радиус 999px, фон var(--val-bad)');
    expect(contractValue(canvas, 'Оценка дня · Из чего сложилась · текст'))
      .toBe('17 › Оценка дня › 6,2 › / 10 › еда › вода › сон › актив › срыв');
  });

  it('держит factors 2×1: шапка, scoreSlashTen 16 px, пять столбиков', () => {
    expect(variantsSrc).toMatch(
      /dayScore:\s*\[[\s\S]*?id:\s*'factors'[\s\S]*?title:\s*'Из чего сложилась'[\s\S]*?size:\s*'2x1'/,
    );
    expect(factors).toContain("v4Kicker('Оценка дня')");
    expect(factors).toContain('scoreSlashTen(\'widget-v4-row__value\', 16)');
    expect(factors).toContain('widget-v4-factor-cols');
    expect(factors).toContain('widget-v4-factor-cols__bar--');
    expect(factors).not.toContain('widget-v4-week-bars');
    expect(factors).not.toContain("v4Kicker('Оценка · 7 дней')");
  });

  it('держит space-between/baseline, ряд 5 px и подписи 8 px', () => {
    expect(rules.get('.widget-v4-row')['justify-content']).toBe('space-between');
    expect(rules.get('.widget-v4-row--tight')['align-items']).toBe('baseline');

    const cols = rules.get('.widget-v4-factor-cols');
    expect(cols.gap).toBe('5px');
    expect(cols['margin-top']).toBe('auto');

    const item = rules.get('.widget-v4-factor-cols__item');
    expect(item.flex).toBe('1');
    expect(item['text-align']).toBe('center');

    const bar = rules.get('.widget-v4-factor-cols__bar');
    expect(bar.height).toBe('5px');
    expect(bar['border-radius']).toBe('999px');

    const label = rules.get('.widget-v4-factor-cols__label');
    expect(label['font-size']).toBe('8px');
    expect(label['margin-top']).toBe('5px');
    expect(label.color).toContain('--v4-ink-data');
  });

  it('тон полос — роли good/warn/bad; песок ≠ синий на ok-fill и warn', () => {
    const sandBlock = palette.slice(0, palette.indexOf('[data-theme-id="blue"]'));
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const sandOk = sandBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueOk = blueBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandWarn = sandBlock.match(/--v4-warn-1:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueWarn = blueBlock.match(/--v4-warn-1:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(sandOk).toBe('#7a8a5e');
    expect(blueOk).toBe('#4f9a78');
    expect(sandOk).not.toBe(blueOk);
    expect(sandWarn).toBe('#d99a63');
    expect(blueWarn).toBe('#e59ea8');
    expect(sandWarn).not.toBe(blueWarn);
    expect(rules.get('.widget-v4-factor-cols__bar--good').background).toContain('--v4-ok-fill');
    expect(rules.get('.widget-v4-factor-cols__bar--warn').background).toContain('--v4-warn-1');
    expect(rules.get('.widget-v4-factor-cols__bar--bad').background).toContain('--v4-val-bad');
  });
});
