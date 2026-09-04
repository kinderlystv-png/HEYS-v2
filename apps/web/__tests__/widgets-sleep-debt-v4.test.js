/**
 * Сведённый кусок home-widgets: кадр «Сон · Долг за неделю».
 * 2×1 — короткая шапка по контракту 31 августа, число долга, семь ночей.
 * Номер «14» кадра — клетка доски, не копия продукта.
 * Высоты столбиков кадра — демо; продукт считает их из ночей.
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

describe('Сон · Долг за неделю — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const debtAt = uiSrc.indexOf("if (variantId === 'week_debt')");
  const debt = uiSrc.slice(debtAt, uiSrc.indexOf("if (variantId === 'window')", debtAt));

  it('читает шестнадцать строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Сон · Долг за неделю · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 03')).toBe('«Недосып за 7 дней» — ключ');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 04'))
      .toBe('«норма 7,5» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 05'))
      .toBe('выравнивание flex-end, распределение space-between, зазор 9px, отступ сверху auto');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 06'))
      .toBe('выравнивание baseline, зазор 3px');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 07')).toBe('«−3,2» — моноцифры');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 08'))
      .toBe('выравнивание flex-end, зазор 3px, высота 22px, флекс none, ширина 62px');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 09'))
      .toBe('флекс 1, высота 8px, радиус 2px, фон var(--val-bad)');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 10'))
      .toBe('флекс 1, высота 14px, радиус 2px, фон var(--gr2)');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 11'))
      .toBe('флекс 1, высота 5px, радиус 2px, фон var(--val-bad)');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 12'))
      .toBe('флекс 1, высота 6px, радиус 2px, фон var(--val-bad)');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 13'))
      .toBe('флекс 1, высота 18px, радиус 2px, фон var(--gr2)');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 14'))
      .toBe('флекс 1, высота 4px, радиус 2px, фон var(--val-bad)');
    expect(contractValue(canvas, 'Сон · Долг за неделю · 15'))
      .toBe('флекс 1, высота 11px, радиус 2px, фон var(--val-bad)');
    expect(contractValue(canvas, 'Сон · Долг за неделю · текст'))
      .toBe('14 › Недосып за 7 дней › норма 7,5 › −3,2');
  });

  it('держит вид 2×1 «Долг за неделю» и короткую шапку в живой ветке week_debt', () => {
    expect(variantsSrc).toMatch(/sleep:\s*\[[\s\S]*?id:\s*'week_debt'[\s\S]*?title:\s*'Долг за неделю'[\s\S]*?size:\s*'2x1'/);
    expect(debt).toContain("v4Kicker('Недосып · 7 дней')");
    expect(debt).toContain("formatRuUnit(formatRuDecimal(target, 1), 'ч')");
    expect(debt).toContain('widget-v4-sleep-debt');
    expect(debt).toContain('widget-v4-sleep-debt__num');
    expect(debt).toContain('widget-v4-sleep-debt__bars');
    expect(debt).toContain('widget-v4-sleep-debt__bar--ok');
    expect(debt).toContain('widget-v4-sleep-debt__bar--short');
    expect(debt).not.toContain("v4Kicker('Недосып за 7 дней')");
    expect(debt).not.toContain('норма ${formatRuDecimal(target, 1)}');
    expect(debt).not.toContain("v4Kicker('Сон · окно')");
    expect(debt).not.toContain('widget-v4-mini__value');
  });

  it('держит шапку, долг и столбики числами кадра', () => {
    const tight = rules.get('.widget-v4-row--tight');
    expect(tight['align-items']).toBe('baseline');
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');

    const meta = rules.get('.widget-v4-row__meta');
    expect(meta['font-size']).toBe('9px');
    expect(meta['font-weight']).toBe('600');
    expect(meta['line-height']).toBe('1');
    expect(meta.color).toContain('--v4-ink-data');

    const body = rules.get('.widget-v4-sleep-debt');
    expect(body['align-items']).toBe('flex-end');
    expect(body['justify-content']).toBe('space-between');
    expect(body.gap).toBe('9px');
    expect(body['margin-top']).toBe('auto');

    const num = rules.get('.widget-v4-sleep-debt__num');
    expect(num['align-items']).toBe('baseline');
    expect(num.gap).toBe('3px');

    const value = rules.get('.widget-v4-row__value');
    expect(value['font-variant-numeric']).toBe('tabular-nums');
    const bad = rules.get('.widget-v4-row__value.widget-v4-val--bad');
    expect(bad.color).toContain('--v4-bad-text');

    const bars = rules.get('.widget-v4-sleep-debt__bars');
    expect(bars['align-items']).toBe('flex-end');
    expect(bars.gap).toBe('3px');
    expect(bars.height).toBe('22px');
    expect(bars.width).toBe('62px');
    expect(bars.flex).toBe('none');

    const bar = rules.get('.widget-v4-sleep-debt__bar');
    expect(bar.flex).toBe('1');
    expect(bar['border-radius']).toBe('2px');
    expect(bar.height || '').toBe('');

    const ok = rules.get('.widget-v4-sleep-debt__bar--ok');
    expect(ok.background).toContain('--v4-ok-fill');
    expect(ok.background).toContain('#7a8a5e');
    const short = rules.get('.widget-v4-sleep-debt__bar--short');
    expect(short.background).toContain('--v4-bad-text');
  });
});
