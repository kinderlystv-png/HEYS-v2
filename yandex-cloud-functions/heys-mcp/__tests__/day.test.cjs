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
  assert.equal(res.day.deletedItemIds.it_mayo, 777);
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

test('норма берёт сохранённую клиентом цифру как есть, а не считает свою', () => {
  const norm = day.dailyNorm(
    { date: '2026-08-01', savedDisplayOptimum: 2400, weightMorning: 80, meals: [] },
    { profile: FULL_PROFILE, norms: NORMS, hrZones: [] },
  );
  assert.equal(norm.source, 'client_saved');
  assert.equal(norm.kcal, 2400);
  // Расчёт по этому же дню дал бы другое число — значит, сохранённое не пересчитали.
  const estimated = day.dailyNorm(
    { date: '2026-08-01', weightMorning: 80, meals: [] },
    { profile: FULL_PROFILE, norms: NORMS, hrZones: [] },
  );
  assert.notEqual(estimated.kcal, 2400);
});

test('без сохранённой цифры норма считается и помечается как оценка', () => {
  const norm = day.dailyNorm(
    { date: '2026-08-01', weightMorning: 80, steps: 8000, trainings: [{ z: [0, 30, 0, 0] }], householdMin: 60, meals: [] },
    { profile: FULL_PROFILE, norms: NORMS, hrZones: [] },
  );
  assert.equal(norm.source, 'estimate');
  // Ровно то, что отдаёт зеркало apps/web/heys_tdee_v1.js на тех же входах:
  // BMR 1730 + активность 843 = 2573, дефицит −15% → 2187.
  assert.equal(norm.kcal, 2187);
  assert.match(norm.note, /оценка/i);
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
  const norm = day.dailyNorm(
    { date: '2026-08-01', savedDisplayOptimum: 1900, meals: [] },
    { profile: FULL_PROFILE, norms: NORMS, hrZones: [] },
  );
  // NET Atwater: белок ÷3, углеводы ÷4, жир ÷9; жиры% = 100 − 40 − 25 = 35.
  assert.equal(norm.protein_g, Math.round((1900 * 0.25 / 3) * 10) / 10); // 158.3
  assert.equal(norm.carbs_g, Math.round((1900 * 0.40 / 4) * 10) / 10);   // 190
  assert.equal(norm.fat_g, Math.round((1900 * 0.35 / 9) * 10) / 10);     // 73.9
});

test('пустые проценты БЖУ не превращаются в «жиры 100% калорий»', () => {
  const norm = day.dailyNorm(
    { date: '2026-08-01', savedDisplayOptimum: 1900, meals: [] },
    { profile: FULL_PROFILE, norms: {}, hrZones: [] },
  );
  assert.equal(norm.kcal, 1900, 'калорийная норма известна и остаётся');
  assert.equal(norm.protein_g, null);
  assert.equal(norm.fat_g, null);
  assert.equal(norm.reason, 'no_norms');
});

test('норма показывает остаток по калориям и каждому макросу', () => {
  const norm = day.dailyNorm(
    {
      date: '2026-08-01',
      savedDisplayOptimum: 1900,
      meals: [{ id: 'm1', items: [{ name: 'Каша', grams: 200, kcal100: 100, protein100: 10, simple100: 20, complex100: 0, badFat100: 2, goodFat100: 1 }] }],
    },
    { profile: FULL_PROFILE, norms: NORMS, hrZones: [] },
  );
  assert.equal(norm.left.kcal, 1900 - 200);
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
