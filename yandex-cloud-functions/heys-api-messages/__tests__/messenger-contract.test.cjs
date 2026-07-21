const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const runtime = require('../index.js')._test;
const repoRoot = path.resolve(__dirname, '../../..');
const migrationPath = path.join(
  repoRoot,
  'scripts/db/migrations/2026-07-21_messenger_reliability_privacy.sql',
);

const clientId = '11111111-1111-4111-8111-111111111111';
const canonicalPath = `${clientId}/2026-07-21/msg-p_1_abcd/abcdef012345.webp`;

test('attachment ownership binds canonical bucket URL to the target client messenger namespace', () => {
  process.env.S3_PHOTOS_BUCKET = 'heys-photos';
  const canonical = [{
    type: 'image',
    path: canonicalPath,
    url: `https://heys-photos.storage.yandexcloud.net/${canonicalPath}`,
    mime: 'image/webp',
  }];

  assert.deepEqual(runtime.validateAttachmentOwnership(canonical, clientId), { ok: true });
  assert.deepEqual(runtime.validateAttachmentOwnership(
    [{ ...canonical[0], path: canonicalPath.replace(clientId, '22222222-2222-4222-8222-222222222222') }],
    clientId,
  ), { ok: false, error: 'attachment_not_owned' });
  assert.deepEqual(runtime.validateAttachmentOwnership(
    [{ ...canonical[0], url: 'https://example.test/file.webp' }],
    clientId,
  ), { ok: false, error: 'attachment_url_path_mismatch' });
  assert.deepEqual(runtime.validateAttachmentOwnership(
    [{ ...canonical[0], path: `${clientId}/2026-07-21/meal-1/a.webp` }],
    clientId,
  ), { ok: false, error: 'attachment_not_owned' });
});

test('attachment verification fails closed when the canonical object is missing or storage is unavailable', async () => {
  const attachment = [{ url: `https://heys-photos.storage.yandexcloud.net/${canonicalPath}` }];
  assert.deepEqual(await runtime.verifyAttachmentObjectsExist(attachment, async () => true), { ok: true });
  assert.deepEqual(await runtime.verifyAttachmentObjectsExist(attachment, async () => false), {
    ok: false, error: 'attachment_object_not_found', statusCode: 400,
  });
  assert.deepEqual(await runtime.verifyAttachmentObjectsExist(attachment, async () => {
    throw new Error('private network detail');
  }), { ok: false, error: 'attachment_verification_unavailable', statusCode: 503 });
});

test('generic push payload never includes message content', () => {
  const sensitive = 'гречка 250 г и медицинский контекст';
  const clientPush = runtime.buildGenericMessagePush('client', clientId);
  const curatorPush = runtime.buildGenericMessagePush('curator');
  const serialized = JSON.stringify([clientPush, curatorPush]);

  assert.doesNotMatch(serialized, new RegExp(sensitive));
  assert.equal(clientPush.title, 'Новое сообщение от клиента');
  assert.equal(curatorPush.title, 'Новое сообщение от куратора');
  assert.equal(clientPush.body, 'Открыть диалог');
  assert.equal(curatorPush.body, 'Открыть диалог');
});

test('send fingerprint is stable across JSON key order and excludes dynamic transcript enrichment', () => {
  const first = runtime.buildSendRequestFingerprint({
    body: 'voice',
    attachments: [{ type: 'audio', mime: 'audio/ogg', path: canonicalPath }],
  });
  const reordered = runtime.buildSendRequestFingerprint({
    attachments: [{ path: canonicalPath, mime: 'audio/ogg', type: 'audio' }],
    body: 'voice',
  });
  const enrichedInput = runtime.stripClientTranscriptFields({
    type: 'audio', mime: 'audio/ogg', path: canonicalPath,
    transcript_status: 'ready', transcript_text: 'dynamic', transcript_provider: 'provider',
  });
  const sanitized = runtime.buildSendRequestFingerprint({ body: 'voice', attachments: [enrichedInput] });
  const baseline = runtime.buildSendRequestFingerprint({
    body: 'voice',
    attachments: [{ type: 'audio', mime: 'audio/ogg', path: canonicalPath, transcript_status: 'none' }],
  });

  assert.equal(first, reordered);
  assert.equal(sanitized, baseline);
});

test('diagnostics remove identity, path, URL, body and transcript fields', () => {
  const clean = runtime.sanitizeDiagnosticValue({
    actor_role: 'client',
    client_id: clientId,
    body: 'secret',
    nested: { path: canonicalPath, url: 'https://example.test', transcript: 'secret', count: 1 },
    message_id: 'message-1',
  });

  assert.deepEqual(clean, {
    actor_role: 'client',
    nested: { count: 1 },
    message_id: 'message-1',
  });
});

test('managed SQL implements atomic replay/conflict, desired state and delete cleanup queue', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_client_messages_request_id/);
  assert.match(sql, /ON CONFLICT \(client_id, sender_role, request_id\).*DO NOTHING/s);
  assert.match(sql, /idempotency_conflict/);
  assert.match(sql, /v_existing_fingerprint IS DISTINCT FROM v_fingerprint/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.set_message_done_by_curator/);
  assert.match(sql, /WHEN p_done THEN COALESCE\(m\.done_at, NOW\(\)\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.set_message_acked_as_client/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.messenger_media_cleanup_queue/);
  assert.match(sql, /INSERT INTO public\.messenger_media_cleanup_queue[\s\S]+DELETE FROM public\.client_messages/);
  assert.doesNotMatch(sql, /'error', SQLERRM/);
});

test('public RPC errors map to stable HTTP statuses', () => {
  assert.equal(runtime.rpcStatusCode({ success: false, error: 'idempotency_conflict' }), 409);
  assert.equal(runtime.rpcStatusCode({ success: false, error: 'curator_does_not_own_client' }), 403);
  assert.equal(runtime.rpcStatusCode({ success: false, error: 'message_store_failed' }), 500);
  assert.equal(runtime.rpcStatusCode({ success: true }), 200);
});
