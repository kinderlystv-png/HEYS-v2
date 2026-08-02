'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTools, defaultMealName, TOOL_SCHEMAS, WRITE_TOOLS } = require('../lib/tools');
const mcp = require('../lib/mcp');

const CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
const SESSION = 'session-token';
const NOW = Date.UTC(2026, 7, 1, 12, 54); // 15:54 по Москве

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
function fakeApi({ day = null, presets = PRESETS, overlay = OVERLAY } = {}) {
  const saves = [];
  const upserts = [];
  let presetState = presets;
  let overlayState = overlay;
  return {
    saves,
    upserts,
    tombstones: null,
    async upsertKV(_session, key, value) {
      upserts.push({ key, value });
      if (key === 'heys_meal_presets_v1') presetState = value;
      if (key === 'heys_products_overlay_v2') overlayState = value;
      return { ok: true };
    },
    get presetState() { return presetState; },
    async getKV(_session, key) {
      if (key === 'heys_products_overlay_v2') return { data: overlayState, error: null };
      if (key === 'heys_meal_presets_v1') return { data: presetState, error: null };
      if (key === 'heys_deleted_ids') return { data: this.tombstones, error: null };
      if (key.startsWith('heys_dayv2_')) return { data: day, error: null };
      return { data: null, error: null };
    },
    async getSharedProducts() {
      return { data: SHARED_ROWS, error: null };
    },
    async mergeSaveKV(_session, key, value, lastSeenUpdatedAt) {
      saves.push({ key, value, lastSeenUpdatedAt });
      return { ok: true, outcome: 'incoming_wins' };
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
  assert.equal(save.value.meals[0].name, 'Перекус');
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
});

test('search_products показывает источник продукта', async () => {
  const tools = build(fakeApi({ day: null }));
  const res = await tools.heys_search_products({ query: 'сироп' });
  assert.equal(res.structured.results[0].source, 'мой список');
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

test('create_product по явному подтверждению всё же создаёт одноимённый продукт', async () => {
  const api = fakeApi({ day: null });
  const tools = build(api);
  await tools.heys_create_product({ ...LABEL, name: 'Кофе американо', allow_duplicate: true });
  assert.equal(api.upserts.length, 1);
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

test('WRITE_TOOLS совпадает с обработчиками, которые реально пишут', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'tools.js'), 'utf8');
  const found = new Set();
  let current = null;
  for (const line of source.split('\n')) {
    const header = /^ {4}async (heys_[a-z_]+)\(/.exec(line);
    if (header) current = header[1];
    if (current && /\b(writeDay|saveCardKey|api\.upsertKV)\(/.test(line)) found.add(current);
  }
  assert.deepEqual([...found].sort(), [...WRITE_TOOLS].sort(),
    'список WRITE_TOOLS разошёлся с инструментами, которые пишут в облако');
  for (const name of WRITE_TOOLS) {
    assert.ok(TOOL_SCHEMAS.some((s) => s.name === name), `${name} нет среди схем`);
  }
});
