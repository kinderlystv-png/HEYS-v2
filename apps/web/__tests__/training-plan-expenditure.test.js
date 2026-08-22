// training-plan-expenditure.test.js — «назначенное не считается сделанным»
// со стороны РАСХОДА калорий.
//
// Куратор назначает тренировку записью в `day.trainings` с теми же полями, что
// у фактической: тип, время, минуты по зонам. Отличает её только
// `plan.status === 'assigned'`. Пока этого не проверял никто, назначение
// поднимало дневной расход, оптимум и калорийный долг так, будто человек уже
// отработал, а невыполненный вчерашний план разгонял NDTE-буст сегодняшнего дня.
//
// Критерий слоя 1 протокола CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09: день с
// назначенной тренировкой даёт ровно те же числа, что день вообще без
// тренировок. Поле `plan` сегодня не пишет никто — защита ставится ДО
// реализации назначения, поэтому вторая половина тестов проверяет, что вся
// существующая история (записи без `plan`) считается как раньше.

import fs from 'fs';
import path from 'path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const read = (name) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
/* eslint-disable no-eval */
const load = (name) => { eval(read(name)); };
/* eslint-enable no-eval */

// Минимальный порядок загрузки: `getPreviousDayTrainings`, `I.utils` и
// `calculateActivityContext` живут в constants, ему нужен только shim.
const IW_ORDER = ['heys_iw_shim.js', 'heys_iw_constants.js'];

const PROFILE = { weight: 80, height: 180, gender: 'Мужской', birthDate: '1990-01-01' };
const CARDIO = { type: 'cardio', time: '10:00', z: [30, 20, 10, 5] };
const assigned = (t) => ({ ...t, plan: { status: 'assigned' } });

let IWI;
let TDEE;

const tdeeOf = (day) => TDEE.calculate(day, PROFILE, { includeNDTE: false, lsGet: () => [] });

beforeAll(() => {
  globalThis.window = globalThis;
  globalThis.HEYS = { utils: { lsGet: () => null, lsSet: () => undefined } };
  for (const file of IW_ORDER) load(file);
  load('heys_tdee_v1.js');
  IWI = globalThis.HEYS.InsulinWave.__internals;
  TDEE = globalThis.HEYS.TDEE;
});

afterEach(() => {
  delete globalThis.HEYS.TrainingKernel;
});

describe('HEYS.TDEE.trainingKcal — назначенное не даёт калорий', () => {
  it('назначенная тренировка стоит 0 ккал, даже с полными зонами', () => {
    expect(TDEE.trainingKcal(CARDIO, 80)).toBeGreaterThan(0);
    expect(TDEE.trainingKcal(assigned(CARDIO), 80)).toBe(0);
  });

  it('начатая и выполненная — уже факт, считаются как раньше', () => {
    const fact = TDEE.trainingKcal(CARDIO, 80);
    expect(TDEE.trainingKcal({ ...CARDIO, plan: { status: 'started' } }, 80)).toBe(fact);
    expect(TDEE.trainingKcal({ ...CARDIO, plan: { status: 'done' } }, 80)).toBe(fact);
  });

  it('вся существующая история — записи без plan — считается как раньше', () => {
    const fact = TDEE.trainingKcal(CARDIO, 80);
    expect(TDEE.trainingKcal({ ...CARDIO, plan: null }, 80)).toBe(fact);
    expect(TDEE.trainingKcal({ ...CARDIO, plan: {} }, 80)).toBe(fact);
    expect(TDEE.trainingKcal({ ...CARDIO, plan: { status: '' } }, 80)).toBe(fact);
  });

  it('предикат берётся из ядра, когда оно загружено, а не из локальной копии', () => {
    // Локальный фолбэк нужен на случай сборки без модуля нагрузки, но пока ядро
    // рядом — правда за ним. Иначе два условия разойдутся молча.
    globalThis.HEYS.TrainingKernel = { load: { isNotPerformedTraining: () => true } };
    expect(TDEE.trainingKcal(CARDIO, 80)).toBe(0);
  });
});

