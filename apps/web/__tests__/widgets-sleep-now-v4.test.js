/**
 * Сведённый кусок home-widgets: кадр «Сон · Как сейчас».
 * 1×1 — ключ «Сон», часы снизу автоотступом. Номер «12» кадра — клетка
 * доски, не копия продукта.
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

describe('Сон · Как сейчас — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const mini = uiSrc.slice(
    uiSrc.indexOf('// 1x1 — канвас g1: «Сон» + часы'),
    uiSrc.indexOf("if (variantId === 'to_norm')"),
  );

  it('читает четыре строки кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Сон · Как сейчас · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Сон · Как сейчас · 02')).toBe('«Сон» — ключ');
    expect(contractValue(canvas, 'Сон · Как сейчас · 03'))
      .toBe('«6,4» — моноцифры: отступ сверху auto');
    expect(contractValue(canvas, 'Сон · Как сейчас · текст')).toBe('12 › Сон › 6,4');
  });

  it('держит вид 1×1 «Как сейчас» и ключ «Сон» в живой ветке mini', () => {
    expect(variantsSrc).toMatch(/sleep:\s*\[[\s\S]*?id:\s*'mini'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'1x1'/);
    expect(mini).toContain("v4Kicker('Сон')");
    expect(mini).toContain("className: 'widget-v4-mini__value '");
    expect(mini).toContain('formatRuDecimal(hours, 1)');
    expect(mini).toContain("className: 'widget-v4-unit'");
    expect(mini).toContain("' ч'");
    expect(uiSrc).toContain("function v4Kicker");
    expect(uiSrc).toContain("className: 'widget-v4-kicker'");
  });

  it('прижимает число вниз автоотступом и не перебивает его у сна', () => {
    const value = rules.get('.widget-v4-mini__value');
    expect(value['margin-top']).toBe('auto');
    expect(value['font-variant-numeric']).toBe('tabular-nums');
    expect(rules.get('.widget-wd__chart-value .widget-v4-mini__value')['margin-top']).toBe('0');
    const sleepMini = rules.get('body:has(.widgets-tab) .widget-v4-mini.widget-sleep--micro');
    expect(sleepMini['margin-top'] || '').not.toBe('0');
  });
});
