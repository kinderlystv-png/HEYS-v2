/**
 * Сведённый кусок home-widgets: виды плитки «Вес» (stop-кадры канваса).
 * Как сейчас 2×2, только число 1×1, точки и среднее 2×2.
 */
import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

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

let uiSrc;
let cssSrc;
let paletteSrc;
let variantsSrc;
let canvas;
let rules;

describe('Вес · сведённые stop-кадры', () => {
  beforeAll(() => {
    canvas = fs.readFileSync(CANVAS, 'utf8');
    cssSrc = fs.readFileSync(CSS, 'utf8');
    paletteSrc = fs.readFileSync(PALETTE, 'utf8');
    variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
    uiSrc = fs.readFileSync(UI, 'utf8');
    rules = readRules(cssSrc);
  });

  const weightBody = () => {
    const start = uiSrc.indexOf('function WeightVariantBody');
    const end = uiSrc.indexOf('function WeightWidgetContent', start);
    return uiSrc.slice(start, end);
  };
  const variants = () => variantsSrc.match(/weight:\s*\[([\s\S]*?)\],\s*\/\/ ─── Шесть/)?.[1] || '';

  it('читает ключевые строки из актуального data-v', () => {
    expect(contractValue(canvas, 'Вес · Как сейчас · 04'))
      .toBe('«91,1» — моноцифры: шрифт 600 26px/1 Figtree');
    expect(contractValue(canvas, 'Вес · Как сейчас · 05'))
      .toBe('«−0,9 за неделю» — моноцифры: шрифт 600 10px/1 Figtree, цвет var(--gr), отступ сверху 7px');
    expect(contractValue(canvas, 'Вес · Только число · 04'))
      .toBe('«91,1» — моноцифры: шрифт 600 21px/1 Figtree, цвет var(--tx), трекинг -.02em');
    expect(contractValue(canvas, 'Вес · Точки и среднее · 05'))
      .toBe('«точки — весы, линия — среднее за 7 дней» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56), отступ сверху 5px');
  });

  it('держит четыре вида веса в каталоге', () => {
    const block = variants();
    expect(block).toMatch(/id:\s*'number_week'[\s\S]*?title:\s*'Число и неделя'[\s\S]*?size:\s*'2x1'/);
    expect(block).toMatch(/id:\s*'spark'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'2x2'/);
    expect(block).toMatch(/id:\s*'delta'[\s\S]*?title:\s*'Только число'[\s\S]*?size:\s*'1x1'/);
    expect(block).toMatch(/id:\s*'scatter'[\s\S]*?title:\s*'Точки и среднее'[\s\S]*?size:\s*'2x2'/);
  });

  it('держит вид «Как сейчас»: kicker, герой 26px, дельта 10px', () => {
    expect(uiSrc).toContain('function WeightWidgetV4_2x2');
    expect(uiSrc).toContain("v4Kicker('Вес')");
    expect(uiSrc).toContain('widget-v4-hero-num__val');
    expect(uiSrc).toContain('widget-v4-delta');
    expect(uiSrc).toContain('WidgetV4DrawSparkSvg');

    const hero = rules.get('.widget-v4-hero-num');
    expect(hero['align-items']).toBe('baseline');
    expect(hero.gap).toBe('5px');
    expect(hero['margin-top']).toBe('10px');

    const heroVal = rules.get('.widget-v4-hero-num__val');
    expect(heroVal['font-size']).toBe('1.625rem');
    expect(heroVal['font-weight']).toBe('600');
    expect(heroVal['line-height']).toBe('1');

    const delta = rules.get('.widget-v4-delta.widget-v4-val--good');
    expect(delta['font-size']).toBe('10px');
    expect(delta['font-weight']).toBe('600');
    expect(delta['margin-top']).toBeUndefined();
    const deltaBase = rules.get('.widget-v4-delta');
    expect(deltaBase['margin-top']).toBe('7px');

    expect(cssSrc).not.toMatch(
      /body:has\(\.widgets-tab\) \.widget-weight--2x2 \.widget-v4-hero-num__val\s*\{[^}]*font-size:\s*30px/s,
    );
  });

  it('держит спарклайн «Как сейчас»: viewBox 130×38, линия 2.5, точка 3.5', () => {
    expect(uiSrc).toContain("viewBox = '0 0 130 38'");
    expect(uiSrc).toContain('height = 38');
    expect(uiSrc).toContain('strokeWidth: 2.5');
    expect(uiSrc).toContain('dotR = 3.5');
    expect(uiSrc).toContain("className: 'widget-v4-spark widget-v4-spark--act'");

    const spark = rules.get('.widget-v4-spark');
    expect(spark['margin-top']).toBe('auto');

    const actLine = rules.get('.widget-v4-spark--act .widget-v4-spark__line');
    expect(actLine.stroke).toContain('--v4-act');
  });

  it('держит вид «Только число»: mini pair 21px и gap 2', () => {
    const body = weightBody();
    expect(body).toContain("variantId === 'delta'");
    expect(body).toContain('widget-v4-mini__value--pair');

    const value = rules.get('.widget-v4-mini__value');
    expect(value['font-size']).toBe('1.3125rem');
    expect(value['font-weight']).toBe('600');
    expect(value['letter-spacing']).toBe('-0.02em');
    expect(value['margin-top']).toBe('auto');

    const pair = rules.get('.widget-v4-mini__value--pair');
    expect(pair.display).toBe('flex');
    expect(pair['align-items']).toBe('baseline');
    expect(pair.gap).toBe('2px');
  });

  it('держит вид «Точки и среднее»: шапка, точки r 2.2, линия --v4-ok-fill', () => {
    const body = weightBody();
    expect(body).toContain("variantId === 'scatter'");
    expect(body).toContain("v4Kicker('Вес · точки и среднее')");
    expect(body).toContain('widget-weight__scatter');
    expect(body).toContain("r: 2.2");
    expect(body).toContain("stroke: 'var(--v4-ok-fill, #7a8a5e)'");
    expect(body).toContain('точки — весы, линия — среднее за 7 дней');

    const row = rules.get('.widget-v4-row--tight');
    expect(row['align-items']).toBe('baseline');

    const meta = rules.get('.widget-weight--2x2 .widget-v4-row__meta');
    expect(meta['font-size']).toBe('10px');
    expect(meta['font-weight']).toBe('700');

    const foot = rules.get('.widget-weight__scatter-foot');
    expect(foot['font-size']).toBe('9px');
    expect(foot['font-weight']).toBe('600');
    expect(foot['margin-top']).toBe('5px');
  });

  it('цвет — роли; песок ≠ синий на --v4-act и --v4-ok-fill', () => {
    const sand = paletteSrc.slice(0, paletteSrc.indexOf('[data-theme-id="sand-dark"]'));
    const blue = paletteSrc.slice(
      paletteSrc.indexOf('[data-theme-id="blue"]'),
      paletteSrc.indexOf('[data-theme-id="blue-dark"]'),
    );
    const act = (block) => block.match(/--v4-act:\s*(#[0-9a-f]{6})/i)?.[1];
    const okFill = (block) => block.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(act(sand)).toBe('#c67139');
    expect(act(blue)).toBe('#1d5e96');
    expect(okFill(sand)).toBe('#7a8a5e');
    expect(okFill(blue)).toBe('#4f9a78');
    expect(act(sand)).not.toBe(act(blue));
    expect(okFill(sand)).not.toBe(okFill(blue));

    const good = rules.get('.widget-v4-val--good');
    expect(good.color).toContain('--v4-sand-ok-text');
    const actLine = rules.get('.widget-v4-spark--act polyline');
    expect(actLine?.stroke || rules.get('.widget-v4-spark--act .widget-v4-spark__line').stroke)
      .toContain('--v4-act');
  });
});
