// Поправка на факт входит в единую точку входа нормы (HEYS.dayNorm.resolve) —
// значит её получают все тринадцать потребителей нормы и зеркало коннектора
// куратора, а не одна карточка.
//
// Главное здесь: поправка правит РАСХОД, а не обещание. Дефицит остаётся
// договорённостью с человеком: меняется база, а не доля.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const normSrc = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_norm_v1.js'),
  'utf8'
);
const correctionSrc = fs.readFileSync(
  path.resolve(__dirname, '../heys_norm_correction_v1.js'),
  'utf8'
);

const PROFILE = {
  weight: 90, height: 180, age: 35, gender: 'Мужской', deficitPctTarget: -12
};

function load() {
  window.HEYS = {
    // Расход дня: 1520 базовый + 610 активность + 270 тренировки = 2400,
    // числа сквозного примера контракта.
    TDEE: {
      calculate: () => ({
        baseExpenditure: 2400,
        bmr: 1520,
        deficitPct: -12,
        cycleMultiplier: 1,
        optimum: 2112
      })
    }
  };
  // eslint-disable-next-line no-eval
  (0, eval)(normSrc);
  return window.HEYS.dayNorm;
}

describe('поправка на факт · входит в норму дня', () => {
  let dayNorm;
  beforeEach(() => { dayNorm = load(); });

  const day = { date: '2026-08-29' };

  it('без поправки норма прежняя — людям без неё поведение не меняем', () => {
    const res = dayNorm.resolve(day, PROFILE, {});
    expect(res.kcal).toBe(2112);
  });

  it('поправка правит расход до дефицита', () => {
    const res = dayNorm.resolve(
      day, Object.assign({}, PROFILE, { normCorrectionFactor: 0.97 }), {}
    );
    // 2400 × 0,97 = 2328 · −12 % = 2049 — сквозной пример контракта.
    expect(res.kcal).toBe(2049);
  });

  it('дефицит остаётся долей: меняется база, а не обещание', () => {
    const plain = dayNorm.resolve(day, PROFILE, {});
    const corrected = dayNorm.resolve(
      day, Object.assign({}, PROFILE, { normCorrectionFactor: 0.97 }), {}
    );
    // Отношение нормы к поддержанию одно и то же при любой поправке.
    expect(plain.kcal / plain.maintenance).toBeCloseTo(0.88, 2);
    expect(corrected.kcal / corrected.maintenance).toBeCloseTo(0.88, 2);
  });

  it('поддержание тоже под поправкой — она правит расход, а не долю', () => {
    const plain = dayNorm.resolve(day, PROFILE, {});
    const corrected = dayNorm.resolve(
      day, Object.assign({}, PROFILE, { normCorrectionFactor: 0.97 }), {}
    );
    expect(corrected.maintenance).toBeLessThan(plain.maintenance);
  });

  it('рост поправки поднимает норму', () => {
    const res = dayNorm.resolve(
      day, Object.assign({}, PROFILE, { normCorrectionFactor: 1.05 }), {}
    );
    expect(res.kcal).toBeGreaterThan(2112);
  });

  it('расход не опускается ниже базового обмена ни при какой поправке', () => {
    window.HEYS.TDEE.calculate = () => ({
      baseExpenditure: 1600, bmr: 1520, deficitPct: 0, cycleMultiplier: 1, optimum: 1600
    });
    const res = dayNorm.resolve(
      day, Object.assign({}, PROFILE, { normCorrectionFactor: 0.90 }), {}
    );
    // 1600 × 0,90 = 1440 — ниже обмена, поэтому расход держится на 1520.
    expect(res.kcal).toBe(1520);
  });
});

