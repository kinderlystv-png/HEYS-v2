'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const day = require('../lib/day');

const CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

test('nowParts отдаёт дату и время в московской зоне, а не в UTC', () => {
  // 2026-08-01T22:30:00Z == 2026-08-02 01:30 в Москве: дата обязана перевалить.
  const parts = day.nowParts(Date.UTC(2026, 7, 1, 22, 30));
  assert.equal(parts.date, '2026-08-02');
  assert.equal(parts.time, '01:30');
});

test('nowParts не отдаёт 24:00 на полуночной границе', () => {
  const parts = day.nowParts(Date.UTC(2026, 7, 1, 21, 0));
  assert.equal(parts.time, '00:00');
  assert.equal(parts.date, '2026-08-02');
});

test('isValidDate отбраковывает несуществующие даты', () => {
  assert.equal(day.isValidDate('2026-08-01'), true);
  assert.equal(day.isValidDate('2026-02-30'), false);
  assert.equal(day.isValidDate('2026-13-01'), false);
  assert.equal(day.isValidDate('01.08.2026'), false);
});

test('normalizeTime приводит к HH:MM и режет невалидное', () => {
  assert.equal(day.normalizeTime('9:05'), '09:05');
  assert.equal(day.normalizeTime('23:59'), '23:59');
  assert.equal(day.normalizeTime('24:00'), null);
  assert.equal(day.normalizeTime('12:60'), null);
  assert.equal(day.normalizeTime('полдень'), null);
});

test('приёмы сортируются по убыванию времени, безвременные — в конец', () => {
  const sorted = day.sortMealsByTime([
    { id: 'a', time: '08:00' },
    { id: 'b', time: '' },
    { id: 'c', time: '15:54' },
  ]);
  assert.deepEqual(sorted.map((m) => m.id), ['c', 'a', 'b']);
});

test('computeTefKcal100 повторяет NET Atwater из UI', () => {
  // Флэт уайт: Б3 У8.7 Ж3.3 → 3*3 + 4*8.7 + 9*3.3 = 73.5
  const kcal = day.computeTefKcal100({ protein100: 3, carbs100: 8.7, fat100: 3.3 });
  assert.equal(kcal, 73.5);
});

test('computeTefKcal100 достраивает углеводы и жиры из подтипов', () => {
  const kcal = day.computeTefKcal100({ protein100: 0, simple100: 8.7, complex100: 0, badFat100: 2.2, goodFat100: 1, trans100: 0.1 });
  assert.equal(kcal, 64.5);
});

test('buildMealItem кладёт полный слепок нутриентов и TEF-калорийность', () => {
  const item = day.buildMealItem(
    { id: 'p1', name: 'Молоко 3.5', protein100: 3, carbs100: 4.7, fat100: 3.5, calcium: 120, kcal100: 61 },
    185,
    (p) => `${p}test`,
  );
  assert.equal(item.product_id, 'p1');
  assert.equal(item.grams, 185);
  assert.equal(item.calcium, 120);
  // kcal100 в позиции — пересчитанный, а не «сырой» из карточки продукта.
  assert.equal(item.kcal100, day.computeTefKcal100({ protein100: 3, carbs100: 4.7, fat100: 3.5 }));
});

test('macroTotals считает по граммам позиций', () => {
  const totals = day.macroTotals([
    { items: [{ grams: 200, kcal100: 50, protein100: 3, carbs100: 5, fat100: 1 }] },
    { items: [{ grams: 100, kcal100: 300, protein100: 0, carbs100: 75, fat100: 0 }] },
  ]);
  assert.equal(totals.kcal, 400);
  assert.equal(totals.protein, 6);
  assert.equal(totals.carbs, 85);
  assert.equal(totals.fat, 2);
});

test('addMeal двигает updatedAt и проставляет writerCid', () => {
  const base = day.emptyDay('2026-08-01', CLIENT, 1000);
  const next = day.addMeal(base, { id: 'm1', time: '10:00', items: [] }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.updatedAt, 2000);
  assert.equal(next._writerCid, CLIENT);
  assert.equal(next.meals.length, 1);
  // Исходный день не мутируем — merge отправляет новый объект.
  assert.equal(base.meals.length, 0);
});

test('deleteMeal ставит tombstone, иначе merge вернёт приём обратно', () => {
  const base = { ...day.emptyDay('2026-08-01', CLIENT, 1000), meals: [{ id: 'm1' }, { id: 'm2' }] };
  const { day: next, removed } = day.deleteMeal(base, 'm1', { nowMs: 5000, clientId: CLIENT });
  assert.equal(removed, true);
  assert.deepEqual(next.meals.map((m) => m.id), ['m2']);
  assert.equal(next.deletedMealIds.m1, 5000);
});

test('deleteMeal сообщает, что удалять было нечего', () => {
  const base = day.emptyDay('2026-08-01', CLIENT, 1000);
  const { removed } = day.deleteMeal(base, 'нет-такого', { nowMs: 5000, clientId: CLIENT });
  assert.equal(removed, false);
});

test('addWater суммируется и не уходит в минус', () => {
  const base = { ...day.emptyDay('2026-08-01', CLIENT, 1000), waterMl: 200 };
  const plus = day.addWater(base, 300, { nowMs: 2000, clientId: CLIENT });
  assert.equal(plus.waterMl, 500);
  const minus = day.addWater(plus, -900, { nowMs: 3000, clientId: CLIENT });
  assert.equal(minus.waterMl, 0);
});

test('addTraining нормализует минуты в четыре пульсовые зоны', () => {
  const base = day.emptyDay('2026-08-01', CLIENT, 1000);
  const { day: next } = day.addTraining(base, [10, 20], null, { nowMs: 2000, clientId: CLIENT });
  assert.deepEqual(next.trainings[0].z, [10, 20, 0, 0]);
  // id обязателен: по нему merge опознаёт тренировку при удалении.
  assert.match(next.trainings[0].id, /^tr_[0-9a-f]{12}$/);
  // source проставляется всегда — без него нельзя отличить запись через
  // коннектор от той, что клиент внёс в приложении.
  assert.equal(next.trainings[0].source, 'curator_mcp');
});

test('addTraining пишет время, тип и ощущения — то, что раньше терялось молча', () => {
  const base = day.emptyDay('2026-08-01', CLIENT, 1000);
  const { day: next } = day.addTraining(base, [30], {
    time: '18:40', type: 'cardio', activityLabel: 'Бег', comment: 'В парке',
    mood: 8, wellbeing: 7, stress: 3,
  }, { nowMs: 2000, clientId: CLIENT });
  const t = next.trainings[0];
  assert.equal(t.time, '18:40');
  assert.equal(t.type, 'cardio');
  assert.equal(t.activityLabel, 'Бег');
  assert.equal(t.comment, 'В парке');
  assert.equal(t.mood, 8);
  assert.equal(t.wellbeing, 7);
  assert.equal(t.stress, 3);
});

test('addTraining игнорирует мусорные значения ощущений вместо записи NaN', () => {
  const base = day.emptyDay('2026-08-01', CLIENT, 1000);
  const { day: next } = day.addTraining(base, [30], { mood: 15, wellbeing: 'бодро', stress: 0 }, { nowMs: 2000, clientId: CLIENT });
  const t = next.trainings[0];
  assert.equal(t.mood, undefined);
  assert.equal(t.wellbeing, undefined);
  assert.equal(t.stress, undefined);
});

test('updateDayFields пишет во внутренние имена полей и валидирует время', () => {
  const base = day.emptyDay('2026-08-01', CLIENT, 1000);
  const { day: next, applied } = day.updateDayFields(base, { weight: 91.8, sleep_start: '1:35', comment: 'ок' }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.weightMorning, 91.8);
  assert.equal(next.sleepStart, '01:35');
  assert.equal(next.dayComment, 'ок');
  assert.equal(next.weightUpdatedAt, 2000);
  assert.deepEqual(applied.sort(), ['comment', 'sleep_start', 'weight']);
});

test('updateDayFields пересчитывает sleepHours под новые времена сна', () => {
  // Регресс 2026-08-02: запись 06:30-12:00 оставляла hours 5.8 от прежнего
  // интервала 04:35-10:25 — и дневник, и обзор за период врали.
  const base = {
    ...day.emptyDay('2026-08-02', CLIENT, 1000),
    sleepStart: '04:35',
    sleepEnd: '10:25',
    sleepHours: 5.8,
  };
  const { day: next } = day.updateDayFields(base, { sleep_start: '06:30', sleep_end: '12:00' }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.sleepHours, 5.5);
  assert.equal(day.summarizeDay(next).sleep.hours, 5.5);
  assert.equal(day.summarizeDayBrief(next).sleep_hours, 5.5);
});

test('sleepHours учитывает дневной досып, как это делает веб', () => {
  const base = {
    ...day.emptyDay('2026-08-02', CLIENT, 1000),
    sleepEnd: '07:00',
    daySleepMinutes: 45,
  };
  const { day: next } = day.updateDayFields(base, { sleep_start: '23:30' }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.sleepHours, 8.3); // 7.5 ночью + 0.75 днём
});

test('updateDayFields не трогает sleepHours, пока пара времён неполная', () => {
  const base = { ...day.emptyDay('2026-08-02', CLIENT, 1000), sleepHours: 5.8 };
  const { day: next } = day.updateDayFields(base, { sleep_start: '06:30' }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.sleepHours, 5.8);
});

test('оценки пишутся в утренние поля, а не в производные средние', () => {
  const base = day.emptyDay('2026-08-02', CLIENT, 1000);
  const { day: next } = day.updateDayFields(base, { mood: 7, wellbeing: 8, stress: 3 }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.moodMorning, 7);
  assert.equal(next.wellbeingMorning, 8);
  assert.equal(next.stressMorning, 3);
  // Без других оценок среднее по дню совпадает с утренним.
  assert.equal(next.moodAvg, 7);
  assert.equal(next.dayScore, 7); // (7 + 8 + (10-3)) / 3 = 7.33
  assert.equal(next.dayScoreRaw, 7.3);
});

test('среднее по дню считается вместе с оценками приёмов', () => {
  const base = {
    ...day.emptyDay('2026-08-02', CLIENT, 1000),
    meals: [{ id: 'm1', name: 'Обед', time: '13:00', mood: 5, items: [] }],
  };
  const { day: next } = day.updateDayFields(base, { mood: 7 }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.moodMorning, 7);
  assert.equal(next.moodAvg, 6);
  assert.equal(day.summarizeDay(next).mood, 6);
  assert.equal(day.summarizeDay(next).morning.mood, 7);
});

test('ручной dayScore не перетирается пересчётом', () => {
  const base = { ...day.emptyDay('2026-08-02', CLIENT, 1000), dayScore: 9, dayScoreManual: true };
  const { day: next } = day.updateDayFields(base, { mood: 3, wellbeing: 3, stress: 8 }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.dayScore, 9);
});

test('заготовка тренировки без времени и минут не портит средние', () => {
  const base = {
    ...day.emptyDay('2026-08-02', CLIENT, 1000),
    trainings: [{ z: [0, 0, 0, 0], mood: 1 }],
  };
  const { day: next } = day.updateDayFields(base, { mood: 7 }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.moodAvg, 7);
});

test('шаги получают собственный штамп — иначе проигрывают в merge', () => {
  const base = day.emptyDay('2026-08-02', CLIENT, 1000);
  const { day: next } = day.updateDayFields(base, { steps: 8200 }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.steps, 8200);
  assert.equal(next.stepsUpdatedAt, 2000);
});

test('updateDayFields падает на нечисловом весе', () => {
  const base = day.emptyDay('2026-08-01', CLIENT, 1000);
  assert.throws(() => day.updateDayFields(base, { weight: 'много' }, { nowMs: 2000, clientId: CLIENT }), /invalid_number/);
});

test('summarizeDay не тащит нутриентные слепки в ответ модели', () => {
  const summary = day.summarizeDay({
    date: '2026-08-01',
    waterMl: 200,
    meals: [{ id: 'm1', name: 'Перекус', time: '15:54', items: [{ id: 'i1', name: 'Кофе', grams: 100, kcal100: 50, calcium: 120 }] }],
    trainings: [{ z: [0, 0, 0, 0] }, { z: [10, 5, 0, 0] }],
  });
  assert.equal(summary.meals[0].kcal, 50);
  assert.deepEqual(Object.keys(summary.meals[0].items[0]).sort(), ['grams', 'id', 'kcal', 'name']);
  // Пустые тренировки не показываем — их в блобе много как заготовок.
  assert.equal(summary.trainings.length, 1);
  assert.equal(summary.trainings[0].total_minutes, 15);
});

test('summarizeDay отдаёт время, тип и ощущения тренировки, а не только минуты', () => {
  const summary = day.summarizeDay({
    date: '2026-08-01',
    waterMl: 0,
    meals: [],
    trainings: [{ z: [30, 0, 0, 0], time: '18:40', type: 'cardio', activityLabel: 'Бег', mood: 8, wellbeing: 7, stress: 3, comment: 'В парке' }],
  });
  assert.deepEqual(summary.trainings[0], {
    index: 0,
    zones_minutes: [30, 0, 0, 0], total_minutes: 30, time: '18:40', type: 'cardio',
    activity_label: 'Бег', comment: 'В парке', mood: 8, wellbeing: 7, stress: 3,
  });
});

