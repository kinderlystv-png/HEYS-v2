/**
 * Parallel-safe ownership of dirty legacy generated files.
 *
 * Incident 2026-08-06: a failed `pnpm ship` left preview bundles dirty; the
 * next ship died on "Generated files are already dirty" and the agent had to
 * manually restore — while risking foreign WIP in the same checkout.
 *
 * Rule: a dirty generated path is "owned" by the currently staged sources only
 * when the rebuild for those sources would rewrite it. Everything else is
 * foreign and must not be restored, deleted or staged by this ship/hook.
 */

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  LEGACY_BUNDLES,
  LEGACY_FULL_REBUILD_TRIGGERS,
  LEGACY_GENERATORS,
  isGeneratedFile,
} from './legacy-bundle-config.mjs';

const ROOT_DIR = process.cwd();

const COMPANION_GENERATED = new Set([
  'apps/web/bundle-manifest.json',
  'apps/web/index.html',
  'apps/web/public/bundle-manifest.json',
  'apps/web/public/lazy-manifest.json',
  'apps/web/public/sw.js',
  'apps/web/react-bundle.js',
  'apps/web/public/react-bundle.js.gz',
]);

const PUBLIC_BUNDLE_RE =
  /^apps\/web\/public\/((?:boot|postboot)-[\w-]+)\.bundle\.[a-f0-9]{12}\.js(?:\.gz)?$/;

function stripWebPrefix(filePath) {
  return filePath.startsWith('apps/web/') ? filePath.slice('apps/web/'.length) : null;
}

function buildBundleSourceIndex() {
  const index = new Map();
  for (const [bundleName, files] of Object.entries(LEGACY_BUNDLES)) {
    for (const file of files) {
      if (!index.has(file)) index.set(file, new Set());
      index.get(file).add(bundleName);
    }
  }
  return index;
}

function detectInitialGenerators(sourceFiles) {
  const needed = new Set();
  for (const [name, config] of Object.entries(LEGACY_GENERATORS)) {
    const related = new Set([config.script, ...config.sources]);
    for (const filePath of sourceFiles) {
      if (related.has(filePath)) needed.add(name);
    }
  }
  return needed;
}

