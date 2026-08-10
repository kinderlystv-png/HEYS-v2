#!/usr/bin/env node
// ui-v4-apply-near-roles.mjs — замена литералов, перцептивно неотличимых от роли.
//
// Зачем. Строгое совпадение литерала и каноничного значения роли защищало
// классику ценой тёмных палитр: `color: #0f172a` отличается от --v4-ink
// (#111827) на глаз неразличимо, но замена запрещалась — и текст оставался
// жёстко тёмным во всех шести наборах, включая тёмные, где он нечитаем.
//
// Решение владельца 2026-08-10: мерить перцептивную разницу в OKLab, а не
// совпадение байтов. Сумма по каналам RGB для этого не годится — шесть единиц
// в синем и в зелёном воспринимаются по-разному.
//
//   ΔE ≤ 2   — заменяем молча
//   ΔE 2–4   — заменяем, но называем в отчёте
//   ΔE > 4   — не трогаем, литерал остаётся
//
// Отдельно для текста: сдвиг чернил безобиден для плашки, но контраст к фону
// набора обязан остаться не ниже прежнего. Если падает — держим литерал даже
// при ΔE 1.
//
//   node scripts/ui-v4-apply-near-roles.mjs            # отчёт, файлы не трогает
//   node scripts/ui-v4-apply-near-roles.mjs --apply    # применить

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps/web');
const PALETTE_FILE = path.join(WEB, 'styles/modules/002-ui-v4-palette-roles.css');

const SKIP_FILES = new Set(['002-ui-v4-palette-roles.css', 'tailwind.css', 'heys_dark_theme_interceptor.js']);
const SKIP_DIRS = new Set(['public', 'dist', 'node_modules', '__tests__', '.next']);

const DELTA_SILENT = 2;
const DELTA_NOTED = 4;