test('index тренировки указывает на позицию в блобе, а не в отфильтрованном списке', () => {
  // Первая тренировка — пустая заготовка, её summarizeDay не показывает.
  // Если бы index считался по выходному списку, heys_update_training правил бы
  // заготовку вместо настоящей тренировки.
  const summary = day.summarizeDay({
    date: '2026-08-01',
    waterMl: 0,
    meals: [],
    trainings: [{ z: [0, 0, 0, 0] }, { z: [45, 0, 0, 0], time: '19:00' }],
  });
  assert.equal(summary.trainings.length, 1);
  assert.equal(summary.trainings[0].index, 1);
});

test('summarizeDay видит силовую с workout_builder, даже когда z полностью нулевой', () => {
  // Раньше такая тренировка выпадала из сводки целиком: фильтр смотрел только
  // на сумму пульсовых зон, а силовая с конструктором их не заполняет.
  const summary = day.summarizeDay({
    date: '2026-08-01',
    waterMl: 0,
    meals: [],
    trainings: [{
      z: [0, 0, 0, 0], type: 'strength', strengthEntryMode: 'workout_builder',
      workoutLog: { exercises: [{ approaches: [{ weightKg: '60', reps: 8, done: true }] }] },
    }],
  });
  assert.equal(summary.trainings.length, 1);
  assert.equal(summary.trainings[0].total_minutes, 0);
  assert.equal(summary.trainings[0].type, 'strength');
});

/** Назначенная куратором тренировка: план, а не факт. */
const ASSIGNED = { z: [40, 0, 0, 0], time: '19:00', type: 'cardio', plan: { status: 'assigned' } };

test('isNotPerformedTraining срабатывает только на статусе assigned', () => {
  assert.equal(day.isNotPerformedTraining(ASSIGNED), true);
  assert.equal(day.isNotPerformedTraining({ ...ASSIGNED, plan: { status: 'started' } }), false);
  assert.equal(day.isNotPerformedTraining({ ...ASSIGNED, plan: { status: 'done' } }), false);
  assert.equal(day.isNotPerformedTraining({ z: [40, 0, 0, 0] }), false);
  assert.equal(day.isNotPerformedTraining({ plan: null }), false);
  assert.equal(day.isNotPerformedTraining(null), false);
});

test('summarizeDay показывает назначенную тренировку, но с явным признаком плана', () => {
  // Куратор обязан видеть то, что сам назначил, иначе он назначит второй раз.
  // Отличать план от факта он должен по полю, а не по догадке о минутах.
  const summary = day.summarizeDay({
    date: '2026-08-01', waterMl: 0, meals: [], trainings: [ASSIGNED],
  });
  assert.equal(summary.trainings.length, 1);
  assert.equal(summary.trainings[0].plan_status, 'assigned');
  assert.equal(summary.trainings[0].total_minutes, 40);
});

test('summarizeDay не выдумывает plan_status обычной тренировке', () => {
  const summary = day.summarizeDay({
    date: '2026-08-01', waterMl: 0, meals: [],
    trainings: [{ z: [40, 0, 0, 0], time: '19:00' }],
  });
  assert.equal(Object.hasOwn(summary.trainings[0], 'plan_status'), false);
});

test('summarizeDayBrief не считает минуты назначенной тренировки', () => {
  // День с одним назначением обязан выглядеть как день без тренировок: иначе
  // обзор недели показывает минуты, которых клиент не отрабатывал.
  const brief = day.summarizeDayBrief({ date: '2026-08-01', meals: [], trainings: [ASSIGNED] });
  assert.equal(brief.training_min, 0);
});

test('summarizeDayBrief считает начатую и обычную тренировку как раньше', () => {
  const started = day.summarizeDayBrief({
    date: '2026-08-01', meals: [], trainings: [{ ...ASSIGNED, plan: { status: 'started' } }],
  });
  assert.equal(started.training_min, 40);

  const plain = day.summarizeDayBrief({
    date: '2026-08-01', meals: [], trainings: [{ z: [40, 0, 0, 0], time: '19:00' }],
  });
  assert.equal(plain.training_min, 40);
});

test('ensureDay поднимает пустой день, а не падает', () => {
  const fresh = day.ensureDay(null, '2026-08-01', CLIENT, 1000);
  assert.equal(fresh.date, '2026-08-01');
  assert.deepEqual(fresh.meals, []);
  const broken = day.ensureDay({ date: '2026-08-01', meals: 'мусор' }, '2026-08-01', CLIENT, 1000);
  assert.deepEqual(broken.meals, []);
});

// ── Правка существующего приёма ───────────────────────────────────────────

const MEAL_DAY = () => ({
  date: '2026-08-01',
  meals: [
    {
      id: 'm_dinner',
      name: 'Ужин',
      time: '20:42',
      mood: 7,
      items: [
        { id: 'it_soba', name: 'Соба', grams: 250, kcal100: 118.5, protein100: 3.7, carbs100: 24.8, fat100: 0.5 },
        { id: 'it_mayo', name: 'Майонез', grams: 15, kcal100: 691, protein100: 1, carbs100: 3, fat100: 75 },
      ],
    },
    { id: 'm_snack', name: 'Перекус', time: '15:54', items: [{ id: 'it_milk', name: 'Молоко', grams: 185, kcal100: 60 }] },
  ],
  updatedAt: 100,
});

const CTX = { nowMs: 777, clientId: 'client-1' };

test('updateMeal добавляет позицию, не трогая шапку приёма', () => {
  const res = day.updateMeal(MEAL_DAY(), 'm_dinner', {
    addItems: [{ id: 'it_new', name: 'Сосиски', grams: 180, kcal100: 183 }],
  }, CTX);

  assert.equal(res.meal.id, 'm_dinner');
  assert.equal(res.meal.name, 'Ужин');
  assert.equal(res.meal.time, '20:42');
  assert.equal(res.meal.mood, 7);
  assert.equal(res.meal.items.length, 3);
  assert.equal(res.day.updatedAt, 777);
  assert.equal(res.day._writerCid, 'client-1');
});

test('updateMeal меняет граммовку и убирает позицию по id', () => {
  const res = day.updateMeal(MEAL_DAY(), 'm_dinner', {
    setGrams: { it_soba: 300 },
    removeItemIds: ['it_mayo'],
  }, CTX);

  assert.deepEqual(res.meal.items.map((i) => [i.id, i.grams]), [['it_soba', 300]]);
  assert.equal(res.unknownItems.length, 0);
  assert.equal(res.day.deletedItemIds.it_mayo, 777);
});

test('updateMeal ставит item.updatedAt при смене граммовки (guard от stale PWA)', () => {
  const res = day.updateMeal(MEAL_DAY(), 'm_dinner', { setGrams: { it_soba: 300 } }, CTX);
  const soba = res.meal.items.find((i) => i.id === 'it_soba');
  assert.equal(soba.updatedAt, 777);
  assert.equal(res.meal.updatedAt, 777);
});

test('updateMeal ставит tombstone deletedItemIds при удалении позиции', () => {
  const source = MEAL_DAY();
  source.deletedItemIds = { it_old: 100 };
  const res = day.updateMeal(source, 'm_dinner', { removeItemIds: ['it_mayo'] }, CTX);
  assert.equal(res.day.deletedItemIds.it_old, 100);
  assert.equal(res.day.deletedItemIds.it_mayo, 777);
  assert.ok(!res.meal.items.some((i) => i.id === 'it_mayo'));
});

test('updateMeal сообщает о неизвестных id позиций вместо тихого no-op', () => {
  const res = day.updateMeal(MEAL_DAY(), 'm_dinner', {
    removeItemIds: ['it_missing'],
    setGrams: { it_also_missing: 10 },
  }, CTX);
  assert.deepEqual(res.unknownItems.sort(), ['it_also_missing', 'it_missing']);
});

test('updateMeal со сменой времени пересортирует приёмы дня', () => {
  const res = day.updateMeal(MEAL_DAY(), 'm_snack', { time: '23:10' }, CTX);
  assert.deepEqual(res.day.meals.map((m) => m.id), ['m_snack', 'm_dinner']);
});

test('updateMeal без изменений не двигает день', () => {
  const source = MEAL_DAY();
  const res = day.updateMeal(source, 'm_dinner', {}, CTX);
  assert.deepEqual(res.changed, []);
  assert.equal(res.day, source);
});

test('updateMeal не находит несуществующий приём', () => {
  const res = day.updateMeal(MEAL_DAY(), 'm_nope', { name: 'X' }, CTX);
  assert.equal(res.meal, null);
  assert.deepEqual(res.changed, []);
});

test('updateMeal отбивает недопустимую граммовку', () => {
  assert.throws(() => day.updateMeal(MEAL_DAY(), 'm_dinner', { setGrams: { it_soba: 99999 } }, CTX), /invalid_grams/);
});

test('updateMeal не мутирует исходный день', () => {
  const source = MEAL_DAY();
  day.updateMeal(source, 'm_dinner', { addItems: [{ id: 'x', name: 'X', grams: 10 }] }, CTX);
  assert.equal(source.meals[0].items.length, 2);
});

// ── Тип приёма: время + состав ───────────────────────────────────────────

function itemOf(name, grams, kcal100) {
  return { id: `it_${name}`, name, grams, kcal100 };
}

test('кофе с бананом — перекус, а не обед', () => {
  // Три продукта = формально основной приём по порогам приложения, но по сути
  // это кофе и фрукт: обедом такой набор подписывать нельзя.
  const meal = {
    id: 'm1', time: '15:15',
    items: [itemOf('Кофе американо', 100, 2), itemOf('Молоко ультрапастеризованное 3.5', 185, 61), itemOf('Банан', 120, 90)],
  };
  const res = day.classifyMeal(meal, { meals: [] });
  assert.equal(res.mealType, 'snack1');
  assert.equal(res.name, 'Перекус');
});

test('одиночная тарелка каши утром — завтрак, а не перекус', () => {
  const meal = { id: 'm1', time: '08:30', items: [itemOf('Овсяные хлопья', 60, 350)] };
  assert.equal(day.classifyMeal(meal, { meals: [] }).mealType, 'breakfast');
});

test('яблоко днём — перекус, суп днём — обед', () => {
  const apple = { id: 'm1', time: '12:00', items: [itemOf('Яблоко', 150, 50)] };
  assert.equal(day.classifyMeal(apple, { meals: [] }).mealType, 'snack1');
  const soup = { id: 'm2', time: '13:00', items: [itemOf('Суп куриный', 350, 90)] };
  assert.equal(day.classifyMeal(soup, { meals: [] }).mealType, 'lunch');
});

test('второй обед в дне не заводится — становится перекусом', () => {
  const existing = { meals: [{ id: 'm1', time: '13:00', mealType: 'lunch', items: [] }] };
  const second = { id: 'm2', time: '14:30', items: [itemOf('Паста', 300, 160)] };
  assert.equal(day.classifyMeal(second, existing).mealType, 'snack1');
});

test('ночной приём получает свой тип', () => {
  const meal = { id: 'm1', time: '23:40', items: [itemOf('Творог', 200, 120)] };
  const res = day.classifyMeal(meal, { meals: [] });
  assert.equal(res.mealType, 'night');
  assert.equal(res.name, 'Ночной приём');
});

test('добавление значимого в перекус повышает его до основного приёма', () => {
  const base = {
    date: '2026-08-02',
    meals: [{ id: 'm1', time: '13:00', name: 'Перекус', mealType: 'snack1', items: [itemOf('Яблоко', 150, 50)] }],
    updatedAt: 1,
  };
  const res = day.updateMeal(base, 'm1', {
    addItems: [itemOf('Суп куриный', 350, 90)],
    removeItemIds: [], setGrams: {},
  }, { nowMs: 2, clientId: 'c1' });

  assert.equal(res.meal.mealType, 'lunch');
  assert.equal(res.meal.name, 'Обед');
  assert.ok(res.changed.some((c) => c.includes('тип → Обед')), `changed: ${res.changed}`);
});

test('удаление позиции не понижает основной приём обратно в перекус', () => {
  const base = {
    date: '2026-08-02',
    meals: [{
      id: 'm1', time: '13:00', name: 'Обед', mealType: 'lunch',
      items: [itemOf('Суп куриный', 350, 90), itemOf('Хлеб', 40, 250)],
    }],
    updatedAt: 1,
  };
  const res = day.updateMeal(base, 'm1', {
    removeItemIds: ['it_Суп куриный'], setGrams: {}, addItems: [],
  }, { nowMs: 2, clientId: 'c1' });

  assert.equal(res.meal.mealType, 'lunch', 'чужой обед не переименовываем');
});

test('своё название приёма правка не перетирает', () => {
  const base = {
    date: '2026-08-02',
    meals: [{ id: 'm1', time: '13:00', name: 'Кофе Киндерли', mealType: 'snack1', items: [itemOf('Кофе американо', 100, 2)] }],
    updatedAt: 1,
  };
  const res = day.updateMeal(base, 'm1', {
    addItems: [itemOf('Паста', 300, 160)], removeItemIds: [], setGrams: {},
  }, { nowMs: 2, clientId: 'c1' });

  assert.equal(res.meal.mealType, 'lunch', 'тип обновился');
  assert.equal(res.meal.name, 'Кофе Киндерли', 'название куратора осталось');
});

// ── Кофе-брейк ───────────────────────────────────────────────────────────