describe('HEYS.TDEE.calculate — день с назначенным равен дню без тренировок', () => {
  const sameAsEmpty = (day) => {
    const empty = tdeeOf({ date: '2026-08-09', trainings: [] });
    const actual = tdeeOf(day);
    expect(actual.trainingsKcal).toBe(empty.trainingsKcal);
    expect(actual.actTotal).toBe(empty.actTotal);
    expect(actual.baseExpenditure).toBe(empty.baseExpenditure);
    expect(actual.tdee).toBe(empty.tdee);
    expect(actual.optimum).toBe(empty.optimum);
  };

  it('одно назначение не меняет ни расход, ни оптимум', () => {
    sameAsEmpty({ date: '2026-08-09', trainings: [assigned(CARDIO)] });
  });

  it('три назначения подряд — тоже ноль: лимит дня не спасает', () => {
    sameAsEmpty({
      date: '2026-08-09',
      trainings: [assigned(CARDIO), assigned(CARDIO), assigned(CARDIO)],
    });
  });

  it('в смешанном дне остаётся ровно фактическая тренировка', () => {
    const factOnly = tdeeOf({ date: '2026-08-09', trainings: [CARDIO] });
    const mixed = tdeeOf({ date: '2026-08-09', trainings: [assigned(CARDIO), CARDIO] });
    expect(mixed.trainingsKcal).toBe(factOnly.trainingsKcal);
    expect(mixed.optimum).toBe(factOnly.optimum);
  });

  it('фактическая тренировка по-прежнему поднимает расход над пустым днём', () => {
    // Страховка от «фильтр съел всё»: тест равенства пустому дню сам по себе
    // прошёл бы и на сломанном расчёте, который всегда возвращает ноль.
    const empty = tdeeOf({ date: '2026-08-09', trainings: [] });
    const fact = tdeeOf({ date: '2026-08-09', trainings: [CARDIO] });
    expect(fact.trainingsKcal).toBeGreaterThan(0);
    expect(fact.optimum).toBeGreaterThan(empty.optimum);
  });
});

describe('getPreviousDayTrainings — вчерашний план не разгоняет сегодняшний NDTE', () => {
  const EMPTY = {
    trainings: [],
    totalKcal: 0,
    hoursSince: Infinity,
    dominantType: null,
    prevDate: '2026-08-08',
    anchorTime: null,
  };
  const prevDayWith = (trainings) => (key) =>
    key === 'heys_dayv2_2026-08-08' ? { trainings } : null;

  it('вчера только назначенное — ответ такой же, как у дня без тренировок', () => {
    const planned = IWI.getPreviousDayTrainings('2026-08-09', prevDayWith([assigned(CARDIO)]));
    expect(planned).toEqual(EMPTY);
    expect(IWI.getPreviousDayTrainings('2026-08-09', prevDayWith([]))).toEqual(EMPTY);
  });

  it('вчерашний факт считается как раньше — и по калориям, и по счётчику', () => {
    const fact = IWI.getPreviousDayTrainings('2026-08-09', prevDayWith([CARDIO]));
    expect(fact.totalKcal).toBeGreaterThan(200);
    expect(fact.trainings).toHaveLength(1);
    expect(fact.hoursSince).toBeLessThan(Infinity);
  });

  it('назначенное не подмешивается ни в счётчик, ни в dominantType', () => {
    // Счётчик даёт множитель за две тренировки, dominantType — силовой буст
    // вместо кардио. Обе величины поехали бы, фильтруй мы только калории.
    const fact = IWI.getPreviousDayTrainings('2026-08-09', prevDayWith([CARDIO]));
    const mixed = IWI.getPreviousDayTrainings(
      '2026-08-09',
      prevDayWith([assigned({ ...CARDIO, type: 'strength' }), CARDIO]),
    );
    expect(mixed.trainings).toHaveLength(1);
    expect(mixed.dominantType).toBe('cardio');
    expect(mixed.totalKcal).toBe(fact.totalKcal);
  });

  it('якорь NDTE — тренировка с max(time), тип с той же строки', () => {
    const mixed = IWI.getPreviousDayTrainings(
      '2026-08-09',
      prevDayWith([
        { type: 'strength', time: '10:00', z: CARDIO.z },
        { type: 'cardio', time: '19:00', z: CARDIO.z },
      ]),
    );
    expect(mixed.dominantType).toBe('cardio');
    expect(mixed.anchorTime).toBe('19:00');
  });

  it('вчерашняя начатая тренировка — факт, буст остаётся', () => {
    const started = IWI.getPreviousDayTrainings(
      '2026-08-09',
      prevDayWith([{ ...CARDIO, plan: { status: 'started' } }]),
    );
    expect(started.trainings).toHaveLength(1);
    expect(started.totalKcal).toBeGreaterThan(200);
  });
});

describe('вторая копия формулы расхода внутри модуля', () => {
  it('I.utils.calculateTrainingKcal тоже молчит на назначенном', () => {
    // Через неё же считает вчерашние калории серверный NDTE
    // (yandex-cloud-functions/heys-mcp/lib/day.js → insulinWaveInternals().utils).
    expect(IWI.utils.calculateTrainingKcal(CARDIO, 70)).toBeGreaterThan(0);
    expect(IWI.utils.calculateTrainingKcal(assigned(CARDIO), 70)).toBe(0);
  });

  it('назначенное не создаёт контекста «после тренировки» у приёма пищи', () => {
    const params = { mealTimeMin: 11 * 60 + 30, steps: 0, householdMin: 0, weight: 80 };
    expect(IWI.calculateActivityContext({ ...params, trainings: [CARDIO] })).toBeTruthy();
    expect(IWI.calculateActivityContext({ ...params, trainings: [assigned(CARDIO)] })).toBeNull();
  });
});
