// Unit tests для curator-action-format.js
// node --test __tests__/curator-action-format.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { collapseNetChange, bucketize, formatBody, _internal } = require('../curator-action-format');

// ─── collapseNetChange ──────────────────────────────────────────────

test('collapse: meal added then removed with same name → both dropped', () => {
  const out = collapseNetChange([
    { type: 'meal_added', name: 'Овсянка 120 г' },
    { type: 'meal_removed', name: 'Овсянка 120 г' },
    { type: 'weight_set', from: 89, to: 90 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'weight_set');
});

test('collapse: add+remove with DIFFERENT names → both kept', () => {
  const out = collapseNetChange([
    { type: 'meal_added', name: 'Овсянка' },
    { type: 'meal_removed', name: 'Кофе' },
  ]);
  assert.equal(out.length, 2);
});

test('collapse: only one pair collapsed when multiple adds same name', () => {
  const out = collapseNetChange([
    { type: 'meal_added', name: 'X' },
    { type: 'meal_added', name: 'X' },
    { type: 'meal_removed', name: 'X' },
  ]);
  // Two added, one removed of same name → 1 add survives, remove collapses with one add
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'meal_added');
});

// ─── bucketize ──────────────────────────────────────────────────────

test('bucketize counts each action type', () => {
  const b = bucketize([
    { type: 'meal_added', name: 'A' },
    { type: 'meal_added', name: 'B' },
    { type: 'training_added', kind: 'бег' },
    { type: 'weight_set', from: 89, to: 90 },
    { type: 'meal_item_added', count: 3 },
    { type: 'norms_changed', fields: ['kcal', 'prot'] },
  ]);
  assert.equal(b.meals_added, 2);
  assert.equal(b.trainings_added, 1);
  assert.deepStrictEqual(b.weight, { from: 89, to: 90 });
  assert.equal(b.meal_items_added, 3);
  assert.deepStrictEqual(b.norms_fields, ['kcal', 'prot']);
});

// ─── formatBody ─────────────────────────────────────────────────────

test('formatBody: meals + weight', () => {
  const body = formatBody(bucketize([
    { type: 'meal_added', name: 'A' },
    { type: 'meal_added', name: 'B' },
    { type: 'weight_set', from: 89, to: 90 },
  ]));
  assert.equal(body, '+2 приёма пищи, вес 89→90');
});

test('formatBody: один приём пищи (правильный плюрализм)', () => {
  const body = formatBody(bucketize([{ type: 'meal_added', name: 'A' }]));
  assert.equal(body, '+1 приём пищи');
});

test('formatBody: 5 приёмов пищи (родительный множ.)', () => {
  const actions = Array.from({ length: 5 }, (_, i) => ({ type: 'meal_added', name: `M${i}` }));
  const body = formatBody(bucketize(actions));
  assert.equal(body, '+5 приёмов пищи');
});

test('formatBody: тренировка singular', () => {
  const body = formatBody(bucketize([{ type: 'training_added', kind: 'бег' }]));
  assert.equal(body, '+1 тренировка');
});

test('formatBody: вес 89.5 → trim', () => {
  const body = formatBody(bucketize([{ type: 'weight_set', from: 89.5, to: 90.0 }]));
  assert.equal(body, 'вес 89.5→90');
});

test('formatBody: пустой bucket → дефолт', () => {
  assert.equal(formatBody(bucketize([])), 'Куратор обновил твои данные');
  assert.equal(formatBody(null), 'Куратор внёс изменения. Загляни в приложение.');
});

test('formatBody: >3 категорий → агрегированная строка', () => {
  const body = formatBody(bucketize([
    { type: 'meal_added', name: 'A' },
    { type: 'training_added', kind: 'X' },
    { type: 'weight_set', from: 89, to: 90 },
    { type: 'sleep_set', to: 8 },
    { type: 'steps_set', to: 8000 },
  ]));
  assert.match(body, /\+5 изменений? от куратора/);
});

test('formatBody: только норм без других — "обновлены нормы"', () => {
  const body = formatBody(bucketize([{ type: 'norms_changed', fields: ['kcal'] }]));
  assert.equal(body, 'обновлены нормы');
});

test('formatBody: meal_items_added без meal_added', () => {
  const body = formatBody(bucketize([{ type: 'meal_item_added', count: 4 }]));
  assert.equal(body, '+4 продукта');
});

// ─── helpers ────────────────────────────────────────────────────────

test('pluralRu basics', () => {
  const { pluralRu, trimNum } = _internal;
  assert.equal(pluralRu(1, 'a', 'b', 'c'), 'a');
  assert.equal(pluralRu(2, 'a', 'b', 'c'), 'b');
  assert.equal(pluralRu(5, 'a', 'b', 'c'), 'c');
  assert.equal(pluralRu(11, 'a', 'b', 'c'), 'c'); // 11-14 always many
  assert.equal(pluralRu(21, 'a', 'b', 'c'), 'a');
  assert.equal(trimNum(89.0), '89');
  assert.equal(trimNum(89.5), '89.5');
  assert.equal(trimNum(89.04), '89');
});
