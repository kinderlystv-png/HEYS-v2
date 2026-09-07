#!/usr/bin/env node
/**
 * Semantic bare-literal migration for 200-dark-and-effects.css
 * Wraps literals in var(--v4-role, #hex) or skips for designer list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'apps/web/styles/modules/200-dark-and-effects.css');

const COLOUR_PROPS =
  /^(\s*)(background|background-color|color|border-color|fill|stroke):\s*(#[0-9a-fA-F]{3,8})\s*;(.*)$/;

function selectorAt(lines, i) {
  for (let j = i; j >= Math.max(0, i - 40); j--) {
    const t = lines[j].trim();
    if (t.includes('{') && (t.startsWith('.') || t.startsWith('[') || t.startsWith(':'))) {
      return t.split('{')[0].trim();
    }
  }
  return '';
}

function blockAt(lines, i) {
  let s = '';
  for (let j = Math.max(0, i - 40); j <= i; j++) s += lines[j] + ' ';
  return s;
}

function role(prop, value, comment = '') {
  const tail = comment ? ` /* ${comment} */` : '';
  return `${prop}: ${value};${tail}`;
}

const OK_TEXT = 'var(--v4-ok-text, #5c6a45)';
const OK_FILL = 'var(--v4-ok-fill, #7a8a5e)';
const ACT_TEXT = 'var(--v4-act-text, #8a4a20)';
const ACT = 'var(--v4-act, #c67139)';
const BAD_TEXT = 'var(--v4-bad-text, #a83c22)';
const VAL_BAD = 'var(--v4-val-bad, #a8382b)';
const WARN_TEXT = 'var(--v4-warn-text, #a1471c)';
const WARN_SOFT = 'var(--v4-warn-soft, #c9922e)';
const INK = 'var(--v4-ink, #201e1d)';
const INK2 = 'var(--v4-ink-2) /* v4-intentional */';
const INK3 = 'var(--v4-ink-3) /* v4-intentional */';
const INK4 = 'var(--v4-ink-4) /* v4-intentional */';
const HERO = 'var(--v4-hero, #efe3cf)';
const CHIP = 'var(--v4-chip, #efe3cf)';
const EDGE = 'var(--v4-edge, rgba(0, 0, 0, 0.18))';
const ACCENT_BG = 'var(--v4-accent-bg, #f0dcc6)';

function transform(sel, block, prop, hex) {
  const h = hex.toLowerCase();
  const ctx = sel + ' ' + block;
  const isDark = /\[data-theme[^\]]*dark/i.test(ctx);

  // --- sparkline / kcal / weight metrics ---
  if (/sparkline|kcal-|caloric-|weight-|insulin-/.test(ctx)) {
    if (prop === 'color') {
      if (['#86efac', '#6ee7b7', '#bbf7d0', '#34d399', '#059669', '#15803d', '#166534'].includes(h))
        return role(prop, OK_TEXT);
      if (['#93c5fd', '#67e8f9', '#a5f3fc', '#7dd3fc', '#bae6fd'].includes(h))
        return role(prop, ACT_TEXT);
      if (['#fca5a5', '#f87171'].includes(h)) return role(prop, BAD_TEXT);
      if (h === '#7c3aed') return role(prop, ACT_TEXT);
    }
    if (prop === 'border-color') {
      if (h === '#10b981') return role(prop, OK_FILL);
      if (['#ef4444', '#f87171'].includes(h)) return role(prop, VAL_BAD);
      if (['#6366f1', '#8b5cf6', '#a78bfa', '#06b6d4', '#ec4899'].includes(h))
        return role(prop, ACT);
    }
    if (prop === 'background' && h === '#10b981') return role(prop, OK_FILL);
    if (prop === 'background' && h === '#312e81') return role(prop, ACCENT_BG);
    if (prop === 'fill') {
      if (h === '#93c5fd') return role(prop, ACT_TEXT);
      if (h === '#f87171') return role(prop, BAD_TEXT);
      if (h === '#1f2937') return role(prop, HERO);
    }
    if (prop === 'stroke') {
      if (h === '#065f46') return role(prop, OK_FILL);
      if (h === '#7f1d1d') return role(prop, VAL_BAD);
      if (h === '#a78bfa') return role(prop, ACT);
    }
  }

  // --- meal badges ---
  if (/meal-kcal-badge|meal-sep\.meal-type/.test(ctx) && prop === 'color') {
    if (h === '#86efac') return role(prop, OK_TEXT);
    if (h === '#93c5fd') return role(prop, ACT_TEXT);
    if (h === '#c4b5fd') return role(prop, ACT_TEXT);
  }

  // --- macro popup rec ---
  if (/macro-badge-popup-rec/.test(ctx) && prop === 'color' && h === '#bbf7d0')
    return role(prop, OK_TEXT);

  // --- mood / training / yesterday ---
  if (/mood-|training-|yesterday-|wheel-|bottom-sheet|compact-train|meal-rating-mini|mobile-mood|training-preset|compact-zone/.test(ctx)) {
    if (isDark) {
      if (prop === 'color') {
        if (h === '#0a84ff') return role(prop, ACT_TEXT);
        if (h === '#86efac') return role(prop, OK_TEXT);
        if (h === '#93c5fd') return role(prop, ACT_TEXT);
        if (['#8e8e93', '#636366', '#aeaeb2', '#a1a1aa'].includes(h)) return role(prop, INK3, '');
        if (h === '#a5b4fc') return role(prop, ACT_TEXT);
        if (h === '#e5e5ea' || h === '#e5e5e5') return role(prop, INK);
        if (h === '#7dd3fc' || h === '#bae6fd') return role(prop, ACT_TEXT);
        if (h === '#fca5a5') return role(prop, BAD_TEXT);
      }
      if (prop === 'background') {
        if (['#2c2c2e', '#3a3a3c', '#3c3c3e'].includes(h)) return role(prop, CHIP);
        if (h === '#48484a') return role(prop, EDGE);
        if (['#2e1065', '#1e3a8a', '#1e1a2e', '#2a2445'].includes(h)) return role(prop, ACCENT_BG);
        if (h === '#e5e5ea') return role(prop, INK);
      }
      if (prop === 'border-color') {
        if (['#48484a', '#38383a', '#3c3c3e'].includes(h)) return role(prop, EDGE);
        if (['#4c3d6e', '#3d3560'].includes(h)) return role(prop, ACT);
        if (h === '#2d4a2d') return role(prop, OK_FILL);
        if (h === '#4a4020') return role(prop, WARN_SOFT);
        if (h === '#ef4444') return role(prop, VAL_BAD);
      }
    }
  }

  // --- tone cards ---
  if (/tone-violet|tone-green|tone-amber|main-violet|violet-table/.test(ctx)) {
    if (prop === 'background' && ['#1e1a2e', '#2a2445', '#2e1065', '#1e3a8a'].includes(h))
      return role(prop, ACCENT_BG);
    if (prop === 'border-color') {
      if (['#4c3d6e', '#3d3560'].includes(h)) return role(prop, ACT);
      if (h === '#2d4a2d') return role(prop, OK_FILL);
      if (h === '#4a4020') return role(prop, WARN_SOFT);
    }
    if (prop === 'color') {
      if (h === '#86efac') return role(prop, OK_TEXT);
      if (h === '#93c5fd') return role(prop, ACT_TEXT);
    }
  }

  // --- weight retention / forecast ---
  if (/weight-retention|weight-clean-trend|weight-forecast/.test(ctx)) {
    if (prop === 'color' && ['#f9a8d4', '#fbcfe8'].includes(h))
      return role(prop, isDark ? WARN_SOFT : ACT_TEXT);
  }

  // --- mpc ---
  if (/mpc-/.test(ctx)) {
    if (prop === 'color') {
      if (['#7dd3fc', '#bae6fd', '#93c5fd'].includes(h)) return role(prop, ACT_TEXT);
      if (h === '#fca5a5') return role(prop, BAD_TEXT);
    }
    if (prop === 'border-color' && h === '#ef4444') return role(prop, VAL_BAD);
  }

  // --- ews badge ---
  if (/ews-badge/.test(ctx) && prop === 'color' && h === '#f87171') return role(prop, BAD_TEXT);

  // --- tabs ---
  if (/\.tabs \.tab/.test(sel) && prop === 'color' && h === '#aeaeb2') return role(prop, INK3, '');

  // --- sparkline empty (light + dark) ---
  if (/sparkline-empty/.test(ctx)) {
    if (prop === 'color') {
      if (['#166534', '#15803d', '#059669', '#34d399', '#86efac'].includes(h))
        return role(prop, OK_TEXT);
      if (h === '#7c3aed') return role(prop, ACT_TEXT);
    }
  }

  // --- sleep block (light theme base + dark overrides) ---
  if (/sleep-|day-score/.test(ctx)) {
    if (prop === 'color') {
      if (['#be185d', '#f9a8d4'].includes(h)) return role(prop, WARN_TEXT);
      if (['#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#a855f7'].includes(h))
        return role(prop, ACT_TEXT);
      if (h === '#374151') return role(prop, INK2, '');
      if (h === '#8e8e93') return role(prop, INK3, '');
    }
    if (prop === 'background') {
      if (['#faf5ff', '#f3e8ff'].includes(h)) return role(prop, ACCENT_BG);
    }
    if (prop === 'border-color') {
      if (['#ec4899', '#d8b4fe', '#c4b5fd', '#e9d5ff', '#a78bfa'].includes(h))
        return role(prop, ACT);
    }
  }

  // --- measurements card dark ---
  if (/measurements-card/.test(ctx)) {
    if (prop === 'border-color' && h === '#1f2937') return role(prop, EDGE);
    if (prop === 'fill' && h === '#1f2937') return role(prop, HERO);
    if (prop === 'color' && h === '#e2e8f0') return role(prop, INK4, '');
  }

  // --- ndte ---
  if (/ndte-/.test(ctx)) {
    if (prop === 'color') {
      if (['#059669', '#34d399'].includes(h)) return role(prop, OK_TEXT);
      if (h === '#1e293b') return role(prop, INK2, '');
    }
  }

  // --- curator hint dark ---
  if (/curator-authored-hint/.test(ctx) && prop === 'color' && h === '#8e8e93')
    return role(prop, INK3, '');

  // --- generic fallbacks by hex family ---
  if (prop === 'color') {
    if (['#86efac', '#6ee7b7', '#bbf7d0', '#34d399', '#059669', '#15803d', '#166534'].includes(h))
      return role(prop, OK_TEXT);
    if (['#93c5fd', '#67e8f9', '#a5f3fc', '#7dd3fc', '#bae6fd', '#0a84ff', '#a5b4fc'].includes(h))
      return role(prop, ACT_TEXT);
    if (['#fca5a5', '#f87171'].includes(h)) return role(prop, BAD_TEXT);
    if (['#f9a8d4', '#fbcfe8'].includes(h)) return role(prop, isDark ? WARN_SOFT : WARN_TEXT);
    if (['#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#a855f7'].includes(h))
      return role(prop, ACT_TEXT);
    if (['#8e8e93', '#636366', '#aeaeb2', '#a1a1aa'].includes(h)) return role(prop, INK3, '');
    if (['#374151', '#1e293b'].includes(h)) return role(prop, INK2, '');
    if (['#e5e5ea', '#e5e5e5', '#e2e8f0'].includes(h)) return role(prop, INK);
  }

  if (prop === 'border-color') {
    if (h === '#10b981') return role(prop, OK_FILL);
    if (['#ef4444', '#f87171'].includes(h)) return role(prop, VAL_BAD);
    if (['#6366f1', '#8b5cf6', '#a78bfa', '#06b6d4', '#ec4899', '#c4b5fd', '#d8b4fe', '#e9d5ff'].includes(h))
      return role(prop, ACT);
    if (['#48484a', '#38383a', '#3c3c3e', '#1f2937'].includes(h)) return role(prop, EDGE);
    if (['#2d4a2d'].includes(h)) return role(prop, OK_FILL);
    if (h === '#4a4020') return role(prop, WARN_SOFT);
  }

  if (prop === 'background') {
    if (h === '#10b981') return role(prop, OK_FILL);
    if (['#2c2c2e', '#3a3a3c', '#3c3c3e'].includes(h)) return role(prop, CHIP);
    if (h === '#48484a') return role(prop, EDGE);
    if (['#faf5ff', '#f3e8ff', '#312e81', '#2e1065', '#1e3a8a', '#1e1a2e', '#2a2445'].includes(h))
      return role(prop, ACCENT_BG);
    if (h === '#e5e5ea') return role(prop, INK);
  }

  if (prop === 'fill') {
    if (h === '#93c5fd') return role(prop, ACT_TEXT);
    if (h === '#f87171') return role(prop, BAD_TEXT);
    if (h === '#1f2937') return role(prop, HERO);
  }

  if (prop === 'stroke') {
    if (h === '#065f46') return role(prop, OK_FILL);
    if (h === '#7f1d1d') return role(prop, VAL_BAD);
    if (h === '#a78bfa') return role(prop, ACT);
  }

  return null;
}

const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');
let changed = 0;
let left = 0;
const leftList = [];

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(COLOUR_PROPS);
  if (!m) continue;
  const [, indent, prop, hex, rest] = m;
  if (rest.includes('v4-intentional')) continue;
  const sel = selectorAt(lines, i);
  const block = blockAt(lines, i);
  const out = transform(sel, block, prop, hex);
  if (out) {
    lines[i] = indent + out;
    changed++;
  } else {
    left++;
    leftList.push({ line: i + 1, sel, prop, hex });
  }
}

fs.writeFileSync(FILE, lines.join('\n'));
console.log(JSON.stringify({ changed, left, leftList }, null, 2));
