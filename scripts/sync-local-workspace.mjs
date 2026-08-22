#!/usr/bin/env node
/**
 * sync-local-workspace.mjs — canonical local refresh after git pull / merge / push.
 *
 * Keeps localhost:3001 aligned with committed sources on ANY machine:
 * 1. update-version.cjs — APP_VERSION + build-meta from meaningful release commit
 * 2. @heys/web predev — intermediate bundle generators (day, advice, …)
 * 3. verify-legacy-bundles --sync — rebuild stale hashed legacy bundles
 *
 * Entry points: pnpm sync:local | pnpm pull | pnpm bundles:sync | husky post-merge
 * | push-agent after git push.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const STAMP_DIR = resolve(ROOT, '.heys');
const STAMP_FILE = resolve(STAMP_DIR, 'last-sync-head');

const FORCE = process.argv.includes('--force');

function run(label, command, args) {
  console.info(`[sync:local] ${label}`);
  console.info(`[sync:local] $ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function getHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function readStamp() {
  if (!existsSync(STAMP_FILE)) return '';
  return readFileSync(STAMP_FILE, 'utf8').trim();
}

function writeStamp(head) {
  mkdirSync(STAMP_DIR, { recursive: true });
  writeFileSync(STAMP_FILE, `${head}\n`, 'utf8');
}

function main() {
  const head = getHead();
  if (!head) {
    console.error('[sync:local] ❌ Not a git repository or HEAD unavailable.');
    process.exit(1);
  }

  if (!FORCE && readStamp() === head) {
    console.info(`[sync:local] ✅ Already synced for HEAD ${head.slice(0, 8)} (use --force to rerun).`);
    return;
  }

  console.info(`[sync:local] 🔄 Syncing workspace for HEAD ${head.slice(0, 8)}…`);

  run('version meta', 'node', ['apps/web/scripts/update-version.cjs']);
  run('generators', 'pnpm', ['--filter', '@heys/web', 'run', 'predev']);
  run('legacy bundles', 'node', ['scripts/verify-legacy-bundles.mjs', '--sync']);

  writeStamp(head);
  console.info('[sync:local] ✅ Local workspace matches committed sources.');
  console.info('[sync:local]    If dev:local is already running — hard reload http://localhost:3001');
}

main();
