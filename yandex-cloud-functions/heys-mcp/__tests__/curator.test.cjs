'use strict';

/**
 * Кураторский режим: один коннектор — все клиенты куратора.
 * Главное, что здесь проверяется, — невозможность записи «не тому клиенту»
 * без явного указания цели и адресность каждого ответа.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createCuratorContext, buildCuratorSchemas, curatorInstructions, CLIENTLESS_TOOLS } = require('../lib/curator');
const tasksLib = require('../lib/tasks');
const { TOOL_SCHEMAS } = require('../lib/tools');
const products = require('../lib/products');
const oauth = require('../lib/oauth');
const tokens = require('../lib/crypto-tokens');
const mcp = require('../lib/mcp');
const sharedCatalog = require('../lib/shared-catalog');

// Кеш общей базы живёт в модуле и переживает вызовы — в тестах его надо
// сбрасывать, иначе прогретый снимок из соседнего теста подменит сбойный ответ.
test.beforeEach(() => sharedCatalog.reset());

const SECRET = 'unit-secret-'.repeat(4);
const RAW_JWT_SECRET = 'raw-jwt-secret-'.repeat(3);
const JWT = 'curator-jwt-token';
const NOW = Date.UTC(2026, 7, 1, 12, 54); // 15:54 МСК

const CLIENTS = [
  { client_id: 'cid-anton', name: 'Антон', status: 'active' },
  { client_id: 'cid-alexandra', name: 'Александра', status: 'trial' },
];

const SHARED = [
  { id: 's-oats', name: 'Овсяные хлопья', protein100: 12, simple100: 1, complex100: 58, badfat100: 1, goodfat100: 5 },
  {
    id: 's-tomato', name: 'Помидор', protein100: 0.9, simple100: 2.6, complex100: 1.2,
    badfat100: 0, goodfat100: 0.2, trans100: 0, fiber100: 1.2, gi: 15, harm: 1,
  },
];

/** Подставной API: данные раздельно по клиентам, фиксация кураторских записей. */
function fakeCuratorApi({ clients = CLIENTS, tasksClientId = null, tasksIndex = null } = {}) {
  const kv = {
    'cid-anton': {
      heys_products_overlay_v2: [{ id: 'own-coffee', _custom: true, name: 'Кофе американо', protein100: 0.1, simple100: 0.3, complex100: 0, badFat100: 0, goodFat100: 0, in_my_list: true }],
      heys_meal_presets_v1: [{ id: 'mp1', name: 'Кофе Киндерли', items: [{ product_id: 'own-coffee', name: 'Кофе американо', grams: 100 }] }],
      'heys_dayv2_2026-08-01': { date: '2026-08-01', meals: [], waterMl: 100, updatedAt: 5 },
    },
    'cid-alexandra': {
      heys_products_overlay_v2: [{ id: 'own-tea', _custom: true, name: 'Чай зелёный', protein100: 0, simple100: 0.1, complex100: 0, badFat100: 0, goodFat100: 0, in_my_list: true }],
      heys_meal_presets_v1: [],
      'heys_dayv2_2026-08-01': { date: '2026-08-01', meals: [], waterMl: 0, updatedAt: 9 },
    },
  };
  if (tasksClientId) {
    kv[tasksClientId] = {
      [tasksLib.INDEX_KEY]: tasksIndex || { files: {}, updatedAt: NOW },
    };
  }
  const writes = [];
  const contexts = [];
  const batchReads = [];
  return {
    kv,
    writes,
    contexts,
    batchReads,
    stats: { calls: 0, ms: 0 },
    async listClients(bearer) {
      assert.equal(bearer, JWT, 'список клиентов запрашивается с кураторским JWT');
      return { data: clients, error: null };
    },
    async getKVByCurator(bearer, clientId, key) {
      assert.equal(bearer, JWT);
      return { data: (kv[clientId] && kv[clientId][key]) ?? null, error: null };
    },
    async getKVManyByCurator(bearer, clientId, keys) {
      assert.equal(bearer, JWT);
      batchReads.push({ clientId, keys });
      const out = {};
      for (const key of keys) {
        const value = kv[clientId] && kv[clientId][key];
        if (value !== undefined) out[key] = value;
      }
      return { data: out, error: null };
    },
    async issueWriteContext(bearer, clientId) {
      contexts.push(clientId);
      return `ctx-${clientId}`;
    },
    async mergeSaveKVByCurator(bearer, clientId, key, value, lastSeen, contextId) {
      writes.push({ path: 'merge', clientId, key, value, lastSeen, contextId });
      if (kv[clientId]) kv[clientId][key] = value;
      return { ok: true, outcome: 'incoming_wins' };
    },
    async upsertKVByCurator(bearer, clientId, key, value, contextId) {
      writes.push({ path: 'upsert', clientId, key, value, contextId });
      if (kv[clientId]) kv[clientId][key] = value;
      return { ok: true };
    },
    async upsertKVManyByCurator(bearer, clientId, entries, contextId) {
      writes.push({ path: 'batch-upsert', clientId, entries, contextId });
      if (kv[clientId]) {
        for (const entry of entries) kv[clientId][entry.k] = entry.v;
      }
      return { ok: true };
    },
    async getSharedProducts() {
      return { data: SHARED, error: null };
    },
  };
}

function build(api, { tasksClientId = null } = {}) {
  return createCuratorContext({ api, curatorJwt: JWT, curatorName: 'Кин', nowMs: NOW, tasksClientId });
}

test('list_clients отдаёт клиентов куратора', async () => {
  const { tools } = build(fakeCuratorApi());
  const res = await tools.heys_list_clients({});
  assert.equal(res.structured.clients.length, 2);
  assert.match(res.text, /Антон/);
  assert.match(res.text, /Александра/);
  assert.match(res.text, /cid-anton|cid-alex/);
});

test('запись без указания клиента при двух клиентах отклоняется со списком', async () => {
  const { tools } = build(fakeCuratorApi());
  await assert.rejects(
    () => tools.heys_add_water({ ml: 100 }),
    (e) => {
      assert.equal(e.code, 'client_required');
      assert.equal(e.details.clients.length, 2);
      return true;
    },
  );
});

test('клиент резолвится по имени без регистра, запись уходит адресно и с write-context', async () => {
  const api = fakeCuratorApi();
  const { tools } = build(api);
  const res = await tools.heys_add_water({ client: 'александра', ml: 250 });

  assert.equal(api.writes.length, 1);
  assert.equal(api.writes[0].clientId, 'cid-alexandra');
  assert.equal(api.writes[0].contextId, 'ctx-cid-alexandra');
  assert.match(res.text, /^\[Александра\]/);
  assert.equal(res.structured.client.client_id, 'cid-alexandra');
  assert.equal(res.structured.water_ml, 250);
});

test('клиент резолвится по client_id и по подстроке имени', async () => {
  const api = fakeCuratorApi();
  const { tools } = build(api);
  const byId = await tools.heys_get_day({ client: 'cid-anton' });
  assert.match(byId.text, /^\[Антон\]/);
  const byPart = await tools.heys_get_day({ client: 'алекс' });
  assert.match(byPart.text, /^\[Александра\]/);
});

test('неизвестный и неоднозначный клиент не угадываются', async () => {
  const twins = [
    { client_id: 'c1', name: 'Анна К', status: null },
    { client_id: 'c2', name: 'Анна М', status: null },
  ];
  const { tools } = build(fakeCuratorApi({ clients: twins }));
  await assert.rejects(() => tools.heys_get_day({ client: 'Анна' }), (e) => e.code === 'client_ambiguous');
  await assert.rejects(() => tools.heys_get_day({ client: 'Пётр' }), (e) => e.code === 'client_not_found');
});

test('единственный клиент подставляется без параметра — на чтении', async () => {
  const api = fakeCuratorApi({ clients: [CLIENTS[1]] });
  const { tools } = build(api);
  const res = await tools.heys_get_day({ date: '2026-08-01' });
  assert.match(res.text, /^\[Александра\]/);
});

test('запись требует явного клиента даже когда он единственный', async () => {
  const api = fakeCuratorApi({ clients: [CLIENTS[1]] });
  const { tools } = build(api);
  await assert.rejects(
    () => tools.heys_add_water({ ml: 100 }),
    (e) => {
      assert.equal(e.code, 'client_required');
      assert.equal(api.writes.length, 0, 'до разрешения цели запись не уходит');
      return true;
    },
  );
});

test('на запись частичное совпадение имени не принимается, на чтение — да', async () => {
  const api = fakeCuratorApi();
  const { tools } = build(api);

  const read = await tools.heys_get_day({ client: 'Алекс', date: '2026-08-01' });
  assert.match(read.text, /^\[Александра\]/);

  await assert.rejects(
    () => tools.heys_add_water({ client: 'Алекс', ml: 100 }),
    (e) => {
      assert.equal(e.code, 'client_not_found');
      assert.match(e.message, /целиком/);
      assert.equal(api.writes.length, 0);
      return true;
    },
  );

  const byId = await tools.heys_add_water({ client: 'cid-alexandra', ml: 100 });
  assert.equal(api.writes[0].clientId, 'cid-alexandra');
  assert.match(byId.text, /^\[Александра\]/);
});

test('строгая адресация распространяется на действия наружу', async () => {
  const api = fakeCuratorApi();
  const { tools } = build(api);
  await assert.rejects(
    () => tools.heys_reply_message({ client: 'Алекс', text: 'привет' }),
    (e) => e.code === 'client_not_found',
  );
});

test('client обязателен по схеме у пишущих инструментов и у действий наружу', () => {
  const schemas = buildCuratorSchemas();
  const byName = new Map(schemas.map((s) => [s.name, s]));
  for (const name of ['heys_log_meal', 'heys_add_water', 'heys_update_day', 'heys_create_product', 'heys_reply_message', 'heys_client_access']) {
    assert.ok((byName.get(name).inputSchema.required || []).includes('client'), `${name}: client должен быть required`);
  }
  // Собственные обязательные поля схемы при этом не теряются.
  assert.deepEqual(byName.get('heys_reply_message').inputSchema.required, ['client', 'text']);
  assert.ok((byName.get('heys_manage_subscription').inputSchema.required || []).includes('action'));
  // Чтение остаётся свободным: там частичное имя допустимо.
  for (const name of ['heys_get_day', 'heys_search_products', 'heys_get_period']) {
    assert.ok(!(byName.get(name).inputSchema.required || []).includes('client'), `${name}: client не должен быть required`);
  }
});

test('каталоги продуктов и наборы у клиентов раздельные', async () => {
  const { tools } = build(fakeCuratorApi());
  const anton = await tools.heys_search_products({ client: 'Антон', query: 'кофе', scope: 'client' });
  assert.ok(anton.structured.results.some((p) => p.name === 'Кофе американо'));
  const alexandra = await tools.heys_search_products({ client: 'Александра', query: 'кофе', scope: 'client' });
  assert.equal(alexandra.structured.results.some((p) => p.name === 'Кофе американо'), false);

  const presets = await tools.heys_list_meal_presets({ client: 'Антон' });
  assert.equal(presets.structured.presets.length, 1);
  const presetsA = await tools.heys_list_meal_presets({ client: 'Александра' });
  assert.equal(presetsA.structured.presets.length, 0);
});

test('приём по набору пишется в день нужного клиента с его writerCid', async () => {
  const api = fakeCuratorApi();
  const { tools } = build(api);
  const res = await tools.heys_log_meal({ client: 'Антон', preset: 'Кофе Киндерли' });
  const write = api.writes.find((w) => w.key === 'heys_dayv2_2026-08-01');
  assert.equal(write.clientId, 'cid-anton');
  assert.equal(write.path, 'merge', 'день клиента пишется только через merge');
  assert.equal(write.value._writerCid, 'cid-anton');
  assert.equal(write.lastSeen, 5, 'merge отправляет известную версию дня этого клиента');
  assert.match(res.text, /^\[Антон\]/);
});

test('запись в дневник автоматически кладёт реплику и результат в стенограмму', async () => {
  const tasksClientId = 'cid-tasks';
  const api = fakeCuratorApi({
    tasksClientId,
    tasksIndex: {
      files: {
        'transcript/2026-08-01.md': { rev: 1, updatedAt: NOW },
      },
      updatedAt: NOW,
    },
  });
  const { tools } = build(api, { tasksClientId });
  const res = await tools.heys_log_meal({
    client: 'Антон', preset: 'Кофе Киндерли', transcript: 'Внеси мне кофе Киндерли.',
  });
  assert.ok(res.structured.transcript_checkpoint, res.text);
  const transcript = api.kv[tasksClientId][tasksLib.keyForPath('transcript/2026-08-01.md')].text;

  assert.match(res.text, /автоматически сохранён в стенограмму/);
  assert.match(transcript, /\*\*Кин:\*\* Внеси мне кофе Киндерли\./);
  assert.match(transcript, /\*\*Claude:\*\* \[Автозапись инструмента\] \[Антон\] Записал:/);
});

/**
 * Дельта-путь стенограммы: тот, что работает в проде. Без него автозапись
 * уходит в полную перезапись файла, и цена round-trip'ов, ради которой всё
 * мерилось, тестами не видна вовсе.
 */
function withDeltaAppend(api) {
  const fileReads = [];
  const getMany = api.getKVManyByCurator;
  const getOne = api.getKVByCurator;
  api.getKVManyByCurator = async (bearer, clientId, keys) => {
    for (const key of keys) if (String(key).includes('transcript')) fileReads.push({ via: 'batch', key });
    return getMany(bearer, clientId, keys);
  };
  api.getKVByCurator = async (bearer, clientId, key) => {
    if (String(key).includes('transcript')) fileReads.push({ via: 'single', key });
    return getOne(bearer, clientId, key);
  };
  api.appendTasksFileByCurator = async (bearer, clientId, spec, contextId) => {
    const key = tasksLib.keyForPath(spec.path);
    const file = tasksLib.ensureFile(api.kv[clientId][key], spec.path);
    if (Number(spec.base_rev) > 0 && Number(file.rev) !== Number(spec.base_rev)) {
      return { ok: false, error: 'stale_rev', current_rev: file.rev };
    }
    const applied = tasksLib.applyDeltaToFile(file, spec.mode, spec.block, NOW);
    api.kv[clientId][key] = applied.file;
    api.kv[clientId][tasksLib.INDEX_KEY] = tasksLib.withIndexEntry(
      tasksLib.ensureIndex(api.kv[clientId][tasksLib.INDEX_KEY]), applied.file, NOW,
    );
    api.writes.push({ path: 'append', clientId, spec, contextId });
    return { ok: true, data: { path: applied.file.path, rev: applied.file.rev, rotated: [] } };
  };
  return fileReads;
}

