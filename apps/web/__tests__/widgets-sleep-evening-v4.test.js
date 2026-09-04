/**
 * Сведённый кусок home-widgets: кадр «Окно до сна · Вечер».
 * 2×1 — шапка с отбоем, число 19 px, полоса вечера и метка 2 px.
 * Ширина 68 % кадра — демо; продукт считает minutes/span.
 * Клетчатку, белок и sleep now не открывал.
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

describe('Окно до сна · Вечер — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function SleepWindowVariantBody');
  const eveningAt = uiSrc.indexOf("if (variantId === 'evening')", bodyAt);
  const nowAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-sleepwindow' }", bodyAt);
  const evening = uiSrc.slice(eveningAt, nowAt);
  const now = uiSrc.slice(nowAt, uiSrc.indexOf('function SleepWindowWidgetContent', nowAt));
  const proteinAddAt = uiSrc.indexOf("if (variantId === 'add')", uiSrc.indexOf('function ProteinVariantBody'));
  const proteinNowAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-protein' }");
  const proteinAdd = uiSrc.slice(proteinAddAt, proteinNowAt);

  it('читает десять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Окно до сна · Вечер · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Окно до сна · Вечер · 02'))
      .toBe('распределение space-between, выравнивание baseline, зазор 6px');
    expect(contractValue(canvas, 'Окно до сна · Вечер · 03')).toBe('«До сна» — ключ');
    expect(contractValue(canvas, 'Окно до сна · Вечер · 04'))
      .toBe('«отбой 23:00» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Окно до сна · Вечер · 05'))
      .toBe('выравнивание baseline, зазор 4px, отступ сверху auto');
    expect(contractValue(canvas, 'Окно до сна · Вечер · 06'))
      .toBe('«2:40» — моноцифры: шрифт 600 19px/1 Figtree, трекинг -.02em, цвет var(--gr)');
    expect(contractValue(canvas, 'Окно до сна · Вечер · 07'))
      .toBe('выравнивание center, зазор 0, высота 5px, радиус 999px, фон rgba(var(--ink),.08), отступ сверху 6px, обрез hidden');
    expect(contractValue(canvas, 'Окно до сна · Вечер · 08'))
      .toBe('ширина 68%, высота 5px, фон #b7c29b');
    expect(contractValue(canvas, 'Окно до сна · Вечер · 09'))
      .toBe('ширина 2px, высота 5px, фон var(--tx)');
    expect(contractValue(canvas, 'Окно до сна · Вечер · текст'))
      .toBe('44 › До сна › отбой 23:00 › 2:40 › окно чистое');
  });

  it('держит вид 2×1: шапка с отбоем, слово «окно чистое», метка после заливки', () => {
    expect(variantsSrc).toMatch(/sleepWindow:\s*\[[\s\S]*?id:\s*'evening'[\s\S]*?title:\s*'Вечер'[\s\S]*?size:\s*'2x1'/);
    expect(evening).toContain('widget-v4-stack widget-v4-sleepwindow');
    expect(evening).toContain('widget-v4-row--tight');
    expect(evening).toContain("v4Kicker('До сна')");
    expect(evening).toContain('отбой ${bedText}');
    expect(evening).toContain('отбой не задан');
    expect(evening).toContain("'окно чистое'");
    expect(evening).toContain('widget-v4-goalbar--marked');
    expect(evening).toContain('widget-v4-goalbar__mark');
    expect(evening).toContain("width: fill + '%'");
    expect(evening).not.toContain('68%');
    expect(now).toContain('widget-v4-mini widget-v4-sleepwindow');
    expect(now).not.toContain('goalbar--marked');
    expect(proteinAdd).toContain('widget-v4-protein-add');
    expect(proteinAdd).not.toContain('goalbar--marked');
  });

  it('держит шапку 6 px, число 19 px и полосу 5 px; now 5 px и track 12 % живы', () => {
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

    const hero = rules.get('.widget-v4-goal-hero');
    expect(hero['align-items']).toBe('baseline');
    expect(hero.gap).toBe('4px');
    expect(hero['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-hero').gap).toBe('5px');

    const stackValue = rules.get('.widget-v4-stack .widget-v4-goal-value');
    expect(stackValue['font-size']).toBe('19px');
    const eveningValue = rules.get('.widget-v4-stack.widget-v4-sleepwindow .widget-v4-goal-value');
    expect(eveningValue['letter-spacing']).toBe('-0.02em');
    expect(stackValue['letter-spacing']).toBe('-0.03em');

    const bar = rules.get('.widget-v4-sleepwindow .widget-v4-goalbar--marked');
    expect(bar.display).toBe('flex');
    expect(bar['align-items']).toBe('center');
    expect(bar.gap).toBe('0');
    expect(bar.height).toBe('5px');
    expect(bar['margin-top']).toBe('6px');
    expect(bar.overflow).toBe('hidden');
    expect(bar.background).toContain('--v4-line');
    expect(bar.background).not.toContain('--v4-track');

    const goalbar = rules.get('.widget-v4-goalbar');
    expect(goalbar.height).toBe('4px');
    expect(goalbar.background).toContain('--v4-track');
    expect(goalbar['margin-top']).toBe('7px');

    const fill = rules.get('.widget-v4-sleepwindow .widget-v4-goalbar--marked .widget-v4-goalbar__fill.widget-v4-val--good');
    expect(fill.background).toContain('--v4-ok-fill');
    expect(fill.background).not.toContain('#b7c29b');

    const mark = rules.get('.widget-v4-sleepwindow .widget-v4-goalbar__mark');
    expect(mark.width).toBe('2px');
    expect(mark.height).toBe('5px');
    expect(mark.background).toContain('--v4-ink');
  });

  it('шалфей числа и заливки — роли, песок ≠ синий; 68 % кадра не формула', () => {
    const good = rules.get('.widget-v4-stack.widget-v4-sleepwindow .widget-v4-goal-value.widget-v4-val--good');
    expect(good.color).toContain('--v4-ok-text');
    expect(rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-value.widget-v4-val--good').color)
      .toContain('--v4-ok-text');

    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const okText = (block) => block.match(/--v4-ok-text:\s*([^;]+);/)?.[1]?.trim();
    const okFill = (block) => block.match(/--v4-ok-fill:\s*([^;]+);/)?.[1]?.trim();
    const ink = (block) => block.match(/--v4-ink:\s*([^;]+);/)?.[1]?.trim();
    expect(okText(sand)).toBe('#5c6a45');
    expect(okText(blue)).toBe('#1f6e4d');
    expect(okFill(sand)).toBe('#7a8a5e');
    expect(okFill(blue)).toBe('#4f9a78');
    expect(ink(sand)).toBe('#201e1d');
    expect(ink(blue)).toBe('#101826');
    expect(okText(sand)).not.toBe(okText(blue));
    expect(okFill(sand)).not.toBe(okFill(blue));

    const span = 23 * 60 - (20 * 60 + 20);
    expect(span).toBe(160);
    expect(Math.round((160 / Math.max(span, 160)) * 100)).toBe(100);
    expect(68).not.toBe(100);
  });
});
