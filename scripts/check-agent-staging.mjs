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
    detectStagingMode,
    getForbiddenAgentStagedFiles,
    isGeneratedOrReleaseFile,
    isIntegrationBranch,
};