test('автозапись стенограммы не читает файл дважды и держится на дельта-пути', async () => {
  const tasksClientId = 'cid-tasks';
  const api = fakeCuratorApi({
    tasksClientId,
    tasksIndex: { files: { 'transcript/2026-08-01.md': { rev: 1, updatedAt: NOW } }, updatedAt: NOW },
  });
  api.kv[tasksClientId][tasksLib.keyForPath('transcript/2026-08-01.md')] = {
    path: 'transcript/2026-08-01.md', text: '# 2026-08-01\n', rev: 1, updatedAt: NOW,
  };
  const fileReads = withDeltaAppend(api);
  const { tools } = build(api, { tasksClientId });

  const res = await tools.heys_add_water({ client: 'Антон', ml: 250, transcript: 'Запиши мне 250 мл воды.' });

  // Запись состоялась и подтверждена ревизией: ускорение не должно стоить
  // уверенности в том, что стенограмма легла.
  assert.ok(res.structured.transcript_checkpoint, res.text);
  const transcript = api.kv[tasksClientId][tasksLib.keyForPath('transcript/2026-08-01.md')].text;
  assert.match(transcript, /\*\*Кин:\*\* Запиши мне 250 мл воды\./);
  assert.ok(api.writes.some((w) => w.path === 'append'), 'стенограмма пишется дельтой, а не перезаписью файла');

  // Два чтения: ревизия перед записью и проверка после неё. Третье — то самое
  // предварительное чтение целиком, которое дублировало первое.
  assert.equal(fileReads.length, 2, `лишние чтения стенограммы: ${JSON.stringify(fileReads)}`);
  assert.equal(fileReads.filter((r) => r.via === 'single').length, 0, 'файл целиком перед записью больше не читается');
});

/**
 * Трассировка обращений с началом и концом каждого. Считать только их число
 * мало: правка, ради которой это писалось, число не меняет — она меняет то,
 * ждут ли они друг друга.
 */
function traceCalls(api) {
  const events = [];
  const mark = (phase, key) => events.push(`${phase}:${key}`);
  const wrap = (name, keyOf) => {
    const original = api[name];
    api[name] = async (...args) => {
      const key = keyOf(args);
      mark('start', key);
      try {
        return await original(...args);
      } finally {
        mark('end', key);
      }
    };
  };
  wrap('getKVByCurator', (a) => a[2]);
  wrap('getKVManyByCurator', (a) => a[2].join('+'));
  wrap('issueWriteContext', () => 'write-context');
  events.overlaps = (a, b) => {
    const startA = events.indexOf(`start:${a}`);
    const endB = events.indexOf(`end:${b}`);
    return startA >= 0 && endB >= 0 && startA < endB;
  };
  return events;
}

test('инструкция ведёт коротким путём и не требует разведки перед записью', () => {
  const text = curatorInstructions('Кин', true, NOW);
  const fastPath = text.indexOf('БЫСТРЫЙ ПУТЬ');
  assert.ok(fastPath > 0, 'быстрый путь должен быть в инструкции');
  assert.ok(
    fastPath < text.indexOf('Правила работы с дневником'),
    'быстрый путь должен стоять до подробных правил, иначе модель дойдёт до него после разведки',
  );

  // Главный источник лишнего круга: набор резолвится сервером по имени, и
  // обязательный список перед каждым составным приёмом стоил отдельного
  // обращения впустую.
  assert.ok(
    !/Перед НОВЫМ составным приёмом вызывай heys_list_meal_presets/.test(text),
    'список наборов не должен быть обязательным перед составным приёмом',
  );
  assert.match(text, /передавай его прямо в preset, без heys_list_meal_presets/);

  // Гейт чек-ина проверяет сам сервер (checkin_required из heys_log_meal), и
  // быстрый путь не должен требовать разведочный heys_get_day перед едой —
  // именно этот круг он и убирает.
  assert.match(text, /Гейт чек-ина за сегодня проверяет сам сервер/);
  assert.ok(
    !/За сегодня перед этим нужен heys_get_day/.test(text),
    'предварительный get_day ради гейта больше не требуется — гейт серверный',
  );

  // Инцидент 22.08 (обмен 13:28): гейт уже был серверным, но модель всё равно
  // сделала heys_checkin(action: get) перед записью еды — лишний круг и пауза
  // 116 секунд после него. Отсутствие прямого запрета читалось как разрешение,
  // поэтому запрет теперь стоит явно: и в счётчике вызовов, и в правиле 2а.
  assert.match(text, /heys_checkin с action get перед записью еды не зови вообще/);
  assert.match(text, /Разведочный heys_checkin с action get перед едой запрещён/);
  assert.match(
    text,
    /heys_checkin нужен только чтобы ЗАКРЫТЬ чек-ин: action submit/,
    'heys_checkin остаётся нужен для submit — запрет только на разведку',
  );

  assert.match(
    text,
    /какие продукты.*heys_search_products.*heys_code_\* не зови/s,
    'каталог — search, не code',
  );
  assert.match(text, /items\[\{query, pieces: N\}\]/);
  assert.match(text, /СЧЁТЧИК ВЫЗОВОВ/);
  assert.match(text, /не больше одного раза на каждую отдельную дату/);
});

test('быстрый путь покрывает составную реплику одним log_meal', () => {
  const text = curatorInstructions('Anton', true, Date.UTC(2026, 7, 18), false, '');
  assert.match(text, /copy_meal и items передаются в одном вызове/);
  assert.match(text, /СЧЁТЧИК ВЫЗОВОВ/);
  assert.match(text, /не больше одного раза на каждую отдельную дату/);
  assert.match(text, /heys_update_meal с copy_meal/);
  assert.ok(
    text.indexOf('СЧЁТЧИК ВЫЗОВОВ') < text.indexOf('Правила работы с дневником'),
    'счётчик должен стоять в быстром пути, до подробных правил',
  );
});

test('запись приёма читает день параллельно каталогу, а не после него', async () => {
  const api = fakeCuratorApi();
  const events = traceCalls(api);
  const { tools } = build(api);

  await tools.heys_log_meal({ client: 'Антон', items: [{ query: 'кофе', grams: 200 }] });

  assert.ok(
    events.overlaps('heys_dayv2_2026-08-01', 'heys_products_overlay_v2'),
    `день должен читаться, не дожидаясь каталога: ${events.join(' | ')}`,
  );
  assert.ok(
    events.overlaps('write-context', 'heys_dayv2_2026-08-01'),
    `контекст записи должен греться параллельно чтениям: ${events.join(' | ')}`,
  );
});

test('создание продукта читает tombstones параллельно каталогу', async () => {
  const api = fakeCuratorApi();
  const events = traceCalls(api);
  const { tools } = build(api);

  await tools.heys_create_product({
    client: 'Антон', name: 'Тестовый батончик',
    protein100: 5, simple100: 20, complex100: 10, badFat100: 3, goodFat100: 2,
    trans100: 0, fiber100: 2, gi: 55, harm: 2,
  });

  assert.ok(
    events.overlaps('heys_deleted_ids', 'heys_products_overlay_v2'),
    `tombstones не должны ждать каталог: ${events.join(' | ')}`,
  );
});

test('запись в дневник не начинается без дословной реплики для стенограммы', async () => {
  const tasksClientId = 'cid-tasks';
  const api = fakeCuratorApi({ tasksClientId });
  const { tools } = build(api, { tasksClientId });

  await assert.rejects(
    () => tools.heys_log_meal({ client: 'Антон', preset: 'Кофе Киндерли' }),
    (error) => error.code === 'transcript_required',
  );
  assert.equal(api.writes.length, 0, 'без стенограммы дневник не меняется');
});

test('copy_meal с transcript записывает приём «как вчера»', async () => {
  const tasksClientId = 'cid-tasks';
  const api = fakeCuratorApi({ tasksClientId });
  api.kv['cid-anton']['heys_dayv2_2026-07-31'] = {
    date: '2026-07-31',
    meals: [{ id: 'm_y', name: 'Перекус', time: '10:00', items: [{ product_id: 'own-coffee', grams: 80 }] }],
    updatedAt: 1,
  };
  const { tools } = build(api, { tasksClientId });
  const res = await tools.heys_log_meal({
    client: 'Антон',
    transcript: 'Запиши такой же перекус как вчера',
    copy_meal: { date: 'вчера', meal_id: 'm_y', count: 2 },
  });
  assert.ok(res.structured.meal_id);
  const daySave = api.writes.find((w) => w.key === 'heys_dayv2_2026-08-01');
  assert.ok(daySave, 'дневник записан');
  assert.equal(daySave.value.meals[0].items[0].grams, 160);
});

test('инструкция куратора описывает copy_meal и обязательный transcript', () => {
  const text = curatorInstructions('Антон', true, Date.UTC(2026, 7, 3));
  assert.match(text, /copy_meal/);
  assert.match(text, /item_ids/);
  assert.match(text, /приём целиком|одну позицию/);
  assert.match(text, /2в\./);
  assert.match(text, /transcript/);
});

test('схема записи в дневник требует transcript, когда задачник подключён', () => {
  const schemas = buildCuratorSchemas({ requireTranscript: true });
  const meal = schemas.find((schema) => schema.name === 'heys_log_meal');

  assert.ok(meal.inputSchema.required.includes('transcript'));
  assert.match(meal.inputSchema.properties.transcript.description, /дословная полная реплика/i);
});

// Порядок списка = приоритет: клиент отдаёт модели не все 80 инструментов, и
// хвост до неё может не доехать. 18.08 так потерялись heys_update_day и
// heys_checkin, стоявшие последними: шаги записать было нечем, хотя сервер был
// исправен и вызова не получал. Сверху — ежедневная работа с дневником,
// админские и мессенджер-инструменты уходят в конец.
test('кураторские схемы: дневник сверху, админ-инструменты в конце, параметр client везде, кроме списка клиентов', () => {
  const schemas = buildCuratorSchemas();
  const added = [
    'heys_reply_message', 'heys_mark_message_done', 'heys_get_photo', 'heys_list_messages',
    'heys_get_client_health', 'heys_leads', 'heys_trial_queue', 'heys_manage_subscription',
    'heys_client_access', 'heys_create_client', 'heys_moderate_products', 'heys_list_inbox',
    'heys_list_clients',
  ];
  assert.equal(schemas.length, TOOL_SCHEMAS.length + added.length);
  assert.deepEqual(schemas.slice(-added.length).map((s) => s.name), added);
  assert.deepEqual(
    schemas.slice(0, 7).map((s) => s.name),
    [
      'heys_get_day', 'heys_update_day', 'heys_checkin',
      'heys_log_meal', 'heys_update_meal', 'heys_delete_meal', 'heys_add_water',
    ],
    'ежедневные операции держатся в начале списка',
  );
  for (const schema of schemas) {
    if (CLIENTLESS_TOOLS.has(schema.name)) {
      assert.equal(schema.inputSchema.properties.client, undefined, `${schema.name}: адресат не нужен`);
      continue;
    }
    assert.ok(schema.inputSchema.properties.client, `${schema.name}: есть параметр client`);
  }
});

test('дневниковые инструменты идут раньше задачника и репо', () => {
  const { schemas } = build(fakeCuratorApi({ tasksClientId: 'cid-tasks' }), { tasksClientId: 'cid-tasks' });
  const names = schemas.map((s) => s.name);
  const firstTask = names.findIndex((n) => n.startsWith('tasks_'));
  const lastDiary = names.reduce((acc, n, i) => (n.startsWith('heys_') ? i : acc), -1);
  assert.ok(firstTask > 0, 'задачник подключён');
  assert.ok(firstTask > names.indexOf('heys_log_meal'), 'еда важнее задачника');
  assert.equal(names[0], 'heys_get_day');
  assert.ok(lastDiary >= 0);
});

test('истёкшая кураторская сессия даёт понятную ошибку, а не 500', async () => {
  const api = fakeCuratorApi();
  api.listClients = async () => ({ data: null, error: { message: 'rpc_http_401', status: 401 } });
  const { tools } = build(api);
  await assert.rejects(() => tools.heys_get_day({ client: 'Антон' }), (e) => {
    assert.equal(e.code, 'curator_session_expired');
    assert.match(e.message, /подключи коннектор/);
    return true;
  });
});

// ── OAuth: кураторская роль в токенах ────────────────────────────────────

function pkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url') };
}

function curatorTokens({ nowMs = NOW } = {}) {
  const reg = oauth.registerClient({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }, SECRET, nowMs);
  const { verifier, challenge } = pkce();
  const code = oauth.issueAuthorizationCode({
    clientId: reg.registration.client_id,
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    codeChallenge: challenge,
    heysClientId: 'curator-1',
    sessionToken: JWT,
    role: 'curator',
    subjectName: 'Кин',
    email: 'kin@heyslab.ru',
  }, SECRET, nowMs);
  const exchanged = oauth.exchangeAuthorizationCode({
    code,
    client_id: reg.registration.client_id,
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    code_verifier: verifier,
  }, SECRET, nowMs);
  return { exchanged, clientId: reg.registration.client_id };
}

test('кураторская роль и имя проходят через код в access-токен', () => {
  const { exchanged } = curatorTokens();
  assert.equal(exchanged.ok, true);
  const auth = oauth.authenticateAccessToken(`Bearer ${exchanged.tokens.access_token}`, SECRET, NOW);
  assert.equal(auth.role, 'curator');
  assert.equal(auth.subjectName, 'Кин');
  assert.equal(auth.clientId, 'curator-1');
  assert.equal(auth.sessionToken, JWT);
});

