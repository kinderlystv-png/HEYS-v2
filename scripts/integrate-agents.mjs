#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';

import { GENERATED_ADD_PATHS } from './legacy-bundle-config.mjs';

// Operate on the current working directory (the repo root when invoked via
// `pnpm agents:integrate`). Using cwd instead of a path hardcoded to this
// script's location keeps the helper testable against fixture repos.
const ROOT_DIR = process.cwd();

// This IS the integration pass — its merge/build/release commits legitimately
// land on main/develop, so exempt them from the "trunk is integration-only"
// pre-commit guard (check-agent-staging.mjs).
process.env.HEYS_INTEGRATION = '1';

function parseCliArgs(argv) {
    const flags = new Set();
    const options = new Map();
    for (const arg of argv.filter((item) => item !== '--')) {
        if (!arg.startsWith('--')) continue;
        if (!arg.includes('=')) {
            flags.add(arg);
            continue;
        }
        const idx = arg.indexOf('=');
        options.set(arg.slice(0, idx), arg.slice(idx + 1));
    }
    return { flags, options };
}

const cli = parseCliArgs(process.argv.slice(2));

function hasFlag(name) {
    return cli.flags.has(name);
}

function getOption(name) {
    return cli.options.get(name) || '';
}

function assertIntegrationRunConfirmed() {
    if (hasFlag('--dry-run')) return;
    if (hasFlag('--confirm-integration')) return;

    writeError('agents:integrate requires explicit --confirm-integration for mutating runs.');
    writeError('This helper merges branches, rebuilds generated/release artifacts, and creates integration commits.');
    writeError('Preview only: pnpm agents:integrate --dry-run --branches=... --title="..." --items=\'[...]\'');
    process.exit(2);
}

function writeLine(text = '') {
    process.stdout.write(`${text}\n`);
}

function writeError(text = '') {
    process.stderr.write(`${text}\n`);
}

function run(command, args = [], options = {}) {
    const printable = [command, ...args].join(' ');
    if (hasFlag('--dry-run') && options.mutates) {
        writeLine(`[dry-run] ${printable}`);
        return { status: 0, stdout: '', stderr: '' };
    }
    writeLine(`$ ${printable}`);
    return spawnSync(command, args, {
        cwd: ROOT_DIR,
        stdio: options.stdio || 'inherit',
        encoding: 'utf8',
        shell: false,
        env: process.env,
    });
}

function runRequired(command, args = [], options = {}) {
    const result = run(command, args, options);
    if (result.status !== 0) process.exit(result.status || 1);
    return result;
}

