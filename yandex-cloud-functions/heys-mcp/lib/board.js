'use strict';

/**
 * HTTP-мост доски задачника для PWA куратора.
 * PIN-сессия клиента «Полтавский» → createTasksTools → готовый JSON.
 * Чтение снимка; запись — talk, resolve, sleep, reslot, slot-done, habit, close-day.
 */

const { mintCuratorJwt } = require('./oauth');
const { createTasksTools } = require('./tasks-tools');
const { ToolError } = require('./tools');
const tasks = require('./tasks');
const attach = require('./attach');
const { parseRef } = require('./board-talk');

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

function parseHabits(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ') || !trimmed.includes('|')) continue;
    const cut = trimmed.slice(2);
    const pipe = cut.indexOf('|');
    const name = cut.slice(0, pipe).trim();
    const days = cut.slice(pipe + 1).split(',').map((d) => d.trim()).filter(Boolean);
    out.push({ name, days: [...new Set(days)].sort() });
  }
  return out;
}

/**
 * Превью «Закрыть день» — по умолчанию вчера, как tasks_close_day.
 * Только чтение: галочки слотов, заметка `> …`, привычки за день.
 */
async function buildCloseDayPreview(tools, nowMs = Date.now()) {
  const date = tasks.shiftDate(tasks.taskDay(nowMs), -1);
  let dayText = '';
  try {
    const res = await tools.tasks_read({ path: `days/${date}.md` });
    dayText = (res.structured && res.structured.text) || '';
  } catch {
    /* пустой день — норма */
  }

  const note = tasks.dayNote(dayText);
  const slots = tasks.parseSlots(dayText, { dayStart: tasks.BOARD_DAY_START }).map((s) => ({
    from: s.start,
    to: s.end,
    title: s.title,
    kind: s.kind,
    done: s.done,
    whose: s.whose || null,
    takes: s.takes || [],
  }));

  let habits = [];
  try {
    const habitsFile = await tools.tasks_read({ path: 'habits.md' });
    habits = parseHabits((habitsFile.structured && habitsFile.structured.text) || '')
      .map((h) => ({ name: h.name, done: h.days.includes(date) }));
  } catch {
    /* habits.md может отсутствовать */
  }

  return {
    date,
    closed: !!note,
    note: note ? note.text : null,
    slots,
    habits,
    open_count: slots.filter((s) => !s.done).length,
    done_count: slots.filter((s) => s.done).length,
  };
}

/** Привычки за сегодня — чипы на экране «Сегодня». */
async function buildTodayHabits(tools, nowMs = Date.now()) {
  const date = tasks.taskDay(nowMs);
  let habits = [];
  try {
    const habitsFile = await tools.tasks_read({ path: 'habits.md' });
    habits = parseHabits((habitsFile.structured && habitsFile.structured.text) || '')
      .map((h) => ({ name: h.name, done: h.days.includes(date) }));
  } catch {
    /* habits.md может отсутствовать */
  }
  return { date, habits };
}

/**
 * Снимок для экранов «Сегодня», «Неделя», «Решить», «Закрыть день».
 * view: today | week | decide | close | all (default all — для оффлайн-кэша).
 */
