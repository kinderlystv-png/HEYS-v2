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

beforeAll(() => {
  globalThis.window = globalThis;
  globalThis.HEYS = { utils: { lsGet: () => null } };
  [
    'heys_models_v1.js', 'heys_iw_shim.js', 'heys_iw_patterns.js', 'heys_iw_constants.js',
    'heys_iw_utils.js', 'heys_iw_lipolysis.js',
    'heys_iw_response_model.js', 'heys_iw_calc.js',
    'heys_iw_graph.js', 'heys_iw_ndte.js', 'heys_iw_ui.js', 'heys_insulin_wave_v1.js',
  ].forEach(load);
});

afterAll(() => {
  globalThis.window = originalWindow;
  globalThis.HEYS = originalHEYS;
});

describe('InsulinWave compatibility canary', () => {
  it('exposes the canonical API and thin legacy aliases', () => {
    const IW = globalThis.HEYS.InsulinWave;
    expect(IW.VERSION).toBe('5.0.1');
    expect(typeof IW.calculate).toBe('function');
    expect(typeof IW.estimatePostprandialResponse).toBe('function');
    expect(typeof IW.calculateMealNutrients).toBe('function');
    expect(typeof IW.useInsulinWave).toBe('function');
    expect(IW.ResponseModel.CONFIG.source).toBe('embedded-response-model-v5');
    expect(IW.calculateLipolysisKcal).toBeUndefined();
    expect(IW.estimateInsulinLevel).toBeUndefined();
  });

  it('accepts the real meals contract and never treats null as success', () => {
    const product = { name: 'Рис', carbs100: 50, protein100: 7, fat100: 1, fiber100: 2, gi: 60, foodForm: 'whole' };
    const result = globalThis.HEYS.InsulinWave.calculate({
      meals: [{ id: 'lunch', time: '12:00', items: [{ grams: 100, product }] }],
      getProductFromItem: (item) => item.product,
      nowMinutes: 13 * 60,
    });
    expect(result).not.toBeNull();
    expect(result.modelVersion).toBe('5.0.1');
    expect(result.estimateKind).toBe('heuristic');
    expect(result.estimatedWindow.rangeLabel).toMatch(/^\d{2}:\d{2}–\d{2}:\d{2}$/);
    expect(result.insulinWaveHours).toBe(result.duration / 60);
    expect(result.lipolysisMinutes).toBe(0);
    expect(result.legacy.aliasesOnly).toBe(true);
  });

  it('returns null only for an explicitly empty meal list', () => {
    expect(globalThis.HEYS.InsulinWave.calculate({ meals: [], getProductFromItem: () => null })).toBeNull();
  });
});
