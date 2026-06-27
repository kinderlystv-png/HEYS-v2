#!/usr/bin/env node

/**
 * ship.mjs — one-command "commit staged scope → rebuild → push → watch deploy".
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
 *   1. Verify explicit staged scope. The script never auto-stages dirty files.
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
import fs from 'node:fs';
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
    allowNonMain: args.includes('--allow-non-main'),
    // SEC: skip ship-lock acquisition. Use for emergency hot-fix only when you
    // KNOW no other agent is shipping — bypasses the multi-agent serialisation.
    noLock: args.includes('--no-lock'),
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

function ensureStagedAndReady(message) {
    const status = gitSafe(['status', '--porcelain']);
    if (!status) fail('Nothing to commit (working tree clean).');

    const stagedRaw = gitSafe(['diff', '--cached', '--name-only']);
    const dirtyRaw = gitSafe(['diff', '--name-only']);
    const untrackedRaw = gitSafe(['ls-files', '--others', '--exclude-standard']);

    const staged = stagedRaw ? stagedRaw.split('\n').filter(Boolean) : [];
    const dirty = dirtyRaw ? dirtyRaw.split('\n').filter(Boolean) : [];
    const untracked = untrackedRaw ? untrackedRaw.split('\n').filter(Boolean) : [];

    if (staged.length === 0) {
        // Nothing staged — agent ran ship over auto-`git add -A` would silently
        // capture other agents' WIP in the same checkout (real incident, see
        // CLAUDE.md). Refuse to auto-stage. Make staging an explicit git signal
        // that the agent is claiming "these files are mine".
        err(`[ship] ❌ Nothing is staged for commit, but working tree has dirty/untracked files.`);
        err(`[ship]    ship no longer auto-stages — explicit \`git add\` prevents silent capture`);
        err(`[ship]    of other agents' WIP in this checkout. Choose:`);
        err(``);
        err(`[ship]    Selective (recommended):`);
        err(`[ship]        git add <your files> && pnpm ship "${message}"`);
        err(``);
        err(`[ship]    All-dirty (only if every dirty file is yours):`);
        err(`[ship]        git add -A && pnpm ship "${message}"`);
        err(``);
        if (dirty.length > 0) {
            err(`[ship]    Dirty modified (${dirty.length}):`);
            dirty.slice(0, 10).forEach((f) => err(`[ship]        M ${f}`));
            if (dirty.length > 10) err(`[ship]        ...+${dirty.length - 10} more`);
        }
        if (untracked.length > 0) {
            err(`[ship]    Untracked (${untracked.length}):`);
            untracked.slice(0, 10).forEach((f) => err(`[ship]        ?? ${f}`));
            if (untracked.length > 10) err(`[ship]        ...+${untracked.length - 10} more`);
        }
        process.exit(1);
    }

    const unstagedCount = dirty.length + untracked.length;
    out(`[ship] 📝 staged=${staged.length} unstaged=${unstagedCount} (unstaged stays in working tree)`);
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

/**
 * Ship-lock — Variant D from docs/PUSH_TRAIN_DESIGN.md.
 *
 * Serialise `pnpm ship` when multiple sessions try to publish from the same
 * checkout. Independent parallel agent work should happen in separate
 * worktrees and be integrated through `pnpm agents:integrate`; this lock only
 * protects the commit+push/shipping sequence:
 *   - non-fast-forward push storms,
 *   - duplicated whats-new.json entries,
 *   - git index.lock chaos when multiple `git commit` race.
 *
 * Lock file: .claude/ship-lock — owned by the current ship's PID, contains
 *   <pid>\n<unix_ms>\n<branch>\n<short_msg>
 * TTL: 5 minutes. If an existing lock is stale (PID dead OR mtime older than
 * TTL), the current ship steals it with a warning. If it's live, the current
 * ship refuses with a helpful message — the agent decides whether to wait/retry
 * or investigate.
 *
 * Override: --no-lock for emergency hot-fixes (use sparingly).
 */
const SHIP_LOCK_PATH = path.join(ROOT_DIR, '.claude', 'ship-lock');
const SHIP_LOCK_TTL_MS = 5 * 60 * 1000;
let shipLockHeld = false;

function isPidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function readShipLock() {
    try {
        const raw = fs.readFileSync(SHIP_LOCK_PATH, 'utf8');
        const [pidStr, tsStr, branch, ...msgParts] = raw.split('\n');
        return {
            pid: Number.parseInt(pidStr, 10),
            ts: Number.parseInt(tsStr, 10),
            branch: branch || '?',
            message: msgParts.join('\n').trim() || '?',
        };
    } catch {
        return null;
    }
}

function acquireShipLock(branch, message) {
    if (flags.noLock) {
        err('[ship] ⚠️  --no-lock: skipping ship-lock acquisition (emergency mode).');
        return;
    }
    fs.mkdirSync(path.dirname(SHIP_LOCK_PATH), { recursive: true });
    const lockBody = `${process.pid}\n${Date.now()}\n${branch}\n${message.slice(0, 200)}\n`;

    // Atomic create — `wx` fails if file exists.
    try {
        fs.writeFileSync(SHIP_LOCK_PATH, lockBody, { flag: 'wx' });
        shipLockHeld = true;
        return;
    } catch (e) {
        if (e.code !== 'EEXIST') {
            fail(`Failed to write ship-lock: ${e.message}`);
        }
    }

    // Lock exists — decide if it's live or stale.
    const existing = readShipLock();
    if (!existing) {
        // Corrupt lock — steal.
        err('[ship] ⚠️  Found corrupt ship-lock — stealing.');
        fs.writeFileSync(SHIP_LOCK_PATH, lockBody);
        shipLockHeld = true;
        return;
    }
    const ageMs = Date.now() - existing.ts;
    const ageSec = Math.floor(ageMs / 1000);
    const pidAlive = isPidAlive(existing.pid);

    if (!pidAlive) {
        err(`[ship] ⚠️  Found ship-lock from dead PID ${existing.pid} (${ageSec}s old) — stealing.`);
        fs.writeFileSync(SHIP_LOCK_PATH, lockBody);
        shipLockHeld = true;
        return;
    }
    if (ageMs > SHIP_LOCK_TTL_MS) {
        err(`[ship] ⚠️  Found ship-lock from PID ${existing.pid} but it's ${ageSec}s old (>${SHIP_LOCK_TTL_MS / 1000}s TTL) — stealing.`);
        err(`[ship]    If that ship is actually live and slow, kill -9 me and let it finish.`);
        fs.writeFileSync(SHIP_LOCK_PATH, lockBody);
        shipLockHeld = true;
        return;
    }

    // Live lock — refuse, agent decides retry strategy.
    err(`[ship] ❌ Another agent is currently shipping:`);
    err(`[ship]     PID:     ${existing.pid}  (alive)`);
    err(`[ship]     branch:  ${existing.branch}`);
    err(`[ship]     started: ${ageSec}s ago`);
    err(`[ship]     msg:     ${existing.message}`);
    err(``);
    err(`[ship]    Wait ~30s and retry, or:`);
    err(`[ship]      ps -p ${existing.pid}                # confirm it's actually running`);
    err(`[ship]      kill -9 ${existing.pid} && rm ${path.relative(ROOT_DIR, SHIP_LOCK_PATH)}    # if hung`);
    err(`[ship]    Emergency bypass (skips lock entirely):`);
    err(`[ship]      pnpm ship "<msg>" --no-lock`);
    process.exit(1);
}

function releaseShipLock() {
    if (!shipLockHeld) return;
    try {
        const existing = readShipLock();
        if (existing && existing.pid === process.pid) {
            fs.unlinkSync(SHIP_LOCK_PATH);
        }
        // If existing.pid !== process.pid, another ship stole the lock from us
        // (we ran longer than TTL). Don't delete — it belongs to them now.
    } catch {
        // Best-effort cleanup; if file already gone, nothing to do.
    }
    shipLockHeld = false;
}

// Register lock release on every exit path. Node calls 'exit' for normal
// termination; signals need explicit handlers to fire 'exit' afterwards.
process.on('exit', releaseShipLock);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
        releaseShipLock();
        process.exit(130);
    });
}
process.on('uncaughtException', (e) => {
    releaseShipLock();
    err(`[ship] uncaught: ${e.stack || e.message}`);
    process.exit(1);
});

