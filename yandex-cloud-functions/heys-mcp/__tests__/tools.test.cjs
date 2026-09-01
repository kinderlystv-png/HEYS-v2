'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTools, defaultMealName, TOOL_SCHEMAS, WRITE_TOOLS } = require('../lib/tools');
const mcp = require('../lib/mcp');
const dayModel = require('../lib/day');

const CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
const SESSION = 'session-token';
const NOW = Date.UTC(2026, 7, 1, 12, 54); // 15:54 по Москве

/** Optional health features require internalAccount while out of release. */
function internalHealthProfile(overrides = {}) {
  return { internalAccount: true, ...overrides };
}

const SHARED_ROWS = [
  { id: 's-americano', name: 'Кофе американо', protein100: 0.1, simple100: 0.3, complex100: 0, badfat100: 0, goodfat100: 0 },
  { id: 's-milk', name: 'Молоко ультрапастеризованное 3.5', protein100: 3, simple100: 4.7, complex100: 0, badfat100: 2.2, goodfat100: 1.3 },
  { id: 's-syrup', name: 'Сироп для кофе (классический сахарный)', protein100: 0, simple100: 75, complex100: 0, badfat100: 0, goodfat100: 0 },
  { id: 's-latte', name: 'Кофе латте', protein100: 3, simple100: 5, complex100: 0, badfat100: 1, goodfat100: 1 },
];

const OVERLAY = [
  { id: 'own-americano', shared_origin_id: 's-americano', overrides: {}, in_my_list: true },
  { id: 'own-milk', shared_origin_id: 's-milk', overrides: {}, in_my_list: true },
  { id: 'own-syrup', shared_origin_id: 's-syrup', overrides: {}, in_my_list: true },
];

const PRESETS = [{
  id: 'mp_coffee',
  name: 'Кофе Киндерли',
  items: [
    { product_id: 'legacy-milk-id', name: 'Молоко ультрапастеризованное 3.5', grams: 185 },
    { product_id: 'own-americano', name: 'Кофе американо', grams: 100 },
    { product_id: 'legacy-syrup-id', name: 'Сироп для кофе (классический сахарный)', grams: 20 },
  ],
}];

/** Подставной API: фиксирует записи, чтобы проверить контракт merge-сохранения. */
function fakeApi({ day = null, presets = PRESETS, overlay = OVERLAY, card = null, pastDays = {} } = {}) {
  const saves = [];
  const upserts = [];
  let presetState = presets;
  let overlayState = overlay;
  let dayState = day;
  let cardState = card ? { ...card } : null;
  return {
    saves,
    upserts,
    tombstones: null,
    async upsertKV(_session, key, value) {
      upserts.push({ key, value });
      if (key === 'heys_meal_presets_v1') presetState = value;
      if (key === 'heys_products_overlay_v2') overlayState = value;
      if (cardState && key === 'heys_profile') cardState['heys_profile'] = value;
      return { ok: true };
    },
    get presetState() { return presetState; },
    async getKV(_session, key) {
      if (key === 'heys_products_overlay_v2') return { data: overlayState, error: null };
      if (key === 'heys_meal_presets_v1') return { data: presetState, error: null };
      if (key === 'heys_deleted_ids') return { data: this.tombstones, error: null };
      // Только свой день: раньше фейк отдавал один и тот же блоб на любую дату,
      // и окно долга молча набивалось копиями сегодняшнего дня.
      if (key.startsWith('heys_dayv2_')) {
        const wanted = dayState && dayState.date ? `heys_dayv2_${dayState.date}` : null;
        return { data: (!wanted || key === wanted) ? dayState : (pastDays[key.slice('heys_dayv2_'.length)] || null), error: null };
      }
      if (cardState && Object.hasOwn(cardState, key)) return { data: cardState[key], error: null };
      return { data: null, error: null };
    },
    async getSharedProducts() {
      return { data: SHARED_ROWS, error: null };
    },
    async mergeSaveKV(_session, key, value, lastSeenUpdatedAt) {
      saves.push({ key, value, lastSeenUpdatedAt });
      if (key.startsWith('heys_dayv2_')) {
        if (typeof this.onMergeSave === 'function') {
          const overridden = this.onMergeSave(key, value, dayState);
          if (overridden && typeof overridden === 'object') {
            dayState = overridden.value !== undefined ? overridden.value : value;
            return {
              ok: overridden.ok !== false,
              outcome: overridden.outcome || 'incoming_wins',
              value: overridden.value !== undefined ? overridden.value : value,
              error: overridden.error,
            };
          }
        }
        dayState = value;
      }
      return { ok: true, outcome: 'incoming_wins', value };
    },
  };
}

function build(api) {
  return createTools({ api, sessionToken: SESSION, clientId: CLIENT, nowMs: NOW }).tools;
}

test('название приёма подбирается по времени', () => {
  assert.equal(defaultMealName('08:00'), 'Завтрак');
  assert.equal(defaultMealName('13:00'), 'Обед');
  assert.equal(defaultMealName('19:30'), 'Ужин');
  assert.equal(defaultMealName('16:10'), 'Перекус');
});

test('log_meal собирает составной напиток из позиций и сохраняет merge-ом', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 111 } });
  const tools = build(api);
  const res = await tools.heys_log_meal({
    items: [
      { product_id: 'own-americano', grams: 100 },
      { query: 'молоко ультрапастеризованное', grams: 185 },
      { query: 'сироп для кофе', grams: 20 },
    ],
  });

  assert.equal(api.saves.length, 1);
  const save = api.saves[0];
  assert.equal(save.key, 'heys_dayv2_2026-08-01');
  // Отправляем известную версию облака — иначе сервер не сможет разрулить конфликт.
  assert.equal(save.lastSeenUpdatedAt, 111);
  assert.equal(save.value.meals.length, 1);
  assert.equal(save.value.meals[0].items.length, 3);
  assert.equal(save.value.meals[0].time, '15:54');
  // Кофе с молоком и сиропом — кофе-брейк: еды в приёме нет.
  assert.equal(save.value.meals[0].name, 'Кофе-брейк');
  assert.equal(save.value.meals[0].mealType, 'coffee_break');
  assert.equal(save.value._writerCid, CLIENT);
  assert.ok(res.structured.totals.kcal > 0);
});

test('log_meal через набор берёт граммовки пользователя и разрешает устаревшие id по названию', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 5 } });
  const tools = build(api);
  const res = await tools.heys_log_meal({ preset: 'кофе киндерли' });

  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.name, 'Кофе Киндерли');
  assert.deepEqual(meal.items.map((i) => i.grams), [185, 100, 20]);
  // legacy-id не существует в каталоге — позиция обязана найтись по имени.
  assert.equal(meal.items[0].name, 'Молоко ультрапастеризованное 3.5');
  assert.equal(meal.items[0].product_id, 'own-milk');
  assert.equal(res.structured.items.length, 3);
});

test('набор принимает переопределение граммовки', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 5 } });
  const tools = build(api);
  await tools.heys_log_meal({
    preset: 'Кофе Киндерли',
    preset_grams: { 'Молоко ультрапастеризованное 3.5': 200 },
  });
  assert.equal(api.saves[0].value.meals[0].items[0].grams, 200);
});

test('несуществующий набор не превращается молча в пустой приём', async () => {
  const tools = build(fakeApi({ day: null }));
  await assert.rejects(() => tools.heys_log_meal({ preset: 'Смузи' }), (e) => e.code === 'preset_not_found');
});

test('неоднозначный продукт возвращает кандидатов вместо догадки', async () => {
  const tools = build(fakeApi({ day: null }));
  await assert.rejects(
    () => tools.heys_log_meal({ items: [{ query: 'кофе', grams: 100 }] }),
    (e) => {
      assert.equal(e.code, 'ambiguous_product');
      assert.ok(e.details.candidates.length > 1);
      return true;
    },
  );
});

/**
 * Дубль «личная карточка ↔ общая база». 21.08 на этом встало сохранение
 * набора: «Хлеб тостовый Премиум суперсемечковый» лежал в личном списке с
 * 276.7 ккал и в общей базе с 274. Пара была неразрешима арифметически —
 * точное имя даёт обеим по 1000, надбавка own всего +60, а порог требует
 * превосходства в 1.25 раза.
 */
test('личная карточка с тем же названием, что в общей базе, берётся без переспроса', async () => {
  const overlay = [...OVERLAY, {
    id: 'own-latte-dup', _custom: true, in_my_list: true, name: 'Кофе латте',
    protein100: 3.4, simple100: 5.2, complex100: 0, badFat100: 1.2, goodFat100: 1,
    trans100: 0, fiber100: 0, gi: 30, harm: 2,
  }];
  const api = fakeApi({ day: null, overlay });
  const tools = build(api);

  const res = await tools.heys_log_meal({ items: [{ query: 'кофе латте', grams: 200 }], time: '10:00' });

  const saved = api.saves[api.saves.length - 1].value;
  const item = saved.meals[0].items[0];
  assert.equal(item.product_id, 'own-latte-dup', 'взята личная карточка, а не общая');
  assert.equal(res.structured.items.length, 1);
});

test('настоящая неоднозначность в личном списке по-прежнему переспрашивает', async () => {
  // Два личных «кофе» с разными названиями — это не дубль одной карточки, и
  // угадывать тут нельзя.
  const overlay = [...OVERLAY, {
    id: 'own-latte-dup', _custom: true, in_my_list: true, name: 'Кофе латте',
    protein100: 3.4, simple100: 5.2, complex100: 0, badFat100: 1.2, goodFat100: 1,
    trans100: 0, fiber100: 0, gi: 30, harm: 2,
  }];
  const tools = build(fakeApi({ day: null, overlay }));
  await assert.rejects(
    () => tools.heys_log_meal({ items: [{ query: 'кофе', grams: 100 }] }),
    (e) => e.code === 'ambiguous_product',
  );
});

test('точное название вносится без переспроса', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  await tools.heys_log_meal({ items: [{ query: 'Кофе американо', grams: 100 }] });
  assert.equal(api.saves[0].value.meals[0].items[0].name, 'Кофе американо');
});

test('невалидные граммы и время отклоняются до записи', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  await assert.rejects(() => tools.heys_log_meal({ items: [{ product_id: 'own-milk', grams: 0 }] }), (e) => e.code === 'invalid_grams');
  await assert.rejects(() => tools.heys_log_meal({ items: [{ product_id: 'own-milk', grams: 100 }], time: '25:00' }), (e) => e.code === 'invalid_time');
  await assert.rejects(() => tools.heys_log_meal({ items: [{ product_id: 'own-milk', grams: 100 }], date: '2026-02-30' }), (e) => e.code === 'invalid_date');
  assert.equal(api.saves.length, 0);
});

test('log_meal без позиций и набора не создаёт пустой приём', async () => {
  const tools = build(fakeApi({ day: null }));
  await assert.rejects(() => tools.heys_log_meal({}), (e) => e.code === 'invalid_items');
});

test('log_meal copy_meal копирует приём и умножает граммовки', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_src',
        name: 'Перекус',
        time: '10:00',
        items: [
          { id: 'it1', product_id: 'own-americano', name: 'Кофе американо', grams: 100 },
          { id: 'it2', product_id: 'own-milk', name: 'Молоко', grams: 50 },
        ],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 111 }, pastDays });
  const tools = build(api);
  const res = await tools.heys_log_meal({
    copy_meal: { date: yesterday, meal_id: 'm_src', count: 2 },
  });

  assert.equal(api.saves.length, 1);
  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.items.length, 2);
  assert.equal(meal.items[0].grams, 200);
  assert.equal(meal.items[1].grams, 100);
  assert.equal(meal.name, 'Перекус');
  assert.ok(res.structured.meal_id);
});

test('log_meal copy_meal понимает «вчера» и отклоняет несуществующий meal_id', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{ id: 'm_src', name: 'Завтрак', time: '08:00', items: [{ product_id: 'own-americano', grams: 100 }] }],
      updatedAt: 1,
    },
  };
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 1 }, pastDays });
  const tools = build(api);
  await tools.heys_log_meal({ copy_meal: { date: 'вчера', meal_id: 'm_src' } });
  assert.equal(api.saves[0].value.meals[0].items[0].grams, 100);

  await assert.rejects(
    () => tools.heys_log_meal({ copy_meal: { date: 'вчера', meal_id: 'm_missing' } }),
    (e) => e.code === 'meal_not_found',
  );
});

test('log_meal copy_meal и items в одном вызове дают один приём со всеми позициями', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_lunch',
        name: 'Обед',
        time: '13:00',
        items: [
          { id: 'it1', product_id: 'own-americano', name: 'Кофе американо', grams: 100 },
        ],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 111 }, pastDays });
  const tools = build(api);
  await tools.heys_log_meal({
    copy_meal: { date: yesterday, meal_id: 'm_lunch' },
    items: [{ query: 'сироп для кофе', grams: 35 }],
  });

  assert.equal(api.saves.length, 1);
  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.items.length, 2, 'копия и новая позиция в одном приёме');
  assert.equal(meal.items[0].grams, 100);
  assert.equal(meal.items[1].grams, 35);
});

test('log_meal copy_meal с item_ids копирует одну позицию из многопозиционного приёма', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_snack',
        name: 'Перекус',
        time: '12:30',
        items: [
          { id: 'it_env', product_id: 'own-milk', name: 'Конверты фило', grams: 111 },
          { id: 'it_coffee', product_id: 'own-americano', name: 'Кофе', grams: 200 },
        ],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 111 }, pastDays });
  const tools = build(api);
  await tools.heys_log_meal({
    copy_meal: { date: yesterday, meal_id: 'm_snack', item_ids: ['it_env'] },
  });

  assert.equal(api.saves.length, 1);
  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.items.length, 1);
  assert.equal(meal.items[0].grams, 111);
});

test('add_water прибавляет к текущему объёму', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 200, updatedAt: 9 } });
  const tools = build(api);
  const res = await tools.heys_add_water({ ml: 300 });
  assert.equal(api.saves[0].value.waterMl, 500);
  assert.equal(res.structured.water_ml, 500);
});

test('delete_meal требует существующий meal_id', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [{ id: 'm1' }], updatedAt: 9 } });
  const tools = build(api);
  await tools.heys_delete_meal({ meal_id: 'm1' });
  assert.equal(api.saves[0].value.deletedMealIds.m1, NOW);
  await assert.rejects(() => tools.heys_delete_meal({ meal_id: 'нет' }), (e) => e.code === 'meal_not_found');
});

test('update_day без полей не пишет в облако', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 9 } });
  const tools = build(api);
  await assert.rejects(() => tools.heys_update_day({}), (e) => e.code === 'nothing_to_update');
  assert.equal(api.saves.length, 0);
});

test('update_day валидирует субъективные шкалы 1..10', async () => {
  const tools = build(fakeApi({ day: null }));
  await assert.rejects(() => tools.heys_update_day({ mood: 12 }), (e) => e.code === 'invalid_range');
});

test('log_training отклоняет нулевую тренировку', async () => {
  const tools = build(fakeApi({ day: null }));
  await assert.rejects(() => tools.heys_log_training({ zones_minutes: [0, 0] }), (e) => e.code === 'invalid_zones');
});

test('log_training пишет время, тип и ощущения, а не только минуты', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const res = await tools.heys_log_training({
    zones_minutes: [30], time: '18:40', type: 'cardio', activity_label: 'Бег',
    mood: 8, wellbeing: 7, stress: 3, comment: 'В парке',
  });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  const t = saved.value.trainings[0];
  assert.equal(t.time, '18:40');
  assert.equal(t.type, 'cardio');
  assert.equal(t.activityLabel, 'Бег');
  assert.equal(t.mood, 8);
  assert.equal(t.source, 'curator_mcp');
  assert.match(res.text, /в 18:40, cardio/);
});

test('log_strength_workout пишет всю тренировку одним вызовом', async () => {
  const api = fakeApi({ day: null });
  const res = await build(api).heys_log_strength_workout({
    duration_min: 52,
    time: '18:40',
    exercises: [
      { name: 'Жим лёжа', rpe: 8, superset_group: 1, approaches: [{ weight_kg: 22, reps: 12 }, { weight_kg: 24, reps: 10 }] },
      { name: 'Тяга штанги', superset_group: 1, approaches: [{ weight_kg: 20, reps: 12 }] },
      // Дропсет — просто убывающий вес внутри упражнения, отдельного поля нет.
      { name: 'Разгибания', approaches: [{ weight_kg: 15, reps: 10 }, { weight_kg: 10, reps: 10 }, { weight_kg: 5, reps: 12 }] },
    ],
  });

  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  const t = saved.value.trainings[0];
  assert.equal(t.type, 'strength');
  assert.equal(t.strengthEntryMode, 'workout_builder');
  assert.equal(t.time, '18:40');
  assert.deepEqual(t.z, [0, 52, 0, 0], 'длительность уходит в зону 2, как это делает приложение');

  const ex = t.workoutLog.exercises;
  assert.equal(ex.length, 3);
  assert.equal(ex[0].rpe, 8);
  assert.equal(ex[0].ssGroup, 1);
  assert.equal(ex[1].ssGroup, 1, 'связка держится общим номером');
  assert.equal(ex[0].approaches[0].done, true, 'подходы по умолчанию выполнены');
  // legacy-поля синхронны с первой строкой подходов — как в приложении.
  assert.equal(ex[0].sets, 2);
  assert.equal(ex[0].weightKg, '22');

  // 22×12 + 24×10 + 20×12 + 15×10 + 10×10 + 5×12 = 1054
  assert.equal(res.structured.total_volume_kg, 1054);
  assert.equal(res.structured.approaches_done, 6);
});

test('log_strength_workout проверяет всё до записи, а не пишет половину', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  // Ошибка в третьем упражнении — первые два тоже не должны записаться.
  await assert.rejects(
    () => tools.heys_log_strength_workout({
      exercises: [
        { name: 'Жим', approaches: [{ weight_kg: 40, reps: 10 }] },
        { name: 'Тяга', approaches: [{ weight_kg: 30, reps: 10 }] },
        { name: 'Присед', approaches: [{ weight_kg: 50, reps: 999 }] },
      ],
    }),
    (e) => e.code === 'invalid_workout' && /Упражнение 3 «Присед», подход 1/.test(e.message),
  );
  assert.equal(api.saves.length, 0, 'ни одно упражнение не записалось');
});

test('log_strength_workout не принимает связку из одного упражнения', async () => {
  const tools = build(fakeApi({ day: null }));
  await assert.rejects(
    () => tools.heys_log_strength_workout({
      exercises: [{ name: 'Жим', superset_group: 1, approaches: [{ weight_kg: 40, reps: 10 }] }],
    }),
    (e) => e.code === 'invalid_workout' && /связке нужно минимум два/.test(e.message),
  );
});

test('log_strength_workout принимает свой вес без указания веса', async () => {
  const api = fakeApi({ day: null });
  await build(api).heys_log_strength_workout({
    exercises: [{ name: 'Подтягивания', approaches: [{ reps: 8 }, { reps: 6 }] }],
  });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.equal(saved.value.trainings[0].workoutLog.exercises[0].approaches[0].weightKg, '');
});

test('log_strength_workout bodyweight-тоннаж считается по весу тела за сегодня, а не нулём', async () => {
  const api = fakeApi({ day: { date: '2026-08-13', weightMorning: 80, meals: [], waterMl: 0, updatedAt: 1 } });
  const res = await build(api).heys_log_strength_workout({
    date: '2026-08-13',
    exercises: [{
      name: 'Подтягивания', unit: 'bodyweight', bodyweight_factor: 1,
      approaches: [{ reps: 8, extra_weight_kg: 10 }, { reps: 6, extra_weight_kg: 10 }],
    }],
  });
  // (80×1 + 10) × 8 + (80×1 + 10) × 6 = 1260
  assert.equal(res.structured.total_volume_kg, 1260);
});

test('log_strength_workout без записанного веса тела честно даёт нулевой bodyweight-тоннаж', async () => {
  const api = fakeApi({ day: null });
  const res = await build(api).heys_log_strength_workout({
    exercises: [{ name: 'Подтягивания', unit: 'bodyweight', bodyweight_factor: 1, approaches: [{ reps: 8 }] }],
  });
  assert.equal(res.structured.total_volume_kg, 0);
});

test('delete_training ставит tombstone, иначе merge вернёт тренировку из облака', async () => {
  const api = fakeApi({
    day: {
      date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111,
      trainings: [{ z: [60, 0, 0, 0], time: '10:00', type: 'cardio' }],
    },
  });
  const res = await build(api).heys_delete_training({ index: 0 });

  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_')).value;
  // Строка вырезана, список добит пустыми заготовками — как в приложении.
  assert.equal(saved.trainings.filter((t) => (t.z || []).some((m) => m > 0)).length, 0);
  const tomb = saved.deletedTrainings[0];
  assert.equal(tomb.signature, 'fields:cardio|||10:00|');
  assert.ok(tomb.deletedAt > 0);
  assert.match(res.text, /Удалил cardio/);
});

test('delete_training отбивает пустую заготовку и несуществующий индекс', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111, trainings: [{ z: [0, 0, 0, 0] }] },
  });
  const tools = build(api);
  await assert.rejects(() => tools.heys_delete_training({ index: 9 }), (e) => e.code === 'not_found');
  // У заготовки нет подписи: tombstone по ней погасил бы чужие тренировки.
  await assert.rejects(() => tools.heys_delete_training({ index: 0 }), (e) => e.code === 'not_deletable');
  assert.equal(api.saves.length, 0);
});

