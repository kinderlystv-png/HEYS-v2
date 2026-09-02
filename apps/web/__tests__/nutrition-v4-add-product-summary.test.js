// Стык «лист добавления → итог приёма» в питании v4.
//
// Лист граммов в режиме «несколько продуктов» намеренно не закрывает себя сам:
// увидев `context.onAdd`, он отдаёт продукт наружу и выходит, ожидая, что
// дневник покажет итог приёма («Добавить ещё» / «Завершить», канвас v4 ·
// экран 6). Путь `openAddProductForMeal` — тот, которым открывается лист из
// карточки приёма на вкладке питания — этого не делал: продукт записывался, а
// человек оставался на том же шаге граммов без выхода из потока.
//
// Живьём стык ловится только попыткой добавить продукт: обе стороны по
// отдельности исправны, ломается их соединение.
import fs from 'node:fs';
import path from 'node:path';

import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = globalThis.HEYS;
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalWindowHEYS = globalThis.window?.HEYS;
const originalWindowReact = globalThis.window?.React;
const originalWindowReactDOM = globalThis.window?.ReactDOM;

const DATE = '2026-09-02';
const MEAL_ID = 'meal_1';

function makeDay() {
  return {
    date: DATE,
    meals: [{ id: MEAL_ID, name: 'Обед', time: '13:00', items: [] }],
    trainings: [],
  };
}

function loadMealsModule(store) {
  globalThis.React = React;
  globalThis.ReactDOM = {};

  const lsGet = vi.fn((key, def) => (key in store ? store[key] : def));
  const lsSet = vi.fn((key, value) => {
    store[key] = value;
    return true;
  });

  globalThis.HEYS = {
    Paywall: { canWriteSync: vi.fn(() => true), showBlockedToast: vi.fn() },
    Toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
    ConfirmModal: { show: vi.fn(), hide: vi.fn() },
    StepModal: { show: vi.fn(), hide: vi.fn() },
    AddProductStep: { show: vi.fn() },
    dayAddProductSummary: { show: vi.fn() },
    products: {
      ensureMealProductReady: vi.fn(async (product) => ({ ok: true, product })),
      getAll: vi.fn(() => []),
    },
    cloud: {
      uploadPhoto: vi.fn(async () => ({ uploaded: true, path: 'photos/lunch.jpg' })),
    },
    models: { normalizeHarm: vi.fn(() => 0), normalizeItemGrams: (g, def) => +g || def },
    feedback: { emit: vi.fn() },
    utils: { lsGet, lsSet },
    dayUtils: {
      haptic: vi.fn(),
      lsGet,
      lsSet,
      uid: vi.fn((prefix) => `${prefix}test`),
      timeToMinutes: vi.fn(() => null),
      getProductFromItem: vi.fn(() => null),
      per100: vi.fn(() => ({ kcal100: 0 })),
      scale: vi.fn(() => 0),
    },
  };
  globalThis.window.HEYS = globalThis.HEYS;
  globalThis.window.React = React;
  globalThis.window.ReactDOM = globalThis.ReactDOM;

  const source = fs.readFileSync(path.resolve(__dirname, '../day/_meals.js'), 'utf8');
  eval(source);
  return globalThis.HEYS;
}

function renderHandlers(HEYS, day) {
  // setDay применяем по-настоящему: часть записей (фото приёма) сохраняет день
  // изнутри updater'а, и с пустой заглушкой этот путь не выполнится вовсе.
  let state = day;
  const deps = {
    setDay: vi.fn((updater) => {
      state = typeof updater === 'function' ? updater(state) : updater;
      return state;
    }),
    expandOnlyMeal: vi.fn(),
    date: DATE,
    products: [],
    day,
    prof: {},
    pIndex: {},
    getProductFromItem: vi.fn(() => null),
    isMobile: true,
    openTimePickerForNewMeal: vi.fn(),
    scrollToDiaryHeading: vi.fn(),
    lastLoadedUpdatedAtRef: { current: 0 },
    blockCloudUpdatesUntilRef: { current: 0 },
    newItemIds: new Set(),
    setNewItemIds: vi.fn(),
  };
  let handlers;
  function Harness() {
    handlers = HEYS.dayMealHandlers.createMealHandlers(deps);
    return null;
  }
  render(React.createElement(Harness));
  return () => handlers;
}

const PRODUCT = {
  id: 'p1',
  product_id: 'p1',
  name: 'Огурец',
  kcal100: 15,
  protein100: 1,
  simple100: 2,
  complex100: 1,
  badFat100: 0,
  goodFat100: 0,
  trans100: 0,
  fiber100: 1,
};

async function addOneProduct(HEYS, getHandlers, openOptions = {}) {
  getHandlers().openAddProductForMeal({ mealIndex: 0, mealId: MEAL_ID, ...openOptions });
  const shown = HEYS.AddProductStep.show.mock.calls.at(-1)?.[0];
  expect(shown, 'лист добавления не открылся').toBeTruthy();
  const added = await shown.onAdd({
    product: PRODUCT,
    grams: 200,
    mealIndex: 0,
    mealId: MEAL_ID,
    _origin: 'grams-step',
  });
  return { shown, added };
}

