const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BREAKFAST_DUE_MINUTES,
  DEFAULT_WAKE_MINUTES,
  WAKE_MIN_SAMPLES,
  nowMinutesMsk,
  todayDateMsk,
  isoDateNDaysAgoMsk,
  wakeHistoryDayKeys,
  averageWakeMinutes,
  STATUS_DONE,
  STATUS_MISSING,
  STATUS_SKIPPED,
  hasAnyMeal,
  lastMealMinutes,
  hasMorningWeight,
  waterDeficitMl,
  buildDayChecklist,
  computeCompleteness,
  formatHHMM,
} = require('../day-checklist-rules');

const NOON = BREAKFAST_DUE_MINUTES;
const WAKE = 7 * 60;

function itemByKey(result, key) {
  return result.items.find((it) => it.key === key);
}

test('пустой приём без продуктов не считается едой', () => {
  assert.equal(hasAnyMeal({ meals: [{ time: '09:00', items: [] }] }), false);
  assert.equal(hasAnyMeal({ meals: [{ time: '09:00', items: [{ grams: 100 }] }] }), true);
  assert.equal(hasAnyMeal(null), false);
});

test('lastMealMinutes требует времени, hasAnyMeal — нет', () => {
  const dayWithoutTime = { meals: [{ items: [{ grams: 100 }] }] };
  assert.equal(lastMealMinutes(dayWithoutTime), null);
  assert.equal(hasAnyMeal(dayWithoutTime), true);
});

test('lastMealMinutes берёт самый поздний непустой приём', () => {
  const day = {
    meals: [
      { time: '08:30', items: [{ grams: 100 }] },
      { time: '19:45', items: [{ grams: 50 }] },
      { time: '21:00', items: [] },
    ],
  };
  assert.equal(lastMealMinutes(day), 19 * 60 + 45);
});

test('приём пищи: до 12:00 не ждём, после — ждём', () => {
  const empty = { meals: [] };
  assert.equal(itemByKey(buildDayChecklist({ day: empty, nowMinutes: NOON - 1 }), 'meal').status, STATUS_SKIPPED);
  assert.equal(itemByKey(buildDayChecklist({ day: empty, nowMinutes: NOON }), 'meal').status, STATUS_MISSING);
});

test('внесённая еда закрывает пункт и отдаёт время последнего приёма', () => {
  const day = { meals: [{ time: '08:40', items: [{ grams: 100 }] }] };
  const meal = itemByKey(buildDayChecklist({ day, nowMinutes: 15 * 60 }), 'meal');
  assert.equal(meal.status, STATUS_DONE);
  assert.equal(meal.done_at_local, '08:40');
});

test('еда без времени закрывает пункт, но без done_at_local', () => {
  const day = { meals: [{ items: [{ grams: 100 }] }] };
  const meal = itemByKey(buildDayChecklist({ day, nowMinutes: 15 * 60 }), 'meal');
  assert.equal(meal.status, STATUS_DONE);
  assert.equal(meal.done_at_local, undefined);
});

test('вес: ждём через час после пробуждения', () => {
  const day = { meals: [] };
  const before = buildDayChecklist({ day, nowMinutes: WAKE + 30, wakeMinutes: WAKE });
  const after = buildDayChecklist({ day, nowMinutes: WAKE + 61, wakeMinutes: WAKE });
  assert.equal(itemByKey(before, 'weight').status, STATUS_SKIPPED);
  assert.equal(itemByKey(after, 'weight').status, STATUS_MISSING);
  assert.equal(itemByKey(after, 'weight').due_from, formatHHMM(WAKE + 60));
});

test('вес: заполненный weightMorning закрывает пункт', () => {
  assert.equal(hasMorningWeight({ weightMorning: 82.4 }), true);
  assert.equal(hasMorningWeight({ weightMorning: 0 }), false);
  assert.equal(hasMorningWeight({}), false);
  const res = buildDayChecklist({ day: { weightMorning: 82.4 }, nowMinutes: 12 * 60, wakeMinutes: WAKE });
  assert.equal(itemByKey(res, 'weight').status, STATUS_DONE);
});

test('без среднего пробуждения вес ждём от дефолтных 8:00 + 1 ч', () => {
  const res = buildDayChecklist({ day: {}, nowMinutes: DEFAULT_WAKE_MINUTES + 61 });
  assert.equal(itemByKey(res, 'weight').status, STATUS_MISSING);
  assert.equal(itemByKey(res, 'weight').due_from, '09:00');
});

test('вода: без нормы пункт неактуален', () => {
  assert.equal(waterDeficitMl({ day: { water: 0 }, waterNorm: 0, nowMinutes: 12 * 60, wakeMinutes: WAKE }), null);
  const res = buildDayChecklist({ day: {}, norms: {}, nowMinutes: 12 * 60, wakeMinutes: WAKE });
  assert.equal(itemByKey(res, 'water').status, STATUS_SKIPPED);
});

