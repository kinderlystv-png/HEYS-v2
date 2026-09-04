/**
 * Сведённый кусок home-widgets: кадр «Сон · К норме».
 * 1×1 — ключ «Сон · к норме», дельта и единица в ряду baseline / 2 px.
 * Номер «13» кадра — клетка доски, не копия продукта.
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

describe('Сон · К норме — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const toNorm = uiSrc.slice(
    uiSrc.indexOf("if (variantId === 'to_norm')"),
    uiSrc.indexOf("if (variantId === 'week_debt')"),
  );

  it('читает пять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Сон · К норме · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Сон · К норме · 02')).toBe('«Сон · к норме» — ключ');
    expect(contractValue(canvas, 'Сон · К норме · 03'))
      .toBe('выравнивание baseline, зазор 2px, отступ сверху auto');
    expect(contractValue(canvas, 'Сон · К норме · 04'))
      .toBe('«−1,1» — моноцифры: шрифт 600 21px/1 Figtree, трекинг -.02em');
    expect(contractValue(canvas, 'Сон · К норме · текст')).toBe('13 › Сон · к норме › −1,1');
  });

  it('держит вид 1×1 «К норме» и ключ в живой ветке to_norm', () => {
    expect(variantsSrc).toMatch(/sleep:\s*\[[\s\S]*?id:\s*'to_norm'[\s\S]*?title:\s*'К норме'[\s\S]*?size:\s*'1x1'/);
    expect(toNorm).toContain("v4Kicker('Сон · к норме')");
    expect(toNorm).toContain('widget-v4-mini__value--pair');
    expect(toNorm).toContain('formatRuDecimal(Math.abs(delta), 1)');
    expect(toNorm).toContain("className: 'widget-v4-unit'");
    expect(toNorm).toContain("'ч'");
    expect(toNorm).not.toContain("' ч'");
  });

  it('ставит ряд дельты baseline / 2 px и не снимает auto с числа', () => {
    const pair = rules.get('.widget-v4-mini__value--pair');
    expect(pair.display).toBe('flex');
    expect(pair['align-items']).toBe('baseline');
    expect(pair.gap).toBe('2px');
    const value = rules.get('.widget-v4-mini__value');
    expect(value['margin-top']).toBe('auto');
    expect(value['font-size']).toBe('1.3125rem');
    expect(value['font-weight']).toBe('600');
    expect(value['line-height']).toBe('1');
    expect(value['letter-spacing']).toBe('-0.02em');
    expect(value['font-variant-numeric']).toBe('tabular-nums');
  });
});
