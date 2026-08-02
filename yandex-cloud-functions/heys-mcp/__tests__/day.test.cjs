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
  const next = day.addTraining(base, [10, 20], { nowMs: 2000, clientId: CLIENT });
  assert.deepEqual(next.trainings[0].z, [10, 20, 0, 0]);
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
