#!/usr/bin/env node
/**
 * Shared apps/web Vitest source-hash cache used by pre-push and preflight.
 *
 * Usage:
 *   node scripts/pre-push-vitest-cache.mjs --status
 *   node scripts/pre-push-vitest-cache.mjs --run-if-needed
 *   node scripts/pre-push-vitest-cache.mjs --run-if-needed --skip-tests
 *   node scripts/pre-push-vitest-cache.mjs --run-if-needed --ref=HEAD
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const APPS_WEB_DIR = path.join(ROOT_DIR, 'apps', 'web');
const args = new Set(process.argv.slice(2).filter((arg) => arg !== '--'));
const REF = getCliOption('--ref');
const CACHE_FILE = path.join(
  ROOT_DIR,
  '.husky',
  REF ? `.test-cache-last-pass-${sanitizeCacheRef(REF)}` : '.test-cache-last-pass',
);

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

function getCliOption(name, argv = process.argv) {
  const prefix = `${name}=`;
  const arg = argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : '';
}

function sanitizeCacheRef(ref) {
  return String(ref || 'worktree').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function isAppsWebTestSource(filePath) {
  return (
    /^apps\/web\/.+\.(?:js|ts|tsx|mjs|cjs)$/.test(filePath) &&
    !filePath.includes('/dist/') &&
    !filePath.includes('/public/') &&
    !filePath.includes('/node_modules/') &&
    !filePath.includes('/.cache/') &&
    !filePath.includes('/coverage/')
  );
}

function calculateSourceHash() {
  if (REF) return calculateRefSourceHash(REF);

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

function calculateRefSourceHash(ref) {
  const result = spawnSync('git', ['ls-tree', '-r', ref, '--', 'apps/web'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) return '';

  const entries = String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^[0-9]{6}\s+\S+\s+([0-9a-f]{40,64})\t(.+)$/.exec(line);
      return match ? { blob: match[1], file: match[2] } : null;
    })
    .filter((entry) => entry && isAppsWebTestSource(entry.file))
    .sort((a, b) => a.file.localeCompare(b.file));

  if (entries.length === 0) return '';
  const hash = createHash('sha256');
  for (const entry of entries) {
    hash.update(`${entry.blob} ${entry.file}\n`);
  }
  return hash.digest('hex').slice(0, 16);
}

function getDirtyAppsWebSources() {
  const result = spawnSync('git', ['status', '--porcelain', '--', 'apps/web'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) return [];
  return getDirtyAppsWebSourcesFromPorcelain(String(result.stdout || ''));
}

function getDirtyAppsWebSourcesFromPorcelain(porcelain) {
  return String(porcelain || '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const rawPath = line.slice(3).trim();
      return rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath;
    })
    .filter(isAppsWebTestSource);
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
    writeLine(`Run without --skip-tests to warm ${path.relative(ROOT_DIR, CACHE_FILE)} before push.`);
    return 0;
  }

  if (REF) {
    const dirtySources = getDirtyAppsWebSources();
    if (dirtySources.length > 0) {
      writeError(`Cannot safely warm Vitest cache for ${REF}: apps/web JS/TS worktree is dirty.`);
      dirtySources.slice(0, 12).forEach((file) => writeError(`  - ${file}`));
      if (dirtySources.length > 12) writeError(`  ...and ${dirtySources.length - 12} more`);
      writeError('Use a clean worktree or commit/stash that source scope before warming the HEAD cache.');
      return 1;
    }
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
  writeError('Usage: node scripts/pre-push-vitest-cache.mjs --status|--run-if-needed [--skip-tests] [--ref=HEAD]');
  process.exit(2);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main();
}

export {
  getCliOption,
  getDirtyAppsWebSourcesFromPorcelain,
  isAppsWebTestSource,
  sanitizeCacheRef,
};
