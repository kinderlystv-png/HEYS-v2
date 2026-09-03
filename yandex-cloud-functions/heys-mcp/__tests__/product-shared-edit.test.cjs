'use strict';

/**
 * Куратор правит и общую карточку продукта, а не только личную копию клиента.
 *
 * До этого heys_update_product умел одно: класть правку в личный overlay и
 * отвечать «общая карточка не изменилась». Для куратора это не осторожность, а
 * потеря смысла — он исправляет ошибку в карточке (белок не тот, штрихкод не
 * тот), а исправление видит один клиент из десяти, у остальных остаётся
 * неверное число. В приложении куратор правит общую карточку давно
 * (updateSharedProduct в apps/web/heys_add_product_step_v1.js); не было её
 * только в коннекторе.
 *
 * Проверяем три вещи: выбор базы по умолчанию, честность ответа о том, какая
 * база изменена, и что в общую карточку не уезжают личные правки клиента.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createTools } = require('../lib/tools');
const products = require('../lib/products');
const sharedCatalog = require('../lib/shared-catalog');

const CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
const SESSION = 'session-token';
const NOW = Date.UTC(2026, 8, 3, 9, 0);

const SHARED_ROWS = [
  {
    id: 's-milk',
    name: 'Молоко ультрапастеризованное 3.5',
    brand: 'Простоквашино',
    category: 'Молочное',
    description: 'с упаковки',
    barcode: '4600000000001',
    protein100: 3, simple100: 4.7, complex100: 0,
    badfat100: 2.2, goodfat100: 1.3, trans100: 0, fiber100: 0,
    gi: 30, harm: 2,
    fingerprint: 'старый-отпечаток',
    name_norm: 'молоко ультрапастеризованное 3.5',
  },
  {
    id: 's-syrup',
    name: 'Сироп для кофе',
    protein100: 0, simple100: 75, complex100: 0,
    badfat100: 0, goodfat100: 0, trans100: 0, fiber100: 0,
    gi: 70, harm: 7,
  },
  {
    id: 's-latte',
    name: 'Кофе латте',
    protein100: 3, simple100: 5, complex100: 0,
    badfat100: 1, goodfat100: 1, trans100: 0, fiber100: 0,
    gi: 40, harm: 3,
  },
];

const OVERLAY = [
  // Клиент карточку не трогал — своей версии у него нет.
  { id: 'own-milk', shared_origin_id: 's-milk', overrides: {}, in_my_list: true },
  // А эту переписал под себя.
  { id: 'own-syrup', shared_origin_id: 's-syrup', overrides: { gi: 55 }, user_modified: true, in_my_list: true },
  {
    id: 'own-cake',
    _custom: true,
    name: 'Торт домашний',
    protein100: 5, simple100: 30, complex100: 10,
    badFat100: 12, goodFat100: 6, trans100: 0, fiber100: 1,
    gi: 65, harm: 8,
    in_my_list: true,
  },
];

function fakeApi({ overlay = OVERLAY, curator = true } = {}) {
  const upserts = [];
  const sharedWrites = [];
  let overlayState = overlay;
  const api = {
    upserts,
    sharedWrites,
    async upsertKV(_session, key, value) {
      upserts.push({ key, value });
      if (key === 'heys_products_overlay_v2') overlayState = value;
      return { ok: true };
    },
    async getKV(_session, key) {
      if (key === 'heys_products_overlay_v2') return { data: overlayState, error: null };
      return { data: null, error: null };
    },
    async getSharedProducts() {
      return { data: SHARED_ROWS.map((row) => ({ ...row })), error: null };
    },
  };
  if (curator) {
    api.updateSharedProduct = async (payload) => {
      sharedWrites.push(payload);
      return { ok: true, row: { id: payload.id, name: payload.name } };
    };
  }
  return api;
}

function build(api, { curator = true } = {}) {
  sharedCatalog.reset();
  return createTools({
    api, sessionToken: SESSION, clientId: CLIENT, nowMs: NOW, byCurator: curator,
  }).tools;
}

// ── Выбор базы по умолчанию ──────────────────────────────────────────────

test('карточка общей базы, которую клиент не переписывал, правится в общей', async () => {
  const api = fakeApi();
  const res = await build(api).heys_update_product({ query: 'молоко ультрапастеризованное', protein100: 3.2 });

  assert.equal(api.sharedWrites.length, 1, 'правка обязана уйти в общую базу');
  assert.equal(api.sharedWrites[0].id, 's-milk');
  assert.equal(api.sharedWrites[0].protein100, 3.2);
  assert.equal(
    api.upserts.filter((u) => u.key === 'heys_products_overlay_v2').length, 0,
    'личный список при правке общей карточки не трогаем',
  );
  assert.equal(res.structured.scope, 'shared');
  assert.match(res.text, /ОБЩУЮ карточку/, 'ответ обязан назвать изменённую базу — раньше он врал умолчанием');
  assert.match(res.text, /видят все клиенты/);
});

test('продукт, которого нет в списке клиента, тоже правится в общей базе', async () => {
  const api = fakeApi();
  const res = await build(api).heys_update_product({ query: 'кофе латте', harm: 4 });
  assert.equal(api.sharedWrites.length, 1);
  assert.equal(api.sharedWrites[0].id, 's-latte');
  assert.equal(res.structured.scope, 'shared');
});

test('у клиента своя версия карточки — правится она, и ответ говорит, как дойти до общей', async () => {
  const api = fakeApi();
  const res = await build(api).heys_update_product({ query: 'сироп для кофе', harm: 6 });

  assert.equal(api.sharedWrites.length, 0, 'общую карточку при живой личной версии молча не трогаем');
  const saved = api.upserts.find((u) => u.key === 'heys_products_overlay_v2').value;
  assert.equal(saved.find((r) => r.id === 'own-syrup').overrides.harm, 6);
  assert.equal(res.structured.scope, 'client');
  assert.match(res.text, /scope:"shared"/, 'без подсказки куратор не узнает, что общую тоже можно поправить');
});

test('личная карточка клиента правится лично — в общей базе её нет', async () => {
  const api = fakeApi();
  const res = await build(api).heys_update_product({ query: 'торт домашний', harm: 7 });
  assert.equal(api.sharedWrites.length, 0);
  assert.equal(res.structured.scope, 'client');
  assert.equal(res.structured.mode, 'custom');
});

// ── Явный выбор базы ─────────────────────────────────────────────────────

test('scope:"client" оставляет общую карточку в покое', async () => {
  const api = fakeApi();
  const res = await build(api).heys_update_product({
    query: 'молоко ультрапастеризованное', protein100: 3.2, scope: 'client',
  });
  assert.equal(api.sharedWrites.length, 0);
  assert.equal(res.structured.scope, 'client');
  assert.match(res.text, /Общая карточка не изменилась/);
});

test('scope:"shared" правит общую даже поверх личной версии клиента и предупреждает об этом', async () => {
  const api = fakeApi();
  const res = await build(api).heys_update_product({ query: 'сироп для кофе', harm: 6, scope: 'shared' });

  assert.equal(api.sharedWrites.length, 1);
  assert.equal(api.sharedWrites[0].id, 's-syrup');
  assert.equal(api.sharedWrites[0].harm, 6);
  assert.equal(
    api.sharedWrites[0].gi, 70,
    'личный override клиента (gi 55) не должен уехать в общую базу вместе с правкой',
  );
  assert.equal(res.structured.client_override_shadows, true);
  assert.match(res.text, /НЕ увидит/, 'клиент со своей версией правки общей карточки не увидит — это надо сказать');
});

test('scope:"shared" на личной карточке отказывает, а не выдумывает публикацию', async () => {
  const api = fakeApi();
  await assert.rejects(
    () => build(api).heys_update_product({ query: 'торт домашний', harm: 7, scope: 'shared' }),
    (e) => e.code === 'not_a_shared_product',
  );
  assert.equal(api.sharedWrites.length, 0);
});

test('неизвестный scope отбивается, а не трактуется как «сама реши»', async () => {
  const api = fakeApi();
  await assert.rejects(
    () => build(api).heys_update_product({ query: 'кофе латте', harm: 4, scope: 'обе' }),
    (e) => e.code === 'invalid_scope',
  );
  assert.equal(api.sharedWrites.length, 0);
});

// ── Клиентская сессия ────────────────────────────────────────────────────

test('из клиентской сессии общая база не правится ни по умолчанию, ни явно', async () => {
  const api = fakeApi({ curator: false });
  const tools = build(api, { curator: false });

  const res = await tools.heys_update_product({ query: 'молоко ультрапастеризованное', protein100: 3.2 });
  assert.equal(res.structured.scope, 'client', 'без куратора «сама выбери базу» это личная карточка, а не отказ');

  await assert.rejects(
    () => tools.heys_update_product({ query: 'кофе латте', harm: 4, scope: 'shared' }),
    (e) => e.code === 'shared_edit_forbidden',
  );
});

// ── Сверка идёт с той карточкой, которую правим ──────────────────────────

test('значение, уже стоящее у клиента, но не в общей базе, правкой общей считается', async () => {
  const api = fakeApi();
  // gi у сиропа: общая база 70, личная версия клиента 55.
  const res = await build(api).heys_update_product({ query: 'сироп для кофе', gi: 55, scope: 'shared' });
  assert.equal(api.sharedWrites[0].gi, 55);
  assert.match(res.text, /гликемический индекс|gi/i);
});

test('общая карточка уже содержит присланное — это отказ, а не пустая запись', async () => {
  const api = fakeApi();
  await assert.rejects(
    () => build(api).heys_update_product({ query: 'кофе латте', harm: 3, scope: 'shared' }),
    (e) => {
      assert.equal(e.code, 'nothing_to_update');
      assert.match(e.message, /Общая карточка/);
      return true;
    },
  );
  assert.equal(api.sharedWrites.length, 0);
});

test('отказ шлюза не превращается в «сохранено» и называет, что проверять', async () => {
  const api = fakeApi();
  api.updateSharedProduct = async () => ({ ok: false, error: 'shared_update_http_500', status: 500 });
  await assert.rejects(
    () => build(api).heys_update_product({ query: 'кофе латте', protein100: 90, scope: 'shared' }),
    (e) => {
      assert.equal(e.code, 'save_failed');
      // CHECK на массу нутриентов шлюз отдаёт голым 500 — без подсказки куратор
      // видит только «http_500» и не знает, где искать причину.
      assert.match(e.message, /сумму БЖУ и клетчатки/);
      return true;
    },
  );
});

// ── Payload общей базы ───────────────────────────────────────────────────

test('payload собирается из общей строки: колонки таблицы, пересчитанные отпечатки', () => {
  const base = products.normalizeSharedRow(SHARED_ROWS[0]);
  const payload = products.buildSharedProductPayload(base, { protein100: 3.2, badFat100: 2.5 });

  assert.equal(payload.id, 's-milk');
  assert.equal(payload.protein100, 3.2);
  assert.equal(payload.badfat100, 2.5, 'колонка таблицы называется badfat100, а поле карточки — badFat100');
  assert.equal(payload.category, 'Молочное', 'не тронутые правкой колонки должны доехать как были');
  assert.equal(payload.description, 'с упаковки');
  assert.notEqual(payload.fingerprint, 'старый-отпечаток', 'отпечаток обязан пересчитаться от новых нутриентов');
  assert.equal(payload.fingerprint, products.computeProductFingerprint({ ...base, protein100: 3.2, badFat100: 2.5 }));
  assert.equal(payload.brand_fingerprint, products.computeProductBrandFingerprint({ ...base, protein100: 3.2, badFat100: 2.5 }));
  assert.equal(payload.name_norm, 'молоко ультрапастеризованное 3.5');
  for (const key of Object.keys(payload)) {
    assert.ok(products.SHARED_PRODUCT_COLUMNS.includes(key), `колонки ${key} в shared_products нет`);
  }
  assert.equal('badFat100' in payload, false, 'camelCase-поле карточки таблица не примет');
  assert.equal('kcal100' in payload, false, 'вычисляемая калорийность в таблице не хранится');
  assert.equal('carbs100' in payload, false);
  assert.equal('updated_at' in payload, false, 'время правки ставит шлюз, присланное затёрло бы его');
});

test('переименование пересчитывает name_norm — иначе поиск в приложении промахнётся', () => {
  const base = products.normalizeSharedRow(SHARED_ROWS[2]);
  const payload = products.buildSharedProductPayload(base, { name: '  Кофе  Лёгкий Латте ' });
  assert.equal(payload.name, '  Кофе  Лёгкий Латте ');
  assert.equal(payload.name_norm, 'кофе легкий латте');
});

/**
 * Колонка вне белого списка REST-шлюза отбивается там как
 * `invalid_insert_column`, и увидит это только куратор в проде. Сверяем список
 * с самим шлюзом, а не с памятью автора.
 */
