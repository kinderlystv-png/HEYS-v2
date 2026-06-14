// kernel-dates.test.js — shared date helpers preserve explicit UTC/local modes.

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
};

const D = () => globalThis.HEYS.TrainingKernel.dates;

describe('TrainingKernel.dates', () => {
  beforeAll(setupOnce);

  it('exports explicit UTC and local date key helpers', () => {
    const date = new Date('2026-06-15T21:30:00.000Z');
    expect(D().dateKeyUTC(date)).toBe('2026-06-15');
    expect(D().dateKeyLocal(date)).toMatch(/^2026-06-(15|16)$/);
  });

  it('adds days without mutating the input date', () => {
    const start = new Date('2026-06-15T00:00:00.000Z');
    const next = D().addDays(start, 2);
    expect(D().dateKeyUTC(next)).toBe('2026-06-17');
    expect(D().dateKeyUTC(start)).toBe('2026-06-15');
  });

  it('computes non-negative day deltas for date keys', () => {
    expect(D().daysBetweenDateKeys('2026-06-01', '2026-06-15')).toBe(14);
    expect(D().daysBetweenDateKeys('2026-06-15', '2026-06-01')).toBe(0);
    expect(D().daysBetweenDateKeys('bad', '2026-06-01')).toBe(0);
  });

  it('builds sequential days with explicit UTC keys and labels', () => {
    const days = D().sequenceDays('2026-06-15T00:00:00.000Z', 3, { utc: true });
    expect(days.map((d) => d.index)).toEqual([0, 1, 2]);
    expect(days.map((d) => d.dateKey)).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
    expect(days.map((d) => d.label)).toEqual(['Пн', 'Вт', 'Ср']);
  });
});
