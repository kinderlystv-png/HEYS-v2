/**
 * Вид «График» 2×2 у «Динамики веса» — кадр «Динамика · E график 2×2».
 *
 * Живьём этот вид не проверить: нужны тридцать взвешиваний подряд без дней
 * цикла и рефида, поставленная цель по весу и переключение вида удержанием.
 * Поэтому ряд собирается фабрикой, а вид рисуется тем же кодом, что на
 * Главной и в карточке листа.
 *
 * Строки контракта, которые здесь закрыты:
 *   01 плитка · 02 space-between и baseline · 03 ключ «Динамика · 30 дней» ·
 *   04 «до цели 3,6» моноцифрами · 05 baseline, зазор 4, отступ сверху 8 ·
 *   06 «−1,8» моноцифрами · 07 отступ сверху auto ·
 *   рисунок 01 поле 121 × 54 · рисунок 02 заливка .12 · рисунок 03 линия 2.
 */
import fs from 'node:fs';
import path from 'node:path';

import { render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const UI_SRC = fs.readFileSync(path.join(WEB, 'heys_widgets_ui_v1.js'), 'utf8');
const DYN_SRC = fs.readFileSync(path.join(WEB, 'heys_widgets_weight_dynamics_v4.js'), 'utf8');
const VARIANTS_SRC = fs.readFileSync(path.join(WEB, 'heys_widgets_variants_v4.js'), 'utf8');
const REGISTRY_SRC = fs.readFileSync(path.join(WEB, 'heys_widgets_registry_v1.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.join(WEB, 'heys_widgets_core_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB, 'styles/modules/730-widgets-dashboard.css'), 'utf8');

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;

/** Один день дневника: вес утром и дата. */
function dayKey(offsetBack) {
  const d = new Date('2026-09-02T09:00:00Z');
  d.setDate(d.getDate() - offsetBack);
  return d.toISOString().slice(0, 10);
}

/**
 * Дневник, где вес снижается ровно на step кг в день на протяжении days дней.
 * Всё остальное пусто: дни цикла и рефида из тренда исключаются, и в смоуке их
 * быть не должно — иначе окно поедет и тест начнёт мерить не то.
 */
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

/** Тело вида из живого UI: тот же вызов, что делает плитка и карточка листа. */
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

function loadVariants() {
  window.HEYS = window.HEYS || {};
  window.HEYS.Widgets = Object.assign(
    { emit: () => {}, on: () => {}, off: () => {} },
    window.HEYS.Widgets,
  );
  // eslint-disable-next-line no-eval
  eval(VARIANTS_SRC);
  return window.HEYS.Widgets.VariantsV4;
}

/** Блок объявлений одного селектора продуктового CSS. */
function ruleOf(selector) {
  const clean = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = {};
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!match[1].split(',').some((s) => s.trim() === selector)) continue;
    for (const decl of match[2].split(';')) {
      const at = decl.indexOf(':');
      if (at < 0) continue;
      out[decl.slice(0, at).trim()] = decl.slice(at + 1).trim();
    }
  }
  return out;
}