test('все колонки payload разрешены REST-шлюзом heys-api-rest', () => {
  const restIndex = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'heys-api-rest', 'index.js'),
    'utf8',
  );
  const block = /shared_products:\s*\[([\s\S]*?)\]/.exec(restIndex);
  assert.ok(block, 'белый список колонок shared_products в heys-api-rest не найден — тест надо переписать');
  const allowed = new Set(
    block[1].split(',')
      .map((part) => {
        const m = /'([^']+)'/.exec(part);
        return m ? m[1] : null;
      })
      .filter(Boolean),
  );
  assert.ok(allowed.has('protein100') && allowed.has('badfat100'), 'разбор белого списка сломался');
  for (const column of products.SHARED_PRODUCT_COLUMNS) {
    assert.ok(allowed.has(column), `колонка ${column} не разрешена шлюзом — запись отобьётся в проде`);
  }
});

test('кураторская обёртка отдаёт правку общей базы под curator-JWT', () => {
  const curatorSrc = fs.readFileSync(path.resolve(__dirname, '..', 'lib', 'curator.js'), 'utf8');
  assert.match(
    curatorSrc, /async updateSharedProduct\(productData\) \{[\s\S]{0,120}api\.updateSharedProduct\(curatorJwt, productData\)/,
    'без обёртки инструмент не дотянется до общей базы — правка молча уйдёт в личную',
  );
  const apiSrc = fs.readFileSync(path.resolve(__dirname, '..', 'lib', 'heys-api.js'), 'utf8');
  assert.match(apiSrc, /upsert: 'true', on_conflict: 'id'/, 'общая карточка правится upsert-ом по id, как в UI приложения');
});