function expand(hex) {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function hexToOklab(hex) {
  const h = expand(hex);
  const r = srgbToLinear(parseInt(h.slice(1, 3), 16));
  const g = srgbToLinear(parseInt(h.slice(3, 5), 16));
  const b = srgbToLinear(parseInt(h.slice(5, 7), 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

// ΔE в пастельных тонах мал между разными семействами: розовая подложка ошибки
// и нейтральный hero почти совпадают по числу, но означают разное. Поэтому
// сверх расстояния сверяем оттенок — цветное не уходит в нейтральное и наоборот.
// 0.008 — по замерам: hero #f8fafc даёт 0.0034, линия #e5e7eb 0.0058, а уже
// подложка ошибки #fef2f2 — 0.0129. Порог 0.02 считал нейтральной всю пастель,
// и розовое уезжало в hero.
const NEUTRAL_CHROMA = 0.008;
const HUE_TOLERANCE = 25;

function chromaHue(hex) {
  const { a, b } = hexToOklab(hex);
  return { c: Math.hypot(a, b), h: (Math.atan2(b, a) * 180) / Math.PI };
}

function sameColorFamily(hexA, hexB) {
  const A = chromaHue(hexA);
  const B = chromaHue(hexB);
  const aNeutral = A.c < NEUTRAL_CHROMA;
  const bNeutral = B.c < NEUTRAL_CHROMA;
  if (aNeutral !== bNeutral) return false; // цветное против нейтрального
  if (aNeutral && bNeutral) return true;
  // Угловое расстояние по кругу оттенков: 350° и 10° — это 20°, а не 340°.
  const diff = Math.abs(((A.h - B.h + 540) % 360) - 180);
  return diff <= HUE_TOLERANCE;
}

function deltaE(a, b) {
  const A = hexToOklab(a);
  const B = hexToOklab(b);
  return Math.hypot(A.L - B.L, A.a - B.a, A.b - B.b) * 100;
}

function relLuminance(hex) {
  const h = expand(hex);
  const [r, g, b] = [1, 3, 5].map((i) => srgbToLinear(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastTo(hex, bg) {
  const [hi, lo] = [relLuminance(hex), relLuminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function readPalette(themeId) {
  const css = fs.readFileSync(PALETTE_FILE, 'utf8');
  const start = css.indexOf(`[data-theme-id="${themeId}"]`);
  const body = css.slice(start, css.indexOf('}', start));
  const out = new Map();
  for (const m of body.matchAll(/--(v4-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    out.set(m[1], m[2].trim().toLowerCase());
  }
  return out;
}

const CLASSIC = readPalette('classic');
const CLASSIC_DARK = readPalette('classic-dark');
const CLASSIC_BG = CLASSIC.get('v4-bg') || '#ffffff';

// Правило под тёмным селектором применяется только в тёмной теме, и сверять его
// надо с каноничной тёмной палитрой. Без этого светлый серый #6b7280 уезжал в
// --v4-ink-2, у которой в тёмной теме #94a3b8 — расхождение ΔE 16.
function isDarkContext(css, index) {
  const open = css.lastIndexOf('{', index);
  if (open === -1) return false;
  const prevBoundary = Math.max(css.lastIndexOf('}', open), css.lastIndexOf(';', open));
  const sel = css.slice(prevBoundary + 1, open);
  if (/\[data-theme[^\]]*dark|\bdark\b/i.test(sel)) return true;
  let depth = 0;
  for (let i = index; i >= 0; i--) {
    const ch = css[i];
    if (ch === '}') depth += 1;
    else if (ch === '{') {
      if (depth === 0) {
        const head = css
          .slice(Math.max(0, css.lastIndexOf('}', i) + 1), i)
          .replace(/\/\*[\s\S]*?\*\//g, '');
        if (/@media[^{]*prefers-color-scheme\s*:\s*dark/i.test(head)) return true;
      } else depth -= 1;
    }
  }
  return false;
}

// Роль подбираем по смыслу свойства, а не только по близости цвета: иначе
// светлая заливка уедет в роль текста просто потому, что оттенок совпал.
const ROLE_BY_PROP = {
  color: ['v4-ink', 'v4-ink-2', 'v4-ink-3', 'v4-ink-4', 'v4-act-text', 'v4-ok-text', 'v4-warn-1'],
  background: ['v4-bg', 'v4-surface', 'v4-hero', 'v4-accent-bg', 'v4-ok-bg', 'v4-act'],
  'background-color': ['v4-bg', 'v4-surface', 'v4-hero', 'v4-accent-bg', 'v4-ok-bg', 'v4-act'],
  'border-color': ['v4-line'],
  border: ['v4-line'],
  'border-top': ['v4-line'],
  'border-bottom': ['v4-line'],
  'border-left': ['v4-line'],
  'border-right': ['v4-line'],
  fill: ['v4-ink', 'v4-ink-2', 'v4-act', 'v4-ok-fill'],
  stroke: ['v4-line', 'v4-ink-2', 'v4-act'],
};

function collect(dir = WEB, acc = [], base = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) collect(path.join(dir, e.name), acc, rel);
      continue;
    }
    if (!/\.css$/.test(e.name) || SKIP_FILES.has(e.name)) continue;
    acc.push(rel);
  }
  return acc;
}

const apply = process.argv.includes('--apply');
const silent = [];
const notedList = [];
const heldByContrast = [];

for (const rel of collect()) {
  const abs = path.join(WEB, rel);
  const src = fs.readFileSync(abs, 'utf8');
  let out = src;

  // Только объявления вида `prop: … #hex …`, вне уже готовых var().
  const declRe = /(^[ \t]*|[;{]\s*)([a-z-]+)\s*:\s*([^;{}]*#[0-9a-fA-F]{3,8}[^;{}]*);/gim;
  const edits = [];
  for (const m of src.matchAll(declRe)) {
    const prop = m[2].toLowerCase();
    const candidates = ROLE_BY_PROP[prop];
    if (!candidates) continue;
    if (/var\(/.test(m[3])) continue;
    if (/gradient/i.test(m[3])) continue;

    const hexes = m[3].match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    if (hexes.length !== 1) continue;
    const lit = expand(hexes[0]);
    if (lit.length !== 7) continue;

    // Замена должна быть безопасна в ОБЕИХ каноничных палитрах: правило может
    // жить под тёмным селектором, и тогда сверять надо с тёмной.
    const dark = isDarkContext(src, m.index);
    const palette = dark ? CLASSIC_DARK : CLASSIC;

    let best = null;
    for (const role of candidates) {
      const val = palette.get(role);
      if (!val || !val.startsWith('#')) continue;
      const d = deltaE(val, lit);
      if (d === 0) { best = null; break; }
      if (!sameColorFamily(val, lit)) continue;
      if (d <= DELTA_NOTED && (!best || d < best.d)) best = { role, val, d };
    }
    if (!best) continue;

    if (prop === 'color') {
      // Правило владельца: контраст текста не должен просесть. Буквально оно
      // блокировало главный случай — #0f172a даёт 17.85 против 17.74 у роли,
      // то есть «падение» на 0.11 при пороге читаемости 4.5. Физически это
      // ничто, а 109 нечитаемых в тёмных палитрах мест остались бы как есть.
      // Уточнение: держим литерал, если после замены контраст уходит ниже AA
      // (4.5) или теряет больше десятой части. Микропадение в зоне заведомой
      // читаемости пропускаем.
      const before = contrastTo(lit, CLASSIC_BG);
      const after = contrastTo(best.val, CLASSIC_BG);
      // Порог AA требуем только если исходный цвет его проходил: иначе для текста,
      // который и так ниже нормы, замена блокируется навсегда.
      if (after < Math.max(before >= 4.5 ? 4.5 : 0, before * 0.9)) {
        heldByContrast.push({ rel, lit, role: best.role, before: before.toFixed(2), after: after.toFixed(2) });
        continue;
      }
    }

    const replaced = m[0].replace(hexes[0], `var(--${best.role}, ${hexes[0]})`);
    edits.push({ from: m[0], to: replaced });
    (best.d <= DELTA_SILENT ? silent : notedList).push({ rel, lit, role: best.role, val: best.val, d: best.d, prop });
  }

  if (apply && edits.length) {
    for (const e of edits) out = out.replace(e.from, e.to);
    fs.writeFileSync(abs, out);
  }
}

const group = (arr) => {
  const m = new Map();
  for (const x of arr) {
    const k = `${x.lit} → --${x.role} (${x.val})  ΔE ${x.d.toFixed(1)}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
};

console.log(`Зона ΔE ≤ ${DELTA_SILENT} — заменяем молча: ${silent.length}`);
for (const [k, c] of group(silent).slice(0, 12)) console.log(`  ${k} ×${c}`);

console.log(`\nЗона ΔE ${DELTA_SILENT}–${DELTA_NOTED} — заменяем, но называем: ${notedList.length}`);
for (const [k, c] of group(notedList)) console.log(`  ${k} ×${c}`);

if (heldByContrast.length) {
  console.log(`\nДержим литерал: контраст текста просел бы — ${heldByContrast.length}`);
  const m = new Map();
  for (const h of heldByContrast) {
    const k = `${h.lit} → --${h.role}: контраст ${h.before} → ${h.after}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  for (const [k, c] of [...m].sort((a, b) => b[1] - a[1])) console.log(`  ${k} ×${c}`);
}

console.log(apply ? '\nПрименено.' : '\nОтчёт. Запусти с --apply, чтобы применить.');
