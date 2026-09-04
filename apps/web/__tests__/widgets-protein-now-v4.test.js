/**
 * Сведённый кусок home-widgets: кадр «Белок · Как сейчас».
 * 1×1 — ключ, число 21 px, полоса 4 px. Номер «40» — клетка доски.
 * Ширина 80 % кадра — демо доли; продукт считает pct.
 * Клетчатку (FAB, add, week, empty, mini 3 px) не открывал.
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

describe('Белок · Как сейчас — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const nowAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-protein' }");
  const now = uiSrc.slice(nowAt, uiSrc.indexOf('function ProteinWidgetContent', nowAt));
  const addAt = uiSrc.indexOf("if (variantId === 'add')", uiSrc.indexOf('function ProteinVariantBody'));
  const add = uiSrc.slice(addAt, nowAt);
  const fiberMiniAt = uiSrc.indexOf("return React.createElement('div', { className: 'widget-v4-mini widget-v4-fiber' }");
  const fiberMini = uiSrc.slice(fiberMiniAt, uiSrc.indexOf('function FiberWidgetContent', fiberMiniAt));

  it('читает семь строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Белок · Как сейчас · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Белок · Как сейчас · 02')).toBe('«Белок» — ключ');
    expect(contractValue(canvas, 'Белок · Как сейчас · 03'))
      .toBe('выравнивание baseline, зазор 3px, отступ сверху auto');
    expect(contractValue(canvas, 'Белок · Как сейчас · 04'))
      .toBe('«112» — моноцифры: шрифт 600 21px/1 Figtree, трекинг -.02em, цвет var(--tx)');
    expect(contractValue(canvas, 'Белок · Как сейчас · 05'))
      .toBe('высота 4px, радиус 999px, фон rgba(var(--ink),.08), отступ сверху 7px');
    expect(contractValue(canvas, 'Белок · Как сейчас · 06'))
      .toBe('ширина 80%, высота 4px, радиус 999px, фон var(--gr2)');
    expect(contractValue(canvas, 'Белок · Как сейчас · текст')).toBe('40 › Белок › 112');
  });

  it('держит вид 1×1, число с «г» соседом и полосу только при hasData', () => {
    expect(variantsSrc).toMatch(/protein:\s*\[[\s\S]*?id:\s*'now'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'1x1'/);
    expect(now).toContain("v4Kicker('Белок')");
    expect(now).toContain('widget-v4-goal-hero');
    expect(now).toContain("className: 'widget-v4-unit'");
    expect(now).toContain(", 'г')");
    expect(now).not.toContain(", ' г')");
    expect(now).toMatch(/'widget-v4-goal-hero' \},[\s\S]*String\(protein\) : '—'\)/);
    expect(now).toContain('hasData ? v4GoalBar(pct) : null');
    expect(now).toContain('widget-v4-goal-value--empty');
    expect(now).not.toContain('widget-v4-fiber-add');
    expect(add).toContain('widget-v4-protein-add');
    expect(add).not.toContain('widget-v4-muted');
    expect(fiberMini).toContain(", 'г')");
    expect(fiberMini).toContain('hasData ? v4GoalBar(pct) : null');
  });

  it('держит число, зазор 3 px и полосу; клетчатку 3 px и add не ломает', () => {
    const hero = rules.get('.widget-v4-goal-hero');
    expect(hero['align-items']).toBe('baseline');
    expect(hero['margin-top']).toBe('auto');
    expect(hero.gap).toBe('4px');
    const proteinHero = rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-hero');
    expect(proteinHero.gap).toBe('3px');
    const fiberHero = rules.get('.widget-v4-mini.widget-v4-fiber .widget-v4-goal-hero');
    expect(fiberHero.gap).toBe('3px');
    expect(rules.get('.widget-v4-fiber-add__head').gap).toBe('6px');

    const value = rules.get('.widget-v4-goal-value');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(value['letter-spacing']).toBe('-0.02em');
    const miniValue = rules.get('.widget-v4-mini.widget-v4-protein .widget-v4-goal-value');
    expect(miniValue['font-size']).toBe('21px');
    const live = rules.get('.widget-v4-val--neutral');
    expect(live.color).toContain('--v4-ink');

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

  it('цвет числа и заливки — роли, песок ≠ синий; 80 % кадра = 112/140', () => {
    const sandInk = palette.match(/:root[\s\S]*?--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const blueInk = blueBlock.match(/--v4-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandFill = palette.match(/:root[\s\S]*?--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueFill = blueBlock.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(sandInk).toBe('#201e1d');
    expect(blueInk).toBe('#101826');
    expect(sandFill).toBe('#7a8a5e');
    expect(blueFill).toBe('#4f9a78');
    expect(sandInk).not.toBe(blueInk);
    expect(sandFill).not.toBe(blueFill);
    expect(Math.round((112 / 140) * 100)).toBe(80);
  });
});
