import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalWindowHEYS = window.HEYS;
const originalReact = global.React;
const originalWindowReact = window.React;
const originalRequestAnimationFrame = global.requestAnimationFrame;
const originalWindowRequestAnimationFrame = window.requestAnimationFrame;
const originalWindowDispatchEvent = window.dispatchEvent;

function loadModule() {
  const srcPath = path.resolve(__dirname, '../heys_day_add_product.js');
  eval(fs.readFileSync(srcPath, 'utf8'));
}

function readAddProductStepSource() {
  return fs.readFileSync(path.resolve(__dirname, '../heys_add_product_step_v1.js'), 'utf8');
}

function readDayEffectsSource() {
  return fs.readFileSync(path.resolve(__dirname, '../heys_day_effects.js'), 'utf8');
}

function readDayMealsSource() {
  return fs.readFileSync(path.resolve(__dirname, '../day/_meals.js'), 'utf8');
}

function readDayUtilsSource() {
  return fs.readFileSync(path.resolve(__dirname, '../heys_day_utils.js'), 'utf8');
}

function readComponentsCssSource() {
  return fs.readFileSync(path.resolve(__dirname, '../styles/heys-components.css'), 'utf8');
}

function readDayTabImplSource() {
  return fs.readFileSync(path.resolve(__dirname, '../heys_day_tab_impl_v1.js'), 'utf8');
}

function readMealRecCardSource() {
  return fs.readFileSync(path.resolve(__dirname, '../insights/pi_ui_meal_rec_card.js'), 'utf8');
}

function makeProduct(id, name) {
  return {
    id,
    product_id: id,
    name,
    grams: 100,
    kcal100: 120,
    protein100: 10,
    carbs100: 12,
    fat100: 4,
    simple100: 3,
    complex100: 9,
    badFat100: 1,
    goodFat100: 3,
    trans100: 0,
    fiber100: 2,
    harm: 1
  };
}

