'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const board = require('../lib/board');
const tasks = require('../lib/tasks');
const { createTasksTools } = require('../lib/tasks-tools');

const CLIENT = board.DEFAULT_TASKS_CLIENT_ID;
const OTHER = '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc';
const CURATOR = board.DEFAULT_TASKS_CURATOR_ID;
const JWT = 'curator-jwt';
const NOW = Date.UTC(2026, 7, 7, 9, 0);

class ToolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function liveApi(files = {}, rpcHandlers = {}) {
  const kv = { ...files };
  if (!kv[tasks.INDEX_KEY]) {
    kv[tasks.INDEX_KEY] = {
      files: Object.fromEntries(Object.values(files).map((f) => [f.path, { rev: f.rev, updatedAt: f.updatedAt }])),
      updatedAt: 1,
    };
  }
  const api = {
    kv,
    writes: [],
    async rpc(fnName, params) {
      if (rpcHandlers[fnName]) return rpcHandlers[fnName](params);
      return { data: null, error: { message: 'not_found' } };
    },
    async getKVByCurator(_bearer, _clientId, key) {
      if (kv[key] !== undefined) return { data: kv[key], error: null };
      return { data: null, error: null };
    },
    async getKVManyByCurator(_bearer, _clientId, keys) {
      const out = {};
      for (const key of keys) if (kv[key] !== undefined) out[key] = kv[key];
      return { data: out, error: null };
    },
    async issueWriteContext() {
      return 'ctx-test';
    },
    async upsertKVManyByCurator(_bearer, _clientId, items) {
      api.writes.push({ items });
      for (const item of items) kv[item.k] = item.v;
      return { ok: true };
    },
  };
  return api;
}

test('authenticatePinBoard rejects missing cookie', async () => {
  const api = liveApi();
  const auth = await board.authenticatePinBoard({ cookieHeader: '', api, tasksClientId: CLIENT });
  assert.equal(auth.ok, false);
  assert.equal(auth.reason, 'missing_session');
});

test('authenticatePinBoard rejects non-tasks client', async () => {
  const api = liveApi({}, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: OTHER, status: 'active' }],
      error: null,
    }),
  });
  const auth = await board.authenticatePinBoard({
    cookieHeader: 'heys_session_token=abc',
    api,
    tasksClientId: CLIENT,
  });
  assert.equal(auth.ok, false);
  assert.equal(auth.reason, 'forbidden_client');
});

test('authenticatePinBoard accepts tasks client session', async () => {
  const api = liveApi({}, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: CLIENT, status: 'active' }],
      error: null,
    }),
  });
  const auth = await board.authenticatePinBoard({
    cookieHeader: 'heys_session_token=abc',
    api,
    tasksClientId: CLIENT,
  });
  assert.equal(auth.ok, true);
  assert.equal(auth.clientId, CLIENT);
});

test('buildBoardSnapshot returns standup simple_questions and calendar days', async () => {
  const dayText = '- 10:00–11:00 #фокус Работа над доской\n';
  const api = liveApi({
    [tasks.keyForPath('days/2026-08-07.md')]: { path: 'days/2026-08-07.md', text: dayText, rev: 1, updatedAt: 1 },
    [tasks.keyForPath('days/2026-08-06.md')]: {
      path: 'days/2026-08-06.md',
      text: '- [x] 10:00–11:00 #фокус Работа\n- 14:00–15:00 #дело Встреча\n> вчера нормально\n',
      rev: 1,
      updatedAt: 1,
    },
    [tasks.keyForPath('days/recurring.md')]: { path: 'days/recurring.md', text: '', rev: 1, updatedAt: 1 },
    [tasks.keyForPath('projects/heys.md')]: {
      path: 'projects/heys.md',
      text: '- [ ] P1 Тест due:2026-08-07\n  - открыто: да или нет?\n- [ ] P2 Купить леску #заказ\n  - площадка: Озон\n',
      rev: 1,
      updatedAt: 1,
    },
    [tasks.keyForPath('habits.md')]: {
      path: 'habits.md',
      text: '- Зарядка | 2026-08-06\n',
      rev: 1,
      updatedAt: 1,
    },
    [tasks.keyForPath(tasks.STANDUP_PATH)]: {
      path: tasks.STANDUP_PATH,
      text: '# Планёрка\n\n## Повестка\n',
      rev: 1,
      updatedAt: 1,
    },
  });
  const tools = createTasksTools({ api, curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError }).tools;
  const snap = await board.buildBoardSnapshot(tools, { view: 'all', nowMs: NOW });
  assert.ok(snap.fetched_at);
  assert.ok(Array.isArray(snap.today.days));
  assert.ok(snap.today.days[0].slots.length >= 1);
  assert.ok(Array.isArray(snap.standup.simple_questions));
  assert.ok(snap.list);
  assert.ok(Array.isArray(snap.orders.open));
  assert.equal(snap.orders.open.length, 1);
  assert.ok(snap.close_day);
  assert.equal(snap.close_day.date, '2026-08-06');
  assert.equal(snap.close_day.closed, true);
  assert.ok(snap.quick);
  assert.ok(Array.isArray(snap.quick.picked));
});

