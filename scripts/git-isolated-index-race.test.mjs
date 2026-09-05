/**
 * Isolated index must prevent foreign staging on the shared index from leaking
 * into agent source-only commits. Reproduces the shared-index race class from
 * polosa 6 / task 71.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  commitSharedIndexNaive,
  commitWithIsolatedIndex,
  gitEnvWithIndex,
  initIsolatedIndexFromHead,
  listStagedInIndex,
  runGit,
  stagePathsInIsolatedIndex,
} from './lib/git-isolated-index.mjs';

const RACE_ITERATIONS = 12;
const RMW_DELAY_MS = 15;

function git(repoRoot, args, env = process.env) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', env }).trim();
}

function sleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function createSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-isolated-index-'));
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.email', 'isolated-index@test.local']);
  git(dir, ['config', 'user.name', 'Isolated Index Test']);

  fs.writeFileSync(path.join(dir, 'ours.txt'), 'ours-v1\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'theirs.txt'), 'theirs-v1\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'shared-foreign.txt'), 'foreign-v1\n', 'utf8');
  git(dir, ['add', 'ours.txt', 'theirs.txt', 'shared-foreign.txt']);
  git(dir, ['commit', '-m', 'chore(test): seed']);

  return dir;
}

function resetWorkingTree(repoRoot) {
  git(repoRoot, ['reset', '--hard', 'HEAD']);
  git(repoRoot, ['clean', '-fd']);
}

test('shared-index git add + commit (no pathspec) commits foreign staging (legacy bug)', () => {
  const repo = createSandbox();
  try {
    resetWorkingTree(repo);
    fs.writeFileSync(path.join(repo, 'ours.txt'), 'ours-v2\n', 'utf8');
    fs.writeFileSync(path.join(repo, 'shared-foreign.txt'), 'foreign-v2\n', 'utf8');

    const result = commitSharedIndexNaive(
      repo,
      ['ours.txt'],
      ['-m', 'fix(test): ours only', '--no-verify'],
      { foreignStaged: ['shared-foreign.txt'] },
    );

    assert.ok(result.files.includes('ours.txt'), 'commit should include ours.txt');
    assert.ok(
      result.files.includes('shared-foreign.txt'),
      'legacy path must leak foreign staged file into the commit',
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('isolated index commit ignores foreign staging on shared index', () => {
  const repo = createSandbox();
  try {
    resetWorkingTree(repo);
    fs.writeFileSync(path.join(repo, 'ours.txt'), 'ours-v3\n', 'utf8');
    fs.writeFileSync(path.join(repo, 'shared-foreign.txt'), 'foreign-v3\n', 'utf8');
    git(repo, ['add', 'shared-foreign.txt']);

    const { sha, staged } = commitWithIsolatedIndex({
      repoRoot: repo,
      paths: ['ours.txt'],
      commitArgs: ['-m', 'fix(test): isolated ours', '--no-verify'],
      env: { HEYS_COMMIT_SOURCE_ONLY: '1' },
    });

    assert.deepEqual(staged, ['ours.txt']);

    const committed = git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n');
    assert.deepEqual(committed, ['ours.txt']);

    assert.ok(!committed.includes('shared-foreign.txt'));
    assert.ok(
      git(repo, ['diff', '--cached', '--name-only']).includes('shared-foreign.txt'),
      'foreign staging must remain on shared index after isolated commit',
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('pre-commit hook environment sees GIT_INDEX_FILE staged set, not shared index', () => {
  const repo = createSandbox();
  try {
    resetWorkingTree(repo);
    fs.writeFileSync(path.join(repo, 'ours.txt'), 'ours-hook\n', 'utf8');
    fs.writeFileSync(path.join(repo, 'shared-foreign.txt'), 'foreign-hook\n', 'utf8');
    git(repo, ['add', 'shared-foreign.txt']);

    const indexPath = path.join(repo, '.git', 'tmp-hook.index');
    const env = initIsolatedIndexFromHead(repo, indexPath);
    stagePathsInIsolatedIndex(repo, indexPath, ['ours.txt'], { env });

    const hookView = listStagedInIndex(repo, env);
    assert.deepEqual(hookView, ['ours.txt']);

    const sharedView = git(repo, ['diff', '--cached', '--name-only']);
    assert.equal(sharedView, 'shared-foreign.txt');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('parallel isolated commits do not cross-contaminate (RMW class)', async () => {
  const repo = createSandbox();
  try {
    let foreignLeak = 0;
    let crossLeak = 0;
    let completed = 0;

    for (let i = 0; i < RACE_ITERATIONS; i += 1) {
      resetWorkingTree(repo);
      fs.writeFileSync(path.join(repo, 'ours.txt'), `ours-${i}\n`, 'utf8');
      fs.writeFileSync(path.join(repo, 'theirs.txt'), `theirs-${i}\n`, 'utf8');
      fs.writeFileSync(path.join(repo, 'shared-foreign.txt'), `foreign-${i}\n`, 'utf8');
      git(repo, ['add', 'shared-foreign.txt']);

      const delayEnv = { HEYS_COMMIT_SOURCE_ONLY: '1', HEYS_ISOLATED_INDEX_RMW_DELAY_MS: String(RMW_DELAY_MS) };

      const runWriter = (file, subject) =>
        new Promise((resolve, reject) => {
          setTimeout(() => {
            try {
              const result = commitWithIsolatedIndex({
                repoRoot: repo,
                paths: [file],
                commitArgs: ['-m', subject, '--no-verify'],
                env: delayEnv,
              });
              if (process.env.HEYS_ISOLATED_INDEX_RMW_DELAY_MS) {
                sleepSync(Number(process.env.HEYS_ISOLATED_INDEX_RMW_DELAY_MS));
              }
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }, 0);
        });

      const [a, b] = await Promise.all([
        runWriter('ours.txt', `fix(test): writer-a-${i}`),
        runWriter('theirs.txt', `fix(test): writer-b-${i}`),
      ]);

      completed += 1;

      for (const result of [a, b]) {
        const files = git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', result.sha]).split('\n');
        if (files.includes('shared-foreign.txt')) foreignLeak += 1;
        if (files.includes('ours.txt') && files.includes('theirs.txt')) crossLeak += 1;
        assert.equal(files.length, 1, `commit must contain exactly one file, got ${files.join(',')}`);
      }
    }

    assert.equal(completed, RACE_ITERATIONS);
    assert.equal(foreignLeak, 0);
    assert.equal(crossLeak, 0);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('gitEnvWithIndex routes diff --cached away from shared index', () => {
  const repo = createSandbox();
  try {
    resetWorkingTree(repo);
    fs.writeFileSync(path.join(repo, 'ours.txt'), 'route-test\n', 'utf8');
    fs.writeFileSync(path.join(repo, 'theirs.txt'), 'theirs-route\n', 'utf8');
    git(repo, ['add', 'theirs.txt']);

    const indexPath = path.join(repo, '.git', 'route.index');
    const env = initIsolatedIndexFromHead(repo, indexPath);
    stagePathsInIsolatedIndex(repo, indexPath, ['ours.txt'], { env });

    assert.deepEqual(listStagedInIndex(repo, env), ['ours.txt']);
    assert.equal(
      runGit(repo, ['diff', '--cached', '--name-only'], { env: gitEnvWithIndex(repo, indexPath) }),
      'ours.txt',
    );
    assert.equal(git(repo, ['diff', '--cached', '--name-only']), 'theirs.txt');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
