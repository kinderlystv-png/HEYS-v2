// Каталог продуктов пишется парой: строки + сторож целостности.
//
// Инцидент 2026-08-22: heys_create_product / heys_update_product /
// heys_delete_product писали только строки. Клиент собирает каталог через
// codec.assemble() и при несовпадении хеша или длины отвергает пару целиком —
// молча. У двух клиентов из трёх расхождение накопилось до 5 и 18 позиций, и
// облачный каталог перестал приезжать на новое устройство (apps/web/BUGS_HISTORY.md).
//
// Проверяется не «вызвался ли upsertKV дважды», а то, ради чего всё делалось:
// записанную пару принимает НАСТОЯЩИЙ кодек клиента.

const assert = require('node:assert/strict');
const test = require('node:test');

const products = require('../lib/products.js');
const codec = require('../shared/overlay-shard-codec.js').assemble
  ? require('../shared/overlay-shard-codec.js')
  : globalThis.HEYS.OverlayShardCodec;

const OVERLAY = products.OVERLAY_KEY;
const MANIFEST = products.OVERLAY_MANIFEST_KEY;

function fakeApi(options = {}) {
  const store = {};
  const writes = [];
  return {
    store,
    writes,
    async upsertKV(_session, key, value) {
      writes.push(key);
      if (options.failOn === key) return { ok: false, error: 'upstream said no' };
      store[key] = value;
      return { ok: true };
    },
  };
}

const rows = (n) => Array.from({ length: n }, (_, i) => ({
  id: `p_17870000000${String(i).padStart(2, '0')}_test`,
  name: `Продукт ${i}`,
  kcal100: 100 + i,
  _custom: true,
}));

test('после записи пара собирается настоящим кодеком клиента', async () => {
  const api = fakeApi();
  const res = await products.saveOverlayRows(api, 'session', rows(7));
  assert.equal(res.ok, true);

  const verdict = codec.assemble(api.store[OVERLAY], [], api.store[MANIFEST]);
  assert.equal(verdict.status, 'complete');
  assert.equal(verdict.rows.length, 7);
});

test('манифест пишется ПОСЛЕ строк — commit marker последним', async () => {
  const api = fakeApi();
  await products.saveOverlayRows(api, 'session', rows(3));
  assert.deepEqual(api.writes, [OVERLAY, MANIFEST]);
});

test('rowCount манифеста совпадает с числом строк', async () => {
  const api = fakeApi();
  await products.saveOverlayRows(api, 'session', rows(12));
  assert.equal(api.store[MANIFEST].rowCount, 12);
  assert.equal(api.store[OVERLAY].length, 12);
});

test('каждая следующая запись оставляет пару согласованной', async () => {
  // Ровно сценарий инцидента: куратор заводит продукты один за другим.
  const api = fakeApi();
  let current = rows(5);
  for (let added = 0; added < 4; added += 1) {
    current = [...current, { id: `p_1787999${added}_new`, name: `Новый ${added}`, _custom: true }];
    const res = await products.saveOverlayRows(api, 'session', current);
    assert.equal(res.ok, true);
    const verdict = codec.assemble(api.store[OVERLAY], [], api.store[MANIFEST]);
    assert.equal(verdict.status, 'complete', `пара разошлась после ${added + 1}-го продукта`);
  }
  assert.equal(api.store[MANIFEST].rowCount, 9);
});

test('удаление продукта тоже оставляет пару согласованной', async () => {
  const api = fakeApi();
  await products.saveOverlayRows(api, 'session', rows(6));
  const res = await products.saveOverlayRows(api, 'session', rows(6).slice(0, 4));
  assert.equal(res.ok, true);
  assert.equal(codec.assemble(api.store[OVERLAY], [], api.store[MANIFEST]).status, 'complete');
});

test('пустой каталог — тоже согласованная пара, а не отказ', async () => {
  const api = fakeApi();
  const res = await products.saveOverlayRows(api, 'session', []);
  assert.equal(res.ok, true);
  assert.equal(codec.assemble(api.store[OVERLAY], [], api.store[MANIFEST]).status, 'complete');
});

test('отказ на строках не пишет манифест', async () => {
  const api = fakeApi({ failOn: OVERLAY });
  const res = await products.saveOverlayRows(api, 'session', rows(4));
  assert.equal(res.ok, false);
  assert.deepEqual(api.writes, [OVERLAY]);
  assert.equal(api.store[MANIFEST], undefined);
});

test('отказ на манифесте — это ошибка, а не тихий успех', async () => {
  // Пара осталась рассогласованной; вернуть ok здесь означало бы повторить
  // исходный дефект, только с ведома кода.
  const api = fakeApi({ failOn: MANIFEST });
  const res = await products.saveOverlayRows(api, 'session', rows(4));
  assert.equal(res.ok, false);
  assert.match(res.error, /сторож целостности/);
});

