/**
 * Сведённый кусок home-widgets: кадр «Клетчатка · Добрать».
 * 2×1 — ключ и «N из M г» в шапке, герой «+N» и «г добрать», подсказка словаря.
 * «38» — клетка доски. Пустой прочерк 1×1 и FAB не открывал.
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

describe('Клетчатка · Добрать — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const addAt = uiSrc.indexOf("if (variantId === 'add')");
  const add = uiSrc.slice(addAt, uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-fiber' }", addAt));
  const proteinAdd = uiSrc.slice(
    uiSrc.indexOf('function ProteinVariantBody'),
    uiSrc.indexOf('function ProteinWidgetContent'),
  );

  it('читает восемь строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Клетчатка · Добрать · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Клетчатка · Добрать · 02'))
      .toBe('распределение space-between, выравнивание baseline, зазор 6px');
    expect(contractValue(canvas, 'Клетчатка · Добрать · 03')).toBe('«Клетчатка» — ключ');
    expect(contractValue(canvas, 'Клетчатка · Добрать · 04'))
      .toBe('«18 из 26 г» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Клетчатка · Добрать · 05'))
      .toBe('выравнивание baseline, зазор 4px, отступ сверху auto');
    expect(contractValue(canvas, 'Клетчатка · Добрать · 06'))
      .toBe('«+8» — моноцифры: шрифт 600 19px/1 Figtree, трекинг -.02em, цвет var(--tx)');
    expect(contractValue(canvas, 'Клетчатка · Добрать · 07'))
      .toBe('«Овощи · Бобовые · Цельные злаки» — моноцифры: шрифт 600 8.5px/1 Figtree, цвет rgba(var(--ink),.56), отступ сверху 4px');
    expect(contractValue(canvas, 'Клетчатка · Добрать · текст'))
      .toBe('38 › Клетчатка › 18 из 26 г › +8 › г добрать › Овощи · Бобовые · Цельные злаки');
  });

  it('держит вид 2×1: шапка, «+N» сосед «г добрать», подсказка только при источниках', () => {
    expect(variantsSrc).toMatch(/fiber:\s*\[[\s\S]*?id:\s*'add'[\s\S]*?title:\s*'Добрать'[\s\S]*?size:\s*'2x1'/);
    expect(add).toContain("className: 'widget-v4-stack widget-v4-fiber widget-v4-fiber-add'");
    expect(add).toContain('widget-v4-fiber-add__head');
    expect(add).toContain("v4Kicker('Клетчатка')");
    expect(add).toContain('widget-v4-fiber-add__now');
    expect(add).toContain('`${fiber} из ${norm} г`');
    expect(add).toContain('widget-v4-goal-hero');
    expect(add).toContain('`+${remaining}`');
    expect(add).toContain(", 'г добрать')");
    expect(add).toContain('widget-v4-hint');
    expect(add).not.toContain('widget-v4-muted');
    expect(add).not.toContain('v4GoalBar');
    expect(proteinAdd).toContain('widget-v4-muted');
    expect(proteinAdd).not.toContain('widget-v4-fiber-add');
  });

  it('держит числа шапки, героя и подсказки; общий hero 4 px и mini 3 px живы', () => {
    const head = rules.get('.widget-v4-fiber-add__head');
    expect(head.display).toBe('flex');
    expect(head['justify-content']).toBe('space-between');
    expect(head['align-items']).toBe('baseline');
    expect(head.gap).toBe('6px');

    const now = rules.get('.widget-v4-fiber-add__now');
    expect(now['font-size']).toBe('9px');
    expect(now['font-weight']).toBe('600');
    expect(now['line-height']).toBe('1');
    expect(now.color).toContain('--v4-ink-data');

    const hero = rules.get('.widget-v4-goal-hero');
    expect(hero['align-items']).toBe('baseline');
    expect(hero.gap).toBe('4px');
    expect(hero['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-hero').gap).toBe('3px');

    const stackValue = rules.get('.widget-v4-stack .widget-v4-goal-value');
    expect(stackValue['font-size']).toBe('19px');
    const addValue = rules.get('.widget-v4-fiber-add .widget-v4-goal-value');
    expect(addValue['letter-spacing']).toBe('-0.02em');
    expect(rules.get('.widget-v4-goal-value')['letter-spacing']).toBe('-0.02em');
    expect(rules.get('.widget-v4-goal-value')['font-weight']).toBe('600');
    expect(rules.get('.widget-v4-val--neutral').color).toContain('--v4-ink');

    const hint = rules.get('.widget-v4-fiber .widget-v4-hint');
    expect(hint['font-size']).toBe('8.5px');
    expect(hint['font-weight']).toBe('600');
    expect(hint['margin-top']).toBe('4px');
  });

  it('цвет «N из M г» и «+N» — роли, песок ≠ синий', () => {
    expect(rules.get('.widget-v4-fiber-add__now').color).toContain('--v4-ink-data');
    expect(rules.get('.widget-v4-val--neutral').color).toContain('--v4-ink');
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
    expect(`rgba(${sandRgb}, ${sandData})`).not.toBe(`rgba(${blueRgb}, ${blueData})`);
    expect(sandInk).not.toBe(blueInk);
  });
});
