// Lane 3 Task 52 PIECE 2 — nutrition functional smoke.
// Closes GAPs from scripts/.nutrition-functional-smoke-inventory.json only.
// Does NOT duplicate day-loop-functional-smoke (setGrams, remove, undo, persist-fail).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const TODAY = '2026-09-05';
const PAST_DATE = '2026-08-28';
const MEAL_ID = 'meal_lunch';
const MEAL_ID_DINNER = 'meal_dinner';

function makeDay(date = TODAY, overrides = {}) {
  return {
    date,
    meals: [{
      id: MEAL_ID,
      name: 'Обед',
      time: '13:00',
      items: [{ id: 'item_oats', name: 'Овсянка', grams: 100, product_id: 'p_oats', kcal100: 350 }],
    }],
    trainings: [],
    ...overrides,
  };
}

function makeTwoMealDay(date = TODAY) {
  return {
    date,
    meals: [
      { id: MEAL_ID, name: 'Обед', time: '13:00', items: [] },
      { id: MEAL_ID_DINNER, name: 'Ужин', time: '19:00', items: [] },
    ],
    trainings: [],
  };
}

function makeProduct(id, name, grams = 100) {
  return {
    id,
    product_id: id,
    name,
    grams,
    kcal100: 50,
    protein100: 3,
    simple100: 5,
    complex100: 1,
    badFat100: 0,
    goodFat100: 1,
    trans100: 0,
    fiber100: 2,
  };
}

function loadMealsModule(store, { lsSetImpl, ensureReadyImpl, date = TODAY } = {}) {
  globalThis.React = React;
  globalThis.ReactDOM = {};

  const lsGet = vi.fn((key, def) => (key in store ? store[key] : def));
  const lsSet = vi.fn((key, value) => {
    if (lsSetImpl) return lsSetImpl(key, value);
    store[key] = value;
    return true;
  });

  const ensureMealProductReady = ensureReadyImpl
    || vi.fn(async (product) => ({ ok: true, product }));

  globalThis.HEYS = {
    Paywall: { canWriteSync: vi.fn(() => true), showBlockedToast: vi.fn() },
    Toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
    ConfirmModal: { show: vi.fn(), hide: vi.fn() },
    StepModal: { show: vi.fn(), hide: vi.fn() },
    AddProductStep: { show: vi.fn() },
    dayAddProductSummary: { show: vi.fn() },
    products: {
      ensureMealProductReady,
      getAll: vi.fn(() => []),
      addFromShared: vi.fn(),
    },
    cloud: { uploadPhoto: vi.fn(async () => ({ uploaded: true, path: 'x.jpg' })) },
    models: { normalizeHarm: vi.fn(() => 0), normalizeItemGrams: (g, def) => +g || def },
    feedback: { emit: vi.fn() },
    Undo: { runAction: vi.fn() },
    utils: { lsGet, lsSet, getCurrentClientId: vi.fn(() => null) },
    dayUtils: {
      haptic: vi.fn(),
      lsGet,
      lsSet,
      uid: vi.fn((prefix) => `${prefix}smoke`),
      timeToMinutes: vi.fn(() => null),
      getProductFromItem: vi.fn(() => null),
      per100: vi.fn(() => ({ kcal100: 0 })),
      scale: vi.fn(() => 0),
      mergeSubjectiveFieldsPreferFresh: (next) => next,
    },
    Day: {
      getDay: vi.fn(),
      setLastLoadedUpdatedAt: vi.fn(),
      setBlockCloudUpdates: vi.fn(),
      markPendingMutation: vi.fn(),
    },
  };
  globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS;
  globalThis.window.React = React;
  globalThis.window.ReactDOM = globalThis.ReactDOM;

  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB_DIR, 'day/_meals.js'), 'utf8'));
  return { HEYS: globalThis.HEYS, lsSet, ensureMealProductReady };
}

function mountMealHandlers(HEYS, initialDay, date = TODAY) {
  let state = initialDay;
  let handlers;

  const buildDeps = () => ({
    setDay: vi.fn((updater) => {
      state = typeof updater === 'function' ? updater(state) : updater;
      view?.rerender(React.createElement(Harness));
      return state;
    }),
    expandOnlyMeal: vi.fn(),
    date,
    products: [],
    day: state,
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
  });

  function Harness() {
    handlers = HEYS.dayMealHandlers.createMealHandlers(buildDeps());
    return null;
  }

  const view = render(React.createElement(Harness));
  return {
    getHandlers: () => handlers,
    getState: () => state,
  };
}

function dayKey(date) {
  return `heys_dayv2_${date}`;
}

