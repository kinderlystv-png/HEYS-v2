// Unit tests для curator-action-diff.js
// Запуск: node --test __tests__/curator-action-diff.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeCuratorActionPayload,
  _internal,
} = require('../curator-action-diff');

// ─── service keys ───────────────────────────────────────────────────

test('service keys → empty actions', () => {
  for (const k of ['heys_push_prefs', 'heys_ui_settings', 'heys_log_debug']) {
    const r = computeCuratorActionPayload({}, { x: 1 }, k);
    assert.deepStrictEqual(r.actions, []);
  }
});

// ─── meals: added ───────────────────────────────────────────────────

test('meal added (new meal with items)', () => {
  const oldV = { meals: [] };
  const newV = {
    meals: [
      {
        id: 'm_1',
        name: 'Завтрак',
        time: '08:00',
        items: [{ product: { name: 'Овсянка' }, quantity: 120, kcal: 145 }],
      },
    ],
  };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'meal_added');
  assert.match(actions[0].name, /Овсянка/);
  assert.equal(actions[0].kcal, 145);
});

test('meal NOT counted as added if no items (placeholder)', () => {
  const oldV = { meals: [] };
  const newV = {
    meals: [{ id: 'm_1', name: 'Приём', time: '', items: [] }],
  };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 0);
});

test('meal removed', () => {
  const oldV = {
    meals: [{ id: 'm_1', name: 'Завтрак', items: [{ name: 'Кофе' }] }],
  };
  const newV = { meals: [] };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'meal_removed');
});

test('meal items added (existing meal got more items)', () => {
  const oldV = {
    meals: [
      { id: 'm_1', name: 'Обед', items: [{ name: 'Суп' }] },
    ],
  };
  const newV = {
    meals: [
      { id: 'm_1', name: 'Обед', items: [{ name: 'Суп' }, { name: 'Хлеб' }, { name: 'Яблоко' }] },
    ],
  };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'meal_item_added');
  assert.equal(actions[0].count, 2);
});

test('meal fallback key (time+name) when no id', () => {
  const oldV = {
    meals: [{ name: 'Завтрак', time: '08:00', items: [{ name: 'A' }] }],
  };
  const newV = {
    meals: [{ name: 'Завтрак', time: '08:00', items: [{ name: 'A' }, { name: 'B' }] }],
  };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'meal_item_added');
});

// ─── trainings ──────────────────────────────────────────────────────

test('training added (empty slot → filled)', () => {
  const oldV = {
    trainings: [{ z: [0, 0, 0, 0] }],
  };
  const newV = {
    trainings: [
      {
        z: [10, 20, 0, 0],
        type: 'cardio',
        activityLabel: 'Бег',
      },
    ],
  };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'training_added');
  assert.equal(actions[0].kind, 'Бег');
  assert.equal(actions[0].duration_min, 30);
});

test('training removed (filled → empty)', () => {
  const oldV = { trainings: [{ z: [30, 0, 0, 0], type: 'cardio', activityLabel: 'Бег' }] };
  const newV = { trainings: [{ z: [0, 0, 0, 0] }] };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'training_removed');
  assert.equal(actions[0].kind, 'Бег');
});

test('training: no change in existing training → no action', () => {
  const t = { z: [30, 0, 0, 0], type: 'cardio', activityLabel: 'Бег' };
  const oldV = { trainings: [t] };
  const newV = { trainings: [t] };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 0);
});

// ─── scalars ────────────────────────────────────────────────────────

test('weight_set: 89 → 90', () => {
  const oldV = { weightMorning: 89.0 };
  const newV = { weightMorning: 90.0 };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'weight_set');
  assert.equal(actions[0].from, 89.0);
  assert.equal(actions[0].to, 90.0);
});

test('weight: no change within tolerance', () => {
  const oldV = { weightMorning: 89.0 };
  const newV = { weightMorning: 89.04 };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 0);
});

test('weight: first-time set (no old value)', () => {
  const oldV = {};
  const newV = { weightMorning: 90.0 };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'weight_set');
  assert.equal(actions[0].from, undefined);
  assert.equal(actions[0].to, 90.0);
});

test('steps_set with tolerance', () => {
  const oldV = { stepsCount: 8000 };
  const newV = { stepsCount: 8030 }; // within 50 → skip
  const { actions: a1 } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(a1.length, 0);

  const newV2 = { stepsCount: 9200 };
  const { actions: a2 } = computeCuratorActionPayload(oldV, newV2, 'heys_dayv2_2026-05-18');
  assert.equal(a2.length, 1);
  assert.equal(a2[0].type, 'steps_set');
});

