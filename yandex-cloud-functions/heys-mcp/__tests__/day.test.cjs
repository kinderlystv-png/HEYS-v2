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
