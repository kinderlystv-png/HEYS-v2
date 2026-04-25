#!/usr/bin/env node
/**
 * lint-shared-cache-writes.mjs
 *
 * Phase β prerequisite (Addition 8 from products refactor plan).
 *
 * Ensures every write to `_sharedProductsCache` in apps/web/heys_storage_supabase_v1.js
 * is paired with `_invalidateSharedIndex()` so that `cloud.getSharedIndex()` sees the new
 * content. Forgetting the invalidation produces a stale Map and the OverlayStore merged
 * view returns outdated nutrient data.
 *
 * Allowed sites today (verified at α landing):
 *   - LS restore branch in cloud.getCachedSharedProducts (~line 11617)
 *   - Post-fetch in cloud.getAllSharedProducts (~line 11750)
 *   - Post-add in cloud.createSharedProduct (~line 12007)
 *
 * Run:    node scripts/lint-shared-cache-writes.mjs
 * Exit 0 if all writes pair with invalidation within 5 lines below the assignment.
 * Exit 1 with violations listed otherwise.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TARGET = resolve(ROOT, 'apps/web/heys_storage_supabase_v1.js');

if (!existsSync(TARGET)) {
  console.error(`[lint-shared-cache] target not found: ${TARGET}`);
  process.exit(2);
}

const src = readFileSync(TARGET, 'utf8').split('\n');
const ASSIGNMENT_RE = /(^|[^_a-zA-Z0-9])_sharedProductsCache\s*=/;
const DECL_RE = /\blet\s+_sharedProductsCache\s*=/;
const INVALIDATE_RE = /_invalidateSharedIndex\s*\(/;
const LOOKAHEAD_LINES = 5;

const violations = [];
src.forEach((line, idx) => {
  if (!ASSIGNMENT_RE.test(line)) return;
  if (DECL_RE.test(line)) return; // initial declaration is fine
  // Look ahead a few lines for the invalidation call.
  const window = src.slice(idx, idx + 1 + LOOKAHEAD_LINES);
  const paired = window.some(l => INVALIDATE_RE.test(l));
  if (!paired) {
    violations.push({ line: idx + 1, text: line.trim() });
  }
});

if (violations.length === 0) {
  console.log('[lint-shared-cache] OK — all _sharedProductsCache assignments paired with _invalidateSharedIndex().');
  process.exit(0);
}

console.error(`[lint-shared-cache] ${violations.length} violation(s) — _sharedProductsCache assignment without _invalidateSharedIndex() within ${LOOKAHEAD_LINES} lines:`);
for (const v of violations) {
  console.error(`  ${TARGET}:${v.line}: ${v.text}`);
}
console.error('\nFix: call _invalidateSharedIndex() immediately after the assignment so cloud.getSharedIndex() rebuilds.');
process.exit(1);
