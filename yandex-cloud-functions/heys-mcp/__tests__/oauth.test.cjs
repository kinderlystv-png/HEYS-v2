'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const oauth = require('../lib/oauth');
const tokens = require('../lib/crypto-tokens');

const SECRET = 'x'.repeat(48);
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const SESSION = 'a1b2c3d4e5f6'.repeat(4);
const HEYS_CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

function pkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
  return { verifier, challenge };
}

function registerAndAuthorize({ redirectUri = REDIRECT } = {}) {
  const reg = oauth.registerClient({ client_name: 'Claude', redirect_uris: [redirectUri] }, SECRET);
  const { verifier, challenge } = pkcePair();
  const validation = oauth.validateAuthorizeRequest({
    client_id: reg.registration.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'st-1',
  }, SECRET);
  return { reg, verifier, challenge, validation };
}

test('подписанный токен переживает round-trip и ловит подмену', () => {
  const token = tokens.signToken({ a: 1 }, SECRET, { typ: 't', ttlSeconds: 60 });
  assert.equal(tokens.verifyToken(token, SECRET, { typ: 't' }).ok, true);
  assert.equal(tokens.verifyToken(token, SECRET, { typ: 'другой' }).error, 'wrong_token_type');
  assert.equal(tokens.verifyToken(token, 'y'.repeat(48), { typ: 't' }).error, 'bad_signature');
  assert.equal(tokens.verifyToken(`${token}x`, SECRET, { typ: 't' }).error, 'bad_signature');
});

test('истёкший токен отклоняется', () => {
  const token = tokens.signToken({ a: 1 }, SECRET, { typ: 't', ttlSeconds: 10, nowMs: 0 });
  assert.equal(tokens.verifyToken(token, SECRET, { typ: 't', nowMs: 20000 }).error, 'token_expired');
});

test('session-токен внутри access-токена зашифрован, а не лежит в открытую', () => {
  const cipher = tokens.encryptSecret(SESSION, SECRET);
  assert.equal(cipher.includes(SESSION), false);
  assert.equal(tokens.decryptSecret(cipher, SECRET), SESSION);
  assert.throws(() => tokens.decryptSecret(cipher, 'z'.repeat(48)));
});

test('DCR требует https redirect_uri', () => {
  assert.equal(oauth.registerClient({ redirect_uris: [] }, SECRET).ok, false);
  assert.equal(oauth.registerClient({ redirect_uris: ['http://evil.example/cb'] }, SECRET).ok, false);
  assert.equal(oauth.registerClient({ redirect_uris: ['http://localhost:8976/cb'] }, SECRET).ok, true);
  assert.equal(oauth.registerClient({ redirect_uris: [REDIRECT] }, SECRET).ok, true);
});

test('DCR возвращает зарегистрированные OAuth-метаданные по RFC 7591', () => {
  const result = oauth.registerClient({
    client_name: 'ChatGPT',
    redirect_uris: ['https://chatgpt.com/connector/oauth/test-callback'],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: 'heys:diary',
    client_uri: 'https://chatgpt.com',
    contacts: ['support@openai.com'],
    software_id: 'chatgpt',
  }, SECRET);

  assert.equal(result.ok, true);
  assert.deepEqual(result.registration.redirect_uris, ['https://chatgpt.com/connector/oauth/test-callback']);
  assert.deepEqual(result.registration.grant_types, ['authorization_code']);
  assert.deepEqual(result.registration.response_types, ['code']);
  assert.equal(result.registration.token_endpoint_auth_method, 'none');
  assert.equal(result.registration.scope, 'heys:diary');
  assert.equal(result.registration.client_uri, 'https://chatgpt.com');
  assert.deepEqual(result.registration.contacts, ['support@openai.com']);
  assert.equal(result.registration.software_id, 'chatgpt');
  assert.equal(typeof result.registration.client_id, 'string');
  assert.equal(typeof result.registration.client_id_issued_at, 'number');
});