test('кофе с молоком и сиропом — кофе-брейк, а не перекус', () => {
  const meal = {
    id: 'm1', time: '15:15',
    items: [itemOf('Кофе американо', 100, 2), itemOf('Молоко ультрапастеризованное 3.5', 185, 61), itemOf('Сироп для кофе (классический сахарный)', 20, 300)],
  };
  const res = day.classifyMeal(meal, { meals: [] });
  assert.equal(res.mealType, 'coffee_break');
  assert.equal(res.name, 'Кофе-брейк');
});

test('кофе-брейк не зависит от времени суток', () => {
  for (const time of ['07:00', '13:00', '23:30']) {
    const meal = { id: 'm1', time, items: [itemOf('Капучино', 200, 60)] };
    assert.equal(day.classifyMeal(meal, { meals: [] }).mealType, 'coffee_break', `время ${time}`);
  }
});

test('кофе с твёрдой едой — уже перекус', () => {
  const meal = {
    id: 'm1', time: '15:15',
    items: [itemOf('Кофе американо', 100, 2), itemOf('Печенье овсяное', 40, 430)],
  };
  assert.equal(day.classifyMeal(meal, { meals: [] }).mealType, 'snack1');
});

test('стакан молока без кофе кофе-брейком не считается', () => {
  const meal = { id: 'm1', time: '15:15', items: [itemOf('Молоко 3.5', 200, 61)] };
  assert.notEqual(day.classifyMeal(meal, { meals: [] }).mealType, 'coffee_break');
});

test('печенье, добавленное в кофе-брейк, переводит его в перекус', () => {
  const base = {
    date: '2026-08-02',
    meals: [{ id: 'm1', time: '15:15', name: 'Кофе-брейк', mealType: 'coffee_break', items: [itemOf('Кофе американо', 100, 2)] }],
    updatedAt: 1,
  };
  const res = day.updateMeal(base, 'm1', {
    addItems: [itemOf('Печенье овсяное', 40, 430)], removeItemIds: [], setGrams: {},
  }, { nowMs: 2, clientId: 'c1' });

  assert.equal(res.meal.mealType, 'snack1');
  assert.equal(res.meal.name, 'Перекус');
  assert.ok(res.changed.some((c) => c.includes('тип → Перекус')), `changed: ${res.changed}`);
});

// ── Кэш съеденного и штампы полей ────────────────────────────────────────

test('запись приёма обновляет кэш съеденного, который читают календарь и пороги', () => {
  // Клиент записал завтрак сам — кэш от приложения.
  const base = {
    date: '2026-08-02',
    meals: [{ id: 'm1', time: '08:00', items: [itemOf('Каша', 200, 250)] }],
    savedEatenKcal: 500, savedEatenProt: 10, savedEatenCarbs: 60, savedEatenFat: 8,
    updatedAt: 1,
  };
  const meal = { id: 'm2', time: '13:00', items: [itemOf('Суп', 350, 90)] };
  const next = day.addMeal(base, meal, { nowMs: 2, clientId: 'c1' });

  const totals = day.macroTotals(next.meals);
  assert.equal(next.savedEatenKcal, totals.kcal, 'кэш калорий пересчитан по факту');
  assert.equal(next.savedEatenProt, totals.protein);
  assert.notEqual(next.savedEatenKcal, 500, 'протухшее значение не осталось');
});

test('удаление последнего приёма снимает кэш, а не оставляет калории призрака', () => {
  const base = {
    date: '2026-08-02',
    meals: [{ id: 'm1', time: '08:00', items: [itemOf('Каша', 200, 250)] }],
    savedEatenKcal: 500, savedEatenFiber: 4,
    updatedAt: 1,
  };
  const { day: next, removed } = day.deleteMeal(base, 'm1', { nowMs: 2, clientId: 'c1' });
  assert.equal(removed, true);
  assert.equal(next.savedEatenKcal, undefined);
  assert.equal(next.savedEatenFiber, undefined);
});

test('вода и шаги тоже держат кэш в актуальном состоянии', () => {
  const base = {
    date: '2026-08-02',
    meals: [{ id: 'm1', time: '08:00', items: [itemOf('Каша', 200, 250)] }],
    savedEatenKcal: 9999,
    updatedAt: 1,
  };
  const next = day.addWater(base, 200, { nowMs: 2, clientId: 'c1' });
  assert.equal(next.savedEatenKcal, day.macroTotals(base.meals).kcal);
});

test('поля со своим штампом в merge получают его при правке', () => {
  const base = { date: '2026-08-02', meals: [], updatedAt: 1 };
  const res = day.updateDayFields(base, {
    household_min: 45, sleep_note: 'просыпался', comment: 'тяжёлый день', steps: 7000,
  }, { nowMs: 777, clientId: 'c1' });

  assert.equal(res.day.householdUpdatedAt, 777);
  assert.equal(res.day.sleepNoteUpdatedAt, 777);
  assert.equal(res.day.dayCommentUpdatedAt, 777);
  assert.equal(res.day.stepsUpdatedAt, 777);
});

test('штамп не ставится полю, которого в правке не было', () => {
  const base = { date: '2026-08-02', meals: [], updatedAt: 1 };
  const res = day.updateDayFields(base, { steps: 7000 }, { nowMs: 777, clientId: 'c1' });
  assert.equal(res.day.stepsUpdatedAt, 777);
  assert.equal(res.day.householdUpdatedAt, undefined);
  assert.equal(res.day.dayCommentUpdatedAt, undefined);
});

// ── Йогурт/кефир/смузи — это еда, а не «жидкое» для подсчёта основного приёма ──

test('гречка, йогурт и сыр — обед, йогурт не выпадает из подсчёта еды', () => {
  // Реальный случай из живого дневника: 3 позиции, но БЕЗ фикса «беверидж-like»
  // список (BEVERAGE_LIKE_PATTERNS включает /йогурт/i) исключал бы йогурт из
  // еды, оставляя гречку+сыр (185 г, 241 ккал) — ниже порога, и обед стал бы
  // перекусом.
  const meal = {
    id: 'm1', time: '14:28',
    items: [itemOf('Гречка отварная', 165, 109), itemOf('Греческий йогурт 2', 90, 48), itemOf('Сыр твёрдый классический', 20, 305)],
  };
  const res = day.classifyMeal(meal, { meals: [] });
  assert.equal(res.mealType, 'lunch');
});

test('кефир и смузи считаются едой при подсчёте продуктов приёма', () => {
  const meal = {
    id: 'm1', time: '08:00',
    items: [itemOf('Кефир', 200, 55), itemOf('Смузи ягодный', 150, 70), itemOf('Овсяные хлопья', 60, 350)],
  };
  const res = day.classifyMeal(meal, { meals: [] });
  assert.equal(res.mealType, 'breakfast');
});

test('но кофе с йогуртом вместо молока в кофе-брейк не превращается — йогурт не входит в COFFEE_COMPANION', () => {
  const meal = { id: 'm1', time: '15:15', items: [itemOf('Кофе американо', 100, 2), itemOf('Йогурт питьевой', 150, 60)] };
  const res = day.classifyMeal(meal, { meals: [] });
  assert.notEqual(res.mealType, 'coffee_break');
});

// --- Норма дня -------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const webMirror = require('../lib/web-mirror');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MIRROR_DIR = path.join(__dirname, '..', 'lib', 'web-mirror');

/** Профиль, которого хватает на расчёт: вес, рост, возраст, пол. */
const FULL_PROFILE = { weight: 80, height: 180, age: 40, gender: 'Мужской', deficitPctTarget: -15 };
/** Проценты как в карточке клиента: белок 25, углеводы 40, жиры — остаток 35. */
const NORMS = { proteinPct: 25, carbsPct: 40, simpleCarbPct: 20, fiberPct: 14, badFatPct: 30, superbadFatPct: 1 };

test('зеркала apps/web совпадают с оригиналом побайтово', () => {
  for (const file of webMirror.MIRRORED_FILES) {
    const source = path.join(REPO_ROOT, webMirror.SOURCE_DIR, file);
    if (!fs.existsSync(source)) continue; // деплой-архив без apps/web — не наш случай
    assert.equal(
      fs.readFileSync(path.join(MIRROR_DIR, file), 'utf8'),
      fs.readFileSync(source, 'utf8'),
      `lib/web-mirror/${file} разошёлся с ${webMirror.SOURCE_DIR}/${file}. `
      + `Чинить: cp ${webMirror.SOURCE_DIR}/${file} yandex-cloud-functions/heys-mcp/lib/web-mirror/${file}`,
    );
  }
});

/**
 * Окно прошлых дней в том виде, в каком его читает `loadNormInputs`:
 * блобы за date−1 … date−4. Четвёртый нужен самому раннему дню окна для NDTE.
 */
function pastBlobs(kcalPerDay, extra = {}) {
  const out = {};
  for (const [date, back] of [['2026-08-07', 1], ['2026-08-06', 2], ['2026-08-05', 3], ['2026-08-04', 4]]) {
    out[date] = {
      date,
      weightMorning: 80,
      meals: [{ id: `m-${back}`, items: [{ grams: 100, kcal100: kcalPerDay }] }],
      ...extra,
    };
  }
  return out;
}

const TODAY = { date: '2026-08-08', weightMorning: 80, meals: [] };
/** Момент «сейчас» задаём явно: калорийный NDTE от nowMs больше не зависит. */
const AT_MSK_NOON_08 = Date.parse('2026-08-08T09:00:00Z');
const WITH_WINDOW = (blobs) => ({
  profile: FULL_PROFILE, norms: NORMS, hrZones: [],
  nowMs: AT_MSK_NOON_08, prevDay: null, pastBlobs: blobs,
});

test('норма считается сервером целиком: база плюс надбавка за накопленный недобор', () => {
  // База пустого дня — 1471. Три дня по 1100 ккал (75% нормы — выше порога
  // доверия) дают недобор 1113 ккал, ядро приложения возвращает 75% за 3 дня.
  const norm = day.dailyNorm(TODAY, WITH_WINDOW(pastBlobs(1100)));

  assert.equal(norm.source, 'computed');
  assert.equal(norm.parts.base, 1471);
  assert.equal(norm.parts.window_days, 3);
  assert.equal(norm.parts.correction, 278);
  assert.equal(norm.kcal, 1749);
  assert.match(norm.note, /накопленный недобор/);
});

// Вопрос «покажи норму с дефицитом и без» 22.08.2026 стоил лишнего
// heys_get_profile — и тот ответил молчанием: поле не задано, в карточке не
// печатается. Оба числа приходят вместе с нормой.
test('норма несёт поддержание и целевой дефицит рядом с собой', () => {
  const norm = day.dailyNorm(TODAY, WITH_WINDOW(pastBlobs(1100)));

  assert.equal(norm.parts.deficit_pct, -15);
  assert.ok(norm.parts.maintenance > norm.parts.base, 'без дефицита расход выше');
  // 1471 = round(1730 * 0.85): база уже посчитана с дефицитом, поддержание —
  // тот же расход до умножения, а не обратное деление round'а на round.
  assert.equal(norm.parts.maintenance, 1730);
  assert.match(norm.note, /Целевой дефицит 15% уже учтён: без него расход дня — \d+ ккал/);
});

test('дефицит не задан — норма прямо называет себя поддержанием', () => {
  const norm = day.dailyNorm(TODAY, {
    ...WITH_WINDOW(pastBlobs(1100)),
    profile: { ...FULL_PROFILE, deficitPctTarget: 0 },
  });

  assert.equal(norm.parts.deficit_pct, 0);
  assert.equal(norm.parts.maintenance, norm.parts.base);
  assert.match(norm.note, /Целевой дефицит в профиле не задан \(0%\) — это норма поддержания/);
});

test('кэш отрисовки на число больше не влияет, но расхождение с ним названо', () => {
  // Ровно случай 07.08.2026: клиент смотрел день до того, как данные доехали.
  const stale = { ...TODAY, savedDisplayOptimum: 1282 };
  const norm = day.dailyNorm(stale, WITH_WINDOW(pastBlobs(1100)));

  assert.equal(norm.source, 'computed');
  assert.equal(norm.kcal, 1749, 'число берётся из расчёта, а не из кэша');
  assert.equal(norm.parts.client_saw, 1282);
  assert.match(norm.note, /Клиент последний раз видел 1282 ккал/);
});

test('дрейф активности не считает назначенную тренировку доехавшей в день', () => {
  // Кэш отрисовки писался, когда тренировок в дне не было. Назначение куратора
  // добавилось после, но человек его не выполнял — «в день доехало: тренировка
  // 0 мин → 40 мин» было бы прямой ложью.
  const withPlan = {
    ...TODAY, savedDisplayOptimum: 1282,
    savedOptimumMeta: { trainingMin: 0, steps: 0, householdMin: 0, weight: 80 },
    trainings: [ASSIGNED],
  };
  const planned = day.dailyNorm(withPlan, WITH_WINDOW(pastBlobs(1100)));
  assert.doesNotMatch(planned.note, /тренировка/);

  // Та же запись со статусом 'started' — уже факт, и дрейф её обязан назвать.
  const started = day.dailyNorm(
    { ...withPlan, trainings: [{ ...ASSIGNED, plan: { status: 'started' } }] },
    WITH_WINDOW(pastBlobs(1100)),
  );
  assert.match(started.note, /тренировка 0 мин → 40 мин/);
});