test('вода: отставание больше 30% нормы даёт missing с дефицитом', () => {
  // wake 07:00, сейчас 15:00 → 8 из 13 активных часов, ожидаем ~1231 мл из 2000.
  const res = buildDayChecklist({
    day: { water: 200 },
    norms: { water: 2000 },
    nowMinutes: 15 * 60,
    wakeMinutes: WAKE,
  });
  const water = itemByKey(res, 'water');
  assert.equal(water.status, STATUS_MISSING);
  assert.ok(water.deficit_ml > 600, `дефицит должен быть заметным, получили ${water.deficit_ml}`);
});

test('вода: небольшое отставание пунктом не считается', () => {
  const res = buildDayChecklist({
    day: { water: 1200 },
    norms: { water: 2000 },
    nowMinutes: 15 * 60,
    wakeMinutes: WAKE,
  });
  assert.equal(itemByKey(res, 'water').status, STATUS_DONE);
  assert.equal(itemByKey(res, 'water').deficit_ml, undefined);
});

test('вода: ожидание не превышает дневную норму после 20:00', () => {
  const deficit = waterDeficitMl({
    day: { water: 2000 },
    waterNorm: 2000,
    nowMinutes: 23 * 60,
    wakeMinutes: WAKE,
  });
  assert.equal(deficit, 0);
});

test('completeness считает только актуальные пункты', () => {
  assert.equal(computeCompleteness([
    { status: STATUS_DONE },
    { status: STATUS_MISSING },
    { status: STATUS_SKIPPED },
  ]), 0.5);
  assert.equal(computeCompleteness([{ status: STATUS_SKIPPED }]), null);
});

test('ранним утром пустой день не выглядит проваленным', () => {
  const res = buildDayChecklist({ day: {}, norms: { water: 2000 }, nowMinutes: 7 * 60, wakeMinutes: WAKE });
  assert.equal(itemByKey(res, 'meal').status, STATUS_SKIPPED);
  assert.equal(itemByKey(res, 'weight').status, STATUS_SKIPPED);
  // Вода в первый час после пробуждения ещё не отстаёт.
  assert.equal(itemByKey(res, 'water').status, STATUS_DONE);
});

test('nowMinutes обязателен', () => {
  assert.throws(() => buildDayChecklist({ day: {} }), TypeError);
});

test('MSK: дата и минуты считаются со сдвигом +3', () => {
  // 21:30 UTC 1 августа = 00:30 MSK уже 2 августа.
  const lateUtc = new Date('2026-08-01T21:30:00Z');
  assert.equal(todayDateMsk(lateUtc), '2026-08-02');
  assert.equal(nowMinutesMsk(lateUtc), 30);

  const middayUtc = new Date('2026-08-02T09:00:00Z');
  assert.equal(todayDateMsk(middayUtc), '2026-08-02');
  assert.equal(nowMinutesMsk(middayUtc), 12 * 60);
});

test('MSK: сдвиг назад пересекает границу месяца', () => {
  const now = new Date('2026-08-02T09:00:00Z');
  assert.equal(isoDateNDaysAgoMsk(0, now), '2026-08-02');
  assert.equal(isoDateNDaysAgoMsk(2, now), '2026-07-31');
});

test('ключи истории пробуждений — неделя подряд, начиная с сегодня', () => {
  const keys = wakeHistoryDayKeys(new Date('2026-08-02T09:00:00Z'));
  assert.equal(keys.length, 7);
  assert.equal(keys[0], 'heys_dayv2_2026-08-02');
  assert.equal(keys[6], 'heys_dayv2_2026-07-27');
});

test('среднее пробуждение требует минимум пяти дней', () => {
  const four = [{ sleepEnd: '07:00' }, { sleepEnd: '07:30' }, { sleepEnd: '08:00' }, { sleepEnd: '06:30' }];
  assert.equal(averageWakeMinutes(four), null);
  assert.equal(four.length, WAKE_MIN_SAMPLES - 1);

  const five = [...four, { sleepEnd: '07:00' }];
  assert.equal(averageWakeMinutes(five), Math.round((7 * 60 + 7.5 * 60 + 8 * 60 + 6.5 * 60 + 7 * 60) / 5));
});

test('среднее пробуждение игнорирует дни без sleepEnd', () => {
  const days = [{ sleepEnd: '07:00' }, {}, null, { sleepEnd: 'не время' }, { sleepEnd: '07:00' }];
  assert.equal(averageWakeMinutes(days), null); // валидных всего два
  assert.equal(averageWakeMinutes(null), null);
});
