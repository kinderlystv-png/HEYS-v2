#!/usr/bin/env node
/**
 * Cross-platform psql wrapper for E2E setup/cleanup (Windows + macOS/Linux).
 * Delegates to scripts/db/psql.ps1 or scripts/db/psql.sh.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const E2E_REPO_ROOT = path.resolve(__dirname, '..', '..');

function psqlScriptPath() {
  if (process.platform === 'win32') {
    return path.join(E2E_REPO_ROOT, 'scripts', 'db', 'psql.ps1');
  }
  return path.join(E2E_REPO_ROOT, 'scripts', 'db', 'psql.sh');
}

export function runPsql(args, { cwd = E2E_REPO_ROOT, timeoutMs = 120_000 } = {}) {
  const script = psqlScriptPath();
  if (!fs.existsSync(script)) {
    throw new Error(`psql wrapper not found: ${script}`);
  }

  let result;
  if (process.platform === 'win32') {
    result = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
      { cwd, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } else {
    result = spawnSync('bash', [script, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(detail || `psql exited with code ${result.status}`);
  }
  return result.stdout ?? '';
}

export function runPsqlFile(filePath, options = {}) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(E2E_REPO_ROOT, filePath);
  return runPsql(['-v', 'ON_ERROR_STOP=1', '-f', abs], options);
}

export function runPsqlQuery(sql, options = {}) {
  return runPsql(['-At', '-c', sql], options);
}