test('при переборе норма мягко снижается, а не наказывает', () => {
  const norm = day.dailyNorm(TODAY, WITH_WINDOW(pastBlobs(2600)));

  assert.equal(norm.source, 'computed');
  assert.ok(norm.parts.correction < 0, `ожидали снижение, получили ${norm.parts.correction}`);
  // Потолок снижения — 10% от нормы, и оно всегда мягче перебора.
  assert.ok(Math.abs(norm.parts.correction) <= Math.round(1471 * 0.1));
  assert.equal(norm.kcal, 1471 + norm.parts.correction);
  assert.match(norm.note, /мягкое снижение/);
});

test('загрузочный день поднимает норму и перебивает долг', () => {
  const refeed = { ...TODAY, isRefeedDay: true };
  const norm = day.dailyNorm(refeed, WITH_WINDOW(pastBlobs(1100)));

  assert.equal(norm.source, 'computed');
  // +35% из heys_refeed_v1.js — своей копии константы у сервера нет.
  assert.equal(norm.kcal, 1986);
  assert.match(norm.note, /Загрузочный день|загрузочный день/);
});

test('без окна прошлых дней норма честно помечается оценкой', () => {
  const norm = day.dailyNorm(TODAY, {
    profile: FULL_PROFILE, norms: NORMS, hrZones: [], nowMs: AT_MSK_NOON_08, prevDay: null,
  });
  assert.equal(norm.source, 'estimate');
  assert.equal(norm.kcal, 1471);
  assert.equal(norm.parts.window_days, 0);
  assert.match(norm.note, /история за прошлые дни недоступна/);
});

test('день с неполными данными в окно долга не попадает', () => {
  // Меньше трети нормы — данные внесены не полностью; окно схлопывается, и
  // считать долг не на чем.
  const norm = day.dailyNorm(TODAY, WITH_WINDOW(pastBlobs(300)));
  assert.equal(norm.parts.window_days, 3);
  assert.equal(norm.source, 'computed');
  assert.equal(norm.parts.correction, 0, 'дни ниже порога ядро отсеивает само');
  assert.match(norm.note, /слишком мало еды/);
});

/** Вчерашняя тренировка, которой хватает на надбавку (порог 300 ккал). */
const PREV_DAY_TRAINING = { date: '2026-08-01', trainings: [{ z: [0, 0, 60, 30], type: 'cardio', time: '18:00' }] };
const AT_MSK_NOON = Date.parse('2026-08-02T09:00:00Z');

test('надбавка за вчерашнюю тренировку считается сервером из блоба за прошлый день', () => {
  const today = { date: '2026-08-02', weightMorning: 80, meals: [] };
  const base = { profile: FULL_PROFILE, norms: NORMS, hrZones: [], nowMs: AT_MSK_NOON };

  const without = day.dailyNorm(today, { ...base, prevDay: null });
  const with_ = day.dailyNorm(today, { ...base, prevDay: PREV_DAY_TRAINING });

  assert.equal(without.parts.ndte, 0);
  assert.equal(without.kcal, 1471);
  assert.equal(with_.parts.ndte, 123);
  assert.equal(with_.kcal, 1575);
});

test('назначенная вчера тренировка не даёт серверной надбавки', () => {
  const today = { date: '2026-08-02', weightMorning: 80, meals: [] };
  const base = { profile: FULL_PROFILE, norms: NORMS, hrZones: [], nowMs: AT_MSK_NOON };
  const plannedPrev = {
    date: '2026-08-01',
    trainings: [{ ...PREV_DAY_TRAINING.trainings[0], plan: { status: 'assigned' } }],
  };

  const planned = day.dailyNorm(today, { ...base, prevDay: plannedPrev });
  const empty = day.dailyNorm(today, { ...base, prevDay: null });

  // День с назначенным планом обязан совпасть с днём без тренировки вовсе:
  // отсекаются и калории, и множитель за количество, и тип первой строки.
  assert.equal(planned.parts.ndte, empty.parts.ndte);
  assert.equal(planned.kcal, empty.kcal);
});

test('начатая вчера тренировка надбавку по-прежнему даёт', () => {
  const today = { date: '2026-08-02', weightMorning: 80, meals: [] };
  const base = { profile: FULL_PROFILE, norms: NORMS, hrZones: [], nowMs: AT_MSK_NOON };
  const startedPrev = {
    date: '2026-08-01',
    trainings: [{ ...PREV_DAY_TRAINING.trainings[0], plan: { status: 'started' } }],
  };

  const started = day.dailyNorm(today, { ...base, prevDay: startedPrev });
  const plain = day.dailyNorm(today, { ...base, prevDay: PREV_DAY_TRAINING });

  assert.equal(started.parts.ndte, plain.parts.ndte);
  assert.equal(started.kcal, plain.kcal);
});

test('назначенная не подменяет тип и не удваивает счётчик при реальной тренировке рядом', () => {
  const today = { date: '2026-08-02', weightMorning: 80, meals: [] };
  const base = { profile: FULL_PROFILE, norms: NORMS, hrZones: [], nowMs: AT_MSK_NOON };
  const mixedPrev = {
    date: '2026-08-01',
    trainings: [
      { z: [0, 0, 0, 90], type: 'strength', time: '19:00', plan: { status: 'assigned' } },
      PREV_DAY_TRAINING.trainings[0],
    ],
  };

  const mixed = day.dailyNorm(today, { ...base, prevDay: mixedPrev });
  const plain = day.dailyNorm(today, { ...base, prevDay: PREV_DAY_TRAINING });

  assert.equal(mixed.parts.ndte, plain.parts.ndte);
});

test('калорийная надбавка не зависит от nowMs: среднее за HEYS-день, не живой снимок', () => {
  const today = { date: '2026-08-02', weightMorning: 80, meals: [] };
  const base = { profile: FULL_PROFILE, norms: NORMS, hrZones: [], prevDay: PREV_DAY_TRAINING };

  const later = day.dailyNorm(today, { ...base, nowMs: AT_MSK_NOON });
  const sooner = day.dailyNorm(today, { ...base, nowMs: Date.parse('2026-08-02T21:00:00Z') });

  assert.equal(later.parts.ndte, sooner.parts.ndte);
  assert.equal(later.kcal, sooner.kcal);
  assert.equal(later.parts.ndte, 123);
});

test('тип и час NDTE берутся с одной тренировки — max(time)', () => {
  const today = { date: '2026-08-02', weightMorning: 80, meals: [] };
  const base = { profile: FULL_PROFILE, norms: NORMS, hrZones: [], nowMs: AT_MSK_NOON };
  const mixedPrev = {
    date: '2026-08-01',
    trainings: [
      { z: [0, 0, 60, 30], type: 'strength', time: '10:00' },
      { z: [0, 0, 60, 30], type: 'cardio', time: '19:00' },
    ],
  };
  const bothCardio = {
    date: '2026-08-01',
    trainings: [
      { z: [0, 0, 60, 30], type: 'cardio', time: '10:00' },
      { z: [0, 0, 60, 30], type: 'cardio', time: '19:00' },
    ],
  };
  const mixed = day.dailyNorm(today, { ...base, prevDay: mixedPrev });
  const cardio = day.dailyNorm(today, { ...base, prevDay: bothCardio });
  assert.equal(mixed.parts.ndte, cardio.parts.ndte);
});

test('тренировка без time даёт константу 0.8 весь день, не выдуманный старт в 03:00', () => {
  const today = { date: '2026-08-02', weightMorning: 80, meals: [] };
  const base = { profile: FULL_PROFILE, norms: NORMS, hrZones: [], nowMs: AT_MSK_NOON };
  const noTime = day.dailyNorm(today, {
    ...base,
    prevDay: { date: '2026-08-01', trainings: [{ z: [0, 0, 60, 30], type: 'cardio' }] },
  });
  assert.equal(noTime.parts.ndte, 138);
  assert.equal(noTime.kcal, 1588);
});

test('клиентский TDEE и dailyNorm дают одну надбавку на одном блобе', () => {
  const today = { date: '2026-08-02', weightMorning: 80, meals: [] };
  const lsGet = (key) => (key === 'heys_dayv2_2026-08-01' ? PREV_DAY_TRAINING : null);
  const client = webMirror.calculateTDEE(today, FULL_PROFILE, { lsGet, hrZones: [], includeNDTE: true });
  const server = day.dailyNorm(today, {
    profile: FULL_PROFILE, norms: NORMS, hrZones: [], nowMs: AT_MSK_NOON, prevDay: PREV_DAY_TRAINING,
  });
  assert.equal(client.ndteBoost, server.parts.ndte);
});

test('среднее итогового буста после потолка, не потолок среднего decay', () => {
  const iw = webMirror.insulinWaveInternals();
  const pieces = [
    { hours: 4, hoursSince: 6 },
    { hours: 12, hoursSince: 18 },
    { hours: 8, hoursSince: 30 },
  ];
  const params = { trainingKcal: 900, bmi: 32, trainingType: 'strength', trainingsCount: 3 };
  const avg = iw.calculateNDTEDayAverage({ ...params, pieces });
  const avgDecay = (4 * 1 + 12 * 0.8 + 8 * 0.5) / 24;
  const wrong = Math.min(0.20, Math.round(0.3024 * avgDecay * 1000) / 1000);
  assert.equal(wrong, 0.20);
  assert.notEqual(avg.tdeeBoost, 0.20);
  assert.equal(avg.tdeeBoost, iw.averageCappedNdteBoost(params, pieces));
});

test('мгновенный calculateNDTE для волны держит окно 48ч', () => {
  const iw = webMirror.insulinWaveInternals();
  const live = iw.calculateNDTE({
    trainingKcal: 500, hoursSince: 10, bmi: 22, trainingType: 'cardio', trainingsCount: 1,
  });
  const expired = iw.calculateNDTE({
    trainingKcal: 500, hoursSince: 48, bmi: 22, trainingType: 'cardio', trainingsCount: 1,
  });
  assert.equal(live.active, true);
  assert.ok(live.tdeeBoost > 0);
  assert.equal(expired.active, false);
  assert.equal(expired.tdeeBoost, 0);
});

test('резолвер и dailyNorm дают один kcal; ложный savedDisplayOptimum его не меняет', () => {
  const blob = {
    date: '2026-08-02', weightMorning: 80, meals: [], savedDisplayOptimum: 1,
  };
  const inputs = {
    profile: FULL_PROFILE, norms: NORMS, hrZones: [], prevDay: PREV_DAY_TRAINING,
  };
  const resolved = webMirror.resolveDayNorm(blob, FULL_PROFILE, {
    prevDay: PREV_DAY_TRAINING, lsGet: () => null,
  });
  const server = day.dailyNorm(blob, inputs);
  assert.equal(resolved.kcal, server.kcal);
  assert.ok(resolved.kcal > 1000);
  assert.notEqual(resolved.kcal, 1);
  assert.equal(server.parts.client_saw, 1);
});

test('без окна долга — estimate; с pastBlobs — computed и та же база', () => {
  const today = { date: '2026-08-08', weightMorning: 80, meals: [] };
  const before = day.dailyNorm(today, {
    profile: FULL_PROFILE, norms: NORMS, hrZones: [], prevDay: null,
  });
  const after = day.dailyNorm(today, WITH_WINDOW(pastBlobs(1100)));
  assert.equal(before.source, 'estimate');
  assert.equal(after.source, 'computed');
  assert.equal(before.parts.base, after.parts.base);
  assert.ok(after.parts.correction !== 0);
});

test('лёгкая вчерашняя активность надбавки не даёт', () => {
  const norm = day.dailyNorm(
    { date: '2026-08-02', weightMorning: 80, meals: [] },
    {
      profile: FULL_PROFILE, norms: NORMS, hrZones: [], nowMs: AT_MSK_NOON,
      prevDay: { trainings: [{ z: [10, 0, 0, 0], time: '18:00' }] },
    },
  );
  assert.equal(norm.parts.ndte, 0);
  assert.equal(norm.kcal, 1471);
});

test('если вчерашний день не читали, надбавка берётся из отпечатка', () => {
  // prevDay: undefined — «не читали»: лучше взять сохранённое, чем занулить.
  const norm = day.dailyNorm(
    {
      date: '2026-08-02', weightMorning: 80, meals: [],
      savedOptimumMeta: { optimum: 1641, correction: 0, ndte: 200 },
    },
    { profile: FULL_PROFILE, norms: NORMS, hrZones: [] },
  );
  assert.equal(norm.parts.ndte, 200);
  assert.equal(norm.kcal, 1641);
});

test('без сохранённой цифры норма считается и помечается как оценка', () => {
  const norm = day.dailyNorm(
    { date: '2026-08-01', weightMorning: 80, steps: 8000, trainings: [{ z: [0, 30, 0, 0] }], householdMin: 60, meals: [] },
    { profile: FULL_PROFILE, norms: NORMS, hrZones: [] },
  );
  assert.equal(norm.source, 'estimate');
  // Ровно то, что отдаёт зеркало apps/web/heys_tdee_v1.js на тех же входах
  // (после heys/798770 — g/kg белок в макросах, TDEE-часть без изменений формулы).
  assert.equal(norm.kcal, 2116);
  assert.match(norm.note, /оценка/i);
});

