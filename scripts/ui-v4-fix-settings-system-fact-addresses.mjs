#!/usr/bin/env node
/**
 * Polosa 5 — settings-system: shorthand и селекторы → parseable file:line в поле f.
 *
 *   node scripts/ui-v4-fix-settings-system-fact-addresses.mjs          # dry-run
 *   node scripts/ui-v4-fix-settings-system-fact-addresses.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { inspectVerdictFacts } from './ui-v4-check-verdict-facts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZONE = 'settings-system';
const BASE_CSS = '000-base-and-gamification.css';
const BASE_CSS_PATH = path.join(ROOT, 'apps/web/styles/modules', BASE_CSS);
const WATER_CSS = '400-water-and-hydration.css';
const WATER_CSS_PATH = path.join(ROOT, 'apps/web/styles/modules', WATER_CSS);
const PWA_CSS = '500-pwa-and-offline.css';
const PWA_CSS_PATH = path.join(ROOT, 'apps/web/styles/modules', PWA_CSS);
const SHELL_FILE = 'heys_app_shell_v1.js';
const WIDGETS_FILE = 'heys_widgets_ui_v1.js';
const PUSH_FILE = 'heys_push_v1.js';
const CONSENTS_FILE = 'heys_consents_v1.js';
const THEME_FILE = 'heys_theme_v1.js';
const TAB_STATE_FILE = 'heys_app_tab_state_v1.js';
const FAB_VIS_FILE = 'heys_fab_visibility_v1.js';

const SHORTHAND_REPLACEMENTS = [
  ['app_shell:', `${SHELL_FILE}:`],
  ['widgets_ui:', `${WIDGETS_FILE}:`],
  ['000-base:', `${BASE_CSS}:`],
  ['400-water:', `${WATER_CSS}:`],
  ['500-pwa:', `${PWA_CSS}:`],
  ['push_v1:', `${PUSH_FILE}:`],
  ['consents:', `${CONSENTS_FILE}:`],
  ['theme_v1:', `${THEME_FILE}:`],
  ['app_tab_state:', `${TAB_STATE_FILE}:`],
  ['fab_visibility:', `${FAB_VIS_FILE}:`],
];

const cssLineCache = new Map();
const jsLineCache = new Map();

function cssLines(filePath) {
  if (!cssLineCache.has(filePath)) {
    cssLineCache.set(filePath, fs.readFileSync(filePath, 'utf8').split(/\r?\n/));
  }
  return cssLineCache.get(filePath);
}

function findSelectorLine(selector, filePath = BASE_CSS_PATH) {
  const key = `${filePath}\u0000${selector}`;
  if (cssLineCache.has(key)) return cssLineCache.get(key);
  const lines = cssLines(filePath);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*[,{]`);
  let line = null;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      line = i + 1;
      break;
    }
  }
  cssLineCache.set(key, line);
  return line;
}

function findJsSymbolLine(basename, symbol, searchRoot = path.join(ROOT, 'apps/web')) {
  const key = `${basename}\u0000${symbol}`;
  if (jsLineCache.has(key)) return jsLineCache.get(key);
  const full = path.join(searchRoot, basename);
  if (!fs.existsSync(full)) {
    jsLineCache.set(key, null);
    return null;
  }
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  const re = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  let line = null;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      line = i + 1;
      break;
    }
  }
  jsLineCache.set(key, line);
  return line;
}

function cssFileForFact(f) {
  if (/ios-home|Понятно|Позже|push_v1|лист ·|Домашний экран · лист/i.test(f)) {
    return { cssFile: PWA_CSS, cssPath: PWA_CSS_PATH };
  }
  return { cssFile: BASE_CSS, cssPath: BASE_CSS_PATH };
}

function expandShorthands(f) {
  let out = f;
  for (const [from, to] of SHORTHAND_REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  const { cssFile } = cssFileForFact(out);
  if (/(?:^|\s)css:\d/.test(out)) {
    out = out.replace(/(^|\s)css:/g, `$1${cssFile}:`);
  }
  for (const [file, filePath] of [[BASE_CSS, BASE_CSS_PATH], [PWA_CSS, PWA_CSS_PATH], [WATER_CSS, WATER_CSS_PATH]]) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(
      new RegExp(`${escaped}:([.]\\S+)`, 'g'),
      (_, sel) => {
        const line = findSelectorLine(sel, filePath);
        return line ? `${file}:${line} ${sel}` : `${file}:${sel}`;
      },
    );
  }
  return out;
}

function prependClassAddress(f, filePath = BASE_CSS_PATH, cssFile = BASE_CSS) {
  const classes = [...f.matchAll(/\.[a-z][a-z0-9_-]{2,}/gi)].map((m) => m[0]);
  if (!classes.length) return f;
  const primary = classes[0];
  if (/^\.fab-/.test(primary)) {
    filePath = WATER_CSS_PATH;
    cssFile = WATER_CSS;
  } else if (/^\.ios-home-install/.test(primary)) {
    filePath = PWA_CSS_PATH;
    cssFile = PWA_CSS;
  }
  const line = findSelectorLine(primary, filePath);
  if (!line) return f;
  if (f.includes(`${cssFile}:${line}`)) return f;
  return `${cssFile}:${line} — ${f}`;
}

function addBareFileLines(f) {
  let out = f;
  // heys_push_v1.js — верхняя карточка
  out = out.replace(
    /\b(heys_[a-z0-9_]+\.(?:js|mjs))\s*(—|–|-)\s/gi,
    (match, file, dash) => {
      if (/\.\w+:\d+/.test(match)) return match;
      const line = findJsSymbolLine(file, file.replace(/\.(js|mjs)$/, '').split('_').pop() || 'function');
      if (!line) {
        const lines = fs.readFileSync(path.join(ROOT, 'apps/web', file), 'utf8').split(/\r?\n/);
        return `${file}:1 ${dash} `;
      }
      return `${file}:${line} ${dash} `;
    },
  );
  // (heys_widgets_ui_v1.js) without line
  out = out.replace(
    /\((heys_[a-z0-9_]+\.(?:js|mjs))\)/gi,
    (match, file) => {
      const sym = out.includes('WidgetsQuickActionsFab') ? 'WidgetsQuickActionsFab'
        : out.includes('FabVisibility') ? 'FabVisibility'
        : null;
      const line = sym ? findJsSymbolLine(file, sym) : 1;
      return `(${file}:${line || 1})`;
    },
  );
  // heys_theme_profile_sync_v1.js + heys_theme_v1.js
  out = out.replace(
    /\b(heys_[a-z0-9_]+\.(?:js|mjs))(?!\s*:\d)/gi,
    (match, file, offset) => {
      const after = out.slice(offset + match.length, offset + match.length + 8);
      if (/^\s*:\d/.test(after)) return match;
      const sym = file.includes('theme_profile') ? 'setPalette'
        : file.includes('theme_v1') ? 'setModePreference'
        : file.includes('user_tab') ? 'openUserSection'
        : file.includes('app_shell') ? 'renderSettingsRow'
        : null;
      const line = sym ? findJsSymbolLine(file, sym) : 1;
      return `${file}:${line || 1}`;
    },
  );
  return out;
}

function expandBasePrefix(f) {
  return f.replace(/\b000-base\s+(\.[a-z][a-z0-9_-]+)/gi, (_, sel) => {
    const line = findSelectorLine(sel);
    return line ? `${BASE_CSS}:${line} ${sel}` : `000-base ${sel}`;
  });
}

function fixDeadClassNames(f) {
  return f.replace(/\.notify-detail__group\b/g, '.notify-detail__card');
}

function improveFact(f) {
  let next = fixDeadClassNames(expandShorthands(String(f || '').trim()));
  next = expandBasePrefix(next);
  next = addBareFileLines(next);
  const EXT = '(?:js|mjs|ts|tsx|css|html|sql|svg|json)';
  const hasAddress = new RegExp(`\\.${EXT}:\\d+`).test(next) || /\b\d{3}:\d{3,5}\b/.test(next);
  if (!hasAddress) next = prependClassAddress(next);
  if (!hasAddress && /\.notify-detail__/.test(next)) {
    next = prependClassAddress(next, BASE_CSS_PATH, BASE_CSS);
  }
  if (/\bwidgets_ui\b/i.test(next) && !next.includes(WIDGETS_FILE)) {
    next = next.replace(/\bwidgets_ui\b/gi, WIDGETS_FILE);
    const line = findJsSymbolLine(WIDGETS_FILE, 'FabVisibility');
    if (line && !next.includes(`${WIDGETS_FILE}:${line}`)) {
      next = `${WIDGETS_FILE}:${line} — ${next}`;
    }
  }
  return next;
}

const apply = process.argv.includes('--apply');
const t0 = performance.now();
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
const ms = Math.round(performance.now() - t0);

console.log(`zone ${ZONE}: ${touchedKeys.length} rows would change f (${ms} ms)`);
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