function gitOutput(args) {
    try {
        return execSync(`git ${args}`, { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
    } catch {
        return '';
    }
}

function assertCleanWorktree() {
    const status = gitOutput('status --porcelain');
    if (!status) return;
    writeError('Integration worktree must be clean before merging agent branches.');
    writeError(status);
    process.exit(2);
}

// Agent-branch prefixes used to auto-discover work-in-progress branches.
const AGENT_BRANCH_RE = /^(codex|claude|copilot|worktree-agent)[/-]/;

// Branches checked out in agent worktrees (under .claude/worktrees/), parsed from
// `git worktree list --porcelain`. These are the live parallel-agent branches.
function discoverAgentBranches() {
    const porcelain = gitOutput('worktree list --porcelain');
    const found = [];
    let currentWorktree = '';
    for (const line of porcelain.split('\n')) {
        if (line.startsWith('worktree ')) {
            currentWorktree = line.slice('worktree '.length).trim();
        } else if (line.startsWith('branch ')) {
            const ref = line.slice('branch '.length).trim();
            const branch = ref.replace(/^refs\/heads\//, '');
            const inAgentWorktree = currentWorktree.includes('/.claude/worktrees/');
            if (inAgentWorktree || AGENT_BRANCH_RE.test(branch)) found.push(branch);
        }
    }
    return [...new Set(found)];
}

function parseBranches() {
    const raw = getOption('--branches');
    if (!raw) {
        writeError('Missing --branches=branch-a,branch-b (or --branches=auto).');
        process.exit(2);
    }
    if (raw.trim() === 'auto') {
        const discovered = discoverAgentBranches();
        if (discovered.length === 0) {
            writeError('--branches=auto found no agent worktree branches to integrate.');
            process.exit(2);
        }
        writeLine('Auto-discovered agent branches:');
        discovered.forEach((branch) => writeLine(`  - ${branch}`));
        if (!hasFlag('--yes') && !hasFlag('--dry-run')) {
            writeError('Re-run with --yes to confirm integrating the branches above (or pass explicit --branches=...).');
            process.exit(2);
        }
        return discovered;
    }
    const branches = raw.split(',').map((branch) => branch.trim()).filter(Boolean);
    if (branches.length === 0) {
        writeError('No branches provided.');
        process.exit(2);
    }
    return branches;
}

function getItemsJson() {
    const explicit = getOption('--items');
    if (explicit) {
        try {
            const parsed = JSON.parse(explicit);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                throw new Error('--items must be a non-empty JSON array');
            }
            return JSON.stringify(parsed);
        } catch (error) {
            writeError(`Invalid --items JSON: ${error.message}`);
            process.exit(2);
        }
    }

    const itemTitle = getOption('--item-title');
    const itemDescription = getOption('--item-description');
    const itemType = getOption('--item-type') || 'fix';
    if (!itemTitle || !itemDescription) return '';
    return JSON.stringify([{ type: itemType, title: itemTitle, description: itemDescription }]);
}

function ensureReleaseArgs() {
    const title = getOption('--title');
    const itemsJson = getItemsJson();
    if (!title || !itemsJson) {
        writeError('Missing release text. Provide --title and either --items or --item-title/--item-description.');
        process.exit(2);
    }
    return { title, itemsJson };
}

function hasStagedChanges(paths = []) {
    const args = ['diff', '--cached', '--quiet'];
    if (paths.length > 0) args.push('--', ...paths);
    const result = run('git', args, { stdio: 'ignore' });
    return result.status === 1;
}

function commitIfStaged(message, paths) {
    if (!hasStagedChanges(paths)) {
        writeLine(`No staged changes for: ${message}`);
        return;
    }
    runRequired('git', ['commit', '-m', message], { mutates: true });
}

function main() {
    const branches = parseBranches();
    const { title, itemsJson } = ensureReleaseArgs();
    const range = getOption('--range') || 'origin/main..HEAD';

    writeLine('Agent integration plan');
    writeLine(`  branches: ${branches.join(', ')}`);
    writeLine(`  release range: ${range}`);
    writeLine(`  title: ${title}`);

    assertIntegrationRunConfirmed();
    assertCleanWorktree();

    const startRef = gitOutput('rev-parse HEAD');
    for (const branch of branches) {
        const result = run('git', ['merge', '--no-ff', '--no-edit', branch], { mutates: true });
        if (result.status !== 0) {
            writeError(`\nMerge conflict while integrating "${branch}".`);
            const conflicts = gitOutput('diff --name-only --diff-filter=U');
            if (conflicts) {
                writeError('Conflicting files:');
                conflicts.split('\n').filter(Boolean).forEach((file) => writeError(`  - ${file}`));
            }
            if (!hasFlag('--dry-run')) {
                run('git', ['merge', '--abort'], { mutates: true });
                if (startRef) run('git', ['reset', '--hard', startRef], { mutates: true });
                writeError(`Rolled back to ${startRef || 'pre-integration HEAD'}. Resolve the conflict on "${branch}" and re-run.`);
            }
            process.exit(1);
        }
    }

    runRequired('pnpm', ['--filter', '@heys/web', 'run', 'predev'], { mutates: true });
    runRequired('pnpm', ['bundle:legacy'], { mutates: true });

    run('node', ['scripts/lint-direct-localstorage-writes.mjs', '--auto-fix'], { mutates: true });
    run('node', ['scripts/lint-raw-session-clear.mjs', '--auto-fix'], { mutates: true });

    runRequired('git', ['add', '--', ...GENERATED_ADD_PATHS], { mutates: true });
    runRequired('pnpm', ['verify:legacy-bundles'], { mutates: true });
    commitIfStaged('chore(build): sync generated artifacts for agent integration', GENERATED_ADD_PATHS);

    runRequired(process.execPath, [
        'scripts/prepare-release.mjs',
        '--auto',
        '--allow-user-facing-auto',
        `--range=${range}`,
        '--covered-commits=auto',
        `--title=${title}`,
        `--items=${itemsJson}`,
    ], { mutates: true });

    runRequired('git', ['add', '--', 'apps/web/public/whats-new.json', 'apps/web/public/whats-new'], { mutates: true });
    commitIfStaged('chore(release): add whats-new for agent integration', [
        'apps/web/public/whats-new.json',
        'apps/web/public/whats-new',
    ]);

    writeLine('Integration complete. Push is intentionally not run.');
}

main();
