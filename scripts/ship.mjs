#!/usr/bin/env node

/**
 * ship.mjs — one-command "stage → rebuild → commit → push → watch deploy".
 *
 * Solo-flow alternative to the multi-step `agents:integrate` ceremony.
 * Designed for the common case: a single agent working serially on main (or
 * any branch), with no other parallel checkouts. For real parallel sessions
 * (2+ agents editing different code simultaneously), still use worktrees +
 * `pnpm agents:integrate`.
 *
 *   pnpm ship "feat(fingers): reorder layout cards"
 *   pnpm ship "fix(sync): drop stale dayv2" --dry-run
 *   pnpm ship "chore(scripts): refactor logging" --no-push
 *
 * Pipeline:
 *   1. Stage all current changes (source + anything dirty).
 *   2. `git commit -m <msg>` — pre-commit hook (mode=integration) rebuilds
 *      affected bundles and stages them into the same commit.
 *   3. If commit is user-facing (feat/fix/perf), auto-generate a whats-new
 *      entry from the commit subject and create a chore(release) follow-up.
 *   4. `git push` current branch.
 *   5. If on main, watch the "Deploy to Yandex Cloud" workflow until green.
 *
 * Env it sets for child processes:
 *   HEYS_SHIP=1            — pre-commit bypass: ship is all-in-one by design
 *   HEYS_INTEGRATION=1     — allow trunk commit if on main/develop
 *   HEYS_STAGING_MODE=integration — force auto-sync hook to rebuild+stage
 */

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PREPARE_RELEASE = path.join(__dirname, 'prepare-release.mjs');
const DEFAULT_DEPLOY_WORKFLOW = 'Deploy to Yandex Cloud';

const args = process.argv.slice(2);
const flags = {
    dryRun: args.includes('--dry-run'),
    noPush: args.includes('--no-push'),
    noWatch: args.includes('--no-watch'),
    noVerify: false, // intentionally unsupported
};
const message = args.find((a) => !a.startsWith('--'));

function out(s = '') { process.stdout.write(`${s}\n`); }
function err(s = '') { process.stderr.write(`${s}\n`); }
function fail(s) { err(`[ship] ❌ ${s}`); process.exit(1); }

function git(gitArgs, options = {}) {
    return execFileSync('git', gitArgs, { cwd: ROOT_DIR, encoding: 'utf8', ...options }).trim();
}
function gitSafe(gitArgs) {
    try { return git(gitArgs); } catch { return ''; }
}
function run(cmd, cmdArgs, { dryOk = false, label } = {}) {
    const printable = `${cmd} ${cmdArgs.join(' ')}`;
    if (flags.dryRun && !dryOk) {
        out(`[dry-run] ${printable}`);
        return { status: 0 };
    }
    if (label) out(`[ship] ${label}`);
    const res = spawnSync(cmd, cmdArgs, { cwd: ROOT_DIR, stdio: 'inherit', env: process.env });
    if (res.status !== 0) fail(`Command failed (${res.status}): ${printable}`);
    return res;
}

function runGh(ghArgs, { capture = false } = {}) {
    return spawnSync('gh', ghArgs, {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        env: process.env,
    });
}

function parseSubject(msg) {
    const m = /^(feat|fix|perf|chore|docs|refactor|test|style|build|ci|revert)(?:\([^)]+\))?!?:\s*(.+)$/.exec(msg);
    if (!m) {
        fail(`Commit message must be conventional: type(scope?): subject\n   Got: ${JSON.stringify(msg)}`);
    }
    const [, type, subject] = m;
    return { type, subject, isUserFacing: type === 'feat' || type === 'fix' || type === 'perf' };
}

function ensureSomethingToCommit() {
    const status = gitSafe(['status', '--porcelain']);
    if (!status) fail('Nothing to commit (working tree clean).');
}

function getCurrentBranch() {
    return gitSafe(['branch', '--show-current']) || 'HEAD';
}

function sleepSeconds(n) {
    if (!n || n <= 0) return;
    spawnSync('sleep', [String(n)], { stdio: 'ignore' });
}

function findDeployRunForHead({ workflow, branch, headSha }) {
    const r = runGh(
        ['run', 'list', `--workflow=${workflow}`, `--branch=${branch}`, '--limit', '10',
            '--json', 'databaseId,headSha,status,conclusion,url'],
        { capture: true },
    );
    if (r.status !== 0) return null;
    let runs = [];
    try { runs = JSON.parse(r.stdout || '[]'); } catch { runs = []; }
    return runs.find((it) => {
        const h = String(it?.headSha || '');
        return h && (h === headSha || h.startsWith(headSha));
    }) || null;
}

