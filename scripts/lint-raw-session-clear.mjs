#!/usr/bin/env node
/**
 * lint-raw-session-clear.mjs
 *
 * Anti-pollution guard (incident #11, 2026-06-02): после введения drop fence
 * (`sessionStorage.setItem('heys_drop_fence_<scopedKey>', ts)`) любой raw
 * `sessionStorage.clear()` снимает фенс и переоткрывает re-pollution race.
 *
 * Правило: использовать helper `clearSessionStoragePreservingDropFences()`
 * (см. apps/web/heys_platform_apis_v1.js L83) или inline preserve-pattern
 * (loop по `heys_drop_fence_*` → clear → restore).
 *
 * Allowlisted сайты: account-deletion flow, helper itself, recovery
 * inline-preserve fallback (clear только когда preserve loop сам упал).
 * См. scripts/raw-session-clear-allowlist.txt
 *
 * Совместимо с `--auto-fix` для line-drift (см. lint-direct-localstorage-writes).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ALLOWLIST_REL = 'scripts/raw-session-clear-allowlist.txt';
const ALLOWLIST_FILE = resolve(ROOT, ALLOWLIST_REL);
const STRICT = process.argv.includes('--strict');
const AUTO_FIX = process.argv.includes('--auto-fix');
const REF = getCliOption('--ref');
const PATTERN = /sessionStorage\.clear\s*\(\s*\)/;

const EXCLUDED_FILES = new Set([
  // Generated bundles
  'heys_advice_bundle_v1.js',
  'heys_day_bundle_v1.js',
  'heys_day_meals_bundle_v1.js',
]);

const SCAN_TARGETS = [
  { dir: 'apps/web',          match: (f) => f.startsWith('heys_') && f.endsWith('.js') && !EXCLUDED_FILES.has(f) },
  { dir: 'apps/web/advice',   match: (f) => f.endsWith('.js') },
  { dir: 'apps/web/insights', match: (f) => f.endsWith('.js') },
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

function listScanFiles() {
  const relFiles = [];
  for (const { dir, match } of SCAN_TARGETS) {
    let files;
    try { files = listDir(dir); } catch (_) { continue; }
    for (const file of files) {
      if (match(file)) relFiles.push(`${dir}/${file}`);
    }
  }
  return relFiles;
}

function grepRefMatches(relFiles) {
  if (!relFiles.length) return [];
  let output = '';
  try {
    output = execFileSync(
      'git',
      ['grep', '-n', '-E', 'sessionStorage\\.clear[[:space:]]*\\([[:space:]]*\\)', REF, '--', ...relFiles],
      {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
  return output.split(/\r?\n/).filter(Boolean);
}

const allowlist = new Set();
try {
  for (const line of readText(ALLOWLIST_REL).split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#')) allowlist.add(t);
  }
} catch {
  process.stderr.write(`[WARN]  Allowlist not found: ${ALLOWLIST_FILE}\n`);
}

const hits = [];
if (REF) {
  for (const line of grepRefMatches(listScanFiles())) {
    const match = /^(?:[^:]+:)?([^:]+):(\d+):(.*)$/.exec(line);
    if (!match) continue;
    const ref = `${match[1]}:${match[2]}`;
    hits.push({ ref, listed: allowlist.has(ref), snippet: match[3].trim().slice(0, 120) });
  }
} else {
  for (const { dir, match } of SCAN_TARGETS) {
    let files;
    try { files = listDir(dir); } catch (_) { continue; }
    for (const file of files) {
      if (!match(file)) continue;
      const relPath = `${dir}/${file}`;
      let content;
      try { content = readText(relPath); } catch (_) { continue; }
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (PATTERN.test(lines[i])) {
          const ref = `${relPath}:${i + 1}`;
          hits.push({ ref, listed: allowlist.has(ref), snippet: lines[i].trim().slice(0, 120) });
        }
      }
    }
  }
}

if (AUTO_FIX && !REF) {
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

  let allowlistText = existsSync(ALLOWLIST_FILE) ? readFileSync(ALLOWLIST_FILE, 'utf8') : '';
  const bumped = [];

  for (const [file, hitLines] of hitsByFile) {
    const allowLines = allowlistByFile.get(file) || [];
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
    process.stdout.write(`\n🔧 Auto-bumped ${bumped.length} allowlist entr(ies):\n`);
    bumped.forEach((b) => process.stdout.write(`   ${b}\n`));
    allowlist.clear();
    for (const line of allowlistText.split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) allowlist.add(t);
    }
    for (const hit of hits) hit.listed = allowlist.has(hit.ref);
  }
}

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
process.stdout.write(`\nraw sessionStorage.clear() lint (${label}): ${warnings} warnings, ${errors} violations\n`);

if (errors > 0) {
  process.stderr.write(
    `\n❌ ${errors} raw sessionStorage.clear() call(s) not in allowlist.\n` +
    `   Drop fences (heys_drop_fence_*) MUST survive sessionStorage clears.\n` +
    `   Use clearSessionStoragePreservingDropFences() or inline preserve-pattern.\n` +
    `   If the clear is intentional (account deletion etc), add to:\n` +
    `   scripts/raw-session-clear-allowlist.txt\n`,
  );
  process.exit(1);
}

process.stdout.write(`✅ lint passed (${hits.length} sites, ${warnings} existing warnings)\n`);
process.exit(0);