test('возраст берётся из даты рождения, даже когда в профиле лежит протухший age', () => {
  // Реальный случай 2026-08-08: в блобе профиля осталось `age: 30` при дате
  // рождения 1988 года. BMR считался как для тридцатилетнего — +40 ккал каждый
  // день, и в приложении, и в коннекторе, потому что оба брали поле, а не дату.
  const day2 = { date: '2026-08-08', weightMorning: 91.2, meals: [] };
  const profile = { weight: 91.2, height: 183, gender: 'Мужской', deficitPctTarget: -10 };

  const stale = day.dailyNorm(day2, { profile: { ...profile, age: 30 }, norms: NORMS, hrZones: [] });
  const withBirth = day.dailyNorm(day2, {
    profile: { ...profile, age: 30, birthDate: '1988-06-25' }, norms: NORMS, hrZones: [],
  });

  assert.equal(stale.parts.base, 1720); // BMR 1911 (возраст 30) × 0.9
  assert.equal(withBirth.parts.base, 1684); // BMR 1871 (возраст 38) × 0.9
});

test('активность считается над покоем, а не поверх BMR целиком', () => {
  const base = { date: '2026-08-01', weightMorning: 80, meals: [] };
  const inputs = { profile: FULL_PROFILE, norms: NORMS, hrZones: [] };
  const rest = day.dailyNorm(base, inputs).kcal;
  const withHousehold = day.dailyNorm({ ...base, householdMin: 60 }, inputs).kcal;

  // 60 минут быта: нетто-MET 1.5 при 80 кг = 2.1 ккал/мин → 126 ккал,
  // с дефицитом −15% это +107 к норме. По брутто-MET 2.5 вышло бы +178.
  assert.equal(withHousehold - rest, 107);
});

test('оценка не подставляет дефолты приложения при пустом профиле', () => {
  for (const profile of [null, {}, { weight: 80 }, { weight: 80, height: 180, age: 40 }]) {
    const norm = day.dailyNorm({ date: '2026-08-01', meals: [] }, { profile, norms: NORMS, hrZones: [] });
    assert.equal(norm.source, null, `профиль ${JSON.stringify(profile)}: норму выдумали`);
    assert.equal(norm.kcal, null);
    assert.equal(norm.protein_g, null);
    // 1618 — то, что приложение молча посчитало бы по 70 кг / 30 лет / 170 см.
    assert.ok(!/1618/.test(norm.note));
  }
});

test('возраст берётся из даты рождения, когда поля age в профиле нет', () => {
  const byAge = day.dailyNorm(
    { date: '2026-08-01', meals: [] },
    { profile: { weight: 80, height: 180, age: 40, gender: 'Мужской' }, norms: NORMS, hrZones: [] },
  );
  const byBirthDate = day.dailyNorm(
    { date: '2026-08-01', meals: [] },
    { profile: { weight: 80, height: 180, birthDate: '1986-01-01', gender: 'Мужской' }, norms: NORMS, hrZones: [] },
  );
  assert.equal(byAge.source, 'estimate');
  assert.equal(byBirthDate.source, 'estimate');
  assert.equal(byBirthDate.kcal, byAge.kcal);
});

test('граммы БЖУ считаются по коэффициентам приложения, жиры — остатком', () => {
  const dayBlob = { date: '2026-08-01', weightMorning: 80, meals: [] };
  const norm = day.dailyNorm(dayBlob, { profile: FULL_PROFILE, norms: NORMS, hrZones: [] });
  // heys/798770: белок от массы через computeDisplayNorms, не от proteinPct×kcal.
  const kcal = norm.kcal;
  const abs = webMirror.computeDailyNorms(kcal, NORMS, {
    profile: FULL_PROFILE,
    day: dayBlob,
  });
  assert.equal(norm.protein_g, Math.round(abs.prot * 10) / 10);
  assert.equal(norm.carbs_g, Math.round(abs.carbs * 10) / 10);
  assert.equal(norm.fat_g, Math.round(abs.fat * 10) / 10);
});

test('MCP dailyNorm: белок g/kg по профилю клиента, не дефолт 70 кг (heys/798770)', () => {
  const alexDay = { date: '2026-08-18', weightMorning: 52.7, steps: 0, meals: [] };
  const alexProfile = {
    weight: 52.7, height: 162, gender: 'Женский', weightGoal: 50, deficitPctTarget: -15,
    birthDate: '1992-03-15',
  };
  const alexNorm = day.dailyNorm(alexDay, {
    profile: alexProfile,
    norms: { proteinPct: 28, carbsPct: 40 },
    hrZones: [],
  });
  assert.ok(alexNorm.protein_g >= 83 && alexNorm.protein_g <= 86, `Александра: ${alexNorm.protein_g} g`);

  const antonDay = { date: '2026-08-18', weightMorning: 89.9, steps: 0, meals: [] };
  const antonProfile = {
    weight: 89.9, height: 183, gender: 'Мужской', weightGoal: 80, deficitPctTarget: 0,
    birthDate: '1988-06-25',
  };
  const antonNorm = day.dailyNorm(antonDay, {
    profile: antonProfile,
    norms: { proteinPct: 20.5, carbsPct: 46 },
    hrZones: [],
  });
  assert.ok(antonNorm.protein_g >= 160 && antonNorm.protein_g <= 166, `Антон: ${antonNorm.protein_g} g`);
});

test('пустые проценты БЖУ не превращаются в «жиры 100% калорий»', () => {
  const norm = day.dailyNorm(
    { date: '2026-08-01', weightMorning: 80, meals: [] },
    { profile: FULL_PROFILE, norms: {}, hrZones: [] },
  );
  assert.ok(norm.kcal > 0, 'калорийная норма известна и остаётся');
  assert.equal(norm.protein_g, null);
  assert.equal(norm.fat_g, null);
  assert.equal(norm.reason, 'no_norms');
});

test('норма показывает остаток по калориям и каждому макросу', () => {
  const norm = day.dailyNorm(
    {
      date: '2026-08-01',
      weightMorning: 80,
      meals: [{ id: 'm1', items: [{ name: 'Каша', grams: 200, kcal100: 100, protein100: 10, simple100: 20, complex100: 0, badFat100: 2, goodFat100: 1 }] }],
    },
    { profile: FULL_PROFILE, norms: NORMS, hrZones: [] },
  );
  assert.equal(norm.left.kcal, norm.kcal - 200);
  assert.equal(norm.left.protein, Math.round((norm.protein_g - 20) * 10) / 10);
  assert.equal(norm.left.carbs, Math.round((norm.carbs_g - 40) * 10) / 10);
  assert.equal(norm.left.fat, Math.round((norm.fat_g - 6) * 10) / 10);
});

test('пульсовые зоны клиента влияют на оценку так же, как в приложении', () => {
  const dayData = { date: '2026-08-01', weightMorning: 80, trainings: [{ z: [0, 30, 0, 0] }], meals: [] };
  const withDefaults = day.dailyNorm(dayData, { profile: FULL_PROFILE, norms: NORMS, hrZones: [] });
  const zones = [{ MET: 2 }, { MET: 12 }, { MET: 8 }, { MET: 10 }];
  const withZones = day.dailyNorm(dayData, { profile: FULL_PROFILE, norms: NORMS, hrZones: zones });
  assert.ok(withZones.kcal > withDefaults.kcal, 'MET второй зоны поднят вдвое — норма обязана вырасти');
});

test('без доступа к профилю и нормам норма честно не рассчитана', () => {
  const norm = day.dailyNorm({ date: '2026-08-01', savedDisplayOptimum: 1900, meals: [] }, null);
  assert.equal(norm.source, null);
  assert.equal(norm.kcal, null);
  assert.equal(norm.reason, 'no_inputs');
});

test('оценка учитывает день цикла — множитель берётся из зеркала apps/web', () => {
  const profile = { weight: 60, height: 165, age: 30, gender: 'Женский' };
  const plain = day.dailyNorm({ date: '2026-08-01', meals: [] }, { profile, norms: NORMS, hrZones: [] });
  // День 2 — менструальная фаза, приложение поднимает норму на 5%.
  const cycle = day.dailyNorm({ date: '2026-08-01', cycleDay: 2, meals: [] }, { profile, norms: NORMS, hrZones: [] });
  assert.equal(cycle.kcal, Math.round(plain.kcal * 1.05));
});

test('patchSupplementsPlanned — add/remove не трогают остальные id', () => {
  const base = { date: '2026-08-01', meals: [], waterMl: 0, supplementsPlanned: ['vitD', 'omega3'] };
  const added = day.patchSupplementsPlanned(base, { add: ['magnesium'] }, { nowMs: 1000, clientId: CLIENT });
  assert.deepEqual(added.supplementsPlanned, ['vitD', 'omega3', 'magnesium']);
  const removed = day.patchSupplementsPlanned(added, { remove: ['omega3'] }, { nowMs: 2000, clientId: CLIENT });
  assert.deepEqual(removed.supplementsPlanned, ['vitD', 'magnesium']);
});

test('markSupplementsTaken — пишет supplementsTaken и время по id', () => {
  const base = { date: '2026-08-01', meals: [], waterMl: 0 };
  const marked = day.markSupplementsTaken(base, ['vitD', 'b12'], true, {
    nowMs: Date.UTC(2026, 7, 1, 6, 30),
    clientId: CLIENT,
  });
  assert.deepEqual(marked.supplementsTaken, ['vitD', 'b12']);
  assert.equal(marked.supplementsTakenAt.vitD, '09:30');
  assert.equal(marked.supplementsTakenAt.b12, '09:30');
});

test('filterSupplementsByTimingSlot — утро включает morning и empty', () => {
  const ids = ['vitD', 'b12', 'magnesium', 'iron'];
  const morning = day.filterSupplementsByTimingSlot(ids, 'morning', null);
  assert.deepEqual(morning, ['b12', 'iron']);
  const evening = day.filterSupplementsByTimingSlot(ids, 'evening', null);
  assert.deepEqual(evening, ['magnesium']);
});

test('applyPlannedSupplementsToProfile — add в курс', () => {
  const profile = { plannedSupplements: ['vitD'] };
  const patch = day.applyPlannedSupplementsToProfile(profile, { planned_supplements_add: ['omega3'] }, 5000);
  assert.deepEqual(patch.planned, ['vitD', 'omega3']);
  assert.equal(patch.changed.length, 1);
});

test('applyRefeedDay — отмечает и снимает загрузочный день', () => {
  const base = { date: '2026-08-07', meals: [], waterMl: 0 };
  const marked = day.applyRefeedDay(base, true, 'training', { nowMs: 1000, clientId: CLIENT });
  assert.equal(marked.isRefeedDay, true);
  assert.equal(marked.refeedReason, 'training');
  const cleared = day.applyRefeedDay(marked, false, null, { nowMs: 2000, clientId: CLIENT });
  assert.equal(cleared.isRefeedDay, false);
  assert.equal(cleared.refeedReason, null);
});

test('applyRefeedDay — без причины отклоняет', () => {
  const base = { date: '2026-08-07', meals: [], waterMl: 0 };
  assert.throws(
    () => day.applyRefeedDay(base, true, 'magic', { nowMs: 1000, clientId: CLIENT }),
    /invalid_refeed_reason/,
  );
});

test('summarizeDay — refeed в сводке дня', () => {
  const summary = day.summarizeDay({
    date: '2026-08-07',
    meals: [],
    waterMl: 0,
    isRefeedDay: true,
    refeedReason: 'holiday',
  });
  assert.equal(summary.is_refeed_day, true);
  assert.equal(summary.refeed_reason, 'holiday');
});

// ── Регрессы по аудиту 2026-08-08 ────────────────────────────────────────

test('две однотипные тренировки получают РАЗНЫЕ подписи для tombstone', () => {
  // Корень дефекта: source: 'curator_mcp' проставляется всегда, поэтому в
  // trainingDeletionSignature всегда срабатывает ветка по полям, а запасной
  // путь по зонам мёртв. Две кардио без времени давали одну подпись, и
  // удаление одной гасило обе. Лечится уникальным id.
  const base = day.emptyDay('2026-08-01', CLIENT, 1000);
  const a = day.addTraining(base, [30], { type: 'cardio' }, { nowMs: 2000, clientId: CLIENT }).day;
  const b = day.addTraining(a, [45], { type: 'cardio' }, { nowMs: 3000, clientId: CLIENT }).day;
  assert.notEqual(b.trainings[0].id, b.trainings[1].id);
});

test('удаление гасит ровно одну тренировку и не трогает соседнюю', () => {
  const base = day.emptyDay('2026-08-01', CLIENT, 1000);
  let d = day.addTraining(base, [30], { type: 'cardio' }, { nowMs: 2000, clientId: CLIENT }).day;
  d = day.addTraining(d, [45], { type: 'cardio' }, { nowMs: 3000, clientId: CLIENT }).day;
  const survivorId = d.trainings[1].id;
  const res = day.deleteTraining(d, 0, { nowMs: 4000, clientId: CLIENT });

  assert.equal(res.error, null);
  assert.equal(res.day.deletedTrainings.length, 1);
  // Подпись адресная — по id, а не по набору полей.
  assert.match(res.day.deletedTrainings[0].signature, /^id:tr_/);
  // Уцелевшая тренировка на месте и её id не попал в tombstone.
  assert.equal(res.day.trainings[0].id, survivorId);
  assert.notEqual(res.day.deletedTrainings[0].signature, `id:${survivorId}`);
});

