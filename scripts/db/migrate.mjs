#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_MANIFEST = path.join(SCRIPT_DIR, 'migrations', 'manifest.json');
const PSQL_WRAPPER = path.join(SCRIPT_DIR, 'psql.sh');
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage']);

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function walkSqlFiles(directory, base = directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkSqlFiles(absolute, base, output);
    if (entry.isFile() && entry.name.endsWith('.sql')) {
      output.push(toPosix(path.relative(base, absolute)));
    }
  }
  return output;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

function assertNoEmbeddedTransactions(sql, migrationPath) {
  const executable = stripSqlComments(sql);
  if (/\b(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i.test(executable)) {
    throw new Error(`${migrationPath}: managed migrations must not contain transaction control`);
  }
}

function loadManifest(manifestPath = DEFAULT_MANIFEST) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1) throw new Error(`Unsupported manifest version: ${manifest.version}`);
  if (!Array.isArray(manifest.migrations)) throw new Error('manifest.migrations must be an array');
  return manifest;
}

function buildInventory(manifest, rootDir = ROOT_DIR) {
  const managedPaths = new Set(manifest.migrations.map((migration) => migration.path));
  const legacyFiles = new Set(manifest.legacyFiles || []);
  const prefixes = manifest.legacyPathPrefixes || [];
  const all = walkSqlFiles(rootDir).sort();
  const managed = [];
  const legacy = [];
  const unaccounted = [];

  for (const file of all) {
    if (managedPaths.has(file)) managed.push(file);
    else if (legacyFiles.has(file) || prefixes.some((prefix) => file.startsWith(prefix))) legacy.push(file);
    else unaccounted.push(file);
  }
  return { all, managed, legacy, unaccounted };
}

function prepareMigrations(manifest, rootDir = ROOT_DIR) {
  const ids = new Set();
  const orders = new Set();
  const paths = new Set();
  const prepared = manifest.migrations.map((migration) => {
    if (!migration.id || !Number.isInteger(migration.order) || migration.order < 1 || !migration.path) {
      throw new Error('Every migration needs id, positive integer order and path');
    }
    if (migration.destructive !== false) {
      throw new Error(`${migration.id}: destructive or unclassified migrations are not allowed by this runner`);
    }
    if (ids.has(migration.id) || orders.has(migration.order) || paths.has(migration.path)) {
      throw new Error(`${migration.id}: duplicate id, order or path in manifest`);
    }
    ids.add(migration.id);
    orders.add(migration.order);
    paths.add(migration.path);

    const absolutePath = path.resolve(rootDir, migration.path);
    if (!absolutePath.startsWith(`${path.resolve(rootDir)}${path.sep}`)) {
      throw new Error(`${migration.id}: migration path escapes repository root`);
    }
    const sql = fs.readFileSync(absolutePath, 'utf8');
    assertNoEmbeddedTransactions(sql, migration.path);
    return { ...migration, sql, checksum: sha256(sql) };
  }).sort((a, b) => a.order - b.order);

  prepared.forEach((migration, index) => {
    if (migration.order !== index + 1) {
      throw new Error(`Migration order must be contiguous from 1 (found ${migration.order})`);
    }
  });
  return prepared;
}

function sqlLiteral(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function runPsql(sql, { quiet = true } = {}) {
  const args = ['-X', '-v', 'ON_ERROR_STOP=1'];
  if (quiet) args.push('-qAt');
  const result = spawnSync(PSQL_WRAPPER, args, {
    cwd: ROOT_DIR,
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'psql failed').trim());
  }
  return result.stdout.trim();
}

function readLedger() {
  const exists = runPsql("SELECT CASE WHEN to_regclass('public.heys_schema_migrations') IS NULL THEN '0' ELSE '1' END;");
  if (exists !== '1') return [];
  const rows = runPsql(`
    SELECT json_build_object(
      'id', id,
      'order', migration_order,
      'path', path,
      'checksum', checksum_sha256,
      'appliedAt', applied_at
    )::text
    FROM public.heys_schema_migrations
    ORDER BY migration_order;
  `);
  return rows ? rows.split('\n').map((row) => JSON.parse(row)) : [];
}

function compareLedger(prepared, applied) {
  const expectedById = new Map(prepared.map((migration) => [migration.id, migration]));
  const appliedById = new Map(applied.map((migration) => [migration.id, migration]));
  const drift = [];
  for (const row of applied) {
    const expected = expectedById.get(row.id);
    if (!expected) drift.push(`${row.id}: applied migration is missing from manifest`);
    else if (row.checksum !== expected.checksum) drift.push(`${row.id}: checksum drift`);
    else if (Number(row.order) !== expected.order || row.path !== expected.path) drift.push(`${row.id}: metadata drift`);
  }
  const pending = prepared.filter((migration) => !appliedById.has(migration.id));
  return { drift, pending };
}

function buildApplySql(pending) {
  const parts = [
    'BEGIN;',
    "SELECT pg_advisory_xact_lock(hashtext('heys-schema-migrations-v1'));",
  ];
  for (const migration of pending) {
    parts.push(`\n-- migration: ${migration.id}\n${migration.sql.trim()}\n`);
    parts.push(`INSERT INTO public.heys_schema_migrations
      (id, migration_order, path, checksum_sha256, description)
      VALUES (${sqlLiteral(migration.id)}, ${migration.order}, ${sqlLiteral(migration.path)}, ${sqlLiteral(migration.checksum)}, ${sqlLiteral(migration.description)})
      ON CONFLICT (id) DO NOTHING;`);
  }
  parts.push('COMMIT;');
  return parts.join('\n');
}

function printOfflineSummary(prepared, inventory) {
  console.log(`Migration manifest: ${prepared.length} managed, ${inventory.legacy.length} legacy baseline, ${inventory.all.length} SQL total`);
  if (inventory.unaccounted.length > 0) {
    console.error('Unaccounted SQL files:');
    inventory.unaccounted.forEach((file) => console.error(`  - ${file}`));
  }
}

async function main(argv = process.argv.slice(2)) {
  const command = argv.find((arg) => ['--check', '--status', '--apply'].includes(arg)) || '--check';
  const manifest = loadManifest();
  const prepared = prepareMigrations(manifest);
  const inventory = buildInventory(manifest);
  printOfflineSummary(prepared, inventory);
  if (inventory.unaccounted.length > 0) process.exitCode = 1;
  if (command === '--check' || process.exitCode) return;

  const applied = readLedger();
  const comparison = compareLedger(prepared, applied);
  if (comparison.drift.length > 0) {
    comparison.drift.forEach((item) => console.error(`DRIFT: ${item}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Ledger: ${applied.length} applied, ${comparison.pending.length} pending`);
  comparison.pending.forEach((migration) => console.log(`  pending ${migration.order}: ${migration.id}`));
  if (command === '--status' || comparison.pending.length === 0) return;
  if (!argv.includes('--confirm-production')) {
    throw new Error('--apply requires --confirm-production');
  }

  runPsql(buildApplySql(comparison.pending), { quiet: false });
  const after = compareLedger(prepared, readLedger());
  if (after.drift.length > 0 || after.pending.length > 0) {
    throw new Error(`Post-apply verification failed: ${[...after.drift, ...after.pending.map((m) => `${m.id}: pending`)].join(', ')}`);
  }
  console.log(`Applied and verified ${comparison.pending.length} migration(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Migration runner failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  assertNoEmbeddedTransactions,
  buildApplySql,
  buildInventory,
  compareLedger,
  loadManifest,
  prepareMigrations,
  sha256,
};
