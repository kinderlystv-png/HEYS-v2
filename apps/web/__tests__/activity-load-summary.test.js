import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

function evalSource(relative) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB_DIR, relative), 'utf8'));
}

function loadActivity() {
  globalThis.window = globalThis;
  globalThis.HEYS = {};
  evalSource('_kernel/heys_kernel_load_v1.js');
  evalSource('_kernel/heys_kernel_strength_v1.js');
  globalThis.HEYS.exerciseMeta = {
    synergistShare: 0.5,
    groupWeights(meta) {
      const out = {};
      if (meta.primaryGroup) out[meta.primaryGroup] = 1;
      (meta.secondaryGroups || []).forEach((group) => { out[group] = 0.5; });
      return out;
    },
    groupLabel(group) {
      return { back: 'Спина', chest: 'Грудь', biceps: 'Бицепс' }[group] || group;
    },
    get() { return null; },
  };
  evalSource('heys_day_activity_v1.js');
  return globalThis.HEYS.dayActivity;
}

function strength(dateKey, weight, options = {}) {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: {
      completedAt: options.completedAt || Date.parse(dateKey + 'T18:00:00'),
      exercises: [{
        name: 'Тяга блока',
        primaryGroup: 'back',
        secondaryGroups: ['biceps'],
        rpe: options.rpe || 7,
        approaches: [{ weightKg: String(weight), reps: 10, done: true }],
      }],
    },
  };
}

afterEach(() => {
  delete globalThis.HEYS;
});

describe('Актив: модель нагрузки читает существующее ядро', () => {
  it('три последовательных дня одной группы дают совет, но не запрет', () => {
    const api = loadActivity();
    const days = {
      '2026-08-27': { date: '2026-08-27', trainings: [strength('2026-08-27', 10)] },
      '2026-08-28': { date: '2026-08-28', trainings: [strength('2026-08-28', 10)] },
      '2026-08-29': { date: '2026-08-29', trainings: [strength('2026-08-29', 15, { rpe: 9 })] },
      '2026-08-30': { date: '2026-08-30', trainings: [] },
    };
    const summary = api.collectTrainingLoadSummary({
      anchorDate: '2026-08-30',
      bodyWeightKg: 80,
      lsGet(key, fallback) { return days[key.replace('heys_dayv2_', '')] || fallback; },
    });

    expect(summary.warning).toMatchObject({
      group: 'back', groupLabel: 'Спина', streak: 3, historyDays: 4, isBackPull: true,
    });
    expect(summary.warning.dateList).toBe('сб, пт, чт');
    expect(summary.sessionContribution).toBe('150 кг');
    expect(summary.verdict).toBe('Сессия зачтена как тяжёлая');
  });

  it('кардио и силовая остаются разными рядами, план фактом не становится', () => {
    const api = loadActivity();
    const assigned = strength('2026-08-30', 100);
    assigned.plan = { status: 'assigned' };
    const day = {
      date: '2026-08-30',
      trainings: [assigned, { type: 'run', z: [10, 0, 0, 0] }],
    };
    const summary = api.collectTrainingLoadSummary({
      anchorDate: '2026-08-30',
      liveDay: day,
      zoneMets: [2, 3, 5, 8],
      lsGet() { return null; },
    });

    expect(summary).not.toBeNull();
    expect(summary.sessionContribution).toBe('—');
    expect(summary.warning).toBeNull();
    expect(summary.cardio.text).toBe('растёт');
  });
});
