#!/usr/bin/env node

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  GENERATED_FILE_PATTERNS,
  RELEASE_FILE_PATTERNS,
  isGeneratedFile,
  isReleaseFile,
} from './legacy-bundle-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

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

function getBranchName() {
  return runGit('branch --show-current');
}

function getRepoRoot() {
  return runGit('rev-parse --show-toplevel') || ROOT_DIR;
}

const WORKTREE_DIR_MARKER = '/.claude/worktrees/';

// Paths of all linked worktrees that live under .claude/worktrees/ (the
// harness-managed per-agent isolation dirs), parsed from `git worktree list`.
function listAgentWorktrees() {
  const porcelain = runGit('worktree list --porcelain');
  if (!porcelain) return [];
  const paths = [];
  for (const line of porcelain.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      paths.push(line.slice('worktree '.length).trim());
    }
  }
  return paths.filter((p) => p.includes(WORKTREE_DIR_MARKER));
}

function getStagedFiles() {
  const out = runGit('diff --cached --name-only --diff-filter=ACMR');
  return out
    ? out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function parseModeArg(argv = []) {
  const explicit = argv.find((arg) => arg.startsWith('--mode='));
  if (!explicit) return '';
  return explicit.slice('--mode='.length).trim();
}

function isIntegrationBranch(branchName) {
  return branchName.startsWith('integration/') || branchName.startsWith('release/');
}

// Shared trunks that ship to prod. Historical policy blocked task-work commits
// here to avoid chaining parallel agents. Current project policy is explicit:
// when the user gives a direct commit/push command on main/develop, that command
// is the approval to ship the current trunk scope together. We keep the helper
// for compatibility, but trunk commits are allowed by default.
function isProtectedTrunk(branchName) {
  return branchName === 'main' || branchName === 'develop';
}

// Linter-regenerated allowlists ride along with commits; not task-work.
const INTEGRATION_MANAGED_ALLOWLISTS = new Set([
  'scripts/bootstrap-bypass-allowlist.txt',
  'scripts/raw-session-clear-allowlist.txt',
]);

function isTaskWorkFile(filePath) {
  return (
    !isGeneratedFile(filePath) &&
    !isReleaseFile(filePath) &&
    !INTEGRATION_MANAGED_ALLOWLISTS.has(filePath)
  );
}

// main/develop are allowed work branches by project policy. Keep env overrides
// and the taskWork return shape for older callers/tests; no normal trunk commit
// is blocked here anymore.
function assertMainIsIntegrationOnly({
  branchName = getBranchName(),
  files = getStagedFiles(),
  env = process.env,
} = {}) {
  if (env.HEYS_INTEGRATION === '1' || env.HEYS_ALLOW_MAIN_COMMIT === '1' || env.HEYS_SHIP === '1') {
    return { ok: true, taskWork: [] };
  }
  if (isProtectedTrunk(branchName)) return { ok: true, taskWork: [] };
  const taskWork = files.filter(isTaskWorkFile);
  if (taskWork.length === 0) return { ok: true, taskWork: [] };
  return { ok: true, branch: branchName, taskWork };
}

function detectStagingMode({
  argv = process.argv.slice(2),
  branchName = getBranchName(),
  repoRoot = getRepoRoot(),
  env = process.env,
} = {}) {
  const explicit = parseModeArg(argv) || env.HEYS_STAGING_MODE || '';
  if (explicit === 'agent' || explicit === 'integration') return explicit;

  if (env.HEYS_INTEGRATION === '1' || env.HEYS_SHIP === '1') return 'integration';
  if (env.HEYS_AGENT_MODE === '1' || env.CODEX_AGENT_MODE === '1') return 'agent';
  if (repoRoot.includes('/.claude/worktrees/')) return 'agent';
  // Known agent-branch prefixes — hint only; the safe-by-default fallback below
  // already treats anything that isn't an explicit integration branch as agent.
  if (/^(codex|claude|copilot|worktree-agent)[/-]/.test(branchName)) return 'agent';
  if (isIntegrationBranch(branchName)) return 'integration';
  // Safe-by-default: integration is an ALLOWLIST. Any other branch
  // (copilot/*, feature/*, fix-*, detached HEAD) is source-only so generated
  // bundles can't slip into a parallel-agent commit. Override with
  // --mode=integration / HEYS_STAGING_MODE=integration when intentional.
  return 'agent';
}

function isGeneratedOrReleaseFile(filePath) {
  return isGeneratedFile(filePath) || isReleaseFile(filePath);
}

function getForbiddenAgentStagedFiles(files = getStagedFiles()) {
  return files.filter(isGeneratedOrReleaseFile);
}

// Cross-zone check (improvement C): staged source files MUST belong to ≤1 zone
// per agent-zones manifest. Multiple zones in one commit → likely cross-agent
// contamination (security agent's git add -A pulling in fingers work, etc).
// Returns warning info (not blocking) for now — staging guard already exists,
// this adds visibility.
async function getMultiZoneWarning(files = getStagedFiles()) {
  try {
    const { getZoneForFile } = await import('./agent-zones.mjs');
    const sourceFiles = files.filter((f) => !isGeneratedOrReleaseFile(f));
    const zonesByFile = new Map();
    sourceFiles.forEach((f) => {
      const zone = getZoneForFile(f);
      if (zone && zone !== '_generated') zonesByFile.set(f, zone);
    });
    const distinctZones = new Set(zonesByFile.values());
    if (distinctZones.size <= 1) return null;
    return {
      zones: [...distinctZones],
      byZone: [...distinctZones].map((z) => ({
        zone: z,
        files: [...zonesByFile.entries()].filter(([, zz]) => zz === z).map(([f]) => f),
      })),
    };
  } catch {
    return null;
  }
}

function assertAgentStaging({
  mode = detectStagingMode(),
  files = getStagedFiles(),
  env = process.env,
} = {}) {
  if (mode !== 'agent') return { ok: true, mode, forbidden: [] };
  // `pnpm ship` собирает source+bundles+whats-new в одном проходе и явно
  // подтверждает, что это намеренный single-author push. В этом режиме
  // agent-mode generated/release блок не нужен.
  if (env.HEYS_SHIP === '1') return { ok: true, mode, forbidden: [] };

  const forbidden = getForbiddenAgentStagedFiles(files);
  if (forbidden.length === 0) return { ok: true, mode, forbidden };

  return { ok: false, mode, forbidden };
}

function printFailure(forbidden) {
  process.stderr.write('[agent-staging] Agent branches are source-only.\n');
  process.stderr.write(
    '[agent-staging] Unstage generated/release files and let integration rebuild them:\n',
  );
  forbidden.forEach((file) => process.stderr.write(`  - ${file}\n`));
}

// Paranoid isolation guard: an agent doing source-only work from the SHARED
// root checkout (not its own worktree) while other agent worktrees are live is
// off the isolation model — two such agents in one checkout would interleave
// each other's uncommitted changes (no commit hook can untangle that). Block to
// funnel agent work into per-agent worktrees. Exempt: integrators (mode !==
// 'agent', i.e. main/develop/integration/release), already-isolated worktrees,
// solo work (no other agent worktrees), and explicit HEYS_ALLOW_SHARED_TREE=1.
function assertNotSharedRootDuringParallel({
  mode = detectStagingMode(),
  branchName = getBranchName(),
  repoRoot = getRepoRoot(),
  env = process.env,
  agentWorktrees = listAgentWorktrees(),
} = {}) {
  if (env.HEYS_ALLOW_SHARED_TREE === '1' || env.HEYS_SHIP === '1') return { ok: true, others: [] };
  if (mode !== 'agent') return { ok: true, others: [] };
  if (isProtectedTrunk(branchName)) return { ok: true, others: [] };
  if (repoRoot.includes(WORKTREE_DIR_MARKER)) return { ok: true, others: [] };

  // We're in the shared root checkout. Any agent worktree is a different tree
  // → genuine parallel activity that this root commit should not race.
  const others = agentWorktrees.filter((p) => p !== repoRoot);
  if (others.length === 0) return { ok: true, others: [] };
  return { ok: false, others };
}

function printSharedRootFailure(others) {
  process.stderr.write(
    '[agent-staging] Committing source-only (agent) work from the SHARED root checkout\n',
  );
  process.stderr.write(`[agent-staging] while ${others.length} agent worktree(s) are active:\n`);
  others.forEach((p) => process.stderr.write(`  - ${p}\n`));
  process.stderr.write(
    '[agent-staging] Work in your own worktree so parallel agents do not share one tree:\n',
  );
  process.stderr.write('  git worktree add ../heys-<task> -b <task>\n');
  process.stderr.write(
    '[agent-staging] Integrators on main/integration are exempt. Stale worktrees? `git worktree prune`.\n',
  );
  process.stderr.write(
    '[agent-staging] Override (you know this checkout is yours alone): HEYS_ALLOW_SHARED_TREE=1\n',
  );
}

function printMainOnlyFailure(branch, taskWork) {
  process.stderr.write(
    `[agent-staging] '${branch}' trunk commits are allowed by current project policy.\n`,
  );
  process.stderr.write('[agent-staging] Unexpected trunk block; staged task-work files:\n');
  taskWork.slice(0, 10).forEach((file) => process.stderr.write(`  - ${file}\n`));
  if (taskWork.length > 10) process.stderr.write(`  … and ${taskWork.length - 10} more\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = detectStagingMode({ argv });

  if (argv.includes('--print-mode')) {
    process.stdout.write(`${mode}\n`);
    return 0;
  }

  const trunk = assertMainIsIntegrationOnly();
  if (!trunk.ok) {
    printMainOnlyFailure(trunk.branch, trunk.taskWork);
    return 1;
  }

  const result = assertAgentStaging({ mode });
  if (!result.ok) {
    printFailure(result.forbidden);
    return 1;
  }

  // Cross-zone advisory warning (improvement C). Не блокирует — даёт
  // видимость когда staged содержит файлы из нескольких agent-зон.
  const multiZone = await getMultiZoneWarning();
  if (multiZone) {
    process.stderr.write(
      '[agent-staging] ⚠ Staged-файлы из НЕСКОЛЬКИХ agent-зон (' +
        multiZone.zones.join(', ') +
        '):\n',
    );
    multiZone.byZone.forEach(({ zone, files }) => {
      process.stderr.write(`  [${zone}]\n`);
      files.forEach((f) => process.stderr.write(`    - ${f}\n`));
    });
    process.stderr.write(
      '[agent-staging] Если это намеренный multi-zone коммит — продолжаем; иначе проверь staging.\n',
    );
  }

  const isolation = assertNotSharedRootDuringParallel({ mode });
  if (!isolation.ok) {
    printSharedRootFailure(isolation.others);
    return 1;
  }

  process.stderr.write(`[agent-staging] mode=${mode}\n`);
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

export {
  GENERATED_FILE_PATTERNS,
  RELEASE_FILE_PATTERNS,
  assertAgentStaging,
  assertMainIsIntegrationOnly,
  assertNotSharedRootDuringParallel,
  detectStagingMode,
  getForbiddenAgentStagedFiles,
  isGeneratedOrReleaseFile,
  isIntegrationBranch,
  isProtectedTrunk,
  isTaskWorkFile,
  listAgentWorktrees,
};
