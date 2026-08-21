/**
 * Каталог расстановки (канвас home-widgets.v4, строки 53–55).
 *
 * Превью в карточке каталога обязано быть настоящей плиткой: дефолтный вид,
 * его формат, числа открытого дня и тот же код рендера, что на Главной. По
 * названию «Инсулиновая волна» человек выбрать не может — он выбирает картинку.
 * Уже стоящие на экране виджеты в каталоге не показываются.
 */
import fs from 'node:fs';
import path from 'node:path';

import { render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

const TYPES = [
  { type: 'insulinWave', name: 'Инсулиновая волна', defaultSize: '2x2' },
  { type: 'water', name: 'Вода', defaultSize: '1x1' },
  { type: 'macros', name: 'Кольца БЖУ', defaultSize: '3x2' }
];

const SIZES = {
  '1x1': { cols: 1, rows: 1 },
  '2x1': { cols: 2, rows: 1 },
  '2x2': { cols: 2, rows: 2 },
  '3x2': { cols: 3, rows: 2 }
};

function loadCatalogStrip() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = {
    createRoot: () => ({ render: () => {}, unmount: () => {} }),
    createPortal: (node) => node
  };

  window.HEYS = {
    Widgets: {
      emit: () => {},
      on: () => () => {},
      registry: {
        getAvailableTypes: () => TYPES,
        getType: (type) => TYPES.find((t) => t.type === type) || null,
        getSize: (id) => SIZES[id] || null,
        normalizeSizeId: (id) => id,
        getCategories: () => []
      },
      state: { isEditMode: () => true },
      // Живые данные дня: тот же слой, из которого читает плитка на Главной.
      data: {
        getInsulinWaveData: () => ({ hasData: true, mealCount: 3 }),
        getWaterData: () => ({ hasData: true, drunk: 1700, target: 2700 })
      },
      VariantsV4: {
        getCatalog: (type) => (type === 'insulinWave'
          ? [
            { id: 'day_as_is', title: 'День как есть', size: '2x2' },
            { id: 'calm_window', title: 'Спокойное окно', size: '1x1' }
          ]
          : []),
        getDefaultVariant: (type) => (type === 'insulinWave'
          ? { id: 'day_as_is', title: 'День как есть', size: '2x2' }
          : null),
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

function renderCatalog(existingTypes = []) {
  const CatalogStrip = loadCatalogStrip();
  return render(RealReact.createElement(CatalogStrip, {
    onSelect: () => {},
    existingTypes: new Set(existingTypes),
    selectedDate: '2026-08-21'
  }));
}

describe('каталог расстановки: превью — настоящая плитка', () => {
  beforeEach(() => {
    globalThis.React = RealReact;
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('у каждой карточки есть превью в формате дефолтного вида', () => {
    const { container } = renderCatalog();
    const previews = container.querySelectorAll('.widget-v4-catalog__preview');
    expect(previews.length).toBe(TYPES.length);

    // Инсулиновая волна: дефолтный вид «День как есть» — 2×2.
    const wave = container.querySelector('.widget-v4-catalog__preview.widget--insulinWave');
    expect(wave).toBeTruthy();
    expect(wave.className).toContain('widget--2x2');
    expect(wave.className).toContain('widget-v4-catalog__preview--2x2');

    // Вода: своего каталога видов нет — берётся дефолтный формат типа, 1×1.
    const water = container.querySelector('.widget-v4-catalog__preview.widget--water');
    expect(water.className).toContain('widget--1x1');

    // БЖУ: 3×2, для колонки каталога ужимается стилем, но формат честный.
    const macros = container.querySelector('.widget-v4-catalog__preview.widget--macros');
    expect(macros.className).toContain('widget--3x2');
  });

  it('превью рисует тот же код, что плитка на Главной', () => {
    const { container } = renderCatalog();
    // WidgetContent отдаёт внутренности плитки, а не текстовую заглушку:
    // у превью есть собственный DOM-потомок, а не только подпись карточки.
    const wave = container.querySelector('.widget-v4-catalog__preview.widget--insulinWave');
    expect(wave.children.length).toBeGreaterThan(0);
    expect(wave.textContent).not.toContain('Инсулиновая волна · каталог');

    // Превью не перехватывает жесты — карточка целиком остаётся кнопкой.
    const card = wave.closest('button');
    expect(card).toBeTruthy();
    expect(card.className).toContain('widget-v4-catalog__item');
  });

  it('уже стоящие на экране виджеты в каталоге не показываются', () => {
    const { container } = renderCatalog(['insulinWave']);
    expect(container.querySelector('.widget-v4-catalog__preview.widget--insulinWave')).toBeNull();
    expect(container.querySelectorAll('.widget-v4-catalog__item').length).toBe(TYPES.length - 1);
  });

  it('когда добавлены все виджеты, каталог не рисует пустую полосу', () => {
    const { container } = renderCatalog(TYPES.map((t) => t.type));
    expect(container.querySelector('.widget-v4-catalog')).toBeNull();
  });
});