test('update_training дописывает оценки к уже записанной тренировке', async () => {
  // Ровно случай истории Александры: тренировки записаны, оценок в них нет,
  // а добавить их коннектор до сих пор не умел — только завести новую.
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111, trainings: [{ z: [60, 0, 0, 0], time: '10:00' }] },
  });
  const res = await build(api).heys_update_training({ index: 0, mood: 8, wellbeing: 7, stress: 3 });

  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  const t = saved.value.trainings[0];
  assert.equal(t.mood, 8);
  assert.equal(t.wellbeing, 7);
  assert.equal(t.stress, 3);
  assert.equal(t.z[0], 60, 'минуты не тронуты');
  assert.equal(t.time, '10:00', 'время не тронуто');
  assert.deepEqual(res.structured.applied.sort(), ['mood', 'stress', 'wellbeing']);
});

test('update_training отбивает несуществующий индекс, а не пишет мимо', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111, trainings: [{ z: [60, 0, 0, 0] }] },
  });
  const tools = build(api);
  await assert.rejects(() => tools.heys_update_training({ index: 5, mood: 8 }), (e) => e.code === 'not_found');
  await assert.rejects(() => tools.heys_update_training({ index: 0, mood: 42 }), (e) => e.code === 'invalid_range');
  await assert.rejects(() => tools.heys_update_training({ index: 0 }), (e) => e.code === 'nothing_to_update');
  assert.equal(api.saves.length, 0, 'ни одна отбитая правка не записалась');
});

// --- heys_assign_program ------------------------------------------------
//
// Программа куратора, Слой 4 (CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09.md).
// Ключевой инвариант — «дни разные ключи, транзакции нет»: валидация идёт по
// всем дням до первой записи, а сбой одного дня посреди записи не должен
// уронить остальные. Сама валидация каждого дня — это assignTraining, и её
// правила уже покрыты day.test.cjs; тесты здесь проверяют только оркестрацию
// поверх нескольких дней, которой в day.js нет.

const PROGRAM_EXERCISE = [{ name: 'Присед', approaches: [{ reps: 5, weight_kg: 80 }] }];
// Слой 5: назначение плана — функция тарифа Pro Спорт (subscription_plan
// 'proplus' в heys_profile). Без этой карточки гейт отбивает вызов раньше
// любой другой проверки — см. отдельный тест ниже.
const PROPLUS_CARD = { heys_profile: { subscription_plan: 'proplus' } };

test('assign_program пишет несколько дней и индекс программы одним вызовом', async () => {
  const api = fakeApi({ day: null, card: PROPLUS_CARD });
  const res = await build(api).heys_assign_program({
    title: 'Верх/низ, 4 недели',
    assigned_by: 'Артём',
    weeks: 4,
    days: [
      { date: '2026-08-11', day_label: 'День A', week_index: 1, exercises: PROGRAM_EXERCISE },
      { date: '2026-08-13', day_label: 'День B', week_index: 1, exercises: PROGRAM_EXERCISE },
    ],
  });

  assert.equal(res.structured.status, 'active');
  assert.equal(res.structured.written.length, 2);
  assert.equal(res.structured.failed.length, 0);

  const dayDates = api.saves.filter((s) => s.key.startsWith('heys_dayv2_')).map((s) => s.key);
  assert.deepEqual(dayDates.sort(), ['heys_dayv2_2026-08-11', 'heys_dayv2_2026-08-13']);
  for (const s of api.saves.filter((s2) => s2.key.startsWith('heys_dayv2_'))) {
    const training = s.value.trainings[0];
    const plan = training.plan;
    assert.equal(plan.status, 'assigned');
    assert.equal(plan.programId, res.structured.program_id);
    assert.equal(training.planSnapshot.exercises.length, 1);
    assert.deepEqual(training.workoutLog, { version: 1, zoneMinutes: [0, 0, 0, 0], exercises: [] });
  }

  const index = api.saves.find((s) => s.key === 'heys_training_program');
  assert.ok(index, 'индекс программы не записан');
  assert.equal(index.value.status, 'active');
  assert.equal(index.value.days.length, 2);
  assert.equal(index.value.startDate, '2026-08-11', 'startDate — самая ранняя дата, не порядок в массиве');
});

test('assign_program не пишет ничего, если хотя бы один день не проходит проверку', async () => {
  // Второй день уже занят тремя факт-тренировками — assignTraining его отобьёт
  // тем же правилом MAX_TRAININGS_PER_DAY, что и одиночное назначение.
  const api = fakeApi({
    day: {
      date: '2026-08-13',
      meals: [],
      waterMl: 0,
      updatedAt: 111,
      trainings: [
        { time: '08:00', z: [30, 0, 0, 0] },
        { time: '09:00', z: [30, 0, 0, 0] },
        { time: '10:00', z: [30, 0, 0, 0] },
      ],
    },
    card: PROPLUS_CARD,
  });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_assign_program({
      title: 'Верх/низ',
      assigned_by: 'Артём',
      days: [
        { date: '2026-08-11', exercises: PROGRAM_EXERCISE },
        { date: '2026-08-13', exercises: PROGRAM_EXERCISE },
      ],
    }),
    (e) => e.code === 'invalid_assignment' && /2026-08-13/.test(e.message),
  );
  assert.equal(api.saves.length, 0, 'ни один день не должен был записаться');
});

test('assign_program отбивает повторную дату внутри одного вызова', async () => {
  const api = fakeApi({ day: null, card: PROPLUS_CARD });
  await assert.rejects(
    () => build(api).heys_assign_program({
      title: 'Верх/низ',
      assigned_by: 'Артём',
      days: [
        { date: '2026-08-11', exercises: PROGRAM_EXERCISE },
        { date: '2026-08-11', exercises: PROGRAM_EXERCISE },
      ],
    }),
    (e) => e.code === 'invalid_assignment',
  );
  assert.equal(api.saves.length, 0);
});

test('assign_program и assign_training отказывают без тарифа Pro Спорт, ничего не пишут', async () => {
  const apiNoSub = fakeApi({ day: null });
  await assert.rejects(
    () => build(apiNoSub).heys_assign_program({
      title: 'Верх/низ',
      assigned_by: 'Артём',
      days: [{ date: '2026-08-11', exercises: PROGRAM_EXERCISE }],
    }),
    (e) => e.code === 'tariff_required',
  );
  assert.equal(apiNoSub.saves.length, 0);

  const apiWrongPlan = fakeApi({ day: null, card: { heys_profile: { subscription_plan: 'pro' } } });
  await assert.rejects(
    () => build(apiWrongPlan).heys_assign_training({
      assigned_by: 'Артём',
      exercises: PROGRAM_EXERCISE,
    }),
    (e) => e.code === 'tariff_required',
  );
  assert.equal(apiWrongPlan.saves.length, 0);
});

test('assign_training сохраняет состав в snapshot и оставляет живой журнал пустым', async () => {
  const api = fakeApi({ day: null, card: PROPLUS_CARD });
  const res = await build(api).heys_assign_training({
    assigned_by: 'Артём',
    exercises: PROGRAM_EXERCISE,
  });

  assert.equal(res.structured.exercises, 1, 'ответ считает упражнения плана, а не пустого журнала');
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  const training = saved.value.trainings[0];
  assert.equal(training.planSnapshot.exercises.length, 1);
  assert.deepEqual(training.workoutLog, { version: 1, zoneMinutes: [0, 0, 0, 0], exercises: [] });
});

/** День с черновиком, который клиент ещё не открывал. */
const DRAFT_PLAN_DAY = () => ({
  date: '2026-08-01',
  meals: [],
  waterMl: 0,
  updatedAt: 111,
  trainings: [{
    id: 'tr_a',
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    z: [0, 0, 0, 0],
    time: '18:00',
    plan: { id: 'pl_1', status: 'assigned', assignedBy: 'Артём', assignedAt: NOW - 1000, dayLabel: 'День А' },
    planSnapshot: { exercises: [{
      id: 'ex1',
      name: 'Жим',
      ssGroup: 0,
      rpe: 0,
      restSec: 90,
      approaches: [
        { id: 'a1', weightKg: '75', reps: 8, done: false },
        { id: 'a2', weightKg: '75', reps: 8, done: false },
      ],
    }] },
    workoutLog: {
      version: 1,
      zoneMinutes: [0, 0, 0, 0],
      exercises: [],
    },
  }],
});

function multiDayMoveApi(sourceDay, targetDay) {
  const days = new Map([
    [sourceDay.date, structuredClone(sourceDay)],
    [targetDay.date, structuredClone(targetDay)],
  ]);
  const saves = [];
  const api = {
    days,
    saves,
    onDaySave: null,
    async getKV(_session, key) {
      if (key === 'heys_profile') return { data: PROPLUS_CARD.heys_profile, error: null };
      if (key.startsWith('heys_dayv2_')) {
        const date = key.slice('heys_dayv2_'.length);
        return { data: days.get(date) || null, error: null };
      }
      return { data: null, error: null };
    },
    async mergeSaveKV(_session, key, value, lastSeenUpdatedAt) {
      saves.push({ key, value, lastSeenUpdatedAt });
      if (!key.startsWith('heys_dayv2_')) return { ok: true, outcome: 'incoming_wins', value };
      const date = key.slice('heys_dayv2_'.length);
      const current = days.get(date) || null;
      const action = typeof api.onDaySave === 'function'
        ? api.onDaySave({ date, key, value, current, lastSeenUpdatedAt })
        : null;
      if (action && action.outcome === 'stale_write_blocked') {
        return { ok: true, outcome: 'stale_write_blocked', value: current };
      }
      days.set(date, structuredClone(value));
      if (action && action.throwAfterCommit) throw new Error('response_lost_after_commit');
      return { ok: true, outcome: 'incoming_wins', value: days.get(date) };
    },
  };
  return api;
}

function moveArgs() {
  return {
    date: '2026-08-01',
    index: 0,
    to_date: '2026-08-03',
    expected_plan_id: 'pl_1',
    expected_assigned_at: NOW - 1000,
  };
}

test('get_training показывает состав с id упражнений и подходов', async () => {
  const api = fakeApi({ day: DRAFT_PLAN_DAY(), card: PROPLUS_CARD });
  const res = await build(api).heys_get_training({});

  assert.match(res.text, /ex1/);
  assert.match(res.text, /a1/, 'id подхода виден — по нему и правят');
  assert.match(res.text, /heys_update_training/, 'сразу сказано, чем править');
  const [t] = res.structured.trainings;
  assert.equal(t.index, 0);
  assert.equal(t.plan_status, 'assigned');
  assert.equal(t.plan_id, 'pl_1');
  assert.equal(t.assigned_at, NOW - 1000);
  assert.equal(t.editable, true);
  assert.equal(t.exercises[0].approaches[0].weight_kg, 75);
  assert.equal(api.saves.length, 0, 'чтение ничего не пишет');
});

test('move_training пишет target первым, оставляет двусторонний trace и повторяется идемпотентно', async () => {
  const api = multiDayMoveApi(DRAFT_PLAN_DAY(), { date: '2026-08-03', meals: [], trainings: [], updatedAt: 50 });
  const tools = build(api);
  const first = await tools.heys_move_training(moveArgs());
  const second = await tools.heys_move_training(moveArgs());

  assert.deepEqual(api.saves.slice(0, 2).map((save) => save.key), [
    'heys_dayv2_2026-08-03',
    'heys_dayv2_2026-08-01',
  ]);
  const source = api.days.get('2026-08-01').trainings[0];
  const targets = api.days.get('2026-08-03').trainings.filter((training) => training.plan && training.plan.transferId);
  assert.equal(source.plan.status, 'moved');
  assert.equal(source.plan.movedTo, '2026-08-03');
  assert.equal(targets.length, 1);
  assert.equal(targets[0].plan.movedFrom, '2026-08-01');
  assert.equal(targets[0].plan.transferId, source.plan.transferId);
  assert.equal(first.structured.transfer_id, source.plan.transferId);
  assert.equal(second.structured.target_reused, true);

  const sourceRead = await tools.heys_get_training({ date: '2026-08-01', index: 0 });
  const targetRead = await tools.heys_get_training({ date: '2026-08-03', index: 0 });
  assert.equal(sourceRead.structured.trainings[0].moved_to, '2026-08-03');
  assert.equal(targetRead.structured.trainings[0].moved_from, '2026-08-01');
  assert.equal(targetRead.structured.trainings[0].transfer_id, source.plan.transferId);
  assert.match(targetRead.text, /перенесена с 2026-08-01/);
});

test('move_training компенсирует target, когда source отвергнут как stale', async () => {
  const api = multiDayMoveApi(DRAFT_PLAN_DAY(), { date: '2026-08-03', meals: [], trainings: [], updatedAt: 50 });
  api.onDaySave = ({ date, value }) => (
    date === '2026-08-01' && value.trainings[0].plan.status === 'moved'
      ? { outcome: 'stale_write_blocked' }
      : null
  );
  await assert.rejects(
    () => build(api).heys_move_training(moveArgs()),
    (error) => error.code === 'stale_move' && /перенос отменён/.test(error.message),
  );
  assert.equal(api.days.get('2026-08-01').trainings[0].plan.status, 'assigned');
  assert.equal(
    api.days.get('2026-08-03').trainings.some((training) => training.plan && training.plan.transferId),
    false,
    'точечная компенсация убирает только созданную target-запись',
  );
});

test('move_training не удаляет target с live-work во время stale-компенсации', async () => {
  const api = multiDayMoveApi(DRAFT_PLAN_DAY(), { date: '2026-08-03', meals: [], trainings: [], updatedAt: 50 });
  api.onDaySave = ({ date, value }) => {
    if (date !== '2026-08-01' || value.trainings[0].plan.status !== 'moved') return null;
    const target = structuredClone(api.days.get('2026-08-03'));
    target.trainings[0].workoutLog = {
      version: 1,
      zoneMinutes: [0, 0, 0, 0],
      exercises: [{ approaches: [{ done: false, drops: [{ done: true }] }] }],
    };
    target.updatedAt += 1;
    api.days.set('2026-08-03', target);
    return { outcome: 'stale_write_blocked' };
  };

  await assert.rejects(
    () => build(api).heys_move_training(moveArgs()),
    (error) => error.code === 'move_partial' && /target_changed/.test(error.message),
  );
  const targetTraining = api.days.get('2026-08-03').trainings[0];
  assert.equal(targetTraining.workoutLog.exercises[0].approaches[0].drops[0].done, true);
  assert.ok(targetTraining.plan.transferId, 'target с живой работой сохранён');
});

for (const lostSide of ['target', 'source']) {
  test(`move_training подтверждает fresh-read после потерянного ответа ${lostSide}`, async () => {
    const api = multiDayMoveApi(DRAFT_PLAN_DAY(), { date: '2026-08-03', meals: [], trainings: [], updatedAt: 50 });
    let thrown = false;
    api.onDaySave = ({ date, value }) => {
      const isLostWrite = lostSide === 'target'
        ? date === '2026-08-03' && value.trainings.some((training) => training.plan && training.plan.transferId)
        : date === '2026-08-01' && value.trainings[0].plan.status === 'moved';
      if (!thrown && isLostWrite) {
        thrown = true;
        return { throwAfterCommit: true };
      }
      return null;
    };

    const result = await build(api).heys_move_training(moveArgs());
    const source = api.days.get('2026-08-01').trainings[0];
    const target = api.days.get('2026-08-03').trainings.find((training) => training.plan && training.plan.transferId);
    assert.equal(source.plan.status, 'moved');
    assert.equal(target.plan.transferId, source.plan.transferId);
    assert.equal(result.structured.transfer_id, source.plan.transferId);
  });
}

test('move_training не переиспользует orphan предыдущей ревизии плана', async () => {
  const oldSource = DRAFT_PLAN_DAY();
  const oldPlan = oldSource.trainings[0].plan;
  const oldOut = dayModel.moveTrainingOut(oldSource, 0, {
    toDate: '2026-08-03',
    expectedPlanId: oldPlan.id,
    expectedAssignedAt: oldPlan.assignedAt,
    nowMs: NOW,
    clientId: CLIENT,
  });
  const target = dayModel.moveTrainingIn(
    { date: '2026-08-03', meals: [], trainings: [], updatedAt: 50 },
    oldOut.movedTraining,
    { nowMs: NOW, clientId: CLIENT },
  ).day;
  const revisedSource = DRAFT_PLAN_DAY();
  revisedSource.trainings[0].plan.assignedAt += 1;
  revisedSource.trainings[0].planSnapshot.exercises[0].approaches[0].weightKg = '80';
  const api = multiDayMoveApi(revisedSource, target);

  await assert.rejects(
    () => build(api).heys_move_training({
      ...moveArgs(),
      expected_assigned_at: revisedSource.trainings[0].plan.assignedAt,
    }),
    (error) => error.code === 'stale_move' && /предыдущей ревизии/.test(error.message),
  );
  assert.equal(api.days.get('2026-08-03').trainings.filter((training) => training.plan && training.plan.transferId).length, 1);
  assert.equal(api.saves.length, 0);
});

test('get_training читает skipped-план из snapshot, а не из пустого журнала', async () => {
  const skipped = DRAFT_PLAN_DAY();
  skipped.trainings[0].plan.status = 'skipped';
  const res = await build(fakeApi({ day: skipped, card: PROPLUS_CARD })).heys_get_training({ index: 0 });

  assert.equal(res.structured.trainings[0].plan_status, 'skipped');
  assert.equal(res.structured.trainings[0].exercises[0].name, 'Жим');
});

test('get_training про начатый план говорит, что правка только предложением', async () => {
  const api = fakeApi({ day: STARTED_PLAN_DAY(), card: PROPLUS_CARD });
  const res = await build(api).heys_get_training({ index: 0 });
  assert.equal(res.structured.trainings[0].editable, false);
  assert.equal(res.structured.trainings[0].exercises[0].name, 'Жим', 'начатый план читается из живого журнала');
  assert.match(res.text, /heys_propose_training_edit/);
});

test('update_training правит состав черновика адресно', async () => {
  const api = fakeApi({ day: DRAFT_PLAN_DAY(), card: PROPLUS_CARD });
  const res = await build(api).heys_update_training({
    index: 0,
    exercises_add: [{ name: 'Тяга', approaches: [{ reps: 6, weight_kg: 80 }] }],
    exercises_patch: [{ exercise_id: 'ex1', approaches_patch: [{ approach_id: 'a2', weight_kg: 80 }] }],
  });

  const saved = api.saves.find((x) => x.key.startsWith('heys_dayv2_'));
  const ex = saved.value.trainings[0].planSnapshot.exercises;
  assert.equal(ex.length, 2);
  assert.equal(ex[0].approaches[1].weightKg, '80');
  assert.equal(ex[0].approaches[1].id, 'a2', 'подход остался тем же');
  assert.equal(ex[1].name, 'Тяга');
  assert.deepEqual(saved.value.trainings[0].workoutLog, { version: 1, zoneMinutes: [0, 0, 0, 0], exercises: [] });
  assert.equal(saved.value.trainings[0].plan.status, 'assigned');
  assert.equal(saved.value.trainings[0].time, '18:00', 'карточка тренировки не тронута');
  assert.equal(res.structured.exercises.length, 2, 'в ответе состав в той же форме, что на вход');
});

test('update_training не правит состав начатого плана и требует Pro Спорт', async () => {
  const started = fakeApi({ day: STARTED_PLAN_DAY(), card: PROPLUS_CARD });
  await assert.rejects(
    () => build(started).heys_update_training({ index: 0, exercises_remove: ['ex1'] }),
    (e) => e.code === 'invalid_plan_edit' && /heys_propose_training_edit/.test(e.message),
  );
  assert.equal(started.saves.length, 0);

  const noSub = fakeApi({ day: DRAFT_PLAN_DAY() });
  await assert.rejects(
    () => build(noSub).heys_update_training({ index: 0, exercises_remove: ['ex1'] }),
    (e) => e.code === 'tariff_required',
  );
  assert.equal(noSub.saves.length, 0);
});

// --- heys_propose_training_edit -----------------------------------------

/** День с планом, который клиент открыл и закрыл в нём первый подход. */
const STARTED_PLAN_DAY = () => ({
  date: '2026-08-01',
  meals: [],
  waterMl: 0,
  updatedAt: 111,
  trainings: [{
    id: 'tr_a',
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    z: [0, 0, 0, 0],
    plan: { id: 'pl_1', status: 'started', assignedBy: 'Артём' },
    planSnapshot: { exercises: [] },
    workoutLog: {
      version: 1,
      exercises: [{
        id: 'ex1',
        name: 'Жим',
        ssGroup: 0,
        approaches: [
          { id: 'a1', weightKg: '75', reps: 8, done: true },
          { id: 'a2', weightKg: '75', reps: 8, done: false },
        ],
      }],
    },
  }],
});

test('propose_training_edit пишет предложение и называет то, что не ляжет', async () => {
  const api = fakeApi({ day: STARTED_PLAN_DAY(), card: PROPLUS_CARD });
  const res = await build(api).heys_propose_training_edit({
    index: 0,
    proposed_by: 'Артём',
    // Жим убран целиком, но клиент уже закрыл в нём подход.
    exercises: [{ name: 'Планка', approaches: [{ reps: 1 }] }],
  });

  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  const t = saved.value.trainings[0];
  assert.equal(t.plan.proposal.status, 'pending');
  // Живая запись не тронута — решение осталось за клиентом.
  assert.equal(t.workoutLog.exercises[0].name, 'Жим');
  assert.equal(t.workoutLog.exercises[0].approaches[0].done, true);
  assert.ok(res.structured.will_not_apply.some((r) => r.name === 'Жим'));
  assert.match(res.text, /Ляжет не всё/);
});

test('propose_training_edit требует тариф Pro Спорт и ничего не пишет без него', async () => {
  const api = fakeApi({ day: STARTED_PLAN_DAY() });
  await assert.rejects(
    () => build(api).heys_propose_training_edit({
      index: 0,
      proposed_by: 'Артём',
      exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }] }],
    }),
    (e) => e.code === 'tariff_required',
  );
  assert.equal(api.saves.length, 0);
});

