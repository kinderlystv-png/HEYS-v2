/**
 * Isolated git index for parallel polosa commits on one checkout.
 *
 * Problem: `git commit -- <paths>` still commits everything already staged on
 * the shared `.git/index`, so foreign `git add` from another session leaks in.
 *
 * Fix: build a temporary index from HEAD, stage only explicit paths, commit with
 * GIT_INDEX_FILE so the shared index is never read or written.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const INDEX_DIR_NAME = 'isolated-index';

export function resolveRepoRoot(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

export function gitDir(repoRoot) {
  const gitPath = path.join(repoRoot, '.git');
  try {
    const stat = fs.statSync(gitPath);
    if (stat.isDirectory()) return gitPath;
  } catch {
    // fall through — worktree gitfile
  }
  const raw = fs.readFileSync(gitPath, 'utf8').trim();
  const m = /^gitdir:\s*(.+)$/i.exec(raw);
  if (!m) throw new Error(`Cannot resolve git dir from ${gitPath}`);
  return path.resolve(repoRoot, m[1]);
}

/** @returns {string} absolute path to a fresh temp index file */
export function allocateIsolatedIndexPath(repoRoot, { label = '' } = {}) {
  const dir = path.join(repoRoot, '.claude', INDEX_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  const safeLabel = String(label || 'commit')
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 48);
  return path.join(dir, `${process.pid}-${Date.now()}${safeLabel ? `-${safeLabel}` : ''}.index`);
}

/** Env fragment that routes all git commands to an isolated index. */
export function gitEnvWithIndex(repoRoot, indexPath, extraEnv = {}) {
  return {
    ...process.env,
    ...extraEnv,
    GIT_INDEX_FILE: indexPath,
    // Keep object store shared — only the index is isolated.
    GIT_DIR: gitDir(repoRoot),
  };
}

export function runGit(repoRoot, args, { env = process.env, stdio = 'pipe' } = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
    stdio,
  }).trim();
}

export function runGitSpawn(repoRoot, args, { env = process.env, stdio = 'inherit' } = {}) {
  const res = spawnSync('git', args, { cwd: repoRoot, env, stdio });
  if (res.status !== 0) {
    const err = new Error(`git ${args.join(' ')} failed with status ${res.status ?? 'unknown'}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

/** Initialize isolated index to match `baseRef` tree (empty staging vs HEAD). */
export function initIsolatedIndexFromHead(repoRoot, indexPath, { baseRef = 'HEAD' } = {}) {
  const env = gitEnvWithIndex(repoRoot, indexPath);
  runGit(repoRoot, ['read-tree', baseRef], { env });
  return env;
}

export function stagePathsInIsolatedIndex(repoRoot, indexPath, paths, { env: envIn } = {}) {
  const env = envIn || gitEnvWithIndex(repoRoot, indexPath);
  const normalized = normalizeExplicitPaths(paths);
  if (normalized.length === 0) {
    throw new Error('Isolated commit requires at least one explicit path.');
  }
  runGitSpawn(repoRoot, ['add', '--', ...normalized], { env });
  return { env, paths: normalized };
}

export function listStagedInIndex(repoRoot, env) {
  const out = runGit(repoRoot, ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { env });
  return out ? out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
}

export function removeIsolatedIndexFile(indexPath) {
  try {
    fs.unlinkSync(indexPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

/** Normalize CLI / caller paths to repo-relative POSIX paths. */
export function normalizeExplicitPaths(paths, { repoRoot = process.cwd() } = {}) {
  const root = path.resolve(repoRoot);
  const out = [];
  for (const raw of paths) {
    const trimmed = String(raw || '').trim();
    if (!trimmed || trimmed === '--') continue;
    const abs = path.resolve(root, trimmed);
    const rel = path.relative(root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Path outside repository: ${trimmed}`);
    }
    out.push(rel.split(path.sep).join('/'));
  }
  return [...new Set(out)];
}

/**
 * Commit only explicit paths using a temporary index.
 * Does not read or mutate the shared `.git/index`.
 *
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {string[]} opts.paths
 * @param {string[]} opts.commitArgs  git commit args after the word `commit`, e.g. ['-F','msg.txt']
 * @param {Record<string,string>} [opts.env]
 * @param {string} [opts.baseRef]
 * @returns {{ sha: string, staged: string[], indexPath: string }}
 */
export function commitWithIsolatedIndex({
  repoRoot,
  paths,
  commitArgs,
  env: extraEnv = {},
  baseRef = 'HEAD',
  keepIndex = false,
}) {
  const indexPath = allocateIsolatedIndexPath(repoRoot, { label: 'isolated' });
  let env;
  try {
    env = initIsolatedIndexFromHead(repoRoot, indexPath, { baseRef });
    Object.assign(env, extraEnv);
    const staged = stagePathsInIsolatedIndex(repoRoot, indexPath, paths, { env });
    const stagedNames = listStagedInIndex(repoRoot, env);
    if (stagedNames.length === 0) {
      throw new Error('Nothing staged in isolated index — check paths and working tree state.');
    }
    runGitSpawn(repoRoot, ['commit', ...commitArgs], { env });
    const sha = runGit(repoRoot, ['rev-parse', 'HEAD'], { env: process.env });
    return { sha, staged: stagedNames, indexPath, paths: staged.paths };
  } finally {
    if (!keepIndex) removeIsolatedIndexFile(indexPath);
  }
}

/**
 * Legacy failure mode: stage own paths on the shared index, then
 * `git commit` without pathspec — picks up foreign staging too.
 * Returns names in the resulting commit.
 */
export function commitSharedIndexNaive(repoRoot, paths, commitArgs, { foreignStaged = [] } = {}) {
  if (foreignStaged.length > 0) {
    runGitSpawn(repoRoot, ['add', '--', ...foreignStaged], { env: process.env });
  }
  runGitSpawn(repoRoot, ['add', '--', ...paths], { env: process.env });
  runGitSpawn(repoRoot, ['commit', ...commitArgs], { env: process.env });
  const sha = runGit(repoRoot, ['rev-parse', 'HEAD'], { env: process.env });
  const names = runGit(repoRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha], {
    env: process.env,
  });
  return {
    sha,
    files: names ? names.split(/\r?\n/).filter(Boolean) : [],
  };
}

/**
 * @deprecated Use commitSharedIndexNaive — documents pathspec variant when Git
 * still commits the full shared index (older behaviour / some invocations).
 */
export function commitSharedIndexWithPathList(repoRoot, paths, commitArgs, { foreignStaged = [] } = {}) {
  if (foreignStaged.length > 0) {
    runGitSpawn(repoRoot, ['add', '--', ...foreignStaged], { env: process.env });
  }
  runGitSpawn(repoRoot, ['commit', ...commitArgs, '--', ...paths], { env: process.env });
  const sha = runGit(repoRoot, ['rev-parse', 'HEAD'], { env: process.env });
  const names = runGit(repoRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha], {
    env: process.env,
  });
  return {
    sha,
    files: names ? names.split(/\r?\n/).filter(Boolean) : [],
  };
}