test('sleep_set computed from start/end', () => {
  const oldV = { sleepStart: '23:00', sleepEnd: '07:00' }; // 8h
  const newV = { sleepStart: '23:00', sleepEnd: '07:30' }; // 8.5h
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'sleep_set');
  assert.equal(actions[0].from, 8);
  assert.equal(actions[0].to, 8.5);
});

// ─── no-op detection ────────────────────────────────────────────────

test('no-op: identical dayv2 → empty actions', () => {
  const day = {
    meals: [{ id: 'm_1', name: 'A', items: [{ name: 'X' }] }],
    trainings: [{ z: [0, 0, 0, 0] }],
    weightMorning: 90,
    stepsCount: 8000,
  };
  const { actions } = computeCuratorActionPayload(day, { ...day }, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 0);
});

test('no-op: null → null', () => {
  const { actions } = computeCuratorActionPayload(null, null, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 0);
});

// ─── profile / norms ────────────────────────────────────────────────

test('profile_changed: list of changed fields', () => {
  const oldV = { name: 'A', age: 30, weight: 70, height: 170 };
  const newV = { name: 'A', age: 30, weight: 71, height: 171 };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_profile');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'profile_changed');
  assert.deepStrictEqual(actions[0].fields.sort(), ['height', 'weight']);
});

test('profile: updatedAt field ignored', () => {
  const oldV = { name: 'A', updatedAt: 1 };
  const newV = { name: 'A', updatedAt: 2 };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_profile');
  assert.equal(actions.length, 0);
});

test('norms_changed: kcal+prot updated', () => {
  const oldV = { kcal: 2000, prot: 100, fat: 70, carbs: 250 };
  const newV = { kcal: 2200, prot: 110, fat: 70, carbs: 250 };
  const { actions } = computeCuratorActionPayload(oldV, newV, 'heys_norms');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'norms_changed');
  assert.deepStrictEqual(actions[0].fields.sort(), ['kcal', 'prot']);
});

// ─── other keys / cap ───────────────────────────────────────────────

test('non-recognized key → other_changed if value differs', () => {
  const { actions: a1 } = computeCuratorActionPayload({ x: 1 }, { x: 2 }, 'heys_planning_tasks');
  assert.equal(a1.length, 1);
  assert.equal(a1[0].type, 'other_changed');
  assert.equal(a1[0].key, 'heys_planning_tasks');

  const { actions: a2 } = computeCuratorActionPayload({ x: 1 }, { x: 1 }, 'heys_planning_tasks');
  assert.equal(a2.length, 0);
});

test('actions cap at 50 — truncation sentinel', () => {
  // Create a dayv2 with 60 meals — should be capped.
  const meals = [];
  for (let i = 0; i < 60; i++) {
    meals.push({ id: `m_${i}`, name: `M${i}`, items: [{ name: 'X' }] });
  }
  const { actions } = computeCuratorActionPayload({ meals: [] }, { meals }, 'heys_dayv2_2026-05-18');
  assert.equal(actions.length, 50);
  assert.equal(actions[49].type, 'truncated');
  assert.equal(actions[49].count, 11);
});

// ─── internal helpers ───────────────────────────────────────────────

test('internal.computeSleepHours crosses midnight', () => {
  const h = _internal.computeSleepHours({ sleepStart: '23:30', sleepEnd: '07:00' });
  assert.equal(h, 7.5);
});

test('internal.parseHHMM rejects bad input', () => {
  assert.equal(_internal.parseHHMM('25:00'), null);
  assert.equal(_internal.parseHHMM('abc'), null);
  assert.equal(_internal.parseHHMM(''), null);
});

test('internal.isEmptyTraining', () => {
  assert.equal(_internal.isEmptyTraining({ z: [0, 0, 0, 0] }), true);
  assert.equal(_internal.isEmptyTraining({ z: [0, 0, 0, 0], activityLabel: 'Бег' }), false);
  assert.equal(_internal.isEmptyTraining({ z: [10, 0, 0, 0] }), false);
  assert.equal(_internal.isEmptyTraining(null), true);
});

test('internal.mealKey: id preferred, fallback to time+name', () => {
  assert.equal(_internal.mealKey({ id: 'X', name: 'Y', time: '08:00' }), 'id:X');
  assert.equal(_internal.mealKey({ name: 'Завтрак', time: '08:00' }), 'tn:08:00|Завтрак');
  assert.equal(_internal.mealKey(null), null);
});
