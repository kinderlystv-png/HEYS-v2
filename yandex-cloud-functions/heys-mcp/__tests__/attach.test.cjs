'use strict';

/**
 * Страница вложений (lib/attach.js): сессия-cookie, поиск задачи и загрузка
 * файла — тем же кодом, что и MCP-инструмент tasks_attach.
 *
 * Сеть не трогается нигде: HEYS API и GitHub — фейки, как и в attachments.test.cjs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const attach = require('../lib/attach');
const tasks = require('../lib/tasks');
const assetsLib = require('../lib/assets');

const SECRET = 'unit-attach-secret-'.repeat(3);
const RAW_JWT_SECRET = 'raw-jwt-secret-'.repeat(3);
const CURATOR_ID = 'curator-1';
const EMAIL = 'kin@heyslab.ru';
const NAME = 'Кин';
const NOW = Date.UTC(2026, 7, 3, 12, 0); // 15:00 МСК

const HEYS_PROJECT = `# HEYS

## Задачи

- [ ] P1 Собрать оптимальную версию лендинга due:2026-08-04 #next ^2026-08-01
  - зум демо-ролика почти готов
- [ ] P2 Разобрать счёт за август ^2026-08-01
`;

/** Кураторский статус — рубильник SEC-031: по умолчанию куратор активен. */
function fakeApi({ files = {}, active = true, statusCalls = [] } = {}) {
  const kv = { ...files };
  kv[tasks.INDEX_KEY] = {
    files: Object.fromEntries(Object.values(files).map((f) => [f.path, { rev: f.rev, updatedAt: f.updatedAt }])),
    updatedAt: 1,
  };
  return {
    kv,
    statusCalls,
    async curatorStatus(bearer) {
      statusCalls.push(bearer);
      return active ? { ok: true } : { ok: false, error: 'curator_inactive' };
    },
    async getKVByCurator(_bearer, _clientId, key) {
      return { data: kv[key] ?? null, error: null };
    },
    async getKVManyByCurator(_bearer, _clientId, keys) {
      const out = {};
      for (const key of keys) if (kv[key] !== undefined) out[key] = kv[key];
      return { data: out, error: null };
    },
    async upsertKVManyByCurator(_bearer, _clientId, items) {
      for (const item of items) kv[item.k] = item.v;
      return { ok: true };
    },
    async issueWriteContext() {
      return 'ctx-1';
    },
  };
}

function projectApi(overrides = {}) {
  return fakeApi({
    files: {
      [tasks.keyForPath('projects/heys.md')]: { path: 'projects/heys.md', text: HEYS_PROJECT, rev: 3, updatedAt: 1 },
    },
    ...overrides,
  });
}

function sessionCookieHeader(api = projectApi(), overrides = {}) {
  const token = attach.issueSession({ curatorId: CURATOR_ID, email: EMAIL, name: NAME, ...overrides }, SECRET, NOW);
  return `${attach.COOKIE_NAME}=${encodeURIComponent(token)}`;
}

// ── Cookie: подпись, порча, срок ─────────────────────────────────────────

test('cookie-сессия переживает round-trip и ловит подмену подписи', () => {
  const token = attach.issueSession({ curatorId: CURATOR_ID, email: EMAIL, name: NAME }, SECRET, NOW);
  const ok = attach.verifySession(token, SECRET, NOW + 1000);
  assert.equal(ok.ok, true);
  assert.equal(ok.claims.sub, CURATOR_ID);
  assert.equal(ok.claims.em, EMAIL);

  const tampered = `${token.slice(0, -2)}xx`;
  assert.equal(attach.verifySession(tampered, SECRET, NOW).ok, false);
});

test('cookie-сессия истекает через заявленный срок', () => {
  const token = attach.issueSession({ curatorId: CURATOR_ID, email: EMAIL, name: NAME }, SECRET, NOW);
  const justBefore = NOW + attach.SESSION_TTL_SECONDS * 1000 - 1000;
  const justAfter = NOW + attach.SESSION_TTL_SECONDS * 1000 + 1000;
  assert.equal(attach.verifySession(token, SECRET, justBefore).ok, true);
  assert.equal(attach.verifySession(token, SECRET, justAfter).ok, false);
});

test('parseCookies достаёт нужное имя из заголовка с несколькими парами', () => {
  const cookies = attach.parseCookies('a=1; heys_attach_session=abc.def; b=2');
  assert.equal(cookies[attach.COOKIE_NAME], 'abc.def');
});

// ── authenticate(): SEC-031 fail-closed ──────────────────────────────────

test('authenticate без cookie отказывает, не трогая API', async () => {
  const api = projectApi();
  const res = await attach.authenticate({ cookieHeader: '', secret: SECRET, rawJwtSecret: RAW_JWT_SECRET, api, nowMs: NOW });
  assert.equal(res.ok, false);
  assert.equal(api.statusCalls.length, 0);
});

