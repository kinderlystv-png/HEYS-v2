/**
 * Сведённый кусок home-widgets: кадр «Клетчатка · Как сейчас».
 * 1×1 — ключ, число 21 px, полоса 4 px. Номер «37» — клетка доски.
 * Ширина 69 % кадра — демо доли; продукт считает pct.
 * Пустой прочерк --empty не переоткрывал.
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
const UI = path.join(WEB_DIR, 'heys_widgets_ui_v1.js');
const VARIANTS = path.join(WEB_DIR, 'heys_widgets_variants_v4.js');

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`))?.[1] || '';
}

describe('Клетчатка · Как сейчас — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const miniAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-fiber' }");
  const mini = uiSrc.slice(miniAt, uiSrc.indexOf('function FiberWidgetContent', miniAt));

  it('читает семь строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Клетчатка · Как сейчас · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Клетчатка · Как сейчас · 02')).toBe('«Клетчатка» — ключ');
    expect(contractValue(canvas, 'Клетчатка · Как сейчас · 03'))
      .toBe('выравнивание baseline, зазор 3px, отступ сверху auto');
    expect(contractValue(canvas, 'Клетчатка · Как сейчас · 04'))
      .toBe('«18» — моноцифры: шрифт 600 21px/1 Figtree, трекинг -.02em, цвет var(--tx)');
    expect(contractValue(canvas, 'Клетчатка · Как сейчас · 05'))
      .toBe('высота 4px, радиус 999px, фон rgba(var(--ink),.08), отступ сверху 7px');
    expect(contractValue(canvas, 'Клетчатка · Как сейчас · 06'))
      .toBe('ширина 69%, высота 4px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Клетчатка · Как сейчас · текст')).toBe('37 › Клетчатка › 18');
  });

  it('держит вид 1×1, число с «г» и полосу только при hasData', () => {
    expect(variantsSrc).toMatch(/fiber:\s*\[[\s\S]*?id:\s*'now'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'1x1'/);
    expect(mini).toContain("v4Kicker('Клетчатка')");
    expect(mini).toContain('widget-v4-goal-hero');
    expect(mini).toContain("className: 'widget-v4-unit'");
    expect(mini).toContain(", 'г')");
    expect(mini).not.toContain(", ' г')");
    expect(mini).toMatch(/'widget-v4-goal-hero' \},[\s\S]*String\(fiber\) : '—'\)/);
    expect(mini).toContain('hasData ? v4GoalBar(pct) : null');
    expect(mini).toContain('widget-v4-goal-value--empty');
    expect(mini).not.toContain("v4Kicker('Клетчатка · 7 дней')");
  });

  it('держит число, зазор 3 px и полосу; дорожку не красит в 8 % кадра', () => {
    const hero = rules.get('.widget-v4-goal-hero');
    expect(hero['align-items']).toBe('baseline');
    expect(hero['margin-top']).toBe('auto');
    expect(hero.gap).toBe('4px');
    const fiberHero = rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-hero');
    expect(fiberHero.gap).toBe('3px');

    const value = rules.get('.widget-v4-goal-value');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(value['letter-spacing']).toBe('-0.02em');
    expect(value['font-variant-numeric']).toBe('tabular-nums');
    const miniValue = rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-value');
    expect(miniValue['font-size']).toBe('21px');
    const live = rules.get('.widget-v4-val--neutral');
    expect(live.color).toContain('--v4-ink');
    const empty = rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-value--empty');
    expect(empty.color).toContain('--v4-ink-3');

    const bar = rules.get('.widget-v4-goalbar');
    expect(bar.height).toBe('4px');
    expect(bar['border-radius']).toBe('999px');
    expect(bar['margin-top']).toBe('7px');
    expect(bar.background).toContain('--v4-track');
    expect(bar.background).not.toContain('0.08');

    const fill = rules.get('.widget-v4-goalbar__fill');
    expect(fill['border-radius']).toBe('999px');
    expect(fill.height).toBe('100%');
    expect(fill.width || '').toBe('');
    const onTrack = rules.get('.widget-v4-goalbar__fill.is-on-track');
    expect(onTrack.background).toContain('--v4-ok-fill');
  });
});