test('клиентские токены остаются клиентскими, старые (без роли) — тоже', () => {
  const legacy = tokens.signToken(
    { sub: 'c1', cid: 'x', st: tokens.encryptSecret('session', SECRET), aud: '' },
    SECRET, { typ: 'heys-mcp-access', ttlSeconds: 600, nowMs: NOW },
  );
  const auth = oauth.authenticateAccessToken(`Bearer ${legacy}`, SECRET, NOW);
  assert.equal(auth.ok, true);
  assert.equal(auth.role, 'client');
});

/** SEC-031: сервер подтвердил, что куратор активен. */
const curatorActive = async () => ({ ok: true });

test('refresh перевыпускает кураторский JWT, совместимый с verifyJwt из heys-api-rpc', async () => {
  const { exchanged, clientId } = curatorTokens();
  const later = NOW + 3600 * 1000;
  const refreshed = await oauth.exchangeRefreshToken(
    { refresh_token: exchanged.tokens.refresh_token, client_id: clientId },
    SECRET, later, { rawJwtSecret: RAW_JWT_SECRET, verifyCurator: curatorActive },
  );
  assert.equal(refreshed.ok, true);
  const auth = oauth.authenticateAccessToken(`Bearer ${refreshed.tokens.access_token}`, SECRET, later);
  assert.equal(auth.role, 'curator');
  assert.notEqual(auth.sessionToken, JWT, 'внутри лежит новый JWT, а не старый');

  // Новый JWT — стандартный HS256 на сыром секрете, ровно как у heys-api-auth.
  const verified = tokens.verifyRawJwt(auth.sessionToken, RAW_JWT_SECRET, { nowMs: later });
  assert.equal(verified.ok, true);
  assert.equal(verified.claims.role, 'curator');
  assert.equal(verified.claims.sub, 'curator-1');
  assert.equal(verified.claims.email, 'kin@heyslab.ru');
  assert.ok(verified.claims.exp * 1000 > later + 23 * 3600 * 1000, 'срок нового JWT ~24 часа');
});

// SEC-031: поведение изменено намеренно. Раньше без rawJwtSecret кураторский
// refresh проходил и протаскивал ПРЕЖНИЙ JWT — а он живёт 24 часа, то есть к
// моменту продления обычно уже мёртв: инструменты всё равно не работали, но
// пара токенов выдавалась как валидная. Теперь это явный отказ.
test('refresh без rawJwtSecret отклоняется, а не выдаёт мёртвую сессию', async () => {
  const { exchanged, clientId } = curatorTokens();
  const refreshed = await oauth.exchangeRefreshToken(
    { refresh_token: exchanged.tokens.refresh_token, client_id: clientId },
    SECRET, NOW + 1000, { verifyCurator: curatorActive },
  );
  assert.equal(refreshed.ok, false);
  assert.equal(refreshed.error, 'invalid_grant');
});

test('SEC-031: refresh не продлевает доступ, если сервер не подтвердил куратора', async () => {
  const { exchanged, clientId } = curatorTokens();
  const refreshed = await oauth.exchangeRefreshToken(
    { refresh_token: exchanged.tokens.refresh_token, client_id: clientId },
    SECRET, NOW + 1000,
    { rawJwtSecret: RAW_JWT_SECRET, verifyCurator: async () => ({ ok: false, error: 'curator_inactive' }) },
  );
  assert.equal(refreshed.ok, false);
  assert.equal(refreshed.error, 'invalid_grant');
});

test('SEC-031: недоступность сервера тоже отказ (fail-closed)', async () => {
  const { exchanged, clientId } = curatorTokens();
  const refreshed = await oauth.exchangeRefreshToken(
    { refresh_token: exchanged.tokens.refresh_token, client_id: clientId },
    SECRET, NOW + 1000,
    { rawJwtSecret: RAW_JWT_SECRET, verifyCurator: async () => { throw new Error('network'); } },
  ).catch((e) => ({ ok: false, error: 'invalid_grant', thrown: e }));
  assert.equal(refreshed.ok, false);
});

test('SEC-031: без verifyCurator кураторский refresh не проходит', async () => {
  const { exchanged, clientId } = curatorTokens();
  const refreshed = await oauth.exchangeRefreshToken(
    { refresh_token: exchanged.tokens.refresh_token, client_id: clientId },
    SECRET, NOW + 1000, { rawJwtSecret: RAW_JWT_SECRET },
  );
  assert.equal(refreshed.ok, false);
});

test('SEC-031: client_id обязателен в refresh-гранте', async () => {
  const { exchanged } = curatorTokens();
  const refreshed = await oauth.exchangeRefreshToken(
    { refresh_token: exchanged.tokens.refresh_token },
    SECRET, NOW + 1000, { rawJwtSecret: RAW_JWT_SECRET, verifyCurator: curatorActive },
  );
  assert.equal(refreshed.ok, false);
  assert.equal(refreshed.error, 'invalid_client');
});

test('клиентский refresh не трогает client-session даже при наличии rawJwtSecret', async () => {
  const reg = oauth.registerClient({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }, SECRET, NOW);
  const { verifier, challenge } = pkce();
  const code = oauth.issueAuthorizationCode({
    clientId: reg.registration.client_id,
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    codeChallenge: challenge,
    heysClientId: 'client-1',
    sessionToken: 'client-session-token',
    role: 'client',
  }, SECRET, NOW);
  const pair = oauth.exchangeAuthorizationCode({
    code, client_id: reg.registration.client_id,
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_verifier: verifier,
  }, SECRET, NOW);
  const refreshed = await oauth.exchangeRefreshToken(
    { refresh_token: pair.tokens.refresh_token, client_id: reg.registration.client_id },
    SECRET, NOW + 1000, { rawJwtSecret: RAW_JWT_SECRET },
  );
  const auth = oauth.authenticateAccessToken(`Bearer ${refreshed.tokens.access_token}`, SECRET, NOW + 1000);
  assert.equal(auth.role, 'client');
  assert.equal(auth.sessionToken, 'client-session-token');
});

// ── MCP-слой: кураторский контекст ───────────────────────────────────────

test('initialize отдаёт кураторские инструкции, tools/list — кураторские схемы', async () => {
  const { tools, schemas, instructions } = build(fakeCuratorApi());
  const ctx = { tools, toolSchemas: schemas, instructions };

  const init = await mcp.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, ctx);
  assert.match(init.result.instructions, /КРИТИЧЕСКОЕ ПРАВИЛО/);
  assert.match(init.result.instructions, /heys_list_clients/);

  const list = await mcp.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx);
  assert.equal(list.result.tools.length, TOOL_SCHEMAS.length + 13);
});

test('client_required доходит до модели как isError со списком клиентов', async () => {
  const { tools } = build(fakeCuratorApi());
  const res = await mcp.handleMessage(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'heys_add_water', arguments: { ml: 100 } } },
    { tools },
  );
  assert.equal(res.result.isError, true);
  assert.equal(res.result.structuredContent.error, 'client_required');
  assert.equal(res.result.structuredContent.clients.length, 2);
  assert.match(res.result.content[0].text, /Клиенты:/);
  assert.match(res.result.content[0].text, /cid-/);
});

// ── Форма входа ──────────────────────────────────────────────────────────

test('страница входа — только кураторская форма, email экранируется', () => {
  const req = { clientId: 'c', redirectUri: 'https://x/cb', state: 's', codeChallenge: 'cc', resource: '', clientName: 'Claude' };
  const page = oauth.renderLoginPage(req);
  assert.equal((page.match(/<form/g) || []).length, 1);
  assert.equal(page.includes('name="phone"'), false);
  assert.equal(page.includes('name="pin"'), false);
  assert.match(page, /name="mfa_code"/);
  const escapedPage = oauth.renderLoginPage(req, { email: '<img src=x>' });
  assert.equal(escapedPage.includes('<img src=x>'), false);
});

// ── Деградация общей базы продуктов ──────────────────────────────────────
// Инцидент 2026-08-01: поиск «миндаль» у клиента вернул пусто, хотя продукт
// есть. Причина — сбой загрузки shared_products: все Type A строки (у клиента
// это подавляющее большинство) молча выпали из каталога, и модель была готова
// завести дубликат уже существующего продукта.

const { createTools } = require('../lib/tools');

