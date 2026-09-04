/**
 * Сведённый кусок home-widgets: виды плитки «Кольца БЖУ» (stop-кадры канваса).
 * Как сейчас 3×2, три полосы, что выбивается, только белок, пустой день.
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

describe('Кольца БЖУ · сведённые stop-кадры', () => {
  beforeAll(() => {
    canvas = fs.readFileSync(CANVAS, 'utf8');
    cssSrc = fs.readFileSync(CSS, 'utf8');
    paletteSrc = fs.readFileSync(PALETTE, 'utf8');
    variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
    uiSrc = fs.readFileSync(UI, 'utf8');
    rules = readRules(cssSrc);
  });

  const macrosBody = () => {
    const start = uiSrc.indexOf('function MacrosVariantBody');
    const end = uiSrc.indexOf('function MacrosWidgetContent', start);
    return uiSrc.slice(start, end);
  };
  const variants = () => variantsSrc.match(/macros:\s*\[([\s\S]*?)\],\s*water:/)?.[1] || '';

  it('читает ключевые строки «Как сейчас» из актуального data-v', () => {
    expect(contractValue(canvas, 'Кольца БЖУ · Как сейчас · 02'))
      .toBe('зазор 6px, отступ сверху auto, отступ снизу auto');
    expect(contractValue(canvas, 'Кольца БЖУ · Как сейчас · 05'))
      .toBe('«96» — моноцифры: отступ сверху 5px, шрифт 700 13px/1 Figtree, цвет var(--val-bad)');
    expect(contractValue(canvas, 'вид · кольца БЖУ'))
      .toContain('svg 46 × 46, радиус кольца 18, толщина 5');
  });

  it('держит четыре вида БЖУ в каталоге и hero rings 3×2', () => {
    const block = variants();
    expect(block).toMatch(/id:\s*'rings'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'3x2'/);
    expect(block).toMatch(/id:\s*'bars'[\s\S]*?size:\s*'2x1'/);
    expect(block).toMatch(/id:\s*'deficits'[\s\S]*?size:\s*'2x1'/);
    expect(block).toMatch(/id:\s*'protein_only'[\s\S]*?size:\s*'1x1'/);
    const body = macrosBody();
    expect(body).toContain("variantId === 'rings' || size === '3x2'");
    expect(body).toContain('widget-v4-macros');
    expect(body).toContain("v4SageRing({ value: animProtein");
  });

  it('держит геометрию hero: ряд колец, кольцо 46px, факт 13px', () => {
    const row = rules.get('.widget-v4-macros');
    expect(row.gap).toBe('6px');
    expect(row['margin-top']).toBe('auto');
    expect(row['margin-bottom']).toBe('auto');

    const macro = rules.get('.widget-v4-macro');
    expect(macro['flex']).toBe('1 1 0');
    expect(macro['min-width']).toBe('0');
    expect(macro['text-align']).toBe('center');

    const label = rules.get('.widget-v4-macro__label');
    expect(label['margin-bottom']).toBe('5px');

    const svg = rules.get('.widget-v4-macro svg');
    expect(svg.width).toBe('46px');
    expect(svg.height).toBe('46px');

    const fact = rules.get('.widget-v4-macro__fact');
    expect(fact['margin-top']).toBe('5px');
    expect(fact['font-size']).toBe('13px');
    expect(fact['font-weight']).toBe('700');
    expect(fact['line-height']).toBe('1');
  });

  it('цвет hero — роли; песок ≠ синий на --v4-val-bad и --v4-ok-fill', () => {
    const sand = paletteSrc.slice(0, paletteSrc.indexOf('[data-theme-id="sand-dark"]'));
    const blue = paletteSrc.slice(
      paletteSrc.indexOf('[data-theme-id="blue"]'),
      paletteSrc.indexOf('[data-theme-id="blue-dark"]'),
    );
    const valBad = (block) => block.match(/--v4-val-bad:\s*(#[0-9a-f]{6})/i)?.[1];
    const okFill = (block) => block.match(/--v4-ok-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(valBad(sand)).toBe('#a8382b');
    expect(valBad(blue)).toBe('#a8382b');
    expect(okFill(sand)).toBe('#7a8a5e');
    expect(okFill(blue)).toBe('#4f9a78');
    expect(okFill(sand)).not.toBe(okFill(blue));

    const badFact = rules.get('.widget-v4-macro__fact--bad');
    expect(badFact.color).toContain('--v4-val-bad');
    const ringFill = rules.get('.widget-v4-macro__ring-fill');
    expect(ringFill.stroke).toContain('--v4-ok-fill');
  });

  it('держит вид «Три полосы»: column 4px, дорожка 5px, числа 9px', () => {
    const body = macrosBody();
    expect(body).toContain("variantId === 'bars'");
    expect(body).toContain('widget-v4-macro-bars');
    expect(body).toContain('v4MacroBarRow(');

    const bars = rules.get('.widget-v4-macro-bars');
    expect(bars['flex-direction']).toBe('column');
    expect(bars.gap).toBe('4px');
    expect(bars['margin-top']).toBe('auto');

    const row = rules.get('.widget-v4-macro-bar-row');
    expect(row.gap).toBe('7px');
    expect(row['font-size']).toBe('9px');

    const track = rules.get('.widget-v4-macro-bar-row__track');
    expect(track.height).toBe('5px');
    expect(track['border-radius']).toBe('999px');

    const nums = rules.get('.widget-v4-macro-bar-row__nums');
    expect(nums.width).toBe('46px');
    expect(nums['text-align']).toBe('right');
  });

  it('держит вид «Что выбивается»: hero 26px и строки 10px', () => {
    const body = macrosBody();
    expect(body).toContain("variantId === 'deficits'");
    expect(body).toContain("v4Kicker('БЖУ · что выбивается')");
    expect(body).toContain('widget-v4-deficit-hero');

    const hero = rules.get('.widget-v4-deficit-hero');
    expect(hero['font-size']).toBe('26px');
    expect(hero['font-weight']).toBe('600');
    expect(hero['letter-spacing']).toBe('-0.03em');
    expect(hero['margin-top']).toBe('9px');
    expect(hero.gap).toBe('5px');

    const rows = rules.get('.widget-v4-deficit-rows');
    expect(rows.gap).toBe('6px');
    expect(rows['margin-top']).toBe('auto');
    expect(rows['font-size']).toBe('10px');
  });

  it('держит вид «Только белок»: 21px, goalbar 4px и bad-fill', () => {
    const body = macrosBody();
    expect(body).toContain("variantId === 'protein_only'");
    expect(body).toContain("v4Kicker('Белки')");
    expect(body).toContain('v4GoalBar(proteinPct, proteinBad');

    const value = rules.get('.widget-v4-mini__value');
    expect(value['font-size']).toBe('1.3125rem');
    expect(value['letter-spacing']).toBe('-0.02em');

    const bar = rules.get('.widget-v4-goalbar');
    expect(bar.height).toBe('4px');
    expect(cssSrc).toContain('.widget-macros--1x1 .widget-v4-goalbar');
    expect(cssSrc).toContain('.widget-v4-goalbar__fill--bad');
  });

  it('пустой день — кольца без дуги и «— / N»', () => {
    expect(contractValue(canvas, 'Кольца БЖУ · пустой день · 05'))
      .toBe('«—» — моноцифры: отступ сверху 5px, шрифт 700 13px/1 Figtree, цвет rgba(var(--ink),.42)');
    const body = macrosBody();
    expect(body).toContain('empty: true');
    expect(uiSrc).toContain('widget-v4-macro__fact--empty');

    const dash = rules.get('.widget-v4-macro__fact--empty .widget-v4-macro__fact-val');
    expect(dash.color).toContain('--v4-ink-3');
  });
});
