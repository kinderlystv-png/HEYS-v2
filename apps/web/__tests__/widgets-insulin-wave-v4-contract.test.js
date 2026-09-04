/**
 * Сведённый кусок home-widgets: плитка «Инсулиновая волна» (stop-кадры канваса).
 * Пять видов, три состояния схемы (день / пустой / ночная оценка), стык и нахлёст.
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
const V4 = path.join(WEB_DIR, 'heys_widgets_insulin_wave_v4.js');
const VARIANTS = path.join(WEB_DIR, 'heys_widgets_variants_v4.js');

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`))?.[1] || '';
}

let uiSrc;
let v4Src;
let cssSrc;
let paletteSrc;
let variantsSrc;
let canvas;
let rules;

describe('Инсулиновая волна · сведённые stop-кадры', () => {
  beforeAll(() => {
    canvas = fs.readFileSync(CANVAS, 'utf8');
    cssSrc = fs.readFileSync(CSS, 'utf8');
    paletteSrc = fs.readFileSync(PALETTE, 'utf8');
    variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
    uiSrc = fs.readFileSync(UI, 'utf8');
    v4Src = fs.readFileSync(V4, 'utf8');
    rules = readRules(cssSrc);
  });

  const body = () => {
    const start = uiSrc.indexOf('function InsulinWaveVariantBody');
    const end = uiSrc.indexOf('function InsulinWaveWidgetContent', start);
    return uiSrc.slice(start, end);
  };
  const variants = () => variantsSrc.match(/insulinWave:\s*\[([\s\S]*?)\],\s*\/\/ ─── Шесть/)?.[1] || '';

  it('читает ключевые строки из актуального data-v', () => {
    expect(contractValue(canvas, 'Инсулиновая волна · День как есть · 04'))
      .toBe('«3 приёма» — моноцифры: шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Инсулиновая волна · Текущая волна · 06'))
      .toBe('«40» — моноцифры: шрифт 600 26px/1 Figtree, цвет var(--ac), трекинг -.03em');
    expect(contractValue(canvas, 'волна · счётчик приёмов'))
      .toContain('стоит под графиком, а не в углу плитки');
    expect(contractValue(canvas, 'вид · инсулиновая волна'))
      .toContain('три купола заливкой #e6cfa8');
  });

  it('держит пять видов волны в каталоге', () => {
    const block = variants();
    expect(block).toMatch(/id:\s*'day_as_is'[\s\S]*?title:\s*'День как есть'[\s\S]*?size:\s*'2x2'/);
    expect(block).toMatch(/id:\s*'current_wave'[\s\S]*?title:\s*'Текущая волна'[\s\S]*?size:\s*'2x2'/);
    expect(block).toMatch(/id:\s*'overlaps'[\s\S]*?title:\s*'Пересечения'[\s\S]*?size:\s*'2x2'/);
    expect(block).toMatch(/id:\s*'day_bar'[\s\S]*?title:\s*'Полоса дня'[\s\S]*?size:\s*'2x1'/);
    expect(block).toMatch(/id:\s*'calm_window'[\s\S]*?title:\s*'Спокойное окно'[\s\S]*?size:\s*'1x1'/);
  });

  it('держит «День как есть»: схема под графиком, счётчик в footer', () => {
    const chunk = body();
    expect(chunk).toContain("variantId === 'day_as_is'");
    expect(chunk).toContain('InsulinWaveDaySvg({ v4 })');
    expect(chunk).toContain('widget-v4-insulin-wave__footer');
    expect(chunk).toContain('overlapLabel || mealLabel');
    expect(chunk).toContain('jointCountLabel || stateLabel');

    const footer = rules.get('.widget-v4-stack__footer.widget-v4-insulin-wave__footer > span');
    expect(footer['font-size']).toBe('9.5px');
    expect(footer['font-weight']).toBe('700');
    expect(footer['line-height']).toBe('1');

    const waveDay = rules.get('.widget-v4-insulin-wave--day');
    expect(waveDay['margin-top']).toBe('8px');
  });

  it('держит схему: заливка, нахлёст, стык, базовая линия', () => {
    expect(v4Src).toContain('buildWaveScheme');
    expect(uiSrc).toContain('widget-v4-insulin-wave__fill');
    expect(uiSrc).toContain('widget-v4-insulin-wave__joint');
    expect(uiSrc).toContain('widget-v4-insulin-wave__overlap');
    expect(uiSrc).toContain('widget-v4-insulin-wave__brace');

    const fill = rules.get('.widget-v4-insulin-wave__fill');
    expect(fill.fill).toContain('--v4-sand-wave');
    const overlap = rules.get('.widget-v4-insulin-wave__overlap');
    expect(overlap.fill).toContain('--v4-wave-overlap');
    const joint = rules.get('.widget-v4-insulin-wave__joint');
    expect(joint.fill).toContain('color-mix');
  });

  it('цвет волны и нахлёста — роли; песок ≠ синий на --v4-act-text и --v4-wave-overlap', () => {
    const sand = paletteSrc.slice(0, paletteSrc.indexOf('[data-theme-id="sand-dark"]'));
    const blue = paletteSrc.slice(
      paletteSrc.indexOf('[data-theme-id="blue"]'),
      paletteSrc.indexOf('[data-theme-id="blue-dark"]'),
    );
    const actText = (block) => block.match(/--v4-act-text:\s*(#[0-9a-f]{6})/i)?.[1];
    const overlap = (block) => block.match(/--v4-wave-overlap:\s*(#[0-9a-f]{6})/i)?.[1];
    const waveFill = (block) => block.match(/--v4-sand-wave-fill:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(actText(sand)).toBe('#8a4a20');
    expect(actText(blue)).toBe('#1d5e96');
    expect(overlap(sand)).toBe('#d99a63');
    expect(overlap(blue)).toBe('#b03a24');
    expect(waveFill(sand)).toBe('#e6cfa8');
    expect(actText(sand)).not.toBe(actText(blue));
    expect(overlap(sand)).not.toBe(overlap(blue));

    const heroOverlap = rules.get('.widget-v4-hero-num__val.widget-v4-val--overlap');
    expect(heroOverlap.color).toContain('--v4-wave-overlap');
  });

  it('держит «Текущая волна» и «Пересечения»: герой, SVG без базовой линии', () => {
    const chunk = body();
    expect(chunk).toContain("variantId === 'current_wave'");
    expect(chunk).toContain("variantId === 'overlaps'");
    expect(chunk).toContain('InsulinWaveCurrentSvg');
    expect(chunk).toContain('InsulinWaveOverlapSvg');
    expect(chunk).toContain('widget-v4-insulin-wave__overlap-note');

    const hero = rules.get('.widget-v4-hero-num__val');
    expect(hero['font-size']).toBe('1.625rem');
    expect(hero['font-weight']).toBe('600');
    expect(hero['letter-spacing']).toBe('-0.03em');

    const note = rules.get('.widget-v4-insulin-wave__overlap-note');
    expect(note['font-size']).toBe('9px');
    expect(note['font-weight']).toBe('600');
    expect(note['margin-top']).toBe('7px');
  });

  it('держит «Полоса дня»: daybar 9px и подписи 8.5px', () => {
    const chunk = body();
    expect(chunk).toContain("variantId === 'day_bar'");
    expect(chunk).toContain('InsulinWaveDayBar');

    const bar = rules.get('.widget-v4-insulin-daybar');
    expect(bar.height).toBe('9px');
    expect(bar.gap).toBe('2px');
    expect(bar['margin-top']).toBe('auto');

    const labels = rules.get('.widget-v4-insulin-daybar__labels');
    expect(labels['font-size']).toBe('8.5px');
    expect(labels['margin-top']).toBe('6px');
  });

  it('держит «Спокойное окно»: mini 21px и good-тон', () => {
    const chunk = body();
    expect(chunk).toContain("variantId === 'calm_window'");
    expect(chunk).toContain('v4.calmWindowLabel');

    const mini = rules.get('.widget-v4-mini__value');
    expect(mini['font-size']).toBe('1.3125rem');
    expect(mini['letter-spacing']).toBe('-0.02em');
    expect(uiSrc).toContain('V4_INSULIN_CALM_MIN = 180');
  });

  it('держит пустой день и ночную оценку', () => {
    const chunk = body();
    expect(chunk).toContain('InsulinWaveEmptySvg');
    expect(chunk).toContain("'noData'");
    expect(chunk).toContain('isOvernight');
    expect(uiSrc).toContain('widget-v4-insulin-wave--overnight');

    const flat = rules.get('.widget-v4-insulin-wave__flatline');
    expect(flat.stroke).toContain('color-mix');
    const note = rules.get('.widget-v4-insulin-wave__note');
    expect(note['font-size']).toBe('9.5px');
    expect(note['margin-top']).toBe('7px');
    const overnightFill = cssSrc.match(
      /\.widget-v4-insulin-wave--overnight \.widget-v4-insulin-wave__fill\s*\{[^}]*opacity:\s*0\.18/s,
    );
    expect(overnightFill).toBeTruthy();
  });

  it('тон состояния: overlap → --overlap, calm >3ч → good', () => {
    expect(uiSrc).toContain("if (Number(v4?.overlapCount) > 0) return 'overlap'");
    expect(uiSrc).toContain('v4InsulinWaveState(v4)');
    expect(uiSrc).toContain("v4ValueStateClass('neutral')");
    expect(uiSrc).toContain('V4_INSULIN_CALM_MIN = 180');
  });
});
