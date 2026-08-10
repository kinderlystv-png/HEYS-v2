#!/usr/bin/env node
// ui-v4-check-classic-drift.mjs — проверка, что перекраска не сдвинула классику.
//
// Принцип «var(--роль, #нынешний) не может сломать классику» верен только пока
// роль в каноничной палитре НЕ определена: тогда срабатывает запасное значение.
// Этап 1 задал все роли для всех шести палитр, поэтому запасное значение не
// срабатывает никогда — применяется значение роли. Если оно отличается от
// заменённого литерала, цвет меняется прямо в классике.
//
// Скрипт считает то, что реально увидит человек: подставляет значение роли из
// каноничной палитры (или каноничной тёмной — для правил под тёмным селектором)
// и сравнивает с литералом, который там стоял раньше.
//
// Использование:
//   node scripts/ui-v4-check-classic-drift.mjs            # проверить весь scope
//   node scripts/ui-v4-check-classic-drift.mjs --fix      # вернуть литералы там, где сдвиг
//   node scripts/ui-v4-check-classic-drift.mjs --files=a,b

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps/web');
const PALETTE_FILE = path.join(WEB, 'styles/modules/002-ui-v4-palette-roles.css');

// Скоуп не фиксирован списком: каждый следующий батч перекраски добавляет свои
// файлы, и гейт должен ловить их без правки скрипта. Берём всё, где уже есть
// роли v4, кроме сборок и копий.
const SKIP_DIRS = new Set(['public', 'dist', 'node_modules', '__tests__', '.next']);

// Файлы, где var(--v4-*) живёт в данных, а не в стиле элемента, и правило
// каноничной палитры к ним неприменимо.
const SKIP_FILES = new Set([
  '002-ui-v4-palette-roles.css', // сами определения ролей
  // Карты подмены этапа 2: применяются только на песочной и синей палитрах
  // (usesV4PaletteRoles), в классике работают legacy-карты. Несовпадение
  // каноничного значения здесь ожидаемо и правильно.
  'heys_dark_theme_interceptor.js',
]);

function collectScope(dir = WEB, acc = [], base = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectScope(path.join(dir, entry.name), acc, rel);
      continue;
    }
    if (!/\.(css|js)$/.test(entry.name)) continue;
    if (SKIP_FILES.has(entry.name)) continue;
    const src = fs.readFileSync(path.join(dir, entry.name), 'utf8');
    if (src.includes('var(--v4-')) acc.push(rel);
  }
  return acc;
}

function readPalette(themeId) {
  const css = fs.readFileSync(PALETTE_FILE, 'utf8');
  const start = css.indexOf(`[data-theme-id="${themeId}"]`);
  if (start === -1) throw new Error(`палитра ${themeId} не найдена`);
  const body = css.slice(start, css.indexOf('}', start));
  const out = new Map();
  for (const m of body.matchAll(/--(v4-[a-z0-9-]+):\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim().toLowerCase());
  }
  return out;
}

const CLASSIC = readPalette('classic');
const CLASSIC_DARK = readPalette('classic-dark');

// #abc и #aabbcc — один цвет; сравнение должно это учитывать.
function expand(hex) {
  const h = hex.toLowerCase();
  if (h.length === 4) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
}

const VAR_RE = /var\(\s*(--v4-[a-z0-9-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g;

// Тёмное правило применяется только при тёмной теме, поэтому сверять его надо с
// каноничной тёмной палитрой, а не со светлой.
function isDarkSelector(sel) {
  return /\[data-theme[^\]]*dark/i.test(sel) || /\bdark\b/i.test(sel);
}

function selectorAt(css, index) {
  const open = css.lastIndexOf('{', index);
  if (open === -1) return '';
  const prevClose = Math.max(css.lastIndexOf('}', open), css.lastIndexOf(';', open));
  return css.slice(prevClose + 1, open).trim();
}

function checkFile(rel) {
  const abs = path.join(WEB, rel);
  const src = fs.readFileSync(abs, 'utf8');
  const isCss = rel.endsWith('.css');
  const findings = [];

  for (const m of src.matchAll(VAR_RE)) {
    const [full, roleVar, literal] = m;
    const role = roleVar.slice(2);
    // Инлайн-стиль в JS применяется в любой теме, поэтому там всегда классика.
    const dark = isCss && isDarkSelector(selectorAt(src, m.index));
    const palette = dark ? CLASSIC_DARK : CLASSIC;
    const value = palette.get(role);
    if (!value) continue; // роль не задана — запасное значение сработает, всё честно
    if (!value.startsWith('#')) continue; // rgba-роли сравнивать с hex бессмысленно
    if (expand(value) === expand(literal)) continue;
    findings.push({
      file: rel,
      line: src.slice(0, m.index).split('\n').length,
      full,
      literal,
      role: roleVar,
      shown: value,
      theme: dark ? 'каноничная тёмная' : 'каноничная',
    });
  }
  return { abs, src, findings };
}

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const filesArg = args.find((a) => a.startsWith('--files='));
const scope = filesArg ? filesArg.slice('--files='.length).split(',') : collectScope();

let total = 0;
for (const rel of scope) {
  const { abs, src, findings } = checkFile(rel);
  if (!findings.length) continue;
  total += findings.length;
  console.log(`\n${rel} — ${findings.length}`);
  for (const f of findings.slice(0, 8)) {
    console.log(`  :${f.line} ${f.role} — было ${f.literal}, ${f.theme} покажет ${f.shown}`);
  }
  if (findings.length > 8) console.log(`  … ещё ${findings.length - 8}`);

  if (fix) {
    let next = src;
    for (const f of findings) next = next.split(f.full).join(f.literal);
    fs.writeFileSync(abs, next);
  }
}

if (!total) {
  console.log('Сдвигов классики нет: каждая роль показывает тот же цвет, что стоял литералом.');
  process.exit(0);
}

console.log(`\nВсего сдвигов: ${total}`);
if (fix) {
  console.log('Литералы возвращены. Эти места ждут своей роли — переводить их нельзя,');
  console.log('пока в палитрах не появится роль с тем же каноничным значением.');
  process.exit(0);
}
console.log('Запусти с --fix, чтобы вернуть литералы.');
process.exit(1);
