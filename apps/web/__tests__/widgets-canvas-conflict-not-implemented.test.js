/**
 * Task 38 — home-widgets canvas-conflict-not-implemented (widgets_ui only).
 * HEYS_DESIGN_GATES=skip — не design-gate razbor/geometry/copy.
 */
import fs from 'node:fs';
import path from 'node:path';

import { render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const UI_SRC = fs.readFileSync(path.join(WEB, 'heys_widgets_ui_v1.js'), 'utf8');
const DYN_SRC = fs.readFileSync(path.join(WEB, 'heys_widgets_weight_dynamics_v4.js'), 'utf8');

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

const TYPES = [{ type: 'water', name: 'Вода', defaultSize: '1x1' }];

function dayKey(offsetBack) {
  const d = new Date('2026-09-02T09:00:00Z');
  d.setDate(d.getDate() - offsetBack);
  return d.toISOString().slice(0, 10);
}

function diaryDroppingWeight({ days, from = 92.5, step = 0.06 }) {
  const store = new Map();
  for (let back = days - 1; back >= 0; back--) {
    const date = dayKey(back);
    store.set(`heys_dayv2_${date}`, {
      date,
      weightMorning: Number((from - (days - 1 - back) * step).toFixed(2)),
    });
  }
  return store;
}

function bootDynamics(store, profile) {
  window.HEYS = {
    Widgets: { emit: () => {}, on: () => {}, off: () => {} },
    utils: {
      lsGet: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
      fmtDate: (d) => d.toISOString().slice(0, 10),
    },
    dayUtils: { fmtDate: (d) => d.toISOString().slice(0, 10) },
  };
  // eslint-disable-next-line no-eval
  eval(DYN_SRC);
  return window.HEYS.Widgets.WeightDynamicsV4.compute({ profile });
}

function loadRenderBody() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = {
    createRoot: () => ({ render: () => {}, unmount: () => {} }),
    createPortal: (node) => node,
  };
  window.HEYS = window.HEYS || {};
  window.HEYS.Widgets = Object.assign(
    { emit: () => {}, on: () => () => {}, off: () => {} },
    window.HEYS.Widgets,
  );
  window.HEYS.utils = window.HEYS.utils || { lsGet: (_k, f) => f };
  window.HEYS.dayUtils = window.HEYS.dayUtils || {};
  // eslint-disable-next-line no-eval
  eval(UI_SRC);
  return window.HEYS.Widgets.renderWeightDynamicsBody;
}

function loadCatalogStrip() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = {
    createRoot: () => ({ render: () => {}, unmount: () => {} }),
    createPortal: (node) => node,
  };
  window.HEYS = {
    Widgets: {
      emit: () => {},
      on: () => () => {},
      exitEditMode: () => {},
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
      },
      getBudgetInfo: () => ({ used: 18, total: 32, isOverflow: false })
    },
    utils: { lsGet: () => ({}) },
    dayUtils: {}
  };
  // eslint-disable-next-line no-eval
  eval(UI_SRC);
  return window.HEYS.Widgets.CatalogStrip;
}

describe('Task 38 · canvas-conflict-not-implemented · widgets_ui', () => {
  beforeEach(() => {
    globalThis.React = RealReact;
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('Смена вида · лист выбора · рисунок 08 — sheetPreview рисует точку r 3.5', () => {
    const dyn = bootDynamics(diaryDroppingWeight({ days: 34 }), { weightGoal: 88 });
    const renderBody = loadRenderBody();
    const { container } = render(
      RealReact.createElement('div', null, renderBody('chart', dyn, { compact: true, sheetPreview: true })),
    );
    const dot = container.querySelector('.widget-wd__chart-dot');
    expect(dot).toBeTruthy();
    expect(dot.getAttribute('r')).toBe('3.5');
    expect(Number(dot.getAttribute('cx'))).toBeCloseTo(dyn.chart.last.x, 1);
    expect(Number(dot.getAttribute('cy'))).toBeCloseTo(dyn.chart.last.y, 1);
  });

  it('compact без sheetPreview — точки нет', () => {
    const dyn = bootDynamics(diaryDroppingWeight({ days: 34 }), { weightGoal: 88 });
    const renderBody = loadRenderBody();
    const { container } = render(
      RealReact.createElement('div', null, renderBody('chart', dyn, { compact: true })),
    );
    expect(container.querySelector('.widget-wd__chart-svg circle')).toBeNull();
  });

  it('на живой плитке точки нет', () => {
    const dyn = bootDynamics(diaryDroppingWeight({ days: 34 }), { weightGoal: 88 });
    const renderBody = loadRenderBody();
    const { container } = render(
      RealReact.createElement('div', null, renderBody('chart', dyn, { compact: false })),
    );
    expect(container.querySelector('.widget-wd__chart-dot')).toBeNull();
  });

  it('Каталог · значки вместо эмодзи · 07 — счётчик шапки 9.5px моно', () => {
    const CatalogStrip = loadCatalogStrip();
    const { container } = render(
      RealReact.createElement(CatalogStrip, {
        onSelect: () => {},
        existingTypes: [],
        selectedDate: '2026-01-01'
      }),
    );
    const budget = container.querySelector('.widget-v4-catalog__budget');
    expect(budget).toBeTruthy();
    expect(budget.style.fontSize).toBe('9.5px');
    expect(budget.style.fontWeight).toBe('600');
    expect(budget.style.lineHeight).toBe('1');
    expect(budget.style.fontFamily).toMatch(/mono/i);
    expect(budget.textContent).toMatch(/занято\s+18\s+из\s+32/);
  });
});
