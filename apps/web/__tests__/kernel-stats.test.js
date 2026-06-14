// kernel-stats.test.js — общая робастная статистика ядра (median/MAD/z).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KERNEL_DIR = path.resolve(__dirname, '..', '_kernel');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_stats_v1.js'), 'utf8'));
};

const S = () => globalThis.HEYS.TrainingKernel.stats;

describe('kernel stats', () => {
  beforeAll(setupOnce);

  it('median', () => {
    expect(S().median([])).toBe(0);
    expect(S().median([5])).toBe(5);
    expect(S().median([3, 1, 2])).toBe(2);
    expect(S().median([1, 2, 3, 4])).toBe(2.5);
  });

  it('madSigma (floor + пусто)', () => {
    expect(S().madSigma([], 0.5)).toBe(1);
    expect(S().madSigma([10, 10, 10], 0.5)).toBe(0.5); // devs=0 → floor
    expect(S().madSigma([1, 2, 3, 4], 0.5)).toBeCloseTo(1.4826, 4);
  });

  it('robustZ', () => {
    expect(S().robustZ(10, 5, 2)).toBe(2.5);
    expect(S().robustZ(10, 5, 0)).toBe(null);
    expect(S().robustZ(NaN, 5, 2)).toBe(null);
  });

  it('zFromArray', () => {
    const z = S().zFromArray(6, [1, 2, 3, 4], 0.5);
    expect(typeof z).toBe('number');
  });
});
