// mobility-calendar.test.js — weekly planner for mobility mode.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(MOB_DIR, f), 'utf8')); };
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_dates_v1.js'), 'utf8'));
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_calendar_v1.js'), 'utf8'));
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_periodization_v1.js'), 'utf8'));
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_assessment_v1.js');
  ev('heys_mobility_mode_engine_v1.js');
  ev('heys_mobility_calendar_v1.js');
};

const M = () => globalThis.HEYS.Mobility;

describe('mobility calendar planner', () => {
  beforeAll(setupOnce);

  it('строит 7 дней и desk-профиль получает анти-седентарный акцент', () => {
    const plan = M().calendar.buildWeekPlan({ populations: ['desk'] }, { startDate: '2026-06-15T00:00:00.000Z' });
    expect(plan.days.length).toBe(7);
    expect(plan.days[0].date).toBe('2026-06-15');
    expect(plan.days.map((d) => d.modeId)).toContain('anti_sedentary');
  });

  it('peak/key-load переводит календарь в maintain и избегает high tissue load', () => {
    const plan = M().calendar.buildWeekPlan({}, { phase: 'peak', keyLoadWithinHours: 24 });
    expect(plan.focus).toBe('maintain');
    expect(plan.avoidHighTissueLoad).toBe(true);
    expect(plan.days.map((d) => d.modeId)).toContain('develop_mobility');
  });

  it('retestInfo помечает ретест после 6 недель', () => {
    const plan = M().calendar.buildWeekPlan({}, {
      nowDate: '2026-03-01T00:00:00.000Z',
      records: { assessments: [{ savedAt: '2026-01-01T00:00:00.000Z', audit: { rows: [] } }] }
    });
    expect(plan.retest.due).toBe(true);
  });
});
