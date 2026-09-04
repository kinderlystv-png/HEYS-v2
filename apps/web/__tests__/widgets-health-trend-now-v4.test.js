/**
 * Сведённый кусок home-widgets: кадр «Тренд здоровья · Как сейчас».
 * 2×2 — ключ, «за 14 дней», герой 26 px/--gr, линия 130×40/--gr2.
 * Компакт 2×1, порог ±2 и семь прогонов не открывал.
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

describe('Тренд здоровья · Как сейчас — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function HealthTrendVariantBody');
  const compactAt = uiSrc.indexOf("if (isShort || variantId === 'compact')", bodyAt);
  const nowAt = uiSrc.indexOf('// === 2×2', compactAt);
  const nextFn = uiSrc.indexOf('function HealthTrendWidgetContent', nowAt);
  const now = uiSrc.slice(nowAt, nextFn > nowAt ? nextFn : nowAt + 2500);
  const compact = uiSrc.slice(compactAt, nowAt > compactAt ? nowAt : compactAt + 2500);

  it('читает восемь строк кадра из актуального data-v', () => {
    expect(contractValue(canvas, 'Тренд здоровья · Как сейчас · 01'))
      .toBe('плитка: фон var(--gr-bg)');
    expect(contractValue(canvas, 'Тренд здоровья · Как сейчас · 02'))
      .toBe('«Тренд здоровья» — ключ');
    expect(contractValue(canvas, 'Тренд здоровья · Как сейчас · 03'))
      .toBe('выравнивание baseline, зазор 5px, отступ сверху 10px');
    expect(contractValue(canvas, 'Тренд здоровья · Как сейчас · 04'))
      .toBe('«+8» — моноцифры: шрифт 600 26px/1 Figtree, цвет var(--gr)');
    expect(contractValue(canvas, 'Тренд здоровья · Как сейчас · рисунок 01'))
      .toBe('поле рисунка 100%×40 (viewBox 0 0 130 40)');
    expect(contractValue(canvas, 'Тренд здоровья · Как сейчас · рисунок 02'))
      .toBe('ломаная, точки 4,32 26,28 48,30 70,20 92,16 114,10 126,8, линия var(--gr2), толщина 2.5');
    expect(contractValue(canvas, 'Тренд здоровья · Как сейчас · рисунок 03'))
      .toBe('точка r 3.5 в (126,8), заливка var(--gr2)');
    expect(contractValue(canvas, 'Тренд здоровья · Как сейчас · текст'))
      .toBe('25 › Тренд здоровья › +8 › за 14 дней');
  });

  it('держит вид 2×2: ключ, герой, коробка 130×40; компакт без этого класса', () => {
    expect(variantsSrc).toMatch(/healthTrend:\s*\[[\s\S]*?id:\s*'spark'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'2x2'/);
    expect(now).toContain('widget-trend-now');
    expect(now).toContain("v4Kicker('Тренд здоровья')");
    expect(now).toContain('widget-v4-hero-num');
    expect(now).toContain('за ${formatRuUnit(periodDays, \'дней\')}');
    expect(now).toContain("viewBox: '0 0 130 40'");
    expect(now).toContain('height: 40');
    expect(now).toContain('WidgetV4DrawSparkSvg');
    expect(now).toContain('HEALTH_SPARK_BOX_LARGE');
    expect(now).not.toContain('widget-trend-compact');
    expect(compact).toContain('widget-trend-compact');
    expect(compact).not.toContain('widget-trend-now');
    expect(uiSrc).toContain('const HEALTH_SPARK_BOX_LARGE = { left: 3.5, right: 126.5, top: 3.5, bottom: 36.5, dotR: 3.5 }');
    expect(uiSrc).toContain('const HEALTH_SPARK_BOX_COMPACT = { left: 2, right: 56, top: 4, bottom: 18, dotR: 3.5 }');
    expect(uiSrc).toContain('const V4_HEALTH_TREND_DEAD_ZONE = 2');
  });

  it('держит герой 26 px/--gr и линию --gr2; компакт тона живы', () => {
    const hero = rules.get('.widget-trend-now .widget-v4-hero-num');
    expect(hero['align-items']).toBe('baseline');
    expect(hero.gap).toBe('5px');
    expect(hero['margin-top']).toBe('10px');
    expect(rules.get('.widget-v4-hero-num')['align-items']).toBe('baseline');
    expect(rules.get('.widget-v4-hero-num').gap).toBe('5px');

    const heroSize = rules.get('.widget-v4-hero-num__val')['font-size'];
    expect(heroSize).toBe('1.625rem');
    expect(parseFloat(heroSize) * 16).toBe(26);
    expect(rules.get('.widget-v4-hero-num__val')['font-weight']).toBe('600');
    expect(rules.get('.widget-v4-hero-num__val')['line-height']).toBe('1');
    expect(rules.get('.widget-trend-now .widget-v4-hero-num__val.widget-v4-val--good').color)
      .toContain('--v4-ok-text');
    expect(rules.get('.widget-v4-hero-num__val.widget-v4-val--good').color)
      .toContain('--v4-sand-ok-text');

    expect(rules.get('.widget-v4-spark')['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-spark').width).toBe('100%');
    expect(rules.get('.widget-v4-spark--ok .widget-v4-spark__line').stroke)
      .toContain('--v4-ok-fill');
    expect(rules.get('.widget-v4-spark--ok .widget-v4-spark__dot').fill)
      .toContain('--v4-ok-fill');

    expect(rules.get('.widget-trend-compact__value')['font-size']).toBe('26px');
    expect(rules.get('.widget-trend-compact__value.widget-v4-val--good').color)
      .toContain('--v4-ok-text');
    expect(rules.get('.widget-trend-compact__value.widget-v4-val--neutral').color)
      .toContain('--v4-ink');
    expect(rules.get('.widget-trend-compact__value.widget-v4-val--bad').color)
      .toContain('--v4-val-bad');
    expect(rules.get('.widget-v4-sleepready-check .widget-v4-checklist__chip')['font-size'])
      .toBe('8.5px');
  });

  it('шалфей числа и линии следует набору; песок ≠ синий; sand-ok на синем не --gr', () => {
    const sand = palette.slice(palette.indexOf('[data-theme-id="sand"]'), palette.indexOf('[data-theme-id="sand-dark"]'));
    const blue = palette.slice(palette.indexOf('[data-theme-id="blue"]'), palette.indexOf('[data-theme-id="blue-dark"]'));
    const role = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    expect(role(sand, '--v4-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-ok-text')).toBe('#1f6e4d');
    expect(role(sand, '--v4-ok-text')).not.toBe(role(blue, '--v4-ok-text'));
    expect(role(sand, '--v4-ok-fill')).toBe('#7a8a5e');
    expect(role(blue, '--v4-ok-fill')).toBe('#4f9a78');
    expect(role(sand, '--v4-ok-fill')).not.toBe(role(blue, '--v4-ok-fill'));
    expect(role(sand, '--v4-ok-bg')).toBe('#eaefe0');
    expect(role(blue, '--v4-ok-bg')).toBe('#e4efe7');
    expect(role(blue, '--v4-sand-ok-text')).toBe('#5c6a45');
    expect(role(blue, '--v4-sand-ok-text')).not.toBe(role(blue, '--v4-ok-text'));
  });
});
