'use strict';

/**
 * Минимальный OAuth 2.1 authorization server для custom connector claude.ai.
 *
 * Почему именно OAuth, а не заголовок с токеном: в claude.ai у кастомного
 * коннектора нет поля «Authorization», подключение идёт только через OAuth с
 * Dynamic Client Registration. Поэтому сервер обязан сам уметь DCR + PKCE.
 *
 * Состояние не хранится: client_id, authorization code, access и refresh
 * токены — это подписанные HS256-структуры. Отзыв доступа делается не удалением
 * строки, а `revoke_session` на клиентской сессии HEYS, которая зашифрована
 * внутри токена: после отзыва все инструменты мгновенно перестают работать.
 */

const { signToken, verifyToken, encryptSecret, decryptSecret, verifyPkce } = require('./crypto-tokens');

const SCOPE = 'heys:diary';
const CODE_TTL_SECONDS = 300;            // 5 минут на обмен кода
const ACCESS_TTL_SECONDS = 3600;         // 1 час: короткий, потому что отзыв stateless
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;
const CLIENT_TTL_SECONDS = 60 * 60 * 24 * 365;

function isHttpsUri(value) {
  try {
    const url = new URL(value);
    // localhost по HTTP разрешён спекой для нативных клиентов.
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch (_) {
    return false;
  }
}

function protectedResourceMetadata({ issuer, resource }) {
  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
  };
}