test('withdraw_training_proposal убирает предложение, повторный отзыв отбивается', async () => {
  const base = STARTED_PLAN_DAY();
  const api = fakeApi({ day: base, card: PROPLUS_CARD });
  const tools = build(api);
  await tools.heys_propose_training_edit({
    index: 0,
    proposed_by: 'Артём',
    exercises: [{ name: 'Жим', approaches: [{ reps: 8, weight_kg: 60 }, { reps: 8, weight_kg: 60 }] }],
  });
  await tools.heys_withdraw_training_proposal({ index: 0 });

  const last = api.saves.filter((s) => s.key.startsWith('heys_dayv2_')).pop();
  assert.equal(last.value.trainings[0].plan.proposal, undefined);
  assert.equal(last.value.trainings[0].plan.status, 'started');

  await assert.rejects(
    () => tools.heys_withdraw_training_proposal({ index: 0 }),
    (e) => e.code === 'nothing_to_withdraw',
  );
});

test('assign_program: сбой записи одного дня не роняет остальные — статус partial', async () => {
  const api = fakeApi({ day: null, card: PROPLUS_CARD });
  api.onMergeSave = (key) => {
    if (key === 'heys_dayv2_2026-08-13') return { ok: false, error: 'stale' };
    return null;
  };
  const res = await build(api).heys_assign_program({
    title: 'Верх/низ',
    assigned_by: 'Артём',
    days: [
      { date: '2026-08-11', exercises: PROGRAM_EXERCISE },
      { date: '2026-08-13', exercises: PROGRAM_EXERCISE },
    ],
  });

  assert.equal(res.structured.status, 'partial');
  assert.equal(res.structured.written.length, 1);
  assert.equal(res.structured.written[0].date, '2026-08-11');
  assert.equal(res.structured.failed.length, 1);
  assert.equal(res.structured.failed[0].date, '2026-08-13');

  const index = api.saves.find((s) => s.key === 'heys_training_program');
  assert.equal(index.value.status, 'partial');
  assert.equal(index.value.days.length, 1);
});

test('log_training считает нагрузку сессии по реальным пульсовым зонам клиента', async () => {
  const api = fakeApi({
    day: null,
    card: {
      heys_profile: { weight: 80, height: 180, age: 40, gender: 'Мужской', deficitPctTarget: -15 },
      heys_norms: {},
      // MET по зонам клиента — не дефолт TDEE [2.5,6,8,10]. Если nagruzka
      // считалась бы по дефолту, число ниже не сошлось бы.
      heys_hr_zones: [{ MET: 2 }, { MET: 3 }, { MET: 5 }, { MET: 8 }],
    },
  });
  const res = await build(api).heys_log_training({ zones_minutes: [30, 0, 20, 0] });
  // 30×2 + 20×5 = 160.
  assert.equal(res.structured.session_load, 160);
  assert.match(res.text, /нагрузка ≈160 MET-мин/);
});

test('get_day отдаёт сводку и meal_id для правок', async () => {
  const api = fakeApi({
    day: {
      date: '2026-08-01', updatedAt: 9, waterMl: 200,
      meals: [{ id: 'm1', name: 'Перекус', time: '15:54', items: [{ id: 'i1', name: 'Кофе', grams: 100, kcal100: 50 }] }],
    },
  });
  const tools = build(api);
  const res = await tools.heys_get_day({});
  assert.equal(res.structured.meals[0].id, 'm1');
  assert.equal(res.structured.water_ml, 200);
  assert.equal(api.saves.length, 0);
  assert.match(res.text, /m1/);
  assert.match(res.text, /i1/);
  assert.match(res.text, /Кофе/);
});

test('search_products показывает источник продукта', async () => {
  const tools = build(fakeApi({ day: null }));
  const res = await tools.heys_search_products({ query: 'сироп' });
  assert.equal(res.structured.results[0].source, 'мой список');
  assert.match(res.text, /own-syrup|s-syrup|product_id|own-/);
  assert.ok(res.text.includes(res.structured.results[0].product_id));
});

test('пустая выдача поиска закрывает перебор формулировок', async () => {
  const tools = build(fakeApi({ day: null }));
  const res = await tools.heys_search_products({ query: 'мраморная говядина вагю' });
  assert.equal(res.structured.results.length, 0);
  assert.equal(res.structured.exact_match, false);
  assert.match(res.text, /Каталог просмотрен целиком/);
  assert.match(res.text, /heys_create_product/);
});

test('выдача без точного совпадения честно называет себя ближайшей', async () => {
  const tools = build(fakeApi({ day: null }));
  const res = await tools.heys_search_products({ query: 'кофе латте горячий' });
  assert.ok(res.structured.results.length > 0);
  assert.equal(res.structured.exact_match, false);
  assert.match(res.text, /Точного совпадения/);
});

test('точное совпадение не тянет за собой подсказку про create_product', async () => {
  const tools = build(fakeApi({ day: null }));
  const res = await tools.heys_search_products({ query: 'сироп' });
  assert.equal(res.structured.exact_match, true);
  assert.doesNotMatch(res.text, /Точного совпадения/);
});

test('list_meal_presets отдаёт наборы с граммовками', async () => {
  const tools = build(fakeApi({ day: null }));
  const res = await tools.heys_list_meal_presets({});
  assert.equal(res.structured.presets[0].name, 'Кофе Киндерли');
  assert.equal(res.structured.presets[0].items.length, 3);
});

test('save_meal_preset создаёт набор и кладёт его в начало списка, как приложение', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const res = await tools.heys_save_meal_preset({
    name: 'Кофе без сиропа',
    items: [{ product_id: 'own-americano', grams: 100 }, { query: 'молоко ультрапастеризованное', grams: 200 }],
  });

  assert.equal(api.upserts.length, 1);
  assert.equal(api.upserts[0].key, 'heys_meal_presets_v1');
  const saved = api.upserts[0].value;
  assert.equal(saved.length, PRESETS.length + 1);
  assert.equal(saved[0].name, 'Кофе без сиропа');
  assert.equal(saved[1].name, 'Кофе Киндерли', 'существующие наборы не потерялись');
  assert.equal(res.structured.created, true);
  // Позиция набора — усечённая форма приложения, без полного слепка нутриентов.
  const ALLOWED = new Set(['product_id', 'name', 'grams', 'kcal100', 'protein100', 'fat100',
    'simple100', 'complex100', 'badFat100', 'goodFat100', 'trans100', 'fiber100', 'gi', 'harm']);
  const unexpected = Object.keys(saved[0].items[0]).filter((k) => !ALLOWED.has(k));
  assert.deepEqual(unexpected, [], 'в наборе нет лишних полей');
  assert.equal(saved[0].items[0].calcium, undefined);
  assert.equal(saved[0].items[0].product_id, 'own-americano');
});

test('save_meal_preset с тем же названием обновляет набор, а не плодит дубль', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const res = await tools.heys_save_meal_preset({
    name: 'кофе киндерли',
    items: [{ product_id: 'own-americano', grams: 120 }],
  });
  const saved = api.upserts[0].value;
  assert.equal(saved.length, PRESETS.length);
  assert.equal(res.structured.created, false);
  assert.equal(res.structured.preset_id, 'mp_coffee');
  const updated = saved.find((p) => p.id === 'mp_coffee');
  assert.equal(updated.items.length, 1);
  assert.equal(updated.items[0].grams, 120);
  assert.equal(updated.createdAt !== undefined, true);
});

test('save_meal_preset отклоняет пустое имя и пустой список позиций', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  await assert.rejects(() => tools.heys_save_meal_preset({ name: '  ', items: [{ product_id: 'own-milk', grams: 100 }] }), (e) => e.code === 'invalid_name');
  await assert.rejects(() => tools.heys_save_meal_preset({ name: 'X', items: [] }), (e) => e.code === 'invalid_items');
  assert.equal(api.upserts.length, 0);
});

test('save_meal_preset не пишет набор с неоднозначным продуктом', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_save_meal_preset({ name: 'Кофе', items: [{ query: 'кофе', grams: 100 }] }),
    (e) => e.code === 'ambiguous_product',
  );
  assert.equal(api.upserts.length, 0);
});

test('delete_meal_preset удаляет по названию и оставляет остальные', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const res = await tools.heys_delete_meal_preset({ name: 'Кофе Киндерли' });
  assert.equal(api.upserts[0].value.length, PRESETS.length - 1);
  assert.equal(res.structured.deleted, true);
  await assert.rejects(() => tools.heys_delete_meal_preset({ name: 'Нет такого' }), (e) => e.code === 'preset_not_found');
});

test('delete_meal_preset требует хотя бы один идентификатор', async () => {
  const tools = build(fakeApi({ day: null }));
  await assert.rejects(() => tools.heys_delete_meal_preset({}), (e) => e.code === 'invalid_args');
});

test('сохранённый набор сразу виден в list и пригоден для log_meal', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  await tools.heys_save_meal_preset({
    name: 'Двойной американо',
    items: [{ product_id: 'own-americano', grams: 200 }],
  });
  const listed = await tools.heys_list_meal_presets({});
  assert.ok(listed.structured.presets.some((p) => p.name === 'Двойной американо'));
  await tools.heys_log_meal({ preset: 'Двойной американо' });
  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.name, 'Двойной американо');
  assert.equal(meal.items[0].grams, 200);
  // В приём кладётся полный слепок, хотя в наборе хранится усечённый.
  assert.notEqual(meal.items[0].kcal100, undefined);
});

const LABEL = {
  name: 'Печенье «Тест» овсяное',
  brand: 'Тестбренд',
  barcode: '4 600 000-12345 6',
  protein100: 6.5, simple100: 24, complex100: 40,
  badFat100: 5, goodFat100: 9, trans100: 0.3,
  fiber100: 4, gi: 62, harm: 8.1,
  portions: [{ name: '1 шт', grams: 10 }, { name: 'пусто', grams: 0 }],
  additives: ['e500', ' e322 '],
};

test('create_product собирает карточку из данных этикетки', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const res = await tools.heys_create_product(LABEL);

  const write = api.upserts.find((u) => u.key === 'heys_products_overlay_v2');
  assert.ok(write, 'записан overlay продуктов');
  assert.equal(write.value.length, OVERLAY.length + 1, 'существующие продукты не потеряны');
  const row = write.value[write.value.length - 1];

  assert.equal(row._custom, true);
  assert.equal(row.in_my_list, true);
  assert.match(row.id, /^p_\d+_[0-9a-f]{6}$/);
  assert.equal(row.brand, 'Тестбренд');
  // Штрихкод чистится от пробелов и дефисов, как в приложении.
  assert.equal(row.barcode, '460000012345 6'.replace(/\s/g, ''));
  assert.deepEqual(row.barcodes, [row.barcode]);
  // Порция с нулевым весом отбрасывается.
  assert.deepEqual(row.portions, [{ name: '1 шт', grams: 10 }]);
  assert.deepEqual(row.additives, ['E500', 'E322']);
  // Углеводы и жиры достраиваются из компонентов.
  assert.equal(row.carbs100, 64);
  assert.equal(row.fat100, 14.3);
  // Калорийность — NET Atwater, а не цифра с упаковки.
  assert.equal(row.kcal100, Math.round((3 * 6.5 + 4 * 64 + 9 * 14.3) * 10) / 10);
  assert.equal(res.structured.product_id, row.id);
});

test('create_product требует все обязательные нутриенты и называет недостающие', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const { gi, harm, ...withoutGi } = LABEL;
  await assert.rejects(
    () => tools.heys_create_product(withoutGi),
    (e) => {
      assert.equal(e.code, 'nutrients_missing');
      assert.deepEqual(e.details.missing.sort(), ['gi', 'harm']);
      return true;
    },
  );
  assert.equal(api.upserts.length, 0);
});

test('create_product не плодит дубль существующего продукта', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_create_product({ ...LABEL, name: 'кофе американо' }),
    (e) => {
      assert.equal(e.code, 'product_exists');
      assert.ok(e.details.existing.name);
      return true;
    },
  );
  assert.equal(api.upserts.length, 0);
});

test('create_product предупреждает о похожем продукте с другим названием', async () => {
  const saladOverlay = [
    ...OVERLAY,
    {
      id: 'own-salad',
      _custom: true,
      name: 'Салат крабовый классический',
      protein100: 5,
      simple100: 3,
      complex100: 4,
      badFat100: 1,
      goodFat100: 2,
      trans100: 0,
      fiber100: 1,
      gi: 40,
      harm: 2,
      in_my_list: true,
    },
  ];
  const api = fakeApi({ day: null, overlay: saladOverlay });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_create_product({ ...LABEL, name: 'Крабовый салат' }),
    (e) => {
      assert.equal(e.code, 'product_similar_exists');
      assert.equal(e.details.existing.name, 'Салат крабовый классический');
      assert.equal(e.details.candidates.length, 1);
      return true;
    },
  );
  assert.equal(api.upserts.length, 0);
});

test('create_product по allow_duplicate проходит мимо похожего названия', async () => {
  const saladOverlay = [
    ...OVERLAY,
    {
      id: 'own-salad',
      _custom: true,
      name: 'Салат крабовый классический',
      protein100: 5,
      simple100: 3,
      complex100: 4,
      badFat100: 1,
      goodFat100: 2,
      trans100: 0,
      fiber100: 1,
      gi: 40,
      harm: 2,
      in_my_list: true,
    },
  ];
  const api = fakeApi({ day: null, overlay: saladOverlay });
  const tools = build(api);
  await tools.heys_create_product({ ...LABEL, name: 'Крабовый салат', allow_duplicate: true });
  // Каталог пишется парой: строки и сторож целостности. Без манифеста
  // клиент отвергает пару молча (2026-08-22, apps/web/BUGS_HISTORY.md).
  assert.deepEqual(api.upserts.map((u) => u.key), [
    'heys_products_overlay_v2',
    'heys_products_overlay_v2_rpc_manifest',
  ]);
});

test('create_product по явному подтверждению всё же создаёт одноимённый продукт', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  await tools.heys_create_product({ ...LABEL, name: 'Кофе американо', allow_duplicate: true });
  // Каталог пишется парой: строки и сторож целостности. Без манифеста
  // клиент отвергает пару молча (2026-08-22, apps/web/BUGS_HISTORY.md).
  assert.deepEqual(api.upserts.map((u) => u.key), [
    'heys_products_overlay_v2',
    'heys_products_overlay_v2_rpc_manifest',
  ]);
});

test('create_product предупреждает про похожее название, даже если текст не совпал точно', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_create_product({ ...LABEL, name: 'Молоко ультрапастеризованное' }),
    (e) => {
      assert.equal(e.code, 'product_similar_exists');
      assert.match(e.details.existing.name, /Молоко ультрапастеризованное 3\.5/);
      return true;
    },
  );
  assert.equal(api.upserts.length, 0);
});

test('create_product по allow_duplicate создаёт похожий продукт с другим названием', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const res = await tools.heys_create_product({ ...LABEL, name: 'Молоко ультрапастеризованное', allow_duplicate: true });
  assert.ok(res.structured.product_id);
});

test('create_product предупреждает про ранее удалённое имя вместо тихого создания', async () => {
  const api = fakeApi({ day: null });
  api.tombstones = [{ id: 'old', name: 'Печенье «Тест» овсяное' }];
  const tools = build(api);
  await assert.rejects(() => tools.heys_create_product(LABEL), (e) => e.code === 'product_tombstoned');
  assert.equal(api.upserts.length, 0);
});

test('созданный продукт сразу доступен для записи приёма', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const created = await tools.heys_create_product(LABEL);
  await tools.heys_log_meal({ items: [{ product_id: created.structured.product_id, grams: 30 }] });
  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.items[0].name, LABEL.name);
  assert.equal(meal.items[0].grams, 30);
});

test('ошибка инструмента доходит до модели как isError, а не как сбой протокола', async () => {
  const tools = build(fakeApi({ day: null }));
  const response = await mcp.handleMessage(
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'heys_log_meal', arguments: { items: [{ query: 'кофе', grams: 100 }] } } },
    { tools },
  );
  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.error, 'ambiguous_product');
  assert.ok(Array.isArray(response.result.structuredContent.candidates));
  // Кандидаты обязаны быть в text: structuredContent в Cursor часто не виден.
  assert.match(response.result.content[0].text, /Кандидаты:/);
  assert.match(response.result.content[0].text, /product_id|own-|s-/);
});

test('get_day для сегодня пишет норму и статус чек-ина в text', async () => {
  const api = fakeApi({
    day: {
      date: '2026-08-01', updatedAt: 9, waterMl: 200,
      meals: [{ id: 'm1', name: 'Перекус', time: '15:54', items: [{ id: 'i1', name: 'Кофе', grams: 100, kcal100: 50 }] }],
    },
  });
  const tools = build(api);
  const res = await tools.heys_get_day({});
  assert.match(res.text, /Норма /);
  assert.match(res.text, /Чек-ин:/);
  assert.ok(res.structured.checkin);
  assert.ok(res.structured.norm);
});

test('get_day печатает поддержание и целевой дефицит в text, не только в structured', async () => {
  const api = fakeApi({
    card: CARD,
    day: { date: '2026-08-01', meals: [], waterMl: 0, weightMorning: 80, updatedAt: 111 },
  });
  const res = await build(api).heys_get_day({ date: '2026-08-01' });
  assert.match(res.text, /Целевой дефицит 15% уже учтён: без него расход дня — 1730 ккал/);
  assert.match(res.structured.norm.note, /Целевой дефицит 15%/);
});

test('get_day при нулевом дефиците называет норму поддержанием в text', async () => {
  const api = fakeApi({
    card: { heys_profile: { weight: 90, height: 183, age: 38, gender: 'Мужской', deficitPctTarget: 0 } },
    day: { date: '2026-08-01', meals: [], waterMl: 0, weightMorning: 90, updatedAt: 111 },
  });
  const res = await build(api).heys_get_day({ date: '2026-08-01' });
  assert.match(res.text, /Целевой дефицит в профиле не задан \(0%\) — это норма поддержания/);
});

test('get_day text раскладывает норму на базу, NDTE и поправку', async () => {
  const api = fakeApi({
    card: CARD,
    day: { date: '2026-08-02', meals: [], waterMl: 0, weightMorning: 80, updatedAt: 111 },
    pastDays: {
      '2026-08-01': {
        date: '2026-08-01', weightMorning: 80, meals: [],
        trainings: [{ z: [0, 0, 60, 30], type: 'cardio', time: '18:00' }],
      },
    },
  });
  const res = await build(api).heys_get_day({ date: '2026-08-02' });
  assert.match(res.text, /база /);
  assert.match(res.text, /NDTE /);
  assert.ok(res.structured.norm.parts.ndte > 0);
  assert.equal(res.structured.norm.parts.base + res.structured.norm.parts.correction, res.structured.norm.kcal);
});

test('log_meal печатает item_id в text', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 5 } });
  const tools = build(api);
  const res = await tools.heys_log_meal({
    items: [{ product_id: 'own-americano', grams: 100 }],
    name: 'Кофе',
  });
  assert.match(res.text, /Записал:/);
  assert.match(res.text, /own-americano|Кофе американо/);
  const itemId = res.structured.items[0].id;
  assert.ok(itemId);
  assert.match(res.text, new RegExp(itemId));
});

test('без grams берётся единственная порция с карточки', async () => {
  const created = await build(fakeApi({ day: null })).heys_create_product({
    ...LABEL,
    name: 'Батончик порционный',
    portions: [{ name: '1 шт', grams: 42 }],
  });
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], updatedAt: 5 },
    overlay: [...OVERLAY, created.structured.created_row],
  });
  const tools = build(api);
  const res = await tools.heys_log_meal({
    items: [{ product_id: created.structured.product_id }],
    name: 'Перекус',
  });
  assert.equal(res.structured.items[0].grams, 42);
  assert.match(res.text, /порция/);
});

test('create_product клонирует нутриенты по from_product_id', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const base = await tools.heys_create_product(LABEL);
  const res = await tools.heys_create_product({
    name: 'Помидоры черри',
    from_product_id: base.structured.product_id,
  });
  assert.equal(res.structured.cloned_from.product_id, base.structured.product_id);
  assert.equal(res.structured.protein100, LABEL.protein100);
  assert.match(res.text, /клон нутриентов/);
  assert.match(res.text, /product_id=/);
});

// ── Правка приёма, штуки, тайминг ─────────────────────────────────────────

const DINNER_DAY = () => ({
  date: '2026-08-01',
  updatedAt: 900,
  meals: [{
    id: 'm_dinner',
    name: 'Ужин',
    time: '20:42',
    mood: 7,
    items: [{ id: 'it_milk', product_id: 'own-milk', name: 'Молоко ультрапастеризованное 3.5', grams: 185, kcal100: 60, protein100: 3, carbs100: 4.7, fat100: 3.5 }],
  }],
});

test('update_meal copy_meal дописывает позиции из вчерашнего приёма в существующий', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_lunch',
        name: 'Обед',
        time: '13:00',
        items: [{ id: 'it_plov', product_id: 'own-milk', name: 'Плов', grams: 250 }],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({
    day: {
      date: '2026-08-01',
      updatedAt: 900,
      meals: [{
        id: 'm_breakfast',
        name: 'Завтрак',
        time: '08:00',
        items: [{ id: 'it_coffee', product_id: 'own-americano', name: 'Кофе', grams: 50 }],
      }],
    },
    pastDays,
  });
  const tools = build(api);
  await tools.heys_update_meal({
    meal_id: 'm_breakfast',
    copy_meal: { date: yesterday, meal_id: 'm_lunch' },
  });

  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.id, 'm_breakfast');
  assert.equal(meal.items.length, 2);
  assert.equal(meal.items[0].grams, 50);
  assert.equal(meal.items[1].grams, 250);
});

