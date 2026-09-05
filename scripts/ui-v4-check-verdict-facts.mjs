#!/usr/bin/env node
/**
 * Проверяет, что факты в поле `f` у вердиктов «=» ещё находятся в коде.
 *
 * Отличие от ui-v4-check-verdict-addresses: только «=», соседство вокруг адреса,
 * сдвиг строки сам по себе не считается протуханием — ищем якорь в окне, потом
 * во всём файле.
 *
 *   node scripts/ui-v4-check-verdict-facts.mjs [--json] [--audit] [--zone=<id>]
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const WINDOW = 60;
const EXT = '(?:js|mjs|ts|tsx|css|html|sql|svg|json)';
const ADDRESS = new RegExp(`([A-Za-z0-9_][A-Za-z0-9_./-]*\\.${EXT}):(\\d+)(?:-(\\d+))?`, 'g');
// Сокращение из вердиктов: «730:12552» → apps/web/styles/modules/730-*.css (только однозначный префикс).
const SHORT_MODULE_REF = /\b(\d{3}):(\d{3,5})(?:-(\d{3,5}))?\b/g;
const MODULES_DIR = path.join(REPO_ROOT, 'apps/web/styles/modules');

const CLASS_SELECTOR = /\.[a-z][a-z0-9_-]{2,}/gi;
const CSS_VAR = /--[a-z][a-z0-9-]{2,}/gi;
const NAME = /(--|\.)?[A-Za-z_$][A-Za-z0-9_$-]{3,}/g;

const NOT_A_NAME = new Set([
  'px', 'css', 'js', 'mjs', 'html', 'json', 'rgba', 'true', 'false', 'null',
  'flex', 'grid', 'auto', 'none', 'span', 'div', 'left', 'right', 'top',
  'bottom', 'gap', 'min', 'max', 'width', 'height', 'color', 'font',
  'inset', 'blur', 'clamp', 'calc', 'var', 'data', 'test', 'spec', 'todo',
  'sand', 'blue', 'dark', 'light', 'good', 'text', 'fill', 'line', 'card',
  'space-between', 'space-around', 'flex-start', 'flex-end', 'center',
  'absolute', 'relative', 'sticky', 'fixed', 'hidden', 'block', 'inline',
  'border-box', 'nowrap', 'wrap', 'ellipsis', 'currentcolor', 'inherit',
  'apps', 'styles', 'modules', 'scripts', 'public', 'tests', '__tests__',
  'Android', 'iPhone', 'HEYS',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'public', 'dist', 'build', 'coverage', 'tmp',
  '.next', '.turbo', 'TOOLS', 'security-reports',
]);

function looksLikeIdentifier(token) {
  if (token.startsWith('.') || token.startsWith('--')) return true;
  if (token.includes('_')) return true;
  if (/[a-z][A-Z]/.test(token)) return true;
  return false;
}

const byBasename = new Map();
(function indexTree(dir, depth) {
  if (depth > 8) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.husky') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const keepPublic = e.name === 'public' && /[/\\]apps[/\\]web$/.test(dir);
      if (SKIP_DIRS.has(e.name) && !keepPublic) continue;
      indexTree(full, depth + 1);
      continue;
    }
    if (!/\.(js|mjs|ts|tsx|css|html|sql|svg|json)$/.test(e.name)) continue;
    if (!byBasename.has(e.name)) byBasename.set(e.name, []);
    byBasename.get(e.name).push(full.split(path.sep).join('/'));
  }
})('.', 0);

const byModulePrefix = new Map();
(function indexModulePrefixes() {
  let entries;
  try {
    entries = fs.readdirSync(MODULES_DIR);
  } catch {
    return;
  }
  for (const name of entries) {
    const m = /^(\d{3})-/.exec(name);
    if (!m) continue;
    if (!byModulePrefix.has(m[1])) byModulePrefix.set(m[1], []);
    byModulePrefix.get(m[1]).push(name);
  }
})();

function resolveModulePrefix(prefix) {
  const files = byModulePrefix.get(prefix);
  if (!files || files.length !== 1) return null;
  return `apps/web/styles/modules/${files[0]}`;
}

const fileCache = new Map();
const EXT_TOKEN = new Set(['js', 'mjs', 'ts', 'tsx', 'css', 'html', 'sql', 'svg', 'json']);

const PRODUCT_HINTS = (basename) => [
  `apps/web/public/${basename}`,
  `apps/web/styles/modules/${basename}`,
  `apps/web/${basename}`,
  `apps/landing/public/${basename}`,
];

function resolveFile(rel) {
  if (fileCache.has(rel)) return fileCache.get(rel);
  let found = null;
  const norm = rel.split(path.sep).join('/');
  if (fs.existsSync(norm) && fs.statSync(norm).isFile()) found = norm;
  if (!found && norm.startsWith('public/')) {
    const candidate = `apps/web/${norm}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) found = candidate;
  }
  if (!found && !norm.includes('/')) {
    for (const candidate of PRODUCT_HINTS(path.basename(norm))) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        found = candidate;
        break;
      }
    }
  }
  if (!found) {
    let candidates = byBasename.get(path.basename(norm)) || [];
    if (!candidates.length) {
      const stem = path.basename(norm).replace(/\.[a-z]+$/i, '');
      const ext = path.extname(norm);
      for (const [name, paths] of byBasename) {
        if (path.extname(name) !== ext) continue;
        if (!name.includes(stem)) continue;
        candidates = candidates.concat(paths);
      }
    }
    const rank = (c) => {
      if (norm.includes('/') && c.endsWith(norm)) return 0;
      if (c.startsWith('apps/web/public/')) return 1;
      if (/^apps\/web\/[^/]+$/.test(c)) return 2;
      if (c.startsWith('apps/web/styles/')) return 3;
      if (c.startsWith('apps/web/')) return 4;
      if (c.includes('/migrations/manifest.json')) return 9;
      if (/__tests__|TESTS|bundle|genda|hobby/i.test(c)) return 9;
      return 6;
    };
    found = candidates.slice().sort((a, b) => rank(a) - rank(b) || a.length - b.length)[0] || null;
  }
  fileCache.set(rel, found);
  return found;
}

const textCache = new Map();
function linesOf(file) {
  if (!textCache.has(file)) {
    textCache.set(file, fs.readFileSync(file, 'utf8').split(/\r?\n/));
  }
  return textCache.get(file);
}

function stripAddresses(evidence) {
  return String(evidence || '')
    .replace(ADDRESS, ' ')
    .replace(SHORT_MODULE_REF, ' ');
}

function extractAnchors(evidence, mentionedFiles) {
  const stripped = stripAddresses(evidence);
  const anchors = new Set();
  for (const m of stripped.matchAll(CLASS_SELECTOR)) anchors.add(m[0].slice(1));
  for (const m of stripped.matchAll(CSS_VAR)) anchors.add(m[0]);
  for (const m of stripped.matchAll(NAME)) {
    const token = m[0].replace(/-$/, '');
    if (token.startsWith('.') && EXT_TOKEN.has(token.slice(1).toLowerCase())) continue;
    if (!looksLikeIdentifier(token)) continue;
    const bare = token.replace(/^(--|\.)/, '');
    if (NOT_A_NAME.has(bare.toLowerCase())) continue;
    if (/^(js|css|html|sql|mjs|ts|tsx|svg|json)$/i.test(bare)) continue;
    if (mentionedFiles.some((f) => f.includes(bare))) continue;
    anchors.add(token.startsWith('--') ? token : bare);
  }
  return [...anchors];
}

function parseAddresses(evidence) {
  const list = [];
  const seen = new Set();
  for (const m of evidence.matchAll(ADDRESS)) {
    const rel = m[1];
    const line = Number(m[2]);
    const key = `${rel}\u0000${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      rel,
      line,
      endLine: m[3] ? Number(m[3]) : null,
      index: m.index,
    });
  }
  for (const m of evidence.matchAll(SHORT_MODULE_REF)) {
    const rel = resolveModulePrefix(m[1]);
    if (!rel) continue;
    const line = Number(m[2]);
    const key = `${rel}\u0000${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      rel,
      line,
      endLine: m[3] ? Number(m[3]) : null,
      index: m.index,
    });
  }
  return list;
}

function anchorPresent(lines, line, anchors) {
  if (!anchors.length) return true;
  const whole = lines.join('\n');
  const present = anchors.filter((a) => {
    const bare = a.replace(/^(--|\.)/, '');
    return whole.includes(a) || whole.includes(bare);
  });
  if (!present.length) return false;
  const center = Math.min(Math.max(1, line), lines.length);
  const from = Math.max(0, center - 1 - WINDOW);
  const to = Math.min(lines.length, center - 1 + WINDOW);
  const slice = lines.slice(from, to).join('\n');
  return present.some((a) => {
    const bare = a.replace(/^(--|\.)/, '');
    return slice.includes(a) || slice.includes(bare);
  }) || present.some((a) => whole.includes(a.replace(/^(--|\.)/, '')));
}

/**
 * @param {ReturnType<typeof readAllZones>} data
 * @param {Set<string>|null} zoneFilter
 */