async function buildBoardSnapshot(tools, { view = 'all', nowMs = Date.now() } = {}) {
  const mode = String(view || 'all').trim().toLowerCase();
  const wantAll = mode === 'all';
  const fetchedAt = new Date().toISOString();
  const out = { fetched_at: fetchedAt, view: wantAll ? 'all' : mode };

  const jobs = [];

  if (wantAll || mode === 'decide' || mode === 'today' || mode === 'week' || mode === 'close') {
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

  if (wantAll || mode === 'today' || mode === 'decide') {
    jobs.push(
      tools.tasks_orders().then((res) => {
        out.orders = res.structured || {};
      }),
    );
  }

  if (wantAll || mode === 'decide' || mode === 'today') {
    jobs.push(
      tools.tasks_quick().then((res) => {
        out.quick = res.structured || {};
      }),
    );
  }

  if (wantAll || mode === 'close' || mode === 'today') {
    jobs.push(
      buildCloseDayPreview(tools, nowMs).then((preview) => {
        out.close_day = preview;
      }),
    );
  }

  if (wantAll || mode === 'today') {
    jobs.push(
      buildTodayHabits(tools, nowMs).then((preview) => {
        out.habits = preview.habits;
        out.habits_date = preview.date;
      }),
    );
  }

  await Promise.all(jobs);
  return out;
}

async function authenticateBoardCurator({
  cookieHeader, api, tasksClientId, rawJwtSecret, tasksCuratorId, nowMs = Date.now(),
}) {
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
  const { tools } = createTasksTools({
    api,
    curatorJwt,
    clientId: tasksClientId,
    nowMs,
    ToolError,
    writeContext: (clientId) => api.issueWriteContext(curatorJwt, clientId).catch(() => null),
  });
  return { ok: true, tools };
}

function toolErrorResponse(e) {
  if (e instanceof ToolError) {
    return { ok: false, status: 400, body: { error: { code: e.code, message: e.message } } };
  }
  throw e;
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

  const session = await authenticateBoardCurator({
    cookieHeader, api, tasksClientId, rawJwtSecret, tasksCuratorId, nowMs,
  });
  if (!session.ok) return session;

  try {
    const snapshot = await buildBoardSnapshot(session.tools, { view: query.view, nowMs });
    return { ok: true, status: 200, body: snapshot };
  } catch (e) {
    return toolErrorResponse(e);
  }
}

async function handleBoardTalkRequest({
  method,
  body = {},
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
  if (method !== 'POST') {
    return { ok: false, status: 405, body: { error: 'method_not_allowed' } };
  }

  const session = await authenticateBoardCurator({
    cookieHeader, api, tasksClientId, rawJwtSecret, tasksCuratorId, nowMs,
  });
  if (!session.ok) return session;

  try {
    const result = await session.tools.board_entity_talk(body || {});
    return { ok: true, status: 200, body: { ...result, fetched_at: new Date().toISOString() } };
  } catch (e) {
    return toolErrorResponse(e);
  }
}

/** Ответ на простой вопрос с доски — tasks_resolve по ref и тексту «открыто:». */
async function handleBoardResolveRequest({
  method,
  body = {},
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
  if (method !== 'POST') {
    return { ok: false, status: 405, body: { error: 'method_not_allowed' } };
  }

  const session = await authenticateBoardCurator({
    cookieHeader, api, tasksClientId, rawJwtSecret, tasksCuratorId, nowMs,
  });
  if (!session.ok) return session;

  const refParsed = parseRef(body.ref);
  if (!refParsed) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'bad_ref', message: 'Нужен ref задачи (проект/хэш).' } },
    };
  }

  const answer = String(body.answer || '').trim();
  if (!answer) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'empty_answer', message: 'Нужен ответ.' } },
    };
  }

  const needle = String(body.question || body.needle || '').trim();
  if (!needle) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'empty_needle', message: 'Нужен текст вопроса.' } },
    };
  }

  try {
    const result = await session.tools.tasks_resolve({
      project: String(body.project || refParsed.project).trim().toLowerCase(),
      hash: refParsed.hash,
      needle,
      note: answer,
    });
    return {
      ok: true,
      status: 200,
      body: { ok: true, ...result.structured, fetched_at: new Date().toISOString() },
    };
  } catch (e) {
    return toolErrorResponse(e);
  }
}

/** Отложить простой вопрос — tasks_standup sleep (строка «открыто:» остаётся). */
async function handleBoardSleepRequest({
  method,
  body = {},
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
  if (method !== 'POST') {
    return { ok: false, status: 405, body: { error: 'method_not_allowed' } };
  }

  const session = await authenticateBoardCurator({
    cookieHeader, api, tasksClientId, rawJwtSecret, tasksCuratorId, nowMs,
  });
  if (!session.ok) return session;

  const needle = String(body.question || body.sleep || '').trim();
  if (!needle) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'empty_question', message: 'Нужен текст вопроса.' } },
    };
  }

  const args = { sleep: needle };
  if (body.sleep_days != null && body.sleep_days !== '') {
    args.sleep_days = body.sleep_days;
  }

  try {
    const result = await session.tools.tasks_standup(args);
    return {
      ok: true,
      status: 200,
      body: { ok: true, ...result.structured, fetched_at: new Date().toISOString() },
    };
  } catch (e) {
    return toolErrorResponse(e);
  }
}