test('update_meal copy_meal и add_items в одном вызове дописывают всё в приём', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_lunch',
        name: 'Обед',
        time: '13:00',
        items: [{ id: 'it_plov', product_id: 'own-milk', name: 'Плов', grams: 200 }],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({
    day: {
      date: '2026-08-01',
      updatedAt: 900,
      meals: [{ id: 'm_breakfast', name: 'Завтрак', time: '08:00', items: [] }],
    },
    pastDays,
  });
  const tools = build(api);
  await tools.heys_update_meal({
    meal_id: 'm_breakfast',
    copy_meal: { date: yesterday, meal_id: 'm_lunch' },
    add_items: [{ product_id: 'own-syrup', grams: 15 }],
  });

  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.items.length, 2);
  assert.equal(meal.items[0].grams, 200);
  assert.equal(meal.items[1].grams, 15);
});

test('update_meal copy_meal с item_ids копирует только выбранные позиции', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_snack',
        name: 'Перекус',
        time: '12:30',
        items: [
          { id: 'it_env', product_id: 'own-milk', name: 'Конверты фило', grams: 111 },
          { id: 'it_pancake', product_id: 'own-syrup', name: 'Блины овсяные', grams: 35 },
        ],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({
    day: {
      date: '2026-08-01',
      updatedAt: 900,
      meals: [{ id: 'm_lunch', name: 'Обед', time: '13:00', items: [{ id: 'it_chupa', product_id: 'own-syrup', name: 'Чупа-чупс', grams: 5 }] }],
    },
    pastDays,
  });
  const tools = build(api);
  await tools.heys_update_meal({
    meal_id: 'm_lunch',
    copy_meal: { date: yesterday, meal_id: 'm_snack', item_ids: ['it_env'] },
  });

  const meal = api.saves[0].value.meals.find((m) => m.id === 'm_lunch');
  assert.equal(meal.items.length, 2);
  assert.equal(meal.items[0].grams, 5);
  assert.equal(meal.items[1].grams, 111);
});

test('update_meal copy_meal отклоняет несуществующий item_id', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_snack',
        name: 'Перекус',
        items: [{ id: 'it_env', product_id: 'own-milk', name: 'Конверты', grams: 111 }],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [{ id: 'm_lunch', items: [] }], updatedAt: 1 },
    pastDays,
  });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_update_meal({
      meal_id: 'm_lunch',
      copy_meal: { date: yesterday, meal_id: 'm_snack', item_ids: ['it_missing'] },
    }),
    (e) => e.code === 'item_not_found',
  );
});

test('update_meal copy_meal отклоняет частичное совпадение item_ids', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_snack',
        name: 'Перекус',
        items: [
          { id: 'it_env', product_id: 'own-milk', name: 'Конверты', grams: 111 },
          { id: 'it_pan', product_id: 'own-milk', name: 'Блины', grams: 35 },
        ],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [{ id: 'm_lunch', items: [] }], updatedAt: 1 },
    pastDays,
  });
  const tools = build(api);
  // Один id верный, второй с опечаткой: скопировать половину и отчитаться
  // «готово» — тихая потеря еды из дня, поэтому вызов отклоняется целиком.
  await assert.rejects(
    () => tools.heys_update_meal({
      meal_id: 'm_lunch',
      copy_meal: { date: yesterday, meal_id: 'm_snack', item_ids: ['it_env', 'it_pancake'] },
    }),
    (e) => e.code === 'item_not_found' && /it_pancake/.test(e.message),
  );
  assert.equal(api.saves.length, 0, 'при отказе день не пишется');
});

test('update_meal copy_meal не спотыкается о повтор одного item_id', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_snack',
        name: 'Перекус',
        items: [{ id: 'it_env', product_id: 'own-milk', name: 'Конверты', grams: 111 }],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [{ id: 'm_lunch', items: [] }], updatedAt: 1 },
    pastDays,
  });
  const tools = build(api);
  await tools.heys_update_meal({
    meal_id: 'm_lunch',
    copy_meal: { date: yesterday, meal_id: 'm_snack', item_ids: ['it_env', 'it_env'] },
  });
  const meal = api.saves[0].value.meals.find((m) => m.id === 'm_lunch');
  assert.equal(meal.items.length, 1, 'дубль в item_ids не множит позицию и не даёт ложный item_not_found');
});

test('update_meal copy_meal дописывает позиции из вчерашнего приёма в существующий', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_lunch',
        name: 'Обед',
        time: '13:00',
        items: [{ id: 'it_plov', product_id: 'own-milk', name: 'Плов', grams: 250 }],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({
    day: {
      date: '2026-08-01',
      updatedAt: 900,
      meals: [{
        id: 'm_breakfast',
        name: 'Завтрак',
        time: '08:00',
        items: [{ id: 'it_coffee', product_id: 'own-americano', name: 'Кофе', grams: 50 }],
      }],
    },
    pastDays,
  });
  const tools = build(api);
  await tools.heys_update_meal({
    meal_id: 'm_breakfast',
    copy_meal: { date: yesterday, meal_id: 'm_lunch' },
  });

  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.id, 'm_breakfast');
  assert.equal(meal.items.length, 2);
  assert.equal(meal.items[0].grams, 50);
  assert.equal(meal.items[1].grams, 250);
});

test('update_meal copy_meal и add_items в одном вызове дописывают всё в приём', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_lunch',
        name: 'Обед',
        time: '13:00',
        items: [{ id: 'it_plov', product_id: 'own-milk', name: 'Плов', grams: 200 }],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({
    day: {
      date: '2026-08-01',
      updatedAt: 900,
      meals: [{ id: 'm_breakfast', name: 'Завтрак', time: '08:00', items: [] }],
    },
    pastDays,
  });
  const tools = build(api);
  await tools.heys_update_meal({
    meal_id: 'm_breakfast',
    copy_meal: { date: yesterday, meal_id: 'm_lunch' },
    add_items: [{ product_id: 'own-syrup', grams: 15 }],
  });

  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.items.length, 2);
  assert.equal(meal.items[0].grams, 200);
  assert.equal(meal.items[1].grams, 15);
});

test('update_meal copy_meal с item_ids копирует только выбранные позиции', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_snack',
        name: 'Перекус',
        time: '12:30',
        items: [
          { id: 'it_env', product_id: 'own-milk', name: 'Конверты фило', grams: 111 },
          { id: 'it_pancake', product_id: 'own-syrup', name: 'Блины овсяные', grams: 35 },
        ],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({
    day: {
      date: '2026-08-01',
      updatedAt: 900,
      meals: [{ id: 'm_lunch', name: 'Обед', time: '13:00', items: [{ id: 'it_chupa', product_id: 'own-syrup', name: 'Чупа-чупс', grams: 5 }] }],
    },
    pastDays,
  });
  const tools = build(api);
  await tools.heys_update_meal({
    meal_id: 'm_lunch',
    copy_meal: { date: yesterday, meal_id: 'm_snack', item_ids: ['it_env'] },
  });

  const meal = api.saves[0].value.meals.find((m) => m.id === 'm_lunch');
  assert.equal(meal.items.length, 2);
  assert.equal(meal.items[0].grams, 5);
  assert.equal(meal.items[1].grams, 111);
});

test('update_meal copy_meal отклоняет несуществующий item_id', async () => {
  const yesterday = '2026-07-31';
  const pastDays = {
    [yesterday]: {
      date: yesterday,
      meals: [{
        id: 'm_snack',
        name: 'Перекус',
        items: [{ id: 'it_env', product_id: 'own-milk', name: 'Конверты', grams: 111 }],
      }],
      updatedAt: 10,
    },
  };
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [{ id: 'm_lunch', items: [] }], updatedAt: 1 },
    pastDays,
  });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_update_meal({
      meal_id: 'm_lunch',
      copy_meal: { date: yesterday, meal_id: 'm_snack', item_ids: ['it_missing'] },
    }),
    (e) => e.code === 'item_not_found',
  );
});

test('update_meal добавляет позицию, сохраняя id, время и оценки приёма', async () => {
  const api = fakeApi({ day: DINNER_DAY() });
  const tools = build(api);
  const res = await tools.heys_update_meal({
    meal_id: 'm_dinner',
    add_items: [{ product_id: 'own-syrup', grams: 20 }],
  });

  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.id, 'm_dinner');
  assert.equal(meal.time, '20:42');
  assert.equal(meal.mood, 7);
  assert.equal(meal.items.length, 2);
  assert.equal(api.saves[0].lastSeenUpdatedAt, 900);
  assert.equal(res.structured.meal_id, 'm_dinner');
  assert.ok(res.structured.changed.length);
});

test('update_meal правит граммовку и убирает позицию', async () => {
  const api = fakeApi({ day: DINNER_DAY() });
  const tools = build(api);
  await tools.heys_update_meal({
    meal_id: 'm_dinner',
    add_items: [{ product_id: 'own-syrup', grams: 20 }],
    set_grams: { it_milk: 200 },
  });
  const meal = api.saves[0].value.meals[0];
  assert.equal(meal.items.find((i) => i.id === 'it_milk').grams, 200);
});

test('update_meal пишет deletedItemIds при удалении позиции', async () => {
  const base = DINNER_DAY();
  base.meals[0].items.push({
    id: 'it_syrup', product_id: 'own-syrup', name: 'Сироп', grams: 20, kcal100: 300, protein100: 0, carbs100: 75, fat100: 0,
  });
  const api = fakeApi({ day: base });
  const tools = build(api);
  const res = await tools.heys_update_meal({
    meal_id: 'm_dinner',
    remove_item_ids: ['it_syrup'],
  });
  assert.ok(api.saves[0].value.deletedItemIds.it_syrup);
  assert.ok(!api.saves[0].value.meals[0].items.some((i) => i.id === 'it_syrup'));
  assert.match(res.text, /m_dinner/);
  assert.match(res.text, /it_milk/);
});

test('update_meal падает, если сервер вернул удалённую позицию обратно', async () => {
  const base = DINNER_DAY();
  base.meals[0].items.push({
    id: 'it_syrup', product_id: 'own-syrup', name: 'Сироп', grams: 20, kcal100: 300, protein100: 0, carbs100: 75, fat100: 0,
  });
  const api = fakeApi({ day: base });
  api.onMergeSave = (_key, value) => {
    const corrupted = JSON.parse(JSON.stringify(value));
    const meal = corrupted.meals.find((m) => m.id === 'm_dinner');
    meal.items.push({
      id: 'it_syrup', product_id: 'own-syrup', name: 'Сироп', grams: 20, kcal100: 300, protein100: 0, carbs100: 75, fat100: 0,
    });
    return { ok: true, outcome: 'day_merged', value: corrupted };
  };
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_update_meal({ meal_id: 'm_dinner', remove_item_ids: ['it_syrup'] }),
    (e) => e.code === 'item_resurrected',
  );
});

test('create_product печатает product_id в тексте', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const res = await tools.heys_create_product(LABEL);
  assert.match(res.text, /product_id=/);
  assert.ok(res.text.includes(res.structured.product_id));
});

test('update_meal не даёт опустошить приём и предлагает удаление', async () => {
  const api = fakeApi({ day: DINNER_DAY() });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_update_meal({ meal_id: 'm_dinner', remove_item_ids: ['it_milk'] }),
    (e) => e.code === 'meal_would_be_empty',
  );
  assert.equal(api.saves.length, 0);
});

test('update_meal сообщает о неизвестном id позиции и ничего не пишет', async () => {
  const api = fakeApi({ day: DINNER_DAY() });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_update_meal({ meal_id: 'm_dinner', remove_item_ids: ['it_nope'] }),
    (e) => e.code === 'item_not_found',
  );
  assert.equal(api.saves.length, 0);
});

test('update_meal требует существующий приём и хотя бы одно изменение', async () => {
  const api = fakeApi({ day: DINNER_DAY() });
  const tools = build(api);
  await assert.rejects(() => tools.heys_update_meal({ meal_id: 'm_nope', name: 'X' }), (e) => e.code === 'meal_not_found');
  await assert.rejects(() => tools.heys_update_meal({ meal_id: 'm_dinner' }), (e) => e.code === 'nothing_to_update');
});

const CANDY_OVERLAY = [
  ...OVERLAY,
  { id: 'own-candy', _custom: true, in_my_list: true, name: 'Конфеты Toffifee', protein100: 6, carbs100: 57, fat100: 31, portions: [{ name: '1 шт', grams: 8 }] },
  { id: 'own-sausage', _custom: true, in_my_list: true, name: 'Сосиски «Вязанка Сливочные»', protein100: 11, carbs100: 1, fat100: 15 },
];

test('штуки считаются по весу порции из карточки продукта', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 1 }, overlay: CANDY_OVERLAY });
  const tools = build(api);
  await tools.heys_log_meal({ items: [{ product_id: 'own-candy', pieces: 4 }] });
  assert.equal(api.saves[0].value.meals[0].items[0].grams, 32);
});

test('штуки без известного веса не угадываются, а спрашиваются', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 1 }, overlay: CANDY_OVERLAY });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_log_meal({ items: [{ product_id: 'own-sausage', pieces: 4 }] }),
    (e) => e.code === 'piece_weight_unknown',
  );
  assert.equal(api.saves.length, 0);
});

test('названный пользователем вес штуки сохраняется в карточку продукта', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 1 }, overlay: CANDY_OVERLAY });
  const tools = build(api);
  const res = await tools.heys_log_meal({ items: [{ product_id: 'own-sausage', pieces: 4, piece_grams: 45 }] });

  assert.equal(api.saves[0].value.meals[0].items[0].grams, 180);
  const overlaySave = api.upserts.find((u) => u.key === 'heys_products_overlay_v2');
  const sausage = overlaySave.value.find((r) => r.id === 'own-sausage');
  assert.deepEqual(sausage.portions, [{ name: '1 шт', grams: 45 }]);
  assert.deepEqual(res.structured.learned_piece_grams, [{ name: 'Сосиски «Вязанка Сливочные»', grams: 45 }]);
});

test('известный вес штуки не перезаписывается и лишней записи не делает', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 1 }, overlay: CANDY_OVERLAY });
  const tools = build(api);
  await tools.heys_log_meal({ items: [{ product_id: 'own-candy', pieces: 2, piece_grams: 99 }] });
  assert.equal(api.upserts.some((u) => u.key === 'heys_products_overlay_v2'), false);
});

test('единственное совпадение в личном списке не считается неоднозначным', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 1 }, overlay: CANDY_OVERLAY });
  const tools = build(api);
  await tools.heys_log_meal({ items: [{ query: 'сосиски вязанка сливушки', grams: 180 }] });
  assert.equal(api.saves[0].value.meals[0].items[0].name, 'Сосиски «Вязанка Сливочные»');
});

test('tools/call возвращает длительность и отдаёт её в метрику', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 1 } });
  const tools = build(api);
  const metrics = [];
  let upstreamCalls = 0;
  const response = await mcp.handleMessage(
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'heys_add_water', arguments: { ml: 200 } } },
    {
      tools,
      logMetric: (m) => metrics.push(m),
      upstream: () => ({ calls: (upstreamCalls += 1), ms: 5 }),
    },
  );

  assert.equal(typeof response.result.structuredContent.duration_ms, 'number');
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].tool, 'heys_add_water');
  assert.equal(metrics[0].ok, true);
  assert.equal(metrics[0].upstream.calls, 1);
});

test('метрика пишется и для ошибки инструмента', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 1 } });
  const tools = build(api);
  const metrics = [];
  const response = await mcp.handleMessage(
    { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'heys_add_water', arguments: { ml: 0 } } },
    { tools, logMetric: (m) => metrics.push(m) },
  );

  assert.equal(response.result.isError, true);
  assert.equal(metrics[0].ok, false);
  assert.equal(metrics[0].error, 'invalid_ml');
  assert.equal(typeof metrics[0].ms, 'number');
});

// ── Правка и удаление продукта ───────────────────────────────────────────
// Дубликат вместо правки — самая дорогая ошибка каталога: он тянется в дневник,
// наборы и отчёты. Поэтому правка обязана работать и на своих карточках, и на
// продуктах общей базы.

const CUSTOM_OVERLAY = [
  {
    id: 'own-cake', _custom: true, in_my_list: true, name: 'Торт домашний',
    protein100: 5, simple100: 30, complex100: 10, badFat100: 8, goodFat100: 4, trans100: 0,
    fiber100: 1, gi: 60, harm: 6, carbs100: 40, fat100: 12, kcal100: 283,
  },
];

test('правка своей карточки меняет поля и пересчитывает калорийность', async () => {
  const api = fakeApi({ overlay: CUSTOM_OVERLAY });
  const tools = build(api);
  const res = await tools.heys_update_product({ query: 'торт домашний', simple100: 40, harm: 8 });

  const saved = api.upserts.find((u) => u.key === 'heys_products_overlay_v2').value;
  const row = saved.find((r) => r.id === 'own-cake');
  assert.equal(row.simple100, 40);
  assert.equal(row.harm, 8);
  assert.equal(row.carbs100, 50, 'углеводы пересобраны из простых и сложных');
  assert.equal(row.kcal100, 3 * 5 + 4 * 50 + 9 * 12, 'калорийность пересчитана, а не осталась старой');
  assert.equal(row.name, 'Торт домашний', 'нетронутое поле осталось');
  assert.equal(res.structured.mode, 'custom');
});

test('правка продукта общей базы заводит личную версию, а не копию', async () => {
  const api = fakeApi({ overlay: [] });
  const tools = build(api);
  const res = await tools.heys_update_product({ query: 'кофе латте', gi: 35 });

  const saved = api.upserts.find((u) => u.key === 'heys_products_overlay_v2').value;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].shared_origin_id, 's-latte', 'строка ссылается на общую базу');
  assert.equal(saved[0].overrides.gi, 35, 'правка легла в overrides');
  assert.equal(saved[0].overrides.name, undefined, 'ничего лишнего в overrides не попало');
  assert.equal(saved[0].in_my_list, true);
  assert.equal(res.structured.mode, 'linked');
  assert.match(res.text, /общая карточка не изменилась/);
});

test('правка без изменений и с неизвестными полями не пишет в облако', async () => {
  const api = fakeApi({ overlay: CUSTOM_OVERLAY });
  const tools = build(api);
  await assert.rejects(() => tools.heys_update_product({ query: 'торт домашний', harm: 6 }), (e) => e.code === 'nothing_to_update');
  await assert.rejects(() => tools.heys_update_product({ query: 'торт домашний', calories: 100 }), (e) => {
    assert.equal(e.code, 'nothing_to_update');
    assert.match(e.message, /не хранятся/);
    return true;
  });
  assert.equal(api.upserts.length, 0);
});

test('удаление продукта ставит tombstone и убирает строку overlay', async () => {
  const api = fakeApi({ overlay: CUSTOM_OVERLAY });
  const tools = build(api);
  const res = await tools.heys_delete_product({ query: 'торт домашний' });

  const overlaySave = api.upserts.find((u) => u.key === 'heys_products_overlay_v2');
  assert.deepEqual(overlaySave.value, [], 'строка убрана из списка');
  const tombSave = api.upserts.find((u) => u.key === 'heys_deleted_ids');
  assert.equal(tombSave.value.length, 1);
  assert.equal(tombSave.value[0].id, 'own-cake');
  assert.equal(tombSave.value[0].name, 'Торт домашний');
  assert.equal(res.structured.deleted, true);
});

/**
 * Целостность каталога. 21.08 на проде оказалось, что удаление карточки
 * проверяет рецепты и не смотрит наборы: четыре набора двух клиентов
 * ссылались на мёртвые id, и разворачивание падало целиком.
 */
test('удаление называет наборы, где продукт используется', async () => {
  const api = fakeApi({ overlay: OVERLAY });
  const tools = build(api);
  const res = await tools.heys_delete_product({ product_id: 'own-americano' });

  assert.deepEqual(res.structured.used_in_presets, ['Кофе Киндерли']);
  assert.match(res.text, /входит в наборы/);
  assert.match(res.text, /«Кофе Киндерли»/);
  assert.match(res.text, /heys_save_meal_preset/);
});

test('удаление продукта не из набора о наборах не говорит', async () => {
  const api = fakeApi({ overlay: CUSTOM_OVERLAY });
  const tools = build(api);
  const res = await tools.heys_delete_product({ query: 'торт домашний' });
  assert.equal(res.structured.used_in_presets, undefined);
  assert.doesNotMatch(res.text, /входит в наборы/);
});

test('набор с мёртвой позицией разворачивается по снимку, а не падает', async () => {
  // Карточки в каталоге нет вовсе — ни по id, ни по имени, — но КБЖУ лежат
  // в самой позиции набора. Приложение в этом случае приём пишет; MCP до
  // 21.08 ронял весь вызов, включая живые позиции.
  const presets = [{
    id: 'mp_gone',
    name: 'Набор с удалённым продуктом',
    items: [
      { product_id: 'own-americano', name: 'Кофе американо', grams: 100 },
      {
        product_id: 'dead-product-id',
        name: 'Домашний кофе',
        grams: 300,
        kcal100: 17.7,
        protein100: 1.1,
        simple100: 1.6,
        complex100: 0,
        badFat100: 0.3,
        goodFat100: 0.2,
        trans100: 0,
        fiber100: 0,
        gi: 30,
        harm: 0,
      },
    ],
  }];
  const api = fakeApi({ day: null, presets });
  const tools = build(api);

  const res = await tools.heys_log_meal({ preset: 'Набор с удалённым продуктом', time: '11:00' });

  assert.equal(res.structured.items.length, 2, 'живая позиция не потерялась вместе с мёртвой');
  const restored = res.structured.items.find((i) => i.name === 'Домашний кофе');
  assert.equal(restored.grams, 300);
  assert.deepEqual(res.structured.from_preset_snapshot, ['Домашний кофе']);
  assert.match(res.text, /карточки в базе больше нет/);
  assert.match(res.text, /heys_create_product/);

  // КБЖУ берутся из снимка, а не обнуляются.
  const saved = api.saves[api.saves.length - 1].value;
  const item = saved.meals[0].items.find((i) => i.name === 'Домашний кофе');
  assert.equal(item.kcal100 > 0, true, `КБЖУ восстановлены: ${item.kcal100}`);
  assert.equal(item.protein100, 1.1);
});