test('удаление не обрезает список и поднимает штамп оставшимся', () => {
  // slice(0, 3) терял четвёртую тренировку без tombstone. Плюс позиционный
  // merge: у наших записей свой updatedAt, и после сдвига строка сравнивалась
  // бы с чужой позицией.
  const base = {
    ...day.emptyDay('2026-08-01', CLIENT, 1000),
    trainings: [
      { id: 'tr_a', z: [10, 0, 0, 0], type: 'cardio', updatedAt: 1000 },
      { id: 'tr_b', z: [20, 0, 0, 0], type: 'cardio', updatedAt: 5000 },
      { id: 'tr_c', z: [30, 0, 0, 0], type: 'cardio', updatedAt: 2000 },
      { id: 'tr_d', z: [40, 0, 0, 0], type: 'cardio', updatedAt: 3000 },
    ],
  };
  const res = day.deleteTraining(base, 0, { nowMs: 9000, clientId: CLIENT });
  const ids = res.day.trainings.filter((t) => t.id).map((t) => t.id);
  assert.deepEqual(ids, ['tr_b', 'tr_c', 'tr_d'], 'четвёртая тренировка не потерялась');
  for (const t of res.day.trainings.filter((x) => x.id)) {
    assert.equal(t.updatedAt, 9000, 'штамп поднят у всех — иначе сдвиг ломает merge');
  }
});

test('четвёртая тренировка за день отбивается, а не пишется молча', () => {
  let d = day.emptyDay('2026-08-01', CLIENT, 1000);
  for (let i = 0; i < 3; i += 1) {
    const r = day.addTraining(d, [30], { type: 'cardio' }, { nowMs: 2000 + i, clientId: CLIENT });
    assert.equal(r.error, null);
    d = r.day;
  }
  assert.equal(day.addTraining(d, [30], null, { nowMs: 9000, clientId: CLIENT }).error, 'too_many');
});

test('минуты зоны не превышают суток', () => {
  const base = day.emptyDay('2026-08-01', CLIENT, 1000);
  const { day: next } = day.addTraining(base, [999999], null, { nowMs: 2000, clientId: CLIENT });
  assert.equal(next.trainings[0].z[0], 1440);
});

test('buildWorkoutLog держит потолки и не принимает булев как число', () => {
  const ok = [{ name: 'Жим', approaches: [{ weight_kg: 40, reps: 10 }] }];
  assert.equal(day.buildWorkoutLog(ok).error, undefined);

  const many = Array.from({ length: 31 }, () => ({ name: 'X', approaches: [{ reps: 1 }] }));
  assert.match(day.buildWorkoutLog(many).error, /Слишком много упражнений/);

  const manyAps = [{ name: 'X', approaches: Array.from({ length: 31 }, () => ({ reps: 1 })) }];
  assert.match(day.buildWorkoutLog(manyAps).error, /максимум 30/);

  // Number(true) === 1 и Number([]) === 0 раньше проходили как вес и повторы.
  assert.match(day.buildWorkoutLog([{ name: 'X', approaches: [{ reps: true }] }]).error, /reps/);
  assert.match(day.buildWorkoutLog([{ name: 'X', approaches: [{ reps: 5, weight_kg: [] }] }]).error, /weight_kg/);
  assert.match(day.buildWorkoutLog([{ name: 123, approaches: [{ reps: 5 }] }]).error, /название/);
  assert.match(day.buildWorkoutLog([{ name: 'X'.repeat(101), approaches: [{ reps: 5 }] }]).error, /длиннее/);
});

test('workoutLog пишется в форме приложения: version и zoneMinutes на месте', () => {
  const { log } = day.buildWorkoutLog([{ name: 'Жим', approaches: [{ weight_kg: 40, reps: 10 }] }], { durationMin: 52 });
  assert.equal(log.version, 1);
  assert.deepEqual(log.zoneMinutes, [0, 52, 0, 0]);
  assert.equal(log.totalDurationMinutes, 52);
  assert.match(log.exercises[0].id, /^ex_[0-9a-f]{12}$/);
});

test('разминочный подход помечается типом, рабочий остаётся без поля', () => {
  const { log } = day.buildWorkoutLog([{
    name: 'Жим',
    approaches: [
      { weight_kg: 40, reps: 10, set_type: 'warmup' },
      { weight_kg: 75, reps: 8 },
    ],
  }]);
  assert.equal(log.exercises[0].approaches[0].type, 'warmup');
  assert.equal('type' in log.exercises[0].approaches[1], false);
});

test('дропсет пишется ступенями внутри подхода, а не отдельными подходами', () => {
  const { log } = day.buildWorkoutLog([{
    name: 'Жим',
    approaches: [{ weight_kg: 75, reps: 8, drops: [{ weight_kg: 60, reps: 6 }] }],
  }]);
  const aps = log.exercises[0].approaches;
  // Счётчик дня обязан видеть ОДИН подход: иначе число разойдётся с приложением.
  assert.equal(aps.length, 1);
  assert.deepEqual(aps[0].drops, [{ weightKg: '60', reps: 6, done: true }]);
});

test('правила ступеней приходят из ядра, а не второго набора условий', () => {
  const up = day.buildWorkoutLog([{
    name: 'Жим', approaches: [{ weight_kg: 75, reps: 8, drops: [{ weight_kg: 80, reps: 6 }] }],
  }]);
  assert.match(up.error, /ниже предыдущей/);

  const inSuperset = day.buildWorkoutLog([
    { name: 'Жим', superset_group: 1, approaches: [{ weight_kg: 75, reps: 8, drops: [{ weight_kg: 60, reps: 6 }] }] },
    { name: 'Тяга', superset_group: 1, approaches: [{ weight_kg: 60, reps: 8 }] },
  ]);
  assert.match(inSuperset.error, /связки/);

  const badType = day.buildWorkoutLog([{ name: 'Жим', approaches: [{ reps: 8, set_type: 'дроп' }] }]);
  assert.match(badType.error, /set_type/);
});

test('assignTraining назначает план: подходы невыполнены, калории нулевые', () => {
  const base = day.emptyDay('2026-08-11', CLIENT, 1000);
  const res = day.assignTraining(base, undefined, {
    exercises: [{ name: 'Жим лёжа', approaches: [{ reps: 8, weight_kg: 75 }] }],
    dayLabel: 'День B',
    assignedBy: 'Артём',
  }, { nowMs: 1000, clientId: CLIENT });
  assert.equal(res.error, null);
  const t = res.day.trainings[res.index];
  assert.deepEqual(t.z, [0, 0, 0, 0]);
  assert.equal(t.workoutLog.exercises[0].approaches[0].done, false);
  assert.equal(t.plan.status, 'assigned');
  assert.equal(t.plan.dayLabel, 'День B');
  assert.equal(t.plan.assignedBy, 'Артём');
  // Снимок — та же форма, что и живой journal на момент назначения.
  assert.deepEqual(t.planSnapshot.exercises, t.workoutLog.exercises);
});

test('assignTraining без assigned_by отклоняется', () => {
  const base = day.emptyDay('2026-08-11', CLIENT, 1000);
  const res = day.assignTraining(base, undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75 }] }],
  }, { nowMs: 1000, clientId: CLIENT });
  assert.match(res.error, /assignedBy/);
});

test('heys_log_strength_workout без index не затирает молча назначенный план', () => {
  const assigned = day.assignTraining(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75 }] }],
    assignedBy: 'Артём',
  }, { nowMs: 1000, clientId: CLIENT });

  const res = day.setStrengthWorkout(assigned.day, undefined, {
    exercises: [{ name: 'Присед', approaches: [{ reps: 5, weight_kg: 100 }] }],
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(res.error, /назначена планом/);
  assert.match(res.error, new RegExp(`index: ${assigned.index}`));
});

test('heys_log_strength_workout с явным index записывает факт поверх плана и снимает статус', () => {
  const assigned = day.assignTraining(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75 }] }],
    assignedBy: 'Артём',
  }, { nowMs: 1000, clientId: CLIENT });

  const res = day.setStrengthWorkout(assigned.day, assigned.index, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75, done: true }] }],
  }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(res.error, null);
  const t = res.day.trainings[res.index];
  assert.equal(t.plan.status, 'done');
  // Снимок задания остаётся нетронутым — иначе отчёту «план против факта» нечего сравнивать.
  assert.equal(t.planSnapshot.exercises[0].approaches[0].done, false);
});

test('куратор не правит план после того, как клиент его начал', () => {
  const assigned = day.assignTraining(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75 }] }],
    assignedBy: 'Артём',
  }, { nowMs: 1000, clientId: CLIENT });

  const started = { ...assigned.day };
  started.trainings = started.trainings.map((t, i) => (
    i === assigned.index ? { ...t, plan: { ...t.plan, status: 'started' } } : t
  ));

  const res = day.setStrengthWorkout(started, assigned.index, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75, done: true }] }],
  }, { nowMs: 2000, clientId: CLIENT });
  // Отказ не тупиковый: он называет рабочий путь — правку предложением.
  assert.match(res.error, /клиент уже открыл/);
  assert.match(res.error, /heys_propose_training_edit/);
});

test('assignTraining не даёт назначить план поверх уже существующего факта', () => {
  const logged = day.setStrengthWorkout(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75 }] }],
  }, { nowMs: 1000, clientId: CLIENT });

  const res = day.assignTraining(logged.day, logged.index, {
    exercises: [{ name: 'Присед', approaches: [{ reps: 5, weight_kg: 100 }] }],
    assignedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(res.error, /не пустой слот/);
});

test('assignTraining правит свой черновик, пока клиент его не открыл', () => {
  const first = day.assignTraining(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }] }],
    assignedBy: 'Артём',
    time: '18:00',
    dayLabel: 'День А',
    programId: 'pr_1',
    weekIndex: 2,
  }, { nowMs: 1000, clientId: CLIENT });

  const second = day.assignTraining(first.day, first.index, {
    exercises: [
      { name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }] },
      { name: 'Тяга', approaches: [{ reps: 6, weight_kg: 80 }] },
    ],
    assignedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });

  assert.equal(second.error, null);
  assert.equal(second.replaced, true);
  const t = second.day.trainings[second.index];
  assert.equal(t.workoutLog.exercises.length, 2);
  assert.equal(t.planSnapshot.exercises.length, 2, 'снимок задания едет за правкой');
  assert.equal(t.workoutLog.exercises[0].approaches[0].done, false, 'план остаётся невыполненным');
  assert.equal(t.plan.status, 'assigned');
  // Не переданное поле значит «оставь как было»: иначе правка упражнений молча
  // стирала бы время, метку дня и связь с программой.
  assert.equal(t.plan.id, first.planId, 'для приложения это тот же план, а не новый');
  assert.equal(t.time, '18:00');
  assert.equal(t.plan.dayLabel, 'День А');
  assert.equal(t.plan.programId, 'pr_1');
  assert.equal(t.plan.weekIndex, 2);
});

/** Черновик из двух упражнений: жим на два подхода и тяга на один. */
function draftDay() {
  return day.assignTraining(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [
      { name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }, { reps: 6, weight_kg: 65 }] },
      { name: 'Тяга', approaches: [{ reps: 6, weight_kg: 80 }] },
    ],
    assignedBy: 'Артём',
  }, { nowMs: 1000, clientId: CLIENT });
}

test('editTrainingPlan дописывает упражнение, не трогая остальные', () => {
  const draft = draftDay();
  const before = draft.day.trainings[0].workoutLog.exercises.map((e) => e.id);

  const res = day.editTrainingPlan(draft.day, 0, {
    exercises_add: [{ name: 'Присед', approaches: [{ reps: 5, weight_kg: 100 }] }],
  }, { nowMs: 2000, clientId: CLIENT });

  assert.equal(res.error, null);
  const after = res.day.trainings[0].workoutLog.exercises;
  assert.equal(after.length, 3);
  assert.deepEqual(after.slice(0, 2).map((e) => e.id), before, 'прежние упражнения те же');
  assert.equal(after[2].name, 'Присед');
  assert.equal(after[2].approaches[0].done, false, 'дописанное — тоже задание, а не факт');
  assert.equal(res.day.trainings[0].planSnapshot.exercises.length, 3, 'снимок задания едет за правкой');
});

test('editTrainingPlan правит подход по id, и id подхода живёт', () => {
  const draft = draftDay();
  const ex = draft.day.trainings[0].workoutLog.exercises[0];
  const apId = ex.approaches[1].id;

  const res = day.editTrainingPlan(draft.day, 0, {
    exercises_patch: [{ exercise_id: ex.id, rest_sec: 120, approaches_patch: [{ approach_id: apId, weight_kg: 70, reps: 5 }] }],
  }, { nowMs: 2000, clientId: CLIENT });

  assert.equal(res.error, null);
  const got = res.day.trainings[0].workoutLog.exercises[0];
  assert.equal(got.id, ex.id);
  assert.equal(got.restSec, 120);
  assert.equal(got.approaches[1].id, apId, 'для приложения это тот же подход');
  assert.equal(got.approaches[1].weightKg, '70');
  assert.equal(got.approaches[1].reps, 5);
  assert.equal(got.approaches[0].weightKg, '60', 'соседний подход не тронут');
});

