import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT_PATH = path.resolve(REPO_ROOT, 'scripts/auto-sync-legacy-bundles.mjs');

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
});
