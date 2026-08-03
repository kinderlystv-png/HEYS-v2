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
];

/** Подставной API: данные раздельно по клиентам, фиксация кураторских записей. */
function fakeCuratorApi({ clients = CLIENTS } = {}) {
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
  const writes = [];
  const contexts = [];
  const batchReads = [];
  return {
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
    async getSharedProducts() {
      return { data: SHARED, error: null };
    },
  };
}

function build(api) {
  return createCuratorContext({ api, curatorJwt: JWT, curatorName: 'Кин', nowMs: NOW });
}

test('list_clients отдаёт клиентов куратора', async () => {
  const { tools } = build(fakeCuratorApi());
  const res = await tools.heys_list_clients({});
  assert.equal(res.structured.clients.length, 2);
  assert.match(res.text, /Антон/);
  assert.match(res.text, /Александра/);
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
  const anton = await tools.heys_search_products({ client: 'Антон', query: 'кофе' });
  assert.ok(anton.structured.results.some((p) => p.name === 'Кофе американо'));
  const alexandra = await tools.heys_search_products({ client: 'Александра', query: 'кофе' });
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

test('кураторские схемы: свои инструменты сверху и параметр client везде, кроме списка клиентов', () => {
  const schemas = buildCuratorSchemas();
  const added = [
    'heys_list_clients', 'heys_list_inbox', 'heys_moderate_products', 'heys_create_client',
    'heys_client_access', 'heys_manage_subscription', 'heys_trial_queue', 'heys_leads',
    'heys_get_client_health', 'heys_list_messages', 'heys_get_photo', 'heys_mark_message_done',
    'heys_reply_message',
  ];
  assert.equal(schemas.length, TOOL_SCHEMAS.length + added.length);
  assert.deepEqual(schemas.slice(0, added.length).map((s) => s.name), added);
  for (const schema of schemas) {
    if (CLIENTLESS_TOOLS.has(schema.name)) {
      assert.equal(schema.inputSchema.properties.client, undefined, `${schema.name}: адресат не нужен`);
      continue;
    }
    assert.ok(schema.inputSchema.properties.client, `${schema.name}: есть параметр client`);
  }
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
});

// ── Форма входа ──────────────────────────────────────────────────────────

test('страница входа содержит обе формы и экранирует кураторский email', () => {
  const req = { clientId: 'c', redirectUri: 'https://x/cb', state: 's', codeChallenge: 'cc', resource: '', clientName: 'Claude' };
  const page = oauth.renderLoginPage(req);
  assert.equal((page.match(/<form/g) || []).length, 2);
  assert.match(page, /Я куратор/);
  assert.match(page, /name="mfa_code"/);
  // В кураторском режиме секция раскрыта, а клиентские поля не required.
  const curatorPage = oauth.renderLoginPage(req, { curatorMode: true, email: '<img src=x>' });
  assert.match(curatorPage, /<details open>/);
  assert.equal(curatorPage.includes('<img src=x>'), false);
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

  assert.equal(api.batchReads.length, 1, 'три дня — один запрос');
  assert.equal(api.batchReads[0].clientId, 'cid-anton');
  assert.deepEqual(api.batchReads[0].keys, [
    'heys_dayv2_2026-07-30', 'heys_dayv2_2026-07-31', 'heys_dayv2_2026-08-01',
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
});

test('правило про фото доехало до инструкций', () => {
  const { instructions } = build(fakeCuratorApi());
  assert.match(instructions, /heys_get_photo/);
  assert.match(instructions, /Не листай ими весь тред/);
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

test('правила задачника пронумерованы подряд и без пропусков', () => {
  const numbers = TASKS_RULES().map((line) => Number(/^З(\d+)\./.exec(line)[1]));
  assert.ok(numbers.length >= 21, 'правил не стало меньше, чем было');
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1));
});

test('полномочия остались дословно — их эксперимент не проверял', () => {
  const rules = TASKS_RULES().join('\n');
  // Галочки: единственное, что стоит между агентом и «закрыл за него».
  assert.match(rules, /Задачи и подпункты закрывает только он/);
  assert.match(rules, /Сам галочки не ставь/);
  // Деньги: зона «спрашивай, а не действуй».
  assert.match(rules, /движение лимитов[\s\S]*только через него/);
  assert.match(rules, /В money\/budget\.md не пиши ничего/);
  // Наружу — ничего без его слова.
  assert.match(rules, /галочка и оценка дня — его слова, не твой вывод/);
});

test('форматы записи и границы инструментов остались — на них держатся данные', () => {
  const rules = TASKS_RULES().join('\n');
  // Формат: строка операции, слот против задачи, адрес задачи, потолок доски.
  assert.match(rules, /tasks_money/);
  assert.match(rules, /добавь строку-поправку, задним числом не правь/);
  assert.match(rules, /Событие галочкой не закрывается/);
  assert.match(rules, /нерешённых развилок/);   // число задаётся OPEN_DECISIONS_CAP, тест стережёт само правило
  // Границы: что инструмент физически не умеет — это факт, а не указание.
  assert.match(rules, /Пересечение по времени он не видит вовсе/);
  assert.match(rules, /tasks_link связывает только две задачи проектов/);
  assert.match(rules, /Поиск такую пару не находит никогда/);
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
  for (const tool of ['tasks_delta', 'tasks_list', 'tasks_context', 'tasks_calendar', 'tasks_budget', 'tasks_review', 'tasks_focus']) {
    assert.match(rules, new RegExp(tool), `${tool} остался в описи инструментов`);
  }
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

// ── Недельный эксперимент «два ответа» ───────────────────────────────────

// Соседний тест в tasks.test.cjs берёт даты с запасом; здесь проверяется сама
// граница — последний час эксперимента и первый час после него.
test('эксперимент выключается ровно на границе срока', () => {
  const before = curatorInstructions('Антон', true, Date.UTC(2026, 7, 5, 20, 0));
  assert.match(before, /Эксперимент до 2026-08-05 включительно/);
  assert.match(before, /tasks_vote/);

  const after = curatorInstructions('Антон', true, Date.UTC(2026, 7, 5, 21, 0));
  assert.doesNotMatch(after, /Эксперимент до 2026-08-05/);
  assert.doesNotMatch(after, /tasks_vote/);
  // Сами правила задачника от этого не страдают.
  assert.match(after, /Задачи и подпункты закрывает только он/);
});

test('эксперимент сравнивает урезанные правила со свободой, а не мёртвую процедуру', () => {
  const block = curatorInstructions('Антон', true, Date.UTC(2026, 7, 3))
    .split('\n')
    .filter((line) => /^Э\d+\./.test(line))
    .join('\n');
  // Ссылок на срезанную процедуру в эксперименте остаться не могло.
  assert.doesNotMatch(block, /З2:/);
  assert.doesNotMatch(block, /З17/);
  assert.doesNotMatch(block, /дельта → список → контекст/);
  assert.match(block, /по правилам задачника/);
  // Механика записи не тронута: голос без tasks_vote не существует.
  assert.match(block, /tasks_vote/);
  assert.match(block, /Полномочия действуют в обоих/);
});

test('эксперимент не включается без задачника', () => {
  const plain = curatorInstructions('Антон', false, Date.UTC(2026, 7, 3));
  assert.doesNotMatch(plain, /Эксперимент до 2026-08-05/);
  assert.doesNotMatch(plain, /^З1\./m);
});

// ── Планёрка ─────────────────────────────────────────────────────────────
//
// Правила ищутся по смыслу, а не по номеру: нумерация уже один раз ломала
// тесты при вставке правила в середину, и привязываться к «З24» значит
// подложить ту же мину следующему.

test('планёрка названа в правилах и зовётся своим инструментом', () => {
  const rule = TASKS_RULES().find((line) => /планёрк/i.test(line) && /tasks_standup/.test(line));
  assert.ok(rule, 'про планёрку в правилах сказано');
  assert.match(rule, /tasks_standup/);
  // Смысл сущности — не собирать повестку руками.
  assert.match(rule, /не собирай повестку руками/);
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
  const rule = TASKS_RULES().find((line) => /обсудим на планёрке/i.test(line));
  assert.ok(rule, 'фраза названа дословно — по ней правило и срабатывает');
  assert.match(rule, /tasks_standup/);
  assert.match(rule, /в том же ходе/);
});

test('посчитанное и замеченное в правилах разведены и названы по-разному', () => {
  const rule = TASKS_RULES().find((line) => /«Замечено»/.test(line));
  assert.ok(rule, 'правило объясняет разницу между двумя списками');
  assert.match(rule, /посчитаны по файлам/, 'расхождения — факты');
  assert.match(rule, /называй их утверждением/);
  // Смысловое наблюдение разрешено, но только вопросом: подтвердить его может
  // один человек, и поданное утверждением оно становится выдумкой.
  assert.match(rule, /только вопросом к нему/);
  assert.match(rule, /tasks_standup/);
});

test('размен «спрошу, зато научусь» назван целиком, вместе с его условиями', () => {
  const rule = TASKS_RULES().find((line) => /Цена замеченного/.test(line));
  assert.ok(rule, 'правило называет цену наблюдения и чем она обеспечена');
  // Обе стороны цитатами — иначе он идёт проверять сам.
  assert.match(rule, /sides/);
  assert.match(rule, /цитатами с указанием файла/);
  // Ответ обязан записываться, иначе завтра будет задан тот же вопрос.
  assert.match(rule, /tasks_standup с done и answer/);
  assert.match(rule, /tasks_learn/);
  // Повтор и объём ограничены, и правило говорит, чем именно это грозит.
  assert.match(rule, /Отвеченное молчит навсегда/);
  assert.match(rule, /не больше трёх/);
});

test('напоминание и задача в правилах разведены, и отказ без дня имеет адрес', () => {
  const rule = TASKS_RULES().find((line) => /tasks_remind/.test(line));
  assert.ok(rule, 'правило говорит, когда звать напоминание');
  // Вся разница держится на одной фразе: задачу делают, о напоминании вспоминают.
  assert.match(rule, /о напоминании вспоминают/);
  assert.match(rule, /загруженность/, 'сказано, чем плохо заводить такое задачей');
  // Про место система не знает ничего — и правило не должно обещать обратного.
  assert.match(rule, /не сработает никогда/);
  assert.match(rule, /тегом места/);
});

test('быстрые дела в правилах названы видом, а не сущностью', () => {
  const rule = TASKS_RULES().find((line) => /tasks_quick/.test(line));
  assert.ok(rule, 'правило говорит, чем показывать быстрые дела');
  assert.match(rule, /отдельной сущностью не заводятся/);
  assert.match(rule, /в двух/, 'названа причина: задача оказалась бы в двух местах');
  assert.match(rule, /#15min/, 'механика видна — это тег на обычной задаче');
  // Пустой список тут норма, и об этом обязан знать не только код.
  assert.match(rule, /а не «дел нет»/);
});

test('правило про идеи отделяет их и от задач, и от «когда-нибудь»', () => {
  const rule = TASKS_RULES().find((line) => /tasks_idea/.test(line));
  assert.ok(rule, 'правило говорит, когда мысль идёт в идеи');
  assert.match(rule, /закрыть галочкой/, 'признак задачи назван проверяемо');
  assert.match(rule, /развивают/, 'признак идеи — её дописывают, а не делают');
  assert.match(rule, /to_project/, 'выход из идей назван');
  assert.match(rule, /накопленное переезжает/);
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