test('authenticate с валидной cookie минтит свежий JWT и проверяет куратора', async () => {
  const api = projectApi();
  const res = await attach.authenticate({
    cookieHeader: sessionCookieHeader(api), secret: SECRET, rawJwtSecret: RAW_JWT_SECRET, api, nowMs: NOW,
  });
  assert.equal(res.ok, true);
  assert.equal(res.curatorId, CURATOR_ID);
  assert.equal(res.name, NAME);
  assert.equal(api.statusCalls.length, 1);
  assert.equal(api.statusCalls[0], res.curatorJwt);
});

test('SEC-031: отключённый куратор теряет доступ, хотя cookie ещё не истекла', async () => {
  const api = projectApi({ active: false });
  const res = await attach.authenticate({
    cookieHeader: sessionCookieHeader(api), secret: SECRET, rawJwtSecret: RAW_JWT_SECRET, api, nowMs: NOW,
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'curator_inactive');
});

test('без rawJwtSecret доступ не выдаётся', async () => {
  const api = projectApi();
  const res = await attach.authenticate({
    cookieHeader: sessionCookieHeader(api), secret: SECRET, rawJwtSecret: null, api, nowMs: NOW,
  });
  assert.equal(res.ok, false);
  assert.equal(api.statusCalls.length, 0);
});

test('cookie, подписанная другим секретом, не проходит', async () => {
  const api = projectApi();
  const foreignToken = attach.issueSession({ curatorId: CURATOR_ID, email: EMAIL, name: NAME }, 'другой-секрет-'.repeat(4), NOW);
  const res = await attach.authenticate({
    cookieHeader: `${attach.COOKIE_NAME}=${foreignToken}`, secret: SECRET, rawJwtSecret: RAW_JWT_SECRET, api, nowMs: NOW,
  });
  assert.equal(res.ok, false);
});

// ── Поиск: адрес и слова — движком tasks_context ─────────────────────────

test('поиск по адресу «проект/хэш» находит задачу первой строкой', async () => {
  const api = projectApi();
  const auth = await attach.authenticate({ cookieHeader: sessionCookieHeader(api), secret: SECRET, rawJwtSecret: RAW_JWT_SECRET, api, nowMs: NOW });
  const tools = attach.tasksToolsFor({ api, curatorJwt: auth.curatorJwt, tasksClientId: 'client-1', nowMs: NOW });
  const hash = tasks.taskHash('heys', 'Собрать оптимальную версию лендинга');
  const res = await attach.searchTasks({ tools, query: `heys/${hash}` });
  assert.equal(res.matches.length >= 1, true);
  assert.equal(res.matches[0].ref, `heys/${hash}`);
  assert.equal(res.matches[0].project, 'heys');
  assert.equal(res.matches[0].due, '2026-08-04');
});

test('поиск по словам названия находит задачу без адреса', async () => {
  const api = projectApi();
  const auth = await attach.authenticate({ cookieHeader: sessionCookieHeader(api), secret: SECRET, rawJwtSecret: RAW_JWT_SECRET, api, nowMs: NOW });
  const tools = attach.tasksToolsFor({ api, curatorJwt: auth.curatorJwt, tasksClientId: 'client-1', nowMs: NOW });
  const res = await attach.searchTasks({ tools, query: 'счёт август' });
  assert.equal(res.matches.some((m) => /счёт/i.test(m.title)), true);
});

test('короткий запрос не ходит в задачник и отдаёт пустой список', async () => {
  const api = projectApi();
  const auth = await attach.authenticate({ cookieHeader: sessionCookieHeader(api), secret: SECRET, rawJwtSecret: RAW_JWT_SECRET, api, nowMs: NOW });
  const tools = attach.tasksToolsFor({ api, curatorJwt: auth.curatorJwt, tasksClientId: 'client-1', nowMs: NOW });
  const res = await attach.searchTasks({ tools, query: 'а' });
  assert.deepEqual(res.matches, []);
});

// ── Загрузка: та же логика, что tasks_attach ─────────────────────────────

function fakeGitHub({ status = 201 } = {}) {
  const calls = [];
  return {
    calls,
    request: async (req) => {
      calls.push(req);
      return { status };
    },
  };
}

test('upload вызывает ровно tasks_attach: файл в хранилище, строка в карточке', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const assetsClient = assetsLib.createAssetsClient({ token: 'fake-token', repo: 'kinderlystv-png/tasks-assets', branch: 'main', request: github.request });
  const auth = await attach.authenticate({ cookieHeader: sessionCookieHeader(api), secret: SECRET, rawJwtSecret: RAW_JWT_SECRET, api, nowMs: NOW });
  const tools = attach.tasksToolsFor({ api, curatorJwt: auth.curatorJwt, tasksClientId: 'client-1', nowMs: NOW, assetsClient });

  const hash = tasks.taskHash('heys', 'Разобрать счёт за август');
  const res = await attach.uploadAttachment({
    tools,
    body: {
      project: 'heys', hash, filename: 'screenshot.jpg',
      content_base64: Buffer.from('привет').toString('base64'),
      caption: 'скрин ошибки',
    },
  });
  assert.equal(github.calls.length, 1, 'файл ушёл в хранилище ровно один раз');
  assert.match(res.structured.line, /^вложение: assets\/2026-08\/2026-08-03-1500-skrin-oshibki\.jpg — скрин ошибки$/);
  const savedProject = api.kv[tasks.keyForPath('projects/heys.md')].text;
  assert.match(savedProject, /вложение: assets\/2026-08\/.*\.jpg — скрин ошибки/);
});

