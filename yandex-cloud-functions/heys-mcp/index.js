'use strict';

/**
 * heys-mcp — MCP-сервер HEYS для custom connector claude.ai.
 *
 * Один Cloud Function обслуживает три группы маршрутов:
 *   POST /mcp, POST /mcp/curator       — Streamable HTTP транспорт MCP
 *   /mcp/register|authorize|token      — OAuth 2.1 + DCR + PKCE
 *   /.well-known/oauth-*               — метаданные для авто-обнаружения
 *
 * `/mcp/curator` — тот же транспорт под вторым адресом. claude.ai держит один
 * коннектор на URL, поэтому личный клиентский и кураторский доступ не могут
 * жить на одном пути. Роль берётся из токена, не из адреса: путь только
 * разводит два независимых OAuth-подключения.
 *
 * Внешних зависимостей нет: подпись токенов — node:crypto, обращения к данным —
 * HTTPS-вызовы собственного /rpc. Прямого доступа к БД функция не имеет, поэтому
 * не может обойти серверные гарды дневника.
 */

const { initSecrets } = require('./shared/secrets');
const mcp = require('./lib/mcp');
const oauth = require('./lib/oauth');
const { createApiClient } = require('./lib/heys-api');
const { createTools } = require('./lib/tools');
const { createCuratorContext } = require('./lib/curator');

const DEFAULT_API_URL = 'https://api.heyslab.ru';

/**
 * Адреса MCP-транспорта. Каждый — самостоятельный OAuth resource: claude.ai
 * сверяет `resource` из метаданных с URL коннектора, поэтому метаданные и
 * заголовок 401 обязаны называть именно тот путь, по которому пришёл запрос.
 */
const MCP_ENDPOINTS = new Set(['/mcp', '/mcp/curator']);
const DEFAULT_MCP_ENDPOINT = '/mcp';

const PROTECTED_RESOURCE_PREFIX = '/.well-known/oauth-protected-resource';

/** Путь ресурса из адреса метаданных: .../oauth-protected-resource/mcp/curator → /mcp/curator. */
function resourcePathFromMetadataPath(path) {
  const suffix = String(path).slice(PROTECTED_RESOURCE_PREFIX.length);
  return MCP_ENDPOINTS.has(suffix) ? suffix : DEFAULT_MCP_ENDPOINT;
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Chrome extension OAuth popup блокирует form submit даже для явного production
  // origin. form-action намеренно не задан; scripts/base/frames остаются закрыты.
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};

