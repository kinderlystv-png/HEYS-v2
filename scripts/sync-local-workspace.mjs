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

import { getDeletedWorkspaceManifests } from './check-staged-hygiene.mjs';
import { assertWorkspaceRuntime } from './check-workspace-runtime.mjs';
import { devServersListening } from './ensure-local-toolchain.mjs';

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

/**
 * Вернуть исходники workspace-пакетов, снесённые упавшей установкой.
 *
 * Инцидент 2026-08-31: `pnpm install` при живом dev:local на Windows падает на
 * занятых файлах и уносит содержимое packages. Внутри apps/web/node_modules
 * лежат junction-ссылки @heys/... на реальные каталоги пакетов, и рекурсивная
 * чистка проваливается сквозь них. Дальше каждый push видел «missing runtime»,
 * звал install снова и
 * сносил ещё раз: packages/* пропали дважды за один вечер.
 */
function restoreDeletedWorkspaces(stage) {
  const deleted = getDeletedWorkspaceManifests();
  if (!deleted.length) return 0;
  console.warn(
    `[sync:local] ⚠ ${stage}: пропало ${deleted.length} манифест(ов) workspace ` +
      `(например ${deleted[0]}) — возвращаю из git.`,
  );
  run('restore workspace sources', 'git', ['restore', 'packages/', 'apps/']);
  return deleted.length;
}

async function main() {
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

  // A concurrent `pnpm install` from another agent session in this same
  // directory can leave a runtime package (esbuild, vitest, …) briefly
  // missing — predev then fails with ERR_MODULE_NOT_FOUND. Self-heal by
  // installing, same check ensure-local-toolchain.mjs uses. This never stops
  // dev:local: this script also runs at dev:local's own startup, and killing
  // it here would kill another session's server, not just ours.
  restoreDeletedWorkspaces('перед проверкой');

  const runtime = assertWorkspaceRuntime({ rootDir: ROOT });
  if (!runtime.ok) {
    if (await devServersListening()) {
      // Установка при живом dev — та самая, что сносит packages/*. Пропускаем:
      // сборка бандлов ниже работает и на неполном node_modules, а человеку
      // говорим точный порядок действий.
      console.warn('[sync:local] ⚠ Не хватает runtime-пакетов, но dev:local занимает :3001/:4001.');
      console.warn('[sync:local]   pnpm install при живом dev на Windows сносит packages/* — пропускаю.');
      console.warn('[sync:local]   Порядок: остановить dev:local → pnpm install → pnpm dev:local');
    } else {
      console.warn('[sync:local] ⚠ Missing runtime package(s), running pnpm install…');
      run('restore dependencies', 'pnpm', ['install']);
      restoreDeletedWorkspaces('после установки');
    }
  }

  run('version meta', 'node', ['apps/web/scripts/update-version.cjs']);
  run('generators', 'pnpm', ['--filter', '@heys/web', 'run', 'predev']);
  run('legacy bundles', 'node', ['scripts/verify-legacy-bundles.mjs', '--sync']);

  writeStamp(head);
  console.info('[sync:local] ✅ Local workspace matches committed sources.');
  console.info('[sync:local]    If dev:local is already running — hard reload http://localhost:3001');
}

await main();
