// kernel-calendar.test.js — calendar/grid primitives.

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
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_dates_v1.js'), 'utf8'));
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_calendar_v1.js'), 'utf8'));
};

const C = () => globalThis.HEYS.TrainingKernel.calendar;

describe('kernel calendar', () => {
  beforeAll(setupOnce);

  it('buildDays строит UTC или local date keys на N дней', () => {
    const days = C().buildDays('2026-06-15T00:00:00.000Z', 3, { utc: true });
    expect(days.map((d) => d.dateKey)).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
    expect(days.map((d) => d.label)).toEqual(['Пн', 'Вт', 'Ср']);
  });

  it('monthCells добавляет leading empty cells для Monday-first сетки', () => {
    const cells = C().monthCells(2026, 5); // June 2026 starts Monday
    expect(cells[0]).toMatchObject({ day: 1, dateKey: '2026-06-01' });
    const august = C().monthCells(2026, 7); // August 2026 starts Saturday
    expect(august.slice(0, 5).every((c) => c.empty)).toBe(true);
    expect(august[5]).toMatchObject({ day: 1, dateKey: '2026-08-01' });
  });

  it('yearGrid строит 53×7 Monday-first heatmap и null за пределами года', () => {
    const grid = C().yearGrid(2026);
    expect(grid).toHaveLength(53);
    expect(grid[0]).toHaveLength(7);
    expect(grid[0][0].dateKey).toBeNull();
    expect(grid[0][3].dateKey).toBe('2026-01-01');
  });
});