test('editTrainingPlan убирает упражнение и переставляет порядок', () => {
  const draft = draftDay();
  const [zhim, tyaga] = draft.day.trainings[0].workoutLog.exercises;

  const added = day.editTrainingPlan(draft.day, 0, {
    exercises_add: [{ name: 'Присед', approaches: [{ reps: 5, weight_kg: 100 }] }],
  }, { nowMs: 2000, clientId: CLIENT });
  const prisedId = added.day.trainings[0].workoutLog.exercises[2].id;

  const removed = day.editTrainingPlan(added.day, 0, {
    exercises_remove: [zhim.id],
  }, { nowMs: 3000, clientId: CLIENT });
  assert.equal(removed.error, null);
  assert.deepEqual(removed.day.trainings[0].workoutLog.exercises.map((e) => e.id), [tyaga.id, prisedId]);

  const ordered = day.editTrainingPlan(removed.day, 0, {
    exercises_order: [prisedId, tyaga.id],
  }, { nowMs: 4000, clientId: CLIENT });
  assert.equal(ordered.error, null);
  assert.deepEqual(ordered.day.trainings[0].workoutLog.exercises.map((e) => e.id), [prisedId, tyaga.id]);
});

test('editTrainingPlan не даёт опустошить план и не молчит о чужих id', () => {
  const draft = draftDay();
  const [zhim, tyaga] = draft.day.trainings[0].workoutLog.exercises;

  const empty = day.editTrainingPlan(draft.day, 0, {
    exercises_remove: [zhim.id, tyaga.id],
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(empty.error, /heys_delete_training/);

  const alien = day.editTrainingPlan(draft.day, 0, {
    exercises_remove: ['ex_чужой'],
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(alien.error, /ex_чужой/);
  assert.match(alien.error, new RegExp(zhim.id), 'ошибка называет доступные id');

  const lastAp = day.editTrainingPlan(draft.day, 0, {
    exercises_patch: [{ exercise_id: tyaga.id, approaches_remove: [tyaga.approaches[0].id] }],
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(lastAp.error, /exercises_remove/);
});

test('editTrainingPlan не трогает начатое клиентом и чужие записи', () => {
  const draft = draftDay();
  const ex = draft.day.trainings[0].workoutLog.exercises[0];

  const opened = JSON.parse(JSON.stringify(draft.day));
  opened.trainings[0].plan.status = 'started';
  const started = day.editTrainingPlan(opened, 0, {
    exercises_remove: [ex.id],
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(started.error, /heys_propose_training_edit/);

  const own = day.addTraining(day.emptyDay('2026-08-11', CLIENT, 1000), [30, 0, 0, 0], { time: '10:00' }, { nowMs: 1000, clientId: CLIENT });
  const foreign = day.editTrainingPlan(own.day, 0, {
    exercises_add: [{ name: 'Присед', approaches: [{ reps: 5, weight_kg: 100 }] }],
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(foreign.error, /запись клиента/);
});

test('exercisesToInput отдаёт упражнение в той же форме, которой его принимают', () => {
  const assigned = day.assignTraining(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [{
      name: 'Подтягивания',
      unit: 'bodyweight',
      bodyweight_factor: 1,
      rest_sec: 120,
      rpe: 8,
      note: 'до отказа',
      approaches: [
        { reps: 8, set_type: 'warmup' },
        { reps: 6, extra_weight_kg: 10, discomfort: true, discomfort_note: 'локоть' },
      ],
    }],
    assignedBy: 'Артём',
  }, { nowMs: 1000, clientId: CLIENT });

  const [ex] = day.exercisesToInput(assigned.day.trainings[0].workoutLog.exercises);
  assert.equal(ex.unit, 'bodyweight');
  assert.equal(ex.bodyweight_factor, 1);
  assert.equal(ex.rest_sec, 120);
  assert.equal(ex.rpe, 8);
  assert.equal(ex.note, 'до отказа');
  assert.equal(ex.approaches[0].set_type, 'warmup');
  assert.equal(ex.approaches[1].extra_weight_kg, 10);
  assert.equal(ex.approaches[1].discomfort_note, 'локоть');
  // Круг замыкается: то, что отдали куратору, принимается обратно без перевода.
  const rebuilt = day.assignTraining(day.emptyDay('2026-08-12', CLIENT, 1000), undefined, {
    exercises: [ex], assignedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(rebuilt.error, null);
});

test('assignTraining не пишет поверх плана, который клиент уже открыл', () => {
  const assigned = day.assignTraining(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }] }],
    assignedBy: 'Артём',
  }, { nowMs: 1000, clientId: CLIENT });
  const opened = JSON.parse(JSON.stringify(assigned.day));
  opened.trainings[assigned.index].plan.status = 'started';

  const res = day.assignTraining(opened, assigned.index, {
    exercises: [{ name: 'Тяга', approaches: [{ reps: 6, weight_kg: 80 }] }],
    assignedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(res.error, /heys_propose_training_edit/);
});

// --- Слой 5: правка плана, который клиент уже открыл --------------------
//
// Дизайн-хэндофф «Правка куратора после старта» (2026-08-09). Прямая запись
// здесь запрещена: правка кладётся предложением, а решает клиент. Сам разбор
// «что ляжет, а что нет» живёт в ядре (applyPlanEdit) и покрыт
// apps/web/__tests__/kernel-plan-edit.test.js — здесь стережём обвязку.

/** План на 2 подхода, первый из которых клиент уже закрыл. */
function startedPlanDay() {
  const assigned = day.assignTraining(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75 }, { reps: 8, weight_kg: 75 }] }],
    assignedBy: 'Артём',
  }, { nowMs: 1000, clientId: CLIENT });
  const started = { ...assigned.day };
  started.trainings = started.trainings.map((t, i) => {
    if (i !== assigned.index) return t;
    const aps = t.workoutLog.exercises[0].approaches.map((a, k) => (k === 0 ? { ...a, done: true } : a));
    return {
      ...t,
      plan: { ...t.plan, status: 'started' },
      workoutLog: { ...t.workoutLog, exercises: [{ ...t.workoutLog.exercises[0], approaches: aps }] },
    };
  });
  return { day: started, index: assigned.index };
}

test('proposeTrainingEdit кладёт предложение рядом с планом, живую запись не трогает', () => {
  const { day: base, index } = startedPlanDay();
  const before = JSON.parse(JSON.stringify(base.trainings[index].workoutLog));

  const res = day.proposeTrainingEdit(base, index, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }, { reps: 8, weight_kg: 60 }] }],
    proposedBy: 'Артём',
    note: 'Плечо ещё не готово',
  }, { nowMs: 2000, clientId: CLIENT });

  assert.equal(res.error, null);
  const t = res.day.trainings[index];
  assert.equal(t.plan.proposal.status, 'pending');
  assert.equal(t.plan.proposal.proposedBy, 'Артём');
  assert.equal(t.plan.proposal.note, 'Плечо ещё не готово');
  // Сама тренировка не изменилась: решение за клиентом, а не за записью.
  assert.deepEqual(t.workoutLog, before);
  assert.equal(t.plan.status, 'started');
});

test('proposeTrainingEdit возвращает куратору предпросмотр — что не ляжет, видно до отправки', () => {
  const { day: base, index } = startedPlanDay();
  // Артём убирает жим целиком, но первый подход клиент уже закрыл.
  const res = day.proposeTrainingEdit(base, index, {
    exercises: [{ name: 'Планка', approaches: [{ reps: 1 }] }],
    proposedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });

  assert.equal(res.error, null);
  assert.ok(res.preview.rejected.some((r) => r.reason === 'started_cannot_remove' && r.name === 'Жим'));
});

test('предложение всегда одно: новое заменяет прежнее, а не встаёт в очередь', () => {
  const { day: base, index } = startedPlanDay();
  const first = day.proposeTrainingEdit(base, index, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 70 }, { reps: 8, weight_kg: 70 }] }],
    proposedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });
  const second = day.proposeTrainingEdit(first.day, index, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }, { reps: 8, weight_kg: 60 }] }],
    proposedBy: 'Артём',
  }, { nowMs: 3000, clientId: CLIENT });

  const proposal = second.day.trainings[index].plan.proposal;
  assert.notEqual(proposal.id, first.proposalId);
  assert.equal(proposal.exercises[0].approaches[0].weightKg, '60');
});

test('на не начатый план предложение не заводится — его правят напрямую', () => {
  const assigned = day.assignTraining(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75 }] }],
    assignedBy: 'Артём',
  }, { nowMs: 1000, clientId: CLIENT });

  const res = day.proposeTrainingEdit(assigned.day, assigned.index, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }] }],
    proposedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(res.error, /heys_assign_training/);
});

test('пропущенный день правку предложением принимает — защищать в нём нечего', () => {
  const { day: base, index } = startedPlanDay();
  const skipped = { ...base };
  skipped.trainings = base.trainings.map((t, i) => (
    i === index ? { ...t, plan: { ...t.plan, status: 'skipped' } } : t
  ));

  const res = day.proposeTrainingEdit(skipped, index, {
    exercises: [{ name: 'Планка', approaches: [{ reps: 1 }] }],
    proposedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });
  assert.equal(res.error, null);
  assert.equal(res.day.trainings[index].plan.status, 'skipped', 'пропуск остаётся пропуском до ответа клиента');
});

test('в завершённую тренировку правка не идёт — сделанное задним числом не меняют', () => {
  const { day: base, index } = startedPlanDay();
  const done = { ...base };
  done.trainings = base.trainings.map((t, i) => (
    i === index ? { ...t, plan: { ...t.plan, status: 'done' } } : t
  ));

  const res = day.proposeTrainingEdit(done, index, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }] }],
    proposedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(res.error, /завершена/);
});

test('к обычной тренировке клиента правку предложить нельзя — это не задание куратора', () => {
  const logged = day.setStrengthWorkout(day.emptyDay('2026-08-11', CLIENT, 1000), undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75 }] }],
  }, { nowMs: 1000, clientId: CLIENT });

  const res = day.proposeTrainingEdit(logged.day, logged.index, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }] }],
    proposedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(res.error, /не назначенный план/);
});

test('отзыв предложения не оставляет следа, повторный отзыв отбивается', () => {
  const { day: base, index } = startedPlanDay();
  const proposed = day.proposeTrainingEdit(base, index, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }, { reps: 8, weight_kg: 60 }] }],
    proposedBy: 'Артём',
  }, { nowMs: 2000, clientId: CLIENT });

  const withdrawn = day.withdrawTrainingProposal(proposed.day, index, { nowMs: 3000, clientId: CLIENT });
  assert.equal(withdrawn.error, null);
  assert.equal(withdrawn.day.trainings[index].plan.proposal, undefined);
  assert.equal(withdrawn.day.trainings[index].plan.status, 'started');

  const again = day.withdrawTrainingProposal(withdrawn.day, index, { nowMs: 4000, clientId: CLIENT });
  assert.match(again.error, /нет неотвеченного предложения/);
});

// --- Перенос тренировки (дизайн-ревью 2026-08-10, 16a/16b) --------------
//
// Главное различие, из которого следует всё: перенести ≠ пропустить. Перенос
// освобождает исходный день заранее и пропуском не считается; прошедший день
// не воскрешают вовсе.

function assignedPlanDay(date = '2026-08-11') {
  return day.assignTraining(day.emptyDay(date, CLIENT, 1000), undefined, {
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 75 }] }],
    assignedBy: 'Артём',
    dayLabel: 'День B',
  }, { nowMs: 1000, clientId: CLIENT });
}

test('перенос помечает исходный день как moved, а не как пропуск', () => {
  const { day: base, index } = assignedPlanDay();
  const res = day.moveTrainingOut(base, index, { toDate: '2026-08-13', nowMs: 2000, clientId: CLIENT });

  assert.equal(res.error, null);
  const src = res.day.trainings[index];
  assert.equal(src.plan.status, 'moved');
  assert.equal(src.plan.movedTo, '2026-08-13');
  assert.notEqual(src.plan.status, 'skipped', 'перенос не должен читаться как пропуск');
});

test('перенесённая запись несёт происхождение и веса целиком', () => {
  const { day: base, index } = assignedPlanDay();
  const res = day.moveTrainingOut(base, index, { toDate: '2026-08-13', nowMs: 2000, clientId: CLIENT });
  const moved = res.movedTraining;

  assert.equal(moved.plan.status, 'assigned');
  assert.equal(moved.plan.movedFrom, '2026-08-11');
  assert.equal(moved.plan.movedTo, undefined, 'на новом дне «уехала туда-то» уже неверно');
  assert.equal(moved.workoutLog.exercises[0].approaches[0].weightKg, '75', 'веса едут вместе с тренировкой');
  assert.notEqual(moved.id, base.trainings[index].id, 'на новом дне это отдельная запись');
});

test('перенос — не для начатой и не для завершённой тренировки', () => {
  const { day: base, index } = assignedPlanDay();
  for (const status of ['started', 'done']) {
    const d = { ...base };
    d.trainings = base.trainings.map((t, i) => (i === index ? { ...t, plan: { ...t.plan, status } } : t));
    const res = day.moveTrainingOut(d, index, { toDate: '2026-08-13', nowMs: 2000, clientId: CLIENT });
    assert.match(res.error, /начата или закончена/);
  }
});

test('дважды одну тренировку не переносят', () => {
  const { day: base, index } = assignedPlanDay();
  const once = day.moveTrainingOut(base, index, { toDate: '2026-08-13', nowMs: 2000, clientId: CLIENT });
  const twice = day.moveTrainingOut(once.day, index, { toDate: '2026-08-14', nowMs: 3000, clientId: CLIENT });
  assert.match(twice.error, /уже перенесена/);
});