test('handleBoardRequest returns 403 for wrong client', async () => {
  const api = liveApi({}, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: OTHER, status: 'active' }],
      error: null,
    }),
  });
  const res = await board.handleBoardRequest({
    method: 'GET',
    query: {},
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });
  assert.equal(res.status, 403);
});

test('handleBoardResolveRequest resolves simple question via tasks_resolve', async () => {
  const hash = tasks.taskHash('heys', 'Тест');
  const ref = `heys/${hash}`;
  const projectPath = 'projects/heys.md';
  const api = liveApi({
    [tasks.keyForPath(projectPath)]: {
      path: projectPath,
      text: `- [ ] P2 Тест #blocked\n  - открыто: да или нет?\n`,
      rev: 1,
      updatedAt: 1,
    },
    [tasks.keyForPath(tasks.STANDUP_PATH)]: {
      path: tasks.STANDUP_PATH,
      text: '# Планёрка\n',
      rev: 1,
      updatedAt: 1,
    },
  }, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: CLIENT, status: 'active' }],
      error: null,
    }),
  });

  const res = await board.handleBoardResolveRequest({
    method: 'POST',
    body: { ref, question: 'да или нет', answer: 'да' },
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const saved = api.kv[tasks.keyForPath(projectPath)].text;
  assert.ok(!/открыто: да или нет/.test(saved));
  assert.match(saved, /да/);
});

test('handleBoardCloseDayRequest closes day via tasks_close_day', async () => {
  const dayPath = 'days/2026-08-06.md';
  const dayText = [
    '# 2026-08-06',
    '',
    '- [ ] 10:00–12:00 лендинг #фокус',
    '- [ ] 14:00–15:00 студия',
    '',
  ].join('\n');
  const api = liveApi({
    [tasks.keyForPath(dayPath)]: {
      path: dayPath,
      text: dayText,
      rev: 1,
      updatedAt: 1,
    },
    [tasks.keyForPath('money/2026-08.md')]: {
      path: 'money/2026-08.md',
      text: '# Деньги\n\n## Операции\n\n- 2026-08-06 · -100 · продукты · ~family\n',
      rev: 1,
      updatedAt: 1,
    },
  }, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: CLIENT, status: 'active' }],
      error: null,
    }),
  });

  const res = await board.handleBoardCloseDayRequest({
    method: 'POST',
    body: {
      date: '2026-08-06',
      done: ['10:00'],
      note: 'лендинг сделал, студию пропустил',
    },
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.date, '2026-08-06');
  assert.equal(res.body.note, 'лендинг сделал, студию пропустил');
  assert.equal(res.body.done.length, 1);
  assert.equal(res.body.done[0].from, '10:00');
  assert.equal(res.body.open.length, 1);
  assert.equal(res.body.open[0].from, '14:00');

  const saved = api.kv[tasks.keyForPath(dayPath)].text;
  assert.match(saved, /- \[x\] 10:00–12:00 лендинг/);
  assert.match(saved, /- \[ \] 14:00–15:00 студия/);
  assert.match(saved, /> лендинг сделал, студию пропустил/);
});

test('handleBoardCloseDayRequest requires note', async () => {
  const api = liveApi({}, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: CLIENT, status: 'active' }],
      error: null,
    }),
  });

  const res = await board.handleBoardCloseDayRequest({
    method: 'POST',
    body: { done: ['10:00'] },
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'note_required');
});

test('handleBoardSleepRequest snoozes question via tasks_standup sleep', async () => {
  const projectPath = 'projects/heys.md';
  const api = liveApi({
    [tasks.keyForPath(projectPath)]: {
      path: projectPath,
      text: `- [ ] P2 Тест #blocked\n  - открыто: да или нет?\n`,
      rev: 1,
      updatedAt: 1,
    },
    [tasks.keyForPath(tasks.STANDUP_PATH)]: {
      path: tasks.STANDUP_PATH,
      text: '# Планёрка\n',
      rev: 1,
      updatedAt: 1,
    },
  }, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: CLIENT, status: 'active' }],
      error: null,
    }),
  });

  const before = api.kv[tasks.keyForPath(projectPath)].text;
  const res = await board.handleBoardSleepRequest({
    method: 'POST',
    body: { question: 'да или нет' },
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.sleeping, true);
  assert.equal(api.kv[tasks.keyForPath(projectPath)].text, before, 'открыто: остаётся');
});

test('handleBoardReslotRequest moves slot within same day', async () => {
  const dayPath = 'days/2026-08-07.md';
  const dayText = '- 10:00–11:00 Работа над доской #фокус\n';
  const api = liveApi({
    [tasks.keyForPath(dayPath)]: {
      path: dayPath,
      text: dayText,
      rev: 1,
      updatedAt: 1,
    },
  }, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: CLIENT, status: 'active' }],
      error: null,
    }),
  });

  const res = await board.handleBoardReslotRequest({
    method: 'POST',
    body: { date: '2026-08-07', at: '10:00', from: '14:00', to: '15:00' },
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const saved = api.kv[tasks.keyForPath(dayPath)].text;
  assert.match(saved, /14:00–15:00 Работа над доской/);
  assert.ok(!/10:00–11:00/.test(saved));
});