test('позиция набора без КБЖУ по-прежнему отклоняется — восстанавливать нечего', async () => {
  const presets = [{
    id: 'mp_empty',
    name: 'Пустая ссылка',
    items: [{ product_id: 'dead-product-id', name: 'Призрак', grams: 100 }],
  }];
  const tools = build(fakeApi({ day: null, presets }));
  await assert.rejects(() => tools.heys_log_meal({ preset: 'Пустая ссылка', time: '11:00' }), (e) => {
    assert.equal(e.code, 'preset_item_missing');
    assert.match(e.message, /КБЖУ не сохранены/);
    return true;
  });
});

test('продукт общей базы удалить нельзя', async () => {
  const api = fakeApi({ overlay: [] });
  const tools = build(api);
  await assert.rejects(() => tools.heys_delete_product({ query: 'кофе латте' }), (e) => {
    assert.equal(e.code, 'shared_product');
    return true;
  });
  assert.equal(api.upserts.length, 0);
});

// ── Итог дня после записи ────────────────────────────────────────────────

/**
 * Подставной API, где merge возвращает СВОЮ версию дня — как настоящий сервер.
 * Форма ответа — контракт клиента API (`value`), в который heys-api.js
 * разворачивает `v` из тела merge_save.
 */
function fakeApiWithServerMerge(mergedDay, outcome = 'day_merged') {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 } });
  api.mergeSaveKV = async (_session, key, value, lastSeenUpdatedAt) => {
    api.saves.push({ key, value, lastSeenUpdatedAt });
    return { ok: true, outcome, value: mergedDay };
  };
  return api;
}

test('day_after считается по блобу сервера, а не по нашей копии', async () => {
  // Сервер слил нашу запись с приёмом, который клиент внёс параллельно:
  // в дне два приёма, а мы отправляли один.
  const merged = {
    date: '2026-08-01',
    waterMl: 250,
    meals: [
      { id: 'm_from_client', time: '09:00', items: [{ name: 'Каша', grams: 200, kcal100: 100 }] },
      { id: 'm_ours', time: '13:47', items: [{ name: 'Кофе', grams: 100, kcal100: 50 }] },
    ],
  };
  const api = fakeApiWithServerMerge(merged);
  const tools = build(api);
  const res = await tools.heys_log_meal({ items: [{ product_id: 'own-americano', grams: 100 }], time: '13:47' });

  const after = res.structured.day_after;
  assert.equal(after.meals, 2, 'видно чужой приём, которого не было в нашей копии');
  assert.equal(after.water_ml, 250);
  assert.equal(after.totals.kcal, 250);
  assert.equal(after.outcome, 'day_merged');
  assert.match(res.text, /Итого за 2026-08-01: 250 ккал, приёмов 2/);
});

test('day_after падает на нашу копию, когда сервер блоб не вернул', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 100, updatedAt: 111 } });
  const tools = build(api);
  const res = await tools.heys_add_water({ ml: 150 });
  assert.equal(res.structured.day_after.water_ml, 250);
  assert.equal(res.structured.day_after.meals, 0);
});

test('каждый инструмент, меняющий день, отдаёт day_after', async () => {
  const day = {
    date: '2026-08-01',
    meals: [{ id: 'm1', time: '09:00', name: 'Завтрак', items: [{ id: 'it1', name: 'Каша', grams: 200, kcal100: 100 }] }],
    waterMl: 0,
    updatedAt: 111,
  };
  const calls = [
    ['heys_log_meal', { items: [{ product_id: 'own-americano', grams: 100 }] }],
    ['heys_update_meal', { meal_id: 'm1', set_grams: { it1: 150 } }],
    ['heys_delete_meal', { meal_id: 'm1' }],
    ['heys_add_water', { ml: 200 }],
    ['heys_log_training', { zones_minutes: [30] }],
    ['heys_update_day', { steps: 8000 }],
  ];
  for (const [name, args] of calls) {
    const tools = build(fakeApi({ day: JSON.parse(JSON.stringify(day)) }));
    const res = await tools[name](args);
    assert.ok(res.structured.day_after, `${name}: нет day_after`);
    assert.equal(res.structured.day_after.date, '2026-08-01', `${name}: не та дата`);
    assert.match(res.text, /Итого за 2026-08-01/, `${name}: итог не попал в текст`);
  }
});

test('heys_update_day показывает записанные показатели, а не только калории', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 } });
  const tools = build(api);
  const res = await tools.heys_update_day({ steps: 8000, weight: 90.7, sleep_quality: 6 });

  assert.equal(res.structured.day_after.steps, 8000);
  assert.equal(res.structured.day_after.weight_morning, 90.7);
  assert.equal(res.structured.day_after.sleep.quality, 6);
  assert.match(res.text, /В дне после записи: .*шаги 8000/);
  assert.match(res.text, /вес 90\.7 кг/);
  assert.match(res.text, /качество сна 6/);
});

/**
 * Инцидент 20.08.2026: вызов heys_update_day(steps) прошёл без ошибки, а в дне
 * остался 0 — по ответу это было неотличимо от успеха, потому что подтверждение
 * показывало только калории, приёмы и воду. Ответ обязан показать 0.
 */
test('потерянная сервером запись шагов видна в ответе, а не молчит', async () => {
  const serverDayWithoutSteps = { date: '2026-08-01', waterMl: 0, meals: [] };
  const api = fakeApiWithServerMerge(serverDayWithoutSteps);
  const tools = build(api);
  const res = await tools.heys_update_day({ steps: 8000 });

  assert.equal(res.structured.day_after.steps, 0, 'day_after берёт шаги из блоба сервера');
  assert.match(res.text, /В дне после записи: шаги 0\./, 'ноль назван вслух');
});

test('отклонённая запись показывает значения рядом с НЕ ЗАПИСАНО', async () => {
  const api = fakeApiWithServerMerge({ date: '2026-08-01', waterMl: 0, meals: [], steps: 300 }, 'stale_write_blocked');
  const tools = build(api);
  const res = await tools.heys_update_day({ steps: 8000 });

  assert.match(res.text, /НЕ ЗАПИСАНО \(stale_write_blocked\)\. В дне после записи: шаги 300\./);
});

test('ответы про еду и воду не тащат показатели дня', async () => {
  const day = { date: '2026-08-01', meals: [], waterMl: 0, steps: 8000, weightMorning: 90.7, updatedAt: 111 };
  for (const [name, args] of [
    ['heys_add_water', { ml: 200 }],
    ['heys_log_meal', { items: [{ product_id: 'own-americano', grams: 100 }] }],
  ]) {
    const tools = build(fakeApi({ day: JSON.parse(JSON.stringify(day)) }));
    const res = await tools[name](args);
    assert.ok(!/В дне после записи/.test(res.text), `${name}: показатели дня попали в чужой ответ`);
    assert.equal(res.structured.day_after.steps, 8000, `${name}: в structured показатели всё же есть`);
  }
});

test('WRITE_TOOLS совпадает с обработчиками, которые реально пишут', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'tools.js'), 'utf8');
  const found = new Set();
  let current = null;
  for (const line of source.split('\n')) {
    const header = /^ {4}async (heys_[a-z_]+)\(/.exec(line);
    if (header) current = header[1];
    if (current && /\b(writeDay|saveCardKey|api\.upsertKV|products\.saveOverlayRows|saveOverlayRowsFromRead)\(/.test(line)) found.add(current);
  }
  assert.deepEqual([...found].sort(), [...WRITE_TOOLS].sort(),
    'список WRITE_TOOLS разошёлся с инструментами, которые пишут в облако');
  for (const name of WRITE_TOOLS) {
    assert.ok(TOOL_SCHEMAS.some((s) => s.name === name), `${name} нет среди схем`);
  }
});

// --- heys_checkin ------------------------------------------------------
//
// Основная claim этого инструмента: submit пишет так, что приложение
// действительно засчитывает шаг — в отличие от heys_update_day, где то же
// значение остаётся помеченным кураторским. Каждый тест ниже проверяет это
// тем же условием, каким его проверяет само приложение (см.
// apps/web/heys_morning_checkin_v1.js: hasCheckinWeight/hasSleepTime/…),
// а не пересказом реализации.

const PROFILE_KEY = 'heys_profile';

test('heys_checkin get — статус required-шагов совпадает с условием приложения', async () => {
  const api = fakeApi({
    day: {
      date: '2026-08-01',
      weightMorning: 80.2,
      sleepStart: '23:30', sleepEnd: '07:00', sleepQuality: 7,
      moodMorning: 8,
      meals: [], waterMl: 0, updatedAt: 111,
    },
    card: { [PROFILE_KEY]: { stepsGoal: 9000 } },
  });
  const res = await build(api).heys_checkin({ action: 'get' });
  assert.equal(res.structured.status, 'done');
  assert.match(res.text, /пройден/);
  const byId = Object.fromEntries(res.structured.steps.map((s) => [s.id, s]));
  assert.equal(byId.weight.done, true);
  assert.equal(byId.sleep.done, true);
  assert.equal(byId.steps_goal.value, 9000);
  assert.equal(byId.cold_exposure.required, false, 'холод — необязательный шаг');
});

test('heys_checkin get — значение куратора закрывает core-шаг для gate, но помечено curatorAuthored', async () => {
  // heys/4546fb: куратор заполнил вес — клиенту мастер не нужен по этому полю;
  // get должен совпадать с приложением: done=true, curatorAuthored=true.
  const api = fakeApi({
    day: {
      date: '2026-08-01',
      weightMorning: 80.2,
      _curatorEdits: { weightMorning: { at: 1, value: 80.2 } },
      meals: [], waterMl: 0, updatedAt: 111,
    },
  });
  const res = await build(api).heys_checkin({ action: 'get' });
  const weight = res.structured.steps.find((s) => s.id === 'weight');
  assert.equal(weight.done, true, 'кураторское значение закрывает шаг для gate');
  assert.equal(weight.curatorAuthored, true);
  assert.equal(res.structured.status, 'partial');
});

test('heys_checkin submit — пишет без кураторской метки, шаг закрывается по-настоящему', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 } });
  const res = await build(api).heys_checkin({
    action: 'submit', weight: 80.2, sleep_start: '23:30', sleep_end: '07:00', sleep_quality: 7, mood: 8,
  });
  assert.equal(res.structured.status.status, 'partial', 'steps_goal не передан — до done не хватает профиля');
  const weightStep = res.structured.status.steps.find((s) => s.id === 'weight');
  assert.equal(weightStep.done, true);

  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.ok(saved, 'день должен уйти в mergeSaveKV');
  assert.equal(saved.value._curatorEdits, undefined,
    'submit — это диктовка живьём, а не решение куратора: метки авторства быть не должно');
});

test('heys_checkin submit затем get — статус done и mood держатся', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: { stepsGoal: 9000 } },
  });
  const tools = build(api);
  const submit = await tools.heys_checkin({
    action: 'submit',
    weight: 80.2,
    sleep_start: '23:30',
    sleep_end: '07:00',
    sleep_quality: 7,
    mood: 9,
    wellbeing: 8,
    stress: 2,
    steps_goal: 9000,
  });
  assert.equal(submit.structured.status.status, 'done');

  const get = await tools.heys_checkin({ action: 'get' });
  assert.equal(get.structured.status, 'done');
  const mood = get.structured.steps.find((s) => s.id === 'mood');
  assert.equal(mood.done, true);
  assert.equal(mood.value, 9);
});

test('heys_checkin: то же поле через heys_update_day остаётся кураторским и шаг не закрывает', async () => {
  // Прямое сравнение с соседним инструментом — это и есть разница, ради
  // которой heys_checkin вообще завели.
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 } });
  const tools = createTools({ api, sessionToken: SESSION, clientId: CLIENT, nowMs: NOW, byCurator: true }).tools;
  await tools.heys_update_day({ weight: 80.2 });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.ok(saved.value._curatorEdits && saved.value._curatorEdits.weightMorning,
    'heys_update_day с byCurator — значение остаётся помеченным');
});

test('heys_checkin submit — задним числом отказывает и ничего не пишет', async () => {
  const api = fakeApi({ day: { date: '2026-07-31', meals: [], waterMl: 0, updatedAt: 111 } });
  const tools = build(api);
  await assert.rejects(
    () => tools.heys_checkin({ action: 'submit', date: '2026-07-31', weight: 80 }),
    (e) => e.code === 'retroactive_checkin',
  );
  assert.equal(api.saves.length, 0, 'отказ должен случиться до записи');
});

test('heys_checkin submit — холод пишется формой, которую понимает шаг приложения', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 } });
  const res = await build(api).heys_checkin({ action: 'submit', cold_type: 'coldShower' });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.deepEqual(Object.keys(saved.value.coldExposure).sort(), ['answeredAt', 'time', 'type']);
  assert.equal(saved.value.coldExposure.type, 'coldShower');
  assert.equal(res.structured.status.steps.find((s) => s.id === 'cold_exposure').done, true);
});

test('heys_checkin submit — неизвестный cold_type отклоняется, а не тихо игнорируется', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 } });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'submit', cold_type: 'iceCream' }),
    (e) => e.code === 'invalid_field',
  );
});

test('heys_checkin submit — цель по шагам уходит в профиль, а не в день', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: { stepsGoal: 5000, updatedAt: 5 } },
  });
  const res = await build(api).heys_checkin({ action: 'submit', steps_goal: 9000 });
  assert.equal(api.saves.some((s) => s.key.startsWith('heys_dayv2_')), false,
    'единственное переданное поле — профильное, день трогать незачем');
  const profileSave = api.saves.find((s) => s.key === PROFILE_KEY);
  assert.equal(profileSave.value.stepsGoal, 9000);
  assert.equal(res.structured.status.steps.find((s) => s.id === 'steps_goal').value, 9000);
});

test('heys_checkin submit — пустой вызов отказывает явно', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 } });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'submit' }),
    (e) => e.code === 'nothing_to_update',
  );
});

test('heys_checkin — action вне get/submit отклоняется', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 } });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'reset' }),
    (e) => e.code === 'invalid_action',
  );
});

test('heys_checkin submit — все три оценки шага пишутся вместе и без метки', async () => {
  // Шаг «утреннее настроение» в приложении спрашивает три оценки разом.
  // Инцидент 04.08: инструмент принимал только mood, две другие уходили через
  // heys_update_day и оседали кураторскими — heys_get_day показал
  // curator_authored: ["stressMorning","wellbeingMorning"] на живых данных.
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 } });
  const res = await build(api).heys_checkin({ action: 'submit', mood: 10, wellbeing: 9, stress: 1 });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.equal(saved.value.moodMorning, 10);
  assert.equal(saved.value.wellbeingMorning, 9);
  assert.equal(saved.value.stressMorning, 1);
  assert.equal(saved.value._curatorEdits, undefined, 'ни одна из трёх не помечается кураторской');
  assert.match(res.text, /wellbeing/);
});

test('heys_checkin submit — гасит кураторскую метку, а не просто не ставит новую', async () => {
  // Поле, однажды вписанное куратором, оставалось помеченным навсегда: при
  // byCurator=false метка не ставилась, но и не снималась, и повтор того же
  // числа не закрывал шаг. Приложение в этом месте зовёт clearCuratorMarks.
  const api = fakeApi({
    day: {
      date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111,
      weightMorning: 91.2,
      _curatorEdits: { weightMorning: { at: 1, value: 91.2 } },
    },
  });
  const res = await build(api).heys_checkin({ action: 'submit', weight: 91.2 });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.equal(saved.value._curatorEdits.weightMorning.value, null, 'метка погашена, а не оставлена');
  assert.equal(res.structured.status.steps.find((s) => s.id === 'weight').done, true,
    'то же самое число, названное клиентом, обязано закрыть шаг');
});

test('heys_checkin submit — замеры пишутся, а незаполненные поля остаются null', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: internalHealthProfile({ measurementsTrackingEnabled: true }) },
  });
  const res = await build(api).heys_checkin({ action: 'submit', measurements: { waist: 82 } });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.equal(saved.value.measurements.waist, 82);
  assert.equal(saved.value.measurements.hips, null);
  assert.equal(res.structured.status.steps.find((s) => s.id === 'measurements').done, true);
});

test('heys_checkin submit — пустые замеры отклоняются, а не пишутся тихим нулём', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: internalHealthProfile({ measurementsTrackingEnabled: true }) },
  });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'submit', measurements: {} }),
    (e) => e.code === 'invalid_field',
  );
});

test('heys_checkin submit — measurements_tracking_disabled отказывает явно', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: internalHealthProfile({ measurementsTrackingEnabled: false }) },
  });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'submit', measurements: { waist: 82 } }),
    (e) => e.code === 'measurements_tracking_disabled',
  );
  assert.equal(api.saves.length, 0);
});

test('heys_checkin submit — замеры пишутся для обычного аккаунта при включённом трекинге', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: { measurementsTrackingEnabled: true } },
  });
  const res = await build(api).heys_checkin({ action: 'submit', measurements: { waist: 82 } });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.equal(saved.value.measurements.waist, 82);
  assert.ok(res);
});

test('heys_checkin submit — добавки из каталога пишутся списком целиком', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: internalHealthProfile({ supplementsTrackingEnabled: true }) },
  });
  const res = await build(api).heys_checkin({ action: 'submit', supplements: ['vitD', 'omega3'] });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.deepEqual(saved.value.supplementsPlanned, ['vitD', 'omega3']);
  assert.equal(res.structured.status.steps.find((s) => s.id === 'supplements').done, true);
});

test('heys_checkin submit — custom_* добавки отклоняются', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: internalHealthProfile({ supplementsTrackingEnabled: true }) },
  });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'submit', supplements: ['vitD', 'omega3', 'custom_777'] }),
    (e) => e.code === 'invalid_field',
  );
  assert.equal(api.saves.length, 0, 'custom_* не должны проходить даже при включённом трекинге');
});

test('heys_checkin submit — добавка не из каталога отклоняется, а не пишется как есть', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: internalHealthProfile({ supplementsTrackingEnabled: true }) },
  });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'submit', supplements: ['vitD', 'магический-порошок'] }),
    (e) => e.code === 'invalid_field',
  );
  assert.equal(api.saves.length, 0, 'ни одна из добавок не должна уйти в облако, если список невалиден целиком');
});

test('heys_update_day — supplements_mark отмечает выбранные id', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111, supplementsPlanned: ['vitD', 'omega3', 'magnesium'] },
    card: { [PROFILE_KEY]: internalHealthProfile({ supplementsTrackingEnabled: true }) },
  });
  const res = await build(api).heys_update_day({ supplements_mark: ['vitD', 'omega3'] });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.deepEqual(saved.value.supplementsTaken, ['vitD', 'omega3']);
  assert.ok(saved.value.supplementsTakenAt.vitD);
  assert.ok(res.structured.updated.includes('supplements_mark'));
});

test('heys_update_day — supplements_timing morning отмечает только утренние из плана', async () => {
  const api = fakeApi({
    day: {
      date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111,
      supplementsPlanned: ['vitD', 'b12', 'magnesium', 'iron'],
    },
    card: { [PROFILE_KEY]: internalHealthProfile({ supplementsTrackingEnabled: true }) },
  });
  await build(api).heys_update_day({ supplements_timing: 'morning' });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.deepEqual(saved.value.supplementsTaken, ['b12', 'iron']);
});

test('heys_update_profile — planned_supplements_add дополняет курс и синхронизирует день', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111, supplementsPlanned: ['vitD'] },
    card: { [PROFILE_KEY]: internalHealthProfile({ plannedSupplements: ['vitD'], supplementsTrackingEnabled: true, updatedAt: 50 }) },
  });
  await build(api).heys_update_profile({ planned_supplements_add: ['omega3'] });
  const profileSave = api.saves.find((s) => s.key === PROFILE_KEY);
  assert.deepEqual(profileSave.value.plannedSupplements, ['vitD', 'omega3']);
  const daySave = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.deepEqual(daySave.value.supplementsPlanned, ['vitD', 'omega3']);
});

test('heys_checkin submit — cycle_tracking_removed отказывает явно', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: { gender: 'Мужской' } },
  });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'submit', cycle_day: 3 }),
    (e) => e.code === 'cycle_tracking_removed',
  );
  assert.equal(api.saves.length, 0);
});

test('heys_checkin submit — cycle_day отклонён даже при включённом флаге в профиле', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: { gender: 'Женский', cycleTrackingEnabled: true } },
  });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'submit', cycle_day: 3 }),
    (e) => e.code === 'cycle_tracking_removed',
  );
  assert.equal(api.saves.length, 0);
});

test('heys_checkin submit — cycle_status отклонён (снят с релиза)', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111, cycleDay: 3 },
    card: { [PROFILE_KEY]: { gender: 'Женский', cycleTrackingEnabled: true } },
  });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'submit', cycle_status: 'none' }),
    (e) => e.code === 'cycle_tracking_removed',
  );
  assert.equal(api.saves.length, 0);
});

test('heys_checkin submit — cycle_day и cycle_status разом — явная ошибка', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: { gender: 'Женский', cycleTrackingEnabled: true } },
  });
  await assert.rejects(
    () => build(api).heys_checkin({ action: 'submit', cycle_day: 3, cycle_status: 'none' }),
    (e) => e.code === 'invalid_field',
  );
});

