import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
// Раннер — vitest, а не node:test. Файл лежит среди vitest-тестов и
// собирается ими: под конфигом apps/web он молча проходил как «no tests»,
// под корневым падал «No test suite found». То есть восемь проверок
// согласий и юридических версий не выполнялись нигде — `pnpm test:node`
// берёт только scripts/**/*.test.mjs. Assert оставлен node'овский: тела
// проверок от этого не меняются.
import { test } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('database/2026-07-27_consent_proof_v2.sql');
const legalActivationMigration = read('database/2026-07-28_activate_user_agreement_v1_8.sql');
const legalActivationMigrationV19 = read('database/2026-07-29_activate_user_agreement_v1_9.sql');
const legalHashCorrectionMigration = read(
  'database/2026-07-30_update_user_agreement_v1_9_document_hash.sql',
);
const legalActivationMigrationV110 = read('database/2026-08-08_activate_user_agreement_v1_10.sql');
const legalActivationMigrationV111 = read('database/2026-08-14_activate_legal_v1_11.sql');
// Реестр собирается из всех миграций, которые его трогают, а не из списка
// имён. Список ушёл в прошлое дважды: активацию push 1.2 (15 августа) и
// кураторского push 1.1 (16 августа) в него не дописали, и проверка «у каждого
// типа согласия текущая версия манифеста зарегистрирована активной» смотрела
// мимо них. Заметить это было нечем: файл не запускался ни одним раннером.
const registryMigrations = fs
  .readdirSync(path.join(root, 'database'))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => read(`database/${name}`))
  .filter((sql) => sql.includes('legal_consent_registry'))
  .join('\n');
const manifest = JSON.parse(read('docs/legal/legal-document-manifest.json'));
const migrationManifest = JSON.parse(read('scripts/db/migrations/manifest.json'));

const sha256 = (relative) =>
  createHash('sha256').update(read(relative).replace(/\r\n/g, '\n')).digest('hex');

test('server allowlist rejects arbitrary versions before any consent mutation', () => {
  const validation = migration.indexOf(
    'Validate the whole request before revoking or inserting anything.',
  );
  const mutation = migration.search(
    /UPDATE public\.consents\r?\n       SET granted = false/,
  );
  assert.ok(validation > 0 && mutation > validation);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /'consent_version_not_allowed'/);
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.log_consents[\s\S]*FROM PUBLIC, heys_rpc/,
  );
});

test('consent proof migration is managed and every registry hash matches the immutable manifest', () => {
  const managed = migrationManifest.migrations.find(
    (item) => item.id === '2026-07-27_consent_proof_v2',
  );
  const legalActivation = migrationManifest.migrations.find(
    (item) => item.id === '2026-07-28_activate_user_agreement_v1_8',
  );
  const legalActivationV19 = migrationManifest.migrations.find(
    (item) => item.id === '2026-07-29_activate_user_agreement_v1_9',
  );
  const legalHashCorrection = migrationManifest.migrations.find(
    (item) => item.id === '2026-07-30_update_user_agreement_v1_9_document_hash',
  );
  assert.equal(managed?.path, 'database/2026-07-27_consent_proof_v2.sql');
  assert.equal(managed?.destructive, false);
  assert.equal(legalActivation?.path, 'database/2026-07-28_activate_user_agreement_v1_8.sql');
  assert.equal(legalActivation?.destructive, false);
  assert.equal(legalActivationV19?.path, 'database/2026-07-29_activate_user_agreement_v1_9.sql');
  assert.equal(legalActivationV19?.destructive, false);
  assert.equal(
    legalHashCorrection?.path,
    'database/2026-07-30_update_user_agreement_v1_9_document_hash.sql',
  );
  assert.equal(legalHashCorrection?.destructive, false);

  for (const type of [
    'user_agreement',
    'personal_data',
    'privacy_policy',
    'marketing',
    'payment_oferta',
    'push_notifications',
    'curator_access',
    'speech_transcription',
  ]) {
    const document = manifest.documents[type];
    assert.equal(sha256(document.canonicalPath), document.sha256);
    assert.equal(sha256(document.snapshotPath), document.sha256);
    assert.match(
      registryMigrations,
      new RegExp(
        `\\('${type}', '${document.version}', '${document.sha256}', '${document.snapshotPath}', 'active'`,
      ),
    );
  }
  const health = manifest.documents.health_data;
  assert.equal(sha256(health.canonicalPath), health.sha256);
  assert.equal(sha256(health.snapshotPath), health.sha256);
  assert.match(legalActivationMigrationV111, /consent_type = 'health_data'/);
  assert.match(legalActivationMigrationV111, /SET status = 'retired'/);
  const candidate = manifest.candidates.health_data_2_0;
  assert.match(
    migration,
    new RegExp(
      `\\('health_data', '${candidate.version}', '${candidate.sha256}', '${candidate.canonicalPath}', 'candidate'`,
    ),
  );
});