test('handleBoardReslotRequest requires at and from', async () => {
  const api = liveApi({}, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: CLIENT, status: 'active' }],
      error: null,
    }),
  });

  const res = await board.handleBoardReslotRequest({
    method: 'POST',
    body: { date: '2026-08-07', from: '14:00' },
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'empty_at');
});

test('buildBoardSnapshot includes today habits and slot done flag', async () => {
  const api = liveApi({
    [tasks.keyForPath('days/2026-08-07.md')]: {
      path: 'days/2026-08-07.md',
      text: '- [x] 10:00–11:00 #фокус Работа\n- 14:00–15:00 #дело Встреча\n',
      rev: 1,
      updatedAt: 1,
    },
    [tasks.keyForPath('days/recurring.md')]: { path: 'days/recurring.md', text: '', rev: 1, updatedAt: 1 },
    [tasks.keyForPath('habits.md')]: {
      path: 'habits.md',
      text: '- Зарядка | 2026-08-07\n- Чтение |\n',
      rev: 1,
      updatedAt: 1,
    },
    [tasks.keyForPath(tasks.STANDUP_PATH)]: {
      path: tasks.STANDUP_PATH,
      text: '# Планёрка\n',
      rev: 1,
      updatedAt: 1,
    },
  });
  const tools = createTasksTools({ api, curatorJwt: JWT, clientId: CLIENT, nowMs: NOW, ToolError }).tools;
  const snap = await board.buildBoardSnapshot(tools, { view: 'today', nowMs: NOW });
  assert.ok(Array.isArray(snap.habits));
  assert.equal(snap.habits_date, '2026-08-07');
  const byName = Object.fromEntries(snap.habits.map((h) => [h.name, h.done]));
  assert.equal(byName['Зарядка'], true);
  assert.equal(byName['Чтение'], false);
  const slots = snap.today.days[0].slots;
  const work = slots.find((s) => s.from === '10:00');
  const meet = slots.find((s) => s.from === '14:00');
  assert.equal(work.done, true);
  assert.equal(meet.done, false);
});

test('handleBoardSlotDoneRequest toggles slot checkbox', async () => {
  const dayPath = 'days/2026-08-07.md';
  const api = liveApi({
    [tasks.keyForPath(dayPath)]: {
      path: dayPath,
      text: '- 10:00–11:00 Работа над доской #фокус\n',
      rev: 1,
      updatedAt: 1,
    },
  }, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: CLIENT, status: 'active' }],
      error: null,
    }),
  });

  const mark = await board.handleBoardSlotDoneRequest({
    method: 'POST',
    body: { date: '2026-08-07', start: '10:00', title: 'Работа' },
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });
  assert.equal(mark.status, 200);
  assert.equal(mark.body.done, true);
  assert.match(api.kv[tasks.keyForPath(dayPath)].text, /- \[x\] 10:00–11:00 Работа над доской/);

  const unmark = await board.handleBoardSlotDoneRequest({
    method: 'POST',
    body: { date: '2026-08-07', start: '10:00', done: false },
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });
  assert.equal(unmark.status, 200);
  assert.equal(unmark.body.done, false);
  assert.match(api.kv[tasks.keyForPath(dayPath)].text, /- \[ \] 10:00–11:00 Работа над доской/);
});

test('handleBoardHabitRequest toggles habit date', async () => {
  const api = liveApi({
    [tasks.keyForPath('habits.md')]: {
      path: 'habits.md',
      text: '- Зарядка |\n',
      rev: 1,
      updatedAt: 1,
    },
  }, {
    get_subscription_status_by_session: () => ({
      data: [{ client_id: CLIENT, status: 'active' }],
      error: null,
    }),
  });

  const mark = await board.handleBoardHabitRequest({
    method: 'POST',
    body: { habit: 'Зарядка', date: '2026-08-07' },
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });
  assert.equal(mark.status, 200);
  assert.equal(mark.body.done, true);
  assert.match(api.kv[tasks.keyForPath('habits.md')].text, /Зарядка \| 2026-08-07/);

  const unmark = await board.handleBoardHabitRequest({
    method: 'POST',
    body: { habit: 'Зарядка', date: '2026-08-07', done: false },
    cookieHeader: 'heys_session_token=tok',
    api,
    rawJwtSecret: 'x'.repeat(32),
    tasksClientId: CLIENT,
    tasksCuratorId: CURATOR,
    nowMs: NOW,
  });
  assert.equal(unmark.status, 200);
  assert.equal(unmark.body.done, false);
  assert.match(api.kv[tasks.keyForPath('habits.md')].text, /- Зарядка \|$/m);
});