export function inspectVerdictFacts(data, zoneFilter = null) {
  const stale = [];
  let equalsRows = 0;
  let parsedRows = 0;
  let unparsedRows = 0;
  let factsChecked = 0;
  let anchorsChecked = 0;

  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneFilter && !zoneFilter.has(zoneId)) continue;
    for (const [key, row] of Object.entries(zone?.rows || {})) {
      if (row?.v !== '=') continue;
      equalsRows += 1;
      const evidence = String(row?.f || '').trim();
      if (!evidence) {
        unparsedRows += 1;
        continue;
      }

      const addresses = parseAddresses(evidence);
      if (!addresses.length) {
        unparsedRows += 1;
        continue;
      }
      parsedRows += 1;

      const mentionedFiles = [
        ...new Set(
          [...evidence.matchAll(new RegExp(`[A-Za-z0-9_][A-Za-z0-9_./-]*\\.${EXT}`, 'g'))].map((m) => m[0]),
        ),
      ];
      const singleAddress = mentionedFiles.length === 1;
      const anchors = singleAddress ? extractAnchors(evidence, mentionedFiles) : [];

      for (const addr of addresses) {
        if (addr.rel.includes('...')) continue;
        factsChecked += 1;

        const resolved = resolveFile(addr.rel);
        if (!resolved) {
          stale.push({
            kind: 'missing',
            zoneId,
            key,
            rel: addr.rel,
            line: addr.line,
          });
          continue;
        }

        if (!singleAddress || !anchors.length) continue;

        anchorsChecked += 1;
        const lines = linesOf(resolved);
        if (!anchorPresent(lines, addr.line, anchors)) {
          stale.push({
            kind: 'absent',
            zoneId,
            key,
            rel: resolved,
            line: addr.line,
            anchors: anchors.slice(0, 4),
          });
        }
      }
    }
  }

  const staleCount = stale.length;
  const digest = crypto
    .createHash('sha256')
    .update(
      stale
        .map((item) => `${item.kind}\u0000${item.zoneId}\u0000${item.key}\u0000${item.rel}\u0000${item.line}`)
        .sort()
        .join('\n'),
    )
    .digest('hex')
    .slice(0, 16);

  const parseRate = equalsRows ? Math.round((parsedRows / equalsRows) * 1000) / 10 : 100;

  return {
    equalsRows,
    parsedRows,
    unparsedRows,
    parseRate,
    factsChecked,
    anchorsChecked,
    staleCount,
    staleDigest: digest,
    stale,
  };
}

function runCli() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const audit = args.includes('--audit');
  const zoneOnly = (args.find((a) => a.startsWith('--zone=')) || '').slice(7);
  const zoneFilter = zoneOnly ? new Set([zoneOnly]) : null;

  const report = inspectVerdictFacts(readAllZones(), zoneFilter);

  if (asJson || audit) {
    process.stdout.write(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    `Факты «=»: ${report.equalsRows} строк, разобрано ${report.parsedRows} (${report.parseRate}%), ` +
      `остаток без file:line: ${report.unparsedRows}.`,
  );
  console.log(
    `Проверено ссылок ${report.factsChecked}, якорей ${report.anchorsChecked}; ` +
      `протухло ${report.staleCount} (digest ${report.staleDigest}).`,
  );

  if (report.stale.length) {
    console.log('\nПротухшие факты:');
    for (const item of report.stale.slice(0, 12)) {
      const anchor = item.anchors ? ` · ${item.anchors.join(', ')}` : '';
      console.log(`  ${item.kind} · ${item.zoneId} · ${item.rel}:${item.line}${anchor} · «${item.key}»`);
    }
    if (report.stale.length > 12) console.log(`  … ещё ${report.stale.length - 12}`);
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) runCli();
