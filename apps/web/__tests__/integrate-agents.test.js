import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT_PATH = path.resolve(REPO_ROOT, 'scripts/integrate-agents.mjs');

let repo;

// When this suite runs under a git hook (pre-push), git exports GIT_DIR /
// GIT_WORK_TREE / GIT_INDEX_FILE pointing at the real repo. Those leak into the
// child `git` processes below and make `git init`/add/commit in the temp repo
// fail with "this operation must be run in a work tree". Strip them so the
// fixture repo is the only git context the children see.
const GIT_ENV_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX'];
function cleanGitEnv() {
  const env = { ...process.env };
  for (const k of GIT_ENV_VARS) delete env[k];
  return env;
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: cleanGitEnv(), ...opts }).trim();
}

function commitFile(name, content, message) {
  writeFileSync(path.join(repo, name), content);
  git(['add', name]);
  git(['commit', '-m', message]);
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'heys-integrate-'));
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@heys.local']);
  git(['config', 'user.name', 'Test']);
  commitFile('base.txt', 'base\n', 'chore: base');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

function runIntegrate(extraArgs) {
  return spawnSync('node', [SCRIPT_PATH, ...extraArgs], {
    cwd: repo,
    encoding: 'utf8',
    env: cleanGitEnv(),
  });
}

describe('integrate-agents', () => {
  it('refuses mutating integration without explicit confirmation', () => {
    const result = runIntegrate([
      '--branches=codex/a',
      '--title=t',
      '--item-title=x',
      '--item-description=y',
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('requires explicit --confirm-integration');
  });

  it('--dry-run prints the merge order and planned commits without mutating', () => {
    const before = git(['rev-parse', 'HEAD']);
    const status = git(['status', '--porcelain']);

    const result = runIntegrate([
      '--dry-run',
      '--branches=codex/a,codex/b',
      '--title=t',
      '--item-title=x',
      '--item-description=y',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('git merge --no-ff --no-edit codex/a');
    expect(result.stdout).toContain('git merge --no-ff --no-edit codex/b');
    // Release metadata is skipped while What's New is centrally disabled.
    expect(result.stdout).toContain("What's New disabled centrally; integration skipped release metadata.");
    expect(result.stdout).not.toContain('prepare-release.mjs');
    expect(git(['rev-parse', 'HEAD'])).toBe(before);
    expect(git(['status', '--porcelain'])).toBe(status);
  });

  it('aborts and rolls back to the pre-integration HEAD on merge conflict', () => {
    // Two branches edit base.txt differently → second merge conflicts.
    git(['checkout', '-q', '-b', 'codex/a']);
    commitFile('base.txt', 'from-a\n', 'feat: a');
    git(['checkout', '-q', 'main']);
    git(['checkout', '-q', '-b', 'codex/b']);
    commitFile('base.txt', 'from-b\n', 'feat: b');
    git(['checkout', '-q', 'main']);

    const startRef = git(['rev-parse', 'HEAD']);

    const result = runIntegrate([
      '--confirm-integration',
      '--branches=codex/a,codex/b',
      '--title=t',
      '--item-title=x',
      '--item-description=y',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Merge conflict');
    expect(result.stderr).toContain('base.txt');
    // Worktree fully restored: HEAD back to start, no in-progress merge, clean tree.
    expect(git(['rev-parse', 'HEAD'])).toBe(startRef);
    expect(git(['status', '--porcelain'])).toBe('');
    const merging = spawnSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: repo });
    expect(merging.status).not.toBe(0); // no MERGE_HEAD → merge was aborted
  });

  it('refuses to run on a dirty integration worktree', () => {
    writeFileSync(path.join(repo, 'dirty.txt'), 'uncommitted\n');

    const result = runIntegrate([
      '--confirm-integration',
      '--branches=codex/a',
      '--title=t',
      '--item-title=x',
      '--item-description=y',
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('must be clean');
  });
});
