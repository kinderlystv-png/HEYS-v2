'use strict';

/**
 * Минимальный OAuth 2.1 authorization server для MCP-клиентов ChatGPT/Claude.
 *
 * Почему именно OAuth, а не заголовок с токеном: кастомные коннекторы
 * подключаются через OAuth с Dynamic Client Registration. Поэтому сервер
 * обязан сам уметь DCR + PKCE.
 *
 * Состояние не хранится: client_id, authorization code, access и refresh
 * токены — это подписанные HS256-структуры.
 *
 * Отзыв доступа различается по ролям, и это важно не перепутать:
 *   • клиент — внутри токена зашифрована клиентская сессия HEYS, `revoke_session`
 *     мгновенно обрывает все инструменты;
 *   • куратор — внутри токена кураторский JWT, а он stateless: мгновенного
 *     отзыва в платформе нет. Продление сессии останавливает
 *     `curators.is_active = false` (проверяется на каждом refresh, SEC-031),
 *     но уже выданный JWT доживает свои 24 часа.
 */

const { signToken, verifyToken, encryptSecret, decryptSecret, verifyPkce, signRawJwt } = require('./crypto-tokens');

/**
 * Кураторский JWT живёт 24 часа (JWT_EXPIRES_IN в heys-api-auth). Чтобы
 * коннектор куратора не требовал ежедневного перелогина, на refresh мы
 * перевыпускаем кураторский JWT сами: у функции есть JWT_SECRET через
 * Lockbox-overlay, а формат claims повторяет createJwt из heys-api-auth
 * ({sub, email, role:'curator'}). Для клиентских токенов это не нужно —
 * client-session живёт 30 дней на сервере.
 */
const CURATOR_JWT_TTL_SECONDS = 24 * 60 * 60;

const SCOPE = 'heys:diary';
const CODE_TTL_SECONDS = 300;            // 5 минут на обмен кода
const ACCESS_TTL_SECONDS = 3600;         // 1 час: короткий, потому что отзыв stateless
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;
const CLIENT_TTL_SECONDS = 60 * 60 * 24 * 365;

/**
 * 🔐 SEC-030 (2026-08-02): allowlist хостов redirect_uri.
 *
 * До фикса DCR принимала любой https-адрес. В связке со страницей входа это
 * давало готовый фишинг на легитимном домене: атакующий регистрировал клиента
 * с `redirect_uri` на свой сервер и любым `client_name`, присылал куратору
 * ссылку на настоящий `/mcp/authorize`, тот вводил email, пароль и код 2FA —
 * и код уезжал атакующему. Проверка домена, обычная защита пользователя, здесь
 * не срабатывает: домен действительно наш.
 *
 * Держать список в коде, а не в env, осознанно: heys-mcp при деплое получает
 * ровно одну переменную (LOCKBOX_APP_SECRET_ID), остальное приходит
 * Lockbox-overlay'ем. Переопределение через MCP_ALLOWED_REDIRECT_HOSTS
 * оставлено на случай нового клиента — список через запятую, `*.example.com`
 * разрешает поддомены.
 */
const DEFAULT_ALLOWED_REDIRECT_HOSTS = [
  'chatgpt.com',
  'claude.ai',
  '*.claude.ai',
  'claude.com',
  '*.claude.com',
  'anthropic.com',
  '*.anthropic.com',
];

