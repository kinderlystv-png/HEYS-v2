/**
 * Сведённый кусок home-widgets: шапка каталога
 * «Каталог · значки вместо эмодзи · 01–08».
 * Отмена / «Каталог» + счётчик / Готово. Счётчик сам — строка
 * «вид счётчика места» (11/600, не 9.5 mono кадра).
 */
import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readRules } from './canvas-razbor-helpers.js';

const WEB_DIR = path.resolve(__dirname, '..');
const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css');
const PALETTE = path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css');
const UI = path.join(WEB_DIR, 'heys_widgets_ui_v1.js');

const uiSrc = fs.readFileSync(UI, 'utf8');

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

const TYPES = [
  { type: 'water', name: 'Вода', defaultSize: '1x1' }
];

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`))?.[1] || '';
}

function loadCatalogStrip(exitEditMode) {
  globalThis.React = RealReact;
  globalThis.ReactDOM = {
    createRoot: () => ({ render: () => {}, unmount: () => {} }),
    createPortal: (node) => node
  };

  window.HEYS = {
    Widgets: {
      emit: () => {},
      on: () => () => {},
      exitEditMode,
      GLYPHS: { apple: ['M12 2v4'] },
      registry: {
        getAvailableTypes: () => TYPES,
        getType: (type) => TYPES.find((t) => t.type === type) || null,
        getSize: () => null,
        normalizeSizeId: (id) => id,
        getCategories: () => []
      },
      state: { isEditMode: () => true },
      data: { getWidgetData: () => ({}) },
      VariantsV4: {
        getCatalog: () => [],
        getDefaultVariant: () => null,
        getActiveVariant: () => null,
        getVariantById: () => null,
        useWidgetVariantTile: null
      }
    },
    utils: { lsGet: () => ({}) },
    dayUtils: {}
  };

  // eslint-disable-next-line no-eval
  eval(uiSrc);
  return window.HEYS.Widgets.CatalogStrip;
}

describe('Каталог · значки вместо эмодзи · шапка 01–08', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const rules = readRules(css);

  beforeEach(() => {
    globalThis.React = RealReact;
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('читает шапку из актуального data-v', () => {
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 01')).toBe('высота 312px');
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 02')).toBe('поля 16px 18px 0');
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 03')).toBe('выравнивание center, распределение space-between');
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 04')).toContain('«Отмена»');
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 04')).toContain('12px/1');
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 05')).toBe('направление column, выравнивание center, зазор 3px');
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 06')).toContain('«Каталог»');
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 06')).toContain('13px/1');
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 07')).toContain('9.5px/1 моно');
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 08')).toContain('«Готово»');
    expect(contractValue(canvas, 'Каталог · значки вместо эмодзи · 08')).toContain('var(--ac)');
    expect(contractValue(canvas, 'вид счётчика места')).toMatch(/11\s*px\/600/);
  });

  it('держит шапку ролями и числами кадра, счётчик — правилом места', () => {
    const bar = rules.get('.widget-v4-catalog__bar');
    expect(bar.display).toBe('flex');
    expect(bar['align-items']).toBe('center');
    expect(bar['justify-content']).toBe('space-between');
    expect(bar.padding).toBe('16px 18px 0');

    const cancel = rules.get('.widget-v4-catalog__bar-cancel');
    expect(cancel['font-size']).toBe('12px');
    expect(cancel['font-weight']).toBe('700');
    expect(cancel['line-height']).toBe('1');
    expect(cancel['min-height']).toBe('44px');
    expect(cancel.margin).toBe('-16px 0');
    expect(cancel.color).toContain('--v4-ink-3');
    expect(cancel.color).not.toMatch(/^#/);

    const done = rules.get('.widget-v4-catalog__bar-done');
    expect(done['font-size']).toBe('12px');
    expect(done['font-weight']).toBe('700');
    expect(done['min-height']).toBe('44px');
    expect(done.margin).toBe('-16px 0');
    expect(done.color).toContain('--v4-act-text');

    const mid = rules.get('.widget-v4-catalog__bar-mid');
    expect(mid['flex-direction']).toBe('column');
    expect(mid['align-items']).toBe('center');
    expect(mid.gap).toBe('3px');

    const name = rules.get('.widget-v4-catalog__bar-name');
    expect(name['font-size']).toBe('13px');
    expect(name['font-weight']).toBe('700');
    expect(name['line-height']).toBe('1');
    expect(name.color).toContain('--v4-ink');

    const budget = rules.get('.widget-v4-catalog__budget');
    expect(budget['font-size']).toBe('11px');
    expect(budget['font-weight']).toBe('600');
    expect(budget.color).toContain('--v4-ink-data');
    expect(budget['font-variant-numeric']).toBe('tabular-nums');
    expect(budget['font-family'] || '').not.toMatch(/mono/i);

    const body = rules.get('.widget-v4-catalog__body');
    expect(body.padding).toBe('16px 16px 0');
    expect(body['flex-direction']).toBe('column');
    expect(body.gap).toBe('9px');

    expect(palette.match(/--v4-ink-3:/g).length).toBeGreaterThanOrEqual(4);
    expect(palette.match(/--v4-act-text:/g)).toHaveLength(4);
    expect(palette.match(/--v4-ink:/g).length).toBeGreaterThanOrEqual(4);
  });

  it('рисует Отмена / Каталог + счётчик / Готово в живом CatalogStrip', () => {
    const exitEditMode = vi.fn();
    const CatalogStrip = loadCatalogStrip(exitEditMode);
    const { container, getByRole } = render(RealReact.createElement(CatalogStrip, {
      onSelect: () => {},
      existingTypes: new Set(),
      selectedDate: '2026-09-04'
    }));

    const bar = container.querySelector('.widget-v4-catalog__bar');
    expect(bar).toBeTruthy();
    expect(bar.querySelector('.widget-v4-catalog__bar-name').textContent).toBe('Каталог');
    expect(bar.querySelector('.widget-v4-catalog__budget').textContent).toMatch(/занято\s+\d+\s+из\s+\d+/);
    expect(container.querySelector('.widget-v4-catalog__body')).toBeTruthy();
    expect(container.querySelector('.widget-v4-catalog__tier')).toBeNull();

    fireEvent.click(getByRole('button', { name: 'Отмена' }));
    expect(exitEditMode).toHaveBeenCalledWith({ revert: true });
    fireEvent.click(getByRole('button', { name: 'Готово' }));
    expect(exitEditMode).toHaveBeenCalledWith();
  });

  it('держит шапку в исходнике зоны, не в мёртвом CatalogModal', () => {
    expect(uiSrc).toContain("className: 'widget-v4-catalog__bar'");
    expect(uiSrc).toContain("className: 'widget-v4-catalog__bar-cancel'");
    expect(uiSrc).toContain("className: 'widget-v4-catalog__bar-done'");
    expect(uiSrc).toContain("className: 'widget-v4-catalog__bar-name'");
    expect(uiSrc).toContain("className: 'widget-v4-catalog__body'");
    expect(uiSrc).toContain('exitEditMode?.({ revert: true })');
    const strip = uiSrc.slice(
      uiSrc.indexOf('function CatalogStrip'),
      uiSrc.indexOf('function renderCatalogBlockedHint')
    );
    expect(strip).toContain('widget-v4-catalog__bar');
    expect(strip).not.toContain('widgets-catalog__header');
  });
});
