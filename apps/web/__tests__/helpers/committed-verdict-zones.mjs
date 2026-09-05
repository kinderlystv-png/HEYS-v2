import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Read verdict zones from git HEAD — ignores dirty worktree edits under docs/ui/verdicts/.
 * Uses a single `git checkout` into a temp work-tree (faster than per-file `git show`).
 * @param {string} [repoRoot]
 * @returns {{ zones: Record<string, object> }}
 */
export function readCommittedVerdictZones(repoRoot = ROOT) {
  const workTree = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-verdict-head-'));
  const gitDir = path.join(repoRoot, '.git');

  try {
    execSync('git checkout HEAD -- docs/ui/verdicts', {
      cwd: repoRoot,
      env: {
        ...process.env,
        GIT_WORK_TREE: workTree,
        GIT_DIR: gitDir,
      },
      stdio: 'pipe',
      maxBuffer: GIT_MAX_BUFFER,
    });

    const verdictsDir = path.join(workTree, 'docs/ui/verdicts');
    const zones = {};
    for (const file of fs.readdirSync(verdictsDir)) {
      if (!file.endsWith('.json')) continue;
      zones[path.basename(file, '.json')] = JSON.parse(
        fs.readFileSync(path.join(verdictsDir, file), 'utf8'),
      );
    }
    return { zones };
  } finally {
    fs.rmSync(workTree, { recursive: true, force: true });
  }
}
