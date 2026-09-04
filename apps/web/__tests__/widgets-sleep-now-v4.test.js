/**
 * Сведённый кусок home-widgets: кадр «Окно до сна · Как сейчас».
 * 1×1 — ключ, число 21 px шалфеем, слово в той же строке.
 * Номер «43» — клетка доски. Клетчатку и белок не открывал.
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

describe('Окно до сна · Как сейчас — сведённый кусок', () => {
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
    expect(contractValue(canvas, 'Окно до сна · Как сейчас · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Окно до сна · Как сейчас · 02')).toBe('«До сна» — ключ');
    expect(contractValue(canvas, 'Окно до сна · Как сейчас · 03'))
      .toBe('выравнивание baseline, зазор 5px, отступ сверху auto');
    expect(contractValue(canvas, 'Окно до сна · Как сейчас · 04'))
      .toBe('«2:40» — моноцифры: шрифт 600 21px/1 Figtree, трекинг -.02em, цвет var(--gr)');
    expect(contractValue(canvas, 'Окно до сна · Как сейчас · 05'))
      .toBe('«чисто» — шрифт 500 8.5px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Окно до сна · Как сейчас · текст'))
      .toBe('43 › До сна › 2:40 › чисто');
  });

  it('держит вид 1×1: число и слово в одной строке, без второй строки', () => {
    expect(variantsSrc).toMatch(/sleepWindow:\s*\[[\s\S]*?id:\s*'now'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'1x1'/);
    expect(now).toContain("v4Kicker('До сна')");
    expect(now).toContain('widget-v4-goal-hero');
    expect(now).toContain('formatHoursColon(minutes)');
    expect(now).toContain('data?.word');
    expect(now).toContain("'не ел'");
    expect(now).not.toContain('v4GoalBar');
    expect(now).not.toContain('widget-v4-goalbar');
    expect(evening).toContain('widget-v4-stack widget-v4-sleepwindow');
    expect(evening).toContain('отбой не задан');
    expect(proteinMini).toContain('hasData ? v4GoalBar(pct) : null');
  });

  it('держит зазор 5 px, число 21 px и слово 8.5 px; fiber/protein 3 px живы', () => {
    const hero = rules.get('.widget-v4-goal-hero');
    expect(hero['align-items']).toBe('baseline');
    expect(hero['margin-top']).toBe('auto');
    expect(hero.gap).toBe('4px');

    const sleepHero = rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-hero');
    expect(sleepHero.gap).toBe('5px');
    expect(rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-hero').gap).toBe('3px');
    expect(rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-hero').gap).toBe('3px');

    const value = rules.get('.widget-v4-goal-value');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(value['letter-spacing']).toBe('-0.02em');
    expect(rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-value')['font-size']).toBe('21px');
    expect(rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-value')['font-size']).toBe('21px');

    const word = rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-unit');
    expect(word['font-size']).toBe('8.5px');
    expect(word['font-weight']).toBe('500');
    expect(word['line-height']).toBe('1');
    expect(word.color).toContain('--v4-ink-data');

    const generalUnit = rules.get('.widget-v4-unit');
    expect(generalUnit['font-size']).toBe('0.625rem');
  });

  it('шалфей числа — текстовая роль, песок ≠ синий; 2:40 = 160 мин', () => {
    const good = rules.get('.widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-value.widget-v4-val--good');
    expect(good.color).toContain('--v4-ok-text');
    expect(good.color).not.toContain('--v4-ok-fill');
    expect(good.color).not.toContain('--v4-sand-ok-text');

    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const okText = (block) => block.match(/--v4-ok-text:\s*([^;]+);/)?.[1]?.trim();
    expect(okText(sand)).toBe('#5c6a45');
    expect(okText(blue)).toBe('#1f6e4d');
    expect(okText(sand)).not.toBe(okText(blue));

    const sandData = palette.match(/:root[\s\S]*?--v4-ink-data:\s*([^;]+);/)?.[1]?.trim();
    expect(sandData).toBe('rgba(var(--v4-ink-rgb), 0.56)');
    expect(blue.match(/--v4-ink-data:\s*([^;]+);/)?.[1]?.trim()).toBe('rgba(var(--v4-ink-rgb), 0.64)');

    expect(Math.floor(160 / 60) + ':' + String(160 % 60).padStart(2, '0')).toBe('2:40');
  });
});
