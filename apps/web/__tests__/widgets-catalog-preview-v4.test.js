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
  // Виджета ещё нет — строка ожидания «скоро» с обещанием, без превью.
  { type: 'restPulse', name: 'Пульс покоя', defaultSize: '1x1', comingSoon: { about: 'утренний пульс и его тренд' } },
  // Виджет есть, но истории мало: приглушён, показывает прогресс, добавить можно.
  { type: 'healthTrend', name: 'Тренд здоровья', defaultSize: '2x2', needsHistoryDays: 3 },
  { type: 'water', name: 'Вода', defaultSize: '1x1' },
  { type: 'macros', name: 'Кольца БЖУ', defaultSize: '3x2' }
];

const READY_TYPES = TYPES.filter((t) => !t.comingSoon && !t.needsHistoryDays);

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
        getWaterData: () => ({ hasData: true, drunk: 1700, target: 2700 }),
        // Столько дней истории собрано — из этого каталог считает прогресс.
        getWidgetData: ({ type }) => (type === 'healthTrend' ? { daysWithData: 1 } : {})
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
    expect(previews.length).toBe(READY_TYPES.length);

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
    // Название несёт сама плитка: второго ярлыка рядом с превью нет.
    expect(card.querySelector('.widget-v4-catalog__name')).toBeNull();
  });

  it('уже стоящие на экране виджеты в каталоге не показываются', () => {
    const { container } = renderCatalog(['insulinWave']);
    expect(container.querySelector('.widget-v4-catalog__preview.widget--insulinWave')).toBeNull();
    expect(container.querySelectorAll('.widget-v4-catalog__item').length).toBe(TYPES.length - 1);
  });

  it('«скоро»: полная яркость, пилюля и обещание, без превью и без нажатия', () => {
    const { container } = renderCatalog();
    const soon = container.querySelector('.widget-v4-catalog__item--soon');

    expect(soon).toBeTruthy();
    expect(soon.textContent).toContain('Пульс покоя');
    expect(soon.querySelector('.widget-v4-catalog__pill').textContent).toBe('скоро');
    expect(soon.querySelector('.widget-v4-catalog__about').textContent).toBe('утренний пульс и его тренд');
    // Ни превью, ни даты, ни «в разработке» — язык команды сюда не попадает.
    expect(soon.querySelector('.widget-v4-catalog__preview')).toBeNull();
    expect(soon.textContent).not.toContain('в разработке');
    // Нажатие ничего не делает: это не кнопка.
    expect(soon.tagName).not.toBe('BUTTON');
    expect(soon.getAttribute('aria-disabled')).toBe('true');
  });

  it('«мало истории»: приглушено, прогресс собран, но добавить можно', () => {
    const { container } = renderCatalog();
    const waiting = container.querySelector('.widget-v4-catalog__item--waiting');

    expect(waiting).toBeTruthy();
    expect(waiting.textContent).toContain('Тренд здоровья');
    expect(waiting.textContent).toContain('нужно 3 дня');
    expect(waiting.textContent).toContain('собрано 1 из 3');
    // Здесь ждут не нас, а человека — плитку можно поставить заранее.
    expect(waiting.tagName).toBe('BUTTON');
    expect(waiting.querySelector('svg')).toBeTruthy();
  });

  it('строки ожидания идут последними и их не больше двух', () => {
    const { container } = renderCatalog();
    const items = [...container.querySelectorAll('.widget-v4-catalog__item')];
    const waitingCount = items.filter((el) => /--soon|--waiting/.test(el.className)).length;

    expect(waitingCount).toBe(2);
    expect(/--soon|--waiting/.test(items[items.length - 1].className)).toBe(true);
    expect(/--soon|--waiting/.test(items[items.length - 2].className)).toBe(true);
    expect(/--soon|--waiting/.test(items[0].className)).toBe(false);
  });

  it('живой реестр: строк ожидания сейчас нет, механика «скоро» осталась', () => {
    const registrySrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_registry_v1.js'), 'utf8');
    const coreSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');

    // «Клетчатка» вышла из «скоро» вместе с пятью новыми типами (решение
    // владельца 22 августа, строка контракта «готовится»). Флагом не помечен
    // никто: выдумывать несуществующую фичу нельзя.
    expect(registrySrc.match(/comingSoon:/g)).toBeNull();
    // Механика при этом остаётся в силе на будущее: тип с флагом в раскладку
    // не встанет даже мимо каталога.
    expect(coreSrc).toContain('if (def?.comingSoon) return null;');
  });

  it('когда добавлены все виджеты, каталог не рисует пустую полосу', () => {
    const { container } = renderCatalog(TYPES.map((t) => t.type));
    expect(container.querySelector('.widget-v4-catalog')).toBeNull();
  });
});