/** Перенос слота в пределах дня — tasks_reslot (to_date не передаём). */
async function handleBoardReslotRequest({
  method,
  body = {},
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
  if (method !== 'POST') {
    return { ok: false, status: 405, body: { error: 'method_not_allowed' } };
  }

  const session = await authenticateBoardCurator({
    cookieHeader, api, tasksClientId, rawJwtSecret, tasksCuratorId, nowMs,
  });
  if (!session.ok) return session;

  const date = String(body.date || tasks.taskDay(nowMs)).trim();
  const at = String(body.at || '').trim();
  if (!at) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'empty_at', message: 'Нужно время начала слота (at).' } },
    };
  }

  const from = String(body.from || '').trim();
  if (!from) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'empty_from', message: 'Нужно новое время начала (from).' } },
    };
  }

  const args = { date, at, from };
  if (body.to != null && String(body.to).trim()) args.to = String(body.to).trim();
  if (body.title != null && String(body.title).trim()) args.title = String(body.title).trim();

  try {
    const result = await session.tools.tasks_reslot(args);
    return {
      ok: true,
      status: 200,
      body: { ok: true, ...result.structured, fetched_at: new Date().toISOString() },
    };
  } catch (e) {
    return toolErrorResponse(e);
  }
}

/**
 * Закрытие вчерашнего дня с PWA — тот же tasks_close_day, что утренний ритуал.
 * Body: { date?, done?: string[], note } — note обязателен.
 */
async function handleBoardCloseDayRequest({
  method,
  body = {},
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
  if (method !== 'POST') {
    return { ok: false, status: 405, body: { error: 'method_not_allowed' } };
  }

  const session = await authenticateBoardCurator({
    cookieHeader, api, tasksClientId, rawJwtSecret, tasksCuratorId, nowMs,
  });
  if (!session.ok) return session;

  const note = String(body.note || '').trim();
  if (!note) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: 'note_required',
          message: 'Нужна одна фраза «как прошло» — она же отметка, что день закрывали.',
        },
      },
    };
  }

  const doneRaw = Array.isArray(body.done) ? body.done : (body.done ? [body.done] : []);
  const done = doneRaw.map((entry) => String(entry || '').trim()).filter(Boolean);

  const args = { note, done };
  if (body.date != null && String(body.date).trim()) {
    args.date = String(body.date).trim();
  }

  try {
    const result = await session.tools.tasks_close_day(args);
    return {
      ok: true,
      status: 200,
      body: { ok: true, ...result.structured, fetched_at: new Date().toISOString() },
    };
  } catch (e) {
    return toolErrorResponse(e);
  }
}

/**
 * ✓ слота на «Сегодня» — toggle [x] в days/<date>.md.
 * Body: { date?, start|at, title?, done? }
 */
async function handleBoardSlotDoneRequest({
  method,
  body = {},
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
  if (method !== 'POST') {
    return { ok: false, status: 405, body: { error: 'method_not_allowed' } };
  }

  const session = await authenticateBoardCurator({
    cookieHeader, api, tasksClientId, rawJwtSecret, tasksCuratorId, nowMs,
  });
  if (!session.ok) return session;

  try {
    const result = await session.tools.board_slot_done(body || {});
    return {
      ok: true,
      status: 200,
      body: { ok: true, ...result.structured, fetched_at: new Date().toISOString() },
    };
  } catch (e) {
    return toolErrorResponse(e);
  }
}

/**
 * ✓ привычки на «Сегодня» — дата в habits.md (toggle).
 * Body: { habit, date?, done? }
 */
async function handleBoardHabitRequest({
  method,
  body = {},
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
  if (method !== 'POST') {
    return { ok: false, status: 405, body: { error: 'method_not_allowed' } };
  }

  const session = await authenticateBoardCurator({
    cookieHeader, api, tasksClientId, rawJwtSecret, tasksCuratorId, nowMs,
  });
  if (!session.ok) return session;

  try {
    const result = await session.tools.board_habit_done(body || {});
    return {
      ok: true,
      status: 200,
      body: { ok: true, ...result.structured, fetched_at: new Date().toISOString() },
    };
  } catch (e) {
    return toolErrorResponse(e);
  }
}

module.exports = {
  DEFAULT_TASKS_CLIENT_ID,
  DEFAULT_TASKS_CURATOR_ID,
  parseCookies,
  authenticatePinBoard,
  tasksToolsForBoard,
  buildBoardSnapshot,
  buildCloseDayPreview,
  buildTodayHabits,
  handleBoardRequest,
  handleBoardTalkRequest,
  handleBoardResolveRequest,
  handleBoardSleepRequest,
  handleBoardReslotRequest,
  handleBoardCloseDayRequest,
  handleBoardSlotDoneRequest,
  handleBoardHabitRequest,
};
