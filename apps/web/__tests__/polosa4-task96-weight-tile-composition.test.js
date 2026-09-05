/**
 * Полоса 4 · задача 96 · плитка «Динамика веса» (curve): один путь состава.
 * Лист и Главная рисуют одну функцию; compact — только размер/анимация.
 */
import fs from 'node:fs';
import path from 'node:path';

import { render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readRules } from './canvas-razbor-helpers.js';

const WEB = path.resolve(__dirname, '..');
const UI_SRC = fs.readFileSync(path.join(WEB, 'heys_widgets_ui_v1.js'), 'utf8');
const DYN_SRC = fs.readFileSync(path.join(WEB, 'heys_widgets_weight_dynamics_v4.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
const PALETTE = fs.readFileSync(path.join(WEB, 'styles/modules/002-ui-v4-palette-roles.css'), 'utf8');

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;

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

function loadComposition() {
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
  return {
    renderComposition: window.HEYS.Widgets.renderWeightDynamicsTileComposition,
    renderBody: window.HEYS.Widgets.renderWeightDynamicsBody,
  };
}

function mountTheme(themeId) {
  document.documentElement.setAttribute('data-theme-id', themeId);
  document.documentElement.setAttribute(
    'data-theme',
    themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId,
  );
  document.documentElement.setAttribute('data-palette', themeId.startsWith('blue') ? 'blue' : 'sand');
}

function injectCss(cssText) {
  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.appendChild(style);
  return style;
}

function layoutSnapshot(container, rules) {
  const row = container.querySelector('.widget-wd__curve-row');
  expect(row).toBeTruthy();
  const spark = row.querySelector('.widget-wd__spark');
  const delta = row.querySelector('.widget-wd__delta');
  const rowRule = rules.get('.widget-wd__curve-row') || {};
  const rowStyle = getComputedStyle(row);
  const children = [...row.children];
  const justifyContent = rowStyle.justifyContent || rowRule['justify-content'] || '';
  const flexDirection = rowStyle.flexDirection || rowRule['flex-direction'] || 'row';
  const display = rowStyle.display || rowRule.display || '';
  return {
    justifyContent,
    flexDirection,
    display,
    hasSpark: Boolean(spark),
    hasDelta: Boolean(delta),
    sparkBeforeDelta: spark && delta ? children.indexOf(spark) < children.indexOf(delta) : null,
    sparkColor: spark ? getComputedStyle(spark).color : null,
  };
}

describe('polosa4 task96 · динамика веса curve · один путь состава', () => {
  let styles = [];
  let dyn;
  let rules;

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    styles.push(injectCss(PALETTE));
    styles.push(injectCss(CSS));
    rules = readRules(CSS);
    mountTheme('sand');
    dyn = bootDynamics(diaryDroppingWeight({ days: 34 }), { weightGoal: 88, weight: 92.5 });
    expect(dyn.hasDynamics).toBe(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    styles.forEach((s) => s.remove());
    styles = [];
    delete window.HEYS;
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
    document.body.innerHTML = '';
  });

  it('источник — renderWeightDynamicsTileComposition; renderWeightDynamicsBody — обёртка', () => {
    const { renderComposition, renderBody } = loadComposition();
    expect(typeof renderComposition).toBe('function');
    expect(UI_SRC).toContain('function renderWeightDynamicsTileComposition');
    expect(UI_SRC).toContain('function renderWeightDynamicsCurveRow');
    expect(UI_SRC).toContain('return renderWeightDynamicsTileComposition(variant, dyn, opts)');
    expect(UI_SRC).toContain('renderWeightDynamicsTileComposition(id, dyn, { compact: true, sheetPreview: true })');
    expect(UI_SRC).toContain('renderWeightDynamicsTileComposition(variantId, dyn, { compact: false, motion, playEntrance: playSceneEntrance })');

    const a = renderBody('curve', dyn, { compact: false });
    const b = renderComposition('curve', dyn, { compact: false });
    expect(a).toEqual(b);
  });

  it('computed: лист (compact) и Главная (full) — space-between, спарклайн слева', () => {
    const { renderComposition } = loadComposition();
    const sheetHost = document.createElement('div');
    sheetHost.className = 'widget-wd widget-wd--preview widget widget--2x1 widget--crashRisk';
    document.body.appendChild(sheetHost);

    const homeHost = document.createElement('div');
    homeHost.className = 'widget-wd widget-v4-stack widget widget--2x1 widget--crashRisk';
    document.body.appendChild(homeHost);

    const { container: sheet } = render(
      RealReact.createElement('div', { className: 'widget-wd__scene' },
        renderComposition('curve', dyn, { compact: true, sheetPreview: true })),
      { container: sheetHost },
    );
    const { container: home } = render(
      RealReact.createElement('div', { className: 'widget-wd__scene widget-wd__scene--entrance' },
        renderComposition('curve', dyn, { compact: false, playEntrance: false })),
      { container: homeHost },
    );

    const sheetSnap = layoutSnapshot(sheet, rules);
    const homeSnap = layoutSnapshot(home, rules);

    expect(sheetSnap.hasSpark).toBe(true);
    expect(homeSnap.hasSpark).toBe(true);
    expect(sheetSnap.sparkBeforeDelta).toBe(true);
    expect(homeSnap.sparkBeforeDelta).toBe(true);
    expect(sheetSnap.justifyContent).toBe('space-between');
    expect(homeSnap.justifyContent).toBe('space-between');
    expect(sheetSnap.flexDirection).toBe('row');
    expect(homeSnap.flexDirection).toBe('row');
    expect(sheetSnap.display).toBe('flex');
    expect(homeSnap.display).toBe('flex');

    console.info('[polosa4-task96 computed]', JSON.stringify({ sheet: sheetSnap, home: homeSnap }));
  });

  it('computed: sand и blue — спарклайн на месте на обоих наборах', () => {
    const { renderComposition } = loadComposition();
    const themes = ['sand', 'blue'];

    themes.forEach((themeId) => {
      mountTheme(themeId);
      const host = document.createElement('div');
      host.className = 'widget-wd widget-v4-stack widget widget--2x1 widget--crashRisk';
      document.body.appendChild(host);
      const { container } = render(
        RealReact.createElement('div', { className: 'widget-wd__scene' },
          renderComposition('curve', dyn, { compact: false })),
        { container: host },
      );
      const snap = layoutSnapshot(container, rules);
      expect(snap.hasSpark).toBe(true);
      expect(snap.sparkBeforeDelta).toBe(true);
      expect(snap.justifyContent).toBe('space-between');
      host.remove();
    });
  });
});