/**
 * Метаданные и /mcp читает Anthropic из своего облака, поэтому CORS открыт
 * только для безопасных для чтения путей. Секретов эти ответы не содержат.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS, ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function html(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...extraHeaders },
    body,
  };
}

function redirect(location) {
  return { statusCode: 302, headers: { Location: location, ...SECURITY_HEADERS }, body: '' };
}

function getTokenSecret() {
  const explicit = process.env.MCP_TOKEN_SECRET;
  if (explicit && explicit.length >= 32) return explicit;
  // Домен-разделение внутри crypto-tokens позволяет переиспользовать JWT_SECRET
  // без риска пересечения с curator-JWT: ключи выводятся через HKDF с разными info.
  const fallback = process.env.JWT_SECRET;
  if (fallback && fallback.length >= 32) return fallback;
  return null;
}

function readBody(event) {
  if (!event || event.body == null) return '';
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : String(event.body);
}

function parseForm(raw) {
  const params = new URLSearchParams(raw || '');
  return Object.fromEntries(params.entries());
}

function normalizeHeaders(event) {
  const out = {};
  for (const [key, value] of Object.entries((event && event.headers) || {})) {
    out[String(key).toLowerCase()] = value;
  }
  return out;
}

function getPath(event) {
  const raw = (event && (event.path || event.url || (event.requestContext && event.requestContext.path))) || '/';
  const cut = String(raw).split('?')[0];
  return cut.replace(/\/+$/, '') || '/';
}

function getMethod(event) {
  return String((event && (event.httpMethod || event.method)) || 'GET').toUpperCase();
}

function issuerFrom(headers) {
  const host = headers['x-forwarded-host'] || headers.host || new URL(DEFAULT_API_URL).host;
  return `https://${String(host).split(',')[0].trim()}`;
}

async function handleMcpRequest(event, { headers, secret, apiUrl, resourcePath = DEFAULT_MCP_ENDPOINT }) {
  const auth = oauth.authenticateAccessToken(headers.authorization, secret);
  if (!auth.ok) {
    const issuer = issuerFrom(headers);
    // RFC 9728: 401 обязан показать, где искать метаданные ресурса —
    // по ним claude.ai сам находит authorization server и запускает OAuth.
    // Путь ресурса совпадает с адресом запроса, иначе второй коннектор уедет
    // за метаданными первого.
    return json(401, { error: 'invalid_token', error_description: 'Требуется авторизация HEYS.' }, {
      'WWW-Authenticate': `Bearer realm="heys-mcp", resource_metadata="${issuer}${PROTECTED_RESOURCE_PREFIX}${resourcePath}"`,
    });
  }

  let payload;
  try {
    payload = JSON.parse(readBody(event) || 'null');
  } catch (_) {
    return json(400, mcp.rpcError(null, mcp.JSONRPC_ERRORS.PARSE_ERROR, 'Invalid JSON'));
  }
  if (payload == null) {
    return json(400, mcp.rpcError(null, mcp.JSONRPC_ERRORS.INVALID_REQUEST, 'Empty body'));
  }

  const api = createApiClient({ apiUrl });
  let tools;
  let toolSchemas = null;
  let instructions = null;
  if (auth.role === 'curator') {
    // Кураторский коннектор: в auth.sessionToken лежит кураторский JWT,
    // инструменты работают с дневниками клиентов куратора.
    const curatorCtx = createCuratorContext({
      api,
      curatorJwt: auth.sessionToken,
      // sub кураторского токена — это curator_id: он нужен админским RPC,
      // которые принимают его параметром (подписки), а не берут из JWT.
      curatorId: auth.clientId,
      curatorName: auth.subjectName,
      // Задачник живёт под обычным клиентом HEYS, id задаётся окружением:
      // это личные файлы куратора, и подставлять их по имени нельзя.
      tasksClientId: process.env.HEYS_TASKS_CLIENT_ID || null,
    });
    tools = curatorCtx.tools;
    toolSchemas = curatorCtx.schemas;
    instructions = curatorCtx.instructions;
  } else {
    tools = createTools({ api, sessionToken: auth.sessionToken, clientId: auth.clientId }).tools;
  }
  const response = await mcp.handlePayload(payload, {
    tools,
    toolSchemas,
    instructions,
    logError: (kind, meta) => console.error(`[heys-mcp] ${kind}`, meta),
    upstream: () => ({ calls: api.stats.calls, ms: api.stats.ms }),
    // Одна строка на вызов инструмента: по ней в Cloud Logging видно, какой
    // сценарий записи сколько стоит и сколько в нём round-trip'ов к API.
    logMetric: (metric) => console.info('[heys-mcp] tool_timing', JSON.stringify({ role: auth.role, ...metric })),
  });

  // Только уведомления и ответы — по спеке отвечаем 202 без тела.
  if (response === null) {
    return { statusCode: 202, headers: { ...SECURITY_HEADERS, ...CORS_HEADERS }, body: '' };
  }
  return json(200, response);
}

async function handleAuthorizePost(event, { secret, apiUrl }) {
  const form = parseForm(readBody(event));
  const validation = oauth.validateAuthorizeRequest({
    client_id: form.client_id,
    redirect_uri: form.redirect_uri,
    response_type: 'code',
    code_challenge: form.code_challenge,
    code_challenge_method: 'S256',
    state: form.state,
    resource: form.resource,
  }, secret);

  if (!validation.ok) {
    return html(400, oauth.renderErrorPage('Не удалось выдать доступ', validation.description));
  }

  const api = createApiClient({ apiUrl });
  const email = String(form.email || '').trim();

  // ── Куратор: email + пароль (+ TOTP при включённой 2FA) ────────────────
  if (email) {
    const password = String(form.password || '');
    if (!password) {
      return html(400, oauth.renderLoginPage(validation, { error: 'Введите email и пароль куратора.', email, curatorMode: true }));
    }
    const mfaCode = String(form.mfa_code || '').trim();
    const login = await api.curatorLogin(email, password, mfaCode);
    if (!login.ok) {
      const message = login.error === 'mfa_required'
        ? 'Включена двухфакторная защита: введите код из приложения-аутентификатора.'
        : login.error === 'rate_limited'
          ? 'Слишком много попыток. Подождите минуту и повторите.'
          : 'Неверный email или пароль.';
      return html(401, oauth.renderLoginPage(validation, { error: message, email, curatorMode: true }));
    }

    const code = oauth.issueAuthorizationCode({
      clientId: validation.clientId,
      redirectUri: validation.redirectUri,
      codeChallenge: validation.codeChallenge,
      heysClientId: login.curatorId,
      sessionToken: login.token,
      role: 'curator',
      subjectName: login.name,
      email,
      resource: validation.resource,
    }, secret);

    console.info('[heys-mcp] authorize granted (curator)', { curator: String(login.curatorId).slice(0, 8) });
    return redirect(oauth.buildRedirect(validation.redirectUri, { code, state: validation.state }));
  }

  // ── Клиент: телефон + PIN ──────────────────────────────────────────────
  const phone = String(form.phone || '').trim();
  const pin = String(form.pin || '').trim();
  if (!phone || !pin) {
    return html(400, oauth.renderLoginPage(validation, { error: 'Введите телефон и PIN.', phone }));
  }

  const verified = await api.verifyPin(phone, pin);
  if (!verified.ok) {
    const message = verified.error === 'rate_limited'
      ? 'Слишком много попыток. Подождите минуту и повторите.'
      : 'Неверный телефон или PIN.';
    return html(401, oauth.renderLoginPage(validation, { error: message, phone }));
  }

  const code = oauth.issueAuthorizationCode({
    clientId: validation.clientId,
    redirectUri: validation.redirectUri,
    codeChallenge: validation.codeChallenge,
    heysClientId: verified.clientId,
    sessionToken: verified.sessionToken,
    role: 'client',
    subjectName: verified.name,
    resource: validation.resource,
  }, secret);

  console.info('[heys-mcp] authorize granted', { client: String(verified.clientId).slice(0, 8) });
  return redirect(oauth.buildRedirect(validation.redirectUri, { code, state: validation.state }));
}

exports.handler = async (event) => {
  try {
    await initSecrets();
  } catch (e) {
    console.warn('[heys-mcp] initSecrets failed, falling back to env:', e && e.message);
  }

  const method = getMethod(event);
  const path = getPath(event);
  const headers = normalizeHeaders(event);
  const apiUrl = process.env.HEYS_API_URL || DEFAULT_API_URL;
  const issuer = issuerFrom(headers);

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: { ...SECURITY_HEADERS, ...CORS_HEADERS }, body: '' };
  }

  // Метаданные не требуют секрета и должны отвечать даже при проблемах с ним.
  if (method === 'GET' && path.startsWith(PROTECTED_RESOURCE_PREFIX)) {
    const resourcePath = resourcePathFromMetadataPath(path);
    return json(200, oauth.protectedResourceMetadata({ issuer, resource: `${issuer}${resourcePath}` }));
  }
  if (method === 'GET' && path.startsWith('/.well-known/oauth-authorization-server')) {
    return json(200, oauth.authorizationServerMetadata({ issuer }));
  }

  const secret = getTokenSecret();
  if (!secret) {
    console.error('[heys-mcp] token secret is not configured (MCP_TOKEN_SECRET / JWT_SECRET)');
    return json(500, { error: 'server_misconfigured' });
  }

  try {
    if (path === '/mcp/register' && method === 'POST') {
      let body;
      try {
        body = JSON.parse(readBody(event) || '{}');
      } catch (_) {
        return json(400, { error: 'invalid_client_metadata', error_description: 'Body must be JSON' });
      }
      const result = oauth.registerClient(body, secret);
      if (!result.ok) return json(400, { error: result.error, error_description: result.description });
      return json(201, result.registration);
    }

    if (path === '/mcp/authorize' && method === 'GET') {
      const query = (event && (event.queryStringParameters || event.query)) || {};
      const validation = oauth.validateAuthorizeRequest(query, secret);
      if (!validation.ok) {
        if (validation.fatal) {
          return html(400, oauth.renderErrorPage('Не удалось выдать доступ', validation.description));
        }
        return redirect(oauth.buildRedirect(validation.redirectUri, {
          error: validation.error,
          error_description: validation.description,
          state: query.state,
        }));
      }
      return html(200, oauth.renderLoginPage(validation));
    }

    if (path === '/mcp/authorize' && method === 'POST') {
      return await handleAuthorizePost(event, { secret, apiUrl });
    }

    if (path === '/mcp/token' && method === 'POST') {
      const form = parseForm(readBody(event));
      const grant = form.grant_type;
      let result;
      if (grant === 'authorization_code') {
        result = oauth.exchangeAuthorizationCode(form, secret);
      } else if (grant === 'refresh_token') {
        // 🔐 SEC-031: продление кураторской сессии проходит через сервер.
        // Проверка ходит под свежевыпущенным JWT — прежний мог уже истечь.
        const api = createApiClient({ apiUrl });
        result = await oauth.exchangeRefreshToken(form, secret, Date.now(), {
          rawJwtSecret: process.env.JWT_SECRET || null,
          verifyCurator: async (_curatorId, curatorJwt) => api.curatorStatus(curatorJwt),
        });
        if (!result.ok) {
          console.warn('[heys-mcp] refresh denied', { error: result.error });
        }
      } else {
        result = { ok: false, error: 'unsupported_grant_type', description: `grant_type "${grant}" не поддерживается.` };
      }
      if (!result.ok) return json(400, { error: result.error, error_description: result.description });
      return json(200, result.tokens);
    }

    if (MCP_ENDPOINTS.has(path) && method === 'POST') {
      return await handleMcpRequest(event, { headers, secret, apiUrl, resourcePath: path });
    }

    // Поток «сервер → клиент» не поддерживается: транспорт stateless.
    if (MCP_ENDPOINTS.has(path) && (method === 'GET' || method === 'DELETE')) {
      return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    }

    return json(404, { error: 'not_found', path });
  } catch (e) {
    console.error('[heys-mcp] unhandled error', { path, method, message: e && e.message });
    return json(500, { error: 'internal_error' });
  }
};
