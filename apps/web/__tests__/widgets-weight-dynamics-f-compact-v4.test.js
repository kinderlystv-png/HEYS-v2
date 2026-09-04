/**
 * Сведённый кусок: кадр «Динамика · F компакт».
 * Вид compact 1×1 — ключ «Мес», число 17 px, ряд pair gap 2.
 * E график 2×2, D/C/H/G не открывал.
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

describe('Динамика · F компакт — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const tileAt = uiSrc.indexOf('function CrashRiskDynamicsVariantTile');
  const compactAt = uiSrc.indexOf("if (variantId === 'compact' && size === '1x1')", tileAt);
  const elseAt = uiSrc.indexOf('} else {', compactAt);
  const compact = uiSrc.slice(compactAt, elseAt > compactAt ? elseAt : compactAt + 500);
  const crashBlock = variantsSrc.match(/crashRisk:\s*\[([\s\S]*?)\n\s*\]/)?.[1] || '';

  it('читает пять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Динамика · F компакт · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Динамика · F компакт · 02'))
      .toBe('«Мес» — ключ');
    expect(contractValue(canvas, 'Динамика · F компакт · 03'))
      .toBe('выравнивание baseline, зазор 2px, отступ сверху auto');
    expect(contractValue(canvas, 'Динамика · F компакт · 04'))
      .toBe('«−1,8» — моноцифры: шрифт 600 17px/1 Figtree, трекинг -.02em');
    expect(contractValue(canvas, 'Динамика · F компакт · текст'))
      .toBe('Мес › −1,8 › кг');
  });

  it('держит compact 1×1: ключ Мес, pair, 17 px; соседей не ломает', () => {
    expect(crashBlock).toMatch(/id:\s*'compact'[\s\S]*?size:\s*'1x1'[\s\S]*?sheet:\s*false/);
    expect(crashBlock).toMatch(/id:\s*'curve'[\s\S]*?isDefault:\s*true/);
    expect(crashBlock).toMatch(/id:\s*'number_only'[\s\S]*?sheet:\s*false/);
    expect(compact).toContain("v4Kicker('Мес')");
    expect(compact).toContain('widget-v4-mini');
    expect(compact).toContain('widget-v4-mini__value--pair');
    expect(compact).toContain('widget-wd__compact-val');
    expect(compact).not.toContain("v4Kicker('Динамика')");
    expect(compact).not.toContain('WeightDynamicsChartSvg');
    expect(uiSrc).toContain("'До цели'");
    expect(uiSrc).toContain("'Вес по неделям'");
    expect(uiSrc).toContain('WeightDynamicsSparkSvg');
    expect(uiSrc).toContain('function WeightDynamicsChartSvg');
    expect(uiSrc).toContain('Сброшено за ${short}');
  });

  it('держит 17 px только у компакта; общий mini и соседи живы', () => {
    const compactVal = rules.get('.widget-wd__compact-val');
    expect(compactVal['font-size']).toBe('17px');

    const pair = rules.get('.widget-v4-mini__value--pair');
    expect(pair['align-items']).toBe('baseline');
    expect(pair.gap).toBe('2px');

    const value = rules.get('.widget-v4-mini__value');
    expect(value['margin-top']).toBe('auto');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(value['letter-spacing']).toBe('-0.02em');
    expect(value['font-size']).toBe('1.3125rem');

    expect(rules.get('.widget-v4-mini__value.widget-v4-val--good').color)
      .toContain('--v4-sand-ok-text');
    expect(rules.get('.widget-wd__weeks').height).toBe('24px');
    expect(rules.get('.widget-wd__bar-track').height).toBe('5px');
    expect(rules.get('.widget-wd__bar-track')['margin-top']).toBe('7px');
    expect(rules.get('.widget-wd__goal-main')['margin-top']).toBe('auto');
    expect(rules.get('.widget-wd__spark').flex).toBe('none');
    expect(rules.get('.widget-wd__chart.widget-v4-val--good').color)
      .toContain('--v4-sand-ok-fill');
  });

  it('шалфей числа различает роль на двух светлых; --ok-text на синем другой', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const role = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(role(sand, '--v4-sand-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-sand-ok-text')).toBe('#5c6a45');
    expect(role(sand, '--v4-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-ok-text')).toBe('#1f6e4d');
  });
});