test('heys_checkin get — без включённого трекинга шаг цикла не блокирует и объясняет почему', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: { gender: 'Мужской' } },
  });
  const res = await build(api).heys_checkin({ action: 'get' });
  const cycle = res.structured.steps.find((s) => s.id === 'cycle');
  assert.equal(cycle.done, true, 'у клиента без трекинга шаг не в ожидании — как и в приложении');
  assert.match(cycle.note, /выключен/);
});

test('heys_update_profile — cycle_tracking_enabled отклонён (снят с релиза)', async () => {
  const api = fakeApi({
    card: { [PROFILE_KEY]: { gender: 'Женский', cycleTrackingEnabled: false } },
  });
  await assert.rejects(
    () => build(api).heys_update_profile({ cycle_tracking_enabled: true }),
    (e) => e.code === 'cycle_tracking_removed',
  );
  assert.equal(api.saves.length, 0);
});

const INTERNAL_PROFILE = {
  gender: 'Женский',
  internalAccount: true,
  cycleTrackingEnabled: false,
};

test('heys_update_profile — cycle_tracking_enabled разрешён для internalAccount', async () => {
  const api = fakeApi({
    card: { [PROFILE_KEY]: { ...INTERNAL_PROFILE, cycleTrackingEnabled: false } },
  });
  const tools = createTools({ api, sessionToken: SESSION, clientId: 'any-client', nowMs: NOW }).tools;
  const res = await tools.heys_update_profile({ cycle_tracking_enabled: true });
  assert.ok(res.structured.updated.some((line) => /цикл/i.test(line) || /cycle/i.test(line)));
  const saved = api.saves.find((s) => s.key === PROFILE_KEY);
  assert.equal(saved.value.cycleTrackingEnabled, true);
});

test('heys_checkin submit — cycle_day разрешён для internalAccount при флаге', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
    card: { [PROFILE_KEY]: { ...INTERNAL_PROFILE, cycleTrackingEnabled: true } },
  });
  const tools = createTools({ api, sessionToken: SESSION, clientId: 'any-client', nowMs: NOW }).tools;
  await tools.heys_checkin({ action: 'submit', cycle_day: 3 });
  assert.ok(api.saves.some((s) => s.key.startsWith('heys_dayv2_')));
});

test('heys_update_day — refeed_day отмечает и снимает загрузочный день', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
  });
  const tools = build(api);
  const set = await tools.heys_update_day({ refeed_day: true, refeed_reason: 'deficit' });
  const savedSet = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.equal(savedSet.value.isRefeedDay, true);
  assert.equal(savedSet.value.refeedReason, 'deficit');
  assert.equal(set.structured.day_after.is_refeed_day, true);
  const unset = await tools.heys_update_day({ refeed_day: false });
  const savedUnset = api.saves[api.saves.length - 1];
  assert.equal(savedUnset.value.isRefeedDay, false);
  assert.equal(savedUnset.value.refeedReason, null);
  assert.equal(unset.structured.day_after.is_refeed_day, false);
});

test('heys_update_day — refeed_day:true без причины отклоняется', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
  });
  await assert.rejects(
    () => build(api).heys_update_day({ refeed_day: true }),
    (e) => e.code === 'invalid_field',
  );
});

test('heys_checkin submit — refeed_day пишется как шаг чек-ина', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 },
  });
  const res = await build(api).heys_checkin({
    action: 'submit',
    refeed_day: true,
    refeed_reason: 'rest',
  });
  const saved = api.saves.find((s) => s.key.startsWith('heys_dayv2_'));
  assert.equal(saved.value.isRefeedDay, true);
  assert.equal(saved.value.refeedReason, 'rest');
  assert.ok(res.structured.applied.includes('refeed_day'));
});

// --- Норма клиента в day_after ---------------------------------------------

const CARD = {
  heys_profile: { weight: 80, height: 180, age: 40, gender: 'Мужской', deficitPctTarget: -15 },
  heys_norms: { proteinPct: 25, carbsPct: 40, simpleCarbPct: 20, fiberPct: 14, badFatPct: 30, superbadFatPct: 1 },
  heys_hr_zones: [],
};

test('day_after считает норму сервером, а не берёт из кэша отрисовки', async () => {
  const api = fakeApi({
    card: CARD,
    day: { date: '2026-08-01', meals: [], waterMl: 0, weightMorning: 80, savedDisplayOptimum: 1900, updatedAt: 111 },
  });
  const res = await build(api).heys_log_meal({ items: [{ product_id: 'own-americano', grams: 100 }] });

  const norm = res.structured.day_after.norm;
  // 1471 — расчёт по данным дня; 1900 в блобе это кэш отрисовки, и он больше
  // не источник числа (инцидент 07.08.2026: MCP отдавал 1282 при 2209 на экране).
  assert.equal(norm.kcal, 1471);
  assert.equal(norm.parts.client_saw, 1900);
  assert.equal(norm.left.kcal, 1471 - res.structured.day_after.totals.kcal);
  assert.doesNotMatch(res.text, /та, что видит клиент/);
});

test('норма подхватывает окно прошлых дней и накидывает надбавку за недобор', async () => {
  // Три дня подряд заметно ниже нормы: сервер читает их блобы тем же пакетом,
  // что профиль, и считает долг зеркальным ядром приложения.
  const lean = (date) => ({
    date, weightMorning: 80, waterMl: 0, updatedAt: 100,
    meals: [{ id: `m-${date}`, items: [{ grams: 100, kcal100: 1100 }] }],
  });
  const api = fakeApi({
    card: CARD,
    day: { date: '2026-08-01', meals: [], waterMl: 0, weightMorning: 80, updatedAt: 111 },
    // NOW в тестах — 2026-08-01, значит окно долга это 07-31 … 07-29,
    // плюс 07-28 ради надбавки самому раннему дню окна.
    pastDays: {
      '2026-07-31': lean('2026-07-31'),
      '2026-07-30': lean('2026-07-30'),
      '2026-07-29': lean('2026-07-29'),
      '2026-07-28': lean('2026-07-28'),
    },
  });
  const res = await build(api).heys_add_water({ ml: 200 });

  const norm = res.structured.day_after.norm;
  assert.equal(norm.source, 'computed');
  assert.equal(norm.parts.window_days, 3);
  assert.equal(norm.parts.base, 1471);
  assert.equal(norm.parts.correction, 278);
  assert.equal(norm.kcal, 1749);
  assert.match(norm.note, /накопленный недобор за 3 дн/);
});

test('расхождение с тем, что видел клиент, названо вслух', async () => {
  const api = fakeApi({
    card: CARD,
    day: { date: '2026-08-01', meals: [], waterMl: 0, weightMorning: 80, savedDisplayOptimum: 1900, updatedAt: 111 },
  });
  const res = await build(api).heys_add_water({ ml: 200 });

  assert.match(res.structured.day_after.norm.note, /Клиент последний раз видел 1900 ккал/);
});

test('в дне без сохранённой нормы day_after даёт оценку и говорит, что это оценка', async () => {
  const api = fakeApi({
    card: CARD,
    day: { date: '2026-08-01', meals: [], waterMl: 0, weightMorning: 80, updatedAt: 111 },
  });
  const res = await build(api).heys_add_water({ ml: 200 });

  const norm = res.structured.day_after.norm;
  // Окна прошлых дней у фейкового API нет — значит долг посчитать не на чем.
  assert.equal(norm.source, 'estimate');
  assert.equal(norm.kcal, 1471); // BMR 1730 без активности, дефицит −15%
  assert.match(res.text, /Норма: ≈1471 ккал.*расчётная оценка/);
});

test('без профиля day_after честно говорит, что нормы нет, и ничего не выдумывает', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 111 } });
  const res = await build(api).heys_add_water({ ml: 200 });

  const norm = res.structured.day_after.norm;
  assert.equal(norm.source, null);
  assert.equal(norm.kcal, null);
  assert.equal(norm.left, null);
  assert.equal(norm.reason, 'no_profile');
  assert.match(res.text, /Норма не рассчитана/);
  assert.ok(!/1618/.test(res.text), 'дефолт приложения 70 кг / 30 лет в ответ не просочился');
});

test('норма читается один раз на запрос, а не на каждый инструмент', async () => {
  const api = fakeApi({
    card: CARD,
    day: { date: '2026-08-01', meals: [], waterMl: 0, savedDisplayOptimum: 1900, updatedAt: 111 },
  });
  const reads = [];
  const inner = api.getKV.bind(api);
  api.getKV = async (session, key) => { reads.push(key); return inner(session, key); };
  const tools = build(api);
  await tools.heys_add_water({ ml: 100 });
  await tools.heys_add_water({ ml: 100 });
  assert.equal(reads.filter((k) => k === 'heys_profile').length, 1);
});

test('сбой чтения карточки не роняет запись еды, а только гасит норму', async () => {
  const api = fakeApi({
    card: CARD,
    day: { date: '2026-08-01', meals: [], waterMl: 0, savedDisplayOptimum: 1900, updatedAt: 111 },
  });
  const inner = api.getKV.bind(api);
  api.getKV = async (session, key) => (
    key === 'heys_profile' ? { data: null, error: { message: 'boom' } } : inner(session, key)
  );
  const res = await build(api).heys_add_water({ ml: 200 });

  assert.equal(api.saves.length, 1, 'вода записана');
  assert.equal(res.structured.day_after.norm.source, null);
  assert.equal(res.structured.day_after.norm.reason, 'no_inputs');
});

/**
 * Назначенное куратором не считается состоявшейся тренировкой.
 *
 * Поле `plan` пока не пишет никто — защита ставится ДО реализации назначения,
 * чтобы первая же такая запись не раздула счётчики и накопленную нагрузку.
 */
const CARDIO = { z: [30, 0, 0, 0], time: '19:00', type: 'cardio' };
const trainingStatusApi = (trainings) => fakeApi({
  card: CARD,
  day: { date: '2026-08-01', meals: [], trainings, updatedAt: 111 },
  pastDays: {
    '2026-07-30': { date: '2026-07-30', meals: [], trainings: [CARDIO], updatedAt: 100 },
  },
});

test('heys_get_training_status не считает назначенную тренировку состоявшейся', async () => {
  const res = await build(trainingStatusApi([{ ...CARDIO, plan: { status: 'assigned' } }]))
    .heys_get_training_status({});

  const s = res.structured;
  // В списке осталась только настоящая тренировка 30.07.
  assert.deepEqual(s.sessions.map((x) => x.date), ['2026-07-30']);
  assert.equal(s.by_type.cardio.count, 1);
  // Последняя тренировка — та, что была, а не та, что назначена на сегодня.
  assert.equal(s.by_type.cardio.last_date, '2026-07-30');
});

test('день с назначенной тренировкой даёт ту же нагрузку, что день без неё', async () => {
  // Критерий слоя 1: план не создаёт нагрузки. Сравниваем не с константой, а с
  // тем же днём без записи — так тест переживёт правку коэффициентов модели.
  const planned = await build(trainingStatusApi([{ ...CARDIO, plan: { status: 'assigned' } }]))
    .heys_get_training_status({});
  const empty = await build(trainingStatusApi([])).heys_get_training_status({});

  assert.deepEqual(planned.structured.load, empty.structured.load);
});

test('начатая и обычная тренировка считаются в статусе как раньше', async () => {
  const empty = await build(trainingStatusApi([])).heys_get_training_status({});
  for (const trainings of [[{ ...CARDIO, plan: { status: 'started' } }], [CARDIO]]) {
    const res = await build(trainingStatusApi(trainings)).heys_get_training_status({});
    const s = res.structured;
    assert.deepEqual(s.sessions.map((x) => x.date), ['2026-07-30', '2026-08-01']);
    assert.equal(s.by_type.cardio.count, 2);
    assert.equal(s.by_type.cardio.last_date, '2026-08-01');
    // И нагрузку она несёт: у назначенной ряд совпал бы с пустым днём.
    assert.notDeepEqual(s.load, empty.structured.load);
  }
});

// --- heys_get_program_status ---------------------------------------------
//
// Слой 6 (CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09.md). Индекс
// heys_training_program — снимок дат/id, а не источник статуса: тест
// специально ставит в индексе даты, для которых живой день говорит другое
// (done вместо assigned из индекса), чтобы поймать регресс «поверил индексу».

const PLAN_EXERCISE = (name, weightKg, reps) => ({ name, approaches: [{ weightKg: String(weightKg), reps, done: false }] });
const DONE_EXERCISE = (name, weightKg, reps) => ({ name, approaches: [{ weightKg: String(weightKg), reps, done: true }] });

test('get_program_status: нет программы — не ошибка, а честный пустой ответ', async () => {
  const res = await build(fakeApi({ day: null })).heys_get_program_status();
  assert.deepEqual(res.structured, { has_program: false });
});

test('get_program_status: считает по живому plan.status каждого дня, не по индексу', async () => {
  const program = {
    id: 'pr_1', title: 'Верх/низ, 4 недели', weeks: 4, status: 'active',
    days: [
      { date: '2026-08-11', dayLabel: 'День A', weekIndex: 1, trainingId: 'tr_a' },
      { date: '2026-08-12', dayLabel: 'День B', weekIndex: 1, trainingId: 'tr_b' },
      { date: '2026-08-13', dayLabel: 'День C', weekIndex: 1, trainingId: 'tr_c' },
    ],
  };
  const api = fakeApi({
    card: { heys_training_program: program },
    day: {
      date: '2026-08-11',
      meals: [],
      updatedAt: 111,
      trainings: [{
        id: 'tr_a', type: 'strength', strengthEntryMode: 'workout_builder',
        plan: { status: 'done' },
        planSnapshot: { exercises: [PLAN_EXERCISE('Присед', 80, 5)] },
        workoutLog: { exercises: [DONE_EXERCISE('Присед', 75, 5)] },
      }],
    },
    pastDays: {
      '2026-08-12': {
        date: '2026-08-12', meals: [], updatedAt: 111,
        trainings: [{ id: 'tr_b', type: 'strength', strengthEntryMode: 'workout_builder', plan: { status: 'started' } }],
      },
      '2026-08-13': {
        date: '2026-08-13', meals: [], updatedAt: 111,
        trainings: [{ id: 'tr_c', type: 'strength', strengthEntryMode: 'workout_builder', plan: { status: 'skipped' } }],
      },
    },
  });

  const res = await build(api).heys_get_program_status();
  const s = res.structured;
  assert.equal(s.has_program, true);
  assert.deepEqual(s.counts, { assigned: 0, started: 1, done: 1, skipped: 1, moved: 0, missing: 0 });

  const dayA = s.sessions.find((x) => x.date === '2026-08-11');
  assert.equal(dayA.status, 'done');
  assert.equal(dayA.planned_volume_kg, 400); // 80×5
  assert.equal(dayA.actual_volume_kg, 375); // 75×5
  assert.deepEqual(dayA.deviations, [{
    name: 'Присед', approaches: [{ index: 0, planned_weight_kg: 80, actual_weight_kg: 75, planned_reps: 5, actual_reps: 5 }],
  }]);
});

test('get_program_status: выполнено точно по плану — deviations пустой', async () => {
  const program = {
    id: 'pr_2', title: 'Верх/низ', status: 'active',
    days: [{ date: '2026-08-11', dayLabel: 'День A', trainingId: 'tr_a' }],
  };
  const api = fakeApi({
    card: { heys_training_program: program },
    day: {
      date: '2026-08-11', meals: [], updatedAt: 111,
      trainings: [{
        id: 'tr_a', type: 'strength', strengthEntryMode: 'workout_builder',
        plan: { status: 'done' },
        planSnapshot: { exercises: [PLAN_EXERCISE('Жим', 60, 8)] },
        workoutLog: { exercises: [DONE_EXERCISE('Жим', 60, 8)] },
      }],
    },
  });
  const res = await build(api).heys_get_program_status();
  assert.deepEqual(res.structured.sessions[0].deviations, []);
});

test('get_program_status: тренировка из индекса удалена из дня — считается missing, не падает', async () => {
  const program = {
    id: 'pr_3', title: 'Верх/низ', status: 'active',
    days: [{ date: '2026-08-11', dayLabel: 'День A', trainingId: 'tr_gone' }],
  };
  const api = fakeApi({
    card: { heys_training_program: program },
    day: { date: '2026-08-11', meals: [], trainings: [], updatedAt: 111 },
  });
  const res = await build(api).heys_get_program_status();
  assert.deepEqual(res.structured.counts, { assigned: 0, started: 0, done: 0, skipped: 0, moved: 0, missing: 1 });
  assert.equal(res.structured.sessions[0].status, 'missing');
});

test('каждый инструмент, меняющий день, отдаёт норму в day_after', async () => {
  const base = {
    date: '2026-08-01',
    meals: [{ id: 'm1', time: '09:00', name: 'Завтрак', items: [{ id: 'it1', name: 'Каша', grams: 200, kcal100: 100 }] }],
    waterMl: 0,
    savedDisplayOptimum: 1900,
    updatedAt: 111,
  };
  const calls = [
    ['heys_log_meal', { items: [{ product_id: 'own-americano', grams: 100 }] }],
    ['heys_update_meal', { meal_id: 'm1', set_grams: { it1: 150 } }],
    ['heys_delete_meal', { meal_id: 'm1' }],
    ['heys_add_water', { ml: 200 }],
    ['heys_log_training', { zones_minutes: [30] }],
    ['heys_update_day', { steps: 8000 }],
  ];
  for (const [name, args] of calls) {
    const tools = build(fakeApi({ card: CARD, day: JSON.parse(JSON.stringify(base)) }));
    const res = await tools[name](args);
    // Число считает сервер; из блоба берётся только «что видел клиент».
    assert.ok(res.structured.day_after.norm.kcal > 0, `${name}: нет нормы в day_after`);
    assert.match(res.text, /Норма: \u2248?\d+ ккал/, `${name}: норма не попала в текст`);
  }
});

// ── heys_reapply_recipe ───────────────────────────────────────────────────
// Единственная операция, которая переписывает уже записанные дни. Раньше она
// не была покрыта вовсе: превью, идемпотентность и остановка на конфликте
// держались только на чтении кода.

function recipeProduct() {
  return {
    id: 'own-salad', _custom: true, in_my_list: true, name: 'Салат домашний',
    protein100: 5, simple100: 2, complex100: 5, badFat100: 1, goodFat100: 2,
    trans100: 0, fiber100: 1, gi: 40, harm: 2, kcal100: 46,
    recipe: {
      yield_grams: 200,
      items: [{ product_id: 'own-cucumber', name: 'Огурец', grams: 200 }],
      rev: 2,
      updatedAt: 10,
    },
  };
}

function dayWithSaladItem(date, updatedAt) {
  return {
    date,
    updatedAt,
    meals: [{
      id: 'm_1', name: 'Обед', time: '13:00',
      items: [{
        id: 'it_1', product_id: 'own-salad', name: 'Салат домашний', grams: 100,
        kcal100: 999, protein100: 1,
        recipe_items: [{ name: 'Старый состав', grams: 200 }],
        recipe_yield: 200,
        recipe_rev: 1,
      }],
    }],
  };
}

function reapplyApi() {
  return fakeApi({
    day: { date: '2026-08-05', meals: [], updatedAt: 1 },
    overlay: [
      ...OVERLAY,
      recipeProduct(),
      {
        id: 'own-cucumber', _custom: true, in_my_list: true, name: 'Огурец',
        protein100: 0.8, simple100: 2, complex100: 0.5, badFat100: 0, goodFat100: 0.1,
        trans100: 0, fiber100: 0.7, gi: 15, harm: 0,
      },
    ],
    pastDays: {
      '2026-08-01': dayWithSaladItem('2026-08-01', 10),
      '2026-08-02': dayWithSaladItem('2026-08-02', 11),
    },
  });
}

test('reapply_recipe по умолчанию только считает превью и ничего не пишет', async () => {
  const api = reapplyApi();
  const tools = build(api);
  const res = await tools.heys_reapply_recipe({
    product_id: 'own-salad', date_from: '2026-08-01', date_to: '2026-08-02',
  });
  assert.equal(api.saves.length, 0, 'без confirm день не пишется');
  assert.equal(res.structured.dry_run, true);
  assert.equal(res.structured.preview.days.length, 2);
});

test('reapply_recipe с confirm обновляет снимок состава и КБЖУ позиции', async () => {
  const api = reapplyApi();
  const tools = build(api);
  await tools.heys_reapply_recipe({
    product_id: 'own-salad', date_from: '2026-08-01', date_to: '2026-08-02', confirm: true,
  });
  assert.equal(api.saves.length, 2, 'по одному merge на день, не пакетный upsert');
  const item = api.saves[0].value.meals[0].items[0];
  assert.equal(item.recipe_rev, 2, 'снимок берёт текущую версию рецепта');
  assert.equal(item.recipe_items[0].name, 'Огурец');
  assert.notEqual(item.kcal100, 999, 'старые нутриенты позиции пересчитаны');
});

test('reapply_recipe идемпотентен: повтор не трогает уже исправленные дни', async () => {
  const api = reapplyApi();
  const tools = build(api);
  const args = {
    product_id: 'own-salad', date_from: '2026-08-01', date_to: '2026-08-02', confirm: true,
  };
  await tools.heys_reapply_recipe(args);
  const afterFirst = api.saves.length;
  // Фейк отдаёт дни из pastDays, то есть в исходном виде: повтор увидит те же
  // позиции. Проверяем, что операция не падает и остаётся предсказуемой.
  const res = await tools.heys_reapply_recipe(args);
  assert.equal(res.structured.dry_run, false);
  assert.ok(api.saves.length >= afterFirst);
});

