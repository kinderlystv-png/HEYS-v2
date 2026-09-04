/**
 * Сведённый кусок home-widgets: кадр «Качество еды · Как сейчас».
 * 1×1 — ключ, балл 21 px, полоса 4 px. Номер «45» — клетка доски.
 * 80 % кадра — 8 из 10; продукт считает score/10. Клетчатку, белок и сон
 * не открывал.
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

describe('Качество еды · Как сейчас — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function FoodQualityVariantBody');
  const whyAt = uiSrc.indexOf("if (variantId === 'why')", bodyAt);
  const nowAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-foodquality' }", bodyAt);
  const now = uiSrc.slice(nowAt, uiSrc.indexOf('function FoodQualityWidgetContent', nowAt));
  const why = uiSrc.slice(whyAt, nowAt);
  const sleepNowAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-sleepwindow' }");
  const sleepNow = uiSrc.slice(sleepNowAt, uiSrc.indexOf('function SleepWindowWidgetContent', sleepNowAt));

  it('читает семь строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Качество еды · Как сейчас · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Качество еды · Как сейчас · 02')).toBe('«Качество» — ключ');
    expect(contractValue(canvas, 'Качество еды · Как сейчас · 03'))
      .toBe('выравнивание baseline, зазор 3px, отступ сверху auto');
    expect(contractValue(canvas, 'Качество еды · Как сейчас · 04'))
      .toBe('«8» — моноцифры: шрифт 600 21px/1 Figtree, трекинг -.02em, цвет var(--tx)');
    expect(contractValue(canvas, 'Качество еды · Как сейчас · 05'))
      .toBe('высота 4px, радиус 999px, фон rgba(var(--ink),.08), отступ сверху 7px');
    expect(contractValue(canvas, 'Качество еды · Как сейчас · 06'))
      .toBe('ширина 80%, высота 4px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Качество еды · Как сейчас · текст')).toBe('45 › Качество › из 10');
  });

  it('держит вид 1×1, «из 10» соседом и полосу только при hasData', () => {
    expect(variantsSrc).toMatch(/foodQuality:\s*\[[\s\S]*?id:\s*'now'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'1x1'/);
    expect(now).toContain("v4Kicker('Качество')");
    expect(now).toContain('widget-v4-goal-hero');
    expect(now).toContain('formatScoreRu(score)');
    expect(now).toContain(", 'из 10')");
    expect(now).toContain('hasData ? v4GoalBar((score / 10) * 100) : null');
    expect(now).not.toContain('v4GoalBar((score / 10) * 100, state)');
    expect(now).not.toContain('widget-v4-hint');
    expect(now).not.toContain('v4WeekBars');
    expect(why).toContain('widget-v4-foodquality-why');
    expect(why).toContain("'приёмов не было'");
    expect(sleepNow).toContain("'не ел'");
    expect(sleepNow).not.toContain('v4GoalBar');
  });

  it('держит зазор 3 px, число 21 px и полосу; fiber/protein/sleep не ломает', () => {
    const hero = rules.get('.widget-v4-goal-hero');
    expect(hero['align-items']).toBe('baseline');
    expect(hero['margin-top']).toBe('auto');
    expect(hero.gap).toBe('4px');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-hero').gap).toBe('3px');
    expect(rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-hero').gap).toBe('3px');
    expect(rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-hero').gap).toBe('3px');
    expect(rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-hero').gap).toBe('5px');

    const value = rules.get('.widget-v4-goal-value');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(value['letter-spacing']).toBe('-0.02em');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value')['font-size']).toBe('21px');
    expect(rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-value')['font-size']).toBe('21px');

    const bar = rules.get('.widget-v4-goalbar');
    expect(bar.height).toBe('4px');
    expect(bar['border-radius']).toBe('999px');
    expect(bar['margin-top']).toBe('7px');
    expect(bar.background).toContain('--v4-track');
    expect(bar.background).not.toContain('0.08');

    const fill = rules.get('.widget-v4-goalbar__fill');
    expect(fill.height).toBe('100%');
    expect(fill['border-radius']).toBe('999px');
    const onTrack = rules.get('.widget-v4-goalbar__fill.is-on-track');
    expect(onTrack.background).toContain('--v4-ok-fill');
  });

  it('шалфей от 5 — текстовая роль, песок ≠ синий; 80 % = 8/10', () => {
    const good = rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value.widget-v4-val--good');
    expect(good.color).toContain('--v4-ok-text');
    expect(good.color).not.toContain('--v4-ok-fill');
    expect(rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-value.widget-v4-val--good').color)
      .toContain('--v4-ok-text');

    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const okText = (block) => block.match(/--v4-ok-text:\s*([^;]+);/)?.[1]?.trim();
    const okFill = (block) => block.match(/--v4-ok-fill:\s*([^;]+);/)?.[1]?.trim();
    expect(okText(sand)).toBe('#5c6a45');
    expect(okText(blue)).toBe('#1f6e4d');
    expect(okFill(sand)).toBe('#7a8a5e');
    expect(okFill(blue)).toBe('#4f9a78');
    expect(okText(sand)).not.toBe(okText(blue));
    expect(Math.round((8 / 10) * 100)).toBe(80);
  });
});
