#!/usr/bin/env node
/**
 * Task 32 — find/remove redundant declarations in 200-dark-and-effects.css:
 * base rule (same selector, no dark theme prefix) already paints property with var(--v4-*).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_DIR = path.join(ROOT, 'apps/web/styles/modules');
const DARK_FILE = path.join(CSS_DIR, '200-dark-and-effects.css');
const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const COLOR_PROPS = new Set([
  'color',
  'background',
  'background-color',
  'background-image',
  'border-color',
  'border-top-color',
  'border-bottom-color',
  'border-left-color',
  'border-right-color',
  'outline-color',
  'fill',
  'stroke',
  'box-shadow',
  'text-decoration-color',
  'caret-color',
  'accent-color',
  'column-rule-color',
  'border',
  'border-top',
  'border-bottom',
  'border-left',
  'border-right',
]);

const V4_ROLE_RE = /var\(\s*--v4-[^,\s)]+/i;

function rules(text) {
  const out = [];
  let depth = 0;
  let selStart = 0;
  let bodyStart = -1;
  let line = 1;
  const lineAt = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
    lineAt[i] = line;
  }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') {
      depth += 1;
      if (depth === 1) bodyStart = i + 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && bodyStart >= 0) {
        out.push({
          selector: text.slice(selStart, bodyStart - 1).trim(),
          body: text.slice(bodyStart, i),
          line: lineAt[bodyStart] || 0,
          endLine: lineAt[i] || 0,
        });
        selStart = i + 1;
        bodyStart = -1;
      }
    }
  }
  return out;
}

function parseDeclarations(body, ruleLine) {
  const decls = [];
  const lines = body.split('\n');
  let lineNo = ruleLine;
  for (const line of lines) {
    const dm = line.match(/^\s*([a-z-]+)\s*:/i);
    if (dm) {
      const prop = dm[1].toLowerCase();
      const value = line
        .slice(line.indexOf(':') + 1)
        .trim()
        .replace(/;\s*$/, '')
        .replace(/\s*!important$/i, '');
      decls.push({ prop, value, line: lineNo, raw: line });
    }
    lineNo += 1;
  }
  return decls;
}

function isDarkSelector(sel) {
  return /\[data-theme[^\]]*dark/i.test(sel);
}

function stripDarkPrefix(part) {
  return part
    .replace(/^\[data-theme\$="dark"\]\s*/i, '')
    .replace(/^\[data-theme="[^"]*-dark"\]\s*/i, '')
    .replace(/^html\[data-theme-id="[^"]*-dark"\]\s*/i, '')
    .replace(/^\[data-theme-id="[^"]*-dark"\]\s*/i, '')
    .trim();
}

function baseSelectorsFromDark(selector) {
  const parts = selector.split(',').map((p) => p.trim());
  const bases = [];
  for (const part of parts) {
    if (!isDarkSelector(part)) continue;
    const base = stripDarkPrefix(part);
    if (base === '' || base === '&') {
      bases.push(':root');
      bases.push('html');
    } else {
      bases.push(base);
    }
  }
  return [...new Set(bases)];
}

function isColorDecl(prop, value) {
  if (COLOR_PROPS.has(prop)) return true;
  if (prop.startsWith('--')) {
    const v = value.toLowerCase();
    return (
      V4_ROLE_RE.test(v) ||
      /^#[0-9a-f]{3,8}$/i.test(v) ||
      /^rgba?\(/i.test(v) ||
      /^hsla?\(/i.test(v) ||
      /gradient/i.test(v) ||
      /^var\(--(color|bg|text|border|acc|muted|card|stats|activity|sleep|heys-)/.test(v)
    );
  }
  return false;
}

function usesV4Role(value) {
  return V4_ROLE_RE.test(value);
}

/** @type {Map<string, Array<{prop:string,value:string,file:string,line:number}>>} */
const baseIndex = new Map();

function indexKey(selector, prop) {
  return `${selector}\0${prop}`;
}

function indexFile(relPath, text) {
  const file = path.basename(relPath);
  if (file === '200-dark-and-effects.css') return;
  for (const rule of rules(text)) {
    if (isDarkSelector(rule.selector)) continue;
    if (rule.selector.startsWith('@')) continue;
    const sels = rule.selector.split(',').map((s) => s.trim());
    for (const sel of sels) {
      for (const decl of parseDeclarations(rule.body, rule.line)) {
        if (!isColorDecl(decl.prop, decl.value)) continue;
        const key = indexKey(sel, decl.prop);
        if (!baseIndex.has(key)) baseIndex.set(key, []);
        baseIndex.get(key).push({
          prop: decl.prop,
          value: decl.value,
          file,
          line: rule.line,
        });
      }
    }
  }
}

function findBaseV4(selector, prop) {
  const bases = baseSelectorsFromDark(selector);
  const hits = [];
  for (const base of bases) {
    const key = indexKey(base, prop);
    for (const e of baseIndex.get(key) || []) {
      if (usesV4Role(e.value)) hits.push({ ...e, baseSelector: base });
    }
  }
  return hits;
}

for (const f of fs.readdirSync(CSS_DIR).filter((x) => x.endsWith('.css'))) {
  indexFile(f, fs.readFileSync(path.join(CSS_DIR, f), 'utf8'));
}

const darkText = fs.readFileSync(DARK_FILE, 'utf8');
const allRules = rules(darkText);

/** @type {Array<object>} */
const redundant = [];

for (const rule of allRules) {
  if (!isDarkSelector(rule.selector)) continue;
  for (const decl of parseDeclarations(rule.body, rule.line)) {
    if (!isColorDecl(decl.prop, decl.value)) continue;
    const bases = findBaseV4(rule.selector, decl.prop);
    if (bases.length === 0) continue;
    redundant.push({
      selector: rule.selector,
      prop: decl.prop,
      darkValue: decl.value,
      darkLine: decl.line,
      ruleLine: rule.line,
      base: bases[0],
    });
  }
}

console.log(`Base index keys: ${baseIndex.size}`);
console.log(`Redundant dark color declarations: ${redundant.length}`);

if (VERBOSE) {
  for (const r of redundant.slice(0, 40)) {
    console.log(
      `  L${r.darkLine} ${r.prop} ← ${r.base.file}:${r.base.line}`,
    );
  }
}

if (DRY_RUN) {
  console.log('\nDry run — pass --apply to edit file');
  process.exit(0);
}

// Line-based deletion (1-indexed)
const linesToDelete = new Set(redundant.map((r) => r.darkLine));
const lines = darkText.split('\n');
const newLines = lines.filter((_, i) => !linesToDelete.has(i + 1));

// Remove empty dark rules (only comments/whitespace left inside)
function cleanupEmptyRules(text) {
  const parsed = rules(text);
  const emptyRuleLines = new Set();
  for (const rule of parsed) {
    if (!isDarkSelector(rule.selector)) continue;
    const hasDecl = /^\s*[a-z-]+\s*:/im.test(rule.body);
    if (!hasDecl) {
      for (let ln = rule.line; ln <= rule.endLine; ln += 1) {
        emptyRuleLines.add(ln);
      }
    }
  }
  if (emptyRuleLines.size === 0) return text;
  return text
    .split('\n')
    .filter((_, i) => !emptyRuleLines.has(i + 1))
    .join('\n');
}

let result = newLines.join('\n');
let prev = '';
let passes = 0;
while (result !== prev && passes < 5) {
  prev = result;
  result = cleanupEmptyRules(result);
  passes += 1;
}

result = result.replace(/\n{4,}/g, '\n\n\n');
fs.writeFileSync(DARK_FILE, result);

const logPath = path.join(ROOT, 'scripts/.task32-removals.json');
fs.writeFileSync(logPath, JSON.stringify(redundant, null, 2));

const removedDecls = linesToDelete.size;
const removedLines = lines.length - result.split('\n').length;
console.log(`\nApplied: ${removedDecls} declaration lines, ${removedLines} net lines removed`);
console.log(`Lines: ${lines.length} → ${result.split('\n').length}`);
console.log(`Log: ${logPath}`);