test('целевой день с тремя тренировками перенос не принимает', () => {
  const { day: base, index } = assignedPlanDay();
  const out = day.moveTrainingOut(base, index, { toDate: '2026-08-13', nowMs: 2000, clientId: CLIENT });
  const full = day.emptyDay('2026-08-13', CLIENT, 1000);
  full.trainings = [
    { time: '08:00', z: [30, 0, 0, 0] },
    { time: '09:00', z: [30, 0, 0, 0] },
    { time: '10:00', z: [30, 0, 0, 0] },
  ];
  const into = day.moveTrainingIn(full, out.movedTraining, { nowMs: 2000, clientId: CLIENT });
  assert.match(into.error, /перенести сюда некуда/);
});

test('перенесённый день не считается состоявшейся тренировкой', () => {
  // Иначе перенос удвоил бы нагрузку: и на исходном дне, и на новом.
  const { day: base, index } = assignedPlanDay();
  const res = day.moveTrainingOut(base, index, { toDate: '2026-08-13', nowMs: 2000, clientId: CLIENT });
  assert.equal(day.isNotPerformedTraining(res.day.trainings[index]), true);
});

test('участники связки обязаны идти подряд: раунд выводится из позиции', () => {
  const broken = day.buildWorkoutLog([
    { name: 'Жим', superset_group: 1, approaches: [{ weight_kg: 60, reps: 8 }] },
    { name: 'Присед', approaches: [{ weight_kg: 100, reps: 5 }] },
    { name: 'Тяга', superset_group: 1, approaches: [{ weight_kg: 50, reps: 10 }] },
  ]);
  assert.match(broken.error, /подряд/);

  const ok = day.buildWorkoutLog([
    { name: 'Жим', superset_group: 1, approaches: [{ weight_kg: 60, reps: 8 }] },
    { name: 'Тяга', superset_group: 1, approaches: [{ weight_kg: 50, reps: 10 }] },
    { name: 'Присед', approaches: [{ weight_kg: 100, reps: 5 }] },
  ]);
  assert.equal(ok.error, undefined);
});

test('довес пишется на подход и не путается с весом снаряда', () => {
  const { log } = day.buildWorkoutLog([{
    name: 'Подтягивания',
    approaches: [{ reps: 10, extra_weight_kg: 15 }],
  }]);
  assert.equal(log.exercises[0].approaches[0].weightKg, '');
  assert.equal(log.exercises[0].approaches[0].extraWeightKg, 15);
});

test('длительность согласована между zoneMinutes и totalDurationMinutes', () => {
  // Раньше duration_min=500 давало z=[0,180,0,0] при totalDurationMinutes=500.
  const { log } = day.buildWorkoutLog([{ name: 'Ж', approaches: [{ reps: 5 }] }], { durationMin: 500 });
  assert.equal(log.zoneMinutes[1], 180);
  assert.equal(log.totalDurationMinutes, 180);
});

test('упражнение на время пишет duration_sec, а не reps, и снимок unit', () => {
  const { log } = day.buildWorkoutLog([{
    name: 'Планка', unit: 'time',
    approaches: [{ duration_sec: 60 }, { duration_sec: 45, done: false }],
  }]);
  assert.equal(log.exercises[0].unit, 'time');
  assert.equal(log.exercises[0].approaches[0].durationSec, 60);
  assert.equal(log.exercises[0].approaches[0].reps, undefined);
  assert.equal(log.exercises[0].approaches[1].done, false);
});

test('упражнение на время без duration_sec отклоняется', () => {
  const bad = day.buildWorkoutLog([{ name: 'Планка', unit: 'time', approaches: [{ reps: 5 }] }]);
  assert.match(bad.error, /duration_sec/);
});

test('упражнение на дистанцию пишет distance_m и держит вес снаряда отдельно', () => {
  const { log } = day.buildWorkoutLog([{
    name: 'Фермерская переноска', unit: 'distance',
    approaches: [{ distance_m: 40, weight_kg: 24 }],
  }]);
  assert.equal(log.exercises[0].unit, 'distance');
  assert.equal(log.exercises[0].approaches[0].distanceM, 40);
  assert.equal(log.exercises[0].approaches[0].weightKg, '24');
});

test('неизвестный unit отклоняется, а weight_reps по умолчанию не пишет unit в снимок', () => {
  const bad = day.buildWorkoutLog([{ name: 'X', unit: 'весом', approaches: [{ reps: 5 }] }]);
  assert.match(bad.error, /unit/);
  const { log } = day.buildWorkoutLog([{ name: 'Жим', approaches: [{ reps: 5, weight_kg: 40 }] }]);
  assert.equal(log.exercises[0].unit, undefined);
});

test('bodyweight с фактором даёт тоннаж своего веса+довеса; без фактора — честный ноль', () => {
  const web = require('../lib/web-mirror');
  const { log } = day.buildWorkoutLog([{
    name: 'Подтягивания', unit: 'bodyweight', bodyweight_factor: 1.0,
    approaches: [{ reps: 8, extra_weight_kg: 15 }],
  }]);
  assert.equal(log.exercises[0].unit, 'bodyweight');
  assert.equal(log.exercises[0].bodyweightFactor, 1);
  const t = web.trainingTonnage(
    { type: 'strength', strengthEntryMode: 'workout_builder', workoutLog: log },
    { bodyWeightKg: 80 },
  );
  assert.equal(t.totalVolume, (80 * 1.0 + 15) * 8);

  const { log: log2 } = day.buildWorkoutLog([{ name: 'Неизвестное движение', unit: 'bodyweight', approaches: [{ reps: 8 }] }]);
  assert.equal(log2.exercises[0].bodyweightFactor, null);
  const t2 = web.trainingTonnage(
    { type: 'strength', strengthEntryMode: 'workout_builder', workoutLog: log2 },
    { bodyWeightKg: 80 },
  );
  assert.equal(t2.totalVolume, 0);
  assert.equal(t2.unmeasuredExercises, 1);
});

test('bodyweight_factor вне 0–2 отклоняется', () => {
  const bad = day.buildWorkoutLog([{ name: 'X', unit: 'bodyweight', bodyweight_factor: 3, approaches: [{ reps: 5 }] }]);
  assert.match(bad.error, /bodyweight_factor/);
});

test('дискомфорт на подходе пишется с заметкой, без флага заметка не сохраняется', () => {
  const { log } = day.buildWorkoutLog([{
    name: 'Жим', approaches: [
      { reps: 8, weight_kg: 60, discomfort: true, discomfort_note: 'плечо тянет' },
      { reps: 8, weight_kg: 60, discomfort_note: 'без флага — не считается' },
    ],
  }]);
  assert.equal(log.exercises[0].approaches[0].discomfort, true);
  assert.equal(log.exercises[0].approaches[0].discomfortNote, 'плечо тянет');
  assert.equal(log.exercises[0].approaches[1].discomfort, undefined);
  assert.equal(log.exercises[0].approaches[1].discomfortNote, undefined);
});

test('силовая не перезаписывает чужую кардио-тренировку молча', () => {
  const base = {
    ...day.emptyDay('2026-08-01', CLIENT, 1000),
    trainings: [{ z: [0, 40, 0, 0], type: 'cardio', activityLabel: 'Плавание', time: '10:00' }],
  };
  const res = day.setStrengthWorkout(base, 0, {
    exercises: [{ name: 'Жим', approaches: [{ weight_kg: 40, reps: 10 }] }],
  }, { nowMs: 2000, clientId: CLIENT });
  assert.match(res.error, /не силовая/);
});

// ── Быт: одна форма записи, один учёт ────────────────────────────────────────
// Инцидент 21.08.2026: пять часов быта записали двумя household-тренировками, а
// потом ещё раз полем household_min. calculateTDEE складывает тренировки и
// household_min независимо — 300 минут стали 600 и подняли норму на 710 ккал.

test('быт пишется списком активностей, а не только скаляром', () => {
  const base = { date: '2026-08-02', meals: [], updatedAt: 1 };
  const res = day.updateDayFields(base, { household_min: 45 }, { nowMs: 777, clientId: 'c1' });

  assert.deepEqual(res.day.householdActivities, [{ minutes: 45 }]);
  assert.equal(res.day.householdMin, 45);
  assert.equal(res.day.householdUpdatedAt, 777);
  assert.deepEqual(res.applied, ['household_min']);
});

test('скаляр рядом с уже заведённым списком не теряется', () => {
  // Расчёт читает список и игнорирует householdMin, если список есть — даже
  // пустой. Запись «45 минут» в такой день раньше не давала ничего.
  const base = { date: '2026-08-02', meals: [], householdActivities: [], householdMin: 0, updatedAt: 1 };
  const res = day.updateDayFields(base, { household_min: 45 }, { nowMs: 777, clientId: 'c1' });

  assert.equal(day.householdMinutes(res.day), 45);
});

test('ноль снимает быт целиком', () => {
  const base = {
    date: '2026-08-02', meals: [], updatedAt: 1,
    householdActivities: [{ minutes: 120 }, { minutes: 180, time: '07:00' }], householdMin: 300,
  };
  const res = day.updateDayFields(base, { household_min: 0 }, { nowMs: 777, clientId: 'c1' });

  assert.deepEqual(res.day.householdActivities, []);
  assert.equal(res.day.householdMin, 0);
  assert.equal(day.householdMinutes(res.day), 0);
});

test('setHouseholdActivities держит время и название, как приложение', () => {
  const res = day.setHouseholdActivities({ date: '2026-08-02', meals: [] }, [
    { minutes: 180, time: '7:00', label: 'уборка на студии' },
    { minutes: 120 },
  ], { nowMs: 5, clientId: 'c1' });

  assert.deepEqual(res.day.householdActivities, [
    { minutes: 180, time: '07:00', label: 'уборка на студии' },
    { minutes: 120 },
  ]);
  assert.equal(res.day.householdMin, 300);
  assert.equal(res.day.householdTime, '07:00', 'производное поле — время первой записи');
  assert.equal(res.total_minutes, 300);
});

test('минуты быта проверяются, а не молча округляются в ноль', () => {
  const base = { date: '2026-08-02', meals: [] };
  assert.throws(() => day.setHouseholdActivities(base, [{ minutes: 0 }], { nowMs: 1 }), /invalid_household_minutes/);
  assert.throws(() => day.setHouseholdActivities(base, [{ minutes: 5000 }], { nowMs: 1 }), /household_minutes_too_big/);
});

test('householdTrainings узнаёт быт, записанный тренировкой', () => {
  const d = {
    date: '2026-08-21',
    trainings: [
      { z: [120, 0, 0, 0], type: 'household', activityLabel: 'Бытовая активность' },
      { z: [180, 0, 0, 0], type: 'household', activityLabel: 'Уборка на студии', time: '07:00' },
      { z: [0, 40, 0, 0], type: 'cardio', activityLabel: 'Бег' },
    ],
  };
  const found = day.householdTrainings(d);

  assert.deepEqual(found.map((h) => h.index), [0, 1]);
  assert.equal(found.reduce((sum, h) => sum + h.minutes, 0), 300);
  assert.equal(day.isHouseholdTraining({ type: 'hobby', activityLabel: 'Уборка квартиры' }), true);
  assert.equal(day.isHouseholdTraining({ type: 'cardio', activityLabel: 'Бег' }), false);
});

test('норма несёт разбор активности — шаги, быт и тренировки', () => {
  const d = {
    date: '2026-08-21',
    weightMorning: 80,
    steps: 6000,
    householdActivities: [{ minutes: 60 }],
    trainings: [{ z: [0, 30, 0, 0], type: 'cardio' }],
    meals: [],
  };
  const norm = day.dailyNorm(d, { profile: FULL_PROFILE, norms: NORMS, hrZones: [] });

  assert.equal(norm.activity.steps, 6000);
  assert.equal(norm.activity.household_min, 60);
  assert.equal(norm.activity.trainings_min, 30);
  assert.ok(norm.activity.household_kcal > 0, 'быт в калориях назван');
  assert.equal(
    norm.activity.total_kcal,
    norm.activity.steps_kcal + norm.activity.household_kcal + norm.activity.trainings_kcal,
  );
  assert.equal(norm.activity.household_as_training_min, 0);
});

test('быт, записанный тренировкой, назван в разборе активности отдельно', () => {
  const d = {
    date: '2026-08-21',
    weightMorning: 90.1,
    steps: 2000,
    trainings: [
      { z: [120, 0, 0, 0], type: 'household', activityLabel: 'Бытовая активность' },
      { z: [180, 0, 0, 0], type: 'household', activityLabel: 'Уборка на студии' },
    ],
    meals: [],
  };
  const norm = day.dailyNorm(d, { profile: FULL_PROFILE, norms: NORMS, hrZones: [] });

  assert.equal(norm.activity.household_min, 0, 'поле быта пустое — минуты лежат в тренировках');
  assert.equal(norm.activity.trainings_min, 300);
  assert.equal(norm.activity.household_as_training_min, 300);
});

test('разбор активности есть и когда норму посчитать не на чем', () => {
  const norm = day.dailyNorm(
    { date: '2026-08-21', steps: 2000, householdActivities: [{ minutes: 300 }], meals: [] },
    { profile: null, norms: NORMS, hrZones: [] },
  );

  assert.equal(norm.kcal, null);
  assert.equal(norm.activity.steps, 2000);
  assert.equal(norm.activity.household_min, 300);
});
