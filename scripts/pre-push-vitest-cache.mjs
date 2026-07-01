#!/usr/bin/env node
/**
 * Shared apps/web Vitest source-hash cache used by pre-push and preflight.
 *
 * Usage:
 *   node scripts/pre-push-vitest-cache.mjs --status
 *   node scripts/pre-push-vitest-cache.mjs --run-if-needed
 *   node scripts/pre-push-vitest-cache.mjs --run-if-needed --skip-tests
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const APPS_WEB_DIR = path.join(ROOT_DIR, 'apps', 'web');
const CACHE_FILE = path.join(ROOT_DIR, '.husky', '.test-cache-last-pass');
const args = new Set(process.argv.slice(2).filter((arg) => arg !== '--'));

function writeLine(text = '') {
  process.stdout.write(`${text}\n`);
}

function writeError(text = '') {
  process.stderr.write(`${text}\n`);
}

function readFileIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function calculateSourceHash() {
  const command = [
    'find apps/web',
    '\\( -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.mjs" -o -name "*.cjs" \\)',
    '-not -path "*/dist/*"',
    '-not -path "*/public/*"',
    '-not -path "*/node_modules/*"',
    '-not -path "*/.cache/*"',
    '-not -path "*/coverage/*"',
    '2>/dev/null | LC_ALL=C sort | xargs shasum -a 256 2>/dev/null | shasum -a 256 | cut -c1-16',
  ].join(' ');
  const result = spawnSync('sh', ['-c', command], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

function getCacheState() {
  const sourceHash = calculateSourceHash();
  const cachedHash = readFileIfExists(CACHE_FILE);
  return {
    sourceHash,
    cachedHash,
    hit: Boolean(sourceHash && cachedHash === sourceHash),
  };
}

function printStatus() {
  const state = getCacheState();
  if (!state.sourceHash) {
    writeError('Vitest cache: error - cannot calculate apps/web source hash.');
    return 1;
  }
  if (state.hit) {
    writeLine(`Vitest cache: hit (${state.sourceHash}); pre-push will skip apps/web Vitest.`);
    return 0;
  }
  const suffix = state.cachedHash ? `cached ${state.cachedHash}` : 'no cached green run';
  writeLine(`Vitest cache: miss (${state.sourceHash}; ${suffix}); pre-push will run apps/web Vitest.`);
  return 0;
}

function runIfNeeded() {
  const state = getCacheState();
  if (!state.sourceHash) {
    writeError('Failed to calculate apps/web source hash. Push cancelled.');
    return 1;
  }
  if (state.hit) {
    writeLine(`Source SHA unchanged since last green run (${state.sourceHash}) - skip vitest.`);
    return 0;
  }
  if (args.has('--skip-tests')) {
    writeLine(`Source SHA changed (${state.sourceHash}); pre-push will run full apps/web Vitest.`);
    writeLine('Run without --skip-tests to warm .husky/.test-cache-last-pass before push.');
    return 0;
  }

  writeLine(`Source SHA changed (${state.sourceHash}); running apps/web Vitest once now.`);
  const result = spawnSync('node_modules/.bin/vitest', ['run', '--retry=1'], {
    cwd: APPS_WEB_DIR,
    stdio: 'inherit',
    encoding: 'utf8',
    shell: false,
    env: process.env,
  });
  if (result.status !== 0) {
    try {
      fs.rmSync(CACHE_FILE, { force: true });
    } catch {
      // Best effort: pre-push will re-run tests if cache removal fails.
    }
    writeError('Vitest failed; push cancelled.');
    return result.status || 1;
  }

  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${state.sourceHash}\n`);
  writeLine(`Vitest passed; cache warmed (${state.sourceHash}).`);
  return 0;
}

function main() {
  if (args.has('--status')) {
    process.exit(printStatus());
  }
  if (args.has('--run-if-needed')) {
    process.exit(runIfNeeded());
  }
  writeError('Usage: node scripts/pre-push-vitest-cache.mjs --status|--run-if-needed [--skip-tests]');
  process.exit(2);
}

main();
