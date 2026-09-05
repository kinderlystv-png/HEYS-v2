// Lane 3 Task 45 — functional smoke for main day loop.
// Closes GAPs from scripts/.day-loop-functional-smoke-inventory.json only.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const { mergeDayData } = require(path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs'));

const DATE = '2026-09-05';
const MEAL_ID = 'meal_lunch';
const ITEM_ID = 'item_oats';

function makeDay(overrides = {}) {
  return {
    date: DATE,
    meals: [{
      id: MEAL_ID,
      name: 'Обед',
      time: '13:00',
      items: [{ id: ITEM_ID, name: 'Овсянка', grams: 100, product_id: 'p_oats', kcal100: 350 }],
    }],
    trainings: [],
    ...overrides,
  };
}

function loadMealsModule(store, { lsSetImpl } = {}) {
  globalThis.React = React;
  globalThis.ReactDOM = {};

  const lsGet = vi.fn((key, def) => (key in store ? store[key] : def));
  const lsSet = vi.fn((key, value) => {
    if (lsSetImpl) return lsSetImpl(key, value);
    store[key] = value;
    return true;
  });

  let lastUndo = null;

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
    cloud: { uploadPhoto: vi.fn(async () => ({ uploaded: true, path: 'x.jpg' })) },
    models: { normalizeHarm: vi.fn(() => 0), normalizeItemGrams: (g, def) => +g || def },
    feedback: { emit: vi.fn() },
    Undo: {
      runAction: ({ apply, undo }) => {
        const ctx = apply();
        lastUndo = () => undo(ctx);
        return ctx;
      },
    },
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
      // В проде сливает только субъективные поля чек-ина; для smoke не затираем meals.
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
  return { HEYS: globalThis.HEYS, lsSet, undoLast: () => lastUndo?.() };
}

function mountMealHandlers(HEYS, initialDay) {
  let state = initialDay;
  let handlers;
  let view;

  const buildDeps = () => ({
    setDay: vi.fn((updater) => {
      state = typeof updater === 'function' ? updater(state) : updater;
      view?.rerender(React.createElement(Harness));
      return state;
    }),
    expandOnlyMeal: vi.fn(),
    date: DATE,
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

  view = render(React.createElement(Harness));
  return {
    getHandlers: () => handlers,
    getState: () => state,
    rerender: () => view.rerender(React.createElement(Harness)),
  };
}

function loadPlanSlotApi(store) {
  window.React = React;
  window.HEYS = {
    utils: {
      lsGet: (key, def) => (key in store ? store[key] : def),
      lsSet: (key, val) => { store[key] = val; return true; },
    },
    currentClientId: 'client-smoke',
  };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB_DIR, 'heys_day_trainings_v1.js'), 'utf8'));
  return window.HEYS.dayTrainings;
}

describe('day loop · meals handlers (GAP meal-edit/remove/undo/persist)', () => {
  let store;
  let HEYS;
  let ctx;
  let undoLast;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5, 12, 0, 0));
    store = { [`heys_dayv2_${DATE}`]: makeDay() };
    ({ HEYS, undoLast } = loadMealsModule(store));
    ctx = mountMealHandlers(HEYS, makeDay());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete globalThis.HEYS;
  });

  it('setGrams меняет порцию и сохраняет в LS', () => {
    ctx.getHandlers().setGrams(0, ITEM_ID, '150');
    const saved = store[`heys_dayv2_${DATE}`];
    expect(saved.meals[0].items[0].grams).toBe(150);
    expect(saved.meals[0].items[0].updatedAt).toBeGreaterThan(0);
  });

  it('removeItem ставит deletedItemIds и merge не воскрешает item', () => {
    ctx.getHandlers().removeItem(0, ITEM_ID);
    const saved = store[`heys_dayv2_${DATE}`];
    expect(saved.meals[0].items).toHaveLength(0);
    expect(saved.deletedItemIds[ITEM_ID]).toBeGreaterThan(0);

    const staleRemote = makeDay();
    staleRemote.updatedAt = saved.updatedAt - 5000;
    const merged = mergeDayData(saved, staleRemote, { forceKeepAll: true });
    expect(merged.meals[0].items).toHaveLength(0);
  });

  it('removeMeal ставит deletedMealIds tombstone', async () => {
    await ctx.getHandlers().removeMeal(0);
    const saved = store[`heys_dayv2_${DATE}`];
    expect(saved.meals).toHaveLength(0);
    expect(saved.deletedMealIds[MEAL_ID]).toBeGreaterThan(0);
  });

  it('undo removeItem возвращает продукт и снимает tombstone', () => {
    ctx.getHandlers().removeItem(0, ITEM_ID);
    expect(store[`heys_dayv2_${DATE}`].meals[0].items).toHaveLength(0);

    undoLast();
    const restored = store[`heys_dayv2_${DATE}`];
    expect(restored.meals[0].items).toHaveLength(1);
    expect(restored.meals[0].items[0].id).toBe(ITEM_ID);
    expect(restored.deletedItemIds?.[ITEM_ID]).toBeUndefined();
  });

  it('addProductToMeal не сообщает успех при lsSet=false', async () => {
    cleanup();
    store = { [`heys_dayv2_${DATE}`]: makeDay() };
    ({ HEYS } = loadMealsModule(store, {
      lsSetImpl: () => false,
    }));
    ctx = mountMealHandlers(HEYS, makeDay());

    const product = {
      id: 'p_new',
      product_id: 'p_new',
      name: 'Яблоко',
      grams: 120,
      kcal100: 50,
    };
    const ok = await ctx.getHandlers().addProductToMeal(0, product);
    expect(ok).toBe(false);
    expect(store[`heys_dayv2_${DATE}`].meals[0].items).toHaveLength(1);
    expect(HEYS.Toast.error).toHaveBeenCalled();
  });
});

describe('day loop · cold-cache slot (GAP day-known-empty-batch)', () => {
  it('planSlotForDate: knownEmptyDates снимает unknown без записи в LS', () => {
    const store = {};
    const api = loadPlanSlotApi(store);
    const emptyDate = '2026-09-04';

    const cold = api.planSlotForDate(emptyDate);
    expect(cold.unknown).toBe(true);

    const known = api.planSlotForDate(emptyDate, new Set([emptyDate]));
    expect(known.unknown).toBe(false);
    expect(known.busy).toBe(false);
    expect(known.day?.trainings).toEqual([]);
    expect(store[`heys_client-smoke_dayv2_${emptyDate}`]).toBeUndefined();
  });

  it('planSlotForDate: busy при трёх фактах даже если knownEmpty', () => {
    // readDayFromStore без clientId в profile читает heys_dayv2_* (heys_day_trainings_v1.js:102)
    const store = {
      [`heys_dayv2_${DATE}`]: {
        date: DATE,
        trainings: [
          { time: '08:00' },
          { time: '12:00' },
          { time: '18:00' },
        ],
      },
    };
    const api = loadPlanSlotApi(store);
    const slot = api.planSlotForDate(DATE, new Set([DATE]));
    expect(slot.unknown).toBe(false);
    expect(slot.busy).toBe(true);
  });
});
