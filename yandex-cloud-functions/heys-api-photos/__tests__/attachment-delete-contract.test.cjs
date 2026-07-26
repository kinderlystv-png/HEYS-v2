const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
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

test('messenger read fallback accepts only canonical image paths', () => {
  assert.equal(runtime.isMessengerImagePath(
    'client-1/2026-07-25/msg-p_123/file.webp',
    'client-1'
  ), true);
  assert.equal(runtime.isMessengerImagePath(
    'client-2/2026-07-25/msg-p_123/file.webp',
    'client-1'
  ), false);
  assert.equal(runtime.isMessengerImagePath(
    'client-1/2026-07-25/meal-123/file.webp',
    'client-1'
  ), false);
  assert.equal(runtime.isMessengerImagePath(
    'client-1/2026-07-25/voice/msg-p_123/file.webm',
    'client-1'
  ), false);
});

test('messenger read fallback is ownership-bound, referenced and binary-safe', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../index.js'), 'utf8');
  const gateway = fs.readFileSync(path.resolve(__dirname, '../../api-gateway-spec.yaml'), 'utf8');
  const photoRoute = gateway.match(/^  \/photos\/read:\n([\s\S]*?)(?=^  \/|\Z)/m)?.[1] || '';

  assert.match(source, /identity\.kind === 'client' && clientId !== identity\.id/);
  assert.match(source, /SELECT 1 FROM clients WHERE id = \$1 AND curator_id = \$2/);
  assert.match(source, /WHERE m\.client_id = \$2[\s\S]+attachment->>'path' = \$1/);
  assert.match(source, /new GetObjectCommand\(\{ Bucket: getBucket\(\), Key: path \}\)/);
  assert.match(source, /isBase64Encoded: true/);
  assert.match(photoRoute, /^    post:/m);
  assert.match(photoRoute, /^    options:/m);
  assert.equal((photoRoute.match(/function_id: d4e93t0lrfu4ng62pqa1/g) || []).length, 2);
  assert.equal((await runtime.objectBodyToBuffer(Readable.from([Buffer.from('safe')]))).toString(), 'safe');
});