test('DCR fail-closed отклоняет неподдерживаемые grant, response type и auth method', () => {
  const base = { redirect_uris: [REDIRECT] };
  assert.equal(oauth.registerClient({ ...base, grant_types: ['client_credentials'] }, SECRET).ok, false);
  assert.equal(oauth.registerClient({ ...base, grant_types: [] }, SECRET).ok, false);
  assert.equal(oauth.registerClient({ ...base, response_types: ['token'] }, SECRET).ok, false);
  assert.equal(oauth.registerClient({ ...base, response_types: [] }, SECRET).ok, false);
  assert.equal(oauth.registerClient({ ...base, token_endpoint_auth_method: 'client_secret_post' }, SECRET).ok, false);
  assert.equal(oauth.registerClient({ ...base, scope: 'admin' }, SECRET).ok, false);
});

// ── SEC-030: allowlist redirect-хостов ───────────────────────────────────────
//
// Открытая DCR + страница, собирающая пароль и код 2FA, давали фишинг на
// легитимном домене: атакующий регистрировал клиента с redirect_uri на себя и
// присылал куратору ссылку на настоящий /mcp/authorize.

test('SEC-030: DCR отклоняет посторонний https-хост', () => {
  assert.equal(oauth.registerClient({ redirect_uris: ['https://evil.tld/cb'] }, SECRET).ok, false);
  assert.equal(oauth.registerClient({ redirect_uris: ['https://claude.ai.evil.tld/cb'] }, SECRET).ok, false);
  assert.equal(oauth.registerClient({ redirect_uris: ['https://chatgpt.com.evil.tld/cb'] }, SECRET).ok, false);
  assert.equal(oauth.registerClient({ redirect_uris: ['https://notclaude.ai/cb'] }, SECRET).ok, false);
});

test('SEC-030: известные адреса ChatGPT, Anthropic и loopback проходят', () => {
  for (const uri of [
    'https://chatgpt.com/connector/oauth/test-callback',
    'https://chatgpt.com/connector_platform_oauth_redirect',
    REDIRECT,
    'https://claude.com/api/mcp/auth_callback',
    'https://console.anthropic.com/cb',
    'http://localhost:53123/callback',
    'http://127.0.0.1:8976/cb',
  ]) {
    assert.equal(oauth.registerClient({ redirect_uris: [uri] }, SECRET).ok, true, uri);
  }
});

test('SEC-030: allowlist переопределяется переменной окружения', () => {
  const saved = process.env.MCP_ALLOWED_REDIRECT_HOSTS;
  try {
    process.env.MCP_ALLOWED_REDIRECT_HOSTS = 'partner.example, *.vendor.example';
    assert.equal(oauth.registerClient({ redirect_uris: ['https://partner.example/cb'] }, SECRET).ok, true);
    assert.equal(oauth.registerClient({ redirect_uris: ['https://a.vendor.example/cb'] }, SECRET).ok, true);
    // Переопределение заменяет список целиком — дефолты больше не действуют.
    assert.equal(oauth.registerClient({ redirect_uris: [REDIRECT] }, SECRET).ok, false);
  } finally {
    if (saved === undefined) delete process.env.MCP_ALLOWED_REDIRECT_HOSTS;
    else process.env.MCP_ALLOWED_REDIRECT_HOSTS = saved;
  }
});

test('SEC-030: client_id, выданный до фикса, не проходит authorize', () => {
  // Регистрация с чужим хостом — как если бы client_id выдали до allowlist'а.
  const saved = process.env.MCP_ALLOWED_REDIRECT_HOSTS;
  let clientId;
  try {
    process.env.MCP_ALLOWED_REDIRECT_HOSTS = 'evil.tld';
    clientId = oauth.registerClient({ redirect_uris: ['https://evil.tld/cb'] }, SECRET).registration.client_id;
  } finally {
    if (saved === undefined) delete process.env.MCP_ALLOWED_REDIRECT_HOSTS;
    else process.env.MCP_ALLOWED_REDIRECT_HOSTS = saved;
  }
  const result = oauth.validateAuthorizeRequest({
    client_id: clientId,
    redirect_uri: 'https://evil.tld/cb',
    response_type: 'code',
    code_challenge: 'x',
    code_challenge_method: 'S256',
  }, SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.fatal, true);
});

