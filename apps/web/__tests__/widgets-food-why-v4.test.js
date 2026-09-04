/**
 * Сведённый кусок home-widgets: кадр «Качество еды · Что снизило».
 * 2×1 — ключ и «N из 10» в шапке, герой «−N» и причина соседом.
 * «46» — клетка доски. Клетчатку, белок, сон и «Как сейчас» не открывал.
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

describe('Качество еды · Что снизило — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function FoodQualityVariantBody');
  const whyAt = uiSrc.indexOf("if (variantId === 'why')", bodyAt);
  const nowAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-foodquality' }", bodyAt);
  const why = uiSrc.slice(whyAt, nowAt);
  const now = uiSrc.slice(nowAt, uiSrc.indexOf('function FoodQualityWidgetContent', nowAt));
  const week = uiSrc.slice(bodyAt, whyAt);
  const proteinAdd = uiSrc.slice(
    uiSrc.indexOf("if (variantId === 'add')", uiSrc.indexOf('function ProteinVariantBody')),
    uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-protein' }"),
  );

  it('читает семь строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Качество еды · Что снизило · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Качество еды · Что снизило · 02'))
      .toBe('распределение space-between, выравнивание baseline, зазор 6px');
    expect(contractValue(canvas, 'Качество еды · Что снизило · 03')).toBe('«Качество еды» — ключ');
    expect(contractValue(canvas, 'Качество еды · Что снизило · 04'))
      .toBe('«8 из 10» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Качество еды · Что снизило · 05'))
      .toBe('выравнивание baseline, зазор 4px, отступ сверху auto');
    expect(contractValue(canvas, 'Качество еды · Что снизило · 06'))
      .toBe('«−2» — моноцифры: шрифт 600 19px/1 Figtree, трекинг -.02em, цвет var(--tx)');
    expect(contractValue(canvas, 'Качество еды · Что снизило · текст'))
      .toBe('46 › Качество еды › 8 из 10 › −2 › сладкое к кофе');
  });

  it('держит вид 2×1: шапка, «−N» сосед причины, без hint', () => {
    expect(variantsSrc).toMatch(/foodQuality:\s*\[[\s\S]*?id:\s*'why'[\s\S]*?title:\s*'Что снизило'[\s\S]*?size:\s*'2x1'/);
    expect(why).toContain("className: 'widget-v4-stack widget-v4-foodquality widget-v4-foodquality-why'");
    expect(why).toContain('widget-v4-foodquality-why__head');
    expect(why).toContain("v4Kicker('Качество еды')");
    expect(why).toContain('widget-v4-foodquality-why__score');
    expect(why).toContain('`${formatScoreRu(score)} из 10`');
    expect(why).toContain('widget-v4-goal-hero');
    expect(why).toContain('`−${formatScoreRu(data.delta)}`');
    expect(why).toContain('data.reason');
    expect(why).not.toContain('widget-v4-hint');
    expect(why).not.toContain('v4GoalBar');
    expect(why).not.toContain('v4WeekBars');
    expect(why).not.toContain('widget-v4-protein-add');
    expect(why).toContain("'приёмов не было'");
    expect(now).toContain("v4Kicker('Качество')");
    expect(now).toContain('v4GoalBar((score / 10) * 100)');
    expect(week).toContain("v4WeekBars(week, max, 'widget-v4-foodquality-week__bars', { plotPx: 40 })");
    expect(proteinAdd).toContain('widget-v4-protein-add__head');
  });

  it('держит числа шапки и героя; add клетчатки/белка и mini now не ломает', () => {
    const head = rules.get('.widget-v4-foodquality-why__head');
    expect(head.display).toBe('flex');
    expect(head['justify-content']).toBe('space-between');
    expect(head['align-items']).toBe('baseline');
    expect(head.gap).toBe('6px');

    const fact = rules.get('.widget-v4-foodquality-why__score');
    expect(fact['font-size']).toBe('9px');
    expect(fact['font-weight']).toBe('600');
    expect(fact['line-height']).toBe('1');
    expect(fact.color).toContain('--v4-ink-data');

    const hero = rules.get('.widget-v4-goal-hero');
    expect(hero['align-items']).toBe('baseline');
    expect(hero.gap).toBe('4px');
    expect(hero['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-hero').gap).toBe('3px');
    expect(rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-hero').gap).toBe('3px');
    expect(rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-hero').gap).toBe('3px');
    expect(rules.get('.widget-v4-fiber-add__head').gap).toBe('6px');
    expect(rules.get('.widget-v4-protein-add__head').gap).toBe('6px');

    const stackValue = rules.get('.widget-v4-stack .widget-v4-goal-value');
    expect(stackValue['font-size']).toBe('19px');
    expect(rules.get('.widget-v4-foodquality-why .widget-v4-goal-value')['letter-spacing']).toBe('-0.02em');
    expect(rules.get('.widget-v4-protein-add .widget-v4-goal-value')['letter-spacing']).toBe('-0.02em');
    expect(rules.get('.widget-v4-fiber-add .widget-v4-goal-value')['letter-spacing']).toBe('-0.02em');
    expect(rules.get('.widget-v4-mini.widget-v4-foodquality .widget-v4-goal-value')['font-size']).toBe('21px');
    expect(rules.get('.widget-v4-val--neutral').color).toContain('--v4-ink');
  });

  it('цвет «N из 10» и «−N» — роли, песок ≠ синий', () => {
    expect(rules.get('.widget-v4-foodquality-why__score').color).toContain('--v4-ink-data');
    const sandRgb = palette.match(/:root[\s\S]*?--v4-ink-rgb:\s*([^;]+);/)?.[1].trim();
    const sandInk = palette.match(/:root[\s\S]*?--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const blueRgb = blueBlock.match(/--v4-ink-rgb:\s*([^;]+);/)?.[1].trim();
    const blueInk = blueBlock.match(/--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandData = palette.match(/:root[\s\S]*?--v4-ink-data:\s*rgba\(var\(--v4-ink-rgb\),\s*([0-9.]+)\)/)?.[1];
    const blueData = blueBlock.match(/--v4-ink-data:\s*rgba\(var\(--v4-ink-rgb\),\s*([0-9.]+)\)/)?.[1];
    expect(sandRgb).toBe('0, 0, 0');
    expect(sandData).toBe('0.56');
    expect(sandInk).toBe('#201e1d');
    expect(blueRgb).toBe('16, 24, 38');
    expect(blueData).toBe('0.64');
    expect(blueInk).toBe('#101826');
    expect(sandInk).not.toBe(blueInk);
    expect(`rgba(${sandRgb}, ${sandData})`).not.toBe(`rgba(${blueRgb}, ${blueData})`);
  });
});