describe('nutrition · addProductsToMeal batch (GAP nut-add-batch)', () => {
  let store;
  let HEYS;
  let ctx;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5, 12, 0, 0));
    store = { [dayKey(TODAY)]: makeTwoMealDay() };
    ({ HEYS } = loadMealsModule(store));
    ctx = mountMealHandlers(HEYS, makeTwoMealDay());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete globalThis.HEYS;
  });

  it('атомарно добавляет несколько продуктов с разными граммами и снимками', async () => {
    const entries = [
      { product: makeProduct('p1', 'Яблоко', 80), grams: 80 },
      { product: makeProduct('p2', 'Творог', 150), grams: 150 },
    ];
    const ok = await ctx.getHandlers().addProductsToMeal(0, entries);
    expect(ok).toBe(true);

    const saved = store[dayKey(TODAY)];
    expect(saved.meals[0].items).toHaveLength(2);
    expect(saved.meals[0].items[0].grams).toBe(80);
    expect(saved.meals[0].items[1].grams).toBe(150);
    expect(saved.meals[0].items[0].protein100).toBe(3);
    expect(saved.meals[0].items[1].name).toBe('Творог');
  });

  it('lsSet=false не пишет batch и возвращает false', async () => {
    cleanup();
    store = { [dayKey(TODAY)]: makeTwoMealDay() };
    ({ HEYS } = loadMealsModule(store, { lsSetImpl: () => false }));
    ctx = mountMealHandlers(HEYS, makeTwoMealDay());

    const before = store[dayKey(TODAY)].meals[0].items.length;
    const ok = await ctx.getHandlers().addProductsToMeal(0, [
      { product: makeProduct('p1', 'Яблоко', 80) },
      { product: makeProduct('p2', 'Творог', 150) },
    ]);
    expect(ok).toBe(false);
    expect(store[dayKey(TODAY)].meals[0].items).toHaveLength(before);
    expect(HEYS.Toast.error).toHaveBeenCalled();
  });

  it('commit-gate на втором продукте отменяет batch до lsSet', async () => {
    cleanup();
    store = { [dayKey(TODAY)]: makeTwoMealDay() };
    ({ HEYS } = loadMealsModule(store, {
      ensureReadyImpl: vi.fn(async (product) => {
        if (product.id === 'p2') return { ok: false, reason: 'commit_blocked' };
        return { ok: true, product };
      }),
    }));
    ctx = mountMealHandlers(HEYS, makeTwoMealDay());

    const ok = await ctx.getHandlers().addProductsToMeal(0, [
      { product: makeProduct('p1', 'Яблоко', 80) },
      { product: makeProduct('p2', 'Творог', 150) },
    ]);
    expect(ok).toBe(false);
    expect(store[dayKey(TODAY)].meals[0].items).toHaveLength(0);
    expect(HEYS.Toast.error).toHaveBeenCalled();
  });
});

describe('nutrition · mealId resolve + portion grams (GAP nut-add-mealid-resolve, nut-portion-grams-on-add)', () => {
  let store;
  let HEYS;
  let ctx;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5, 12, 0, 0));
    store = { [dayKey(TODAY)]: makeTwoMealDay() };
    ({ HEYS } = loadMealsModule(store));
    ctx = mountMealHandlers(HEYS, makeTwoMealDay());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete globalThis.HEYS;
  });

  it('stale mealIndex, но mealId попадает в ужин', async () => {
    const product = makeProduct('p_dinner', 'Рыба', 120);
    const ok = await ctx.getHandlers().addProductToMeal(99, product, { mealId: MEAL_ID_DINNER });
    expect(ok).toBe(true);

    const saved = store[dayKey(TODAY)];
    expect(saved.meals[0].items).toHaveLength(0);
    expect(saved.meals[1].items).toHaveLength(1);
    expect(saved.meals[1].items[0].grams).toBe(120);
    expect(saved.meals[1].items[0].product_id).toBe('p_dinner');
  });

  it('граммы порции с листа (75) не сбрасываются в 100', async () => {
    const product = makeProduct('p_portion', 'Хлеб', 75);
    const ok = await ctx.getHandlers().addProductToMeal(0, product);
    expect(ok).toBe(true);
    expect(store[dayKey(TODAY)].meals[0].items[0].grams).toBe(75);
  });
});

describe('nutrition · backdated LS key (GAP nut-backdated-add-key)', () => {
  let store;
  let HEYS;
  let ctx;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5, 12, 0, 0));
    store = {
      [dayKey(TODAY)]: makeDay(TODAY),
      [dayKey(PAST_DATE)]: makeDay(PAST_DATE, { meals: [{ id: MEAL_ID, name: 'Обед', time: '13:00', items: [] }] }),
    };
    ({ HEYS } = loadMealsModule(store));
    ctx = mountMealHandlers(HEYS, store[dayKey(PAST_DATE)], PAST_DATE);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete globalThis.HEYS;
  });

  it('добавление на прошлую дату пишет только в ключ прошлого дня', async () => {
    const product = makeProduct('p_past', 'Кефир', 200);
    const ok = await ctx.getHandlers().addProductToMeal(0, product);
    expect(ok).toBe(true);

    expect(store[dayKey(PAST_DATE)].meals[0].items).toHaveLength(1);
    expect(store[dayKey(PAST_DATE)].meals[0].items[0].grams).toBe(200);
    expect(store[dayKey(TODAY)].meals[0].items).toHaveLength(1);
  });
});
