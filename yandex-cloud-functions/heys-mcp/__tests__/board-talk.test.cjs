'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const boardTalk = require('../lib/board-talk');
const tasks = require('../lib/tasks');

const TODAY = '2026-08-08';

class ToolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function memStore(initial = {}) {
  const kv = { ...initial };
  return {
    async readFile(path) {
      const file = kv[path];
      if (!file) return { path, text: '', rev: 0, updatedAt: 0 };
      return { ...file };
    },
    async writeFile(file, text) {
      const next = { ...file, text, rev: (file.rev || 0) + 1, updatedAt: Date.now() };
      kv[file.path] = next;
      return next;
    },
    kv,
  };
}

test('entityTalk appends обсудить and standup for task ref', async () => {
  const projectPath = 'projects/heys.md';
  const standupPath = tasks.STANDUP_PATH;
  const { readFile, writeFile, kv } = memStore({
    [projectPath]: {
      path: projectPath,
      text: '- [ ] P2 Тестовая задача #ноут\n',
      rev: 1,
      updatedAt: 1,
    },
    [standupPath]: {
      path: standupPath,
      text: '# Планёрка\n\n## На планёрку\n\n',
      rev: 1,
      updatedAt: 1,
    },
  });

  const hash = tasks.taskHash('heys', 'Тестовая задача');
  const ref = `heys/${hash}`;
  const nowMs = Date.UTC(2026, 7, 8, 9, 0);

  const result = await boardTalk.entityTalk({
    ref,
    label: 'Тестовая задача',
    comment: 'проверка с телефона',
    standup: true,
    audience: 'me',
  }, { readFile, writeFile, nowMs, ToolError });

  assert.equal(result.ok, true);
  assert.ok(kv[projectPath].text.includes('обсудить: проверка с телефона'));
  assert.ok(kv[standupPath].text.includes(ref));
  assert.ok(kv[standupPath].text.includes('💬 проверка с телефона'));
});

test('entityTalk agent note skips standup', async () => {
  const projectPath = 'projects/heys.md';
  const standupPath = tasks.STANDUP_PATH;
  const { readFile, writeFile, kv } = memStore({
    [projectPath]: {
      path: projectPath,
      text: '- [ ] P2 Агентская #ноут\n',
      rev: 1,
      updatedAt: 1,
    },
    [standupPath]: {
      path: standupPath,
      text: '# Планёрка\n\n## На планёрку\n\n',
      rev: 1,
      updatedAt: 1,
    },
  });

  const hash = tasks.taskHash('heys', 'Агентская');
  const nowMs = Date.UTC(2026, 7, 8, 9, 0);

  await boardTalk.entityTalk({
    ref: `heys/${hash}`,
    comment: 'сделай сам',
    audience: 'agent',
    standup: true,
  }, { readFile, writeFile, nowMs, ToolError });

  assert.ok(kv[projectPath].text.includes('для агента: сделай сам'));
  assert.equal(kv[standupPath].text.trim().endsWith('## На планёрку'), true);
});