describe('Meal preset bulk add', () => {
  let currentDay;
  let dispatchEventSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, 'now').mockReturnValue(1781692227000);

    const raf = vi.fn((cb) => {
      cb();
      return 1;
    });
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;

    let nextId = 0;
    currentDay = {
      date: '2026-06-17',
      meals: [
        { id: 'meal-1', name: 'Обед', items: [{ id: 'existing', name: 'Existing', grams: 50 }] }
      ],
      updatedAt: 1781692220000
    };

    const heys = {
      dayUtils: {
        uid: (prefix = 'id_') => `${prefix}${++nextId}`
      },
      models: {
        normalizeHarm: (product) => product.harm
      },
      products: {
        getAll: vi.fn(() => []),
        addFromShared: vi.fn()
      },
      store: {
        get: vi.fn((key, fallback) => fallback),
        set: vi.fn()
      },
      AddProductStep: {
        show: vi.fn()
      },
      Day: {
        getDay: vi.fn(() => currentDay),
        setBlockCloudUpdates: vi.fn(),
        setLastLoadedUpdatedAt: vi.fn(),
        markPendingMutation: vi.fn(),
        requestFlush: vi.fn()
      },
      debug: {
        pushAddTrace: vi.fn()
      }
    };

    global.HEYS = heys;
    window.HEYS = heys;
    global.React = window.React = {
      memo: (component) => component,
      useCallback: (fn) => fn,
      createElement: (type, props, ...children) => ({ type, props: props || {}, children })
    };

    if (typeof window.dispatchEvent !== 'function') {
      window.dispatchEvent = () => true;
    }
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

    loadModule();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.HEYS = originalHEYS;
    window.HEYS = originalWindowHEYS;
    global.React = originalReact;
    window.React = originalWindowReact;
    global.requestAnimationFrame = originalRequestAnimationFrame;
    window.requestAnimationFrame = originalWindowRequestAnimationFrame;
    window.dispatchEvent = originalWindowDispatchEvent;
  });

  it('adds all preset products with one state update and one forced flush', () => {
    const setDay = vi.fn((updater) => {
      currentDay = updater(currentDay);
      return currentDay;
    });

    const button = window.HEYS.dayComponents.MealAddProduct({
      mi: 0,
      products: [],
      date: '2026-06-17',
      day: currentDay,
      setDay,
      isCurrentMeal: true
    });

    button.props.onClick();

    const modalOptions = window.HEYS.AddProductStep.show.mock.calls[0][0];
    expect(typeof modalOptions.onAddMany).toBe('function');

    const products = [
      makeProduct('p1', 'Greek yogurt'),
      makeProduct('p2', 'Cottage cheese'),
      makeProduct('p3', 'Strawberry'),
      makeProduct('p4', 'Savoiardi')
    ];

    modalOptions.onAddMany({
      mealIndex: 0,
      entries: products.map((product) => ({ product, grams: product.grams })),
      _origin: 'preset-apply-bulk',
      _presetName: 'Dessert preset'
    });

    expect(setDay).toHaveBeenCalledTimes(1);
    expect(currentDay.meals[0].items).toHaveLength(5);
    expect(currentDay.meals[0].items.slice(1).map((item) => item.name)).toEqual([
      'Greek yogurt',
      'Cottage cheese',
      'Strawberry',
      'Savoiardi'
    ]);
    expect(currentDay.updatedAt).toBe(1781692227000);
    expect(window.HEYS.Day.setBlockCloudUpdates).toHaveBeenCalledTimes(1);
    expect(window.HEYS.Day.setBlockCloudUpdates).toHaveBeenCalledWith(1781692230000);
    expect(window.HEYS.Day.setLastLoadedUpdatedAt).toHaveBeenCalledWith(1781692227000);
    expect(window.HEYS.Day.markPendingMutation).toHaveBeenCalledWith('2026-06-17');
    expect(dispatchEventSpy).toHaveBeenCalledTimes(2);
    expect(dispatchEventSpy.mock.calls[0][0].detail.count).toBe(4);
    expect(dispatchEventSpy.mock.calls[0][0].detail.source).toBe('day-add-products-bulk');
    expect(dispatchEventSpy.mock.calls[0][0].detail.products).toHaveLength(4);
    expect(dispatchEventSpy.mock.calls[1][0]).toEqual(expect.objectContaining({
      type: 'heys:meal-flow-finished',
      detail: expect.objectContaining({
        source: 'day-add-products-bulk',
        dateKey: '2026-06-17',
        mealIndex: 0,
        count: 4,
      }),
    }));

    vi.runAllTimers();

    expect(window.HEYS.Day.requestFlush).toHaveBeenCalledTimes(1);
    expect(window.HEYS.Day.requestFlush).toHaveBeenCalledWith({ force: true });
  });

  it('adds a product by stable meal id when duplicate meal names reorder', () => {
    currentDay = {
      date: '2026-06-17',
      meals: [
        { id: 'meal-early', name: 'Обед', time: '12:45', items: [] },
        { id: 'meal-late', name: 'Обед', time: '18:45', items: [] }
      ],
      updatedAt: 1781692220000
    };
    window.HEYS.Day.getDay.mockImplementation(() => currentDay);

    const setDay = vi.fn((updater) => {
      currentDay = updater(currentDay);
      return currentDay;
    });

    const button = window.HEYS.dayComponents.MealAddProduct({
      mi: 1,
      products: [],
      date: '2026-06-17',
      day: currentDay,
      setDay,
      isCurrentMeal: true
    });

    button.props.onClick();

    const modalOptions = window.HEYS.AddProductStep.show.mock.calls[0][0];
    expect(modalOptions.mealIndex).toBe(1);
    expect(modalOptions.mealId).toBe('meal-late');

    currentDay = {
      ...currentDay,
      meals: [currentDay.meals[1], currentDay.meals[0]]
    };

    modalOptions.onAdd({
      mealIndex: 1,
      mealId: 'meal-late',
      product: makeProduct('p-late', 'Chicken fillet'),
      grams: 100
    });

    expect(setDay).toHaveBeenCalledTimes(1);
    expect(currentDay.meals[0].id).toBe('meal-late');
    expect(currentDay.meals[0].items.map((item) => item.name)).toEqual(['Chicken fillet']);
    expect(currentDay.meals[1].id).toBe('meal-early');
    expect(currentDay.meals[1].items).toHaveLength(0);
  });

  it('dispatches meal-flow-finished after a single product add', () => {
    const setDay = vi.fn((updater) => {
      currentDay = updater(currentDay);
      return currentDay;
    });

    const button = window.HEYS.dayComponents.MealAddProduct({
      mi: 0,
      products: [],
      date: '2026-06-17',
      day: currentDay,
      setDay,
      isCurrentMeal: true,
      multiProductMode: false
    });

    button.props.onClick();

    const modalOptions = window.HEYS.AddProductStep.show.mock.calls[0][0];
    modalOptions.onAdd({
      mealIndex: 0,
      mealId: 'meal-1',
      product: makeProduct('p-single', 'Chicken fillet'),
      grams: 120
    });

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'heysProductAdded',
    }));

    vi.advanceTimersByTime(160);

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'heys:meal-flow-finished',
      detail: expect.objectContaining({
        source: 'day-add-product-single',
        dateKey: '2026-06-17',
        mealIndex: 0,
        mealId: 'meal-1',
      }),
    }));
  });

  it('wires the ready-sets overlay to onAddMany as the primary apply path', () => {
    const source = readAddProductStepSource();

    expect(source).toContain('onAddMany,');
    expect(source).toContain('onAddMany, // Callback для атомарного добавления готового набора');
    expect(source).toContain("if (typeof context?.onAddMany === 'function')");
    expect(source).toContain("pushAddTrace('🧩 Preset bulk -> onAddMany'");
    expect(source).toContain('context.onAddMany({');
    expect(source).toContain("console.warn('[HEYS.presets] ⚠️ onAddMany missing, falling back to sequential onAdd')");
    expect(source).toContain('dispatchMealFlowFinishedFromContext');
    expect(source).toContain("'add-product-step-autorepeat-complete'");
    expect(source).toContain("'add-product-step-preset-complete'");
  });

  it('keeps public addProductToMeal return value tied to the mutation result', () => {
    const source = readDayEffectsSource();

    expect(source).toContain('const didAdd = addProductToMeal(mi, productWithGrams);');
    expect(source).toContain('return didAdd !== false;');
  });

  it('exports the day-level batch add API for recommendation bulk flows', () => {
    const mealsSource = readDayMealsSource();
    const effectsSource = readDayEffectsSource();
    const tabSource = readDayTabImplSource();

    expect(mealsSource).toContain('const addProductsToMeal = React.useCallback');
    expect(mealsSource).toContain('addProductsToMealRef.current = addProductsToMeal;');
    expect(mealsSource).toContain('onAddMany: ({ entries, mealIndex: addMealIndex = targetMealIndex');
    expect(mealsSource).toContain("source: options?.source || 'day-add-products-to-meal'");
    expect(mealsSource).toContain("source: 'day-inline-add-product-single'");
    expect(mealsSource).toContain('dispatchMealFlowFinished({');
    expect(mealsSource).toContain('productIds: items.map((item) => item.product_id)');
    expect(tabSource).toContain('addProductsToMeal,');
    expect(effectsSource).toContain('HEYS.Day.addProductsToMeal = (mi, entries, options) =>');
    expect(effectsSource).toContain('const didAdd = addProductsToMeal(mi, entries, options || {});');
  });

  it('uses one batch add call for selected meal recommendations', () => {
    const source = readMealRecCardSource();

    expect(source).toContain('const showBulkMealPicker = (selectedProducts, onMealSelected) =>');
    expect(source).toContain('const success = HEYS.Day.addProductsToMeal(mealIndex, entries, {');
    expect(source).toContain("source: 'meal-rec-selected-products'");
    expect(source).not.toContain('selectedProducts.forEach((product, idx) =>');
    expect(source).not.toContain('}, idx * 100)');
  });

  it('protects check-in and morning activation fields from stale meal writes', () => {
    const mealsSource = readDayMealsSource();
    const utilsSource = readDayUtilsSource();

    expect(utilsSource).toContain("'morningActivation'");
    expect(utilsSource).toContain('mergeSubjectiveFieldsPreferFresh');
    expect(mealsSource).toContain('const protectCheckinFields = React.useCallback');
    expect(mealsSource).toContain('const safeDayData = protectCheckinFields(nextDayData);');
    expect(mealsSource).toContain('lsSet(key, safeDayData);');
    expect(mealsSource).toContain('baseDay = protectCheckinFields(baseDay);');
  });

  it('keeps the monthly reports legend in normal layout flow on mobile', () => {
    const cssSource = readComponentsCssSource();

    expect(cssSource).toContain('.monthly-reports-legend--header');
    expect(cssSource).toContain('position: static;');
    expect(cssSource).toContain('@media (max-width: 640px)');
    expect(cssSource).toContain('flex-direction: column;');
  });
});
