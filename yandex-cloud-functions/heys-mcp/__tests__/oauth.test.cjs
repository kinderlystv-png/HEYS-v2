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

test('refresh выдаёт новую пару и сохраняет привязку к клиенту HEYS', () => {
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
  const refreshed = oauth.exchangeRefreshToken({
    refresh_token: first.tokens.refresh_token,
    client_id: reg.registration.client_id,
  }, SECRET);
  assert.equal(refreshed.ok, true);
  const auth = oauth.authenticateAccessToken(`Bearer ${refreshed.tokens.access_token}`, SECRET);
  assert.equal(auth.sessionToken, SESSION);
});

test('access-токен нельзя подсунуть вместо refresh и наоборот', () => {
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

  assert.equal(oauth.exchangeRefreshToken({ refresh_token: pair.access_token }, SECRET).ok, false);
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
