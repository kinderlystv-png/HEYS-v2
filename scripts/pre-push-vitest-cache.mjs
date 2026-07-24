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

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2).filter((arg) => arg !== '--'));
const REF = getCliOption('--ref');
const BASE_REF = getCliOption('--base') || process.env.HEYS_PUSH_BASE_REF || '';
const CACHE_FILE = path.join(
  ROOT_DIR,
  '.husky',
  REF ? `.test-cache-last-pass-${sanitizeCacheRef(REF)}` : '.test-cache-last-pass',
);

const BASELINE_SAFETY_TESTS = [
  '__tests__/yandex-api-session-guards.test.js',
  '__tests__/heys-auth-login-client.test.js',
  '__tests__/heys-auth-session.test.js',
  '__tests__/heys-auth-create-reset-pin.test.js',
  '__tests__/client-isolation.test.js',
  '__tests__/pending-queue-pure.test.js',
];

const RELEASE_FLOW_TESTS = [
  '__tests__/prepare-release-skip.test.js',
  '__tests__/push-agent.test.js',
  '__tests__/agent-staging.test.js',
  '__tests__/pre-push-vitest-cache.test.js',
  '__tests__/release-features.test.js',
  '__tests__/whats-new-display.test.js',
  '__tests__/whats-new-seen-flag-preserved.test.js',
];

const SYNC_DATA_TESTS = [
  '__tests__/sync-queue-runtime-pure.test.js',
  '__tests__/sync-merge-shared.test.js',
  '__tests__/logout-sync-guards.test.js',
  '__tests__/hot-sync-curator-path.test.js',
];

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

function getChangedFilesBetween({ baseRef = BASE_REF, ref = REF || 'HEAD' } = {}) {
  let resolvedBase = baseRef;
  if (!resolvedBase) {
    const upstream = spawnSync(
      'git',
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
      {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        encoding: 'utf8',
        shell: false,
      },
    );
    if (upstream.status === 0) resolvedBase = String(upstream.stdout || '').trim();
  }
  if (!resolvedBase) resolvedBase = `${ref}~1`;

  const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', resolvedBase, ref], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    encoding: 'utf8',
    shell: false,
  });
  if (ancestry.status !== 0) {
    return { ok: false, baseRef: resolvedBase, ref, files: [], reason: 'base-not-ancestor' };
  }

  const result = spawnSync('git', ['diff', '--name-only', `${resolvedBase}..${ref}`], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) return { ok: false, baseRef: resolvedBase, ref, files: [] };
  return {
    ok: true,
    baseRef: resolvedBase,
    ref,
    files: String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

function selectRelevantTests(changedFiles = []) {
  const selected = new Set(BASELINE_SAFETY_TESTS);
  const normalized = changedFiles.map((file) => String(file || '').replace(/\\/g, '/'));

  normalized
    .filter((file) => /^apps\/web\/__tests__\/.*\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
    .forEach((file) => selected.add(file.slice('apps/web/'.length)));

  const releaseFlowChanged = normalized.some(
    (file) =>
      /^\.husky\/pre-(?:commit|push)$/.test(file) ||
      /^scripts\/(?:prepare-release|push-agent|push-preflight|pre-push-vitest-cache|check-agent-staging|release-features|release-prepare-and-commit)\.mjs$/.test(
        file,
      ) ||
      /^apps\/web\/heys_(?:release_features|whats_new_modal|app_root_impl|app_overlays)_v1\.js$/.test(
        file,
      ) ||
      /^\.github\/workflows\/(?:deploy-yandex|whats-new-guard)\.yml$/.test(file),
  );
  if (releaseFlowChanged) RELEASE_FLOW_TESTS.forEach((file) => selected.add(file));

  const syncOrDataChanged = normalized.some((file) =>
    /(?:sync|storage|pending[_-]queue|cloud[_-]merge|migration|\.sql$)/i.test(file),
  );
  if (syncOrDataChanged) SYNC_DATA_TESTS.forEach((file) => selected.add(file));

  return [...selected];
}

function listWorktreeRoots() {
  const result = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) return [];
  return String(result.stdout || '')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim())
    .filter(Boolean);
}