function apiWithShared(sharedResult) {
  return {
    stats: { calls: 0, ms: 0 },
    async getKV(_s, key) {
      if (key === 'heys_products_overlay_v2') {
        return {
          data: [
            { id: 'own-almond', shared_origin_id: 's-almond', overrides: {}, in_my_list: true },
            { id: 'own-custom', _custom: true, name: 'Домашний батончик', protein100: 10, carbs100: 40, fat100: 20, in_my_list: true },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    },
    async getSharedProducts() { return sharedResult; },
    async mergeSaveKV() { return { ok: true }; },
    async upsertKV() { return { ok: true }; },
  };
}

test('сбой общей базы не превращается в «продукт не найден»', async () => {
  const { tools } = createTools({
    api: apiWithShared({ data: null, error: { message: 'rest_http_502' } }),
    sessionToken: 's', clientId: 'c', nowMs: NOW,
  });
  await assert.rejects(
    () => tools.heys_search_products({ query: 'миндаль' }),
    (e) => {
      assert.equal(e.code, 'upstream_error');
      assert.match(e.message, /общую базу/);
      return true;
    },
  );
});

test('пустой ответ общей базы при наличии связанных продуктов — тоже сбой', async () => {
  const { tools } = createTools({
    api: apiWithShared({ data: [], error: null }),
    sessionToken: 's', clientId: 'c', nowMs: NOW,
  });
  await assert.rejects(
    () => tools.heys_search_products({ query: 'миндаль' }),
    (e) => {
      assert.equal(e.code, 'shared_catalog_unavailable');
      // Модель должна понять, что дубликат заводить нельзя.
      assert.match(e.message, /заводить продукт заново не нужно/);
      return true;
    },
  );
});

test('клиент без связанных продуктов работает и с пустой общей базой', async () => {
  const api = apiWithShared({ data: [], error: null });
  const originalGetKV = api.getKV;
  api.getKV = async (s, key) => (key === 'heys_products_overlay_v2'
    ? { data: [{ id: 'own-custom', _custom: true, name: 'Домашний батончик', protein100: 10, carbs100: 40, fat100: 20, in_my_list: true }], error: null }
    : originalGetKV(s, key));
  const { tools } = createTools({ api, sessionToken: 's', clientId: 'c', nowMs: NOW });
  const res = await tools.heys_search_products({ query: 'батончик' });
  assert.equal(res.structured.results.length, 1);
});


// ── Просьбы из мессенджера ────────────────────────────────────────────────
// Клиент пишет «добавь протеин» — ассистент читает, вносит, помечает
// обработанным. Повторное чтение переписки не должно вносить ту же еду дважды.

function apiWithMessages(thread) {
  const api = fakeCuratorApi();
  api.doneCalls = [];
  api.sent = [];
  api.getMessagesThread = async (bearer, clientId, opts) => {
    assert.equal(bearer, JWT);
    api.lastThread = { clientId, opts };
    return { data: { messages: thread }, error: null };
  };
  api.setMessageDone = async (bearer, messageId, state) => {
    api.doneCalls.push({ messageId, state });
    return { data: { success: true }, error: null };
  };
  api.sendMessageToClient = async (bearer, clientId, text) => {
    api.sent.push({ clientId, text });
    return { data: { success: true }, error: null };
  };
  return api;
}

const THREAD = [
  { id: 'msg-1', body: 'Добавь протеин 30 г, выпила в 21:15', created_at: '2026-08-01T18:15:00Z', sender: 'client', is_done: false },
  { id: 'msg-2', body: 'Приняла, спасибо', created_at: '2026-08-01T18:20:00Z', sender: 'curator', is_done: false },
  { id: 'msg-3', body: 'И ещё банан', created_at: '2026-08-01T18:30:00Z', sender: 'client', is_done: true },
];

test('переписка читается адресно и нормализуется', async () => {
  const api = apiWithMessages(THREAD);
  const { tools } = build(api);
  const res = await tools.heys_list_messages({ client: 'Александра' });

  assert.equal(api.lastThread.clientId, 'cid-alexandra');
  assert.match(res.text, /^\[Александра\]/);
  const first = res.structured.messages[0];
  assert.equal(first.message_id, 'msg-1');
  assert.match(first.text, /протеин 30 г/);
  assert.equal(first.from_client, true);
  assert.equal(first.done, false);
  // Ответ куратора клиентским сообщением не считается.
  assert.equal(res.structured.messages[1].from_client, false);
  // Необработанных от клиента ровно одно: msg-3 уже помечено.
  assert.match(res.text, /необработанных от клиента: 1/);
});

test('время сообщения показывается в московской зоне', async () => {
  const { tools } = build(apiWithMessages(THREAD));
  const res = await tools.heys_list_messages({ client: 'Александра' });
  // 18:15 UTC = 21:15 МСК — то самое время, которое назвала клиентка.
  assert.match(res.structured.messages[0].sent_local, /21:15/);
});

test('пометка обработанным адресна и требует id', async () => {
  const api = apiWithMessages(THREAD);
  const { tools } = build(api);
  await tools.heys_mark_message_done({ client: 'Александра', message_id: 'msg-1' });
  assert.deepEqual(api.doneCalls, [{ messageId: 'msg-1', state: true }]);
  await assert.rejects(() => tools.heys_mark_message_done({ client: 'Александра' }), (e) => e.code === 'invalid_message_id');
});

test('ответ клиенту уходит выбранному клиенту', async () => {
  const api = apiWithMessages(THREAD);
  const { tools } = build(api);
  await tools.heys_reply_message({ client: 'Александра', text: 'Внёс 30 г на 21:15' });
  assert.equal(api.sent[0].clientId, 'cid-alexandra');
  assert.match(api.sent[0].text, /21:15/);
  await assert.rejects(() => tools.heys_reply_message({ client: 'Александра', text: '  ' }), (e) => e.code === 'invalid_text');
});

test('чтение переписки без указания клиента не угадывает адресата', async () => {
  const { tools } = build(apiWithMessages(THREAD));
  await assert.rejects(() => tools.heys_list_messages({}), (e) => e.code === 'client_required');
});

test('правила мессенджера доехали до инструкций', () => {
  const { instructions } = build(apiWithMessages(THREAD));
  assert.match(instructions, /Если клиент время НЕ назвал — спроси куратора/);
  assert.match(instructions, /Граммовку бери ровно ту, что назвал клиент/);
  assert.match(instructions, /heys_reply_message/);
});

// ── Входящие по всем клиентам ─────────────────────────────────────────────
// Счётчики приходят по client_id: без подписей куратор увидел бы «3
// непрочитанных у cid-…» и не понял бы, к кому идти.

test('inbox подписывает клиентов именами и считает ждущих ответа', async () => {
  const api = fakeCuratorApi();
  api.getMessagesInbox = async (bearer) => {
    assert.equal(bearer, JWT);
    return {
      data: {
        inbox: [
          {
            client_id: 'cid-alexandra',
            unread_count: 2,
            last_message_at: '2026-08-01T18:30:00Z',
            last_message_preview: { body: 'И ещё банан', sender_role: 'client' },
          },
          {
            client_id: 'cid-anton',
            unread_count: 0,
            last_message_at: '2026-07-30T10:00:00Z',
            last_message_preview: { body: 'Ок, спасибо', sender_role: 'curator' },
          },
        ],
      },
      error: null,
    };
  };
  const { tools } = build(api);
  const res = await tools.heys_list_inbox({});

  assert.equal(res.structured.total_unread, 2);
  assert.equal(res.structured.threads[0].name, 'Александра');
  assert.equal(res.structured.threads[0].last_message_from_client, true);
  assert.equal(res.structured.threads[1].last_message_from_client, false);
  assert.match(res.text, /Александра — 2/);
  assert.equal(/Антон/.test(res.text), false, 'клиенты без непрочитанных не шумят в ответе');
});

test('inbox без непрочитанных отвечает прямо, а не пустым списком', async () => {
  const api = fakeCuratorApi();
  api.getMessagesInbox = async () => ({ data: { inbox: [] }, error: null });
  const { tools } = build(api);
  const res = await tools.heys_list_inbox({});
  assert.match(res.text, /Необработанных сообщений нет/);
});

// ── Карточка клиента и период кураторским путём ───────────────────────────

test('период читается пакетно и только по ключам выбранного клиента', async () => {
  const api = fakeCuratorApi();
  const { tools } = build(api);
  const res = await tools.heys_get_period({ client: 'Антон', days: 3 });

  assert.equal(api.batchReads.length, 1, 'период — один запрос, сколько бы дней в нём ни было');
  assert.equal(api.batchReads[0].clientId, 'cid-anton');
  assert.deepEqual(api.batchReads[0].keys, [
    // Четыре дня до периода: из них считается окно долга для нормы первого дня.
    'heys_dayv2_2026-07-26', 'heys_dayv2_2026-07-27', 'heys_dayv2_2026-07-28', 'heys_dayv2_2026-07-29',
    'heys_dayv2_2026-07-30', 'heys_dayv2_2026-07-31', 'heys_dayv2_2026-08-01',
    'heys_profile', 'heys_norms', 'heys_hr_zones',
  ]);
  assert.match(res.text, /^\[Антон\]/);
  assert.equal(res.structured.client.client_id, 'cid-anton');
});

test('правка профиля уходит адресно, merge-ом и с write-context', async () => {
  const api = fakeCuratorApi();
  const { tools } = build(api);
  const res = await tools.heys_update_profile({ client: 'Александра', weight_goal: 55 });

  const write = api.writes.find((w) => w.key === 'heys_profile');
  assert.equal(write.clientId, 'cid-alexandra');
  assert.equal(write.path, 'merge', 'профиль — mergeable-ключ приложения');
  assert.equal(write.contextId, 'ctx-cid-alexandra');
  assert.equal(write.value.weightGoal, 55);
  assert.match(res.text, /^\[Александра\]/);
});

test('правила карточки клиента доехали до инструкций', () => {
  const { instructions } = build(fakeCuratorApi());
  assert.match(instructions, /heys_get_profile/);
  assert.match(instructions, /heys_update_norms/);
  assert.match(instructions, /heys_list_inbox/);
});

// ── Фото из переписки ────────────────────────────────────────────────────
// Ссылку модель открыть не может, поэтому фото возвращается изображением.
// Без этого «клиент прислал фото» упиралось в просьбу пересказать снимок.

function apiWithPhoto(overrides = {}) {
  const api = fakeCuratorApi();
  api.reads = [];
  api.readAttachment = async (bearer, path) => {
    assert.equal(bearer, JWT);
    api.reads.push(path);
    if (overrides.fail) return { ok: false, error: overrides.fail };
    return { ok: true, data: 'QUJD', mimeType: 'image/jpeg', bytes: 102400 };
  };
  return api;
}

test('фото отдаётся изображением, а не ссылкой, и адресно', async () => {
  const api = apiWithPhoto();
  const { tools } = build(api);
  const res = await tools.heys_get_photo({ client: 'Александра', path: 'cid-alexandra/2026-08-01/messenger/a1.jpg' });

  assert.deepEqual(api.reads, ['cid-alexandra/2026-08-01/messenger/a1.jpg']);
  assert.equal(res.images.length, 1);
  assert.equal(res.images[0].data, 'QUJD');
  assert.equal(res.images[0].mimeType, 'image/jpeg');
  assert.match(res.text, /^\[Александра\]/);
  assert.equal(res.structured.bytes, 102400);
});

test('картинка доезжает до модели отдельным блоком content', async () => {
  const { tools } = build(apiWithPhoto());
  const res = await mcp.handleMessage({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'heys_get_photo', arguments: { client: 'Александра', path: 'cid-alexandra/x/messenger/a1.jpg' } },
  }, { tools });

  const content = res.result.content;
  assert.equal(content[0].type, 'text');
  assert.equal(content[1].type, 'image');
  assert.equal(content[1].mimeType, 'image/jpeg');
  assert.equal(content[1].data, 'QUJD');
});

test('отказы по вложению объясняются по-человечески', async () => {
  const { tools } = build(apiWithPhoto({ fail: 'attachment_not_found' }));
  await assert.rejects(() => tools.heys_get_photo({ client: 'Александра', path: 'cid-alexandra/x/messenger/a1.jpg' }), (e) => {
    assert.equal(e.code, 'photo_unavailable');
    assert.match(e.message, /сообщение удалили/);
    return true;
  });
  await assert.rejects(() => tools.heys_get_photo({ client: 'Александра' }), (e) => e.code === 'invalid_path');
});

test('вложения сообщения отдаются с путями — по ним и открывается фото', async () => {
  const api = fakeCuratorApi();
  api.getMessagesThread = async () => ({
    data: {
      messages: [{
        id: 'm1',
        body: 'в 16:40 забить надо 500мл',
        created_at: '2026-08-01T13:40:00Z',
        sender: 'client',
        attachments: [{ type: 'image', path: 'cid-alexandra/2026-08-01/messenger/a1.jpg', mime: 'image/jpeg' }],
      }],
    },
    error: null,
  });
  const { tools } = build(api);
  const res = await tools.heys_list_messages({ client: 'Александра' });
  const [message] = res.structured.messages;
  assert.equal(message.has_attachment, true);
  assert.equal(message.attachments[0].path, 'cid-alexandra/2026-08-01/messenger/a1.jpg');
  assert.equal(message.attachments[0].kind, 'image');
  assert.match(res.text, /фото: cid-alexandra\/2026-08-01\/messenger\/a1\.jpg/);
  assert.match(res.text, /heys_get_photo/);
  assert.match(res.text, /m1/);
});

test('правило про фото доехало до инструкций', () => {
  const { instructions } = build(fakeCuratorApi());
  assert.match(instructions, /heys_get_photo/);
  assert.match(instructions, /Не листай ими весь тред/);
  assert.match(instructions, /не спрашивай «что на фото»|не спрашивай .что на фото./i);
});

// ── Публикация нового продукта в общую базу ──────────────────────────────
// Куратор владеет общим каталогом, поэтому промышленная карточка попадает
// туда сразу. Домашнее блюдо — нет: у него уникальный состав, дедупликация
// его не отсечёт, и каталог замусорится чужими рецептами.

const CARD = {
  name: 'Творог 5%', protein100: 16, simple100: 3, complex100: 0,
  badFat100: 3, goodFat100: 2, trans100: 0, fiber100: 0, gi: 30, harm: 2,
};

function apiWithPublish(result = { ok: true, data: { id: 'sp-1' } }) {
  const api = fakeCuratorApi();
  api.published = [];
  api.publishSharedProduct = async (bearer, curatorId, payload) => {
    assert.equal(bearer, JWT);
    api.published.push({ curatorId, payload });
    return result;
  };
  return api;
}

function buildWithCurator(api) {
  return createCuratorContext({ api, curatorJwt: JWT, curatorId: 'cur-1', curatorName: 'Кин', nowMs: NOW });
}

test('продукт с брендом уезжает в общую базу с отпечатком', async () => {
  const api = apiWithPublish();
  const { tools } = buildWithCurator(api);
  const res = await tools.heys_create_product({ client: 'Антон', ...CARD, brand: 'Простоквашино' });

  assert.equal(api.published.length, 1);
  const { curatorId, payload } = api.published[0];
  assert.equal(curatorId, 'cur-1');
  assert.equal(payload.name, 'Творог 5%');
  assert.equal(payload.fingerprint, products.computeProductFingerprint(payload));
  assert.match(payload.fingerprint, /^[a-f0-9]{64}$/, 'отпечаток — sha256, как в приложении');
  assert.ok(payload.brand_fingerprint, 'у брендового продукта есть и брендовый отпечаток');
  assert.equal(res.structured.shared, true);
  assert.match(res.text, /Опубликовал и в общую базу/);
});

test('домашнее блюдо остаётся только у клиента', async () => {
  const api = apiWithPublish();
  const { tools } = buildWithCurator(api);
  const res = await tools.heys_create_product({ client: 'Антон', ...CARD, name: 'Торт мамин' });

  assert.equal(api.published.length, 0);
  assert.equal(res.structured.shared, false);
  assert.match(res.text, /похоже на домашнее блюдо/);
});

test('решение куратора сильнее правила — в обе стороны', async () => {
  const api = apiWithPublish();
  const { tools } = buildWithCurator(api);

  await tools.heys_create_product({ client: 'Антон', ...CARD, name: 'Торт мамин', share: true });
  assert.equal(api.published.length, 1, 'явное share:true публикует и домашнее');

  const res = await tools.heys_create_product({ client: 'Антон', ...CARD, name: 'Творог 9%', brand: 'Домик', share: false });
  assert.equal(api.published.length, 1, 'явное share:false оставляет промышленное у клиента');
  assert.match(res.text, /по твоему решению/);
});

test('дубликат общей базы не ломает создание карточки', async () => {
  const api = apiWithPublish({ ok: false, duplicate: true, error: 'duplicate_fingerprint' });
  const { tools } = buildWithCurator(api);
  const res = await tools.heys_create_product({ client: 'Антон', ...CARD, brand: 'Простоквашино' });

  assert.equal(res.structured.product_id !== undefined, true, 'личная карточка всё равно создана');
  assert.equal(res.structured.shared, false);
  assert.match(res.text, /уже есть/);
});

test('сбой публикации виден куратору, но карточку не откатывает', async () => {
  const api = apiWithPublish({ ok: false, error: 'rpc_http_500' });
  const { tools } = buildWithCurator(api);
  const res = await tools.heys_create_product({ client: 'Антон', ...CARD, barcode: '4600000000012' });

  assert.equal(res.structured.shared, false);
  assert.match(res.text, /в общую базу не уехал/);
});

test('параметр share есть только в кураторской схеме', () => {
  const curatorSchema = buildCuratorSchemas().find((s) => s.name === 'heys_create_product');
  const clientSchema = TOOL_SCHEMAS.find((s) => s.name === 'heys_create_product');
  assert.ok(curatorSchema.inputSchema.properties.share);
  assert.equal(clientSchema.inputSchema.properties.share, undefined, 'у клиента прав на общий каталог нет');
});

// ── Исправление ошибочной публикации ─────────────────────────────────────
// Удаления из общего каталога нет ни в приложении, ни здесь: строку могли уже
// записать в приёмы у других клиентов. Blocklist убирает из выдачи обратимо.

test('ошибочно опубликованный продукт убирается из выдачи и возвращается', async () => {
  const api = fakeCuratorApi();
  api.hidden = [];
  api.setSharedProductHidden = async (bearer, curatorId, productId, hidden) => {
    assert.equal(bearer, JWT);
    api.hidden.push({ curatorId, productId, hidden });
    return { ok: true };
  };
  const { tools } = createCuratorContext({ api, curatorJwt: JWT, curatorId: 'cur-1', nowMs: NOW });

  const hide = await tools.heys_moderate_products({ product_id: 'sp-9', action: 'hide' });
  assert.deepEqual(api.hidden[0], { curatorId: 'cur-1', productId: 'sp-9', hidden: true });
  assert.equal(hide.structured.hidden, true);
  assert.match(hide.text, /Из базы он не удалён/);

  await tools.heys_moderate_products({ product_id: 'sp-9', action: 'unhide' });
  assert.equal(api.hidden[1].hidden, false);
});

test('для продукта общей базы допустимы только hide и unhide', async () => {
  const api = fakeCuratorApi();
  api.setSharedProductHidden = async () => ({ ok: true });
  const { tools } = createCuratorContext({ api, curatorJwt: JWT, curatorId: 'cur-1', nowMs: NOW });
  await assert.rejects(
    () => tools.heys_moderate_products({ product_id: 'sp-9', action: 'approve' }),
    (e) => e.code === 'invalid_action',
  );
});

test('правило про объём фото доехало до инструкций', () => {
  const { instructions } = build(fakeCuratorApi());
  assert.match(instructions, /не больше четырёх подряд/);
  assert.match(instructions, /action hide/);
});

// ── Правила задачника: что срезано, а что обязано выжить ─────────────────
//
// 2026-08-03 из правил убрали предписанный порядок действий: слепой
// эксперимент показал, что процедура сужает обзор и ответы получаются хуже.
// Эксперимент судил только сбор и подачу — на десяти вопросах, ни один из
// которых ничего не записывал. Поэтому правила про полномочия, форматы записи
// и границы инструментов резать было не на чем, и эти тесты стоят затем,
// чтобы следующая «чистка» не унесла их заодно.

const TASKS_RULES = () => curatorInstructions('Антон', true, Date.UTC(2026, 7, 3))
  .split('\n')
  .filter((line) => /^З\d+\./.test(line));

/**
 * Второе место, где живут правила, — описания самих инструментов. 2026-08-03
 * тринадцать правил вырезали из блока именно потому, что схемы говорили то же
 * самое; проверять их теперь надо там, иначе удаление дубля не отличить от
 * потери требования.
 */
const tasksTools = require('../lib/tasks-tools');
const TASKS_SCHEMAS = [
  ...tasksTools.TASKS_TOOL_SCHEMAS, ...tasksTools.TASKS_WRITE_SCHEMAS,
  ...tasksTools.TASKS_BOARD_SCHEMAS, ...tasksTools.TASKS_AGENT_SCHEMAS,
];

/** Описание инструмента вместе с описаниями его аргументов — одним текстом. */
function toolText(name) {
  const schema = TASKS_SCHEMAS.find((s) => s.name === name);
  assert.ok(schema, `инструмента ${name} нет в схемах`);
  const args = Object.values(schema.inputSchema.properties || {}).map((p) => p.description || '');
  return [schema.description, ...args].join('\n');
}

test('правила задачника пронумерованы подряд и без пропусков', () => {
  const numbers = TASKS_RULES().map((line) => Number(/^З(\d+)\./.exec(line)[1]));
  assert.ok(numbers.length >= 21, 'правил не стало меньше, чем было');
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1));
});