test('legal 1.8 activation is forward-only and retires older active agreement versions', () => {
  assert.match(legalActivationMigration, /'user_agreement',[\s\S]*'1\.8'/);
  assert.match(legalActivationMigration, /'payment_oferta',[\s\S]*'1\.8'/);
  assert.match(legalActivationMigration, /document_version <> '1\.8'/);
  assert.match(legalActivationMigration, /SET status = 'retired'/);
});

test('legal 1.9 activation is forward-only and retires older active agreement versions', () => {
  assert.match(legalActivationMigrationV19, /'user_agreement', '1\.9'/);
  assert.match(legalActivationMigrationV19, /'payment_oferta', '1\.9'/);
  assert.match(legalActivationMigrationV19, /document_version <> '1\.9'/);
  assert.match(legalActivationMigrationV19, /SET status = 'retired'/);
});

test('legal 1.11 activation retires health_data and splits privacy_policy from personal_data', () => {
  assert.match(legalActivationMigrationV111, /'user_agreement', '1\.11'/);
  assert.match(legalActivationMigrationV111, /'payment_oferta', '1\.11'/);
  assert.match(legalActivationMigrationV111, /'personal_data', '1\.0'/);
  assert.match(legalActivationMigrationV111, /'privacy_policy', '1\.8'/);
  assert.match(legalActivationMigrationV111, /v_required TEXT\[] := ARRAY\['user_agreement','personal_data'\]/);
  assert.match(legalActivationMigrationV111, /consent_type = 'privacy_policy'/);
  assert.match(legalActivationMigrationV111, /consent_type = 'health_data'/);
  assert.match(legalActivationMigrationV111, /SET status = 'retired'/);
});

test('document hash and accepted_at are server-owned with no historical backfill', () => {
  assert.match(migration, /NEW\.document_sha256 := v_hash/);
  assert.match(migration, /NEW\.accepted_at := NOW\(\)/);
  assert.match(migration, /BEFORE INSERT ON public\.consents/);
  assert.doesNotMatch(migration, /UPDATE public\.consents\s+SET document_sha256/i);
  assert.doesNotMatch(migration, /UPDATE public\.leads\s+SET consent_privacy_sha256/i);
});

test('marketing 1.4 proof is exact and conversion never borrows privacy version', () => {
  const marketing = manifest.documents.marketing;
  assert.equal(marketing.version, '1.4');
  assert.equal(sha256(marketing.canonicalPath), marketing.sha256);
  assert.equal(sha256(marketing.snapshotPath), marketing.sha256);
  assert.match(migration, /v_lead\.consent_marketing_version/);
  assert.match(migration, /v_lead\.consent_marketing_sha256/);
  assert.doesNotMatch(migration, /'marketing', COALESCE\(v_lead\.consent_privacy_version/);
});

test('health 2.0 is inactive and current health gate fails closed on missing hash/time', () => {
  assert.equal(manifest.documents.health_data.version, '1.5');
  assert.equal(manifest.candidates.health_data_2_0.active, false);
  assert.equal(
    sha256(manifest.candidates.health_data_2_0.canonicalPath),
    manifest.candidates.health_data_2_0.sha256,
  );
  assert.match(migration, /\('health_data', '2\.0',[\s\S]*'candidate'/);
  assert.match(migration, /v_actual_hash IS DISTINCT FROM v_expected_hash/);
  assert.match(migration, /v_accepted_at IS NULL/);
  assert.match(migration, /'must_block',[\s\S]*jsonb_array_length\(v_outdated\) > 0/);
});
