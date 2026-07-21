import fs from 'fs';
import path from 'path';

import { beforeAll, describe, expect, it } from 'vitest';

const read = (name) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');

beforeAll(() => {
  globalThis.window = globalThis;
  globalThis.HEYS = { utils: { lsGet: () => null } };
  // eslint-disable-next-line no-eval
  eval(read('heys_models_v1.js'));
  // eslint-disable-next-line no-eval
  eval(read('heys_iw_shim.js'));
  // eslint-disable-next-line no-eval
  eval(read('heys_iw_constants.js'));
  // eslint-disable-next-line no-eval
  eval(read('heys_iw_utils.js'));
  // eslint-disable-next-line no-eval
  eval(read('heys_iw_response_model.js'));
  // eslint-disable-next-line no-eval
  eval(read('heys_iw_calc.js'));
  // eslint-disable-next-line no-eval
  eval(read('heys_insulin_wave_v1.js'));
  // eslint-disable-next-line no-eval
  eval(read('heys_day_insulin_wave_data_v1.js'));
  // eslint-disable-next-line no-eval
  eval(read('heys_day_stats_vm_v1.js'));
});

describe('meal item grams contract', () => {
  it('normalizes missing, string, and numeric values without replacing zero', () => {
    const normalize = globalThis.HEYS.models.normalizeItemGrams;

    expect(normalize(undefined)).toBe(100);
    expect(normalize(null)).toBe(100);
    expect(normalize('')).toBe(100);
    expect(normalize('  ')).toBe(100);
    expect(normalize(0)).toBe(0);
    expect(normalize('0')).toBe(0);
    expect(normalize(12.5)).toBe(12.5);
    expect(normalize('12.5')).toBe(12.5);
    expect(normalize('invalid')).toBe(100);
  });

  it('keeps persisted-item calculation readers on the shared normalizer', () => {
    const readerFiles = [
      'heys_iw_calc.js',
      'heys_iw_constants.js',
      'heys_day_stats_vm_v1.js',
      'insights/pi_analytics_api.js',
      'insights/pi_product_picker.js',
      'advice/_nutrition.js',
      'advice/_emotional.js',
      'advice/_other.js',
      'advice/_timing.js',
      'heys_supplements_science_v1.js',
      'heys_day_copy_meal_modal_v1.js',
      'day/_meals.js',
      'heys_storage_layer_v1.js',
    ];

    for (const file of readerFiles) {
      const readerSource = read(file);
      expect(readerSource, file).toContain('normalizeItemGrams');
      expect(readerSource, file).not.toMatch(/\b(?:item|it)\.grams\s*\|\|\s*100/);
    }
  });

  it('keeps zero-gram items out of hypoglycemia and food-form weighting', () => {
    const I = globalThis.HEYS.InsulinWave.__internals;
    const products = {
      high: { name: 'Сок', gi: 100, protein100: 0, fat100: 0 },
      low: { name: 'Орехи', gi: 20, protein100: 20, fat100: 40 },
    };
    const getProduct = (item) => products[item.id];
    const items = [{ id: 'high', grams: 0 }, { id: 'low', grams: '100' }];

    const risk = I.calculateHypoglycemiaRisk({ items }, null, getProduct);
    expect(risk.details.avgGI).toBe(20);
    expect(I.getFoodForm(items, getProduct).form).toBe('solid');
  });

  it('keeps zero-gram items out of the canonical insulin-wave nutrient path', () => {
    const products = {
      high: { name: 'Сок', gi: 100, simple100: 20, complex100: 0 },
      low: { name: 'Крупа', gi: 20, simple100: 0, complex100: 10 },
    };
    const nutrients = globalThis.HEYS.InsulinWave.Calc.calculateMealNutrients(
      { items: [{ id: 'high', grams: 0 }, { id: 'low', grams: '100' }] },
      null,
      (item) => products[item.id]
    );

    expect(nutrients.totalGrams).toBe(100);
    expect(nutrients.totalCarbs).toBe(10);
    expect(nutrients.avgGI).toBe(20);
  });

  it('keeps zero-gram items out of the Day insulin-wave fallback', () => {
    const React = {
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => undefined],
      useEffect: () => undefined,
      useMemo: (factory) => factory(),
    };
    const products = {
      high: { gi: 100, carbs100: 10, protein100: 0, fat100: 0, fiber100: 0, foodForm: 'whole' },
      low: { gi: 20, carbs100: 10, protein100: 0, fat100: 0, fiber100: 0, foodForm: 'whole' },
    };
    const result = globalThis.HEYS.dayInsulinWaveData.computeInsulinWaveData({
      React,
      day: {
        date: new Date().toISOString().slice(0, 10),
        meals: [{ time: '00:01', items: [{ id: 'high', grams: 0 }, { id: 'low', grams: '100' }] }],
      },
      getProductFromItem: (item) => products[item.id],
      getProfile: () => ({ insulinWaveHours: 3 }),
      HEYS: globalThis.HEYS,
    });

    expect(result.avgGI).toBe(20);
    expect(result.giCategory.text).toBe('Низкий GI');
  });

  it('keeps zero-gram items out of macro popup history', () => {
    const pIndex = {
      byId: new Map([['protein', { protein100: 25 }]]),
      byName: new Map(),
    };
    const vm = globalThis.HEYS.dayStatsVm.build({
      date: '2026-07-18',
      macroBadgePopup: { macro: 'Белки', value: 10, norm: 100, ratio: 0.1, color: '#000' },
      macroPopupDeps: {
        U: {
          lsGet: () => ({
            meals: [{ items: [{ product_id: 'protein', grams: 0 }] }],
          }),
        },
        pIndex,
      },
    });

    expect(vm.computed.macroPopupMeta.sparkData.slice(0, -1)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(vm.computed.macroPopupMeta.sparkData.at(-1)).toBe(10);
  });
});
