/**
 * Сведённый кусок home-widgets: кадр «Качество еды · нет данных».
 * 1×1 — ключ «Качество», прочерк снизу автоотступом, полосы нет.
 * 68×64 кадра — клетка стенда 1×1, не отдельное правило тела.
 * Клетчатку, белок, сон и food now/why/week не ломает.
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

describe('Качество еды · нет данных — сведённый кусок', () => {
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
  const week = uiSrc.slice(bodyAt, whyAt);
  const proteinNow = uiSrc.slice(
    uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-protein' }"),
    uiSrc.indexOf('function ProteinWidgetContent'),
  );

  it('читает пять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Качество еды · нет данных · 01'))
      .toBe('плитка: ширина 68px, высота 64px, флекс none');
    expect(contractValue(canvas, 'Качество еды · нет данных · 02')).toBe('«Качество» — ключ');
    expect(contractValue(canvas, 'Качество еды · нет данных · 03')).toBe('отступ сверху auto');
    expect(contractValue(canvas, 'Качество еды · нет данных · 04'))
      .toBe('«—» — моноцифры: шрифт 600 21px/1 Figtree, цвет rgba(var(--ink),.42)');
    expect(contractValue(canvas, 'Качество еды · нет данных · текст')).toBe('Качество');
  });

  it('держит вид 1×1 и прочерк без полосы в живой ветке now', () => {
    expect(variantsSrc).toMatch(/foodQuality:\s*\[[\s\S]*?id:\s*'now'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'1x1'/);
    expect(now).toContain("v4Kicker('Качество')");
    expect(now).toContain('widget-v4-goal-hero');
    expect(now).toContain('widget-v4-goal-value--empty');
    expect(now).toContain("'—'");
    expect(now).toContain('hasData ? v4GoalBar((score / 10) * 100) : null');
    expect(now).not.toContain('widget-v4-foodquality-why');
    expect(now).not.toContain('widget-v4-foodquality-week');
    expect(why).toContain("'приёмов не было'");
    expect(week).toContain('widget-v4-foodquality-week__bars');
    expect(proteinNow).toContain('widget-v4-goal-value--empty');
  });

  it('держит прочерк 21/600 тоном пустого дня; клетчатку и белок empty не ломает', () => {
    const hero = rules.get('.widget-v4-goal-hero');
    expect(hero['margin-top']).toBe('auto');

    const miniValue = rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value');
    expect(miniValue['font-size']).toBe('21px');
    const value = rules.get('.widget-v4-goal-value');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(value['font-variant-numeric']).toBe('tabular-nums');

    const empty = rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value--empty');
    expect(empty.color).toContain('--v4-ink-3');
    expect(empty.color).not.toContain('--v4-ink,');
    expect(rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-value--empty').color)
      .toContain('--v4-ink-3');
    expect(rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-value--empty').color)
      .toContain('--v4-ink-3');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value.widget-v4-val--good').color)
      .toContain('--v4-ok-text');
    expect(rules.get('.widget-v4-val--neutral').color).toContain('--v4-ink');
  });

  it('тон прочерка — роль; песок и синий светлые совпадают, тёмные нет', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const sandDark = palette.slice(palette.indexOf('[data-theme-id="sand-dark"]'), palette.indexOf('[data-theme-id="blue"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const blueDark = palette.slice(palette.indexOf('[data-theme-id="blue-dark"]'));
    const ink3 = (block) => block.match(/--v4-ink-3:\s*([^;]+);/)?.[1]?.trim();
    expect(ink3(sand)).toBe('rgba(0, 0, 0, 0.45)');
    expect(ink3(blue)).toBe('rgba(0, 0, 0, 0.45)');
    expect(ink3(sandDark)).toBe('rgba(242, 237, 230, 0.5)');
    expect(ink3(blueDark)).toBe('rgba(238, 243, 248, 0.5)');
    expect(ink3(sandDark)).not.toBe(ink3(blueDark));
  });
});