test('SEC-030: страница согласия показывает получателя кода', () => {
  const { validation } = registerAndAuthorize();
  const page = oauth.renderLoginPage(validation);
  assert.ok(page.includes('https://claude.ai'), 'origin получателя должен быть виден');
  assert.match(page, /HEYS его не проверяет/, 'имя приложения помечено как непроверенное');
});

test('SEC-030: имя приложения не может внести разметку в страницу', () => {
  const reg = oauth.registerClient(
    { redirect_uris: [REDIRECT], client_name: '<img src=x onerror=alert(1)>' },
    SECRET,
  );
  const { challenge } = pkcePair();
  const validation = oauth.validateAuthorizeRequest({
    client_id: reg.registration.client_id,
    redirect_uri: REDIRECT,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }, SECRET);
  const page = oauth.renderLoginPage(validation);
  assert.ok(!page.includes('<img src=x'), 'имя приложения обязано быть экранировано');
  assert.ok(page.includes('&lt;img src=x'));
});

test('SEC-031: страница не обещает куратору мгновенного отзыва', () => {
  const { validation } = registerAndAuthorize();
  const page = oauth.renderLoginPage(validation);
  assert.ok(!page.includes('отключить коннектор в Claude'), 'старое ложное обещание убрано');
  assert.match(page, /мгновенного отзыва нет/);
  assert.match(page, /ChatGPT или Claude/);
});

test('SEC-030: согласие называет реальный объём кураторского доступа', () => {
  const { validation } = registerAndAuthorize();
  const page = oauth.renderLoginPage(validation);
  for (const capability of ['подписк', 'PIN', 'лид', 'переписк']) {
    assert.ok(page.includes(capability), `в согласии не назван доступ: ${capability}`);
  }
});

test('authorize отвергает redirect_uri, не указанный при регистрации', () => {
  const reg = oauth.registerClient({ redirect_uris: [REDIRECT] }, SECRET);
  const result = oauth.validateAuthorizeRequest({
    client_id: reg.registration.client_id,
    redirect_uri: 'https://attacker.example/cb',
    response_type: 'code',
    code_challenge: 'x',
    code_challenge_method: 'S256',
  }, SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.fatal, true);
});

test('authorize требует PKCE S256 — plain не принимается', () => {
  const reg = oauth.registerClient({ redirect_uris: [REDIRECT] }, SECRET);
  const result = oauth.validateAuthorizeRequest({
    client_id: reg.registration.client_id,
    redirect_uri: REDIRECT,
    response_type: 'code',
    code_challenge: 'x',
    code_challenge_method: 'plain',
  }, SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.fatal, false);
  assert.equal(result.error, 'invalid_request');
});

test('полный цикл: код → токены → доступ к сессии HEYS', () => {
  const { reg, verifier, validation } = registerAndAuthorize();
  const code = oauth.issueAuthorizationCode({
    clientId: validation.clientId,
    redirectUri: validation.redirectUri,
    codeChallenge: validation.codeChallenge,
    heysClientId: HEYS_CLIENT,
    sessionToken: SESSION,
  }, SECRET);

  const exchanged = oauth.exchangeAuthorizationCode({
    code,
    client_id: reg.registration.client_id,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  }, SECRET);
  assert.equal(exchanged.ok, true);

  const auth = oauth.authenticateAccessToken(`Bearer ${exchanged.tokens.access_token}`, SECRET);
  assert.equal(auth.ok, true);
  assert.equal(auth.clientId, HEYS_CLIENT);
  assert.equal(auth.sessionToken, SESSION);
});

test('обмен кода без верного PKCE-verifier не проходит', () => {
  const { reg, validation } = registerAndAuthorize();
  const code = oauth.issueAuthorizationCode({
    clientId: validation.clientId,
    redirectUri: validation.redirectUri,
    codeChallenge: validation.codeChallenge,
    heysClientId: HEYS_CLIENT,
    sessionToken: SESSION,
  }, SECRET);
  const result = oauth.exchangeAuthorizationCode({
    code,
    client_id: reg.registration.client_id,
    redirect_uri: REDIRECT,
    code_verifier: crypto.randomBytes(48).toString('base64url'),
  }, SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'invalid_grant');
});

