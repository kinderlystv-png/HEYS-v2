#!/usr/bin/env node
/**
 * lint-direct-localstorage-writes.mjs
 *
 * Phase 3: scans source files for direct `localStorage.setItem` calls and
 * reports whether each site is in the bootstrap-bypass allowlist or is a NEW
 * (unlisted) violation.
 *
 * Mode:
 *   - Warn-only (Phase 3): allowlisted sites counted against baseline;
 *     default log is one summary line. Pass --verbose to list each WARN.
 *     Exit 0 unless NEW unlisted sites found OR allowlist grew past baseline.
 *   - Strict (Phase 5): pass --strict to treat ALL warnings as errors.
 *
 * Allowlist: scripts/bootstrap-bypass-allowlist.txt
 * Baseline:  scripts/bootstrap-bypass-allowlist.baseline (integer count)
 *   Formats (one per line; `#` starts a comment):
 *     path::needle     — preferred: matches a setItem line containing needle
 *                        (stable across line drift)
 *     path:lineNumber  — legacy; still accepted
 *   Stale entries are silently ignored.
 *
 * Excluded from scan:
 *   - storage interceptor / registry
 *   - generated `*_bundle_v1.js` (violations live in sources)
 *
 * Comments are not violations: line comments and block comments are skipped
 * even when they mention localStorage.setItem.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ALLOWLIST_REL = 'scripts/bootstrap-bypass-allowlist.txt';
const ALLOWLIST_FILE = resolve(ROOT, ALLOWLIST_REL);
const STRICT = process.argv.includes('--strict');
const AUTO_FIX = process.argv.includes('--auto-fix');
const VERBOSE = process.argv.includes('--verbose');
const REF = getCliOption('--ref');
const PATTERN = /localStorage\.setItem\s*\(/;
const BASELINE_REL = 'scripts/bootstrap-bypass-allowlist.baseline';
const BASELINE_FILE = resolve(ROOT, BASELINE_REL);

const EXCLUDED_FILES = new Set([
  'heys_storage_supabase_v1.js',
  'heys_storage_registry_v1.js',
]);

function isGeneratedBundle(fileName) {
  return /_bundle_v\d+\.js$/.test(fileName) || fileName.endsWith('_bundle.js');
}

const SCAN_TARGETS = [
  {
    dir: 'apps/web',
    match: (f) =>
      f.startsWith('heys_') && f.endsWith('.js') && !EXCLUDED_FILES.has(f) && !isGeneratedBundle(f),
  },
  { dir: 'apps/web/advice', match: (f) => f.endsWith('.js') && !isGeneratedBundle(f) },
  { dir: 'apps/web/insights', match: (f) => f.endsWith('.js') && !isGeneratedBundle(f) },
  { dir: 'apps/web/day', match: (f) => f.endsWith('.js') && !isGeneratedBundle(f) },
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

/** True when localStorage.setItem appears in executable code on this line. */
function lineHasCodeSetItem(line) {
  // Strip string literals so // inside strings is not treated as a comment.
  // Avoid backticks in the regex character class — they confuse some parsers
  // when this file itself uses template literals nearby.
  let cleaned = line.replace(/(['"])(?:\\.|(?!\1).)*\1/g, '""');
  cleaned = cleaned.replace(/`(?:\\.|[^`])*`/g, '""');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  const lineComment = cleaned.indexOf('//');
  if (lineComment >= 0) cleaned = cleaned.slice(0, lineComment);
  return PATTERN.test(cleaned);
}

function collectHitsFromContent(relPath, content) {
  const hits = [];
  const lines = content.split('\n');
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let scan = '';
    for (let j = 0; j < line.length; j++) {
      if (!inBlockComment && line[j] === '/' && line[j + 1] === '*') {
        inBlockComment = true;
        scan += ' ';
        j++;
        continue;
      }
      if (inBlockComment && line[j] === '*' && line[j + 1] === '/') {
        inBlockComment = false;
        scan += ' ';
        j++;
        continue;
      }
      scan += inBlockComment ? ' ' : line[j];
    }
    if (!lineHasCodeSetItem(scan)) continue;
    hits.push({
      path: relPath,
      line: i + 1,
      snippet: line.trim().slice(0, 100),
    });
  }
  return hits;
}

function listScanFiles() {
  const relFiles = [];
  for (const { dir, match } of SCAN_TARGETS) {
    let files;
    try {
      files = listDir(dir);
    } catch (_) {
      continue;
    }
    for (const file of files) {
      if (match(file)) relFiles.push(`${dir}/${file}`);
    }
  }
  return relFiles;
}

// ── Read allowlist ─────────────────────────────────────────────────────────
/** @type {{ kind: 'line'|'needle', path: string, line?: number, needle?: string, raw: string }[]} */
const allowEntries = [];
try {
  const lines = readText(ALLOWLIST_REL).split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const needleSep = t.indexOf('::');
    if (needleSep > 0) {
      allowEntries.push({
        kind: 'needle',
        path: t.slice(0, needleSep),
        needle: t.slice(needleSep + 2),
        raw: t,
      });
      continue;
    }
    const m = /^(.+):(\d+)$/.exec(t);
    if (m) {
      allowEntries.push({
        kind: 'line',
        path: m[1],
        line: Number(m[2]),
        raw: t,
      });
    }
  }
} catch {
  process.stderr.write(`[WARN]  Allowlist not found: ${ALLOWLIST_FILE}\n`);
  process.stderr.write(`        Run with --generate-allowlist to create it.\n`);
}

function isListed(hit) {
  for (const entry of allowEntries) {
    if (entry.path !== hit.path) continue;
    if (entry.kind === 'line' && entry.line === hit.line) return true;
    if (entry.kind === 'needle' && entry.needle && hit.snippet.includes(entry.needle)) return true;
  }
  return false;
}

// ── Scan ───────────────────────────────────────────────────────────────────
const rawHits = [];
for (const relPath of listScanFiles()) {
  let content;
  try {
    content = readText(relPath);
  } catch (_) {
    continue;
  }
  for (const hit of collectHitsFromContent(relPath, content)) {
    rawHits.push(hit);
  }
}

const hits = rawHits.map((hit) => ({
  ref: `${hit.path}:${hit.line}`,
  path: hit.path,
  line: hit.line,
  listed: isListed(hit),
  snippet: hit.snippet,
}));

// ── Auto-bump: only legacy path:line entries, same-count drift ─────────────
if (AUTO_FIX && !REF) {
  let allowlistText = readFileSync(ALLOWLIST_FILE, 'utf8');
  const bumped = [];

  const hitsByFile = new Map();
  for (const hit of hits) {
    if (!hitsByFile.has(hit.path)) hitsByFile.set(hit.path, []);
    hitsByFile.get(hit.path).push(hit.line);
  }

  const lineEntriesByFile = new Map();
  for (const entry of allowEntries) {
    if (entry.kind !== 'line') continue;
    if (!lineEntriesByFile.has(entry.path)) lineEntriesByFile.set(entry.path, []);
    lineEntriesByFile.get(entry.path).push(entry.line);
  }

  for (const [file, hitLines] of hitsByFile) {
    const allowLines = lineEntriesByFile.get(file) || [];
    // Only auto-bump when this file has no needle entries (semantic list owns it).
    const hasNeedle = allowEntries.some((e) => e.kind === 'needle' && e.path === file);
    if (hasNeedle) continue;
    if (allowLines.length === 0 || allowLines.length !== hitLines.length) continue;

    const hSorted = [...hitLines].sort((a, b) => a - b);
    const aSorted = [...allowLines].sort((a, b) => a - b);
    if (hSorted.every((v, i) => v === aSorted[i])) continue;

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
    process.stdout.write(`   → Prefer path::needle entries to avoid future drift.\n\n`);
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
let warnings = 0;
let errors = 0;

for (const { ref, listed, snippet } of hits) {
  if (listed && !STRICT) {
    warnings++;
    if (VERBOSE) {
      process.stderr.write(`[WARN]  ${ref}\n        ${snippet}\n`);
    }
  } else {
    errors++;
    process.stderr.write(`[ERROR] ${ref}\n        ${snippet}\n`);
  }
}

const label = STRICT ? 'strict' : 'warn-only';
let baseline = null;
if (existsSync(BASELINE_FILE)) {
  const raw = readFileSync(BASELINE_FILE, 'utf8').trim();
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 0) baseline = n;
}

if (baseline === null) {
  process.stderr.write(
    `[WARN]  No allowlist baseline at ${BASELINE_REL} — write the current allowlisted count there.\n`,
  );
} else if (warnings > baseline) {
  process.stderr.write(
    `\n❌ Allowlist grew: ${warnings} allowlisted sites, baseline ${baseline} (${BASELINE_REL}).\n` +
      `   New direct setItem must go through Store/lsSet, or bump the baseline deliberately\n` +
      `   after reviewing each new site (prefer path::needle).\n`,
  );
  process.exit(1);
} else if (warnings < baseline) {
  process.stdout.write(
    `localStorage.setItem lint (${label}): ${warnings} allowlisted, 0 new` +
      ` (baseline ${baseline} — allowlist shrank; bump ${BASELINE_REL} down when intentional)\n`,
  );
} else {
  process.stdout.write(
    `localStorage.setItem lint (${label}): ${warnings} allowlisted, 0 new\n`,
  );
}

if (errors > 0) {
  process.stderr.write(
    `\n❌ ${errors} localStorage.setItem call(s) not in allowlist.\n` +
      `   Migrate to HEYS.utils.lsSet / OverlayStore, OR add to ${ALLOWLIST_REL}\n` +
      `   Prefer stable form: path::needle (substring on the setItem line).\n` +
      (VERBOSE ? '' : `   Allowlisted sites: omit from log; pass --verbose to list them.\n`),
  );
  process.exit(1);
}

if (!VERBOSE && warnings > 0 && baseline !== null && warnings === baseline) {
  process.stdout.write(`✅ lint passed (${hits.length} sites scanned)\n`);
} else if (VERBOSE) {
  process.stdout.write(`✅ lint passed (${hits.length} sites, ${warnings} existing warnings)\n`);
} else {
  process.stdout.write(`✅ lint passed (${hits.length} sites scanned)\n`);
}
process.exit(0);