test('отклонённая чужой правкой запись не считается сделанной', () => {
  // Ищем по смыслу, а не по номеру: правило переедет, а требование останется.
  const rule = TASKS_RULES().find((line) => /stale_write_blocked/.test(line));
  assert.ok(rule, 'правило про отклонённую из-за чужой правки запись есть');
  assert.match(rule, /НЕ сохранено/, 'сказано прямо: изменения нет');
  assert.match(rule, /Сделанным это не считай/);
  assert.match(rule, /tasks_read/, 'сказано, чем перечитывать');
  assert.match(rule, /повтори ту же операцию на свежем тексте/);
});

test('полномочия остались дословно — их эксперимент не проверял', () => {
  const rules = TASKS_RULES().join('\n');
  // Галочки: агент закрывает свою сдачу сам; сомнение — вопрос; день — только он.
  assert.match(rules, /Галочку на задаче или подпункте ставишь сам/);
  assert.match(rules, /Не уверен — спроси/);
  assert.match(rules, /Не оставляй «осталась галочка за ним»/);
  // Деньги: зона «спрашивай, а не действуй» описана у самого инструмента,
  // запрет на его файлы — в блоке. Разнесено намеренно: запрет читается до
  // выбора инструмента, механика — при вызове.
  assert.match(toolText('tasks_money'), /движение лимитов[\s\S]*через него/);
  assert.match(rules, /В money\/budget\.md и GOALS\.md не пиши ничего/);
  // Наружу — ничего без его слова.
  assert.match(rules, /галочка и оценка дня — его слова, не твой вывод/);
});

test('форматы записи и границы инструментов остались — на них держатся данные', () => {
  const rules = TASKS_RULES().join('\n');
  // Формат: строка операции, слот против задачи, адрес задачи, потолок доски.
  assert.match(rules, /tasks_money/);
  assert.match(rules, /добавь строку-поправку, задним числом не правь/);
  assert.match(rules, /Событие галочкой не закрывается/);
  assert.match(rules, /У доски развилок есть потолок/);        // само число живёт в схеме, рядом с OPEN_DECISIONS_CAP
  assert.match(toolText('tasks_decision'), new RegExp(`${tasksLib.OPEN_DECISIONS_CAP} нерешённых развилок`));
  // Границы: что инструмент физически не умеет — это факт, а не указание.
  // Обе границы описаны у самих инструментов, из блока дубли вырезаны.
  assert.match(toolText('tasks_context'), /Пересечения по времени он не видит вовсе/);
  assert.match(rules, /tasks_link связывает только две задачи проектов/);
  assert.match(toolText('tasks_link'), /поиском они друг друга не находят/);
  // Целостность: снятый слот обязан исчезнуть из дня.
  assert.match(rules, /tasks_unslot/);
  assert.match(rules, /загруженность дальше считает день занятым/);
});

test('предписанного порядка действий в правилах больше нет', () => {
  const rules = TASKS_RULES().join('\n');
  assert.doesNotMatch(rules, /Порядок входа один на все случаи/);
  assert.doesNotMatch(rules, /Прежде чем что-то ответить, собери три контекста/);
  assert.doesNotMatch(rules, /и только потом/);
  // Инструменты никуда не делись — исчезло только предписание, чем и в каком
  // порядке их звать.
  for (const tool of ['tasks_delta', 'tasks_list', 'tasks_context', 'tasks_calendar', 'tasks_budget', 'tasks_focus']) {
    assert.match(rules, new RegExp(tool), `${tool} остался в описи инструментов`);
  }
  // tasks_review из блока убран как дубль: когда его звать, сказано в нём самом.
  assert.match(toolText('tasks_review'), /Вызывай на ритуалах и на «что нового»/);
  assert.match(rules, /решаешь ты/);
});

test('правило про цифры на месте — на нём провалились оба варианта', () => {
  const rules = TASKS_RULES().join('\n');
  const numbers = TASKS_RULES().find((line) => /цифра/.test(line));
  assert.ok(numbers, 'правило про цифры есть');
  assert.match(numbers, /пересчитай/);
  assert.match(numbers, /скажи это отдельной фразой/);
  assert.ok(rules.includes(numbers));
});

test('запрет на чужие файлы назван и в правилах, и в коде — одними и теми же файлами', () => {
  const rules = TASKS_RULES().join('\n');
  for (const path of tasksLib.OWNER_ONLY_FILES) {
    assert.ok(rules.includes(path), `${path} назван в правилах, а не только в коде`);
  }
});

// ── Правила, переехавшие из CLAUDE.md задачника ───────────────────────────
//
// Одно и то же правило лежало в трёх местах и разъехалось: «мне = Полтавский»
// оказалось в памяти Claude, в /areas/heys.md и в docs/preferences.md, причём
// дополнение про жену легло только в последнее. А то, что обязано действовать
// всегда, жило в файле, который агент читать не обязан, — так стенограмма
// молча не писалась сутки.
//
// Тесты ищут правило по смыслу, а не по номеру: нумерация сплошная, и от
// вставки одной строки все номера ниже уезжают.

const RULE = (pred) => TASKS_RULES().find(pred);

test('время берётся по Москве, а не с часов агента', () => {
  const rule = RULE((l) => /МСК|Москв/.test(l) && /сегодня/i.test(l));
  assert.ok(rule, 'правила молчат о часовом поясе — дата уедет в файл дня молча');
  assert.match(rule, /часы|часов/i, 'сказано именно про собственные часы агента');
  assert.match(rule, /не подставляй|не ставь наугад/, 'запрет поставлен, а не описан');
  assert.match(rule, /файл дня|на сутки/, 'названа цена ошибки');
});

test('дорога между делами закладывается агентом — в коде её нет', () => {
  // `\b` с кириллицей не работает — она не \w, поэтому отсекаем «дорого» из
  // правила про деньги вторым условием, а не границей слова.
  const rule = RULE((l) => /дорог[ауи]/i.test(l) && /район/i.test(l));
  assert.ok(rule, 'про дорогу в правилах ничего нет');
  assert.match(rule, /15/, 'внутри района');
  assert.match(rule, /30/, 'между районами');
  assert.match(rule, /не спрашивая|сам/, 'закладывает агент, а не спрашивает каждый раз');
  // Справочник мест остаётся в файлах задачника — правило только отсылает к нему.
  assert.match(rule, /sections-weekly-planning|CLAUDE\.md/, 'сказано, где искать районы');
  assert.doesNotMatch(rule, /ЮЗР/, 'география — справка, ей место в файлах, а не в правилах');
});

test('наружу от его имени агент не пишет', () => {
  const rule = RULE((l) => /от его имени/i.test(l));
  assert.ok(rule, 'запрета писать от его имени в правилах нет');
  assert.match(rule, /черновик/i, 'вместо отправки — черновик');
  assert.match(rule, /отправляет он/i);
});

test('действуй по умолчанию, спрашивай по исключению — вместе с пометкой догадки', () => {
  const rule = RULE((l) => /по умолчанию/i.test(l) && /исключени/i.test(l));
  assert.ok(rule, 'общей установки на самостоятельность в правилах нет');
  // Без списка исключений правило превращается в «делай что хочешь».
  assert.match(rule, /необратим/i);
  assert.match(rule, /деньги/i);
  assert.match(rule, /личное/i);
  // Самостоятельность без пометки догадки — это тихая выдумка.
  assert.match(rule, /поставил так, поправь/);
  assert.match(rule, /согласованн/i);
});

test('правила говорят, что куда писать — иначе одна запись ляжет в трёх местах', () => {
  const rule = RULE((l) => /tasks_learn/.test(l) && /справк/i.test(l));
  assert.ok(rule, 'правила маршрутизации записей нет');
  // Три адреса, и у каждого своя причина.
  assert.match(rule, /правил[аоы] (твоего )?поведения|правило твоего поведения/i, 'поведение — в правила задачника');
  assert.match(rule, /в любом новом чате/i, 'названа причина: файл агент читать не обязан');
  assert.match(rule, /tasks_context/, 'память возвращается в каждом разборе');
  assert.match(rule, /рядом с данными/i, 'справка живёт при данных');
  // Главное: дубль запрещён явно.
  assert.match(rule, /не дублиру/i);
});

test('правила требуют задавать пятёрку и разносить ответы, а не оставлять их в чате', () => {
  const rule = RULE((l) => /простых вопрос/i.test(l));
  assert.ok(rule, 'без правила блок из пяти вопросов молча пролистают');
  assert.match(rule, /утренней и вечерней|каждой/i, 'спрашивают на обеих планёрках — в этом весь смысл');
  assert.match(rule, /рекомендаци/i, 'своё мнение к вопросу пишет модель: код его не соберёт');
  assert.match(rule, /tasks_resolve/, 'ответ, оставшийся в чате, считается неполученным');
  assert.match(rule, /спячк|sleep/i, '«не трогать» — это спячка, а не молчание');
});

test('новое правило из разговора кладётся в память, а правка инструкций проговаривается', () => {
  const rule = RULE((l) => /новое правило/i.test(l));
  assert.ok(rule, 'что делать с правилом, названным в разговоре, нигде не сказано');
  assert.match(rule, /по умолчанию клади его через tasks_learn/, 'дефолт назван прямо');
  assert.match(rule, /правк[ау] инструкций/i, 'сказано, когда одной памяти мало');
  assert.match(rule, /стенограмм/i, 'цена ошибки — уже случившаяся');
});

test('защищённые даты называются до согласия, а не после', () => {
  const rule = RULE((l) => /GOALS\.md/.test(l) && /дат/i.test(l) && /занимать/i.test(l));
  assert.ok(rule, 'про защищённые даты в правилах ничего нет');
  assert.match(rule, /до того как он согласится/);
  assert.match(rule, /решает он/i, 'это напоминание, а не запрет');
});

test('тёзки различаются суффиксом роли — иначе склеятся обязательства', () => {
  const rule = RULE((l) => /тёзк|одним именем|одно имя/i.test(l));
  assert.ok(rule, 'про тёзок в правилах ничего нет');
  assert.match(rule, /суффикс/i);
  assert.match(rule, /склеива|склеят/i, 'названа цена: обязательства сливаются в одного человека');
});