function resolveVitestExecutable({
  roots = [ROOT_DIR, ...listWorktreeRoots()],
  existsSync = fs.existsSync,
} = {}) {
  const seen = new Set();
  for (const root of roots) {
    const resolvedRoot = path.resolve(root);
    if (seen.has(resolvedRoot)) continue;
    seen.add(resolvedRoot);
    const executable = path.join(
      resolvedRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'vitest.cmd' : 'vitest',
    );
    if (existsSync(executable)) return executable;
  }
  return '';
}

function getMissingVitestRuntimeMessage() {
  return [
    'Vitest was not started: executable node_modules/.bin/vitest is unavailable in this or any linked worktree.',
    'Install workspace dependencies once: pnpm install --frozen-lockfile',
  ];
}

function createCleanRefWorktree(ref) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-prepush-'));
  const checkoutDir = path.join(tempRoot, 'checkout');
  const add = spawnSync('git', ['worktree', 'add', '--detach', checkoutDir, ref], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
  });
  if (add.status !== 0) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return { ok: false, error: String(add.stderr || add.stdout || '').trim() };
  }
  return { ok: true, tempRoot, checkoutDir };
}

function attachWorkspaceRuntime(
  checkoutDir,
  executable,
  { existsSync = fs.existsSync, symlinkSync = fs.symlinkSync, platform = process.platform } = {},
) {
  const runtimeNodeModules = path.resolve(path.dirname(executable), '..');
  const checkoutNodeModules = path.join(checkoutDir, 'node_modules');

  if (!existsSync(runtimeNodeModules)) {
    return {
      ok: false,
      error: `resolved workspace runtime is missing: ${runtimeNodeModules}`,
    };
  }
  if (existsSync(checkoutNodeModules)) {
    return { ok: true, runtimeNodeModules, checkoutNodeModules, created: false };
  }

  try {
    symlinkSync(runtimeNodeModules, checkoutNodeModules, platform === 'win32' ? 'junction' : 'dir');
    return { ok: true, runtimeNodeModules, checkoutNodeModules, created: true };
  } catch (error) {
    return {
      ok: false,
      error: `cannot attach ${runtimeNodeModules}: ${error?.message || 'unknown filesystem error'}`,
    };
  }
}

function removeCleanRefWorktree(worktree) {
  if (!worktree?.checkoutDir) return;
  spawnSync('git', ['worktree', 'remove', '--force', worktree.checkoutDir], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    encoding: 'utf8',
    shell: false,
  });
  fs.rmSync(worktree.tempRoot, { recursive: true, force: true });
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
  writeLine(
    `Vitest cache: miss (${state.sourceHash}; ${suffix}); pre-push will run apps/web Vitest.`,
  );
  return 0;
}

