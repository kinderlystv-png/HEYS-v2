/**
 * Сведённый кусок home-widgets: кадр «Оценка дня · Как сейчас».
 * 1×1 — ключ, 6,2 / 10. Семь дней, факторы и вода не открывал.
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

describe('Оценка дня · Как сейчас — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function DayScoreVariantBody');
  const bodyEnd = uiSrc.indexOf('function DayScoreWidgetContent', bodyAt);
  const body = uiSrc.slice(bodyAt, bodyEnd);
  const miniAt = body.indexOf("if (resolvedVariant === 'mini'");
  const factorsAt = body.indexOf("if (resolvedVariant === 'factors')");
  const mini = body.slice(miniAt, factorsAt);
  const factors = body.slice(factorsAt, body.indexOf('// Кадр «Шторка · Оценка дня», вид «Семь дней»'));

  it('читает пять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Оценка дня · Как сейчас · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Оценка дня · Как сейчас · 02')).toBe('«Оценка» — ключ');
    expect(contractValue(canvas, 'Оценка дня · Как сейчас · 03'))
      .toBe('выравнивание baseline, зазор 3px, отступ сверху auto');
    expect(contractValue(canvas, 'Оценка дня · Как сейчас · 04'))
      .toBe('«6,2» — моноцифры: шрифт 600 21px/1 Figtree, цвет var(--ac)');
    expect(contractValue(canvas, 'Оценка дня · Как сейчас · текст'))
      .toBe('16 › Оценка › 6,2 › / 10');
  });

  it('держит mini 1×1: ключ, число / 10, без факторов и недели', () => {
    expect(variantsSrc).toMatch(
      /dayScore:\s*\[[\s\S]*?id:\s*'mini'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'1x1'/,
    );
    expect(mini).toContain("v4Kicker('Оценка')");
    expect(mini).toContain('widget-v4-mini__value widget-day-score__score');
    expect(mini).toContain("React.createElement('span', { className: 'widget-v4-unit' }, ' / 10')");
    expect(mini).toContain('fontSize: \'21px\'');
    expect(mini).not.toContain('widget-v4-factor-cols');
    expect(mini).not.toContain('widget-v4-week-bars');
    expect(factors).toContain("v4Kicker('Оценка дня')");
    expect(factors).not.toContain("v4Kicker('Оценка')");
  });

  it('держит baseline/gap 3/auto и 21 px; соседей не ломает', () => {
    const miniValue = rules.get('.widget-v4-mini.widget-day-score .widget-v4-mini__value');
    expect(miniValue.display).toBe('flex');
    expect(miniValue['align-items']).toBe('baseline');
    expect(miniValue.gap).toBe('3px');
    expect(rules.get('.widget-v4-mini__value')['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-factor-cols').gap).toBe('5px');
    expect(rules.get('.widget-v4-week-bars--inline').height).toBe('22px');
  });

  it('цвет числа — --v4-sand-act-text; песок и синий на светлом совпадают', () => {
    expect(body).toContain('--v4-sand-act-text');
    const sandBlock = palette.slice(0, palette.indexOf('[data-theme-id="blue"]'));
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const sandActText = sandBlock.match(/--v4-sand-act-text:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueActText = blueBlock.match(/--v4-sand-act-text:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(sandActText).toBe('#8a4a20');
    expect(blueActText).toBe('#8a4a20');
    expect(rules.get('.widget-v4-row__value').color).toContain('--v4-act-text');
  });
});
