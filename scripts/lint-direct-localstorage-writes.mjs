#!/usr/bin/env node
/**
 * lint-direct-localstorage-writes.mjs
 *
 * Phase 3: scans source files for direct `localStorage.setItem` calls and
 * reports whether each site is in the bootstrap-bypass allowlist or is a NEW
 * (unlisted) violation.
 *
 * Mode:
 *   - Warn-only (Phase 3): all allowlisted sites → stderr warnings.
 *     Exit 0 unless NEW unlisted sites found.
 *   - Strict (Phase 5): pass --strict to treat ALL warnings as errors.
 *
 * Allowlist: scripts/bootstrap-bypass-allowlist.txt
 *   Format: one `relative/path/from/repo-root:lineNumber` per line.
 *   Lines starting with `#` are comments.
 *   Stale entries (file migrated) are silently ignored.
 *
 * Excluded from scan:
 *   - heys_storage_supabase_v1.js  (the interceptor itself — has 42 intentional writes)
 *   - heys_storage_registry_v1.js  (audit infra — writes to audit keys are intentional)
 *   - heys_advice_bundle_v1.js     (generated from advice/*.js sources)
 *   - heys_day_bundle_v1.js        (generated from day sources)
 *   - heys_day_meals_bundle_v1.js  (generated from meals sources)
 *
 * NOTE (C1 from 5th-audit): The primary target is `localStorage.setItem`.
 * `originalSetItem` is only used as a parameter name in cloud_storage_utils_v1.js
 * (not a bypass), so no extra grep needed at this phase. Phase 5 re-audits.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ALLOWLIST_FILE = resolve(ROOT, 'scripts/bootstrap-bypass-allowlist.txt');
const STRICT = process.argv.includes('--strict');
const AUTO_FIX = process.argv.includes('--auto-fix');
const PATTERN = /localStorage\.setItem\s*\(/;

// Files excluded from scan (generated bundles or intentional interceptors).
const EXCLUDED_FILES = new Set([
  'heys_storage_supabase_v1.js',
  'heys_storage_registry_v1.js',
  'heys_advice_bundle_v1.js',
  'heys_day_bundle_v1.js',
  'heys_day_meals_bundle_v1.js',
]);

// Directories and filename patterns to scan.
const SCAN_TARGETS = [
  { dir: 'apps/web',         match: (f) => f.startsWith('heys_') && f.endsWith('.js') && !EXCLUDED_FILES.has(f) },
  { dir: 'apps/web/advice',  match: (f) => f.endsWith('.js') },
  { dir: 'apps/web/insights', match: (f) => f.endsWith('.js') },
];

// ── Read allowlist ─────────────────────────────────────────────────────────
const allowlist = new Set();
if (existsSync(ALLOWLIST_FILE)) {
  const lines = readFileSync(ALLOWLIST_FILE, 'utf8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (t && !t.startsWith('#')) allowlist.add(t);
  }
} else {
  process.stderr.write(`[WARN]  Allowlist not found: ${ALLOWLIST_FILE}\n`);
  process.stderr.write(`        Run with --generate-allowlist to create it.\n`);
}

// ── Scan ───────────────────────────────────────────────────────────────────
const hits = [];

for (const { dir, match } of SCAN_TARGETS) {
  const fullDir = resolve(ROOT, dir);
  let files;
  try { files = readdirSync(fullDir); } catch (_) { continue; }

  for (const file of files) {
    if (!match(file)) continue;
    const fullPath = resolve(fullDir, file);
    let content;
    try { content = readFileSync(fullPath, 'utf8'); } catch (_) { continue; }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (PATTERN.test(lines[i])) {
        const ref = `${relative(ROOT, fullPath)}:${i + 1}`;
        const listed = allowlist.has(ref);
        hits.push({ ref, listed, snippet: lines[i].trim().slice(0, 100) });
      }
    }
  }
}

// ── Auto-bump drift ────────────────────────────────────────────────────────
// Когда параллельный agent сдвинул номера строк в файле, у allowlist остаются
// stale entries. Если для файла F: количество hits == количество allowlist-
// entries, и сами номера различаются — это однозначный line drift (не новые
// нелистованные writes). Авто-перепишем allowlist на актуальные номера.
//
// Если count не совпадает — что-то реальное (новый setItem или удалённый):
// auto-fix НЕ применяется, hook отчитывается как раньше.
if (AUTO_FIX) {
  const hitsByFile = new Map();
  for (const hit of hits) {
    const file = hit.ref.split(':')[0];
    if (!hitsByFile.has(file)) hitsByFile.set(file, []);
    hitsByFile.get(file).push(Number(hit.ref.split(':')[1]));
  }
  const allowlistByFile = new Map();
  for (const entry of allowlist) {
    const [file] = entry.split(':');
    if (!allowlistByFile.has(file)) allowlistByFile.set(file, []);
    allowlistByFile.get(file).push(Number(entry.split(':')[1]));
  }

  let allowlistText = readFileSync(ALLOWLIST_FILE, 'utf8');
  const bumped = [];

  for (const [file, hitLines] of hitsByFile) {
    const allowLines = allowlistByFile.get(file) || [];
    if (allowLines.length === 0 || allowLines.length !== hitLines.length) continue;

    const hSorted = [...hitLines].sort((a, b) => a - b);
    const aSorted = [...allowLines].sort((a, b) => a - b);
    if (hSorted.length === aSorted.length && hSorted.every((v, i) => v === aSorted[i])) continue;

    for (let i = 0; i < hSorted.length; i++) {
      const oldRef = `${file}:${aSorted[i]}`;
      const newRef = `${file}:${hSorted[i]}`;
      if (oldRef === newRef) continue;
      const escaped = oldRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`^${escaped}$`, 'm');
      if (pattern.test(allowlistText)) {
        allowlistText = allowlistText.replace(pattern, newRef);
        bumped.push(`${oldRef} → ${newRef}`);
      }
    }
  }

  if (bumped.length > 0) {
    writeFileSync(ALLOWLIST_FILE, allowlistText);
    process.stdout.write(`\n🔧 Auto-bumped ${bumped.length} allowlist entr(ies) for line drift:\n`);
    bumped.forEach((b) => process.stdout.write(`   ${b}\n`));
    process.stdout.write(`   → ${relative(ROOT, ALLOWLIST_FILE)} updated; stage it together with your source change.\n\n`);

    // Перестроить allowlist Set и переклассифицировать hits для корректного отчёта.
    allowlist.clear();
    for (const line of allowlistText.split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) allowlist.add(t);
    }
    for (const hit of hits) hit.listed = allowlist.has(hit.ref);
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
let warnings = 0;
let errors = 0;

for (const { ref, listed, snippet } of hits) {
  if (listed && !STRICT) {
    warnings++;
    process.stderr.write(`[WARN]  ${ref}\n        ${snippet}\n`);
  } else {
    errors++;
    process.stderr.write(`[ERROR] ${ref}\n        ${snippet}\n`);
  }
}

const label = STRICT ? 'strict' : 'warn-only';
process.stdout.write(
  `\nlocalStorage.setItem lint (${label}): ${warnings} warnings, ${errors} violations\n`,
);

if (errors > 0) {
  process.stderr.write(
    `\n❌ ${errors} localStorage.setItem call(s) not in allowlist.\n` +
    `   Migrate to HEYS.utils.lsSet, OR add to scripts/bootstrap-bypass-allowlist.txt\n` +
    `   if the write must happen before Store loads (bootstrap-bypass).\n`,
  );
  process.exit(1);
}

process.stdout.write(`✅ lint passed (${hits.length} sites, ${warnings} existing warnings)\n`);
process.exit(0);
