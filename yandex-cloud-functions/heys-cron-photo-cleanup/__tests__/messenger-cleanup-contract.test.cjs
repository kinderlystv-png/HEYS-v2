const assert = require('node:assert/strict');
const fs = require('node:fs');
const pathModule = require('node:path');
const test = require('node:test');

const runtime = require('../index.js')._test;

const clientId = '11111111-1111-4111-8111-111111111111';
const old = new Date('2026-07-01T00:00:00.000Z');
const now = new Date('2026-07-21T00:00:00.000Z').getTime();

test('abandoned cleanup targets only old unreferenced messenger objects', () => {
  const abandonedPhoto = `${clientId}/2026-07-01/msg-p_1_abcd/one.webp`;
  const referencedVoice = `${clientId}/2026-07-01/voice/msg-a_1_abcd/two.ogg`;
  const diaryPhoto = `${clientId}/2026-07-01/meal-1/three.webp`;
  const freshMessenger = `${clientId}/2026-07-20/msg-p_2_abcd/four.webp`;
  const result = runtime.findAbandonedMessengerObjects([
    { key: abandonedPhoto, lastModified: old },
    { key: referencedVoice, lastModified: old },
    { key: diaryPhoto, lastModified: old },
    { key: freshMessenger, lastModified: new Date('2026-07-20T00:00:00.000Z') },
  ], new Set([referencedVoice]), now);

  assert.deepEqual(result.map((item) => item.key), [abandonedPhoto]);
  assert.equal(runtime.isMessengerObjectPath(diaryPhoto), false);
  assert.equal(runtime.isMessengerObjectPath(referencedVoice), true);
});

test('diagnostic object IDs are stable and do not expose the path', () => {
  const path = `${clientId}/2026-07-01/msg-p_1_abcd/one.webp`;
  assert.equal(runtime.diagnosticId(path), runtime.diagnosticId(path));
  assert.equal(runtime.diagnosticId(path).length, 12);
  assert.doesNotMatch(runtime.diagnosticId(path), /11111111/);
});

test('durable queue rechecks references before deleting an object', () => {
  const source = fs.readFileSync(pathModule.resolve(__dirname, '../index.js'), 'utf8');
  assert.match(source, /if \(await isObjectPathReferenced\(pool, item\.object_path\)\)/);
  assert.match(source, /media_cleanup_noop/);
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /status = 'retry'/);
});
