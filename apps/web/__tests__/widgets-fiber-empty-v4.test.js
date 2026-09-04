/**
 * Сведённый кусок home-widgets: кадр «Клетчатка · нет данных».
 * 1×1 — ключ «Клетчатка», прочерк снизу автоотступом, полосы нет.
 * 68×64 кадра — клетка стенда 1×1, не отдельное правило тела.
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

describe('Клетчатка · нет данных — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const miniAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-fiber' }");
  const mini = uiSrc.slice(miniAt, uiSrc.indexOf('function FiberWidgetContent', miniAt));

  it('читает пять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Клетчатка · нет данных · 01'))
      .toBe('плитка: ширина 68px, высота 64px, флекс none');
    expect(contractValue(canvas, 'Клетчатка · нет данных · 02')).toBe('«Клетчатка» — ключ');
    expect(contractValue(canvas, 'Клетчатка · нет данных · 03')).toBe('отступ сверху auto');
    expect(contractValue(canvas, 'Клетчатка · нет данных · 04'))
      .toBe('«—» — моноцифры: шрифт 600 21px/1 Figtree, цвет rgba(var(--ink),.42)');
    expect(contractValue(canvas, 'Клетчатка · нет данных · текст')).toBe('Клетчатка');
  });

  it('держит вид 1×1 и прочерк без полосы в живой ветке mini', () => {
    expect(variantsSrc).toMatch(/fiber:\s*\[[\s\S]*?id:\s*'now'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'1x1'/);
    expect(mini).toContain("v4Kicker('Клетчатка')");
    expect(mini).toContain('widget-v4-goal-hero');
    expect(mini).toContain('widget-v4-goal-value--empty');
    expect(mini).toContain("'—'");
    expect(mini).toContain('hasData ? v4GoalBar(pct) : null');
    expect(mini).not.toContain('v4GoalBar(pct) : v4GoalBar');
    expect(mini).not.toContain("v4Kicker('Клетчатка · 7 дней')");
  });

  it('держит прочерк 21/600 тоном пустого дня, не живыми чернилами', () => {
    const hero = rules.get('.widget-v4-goal-hero');
    expect(hero['margin-top']).toBe('auto');

    const miniValue = rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-value');
    expect(miniValue['font-size']).toBe('21px');
    const value = rules.get('.widget-v4-goal-value');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(value['font-variant-numeric']).toBe('tabular-nums');

    const empty = rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-value--empty');
    expect(empty.color).toContain('--v4-ink-3');
    expect(empty.color).not.toContain('--v4-ink,');

    const live = rules.get('.widget-v4-val--neutral');
    expect(live.color).toContain('--v4-ink');
  });
});