describe('питание v4: итог приёма после добавления продукта', () => {
  let store;
  let HEYS;
  let getHandlers;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
    store = { [`heys_dayv2_${DATE}`]: makeDay() };
    HEYS = loadMealsModule(store);
    getHandlers = renderHandlers(HEYS, makeDay());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.HEYS = originalHEYS;
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    globalThis.window.HEYS = originalWindowHEYS;
    globalThis.window.React = originalWindowReact;
    globalThis.window.ReactDOM = originalWindowReactDOM;
  });

  it('открывает лист в режиме «несколько продуктов» по умолчанию', async () => {
    getHandlers().openAddProductForMeal({ mealIndex: 0, mealId: MEAL_ID });
    const shown = HEYS.AddProductStep.show.mock.calls.at(-1)[0];
    expect(shown.multiProductMode).toBe(true);
  });

  it('после «Добавить» продукт записан и показан итог приёма', async () => {
    const { added } = await addOneProduct(HEYS, getHandlers);
    expect(added).not.toBe(false);

    const savedDay = store[`heys_dayv2_${DATE}`];
    expect(savedDay.meals[0].items).toHaveLength(1);
    expect(savedDay.meals[0].items[0].grams).toBe(200);

    // Лист граммов сам себя не закрывает — это делает дневник перед итогом.
    expect(HEYS.StepModal.hide).toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(
      HEYS.dayAddProductSummary.show,
      'итог приёма не показан — человек остался на шаге граммов',
    ).toHaveBeenCalledTimes(1);

    const summary = HEYS.dayAddProductSummary.show.mock.calls[0][0];
    expect(summary.mealId).toBe(MEAL_ID);
    expect(summary.day.meals[0].items).toHaveLength(1);
    expect(typeof summary.onAddMore).toBe('function');
    expect(typeof summary.onAddLast).toBe('function');
  });

  it('«Добавить ещё» открывает лист снова, «Добавить последний» — в одиночном режиме', async () => {
    await addOneProduct(HEYS, getHandlers);
    await vi.runAllTimersAsync();
    const summary = HEYS.dayAddProductSummary.show.mock.calls[0][0];

    summary.onAddMore(null, 0);
    expect(HEYS.AddProductStep.show.mock.calls.at(-1)[0].multiProductMode).toBe(true);

    summary.onAddLast(null);
    expect(HEYS.AddProductStep.show.mock.calls.at(-1)[0].multiProductMode).toBe(false);
  });

  it('фото приёма из итога попадает в день и уходит в облако', async () => {
    await addOneProduct(HEYS, getHandlers);
    await vi.runAllTimersAsync();
    const summary = HEYS.dayAddProductSummary.show.mock.calls[0][0];
    expect(typeof summary.onPhoto, 'в итоге приёма нет блока фото').toBe('function');

    await summary.onPhoto({
      photo: 'data:image/jpeg;base64,AAAA',
      filename: 'lunch.jpg',
      timestamp: 1788000000000,
    });
    await vi.runAllTimersAsync();

    const savedDay = store[`heys_dayv2_${DATE}`];
    expect(savedDay.meals[0].photos).toHaveLength(1);
    expect(savedDay.meals[0].photos[0].filename).toBe('lunch.jpg');
    expect(HEYS.cloud.uploadPhoto).toHaveBeenCalledWith(
      'data:image/jpeg;base64,AAAA',
      'default',
      DATE,
      MEAL_ID,
    );
    // Ответ облака снимает «загружается» и выбрасывает тяжёлую base64-копию.
    expect(savedDay.meals[0].photos[0].uploading).toBe(false);
    expect(savedDay.meals[0].photos[0].path).toBe('photos/lunch.jpg');
    expect(savedDay.meals[0].photos[0].data).toBeUndefined();
  });

  it('за лимитом фото приёма не добавляется', async () => {
    const photoLimit = 10;
    store[`heys_dayv2_${DATE}`] = makeDay();
    const dayAtLimit = makeDay();
    dayAtLimit.meals[0].photos = Array.from({ length: photoLimit }, (_, i) => ({ id: `ph${i}` }));
    getHandlers = renderHandlers(HEYS, dayAtLimit);

    const added = await getHandlers().addMealPhoto({
      mealIndex: 0,
      mealId: MEAL_ID,
      photo: 'data:image/jpeg;base64,AAAA',
      filename: 'over-limit.jpg',
      timestamp: 1,
    });
    expect(added).toBe(false);
    expect(HEYS.cloud.uploadPhoto).not.toHaveBeenCalled();
    expect(HEYS.Toast.warning).toHaveBeenCalled();
  });

  it('в одиночном режиме итога нет — лист закрывает себя сам', async () => {
    await addOneProduct(HEYS, getHandlers, { multiProductMode: false });
    await vi.runAllTimersAsync();
    expect(HEYS.dayAddProductSummary.show).not.toHaveBeenCalled();
  });

  it('в режиме «Подряд N» итог не вклинивается между повторами', async () => {
    await addOneProduct(HEYS, getHandlers, { autoRepeatCount: 3 });
    await vi.runAllTimersAsync();
    expect(HEYS.dayAddProductSummary.show).not.toHaveBeenCalled();
  });

  it('«поток завершён» в режиме нескольких продуктов не летит на каждое добавление', async () => {
    const finished = [];
    const listener = (event) => finished.push(event.detail?.source || null);
    window.addEventListener('heys:meal-flow-finished', listener);
    try {
      await addOneProduct(HEYS, getHandlers);
      await vi.runAllTimersAsync();
      expect(finished).toEqual([]);
    } finally {
      window.removeEventListener('heys:meal-flow-finished', listener);
    }
  });

  it('одиночный режим по-прежнему сообщает о завершении потока', async () => {
    const finished = [];
    const listener = (event) => finished.push(event.detail?.source || null);
    window.addEventListener('heys:meal-flow-finished', listener);
    try {
      await addOneProduct(HEYS, getHandlers, { multiProductMode: false });
      await vi.runAllTimersAsync();
      expect(finished).toContain('day-add-product-to-meal');
    } finally {
      window.removeEventListener('heys:meal-flow-finished', listener);
    }
  });
});