function expandAffectedGenerators(initialGenerators) {
  const reverse = new Map();
  for (const name of Object.keys(LEGACY_GENERATORS)) reverse.set(name, new Set());
  for (const [name, config] of Object.entries(LEGACY_GENERATORS)) {
    for (const dependency of config.dependsOn || []) {
      if (!reverse.has(dependency)) reverse.set(dependency, new Set());
      reverse.get(dependency).add(name);
    }
  }
  const expanded = new Set(initialGenerators);
  const queue = [...initialGenerators];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const dependent of reverse.get(current) || []) {
      if (!expanded.has(dependent)) {
        expanded.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return expanded;
}

export function bundleNameFromGeneratedPath(filePath) {
  const match = PUBLIC_BUNDLE_RE.exec(String(filePath || ''));
  return match ? match[1] : null;
}

export function affectedBundlesFromSources(sourceFiles) {
  const sources = (sourceFiles || []).filter(Boolean);
  if (sources.some((filePath) => LEGACY_FULL_REBUILD_TRIGGERS.has(filePath))) {
    return new Set(Object.keys(LEGACY_BUNDLES));
  }
  const bundleSourceIndex = buildBundleSourceIndex();
  const generators = expandAffectedGenerators(detectInitialGenerators(sources));
  const bundles = new Set();
  for (const filePath of sources) {
    const rel = stripWebPrefix(filePath);
    if (!rel) continue;
    const hits = bundleSourceIndex.get(rel);
    if (hits) hits.forEach((name) => bundles.add(name));
  }
  for (const generatorName of generators) {
    const relOutput = stripWebPrefix(LEGACY_GENERATORS[generatorName].output);
    const hits = relOutput ? bundleSourceIndex.get(relOutput) : null;
    if (hits) hits.forEach((name) => bundles.add(name));
  }
  return bundles;
}

export function ownedGeneratorOutputs(sourceFiles) {
  const generators = expandAffectedGenerators(detectInitialGenerators(sourceFiles || []));
  return new Set([...generators].map((name) => LEGACY_GENERATORS[name].output));
}

/**
 * Split dirty generated paths into ones this staged source scope may reset
 * and ones that belong to another agent / preview.
 */
export function classifyDirtyGenerated(dirtyFiles, stagedSourceFiles) {
  const dirty = [...new Set((dirtyFiles || []).filter(Boolean))];
  const sources = [...new Set((stagedSourceFiles || []).filter(Boolean))];
  if (dirty.length === 0) return { owned: [], foreign: [], bundles: [] };

  if (sources.some((filePath) => LEGACY_FULL_REBUILD_TRIGGERS.has(filePath))) {
    return { owned: dirty, foreign: [], bundles: Object.keys(LEGACY_BUNDLES) };
  }

  const bundles = affectedBundlesFromSources(sources);
  const generatorOutputs = ownedGeneratorOutputs(sources);
  const owned = [];
  const foreign = [];

  for (const filePath of dirty) {
    const bundleName = bundleNameFromGeneratedPath(filePath);
    if (bundleName && bundles.has(bundleName)) {
      owned.push(filePath);
      continue;
    }
    if (generatorOutputs.has(filePath)) {
      owned.push(filePath);
      continue;
    }
    // Shared manifests/index/sw are rewritten by any scoped rebuild. Only claim
    // them when this ship actually rebuilds at least one bundle — otherwise a
    // pure CF/docs commit must not touch them.
    if (COMPANION_GENERATED.has(filePath) && bundles.size > 0) {
      owned.push(filePath);
      continue;
    }
    foreign.push(filePath);
  }

  return { owned, foreign, bundles: [...bundles].sort() };
}

export function listDirtyGeneratedFiles(cwd = ROOT_DIR) {
  // Do NOT trim — porcelain uses leading spaces as status columns.
  const output = execSync('git status --porcelain --untracked-files=all', {
    encoding: 'utf8',
    cwd,
  });
  return output
    .split('\n')
    .filter((line) => line.length >= 3)
    .map((line) => {
      // Rename: "R  old -> new" / "R  old -> new"
      if (/^R/.test(line)) {
        const arrow = line.indexOf(' -> ');
        if (arrow !== -1) return line.slice(arrow + 4).replace(/^"|"$/g, '');
      }
      return line.slice(3).replace(/^"|"$/g, '');
    })
    .filter(isGeneratedFile);
}

export function listStagedSourceFiles(cwd = ROOT_DIR) {
  const output = execSync('git diff --cached --name-only', {
    encoding: 'utf8',
    cwd,
  });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((filePath) => !isGeneratedFile(filePath));
}

function isTracked(filePath, cwd = ROOT_DIR) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', filePath], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset owned generated paths to HEAD. Tracked → git restore; untracked owned
 * preview artifacts under apps/web/public/ → unlink. Never touches foreign paths.
 */
export function resetOwnedGeneratedFiles(ownedPaths, { cwd = ROOT_DIR, log = console.info } = {}) {
  const owned = [...new Set((ownedPaths || []).filter(Boolean))];
  if (owned.length === 0) return { restored: [], removed: [] };

  const tracked = owned.filter((filePath) => isTracked(filePath, cwd));
  const untracked = owned.filter((filePath) => !tracked.includes(filePath));

  if (tracked.length > 0) {
    execFileSync('git', ['restore', '--staged', '--worktree', '--', ...tracked], {
      cwd,
      stdio: 'ignore',
    });
    log(
      `[generated-baseline] restored ${tracked.length} owned generated file(s) to HEAD before rebuild`,
    );
  }

  const removed = [];
  for (const filePath of untracked) {
    // Only delete untracked files we recognize as generated preview artifacts.
    if (!isGeneratedFile(filePath)) continue;
    if (!filePath.startsWith('apps/web/public/') && !filePath.startsWith('apps/web/')) continue;
    const abs = path.join(cwd, filePath);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        fs.unlinkSync(abs);
        removed.push(filePath);
      }
    } catch {
      // ignore — next rebuild/status will show what remains
    }
  }
  if (removed.length > 0) {
    log(`[generated-baseline] removed ${removed.length} untracked owned preview artifact(s)`);
  }

  return { restored: tracked, removed };
}

/**
 * Integration/ship entry: if dirty generated is entirely owned by staged
 * sources, reset it; if any foreign path remains, throw with a clear split.
 */
export function prepareGeneratedBaselineForShip({
  cwd = ROOT_DIR,
  log = console.info,
  error = console.error,
} = {}) {
  const dirty = listDirtyGeneratedFiles(cwd);
  if (dirty.length === 0) {
    return { dirty: [], owned: [], foreign: [], bundles: [], reset: null };
  }

  const stagedSources = listStagedSourceFiles(cwd);
  const { owned, foreign, bundles } = classifyDirtyGenerated(dirty, stagedSources);

  if (foreign.length > 0) {
    error('[generated-baseline] ❌ Dirty generated files outside this staged source scope:');
    foreign.forEach((filePath) => error(`  - ${filePath}`));
    error('[generated-baseline] Owned by current staged sources (would reset):');
    (owned.length ? owned : ['(none)']).forEach((filePath) => error(`  - ${filePath}`));
    error('[generated-baseline] Staged sources:');
    (stagedSources.length ? stagedSources : ['(none)']).forEach((filePath) =>
      error(`  - ${filePath}`),
    );
    error(
      '[generated-baseline] Parallel-safe options: move foreign WIP to a worktree, or ask its owner to clear it. Do not stash/restore foreign generated.',
    );
    const err = new Error('foreign_generated_dirty');
    err.code = 'foreign_generated_dirty';
    err.foreign = foreign;
    err.owned = owned;
    throw err;
  }

  const reset = resetOwnedGeneratedFiles(owned, { cwd, log });
  return { dirty, owned, foreign, bundles, reset };
}
