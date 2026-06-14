// kernel-periodization.test.js — shared phase machine and load policy.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_dates_v1.js'), 'utf8'));
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_periodization_v1.js'), 'utf8'));
};

const P = () => globalThis.HEYS.TrainingKernel.periodization;

describe('TrainingKernel.periodization', () => {
  beforeAll(setupOnce);

  it('matches fingers phase models', () => {
    expect([0, 1, 2, 3].map((i) => P().phaseForModel('linear', i, 4)))
      .toEqual(['accumulation', 'accumulation', 'intensification', 'deload']);
    expect([0, 1, 2, 3].map((i) => P().phaseForModel('nonlinear', i, 4)))
      .toEqual(['accumulation', 'intensification', 'accumulation', 'deload']);
    expect([0, 1, 2].map((i) => P().phaseForModel('dup', i, 3)))
      .toEqual(['dup', 'dup', 'deload']);
  });

  it('builds weeks and current week with date-key deltas', () => {
    const weeks = P().buildWeeks({ model: 'linear', weeks: 4, focusQuality: 'finger_strength' });
    expect(weeks.map((w) => w.energyFocus)).toEqual(['aerobic', 'aerobic', 'phosphagen', 'recovery']);
    const cur = P().current({ model: 'linear', startedAt: '2026-06-01', weeksTotal: 4 }, '2026-06-15');
    expect(cur.weekIdx).toBe(2);
    expect(cur.phase).toBe('intensification');
  });

  it('returns generic load policy for mobility phase gates', () => {
    expect(P().loadPolicy({ phase: 'peak' })).toMatchObject({ focus: 'maintain', avoidHighTissueLoad: true });
    expect(P().loadPolicy({ phase: 'deload' })).toMatchObject({ focus: 'deload', avoidHighTissueLoad: true });
    expect(P().loadPolicy({ phase: 'base' })).toMatchObject({ focus: 'develop', avoidHighTissueLoad: false });
  });
});
