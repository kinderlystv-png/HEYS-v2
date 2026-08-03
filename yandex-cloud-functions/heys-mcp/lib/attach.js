'use strict';

/**
 * Страница вложений: телефон → сервер → хранилище, минуя переписку.
 *
 * Личный задачник владельца — не OAuth-коннектор, а обычная мобильная
 * страница за паролем. Вход — те же кураторские email+пароль(+2FA), что и в
 * `/mcp/authorize`, чтобы не заводить третий секрет. Дальше — разница в
 * хранении сессии: OAuth-коннектору нужен stateless access/refresh с PKCE,
 * здесь достаточно одной cookie.
 *
 * Cookie хранит ТОЛЬКО личность куратора (id, email, имя), не рабочий JWT.
 * Рабочий кураторский JWT минтится заново на каждый защищённый запрос
 * (`oauth.mintCuratorJwt`) и тут же проверяется через `curatorStatus`
 * (SEC-031, fail-closed): если куратора отключили, cookie перестаёт работать
 * в течение секунд, а не догуливает свои 24 часа, как выданный при логине
 * JWT. Это тот же компромисс, что и в кураторском refresh-гранте, только
 * заявленный как единственный источник правды, а не как опция.
 *
 * Подпись cookie — те же примитивы, что и у OAuth-токенов (`crypto-tokens`,
 * тот же `MCP_TOKEN_SECRET`): в этой системе домены уже разводятся полем
 * `typ`, а не отдельным ключом на каждый вид токена — новый секрет под ещё
 * один `typ` был бы отступлением от собственного соглашения, а не защитой.
 */

const { signToken, verifyToken } = require('./crypto-tokens');
const { escapeHtml, mintCuratorJwt } = require('./oauth');
const { createTasksTools } = require('./tasks-tools');
const { ToolError } = require('./tools');
const assets = require('./assets');

const SESSION_TYP = 'heys-mcp-attach-session';
// 30 суток — верхняя граница cookie. Фактический доступ обычно кончается
// раньше: curatorStatus проверяется на каждый запрос, а не на этот срок.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const COOKIE_NAME = 'heys_attach_session';

function signSession(payload, secret, nowMs) {
  return signToken(payload, secret, { typ: SESSION_TYP, ttlSeconds: SESSION_TTL_SECONDS, nowMs });
}

