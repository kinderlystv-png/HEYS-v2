/**
 * Сведённый кусок home-widgets: кадры «Вода · Как сейчас», «К этому часу», «Ритм дня».
 * Код воды в этом заходе не меняли — смоук фиксирует уже сведённое.
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

describe('Вода · кадры home-widgets — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const waterBodyAt = uiSrc.indexOf('function WaterVariantBody');
  const waterBody = uiSrc.slice(waterBodyAt, uiSrc.indexOf('function SleepVariantBody', waterBodyAt));

  it('читает ключевые строки кадров из data-v', () => {
    expect(contractValue(canvas, 'Вода · Как сейчас · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Вода · К этому часу · 03')).toBe('«Вода» — ключ');
    expect(contractValue(canvas, 'Вода · Ритм дня · 03')).toMatch(/Вода · 1,7/);
    expect(contractValue(canvas, 'Вода · Как сейчас · текст')).toBe('из 2,7 › Вода › 1,7');
  });

  it('держит три вида воды в каталоге', () => {
    expect(variantsSrc).toMatch(/water:\s*\[[\s\S]*?id:\s*'mini'[\s\S]*?size:\s*'1x1'/);
    expect(variantsSrc).toMatch(/id:\s*'by_hour'[\s\S]*?size:\s*'2x1'/);
    expect(variantsSrc).toMatch(/id:\s*'rhythm'[\s\S]*?size:\s*'2x1'/);
  });

  it('«Как сейчас» — 1×1 микро-плитка с нормой и литрами', () => {
    expect(waterBody).toContain("variantId === 'mini'");
    expect(waterBody).toContain('widget-water--micro');
    expect(waterBody).toContain('widget-water__norm');
    expect(waterBody).toContain('widget-water__label');
    expect(waterBody).toContain('widget-water__numV');
  });

  it('«К этому часу» — шапка, дефicit и полоса с меткой', () => {
    expect(waterBody).toContain("variantId === 'by_hour'");
    expect(waterBody).toContain("v4Kicker('Вода')");
    expect(waterBody).toContain('widget-v4-water-hour__bar');
    expect(waterBody).toContain('widget-v4-water-hour__marker');
    expect(waterBody).toContain('widget-v4-row__meta');
    const row = rules.get('.widget-v4-row--tight');
    expect(row['align-items']).toBe('baseline');
    const bar = rules.get('.widget-v4-water-hour__bar');
    expect(bar.height).toBe('5px');
    expect(bar['margin-top']).toBe('6px');
    const marker = rules.get('.widget-v4-water-hour__marker');
    expect(marker.width).toBe('2px');
    expect(marker['border-radius']).toBe('2px');
    expect(marker.background).toMatch(/var\(--v4-sand-ink/);
  });

  it('«Ритм дня» — bins и тон воды ролью', () => {
    expect(waterBody).toContain("variantId === 'rhythm'");
    expect(waterBody).toContain('widget-v4-water-rhythm__body');
    expect(waterBody).toContain('widget-v4-water-rhythm__bin');
    const rhythm = rules.get('.widget-v4-water-rhythm');
    expect(rhythm['align-items']).toBe('flex-end');
    expect(rhythm.gap).toBe('4px');
    expect(rhythm.height).toBe('24px');
    const fill = rules.get('.widget-v4-water-rhythm__bin--fill');
    expect(fill.background).toMatch(/var\(--water-tone/);
    expect(palette).toMatch(/--v4-water:\s*#7d98a6/);
    expect(palette).toMatch(/\[data-theme-id="blue"\][\s\S]*?--v4-water:/);
  });
});
