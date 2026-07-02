#!/usr/bin/env node
/**
 * lint-unscoped-client-writes.mjs
 *
 * Anti-pollution guard. Detects direct `localStorage.setItem` calls к
 * client-specific keys БЕЗ <clientId>_ prefix. Это PRIMARY pollution vector
 * для incident'a 2026-05-29 (Александра → Poplanton): unscoped write попадает
 * в interceptor, который uploads под currentClientId — после switch'а это
 * УЖЕ новый клиент.
 *
 * Pattern: localStorage.setItem('heys_(profile|dayv2_*|ews_*|ceb_*|...)', ...)
 * без leading `heys_<uuid>_` prefix.
 *
 * Этот lint complementary к lint-direct-localstorage-writes.mjs:
 *   - existing lint blocks ВСЕ direct setItem (за allowlist'ом).
 *   - этот специфично блокирует unscoped writes к KNOWN per-client keys,
 *     даже если общий localStorage allowlist разрешает direct setItem.
 *
 * Запуск:
 *   node scripts/lint-unscoped-client-writes.mjs
 *   exit 1 если найден violation вне allowlist'a.
 *
 * Allowlist: scripts/unscoped-client-writes-allowlist.txt
 *   Формат: relative/path:lineNumber  (как у bootstrap-bypass-allowlist.txt)
 *   Для каждого legitimate case (pre-auth fallback без clientId) — entry
 *   с обязательным комментарием выше why это OK.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ALLOWLIST_REL = 'scripts/unscoped-client-writes-allowlist.txt';
const ALLOWLIST_FILE = resolve(ROOT, ALLOWLIST_REL);
const REF = getCliOption('--ref');

// Per-client keys — должны быть scoped как heys_<clientId>_<keyname>.
// Если кто-то пишет 'heys_profile' (unscoped) напрямую — это pollution risk:
// interceptor uploads под currentClientId, а после switch'а это новый client.
const CLIENT_SPECIFIC_KEY_PATTERNS = [
    /^heys_profile$/,
    /^heys_dayv2_\d{4}-\d{2}-\d{2}$/,
    /^heys_dayv2_/, // template literal с подстановкой даты
    /^heys_ews_(snapshot|trends_v1|weekly_v1)$/,
    /^heys_ews_/,
    /^heys_ceb_v1$/,
    /^heys_ceb_d_\d{4}-\d{2}-\d{2}$/,
    /^heys_ceb_/,
    /^heys_meal_gaps_history$/,
    /^heys_cascade_dcs_v\d+$/,
    /^heys_cascade_/,
    /^heys_grams_history$/,
    /^heys_norms$/,
    /^heys_advice_(trace|outcomes)/,
    /^heys_insights_feedback$/,
    /^heys_planning_(projects|tasks|slots|links)/,
];

// Combined detection regex:
// (localStorage|HEYS\.store|HEYS\.utils\.lsSet) . setItem|set ( <string-literal-key>
// where key starts with heys_ and matches a per-client pattern, AND lacks {clientId} prefix.
// We catch via parse: extract first arg to setItem, check pattern.
const SETITEM_REGEX = /localStorage\.setItem\s*\(\s*([`'"])([^`'"]+)[`'"]/g;
// Also catches template-literal patterns:
//   localStorage.setItem(`heys_dayv2_${dateKey}`, ...) — key starts heys_dayv2_
// We use ALL_STRING_FORMS to extract literal or template-prefix.
const SETITEM_TEMPLATE_REGEX = /localStorage\.setItem\s*\(\s*`(heys_[^${`]+)/g;

const EXCLUDED_FILES = new Set([
    'heys_storage_supabase_v1.js',       // The interceptor itself.
    'heys_storage_registry_v1.js',       // Audit infra.
    // Generated bundles (regenerated from sources):
    'heys_advice_bundle_v1.js',
    'heys_day_bundle_v1.js',
    'heys_day_meals_bundle_v1.js',
]);

const SCAN_TARGETS = [
    { dir: 'apps/web', match: (f) => f.startsWith('heys_') && f.endsWith('.js') && !EXCLUDED_FILES.has(f) },
    { dir: 'apps/web/advice', match: (f) => f.endsWith('.js') },
    { dir: 'apps/web/insights', match: (f) => f.endsWith('.js') },
    { dir: 'apps/web/day', match: (f) => f.endsWith('.js') },
];

function getCliOption(name) {
    const prefix = `${name}=`;
    const arg = process.argv.find((item) => item.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

function gitRead(relPath) {
    return execFileSync('git', ['show', `${REF}:${relPath}`], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function readText(relPath) {
    return REF ? gitRead(relPath) : readFileSync(resolve(ROOT, relPath), 'utf8');
}

function listDir(dir) {
    if (!REF) return readdirSync(resolve(ROOT, dir));
    const output = execFileSync('git', ['ls-tree', '--name-only', `${REF}:${dir}`], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

// ── Read allowlist ────────────────────────────────────────────────────────
const allowlist = new Set();
try {
    const lines = readText(ALLOWLIST_REL).split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        allowlist.add(trimmed);
    }
} catch {}

// ── Detect if key matches per-client pattern ──────────────────────────────
function isClientSpecificKey(key) {
    // Already-scoped: heys_<uuid-like>_<name> — accept as scoped.
    // UUID-like prefix: 8-36 chars hex+dash.
    if (/^heys_[0-9a-f-]{8,36}_/i.test(key)) return false;
    return CLIENT_SPECIFIC_KEY_PATTERNS.some((re) => re.test(key));
}

// ── Walk file ─────────────────────────────────────────────────────────────
function* findViolationsInFile(relPath) {
    const content = readText(relPath);
    const lines = content.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];

        // Reset regex global state per line.
        SETITEM_REGEX.lastIndex = 0;
        SETITEM_TEMPLATE_REGEX.lastIndex = 0;

        // Literal string key.
        let m;
        while ((m = SETITEM_REGEX.exec(line)) !== null) {
            const key = m[2];
            if (isClientSpecificKey(key)) {
                yield { line: lineIdx + 1, key, snippet: line.trim() };
            }
        }

        // Template literal с prefix (e.g., `heys_dayv2_${date}`).
        while ((m = SETITEM_TEMPLATE_REGEX.exec(line)) !== null) {
            const keyPrefix = m[1];
            if (isClientSpecificKey(keyPrefix)) {
                yield { line: lineIdx + 1, key: `\`${keyPrefix}\${...}\``, snippet: line.trim() };
            }
        }
    }
}

// ── Walk all files ────────────────────────────────────────────────────────
const violations = [];
const allowlistedHits = [];

for (const target of SCAN_TARGETS) {
    let entries;
    try { entries = listDir(target.dir); } catch (_) { continue; }
    for (const entry of entries) {
        if (!target.match(entry)) continue;
        const relPath = `${target.dir}/${entry}`;
        for (const v of findViolationsInFile(relPath)) {
            const key = `${relPath}:${v.line}`;
            if (allowlist.has(key)) {
                allowlistedHits.push({ ...v, file: relPath });
            } else {
                violations.push({ ...v, file: relPath });
            }
        }
    }
}

// ── Report ────────────────────────────────────────────────────────────────
if (allowlistedHits.length > 0) {
    console.warn(`[lint-unscoped-client-writes] ${allowlistedHits.length} allowlisted unscoped client-key writes:`);
    for (const h of allowlistedHits) {
        console.warn(`  ✓ ${h.file}:${h.line} | key=${h.key}`);
    }
}

if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} UNSCOPED writes to per-client keys (potential pollution vector):`);
    for (const v of violations) {
        console.error(`\n  ${v.file}:${v.line}`);
        console.error(`    key:     ${v.key}`);
        console.error(`    snippet: ${v.snippet}`);
    }
    console.error(`\nКак исправить:`);
    console.error(`  • Используй scoped key: \`heys_\${currentClientId}_<name>\` через HEYS.utils.lsSet`);
    console.error(`    или HEYS.store.set (оба автоматически добавляют scope через nsKey).`);
    console.error(`  • Если write ТОЧНО pre-auth (clientId ещё нет) — добавь entry в`);
    console.error(`    scripts/unscoped-client-writes-allowlist.txt с комментарием выше.`);
    console.error(`  • Reference fix: heys_profile_step_v1.js:1640 (ownership-aware migration)`);
    console.error(`    или steps_v1.js:264 saveDayData (P0 guard pattern).`);
    process.exit(1);
}

console.info(`[lint-unscoped-client-writes] ✅ 0 unscoped client-key writes found.`);
process.exit(0);
