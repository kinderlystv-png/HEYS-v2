#!/usr/bin/env node
/**
 * Polosa 5 — curator-edits: shorthand и .ca-modal* → parseable file:line в поле f.
 *
 *   node scripts/ui-v4-fix-curator-edits-fact-addresses.mjs          # dry-run
 *   node scripts/ui-v4-fix-curator-edits-fact-addresses.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { inspectVerdictFacts } from './ui-v4-check-verdict-facts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZONE = 'curator-edits';
const CSS_FILE = '500-pwa-and-offline.css';
const CSS_PATH = path.join(ROOT, 'apps/web/styles/modules', CSS_FILE);
const BANNER_FILE = 'heys_curator_actions_banner_v1.js';
const SHELL_FILE = 'heys_app_shell_v1.js';
const PALETTE_FILE = '002-ui-v4-palette-roles.css';

const SHORTHAND_REPLACEMENTS = [
  ['banner:', `${BANNER_FILE}:`],
  ['css:', `${CSS_FILE}:`],
  ['500-pwa:', `${CSS_FILE}:`],
  ['app_shell:', `${SHELL_FILE}:`],
  ['002-ui-v4-palette-roles:', `${PALETTE_FILE}:`],
];

const cssLines = fs.readFileSync(CSS_PATH, 'utf8').split(/\r?\n/);
const selectorLineCache = new Map();

function findSelectorLine(selector) {
  if (selectorLineCache.has(selector)) return selectorLineCache.get(selector);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*[,{]`);
  let line = null;
  for (let i = 0; i < cssLines.length; i++) {
    if (re.test(cssLines[i])) {
      line = i + 1;
      break;
    }
  }
  selectorLineCache.set(selector, line);
  return line;
}

function expandShorthands(f) {
  let out = f;
  for (const [from, to] of SHORTHAND_REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  // 500-pwa:.selector → file:line .selector
  out = out.replace(
    new RegExp(`${CSS_FILE.replace('.', '\\.')}:([.]\\S+)`, 'g'),
    (_, sel) => {
      const line = findSelectorLine(sel);
      return line ? `${CSS_FILE}:${line} ${sel}` : `${CSS_FILE}:${sel}`;
    },
  );
  return out;
}

function prependClassAddress(f) {
  const classes = [...f.matchAll(/\.[a-z][a-z0-9_-]{2,}/gi)].map((m) => m[0]);
  if (!classes.length) return f;
  const primary = classes[0];
  const line = findSelectorLine(primary);
  if (!line) return f;
  if (f.includes(`${CSS_FILE}:${line}`)) return f;
  return `${CSS_FILE}:${line} — ${f}`;
}

function improveFact(f) {
  let next = expandShorthands(String(f || '').trim());
  const EXT = '(?:js|mjs|ts|tsx|css|html|sql|svg|json)';
  const hasAddress = new RegExp(`\\.${EXT}:\\d+`).test(next) || /\b\d{3}:\d{3,5}\b/.test(next);
  if (!hasAddress) next = prependClassAddress(next);
  return next;
}

const apply = process.argv.includes('--apply');
const zone = readZone(ZONE);
const before = inspectVerdictFacts({ zones: { [ZONE]: JSON.parse(JSON.stringify(zone)) } }, new Set([ZONE]));

const planned = [];
for (const [key, row] of Object.entries(zone.rows)) {
  if (row?.v !== '=') continue;
  const prev = String(row.f || '');
  const next = improveFact(prev);
  if (next !== prev) planned.push({ key, next });
}

const touchedKeys = planned.map((p) => p.key);
const foreignBefore = snapshotForeignRowStrings(zone.rows, new Set(touchedKeys));

if (apply) {
  for (const { key, next } of planned) zone.rows[key].f = next;
}

const afterZone = apply ? zone : (() => {
  const clone = JSON.parse(JSON.stringify(zone));
  for (const key of touchedKeys) clone.rows[key].f = improveFact(clone.rows[key].f);
  return clone;
})();

const after = inspectVerdictFacts({ zones: { [ZONE]: afterZone } }, new Set([ZONE]));

console.log(`zone ${ZONE}: ${touchedKeys.length} rows would change f`);
console.log(`parsed ${before.parsedRows} → ${after.parsedRows}; unparsed ${before.unparsedRows} → ${after.unparsedRows}`);

if (apply) {
  assertForeignRowsUnchanged(foreignBefore, zone.rows);
  writeZone(ZONE, zone);
  console.log(`applied ${touchedKeys.length} fact addresses`);
} else {
  console.log('dry-run — pass --apply to write');
  for (const key of touchedKeys.slice(0, 8)) {
    console.log(`  ${key}`);
  }
  if (touchedKeys.length > 8) console.log(`  … ещё ${touchedKeys.length - 8}`);
}