describe('поправка на факт · история решений', () => {
  let NC;
  const store = new Map();

  beforeEach(() => {
    store.clear();
    window.HEYS = {};
    // eslint-disable-next-line no-eval
    (0, eval)(correctionSrc);
    NC = window.HEYS.NormCorrection;
  });

  const lsGet = (k, fb = null) => (store.has(k) ? store.get(k) : fb);
  const lsSet = (k, v) => store.set(k, v);

  it('ключ истории client-scoped по имени — иначе история протечёт между клиентами', () => {
    // scoped() в heys_storage_layer_v1.js добавляет clientId всем ключам на
    // heys_, кроме глобального списка. Имя обязано начинаться с heys_.
    expect(NC.HISTORY_KEY.startsWith('heys_')).toBe(true);
    expect(NC.HISTORY_KEY).not.toMatch(/^heys_(clients|client_current|session_token)/);
  });

  it('решение недели записывается и не задваивается', () => {
    NC.recordDecision({ lsGet, lsSet, weekLabel: '26 авг', factor: 0.97, what: 'applied' });
    NC.recordDecision({ lsGet, lsSet, weekLabel: '26 авг', factor: 0.97, what: 'declined' });
    const weeks = NC.readHistory(lsGet);
    expect(weeks.length).toBe(1);
    expect(weeks[0].what).toBe('declined');
  });

  it('история не растёт без предела', () => {
    for (let i = 0; i < NC.HISTORY_MAX + 5; i++) {
      NC.recordDecision({ lsGet, lsSet, weekLabel: 'нед ' + i, factor: 1, what: 'applied' });
    }
    expect(NC.readHistory(lsGet).length).toBe(NC.HISTORY_MAX);
  });

  it('битая история не роняет чтение', () => {
    store.set(NC.HISTORY_KEY, 'не объект');
    expect(NC.readHistory(lsGet)).toEqual([]);
  });
});

describe('поправка на факт · действует с даты применения', () => {
  let dayNorm;
  beforeEach(() => { dayNorm = load(); });

  const PROF = Object.assign({}, PROFILE, {
    normCorrectionFactor: 0.97,
    normCorrectionAppliedAt: '2026-08-29'
  });

  it('дни до применения считаются без поправки — не задним числом', () => {
    // Иначе согласие в понедельник переписало бы нормы прошлых дней вместе с
    // окном долга калорий, которое пересчитывает три дня назад.
    expect(dayNorm.resolve({ date: '2026-08-28' }, PROF, {}).kcal).toBe(2112);
  });

  it('день применения и дальше — с поправкой', () => {
    expect(dayNorm.resolve({ date: '2026-08-29' }, PROF, {}).kcal).toBe(2049);
    expect(dayNorm.resolve({ date: '2026-09-05' }, PROF, {}).kcal).toBe(2049);
  });

  it('профиль без даты применения остаётся на прежнем поведении', () => {
    const noDate = Object.assign({}, PROFILE, { normCorrectionFactor: 0.97 });
    expect(dayNorm.resolve({ date: '2026-01-01' }, noDate, {}).kcal).toBe(2049);
  });
});

describe('поправка на факт · рост применяется сам', () => {
  let NC;
  beforeEach(() => {
    window.HEYS = {};
    // eslint-disable-next-line no-eval
    (0, eval)(correctionSrc);
    NC = window.HEYS.NormCorrection;
  });

  const now = new Date('2026-08-29');

  it('свежая запись о поднятом множителе — это применённый рост', () => {
    const weeks = [
      { weekLabel: '24–30 авг', factor: 1.03, what: 'applied', at: now.getTime() },
      { weekLabel: '17–23 авг', factor: 1.0, what: 'declined', at: 0 }
    ];
    expect(NC.detectAppliedRaise(weeks, now)).toEqual({ previousFactor: 1 });
  });

  it('снижение применённым ростом не считается', () => {
    const weeks = [
      { weekLabel: '24–30 авг', factor: 0.97, what: 'applied', at: now.getTime() },
      { weekLabel: '17–23 авг', factor: 1.0, what: 'applied', at: 0 }
    ];
    expect(NC.detectAppliedRaise(weeks, now)).toBe(null);
  });

  it('запись прошлого месяца не держит кадр вечно', () => {
    const old = new Date('2026-07-01').getTime();
    const weeks = [{ weekLabel: 'июль', factor: 1.03, what: 'applied', at: old }];
    expect(NC.detectAppliedRaise(weeks, now)).toBe(null);
  });

  it('кадр роста называет разницу от значения до роста, а не ноль', () => {
    // Расчёт к этому моменту уже сошёлся: без «было» из истории карточка
    // сообщила бы о росте на ноль килокалорий.
    const card = NC.buildWeeklySyncCard({
      result: { status: 'ready', direction: 'hold', currentFactor: 1.03, nextFactor: 1.03 },
      tariff: 'self',
      justRaised: { previousFactor: 1 },
      expenditure: 2400, deficitPct: -12, basalMetabolism: 1520
    });
    expect(card.frame).toBe('raised');
    expect(card.norms.deltaKcal).toBe(63);
    expect(card.copy.heroCaption).toBe('+63 ккал');
    // Возврат идёт к значению до роста, а не к действующему.
    expect(card.previousFactor).toBe(1);
  });
});
