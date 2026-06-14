// kernel-progression.test.js — progression primitives: plateau + axis policy.

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
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_progression_v1.js'), 'utf8'));
};

const P = () => globalThis.HEYS.TrainingKernel.progression;

describe('kernel progression', () => {
  beforeAll(setupOnce);

  it('relativePlateau mirrors fingers window/threshold semantics', () => {
    expect(P().relativePlateau({ series: [{ ts: 1, value: 10 }, { ts: 2, value: 11 }] }))
      .toMatchObject({ hasPlateau: false, sessionsCount: 2, deltaPct: null });
    expect(P().relativePlateau({
      series: [{ ts: 1, value: 50 }, { ts: 2, value: 50 }, { ts: 3, value: 50 }]
    })).toMatchObject({ hasPlateau: true, sessionsCount: 3, deltaPct: 0 });
    expect(P().relativePlateau({
      series: [{ ts: 1, value: 100 }, { ts: 2, value: 101 }, { ts: 3, value: 103 }],
      improvementThreshold: 0.05
    }).hasPlateau).toBe(true);
  });

  it('rangePlateau covers mobility ROM plateau semantics', () => {
    expect(P().rangePlateau([70, 71, 70.5], { windowSize: 3, rangeThreshold: 2 }).hasPlateau).toBe(true);
    expect(P().rangePlateau([70, 73, 70.5], { windowSize: 3, rangeThreshold: 2 }).hasPlateau).toBe(false);
    expect(P().rangePlateau([70], { windowSize: 3, rangeThreshold: 2 })).toMatchObject({ hasPlateau: false, reason: 'insufficient_data' });
  });

  it('nextAxis advances inside injected policy only', () => {
    expect(P().nextAxis(['volume', 'edge', 'load'], null)).toEqual({ nextAxis: 'volume', exhausted: false, policy: ['volume', 'edge', 'load'] });
    expect(P().nextAxis(['volume', 'edge', 'load'], 'edge')).toEqual({ nextAxis: 'load', exhausted: false, policy: ['volume', 'edge', 'load'] });
    expect(P().nextAxis(['volume', 'edge', 'load'], 'load')).toEqual({ nextAxis: null, exhausted: true, policy: ['volume', 'edge', 'load'] });
    expect(P().nextAxis(['amplitude', 'tempo'], 'unknown')).toEqual({ nextAxis: 'amplitude', exhausted: false, policy: ['amplitude', 'tempo'] });
  });
});
