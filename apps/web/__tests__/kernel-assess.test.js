// kernel-assess.test.js — общая математика оценки/лимитера (deficit/normalize).

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
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_assess_v1.js'), 'utf8'));
};

const A = () => globalThis.HEYS.TrainingKernel.assess;

describe('kernel assess', () => {
  beforeAll(setupOnce);

  it('deficit', () => {
    expect(A().deficit(100, 70)).toBeCloseTo(0.3, 10);
    expect(A().deficit(100, 150)).toBe(0); // clamp низ
    expect(A().deficit(100, -50)).toBe(1); // clamp верх
    expect(A().deficit(0, 5)).toBe(0); // нет бенчмарка
    expect(A().deficit(100, null)).toBe(0); // нет данных
  });

  it('clamp01', () => {
    expect(A().clamp01(2)).toBe(1);
    expect(A().clamp01(-1)).toBe(0);
    expect(A().clamp01('x')).toBe(0);
  });

  it('normalize → сумма 1', () => {
    expect(A().normalize({ a: 1, b: 3 })).toEqual({ a: 0.25, b: 0.75 });
    expect(A().normalize({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });

  it('argmaxKey', () => {
    expect(A().argmaxKey({ a: 0.2, b: 0.9, c: 0.5 })).toBe('b');
    expect(A().argmaxKey({})).toBe(null);
  });

  it('limiter builds leadingLimiter, normalized weights and stimulus', () => {
    const r = A().limiter([
      { id: 'strength', deficit: 0.2, prior: 1 },
      { id: 'technique', flag: 0.5, prior: 1.2 }
    ]);
    expect(r.leadingLimiter).toBe('technique');
    expect(r.limiterScores.technique).toBeCloseTo(0.6);
    expect(r.blockWeights.technique).toBeGreaterThan(r.blockWeights.strength);
    expect(r.stimulus.technique).toBe('develop');
    expect(r.stimulus.strength).toBe('maintain');
  });

  it('limiter supports uniform zero-total policy and domain blockWeights hook', () => {
    const zero = A().limiter([{ id: 'a' }, { id: 'b' }], { zeroTotalPolicy: 'uniform' });
    expect(zero.blockWeights).toEqual({ a: 0.5, b: 0.5 });

    const hooked = A().limiter([{ id: 'ankle', score: 0.4, row: { blocks: ['D', 'E'] } }], {
      blockWeights: (_items, leading) => Object.fromEntries(leading.payload.blocks.map((b, i) => [b, 1 - i * 0.25]))
    });
    expect(hooked.blockWeights).toEqual({ D: 1, E: 0.75 });
  });
});
