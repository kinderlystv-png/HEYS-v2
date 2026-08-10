#!/usr/bin/env node
/**
 * UI v4 Stage 6 — scoped CSS paint codemod.
 * Replaces hex literals with var(--v4-role, #fallback) only when the active
 * classic palette (light or dark selector) shows the same color as the literal.
 *
 * Usage:
 *   node scripts/ui-v4-css-batch-codemod.mjs --file=apps/web/styles/modules/000-base-and-gamification.css --from-line=7079
 *   node scripts/ui-v4-css-batch-codemod.mjs --dry-run ...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PALETTE_FILE = path.join(ROOT, 'apps/web/styles/modules/002-ui-v4-palette-roles.css');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const fileArg = args.find((a) => a.startsWith('--file='));
const fromLineArg = args.find((a) => a.startsWith('--from-line='));
if (!fileArg) {
  console.error('Usage: --file=<rel-path> --from-line=<n> [--dry-run]');
  process.exit(1);
}
const relFile = fileArg.slice('--file='.length);
const fromLine = fromLineArg ? Number(fromLineArg.slice('--from-line='.length)) : 1;
const absFile = path.join(ROOT, relFile);

function readPalette(themeId) {
  const css = fs.readFileSync(PALETTE_FILE, 'utf8');
  const start = css.indexOf(`[data-theme-id="${themeId}"]`);
  if (start === -1) throw new Error(`palette ${themeId} not found`);
  const body = css.slice(start, css.indexOf('}', start));
  const out = new Map();
  for (const m of body.matchAll(/--(v4-[a-z0-9-]+):\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim().toLowerCase());
  }
  return out;
}

function expand(hex) {
  const h = hex.toLowerCase();
  if (h.length === 4) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
}

const CLASSIC = readPalette('classic');
const CLASSIC_DARK = readPalette('classic-dark');

function buildHexToRole(palette) {
  const map = new Map();
  for (const [role, value] of palette) {
    if (!value.startsWith('#')) continue;
    const norm = expand(value);
    if (!map.has(norm)) map.set(norm, role);
  }
  if (map.has('#ffffff')) map.set('#fff', map.get('#ffffff'));
  return map;
}

const LIGHT_HEX_TO_ROLE = buildHexToRole(CLASSIC);
const DARK_HEX_TO_ROLE = buildHexToRole(CLASSIC_DARK);

const SKIP_LINE_RE = [
  /linear-gradient/i,
  /radial-gradient/i,
  /repeating-linear-gradient/i,
  /conic-gradient/i,
];

const SKIP_HEX = new Set([
  '#4285f4', '#43e97b',
  '#1c1c1e', '#3a3a3c', '#8e8e93',
  '#deeddb', '#f3d7d7', '#e2ecf2', '#e8edf3',
  '#bbf7d0', '#166534',
]);

function isDarkSelector(sel) {
  return /\[data-theme[^\]]*dark/i.test(sel) || /\bdark\b/i.test(sel);
}

function selectorAt(css, index) {
  const open = css.lastIndexOf('{', index);
  if (open === -1) return '';
  const prevClose = Math.max(css.lastIndexOf('}', open), css.lastIndexOf(';', open));
  return css.slice(prevClose + 1, open).trim();
}

function shouldSkipLine(line) {
  if (SKIP_LINE_RE.some((re) => re.test(line))) return true;
  if (/^\s*--(success|protein|fat|carbs|warning)\s*:/.test(line)) return true;
  return false;
}

function replaceHexInLine(line, src, lineStartIndex) {
  if (shouldSkipLine(line)) return { line, count: 0 };

  const dark = isDarkSelector(selectorAt(src, lineStartIndex));
  const hexToRole = dark ? DARK_HEX_TO_ROLE : LIGHT_HEX_TO_ROLE;

  let count = 0;
  const out = line.replace(/#([0-9a-fA-F]{3,8})\b/g, (match, _hex, offset) => {
    const before = line.slice(0, offset);
    if (/rgba?\([^)]*$/.test(before)) return match;
    if (/var\([^)]*$/.test(before)) return match;
    if (line.includes('var(--') && line.indexOf(match) > line.indexOf('var(--')) {
      const insideVar = new RegExp(`var\\([^)]*${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      if (insideVar.test(line)) return match;
    }

    const norm = expand(match);
    if (SKIP_HEX.has(norm)) return match;
    const role = hexToRole.get(norm);
    if (!role) return match;

    count += 1;
    return `var(--${role}, ${match})`;
  });
  return { line: out, count };
}

const src = fs.readFileSync(absFile, 'utf8');
const lines = src.split('\n');
let total = 0;
let lineStart = 0;
const next = lines.map((line, i) => {
  const lineNo = i + 1;
  if (lineNo < fromLine) {
    lineStart += line.length + 1;
    return line;
  }
  const { line: replaced, count } = replaceHexInLine(line, src, lineStart);
  total += count;
  lineStart += line.length + 1;
  return replaced;
});

console.log(DRY_RUN ? '[dry-run] ' : '', `CSS batch codemod: ${relFile} from line ${fromLine}`);
console.log(`  replacements: ${total}`);

if (!DRY_RUN && total > 0) {
  fs.writeFileSync(absFile, next.join('\n'));
}
