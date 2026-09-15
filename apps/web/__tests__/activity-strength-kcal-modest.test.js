/**
 * Расход за силовую — скромная оценка по проделанной работе.
 *
 * Решение владельца 15 сентября, строки «расход силовой — скромная оценка» и
 * «расход силовой — как показан» (tab-activity.v4). Точно посчитать нельзя,
 * только оценить, и оценки расходятся втрое: 72–176 ккал за тренировку. Берётся
 * нижняя граница — норма человека эти калории уже учитывает, и завышенный
 * расход он съедает, не понимая, почему вес стоит.
 *
 * Прежде силовая считалась по зонам и MET, как кардио. Зоны у неё подставлены
 * по типу работы, то есть оценка умножалась на оценку, — а тоннаж известен
 * точно.
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const KERNEL_SRC = fs.readFileSync(path.join(WEB_DIR, '_kernel/heys_kernel_strength_v1.js'), 'utf8');

function loadKernel() {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(KERNEL_SRC);
  return window.HEYS.TrainingKernel.strength;
}

/** Силовая из конструктора: подходы описаны весом и повторами. */
function training(approaches, extra = {}) {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    z: [0, 36, 24, 0],
    workoutLog: {
      totalDurationMinutes: 60,
      exercises: [{ name: 'Жим лёжа', approaches }],
    },
    ...extra,
  };
}

const work = (weightKg, reps) => ({ weightKg: String(weightKg), reps, done: true });
const warmup = (weightKg, reps) => ({ ...work(weightKg, reps), type: 'warmup' });

afterEach(() => {
  delete window.HEYS;
});

describe('расход за силовую', () => {
  it('считается от поднятого: тоннаж на коэффициент', () => {
    const ks = loadKernel();
    // 4 подхода × 8 повторов × 75 кг = 2 400 кг; 2 400 × 0,12 = 288 ккал.
    const estimate = ks.strengthKcalEstimate(training([
      work(75, 8), work(75, 8), work(75, 8), work(75, 8),
    ]));
    expect(estimate.tonnage).toBe(2400);
    expect(estimate.kcal).toBe(288);
    expect(estimate.approaches).toBe(4);
  });

  it('разминочные не считаются — ни в тоннаж, ни в подходы', () => {
    const ks = loadKernel();
    const withWarmup = ks.strengthKcalEstimate(training([
      warmup(40, 10), work(75, 8), work(75, 8),
    ]));
    const without = ks.strengthKcalEstimate(training([work(75, 8), work(75, 8)]));
    expect(withWarmup).toEqual(without);
  });

  it('незакрытый подход в расход не идёт', () => {
    const ks = loadKernel();
    const estimate = ks.strengthKcalEstimate(training([
      work(75, 8), { weightKg: '75', reps: 8, done: false },
    ]));
    expect(estimate.approaches).toBe(1);
    expect(estimate.tonnage).toBe(600);
  });

  it('тренировка длиннее десяти минут не бывает дешевле тридцати ккал', () => {
    const ks = loadKernel();
    // Один лёгкий подход: 20 × 5 = 100 кг → 12 ккал, но работа была час.
    const estimate = ks.strengthKcalEstimate(training([work(20, 5)]));
    expect(estimate.kcal).toBe(30);
  });

  it('короткая тренировка пола не получает — часа работы там не было', () => {
    const ks = loadKernel();
    const short = training([work(20, 5)], { z: [0, 5, 0, 0] });
    short.workoutLog.totalDurationMinutes = 5;
    expect(ks.strengthKcalEstimate(short).kcal).toBe(12);
  });

  it('не силовая из конструктора — считать нечего, возвращается пусто', () => {
    const ks = loadKernel();
    expect(ks.strengthKcalEstimate({ type: 'cardio', z: [0, 30, 0, 0] })).toBeNull();
    expect(ks.strengthKcalEstimate(null)).toBeNull();
  });

  it('части оценки возвращаются вместе с числом — для объяснения на экране', () => {
    const ks = loadKernel();
    const estimate = ks.strengthKcalEstimate(training([work(75, 8), work(80, 6)]));
    // «оценка по N подходам · M кг тоннажа» — обе величины человек сверяет со
    // своей тренировкой, в отличие от коэффициента.
    expect(estimate).toEqual({ kcal: 130, approaches: 2, tonnage: 1080 });
  });
});
