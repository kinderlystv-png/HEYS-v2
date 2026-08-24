/**
 * Карточка быстрых действий на Главной (канвас home-widgets.v4, строки
 * «набор действий», «порядок в карточке», «две грамматики», «чипы воды»,
 * «настройка состава», «включён один пункт», «не включено ни одного»).
 *
 * Почему смоуком, а не глазами. Крайние случаи состава — ноль включённых
 * пунктов и ровно один — человек в проде не соберёт: надо зайти в настройки,
 * выключить четыре переключателя, вернуться на Главную и посмотреть, во что
 * превратилась кнопка. Пять состояний × две грамматики строк — это таблица,
 * а не осмотр.
 */
import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

const ALL_ON = { water: true, hunger: true, message: true, activity: true, meal: true };

function loadFab(visibility) {
  globalThis.React = RealReact;
  globalThis.ReactDOM = {
    createRoot: () => ({ render: () => {}, unmount: () => {} }),
    createPortal: (node) => node,
  };

  window.HEYS = {
    Widgets: {
      emit: () => {},
      on: () => () => {},
      registry: {
        getAvailableTypes: () => [],
        getType: () => null,
        getSize: () => null,
        normalizeSizeId: (id) => id,
        getCategories: () => [],
      },
      state: { isEditMode: () => false },
      data: { getWaterData: () => ({ hasData: true, drunk: 1700, target: 2700 }) },
      VariantsV4: {
        getCatalog: () => [],
        getDefaultVariant: () => null,
        getActiveVariant: () => null,
        getVariantById: () => null,
        useWidgetVariantTile: null,
      },
    },
    FabVisibility: { EVENT: 'heys:fab-visibility-changed', read: () => visibility },
    // Объёмы человека из настроек воды — строка «чипы воды».
    WaterCustomVolume: { PRESETS_ML: [200, 500] },
    utils: { lsGet: () => ({}) },
    dayUtils: {},
  };

  // eslint-disable-next-line no-eval
  eval(uiSrc);
  return window.HEYS.Widgets.QuickActionsFab;
}

function open(visibility = ALL_ON, props = {}) {
  const Fab = loadFab(visibility);
  const out = render(RealReact.createElement(Fab, { waterMl: 1700, ...props }));
  const button = out.container.querySelector('.widgets-quick-fab');
  if (button) fireEvent.click(button);
  return out;
}

/** Подписи навигационных строк сверху вниз, как они стоят в карточке. */
function rowLabels(container) {
  return [...container.querySelectorAll('.widgets-quick-sheet__row-label')].map((n) => n.textContent);
}

describe('быстрые действия: состав и порядок', () => {
  beforeEach(() => {
    globalThis.React = RealReact;
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('пять пунктов: снизу вверх вода, еда, голод, активность, мессенджер', () => {
    const { container } = open();
    // Карточка растёт сверху вниз, поэтому навигационные идут в обратном
    // порядке, а вода стоит последней — ближе всего к кнопке.
    expect(rowLabels(container)).toEqual(['Мессенджер', 'Активность', 'Голод и энергия', 'Еда']);
    expect(container.querySelector('.widgets-quick-sheet__title').textContent).toBe('Вода');
  });

  it('четыре навигационные строки несут шеврон, у воды его нет', () => {
    const { container } = open();
    expect(container.querySelectorAll('.widgets-quick-sheet__chevron').length).toBe(4);
    const head = container.querySelector('.widgets-quick-sheet__head');
    expect(head.querySelector('.widgets-quick-sheet__chevron')).toBeNull();
  });

  it('чипы воды — объёмы человека, чипа 250 нет', () => {
    const { container } = open();
    const chips = [...container.querySelectorAll('.widgets-quick-sheet__chip')].map((n) => n.textContent);
    expect(chips).toEqual(['200', '500']);
    expect(chips).not.toContain('250');
  });

  it('выключенный пункт исчезает, порядок остальных не меняется', () => {
    const { container } = open({ ...ALL_ON, hunger: false, activity: false });
    expect(rowLabels(container)).toEqual(['Мессенджер', 'Еда']);
  });

  it('не включено ни одного — кнопки в углу нет вовсе', () => {
    const Fab = loadFab({ water: false, hunger: false, message: false, activity: false, meal: false });
    const { container } = render(RealReact.createElement(Fab, { waterMl: 0 }));
    expect(container.querySelector('.widgets-quick-fab')).toBeNull();
  });

  it('включён один навигационный — кнопка становится этим действием', () => {
    const calls = [];
    const Fab = loadFab({ water: false, hunger: false, message: false, activity: false, meal: true });
    const { container } = render(
      RealReact.createElement(Fab, { waterMl: 0, onAddMeal: () => calls.push('meal') }),
    );
    const button = container.querySelector('.widgets-quick-fab');
    expect(button.getAttribute('aria-label')).toBe('Еда');
    fireEvent.click(button);
    // Стопки нет: тап уводит на экран, карточка не раскрывается.
    expect(calls).toEqual(['meal']);
    expect(container.querySelector('.widgets-quick-sheet')).toBeNull();
  });

  it('включена одна вода — карточка с одними чипами, без списка', () => {
    const { container } = open({ water: true, hunger: false, message: false, activity: false, meal: false });
    expect(rowLabels(container)).toEqual([]);
    expect(container.querySelector('.widgets-quick-sheet__divider')).toBeNull();
    expect(container.querySelectorAll('.widgets-quick-sheet__chip').length).toBe(2);
  });

  it('вода двумя тапами: чип пишет объём и закрывает карточку', () => {
    const added = [];
    const { container } = open(ALL_ON, { onAddWater: (ml) => added.push(ml) });
    fireEvent.click(container.querySelectorAll('.widgets-quick-sheet__chip')[1]);
    expect(added).toEqual([500]);
    expect(container.querySelector('.widgets-quick-sheet')).toBeNull();
  });
});
