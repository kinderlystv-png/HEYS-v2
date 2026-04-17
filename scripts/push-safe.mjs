#!/usr/bin/env node
/**
 * push-safe.mjs — Non-interactive safe push for HEYS.
 *
 * Replaces `HUSKY=0 git push` with a proper pipeline that ensures
 * What's New is always up-to-date before pushing.
 *
 * Steps:
 *   1. Validate What's New (prepare-release --check)
 *   2. If outdated → auto-generate entry (prepare-release --auto)
 *   3. Stage & commit What's New follow-up
 *   4. Run critical tests (unless --skip-tests)
 *   5. git push (with HUSKY=0 to avoid interactive re-prompt)
 *
 * Usage:
 *   node scripts/push-safe.mjs                  # Full pipeline
 *   node scripts/push-safe.mjs --skip-tests     # Skip test suite
 *   node scripts/push-safe.mjs --dry-run        # Show what would happen
 *
 * pnpm shortcut:
 *   pnpm push:safe
 *   pnpm push:safe -- --skip-tests
 */

import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PREPARE_RELEASE = path.join(__dirname, 'prepare-release.mjs');

const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const dryRun = args.includes('--dry-run');

function writeLine(text = '') {
    process.stdout.write(`${text}\n`);
}

function writeError(text = '') {
    process.stderr.write(`${text}\n`);
}

function run(command, options = {}) {
    if (dryRun) {
        writeLine(`  [dry-run] ${command}`);
        return '';
    }
    return execSync(command, { cwd: ROOT_DIR, encoding: 'utf8', stdio: 'pipe', ...options });
}

function runInherit(command) {
    if (dryRun) {
        writeLine(`  [dry-run] ${command}`);
        return 0;
    }
    const result = spawnSync(command, {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        shell: true,
    });
    return result.status || 0;
}

function nodeScript(scriptPath, scriptArgs = []) {
    const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        encoding: 'utf8',
    });
    if (result.stdout) writeLine(result.stdout.trimEnd());
    if (result.stderr) writeError(result.stderr.trimEnd());
    return result.status || 0;
}

// ─── Step 1: Validate What's New ────────────────────────────────
writeLine('');
writeLine('🚀 HEYS push-safe pipeline');
writeLine('══════════════════════════');
writeLine('');

writeLine('① Проверка What\'s New...');
let checkStatus = nodeScript(PREPARE_RELEASE, ['--check']);

if (checkStatus !== 0) {
    // ─── Step 2: Auto-generate entry ────────────────────────────
    writeLine('');
    writeLine('② Авто-генерация What\'s New entry...');

    const autoArgs = ['--auto'];
    // Forward --title, --items, and --allow-user-facing-auto if provided
    args.filter((a) => a.startsWith('--title=') || a.startsWith('--items=') || a === '--allow-user-facing-auto').forEach((a) => autoArgs.push(a));

    const autoStatus = nodeScript(PREPARE_RELEASE, autoArgs);
    if (autoStatus !== 0) {
        writeLine('');
        writeLine('ℹ️ Показываю preview, чтобы было видно, что именно ожидается для релиза.');
        nodeScript(PREPARE_RELEASE, ['--preview']);
        writeError('❌ Авто-подготовка What\'s New остановлена.');
        writeError('   Для user-facing/UI/runtime изменений нужен ручной flow: pnpm push:ready');
        writeError('   Так мы не теряем смысл релиза, описание и скриншоты.');
        process.exit(1);
    }

    // ─── Step 3: Stage & commit ─────────────────────────────────
    writeLine('');
    writeLine('③ Коммит What\'s New follow-up...');

    if (!dryRun) {
        run('git add -- apps/web/public/whats-new.json apps/web/public/whats-new');

        // Check if there are actually staged changes
        const diffResult = spawnSync('git', ['diff', '--cached', '--quiet', '--', 'apps/web/public/whats-new.json'], {
            cwd: ROOT_DIR,
            stdio: 'ignore',
            shell: process.platform === 'win32',
        });

        if (diffResult.status === 1) {
            // There are staged changes → commit
            const hash = run('git rev-parse --short=8 HEAD').trim();
            run(`git commit -m "chore: add what's-new entry for ${hash}"`);
            writeLine('   ✅ Follow-up commit создан');
        } else {
            writeLine('   ℹ️ Нет новых изменений в What\'s New');
        }
    }

    // Re-validate
    checkStatus = nodeScript(PREPARE_RELEASE, ['--check']);
    if (checkStatus !== 0) {
        writeError('❌ What\'s New всё ещё не актуален после авто-генерации.');
        writeError('   Проверь вручную: pnpm prepare-release:check');
        process.exit(1);
    }
} else {
    writeLine('   ✅ What\'s New актуален');
}

// ─── Step 4: Critical tests ─────────────────────────────────────
if (!skipTests) {
    writeLine('');
    writeLine('④ Критические тесты...');

    const testFiles = [
        '__tests__/sync-race-condition.test.js',
        '__tests__/merge-day-data.test.js',
        '__tests__/auth-session.test.js',
        '__tests__/storage-layer.test.js',
        '__tests__/products-protection.test.js',
        '__tests__/data-models.test.js',
        '__tests__/storage-quota.test.js',
        '__tests__/storage-compress.test.js',
        '__tests__/events-sync.test.js',
        '__tests__/pwa-update-logic.test.js',
        '__tests__/insulin-wave.test.js',
        '__tests__/cycle.test.js',
    ].join(' ');

    const testStatus = runInherit(`pnpm --filter @heys/web test -- ${testFiles}`);
    if (testStatus !== 0) {
        writeError('❌ Тесты не прошли! Push отменён.');
        process.exit(1);
    }
    writeLine('   ✅ Все критические тесты прошли');
} else {
    writeLine('');
    writeLine('④ Тесты пропущены (--skip-tests)');
}

// ─── Step 5: Push ───────────────────────────────────────────────
writeLine('');
writeLine('⑤ git push...');

if (dryRun) {
    writeLine('  [dry-run] HUSKY=0 git push origin main');
    writeLine('');
    writeLine('✅ [dry-run] Pipeline завершён. Всё готово для реального push.');
} else {
    // HUSKY=0 here is safe because we already ran all validation above
    const pushEnv = { ...process.env, HUSKY: '0' };
    const pushResult = spawnSync('git', ['push', 'origin', 'main'], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        env: pushEnv,
        shell: process.platform === 'win32',
    });

    if (pushResult.status !== 0) {
        writeError('❌ git push failed!');
        process.exit(1);
    }

    writeLine('');
    writeLine('✅ Push завершён успешно!');
    writeLine('   CI workflows (What\'s New Guard + Deploy) должны пройти зелёными.');
}
