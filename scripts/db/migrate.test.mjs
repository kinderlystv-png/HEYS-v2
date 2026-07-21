import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoEmbeddedTransactions,
  buildApplySql,
  buildInventory,
  compareLedger,
  loadManifest,
  prepareMigrations,
  stripDollarQuotedBodies,
} from './migrate.mjs';

test('all repository SQL files are managed or explicitly legacy', () => {
  const manifest = loadManifest();
  const inventory = buildInventory(manifest);
  assert.equal(inventory.unaccounted.length, 0, inventory.unaccounted.join('\n'));
  assert.equal(inventory.managed.length, manifest.migrations.length);
});

test('managed migrations are ordered, checksummed and non-destructive', () => {
  const manifest = loadManifest();
  const prepared = prepareMigrations(manifest);
  assert.equal(prepared.length, manifest.migrations.length);
  prepared.forEach((migration, index) => {
    assert.equal(migration.order, index + 1);
    assert.match(migration.checksum, /^[0-9a-f]{64}$/);
    assert.equal(migration.destructive, false);
  });
});

test('embedded transaction control is rejected but comments are ignored', () => {
  assert.doesNotThrow(() => assertNoEmbeddedTransactions('-- ROLLBACK: COMMIT\nSELECT 1;', 'ok.sql'));
  assert.doesNotThrow(() => assertNoEmbeddedTransactions(
    'CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;',
    'function.sql',
  ));
  assert.throws(() => assertNoEmbeddedTransactions('BEGIN; SELECT 1;', 'bad.sql'), /transaction control/);
});

test('dollar-quoted bodies are masked without hiding following SQL', () => {
  const masked = stripDollarQuotedBodies('AS $body$ BEGIN; END; $body$; COMMIT;');
  assert.doesNotMatch(masked, /BEGIN/);
  assert.match(masked, /COMMIT/);
});

test('ledger comparison blocks checksum and unknown-history drift', () => {
  const prepared = prepareMigrations(loadManifest());
  assert.deepEqual(
    compareLedger(prepared, []).pending.map((item) => item.id),
    prepared.map((item) => item.id)
  );
  assert.match(compareLedger(prepared, [{
    id: prepared[0].id,
    order: 1,
    path: prepared[0].path,
    checksum: '0'.repeat(64),
  }]).drift[0], /checksum drift/);
  assert.match(compareLedger(prepared, [{ id: 'unknown', order: 99, path: 'x', checksum: '0'.repeat(64) }]).drift[0], /missing from manifest/);
});

test('apply SQL uses one transaction, advisory lock and immutable ledger row', () => {
  const prepared = prepareMigrations(loadManifest());
  const sql = buildApplySql(prepared);
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /INSERT INTO public\.heys_schema_migrations/);
  assert.match(sql, /COMMIT;$/);
});
