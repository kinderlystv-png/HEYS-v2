'use strict';

/**
 * Кураторский режим: один коннектор — все клиенты куратора.
 * Главное, что здесь проверяется, — невозможность записи «не тому клиенту»
 * без явного указания цели и адресность каждого ответа.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createCuratorContext, buildCuratorSchemas, CLIENTLESS_TOOLS } = require('../lib/curator');
const { TOOL_SCHEMAS } = require('../lib/tools');
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

test('единственный клиент подставляется без параметра', async () => {
  const api = fakeCuratorApi({ clients: [CLIENTS[1]] });
  const { tools } = build(api);
  const res = await tools.heys_add_water({ ml: 100 });
  assert.equal(api.writes[0].clientId, 'cid-alexandra');
  assert.match(res.text, /^\[Александра\]/);
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
    'heys_get_client_health', 'heys_list_messages', 'heys_mark_message_done', 'heys_reply_message',
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

test('refresh перевыпускает кураторский JWT, совместимый с verifyJwt из heys-api-rpc', () => {
  const { exchanged, clientId } = curatorTokens();
  const later = NOW + 3600 * 1000;
  const refreshed = oauth.exchangeRefreshToken(
    { refresh_token: exchanged.tokens.refresh_token, client_id: clientId },
    SECRET, later, { rawJwtSecret: RAW_JWT_SECRET },
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

test('refresh без rawJwtSecret не ломается: кураторский JWT остаётся прежним', () => {
  const { exchanged } = curatorTokens();
  const refreshed = oauth.exchangeRefreshToken({ refresh_token: exchanged.tokens.refresh_token }, SECRET, NOW + 1000);
  assert.equal(refreshed.ok, true);
  const auth = oauth.authenticateAccessToken(`Bearer ${refreshed.tokens.access_token}`, SECRET, NOW + 1000);
  assert.equal(auth.sessionToken, JWT);
});

test('клиентский refresh не трогает client-session даже при наличии rawJwtSecret', () => {
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
  const refreshed = oauth.exchangeRefreshToken(
    { refresh_token: pair.tokens.refresh_token }, SECRET, NOW + 1000, { rawJwtSecret: RAW_JWT_SECRET },
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
  assert.equal(list.result.tools.length, TOOL_SCHEMAS.length + 12);
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
  assert.match(instructions, /heys_mark_message_done/);
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
  assert.match(instructions, /heys_get_period/);
  assert.match(instructions, /heys_list_inbox/);
});