test('слишком большая картинка отклоняется до заливки — GitHub не вызывается', async () => {
  const api = projectApi();
  const github = fakeGitHub();
  const assetsClient = assetsLib.createAssetsClient({ token: 'fake-token', repo: 'kinderlystv-png/tasks-assets', branch: 'main', request: github.request });
  const auth = await attach.authenticate({ cookieHeader: sessionCookieHeader(api), secret: SECRET, rawJwtSecret: RAW_JWT_SECRET, api, nowMs: NOW });
  const tools = attach.tasksToolsFor({ api, curatorJwt: auth.curatorJwt, tasksClientId: 'client-1', nowMs: NOW, assetsClient });

  const hash = tasks.taskHash('heys', 'Разобрать счёт за август');
  const big = Buffer.alloc(assetsLib.IMAGE_MAX_BYTES + 10, 1).toString('base64');
  await assert.rejects(
    () => attach.uploadAttachment({ tools, body: { project: 'heys', hash, filename: 'photo.jpg', content_base64: big, caption: 'большое фото' } }),
    (e) => {
      assert.equal(e.code, 'file_too_large');
      return true;
    },
  );
  assert.equal(github.calls.length, 0);
});

test('токен хранилища не появляется ни в структуре, ни в тексте ответа при сбое', async () => {
  const api = projectApi();
  const FAKE_TOKEN = 'github_pat_11ABCDEFG0aaaaaaaaaaaa_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbCCCC';
  const github = { request: async () => ({ status: 401, body: `bad credentials for ${FAKE_TOKEN}` }) };
  const assetsClient = assetsLib.createAssetsClient({ token: FAKE_TOKEN, repo: 'kinderlystv-png/tasks-assets', branch: 'main', request: github.request });
  const auth = await attach.authenticate({ cookieHeader: sessionCookieHeader(api), secret: SECRET, rawJwtSecret: RAW_JWT_SECRET, api, nowMs: NOW });
  const tools = attach.tasksToolsFor({ api, curatorJwt: auth.curatorJwt, tasksClientId: 'client-1', nowMs: NOW, assetsClient });

  const hash = tasks.taskHash('heys', 'Разобрать счёт за август');
  await assert.rejects(
    () => attach.uploadAttachment({ tools, body: { project: 'heys', hash, filename: 'photo.jpg', content_base64: Buffer.from('x').toString('base64'), caption: 'фото' } }),
    (e) => {
      assert.equal(e.code, 'attach_upload_failed');
      assert.equal(JSON.stringify(e.message).includes(FAKE_TOKEN), false);
      return true;
    },
  );
});

// ── HTML: без XSS и с ожидаемыми элементами ──────────────────────────────

test('страница входа экранирует ошибку и email', () => {
  const page = attach.renderLoginPage({ error: '<script>alert(1)</script>', email: '"><img src=x>' });
  assert.equal(page.includes('<script>alert(1)</script>'), false);
  assert.equal(page.includes('<img src=x>'), false);
  assert.match(page, /Вход тем же кураторским аккаунтом/);
});

test('главная страница содержит nonce у инлайн-скрипта и лимиты вложений', () => {
  const page = attach.renderAppPage({ name: 'Кин', nonce: 'abc123' });
  assert.match(page, /<script nonce="abc123">/);
  assert.match(page, new RegExp(`${Math.round(assetsLib.IMAGE_MAX_BYTES / 1024)} КБ`));
  assert.match(page, /Кин/);
});

test('манифест ссылается на страницу вложений как на scope', () => {
  assert.equal(attach.MANIFEST.start_url, '/mcp/attach');
  assert.equal(attach.MANIFEST.scope, '/mcp/attach');
  assert.equal(attach.MANIFEST.display, 'standalone');
});

test('иконка — валидный PNG (сигнатура + декларация 512x512)', () => {
  assert.deepEqual(attach.ICON_PNG.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(attach.ICON_PNG.readUInt32BE(16), 512);
  assert.equal(attach.ICON_PNG.readUInt32BE(20), 512);
});
