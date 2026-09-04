/**
 * Сведённый кусок home-widgets: кадр «Окно до сна · нет данных».
 * 1×1 — ключ, прочерк и «не ел» в одной строке, полосы нет.
 * 68×64 кадра — клетка стенда. Клетчатку, белок, sleep now/evening не ломает.
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

describe('Окно до сна · нет данных — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function SleepWindowVariantBody');
  const eveningAt = uiSrc.indexOf("if (variantId === 'evening')", bodyAt);
  const nowAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-sleepwindow' }", bodyAt);
  const now = uiSrc.slice(nowAt, uiSrc.indexOf('function SleepWindowWidgetContent', nowAt));
  const evening = uiSrc.slice(eveningAt, nowAt);
  const proteinMiniAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-protein' }");
  const proteinMini = uiSrc.slice(proteinMiniAt, uiSrc.indexOf('function ProteinWidgetContent', proteinMiniAt));

  it('читает шесть строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Окно до сна · нет данных · 01'))
      .toBe('плитка: ширина 68px, высота 64px, флекс none');
    expect(contractValue(canvas, 'Окно до сна · нет данных · 02')).toBe('«До сна» — ключ');
    expect(contractValue(canvas, 'Окно до сна · нет данных · 03'))
      .toBe('выравнивание baseline, зазор 5px, отступ сверху auto');
    expect(contractValue(canvas, 'Окно до сна · нет данных · 04'))
      .toBe('«—» — моноцифры: шрифт 600 21px/1 Figtree, цвет rgba(var(--ink),.42)');
    expect(contractValue(canvas, 'Окно до сна · нет данных · 05'))
      .toBe('«не ел» — шрифт 500 7.5px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Окно до сна · нет данных · текст')).toBe('До сна › не ел');
  });

  it('держит вид 1×1: прочерк, «не ел», без полосы; evening «приёмов не было» жив', () => {
    expect(variantsSrc).toMatch(/sleepWindow:\s*\[[\s\S]*?id:\s*'now'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'1x1'/);
    expect(now).toContain("v4Kicker('До сна')");
    expect(now).toContain('widget-v4-goal-hero');
    expect(now).toContain('widget-v4-goal-value--empty');
    expect(now).toContain('widget-v4-unit--empty');
    expect(now).toContain("'—'");
    expect(now).toContain("'не ел'");
    expect(now).not.toContain('v4GoalBar');
    expect(now).not.toContain('goalbar--marked');
    expect(evening).toContain("'приёмов не было'");
    expect(evening).toContain('widget-v4-goalbar--marked');
    expect(proteinMini).toContain('widget-v4-goal-value--empty');
    expect(proteinMini).toContain('hasData ? v4GoalBar(pct) : null');
  });

  it('держит прочерк 21/600 тоном пустого дня и «не ел» 7.5 px; «чисто» 8.5 жив', () => {
    const hero = rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-hero');
    expect(hero['align-items'] || rules.get('.widget-v4-goal-hero')['align-items']).toBe('baseline');
    expect(hero.gap).toBe('5px');
    expect(rules.get('.widget-v4-goal-hero')['margin-top']).toBe('auto');

    expect(rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-value')['font-size']).toBe('21px');
    const value = rules.get('.widget-v4-goal-value');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');

    const empty = rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-value--empty');
    expect(empty.color).toContain('--v4-ink-3');
    expect(empty.color).not.toContain('--v4-ink,');
    expect(rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-value--empty').color).toContain('--v4-ink-3');

    const liveWord = rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-unit');
    expect(liveWord['font-size']).toBe('8.5px');
    const emptyWord = rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-unit.widget-v4-unit--empty');
    expect(emptyWord['font-size']).toBe('7.5px');
    expect(liveWord.color).toContain('--v4-ink-data');

    const live = rules.get('.widget-v4-val--neutral');
    expect(live.color).toContain('--v4-ink');
    const good = rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-value.widget-v4-val--good');
    expect(good.color).toContain('--v4-ok-text');
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
