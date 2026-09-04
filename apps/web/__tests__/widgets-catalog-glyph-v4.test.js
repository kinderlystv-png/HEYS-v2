/**
 * Сведённый кусок home-widgets: «вид · значок вместо эмодзи».
 * Три места — категория, тип в ряду имени, чипы вида. Глиф один:
 * 15×15, обводка 2,75, тон --ac, без своей заливки.
 */
import fs from 'node:fs';
import path from 'node:path';

import { render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  {
    type: 'heatmap',
    name: 'Тепловая карта',
    category: 'nutrition',
    icon: 'barChart',
    defaultSize: '2x2'
  },
  {
    type: 'fiber',
    name: 'Клетчатка',
    category: 'nutrition',
    icon: 'wheat',
    defaultSize: '2x1'
  },
  { type: 'water', name: 'Вода', defaultSize: '1x1' }
];

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`))?.[1] || '';
}

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
      GLYPHS: {
        apple: ['M12 2v4'],
        barChart: ['M3 3h18'],
        wheat: ['M7 20h10']
      },
      registry: {
        getAvailableTypes: () => TYPES,
        getType: (type) => TYPES.find((t) => t.type === type) || null,
        getSize: () => null,
        normalizeSizeId: (id) => id,
        getCategories: () => [{ id: 'nutrition', label: 'Питание', icon: 'apple' }]
      },
      state: { isEditMode: () => true },
      data: {
        getWidgetData: () => ({})
      },
      VariantsV4: {
        getCatalog: () => [],
        getDefaultVariant: (type) => (type === 'heatmap'
          ? { id: 'month', title: 'Месяц целиком', size: '2x2' }
          : type === 'fiber'
            ? { id: 'now', title: 'Как сейчас', size: '2x1' }
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

describe('вид · значок вместо эмодзи — сведённый кусок', () => {
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

  it('читает три места и один глиф из актуального data-v', () => {
    const contract = contractValue(canvas, 'вид · значок вместо эмодзи');
    expect(contract).toContain('15×15');
    expect(contract).toContain('обводка 2,75');
    expect(contract).toContain('тон --ac');
    expect(contract).toContain('зазор 7 перед подписью 9 px/700');
    expect(contract).toContain('зазор 7 перед именем 12 px/700');
    expect(contract).toContain('подзаголовок 10,5 px/500');
    expect(contract).toContain('зазор 6 внутри пилюли высотой 32');
    expect(contract).toContain('inset 1,5 --acs');
    expect(contract).toContain('Своей заливки и подложки у значка нет');
  });

  it('держит категорию, имя и чипы ролями, не литералом набора', () => {
    const category = rules.get('.widget-v4-catalog__category');
    expect(category.gap).toBe('7px');
    expect(category.padding).toBe('0 2px');
    expect(category.color).toContain('--v4-ink-label');
    expect(category.background || 'none').not.toMatch(/#|rgb/i);

    const label = rules.get('.widget-v4-catalog__category-label');
    expect(label['font-size']).toBe('9px');
    expect(label['font-weight']).toBe('700');
    expect(label['letter-spacing']).toBe('0.03em');
    expect(label['text-transform']).toBe('uppercase');

    const title = rules.get('.widget-v4-catalog__title');
    expect(title.gap).toBe('7px');
    expect(rules.get('.widget-v4-catalog__title .widgets-glyph').background).toBe('none');
    expect(rules.get('.widget-v4-catalog__category .widgets-glyph').background).toBe('none');

    const desc = rules.get('.widget-v4-catalog__desc');
    expect(desc['font-size']).toBe('10.5px');
    expect(desc['font-weight']).toBe('500');
    expect(desc['margin-top']).toBe('3px');
    expect(desc.color).toContain('--v4-ink-data');

    const readyName = rules.get('.widget-v4-catalog__item:not(.widget-v4-catalog__item--soon):not(.widget-v4-catalog__item--waiting) .widget-v4-catalog__name');
    expect(readyName['font-size']).toBe('12px');
    expect(readyName['font-weight']).toBe('700');
    expect(readyName.color).toContain('--v4-ink');
    expect(readyName.color).not.toMatch(/^#/);

    const chip = rules.get('.widget-weight__stat');
    expect(chip.gap).toBe('6px');
    expect(chip['min-height']).toBe('32px');
    expect(chip.padding).toBe('0 12px');
    expect(chip['border-radius']).toBe('999px');
    expect(chip['box-shadow']).toBe('inset 0 0 0 1.5px var(--v4-act, #c67139)');
    expect(chip.background).toBe('none');
    expect(chip['font-size']).toBe('10.5px');
    expect(chip['font-weight']).toBe('700');
    expect(chip.color).toContain('--v4-act-text');
    expect(rules.get('.widget-weight__stat-icon').background).toBe('none');
    expect(css).not.toContain('.widget-weight__stat--pink');
    expect(css).not.toMatch(/\.widgets-catalog__item-icon\s*\{[^}]*width:\s*40px/);
  });

  it('объявляет тон чипа во всех четырёх наборах', () => {
    expect(palette.match(/--v4-act-text:/g)).toHaveLength(4);
    expect(palette.match(/--v4-act:/g)).toHaveLength(4);
  });

  it('рисует заголовок категории и имя со значком в живом CatalogStrip', () => {
    const CatalogStrip = loadCatalogStrip();
    const { container } = render(RealReact.createElement(CatalogStrip, {
      onSelect: () => {},
      existingTypes: new Set(),
      selectedDate: '2026-09-04'
    }));

    const header = container.querySelector('.widget-v4-catalog__category');
    expect(header).toBeTruthy();
    expect(header.querySelector('.widget-v4-catalog__category-label').textContent).toBe('Питание');
    const headerSvg = header.querySelector('svg');
    expect(headerSvg).toBeTruthy();
    expect(headerSvg.getAttribute('width')).toBe('15');
    expect(headerSvg.getAttribute('height')).toBe('15');
    expect(headerSvg.getAttribute('stroke-width')).toBe('2.75');

    const heatmap = container.querySelector('.widget-v4-catalog__preview.widget--heatmap')
      ?.closest('button');
    expect(heatmap).toBeTruthy();
    expect(heatmap.querySelector('.widget-v4-catalog__name').textContent).toBe('Тепловая карта');
    expect(heatmap.querySelector('.widget-v4-catalog__desc').textContent).toBe('Месяц целиком · 2×2');
    const typeSvg = heatmap.querySelector('.widget-v4-catalog__title svg');
    expect(typeSvg).toBeTruthy();
    expect(typeSvg.getAttribute('width')).toBe('15');
    expect(typeSvg.getAttribute('stroke-width')).toBe('2.75');
    expect(heatmap.querySelector('.widgets-catalog__item-icon')).toBeNull();
    expect(heatmap.querySelector('.sr-only')).toBeNull();

    const water = container.querySelector('.widget-v4-catalog__preview.widget--water')
      ?.closest('button');
    expect(water.querySelector('.widget-v4-catalog__category')).toBeNull();
    expect(water.querySelector('.widget-v4-catalog__name').textContent).toBe('Вода');
  });

  it('не оставляет пластину 40×40 и розовый чип в исходнике зоны', () => {
    expect(uiSrc).not.toContain('widgets-catalog__item-icon');
    expect(uiSrc).not.toContain('widget-weight__stat--pink');
    expect(uiSrc).toContain('function WidgetGlyph');
    expect(uiSrc).toContain('width: 15');
    expect(uiSrc).toContain('strokeWidth: 2.75');
    expect(uiSrc).toContain("className: 'widget-v4-catalog__category'");
    expect(uiSrc).toContain("className: 'widget-v4-catalog__title'");
  });
});
