#!/usr/bin/env node
// auto-pop-foreign-stash.mjs — pop'нуть stash оставленный legacy-sync auto-stash
// в pre-commit (improvement B). Возвращает чужие правки в worktree сразу после
// успешного commit'а нашей зоны, чтобы параллельный агент их не потерял.
//
// Находит stash с marker'ом `auto-stash:foreign-zones:*` на вершине, pop'ит.
// Если merge conflict при pop — оставляет stash в списке (можно вернуть руками),
// не падает. Если на вершине НЕ наш marker — не трогает.

import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const MARKER_PREFIX = 'auto-stash:foreign-zones:';

function listStash() {
    try {
        const out = execSync('git stash list', { encoding: 'utf8', cwd: ROOT_DIR });
        return out.split('\n').filter(Boolean);
    } catch { return []; }
}

function tryPop() {
    const entries = listStash();
    if (entries.length === 0) return { popped: false, reason: 'no-stash' };
    const top = entries[0];
    if (!top.includes(MARKER_PREFIX)) {
        return { popped: false, reason: 'top-not-ours' };
    }
    try {
        execSync('git stash pop --index 0', { encoding: 'utf8', cwd: ROOT_DIR, stdio: 'pipe' });
        return { popped: true, top };
    } catch (e) {
        // Конфликт — stash остаётся, не падаем.
        const msg = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '');
        if (msg.includes('CONFLICT')) {
            return { popped: false, reason: 'conflict — stash сохранён, разрешите вручную', top };
        }
        return { popped: false, reason: 'pop-failed: ' + msg.split('\n')[0], top };
    }
}

const result = tryPop();
if (result.popped) {
    console.info(`[post-commit] 🔁 Auto-pop'нули чужую зону обратно в worktree:`);
    console.info(`  ${result.top}`);
} else if (result.reason === 'conflict — stash сохранён, разрешите вручную') {
    console.warn(`[post-commit] ⚠ Auto-stash чужой зоны не вернулся из-за конфликта:`);
    console.warn(`  ${result.top}`);
    console.warn(`[post-commit] Команда для ручного восстановления: git stash pop`);
}
// Остальные reasons — silent (нечего pop'ать или вершина не наша).
