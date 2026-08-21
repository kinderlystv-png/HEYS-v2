// Сторож схлопывания личного каталога продуктов.
//
// Инцидент 21.08.2026: каталог клиента в облаке заменился одной позицией вместо
// 146, и об этом узнали через часы — вручную (apps/web/BUGS_HISTORY.md). Здесь
// проверяется именно решение «кричать / молчать»: пороги подобраны так, чтобы
// поймать одношаговую потерю каталога и не будить владельца на живой чистке.
//
// Всё симуляцией: БД подменяется фейковым клиентом, чтобы проверять и решение,
// и то, что снимок двигается после каждого прогона.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CATALOG_MAX_SHRINK_RATIO,
  CATALOG_MIN_ABSOLUTE_DROP,
  CATALOG_MIN_WATCHED_ROWS,
  checkCatalogShrink,
  evaluateCatalogShrink,
} = require('../index.js').__test;

// ── Решение по одной строке ────────────────────────────────────────────────

test('инцидент 21.08 ловится: 146 → 1', () => {
  const verdict = evaluateCatalogShrink({ previous_rows: 146, current_rows: 1 });
  assert.equal(verdict.alert, true);
  assert.equal(verdict.reason, 'sharp_shrink');
  assert.equal(verdict.dropped, 145);
});

test('каталог, стёртый в ноль, тоже ловится', () => {
  assert.equal(evaluateCatalogShrink({ previous_rows: 146, current_rows: 0 }).alert, true);
});

test('легитимная чистка человеком молчит: удалили десяток из 146', () => {
  const verdict = evaluateCatalogShrink({ previous_rows: 146, current_rows: 136 });
  assert.equal(verdict.alert, false);
  assert.equal(verdict.reason, 'drop_too_gradual');
});

test('легитимная чистка молчит и на четверти каталога: 146 → 110', () => {
  assert.equal(evaluateCatalogShrink({ previous_rows: 146, current_rows: 110 }).alert, false);
});

test('удаление по одному не кричит ни на одном шаге', () => {
  let rows = 146;
  while (rows > 100) {
    const verdict = evaluateCatalogShrink({ previous_rows: rows, current_rows: rows - 1 });
    assert.equal(verdict.alert, false, `сработал на шаге ${rows} → ${rows - 1}`);
    rows -= 1;
  }
});

test('маленький каталог не сторожим: 7 → 1 молчит', () => {
  const verdict = evaluateCatalogShrink({ previous_rows: 7, current_rows: 1 });
  assert.equal(verdict.alert, false);
  assert.equal(verdict.reason, 'catalog_too_small');
});

test('половинная доля при мелкой потере молчит — абсолютный порог держит', () => {
  // 20 → 11: доля 0.55 выше порога, и потеряно всего 9.
  const verdict = evaluateCatalogShrink({ previous_rows: 20, current_rows: 11 });
  assert.equal(verdict.alert, false);
});

test('рост каталога никогда не алерт', () => {
  assert.equal(evaluateCatalogShrink({ previous_rows: 100, current_rows: 180 }).alert, false);
  assert.equal(evaluateCatalogShrink({ previous_rows: 100, current_rows: 100 }).alert, false);
});

test('клиент без предыдущего снимка не считается инцидентом', () => {
  const verdict = evaluateCatalogShrink({ previous_rows: null, current_rows: 3 });
  assert.equal(verdict.alert, false);
  assert.equal(verdict.reason, 'no_baseline');
});

test('пороги остаются теми, под которые подбирались границы', () => {
  assert.equal(CATALOG_MIN_WATCHED_ROWS, 20);
  assert.equal(CATALOG_MAX_SHRINK_RATIO, 0.5);
  assert.equal(CATALOG_MIN_ABSOLUTE_DROP, 10);
});

// ── Прогон сторожа целиком ─────────────────────────────────────────────────

function fakeClient(rows) {
  const upserts = [];
  return {
    upserts,
    async query(sql, params) {
      if (sql.includes('FROM client_kv_store')) return { rows };
      if (sql.includes('INSERT INTO products_catalog_watch')) {
        upserts.push({ client_id: params[0], row_count: params[1] });
        return { rows: [] };
      }
      throw new Error(`неожиданный запрос: ${sql.slice(0, 60)}`);
    },
  };
}

test('сторож возвращает только схлопнувшихся клиентов', async () => {
  const client = fakeClient([
    { client_id: 'a', current_rows: 1, previous_rows: 146, peak_rows: 146 },
    { client_id: 'b', current_rows: 136, previous_rows: 146, peak_rows: 200 },
    { client_id: 'c', current_rows: 278, previous_rows: 278, peak_rows: 278 },
  ]);

  const incidents = await checkCatalogShrink(client);

  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].client_id, 'a');
  assert.equal(incidents[0].was, 146);
  assert.equal(incidents[0].now, 1);
  assert.equal(incidents[0].lost, 145);
});

test('снимок двигается по КАЖДОМУ клиенту, включая только что заалертившего', async () => {
  // Иначе один инцидент повторялся бы в каждом прогоне до восстановления.
  const client = fakeClient([
    { client_id: 'a', current_rows: 1, previous_rows: 146, peak_rows: 146 },
    { client_id: 'b', current_rows: 136, previous_rows: 146, peak_rows: 200 },
  ]);

  await checkCatalogShrink(client);

  assert.deepEqual(client.upserts, [
    { client_id: 'a', row_count: 1 },
    { client_id: 'b', row_count: 136 },
  ]);
});

test('повторный прогон после инцидента молчит — сравнение уже с новым снимком', async () => {
  const first = fakeClient([{ client_id: 'a', current_rows: 1, previous_rows: 146, peak_rows: 146 }]);
  assert.equal((await checkCatalogShrink(first)).length, 1);

  const second = fakeClient([{ client_id: 'a', current_rows: 1, previous_rows: 1, peak_rows: 146 }]);
  assert.equal((await checkCatalogShrink(second)).length, 0);
});

test('в алерт попадает исторический максимум, а не только предыдущий шаг', async () => {
  const client = fakeClient([
    { client_id: 'a', current_rows: 2, previous_rows: 90, peak_rows: 300 },
  ]);
  const [incident] = await checkCatalogShrink(client);
  assert.equal(incident.peak, 300);
});