test('не массив — отказ до всякой записи', async () => {
  const api = fakeApi();
  const res = await products.saveOverlayRows(api, 'session', 'не массив');
  assert.equal(res.ok, false);
  assert.deepEqual(api.writes, []);
});

test('состояние из инцидента кодек действительно отвергает', async () => {
  // Контроль самой проверки: если бы assemble принимал что угодно, тесты выше
  // ничего не доказывали бы.
  const api = fakeApi();
  await products.saveOverlayRows(api, 'session', rows(5));
  const withExtraRow = [...api.store[OVERLAY], { id: 'p_1787999999_extra', name: 'Лишний' }];
  const verdict = codec.assemble(withExtraRow, [], api.store[MANIFEST]);
  assert.equal(verdict.ok, false);
});

test('loadOverlayAssembled отказывает при неполной паре', async () => {
  const api = {
    async getKVMany(_session, keys) {
      const data = {};
      keys.forEach((key) => { data[key] = null; });
      data[OVERLAY] = rows(3);
      data[MANIFEST] = { format: 'heys-overlay-manifest-v1', generation: 'x', state: 'committed', count: 2, rowCount: 3, hashes: ['1:abc', '2:def'] };
      data[`${products.OVERLAY_TAIL_KEY_PREFIX}1`] = rows(1);
      return { data, error: null };
    },
  };
  const loaded = await products.loadOverlayAssembled(api, 'session');
  assert.equal(loaded.ok, false);
  assert.ok(['incomplete', 'generation_mismatch'].includes(loaded.error));
});

test('loadOverlayAssembled возвращает priorTailCount по фактическим хвостам', async () => {
  const api = {
    async getKVMany(_session, keys) {
      const data = {};
      keys.forEach((key) => { data[key] = null; });
      data[OVERLAY] = rows(4);
      data[MANIFEST] = null;
      data[`${products.OVERLAY_TAIL_KEY_PREFIX}1`] = rows(2);
      data[`${products.OVERLAY_TAIL_KEY_PREFIX}2`] = rows(1);
      return { data, error: null };
    },
  };
  const loaded = await products.loadOverlayAssembled(api, 'session');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.assembled.status, 'legacy');
  assert.equal(loaded.priorTailCount, 2);
});

test('saveOverlayRows не удаляет хвосты, если их не было в манифесте', async () => {
  const deleted = [];
  const api = {
    store: {},
    writes: [],
    async getKV(_session, key) {
      if (key === MANIFEST) return { data: null, error: null };
      return { data: null, error: null };
    },
    async upsertKV(_session, key, value) {
      this.writes.push(key);
      this.store[key] = value;
      return { ok: true };
    },
    async deleteKV(_session, key) {
      deleted.push(key);
      return { ok: true };
    },
  };
  const res = await products.saveOverlayRows(api, 'session', rows(5), { priorTailCount: 0 });
  assert.equal(res.ok, true);
  assert.deepEqual(deleted, []);
});

test('saveOverlayRows удаляет только осиротевшие хвосты из прошлого манифеста', async () => {
  const deleted = [];
  let manifest = null;
  const api = {
    store: {},
    async getKV(_session, key) {
      if (key === MANIFEST) return { data: manifest, error: null };
      return { data: null, error: null };
    },
    async upsertKV(_session, key, value) {
      this.store[key] = value;
      if (key === MANIFEST) manifest = value;
      return { ok: true };
    },
    async deleteKV(_session, key) {
      deleted.push(key);
      return { ok: true };
    },
  };
  const bigRows = rows(120).map((row, index) => ({
    ...row,
    name: `Продукт ${index}`,
    notes: 'x'.repeat(900),
    _custom: true,
  }));
  const first = await products.saveOverlayRows(api, 'session', bigRows, { priorTailCount: 0 });
  assert.equal(first.ok, true);
  assert.deepEqual(deleted, []);

  const priorTailCount = Math.max(0, manifest.count - 1);
  const second = await products.saveOverlayRows(api, 'session', rows(5), { priorTailCount });
  assert.equal(second.ok, true);
  assert.ok(deleted.length > 0);
  assert.ok(deleted.every((key) => key.startsWith(products.OVERLAY_TAIL_KEY_PREFIX)));
  assert.ok(deleted.length < products.MAX_OVERLAY_TAIL_SHARDS);
});

test('saveOverlayRows чистит legacy-хвосты без валидного манифеста', async () => {
  const deleted = [];
  const api = {
    store: {},
    async upsertKV(_session, key, value) {
      this.store[key] = value;
      return { ok: true };
    },
    async deleteKV(_session, key) {
      deleted.push(key);
      return { ok: true };
    },
  };
  const res = await products.saveOverlayRows(api, 'session', rows(4), { priorTailCount: 2 });
  assert.equal(res.ok, true);
  assert.deepEqual(deleted, [
    `${products.OVERLAY_TAIL_KEY_PREFIX}1`,
    `${products.OVERLAY_TAIL_KEY_PREFIX}2`,
  ]);
});
