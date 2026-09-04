#!/usr/bin/env node
/**
 * Task 32 — find/remove redundant declarations in 200-dark-and-effects.css:
 * base rule (same selector, no dark theme prefix) already paints property with var(--v4-*).
 *
 * Dry-run by default. Pass --apply to write. Never touches shadow/transform/filter.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_DIR = path.join(ROOT, 'apps/web/styles/modules');
const DARK_FILE = path.join(CSS_DIR, '200-dark-and-effects.css');
const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

/** Never remove — theme-specific effects, not palette roles */
const NEVER_TOUCH_PROPS = new Set([
  'box-shadow',
  'text-shadow',
  'filter',
  'transform',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  '-webkit-filter',
  '-webkit-transform',
]);

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

/** Strip block and line comments, then count braces */
export function braceBalance(text) {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const open = (stripped.match(/{/g) || []).length;
  const close = (stripped.match(/}/g) || []).length;
  return { open, close, balanced: open === close };
}

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
  if (NEVER_TOUCH_PROPS.has(prop)) return false;
  if (COLOR_PROPS.has(prop)) return true;
  if (prop.startsWith('--')) {
    const v = value.toLowerCase();
    return (
      V4_ROLE_RE.test(v) ||
      /^#[0-9a-f]{3,8}$/i.test(v) ||
      /^rgba?\(/i.test(v) ||
      /^hsla?\(/i.test(v) ||
      /gradient/i.test(v) ||
      /^var\(--(color|bg|text|border|acc|muted|card|stats|activity|sleep|heys-)/.test(
        v,
      )
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

function collectRedundant(darkRoot) {
  /** @type {Array<object>} */
  const redundant = [];

  darkRoot.walkRules((rule) => {
    if (!isDarkSelector(rule.selector)) return;
    rule.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (NEVER_TOUCH_PROPS.has(prop)) return;
      if (!isColorDecl(prop, decl.value)) return;
      const bases = findBaseV4(rule.selector, prop);
      if (bases.length === 0) return;
      const roleMatch = decl.value.match(V4_ROLE_RE);
      redundant.push({
        selector: rule.selector,
        prop,
        darkValue: decl.value,
        darkLine: decl.source?.start?.line ?? 0,
        base: bases[0],
        role: roleMatch ? roleMatch[0] : 'var(--v4-*)',
      });
    });
  });

  return redundant;
}

function applyRemovals(darkText, redundantKeys) {
  const root = postcss.parse(darkText, { from: DARK_FILE });
  const keySet = new Set(
    redundantKeys.map((r) => `${r.selector}\0${r.prop}\0${r.darkLine}`),
  );

  root.walkRules((rule) => {
    if (!isDarkSelector(rule.selector)) return;
    const toRemove = [];
    rule.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      const line = decl.source?.start?.line ?? 0;
      const key = `${rule.selector}\0${prop}\0${line}`;
      if (keySet.has(key)) toRemove.push(decl);
    });
    for (const decl of toRemove) decl.remove();
  });

  root.walkRules((rule) => {
    if (!isDarkSelector(rule.selector)) return;
    const hasDecl = rule.nodes?.some((n) => n.type === 'decl') ?? false;
    if (!hasDecl) rule.remove();
  });

  let result = root.toString();
  result = result.replace(/\n{4,}/g, '\n\n\n');
  if (!result.endsWith('\n')) result += '\n';
  return result;
}

function groupRemovalsForCommit(redundant) {
  /** @type {Map<string, {role:string,prop:string,selectors:Set<string>,count:number}>} */
  const groups = new Map();
  for (const r of redundant) {
    const role = r.role || 'var(--v4-*)';
    const gk = `${r.base.file}:${r.base.line}\0${role}\0${r.prop}`;
    if (!groups.has(gk)) {
      groups.set(gk, {
        role,
        prop: r.prop,
        baseFile: r.base.file,
        baseLine: r.base.line,
        baseSelector: r.base.baseSelector,
        selectors: new Set(),
        count: 0,
      });
    }
    const g = groups.get(gk);
    g.selectors.add(r.selector.split(',')[0].trim().slice(0, 80));
    g.count += 1;
  }
  return [...groups.values()].sort(
    (a, b) => a.baseFile.localeCompare(b.baseFile) || a.baseLine - b.baseLine,
  );
}

function formatCommitBody(redundant, removedRules) {
  const lines = [
    `Removed ${redundant.length} redundant dark color declaration(s)${removedRules > 0 ? ` and ${removedRules} empty rule block(s)` : ''}.`,
    'Roles flip via palette (.pal.dk / .pal.bldk); dark file keeps theme-specific effects only.',
    '',
  ];
  for (const g of groupRemovalsForCommit(redundant)) {
    const selSample = [...g.selectors].slice(0, 2).join(', ');
    const more =
      g.selectors.size > 2 ? ` (+${g.selectors.size - 2} selectors)` : '';
    lines.push(
      `${g.baseFile}:${g.baseLine} ${g.role}: ${g.baseSelector} ${g.prop} (${g.count}× dark override; e.g. ${selSample}${more})`,
    );
  }
  return lines.join('\n');
}

// --- index base rules from sibling CSS modules ---
for (const f of fs.readdirSync(CSS_DIR).filter((x) => x.endsWith('.css'))) {
  indexFile(f, fs.readFileSync(path.join(CSS_DIR, f), 'utf8'));
}

const darkText = fs.readFileSync(DARK_FILE, 'utf8');
const beforeBalance = braceBalance(darkText);
const darkRoot = postcss.parse(darkText, { from: DARK_FILE });
const redundant = collectRedundant(darkRoot);

const rulesBefore = darkRoot.nodes.filter((n) => n.type === 'rule').length;
const simulated = applyRemovals(darkText, redundant);
const afterBalance = braceBalance(simulated);
const simRoot = postcss.parse(simulated, { from: DARK_FILE });
const rulesAfter = simRoot.nodes.filter((n) => n.type === 'rule').length;
const removedRules = rulesBefore - rulesAfter;

console.log(`Base index keys: ${baseIndex.size}`);
console.log(`Redundant dark color declarations: ${redundant.length}`);
console.log(
  `Bracket balance before: open=${beforeBalance.open} close=${beforeBalance.close} ${beforeBalance.balanced ? 'OK' : 'BROKEN'}`,
);
console.log(
  `Bracket balance after (simulated): open=${afterBalance.open} close=${afterBalance.close} ${afterBalance.balanced ? 'OK' : 'BROKEN'}`,
);
console.log(`Dark rules before/after (simulated): ${rulesBefore} → ${rulesAfter}`);

if (!beforeBalance.balanced) {
  console.error('ERROR: input file has unbalanced braces');
  process.exit(1);
}
if (!afterBalance.balanced) {
  console.error('ERROR: simulated output would break brace balance — aborting');
  process.exit(1);
}

if (VERBOSE) {
  for (const r of redundant.slice(0, 40)) {
    console.log(
      `  L${r.darkLine} ${r.prop} ← ${r.base.file}:${r.base.line} ${r.role}`,
    );
  }
}

if (DRY_RUN) {
  console.log('\nDry run — pass --apply to edit file');
  process.exit(0);
}

// Verify postcss can parse simulated output
try {
  postcss.parse(simulated, { from: DARK_FILE });
} catch (err) {
  console.error('ERROR: simulated CSS fails postcss parse:', err.message);
  process.exit(1);
}

fs.writeFileSync(DARK_FILE, simulated);

const logPath = path.join(ROOT, 'scripts/.task32-removals.json');
fs.writeFileSync(logPath, JSON.stringify(redundant, null, 2));

const commitBodyPath = path.join(ROOT, 'scripts/.task32-commit-body.txt');
fs.writeFileSync(commitBodyPath, formatCommitBody(redundant, removedRules));

const linesBefore = darkText.split('\n').length;
const linesAfter = simulated.split('\n').length;
console.log(`\nApplied: ${redundant.length} declarations, ${removedRules} empty rules`);
console.log(`Lines: ${linesBefore} → ${linesAfter} (${linesBefore - linesAfter} removed)`);
console.log(`Log: ${logPath}`);
console.log(`Commit body: ${commitBodyPath}`);
