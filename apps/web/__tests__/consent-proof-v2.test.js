import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('database/2026-07-27_consent_proof_v2.sql');
const manifest = JSON.parse(read('docs/legal/legal-document-manifest.json'));
const migrationManifest = JSON.parse(read('scripts/db/migrations/manifest.json'));

const sha256 = (relative) => createHash('sha256').update(read(relative)).digest('hex');

test('server allowlist rejects arbitrary versions before any consent mutation', () => {
  const validation = migration.indexOf('Validate the whole request before revoking or inserting anything.');
  const mutation = migration.indexOf("UPDATE public.consents\n       SET granted = false", validation);
  assert.ok(validation > 0 && mutation > validation);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /'consent_version_not_allowed'/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.log_consents[\s\S]*FROM PUBLIC, heys_rpc/);
});

test('consent proof migration is managed and every registry hash matches the immutable manifest', () => {
  const managed = migrationManifest.migrations.find((item) => item.id === '2026-07-27_consent_proof_v2');
  assert.equal(managed?.path, 'database/2026-07-27_consent_proof_v2.sql');
  assert.equal(managed?.destructive, false);

  for (const type of [
    'user_agreement',
    'personal_data',
    'health_data',
    'marketing',
    'payment_oferta',
    'push_notifications',
    'curator_access',
    'speech_transcription',
  ]) {
    const document = manifest.documents[type];
    assert.match(
      migration,
      new RegExp(`\\('${type}', '${document.version}', '${document.sha256}', '${document.snapshotPath}', 'active'`),
    );
  }
  const candidate = manifest.candidates.health_data_2_0;
  assert.match(
    migration,
    new RegExp(`\\('health_data', '${candidate.version}', '${candidate.sha256}', '${candidate.canonicalPath}', 'candidate'`),
  );
});

test('document hash and accepted_at are server-owned with no historical backfill', () => {
  assert.match(migration, /NEW\.document_sha256 := v_hash/);
  assert.match(migration, /NEW\.accepted_at := NOW\(\)/);
  assert.match(migration, /BEFORE INSERT ON public\.consents/);
  assert.doesNotMatch(migration, /UPDATE public\.consents\s+SET document_sha256/i);
  assert.doesNotMatch(migration, /UPDATE public\.leads\s+SET consent_privacy_sha256/i);
});

test('marketing 1.3 proof is exact and conversion never borrows privacy version', () => {
  const marketing = manifest.documents.marketing;
  assert.equal(marketing.version, '1.3');
  assert.equal(sha256(marketing.canonicalPath), marketing.sha256);
  assert.equal(sha256(marketing.snapshotPath), marketing.sha256);
  assert.match(migration, /v_lead\.consent_marketing_version/);
  assert.match(migration, /v_lead\.consent_marketing_sha256/);
  assert.doesNotMatch(migration, /'marketing', COALESCE\(v_lead\.consent_privacy_version/);
});

test('health 2.0 is inactive and current health gate fails closed on missing hash/time', () => {
  assert.equal(manifest.documents.health_data.version, '1.5');
  assert.equal(manifest.candidates.health_data_2_0.active, false);
  assert.equal(sha256(manifest.candidates.health_data_2_0.canonicalPath), manifest.candidates.health_data_2_0.sha256);
  assert.match(migration, /\('health_data', '2\.0',[\s\S]*'candidate'/);
  assert.match(migration, /v_actual_hash IS DISTINCT FROM v_expected_hash/);
  assert.match(migration, /v_accepted_at IS NULL/);
  assert.match(migration, /'must_block',[\s\S]*jsonb_array_length\(v_outdated\) > 0/);
});
