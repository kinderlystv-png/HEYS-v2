#!/usr/bin/env node
/**
 * UI v4 Stage 4 pilot — Home tab paint-only codemod.
 * Replaces eligible hex literals with var(--v4-role, #fallback).
 * Run: node scripts/ui-v4-home-paint-codemod.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

const FILES = [
  'apps/web/heys_widgets_ui_v1.js',
  'apps/web/heys_widgets_registry_v1.js',
  'apps/web/heys_widgets_data_crash_risk_v1.js',
  'apps/web/widgets/widget_data.js',
];

// Stage 2 interceptor — do NOT codemod (double-processing breaks classic).
const INTERCEPTOR_HEX = new Set([
  '#fff', '#ffffff', 'white',
  '#f8fafc', '#f1f5f9', '#f3f4f6', '#f9fafb',
  '#e5e7eb', '#e2e8f0', '#d1d5db', '#cbd5e1',
  '#0f172a', '#1f2937', '#111827', '#1e293b', '#374151',
  '#64748b', '#94a3b8', '#475569', '#334155',
  '#6b7280', '#9ca3af', '#71717a',
]);

// Stage 3 scale semantics — keep literals in threshold/gradient/comparison paths.
const SCALE_HEX = new Set([
  '#22c55e', '#ef4444', '#10b981', '#eab308',
  '#f59e0b', '#f97316', '#dc2626', '#059669', '#16a34a',
]);

const HEX_TO_ROLE = {
  '#167d61': 'v4-ok-text',
  '#16a66a': 'v4-ok-fill',
  '#657168': 'v4-ok-text',
  '#15803d': 'v4-ok-text',
  '#166534': 'v4-ok-text',
  '#0f6b43': 'v4-ok-text',
  '#059669': 'v4-ok-text',
  '#16a34a': 'v4-ok-text',
  '#10b981': 'v4-ok-fill',
  '#d97706': 'v4-act-text',
  '#92400e': 'v4-act-text',
  '#b91c1c': 'v4-act-text',
  '#dc2626': 'v4-act-text',
  '#991b1b': 'v4-act-text',
  '#b45309': 'v4-act-text',
  '#ca8a04': 'v4-act-text',
  '#f87171': 'v4-warn-soft',
  '#fef3c7': 'v4-warn-soft',
  '#fee2e2': 'v4-act',
  '#fef2f2': 'v4-act',
  '#ffedd5': 'v4-warn-soft',
  '#d1fae5': 'v4-ok-bg',
  '#ede9fe': 'v4-surface',
  '#172033': 'v4-ink',
  '#1a1a1f': 'v4-ink',
  '#667085': 'v4-ink-2',
  '#4b5563': 'v4-ink-2',
  '#6b7c93': 'v4-ink-2',
  '#c4c6d8': 'v4-ink-4',
  '#f8fbfa': 'v4-surface',
  '#f8fbff': 'v4-surface',
  '#eff6ff': 'v4-surface',
  '#dbeafe': 'v4-surface',
  '#52a0d8': 'v4-water',
  '#2f6bff': 'v4-act',
  '#2563eb': 'v4-act',
  '#1d4ed8': 'v4-act',
  '#3b82f6': 'v4-water',
  '#8b5cf6': 'v4-ink-2',
  '#6366f1': 'v4-ink-2',
  '#c7d2fe': 'v4-ink-3',
  '#ec4899': 'v4-warn-soft',
  '#fce7f3': 'v4-surface',
  '#f97316': 'v4-warn-soft',
  '#f59e0b': 'v4-warn-soft',
  '#eab308': 'v4-warn-soft',
  // Apple widget palette → v4 roles (category dismantle, spec 4c)
  '#ff9500': 'v4-warn-soft',
  '#ff6b00': 'v4-act-text',
  '#af52de': 'v4-ink-2',
  '#8944ab': 'v4-ink-2',
  '#30d158': 'v4-ok-fill',
  '#28a745': 'v4-ok-fill',
  '#0a84ff': 'v4-act',
  '#0066cc': 'v4-act-text',
  '#ff375f': 'v4-warn-soft',
  '#e91e63': 'v4-warn-soft',
  '#64d2ff': 'v4-water',
  '#32ade6': 'v4-water',
  '#ffd60a': 'v4-warn-soft',
  '#ff453a': 'v4-act-text',
  '#ff2d55': 'v4-warn-soft',
  '#f472b6': 'v4-warn-soft',
  '#fed7aa': 'v4-warn-soft',
  '#fbbf24': 'v4-warn-soft',
  '#c2410c': 'v4-act-text',
  '#9a3412': 'v4-act-text',
  '#dcfce7': 'v4-ok-bg',
  '#f0fdf4': 'v4-ok-bg',
  '#ecfdf5': 'v4-ok-bg',
};

const SKIP_LINE_PATTERNS = [
  /--widget-gradient-/i,
  /linear-gradient/i,
  /color-mix/i,
  /===\s*['"]#[0-9a-f]/i,
  /!==\s*['"]#[0-9a-f]/i,
  /_DYNAMIC_GRADIENTS/,
  /_staticGradient/,
  /getRelapseGradientColors/,
  /getRatioRingGradient/,
  /gradientStops/,
  /stopColor:/,
  /_coreColor/,
  /HEYS\.scales\./,
  /return\s+\[['"]#[0-9a-f]/i,
  /\?\s*\[['"]#[0-9a-f]/i,
  /:\s*\[['"]#[0-9a-f]/i, // object map keys/values for gradients
  /10b98112|10b98124/, // alpha chip tokens
];

const GRADIENT_FUNCTION_RANGES = [
  'function getRelapseGradientColors',
  'function getRatioRingGradient',
  'const _DYNAMIC_GRADIENTS',
  'const _staticGradient',
];

function normalizeHex(hex) {
  const h = hex.toLowerCase();
  if (h.length === 4) {
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return h;
}

function inGradientBlock(lines, lineIndex) {
  for (let i = lineIndex; i >= Math.max(0, lineIndex - 80); i--) {
    const line = lines[i];
    if (GRADIENT_FUNCTION_RANGES.some((sig) => line.includes(sig))) return true;
    if (/^\s*function\s+\w+/.test(line) && !GRADIENT_FUNCTION_RANGES.some((sig) => line.includes(sig))) {
      break;
    }
  }
  return false;
}

function shouldSkipLine(line, lines, lineIndex) {
  if (SKIP_LINE_PATTERNS.some((re) => re.test(line))) return true;
  if (inGradientBlock(lines, lineIndex)) return true;
  if (/return\s+['"]#[0-9a-f]{3,8}/i.test(line) && SCALE_HEX.has(normalizeHex(line.match(/#[0-9a-f]{3,8}/i)?.[0] || ''))) {
    return true;
  }
  return false;
}

function replaceHexInLine(line, lines, lineIndex, isCss = false) {
  if (shouldSkipLine(line, lines, lineIndex)) return { line, count: 0 };
  if (isCss && /^\s*--widget-gradient-/.test(line)) return { line, count: 0 };

  let count = 0;
  const out = line.replace(/#([0-9a-fA-F]{3,8})\b/g, (match) => {
    const norm = normalizeHex(match);
    if (INTERCEPTOR_HEX.has(norm)) return match;
    if (line.includes('var(--') && line.includes(match) && line.indexOf('var(--') < line.indexOf(match)) {
      // Inside or after var() fallback — leave interceptor-owned fallbacks alone.
      const insideVarFallback = new RegExp(`var\\([^)]*${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      if (insideVarFallback.test(line)) return match;
    }
    const role = HEX_TO_ROLE[norm];
    if (!role) return match;
    // Scale hex in threshold returns / comparisons (JS only)
    if (!isCss && SCALE_HEX.has(norm)) {
      if (/return\s/.test(line) || /===|!==/.test(line) || /\?\s*['"]/.test(line)) return match;
      if (/case\s+'/.test(line) && /color:\s*['"]/.test(line)) return match;
    }
    count += 1;
    return `var(--${role}, ${match})`;
  });
  return { line: out, count };
}

let totalReplacements = 0;
const perFile = {};

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  const isCss = rel.endsWith('.css');
  let fileCount = 0;
  const next = lines.map((line, i) => {
    const { line: replaced, count } = replaceHexInLine(line, lines, i, isCss);
    fileCount += count;
    return replaced;
  });
  perFile[rel] = fileCount;
  totalReplacements += fileCount;
  if (!DRY_RUN && fileCount > 0) {
    fs.writeFileSync(abs, next.join('\n'));
  }
}

console.log(DRY_RUN ? '[dry-run] ' : '', 'Home tab paint codemod');
for (const [f, n] of Object.entries(perFile)) {
  console.log(`  ${f}: ${n} replacements`);
}
console.log(`  total: ${totalReplacements}`);
