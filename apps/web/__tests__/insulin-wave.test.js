import fs from 'fs';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const originalWindow = globalThis.window;
const originalHEYS = globalThis.HEYS;
const originalReact = globalThis.React;
const testReact = {
  Fragment: Symbol('Fragment'),
  useState: (initial) => [initial, () => undefined],
  useEffect: () => undefined,
  useMemo: (factory) => factory(),
  createElement(type, props, ...children) {
    if (typeof type === 'function') return type({ ...(props || {}), children });
    return { type, props: { ...(props || {}), children } };
  },
};
const read = (name) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
const load = (name) => {
  // eslint-disable-next-line no-eval
  eval(read(name));
};

const productionOrder = [
  'heys_models_v1.js',
  'heys_iw_shim.js',
  'heys_iw_patterns.js',
  'heys_iw_constants.js',
  'heys_iw_utils.js',
  'heys_iw_lipolysis.js',
  'heys_iw_response_model.js',
  'heys_iw_calc.js',
  'heys_iw_graph.js',
  'heys_iw_ndte.js',
  'heys_iw_ui.js',
  'heys_insulin_wave_v1.js',
  'heys_day_insulin_wave_ui_v1.js',
  'heys_day_insulin_wave_data_v1.js',
];

const resolveItem = (item) => item.product || item;
const makeMeal = (time, product, grams = 100, id = time) => ({ id, time, items: [{ grams, product }] });

beforeAll(() => {
  globalThis.window = globalThis;
  globalThis.React = testReact;
  globalThis.HEYS = { utils: { lsGet: () => null, lsSet: () => undefined } };
  for (const file of productionOrder) load(file);
});

afterAll(() => {
  globalThis.window = originalWindow;
  globalThis.React = originalReact;
  globalThis.HEYS = originalHEYS;
});

const collectText = (node) => {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  const children = node?.props?.children || [];
  return (Array.isArray(children) ? children : [children]).map(collectText).join(' ');
};