function verifySession(token, secret, nowMs) {
  return verifyToken(token, secret, { typ: SESSION_TYP, nowMs });
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    if (!key) return;
    out[key] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

/** Cookie: HttpOnly (JS её не читает) + Secure + SameSite=Strict, область — только страница вложений. */
function setCookieHeader(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/mcp/attach; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}
function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/mcp/attach; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function issueSession({ curatorId, email, name }, secret, nowMs = Date.now()) {
  return signSession({ sub: curatorId, em: email || '', nm: name || '' }, secret, nowMs);
}

/**
 * Проверка запроса целиком: cookie → личность → свежий рабочий JWT →
 * подтверждение сервером, что куратор ещё активен. Любой обрыв в этой цепочке
 * — отказ, а не тихая деградация до «доступа нет, но страница есть».
 */
async function authenticate({ cookieHeader, secret, rawJwtSecret, api, nowMs = Date.now() }) {
  const cookies = parseCookies(cookieHeader);
  const session = verifySession(cookies[COOKIE_NAME], secret, nowMs);
  if (!session.ok) return { ok: false, reason: session.error };
  if (!rawJwtSecret) return { ok: false, reason: 'server_misconfigured' };

  const curatorId = session.claims.sub;
  const email = session.claims.em || '';
  const name = session.claims.nm || '';
  const curatorJwt = mintCuratorJwt({ curatorId, email, rawJwtSecret, nowMs });

  const status = await api.curatorStatus(curatorJwt);
  if (!status || !status.ok) return { ok: false, reason: 'curator_inactive' };

  return { ok: true, curatorId, email, name, curatorJwt };
}

/**
 * Инструменты задачника поверх свежего кураторского JWT. Тот же
 * `createTasksTools`, что использует кураторский MCP-коннектор, — вход
 * ищет задачу, вложения грузит и записывает строку одним и тем же кодом,
 * независимо от того, кто вызвал: модель или эта страница.
 */
function tasksToolsFor({ api, curatorJwt, tasksClientId, nowMs = Date.now(), assetsClient = null }) {
  return createTasksTools({
    api,
    curatorJwt,
    clientId: tasksClientId,
    nowMs,
    ToolError,
    assetsClient,
    writeContext: (clientId) => api.issueWriteContext(curatorJwt, clientId).catch(() => null),
  }).tools;
}

/** Короткий список задач под форму: адрес, название, проект, срок — без служебных полей. */
function toResult(task) {
  return {
    ref: task.ref || null,
    project: task.project || null,
    hash: task.hash || null,
    title: task.title || '',
    due: task.due || null,
    priority: task.priority || null,
    done: !!task.done,
  };
}

/** Поиск по адресу («heys/7caa24») и по словам названия — движок tasks_context как есть. */
async function searchTasks({ tools, query, limit = 20 }) {
  const q = String(query || '').trim();
  if (q.length < 2) return { query: q, matches: [] };
  const res = await tools.tasks_context({ topic: q });
  const tasks = (res.structured && res.structured.tasks) || [];
  return { query: q, matches: tasks.slice(0, limit).map(toResult) };
}

const UPLOAD_FIELDS = ['project', 'hash', 'filename', 'content_base64', 'caption'];

/** Загрузка — буквально tasks_attach, без параллельной реализации. */
async function uploadAttachment({ tools, body }) {
  const args = {};
  for (const field of UPLOAD_FIELDS) args[field] = body && body[field];
  return tools.tasks_attach(args);
}

// ── HTML ────────────────────────────────────────────────────────────────

const PAGE_STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         background:#0f1115; color:#eceef4; padding:0 0 32px; }
  header { position:sticky; top:0; background:#14161c; padding:14px 16px; border-bottom:1px solid #262a35;
           display:flex; align-items:center; justify-content:space-between; z-index:1; }
  header h1 { font-size:16px; margin:0; font-weight:600; }
  header a { color:#8a8f9e; font-size:13px; text-decoration:none; }
  main { padding:16px; max-width:520px; margin:0 auto; }
  .card { background:#1a1d24; border:1px solid #262a35; border-radius:14px; padding:16px; margin-bottom:14px; }
  label { display:block; font-size:13px; color:#9aa0b2; margin:0 0 6px; }
  input[type=search], input[type=text], input[type=email], input[type=password] {
    width:100%; padding:12px 13px; font-size:16px; border:1px solid #333744; border-radius:10px;
    background:#0f1115; color:inherit; }
  input[type=file] { width:100%; font-size:14px; color:#9aa0b2; }
  button { padding:12px 16px; font-size:15px; font-weight:600; color:#fff; background:#2f6df6;
           border:0; border-radius:10px; cursor:pointer; }
  button:disabled { opacity:.5; }
  button.secondary { background:#262a35; color:#eceef4; }
  .task { padding:12px; border:1px solid #262a35; border-radius:10px; margin-top:8px; cursor:pointer; }
  .task:active, .task.selected { border-color:#2f6df6; background:#161a2a; }
  .task .ref { font-size:12px; color:#8a8f9e; }
  .task .title { font-size:14px; margin-top:2px; }
  .task .due { font-size:12px; color:#e0a35c; margin-top:2px; }
  .muted { color:#8a8f9e; font-size:13px; }
  .err { padding:10px 12px; border-radius:10px; background:#3a1f1f; color:#ff9a92; font-size:13px; margin-top:10px; }
  .ok { padding:10px 12px; border-radius:10px; background:#1f3a24; color:#8ee0a3; font-size:13px; margin-top:10px; }
  .limits { font-size:12px; color:#8a8f9e; margin-top:8px; line-height:1.5; }
  .row { display:flex; gap:10px; margin-top:12px; }
  .row button { flex:1; }
`;

function shell(title, bodyHtml, { extraHead = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0f1115">
<title>${escapeHtml(title)}</title>
<link rel="manifest" href="/mcp/attach/manifest.webmanifest">
<link rel="apple-touch-icon" href="/mcp/attach/icon.png">
<link rel="icon" href="/mcp/attach/icon.png">
${extraHead}
<style>${PAGE_STYLE}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function renderLoginPage({ error = '', email = '' } = {}) {
  return shell('HEYS — вложения', `
  <main>
    <div class="card">
      <h1 style="margin:0 0 4px;font-size:19px;">Вложения к задачам</h1>
      <p class="muted" style="margin:0 0 18px;">Вход тем же кураторским аккаунтом, что и в HEYS.</p>
      ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
      <form method="post" action="/mcp/attach/login">
        <label for="email">Email куратора</label>
        <input id="email" name="email" type="email" autocomplete="username" required value="${escapeHtml(email)}">
        <label for="password" style="margin-top:12px;">Пароль</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <label for="mfa_code" style="margin-top:12px;">Код 2FA (если включена)</label>
        <input id="mfa_code" name="mfa_code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8">
        <button type="submit" style="width:100%;margin-top:16px;">Войти</button>
      </form>
    </div>
  </main>`);
}

/**
 * Основной экран. JS — на самой странице (Cloud Function отдаёт HTML целиком,
 * отдельного статического хостинга под JS-файл нет), поэтому CSP этой страницы
 * разрешает `script-src` только по nonce, сгенерированному на запрос: без него
 * инлайн-скрипт не выполнится, даже если кто-то впишет свой в ответ.
 */
function renderAppPage({ name, nonce }) {
  const limits = {
    imageMaxKb: Math.round(assets.IMAGE_MAX_BYTES / 1024),
    docMaxKb: Math.round(assets.DOC_MAX_BYTES / 1024),
    imageExts: [...assets.IMAGE_EXTS],
    docExts: [...assets.DOC_EXTS],
  };
  return shell('HEYS — вложения', `
  <header>
    <h1>Вложения${name ? ` · ${escapeHtml(name)}` : ''}</h1>
    <a href="/mcp/attach/logout" id="logout">Выйти</a>
  </header>
  <main>
    <div class="card">
      <label for="q">Задача (адрес «проект/хэш» или слова из названия)</label>
      <input id="q" type="search" inputmode="search" placeholder="heys/7caa24 или часть названия" autocomplete="off">
      <div id="results"></div>
      <p id="empty" class="muted" style="margin-top:10px;">Начните вводить — искать будем на лету.</p>
    </div>
    <div class="card" id="attachCard" style="display:none;">
      <div id="selected" class="task selected"></div>
      <label for="file" style="margin-top:14px;">Файл</label>
      <input id="file" type="file" accept="image/*,.pdf,.md,.txt,.csv,.json,.xlsx,.xls,.docx,.doc,.pptx,.rtf,.ics,.zip">
      <p class="limits">Картинка сжимается в браузере автоматически (до ~${limits.imageMaxKb} КБ). Документ — как есть, потолок ${limits.docMaxKb} КБ: pdf, xlsx, docx и подобные без сжатия.</p>
      <label for="caption" style="margin-top:10px;">Подпись — что это за файл</label>
      <input id="caption" type="text" placeholder="скрин ошибки, счёт от Ани…" required>
      <div class="row">
        <button class="secondary" id="cancel" type="button">Отмена</button>
        <button id="send" type="button">Приложить</button>
      </div>
      <div id="status"></div>
    </div>
  </main>
  <script nonce="${nonce}">
  (function () {
    'use strict';
    var LIMITS = ${JSON.stringify(limits)};
    var qEl = document.getElementById('q');
    var resultsEl = document.getElementById('results');
    var emptyEl = document.getElementById('empty');
    var attachCard = document.getElementById('attachCard');
    var selectedEl = document.getElementById('selected');
    var fileEl = document.getElementById('file');
    var captionEl = document.getElementById('caption');
    var sendBtn = document.getElementById('send');
    var statusEl = document.getElementById('status');
    var current = null;
    var searchSeq = 0;

    document.getElementById('logout').addEventListener('click', function (e) {
      e.preventDefault();
      fetch('/mcp/attach/logout', { method: 'POST' }).then(function () { location.href = '/mcp/attach'; });
    });

    function extOf(name) {
      var m = /\\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
      return m ? m[1].toLowerCase() : '';
    }

    function renderResults(matches) {
      resultsEl.innerHTML = '';
      if (!matches.length) {
        emptyEl.textContent = qEl.value.trim().length < 2 ? 'Начните вводить — искать будем на лету.' : 'Ничего не нашлось.';
        emptyEl.style.display = '';
        return;
      }
      emptyEl.style.display = 'none';
      matches.forEach(function (t) {
        var div = document.createElement('div');
        div.className = 'task';
        div.innerHTML = '<div class="ref">' + t.ref + (t.done ? ' · закрыта' : '') + '</div>' +
          '<div class="title"></div>' + (t.due ? '<div class="due">срок ' + t.due + '</div>' : '');
        div.querySelector('.title').textContent = t.title;
        div.addEventListener('click', function () { selectTask(t); });
        resultsEl.appendChild(div);
      });
    }

    function selectTask(t) {
      current = t;
      selectedEl.innerHTML = '<div class="ref">' + t.ref + '</div><div class="title"></div>';
      selectedEl.querySelector('.title').textContent = t.title;
      attachCard.style.display = '';
      statusEl.innerHTML = '';
      attachCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('cancel').addEventListener('click', function () {
      current = null;
      attachCard.style.display = 'none';
      fileEl.value = '';
      captionEl.value = '';
      statusEl.innerHTML = '';
    });

    qEl.addEventListener('input', function () {
      var q = qEl.value.trim();
      var seq = ++searchSeq;
      if (q.length < 2) { renderResults([]); return; }
      fetch('/mcp/attach/search?q=' + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (seq !== searchSeq) return;
          renderResults(data.matches || []);
        })
        .catch(function () { if (seq === searchSeq) emptyEl.textContent = 'Поиск не отвечает — проверьте связь.'; });
    });

    function readAsDataUrl(blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    function base64Of(dataUrl) {
      return dataUrl.slice(dataUrl.indexOf(',') + 1);
    }

    /** Сжатие фото в браузере: canvas умеет то, чего не может серверная функция без графических зависимостей. */
    function compressImage(file) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var maxSide = 1000;
          var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          var qualities = [0.6, 0.45, 0.3, 0.2];
          var i = 0;
          function attempt() {
            canvas.toBlob(function (blob) {
              if (!blob) { reject(new Error('canvas_failed')); return; }
              if (blob.size <= LIMITS.imageMaxKb * 1024 || i === qualities.length - 1) {
                resolve(blob);
              } else {
                i += 1;
                attempt();
              }
            }, 'image/jpeg', qualities[i]);
          }
          attempt();
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }

    sendBtn.addEventListener('click', function () {
      var file = fileEl.files[0];
      var caption = captionEl.value.trim();
      if (!current) return;
      if (!file) { statusEl.innerHTML = '<div class="err">Выберите файл.</div>'; return; }
      if (!caption) { statusEl.innerHTML = '<div class="err">Подпись обязательна.</div>'; return; }
      var ext = extOf(file.name);
      var isImage = LIMITS.imageExts.indexOf(ext) !== -1;
      var isDoc = LIMITS.docExts.indexOf(ext) !== -1;
      if (!isImage && !isDoc) {
        statusEl.innerHTML = '<div class="err">Такой файл не принимается. Картинки: ' + LIMITS.imageExts.join(', ') + '. Документы: ' + LIMITS.docExts.join(', ') + '.</div>';
        return;
      }
      if (isDoc && file.size > LIMITS.docMaxKb * 1024) {
        statusEl.innerHTML = '<div class="err">Документ на ' + Math.round(file.size / 1024) + ' КБ, потолок — ' + LIMITS.docMaxKb + ' КБ. Документы не сжимаются.</div>';
        return;
      }
      sendBtn.disabled = true;
      statusEl.innerHTML = '<div class="muted">' + (isImage ? 'Сжимаю и отправляю…' : 'Отправляю…') + '</div>';

      var prepared = isImage
        ? compressImage(file).then(function (blob) { return { blob: blob, filename: file.name.replace(/\\.[A-Za-z0-9]{1,8}$/, '') + '.jpg' }; })
        : Promise.resolve({ blob: file, filename: file.name });

      prepared
        .then(function (p) { return readAsDataUrl(p.blob).then(function (url) { return { url: url, filename: p.filename }; }); })
        .then(function (p) {
          return fetch('/mcp/attach/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project: current.project,
              hash: current.hash,
              filename: p.filename,
              caption: caption,
              content_base64: base64Of(p.url),
            }),
          });
        })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          sendBtn.disabled = false;
          if (!res.ok) {
            statusEl.innerHTML = '<div class="err">' + (res.data && res.data.error && res.data.error.message || 'Не удалось приложить файл.') + '</div>';
            return;
          }
          statusEl.innerHTML = '<div class="ok">Приложено: ' + (res.data.line || 'файл в карточке.') + '</div>';
          fileEl.value = '';
          captionEl.value = '';
        })
        .catch(function () {
          sendBtn.disabled = false;
          statusEl.innerHTML = '<div class="err">Отправить не удалось — проверьте связь и попробуйте ещё раз.</div>';
        });
    });
  })();
  </script>`, { extraHead: '' });
}

const MANIFEST = {
  name: 'HEYS — вложения к задачам',
  short_name: 'Вложения',
  description: 'Приложить фото или документ к задаче задачника HEYS',
  start_url: '/mcp/attach',
  scope: '/mcp/attach',
  display: 'standalone',
  background_color: '#0f1115',
  theme_color: '#0f1115',
  icons: [
    { src: '/mcp/attach/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};

const ICON_PNG = Buffer.from(
  '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',
  'base64',
);

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  parseCookies,
  setCookieHeader,
  clearCookieHeader,
  issueSession,
  verifySession,
  authenticate,
  tasksToolsFor,
  searchTasks,
  uploadAttachment,
  renderLoginPage,
  renderAppPage,
  MANIFEST,
  ICON_PNG,
};