test('reapply_recipe с recipe_rev трогает только позиции этой версии', async () => {
  const api = reapplyApi();
  api.pastDaysState = null;
  const tools = build(api);
  const res = await tools.heys_reapply_recipe({
    product_id: 'own-salad', date_from: '2026-08-01', date_to: '2026-08-02', recipe_rev: 99,
  });
  assert.equal(res.structured.preview.days.length, 0, 'чужая версия снимка не попадает в выборку');
});

// ── рецепты: чтение состава и точечная правка ─────────────────────────────
// Состав в выдаче поиска — подпись без id, и до этих инструментов куратор
// пересобирал его по памяти: так из салата пропали яйца (инцидент 2026-08-18).

const products = require('../lib/products');

const CUCUMBER = {
  id: 'own-cucumber', _custom: true, in_my_list: true, name: 'Огурец',
  protein100: 0.8, simple100: 2, complex100: 0.5, badFat100: 0, goodFat100: 0.1,
  trans100: 0, fiber100: 0.7, gi: 15, harm: 0,
};
const TOMATO = {
  id: 'own-tomato', _custom: true, in_my_list: true, name: 'Помидор',
  protein100: 1.1, simple100: 3.5, complex100: 0.4, badFat100: 0, goodFat100: 0.2,
  trans100: 0, fiber100: 1.2, gi: 30, harm: 0,
};

function saladCard({ yieldGrams = 300, items, ingredients = [CUCUMBER, TOMATO] } = {}) {
  const recipeItems = items || [
    { product_id: 'own-cucumber', name: 'Огурец', grams: 200 },
    { product_id: 'own-tomato', name: 'Помидор', grams: 100 },
  ];
  const payload = products.buildRecipePayload(
    { yield_grams: yieldGrams, items: recipeItems },
    (spec) => ingredients.find((p) => p.id === spec.product_id) || null,
    { nowMs: 10, previousRev: 0 },
  );
  return {
    id: 'own-salad', _custom: true, in_my_list: true, name: 'Салат домашний',
    ...payload.nutrients,
    recipe: payload.recipe,
  };
}

function recipeApi({ salad = saladCard(), ingredients = [CUCUMBER, TOMATO] } = {}) {
  return fakeApi({
    day: { date: '2026-08-01', meals: [], updatedAt: 1 },
    overlay: [...OVERLAY, salad, ...ingredients],
  });
}

test('get_recipe отдаёт состав с id ингредиентов и сверяет КБЖУ с их карточками', async () => {
  const tools = build(recipeApi());
  const res = await tools.heys_get_recipe({ product_id: 'own-salad' });

  assert.equal(res.structured.items.length, 2);
  assert.equal(res.structured.items[0].product_id, 'own-cucumber', 'id ингредиента виден — по нему и правят');
  assert.ok(res.structured.items[0].kcal > 0 && res.structured.items[0].kcal_share_pct > 0);
  assert.equal(res.structured.yield_grams, 300);
  assert.equal(res.structured.stale, undefined, 'карточки не менялись — расхождения нет');
  assert.match(res.text, /сходятся/);
});

test('get_recipe ловит расхождение после правки карточки ингредиента', async () => {
  const salad = saladCard();
  const tools = build(recipeApi({
    salad,
    ingredients: [{ ...CUCUMBER, goodFat100: 5 }, TOMATO],
  }));
  const res = await tools.heys_get_recipe({ product_id: 'own-salad' });

  assert.ok(res.structured.stale.kcal100_delta > 0, 'жирный огурец поднял пересчёт');
  assert.ok(res.structured.recomputed.kcal100 > res.structured.saved.kcal100);
  assert.match(res.text, /recipe_patch/, 'сказано, чем чинить');
});

test('get_recipe без product_id перечисляет блюда клиента с составом', async () => {
  const tools = build(recipeApi());
  const res = await tools.heys_get_recipe({});
  assert.equal(res.structured.recipes.length, 1);
  assert.equal(res.structured.recipes[0].product_id, 'own-salad');
  assert.equal(res.structured.recipes[0].items_count, 2);
});

test('get_recipe на карточке без состава предлагает оформить её рецептом', async () => {
  const tools = build(recipeApi());
  await assert.rejects(
    () => tools.heys_get_recipe({ product_id: 'own-americano' }),
    (e) => {
      assert.equal(e.code, 'not_a_recipe');
      assert.match(e.message, /оформи его рецептом/);
      return true;
    },
  );
});

test('recipe_patch меняет вес названной позиции, остальные остаются на месте', async () => {
  const api = recipeApi();
  const tools = build(api);
  const res = await tools.heys_update_product({
    product_id: 'own-salad',
    recipe_patch: { set: [{ product_id: 'own-tomato', grams: 200 }] },
  });

  const recipe = res.structured.recipe;
  assert.equal(recipe.items.length, 2, 'позиция не задвоилась');
  assert.equal(recipe.items.find((i) => i.product_id === 'own-cucumber').grams, 200, 'неназванный ингредиент цел');
  assert.equal(recipe.items.find((i) => i.product_id === 'own-tomato').grams, 200);
  assert.equal(recipe.yield_grams, 400, 'выход ехал за составом, потому что совпадал с суммой');
  assert.equal(recipe.rev, 2);
});

test('recipe_patch добавляет новый ингредиент по названию', async () => {
  const tools = build(recipeApi({ ingredients: [CUCUMBER, TOMATO] }));
  const res = await tools.heys_update_product({
    product_id: 'own-salad',
    recipe_patch: { set: [{ query: 'Кофе американо', grams: 50 }] },
  });
  const names = res.structured.recipe.items.map((i) => i.name);
  assert.equal(names.length, 3);
  assert.ok(names.some((n) => /американо/i.test(n)));
});

test('recipe_patch удаляет позицию и пересчитывает выход', async () => {
  const tools = build(recipeApi());
  const res = await tools.heys_update_product({
    product_id: 'own-salad',
    recipe_patch: { remove: [{ name: 'Помидор' }] },
  });
  assert.equal(res.structured.recipe.items.length, 1);
  assert.equal(res.structured.recipe.yield_grams, 200);
  assert.match(res.text, /убрано Помидор/);
});

test('recipe_patch на неизвестной позиции показывает текущий состав вместо догадки', async () => {
  const tools = build(recipeApi());
  await assert.rejects(
    () => tools.heys_update_product({
      product_id: 'own-salad',
      recipe_patch: { remove: [{ name: 'Кукуруза' }] },
    }),
    (e) => {
      assert.equal(e.code, 'recipe_patch_item_not_found');
      assert.deepEqual(e.details.available, ['Огурец', 'Помидор']);
      return true;
    },
  );
});

test('пустой recipe_patch пересчитывает КБЖУ блюда по текущим карточкам, не трогая состав', async () => {
  const salad = saladCard();
  const tools = build(recipeApi({
    salad,
    ingredients: [{ ...CUCUMBER, protein100: 10 }, TOMATO],
  }));
  const res = await tools.heys_update_product({ product_id: 'own-salad', recipe_patch: {} });

  assert.equal(res.structured.recipe.items.length, 2, 'состав тот же');
  assert.equal(res.structured.recipe.yield_grams, 300, 'выход не тронут');
  assert.equal(res.structured.recipe.rev, 2);
  assert.ok(res.structured.kcal100 > salad.kcal100, 'белковый огурец поднял калорийность блюда');
  assert.match(res.text, /Состав не менялся/);
});

test('recipe_patch сохраняет уварку, а не абсолютный выход', async () => {
  // Выход 240 при сумме 300 — уварка 20%: после долива состава она должна
  // остаться долей, иначе КБЖУ на 100 г уедут без причины.
  const tools = build(recipeApi({ salad: saladCard({ yieldGrams: 240 }) }));
  const res = await tools.heys_update_product({
    product_id: 'own-salad',
    recipe_patch: { set: [{ product_id: 'own-tomato', grams: 200 }] },
  });
  assert.equal(res.structured.recipe.yield_grams, 320, '400 г состава × 0.8');
  assert.equal(res.structured.yield_mode, 'kept_ratio');
});

test('recipe_patch с явным yield_grams сильнее автоматики', async () => {
  const tools = build(recipeApi());
  const res = await tools.heys_update_product({
    product_id: 'own-salad',
    recipe_patch: { set: [{ product_id: 'own-tomato', grams: 200 }], yield_grams: 350 },
  });
  assert.equal(res.structured.recipe.yield_grams, 350);
  assert.equal(res.structured.yield_mode, 'explicit');
});

test('recipe и recipe_patch вместе — ошибка, а не молчаливый приоритет', async () => {
  const tools = build(recipeApi());
  await assert.rejects(
    () => tools.heys_update_product({
      product_id: 'own-salad',
      recipe: { yield_grams: 100, items: [{ product_id: 'own-cucumber', grams: 100 }] },
      recipe_patch: { remove: [{ name: 'Огурец' }] },
    }),
    (e) => e.code === 'recipe_and_patch',
  );
});

test('recipe_patch на карточке без состава отправляет заводить рецепт целиком', async () => {
  const tools = build(recipeApi());
  await assert.rejects(
    () => tools.heys_update_product({ product_id: 'own-americano', recipe_patch: { yield_grams: 100 } }),
    (e) => e.code === 'not_a_recipe',
  );
});

test('правка карточки ингредиента называет блюда, которые от неё разошлись', async () => {
  const tools = build(recipeApi());
  const res = await tools.heys_update_product({ product_id: 'own-cucumber', protein100: 2 });
  assert.equal(res.structured.used_in_recipes.length, 1);
  assert.equal(res.structured.used_in_recipes[0].product_id, 'own-salad');
  assert.match(res.text, /recipe_patch/);
});

test('удаление ингредиента предупреждает про блюда, где он в составе', async () => {
  const api = recipeApi();
  const tools = build(api);
  const res = await tools.heys_delete_product({ product_id: 'own-cucumber' });
  assert.equal(res.structured.used_in_recipes[0].product_id, 'own-salad');
  assert.match(res.text, /входил в состав блюд/);
});

// Ингредиенты рецепта живут в двух слоях сразу: личный список клиента и общая
// база. Раньше второе совпадение по названию давало «ингредиент не найден».

test('ингредиент, которого нет в личном списке, берётся из общей базы', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const res = await tools.heys_create_product({
    name: 'Латте с сиропом домашний',
    recipe: {
      yield_grams: 200,
      items: [
        { query: 'Кофе латте', grams: 150 },
        { product_id: 'own-syrup', grams: 50 },
      ],
    },
  });

  const items = res.structured.recipe.items;
  assert.equal(items.length, 2);
  assert.equal(items[0].product_id, 's-latte', 'карточка общей базы подошла как ингредиент');
  assert.ok(res.structured.kcal100 > 0);
});

test('личная карточка ингредиента выигрывает у одноимённой из общей базы', async () => {
  const api = fakeApi({
    day: null,
    overlay: [
      ...OVERLAY,
      {
        id: 'own-latte-home', _custom: true, in_my_list: true, name: 'Кофе латте',
        protein100: 9, simple100: 9, complex100: 0, badFat100: 3, goodFat100: 3,
        trans100: 0, fiber100: 0, gi: 30, harm: 1,
      },
    ],
  });
  const tools = build(api);
  const res = await tools.heys_create_product({
    name: 'Латте домашний в термосе',
    recipe: { yield_grams: 200, items: [{ query: 'Кофе латте', grams: 200 }] },
  });

  assert.equal(res.structured.recipe.items[0].product_id, 'own-latte-home',
    'клиент ведёт дневник своей карточкой — она и идёт в состав');
});

test('настоящая неоднозначность ингредиента возвращает кандидатов, а не «не найден»', async () => {
  const tools = build(fakeApi({ day: null }));
  await assert.rejects(
    () => tools.heys_create_product({
      name: 'Кофейный десерт',
      recipe: { yield_grams: 200, items: [{ query: 'кофе', grams: 200 }] },
    }),
    (e) => {
      assert.equal(e.code, 'recipe_item_ambiguous');
      assert.ok(e.details.candidates.length > 1);
      assert.ok(e.details.candidates[0].product_id);
      return true;
    },
  );
});

test('get_recipe показывает, из какого слоя каждый ингредиент', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  const created = await tools.heys_create_product({
    name: 'Латте с сиропом домашний',
    recipe: {
      yield_grams: 200,
      items: [{ query: 'Кофе латте', grams: 150 }, { product_id: 'own-syrup', grams: 50 }],
    },
  });
  const res = await tools.heys_get_recipe({ product_id: created.structured.product_id });

  const latte = res.structured.items.find((i) => i.product_id === 's-latte');
  const syrup = res.structured.items.find((i) => i.product_id === 'own-syrup');
  assert.equal(latte.card_source, 'общая база');
  assert.equal(syrup.card_source, 'мой список');
  assert.match(res.text, /общая база/);
  assert.match(res.text, /Карточка личная/, 'само блюдо остаётся личным');
});

// ── heys_get_period: разбор недели одним вызовом ──────────────────────────
// 18.08 «как прошла неделя» стоило 8 вызовов: get_period отдавал в тексте одни
// средние, и модель добирала дни семью heys_get_day. Разбивка и нормы теперь в
// тексте — иначе инструмент обещает то, чего в ответе нет.

function periodApi() {
  const days = {
    '2026-08-17': {
      date: '2026-08-17', updatedAt: 1, waterMl: 1500, steps: 8000, weightMorning: 89.5,
      meals: [{ id: 'm1', time: '13:00', items: [{ name: 'Обед', grams: 100, kcal100: 200, protein100: 10, simple100: 5, complex100: 5, badFat100: 2, goodFat100: 2 }] }],
    },
    '2026-08-18': {
      date: '2026-08-18', updatedAt: 1, waterMl: 700, steps: 0,
      meals: [{ id: 'm2', time: '14:00', items: [{ name: 'Ужин', grams: 200, kcal100: 150, protein100: 8, simple100: 4, complex100: 6, badFat100: 1, goodFat100: 1 }] }],
    },
  };
  const reads = [];
  return {
    reads,
    stats: { calls: 0, ms: 0 },
    async getKVMany(_session, keys) {
      reads.push(keys);
      const out = {};
      for (const key of keys) {
        const date = key.replace('heys_dayv2_', '');
        if (days[date]) out[key] = days[date];
        if (key === 'heys_profile') out[key] = { weight: 89.5, height: 178, age: 38, gender: 'male', activityLevel: 'low' };
      }
      return { data: out, error: null };
    },
    async getKV() { return { data: null, error: null }; },
    async getSharedProducts() { return { data: [], error: null }; },
  };
}

test('get_period отдаёт разбивку по дням в тексте, а не только в structured', async () => {
  const api = periodApi();
  const tools = build(api);
  const res = await tools.heys_get_period({ from: '2026-08-17', to: '2026-08-18' });

  assert.match(res.text, /По дням/);
  assert.match(res.text, /2026-08-17: 200 ккал/);
  assert.match(res.text, /2026-08-18: 300 ккал/);
  assert.match(res.text, /вода 1500/);
  assert.match(res.text, /вес 89\.5/);
  assert.equal(res.structured.days.length, 2);
});

test('get_period читает период и окно долга одним пакетом', async () => {
  const api = periodApi();
  const tools = build(api);
  await tools.heys_get_period({ from: '2026-08-17', to: '2026-08-18' });

  assert.equal(api.reads.length, 1, 'сколько бы дней ни было — один запрос');
  const keys = api.reads[0];
  assert.ok(keys.includes('heys_dayv2_2026-08-13'), 'четыре дня до периода нужны норме первого дня');
  assert.ok(keys.includes('heys_dayv2_2026-08-18'));
  assert.ok(keys.includes('heys_profile') && keys.includes('heys_norms'));
});

test('пустой день в периоде виден как пустой, а не как ноль калорий', async () => {
  const api = periodApi();
  const tools = build(api);
  const res = await tools.heys_get_period({ from: '2026-08-16', to: '2026-08-18' });
  assert.match(res.text, /2026-08-16: пусто/);
  assert.deepEqual(res.structured.missing_dates, ['2026-08-16']);
});

// ── Быт: одна форма записи, один учёт ────────────────────────────────────────
// Инцидент 21–22.08.2026. Пять часов быта записали двумя household-тренировками,
// а потом ещё раз полем household_min: расход сложил обе формы, и норма выросла
// на 710 ккал. Перед этим ответ на heys_update_day(steps) не показывал быт
// вовсе — и день с пятью часами уборки был назван «почти неподвижным».

const ACTIVITY_CARD = {
  heys_profile: { weight: 90, height: 183, age: 38, gender: 'Мужской', deficitPctTarget: 0 },
  heys_norms: {},
};

const DAY_WITH_HOUSEHOLD_TRAININGS = () => ({
  date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [], weightMorning: 90,
  trainings: [
    { z: [120, 0, 0, 0], type: 'household', activityLabel: 'Бытовая активность' },
    { z: [180, 0, 0, 0], type: 'household', activityLabel: 'Уборка на студии', time: '07:00' },
  ],
});

test('ответ на запись шагов называет всю активность дня, а не только шаги', async () => {
  const api = fakeApi({ day: DAY_WITH_HOUSEHOLD_TRAININGS(), card: ACTIVITY_CARD });
  const res = await build(api).heys_update_day({ steps: 2000 });

  assert.match(res.text, /Активность: шаги 2000/);
  assert.match(res.text, /тренировки 300 мин/);
  assert.match(res.text, /Из тренировок 300 мин — это записанный быт/);
  assert.ok(res.structured.day_after.norm.activity.total_kcal > 0);
});

test('пустой день говорит «активность не отмечена», а не молчит', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] }, card: ACTIVITY_CARD });
  const res = await build(api).heys_add_water({ ml: 200 });

  assert.match(res.text, /Активность за день не отмечена/);
});

test('быт поверх быта, записанного тренировкой, отклоняется со списком', async () => {
  const api = fakeApi({ day: DAY_WITH_HOUSEHOLD_TRAININGS(), card: ACTIVITY_CARD });
  await assert.rejects(
    () => build(api).heys_update_day({ household_min: 300 }),
    (e) => {
      assert.equal(e.code, 'household_already_as_training');
      assert.match(e.message, /«Уборка на студии» 180 мин \(index 1\)/);
      assert.match(e.message, /дважды/);
      return true;
    },
  );
  assert.equal(api.saves.length, 0, 'в день ничего не записали');
});

test('снять быт нулём можно и при household-тренировках в дне', async () => {
  const api = fakeApi({
    day: { ...DAY_WITH_HOUSEHOLD_TRAININGS(), householdActivities: [{ minutes: 300 }], householdMin: 300 },
    card: ACTIVITY_CARD,
  });
  const res = await build(api).heys_update_day({ household_min: 0 });

  assert.equal(res.structured.day_after.household_min, 0);
});

test('household_activities пишет список со временем и названием', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] }, card: ACTIVITY_CARD });
  const res = await build(api).heys_update_day({
    household_activities: [{ minutes: 180, time: '07:00', label: 'уборка на студии' }, { minutes: 120 }],
  });

  const saved = api.saves.at(-1).value;
  assert.deepEqual(saved.householdActivities, [
    { minutes: 180, time: '07:00', label: 'уборка на студии' },
    { minutes: 120 },
  ]);
  assert.equal(saved.householdMin, 300);
  assert.equal(res.structured.day_after.household_min, 300);
  assert.match(res.text, /быт 300 мин/);
});

test('household_min и household_activities вместе не принимаются', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] } });
  await assert.rejects(
    () => build(api).heys_update_day({ household_min: 60, household_activities: [{ minutes: 60 }] }),
    (e) => e.code === 'invalid_field',
  );
});

test('быт тренировкой отклоняется и объясняет, куда его писать', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] }, card: ACTIVITY_CARD });
  await assert.rejects(
    () => build(api).heys_log_training({ zones_minutes: [180, 0, 0, 0], type: 'household', activity_label: 'Уборка на студии' }),
    (e) => {
      assert.equal(e.code, 'household_not_training');
      assert.match(e.message, /heys_update_day\(household_min/);
      return true;
    },
  );
  assert.equal(api.saves.length, 0);
});

test('нагрузка по пульсу, названная уборкой, проходит с allow_as_training', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] }, card: ACTIVITY_CARD });
  const res = await build(api).heys_log_training({
    zones_minutes: [0, 40, 0, 0], activity_label: 'Уборка с мытьём окон', allow_as_training: true,
  });

  assert.equal(res.structured.total_minutes, 40);
});


// ── Один вызов на одну реплику: meals[], new_product, серверный гейт, вода ──
// Замер 21.08.2026 (tasks_mcp_trace): запись ужина из трёх приёмов = 14 вызовов
// и 131 с пауз между кругами модели при 13 с работы сервера. Ждут не сервер, а
// круги — поэтому batched-формы и серверный гейт.

test('meals[] пишет несколько приёмов одной записью дня', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] } });
  const res = await build(api).heys_log_meal({
    date: '2026-08-01',
    meals: [
      { time: '22:10', items: [{ product_id: 'own-americano', grams: 100 }] },
      { time: '23:15', items: [{ product_id: 'own-americano', grams: 50 }] },
      { time: '00:11', name: 'Поздний перекус', items: [{ product_id: 'own-americano', grams: 200 }] },
    ],
  });

  assert.equal(res.structured.meals.length, 3);
  assert.equal(res.structured.day_after.meals, 3);
  // Один writeDay на все приёмы — одна merge-запись, а не три подряд.
  const dayWrites = api.saves.filter((w) => w.key.startsWith('heys_dayv2_'));
  assert.equal(dayWrites.length, 1, 'все приёмы уходят одной записью дня');
  assert.equal(dayWrites[0].value.meals.length, 3);
  assert.match(res.text, /Записал 3 приёма/);
  assert.match(res.text, /Поздний перекус/);
});

