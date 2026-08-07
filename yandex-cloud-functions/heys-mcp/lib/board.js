'use strict';

/**
 * HTTP-мост доски задачника для PWA куратора.
 * PIN-сессия клиента «Полтавский» → createTasksTools → готовый JSON.
 * Только чтение; запись в этом контуре не делается.
 */

const { mintCuratorJwt } = require('./oauth');
const { createTasksTools } = require('./tasks-tools');
const { ToolError } = require('./tools');
const attach = require('./attach');

const DEFAULT_TASKS_CLIENT_ID = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
const DEFAULT_TASKS_CURATOR_ID = '6d4dbb32-fd9d-45b3-8e01-512595e2cb2c';

function parseCookies(header) {
  return attach.parseCookies(header);
}

function normalizeClientId(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * PIN-сессия из cookie `heys_session_token` → client_id.
 * Сначала get_subscription_status_by_session (лёгкий RPC), иначе ошибка.
 */
async function authenticatePinBoard({ cookieHeader, api, tasksClientId, nowMs = Date.now() }) {
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies.heys_session_token;
  if (!sessionToken) return { ok: false, reason: 'missing_session' };

  const { data, error } = await api.rpc('get_subscription_status_by_session', {
    p_session_token: sessionToken,
  });
  if (error) return { ok: false, reason: 'session_lookup_failed', detail: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  const clientId = row && row.client_id ? String(row.client_id) : null;
  if (!clientId) return { ok: false, reason: 'invalid_session' };

  if (normalizeClientId(clientId) !== normalizeClientId(tasksClientId)) {
    return { ok: false, reason: 'forbidden_client', clientId };
  }

  return { ok: true, clientId, sessionToken };
}

function tasksToolsForBoard({ api, curatorJwt, tasksClientId, nowMs = Date.now() }) {
  return createTasksTools({
    api,
    curatorJwt,
    clientId: tasksClientId,
    nowMs,
    ToolError,
    writeContext: (clientId) => api.issueWriteContext(curatorJwt, clientId).catch(() => null),
  }).tools;
}

/**
 * Снимок для экранов «Сегодня», «Неделя», «Решить».
 * view: today | week | decide | all (default all — для оффлайн-кэша).
 */
async function buildBoardSnapshot(tools, { view = 'all' } = {}) {
  const mode = String(view || 'all').trim().toLowerCase();
  const wantAll = mode === 'all';
  const fetchedAt = new Date().toISOString();
  const out = { fetched_at: fetchedAt, view: wantAll ? 'all' : mode };

  const jobs = [];

  if (wantAll || mode === 'decide' || mode === 'today' || mode === 'week') {
    jobs.push(
      tools.tasks_standup().then((res) => {
        out.standup = res.structured || {};
      }),
    );
  }

  if (wantAll || mode === 'today') {
    jobs.push(
      tools.tasks_calendar({ days: 1 }).then((res) => {
        out.today = res.structured || {};
      }),
    );
  }

  if (wantAll || mode === 'week') {
    jobs.push(
      tools.tasks_calendar({ days: 7 }).then((res) => {
        out.week = res.structured || {};
      }),
    );
  }

  if (wantAll || mode === 'decide' || mode === 'today') {
    jobs.push(
      tools.tasks_list().then((res) => {
        out.list = res.structured || {};
      }),
    );
  }

  await Promise.all(jobs);
  return out;
}

async function handleBoardRequest({
  method,
  query = {},
  cookieHeader,
  api,
  rawJwtSecret,
  tasksClientId,
  tasksCuratorId,
  nowMs = Date.now(),
}) {
  if (method === 'OPTIONS') {
    return { ok: true, status: 204, body: null };
  }
  if (method !== 'GET') {
    return { ok: false, status: 405, body: { error: 'method_not_allowed' } };
  }

  if (!tasksClientId) {
    return { ok: false, status: 503, body: { error: 'tasks_not_configured' } };
  }
  if (!rawJwtSecret || !tasksCuratorId) {
    return { ok: false, status: 503, body: { error: 'server_misconfigured' } };
  }

  const auth = await authenticatePinBoard({ cookieHeader, api, tasksClientId, nowMs });
  if (!auth.ok) {
    const status = auth.reason === 'forbidden_client' ? 403 : 401;
    return { ok: false, status, body: { error: auth.reason } };
  }

  const curatorJwt = mintCuratorJwt({
    curatorId: tasksCuratorId,
    email: '',
    rawJwtSecret,
    nowMs,
  });
  const tools = tasksToolsForBoard({ api, curatorJwt, tasksClientId, nowMs });

  try {
    const snapshot = await buildBoardSnapshot(tools, { view: query.view });
    return { ok: true, status: 200, body: snapshot };
  } catch (e) {
    if (e instanceof ToolError) {
      return { ok: false, status: 400, body: { error: { code: e.code, message: e.message } } };
    }
    throw e;
  }
}

module.exports = {
  DEFAULT_TASKS_CLIENT_ID,
  DEFAULT_TASKS_CURATOR_ID,
  parseCookies,
  authenticatePinBoard,
  tasksToolsForBoard,
  buildBoardSnapshot,
  handleBoardRequest,
};