describe('«Динамика веса» · вид «График» 2×2', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    localStorage.clear();
  });

  it('вид достижим: он в листе выбора, а его формат — в реестре', () => {
    const V4 = loadVariants();
    const sheet = V4.getSheetCatalog('crashRisk').map((v) => `${v.id}:${v.size}`);
    expect(sheet).toContain('chart:2x2');
    // Порядок листа — по возрастанию формата: 2×2 идёт после всех 2×1.
    expect(sheet[sheet.length - 1]).toBe('chart:2x2');

    delete window.HEYS;
    window.HEYS = { Widgets: { emit: () => {}, on: () => {}, off: () => {} } };
    // eslint-disable-next-line no-eval
    eval(REGISTRY_SRC);
    expect(window.HEYS.Widgets.registry.getType('crashRisk').availableSizes).toContain('2x2');
    // Дефолт не сдвинулся: строка контракта «состав дефолта» — 2×1 «Кривая».
    expect(window.HEYS.Widgets.registry.getType('crashRisk').defaultSize).toBe('2x1');
  });

  it('выбор вида делает плитку 2×2, и раскладка это переживает', () => {
    const memory = new Map();
    window.HEYS = {
      Widgets: { emit: () => {}, on: () => {}, off: () => {} },
      store: {
        get: (k, d) => (memory.has(k) ? memory.get(k) : d),
        set: (k, v) => memory.set(k, v),
      },
    };
    // eslint-disable-next-line no-eval
    eval(REGISTRY_SRC);
    // eslint-disable-next-line no-eval
    eval(VARIANTS_SRC);
    // eslint-disable-next-line no-eval
    eval(CORE_SRC);
    const state = window.HEYS.Widgets.state;
    state.init();

    const before = state.getWidgets().length;
    const tile = state.getWidgets().find((w) => w.type === 'crashRisk');
    expect(tile.size).toBe('2x1');

    state.updateWidget(
      tile.id,
      { size: '2x2', settings: { ...tile.settings, displayVariant: 'chart' } },
      true,
    );

    const after = state.getWidgets();
    const grown = after.find((w) => w.id === tile.id);
    expect(grown.size).toBe('2x2');
    // Ни одна плитка не потерялась: рост занимает клетки, а не соседей.
    expect(after).toHaveLength(before);
    // Сетка остаётся в четырёх колонках — 2×2 влезает целиком.
    after.forEach((w) => {
      const cols = w.size.startsWith('3') ? 3 : Number(w.size[0]);
      expect(w.position.col + cols).toBeLessThanOrEqual(4);
    });
  });

  it('поле рисунка и кривая ложатся в кадр: 121 × 54, полоса 9…38', () => {
    const dyn = bootDynamics(diaryDroppingWeight({ days: 34 }), { weightGoal: 88 });
    expect(dyn.hasDynamics).toBe(true);
    expect(dyn.window.windowDays).toBe(30);

    const pts = dyn.chart.points.split(' ').map((p) => p.split(',').map(Number));
    expect(pts.length).toBe(30);
    expect(pts[0][0]).toBe(2);
    expect(pts[pts.length - 1][0]).toBe(119);
    pts.forEach(([x, y]) => {
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThanOrEqual(119);
      expect(y).toBeGreaterThanOrEqual(9);
      expect(y).toBeLessThanOrEqual(38);
    });
    // Вес падает — линия идёт вниз (рисунок 03: 2,9 … 119,38).
    expect(pts[0][1]).toBe(9);
    expect(pts[pts.length - 1][1]).toBe(38);
    // Заливка замыкается на нижний край поля (рисунок 02: V54 H2 Z).
    expect(dyn.chart.area.endsWith('V54 H2 Z')).toBe(true);
  });

  it('плато не делит на ноль: кривая встаёт посередине полосы', () => {
    const dyn = bootDynamics(diaryDroppingWeight({ days: 34, step: 0 }), { weightGoal: 88 });
    const ys = dyn.chart.points.split(' ').map((p) => Number(p.split(',')[1]));
    expect(new Set(ys)).toEqual(new Set([23.5]));
  });

  it('шапка, остаток, число и график — как в кадре', () => {
    const dyn = bootDynamics(diaryDroppingWeight({ days: 34 }), { weightGoal: 88, weight: 92.5 });
    const renderBody = loadRenderBody();
    const { container } = render(
      RealReact.createElement('div', null, renderBody('chart', dyn, { compact: true })),
    );

    // 03: ключ говорит, за какое окно график.
    expect(container.querySelector('.widget-v4-kicker').textContent).toBe('Динамика · 30 дней');
    // 04: остаток до цели той же строкой справа.
    expect(container.querySelector('.widget-wd__remainder').textContent).toMatch(
      /^до цели \d+,\d$/,
    );
    // 06: дельта с единицей.
    const value = container.querySelector('.widget-wd__chart-value');
    expect(value.querySelector('.widget-v4-mini__value').textContent).toMatch(/^−\d+,\d$/);
    expect(value.querySelector('.widget-v4-unit').textContent).toBe('кг');
    // Снижение при цели «похудеть» — состояние «идёт хорошо».
    expect(value.querySelector('.widget-v4-mini__value').className).toContain(
      'widget-v4-val--good',
    );

    // рисунок 01–03.
    const svg = container.querySelector('.widget-wd__chart-svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 121 54');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
    expect(svg.getAttribute('height')).toBe('54');
    const area = container.querySelector('.widget-wd__chart-area');
    expect(area.getAttribute('fill')).toBe('currentColor');
    expect(area.getAttribute('opacity')).toBe('0.12');
    const line = container.querySelector('.widget-wd__chart-line');
    expect(line.getAttribute('stroke')).toBe('currentColor');
    expect(line.getAttribute('stroke-width')).toBe('2');
    expect(line.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('окно короче месяца не выдаёт себя за месяц', () => {
    const renderBody = loadRenderBody();
    [
      [10, 'Динамика · 7 дней'],
      [16, 'Динамика · 14 дней'],
      [23, 'Динамика · 21 день'],
    ].forEach(([days, kicker]) => {
      const dyn = bootDynamics(diaryDroppingWeight({ days }), { weightGoal: 88 });
      const { container } = render(
        RealReact.createElement('div', null, renderBody('chart', dyn, { compact: true })),
      );
      expect(container.querySelector('.widget-v4-kicker').textContent).toBe(kicker);
    });
  });

  it('истории меньше недели — подпись вместо графика, плитка не пустеет', () => {
    const dyn = bootDynamics(diaryDroppingWeight({ days: 4 }), { weightGoal: 88 });
    expect(dyn.hasDynamics).toBe(false);

    const renderBody = loadRenderBody();
    const { container } = render(
      RealReact.createElement('div', null, renderBody('chart', dyn, { compact: true })),
    );
    expect(container.querySelector('.widget-v4-kicker').textContent).toBe('Динамика · 30 дней');
    expect(container.querySelector('.widget-wd__placeholder').textContent).toBe('нужна неделя');
    expect(container.querySelector('.widget-wd__chart-svg')).toBeNull();
  });

  it('CSS вида держит числа кадра и берёт цвет ролью, а не литералом', () => {
    // 05: baseline, зазор 4, отступ сверху 8.
    expect(ruleOf('.widget-wd__chart-value')).toMatchObject({
      'align-items': 'baseline',
      gap: '4px',
      'margin-top': '8px',
    });
    // 07: график прижат к низу плитки.
    expect(ruleOf('.widget-wd__chart')['margin-top']).toBe('auto');
    // рисунок 01: поле 100 % × 54.
    expect(ruleOf('.widget-wd__chart-svg')).toMatchObject({ width: '100%', height: '54px' });
    // 04 и 06: моноцифры у остатка и у числа.
    expect(ruleOf('.widget-wd__remainder')['font-variant-numeric']).toBe('tabular-nums');
    expect(ruleOf('.widget-v4-mini__value')['font-variant-numeric']).toBe('tabular-nums');
    // Цвет — ролью набора: голого хекса в правилах вида нет.
    [
      '.widget-wd__chart.widget-v4-val--good',
      '.widget-wd__chart.widget-v4-val--bad',
      '.widget-wd__chart.widget-v4-val--neutral',
    ].forEach((sel) => {
      expect(ruleOf(sel).color).toMatch(/^var\(--v4-[a-z0-9-]+, #[0-9a-f]{6}\)$/);
    });
  });
});
