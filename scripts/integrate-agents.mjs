#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const GENERATED_ADD_PATHS = [
    'apps/web/public',
    'apps/web/bundle-manifest.json',
    'apps/web/index.html',
    'apps/web/heys_advice_bundle_v1.js',
    'apps/web/heys_day_bundle_v1.js',
    'apps/web/heys_day_core_bundle_v1.js',
    'apps/web/heys_day_meals_bundle_v1.js',
    'apps/web/heys_fingers_bundle_v1.js',
    'scripts/bootstrap-bypass-allowlist.txt',
    'scripts/raw-session-clear-allowlist.txt',
];

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

function parseBranches() {
    const raw = getOption('--branches');
    if (!raw) {
        writeError('Missing --branches=branch-a,branch-b');
        process.exit(2);
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

    assertCleanWorktree();

    for (const branch of branches) {
        runRequired('git', ['merge', '--no-ff', branch], { mutates: true });
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
