import { execFileSync, execSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT_PATH = path.resolve(REPO_ROOT, 'scripts/auto-sync-legacy-bundles.mjs');

// Under a git hook (pre-push) git exports GIT_DIR/GIT_WORK_TREE/etc pointing at
// the real repo; they leak into child git processes and break git operations in
// the temp fixture repo ("must be run in a work tree"). Strip them.
const GIT_ENV_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX'];
function cleanGitEnv() {
  const env = { ...process.env };
  for (const k of GIT_ENV_VARS) delete env[k];
  return env;
}

function gitStatus() {
  return execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' });
}

describe('auto-sync legacy bundles agent mode', () => {
  it('reports affected bundles without mutating the worktree', () => {
    const before = gitStatus();
    const output = execSync(
      `node "${SCRIPT_PATH}" --mode=agent-check --files=apps/web/heys_storage_supabase_v1.js`,
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    const after = gitStatus();

    expect(output).toContain('mode=agent-check');
    expect(output).toContain('Would rebuild final legacy bundles at integration');
    expect(output).toContain('boot-core');
    expect(after).toBe(before);
  });

  it('does not run full rebuild for config changes in agent-check mode', () => {
    const before = gitStatus();
    const output = execSync(
      `node "${SCRIPT_PATH}" --mode=agent-check --files=scripts/legacy-bundle-config.mjs`,
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    const after = gitStatus();

    expect(output).toContain('mode=agent-check');
    expect(output).toContain('Would run full legacy rebuild');
    expect(output).toContain('Agent check only');
    expect(after).toBe(before);
  });
});

describe('auto-sync legacy bundles integration mode', () => {
  let repo;

  function git(args) {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: cleanGitEnv() }).trim();
  }

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'heys-autosync-'));
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'test@heys.local']);
    git(['config', 'user.name', 'Test']);
    mkdirSync(path.join(repo, 'apps/web/public'), { recursive: true });
    mkdirSync(path.join(repo, '.claude'), { recursive: true });
    writeFileSync(path.join(repo, 'apps/web/heys_storage_supabase_v1.js'), '// src\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'base']);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('aborts when generated files are already dirty before the integration rebuild', () => {
    // Stage a real source change so the sync proceeds past "no relevant files",
    // then leave a generated artifact dirty — integration must refuse to rebuild
    // on top of a polluted baseline instead of silently capturing it.
    writeFileSync(path.join(repo, 'apps/web/heys_storage_supabase_v1.js'), '// edited\n');
    git(['add', 'apps/web/heys_storage_supabase_v1.js']);
    writeFileSync(path.join(repo, 'apps/web/public/sw.js'), '// dirty generated\n');

    const result = spawnSync('node', [SCRIPT_PATH, '--mode=integration'], {
      cwd: repo,
      encoding: 'utf8',
      env: cleanGitEnv(),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Generated files are already dirty');
    expect(result.stderr).toContain('apps/web/public/sw.js');
  });

  it('does not auto-stash foreign dirty scope when generated files block rebuild', () => {
    writeFileSync(path.join(repo, '.claude/agent-zones.json'), JSON.stringify({
      zones: {
        own: ['apps/web/heys_storage_supabase_v1.js'],
        foreign: ['docs/**'],
      },
    }));
    mkdirSync(path.join(repo, 'docs'), { recursive: true });
    writeFileSync(path.join(repo, 'docs/foreign.md'), 'foreign wip\n');
    git(['add', '.claude/agent-zones.json', 'docs/foreign.md']);
    git(['commit', '-q', '-m', 'zones']);

    writeFileSync(path.join(repo, 'apps/web/heys_storage_supabase_v1.js'), '// edited\n');
    git(['add', 'apps/web/heys_storage_supabase_v1.js']);
    writeFileSync(path.join(repo, 'docs/foreign.md'), 'foreign dirty\n');
    writeFileSync(path.join(repo, 'apps/web/public/sw.js'), '// dirty generated\n');

    const result = spawnSync('node', [SCRIPT_PATH, '--mode=integration'], {
      cwd: repo,
      encoding: 'utf8',
      env: cleanGitEnv(),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Generated files are already dirty');
    expect(result.stderr).toContain('Авто-stash чужих зон отключён');
    expect(git(['stash', 'list'])).toBe('');
    expect(git(['status', '--porcelain'])).toContain(' M docs/foreign.md');
  });

  it('aborts when unstaged legacy source would affect the same generated output', () => {
    writeFileSync(path.join(repo, 'apps/web/heys_core_v12.js'), '// foreign source\n');
    git(['add', 'apps/web/heys_core_v12.js']);
    git(['commit', '-q', '-m', 'add core source']);

    writeFileSync(path.join(repo, 'apps/web/heys_storage_supabase_v1.js'), '// edited storage\n');
    git(['add', 'apps/web/heys_storage_supabase_v1.js']);
    writeFileSync(path.join(repo, 'apps/web/heys_core_v12.js'), '// unstaged same bundle\n');

    const result = spawnSync('node', [SCRIPT_PATH, '--mode=integration'], {
      cwd: repo,
      encoding: 'utf8',
      env: cleanGitEnv(),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unstaged legacy source would affect the same generated output');
    expect(result.stderr).toContain('apps/web/heys_storage_supabase_v1.js');
    expect(result.stderr).toContain('apps/web/heys_core_v12.js');
    expect(git(['stash', 'list'])).toBe('');
  });
});
