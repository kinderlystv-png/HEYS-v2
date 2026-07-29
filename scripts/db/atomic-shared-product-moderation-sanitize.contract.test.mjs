import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationPath = path.join(
  root,
  'scripts/db/migrations/2026-07-29_atomic_shared_product_moderation_sanitize.sql',
);
const manifestPath = path.join(root, 'scripts/db/migrations/manifest.json');
const migration = fs.readFileSync(migrationPath, 'utf8');

test('product_update filters browser metadata before typed record mapping', () => {
  const allowlistStart = migration.indexOf("WHERE entry.key = ANY(ARRAY[");
  const populateRecord = migration.indexOf(
    'jsonb_populate_record(NULL::public.shared_products, v_patch)',
  );

  assert.ok(allowlistStart >= 0, 'explicit product field allowlist is required');
  assert.ok(populateRecord > allowlistStart, 'allowlist must run before typed record mapping');

  const allowlist = migration.slice(allowlistStart, populateRecord);
  for (const field of ['portions', 'barcodes', 'additives', 'name', 'brand']) {
    assert.match(allowlist, new RegExp(`'${field}'`));
  }
  for (const browserMetadata of [
    'id',
    'created_at',
    'updated_at',
    'created_by_user_id',
    'created_by_client_id',
  ]) {
    assert.doesNotMatch(allowlist, new RegExp(`'${browserMetadata}'`));
  }
});

test('hotfix preserves atomic moderation and curator-only execute contract', () => {
  assert.match(migration, /shared_products_pending[\s\S]+FOR UPDATE/);
  assert.match(migration, /status = 'approved'[\s\S]+moderated_by = p_curator_id/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.moderate_pending_shared_product_by_curator\(uuid, uuid, text, text\) FROM PUBLIC/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.moderate_pending_shared_product_by_curator\(uuid, uuid, text, text\) TO heys_rpc/,
  );
});

test('manifest appends the hotfix with unique order 17', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const ids = manifest.migrations.map((entry) => entry.id);
  const orders = manifest.migrations.map((entry) => entry.order);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(orders).size, orders.length);

  const entry = manifest.migrations.find(
    (migrationEntry) => migrationEntry.id === '2026-07-29_atomic_shared_product_moderation_sanitize',
  );
  assert.deepEqual(entry, {
    id: '2026-07-29_atomic_shared_product_moderation_sanitize',
    order: 17,
    path: 'scripts/db/migrations/2026-07-29_atomic_shared_product_moderation_sanitize.sql',
    description: 'Filter browser-local metadata before mapping atomic product updates into typed shared product columns',
    destructive: false,
  });
});