function watchDeploy(branch) {
    if (flags.noWatch || flags.noPush || flags.dryRun) return;
    if (branch !== 'main') return;
    const headSha = gitSafe(['rev-parse', 'HEAD']);
    if (!headSha) return;

    const workflow = DEFAULT_DEPLOY_WORKFLOW;
    out('');
    out(`[ship] 👀 Watching "${workflow}" for main@${headSha.slice(0, 8)}...`);

    let runItem = null;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        sleepSeconds(5);
        runItem = findDeployRunForHead({ workflow, branch, headSha });
        if (runItem) break;
    }
    if (!runItem) {
        err(`[ship] Could not find "${workflow}" run for main@${headSha.slice(0, 8)}.`);
        err(`[ship] Check manually: gh run list --workflow="${workflow}" --branch=main --limit 5`);
        process.exit(1);
    }
    out(`[ship] Deploy run: ${runItem.url || `#${runItem.databaseId}`}`);
    const watch = runGh(['run', 'watch', String(runItem.databaseId), '--exit-status', '--interval', '20', '--compact']);
    if (watch.status !== 0) {
        err('[ship] Deploy failed.');
        process.exit(watch.status || 1);
    }
    out('[ship] ✅ Deploy green.');
}

function main() {
    if (!message) {
        err('Usage: pnpm ship "<conventional commit message>" [--dry-run] [--no-push] [--no-watch]');
        err('Example: pnpm ship "feat(fingers): reorder layout cards"');
        process.exit(1);
    }

    const { type, subject, isUserFacing } = parseSubject(message);
    const branch = getCurrentBranch();

    out(`[ship] branch=${branch}  type=${type}  user-facing=${isUserFacing}${flags.dryRun ? '  (dry-run)' : ''}`);

    // Set bypass env for all subsequent child processes (commit, push, sub-scripts).
    process.env.HEYS_SHIP = '1';
    process.env.HEYS_INTEGRATION = '1';
    process.env.HEYS_STAGING_MODE = 'integration';

    ensureSomethingToCommit();

    // Stage everything currently dirty. Pre-commit hook (mode=integration) will
    // rebuild affected bundles from staged source and stage the generated outputs
    // into the same commit. If user already had bundle drift, that gets overwritten
    // by the fresh rebuild — exactly what we want.
    run('git', ['add', '-A'], { label: '📝 staging changes' });

    // First commit: source + freshly rebuilt bundles (via pre-commit auto-sync).
    run('git', ['commit', '-m', message], { label: `💾 commit: ${message}` });

    // Always generate a whats-new entry — the pre-push deploy gate requires
    // one per build hash. user-facing (feat/fix/perf) gets a visible entry
    // built from the commit subject; everything else gets a technical entry
    // auto-classified by changed files (technical entries don't surface in the
    // user-facing whats-new modal, but satisfy the gate).
    if (isUserFacing) {
        out('[ship] 📋 generating whats-new entry from subject (user-facing)');
        const items = JSON.stringify([{ type, title: subject, description: subject }]);
        run(process.execPath, [
            PREPARE_RELEASE,
            '--auto',
            '--allow-user-facing-auto',
            '--covered-commits=auto',
            `--title=${subject}`,
            `--items=${items}`,
        ], { label: '   prepare-release --auto' });
    } else {
        out('[ship] 📋 generating technical whats-new entry (not user-visible)');
        // `--force-technical`: even if changed files match user-facing
        // path heuristics (e.g. docs under apps/web/), the commit type signals
        // an internal change. We override to technical kind so it stays out of
        // the user-facing whats-new modal.
        run(process.execPath, [
            PREPARE_RELEASE,
            '--auto',
            '--force-technical',
            '--covered-commits=auto',
        ], { label: '   prepare-release --auto --force-technical' });
    }

    run('git', ['add', '--', 'apps/web/public/whats-new.json', 'apps/web/public/whats-new'], {});
    const staged = gitSafe(['diff', '--cached', '--name-only']);
    if (staged) {
        run('git', ['commit', '-m', `chore(release): whats-new for ${subject}`], { label: '💾 commit: whats-new' });
    } else {
        out('[ship] whats-new already up-to-date — no release commit needed.');
    }

    if (flags.noPush) {
        out('[ship] --no-push: skipping push.');
        return;
    }

    run('git', ['push', 'origin', branch], { label: `🚀 push origin ${branch}` });

    watchDeploy(branch);

    out('[ship] ✅ done.');
}

main();
