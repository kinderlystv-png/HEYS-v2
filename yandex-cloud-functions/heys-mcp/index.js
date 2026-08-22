'use strict';

/**
 * heys-mcp — MCP-сервер HEYS для custom connectors ChatGPT и Claude.
 *
 * Один Cloud Function обслуживает три группы маршрутов:
 *   POST /mcp, POST /mcp/curator       — Streamable HTTP транспорт MCP
 *   POST /mcp/curator/diary            — кураторский транспорт без досочных схем задачника
 *   POST /mcp/chatgpt/curator          — стабильный ChatGPT alias без старого discovery-cache
 *   /mcp/register|authorize|token      — OAuth 2.1 + DCR + PKCE
 *   /.well-known/oauth-*               — метаданные для авто-обнаружения
 *
 * `/mcp/curator` — тот же транспорт под вторым адресом. MCP-клиент держит одно
 * подключение на URL, поэтому личный клиентский и кураторский доступ не могут
 * жить на одном пути. Роль берётся из токена, не из адреса: путь только
 * разводит два независимых OAuth-подключения.
 *
 * `/mcp/attach*`                       — мобильная страница вложений задачника
 *
 * Четвёртая группа — не OAuth и не MCP-транспорт: обычная HTML-страница за
 * cookie-сессией, с телефона куратора. Подробности входа и логики — в
 * lib/attach.js.
 *
 * Внешних зависимостей нет: подпись токенов — node:crypto, обращения к данным —
 * HTTPS-вызовы собственного /rpc. Прямого доступа к БД функция не имеет, поэтому
 * не может обойти серверные гарды дневника.
 */

const crypto = require('node:crypto');
const { initSecrets } = require('./shared/secrets');
const mcp = require('./lib/mcp');
const oauth = require('./lib/oauth');
const attach = require('./lib/attach');
const board = require('./lib/board');
const { createApiClient } = require('./lib/heys-api');
const { createTools, ToolError } = require('./lib/tools');
const { createCuratorContext } = require('./lib/curator');
const { TASKS_BOARD_SCHEMAS, TASKS_AGENT_SCHEMAS } = require('./lib/tasks-tools');
const { createTelemetry } = require('./lib/telemetry');
const { createRepeatGuard } = require('./lib/repeat-guard');
const tasks = require('./lib/tasks');

/**
 * Возраст процесса и признак первого вызова на нём.
 *
 * Без них строка тайминга неинтерпретируема: одна и та же запись стоит около
 * секунды на живом инстансе и втрое дороже на поднятом с нуля, а в логе обе
 * выглядят одинаково. `uptime_ms` заодно показывает, как быстро гасятся
 * инстансы — от этого зависит, окупается ли их прогрев.
 */
const PROCESS_START_MS = Date.now();
let instanceWarm = false;
// Кто подключён: clientInfo приходит один раз, в initialize, а нужен позже —
// в строке mcp_list. Живёт столько же, сколько инстанс.
let lastClientInfo = null;

/**
 * Писатель телеметрии живёт на уровне модуля: псевдонимы подключений и
 * счётчики вызовов должны переживать отдельный запрос и умирать вместе с
 * инстансом. Версия функции приходит из окружения рантайма — по ней в отчёте
 * отличается «стало медленнее» от «выкатили другую сборку».
 */
const telemetry = createTelemetry({
  fnVersion: process.env.FUNCTION_VERSION_ID || process.env.FUNCTION_VERSION || null,
});

/**
 * Память о читающих вызовах — тоже на уровне модуля и по той же причине:
 * лишние круги модели случаются внутри одной реплики, то есть на одном тёплом
 * инстансе (lib/repeat-guard.js).
 */
const repeatGuard = createRepeatGuard();

/**
 * Окно, в котором вызовы считаются одной серией.
 *
 * Совпадает с окном памяти инстанса (`DEFAULT_TTL_MS` в lib/repeat-guard.js):
 * два счётчика одного и того же не должны расходиться, иначе подсказка будет
 * появляться то на тёплом инстансе, то на холодном по разным правилам.
 */
const SERIES_WINDOW_MS = 60 * 1000;