function allowedRedirectHosts() {
  const raw = process.env.MCP_ALLOWED_REDIRECT_HOSTS;
  if (!raw || !String(raw).trim()) return DEFAULT_ALLOWED_REDIRECT_HOSTS;
  return String(raw).split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

function hostMatches(hostname, pattern) {
  if (pattern.startsWith('*.')) return hostname.endsWith(pattern.slice(1));
  return hostname === pattern;
}

/** Loopback для нативных клиентов (Claude Code) — любой порт, но только петля. */
function isLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isHttpsUri(value) {
  try {
    const url = new URL(value);
    // Спека разрешает нативным клиентам loopback по HTTP.
    if (url.protocol === 'http:') return isLoopback(url.hostname);
    if (url.protocol !== 'https:') return false;
    // Фрагмент в redirect_uri запрещён OAuth 2.1.
    if (url.hash) return false;
    const hostname = url.hostname.toLowerCase();
    if (isLoopback(hostname)) return true;
    return allowedRedirectHosts().some((pattern) => hostMatches(hostname, pattern));
  } catch (_) {
    return false;
  }
}

/** Origin получателя — его показываем пользователю на странице согласия. */
function redirectOrigin(value) {
  try {
    return new URL(value).origin;
  } catch (_) {
    return '';
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
  // 🔐 SEC-030: allowlist проверяется и здесь, а не только при регистрации.
  // client_id живёт год, поэтому без этой проверки регистрации, выданные до
  // фикса, продолжали бы работать до истечения TTL.
  if (!isHttpsUri(redirectUri)) {
    return { ok: false, fatal: true, error: 'invalid_request', description: 'redirect_uri ведёт на неразрешённый адрес.' };
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
    redirectOrigin: redirectOrigin(redirectUri),
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
    rl: params.role || 'client',
    nm: params.subjectName || '',
    em: params.email || '',
    aud: params.resource || '',
  }, secret, { typ: 'heys-mcp-code', ttlSeconds: CODE_TTL_SECONDS, nowMs });
}

function issueTokenPair(claims, secret, nowMs = Date.now()) {
  const base = {
    sub: claims.sub,
    cid: claims.cid,
    st: claims.st,
    rl: claims.rl || 'client',
    nm: claims.nm || '',
    em: claims.em || '',
    aud: claims.aud || '',
  };
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

/**
 * Кураторский JWT в формате heys-api-auth: {sub, email, role:'curator'},
 * подписанный сырым JWT_SECRET на 24 часа. Используется и здесь при refresh,
 * и страницей вложений (lib/attach.js) — она хранит только личность куратора
 * в своей cookie-сессии, а рабочий JWT для вызовов к API выпускает заново на
 * каждый запрос, тем же способом.
 */
function mintCuratorJwt({ curatorId, email = '', rawJwtSecret, nowMs = Date.now() }) {
  return signRawJwt({ sub: curatorId, email, role: 'curator' }, rawJwtSecret, {
    ttlSeconds: CURATOR_JWT_TTL_SECONDS, nowMs,
  });
}

/**
 * 🔐 SEC-031 (2026-08-02): перевыпуск кураторского JWT — только после
 * подтверждения сервером, что аккаунт ещё действует.
 *
 * До фикса функция подписывала свежий `role: curator` JWT боевым JWT_SECRET,
 * не спрашивая сервер вообще ни о чём: ни существует ли куратор, ни не
 * отключён ли он. Refresh-токен живёт 30 суток и на каждом обмене выдаётся
 * новый, эндпоинт публичный и без клиентской аутентификации — то есть
 * утёкший refresh-токен давал возобновляемый кураторский доступ, который
 * нельзя было прекратить ничем, кроме ротации общего JWT_SECRET.
 *
 * Теперь перед перевыпуском вызывается `verifyCurator` (обёртка над
 * GET /auth/curator-status). Он же — единственный доступный «рубильник»:
 * `curators.is_active = false` прекращает продление. Мгновенного отзыва уже
 * выданного 24-часового JWT это не даёт — для него нужен `token_version` в
 * токене и его сверка во всех функциях; вынесено отдельной задачей.
 *
 * `client_id` стал обязательным: раньше проверка стояла под `if (form.client_id)`,
 * то есть обходилась простым отсутствием параметра.
 *
 * @param {Function} [verifyCurator] async (curatorId, curatorJwt) => {ok, error}
 */
async function exchangeRefreshToken(form, secret, nowMs = Date.now(), { rawJwtSecret = null, verifyCurator = null } = {}) {
  const verified = verifyToken(form.refresh_token, secret, { typ: 'heys-mcp-refresh', nowMs });
  if (!verified.ok) return { ok: false, error: 'invalid_grant', description: 'Refresh-токен недействителен или истёк.' };
  if (!form.client_id || form.client_id !== verified.claims.cid) {
    return { ok: false, error: 'invalid_client', description: 'client_id не совпадает с refresh-токеном.' };
  }
  const claims = { ...verified.claims };
  // Куратор: перевыпускаем 24-часовой JWT, иначе инструменты умрут через сутки
  // после входа, хотя refresh-токен ещё жив.
  if (claims.rl === 'curator') {
    if (!rawJwtSecret || !claims.sub) {
      return { ok: false, error: 'invalid_grant', description: 'Кураторскую сессию продлить нельзя — войдите заново.' };
    }
    const freshJwt = mintCuratorJwt({ curatorId: claims.sub, email: claims.em || '', rawJwtSecret, nowMs });
    // Fail-closed: без положительного ответа сервера продления не будет.
    // Свежий JWT нужен самой проверке — прежний к этому моменту мог истечь
    // (он живёт 24 часа, а refresh-токен — 30 суток).
    const check = verifyCurator ? await verifyCurator(claims.sub, freshJwt) : { ok: false, error: 'verifier_missing' };
    if (!check || !check.ok) {
      return { ok: false, error: 'invalid_grant', description: 'Кураторский доступ больше не действует — войдите заново.' };
    }
    claims.st = encryptSecret(freshJwt, secret);
  }
  return { ok: true, tokens: issueTokenPair(claims, secret, nowMs) };
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
  return {
    ok: true,
    clientId: verified.claims.sub,
    sessionToken,
    role: verified.claims.rl === 'curator' ? 'curator' : 'client',
    subjectName: verified.claims.nm || '',
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Страница входа. Две формы: клиент (телефон + PIN) и, под <details>,
 * куратор (email + пароль + опциональный код 2FA). JS на странице нет
 * намеренно — CSP default-src 'none'; раскрытие секции через <details>.
 */
function renderLoginPage(request, { error = '', phone = '', email = '', curatorMode = false } = {}) {
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
  input[type=tel], input[type=password], input[type=email], input[type=text] { width:100%; box-sizing:border-box; padding:11px 13px;
          font-size:16px; border:1px solid #d7dae2; border-radius:10px; background:#fff; color:inherit; }
  details { margin-top:20px; border-top:1px solid #e4e6ec; padding-top:14px; }
  summary { font-size:13px; color:#5c6070; cursor:pointer; list-style:none; }
  summary::before { content:'\\2192  '; }
  details[open] summary::before { content:'\\2193  '; }
  button { width:100%; margin-top:22px; padding:12px; font-size:15px; font-weight:600; color:#fff;
           background:#2f6df6; border:0; border-radius:10px; cursor:pointer; }
  .err { margin:14px 0 0; padding:10px 12px; border-radius:10px; background:#fdecec; color:#b3261e; font-size:13px; }
  .foot { margin-top:18px; font-size:12px; color:#8a8f9e; line-height:1.5; }
  .who { margin:0 0 18px; padding:12px 14px; border:1px solid #e4e6ec; border-radius:12px; background:#fafbfd; }
  .who-row { display:flex; gap:10px; align-items:baseline; font-size:13px; line-height:1.5; }
  .who-row span { flex:0 0 78px; color:#8a8f9e; }
  .who-row b { font-weight:600; word-break:break-all; }
  .who-note { margin:8px 0 0; font-size:12px; line-height:1.5; color:#8a8f9e; }
  @media (prefers-color-scheme: dark) {
    body { background:#15161a; color:#eceef4; }
    .card { background:#1e2027; box-shadow:none; }
    input[type=tel], input[type=password], input[type=email], input[type=text] { background:#15161a; border-color:#333744; }
    details { border-color:#2a2d36; }
    .err { background:#3a1f1f; color:#ff9a92; }
    .who { background:#191b21; border-color:#2a2d36; }
  }
</style>
</head>
<body>
  <div class="card">
    <h1>Доступ к дневнику HEYS</h1>
    <p class="sub">Приложение запрашивает доступ к дневнику питания, воды, сна и тренировок.</p>
    <!-- 🔐 SEC-030: получатель кода показывается явно. Имя приложения приходит
         из запроса регистрации и никем не подтверждено, поэтому опорным
         признаком для пользователя служит адрес, а не название. -->
    <div class="who">
      <div class="who-row"><span>Кому</span><b>${escapeHtml(request.redirectOrigin || 'адрес не определён')}</b></div>
      <div class="who-row"><span>Назвалось</span><b>${escapeHtml(request.clientName || 'без названия')}</b></div>
      <p class="who-note">Название приложение указывает само — HEYS его не проверяет. Если адрес выше вам незнаком, закройте эту страницу и не вводите данные.</p>
    </div>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/mcp/authorize">
      ${hidden}
      <label for="phone">Телефон</label>
      <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 900 000-00-00" value="${escapeHtml(phone)}" ${curatorMode ? '' : 'required'}>
      <label for="pin">PIN</label>
      <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]*" maxlength="6" ${curatorMode ? '' : 'required'}>
      <button type="submit">Разрешить доступ</button>
    </form>
    <details${curatorMode ? ' open' : ''}>
      <summary>Я куратор — вход по email</summary>
      <form method="post" action="/mcp/authorize">
        ${hidden}
        <label for="email">Email куратора</label>
        <input id="email" name="email" type="email" autocomplete="username" value="${escapeHtml(email)}">
        <label for="password">Пароль</label>
        <input id="password" name="password" type="password" autocomplete="current-password">
        <label for="mfa_code">Код 2FA (если включена)</label>
        <input id="mfa_code" name="mfa_code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8">
        <button type="submit">Войти как куратор</button>
      </form>
      <!-- 🔐 SEC-030: до фикса здесь было сказано только про «дневники», хотя
           кураторский вход открывает ещё управление клиентами, подписками и
           лидами. Согласие обязано называть реальный объём. -->
      <p class="foot">Кураторский вход открывает не только дневники. Ассистент сможет: читать и вести дневники всех ваших клиентов; читать переписку и отвечать клиентам; заводить клиентов и выдавать им доступ, включая смену PIN; продлевать и отменять подписки; работать с заявками и лидами. Он всегда называет, кому вносит данные.</p>
    </details>
    <!-- 🔐 SEC-031: прежний текст обещал отзыв через отключение коннектора в
         MCP-клиенте. Для куратора это неправда: кураторские JWT stateless,
         отзыва на сервере нет. Пишем как есть. -->
    <p class="foot">Клиент может прекратить доступ в любой момент — выйдя из аккаунта в приложении. У куратора мгновенного отзыва нет: отключение коннектора в ChatGPT или Claude прекращает доступ только со стороны этого сервиса, а выданный доступ действует до суток. Если доступ мог утечь — смените пароль и сообщите администратору.</p>
  </div>
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
  CURATOR_JWT_TTL_SECONDS,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  CODE_TTL_SECONDS,
  isHttpsUri,
  redirectOrigin,
  allowedRedirectHosts,
  DEFAULT_ALLOWED_REDIRECT_HOSTS,
  protectedResourceMetadata,
  authorizationServerMetadata,
  registerClient,
  parseClientId,
  validateAuthorizeRequest,
  issueAuthorizationCode,
  issueTokenPair,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  mintCuratorJwt,
  authenticateAccessToken,
  renderLoginPage,
  renderErrorPage,
  buildRedirect,
  escapeHtml,
};
