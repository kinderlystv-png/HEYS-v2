/**
 * Сведённый кусок home-widgets: кадр «Белок · Добрать».
 * 2×1 — ключ и «N из M г» в шапке, герой «+N» и «г добрать».
 * Подсказки нет (решение 22 августа). «41» — клетка доски.
 * Клетчатку add и «Белок · Как сейчас» не открывал.
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

describe('Белок · Добрать — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const proteinAt = uiSrc.indexOf('function ProteinVariantBody');
  const addAt = uiSrc.indexOf("if (variantId === 'add')", proteinAt);
  const add = uiSrc.slice(addAt, uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-protein' }", addAt));
  const now = uiSrc.slice(
    uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-protein' }", proteinAt),
    uiSrc.indexOf('function ProteinWidgetContent', proteinAt),
  );
  const fiberAdd = uiSrc.slice(
    uiSrc.indexOf("if (variantId === 'add')"),
    uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-fiber' }"),
  );

  it('читает семь строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Белок · Добрать · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Белок · Добрать · 02'))
      .toBe('распределение space-between, выравнивание baseline, зазор 6px');
    expect(contractValue(canvas, 'Белок · Добрать · 03')).toBe('«Белок» — ключ');
    expect(contractValue(canvas, 'Белок · Добрать · 04'))
      .toBe('«112 из 140 г» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Белок · Добрать · 05'))
      .toBe('выравнивание baseline, зазор 4px, отступ сверху auto');
    expect(contractValue(canvas, 'Белок · Добрать · 06'))
      .toBe('«+28» — моноцифры: шрифт 600 19px/1 Figtree, трекинг -.02em, цвет var(--tx)');
    expect(contractValue(canvas, 'Белок · Добрать · текст'))
      .toBe('41 › Белок › 112 из 140 г › +28 › г добрать');
  });

  it('держит вид 2×1: шапка, «+N» сосед «г добрать», без hint и без muted', () => {
    expect(variantsSrc).toMatch(/protein:\s*\[[\s\S]*?id:\s*'add'[\s\S]*?title:\s*'Добрать'[\s\S]*?size:\s*'2x1'/);
    expect(add).toContain("className: 'widget-v4-stack widget-v4-protein widget-v4-protein-add'");
    expect(add).toContain('widget-v4-protein-add__head');
    expect(add).toContain("v4Kicker('Белок')");
    expect(add).toContain('widget-v4-protein-add__now');
    expect(add).toContain('`${protein} из ${target} г`');
    expect(add).toContain('widget-v4-goal-hero');
    expect(add).toContain('`+${remaining}`');
    expect(add).toContain(", 'г добрать')");
    expect(add).not.toContain('widget-v4-hint');
    expect(add).not.toContain('widget-v4-muted');
    expect(add).not.toContain('widget-v4-fiber-add');
    expect(add).not.toContain('v4GoalBar');
    expect(fiberAdd).toContain('widget-v4-fiber-add__head');
    expect(fiberAdd).toContain('widget-v4-hint');
    expect(now).toContain('v4GoalBar');
    expect(now).toContain(", 'г')");
    expect(now).not.toContain(", ' г')");
  });

  it('держит числа шапки и героя; клетчатку add и mini 3 px не ломает', () => {
    const head = rules.get('.widget-v4-protein-add__head');
    expect(head.display).toBe('flex');
    expect(head['justify-content']).toBe('space-between');
    expect(head['align-items']).toBe('baseline');
    expect(head.gap).toBe('6px');

    const fact = rules.get('.widget-v4-protein-add__now');
    expect(fact['font-size']).toBe('9px');
    expect(fact['font-weight']).toBe('600');
    expect(fact['line-height']).toBe('1');
    expect(fact.color).toContain('--v4-ink-data');

    const hero = rules.get('.widget-v4-goal-hero');
    expect(hero['align-items']).toBe('baseline');
    expect(hero.gap).toBe('4px');
    expect(hero['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-hero').gap).toBe('3px');
    expect(rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-hero').gap).toBe('3px');
    expect(rules.get('.widget-v4-fiber-add__head').gap).toBe('6px');

    const stackValue = rules.get('.widget-v4-stack .widget-v4-goal-value');
    expect(stackValue['font-size']).toBe('19px');
    const addValue = rules.get('.widget-v4-protein-add .widget-v4-goal-value');
    expect(addValue['letter-spacing']).toBe('-0.02em');
    expect(rules.get('.widget-v4-fiber-add .widget-v4-goal-value')['letter-spacing']).toBe('-0.02em');
    expect(rules.get('.widget-v4-val--neutral').color).toContain('--v4-ink');
  });

  it('цвет «N из M г» и «+N» — роли, песок ≠ синий', () => {
    expect(rules.get('.widget-v4-protein-add__now').color).toContain('--v4-ink-data');
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