describe('Postprandial response model v5', () => {
  const fullProduct = {
    name: 'Крупа', carbs100: 40, protein100: 10, fat100: 5, fiber100: 6,
    simple100: 2, complex100: 38, gi: 50, foodForm: 'whole',
  };

  it('keeps real GL unchanged when Insulin Index changes', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const lowIi = model.analyzeMeal({ meal: makeMeal('12:00', { ...fullProduct, insulinIndex: 20 }), getProductFromItem: resolveItem });
    const highIi = model.analyzeMeal({ meal: makeMeal('12:00', { ...fullProduct, insulinIndex: 120 }), getProductFromItem: resolveItem });
    expect(lowIi.glycemicLoad).toBe(20);
    expect(highIi.glycemicLoad).toBe(20);
    expect(highIi.insulinDemandProxy.score).toBeGreaterThan(lowIi.insulinDemandProxy.score);
  });

  it('represents low-carb protein response as a separate proxy', () => {
    const estimate = globalThis.HEYS.InsulinWave.ResponseModel.estimate({
      meal: makeMeal('12:00', { name: 'Протеин', carbs100: 1, protein100: 80, fat100: 2, fiber100: 0, gi: 20, foodForm: 'liquid' }),
      getProductFromItem: resolveItem,
    });
    expect(estimate.responseLoad.estimatedGlycemicLoad.central).toBeLessThan(1);
    expect(estimate.responseLoad.insulinDemandProxy.score).toBeGreaterThan(0);
    expect(estimate.responseLoad.insulinDemandProxy.reliability).toBe('category-heuristic');
  });

  it('uses liquid form for shape without applying it twice to duration', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const base = { ...fullProduct, simple100: 30, complex100: 10 };
    const liquid = model.estimate({ meal: makeMeal('12:00', { ...base, foodForm: 'liquid' }), getProductFromItem: resolveItem });
    const solid = model.estimate({ meal: makeMeal('12:00', { ...base, foodForm: 'whole' }), getProductFromItem: resolveItem });
    expect(liquid.responseShape.type).toBe('fast');
    expect(Math.abs(liquid.estimatedWindow.centralMinutes - solid.estimatedWindow.centralMinutes)).toBeLessThanOrEqual(15);
  });

  it('uses inferred food form for shape but not for data completeness', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const inferred = model.estimate({
      meal: makeMeal('12:00', { ...fullProduct, name: 'Кефир', foodForm: undefined }),
      getProductFromItem: resolveItem,
    });
    const explicit = model.estimate({
      meal: makeMeal('12:00', { ...fullProduct, name: 'Кефир', foodForm: 'liquid' }),
      getProductFromItem: resolveItem,
    });

    expect(inferred.responseShape.type).toBe('fast');
    expect(inferred.confidence.dataQuality.formCoverage).toBe(0);
    expect(inferred.confidence.dataQuality.missingFields).toContain('foodForm');
    expect(inferred.confidence.dataQuality.assumptions).toContain('Форма части продуктов определена по названию; это предположение модели.');
    expect(inferred.responseShape.drivers).toContain('жидкая форма — предположение');
    expect(inferred.nutrients.decisionRatios).toMatchObject({
      nutrientLiquidRatioRaw: 1,
      knownLiquidNutrientRatioRaw: 0,
      inferredLiquidNutrientRatioRaw: 1,
    });
    expect(explicit.responseShape.drivers).toContain('жидкая форма');
    expect(explicit.responseShape.drivers).not.toContain('жидкая форма — предположение');
    expect(inferred.confidence.level).toBe('medium');
    expect(inferred.confidence.score).toBeLessThan(explicit.confidence.score);
  });

  it('does not let a zero-macro drink make a mixed meal liquid-shaped', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const meal = {
      id: 'coffee-meal',
      time: '12:00',
      items: [
        { grams: 300, product: { name: 'Американо', carbs100: 0, protein100: 0, fat100: 0, fiber100: 0, foodForm: 'liquid' } },
        { grams: 100, product: fullProduct },
      ],
    };
    const result = model.estimate({ meal, getProductFromItem: resolveItem });

    expect(result.nutrients.liquidRatio).toBeGreaterThanOrEqual(0.5);
    expect(result.nutrients.nutrientLiquidRatio).toBe(0);
    expect(result.nutrients.decisionRatios.nutrientLiquidRatioRaw).toBe(0);
    expect(result.responseShape.type).toBe('mixed');
    const withoutCoffee = model.estimate({ meal: makeMeal('12:00', fullProduct), getProductFromItem: resolveItem });
    expect(result.estimatedWindow.centralMinutes).toBe(withoutCoffee.estimatedWindow.centralMinutes);
    expect(result.trace.find((entry) => entry.code === 'RESPONSE_SHAPE')).toMatchObject({
      nutrientLiquidRatio: 0,
      nutrientLiquidRatioRaw: 0,
    });
  });

  it('uses unrounded nutrient liquid ratios at the 0.5 shape threshold', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const makeRatioMeal = (liquidCarbs, solidCarbs) => ({
      id: `liquid-ratio-${liquidCarbs}`,
      time: '12:00',
      items: [
        { grams: 100, product: {
          name: 'Liquid fixture', carbs100: liquidCarbs, protein100: 0, fat100: 0,
          fiber100: 0, simple100: 0, complex100: liquidCarbs, gi: 50, foodForm: 'liquid',
        } },
        { grams: 100, product: {
          name: 'Solid fixture', carbs100: solidCarbs, protein100: 0, fat100: 0,
          fiber100: 0, simple100: 0, complex100: solidCarbs, gi: 50, foodForm: 'whole',
        } },
      ],
    });
    const below = model.estimate({ meal: makeRatioMeal(49, 51), getProductFromItem: resolveItem });
    const boundary = model.estimate({ meal: makeRatioMeal(50, 50), getProductFromItem: resolveItem });

    expect(below.nutrients.decisionRatios.nutrientLiquidRatioRaw).toBeCloseTo(0.49, 8);
    expect(below.nutrients.nutrientLiquidRatio).toBe(0.5);
    expect(below.responseShape.type).toBe('mixed');
    expect(below.responseShape.drivers).not.toContain('жидкая форма');
    expect(boundary.nutrients.decisionRatios.nutrientLiquidRatioRaw).toBe(0.5);
    expect(boundary.responseShape.type).toBe('fast');
    expect(boundary.responseShape.drivers).toContain('жидкая форма');
  });

  it('uses unrounded processed ratios at the 0.5 shape threshold', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const makeProcessedMeal = (processedGrams, wholeGrams) => ({
      id: `processed-ratio-${processedGrams}`,
      time: '12:00',
      items: [
        { grams: processedGrams, product: {
          name: 'Processed fixture', carbs100: 20, protein100: 0, fat100: 0,
          fiber100: 0, simple100: 0, complex100: 20, gi: 50, foodForm: 'processed',
        } },
        { grams: wholeGrams, product: {
          name: 'Whole fixture', carbs100: 20, protein100: 0, fat100: 0,
          fiber100: 0, simple100: 0, complex100: 20, gi: 50, foodForm: 'whole',
        } },
      ],
    });
    const below = model.estimate({ meal: makeProcessedMeal(49, 51), getProductFromItem: resolveItem });
    const boundary = model.estimate({ meal: makeProcessedMeal(50, 50), getProductFromItem: resolveItem });

    expect(below.nutrients.decisionRatios.processedRatioRaw).toBeCloseTo(0.49, 8);
    expect(below.nutrients.processedRatio).toBe(0.5);
    expect(below.responseShape.type).toBe('mixed');
    expect(below.responseShape.drivers).not.toContain('обработанная форма');
    expect(boundary.nutrients.decisionRatios.processedRatioRaw).toBe(0.5);
    expect(boundary.responseShape.type).toBe('fast');
    expect(boundary.responseShape.drivers).toContain('обработанная форма');
  });

  it.each([
    ['water', 'Вода'],
    ['black coffee', 'Чёрный кофе'],
    ['tea', 'Чай'],
  ])('does not let zero-macro %s dilute the processed shape ratio', (_label, name) => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const processedProduct = {
      name: 'Processed fixture', carbs100: 20, protein100: 0, fat100: 0,
      fiber100: 0, simple100: 0, complex100: 20, gi: 50, foodForm: 'processed',
    };
    const base = model.estimate({
      meal: makeMeal('12:00', processedProduct),
      getProductFromItem: resolveItem,
    });
    const withDrink = model.estimate({
      meal: {
        id: `processed-with-${_label}`,
        time: '12:00',
        items: [
          { grams: 100, product: processedProduct },
          { grams: 1000, product: {
            name, carbs100: 0, protein100: 0, fat100: 0,
            fiber100: 0, simple100: 0, complex100: 0, gi: 0, foodForm: 'liquid',
          } },
        ],
      },
      getProductFromItem: resolveItem,
    });

    expect(withDrink.nutrients.decisionRatios.processedRatioRaw)
      .toBe(base.nutrients.decisionRatios.processedRatioRaw);
    expect(withDrink.nutrients.processedRatio).toBe(0.1);
    expect(withDrink.responseShape.drivers).toEqual(base.responseShape.drivers);
    expect(withDrink.responseShape.type).toBe(base.responseShape.type);
    expect(withDrink.estimatedWindow).toEqual(base.estimatedWindow);
  });

  it('keeps nutrient-bearing drinks in canonical shape decisions', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const result = model.estimate({
      meal: {
        id: 'processed-with-caloric-drink',
        time: '12:00',
        items: [
          { grams: 100, product: {
            name: 'Processed fixture', carbs100: 20, protein100: 0, fat100: 0,
            fiber100: 0, simple100: 0, complex100: 20, gi: 50, foodForm: 'processed',
          } },
          { grams: 150, product: {
            name: 'Caloric drink', carbs100: 20, protein100: 0, fat100: 0,
            fiber100: 0, simple100: 0, complex100: 20, gi: 50, foodForm: 'liquid',
          } },
        ],
      },
      getProductFromItem: resolveItem,
    });

    expect(result.nutrients.decisionRatios.processedRatioRaw).toBeCloseTo(0.4, 8);
    expect(result.responseShape.drivers).not.toContain('обработанная форма');
    expect(result.responseShape.drivers).toContain('жидкая форма');
  });

  it('uses unrounded simple-carb ratios at the 0.6 shape threshold', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const makeSimpleMeal = (simpleCarbs) => makeMeal('12:00', {
      name: `Simple ratio ${simpleCarbs}`,
      carbs100: 100, protein100: 0, fat100: 0, fiber100: 0,
      simple100: simpleCarbs, complex100: 100 - simpleCarbs, gi: 50, foodForm: 'whole',
    });
    const below = model.estimate({ meal: makeSimpleMeal(59), getProductFromItem: resolveItem });
    const boundary = model.estimate({ meal: makeSimpleMeal(60), getProductFromItem: resolveItem });

    expect(below.nutrients.decisionRatios.simpleRatioRaw).toBeCloseTo(0.59, 8);
    expect(below.nutrients.simpleRatio).toBe(0.6);
    expect(below.responseShape.type).toBe('mixed');
    expect(below.responseShape.drivers).not.toContain('высокая доля простых углеводов');
    expect(boundary.nutrients.decisionRatios.simpleRatioRaw).toBe(0.6);
    expect(boundary.responseShape.type).toBe('fast');
    expect(boundary.responseShape.drivers).toContain('высокая доля простых углеводов');
  });

  it('keeps nutrient-bearing liquids relevant to response shape', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const result = model.estimate({
      meal: makeMeal('12:00', { ...fullProduct, simple100: 30, complex100: 10, foodForm: 'liquid' }),
      getProductFromItem: resolveItem,
    });

    expect(result.nutrients.nutrientLiquidRatio).toBe(1);
    expect(result.nutrients.decisionRatios).toMatchObject({
      nutrientLiquidRatioRaw: 1,
      knownLiquidNutrientRatioRaw: 1,
      inferredLiquidNutrientRatioRaw: 0,
    });
    expect(result.responseShape.type).toBe('fast');
    expect(result.responseShape.drivers).toContain('жидкая форма');
  });

  it('does not reduce a fatty mixed meal to GL-only duration', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const lean = model.estimate({ meal: makeMeal('12:00', { ...fullProduct, fat100: 3 }), getProductFromItem: resolveItem });
    const fatty = model.estimate({ meal: makeMeal('12:00', { ...fullProduct, fat100: 35 }), getProductFromItem: resolveItem });
    expect(fatty.responseLoad.estimatedGlycemicLoad.central).toBe(lean.responseLoad.estimatedGlycemicLoad.central);
    expect(fatty.responseShape.type).toBe('prolonged');
    expect(fatty.estimatedWindow.centralMinutes).toBeGreaterThan(lean.estimatedWindow.centralMinutes);
  });

  it('lowers confidence and widens the range when GI is missing', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const known = model.estimate({ meal: makeMeal('12:00', fullProduct), getProductFromItem: resolveItem });
    const missing = model.estimate({ meal: makeMeal('12:00', { ...fullProduct, gi: undefined }), getProductFromItem: resolveItem });
    expect(missing.responseLoad.glycemicLoad).toBeNull();
    expect(missing.confidence.score).toBeLessThan(known.confidence.score);
    expect(missing.confidence.dataQuality.missingFields).toContain('GI');
    expect(missing.estimatedWindow.upperMinutes - missing.estimatedWindow.lowerMinutes)
      .toBeGreaterThan(known.estimatedWindow.upperMinutes - known.estimatedWindow.lowerMinutes);
  });

  it('keeps golden fixtures finite and inside explicit bounds', () => {
    const fixtures = [
      ['fast-carbs', { ...fullProduct, simple100: 38, complex100: 2, gi: 85, foodForm: 'liquid' }],
      ['whole-low-gl', { ...fullProduct, carbs100: 12, simple100: 1, complex100: 11, gi: 30, foodForm: 'whole' }],
      ['protein-zero-carb', { name: 'Яйца', carbs100: 0, protein100: 25, fat100: 18, fiber100: 0, foodForm: 'whole' }],
      ['dairy-drink', { name: 'Кефир', carbs100: 5, protein100: 3, fat100: 2, fiber100: 0, gi: 35, foodForm: 'liquid' }],
      ['fatty-mixed', { ...fullProduct, fat100: 40 }],
      ['incomplete-snapshot', { name: 'Неизвестное блюдо', carbs100: 30 }],
    ];
    for (const [name, product] of fixtures) {
      const result = globalThis.HEYS.InsulinWave.ResponseModel.estimate({ meal: makeMeal('23:30', product), getProductFromItem: resolveItem });
      expect(Number.isFinite(result.estimatedWindow.centralMinutes), name).toBe(true);
      expect(result.estimatedWindow.centralMinutes, name).toBeGreaterThanOrEqual(45);
      expect(result.estimatedWindow.centralMinutes, name).toBeLessThanOrEqual(360);
      expect(result.estimatedWindow.lowerMinutes, name).toBeLessThanOrEqual(result.estimatedWindow.centralMinutes);
      expect(result.estimatedWindow.upperMinutes, name).toBeGreaterThanOrEqual(result.estimatedWindow.centralMinutes);
    }
  });

  it('uses the exact latest history response as the current response', () => {
    const result = globalThis.HEYS.InsulinWave.calculate({
      meals: [makeMeal('08:00', fullProduct), makeMeal('13:00', { ...fullProduct, gi: 60 })],
      getProductFromItem: resolveItem,
      nowMinutes: 14 * 60,
    });
    expect(result.currentResponse).toBe(result.waveHistory.at(-1));
    expect(result.responseLoad).toBe(result.waveHistory.at(-1).responseLoad);
    expect(result.duration).toBe(result.waveHistory.at(-1).duration);
  });

  it('uses the upper estimate bound for the UI countdown and completion state', () => {
    const params = { meals: [makeMeal('12:00', fullProduct)], getProductFromItem: resolveItem };
    const initial = globalThis.HEYS.InsulinWave.calculate({ ...params, nowMinutes: 12 * 60 });
    const centralEnd = initial.currentResponse.endMin;
    const latestEnd = initial.currentResponse.latestEndMin;
    const insideRange = globalThis.HEYS.InsulinWave.calculate({ ...params, nowMinutes: centralEnd + 1 });
    const atRangeEnd = globalThis.HEYS.InsulinWave.calculate({ ...params, nowMinutes: latestEnd });
    const afterRange = globalThis.HEYS.InsulinWave.calculate({ ...params, nowMinutes: latestEnd + 37 });

    expect(insideRange.status).toBe('complete');
    expect(insideRange.rangeStatus).toBe('settling');
    expect(insideRange.rangeRemaining).toBe(latestEnd - centralEnd - 1);
    expect(insideRange.centralProgress).toBe(100);
    expect(insideRange.rangeProgress).toBeLessThan(100);
    expect(insideRange.progress).toBe(insideRange.centralProgress);
    expect(insideRange.minutesAfterWindow).toBe(0);
    expect(atRangeEnd.rangeStatus).toBe('complete');
    expect(atRangeEnd.rangeProgress).toBe(100);
    expect(atRangeEnd.minutesAfterWindow).toBe(0);
    expect(afterRange.rangeStatus).toBe('complete');
    expect(afterRange.rangeRemaining).toBe(0);
    expect(afterRange.minutesAfterWindow).toBe(37);
  });

  it('applies uncertainty before capping a duration at the model maximum', () => {
    const product = {
      name: 'Capped fixture', carbs100: 66.9, protein100: 31.8, fat100: 63.3,
      fiber100: 5.3, simple100: 0, complex100: 66.9, gi: 100,
    };
    const result = globalThis.HEYS.InsulinWave.ResponseModel.estimate({
      meal: makeMeal('21:05', product),
      getProductFromItem: resolveItem,
    });
    const calculation = result.estimatedWindow.calculation;

    expect(calculation.preClampMinutes).toBeCloseTo(396.6, 1);
    expect(calculation.rawCentralMinutes).toBeCloseTo(396.6, 1);
    expect(calculation.rawLowerMinutes).toBeCloseTo(301.4, 1);
    expect(calculation.centralMinutes).toBe(360);
    expect(calculation.lowerMinutes).toBe(301);
    expect(calculation.upperMinutes).toBe(360);
    expect(calculation.centralWasCapped).toBe(true);
    expect(calculation.upperWasCapped).toBe(true);
  });

  it('places the qualitative profile peak near peakTimingEstimateMin on the upper-bound timeline', () => {
    const result = globalThis.HEYS.InsulinWave.ResponseModel.estimate({
      meal: makeMeal('12:00', { ...fullProduct, fat100: 63.3, foodForm: 'whole' }),
      getProductFromItem: resolveItem,
    });
    const peakPoint = result.responseProfile.reduce((best, point) => point.value > best.value ? point : best);
    const peakMinute = peakPoint.t * result.estimatedWindow.upperMinutes;

    expect(result.responseShape.type).toBe('prolonged');
    expect(peakMinute).toBeCloseTo(result.responseShape.peakTimingEstimateMin, -1);
  });

  it('exposes one diagnostic duration calculation for the card and every meal', () => {
    const result = globalThis.HEYS.InsulinWave.calculate({
      meals: [makeMeal('12:00', fullProduct, 100, 'meal-a')],
      getProductFromItem: resolveItem,
      nowMinutes: 13 * 60,
    });
    const calculation = result.estimatedWindow.calculation;
    const contributionTotal = calculation.contributions.reduce((sum, item) => sum + item.minutes, 0);

    expect(calculation.formulaVersion).toBe('duration-v5');
    expect(contributionTotal).toBeCloseTo(calculation.preClampMinutes, 1);
    expect(calculation.centralMinutes).toBe(result.estimatedWindow.centralMinutes);
    expect(calculation.upperMinutes).toBe(result.currentResponse.latestEndMin - result.currentResponse.startMin);
    expect(calculation.timerBoundary).toBe('upper');
    expect(result.currentResponse.estimatedWindow.calculation).toEqual(calculation);
  });

  it('is deterministic on the first and repeated load', () => {
    const params = { meals: [makeMeal('12:00', fullProduct)], getProductFromItem: resolveItem, nowMinutes: 13 * 60 };
    expect(globalThis.HEYS.InsulinWave.calculate(params)).toEqual(globalThis.HEYS.InsulinWave.calculate(params));
    expect(globalThis.HEYS.InsulinWave.ResponseModel.CONFIG.source).toBe('embedded-response-model-v5');
  });

  it('uses the canonical previous end for overlap composition', () => {
    const result = globalThis.HEYS.InsulinWave.calculate({
      meals: [makeMeal('12:00', fullProduct, 100, 'a'), makeMeal('13:00', fullProduct, 100, 'b')],
      getProductFromItem: resolveItem,
      nowMinutes: 14 * 60,
    });
    expect(result.overlaps[0].overlapMinutes).toBe(result.waveHistory[0].endMin - result.waveHistory[1].startMin);
    expect(result.overlaps[0].composition.durationAdjusted).toBe(false);
  });

  it('does not apply a negative second-meal duration bonus', () => {
    const meal = makeMeal('13:00', fullProduct, 100, 'b');
    const alone = globalThis.HEYS.InsulinWave.calculate({ meals: [meal], getProductFromItem: resolveItem, nowMinutes: 14 * 60 });
    const close = globalThis.HEYS.InsulinWave.calculate({
      meals: [makeMeal('12:30', fullProduct, 100, 'a'), meal], getProductFromItem: resolveItem, nowMinutes: 14 * 60,
    });
    expect(close.waveHistory.at(-1).duration).toBe(alone.duration);
    expect(close.trace.some((entry) => entry.minutes === -15)).toBe(false);
  });

  it('supports late meals and explicit 24:xx times', () => {
    const result = globalThis.HEYS.InsulinWave.calculate({
      meals: [makeMeal('23:30', fullProduct, 100, 'late'), makeMeal('24:30', fullProduct, 100, 'after-midnight')],
      getProductFromItem: resolveItem,
      nowMinutes: 25 * 60,
    });
    expect(result.currentResponse.id).toBe('after-midnight');
    expect(result.currentResponse.startMin).toBe(1470);
    expect(result.endTimeDisplay).toMatch(/^0[1-6]:/);
  });

  it('keeps a late meal active after midnight inside the HEYS day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 24, 0, 24));
    let result;
    try {
      const HEYSRef = {
        ...globalThis.HEYS,
        dayUtils: { todayISO: () => '2026-07-23' },
      };
      result = HEYSRef.dayInsulinWaveData.computeInsulinWaveData({
        React: testReact,
        day: { date: '2026-07-23', meals: [makeMeal('23:55', fullProduct)] },
        currentMinute: Math.floor(Date.now() / 60000),
        getProductFromItem: resolveItem,
        getProfile: () => ({}),
        HEYS: HEYSRef,
      });
    } finally {
      vi.useRealTimers();
    }

    expect(result.currentResponse.startMin).toBe(23 * 60 + 55);
    expect(result.rangeStatus).not.toBe('scheduled');
    expect(result.statusLabel).not.toBe('Приём ещё впереди');
  });

  it('applies activity only when it is close to the meal', () => {
    const model = globalThis.HEYS.InsulinWave.ResponseModel;
    const meal = makeMeal('14:00', fullProduct);
    const none = model.estimate({ meal, getProductFromItem: resolveItem, trainings: [] });
    const near = model.estimate({ meal, getProductFromItem: resolveItem, trainings: [{ time: '13:00', duration: 45 }] });
    const far = model.estimate({ meal, getProductFromItem: resolveItem, trainings: [{ time: '08:00', duration: 45 }] });
    expect(near.estimatedWindow.centralMinutes).toBeLessThan(none.estimatedWindow.centralMinutes);
    expect(far.estimatedWindow.centralMinutes).toBe(none.estimatedWindow.centralMinutes);
  });

  it('stays deterministic and finite for hundreds of generated meals', () => {
    let seed = 90210;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let index = 0; index < 500; index += 1) {
      const product = {
        name: `fixture-${index}`,
        carbs100: random() * 80,
        protein100: random() * 50,
        fat100: random() * 60,
        fiber100: random() * 20,
        simple100: random() * 20,
        gi: random() > 0.15 ? random() * 100 : undefined,
        foodForm: ['whole', 'processed', 'liquid'][index % 3],
      };
      const params = { meal: makeMeal('12:00', product, random() * 500), getProductFromItem: resolveItem };
      const first = globalThis.HEYS.InsulinWave.ResponseModel.estimate(params);
      const second = globalThis.HEYS.InsulinWave.ResponseModel.estimate(params);
      expect(first).toEqual(second);
      expect(Number.isFinite(first.estimatedWindow.centralMinutes)).toBe(true);
      expect(first.estimatedWindow.centralMinutes).toBeGreaterThanOrEqual(45);
      expect(first.estimatedWindow.centralMinutes).toBeLessThanOrEqual(360);
    }
  });

  it('uses plain meal-based labels and keeps unsafe physiological claims out of active UI and Insights', () => {
    const uiSource = [
      'heys_iw_ui.js',
      'heys_iw_graph.js',
      'heys_day_insulin_wave_ui_v1.js',
      'heys_meal_step_v1.js',
      'heys_insulin_wave_v1.js',
    ].map(read).join('\n');
    const insightSource = [
      'insights/pi_constants.js',
      'insights/pi_early_warning.js',
      'insights/patterns/timing.js',
      'insights/pi_ui_whatif.js',
      'insights/pi_ui_rings.js',
    ].map(read).join('\n');
    const activeSource = `${uiSource}\n${insightSource}`;

    expect(activeSource).not.toMatch(/Прерв[её]т липолиз|липолиз не успевал начаться|блокировк[аи] (?:липолиза|жиросжигания)|ид[её]т жиросжигание|Жиросжигание!|инсулин (?:не успевает упасть|вернулся к базовому уровню)/i);
    expect(uiSource).toContain('Окно для сжигания жира');
    expect(uiSource).toContain('До конца окна');
    expect(uiSource).not.toContain('Время с начала ориентировочного окна');
    expect(uiSource).toContain('countUp: true');
    expect(uiSource).not.toContain('Отклик после еды');
    expect(uiSource).not.toContain('ориентировочного отклика');
    expect(uiSource).toContain('не измерение липолиза');
    expect(uiSource).toContain('можно есть раньше');
    expect(insightSource).toContain('долгосрочному тренду');
    expect(insightSource).toContain('голоду, самочувствию, медицинским ограничениям');
  });

  it('shows practical guidance to clients and scopes curator guidance to curator sessions', () => {
    const render = globalThis.HEYS.InsulinWave.UI.renderExpandedSection;
    const data = {
      confidence: { level: 'high', score: 90, dataQuality: {} },
      responseLoad: {},
      responseShape: {},
      estimatedWindow: {},
      modelVersion: '5.0.1',
    };

    globalThis.HEYS.auth = { isCuratorSession: () => false };
    const clientText = collectText(render(data));
    expect(clientText).toContain('Как использовать');
    expect(clientText).toContain('таймер помогает выдержать паузу');
    expect(clientText).toContain('При голоде, слабости или по плану можно есть раньше');
    expect(clientText).not.toContain('Для разбора с клиентом');

    globalThis.HEYS.auth = { isCuratorSession: () => true };
    const curatorText = collectText(render(data));
    expect(curatorText).toContain('Для разбора с клиентом сначала оцените тренд веса и энергетического баланса');
    expect(curatorText).toContain('Расчёт окна используйте как вторичный контекст состава и времени приёма');
  });

  it('shows elapsed time after the estimated fat-burning window opens', () => {
    const card = globalThis.HEYS.dayInsulinWaveUI.renderInsulinWaveIndicator({
      React: testReact,
      insulinWaveData: {
        status: 'complete',
        rangeStatus: 'complete',
        minutesAfterWindow: 8 * 60,
        lastMealTimeDisplay: '11:50',
      },
      insulinExpanded: false,
      setInsulinExpanded: () => undefined,
      mobileSubTab: 'diary',
      isMobile: true,
      HEYS: globalThis.HEYS,
    });
    const cardText = collectText(card);

    expect(cardText).toContain('Окно для сжигания жира');
    expect(cardText).toContain('11:50');
    expect(cardText).not.toContain('Время с начала ориентировочного окна');
    expect(cardText).toContain('Окно открыто');
    expect(cardText).toContain('можно есть раньше');
    expect(cardText).toContain('08:00:00');
  });

  it('keeps the current-moment graph marker distinct and smoothly interpolated', () => {
    const graphSource = read('heys_iw_graph.js');
    const marker = globalThis.HEYS.InsulinWave.Graph.interpolateMarker([
      { x: 0, y: 10 },
      { x: 20, y: 30 },
    ], 0.25);

    expect(graphSource).toContain('iw-response-chart__current-marker');
    expect(graphSource).toContain('iwCurrentMarkerGlow');
    expect(graphSource).toContain('r: 9');
    expect(graphSource).toContain('data.rangeProgress ?? data.progress');
    expect(marker).toEqual({ x: 5, y: 15 });
    expect(marker.x).not.toBe(0);
    expect(marker.x).not.toBe(20);
  });

  it('uses range state in every active user-facing progress consumer', () => {
    const uiSource = read('heys_iw_ui.js');
    const mealStepSource = read('heys_meal_step_v1.js');

    expect(uiSource).toContain('data.rangeProgress ?? data.progress');
    expect(uiSource).toContain("(data.rangeStatus || data.status) === 'complete'");
    expect(mealStepSource).toContain("(wave.rangeStatus || wave.status) !== 'settling'");
    expect(mealStepSource).not.toContain("wave.status === 'lipolysis'");
  });

  it('uses canonical meal diagnostics instead of the retired multiplier popup', () => {
    const mealCardSource = read('day/_meals.js');
    expect(mealCardSource).toContain('InsulinWave.renderCalculationTrace?.(currentWave)');
    expect(mealCardSource).toContain('meal.id ? wave.id === meal.id');
    expect(mealCardSource).not.toContain('База × Множитель');
    expect(mealCardSource).not.toContain('currentWave.circadianMultiplier');
  });

  it('uses user-facing labels for inferred food form details', () => {
    const uiSource = read('heys_iw_ui.js');
    expect(uiSource).toContain("field === 'foodForm' ? 'форма продуктов'");
    expect(uiSource).not.toContain('Не хватает: ${missing.join');
  });

  it('fails loudly on missing required dependencies and input', () => {
    expect(() => globalThis.HEYS.InsulinWave.calculate({ meals: [makeMeal('12:00', fullProduct)] }))
      .toThrow(/getProductFromItem/);
    expect(() => globalThis.HEYS.InsulinWave.ResponseModel.estimate({ meal: { time: '12:00' }, getProductFromItem: resolveItem }))
      .toThrow(/meal\.items/);
  });
});