function authorizationServerMetadata({ issuer }) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/mcp/authorize`,
    token_endpoint: `${issuer}/mcp/token`,
    registration_endpoint: `${issuer}/mcp/register`,
    scopes_supported: [SCOPE],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}

/**
 * DCR: client_id сам по себе является подписанной регистрацией — в нём лежат
 * разрешённые redirect_uri. Так регистрация переживает холодный старт без БД.
 */
function registerClient(body, secret, nowMs = Date.now()) {
  const redirectUris = Array.isArray(body && body.redirect_uris) ? body.redirect_uris : [];
  if (!redirectUris.length) {
    return { ok: false, error: 'invalid_redirect_uri', description: 'redirect_uris is required' };
  }
  if (redirectUris.length > 5 || !redirectUris.every((uri) => typeof uri === 'string' && isHttpsUri(uri))) {
    return { ok: false, error: 'invalid_redirect_uri', description: 'redirect_uris must be https (or localhost) and at most 5' };
  }
  const clientName = typeof body.client_name === 'string' ? body.client_name.slice(0, 120) : 'mcp-client';
  const clientId = signToken({ ru: redirectUris, cn: clientName }, secret, {
    typ: 'heys-mcp-client',
    ttlSeconds: CLIENT_TTL_SECONDS,
    nowMs,
  });
  return {
    ok: true,
    registration: {
      client_id: clientId,
      client_id_issued_at: Math.floor(nowMs / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    },
  };
}

function parseClientId(clientId, secret, nowMs = Date.now()) {
  const verified = verifyToken(clientId, secret, { typ: 'heys-mcp-client', nowMs });
  if (!verified.ok) return null;
  return { redirectUris: verified.claims.ru || [], clientName: verified.claims.cn || '' };
}

/**
 * Валидация authorize-запроса до показа формы: если client_id или redirect_uri
 * не сходятся, редиректить ошибку некуда — показываем её на своей странице.
 */
function validateAuthorizeRequest(query, secret, nowMs = Date.now()) {
  const clientId = query.client_id;
  const client = clientId ? parseClientId(clientId, secret, nowMs) : null;
  if (!client) return { ok: false, fatal: true, error: 'invalid_client', description: 'Неизвестный или просроченный client_id.' };

  const redirectUri = query.redirect_uri;
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { ok: false, fatal: true, error: 'invalid_request', description: 'redirect_uri не совпадает с зарегистрированным.' };
  }
  if (query.response_type !== 'code') {
    return { ok: false, fatal: false, redirectUri, error: 'unsupported_response_type', description: 'Поддерживается только response_type=code.' };
  }
  if (query.code_challenge_method !== 'S256' || !query.code_challenge) {
    return { ok: false, fatal: false, redirectUri, error: 'invalid_request', description: 'Требуется PKCE с code_challenge_method=S256.' };
  }
  return {
    ok: true,
    clientId,
    clientName: client.clientName,
    redirectUri,
    state: typeof query.state === 'string' ? query.state : '',
    codeChallenge: query.code_challenge,
    resource: typeof query.resource === 'string' ? query.resource : '',
  };
}

function issueAuthorizationCode(params, secret, nowMs = Date.now()) {
  return signToken({
    cid: params.clientId,
    ru: params.redirectUri,
    cc: params.codeChallenge,
    sub: params.heysClientId,
    st: encryptSecret(params.sessionToken, secret),
    aud: params.resource || '',
  }, secret, { typ: 'heys-mcp-code', ttlSeconds: CODE_TTL_SECONDS, nowMs });
}

function issueTokenPair(claims, secret, nowMs = Date.now()) {
  const base = { sub: claims.sub, cid: claims.cid, st: claims.st, aud: claims.aud || '' };
  return {
    access_token: signToken(base, secret, { typ: 'heys-mcp-access', ttlSeconds: ACCESS_TTL_SECONDS, nowMs }),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: signToken(base, secret, { typ: 'heys-mcp-refresh', ttlSeconds: REFRESH_TTL_SECONDS, nowMs }),
    scope: SCOPE,
  };
}

function exchangeAuthorizationCode(form, secret, nowMs = Date.now()) {
  const verified = verifyToken(form.code, secret, { typ: 'heys-mcp-code', nowMs });
  if (!verified.ok) return { ok: false, error: 'invalid_grant', description: 'Код недействителен или истёк.' };
  const claims = verified.claims;

  if (form.client_id !== claims.cid) {
    return { ok: false, error: 'invalid_client', description: 'client_id не совпадает с выданным кодом.' };
  }
  if (form.redirect_uri !== claims.ru) {
    return { ok: false, error: 'invalid_grant', description: 'redirect_uri не совпадает с authorize-запросом.' };
  }
  if (!verifyPkce(form.code_verifier, claims.cc)) {
    return { ok: false, error: 'invalid_grant', description: 'PKCE-проверка не пройдена.' };
  }
  return { ok: true, tokens: issueTokenPair(claims, secret, nowMs) };
}

function exchangeRefreshToken(form, secret, nowMs = Date.now()) {
  const verified = verifyToken(form.refresh_token, secret, { typ: 'heys-mcp-refresh', nowMs });
  if (!verified.ok) return { ok: false, error: 'invalid_grant', description: 'Refresh-токен недействителен или истёк.' };
  if (form.client_id && form.client_id !== verified.claims.cid) {
    return { ok: false, error: 'invalid_client', description: 'client_id не совпадает с refresh-токеном.' };
  }
  return { ok: true, tokens: issueTokenPair(verified.claims, secret, nowMs) };
}

/** Проверка Bearer на MCP-эндпоинте: отдаёт клиентскую сессию HEYS. */
function authenticateAccessToken(authorizationHeader, secret, nowMs = Date.now()) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorizationHeader || '').trim());
  if (!match) return { ok: false, error: 'missing_token' };
  const verified = verifyToken(match[1], secret, { typ: 'heys-mcp-access', nowMs });
  if (!verified.ok) return { ok: false, error: verified.error };
  let sessionToken;
  try {
    sessionToken = decryptSecret(verified.claims.st, secret);
  } catch (_) {
    return { ok: false, error: 'invalid_token' };
  }
  return { ok: true, clientId: verified.claims.sub, sessionToken };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Страница входа: телефон + PIN, те же, что в приложении. */
function renderLoginPage(request, { error = '', phone = '' } = {}) {
  const hidden = [
    ['client_id', request.clientId],
    ['redirect_uri', request.redirectUri],
    ['state', request.state],
    ['code_challenge', request.codeChallenge],
    ['resource', request.resource],
  ].map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>HEYS — доступ для ассистента</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background:#f4f5f7; color:#1c1d22; padding:24px; }
  .card { width:100%; max-width:360px; background:#fff; border-radius:16px; padding:28px;
          box-shadow:0 12px 40px rgba(15,17,26,.10); }
  h1 { font-size:19px; margin:0 0 6px; }
  p.sub { font-size:14px; line-height:1.45; color:#5c6070; margin:0 0 20px; }
  label { display:block; font-size:13px; color:#5c6070; margin:14px 0 6px; }
  input[type=tel], input[type=password] { width:100%; box-sizing:border-box; padding:11px 13px;
          font-size:16px; border:1px solid #d7dae2; border-radius:10px; background:#fff; color:inherit; }
  button { width:100%; margin-top:22px; padding:12px; font-size:15px; font-weight:600; color:#fff;
           background:#2f6df6; border:0; border-radius:10px; cursor:pointer; }
  .err { margin:14px 0 0; padding:10px 12px; border-radius:10px; background:#fdecec; color:#b3261e; font-size:13px; }
  .foot { margin-top:18px; font-size:12px; color:#8a8f9e; line-height:1.5; }
  @media (prefers-color-scheme: dark) {
    body { background:#15161a; color:#eceef4; }
    .card { background:#1e2027; box-shadow:none; }
    input[type=tel], input[type=password] { background:#15161a; border-color:#333744; }
    .err { background:#3a1f1f; color:#ff9a92; }
  }
</style>
</head>
<body>
  <form class="card" method="post" action="/mcp/authorize">
    <h1>Доступ к дневнику HEYS</h1>
    <p class="sub">${escapeHtml(request.clientName || 'Приложение')} запрашивает доступ к вашему дневнику питания, воды, сна и тренировок.</p>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
    ${hidden}
    <label for="phone">Телефон</label>
    <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 900 000-00-00" value="${escapeHtml(phone)}" required>
    <label for="pin">PIN</label>
    <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]*" maxlength="6" required>
    <button type="submit">Разрешить доступ</button>
    <p class="foot">Доступ можно в любой момент отозвать: выйдите из аккаунта в приложении — сессия ассистента прекратится вместе с вашей.</p>
  </form>
</body>
</html>`;
}

function renderErrorPage(title, description) {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>HEYS — ошибка</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f4f5f7;color:#1c1d22;padding:24px}
.card{max-width:380px;background:#fff;border-radius:16px;padding:28px;box-shadow:0 12px 40px rgba(15,17,26,.1)}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;line-height:1.5;color:#5c6070;margin:0}</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div></body></html>`;
}

function buildRedirect(redirectUri, params) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  return url.toString();
}

module.exports = {
  SCOPE,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  CODE_TTL_SECONDS,
  isHttpsUri,
  protectedResourceMetadata,
  authorizationServerMetadata,
  registerClient,
  parseClientId,
  validateAuthorizeRequest,
  issueAuthorizationCode,
  issueTokenPair,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  authenticateAccessToken,
  renderLoginPage,
  renderErrorPage,
  buildRedirect,
  escapeHtml,
};