test('обмен кода на чужой redirect_uri не проходит', () => {
  const { reg, verifier, validation } = registerAndAuthorize();
  const code = oauth.issueAuthorizationCode({
    clientId: validation.clientId,
    redirectUri: validation.redirectUri,
    codeChallenge: validation.codeChallenge,
    heysClientId: HEYS_CLIENT,
    sessionToken: SESSION,
  }, SECRET);
  const result = oauth.exchangeAuthorizationCode({
    code,
    client_id: reg.registration.client_id,
    redirect_uri: 'https://claude.ai/other',
    code_verifier: verifier,
  }, SECRET);
  assert.equal(result.ok, false);
});

test('refresh выдаёт новую пару и сохраняет привязку к клиенту HEYS', async () => {
  const { reg, verifier, validation } = registerAndAuthorize();
  const code = oauth.issueAuthorizationCode({
    clientId: validation.clientId,
    redirectUri: validation.redirectUri,
    codeChallenge: validation.codeChallenge,
    heysClientId: HEYS_CLIENT,
    sessionToken: SESSION,
  }, SECRET);
  const first = oauth.exchangeAuthorizationCode({
    code, client_id: reg.registration.client_id, redirect_uri: REDIRECT, code_verifier: verifier,
  }, SECRET);
  const refreshed = await oauth.exchangeRefreshToken({
    refresh_token: first.tokens.refresh_token,
    client_id: reg.registration.client_id,
  }, SECRET);
  assert.equal(refreshed.ok, true);
  const auth = oauth.authenticateAccessToken(`Bearer ${refreshed.tokens.access_token}`, SECRET);
  assert.equal(auth.sessionToken, SESSION);
});

test('access-токен нельзя подсунуть вместо refresh и наоборот', async () => {
  const { reg, verifier, validation } = registerAndAuthorize();
  const code = oauth.issueAuthorizationCode({
    clientId: validation.clientId,
    redirectUri: validation.redirectUri,
    codeChallenge: validation.codeChallenge,
    heysClientId: HEYS_CLIENT,
    sessionToken: SESSION,
  }, SECRET);
  const pair = oauth.exchangeAuthorizationCode({
    code, client_id: reg.registration.client_id, redirect_uri: REDIRECT, code_verifier: verifier,
  }, SECRET).tokens;

  assert.equal((await oauth.exchangeRefreshToken({
    refresh_token: pair.access_token, client_id: reg.registration.client_id,
  }, SECRET)).ok, false);
  assert.equal(oauth.authenticateAccessToken(`Bearer ${pair.refresh_token}`, SECRET).ok, false);
  assert.equal(oauth.authenticateAccessToken(`Bearer ${code}`, SECRET).ok, false);
});

test('без Bearer-заголовка доступа нет', () => {
  assert.equal(oauth.authenticateAccessToken('', SECRET).ok, false);
  assert.equal(oauth.authenticateAccessToken('Basic abc', SECRET).ok, false);
});

test('метаданные указывают на собственные эндпоинты и только S256', () => {
  const meta = oauth.authorizationServerMetadata({ issuer: 'https://api.heyslab.ru' });
  assert.equal(meta.authorization_endpoint, 'https://api.heyslab.ru/mcp/authorize');
  assert.equal(meta.token_endpoint, 'https://api.heyslab.ru/mcp/token');
  assert.equal(meta.registration_endpoint, 'https://api.heyslab.ru/mcp/register');
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
  const resource = oauth.protectedResourceMetadata({ issuer: 'https://api.heyslab.ru', resource: 'https://api.heyslab.ru/mcp' });
  assert.deepEqual(resource.authorization_servers, ['https://api.heyslab.ru']);
});

test('страница входа экранирует подставляемые значения', () => {
  const page = oauth.renderLoginPage({
    clientId: 'cid', redirectUri: REDIRECT, state: '"><script>alert(1)</script>',
    codeChallenge: 'cc', resource: '', clientName: '<img src=x onerror=1>',
  });
  assert.equal(page.includes('<script>alert(1)</script>'), false);
  assert.equal(page.includes('<img src=x'), false);
  assert.ok(page.includes('&lt;img src=x'));
});
