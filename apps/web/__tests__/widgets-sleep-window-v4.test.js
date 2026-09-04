/**
 * Сведённый кусок home-widgets: кадр «Сон · Окно сна».
 * 2×1 — ключ «Сон · окно», длительность 700 10px, дорожка 7 px, подписи краёв.
 * Номер «15» кадра — клетка доски, не копия продукта.
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

describe('Сон · Окно сна — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const windowAt = uiSrc.indexOf("v4Kicker('Сон · окно')");
  const windowBranch = uiSrc.slice(
    windowAt,
    uiSrc.indexOf('// 2x2 — Оптимальный layout', windowAt),
  );

  it('читает десять строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Сон · Окно сна · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Сон · Окно сна · 02'))
      .toBe('распределение space-between, выравнивание baseline');
    expect(contractValue(canvas, 'Сон · Окно сна · 03')).toBe('«Сон · окно» — ключ');
    expect(contractValue(canvas, 'Сон · Окно сна · 04'))
      .toBe('«6,4 ч» — моноцифры: шрифт 700 10px/1 Figtree');
    expect(contractValue(canvas, 'Сон · Окно сна · 05')).toBe('отступ сверху auto');
    expect(contractValue(canvas, 'Сон · Окно сна · 06'))
      .toBe('позиция relative, высота 7px, радиус 999px, фон rgba(var(--ink),.07)');
    expect(contractValue(canvas, 'Сон · Окно сна · 07'))
      .toBe('позиция absolute, ширина 68%, радиус 999px, фон rgba(var(--ink),.13)');
    expect(contractValue(canvas, 'Сон · Окно сна · 08'))
      .toBe('позиция absolute, ширина 57%, радиус 999px, фон #7d98a6');
    expect(contractValue(canvas, 'Сон · Окно сна · 09'))
      .toBe('моноцифры: распределение space-between, шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56), отступ сверху 7px');
    expect(contractValue(canvas, 'Сон · Окно сна · текст'))
      .toBe('15 › Сон · окно › 6,4 ч › лёг 01:10 › встал 07:30');
  });

  it('держит вид 2×1 «Окно сна» и ключ в живой ветке window', () => {
    expect(variantsSrc).toMatch(/sleep:\s*\[[\s\S]*?id:\s*'window'[\s\S]*?title:\s*'Окно сна'[\s\S]*?size:\s*'2x1'/);
    expect(windowBranch).toContain("v4Kicker('Сон · окно')");
    expect(windowBranch).toContain('widget-v4-sleep-window__hours');
    expect(windowBranch).toContain('widget-v4-sleep-window__target');
    expect(windowBranch).toContain('widget-v4-sleep-window__actual');
    expect(windowBranch).toContain('widget-v4-sleep-window__labels');
    expect(windowBranch).toContain("formatSleepHmLabel(sleepStart, 'лёг')");
    expect(windowBranch).toContain("formatSleepHmLabel(sleepEnd, 'встал')");
    expect(windowBranch).not.toContain("v4Kicker('Сон')");
    expect(windowBranch).not.toContain('widget-v4-mini__value--pair');
  });

  it('держит шапку, дорожку и подписи числами кадра', () => {
    const tight = rules.get('.widget-v4-row--tight');
    expect(tight['align-items']).toBe('baseline');
    const row = rules.get('.widget-v4-row');
    expect(row['justify-content']).toBe('space-between');

    const hours = rules.get('.widget-v4-row__meta.widget-v4-sleep-window__hours');
    expect(hours['font-size']).toBe('10px');
    expect(hours['font-weight']).toBe('700');
    expect(hours['line-height']).toBe('1');
    const meta = rules.get('.widget-v4-row__meta');
    expect(meta['font-size']).toBe('9px');
    expect(meta['font-weight']).toBe('600');

    const track = rules.get('.widget-v4-sleep-window');
    expect(track.position).toBe('relative');
    expect(track.height).toBe('7px');
    expect(track['border-radius']).toBe('999px');
    expect(track['margin-top']).toBe('auto');
    expect(track.background).toBe('rgba(0, 0, 0, 0.07)');

    const target = rules.get('.widget-v4-sleep-window__target');
    expect(target.position).toBe('absolute');
    expect(target['border-radius']).toBe('999px');
    expect(target.background).toBe('rgba(0, 0, 0, 0.13)');
    expect(target.width || '').toBe('');

    const actual = rules.get('.widget-v4-sleep-window__actual');
    expect(actual.position).toBe('absolute');
    expect(actual.background).toContain('--v4-water');
    expect(actual.background).toContain('#7d98a6');

    const labels = rules.get('.widget-v4-sleep-window__labels');
    expect(labels['justify-content']).toBe('space-between');
    expect(labels['font-size']).toBe('9px');
    expect(labels['font-weight']).toBe('600');
    expect(labels['line-height']).toBe('1');
    expect(labels['margin-top']).toBe('7px');
    expect(labels.color).toContain('--v4-ink-data');
  });
});