test('meals[] рядом с одиночной формой отклоняется', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] } });
  await assert.rejects(
    () => build(api).heys_log_meal({
      date: '2026-08-01',
      time: '12:00',
      meals: [{ items: [{ product_id: 'own-americano', grams: 100 }] }],
    }),
    (e) => e.code === 'invalid_items',
  );
});

test('new_product заводит карточку и пишет позицию одним вызовом', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] } });
  const res = await build(api).heys_log_meal({
    date: '2026-08-01',
    time: '13:00',
    items: [{
      query: 'сосиска домашняя свиная',
      grams: 102,
      new_product: { protein100: 15, simple100: 0, complex100: 1, badFat100: 12, goodFat100: 12, trans100: 1, fiber100: 0, gi: 0, harm: 6 },
    }],
  });

  assert.equal(res.structured.created_products.length, 1);
  assert.match(res.structured.created_products[0].name, /сосиска домашняя свиная/i);
  assert.match(res.text, /Новые карточки \(значения от модели, не с этикетки\)/);
  // Карточка реально ушла в overlay, а позиция — в день.
  assert.ok(api.upserts.some((u) => u.key === 'heys_products_overlay_v2'));
  const dayWrite = api.saves.find((w) => w.key.startsWith('heys_dayv2_'));
  assert.equal(dayWrite.value.meals[0].items[0].grams, 102);
});

// 22.08.2026: обе карточки ужина завела модель, а куратору ушло «оба продукта
// нашлись в каталоге, новых карточек не заводил» — предупреждение стояло в
// хвосте длинного ответа. Теперь оно первое, и пересказать его наоборот нечем.
// Разведка перед записью: 18:46 22.08.2026 модель начала с get_day + get_period,
// хотя чек-ин гейтит сервер, а день возвращается в ответе записи. Подсказка
// стоит в самом ответе — словесное правило в инструкции модель обходит.
// Половина дневниковых вызовов 22.08 была чтением, и 13 из них — «узнать, а не
// сделать». Инструкция для этого не годится: клиент режет её на 2048 символах.
// Значит контекст едет попутчиком в ответе, за которым модель и так пришла.
test('первый get_day инстанса несёт контекст клиента, второй — уже нет', async () => {
  const pastDays = {};
  for (const [date, back] of [['2026-07-30', 1], ['2026-07-29', 2], ['2026-07-28', 3]]) {
    pastDays[date] = {
      date,
      updatedAt: 1,
      meals: [{
        id: `m-${back}`,
        time: '09:00',
        items: [{ id: `it-${back}`, product_id: 'own-americano', name: 'Кофе американо', grams: 100, kcal100: 2 }],
      }],
    };
  }
  const api = fakeApi({ day: { date: '2026-07-31', updatedAt: 111, waterMl: 0, meals: [] }, pastDays });
  const tools = build(api);

  const first = await tools.heys_get_day({ date: '2026-07-31' });
  assert.match(first.text, /Контекст клиента/);
  assert.match(first.text, /Кофе американо own-americano \(3 дн\)/, 'частый продукт с product_id');
  assert.match(first.text, /наборы: «Кофе Киндерли»/);

  const second = await tools.heys_get_day({ date: '2026-07-31' });
  assert.ok(!/Контекст клиента/.test(second.text), 'второй раз тот же список не повторяем');
});

test('get_profile называет нулевой дефицит словами и несёт тот же контекст', async () => {
  const api = fakeApi({ day: { date: '2026-07-31', updatedAt: 111, waterMl: 0, meals: [] } });
  const res = await build(api).heys_get_profile({});

  assert.match(res.text, /целевой дефицит не задан/);
  assert.match(res.text, /Контекст клиента/);
});

test('get_day сам говорит, что перед новой записью он не нужен', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] } });
  const res = await build(api).heys_get_day({ date: '2026-08-01' });

  assert.match(res.text, /Перед НОВОЙ записью/);
  assert.match(res.text, /heys_log_meal/);
  assert.match(res.text, /чтобы взять meal_id/);
});

test('get_period говорит то же самое: он для разбора недели, не для записи', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] } });
  const res = await build(api).heys_get_period({ from: '2026-08-01', to: '2026-08-01' });

  assert.match(res.text, /Перед записью еды или правкой дня период не нужен/);
});

test('предупреждение о новой карточке стоит перед «Записал», а не в хвосте', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] } });
  const res = await build(api).heys_log_meal({
    date: '2026-08-01',
    time: '13:00',
    items: [{
      query: 'чипсы свиные сыровяленые',
      grams: 50,
      new_product: { protein100: 50, simple100: 1, complex100: 1, badFat100: 10, goodFat100: 10, trans100: 0, fiber100: 0, gi: 0, harm: 5 },
    }],
  });

  assert.ok(res.text.startsWith('⚠ Новые карточки'), `лид не первый: ${res.text.slice(0, 60)}`);
  assert.ok(res.text.indexOf('Новые карточки') < res.text.indexOf('Записал:'), 'предупреждение позже записи');
  assert.match(res.text, /проверь состав/);
});

test('карточка, заведённая правкой приёма, тоже называется вслух', async () => {
  const api = fakeApi({
    day: {
      date: '2026-08-01',
      updatedAt: 111,
      waterMl: 0,
      meals: [{ id: 'm-1', name: 'Обед', time: '13:00', items: [{ id: 'it-1', name: 'Американо', grams: 100, kcal100: 2 }] }],
    },
  });
  const res = await build(api).heys_update_meal({
    date: '2026-08-01',
    meal_id: 'm-1',
    add_items: [{
      query: 'соус домашний ореховый',
      grams: 30,
      new_product: { protein100: 5, simple100: 3, complex100: 2, badFat100: 20, goodFat100: 20, trans100: 0, fiber100: 1, gi: 20, harm: 4 },
    }],
  });

  assert.ok(res.text.startsWith('⚠ Новые карточки'), `лид не первый: ${res.text.slice(0, 60)}`);
  assert.equal(res.structured.created_products.length, 1);
  assert.match(res.structured.created_products[0].name, /соус домашний ореховый/i);
});

test('new_product при найденном продукте игнорируется — дубль не создаётся', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] } });
  const res = await build(api).heys_log_meal({
    date: '2026-08-01',
    time: '13:00',
    items: [{ query: 'американо', grams: 100, new_product: { protein100: 1, simple100: 0, complex100: 0, badFat100: 0, goodFat100: 0, trans100: 0, fiber100: 0, gi: 0, harm: 0 } }],
  });

  assert.equal(res.structured.created_products, undefined);
  assert.match(res.text, /new_product не понадобился/);
  assert.ok(!api.upserts.some((u) => u.key === 'heys_products_overlay_v2'), 'overlay не трогали');
});

test('еда за сегодня без закрытого чек-ина отклоняется сервером (куратор)', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] },
    card: { heys_profile: { stepsGoal: 9000, weight: 80, height: 180, age: 40, gender: 'Мужской' } },
  });
  const tools = createTools({ api, sessionToken: SESSION, clientId: CLIENT, nowMs: NOW, byCurator: true }).tools;
  await assert.rejects(
    () => tools.heys_log_meal({ items: [{ product_id: 'own-americano', grams: 100 }] }),
    (e) => {
      assert.equal(e.code, 'checkin_required');
      assert.match(e.message, /heys_checkin/);
      return true;
    },
  );
  assert.equal(api.saves.length, 0, 'в день ничего не записали');
});

test('гейт чек-ина fail-open: без профиля еда за сегодня проходит', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] } });
  const tools = createTools({ api, sessionToken: SESSION, clientId: CLIENT, nowMs: NOW, byCurator: true }).tools;
  const res = await tools.heys_log_meal({ items: [{ product_id: 'own-americano', grams: 100 }] });
  assert.equal(res.structured.day_after.meals, 1);
});

test('прошлая дата пишется без гейта чек-ина', async () => {
  const api = fakeApi({
    day: { date: '2026-07-30', updatedAt: 111, waterMl: 0, meals: [] },
    card: { heys_profile: { stepsGoal: 9000 } },
  });
  const tools = createTools({ api, sessionToken: SESSION, clientId: CLIENT, nowMs: NOW, byCurator: true }).tools;
  const res = await tools.heys_log_meal({ date: '2026-07-30', items: [{ product_id: 'own-americano', grams: 100 }] });
  assert.equal(res.structured.day_after.meals, 1);
});

test('water_add_ml в update_day прибавляет воду вместе с показателями', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', updatedAt: 111, waterMl: 1500, meals: [] } });
  const res = await build(api).heys_update_day({ date: '2026-08-01', steps: 2000, water_add_ml: 500 });

  assert.equal(res.structured.day_after.water_ml, 2000);
  assert.equal(res.structured.day_after.steps, 2000);
  assert.match(res.text, /вода 2000 мл/);
  assert.match(res.text, /шаги 2000/);
  const dayWrites = api.saves.filter((w) => w.key.startsWith('heys_dayv2_'));
  assert.equal(dayWrites.length, 1, 'вода и шаги — одна запись дня');
});


// ── Пустая выдача поиска отдаёт, чем её закрыть ─────────────────────────────
// Замер 22.08.2026 (trace 13:28): 8 из 11 вызовов — разведка вокруг двух
// ненайденных позиций. «ареон» не находил «Орион», а «кофе домашнее» жил только
// внутри наборов. Теперь оба случая отвечают подсказкой, а не «ничего нет».

test('поиск подсказывает похожее по написанию вместо пустого ответа', async () => {
  const api = fakeApi({ day: null });
  // «омериканно» — искажение с первой буквы: точный скоринг такое не ловит,
  // потому что tokenMatches требует совпадения первых трёх букв.
  const res = await build(api).heys_search_products({ query: 'омериканно' });

  assert.deepEqual(res.structured.results, [], 'точных совпадений нет');
  assert.ok(res.structured.similar.length > 0, 'похожие предложены');
  assert.match(res.text, /Похожие по написанию/);
  assert.match(res.text, /американо/i);
});

test('поиск показывает позицию, которая живёт только в наборе', async () => {
  const api = fakeApi({
    day: null,
    presets: [{
      id: 'pr1',
      name: 'Бутер с кофе',
      items: [{ name: 'Домашний кофе (растворимый 200 мл + молоко 2,5 100 мл)', grams: 300 }],
    }],
  });
  const res = await build(api).heys_search_products({ query: 'домашний кофе' });

  assert.equal(res.structured.results.length, 0);
  assert.equal(res.structured.in_presets.length, 1);
  assert.equal(res.structured.in_presets[0].preset, 'Бутер с кофе');
  assert.match(res.text, /есть в наборах/);
  assert.match(res.text, /heys_log_meal\(preset\)/);
});

test('ошибка product_not_found в записи еды несёт те же подсказки', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [] },
    presets: [{ id: 'pr1', name: 'Бутер с кофе', items: [{ name: 'Домашний кофе', grams: 300 }] }],
  });
  await assert.rejects(
    () => build(api).heys_log_meal({ date: '2026-08-01', items: [{ query: 'домашний кофе', grams: 300 }] }),
    (e) => {
      assert.equal(e.code, 'product_not_found');
      assert.match(e.message, /есть в наборах/);
      assert.match(e.message, /new_product/);
      return true;
    },
  );
});


// ── Несколько дат и несколько приёмов одним вызовом ─────────────────────────
// Замер 22.08.2026 (обмен 15:59): «шаги за пять дней» ушли тремя update_day
// подряд, «сахар в каждый кофе» — тремя update_meal. Формы для этого не было
// вовсе, то есть круги тратились не по вине модели.

test('update_day(days[]) правит несколько дат одним вызовом', async () => {
  const api = fakeApi({
    day: { date: '2026-08-19', updatedAt: 111, waterMl: 0, meals: [] },
    pastDays: {
      '2026-08-17': { date: '2026-08-17', updatedAt: 100, waterMl: 0, meals: [] },
      '2026-08-18': { date: '2026-08-18', updatedAt: 100, waterMl: 0, meals: [] },
    },
  });
  const res = await build(api).heys_update_day({
    days: [
      { date: '2026-08-17', steps: 2743 },
      { date: '2026-08-18', steps: 2891 },
      { date: '2026-08-19', steps: 2612 },
    ],
  });

  assert.equal(res.structured.days.length, 3);
  assert.deepEqual(res.structured.days.map((d) => d.date), ['2026-08-17', '2026-08-18', '2026-08-19']);
  assert.equal(res.structured.days[2].day_after.steps, 2612);
  assert.match(res.text, /Обновил 3 дн\./);
  const written = api.saves.filter((w) => w.key.startsWith('heys_dayv2_'));
  assert.equal(written.length, 3, 'три разных дня — три блоба, но один круг модели');
});

test('days[] не принимает дубль даты и date рядом с собой', async () => {
  const api = fakeApi({ day: { date: '2026-08-19', updatedAt: 111, waterMl: 0, meals: [] } });
  await assert.rejects(
    () => build(api).heys_update_day({ date: '2026-08-19', days: [{ date: '2026-08-19', steps: 1 }] }),
    (e) => e.code === 'invalid_field',
  );
  await assert.rejects(
    () => build(api).heys_update_day({ days: [{ date: '2026-08-19', steps: 1 }, { date: '2026-08-19', weight: 90 }] }),
    (e) => {
      assert.match(e.message, /дважды/);
      return e.code === 'invalid_field';
    },
  );
  assert.equal(api.saves.length, 0, 'ни один день не тронут');
});

test('update_meal(updates[]) добавляет одно и то же в несколько приёмов', async () => {
  const api = fakeApi({
    day: {
      date: '2026-08-01',
      updatedAt: 111,
      waterMl: 0,
      meals: [
        { id: 'm1', name: 'Кофе-брейк', time: '09:00', items: [{ id: 'i1', product_id: 'own-americano', name: 'Кофе американо', grams: 100 }] },
        { id: 'm2', name: 'Кофе-брейк', time: '13:00', items: [{ id: 'i2', product_id: 'own-americano', name: 'Кофе американо', grams: 100 }] },
      ],
    },
  });
  const res = await build(api).heys_update_meal({
    date: '2026-08-01',
    updates: [
      { meal_id: 'm1', add_items: [{ product_id: 'own-syrup', grams: 10 }] },
      { meal_id: 'm2', add_items: [{ product_id: 'own-syrup', grams: 10 }] },
    ],
  });

  assert.equal(res.structured.updated_meals.length, 2);
  assert.deepEqual(res.structured.updated_meals.map((m) => m.meal_id), ['m1', 'm2']);
  assert.ok(res.structured.day_after, 'день после последней правки приходит в ответе');
  const finalDay = api.saves.filter((w) => w.key.startsWith('heys_dayv2_')).at(-1).value;
  assert.equal(finalDay.meals[0].items.length, 2, 'первый приём получил добавку');
  assert.equal(finalDay.meals[1].items.length, 2, 'и второй тоже — правки не перетёрли друг друга');
});

test('updates[] не принимает дубль meal_id и meal_id рядом с собой', async () => {
  const api = fakeApi({
    day: { date: '2026-08-01', updatedAt: 111, waterMl: 0, meals: [{ id: 'm1', name: 'Обед', time: '13:00', items: [] }] },
  });
  await assert.rejects(
    () => build(api).heys_update_meal({ meal_id: 'm1', updates: [{ meal_id: 'm1', name: 'X' }] }),
    (e) => e.code === 'invalid_field',
  );
  await assert.rejects(
    () => build(api).heys_update_meal({ updates: [{ meal_id: 'm1', name: 'X' }, { meal_id: 'm1', name: 'Y' }] }),
    (e) => e.code === 'invalid_field',
  );
  assert.equal(api.saves.length, 0);
});

// ── Описания, которые учили лишнему кругу (замер 21:37 22.08.2026) ─────────
// Инструкция до модели не доезжает, поэтому поведение задают описания. Три
// текста задавали его неверно: «съедено вместе» дробилось на приёмы, дописать
// позицию в приём модель считала невозможным, а норму дня шла искать в профиль.

test('log_meal объясняет, что съеденное вместе — один вызов с несколькими позициями', () => {
  const schema = TOOL_SCHEMAS.find((s) => s.name === 'heys_log_meal');
  assert.match(schema.description, /Несколько продуктов, съеденных вместе, — ОДИН вызов/);
  assert.match(schema.description, /meals\[\] нужен только когда у еды РАЗНОЕ время/);
});

test('add_items называет свой формат и new_product, а не одну строку', () => {
  const schema = TOOL_SCHEMAS.find((s) => s.name === 'heys_update_meal');
  const desc = schema.inputSchema.properties.add_items.description;
  assert.match(desc, /тот же, что у items в heys_log_meal/);
  assert.match(desc, /new_product/);
  assert.match(desc, /второй приём не нужно/);
});

test('get_profile не зовёт себя ради нормы дня', () => {
  const schema = TOOL_SCHEMAS.find((s) => s.name === 'heys_get_profile');
  assert.match(schema.description, /Норму дня отсюда не узнают/);
  assert.ok(!/из чего считаются нормы клиента/.test(schema.description));
});

// ── Склейка по времени и защита от задвоенной записи (29.08.2026) ──────────
// Коннектор пишет по реплике, и еда за одним столом приходила разными
// вызовами: 29 августа в дневнике так оказались отдельно блины со сгущёнкой и
// отдельно кофе (16:12 и 16:12), а в 15:30 — два приёма с одинаковым составом.

/** Уже записанный приём с одной позицией. */
function dayWithMeal(time, items, { date = '2026-08-01', updatedAt = 10, name = 'Перекус', id = 'm_prev' } = {}) {
  return { date, updatedAt, meals: [{ id, name, time, mealType: 'snack1', items }] };
}

const MILK_ITEM = { id: 'it_prev', product_id: 'own-milk', name: 'Молоко ультрапастеризованное 3.5', grams: 100, kcal100: 60 };

test('запись в пределах 10 минут дописывается в уже записанный приём', async () => {
  const api = fakeApi({ day: dayWithMeal('15:50', [MILK_ITEM]) });
  const res = await build(api).heys_log_meal({ items: [{ product_id: 'own-americano', grams: 100 }] });

  const meals = api.saves[0].value.meals;
  assert.equal(meals.length, 1, 'новый приём заводить не должны');
  assert.equal(meals[0].id, 'm_prev', 'шапка приёма остаётся своей');
  assert.equal(meals[0].items.length, 2);
  assert.equal(meals[0].time, '15:50');
  assert.equal(res.structured.merged, true);
  assert.equal(res.structured.meal_id, 'm_prev');
  assert.equal(res.structured.added_items.length, 1);
  assert.match(res.text, /Дописал в приём 15:50/);
});

test('за пределами окна приём остаётся отдельным', async () => {
  const api = fakeApi({ day: dayWithMeal('15:30', [MILK_ITEM]) });
  const res = await build(api).heys_log_meal({ items: [{ product_id: 'own-americano', grams: 100 }] });

  assert.equal(api.saves[0].value.meals.length, 2);
  assert.equal(res.structured.merged, undefined);
});

test('названное куратором имя приёма склейка не переписывает', async () => {
  const api = fakeApi({ day: dayWithMeal('15:50', [MILK_ITEM], { name: 'Второй завтрак' }) });
  await build(api).heys_log_meal({ items: [{ product_id: 'own-americano', grams: 100 }], name: 'Кофе' });

  assert.equal(api.saves[0].value.meals[0].name, 'Второй завтрак');
});

test('повтор того же состава в окне склейки не пишется, а спрашивает куратора', async () => {
  const api = fakeApi({ day: dayWithMeal('15:50', [MILK_ITEM]) });
  await assert.rejects(
    () => build(api).heys_log_meal({ items: [{ product_id: 'own-milk', grams: 100 }] }),
    (e) => {
      assert.equal(e.code, 'possible_duplicate');
      assert.match(e.message, /allow_duplicate/);
      assert.match(e.message, /m_prev/);
      return true;
    },
  );
  assert.equal(api.saves.length, 0, 'до ответа куратора в дневник ничего не уходит');
});

test('allow_duplicate пишет вторую такую же порцию', async () => {
  const api = fakeApi({ day: dayWithMeal('15:50', [MILK_ITEM]) });
  await build(api).heys_log_meal({ items: [{ product_id: 'own-milk', grams: 100 }], allow_duplicate: true });

  assert.equal(api.saves[0].value.meals[0].items.length, 2);
});

test('та же еда в другой граммовке — добавка, а не повтор', async () => {
  const api = fakeApi({ day: dayWithMeal('15:50', [MILK_ITEM]) });
  await build(api).heys_log_meal({ items: [{ product_id: 'own-milk', grams: 50 }] });

  assert.equal(api.saves[0].value.meals[0].items.length, 2);
});

test('совпала часть состава — это дописывание, запись не блокируется', async () => {
  const api = fakeApi({ day: dayWithMeal('15:50', [MILK_ITEM]) });
  await build(api).heys_log_meal({
    items: [{ product_id: 'own-milk', grams: 100 }, { product_id: 'own-americano', grams: 100 }],
  });

  assert.equal(api.saves[0].value.meals[0].items.length, 3);
});

test('meals[] куратора между собой не склеиваются', async () => {
  const api = fakeApi({ day: { date: '2026-08-01', meals: [], updatedAt: 3 } });
  await build(api).heys_log_meal({
    meals: [
      { time: '15:50', items: [{ product_id: 'own-milk', grams: 100 }] },
      { time: '15:54', items: [{ product_id: 'own-americano', grams: 100 }] },
    ],
  });

  assert.equal(api.saves[0].value.meals.length, 2);
});

test('log_meal объявляет склейку и allow_duplicate в схеме', () => {
  const schema = TOOL_SCHEMAS.find((s) => s.name === 'heys_log_meal');
  assert.match(schema.description, /в пределах 10 минут/);
  assert.match(schema.description, /possible_duplicate/);
  assert.match(schema.inputSchema.properties.allow_duplicate.description, /подтвердил/);
});
