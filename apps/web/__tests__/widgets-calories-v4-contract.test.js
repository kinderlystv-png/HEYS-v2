/**
 * Сведённый кусок home-widgets: виды плитки «Калории» (stop-кадры канваса).
 * Hero 2×2, строка 2×1, ужин, активность, пустой день, состояния.
 * Кадры data-demo="protocol" («без заголовка» альтернативы) — вне продуктового scope.
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

describe('Калории · сведённые stop-кадры', () => {
  beforeAll(() => {
    canvas = fs.readFileSync(CANVAS, 'utf8');
    cssSrc = fs.readFileSync(CSS, 'utf8');
    paletteSrc = fs.readFileSync(PALETTE, 'utf8');
    variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
    uiSrc = fs.readFileSync(UI, 'utf8');
    rules = readRules(cssSrc);
  });

  const hero = () => {
    const start = uiSrc.indexOf('function CaloriesVariantBody');
    const end = uiSrc.indexOf('function CaloriesWidgetContent', start);
    return uiSrc.slice(start, end);
  };
  const variants = () => variantsSrc.match(/calories:\s*\[([\s\S]*?)\],\s*macros:/)?.[1] || '';

  it('читает ключевые строки «Как сейчас» из актуального data-v', () => {
    expect(contractValue(canvas, 'Калории · Как сейчас · 03'))
      .toBe('«642» — моноцифры: шрифт 600 34px/.9 Figtree, цвет var(--ac), трекинг -.035em');
    expect(contractValue(canvas, 'Калории · Как сейчас · 06'))
      .toBe('высота 6px, радиус 999px, фон rgba(var(--ink),.1)');
    expect(contractValue(canvas, 'Калории · Как сейчас · 11'))
      .toBe('«съедено» — шрифт 500 8.5px/1 Figtree, цвет rgba(var(--ink),.56)');
  });

  it('держит четыре вида калорий в каталоге и hero по умолчанию', () => {
    const block = variants();
    expect(block).toMatch(/id:\s*'hero'[\s\S]*?title:\s*'Как сейчас'[\s\S]*?size:\s*'2x2'/);
    expect(block).toMatch(/id:\s*'line'[\s\S]*?size:\s*'2x1'/);
    expect(block).toMatch(/id:\s*'dinner'[\s\S]*?size:\s*'2x2'/);
    expect(block).toMatch(/id:\s*'activity'[\s\S]*?size:\s*'2x1'/);
    expect(hero()).toContain('widget-calories--v4-hero');
    expect(hero()).toContain("cap: 'съедено'");
    expect(hero()).toContain("cap: 'норма'");
    expect(cssSrc).toMatch(/body:has\(\.widgets-tab\) \.widget--calories\s*\{[^}]*padding:\s*14px/s);
    expect(cssSrc).toMatch(/\.widget:has\(\.widget-calories--2x2\) \.widget__header\s*\{[^}]*display:\s*none/s);
  });

  it('держит геометрию hero: число 34px, полоса 6px, foot 8px/2px', () => {
    const valueLg = rules.get('.widget-calories__hero-value .widget-calories__value--lg');
    expect(valueLg['font-size']).toBe('2.125rem');
    expect(valueLg['font-weight']).toBe('600');
    expect(valueLg['line-height']).toBe('0.9');
    expect(valueLg['letter-spacing']).toBe('-0.035em');

    const label = rules.get('.widget-calories__hero-remaining-label');
    expect(label['font-size']).toBe('0.625rem');
    expect(label['margin-top']).toBe('7px');

    const bar = rules.get('.widget-calories__hero-bar');
    expect(bar.height).toBe('6px');
    expect(bar['border-radius']).toBe('999px');
    expect(bar.position).toBe('relative');
    expect(bar.overflow).toBe('hidden');

    const foot = rules.get('.widget-calories__hero-bar-foot');
    expect(foot['justify-content']).toBe('space-between');
    expect(foot['margin-top']).toBe('8px');

    const col = rules.get('.widget-calories__hero-bar-col');
    expect(col['flex-direction']).toBe('column');
    expect(col.gap).toBe('2px');
  });

  it('цвет hero — роли, песок ≠ синий на числе; норма через --v4-sand-ok-text', () => {
    const sand = paletteSrc.slice(0, paletteSrc.indexOf('[data-theme-id="sand-dark"]'));
    const blue = paletteSrc.slice(
      paletteSrc.indexOf('[data-theme-id="blue"]'),
      paletteSrc.indexOf('[data-theme-id="blue-dark"]'),
    );
    const actText = (block) => block.match(/--v4-act-text:\s*(#[0-9a-f]{6})/i)?.[1];
    const sandOkText = (block) => block.match(/--v4-sand-ok-text:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(actText(sand)).toBe('#8a4a20');
    expect(actText(blue)).toBe('#1d5e96');
    expect(sandOkText(sand)).toBe('#5c6a45');
    expect(sandOkText(blue)).toBe('#5c6a45');
    expect(actText(sand)).not.toBe(actText(blue));

    const heroNum = rules.get('.widget-calories__hero-value .widget-calories__value--lg');
    expect(heroNum.color).toContain('--v4-act-text');
    const norm = rules.get('.widget-calories__hero-bar-num--good');
    expect(norm.color).toContain('--v4-sand-ok-text');
  });

  it('держит строку 2×1 без ключа, полосу 5px и дробь', () => {
    const lineStart = hero().indexOf("if (variantId === 'line' || size === '2x1')");
    const lineChunk = hero().slice(lineStart, lineStart + 2200);
    expect(lineChunk).not.toContain("v4Kicker('Калории')");
    expect(lineChunk).toContain('widget-calories__line-fraction');
    expect(lineChunk).toContain('caloriesHeroBar(');

    const head = rules.get('.widget-calories__line-head');
    expect(head['justify-content']).toBe('space-between');
    expect(head.gap).toBe('6px');

    const value = rules.get('.widget-calories__line-value');
    expect(value['font-size']).toBe('19px');
    expect(value['letter-spacing']).toBe('-0.03em');

    const footBar = rules.get('.widget-calories__line-foot .widget-calories__hero-bar');
    expect(footBar.height).toBe('5px');
  });

  it('держит активность: прибавка 9px/700 и foot 8.5px', () => {
    const actStart = hero().indexOf("if (variantId === 'activity')");
    const actChunk = hero().slice(actStart, actStart + 1200);
    expect(actChunk).toContain('widget-calories__line-meta--gain');
    expect(actChunk).toContain('widget-calories__activity-foot');

    const gain = rules.get('.widget-calories__line-meta--gain');
    expect(gain['font-size']).toBe('9px');
    expect(gain['font-weight']).toBe('700');

    const foot = rules.get('.widget-calories__activity-foot');
    expect(foot['font-size']).toBe('8.5px');
    expect(foot['font-weight']).toBe('600');
    expect(foot['margin-top']).toBe('auto');
  });

  it('держит ужин: число 26px, полосу и заметку о нехватке', () => {
    const dinnerStart = hero().indexOf("if (variantId === 'dinner')");
    const dinnerChunk = hero().slice(dinnerStart, dinnerStart + 1500);
    expect(dinnerChunk).toContain('widget-calories--v4-dinner');
    expect(dinnerChunk).toContain('хватит на ужин');
    expect(dinnerChunk).toContain('не хватит');

    const md = rules.get('.widget-calories__value--md');
    expect(md['font-size']).toBe('26px');
    expect(md['letter-spacing']).toBe('-0.035em');

    const note = rules.get('.widget-calories__dinner-note');
    expect(note['font-size']).toBe('10px');
    expect(note['margin-top']).toBe('7px');
  });

  it('держит состояния: перебор, закрытый день и split полосы', () => {
    expect(uiSrc).toContain('function caloriesBarSplit');
    expect(uiSrc).toContain('widget-calories__hero-bar-over');
    const body = hero();
    expect(body).toContain('съедено за день');
    expect(body).toContain("cap: 'не съедено'");
    expect(body).toContain("cap: 'перебор'");
    expect(body).toMatch(/hasOver && !isClosedDay \? ' widget-v4-val--bad'/);

    const over = rules.get('.widget-calories__hero-bar-over');
    expect(over.position).toBe('absolute');
    expect(over.background).toContain('--v4-bad-text');
  });

  it('пустой день — прочерк и норма без полосы', () => {
    expect(contractValue(canvas, 'Калории · пустой день · 2×1 · 04'))
      .toBe('«—» — моноцифры: шрифт 600 21px/1 Figtree, цвет rgba(var(--ink),.42)');
    const emptyAt = hero().indexOf('if (data?.hasData !== true)');
    const emptyChunk = hero().slice(emptyAt, emptyAt + 1800);
    expect(emptyChunk).toContain('widget-calories--empty');
    expect(emptyChunk.match(/widget-calories--empty/g)).toHaveLength(2);
    expect(emptyChunk).not.toContain('caloriesHeroBar(');

    const dash = rules.get('.widget-calories__empty-dash');
    expect(dash['font-size']).toBe('21px');
    expect(dash.color).toContain('--v4-ink-3');

    const emptyLg = rules.get('.widget-calories--empty .widget-calories__value--lg');
    expect(emptyLg.color).toContain('--v4-ink-3');
  });
});
