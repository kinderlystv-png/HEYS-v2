'use strict';

/**
 * Кураторский режим: один коннектор — все клиенты куратора.
 * Главное, что здесь проверяется, — невозможность записи «не тому клиенту»
 * без явного указания цели и адресность каждого ответа.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createCuratorContext, buildCuratorSchemas } = require('../lib/curator');
const { TOOL_SCHEMAS } = require('../lib/tools');
const oauth = require('../lib/oauth');
const tokens = require('../lib/crypto-tokens');
const mcp = require('../lib/mcp');

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
  return {
    writes,
    contexts,
    stats: { calls: 0, ms: 0 },
    async listClients(bearer) {
      assert.equal(bearer, JWT, 'список клиентов запрашивается с кураторским JWT');
      return { data: clients, error: null };
    },
    async getKVByCurator(bearer, clientId, key) {
      assert.equal(bearer, JWT);
      return { data: (kv[clientId] && kv[clientId][key]) ?? null, error: null };
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

test('кураторские схемы: +heys_list_clients и параметр client в каждом инструменте', () => {
  const schemas = buildCuratorSchemas();
  assert.equal(schemas.length, TOOL_SCHEMAS.length + 1);
  assert.equal(schemas[0].name, 'heys_list_clients');
  for (const schema of schemas.slice(1)) {
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
  assert.equal(list.result.tools.length, TOOL_SCHEMAS.length + 1);
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
