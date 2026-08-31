#!/usr/bin/env node
/**
 * Local toolchain health check (+ optional auto-fix) before push / install / sync.
 * Windows: dev:local on :3001/:4001 locks rollup/esbuild; deleted packages/* breaks pnpm.
 *
 *   node scripts/ensure-local-toolchain.mjs           # check only
 *   node scripts/ensure-local-toolchain.mjs --fix       # restore packages, install, gitleaks
 *   node scripts/ensure-local-toolchain.mjs --fix --stop-dev  # also free :3001/:4001 before install
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertWorkspaceRuntime } from './check-workspace-runtime.mjs';
import { getDeletedWorkspaceManifests } from './check-staged-hygiene.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_BIN = path.join(ROOT, '.tools', 'bin');
const DEV_PORTS = [3001, 4001];
const GITLEAKS_VERSION = '8.24.2';

/** Prepend repo-local gitleaks etc. for push hooks (Windows/macOS/Linux). */
export function prependLocalToolsBin(env = process.env) {
  if (!fs.existsSync(TOOLS_BIN)) return env;
  const sep = process.platform === 'win32' ? ';' : ':';
  const prefix = `${TOOLS_BIN}${sep}`;
  if ((env.PATH || '').startsWith(prefix)) return env;
  return { ...env, PATH: `${prefix}${env.PATH || ''}` };
}

const args = new Set(process.argv.slice(2).filter((a) => a !== '--'));
const fix = args.has('--fix') || args.has('--fix-all');
const stopDev = args.has('--stop-dev') || (fix && args.has('--fix-all'));

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`${msg}\n`);
}

function run(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
}

function probePort(port, host = '127.0.0.1', timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

function pidsOnPort(port) {
  if (process.platform !== 'win32') {
    try {
      const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
      return out ? out.split(/\s+/).map(Number).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  try {
    const out = execSync(`netstat -ano | findstr ":${port}"`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

/**
 * Слушает ли кто-то dev-порты. Экспортируется: `pnpm install` при живом
 * dev:local на Windows роняет установку на занятых файлах и уносит с собой
 * содержимое пакетов через junction-ссылки в apps/web/node_modules/@heys.
 */
export async function devServersListening() {
  for (const port of DEV_PORTS) {
    if (await probePort(port)) return true;
  }
  return false;
}

function stopDevServers() {
  const pids = new Set();
  for (const port of DEV_PORTS) {
    pidsOnPort(port).forEach((pid) => pids.add(pid));
  }
  if (!pids.size) return 0;
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      } catch {
        /* ignore */
      }
    }
  }
  return pids.size;
}

function ensureGitleaks() {
  const exe = process.platform === 'win32'
    ? path.join(TOOLS_BIN, 'gitleaks.exe')
    : path.join(TOOLS_BIN, 'gitleaks');
  if (fs.existsSync(exe)) return true;

  if (!fix) {
    warn('[ensure:local] gitleaks not found in .tools/bin — push preflight will fail.');
    warn('[ensure:local] Run: node scripts/ensure-local-toolchain.mjs --fix');
    return false;
  }

  fs.mkdirSync(TOOLS_BIN, { recursive: true });
  const arch = process.platform === 'win32' ? 'windows_x64' : `${process.platform}_${process.arch}`;
  const zipName = `gitleaks_${GITLEAKS_VERSION}_${arch}.zip`;
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${zipName}`;
  const tmpZip = path.join(process.env.TEMP || '/tmp', zipName);
  const tmpDir = path.join(process.env.TEMP || '/tmp', 'gitleaks-extract');

  warn(`[ensure:local] Downloading gitleaks ${GITLEAKS_VERSION}…`);
  if (process.platform === 'win32') {
    run('powershell', [
      '-NoProfile',
      '-Command',
      `Invoke-WebRequest -Uri '${url}' -OutFile '${tmpZip}'; Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpDir}' -Force; Copy-Item '${path.join(tmpDir, 'gitleaks.exe')}' '${exe}' -Force`,
    ]);
  } else {
    run('curl', ['-fsSL', url, '-o', tmpZip]);
    run('unzip', ['-o', tmpZip, '-d', tmpDir]);
    fs.copyFileSync(path.join(tmpDir, 'gitleaks'), exe);
    fs.chmodSync(exe, 0o755);
  }
  return fs.existsSync(exe);
}

async function main() {
  let ok = true;

  if (fix && stopDev && (await devServersListening())) {
    const n = stopDevServers();
    log(`[ensure:local] Stopped ${n} dev process(es) on :3001/:4001`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  const deleted = getDeletedWorkspaceManifests();
  if (deleted.length) {
    ok = false;
    warn(`[ensure:local] Deleted workspace manifests: ${deleted.length} (e.g. ${deleted[0]})`);
    if (fix) {
      log('[ensure:local] git restore packages/ apps/');
      run('git', ['restore', 'packages/', 'apps/']);
    } else {
      warn('[ensure:local] Fix: git restore packages/ apps/ && pnpm install');
    }
  }

  let runtime = assertWorkspaceRuntime({ rootDir: ROOT });
  if (!runtime.ok) {
    ok = false;
    if (fix) {
      if (await devServersListening()) {
        if (stopDev) {
          const n = stopDevServers();
          log(`[ensure:local] Stopped ${n} dev process(es) on :3001/:4001`);
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          warn('[ensure:local] dev:local is running — use --stop-dev before pnpm install on Windows');
        }
      }
      if (!stopDev && (await devServersListening())) {
        warn('[ensure:local] Skipping pnpm install while dev ports are busy (pass --stop-dev)');
      } else {
        log('[ensure:local] pnpm install');
        const install = run('pnpm', ['install']);
        if (install.status !== 0) process.exit(install.status ?? 1);
        runtime = assertWorkspaceRuntime({ rootDir: ROOT });
      }
    }
  }

  if (!runtime.ok) {
    ok = false;
    warn('[ensure:local] Toolchain still incomplete after fix attempt.');
    warn('[ensure:local] 1) Stop dev:local  2) pnpm install  3) git restore packages/');
  }

  const gitleaksOk = ensureGitleaks();
  if (!gitleaksOk) ok = false;

  if (ok && runtime.ok) {
    log('[ensure:local] OK — packages, node_modules and gitleaks ready');
    return 0;
  }
  if (!fix) {
    warn('[ensure:local] Re-run with --fix (and --stop-dev if install fails on Windows)');
  }
  return 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().then((code) => process.exit(code));
}