const ATTACH_PAGE_PATH = '/mcp/attach';
const ATTACH_MANIFEST_PATH = '/mcp/attach/manifest.webmanifest';
const ATTACH_ICON_PATH = '/mcp/attach/icon.png';
const BOARD_PATH = '/mcp/board';
const BOARD_TALK_PATH = '/mcp/board/talk';
const BOARD_RESOLVE_PATH = '/mcp/board/resolve';
const BOARD_SLEEP_PATH = '/mcp/board/sleep';
const BOARD_RESLOT_PATH = '/mcp/board/reslot';
const BOARD_SLOT_DONE_PATH = '/mcp/board/slot-done';
const BOARD_HABIT_PATH = '/mcp/board/habit';
const BOARD_CLOSE_DAY_PATH = '/mcp/board/close-day';

const BOARD_CORS_ORIGINS = new Set([
  'https://app.heyslab.ru',
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]);

const DEFAULT_API_URL = 'https://api.heyslab.ru';

/**
 * Адреса MCP-транспорта. Каждый — самостоятельный OAuth resource: MCP-клиент
 * сверяет `resource` из метаданных с URL коннектора, поэтому метаданные и
 * заголовок 401 обязаны называть именно тот путь, по которому пришёл запрос.
 */
const CHATGPT_CURATOR_ENDPOINTS = new Set([
  '/mcp/chatgpt/curator',
  '/mcp/chatgpt/curator-v2',
]);

/**
 * Дневниковый адрес того же кураторского транспорта. Инструменты, роль и
 * обязательный transcript — те же самые: отличается только список схем в
 * `tools/list`, из него убраны досочные и агентские инструменты задачника.
 * В сессии про еду они не вызываются, но 38 КБ схем уезжают в каждый запрос.
 */
const DIARY_CURATOR_ENDPOINTS = new Set(['/mcp/curator/diary']);
const MCP_ENDPOINTS = new Set([
  '/mcp',
  '/mcp/curator',
  ...CHATGPT_CURATOR_ENDPOINTS,
  ...DIARY_CURATOR_ENDPOINTS,
]);
const DEFAULT_MCP_ENDPOINT = '/mcp';
const CURATOR_OAUTH_SCHEME = [{ type: 'oauth2', scopes: ['heys:diary'] }];

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
 * Метаданные и /mcp читают OpenAI/Anthropic из своего облака, поэтому CORS
 * открыт только для безопасных для чтения путей. Секретов эти ответы не содержат.
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

function isBoardPath(path) {
  return path === BOARD_PATH
    || path === BOARD_TALK_PATH
    || path === BOARD_RESOLVE_PATH
    || path === BOARD_SLEEP_PATH
    || path === BOARD_RESLOT_PATH
    || path === BOARD_SLOT_DONE_PATH
    || path === BOARD_HABIT_PATH
    || path === BOARD_CLOSE_DAY_PATH;
}

function boardCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && BOARD_CORS_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function boardJson(statusCode, body, origin, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...boardCorsHeaders(origin),
      ...extraHeaders,
    },
    body: body == null ? '' : JSON.stringify(body),
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

/**
 * Метка чата клиента — `Mcp-Session-Id` из Streamable HTTP.
 *
 * Нужна ровно для одного: отличить два параллельных чата на ОДНОМ коннекторе.
 * Псевдоним подключения считается от токена, а токен у обоих чатов один и тот
 * же, поэтому 21.08 в трейс одного обмена уверенно попали вызовы соседнего
 * чата, где в это время вели дневник. Состояние сессии сервер по-прежнему не
 * держит: транспорт stateless, метка только маркирует, откуда пришёл вызов.
 *
 * Клиент может прислать что угодно — поэтому формат ограничен, а подделка
 * ничего не решает: метка не даёт прав и не выбирает данные, она попадает
 * только в псевдоним телеметрии.
 */
const MCP_SESSION_ID_RE = /^[A-Za-z0-9._-]{8,128}$/;

function readClientSessionId(headers) {
  const raw = headers['mcp-session-id'];
  const value = typeof raw === 'string' ? raw.trim() : '';
  return MCP_SESSION_ID_RE.test(value) ? value : null;
}

