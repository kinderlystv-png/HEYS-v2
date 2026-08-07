'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOL_SCHEMAS, WRITE_TOOLS } = require('../lib/tools');
const { buildCuratorSchemas } = require('../lib/curator');
const {
  annotateToolSchemas,
  DIARY_WRITE_TOOLS,
  TASKS_WRITE_TOOLS,
  DESTRUCTIVE_TOOLS,
} = require('../lib/tool-annotations');

test('DIARY_WRITE_TOOLS совпадает с WRITE_TOOLS в tools.js', () => {
  assert.deepEqual([...DIARY_WRITE_TOOLS].sort(), [...WRITE_TOOLS].sort());
});

test('diary TOOL_SCHEMAS: у каждого tool есть MCP annotations', () => {
  for (const schema of TOOL_SCHEMAS) {
    assert.ok(schema.annotations, `${schema.name}: нет annotations`);
    assert.equal(typeof schema.annotations.readOnlyHint, 'boolean');
    assert.equal(typeof schema.annotations.destructiveHint, 'boolean');
    assert.equal(
      schema.annotations.readOnlyHint,
      !WRITE_TOOLS.has(schema.name),
      `${schema.name}: readOnlyHint должен совпадать с WRITE_TOOLS`,
    );
  }
});

test('чтение не marked destructive; delete — destructive', () => {
  const getDay = TOOL_SCHEMAS.find((s) => s.name === 'heys_get_day');
  const del = TOOL_SCHEMAS.find((s) => s.name === 'heys_delete_meal');
  const log = TOOL_SCHEMAS.find((s) => s.name === 'heys_log_meal');
  assert.equal(getDay.annotations.readOnlyHint, true);
  assert.equal(getDay.annotations.destructiveHint, false);
  assert.equal(del.annotations.readOnlyHint, false);
  assert.equal(del.annotations.destructiveHint, true);
  assert.equal(log.annotations.readOnlyHint, false);
  assert.equal(log.annotations.destructiveHint, false);
});

test('annotateToolSchemas: tasks_read vs tasks_checkpoint', () => {
  const [read, checkpoint] = annotateToolSchemas([
    { name: 'tasks_read', description: 'x', inputSchema: { type: 'object' } },
    { name: 'tasks_checkpoint', description: 'x', inputSchema: { type: 'object' } },
  ]);
  assert.equal(read.annotations.readOnlyHint, true);
  assert.equal(checkpoint.annotations.readOnlyHint, false);
  assert.ok(TASKS_WRITE_TOOLS.has('tasks_checkpoint'));
  assert.ok(DESTRUCTIVE_TOOLS.has('heys_delete_meal'));
});

test('curator schemas сохраняют annotations после buildCuratorSchemas', () => {
  const schemas = buildCuratorSchemas({ requireTranscript: false });
  const sample = schemas.find((s) => s.name === 'heys_get_day');
  // buildCuratorSchemas сам не аннотирует — аннотации на финальной сборке createCuratorContext.
  // Здесь проверяем, что annotate поверх curator-схемы не ломает name/inputSchema.
  const annotated = annotateToolSchemas(schemas);
  const getDay = annotated.find((s) => s.name === 'heys_get_day');
  const reply = annotated.find((s) => s.name === 'heys_reply_message');
  assert.equal(getDay.annotations.readOnlyHint, true);
  assert.equal(reply.annotations.readOnlyHint, false);
  assert.equal(reply.annotations.openWorldHint, true);
  assert.ok(sample);
});
