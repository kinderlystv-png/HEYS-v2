// Матрица «Дисциплина» Отчётов — контракт reports-insights.v4, раздел
// «Дисциплина»: нормы из движка, двухуровневые знаменатели, «не ведётся»
// вместо «0 из 0», Δ в процентных пунктах доли, зарядка отдельно от
// тренировок, «день ведён» = >=4 полей из 5.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const src = fs.readFileSync(
  path.resolve(__dirname, '../heys_discipline_matrix_v1.js'),
  'utf8'
);

function day(fields) {
  return Object.assign({
    meals: [{ items: [{ name: 'x', grams: 100 }], time: '12:00' }],
    weightMorning: 90,
    sleepStart: '23:00',
    sleepEnd: '07:00',
    steps: 11000,
    waterMl: 2800,
    trainings: []
  }, fields || {});
}

function entry(fields, kcal, target) {
  return { day: fields === null ? null : day(fields), kcal: kcal ?? 2000, target: target ?? 2000 };
}

describe('discipline matrix', () => {
  beforeEach(() => {
    window.HEYS = {
      calcSleepNorm: () => ({ hours: 8, range: '7-9', explanation: '' }),
      ratioZones: null
    };
    // eslint-disable-next-line no-eval
    (0, eval)(src);
  });

  afterEach(() => {
    delete window.HEYS;
  });

  const profile = { weight: 90, stepsGoal: 10000, age: 35, gender: 'Мужской' };

  it('семь строк в контрактном порядке', () => {
    const res = window.HEYS.DisciplineMatrix.compute([entry()], [], profile);
    expect(res.rows.map((r) => r.key)).toEqual([
      'nutrition', 'water', 'steps', 'sleep', 'activation', 'trainings', 'tracking'
    ]);
  });

  it('питание — коридор 0,70–1,35 от плана; знаменатель — дни с ккал', () => {
    const res = window.HEYS.DisciplineMatrix.compute([
      entry({}, 2000, 2000),        // ratio 1.0 — в норме
      entry({}, 1300, 2000),        // 0.65 — вне
      entry({}, 2750, 2000),        // 1.375 — вне
      entry({ meals: [] }, 0, 2000) // без ккал — не в знаменателе питания
    ], [], profile);
    const nutrition = res.rows.find((r) => r.key === 'nutrition');
    expect(nutrition.inNorm).toBe(1);
    expect(nutrition.tracked).toBe(3);
  });

  it('вода — вес × 30 мл; сон — диапазон, пересып вне нормы', () => {
    const res = window.HEYS.DisciplineMatrix.compute([
      entry({ waterMl: 2700 }),                       // 90×30=2700 — в норме
      entry({ waterMl: 2000 }),                       // ниже — вне
      entry({ sleepStart: '22:00', sleepEnd: '09:00' }) // 11 ч — пересып, вне
    ], [], profile);
    const water = res.rows.find((r) => r.key === 'water');
    expect(water.inNorm).toBe(2); // 2700 и 2800 (дефолт фабрики)
    expect(water.tracked).toBe(3);
    const sleep = res.rows.find((r) => r.key === 'sleep');
    expect(sleep.inNorm).toBe(2); // две ночи по 8 ч, пересып не в счёт
    expect(sleep.tracked).toBe(3);
  });

  it('ведение — из календарных дней, порог ≥4 полей из 5', () => {
    const res = window.HEYS.DisciplineMatrix.compute([
      entry(),                                    // 5 полей — ведён
      entry({ waterMl: 0 }),                      // 4 поля — ведён
      entry({ waterMl: 0, steps: 0 }),            // 3 поля — не ведён
      entry(null, 0, 0)                           // пустой день — календарь считает
    ], [], profile);
    const tracking = res.rows.find((r) => r.key === 'tracking');
    expect(tracking.inNorm).toBe(2);
    expect(tracking.tracked).toBe(4);
  });

  it('зарядка отдельно от тренировок: активация не двоит счёт', () => {
    const res = window.HEYS.DisciplineMatrix.compute([
      entry({ trainings: [{ source: 'morning_activation', z: [10, 0, 0, 0] }] }),
      entry({ trainings: [{ type: 'cardio', z: [0, 30, 0, 0] }] }),
      entry({ trainings: [
        { source: 'morning_activation', z: [10, 0, 0, 0] },
        { activityLabel: 'бег', z: [0, 40, 0, 0] }
      ] })
    ], [], profile);
    const activation = res.rows.find((r) => r.key === 'activation');
    const trainings = res.rows.find((r) => r.key === 'trainings');
    expect(activation.count).toBe(2);
    expect(trainings.count).toBe(2);
    expect(trainings.kind).toBe('count');
    expect(trainings.tracked).toBeUndefined(); // знаменателя без программы нет
  });

  it('трекер без данных — «не ведётся», не «0 из 0»', () => {
    const res = window.HEYS.DisciplineMatrix.compute([
      entry({ waterMl: 0 }),
      entry({ waterMl: 0 })
    ], [], profile);
    const water = res.rows.find((r) => r.key === 'water');
    expect(water.notTracked).toBe(true);
    expect(water.inNorm).toBeUndefined();
  });

  it('Δ — в процентных пунктах доли; без прошлого окна — null', () => {
    const cur = [entry({}, 2000, 2000), entry({}, 1300, 2000)]; // 1 из 2 = 50%
    const prev = [entry({}, 2000, 2000), entry({}, 2000, 2000)]; // 2 из 2 = 100%
    const withPrev = window.HEYS.DisciplineMatrix.compute(cur, prev, profile);
    expect(withPrev.rows.find((r) => r.key === 'nutrition').delta).toBe(-50);
    const noPrev = window.HEYS.DisciplineMatrix.compute(cur, [], profile);
    expect(noPrev.rows.find((r) => r.key === 'nutrition').delta).toBe(null);
  });

  it('счётные строки: Δ в штуках к прошлому окну', () => {
    const cur = [entry({ trainings: [{ type: 'cardio', z: [0, 30, 0, 0] }] })];
    const prev = [entry({}), entry({})];
    const res = window.HEYS.DisciplineMatrix.compute(cur, prev, profile);
    expect(res.rows.find((r) => r.key === 'trainings').delta).toBe(1);
  });
});
