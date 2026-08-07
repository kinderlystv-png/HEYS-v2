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
  return {
    async rpc(fnName, params) {
      if (rpcHandlers[fnName]) return rpcHandlers[fnName](params);
      return { data: null, error: { message: 'not_found' } };
    },
    async getKVByCurator() {
      return { data: null, error: null };
    },
    async getKVManyByCurator(_bearer, _clientId, keys) {
      const out = {};
      for (const key of keys) if (kv[key] !== undefined) out[key] = kv[key];
      return { data: out, error: null };
    },
  };
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
    [tasks.keyForPath('days/recurring.md')]: { path: 'days/recurring.md', text: '', rev: 1, updatedAt: 1 },
    [tasks.keyForPath('projects/heys.md')]: {
      path: 'projects/heys.md',
      text: '- [ ] P1 Тест due:2026-08-07\n  - открыто: да или нет?\n',
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
  const snap = await board.buildBoardSnapshot(tools, { view: 'all' });
  assert.ok(snap.fetched_at);
  assert.ok(Array.isArray(snap.today.days));
  assert.ok(snap.today.days[0].slots.length >= 1);
  assert.ok(Array.isArray(snap.standup.simple_questions));
  assert.ok(snap.list);
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