/** Есть ли в теле (одиночном или батче) `initialize` — на него выдаётся метка. */
function payloadHasInitialize(payload) {
  const list = Array.isArray(payload) ? payload : [payload];
  return list.some((message) => message && message.method === 'initialize');
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

function mcpUnauthorized(headers, resourcePath) {
  const issuer = issuerFrom(headers);
  return json(401, { error: 'invalid_token', error_description: 'Требуется авторизация HEYS.' }, {
    'WWW-Authenticate': `Bearer realm="heys-mcp", resource_metadata="${issuer}${PROTECTED_RESOURCE_PREFIX}${resourcePath}"`,
  });
}

async function curatorContext(api, auth = {}) {
  const curatorJwt = auth.sessionToken || 'oauth-discovery';
  const tasksClientId = process.env.HEYS_TASKS_CLIENT_ID || null;
  let addressAliases = null;
  // Прогрев алиасов «мне»→client на initialize: иначе инструкция говорит
  // «проверь память», а модель уходит в list_clients+grep (инцидент 07.08).
  if (tasksClientId && curatorJwt !== 'oauth-discovery') {
    try {
      const key = tasks.keyForPath(tasks.PREFS_PATH);
      const { data } = await api.getKVByCurator(curatorJwt, tasksClientId, key);
      // getKVByCurator уже отдаёт row.v = { text, rev }, не обёртку { v }.
      // Читать data.v здесь = всегда пустая карта (инцидент smoke 07.08 Layer 4).
      if (data != null) {
        const prefsFile = tasks.ensureFile(data, tasks.PREFS_PATH);
        const prefs = tasks.activePreferences(tasks.parsePreferences(prefsFile));
        const { data: clients, error } = await api.listClients(curatorJwt);
        if (!error) addressAliases = tasks.clientAddressMap(prefs, clients || []);
      }
    } catch (_) { /* без алиасов — generic-инструкция и lazy resolveTarget */ }
  }
  return createCuratorContext({
    api,
    curatorJwt,
    curatorId: auth.clientId || null,
    curatorName: auth.subjectName || '',
    tasksClientId,
    addressAliases,
  });
}

function chatGptToolSchemas(schemas) {
  return schemas.map((schema) => ({ ...schema, securitySchemes: CURATOR_OAUTH_SCHEME }));
}

/**
 * Инструменты доски и агентского слоя задачника, скрытые на дневниковом адресе.
 * Имена берутся из самих схем, а не списком: новый инструмент группы исчезает
 * из дневникового набора сам, без второй правки здесь.
 */
const DIARY_HIDDEN_TOOLS = new Set(
  [...TASKS_BOARD_SCHEMAS, ...TASKS_AGENT_SCHEMAS].map((schema) => schema.name),
);

/**
 * Скрываются только схемы: сами обработчики остаются в `ctx.tools`, поэтому
 * вызов такого инструмента по памяти модели по-прежнему отрабатывает, а не
 * падает «Unknown tool». Дневниковые записи это не затрагивает — обёртка
 * transcript живёт на heys_*-инструментах и от списка схем не зависит.
 */
function diaryToolSchemas(schemas) {
  return schemas.filter((schema) => !DIARY_HIDDEN_TOOLS.has(schema.name));
}

async function handleMcpRequest(event, { headers, secret, apiUrl, resourcePath = DEFAULT_MCP_ENDPOINT }) {
  const auth = oauth.authenticateAccessToken(headers.authorization, secret);
  if (!auth.ok) {
    // RFC 9728: 401 обязан показать, где искать метаданные ресурса —
    // по ним claude.ai сам находит authorization server и запускает OAuth.
    // Путь ресурса совпадает с адресом запроса, иначе второй коннектор уедет
    // за метаданными первого.
    return mcpUnauthorized(headers, resourcePath);
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

  // Чат клиента: пришедшая метка, а на initialize — своя, если клиент ещё не
  // получил её. Дальше клиент обязан слать её сам (Streamable HTTP), и по ней
  // вызовы соседнего чата не попадут в чужую цепочку.
  const clientSessionId = readClientSessionId(headers);
  const issuedSessionId = !clientSessionId && payloadHasInitialize(payload) ? crypto.randomUUID() : null;
  const chatSessionId = clientSessionId || issuedSessionId;

  const api = createApiClient({ apiUrl });
  let tools;
  let toolSchemas = null;
  let instructions = null;
  if (auth.role === 'curator') {
    // Кураторский коннектор: в auth.sessionToken лежит кураторский JWT,
    // инструменты работают с дневниками клиентов куратора.
    const curatorCtx = await curatorContext(api, auth);
    tools = curatorCtx.tools;
    if (CHATGPT_CURATOR_ENDPOINTS.has(resourcePath)) {
      toolSchemas = chatGptToolSchemas(curatorCtx.schemas);
    } else if (DIARY_CURATOR_ENDPOINTS.has(resourcePath)) {
      toolSchemas = diaryToolSchemas(curatorCtx.schemas);
    } else {
      toolSchemas = curatorCtx.schemas;
    }
    instructions = curatorCtx.instructions;
  } else {
    tools = createTools({ api, sessionToken: auth.sessionToken, clientId: auth.clientId }).tools;
  }
  const telemetrySecret = process.env.MCP_TELEMETRY_SECRET || null;
  // Метка последнего начатого вызова: `seriesProbe` зовётся внутри обработки и
  // должен знать псевдоним подключения, а `beginTrace` его как раз и выдаёт.
  let lastTrace = null;
  // Ждать запись мы перестаём через 250 мс (`persistWithTimeout`), но САМ
  // запрос при этом не обрываем — внутренний таймаут заведомо больше.
  //
  // Иначе получается ровно то, что видно в логах 21.08: строка
  // `POST /rpc?fn=insert_mcp_call_event 499` — наш же abort по 250 мс убил
  // запись, которая почти дошла. Событие пропадает из телеметрии, а вместе с
  // ним и из счётчика серии, то есть подсказка про лишний круг не появляется
  // как раз на холодном старте, где она нужнее всего. Незавершённый запрос
  // обычно успевает закончиться до заморозки инстанса; если не успеет — будет
  // ровно то же, что было при abort, хуже не станет.
  const persistCall = telemetrySecret
    ? (record) => api.insertMcpCallEvent(record, { secret: telemetrySecret, timeoutMs: 3000 })
    : null;
  const response = await mcp.handlePayload(payload, {
    tools,
    toolSchemas,
    instructions,
    logError: (kind, meta) => console.error(`[heys-mcp] ${kind}`, meta),
    upstream: () => ({ calls: api.stats.calls, ms: api.stats.ms }),
    // Псевдоним подключения и номер вызова выдаются до обработчика: те же
    // значения уходят и клиенту в ответ, и в строку лога.
    beginTrace: () => {
      lastTrace = telemetry.begin(headers.authorization || null, chatSessionId);
      return lastTrace;
    },
    repeatGuard,
    // Счётчик серии по уже пишущейся телеметрии — вместо памяти инстанса,
    // которой на холодных стартах просто нет. Зовётся параллельно работе
    // инструмента, поэтому в ожидание куратора не добавляет ничего.
    seriesProbe: telemetrySecret
      ? (tool) => {
        const trace = lastTrace;
        if (!trace || !trace.connId) return 0;
        return api.countMcpRecentCalls({
          connId: trace.connId,
          tool,
          windowMs: SERIES_WINDOW_MS,
          secret: telemetrySecret,
        }).then((res) => (res && Number.isFinite(res.count) ? res.count : 0));
      }
      : null,
    noteClient: (info) => { lastClientInfo = info || null; },
    // Одна строка на tools/list: сколько схем и байт ушло клиенту и какому
    // именно. По ней «инструмента нет» отличается от «клиент не донёс его до
    // модели» — 18.08 доказать это было нечем.
    logList: ({ toolsCount, toolsBytes }) => {
      const coldStart = !instanceWarm;
      telemetry.recordList({
        token: headers.authorization || null,
        chatSessionId,
        toolsCount,
        toolsBytes,
        clientName: lastClientInfo ? lastClientInfo.name : null,
        clientVersion: lastClientInfo ? lastClientInfo.version : null,
        protocolVersion: lastClientInfo ? lastClientInfo.protocolVersion : null,
        role: auth.role,
        coldStart,
        uptimeMs: Date.now() - PROCESS_START_MS,
      });
    },
    // Одна строка чистого JSON на вызов инструмента: по ней в Cloud Logging
    // видно, какой сценарий сколько стоит, сколько в нём round-trip'ов к API
    // и в какой последовательности инструменты шли внутри подключения.
    // Состав строки — белый список в lib/telemetry.js.
    logMetric: async (metric) => {
      const coldStart = !instanceWarm;
      instanceWarm = true;
      await telemetry.record({
        tool: metric.tool,
        // Материал для псевдонима подключения: сам заголовок наружу не идёт,
        // в строку попадает только необратимый срез его хэша.
        token: headers.authorization || null,
        // Уже выданные `beginTrace` — берём их, а не считаем заново.
        sessionId: metric.trace ? metric.trace.sessionId : null,
        seq: metric.trace ? metric.trace.seq : null,
        connId: metric.trace ? metric.trace.connId : null,
        hint: metric.hint || null,
        role: auth.role,
        ok: metric.ok,
        errorCode: metric.error,
        durationMs: metric.ms,
        upstreamCalls: metric.upstream ? metric.upstream.calls : null,
        upstreamMs: metric.upstream ? metric.upstream.ms : null,
        responseBytes: metric.response_bytes,
        argCount: metric.arg_count,
        argKeys: metric.arg_keys,
        argsHash: metric.args_hash,
        coldStart,
        uptimeMs: Date.now() - PROCESS_START_MS,
      }, { persistCall });
    },
  });

  // Выданную метку клиент должен увидеть в ответе на initialize — иначе ему
  // нечего слать дальше. Expose-Headers нужен браузерным клиентам: без него
  // fetch не отдаст заголовок читающему коду.
  const sessionHeaders = issuedSessionId
    ? { 'Mcp-Session-Id': issuedSessionId, 'Access-Control-Expose-Headers': 'Mcp-Session-Id' }
    : {};

  // Только уведомления и ответы — по спеке отвечаем 202 без тела.
  if (response === null) {
    return { statusCode: 202, headers: { ...SECURITY_HEADERS, ...CORS_HEADERS, ...sessionHeaders }, body: '' };
  }
  return json(200, response, sessionHeaders);
}

async function handleAuthorizePost(event, { secret, apiUrl }) {
  const form = parseForm(readBody(event));
  const validation = oauth.validateAuthorizeRequest({
    client_id: form.client_id,
    redirect_uri: form.redirect_uri,
    response_type: 'code',
    code_challenge: form.code_challenge,
    code_challenge_method: form.code_challenge_method,
    state: form.state,
    resource: form.resource,
  }, secret);

  if (!validation.ok) {
    return html(400, oauth.renderErrorPage('Не удалось выдать доступ', validation.description));
  }

  const api = createApiClient({ apiUrl });
  const email = String(form.email || '').trim();

  // ── Только куратор: email + пароль (+ TOTP при включённой 2FA) ─────────
  // Клиентский вход (телефон + PIN) снят намеренно: MCP-доступ к дневникам
  // через ассистента ограничен владельцем, пока не оформлена трансграничная
  // передача для клиентского канала (см. release-plan трек B).
  if (!email) {
    return html(400, oauth.renderLoginPage(validation, { error: 'Введите email и пароль куратора.' }));
  }
  const password = String(form.password || '');
  if (!password) {
    return html(400, oauth.renderLoginPage(validation, { error: 'Введите email и пароль куратора.', email }));
  }
  const mfaCode = String(form.mfa_code || '').trim();
  const login = await api.curatorLogin(email, password, mfaCode);
  if (!login.ok) {
    const message = login.error === 'mfa_required'
      ? 'Включена двухфакторная защита: введите код из приложения-аутентификатора.'
      : login.error === 'rate_limited'
        ? 'Слишком много попыток. Подождите минуту и повторите.'
        : 'Неверный email или пароль.';
    return html(401, oauth.renderLoginPage(validation, { error: message, email }));
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

/**
 * CSP страницы вложений отличается от {@link SECURITY_HEADERS}: там странице
 * запрещён любой JS (форма без единого script), здесь JS — сама страница
 * (поиск, чтение файла, сжатие фото). `script-src` разрешает инлайн-скрипт
 * только по одноразовому nonce — вписать свой script в ответ снаружи нечем.
 */
function attachSecurityHeaders(nonce) {
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    // img-src нужен blob: — сжатие фото рисует File через URL.createObjectURL()
    // в <img> для canvas, а это blob:-URL, не data:.
    'Content-Security-Policy': `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
    'Referrer-Policy': 'no-referrer',
  };
}

function attachHtml(statusCode, body, nonce, extraHeaders = {}) {
  return { statusCode, headers: { 'Content-Type': 'text/html; charset=utf-8', ...attachSecurityHeaders(nonce), ...extraHeaders }, body };
}

function attachJson(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function toolErrorJson(e) {
  if (e instanceof ToolError) return attachJson(400, { error: { code: e.code, message: e.message } });
  throw e;
}

/** Маршруты страницы вложений: вход по кураторским email+паролю, поиск и загрузка. */
async function handleAttachRequest(event, { method, path, headers, secret, apiUrl }) {
  const rawJwtSecret = process.env.JWT_SECRET || null;
  const tasksClientId = process.env.HEYS_TASKS_CLIENT_ID || null;
  const api = createApiClient({ apiUrl });
  const cookieHeader = headers.cookie || '';
  const nonce = crypto.randomBytes(16).toString('base64');

  if (path === ATTACH_PAGE_PATH && method === 'GET') {
    const auth = await attach.authenticate({ cookieHeader, secret, rawJwtSecret, api });
    if (!auth.ok) return attachHtml(200, attach.renderLoginPage({}), nonce);
    return attachHtml(200, attach.renderAppPage({ name: auth.name, nonce }), nonce);
  }

  if (path === `${ATTACH_PAGE_PATH}/login` && method === 'POST') {
    const form = parseForm(readBody(event));
    const email = String(form.email || '').trim();
    const password = String(form.password || '');
    if (!email || !password) {
      return attachHtml(400, attach.renderLoginPage({ error: 'Введите email и пароль.', email }), nonce);
    }
    const mfaCode = String(form.mfa_code || '').trim();
    const login = await api.curatorLogin(email, password, mfaCode);
    if (!login.ok) {
      const message = login.error === 'mfa_required'
        ? 'Включена двухфакторная защита: введите код из приложения-аутентификатора.'
        : login.error === 'rate_limited'
          ? 'Слишком много попыток. Подождите минуту и повторите.'
          : 'Неверный email или пароль.';
      return attachHtml(401, attach.renderLoginPage({ error: message, email }), nonce);
    }
    const token = attach.issueSession({ curatorId: login.curatorId, email, name: login.name }, secret);
    console.info('[heys-mcp] attach login', { curator: String(login.curatorId).slice(0, 8) });
    return { statusCode: 302, headers: { Location: ATTACH_PAGE_PATH, 'Set-Cookie': attach.setCookieHeader(token), 'Cache-Control': 'no-store' }, body: '' };
  }

  if (path === `${ATTACH_PAGE_PATH}/logout` && method === 'POST') {
    return attachJson(200, { ok: true }, { 'Set-Cookie': attach.clearCookieHeader() });
  }

  if (path === `${ATTACH_PAGE_PATH}/search` && method === 'GET') {
    const auth = await attach.authenticate({ cookieHeader, secret, rawJwtSecret, api });
    if (!auth.ok) return attachJson(401, { error: 'not_authenticated' });
    const query = (event && (event.queryStringParameters || event.query)) || {};
    const tools = attach.tasksToolsFor({ api, curatorJwt: auth.curatorJwt, tasksClientId });
    try {
      return attachJson(200, await attach.searchTasks({ tools, query: query.q }));
    } catch (e) {
      return toolErrorJson(e);
    }
  }

  if (path === `${ATTACH_PAGE_PATH}/upload` && method === 'POST') {
    const auth = await attach.authenticate({ cookieHeader, secret, rawJwtSecret, api });
    if (!auth.ok) return attachJson(401, { error: 'not_authenticated' });
    let body;
    try {
      body = JSON.parse(readBody(event) || '{}');
    } catch (_) {
      return attachJson(400, { error: { code: 'invalid_json', message: 'Тело запроса не JSON.' } });
    }
    const tools = attach.tasksToolsFor({ api, curatorJwt: auth.curatorJwt, tasksClientId });
    try {
      const result = await attach.uploadAttachment({ tools, body });
      return attachJson(200, { ok: true, line: result.structured.line, text: result.text });
    } catch (e) {
      return toolErrorJson(e);
    }
  }

  return attachJson(404, { error: 'not_found', path });
}

exports.handler = async (event, context) => {
  // Версия функции приходит вторым аргументом, а не через окружение: живая
  // строка телеметрии 17.08 показала `fn_version: null`, потому что
  // FUNCTION_VERSION_ID в рантайме не задан. Без версии нельзя отличить
  // «стало медленнее» от «выкатили другую сборку» — ровно то, зачем поле есть.
  if (context && context.functionVersion) telemetry.setFnVersion(context.functionVersion);

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
    if (isBoardPath(path)) {
      const origin = headers.origin || headers.Origin || '';
      return { statusCode: 204, headers: { ...SECURITY_HEADERS, ...boardCorsHeaders(origin) }, body: '' };
    }
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
      const response = json(201, result.registration);
      response.headers.Pragma = 'no-cache';
      return response;
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

    // GET без токена также рекламирует OAuth metadata: некоторые MCP-хосты
    // проверяют endpoint до первого JSON-RPC POST. С валидным токеном поток
    // «сервер → клиент» по-прежнему не поддерживается: транспорт stateless.
    if (MCP_ENDPOINTS.has(path) && (method === 'GET' || method === 'HEAD')) {
      const auth = oauth.authenticateAccessToken(headers.authorization, secret);
      const response = !auth.ok
        ? mcpUnauthorized(headers, path)
        : json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
      return method === 'HEAD' ? { ...response, body: '' } : response;
    }
    if (MCP_ENDPOINTS.has(path) && method === 'DELETE') {
      return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    }

    if (path === ATTACH_MANIFEST_PATH && method === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
        body: JSON.stringify(attach.MANIFEST),
      };
    }
    if (path === ATTACH_ICON_PATH && method === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
        body: attach.ICON_PNG.toString('base64'),
        isBase64Encoded: true,
      };
    }
    if (path === ATTACH_PAGE_PATH || path.startsWith(`${ATTACH_PAGE_PATH}/`)) {
      return await handleAttachRequest(event, { method, path, headers, secret, apiUrl });
    }

    if (path === BOARD_PATH) {
      const origin = headers.origin || headers.Origin || '';
      const rawJwtSecret = process.env.JWT_SECRET || null;
      const tasksClientId = process.env.HEYS_TASKS_CLIENT_ID || board.DEFAULT_TASKS_CLIENT_ID;
      const tasksCuratorId = process.env.HEYS_TASKS_CURATOR_ID || board.DEFAULT_TASKS_CURATOR_ID;
      const api = createApiClient({ apiUrl });
      const query = (event && (event.queryStringParameters || event.query)) || {};
      const result = await board.handleBoardRequest({
        method,
        query,
        cookieHeader: headers.cookie || '',
        api,
        rawJwtSecret,
        tasksClientId,
        tasksCuratorId,
      });
      if (result.status === 204) {
        return { statusCode: 204, headers: { ...SECURITY_HEADERS, ...boardCorsHeaders(origin) }, body: '' };
      }
      return boardJson(result.status, result.body, origin);
    }

    if (
      path === BOARD_TALK_PATH
      || path === BOARD_RESOLVE_PATH
      || path === BOARD_SLEEP_PATH
      || path === BOARD_RESLOT_PATH
      || path === BOARD_SLOT_DONE_PATH
      || path === BOARD_HABIT_PATH
      || path === BOARD_CLOSE_DAY_PATH
    ) {
      const origin = headers.origin || headers.Origin || '';
      const rawJwtSecret = process.env.JWT_SECRET || null;
      const tasksClientId = process.env.HEYS_TASKS_CLIENT_ID || board.DEFAULT_TASKS_CLIENT_ID;
      const tasksCuratorId = process.env.HEYS_TASKS_CURATOR_ID || board.DEFAULT_TASKS_CURATOR_ID;
      const api = createApiClient({ apiUrl });
      let body = {};
      try {
        const raw = readBody(event);
        body = raw ? JSON.parse(raw) : {};
      } catch (_) {
        return boardJson(400, { error: 'invalid_json' }, origin);
      }
      const handler = path === BOARD_RESOLVE_PATH
        ? board.handleBoardResolveRequest
        : path === BOARD_SLEEP_PATH
          ? board.handleBoardSleepRequest
          : path === BOARD_RESLOT_PATH
            ? board.handleBoardReslotRequest
            : path === BOARD_SLOT_DONE_PATH
              ? board.handleBoardSlotDoneRequest
              : path === BOARD_HABIT_PATH
                ? board.handleBoardHabitRequest
                : path === BOARD_CLOSE_DAY_PATH
                  ? board.handleBoardCloseDayRequest
                  : board.handleBoardTalkRequest;
      const result = await handler({
        method,
        body,
        cookieHeader: headers.cookie || '',
        api,
        rawJwtSecret,
        tasksClientId,
        tasksCuratorId,
      });
      if (result.status === 204) {
        return { statusCode: 204, headers: { ...SECURITY_HEADERS, ...boardCorsHeaders(origin) }, body: '' };
      }
      return boardJson(result.status, result.body, origin);
    }

    return json(404, { error: 'not_found', path });
  } catch (e) {
    console.error('[heys-mcp] unhandled error', { path, method, message: e && e.message });
    return json(500, { error: 'internal_error' });
  }
};
