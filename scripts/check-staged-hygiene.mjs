#!/usr/bin/env node
/**
 * Staging hygiene guards against parallel-agent footguns:
 * - MM (staged + unstaged) on shared hot files → half-committed hunks
 * - deleted workspace package.json under packages/* or apps/*
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

/** Shared files where partial stage mixed unrelated tasks (incident 2026-08-23). */
export const PARTIAL_STAGE_HOT_FILES = new Set([
  'yandex-cloud-functions/heys-mcp/lib/tools.js',
  'yandex-cloud-functions/heys-mcp/lib/products.js',
  'yandex-cloud-functions/heys-mcp/lib/curator.js',
  'yandex-cloud-functions/heys-mcp/OPTIMIZATION_LOG.md',
]);

const WORKSPACE_MANIFEST_RE = /^(packages|apps)\/[^/]+\/package\.json$/;

function runGit(args, options = {}) {
  try {
    return execSync(`git ${args}`, {
      cwd: options.cwd || ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', options.stderr || 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function parsePorcelainLines(porcelain = '') {
  return porcelain
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      xy: line.slice(0, 2),
      path: normalizePath(line.slice(3).trim()),
    }));
}

/** Files with both index and worktree changes (git status MM). */
export function getPartiallyStagedFiles({ porcelain = runGit('status --porcelain') } = {}) {
  return parsePorcelainLines(porcelain)
    .filter(({ xy }) => xy[0] !== ' ' && xy[0] !== '?' && xy[1] !== ' ')
    .map(({ path }) => path);
}

export function getDeletedWorkspaceManifests({ porcelain = runGit('status --porcelain') } = {}) {
  return parsePorcelainLines(porcelain)
    .filter(({ xy, path: filePath }) => {
      const deleted = xy[0] === 'D' || xy[1] === 'D';
      return deleted && WORKSPACE_MANIFEST_RE.test(filePath);
    })
    .map(({ path: filePath }) => filePath);
}

export function assertStagedHygiene({
  env = process.env,
  partiallyStaged = getPartiallyStagedFiles(),
  deletedManifests = getDeletedWorkspaceManifests(),
} = {}) {
  if (env.HEYS_ALLOW_PARTIAL_STAGE === '1' && env.HEYS_ALLOW_DELETED_WORKSPACES === '1') {
    return { ok: true, partial: [], hotPartial: [], deletedManifests: [] };
  }

  const hotPartial = partiallyStaged.filter((file) => PARTIAL_STAGE_HOT_FILES.has(file));
  const partialBlocked = env.HEYS_ALLOW_PARTIAL_STAGE !== '1' && hotPartial.length > 0;
  const deletedBlocked =
    env.HEYS_ALLOW_DELETED_WORKSPACES !== '1' && deletedManifests.length > 0;

  if (!partialBlocked && !deletedBlocked) {
    return { ok: true, partial: partiallyStaged, hotPartial, deletedManifests };
  }

  return {
    ok: false,
    partial: partiallyStaged,
    hotPartial,
    deletedManifests,
    partialBlocked,
    deletedBlocked,
  };
}

function printFailure(result) {
  if (result.partialBlocked) {
    process.stderr.write('[staged-hygiene] Partial stage on shared hot files (staged + unstaged):\n');
    result.hotPartial.forEach((file) => process.stderr.write(`  - ${file}\n`));
    process.stderr.write('[staged-hygiene] Commit would miss hunks or mix parallel tasks.\n');
    process.stderr.write('[staged-hygiene] Fix: git add <file> (full file) or commit explicit paths only.\n');
    process.stderr.write('[staged-hygiene] Override: HEYS_ALLOW_PARTIAL_STAGE=1\n');
  }
  if (result.deletedBlocked) {
    process.stderr.write('[staged-hygiene] Workspace package manifests deleted in working tree:\n');
    result.deletedManifests.forEach((file) => process.stderr.write(`  - ${file}\n`));
    process.stderr.write('[staged-hygiene] Fix: git restore packages/ apps/ then pnpm install\n');
    process.stderr.write('[staged-hygiene] Override: HEYS_ALLOW_DELETED_WORKSPACES=1\n');
  }
}

async function main() {
  const result = assertStagedHygiene();
  if (result.ok) {
    process.stdout.write('[staged-hygiene] OK\n');
    return 0;
  }
  printFailure(result);
  return 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { normalizePath, PARTIAL_STAGE_HOT_FILES as HOT_FILES };
