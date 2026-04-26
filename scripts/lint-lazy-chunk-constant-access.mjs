#!/usr/bin/env node
/**
 * lint-lazy-chunk-constant-access.mjs
 *
 * Guards against eager non-lazy files writing top-level constant properties
 * onto namespaces that live in lazy chunks (postboot-1-game, postboot-2-insights,
 * postboot-3-ui). Those namespaces aren't available at IIFE-init time, so any
 * top-level write to HEYS.<LazyNs>.UPPER_CONSTANT would throw or silently
 * stomp the namespace before the chunk loads.
 *
 * Forbidden pattern (regex):
 *   HEYS.(InsightsPI|game|missions|ModalManager|PredictiveInsights)
 *       .<UPPER_CONSTANT> =
 * in non-lazy heys_*.js / insights/*.js files under apps/web/.
 *
 * Allowlisted files are listed in scripts/lint-lazy-chunk-allowlist.txt
 * (one path per line, relative to repo root).
 *
 * Run:  node scripts/lint-lazy-chunk-constant-access.mjs
 * Exit 0 OK, 1 violations, 2 file/config error.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const WEB_DIR   = resolve(ROOT, 'apps/web');

// ─── Lazy namespaces (set in lazy chunks, forbidden to write at top level) ────
const LAZY_NS_RE = /\bHEYS\s*\.\s*(?:InsightsPI|game|missions|ModalManager|PredictiveInsights)\s*\.\s*[A-Z_][A-Z0-9_]*\s*=/;

// ─── Files to scan ────────────────────────────────────────────────────────────
// heys_*.js + insights/*.js but NOT *-lazy.* bundles or __tests__
function* walkWebJs(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'public' || entry.name === 'node_modules') continue;
            yield* walkWebJs(full);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            // Skip bundled lazy outputs and generated bundle files
            if (/\.bundle\.[a-f0-9]{12}\.js$/.test(entry.name)) continue;
            if (entry.name.startsWith('heys_day_bundle') ||
                entry.name.startsWith('heys_day_meals_bundle') ||
                entry.name.startsWith('heys_advice_bundle')) continue;
            yield full;
        }
    }
}

// ─── Allowlist ────────────────────────────────────────────────────────────────
const ALLOWLIST_PATH = resolve(__dirname, 'lint-lazy-chunk-allowlist.txt');
const allowlist = existsSync(ALLOWLIST_PATH)
    ? readFileSync(ALLOWLIST_PATH, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
    : [];

function isAllowed(filePath) {
    const rel = relative(ROOT, filePath).replace(/\\/g, '/');
    return allowlist.some(entry => rel === entry || rel.startsWith(entry + '/'));
}

// ─── Lazy-chunk source files themselves (allowed to define these constants) ───
// Files in postboot-*-lazy bundle source lists are not scanned.
const LAZY_SOURCE_FRAGMENTS = [
    'insights/pi_', 'heys_game', 'heys_gamification', 'heys_daily_missions',
    'heys_predictive_insights', 'heys_modal_manager', 'heys_step_modal',
    'heys_planning', 'heys_widgets', 'heys_reports', 'heys_monthly_reports',
    'heys_weekly_reports', 'heys_data_overview',
];

function isLazyChunkSource(filePath) {
    const rel = relative(WEB_DIR, filePath).replace(/\\/g, '/');
    return LAZY_SOURCE_FRAGMENTS.some(f => rel.includes(f));
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

const violations = [];

for (const filePath of walkWebJs(WEB_DIR)) {
    if (isAllowed(filePath) || isLazyChunkSource(filePath)) continue;

    const src   = readFileSync(filePath, 'utf8');
    const lines = src.split('\n');

    lines.forEach((line, idx) => {
        if (!LAZY_NS_RE.test(line)) return;
        violations.push({
            file: relative(ROOT, filePath).replace(/\\/g, '/'),
            line: idx + 1,
            text: line.trim(),
        });
    });
}

if (violations.length === 0) {
    console.log('[lint-lazy-chunk] OK — no top-level writes to lazy-chunk namespaces.');
    process.exit(0);
}

console.error(`[lint-lazy-chunk] ${violations.length} violation(s) — top-level property writes to lazy-chunk namespaces:`);
for (const v of violations) {
    console.error(`  ${v.file}:${v.line}: ${v.text}`);
}
console.error('\nFix: move the assignment inside an event handler or after the lazy chunk loads,');
console.error('     or add the file to scripts/lint-lazy-chunk-allowlist.txt if intentional.');
process.exit(1);
