'use strict';

/**
 * Чтение многих ключей режется на пачки и делится пополам на отказе.
 *
 * 3 сентября поиск по задачнику (282 файла) перестал работать целиком:
 * getKVManyByCurator складывал все ключи в один адрес, и шлюз отвечал
 * 414 «URI Too Long». Не «искал хуже» — не отвечал вовсе.
 *
 * В тот же день у моста нашлась зеркальная беда с той же природой: там не
 * влезал ОТВЕТ, и приходила 502. Длину адреса можно посчитать заранее,
 * объём ответа — нет, поэтому лечится и тем и другим: пачки по длине плюс
 * деление пополам по факту отказа.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApiClient } = require('../lib/heys-api.js');

const CLIENT = '11111111-2222-3333-4444-555555555555';
const JWT = 'jwt';

/** Сервер, который отказывается принимать адрес длиннее лимита. */
function serverWithUrlLimit(limitBytes, { status = 414 } = {}) {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (Buffer.byteLength(url, 'utf8') > limitBytes) return { status, json: null, text: '' };
    const inMatch = /in\.\(([^)]*)\)/.exec(decodeURIComponent(url));
    const keys = inMatch ? inMatch[1].split(',').filter(Boolean) : [];
    return { status: 200, json: keys.map((k) => ({ k, v: { path: k } })), text: '' };
  };
  return { seen, fetchImpl };
}

const keysOf = (n, prefix = 'heys_tasks_days_2026-08-') =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);

test('282 ключа читаются пачками, а не одним адресом', async () => {
  const { seen, fetchImpl } = serverWithUrlLimit(100000);
  const api = createApiClient({ apiUrl: 'https://api.test', fetchImpl });
  const keys = keysOf(282, 'heys_tasks_file_');

  const { data, error } = await api.getKVManyByCurator(JWT, CLIENT, keys);
  assert.equal(error, null);
  assert.equal(Object.keys(data).length, 282, 'вернулись все ключи');
  assert.ok(seen.length > 1, 'запрос разрезан на пачки');
  for (const url of seen) {
    assert.ok(Buffer.byteLength(url, 'utf8') < 2500, `адрес пачки слишком длинный: ${url.length}`);
  }
});

test('отказ 414 делит пачку пополам, пока не пройдёт', async () => {
  // Лимит ниже, чем даёт наша нарезка: сервер отобьёт первые попытки,
  // и пройти можно только делением.
  const { seen, fetchImpl } = serverWithUrlLimit(700);
  const api = createApiClient({ apiUrl: 'https://api.test', fetchImpl });
  const keys = keysOf(40, 'heys_tasks_projects_очень_длинное_имя_');

  const { data, error } = await api.getKVManyByCurator(JWT, CLIENT, keys);
  assert.equal(error, null, 'после деления чтение проходит');
  assert.equal(Object.keys(data).length, 40, 'ни один ключ не потерян');

  const rejected = seen.filter((u) => Buffer.byteLength(u, 'utf8') > 700);
  assert.ok(rejected.length > 0, 'первые попытки действительно отбивались');
});

test('502 на объёме ответа лечится тем же делением', async () => {
  const { fetchImpl } = serverWithUrlLimit(700, { status: 502 });
  const api = createApiClient({ apiUrl: 'https://api.test', fetchImpl });
  const { data, error } = await api.getKVManyByCurator(JWT, CLIENT, keysOf(30, 'heys_tasks_длинный_ключ_'));
  assert.equal(error, null);
  assert.equal(Object.keys(data).length, 30);
});

test('один ключ, который не влез сам по себе, возвращает ошибку, а не тишину', async () => {
  const { fetchImpl } = serverWithUrlLimit(10);
  const api = createApiClient({ apiUrl: 'https://api.test', fetchImpl });
  const { data, error } = await api.getKVManyByCurator(JWT, CLIENT, ['heys_tasks_days_2026-08-01']);
  assert.equal(data, null);
  assert.equal(error.status, 414, 'молчать про непрочитанный ключ нельзя');
});

test('чужая ошибка не делится, а отдаётся сразу', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { status: 403, json: null, text: '' }; };
  const api = createApiClient({ apiUrl: 'https://api.test', fetchImpl });
  const { error } = await api.getKVManyByCurator(JWT, CLIENT, keysOf(40));
  assert.equal(error.status, 403);
  assert.equal(calls, 1, '403 — не про размер, делить бессмысленно');
});

test('пустой список ключей не ходит в сеть', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { status: 200, json: [], text: '' }; };
  const api = createApiClient({ apiUrl: 'https://api.test', fetchImpl });
  const { data, error } = await api.getKVManyByCurator(JWT, CLIENT, []);
  assert.deepEqual(data, {});
  assert.equal(error, null);
  assert.equal(calls, 0);
});