test('расписание берётся из задачника, а не из внешнего календаря', () => {
  const rule = RULE((l) => /календар/i.test(l) && /не участвует/i.test(l));
  assert.ok(rule, 'источник правды по расписанию в правилах не назван');
  assert.match(rule, /days\//);
  assert.match(rule, /запроси доступ|скажи об этом/i, 'нет доступа — не планировать по тому, что под рукой');
});

test('устройство задачника не меняется молча', () => {
  const rule = RULE((l) => /новое поле/i.test(l));
  assert.ok(rule, 'про самовольные изменения формата в правилах ничего нет');
  assert.match(rule, /дождись «да»|сначала предложи/i);
  assert.match(rule, /доск/i, 'названа цена: доска разбирает файлы построчно');
});

test('блок правил не раздувается бесконечно', () => {
  // Слепой эксперимент 2026-08-03 показал: лишняя рамка ухудшает ответы
  // (свободный вариант выиграл 7:3). Правила добавляются по одному и с ценой,
  // а не пачкой «на всякий случай».
  const rules = TASKS_RULES();
  const bytes = Buffer.byteLength(rules.join('\n'), 'utf8');
  assert.ok(bytes < 48000, `блок правил вырос до ${bytes} байт — режь, а не добавляй`);
  assert.ok(rules.length <= 55, `правил стало ${rules.length} — это уже не рамка, а инструкция`);
  // 2026-08-03 вырезаны 13 дублей: обратно блок вырасти не должен. Потолок
  // двигается ровно на размер осознанно добавленного правила и с датой — иначе
  // «одно маленькое исключение» повторится тринадцать раз, как уже было.
  // 2026-08-03: +1 правило про пять простых вопросов (З38), 33355 → 34632.
  // 2026-08-04: +1 правило про ревизию стенограммы перед повесткой (З39),
  // 34632 → 36102. Сжать до оставшихся 368 байт было нельзя: в правиле пять
  // видов потерь, и вычёркивание любого делает его «сверь по ощущению».
  // 2026-08-04: +1 правило про нумерованные вопросы с рекомендацией (З40),
  // 36102 → 36991. Оно жило в docs/preferences.md и не применялось: тот файл
  // надо вспомнить прочитать, а правила приезжают в каждый чат сами.
  // 2026-08-04: З39 переписан под отметки в файле стенограммы, 36991 → 37269.
  // Новых правил не добавлено — выросло одно: в нём появились три механики,
  // которых раньше не было (хвост ниже отметки, окно в несколько дней,
  // кандидаты как подсказка). Сжималось дважды, до 246 байт сверх прежнего;
  // резать дальше пришлось бы виды потерь, а без них правило превращается в
  // «сверь по ощущению» — по ощущению теряется ровно то, что и терялось.
  // 2026-08-04: выросли З12 и З23, 37269 → 38061. Новых правил не добавлено.
  // В З12 появился вид «факт» и замена через replaces, в З23 — захват факта в
  // момент ответа (tasks_resolve с fact). Оба аргумента без этих строк не будут
  // вызваны вовсе: аргумент, о котором не сказано в правилах, модель не ищет —
  // ровно так марку машины и спросили четыре раза за день, имея место, куда её
  // записать. Сжато вдвое от первой редакции: примеры оставлены по одному.
  // 2026-08-04: вырос З31, 38061 → 38668. Новых правил не добавлено. Причина:
  // в перечне видов памяти не было «факта», хотя вид уже добавлен в код и в
  // З12 — правило «у каждой записи одно место» перечисляло предпочтение,
  // порог и решение и молчало про факты. Молчание тут читается как «фактам
  // места нет», и они снова расползутся по CLAUDE.md и телам задач, как
  // расползлась география районов. Добавлена и граница между видами: правило
  // говорит КАК поступать, факт — ЧТО есть на самом деле.
  // 2026-08-04: вырос З28, 38668 → 38925. Правило пытались освободить от чисел
  // 15/30 (они же лежат в CLAUDE.md — дубль), но откатили: правила приезжают
  // в каждый чат сами, а память — только когда позовут разбор, и слот можно
  // ставить без него. Убрав числа отсюда, мы бы получили не «одно место», а
  // «место, куда не всегда доходят». Вместо этого дубль снимается с той
  // стороны — из CLAUDE.md, — а здесь записано, почему числа живут именно тут.
  // 2026-08-04, вечер: 38925 → 41849. Стенограмма переведена на полную запись
  // обеих сторон, журнал — на вывод вместо пересказа, ревизия получила
  // отдельную потерю «факт прозвучал и не лёг в память». Повод — марка
  // машины: она прозвучала в разборе аккумулятора 04.08, стенограмма брала
  // от ответа только выводы, и в неё деталь не попала — уцелела случайно,
  // отдельной журнальной записью часом позже. Рост здесь оплачен
  // тем, что журналу больше не надо пересказывать разговор.
  // 2026-08-18: вырос З41, 41977 → 42546. Новых правил не добавлено. Причина:
  // правило называло инструмент, но молчало о трёх вещах, без которых разбор
  // врёт молча. Фильтр по heading оставляет один блок, а одна реплика часто
  // разъезжается на соседние — так пост-деплойный обмен 18.08 показал один
  // log_meal вместо трёх. Дата по умолчанию — taskDay, и ночной прогон ищут
  // не в том дне. Инструкции коннектор берёт при старте сессии, поэтому
  // приёмка в старом чате меряет прошлую версию прода и приписывает её цифры
  // новой. Каждая из трёх ошибок уже случилась, и ни одна не выглядит как
  // ошибка в ответе инструмента — цену роста платим за это.
  // 2026-08-18, вечер: 42569 → 42634. Новых правил нет, уточнена одна фраза в
  // З41. Было «приёмку гони в новом чате» — совет выглядит разумным и не
  // работает: список инструментов кэширует приложение при подключении
  // коннектора, и новый чат берёт ту же копию. Проверено в тот же день —
  // сессия, поднятая ночью, через восемь часов после выката не видела
  // copy_meal в схеме update_meal. Неверная формулировка стоила четырёх
  // приёмочных прогонов подряд, каждый со своим ложным вердиктом.
  assert.ok(bytes < 42635, `дубли вернулись: блок снова ${bytes} байт`);
});

// ── Правила против кода: где текст обязан совпадать с поведением ─────────
//
// Аудит 2026-08-03 нашёл шесть мест, где инструкция обещала не то, что делает
// код. Числа берутся из тех же констант, что и поведение, — иначе они разъедутся
// снова, и заметит это не тест, а куратор.

test('правило про норму клиента доезжает до куратора и без задачника', () => {
  // Правило жило в блоке задачника, а он подключается только при withTasks:
  // куратор без задачника называл «1400» без «из 1900».
  for (const withTasks of [true, false]) {
    const text = curatorInstructions('Антон', withTasks, Date.UTC(2026, 7, 3));
    assert.match(text, /1400 из 1900/, `норма не названа при withTasks=${withTasks}`);
    assert.match(text, /client_saved/);
    assert.match(text, /норма не рассчитана/);
  }
  // И оно не должно вернуться в задачник: это правило про дневник клиента.
  assert.ok(!TASKS_RULES().some((l) => /норм/i.test(l) && /client_saved/.test(l)));
});

test('перед вопросом «кому вносить» модель не уходит в археологию «мне»', () => {
  // Инцидент 2026-08-04/07: правило «мне = клиент» лежало в памяти, а модель
  // звала list_clients + grep. Инструкция обязана сказать: передавай алиас в
  // client напрямую, сервер развернёт — и стоять раньше CRITICAL.
  const text = curatorInstructions('Антон', true, Date.UTC(2026, 7, 3));
  const address = text.indexOf('передавай прямо в параметр client');
  const askRule = text.indexOf('КРИТИЧЕСКОЕ ПРАВИЛО РЕЖИМА');
  assert.ok(address >= 0, 'инструкция про прямой client=алиас отсутствует');
  assert.ok(askRule >= 0);
  assert.ok(address < askRule, 'адресация должна идти раньше вопроса «кому»');
  assert.match(text, /не грепай journal|без grep/i);
  assert.match(text, /Не зови heys_list_clients.*ради «кто такой мне»|не зови heys_list_clients/i);

  const withLine = curatorInstructions('Антон', true, Date.UTC(2026, 7, 3), false, '«мне» → Полтавский');
  assert.match(withLine, /Адресация из памяти/);
  assert.match(withLine, /Полтавский/);

  const noTasks = curatorInstructions('Антон', false, Date.UTC(2026, 7, 3));
  assert.doesNotMatch(noTasks, /tasks_context/, 'без задачника — не звать несуществующий инструмент');
  assert.match(noTasks, /передавай прямо в параметр client/);
});

test('запрет дневниковой археологии и отклонение tasks_context в схеме', () => {
  const text = curatorInstructions('Антон', true, Date.UTC(2026, 7, 3), false, '«мне» → Полтавский');
  assert.match(text, /ЗАПРЕТ ДНЕВНИКОВОЙ АРХЕОЛОГИИ/);
  assert.match(text, /сервер отклонит такой вызов/);
  const { schemas } = createCuratorContext({
    api: fakeCuratorApi(),
    curatorJwt: JWT,
    curatorName: 'Кин',
    nowMs: NOW,
    tasksClientId: 'tasks-client-id',
  });
  const ctx = schemas.find((s) => s.name === 'tasks_context');
  assert.ok(ctx, 'tasks_context schema missing');
  assert.match(ctx.description, /ЗАПРЕЩЕНО для записи в дневник/);
});

test('вид «факт» и путь его обновления названы в правилах, а не только в схеме', () => {
  // Аргумент, о котором не сказано в правилах, модель не ищет — тот же довод,
  // что и у остальных сторожей этого файла. До сих пор эти три строки держал
  // только потолок размера блока, а он пройдёт и после их удаления.
  const rules = TASKS_RULES().join('\n');
  assert.match(rules, /факт/, 'вид «факт» в правилах не назван — модель запишет его предпочтением');
  assert.match(rules, /replaces/, 'путь замены устаревшего факта не назван');
  assert.match(rules, /tasks_resolve[^\n]*\bfact\b|\bfact\b[^\n]*tasks_resolve/,
    'захват факта при снятии вопроса не назван — ответ уедет в архив вместе с задачей');
});

test('потолок развилок в тексте — тот же, что в коде', () => {
  const decision = toolText('tasks_decision');
  assert.match(decision, new RegExp(`${tasksLib.OPEN_DECISIONS_CAP} нерешённых развилок`));
  // Прежний текст рядом с реализацией говорил про «пять» и «шестую».
  const everywhere = [decision, TASKS_RULES().join('\n')].join('\n');
  assert.ok(!/пять нерешённых|шестую/.test(everywhere), 'старое число потолка вернулось в текст');
  // hash — не дыра в потолке, а другой случай, и текст обязан это говорить.
  assert.match(decision, /hash не обход/);
  assert.match(TASKS_RULES().join('\n'), /Обхода у потолка нет/);
});

test('условия блока «план и факт» названы все три, а не только счёт случаев', () => {
  const rule = TASKS_RULES().find((l) => /план и факт/i.test(l) || /План и факт/.test(l));
  assert.ok(rule, 'правило про план и факт на месте');
  assert.match(rule, new RegExp(`${Math.round(tasksLib.PLAN_FACT_MIN_SHARE * 100)}%`), 'доля срывов не названа');
  assert.match(rule, new RegExp(`${tasksLib.PLAN_FACT_WINDOW_DAYS} дн`), 'окно не названо');
  assert.match(rule, /закрытым дням/);
  // Главное: молчание планёрки не доказательство, что расхождения нет.
  assert.match(rule, /молчание планёрки не доказывает/);
});

test('пороги вложений в тексте совпадают с теми, что проверяет код', () => {
  const assets = require('../lib/assets');
  const attach = toolText('tasks_attach');
  const rule = TASKS_RULES().find((l) => /tasks_attach/.test(l));
  for (const text of [attach, rule]) {
    assert.match(text, new RegExp(`${assets.IMAGE_MAX_BYTES / 1024} КБ`), 'потолок картинки не назван');
    assert.match(text, /100 КБ/, 'цель сжатия осталась');
    assert.match(text, new RegExp(`${assets.DOC_MAX_BYTES / 1024} КБ`), 'потолок документа не назван');
  }
  // Цель и потолок больше не выдаются один за другой.
  assert.ok(!/сожми до примерно 100 КБ/.test(rule));
});

test('закрытие вчерашнего дня описано и в правиле, и в самом инструменте', () => {
  const rule = TASKS_RULES().find((l) => /tasks_close_day/.test(l) || /ВЧЕРАШНИЙ/.test(l));
  assert.ok(rule, 'правило про закрытие дня на месте');
  assert.match(rule, /ВЧЕРАШНИЙ/);
  const date = TASKS_SCHEMAS.find((s) => s.name === 'tasks_close_day').inputSchema.properties.date.description;
  assert.match(date, /По умолчанию ВЧЕРАШНИЙ/, 'описание аргумента больше не спорит с правилом');
  assert.ok(!/По умолчанию сегодня/.test(date));
});

test('сделанное снимается тем же инструментом и в том же ходе', () => {
  // Решение владельца 2026-08-03: карточки висели после того, как работа по
  // ним уже сделана — идею превратили в задачу, пункт планёрки решили, а они
  // остались в списках. Само это не снимается: записи лежат в разных местах.
  const rule = TASKS_RULES().find((l) => /Сделанное снимается тем же инструментом/.test(l));
  assert.ok(rule, 'правило про снятие отработавших карточек на месте');
  assert.match(rule, /в том же ходе/);
  for (const how of ['tasks_standup с done', 'done у tasks_remind', 'tasks_idea с to_project']) {
    assert.ok(rule.includes(how), `не сказано, чем снимать: ${how}`);
  }
  // Правило не должно оставлять агентски закрытую задачу висеть ради «его галочки».
  assert.match(rule, /Задачу, которую ты сам довёл до конца/);
  const ticks = TASKS_RULES().find((l) => /Галочку на задаче или подпункте ставишь сам/.test(l));
  assert.ok(ticks, 'правило про галочку агента на месте');
  assert.match(ticks, /Не уверен — спроси/);
});

// ── Тринадцать дублей: вырезаны из блока, но не потеряны ─────────────────
//
// У каждой строки: по чему узнаётся правило в блоке, и где его суть живёт
// теперь. Тест ловит и возврат дубля, и потерю смысла — по отдельности каждая
// из двух бед выглядит как «всё в порядке».

test('вырезанные дубли не вернулись в блок, а их суть осталась в инструментах', () => {
  const rules = TASKS_RULES().join('\n');
  const cases = [
    ['tasks_context', /Чего tasks_context не умеет/, /Пересечения по времени он не видит вовсе/],
    ['tasks_slot', /прочитай в ответе conflicts/, /возвращаются в ответе как conflicts/],
    ['tasks_decision', /передай её key/, /Ключ находки из tasks_review/],
    ['tasks_review', /Потолок в три находки он держит сам/, /НЕ БОЛЬШЕ ТРЁХ находок/],
    ['tasks_link', /Поиск такую пару не находит никогда/, /поиском они друг друга не находят/],
    ['tasks_standup', /это не отказ от темы, а перенос/, /обсудим на планёрке/],
    ['tasks_standup', /В повестке два разных списка/, /посчитано по файлам/],
    ['tasks_standup', /Цена замеченного/, /обе стороны расхождения цитатами/],
    ['tasks_quick', /Быстрые дела отдельной сущностью не заводятся/, /Своей сущности у них нет/],
    ['tasks_idea', /Мысль, которую он хочет обдумывать/, /нельзя закрыть галочкой/],
    ['tasks_slot', /Слот умеет нести два необязательных признака/, /Ставь только когда он сам это сказал/],
    ['tasks_calendar', /Занятость ресурса — факт/, /а не запрет/],
    ['tasks_standup', /Память тоже стареет/, /старше месяца/],
  ];
  assert.equal(cases.length, 13, 'вырезано было ровно тринадцать правил');
  for (const [tool, gone, kept] of cases) {
    assert.doesNotMatch(rules, gone, `дубль вернулся в блок: ${gone}`);
    assert.match(toolText(tool), kept, `суть потеряна: ${tool} больше не говорит ${kept}`);
  }
});

test('два ответа больше не включаются, а правила задачника сохраняются', () => {
  const instructions = curatorInstructions('Антон', true, Date.UTC(2026, 7, 3));
  assert.doesNotMatch(instructions, /Эксперимент до 2026-08-05/);
  assert.doesNotMatch(instructions, /^Э\d+\./m);
  assert.doesNotMatch(instructions, /tasks_vote/);
  assert.match(instructions, /Галочку на задаче или подпункте ставишь сам/);
});

// ── Планёрка ─────────────────────────────────────────────────────────────
//
// Правила ищутся по смыслу, а не по номеру: нумерация уже один раз ломала
// тесты при вставке правила в середину, и привязываться к «З24» значит
// подложить ту же мину следующему.

test('планёрка названа в правилах и зовётся своим инструментом', () => {
  const rule = TASKS_RULES().find((line) => /не собирай повестку руками/.test(line));
  assert.ok(rule, 'про планёрку в правилах сказано');
  assert.match(rule, /tasks_standup/);
  // Смысл сущности — не собирать повестку руками.
  assert.match(rule, /не собирай повестку руками/);
});

test('планёрка начинается с ревизии хвоста, а не с повестки', () => {
  // Повестка собрана только из заведённого: обсуждённое мимо задачника до неё
  // не доходит вовсе. Требование живёт в правилах, а не только в блоке ответа,
  // потому что порядок «сначала сверить, потом собирать» кодом не навязать.
  const rule = TASKS_RULES().find((line) => /сначала ревизия/i.test(line));
  assert.ok(rule, 'без правила блок ревизии прочитают как приписку');
  assert.match(rule, /стенограмм/i);
  assert.match(rule, /tasks_read/, 'сказано, чем читать');
  assert.match(rule, /reviewed/, 'сказано, чем отмечать сделанное');
  // Ревизия перед КАЖДОЙ планёркой и только по хвосту: раз в день и весь день
  // целиком — это прежняя механика, из-за которой второй разговор за сутки
  // оставался несверенным вовсе.
  assert.match(rule, /перед КАЖДОЙ/, 'ревизия не раз в день, а перед каждой планёркой');
  assert.match(rule, /хвост/i, 'читается несверенный хвост, а не весь день');
  assert.match(rule, /отметк/i, 'граница прочитанного — отметка в самом файле');
  assert.match(rule, /целиком/, 'выборочное чтение хвоста — это не ревизия');
  // Пять видов потерь: вычёркивание любого превращает правило в «сверь по
  // ощущению», а по ощущению теряется ровно то, что и терялось.
  for (const loss of [/решени/i, /договорённост/i, /срок/i, /без ответа/i, /задачи нет/i]) {
    assert.match(rule, loss, `в правиле назван вид потери ${loss}`);
  }
  assert.match(rule, /не пересказывай/, 'он в этом разговоре был — пересказ стоит его времени и ничего не даёт');
});

test('уточнения задаются нумерованным списком с рекомендацией, а не прозой', () => {
  // Правило было только в docs/preferences.md и не применялось: тот файл надо
  // вспомнить прочитать, а правила приезжают в каждый чат сами.
  const rule = TASKS_RULES().find((line) => /нумерованным списком/i.test(line));
  assert.ok(rule, 'без правила вопрос снова уедет прозой');
  assert.match(rule, /рекомендац/i, 'своя рекомендация к каждому пункту — часть требования');
  assert.match(rule, /одну строку|в одну строку/);
  assert.match(rule, /проза|Проза/i, 'названо и то, чего делать нельзя');
});

test('решения планёрки записываются по ходу, а не остаются словами в чате', () => {
  const rules = TASKS_RULES().join('\n');
  const rule = TASKS_RULES().find((line) => /планёрк/i.test(line) && /tasks_resolve/.test(line));
  assert.ok(rule, 'правило говорит, чем записывать решения');
  for (const tool of ['tasks_resolve', 'tasks_decision', 'tasks_learn']) {
    assert.match(rule, new RegExp(tool), `${tool} назван как способ записать решение`);
  }
  assert.ok(rules.includes(rule));
});

test('«обсудим на планёрке» кладётся в механизм, а не теряется до конца чата', () => {
  // Правило было дословным пересказом аргумента add — из блока вырезано.
  const add = TASKS_SCHEMAS.find((s) => s.name === 'tasks_standup').inputSchema.properties.add.description;
  assert.match(add, /обсудим на планёрке/i, 'фраза названа дословно — по ней и срабатывает');
  assert.match(add, /в том же ходе/);
});

test('посчитанное и замеченное разведены и названы по-разному', () => {
  const standup = toolText('tasks_standup');
  assert.match(standup, /посчитано по файлам/, 'расхождения — факты');
  // Смысловое наблюдение разрешено, но только вопросом: подтвердить его может
  // один человек, и поданное утверждением оно становится выдумкой.
  assert.match(standup, /ВОПРОСОМ, а не утверждением/);
  assert.match(standup, /утверждение здесь было бы враньём/);
});

test('размен «спрошу, зато научусь» назван целиком, вместе с его условиями', () => {
  const standup = toolText('tasks_standup');
  // Обе стороны цитатами — иначе он идёт проверять сам.
  assert.match(standup, /обе стороны расхождения цитатами с указанием файла/);
  // Ответ обязан записываться, иначе завтра будет задан тот же вопрос.
  assert.match(standup, /Незаписанный ответ значит, что завтра ты спросишь то же самое/);
  assert.match(standup, /tasks_learn/);
  // Объём ограничен, и сказано, чем именно это грозит.
  assert.match(standup, /не больше трёх/);
});

test('напоминание и задача разведены, и цена ошибки названа', () => {
  // В блоке остаётся распознавание — оно срабатывает до выбора инструмента;
  // механика и цена ошибки описаны у самого tasks_remind.
  const rule = TASKS_RULES().find((line) => /о напоминании вспоминают/.test(line));
  assert.ok(rule, 'правило говорит, когда звать напоминание');
  assert.match(rule, /о напоминании вспоминают/);
  assert.match(rule, /тегом места/, 'привязка к месту — это задача, а не напоминание');

  const remind = toolText('tasks_remind');
  assert.match(remind, /загруженность/, 'сказано, чем плохо заводить такое задачей');
  // Про место система не знает ничего — и описание не должно обещать обратного.
  assert.match(remind, /не всплывёт никогда/);
});

test('быстрые дела названы видом, а не сущностью', () => {
  const quick = toolText('tasks_quick');
  assert.match(quick, /Своей сущности у них нет/);
  assert.match(quick, /закрываются они обычным путём/, 'галочка встаёт в самом проекте');
  assert.match(quick, /15min/, 'механика видна — это тег на обычной задаче');
  // Пустой список тут норма, и об этом обязан знать не только код.
  assert.match(quick, /а не «дел нет»/);
});

test('идеи отделены и от задач, и от «когда-нибудь»', () => {
  const idea = toolText('tasks_idea');
  assert.match(idea, /нельзя закрыть галочкой/, 'признак задачи назван проверяемо');
  assert.match(idea, /её развивают/, 'признак идеи — её дописывают, а не делают');
  assert.match(idea, /to_project/, 'выход из идей назван');
  assert.match(idea, /накопленные мысли переезжают/);
});

test('новые правила не предписывают порядок вызовов', () => {
  // Процедуру «сначала вызови то, потом это» из правил срезали намеренно:
  // на живом сравнении она проигрывала свободному ответу.
  for (const rule of TASKS_RULES().filter((l) => /tasks_(remind|quick|idea)/.test(l))) {
    assert.doesNotMatch(rule, /сначала вызови/i);
    assert.doesNotMatch(rule, /затем вызови/i);
    assert.doesNotMatch(rule, /по порядку:/i);
  }
});

// ── Чей слот и что он забирает ───────────────────────────────────────────
//
// «У жены тренировка завтра в обед» — событие не его, а зависимость его.
// Правило ищется по смыслу, а не по номеру: нумерация уже ломала тесты.

test('признаки слота названы оба и не требуются у каждого слота', () => {
  // Правило было пересказом двух аргументов — из блока вырезано, проверяем там,
  // где оно теперь одно.
  const slot = toolText('tasks_slot');
  assert.match(slot, /машина/);
  assert.match(slot, /ребёнок/);
  // Необязательность — главное в этой паре полей: обязательное не заполняется.
  assert.match(slot, /Ставь только когда он сам это сказал/);
  assert.match(slot, /по умолчанию слот не занимает ничего/);
  assert.match(slot, /по умолчанию слот его собственный/);
});

test('занятость ресурса подана фактом, а вывод из неё берётся у него', () => {
  // Догадки про «куда без машины не добраться» запрещены прямо: студия у них
  // рядом с тренировкой, и таблицы «ресурс → место» в коде нет.
  for (const tool of ['tasks_slot', 'tasks_calendar', 'tasks_focus']) {
    assert.match(toolText(tool), /знает он один/, `${tool} не выдаёт занятость за запрет`);
  }
  assert.match(toolText('tasks_calendar'), /а не запрет/);
  assert.match(toolText('tasks_calendar'), /вслух вместе с окном/, 'занятость называется с окном и причиной');
  // Спросить один раз и записать — общий ход на любое незнание, он в блоке.
  const rule = TASKS_RULES().find((line) => /спроси один раз/i.test(line) && /tasks_learn/.test(line));
  assert.ok(rule, 'общий ход «спросил → записал → молчу» в правилах остался');
  assert.doesNotMatch(rule, /сначала вызови/i);
});

test('алиас «мне» из памяти резолвится в client без археологии', async () => {
  // Инцидент 07.08: на «запиши мне» модель звала list_clients+grep, хотя
  // после понимания адреса запись занимала 2 вызова. Сервер обязан принять
  // client=«мне» сам.
  const prefsText = [
    '## Как он решает',
    '',
    `- 2026-08-03 · предпочтение · «Мне» = аккаунт клиента Антон (${CLIENTS[0].client_id}). «Жене» / «цыпе» = аккаунт клиента Александра (${CLIENTS[1].client_id}). — его слова`,
  ].join('\n');
  const prefs = tasksLib.activePreferences(tasksLib.parsePreferences({ text: prefsText }));
  const aliasMap = tasksLib.clientAddressMap(prefs, CLIENTS);
  assert.equal(aliasMap.get('мне').client_id, CLIENTS[0].client_id);
  assert.equal(aliasMap.get('жене').client_id, CLIENTS[1].client_id);
  assert.equal(aliasMap.get('жена').client_id, CLIENTS[1].client_id);
  assert.equal(aliasMap.get('цыпе').client_id, CLIENTS[1].client_id);
  assert.equal(aliasMap.get('себе').client_id, CLIENTS[0].client_id);

  const api = fakeCuratorApi();
  const { tools, instructions } = createCuratorContext({
    api, curatorJwt: JWT, curatorName: 'Кин', nowMs: NOW, addressAliases: aliasMap,
  });
  assert.match(instructions, /Адресация из памяти/);
  assert.match(instructions, /Антон/);
  assert.match(instructions, /жена = жене|жене\/жена|«жена»/i);

  const day = await tools.heys_get_day({ client: 'мне', date: '2026-08-01' });
  assert.match(day.text, /^\[Антон\]/);
  const wife = await tools.heys_get_day({ client: 'цыпе', date: '2026-08-01' });
  assert.match(wife.text, /^\[Александра\]/);
  const wifeNom = await tools.heys_get_day({ client: 'жена', date: '2026-08-01' });
  assert.match(wifeNom.text, /^\[Александра\]/);

  const listed = await tools.heys_list_clients({});
  assert.match(listed.text, /алиас/i);
  assert.match(listed.text, /мне/);

  const blocked = await tools.heys_list_clients({ for: 'жене' });
  assert.equal(blocked.structured.skip_reason, 'known_alias_use_client_param');
  const blockedNom = await tools.heys_list_clients({ alias: 'жена' });
  assert.equal(blockedNom.structured.skip_reason, 'known_alias_use_client_param');
  assert.equal(blockedNom.structured.canon, 'жене');
});

test('алиасы грузятся из KV shape {text,rev}, не из data.v', async () => {
  // Инцидент smoke 07.08 Layer 4: getKVByCurator отдаёт row.v = { text, rev },
  // а прогрев читал data.v → пустая карта → «Клиент мне не найден» при живом
  // предпочтении в preferences.md. Гарды tasks_context при этом работали.
  const prefsText = [
    '## Как он решает',
    '',
    `- 2026-08-03 · предпочтение · «Мне» = аккаунт клиента Антон (${CLIENTS[0].client_id}). «Жене» / «цыпе» = аккаунт клиента Александра (${CLIENTS[1].client_id}). — его слова`,
    '  - зовётся: мне, себе, жене, цыпе',
  ].join('\n');
  const tasksClientId = 'cid-tasks';
  const api = fakeCuratorApi({ tasksClientId });
  api.kv[tasksClientId][tasksLib.keyForPath(tasksLib.PREFS_PATH)] = {
    path: tasksLib.PREFS_PATH,
    text: prefsText,
    rev: 177,
    updatedAt: NOW,
  };
  // Без addressAliases — только lazy load из KV, как на проде после промаха прогрева.
  const { tools } = createCuratorContext({
    api, curatorJwt: JWT, curatorName: 'Кин', nowMs: NOW, tasksClientId,
  });
  const day = await tools.heys_get_day({ client: 'мне', date: '2026-08-01' });
  assert.match(day.text, /^\[Антон\]/, 'client=мне обязан резолвиться из preferences.md');
  const listed = await tools.heys_list_clients({});
  assert.match(listed.text, /Известные алиасы/);
  assert.match(listed.text, /мне/);
  const blocked = await tools.heys_list_clients({ for: 'жене' });
  assert.equal(blocked.structured.skip_reason, 'known_alias_use_client_param');
});

// 2026-08-18: «создай рецепт салата» модель отработала как просьбу написать
// текст — посчитала КБЖУ, выдала рецепт и не вызвала ни одного инструмента.
// В HEYS нет сущности «рецепт», и слово не вело ни к create_product, ни к
// preset, поэтому в базе не осталось ничего.
test('быстрый путь считает «создай рецепт» просьбой записать продукт с recipe', () => {
  const text = curatorInstructions('Антон', true, NOW);
  assert.match(text, /«создай рецепт»/);
  assert.match(text, /heys_create_product/);
  assert.match(text, /полем recipe/);
  assert.ok(
    text.indexOf('«создай рецепт»') < text.indexOf('Правила работы с дневником'),
    'правило должно стоять в быстром пути, до подробных правил',
  );
});

function saladPP() {
  return {
    id: 'own-salad-pp',
    _custom: true,
    in_my_list: true,
    name: 'Салат крабовый ПП',
    protein100: 5.3,
    simple100: 3,
    complex100: 4.4,
    badFat100: 1.1,
    goodFat100: 2,
    trans100: 0,
    fiber100: 0.5,
    gi: 40,
    harm: 3,
    carbs100: 7.4,
    fat100: 3.1,
    portions: [
      { name: '1 порция', grams: 325 },
      { name: 'полпорции', grams: 160 },
    ],
  };
}

function saladClassic() {
  return {
    id: 'own-salad-classic',
    _custom: true,
    in_my_list: true,
    name: 'Салат крабовый классический',
    protein100: 7,
    simple100: 4,
    complex100: 8,
    badFat100: 8,
    goodFat100: 6,
    trans100: 0,
    fiber100: 0.5,
    gi: 45,
    harm: 6,
  };
}

function withSalads(api) {
  api.kv['cid-anton'].heys_products_overlay_v2.push(saladPP());
  api.kv['cid-alexandra'].heys_products_overlay_v2.push(saladClassic());
  return api;
}

function trackOverlayReads(api) {
  const reads = [];
  const orig = api.getKVByCurator.bind(api);
  api.getKVByCurator = async (bearer, clientId, key) => {
    if (key === products.OVERLAY_KEY) reads.push(clientId);
    return orig(bearer, clientId, key);
  };
  return reads;
}

test('lazy peer: точное совпадение не читает overlay других клиентов', async () => {
  const api = withSalads(fakeCuratorApi());
  const reads = trackOverlayReads(api);
  const { tools } = build(api);
  const res = await tools.heys_search_products({ client: 'Александра', query: 'чай зелёный' });
  assert.ok(res.structured.results.some((p) => p.name === 'Чай зелёный'));
  assert.equal(reads.includes('cid-anton'), false);
});

test('lazy peer: частичное совпадение читает overlay и находит ПП-салат', async () => {
  const api = withSalads(fakeCuratorApi());
  const reads = trackOverlayReads(api);
  const { tools } = build(api);
  const res = await tools.heys_search_products({ client: 'Александра', query: 'крабовый салат пп' });
  assert.equal(reads.includes('cid-anton'), true);
  const pp = res.structured.results.find((p) => p.name === 'Салат крабовый ПП');
  assert.ok(pp);
  assert.equal(pp.writable, false);
  assert.equal(pp.source, 'список Антон');
  assert.match(res.text, /нельзя записать напрямую/);
});

test('scope=curator форсирует peer fan-out даже при точном совпадении', async () => {
  const api = withSalads(fakeCuratorApi());
  const reads = trackOverlayReads(api);
  const { tools } = build(api);
  await tools.heys_search_products({ client: 'Александра', query: 'чай зелёный', scope: 'curator' });
  assert.equal(reads.includes('cid-anton'), true);
});

test('from_product_id копирует домашний продукт другого клиента', async () => {
  const api = withSalads(fakeCuratorApi());
  const { tools } = build(api);
  const created = await tools.heys_create_product({
    client: 'Александра',
    from_product_id: 'own-salad-pp',
  });
  assert.notEqual(created.structured.product_id, 'own-salad-pp');
  assert.equal(created.structured.name, 'Салат крабовый ПП');
  assert.equal(created.structured.cloned_from.product_id, 'own-salad-pp');
  assert.equal(created.structured.cloned_from.owner_client_name, 'Антон');
  const overlay = api.kv['cid-alexandra'].heys_products_overlay_v2;
  assert.ok(overlay.some((row) => row.id === created.structured.product_id && row._custom));
  assert.equal(overlay.some((row) => row.id === 'own-salad-pp'), false);
});

// Копия блюда без состава — копия без главного: у клиента остаётся карточка с
// цифрами и без ответа «что внутри». Плюс состав пересчитывается по каталогу
// нового владельца: у него свои карточки тех же продуктов.
function withRecipeSalad(api) {
  api.kv['cid-anton'].heys_products_overlay_v2.push({
    id: 'own-egg-anton', _custom: true, in_my_list: true, name: 'Яйцо варёное',
    protein100: 12.7, simple100: 0.7, complex100: 0, badFat100: 3.1, goodFat100: 7.5,
    trans100: 0, fiber100: 0, gi: 0, harm: 1,
  });
  api.kv['cid-alexandra'].heys_products_overlay_v2.push({
    id: 'own-egg-alex', _custom: true, in_my_list: true, name: 'Яйцо варёное',
    protein100: 12.7, simple100: 0.7, complex100: 0, badFat100: 3.1, goodFat100: 7.5,
    trans100: 0, fiber100: 0, gi: 0, harm: 1,
  });
  const salad = api.kv['cid-anton'].heys_products_overlay_v2.find((p) => p.id === 'own-salad-pp');
  salad.recipe = {
    yield_grams: 200,
    items: [{ product_id: 'own-egg-anton', name: 'Яйцо варёное', grams: 200 }],
    rev: 1,
    updatedAt: 1,
  };
  return api;
}

test('клон переносит рецепт и пересчитывает его по каталогу нового владельца', async () => {
  const api = withRecipeSalad(withSalads(fakeCuratorApi()));
  const { tools } = build(api);
  const created = await tools.heys_create_product({
    client: 'Александра',
    from_product_id: 'own-salad-pp',
  });
  const overlay = api.kv['cid-alexandra'].heys_products_overlay_v2;
  const row = overlay.find((r) => r.id === created.structured.product_id);
  assert.ok(row.recipe, 'состав должен переехать вместе с карточкой');
  assert.equal(row.recipe.items.length, 1);
  // Ингредиент взят из списка Александры, а не из чужого overlay.
  assert.equal(row.recipe.items[0].product_id, 'own-egg-alex');
  assert.equal(row.recipe.items[0].grams, 200);
});

test('клон отказывается, если ингредиента рецепта нет у нового владельца', async () => {
  const api = withRecipeSalad(withSalads(fakeCuratorApi()));
  api.kv['cid-alexandra'].heys_products_overlay_v2 =
    api.kv['cid-alexandra'].heys_products_overlay_v2.filter((p) => p.id !== 'own-egg-alex');
  const { tools } = build(api);
  await assert.rejects(
    () => tools.heys_create_product({ client: 'Александра', from_product_id: 'own-salad-pp' }),
    (e) => e.code === 'recipe_item_not_found' && /Яйцо варёное/.test(e.message),
  );
});

test('после копии log_meal принимает новый id, peer id — нет', async () => {
  const api = withSalads(fakeCuratorApi());
  const { tools } = build(api);
  await assert.rejects(
    () => tools.heys_log_meal({
      client: 'Александра',
      items: [{ product_id: 'own-salad-pp', grams: 232 }],
    }),
    (e) => {
      assert.equal(e.code, 'product_not_found');
      assert.match(e.message, /from_product_id/);
      return true;
    },
  );
  const created = await tools.heys_create_product({
    client: 'Александра',
    from_product_id: 'own-salad-pp',
  });
  const meal = await tools.heys_log_meal({
    client: 'Александра',
    items: [{ product_id: created.structured.product_id, grams: 232 }],
  });
  const write = api.writes.find((w) => w.key === 'heys_dayv2_2026-08-01' && w.clientId === 'cid-alexandra');
  assert.equal(write.value.meals[0].items[0].product_id, created.structured.product_id);
  assert.match(meal.text, /Салат крабовый ПП/);
});

test('Type A с тем же именем не клонируется, с новым — клон как черри', async () => {
  const { tools } = build(fakeCuratorApi());
  await assert.rejects(
    () => tools.heys_create_product({ client: 'Александра', from_product_id: 's-tomato' }),
    (e) => {
      assert.equal(e.code, 'product_already_shared');
      assert.match(e.message, /общей базе/);
      return true;
    },
  );
  const cherry = await tools.heys_create_product({
    client: 'Александра',
    from_product_id: 's-tomato',
    name: 'Черри',
  });
  assert.equal(cherry.structured.name, 'Черри');
  assert.equal(cherry.structured.cloned_from.product_id, 's-tomato');
});

test('tombstone отклоняет копию домашнего продукта с тем же именем', async () => {
  const api = withSalads(fakeCuratorApi());
  api.kv['cid-alexandra'].heys_deleted_ids = [{ name: 'Салат крабовый ПП' }];
  const { tools } = build(api);
  await assert.rejects(
    () => tools.heys_create_product({ client: 'Александра', from_product_id: 'own-salad-pp' }),
    (e) => e.code === 'product_tombstoned',
  );
});

test('дубль имени у другого клиента: warning если индекс прогрет, cold create молчит', async () => {
  const warmApi = withSalads(fakeCuratorApi());
  const { tools: warm } = build(warmApi);
  await warm.heys_search_products({ client: 'Александра', query: 'крабовый салат пп' });
  await assert.rejects(
    () => warm.heys_create_product({
      client: 'Александра',
      name: 'Салат крабовый ПП',
      protein100: 5, simple100: 1, complex100: 1, badFat100: 1, goodFat100: 1,
      trans100: 0, fiber100: 0, gi: 40, harm: 3,
    }),
    (e) => {
      assert.equal(e.code, 'product_exists_other_client');
      assert.match(e.message, /from_product_id/);
      return true;
    },
  );
  const allowed = await warm.heys_create_product({
    client: 'Александра',
    name: 'Салат крабовый ПП',
    protein100: 5, simple100: 1, complex100: 1, badFat100: 1, goodFat100: 1,
    trans100: 0, fiber100: 0, gi: 40, harm: 3,
    allow_duplicate: true,
  });
  assert.ok(allowed.structured.product_id);

  const coldApi = withSalads(fakeCuratorApi());
  const { tools: cold } = build(coldApi);
  const created = await cold.heys_create_product({
    client: 'Александра',
    name: 'Салат крабовый ПП',
    protein100: 5, simple100: 1, complex100: 1, badFat100: 1, goodFat100: 1,
    trans100: 0, fiber100: 0, gi: 40, harm: 3,
  });
  assert.ok(created.structured.product_id);
});

test('похожее (не точное) имя у другого клиента тоже предупреждает', async () => {
  const api = withSalads(fakeCuratorApi());
  const { tools } = build(api);
  await tools.heys_search_products({ client: 'Александра', query: 'крабовый салат пп' });
  await assert.rejects(
    () => tools.heys_create_product({
      client: 'Александра',
      name: 'Салат крабовый',
      protein100: 5, simple100: 1, complex100: 1, badFat100: 1, goodFat100: 1,
      trans100: 0, fiber100: 0, gi: 40, harm: 3,
    }),
    (e) => {
      assert.equal(e.code, 'product_similar_exists_other_client');
      assert.match(e.message, /Салат крабовый ПП/);
      return true;
    },
  );
  const allowed = await tools.heys_create_product({
    client: 'Александра',
    name: 'Салат крабовый',
    protein100: 5, simple100: 1, complex100: 1, badFat100: 1, goodFat100: 1,
    trans100: 0, fiber100: 0, gi: 40, harm: 3,
    allow_duplicate: true,
  });
  assert.ok(allowed.structured.product_id);
});

// Рецепт клиента — авторская вещь: у неё есть бренд («салат от Ивановых») и
// нет причин уезжать в каталог, который видят все остальные клиенты.

const SALAD_RECIPE = {
  yield_grams: 200,
  items: [{ product_id: 'own-coffee', name: 'Кофе американо', grams: 200 }],
};

test('домашнее блюдо с составом не публикуется, даже когда у него есть бренд', async () => {
  const api = apiWithPublish();
  const { tools } = buildWithCurator(api);
  const res = await tools.heys_create_product({
    client: 'Антон', name: 'Салат от Ивановых', brand: 'Ивановы', recipe: SALAD_RECIPE,
  });

  assert.equal(api.published.length, 0, 'бренд не делает авторский рецепт общим');
  assert.equal(res.structured.shared, false);
  assert.match(res.text, /рецепт клиента остаётся в его личном списке/);
});

test('при явном share:true в общую базу уходят КБЖУ, но не состав', async () => {
  const api = apiWithPublish();
  const { tools } = buildWithCurator(api);
  const res = await tools.heys_create_product({
    client: 'Антон', name: 'Салат от Ивановых', recipe: SALAD_RECIPE, share: true,
  });

  assert.equal(api.published.length, 1);
  const { payload } = api.published[0];
  assert.equal(payload.recipe, undefined, 'ссылки на личные product_id в общей базе мертвы');
  assert.ok(payload.kcal100 > 0, 'нутриенты опубликованы');
  assert.equal(res.structured.shared, true);
  assert.match(res.text, /Состав туда не пошёл/);
});

test('правила про область видимости рецепта доехали до инструкций', () => {
  const { instructions } = build(fakeCuratorApi());
  assert.match(instructions, /heys_get_recipe/);
  assert.match(instructions, /recipe_patch/);
  assert.match(instructions, /в общую базу блюдо с составом само не уходит/);
  // Состав блюда — данные, а не устройство: до этой строки агент уходил
  // читать heys_models_v1.js вместо одного вызова инструмента.
  assert.match(instructions, /что внутри блюда/);
  assert.ok(instructions.includes('heys_code_* и чтение heys_models_v1.js здесь не нужны'));
});
