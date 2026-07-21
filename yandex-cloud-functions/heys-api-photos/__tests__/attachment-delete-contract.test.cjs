const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const runtime = require('../index.js')._test;

test('media diagnostics redact identity and object location', () => {
  assert.deepEqual(runtime.sanitizeDiagnosticValue({
    actor_role: 'client',
    actor_id: 'client-id',
    client_id: 'client-id',
    path: 'client/date/msg/file.webp',
    url: 'https://example.test/file.webp',
    bytes: 42,
  }), { actor_role: 'client', bytes: 42 });
});

test('delete endpoint blocks files referenced by messenger and exposes no raw exception', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../index.js'), 'utf8');
  assert.match(source, /jsonb_array_elements\(COALESCE\(m\.attachments/);
  assert.match(source, /attachment_in_use/);
  assert.doesNotMatch(source, /detail: err\.message/);
  assert.doesNotMatch(source, /message: err\.message/);
});

