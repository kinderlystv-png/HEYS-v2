import fs from 'fs';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const originalWindow = globalThis.window;
const originalHEYS = globalThis.HEYS;
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
];

const resolveItem = (item) => item.product || item;
const makeMeal = (time, product, grams = 100, id = time) => ({ id, time, items: [{ grams, product }] });

beforeAll(() => {
  globalThis.window = globalThis;
  globalThis.HEYS = { utils: { lsGet: () => null, lsSet: () => undefined } };
  for (const file of productionOrder) load(file);
});

afterAll(() => {
  globalThis.window = originalWindow;
  globalThis.HEYS = originalHEYS;
});

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
    expect(inferred.confidence.level).toBe('medium');
    expect(inferred.confidence.score).toBeLessThan(explicit.confidence.score);
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

  it('keeps unsafe physiological claims out of active response UI sources', () => {
    const uiSource = [
      'heys_iw_ui.js',
      'heys_iw_graph.js',
      'heys_day_insulin_wave_ui_v1.js',
    ].map(read).join('\n');
    expect(uiSource).not.toMatch(/липолиз|жиросжиган|жир запасается|µU\/mL|мкЕд\/мл|не ешь подольше/i);
    expect(uiSource).toContain('Это эвристическая оценка');
    expect(uiSource).toContain('не запрещает есть');
  });

  it('fails loudly on missing required dependencies and input', () => {
    expect(() => globalThis.HEYS.InsulinWave.calculate({ meals: [makeMeal('12:00', fullProduct)] }))
      .toThrow(/getProductFromItem/);
    expect(() => globalThis.HEYS.InsulinWave.ResponseModel.estimate({ meal: { time: '12:00' }, getProductFromItem: resolveItem }))
      .toThrow(/meal\.items/);
  });
});
