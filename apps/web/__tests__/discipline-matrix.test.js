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

  // Единый порог обеих вкладок (2026-08-29): до этого Инсайты считали любую
  // непустую запись, Отчёты — по данным, спарклайн — по !isIncomplete.
  describe('порог «день считается» — общий счётчик', () => {
    const iso = (daysAgo) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };
    const makeGetter = (store) => (key, fallback) => (key in store ? store[key] : (fallback ?? null));

    it('день с одним техническим полем не считается', () => {
      const { hasAnyData } = window.HEYS.DisciplineMatrix;
      expect(hasAnyData({ updatedAt: 1756000000000 })).toBe(false);
      expect(hasAnyData({ date: '2026-08-29', deficitPct: -10 })).toBe(false);
      expect(hasAnyData({})).toBe(false);
      expect(hasAnyData(null)).toBe(false);
    });

    it('день, помеченный «не заполнял» (isIncomplete), не двигает порог', () => {
      const { hasAnyData } = window.HEYS.DisciplineMatrix;
      const filled = day();
      expect(hasAnyData(filled)).toBe(true);
      expect(hasAnyData({ ...filled, isIncomplete: true })).toBe(false);
    });

    it('countHistoryDays считает только реальные дни из последних 30', () => {
      const { countHistoryDays } = window.HEYS.DisciplineMatrix;
      const store = {};
      // 5 настоящих дней
      for (let i = 0; i < 5; i++) store['heys_dayv2_' + iso(i)] = day();
      // 3 технических пустышки и 2 «не заполнял» — не в счёт
      for (let i = 5; i < 8; i++) store['heys_dayv2_' + iso(i)] = { updatedAt: 1 };
      for (let i = 8; i < 10; i++) store['heys_dayv2_' + iso(i)] = { ...day(), isIncomplete: true };
      expect(countHistoryDays(makeGetter(store), 30)).toBe(5);
    });

    it('счётчик читает client-scoped ключи', () => {
      const { countHistoryDays } = window.HEYS.DisciplineMatrix;
      const cid = 'abc-123';
      const store = {};
      for (let i = 0; i < 4; i++) store['heys_' + cid + '_dayv2_' + iso(i)] = day();
      expect(countHistoryDays(makeGetter(store), 30, cid)).toBe(4);
      // без clientId те же ключи не видны — scope не протекает
      expect(countHistoryDays(makeGetter(store), 30, '')).toBe(0);
    });
  });
});

// Найдено на живых данных: у клиента с недостижимой нормой воды обе доли
// нулевые в обоих окнах, и Δ показывала «0» — то есть «не изменилось»,
// хотя человек мог вырасти с 200 мл до 2500. Сравнивать там нечего.
describe('Δ при нулевых долях в обоих окнах', () => {
  const profile = { weight: 90, stepsGoal: 10000, age: 35, gender: 'Мужской' };

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

  // Контракт «нулевая строка» (2026-08-29): порог нормы не двигается, но
  // полоса и Δ считаются по средней доле нормы — иначе строка молчит и при
  // 200 мл, и при 2500 при норме 2745 (найдено на живых данных).
  it('нет дней в норме — Δ и полоса по средней доле нормы', () => {
    const dry = (ml) => entry({ waterMl: ml });
    const cur = [dry(1000), dry(2400)];   // норма 2700 — оба вне, в среднем 63 %
    const prev = [dry(200), dry(300)];    // тоже вне, в среднем 9 %
    const res = window.HEYS.DisciplineMatrix.compute(cur, prev, profile);
    const water = res.rows.find((r) => r.key === 'water');
    expect(water.inNorm).toBe(0);
    expect(water.isZeroRow).toBe(true);
    // средняя доля: (1000+2400)/2 / 2700 ≈ 0,63
    expect(Math.round(water.avgShare * 100)).toBe(63);
    // Δ по доле нормы: 63 % − 9 % = +54 п.п., а не «0», как было бы по дням
    expect(water.delta).toBe(54);
    // полоса показывает долю нормы, а не долю дней
    expect(Math.round(water.share * 100)).toBe(63);
  });

  it('живая строка считает Δ по дням, isZeroRow не ставится', () => {
    const cur = [entry({ waterMl: 2800 }), entry({ waterMl: 1000 })];
    const prev = [entry({ waterMl: 2800 }), entry({ waterMl: 2800 })];
    const res = window.HEYS.DisciplineMatrix.compute(cur, prev, profile);
    const water = res.rows.find((r) => r.key === 'water');
    expect(water.isZeroRow).toBe(false);
    expect(water.avgShare).toBe(null);
    expect(water.delta).toBe(-50); // 1 из 2 против 2 из 2
  });

  it('появился хотя бы один день в норме — Δ снова считается', () => {
    const cur = [entry({ waterMl: 2800 }), entry({ waterMl: 1000 })];
    const prev = [entry({ waterMl: 200 }), entry({ waterMl: 300 })];
    const res = window.HEYS.DisciplineMatrix.compute(cur, prev, profile);
    expect(res.rows.find((r) => r.key === 'water').delta).toBe(50);
  });
});