/**
 * Stale git-lock cleanup. Multi-agent reality: when one agent crashes
 * mid-commit (Ctrl-C, OOM, network drop), it leaves `.git/index.lock` /
 * `.git/next-index-<pid>.lock` on disk. The next agent's first git op fails
 * with "Unable to create '.git/index.lock'" and the user has to manually
 * intervene. This function clears those locks IF no live git process owns
 * them. Conservative: bail out (no auto-cleanup) if any git is live.
 *
 * Incident 2026-06-08: PID 50604 died holding both locks; my session was
 * blocked for ~20 min on rebase + push until manual `rm`.
 */
function cleanupStaleGitLocks() {
    const gitDir = path.join(ROOT_DIR, '.git');
    const lockNames = ['index.lock'];
    try {
        for (const entry of fs.readdirSync(gitDir)) {
            if (/^next-index-\d+\.lock$/.test(entry)) lockNames.push(entry);
        }
    } catch { return; }

    const presentLocks = lockNames.filter((n) => {
        try { fs.statSync(path.join(gitDir, n)); return true; } catch { return false; }
    });
    if (presentLocks.length === 0) return;

    // Is any git process live? If yes — DON'T touch, may be legit ongoing op.
    const psResult = spawnSync('pgrep', ['-x', 'git'], { encoding: 'utf8' });
    const liveGitPids = (psResult.stdout || '').trim();
    if (liveGitPids) {
        err(`[ship] ⚠️  stale lock(s) detected (${presentLocks.join(', ')}) but live git PID(s) ${liveGitPids} — not removing.`);
        err(`[ship]    Wait for that git process to finish, or kill it manually if you know it's hung.`);
        return;
    }

    for (const n of presentLocks) {
        const p = path.join(gitDir, n);
        try {
            fs.unlinkSync(p);
            out(`[ship] 🧹 removed stale lock: .git/${n} (no live git process owns it)`);
        } catch (e) {
            err(`[ship] ⚠️  could not remove .git/${n}: ${e.message}`);
        }
    }
}

function main() {
    if (!message) {
        err('Usage: pnpm ship "<conventional commit message>" [--dry-run] [--no-push] [--no-watch]');
        err('Example: pnpm ship "feat(fingers): reorder layout cards"');
        process.exit(1);
    }

    cleanupStaleGitLocks();
    // After lock cleanup so we can read branch reliably without race.
    acquireShipLock(getCurrentBranch(), message);

    const { type, subject, isUserFacing } = parseSubject(message);
    const branch = getCurrentBranch();

    // Guard: ship's purpose is solo serial work on `main` → push → deploy.
    // Running on an agent-style branch (claude/*, codex/*, integration/*) means
    // the push won't reach prod and the deploy-watch is skipped — usually not
    // what you wanted. Common cause: session opened on a leftover branch from
    // a previous task. Override with --allow-non-main when intentional.
    if (branch !== 'main' && !flags.allowNonMain) {
        err(`[ship] ⚠️  Current branch is "${branch}", not "main".`);
        err(`[ship]    ship pushes to current branch and only watches deploy on main.`);
        err(`[ship]    If you meant to ship to prod:`);
        err(`[ship]        git checkout main && pnpm ship "${message}"`);
        err(`[ship]    If you really need to ship "${branch}":`);
        err(`[ship]        pnpm ship "${message}" --allow-non-main`);
        process.exit(1);
    }

    out(`[ship] branch=${branch}  type=${type}  user-facing=${isUserFacing}${flags.dryRun ? '  (dry-run)' : ''}`);

    // Set bypass env for all subsequent child processes (commit, push, sub-scripts).
    process.env.HEYS_SHIP = '1';
    process.env.HEYS_INTEGRATION = '1';
    process.env.HEYS_STAGING_MODE = 'integration';

    ensureStagedAndReady(message);

    // Staging is explicit (see ensureStagedAndReady) — agent already did `git add`.
    // Pre-commit hook (mode=integration) will rebuild affected bundles from the
    // staged source and stage the generated outputs into the same commit.

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
        // commitlint header-max-length=100. Prefix 'chore(release): whats-new for '
        // = 31 chars → subject capped at 65 to leave room for trailing '…'.
        const HEADER_PREFIX = 'chore(release): whats-new for ';
        const HEADER_MAX = 100;
        const subjectBudget = HEADER_MAX - HEADER_PREFIX.length;
        const wnSubject = subject.length > subjectBudget
            ? subject.slice(0, subjectBudget - 1).trimEnd() + '…'
            : subject;
        run('git', ['commit', '-m', `${HEADER_PREFIX}${wnSubject}`], { label: '💾 commit: whats-new' });
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