function runVitest({ full = false, tests = [] } = {}) {
  const executable = resolveVitestExecutable();
  if (!executable) {
    getMissingVitestRuntimeMessage().forEach(writeError);
    return { status: 1, started: false };
  }

  let cleanWorktree = null;
  let testRoot = ROOT_DIR;
  if (REF && getDirtyAppsWebSources().length > 0) {
    cleanWorktree = createCleanRefWorktree(REF);
    if (!cleanWorktree.ok) {
      writeError(
        `Vitest was not started: cannot create clean ${REF} worktree: ${cleanWorktree.error || 'unknown git error'}`,
      );
      writeError(
        `Inspect the ref without touching dirty files: git worktree add --detach <temp-dir> ${REF}`,
      );
      return { status: 1, started: false };
    }
    testRoot = cleanWorktree.checkoutDir;
    const runtime = attachWorkspaceRuntime(testRoot, executable);
    if (!runtime.ok) {
      writeError(`Vitest was not started: ${runtime.error}`);
      writeError('Install workspace dependencies once: pnpm install --frozen-lockfile');
      removeCleanRefWorktree(cleanWorktree);
      return { status: 1, started: false };
    }
    writeLine(
      `Dirty app sources detected; testing committed ${REF} in an automatic clean worktree using the existing workspace runtime.`,
    );
  }

  const vitestArgs = ['run', '--retry=1'];
  if (!full) vitestArgs.push(...tests);
  const runtimeNodeModules = path.resolve(executable, '..', '..');
  const env = {
    ...process.env,
    NODE_PATH: [runtimeNodeModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
  };

  try {
    const result = spawnSync(executable, vitestArgs, {
      cwd: path.join(testRoot, 'apps', 'web'),
      stdio: 'inherit',
      encoding: 'utf8',
      shell: false,
      env,
    });
    if (result.error || result.status === null) {
      writeError(
        `Vitest was not started: ${result.error?.message || 'process returned no exit status'}`,
      );
      writeError(`Verify the runtime directly: ${executable} --version`);
      return { status: 1, started: false };
    }
    return { status: result.status, started: true };
  } finally {
    removeCleanRefWorktree(cleanWorktree);
  }
}

function runIfNeeded() {
  const full = args.has('--full');
  if (!full) {
    const changed = getChangedFilesBetween();
    if (!changed.ok) {
      writeError(
        `Relevant tests were not started: cannot resolve push range ${changed.baseRef}..${changed.ref}.`,
      );
      writeError(
        `Fetch the push target once: git fetch origin ${changed.baseRef.replace(/^origin\//, '')}`,
      );
      return 1;
    }
    const tests = selectRelevantTests(changed.files);
    writeLine(
      `Running ${tests.length} fast relevant/safety test file(s) for ${changed.baseRef}..${changed.ref}.`,
    );
    if (args.has('--skip-tests')) {
      writeLine('Relevant tests skipped explicitly; CI full suite remains required before deploy.');
      return 0;
    }
    const result = runVitest({ tests });
    if (result.status !== 0) {
      if (result.started) writeError('Relevant Vitest tests failed; push cancelled.');
      return result.status || 1;
    }
    writeLine('Relevant Vitest tests passed.');
    return 0;
  }

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
    writeLine(
      `Source SHA changed (${state.sourceHash}); full apps/web Vitest was skipped explicitly.`,
    );
    writeLine(
      `Run with --full and without --skip-tests to warm ${path.relative(ROOT_DIR, CACHE_FILE)}.`,
    );
    return 0;
  }

  writeLine(`Source SHA changed (${state.sourceHash}); running full apps/web Vitest once now.`);
  const result = runVitest({ full: true });
  if (result.status !== 0) {
    try {
      fs.rmSync(CACHE_FILE, { force: true });
    } catch {
      // Best effort: pre-push will re-run tests if cache removal fails.
    }
    if (result.started) writeError('Full Vitest failed; preflight cancelled.');
    return result.status || 1;
  }

  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${state.sourceHash}\n`);
  writeLine(`Full Vitest passed; cache warmed (${state.sourceHash}).`);
  return 0;
}

function main() {
  if (args.has('--status')) {
    process.exit(printStatus());
  }
  if (args.has('--run-if-needed')) {
    process.exit(runIfNeeded());
  }
  writeError(
    'Usage: node scripts/pre-push-vitest-cache.mjs --status|--run-if-needed [--full] [--skip-tests] [--base=origin/main] [--ref=HEAD]',
  );
  process.exit(2);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main();
}

export {
  attachWorkspaceRuntime,
  getChangedFilesBetween,
  getCliOption,
  getDirtyAppsWebSourcesFromPorcelain,
  getMissingVitestRuntimeMessage,
  isAppsWebTestSource,
  resolveVitestExecutable,
  sanitizeCacheRef,
  selectRelevantTests,
};
