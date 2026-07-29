import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const migrationPath = 'scripts/db/migrations/2026-07-29_curator_product_function_acl.sql';
const canonicalPath = 'scripts/db/functions/update_shared_product_portions_by_curator.sql';
const signatures = [
  'public.publish_shared_product_by_curator(uuid, jsonb)',
  'public.add_shared_product_barcode_by_curator(uuid, uuid, text)',
  'public.update_shared_product_portions_by_curator(uuid, uuid, jsonb)',
];

test('managed migration removes PUBLIC execute and retains heys_rpc execute', () => {
  const migration = read(migrationPath);
  for (const signature of signatures) {
    assert.ok(migration.includes(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`), `missing PUBLIC revoke for ${signature}`);
    assert.ok(migration.includes(`GRANT EXECUTE ON FUNCTION ${signature} TO heys_rpc;`), `missing heys_rpc grant for ${signature}`);
  }
  assert.match(migration, /aclexplode\(coalesce\(p\.proacl, acldefault\('f', p\.proowner\)\)\)/);
  assert.match(migration, /acl\.grantee = 0/);
  assert.doesNotMatch(migration, /CREATE\s+OR\s+REPLACE\s+FUNCTION/i, 'ACL migration must not replace function bodies');
});

test('portions function has a canonical source matching the live contract', () => {
  const canonical = read(canonicalPath);
  assert.match(canonical, /CREATE OR REPLACE FUNCTION public\.update_shared_product_portions_by_curator\(/);
  assert.match(canonical, /p_curator_id uuid,[\s\S]*p_product_id uuid,[\s\S]*p_portions jsonb/);
  assert.match(canonical, /LANGUAGE plpgsql[\s\S]*SECURITY DEFINER[\s\S]*SET search_path TO 'public', 'pg_temp'/);
  assert.match(canonical, /SELECT EXISTS\(SELECT 1 FROM shared_products WHERE id = p_product_id\)/);
  assert.match(canonical, /SET portions = p_portions,[\s\S]*updated_at = now\(\)/);
  assert.match(canonical, /'curator_id', p_curator_id/);
  assert.match(canonical, /EXCEPTION WHEN OTHERS[\s\S]*'error', 'database_error'/);
});

test('manifest appends the ACL migration at unique order 16', () => {
  const manifest = JSON.parse(read('scripts/db/migrations/manifest.json'));
  const ids = manifest.migrations.map((entry) => entry.id);
  const orders = manifest.migrations.map((entry) => entry.order);
  assert.equal(new Set(ids).size, ids.length, 'migration ids must be unique');
  assert.equal(new Set(orders).size, orders.length, 'migration orders must be unique');
  assert.deepEqual(
    manifest.migrations.find((entry) => entry.id === '2026-07-29_curator_product_function_acl'),
    {
      id: '2026-07-29_curator_product_function_acl',
      order: 16,
      path: migrationPath,
      description: 'Restrict curator shared-product SECURITY DEFINER functions to the heys_rpc role',
      destructive: false,
    }
  );
});
