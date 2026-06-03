#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

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
    return out ? out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
}

function parseModeArg(argv = []) {
    const explicit = argv.find((arg) => arg.startsWith('--mode='));
    if (!explicit) return '';
    return explicit.slice('--mode='.length).trim();
}

function isIntegrationBranch(branchName) {
    return branchName === 'main'
        || branchName === 'develop'
        || branchName.startsWith('integration/')
        || branchName.startsWith('release/');
}

function detectStagingMode({
    argv = process.argv.slice(2),
    branchName = getBranchName(),
    repoRoot = getRepoRoot(),
    env = process.env,
} = {}) {
    const explicit = parseModeArg(argv) || env.HEYS_STAGING_MODE || '';
    if (explicit === 'agent' || explicit === 'integration') return explicit;

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

function assertAgentStaging({ mode = detectStagingMode(), files = getStagedFiles() } = {}) {
    if (mode !== 'agent') return { ok: true, mode, forbidden: [] };

    const forbidden = getForbiddenAgentStagedFiles(files);
    if (forbidden.length === 0) return { ok: true, mode, forbidden };

    return { ok: false, mode, forbidden };
}

function printFailure(forbidden) {
    process.stderr.write('[agent-staging] Agent branches are source-only.\n');
    process.stderr.write('[agent-staging] Unstage generated/release files and let integration rebuild them:\n');
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
    repoRoot = getRepoRoot(),
    env = process.env,
    agentWorktrees = listAgentWorktrees(),
} = {}) {
    if (env.HEYS_ALLOW_SHARED_TREE === '1') return { ok: true, others: [] };
    if (mode !== 'agent') return { ok: true, others: [] };
    if (repoRoot.includes(WORKTREE_DIR_MARKER)) return { ok: true, others: [] };

    // We're in the shared root checkout. Any agent worktree is a different tree
    // → genuine parallel activity that this root commit should not race.
    const others = agentWorktrees.filter((p) => p !== repoRoot);
    if (others.length === 0) return { ok: true, others: [] };
    return { ok: false, others };
}

function printSharedRootFailure(others) {
    process.stderr.write('[agent-staging] Committing source-only (agent) work from the SHARED root checkout\n');
    process.stderr.write(`[agent-staging] while ${others.length} agent worktree(s) are active:\n`);
    others.forEach((p) => process.stderr.write(`  - ${p}\n`));
    process.stderr.write('[agent-staging] Work in your own worktree so parallel agents do not share one tree:\n');
    process.stderr.write('  git worktree add ../heys-<task> -b <task>\n');
    process.stderr.write('[agent-staging] Integrators on main/integration are exempt. Stale worktrees? `git worktree prune`.\n');
    process.stderr.write('[agent-staging] Override (you know this checkout is yours alone): HEYS_ALLOW_SHARED_TREE=1\n');
}

function main() {
    const argv = process.argv.slice(2);
    const mode = detectStagingMode({ argv });

    if (argv.includes('--print-mode')) {
        process.stdout.write(`${mode}\n`);
        return 0;
    }

    const result = assertAgentStaging({ mode });
    if (!result.ok) {
        printFailure(result.forbidden);
        return 1;
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
    process.exit(main());
}

export {
    GENERATED_FILE_PATTERNS,
    RELEASE_FILE_PATTERNS,
    assertAgentStaging,
    assertNotSharedRootDuringParallel,
    detectStagingMode,
    getForbiddenAgentStagedFiles,
    isGeneratedOrReleaseFile,
    isIntegrationBranch,
    listAgentWorktrees,
};
