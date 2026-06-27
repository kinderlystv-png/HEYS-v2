import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/agent-worktree.mjs');

describe('agent-worktree helper', () => {
  it('keeps dry-run non-mutating and reminds that commits require explicit request', () => {
    const result = spawnSync('node', [SCRIPT_PATH, 'Sync Fix', '--dry-run'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[dry-run] git fetch origin --quiet');
    expect(result.stdout).toContain('[dry-run] git worktree add .claude/worktrees/sync-fix -b claude/sync-fix origin/main');
    expect(result.stdout).toContain('if commit was explicitly requested');
    expect(result.stdout).toContain('if integration/shipping was explicitly requested');
    expect(result.stdout).not.toMatch(/^  git add <source> && git commit/m);
  });
});
