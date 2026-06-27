#!/usr/bin/env node

// agent-worktree.mjs — provision an isolated agent worktree the RIGHT way.
//
// Why this exists: parallel agents must each work in their own worktree on their
// own branch (see "Параллельная работа агентов" in CLAUDE.md). Hand-rolling that
// led to two recurring pains:
//   1. fresh worktrees had no node_modules/husky → hooks & tests broke → people
//      symlinked node_modules, a hack that (under multi-worktree) corrupted
//      core.bare and broke git for everyone;
//   2. worktrees based on a stale local trunk carried foreign commits.
// This helper does it once, correctly: branch off a fresh origin/main, a REAL
// `pnpm install` (never a symlink), and a defensive per-worktree core.bare=false.
//
//   pnpm agent:worktree <task> [--base=origin/main] [--dry-run]
//
// Result: ../.claude/worktrees/<task> on branch claude/<task>, ready to edit,
// run local QA, and integrate. Commit only when the user explicitly asks for it.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const WORKTREES_DIR = '.claude/worktrees';

function fail(msg) {
    process.stderr.write(`[agent-worktree] ❌ ${msg}\n`);
    process.exit(1);
}

function parseArgs(argv) {
    const opts = { dryRun: false, base: 'origin/main', task: '' };
    for (const arg of argv) {
        if (arg === '--dry-run') opts.dryRun = true;
        else if (arg.startsWith('--base=')) opts.base = arg.slice('--base='.length).trim();
        else if (arg.startsWith('--')) fail(`Unknown flag: ${arg}`);
        else if (!opts.task) opts.task = arg.trim();
        else fail(`Unexpected extra argument: ${arg}`);
    }
    return opts;
}

// Slugify a task name into a safe branch/dir segment.
function slugifyTask(raw) {
    const slug = raw
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
    if (!slug) fail('Task name is empty after sanitizing. Use letters/digits, e.g. "sync-fix".');
    return slug;
}

function git(args) {
    return execFileSync('git', args, { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
}

function run(command, args, { dryRun, mutates = true }) {
    const printable = [command, ...args].join(' ');
    if (dryRun && mutates) {
        process.stdout.write(`[dry-run] ${printable}\n`);
        return 0;
    }
    process.stdout.write(`$ ${printable}\n`);
    const res = spawnSync(command, args, { cwd: ROOT_DIR, stdio: 'inherit', env: process.env });
    if (res.status !== 0) fail(`Command failed (${res.status}): ${printable}`);
    return res.status;
}

function branchExists(branch) {
    return spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
        { cwd: ROOT_DIR, stdio: 'ignore' }).status === 0;
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.task) {
        fail('Usage: pnpm agent:worktree <task> [--base=origin/main] [--dry-run]');
    }

    const slug = slugifyTask(opts.task);
    const branch = `claude/${slug}`;
    const relDir = `${WORKTREES_DIR}/${slug}`;
    const absDir = path.join(ROOT_DIR, relDir);

    process.stdout.write(`[agent-worktree] task=${slug}  branch=${branch}  dir=${relDir}  base=${opts.base}\n`);

    if (!opts.dryRun) {
        if (existsSync(absDir)) fail(`Directory already exists: ${relDir}`);
        if (branchExists(branch)) fail(`Branch already exists: ${branch} (pick another task name or remove it).`);
    }

    // Fresh base: an agent branch must start from the current remote trunk so it
    // carries only its own work and stays a clean fast-forward at integration.
    run('git', ['fetch', 'origin', '--quiet'], opts);
    run('git', ['worktree', 'add', relDir, '-b', branch, opts.base], opts);

    // Defensive: core.bare=true keeps resurfacing in this multi-worktree repo and
    // breaks work-tree git ops. Pin it false for THIS worktree so the agent is
    // insulated regardless of the shared config. (extensions.worktreeConfig is on.)
    if (!opts.dryRun) {
        spawnSync('git', ['-C', absDir, 'config', 'extensions.worktreeConfig', 'true'], { stdio: 'ignore' });
        spawnSync('git', ['-C', absDir, 'config', '--worktree', 'core.bare', 'false'], { stdio: 'ignore' });
    } else {
        process.stdout.write('[dry-run] git -C <dir> config --worktree core.bare false\n');
    }

    // Real install — NEVER symlink node_modules into a worktree (that corrupts git).
    run('pnpm', ['install', '--prefer-offline', '--dir', absDir], { ...opts, mutates: true });

    process.stdout.write('\n[agent-worktree] ✅ ready. Next:\n');
    process.stdout.write(`  cd ${relDir}\n`);
    process.stdout.write('  pnpm dev:web                  # edit → rebuild affected bundle (bundle:legacy:auto --files=…) → reload\n');
    process.stdout.write('  # if commit was explicitly requested: git add <source> && git commit  # source-only; hooks block bundles/whats-new\n');
    process.stdout.write(`  # if integration/shipping was explicitly requested: pnpm agents:integrate --confirm-integration --branches=${branch} --title=… --items=…\n`);
}

main();
