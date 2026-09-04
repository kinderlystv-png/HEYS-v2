/**
 * Сведённый кусок home-widgets: виджет «Риск-радар».
 * Три вида: Уровень и причины 2×2, Главный риск 2×1, Шкала 2×2.
 * Разбор модалки и legacy speedometer не открывал.
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

describe('Риск-радар — сведённый кусок', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');
  const rules = readRules(css);

  const bodyAt = uiSrc.indexOf('function RelapseRiskVariantBody');
  const bodyEnd = uiSrc.indexOf('function RelapseRiskWidgetContent', bodyAt);
  const body = uiSrc.slice(bodyAt, bodyEnd);
  const mainAt = body.indexOf("if (variantId === 'main'");
  const scaleAt = body.indexOf("if (variantId === 'scale'");
  const listAt = body.indexOf("if (size === '2x2' || variantId === 'list')");
  const main = body.slice(mainAt, scaleAt);
  const scale = body.slice(scaleAt, listAt);
  const list = body.slice(listAt, body.indexOf('const showDrivers = widget.settings'));

  it('читает строки трёх видов из актуального data-v', () => {
    expect(contractValue(canvas, 'Риск-радар · Уровень и причины · 04'))
      .toBe('«низкий» — моноцифры: шрифт 600 26px/1 Figtree, цвет var(--gr)');
    expect(contractValue(canvas, 'Риск-радар · Главный риск · 04'))
      .toBe('«низкий» — моноцифры: шрифт 700 10px/1 Figtree, цвет var(--gr)');
    expect(contractValue(canvas, 'Риск-радар · Шкала · 04'))
      .toBe('«низкий» — моноцифры: шрифт 600 24px/1 Figtree, цвет var(--gr)');
    expect(contractValue(canvas, 'Риск-радар · Шкала · 08'))
      .toBe('«поднимут: недосып 2 дня, вода ниже нормы» — отступ сверху auto, шрифт 600 10px/1.4 Figtree, цвет rgba(var(--ink),.56)');
  });

  it('держит три вида в реестре и три v4-ветки рендера', () => {
    expect(variantsSrc).toMatch(/relapseRisk:\s*\[[\s\S]*?id:\s*'list'[\s\S]*?title:\s*'Уровень и причины'/);
    expect(variantsSrc).toMatch(/id:\s*'main'[\s\S]*?title:\s*'Главный риск'[\s\S]*?size:\s*'2x1'/);
    expect(variantsSrc).toMatch(/id:\s*'scale'[\s\S]*?title:\s*'Шкала'[\s\S]*?isDefault:\s*true/);
    expect(list).toContain('widget-v4-kv');
    expect(list).toContain("label: 'Срывы'");
    expect(list).toContain("label: 'Недосып'");
    expect(main).toContain('widget-risk-level');
    expect(main).toContain('widget-risk-main');
    expect(scale).toContain('widget-risk-steps');
    expect(scale).toContain('widget-risk-rise');
    expect(scale).toContain('widget-risk-scale-hero');
  });

  it('держит геометрию шкалы и списка; legacy bar не смешивается', () => {
    expect(rules.get('.widget-v4-hero-num')['margin-top']).toBe('10px');
    expect(rules.get('.widget-v4-kv').gap).toBe('6px');
    expect(rules.get('.widget-v4-kv')['margin-top']).toBe('auto');
    expect(rules.get('.widget-v4-kv__row')['justify-content']).toBe('space-between');

    expect(rules.get('.widget-risk-level')['font-size']).toBe('10px');
    expect(rules.get('.widget-risk-main')['margin-top']).toBe('auto');
    expect(rules.get('.widget-risk-main').gap).toBe('5px');
    expect(rules.get('.widget-risk-main__driver')['font-size']).toBe('16px');

    expect(rules.get('.widget-risk-steps').gap).toBe('4px');
    expect(rules.get('.widget-risk-steps')['margin-top']).toBe('11px');
    expect(rules.get('.widget-risk-steps__seg').height).toBe('6px');
    expect(rules.get('.widget-risk-steps__seg').background).toContain('--v4-line');
    expect(rules.get('.widget-risk-rise')['margin-top']).toBe('auto');
    expect(rules.get('.widget-risk-scale-hero .widget-v4-hero-num__val--risk')['font-size']).toBe('24px');
    expect(body).toContain('relapseCanvasLevel(level)');
  });

  it('цвет уровня и kv — роли good/act; modal amber на ролях', () => {
    expect(uiSrc).toContain('function v4RiskLevelState(level)');
    expect(rules.get('.widget-relapse-risk .widget-v4-kv__row .widget-v4-val--good').color)
      .toContain('--v4-sand-ok-text');
    expect(rules.get('.widget-v4-val--act').color).toContain('--v4-act-text');
    expect(css).toMatch(/\.widget-relapse-risk__impact-chip[\s\S]*?--chip-bg:\s*color-mix/);
    expect(css).toMatch(/\.widget-relapse-risk__action-icon[\s\S]*?var\(--v4-wgt-amber/);
    expect(css).not.toMatch(/\.widget-relapse-risk__action-icon[\s\S]{0,180}#f59e0b,/);

    const sandBlock = palette.slice(0, palette.indexOf('[data-theme-id="blue"]'));
    const blueBlock = palette.slice(palette.indexOf('[data-theme-id="blue"]'));
    const sandOkText = sandBlock.match(/--v4-sand-ok-text:\s*(#[0-9a-f]{6})/i)?.[1];
    const blueOkText = blueBlock.match(/--v4-sand-ok-text:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(sandOkText).toBe('#5c6a45');
    expect(blueOkText).toBe('#5c6a45');
  });
});
