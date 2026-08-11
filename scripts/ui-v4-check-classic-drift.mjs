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
  // Скомпилированный Tailwind-артефакт: index.html грузит styles/tailwind.css,
  // не src/tailwind.css; prebuild/CI/dev не пересобирают. ~153 hex — утилиты
  // Tailwind, не ручная покраска Stage 6. Перекраска — только после отдельной
  // пересборки из src/tailwind.css + tailwind.config.js (см. UI v4 plan Stage 6).
  'tailwind.css',
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

// Строгое равенство литерала и роли защищало классику ценой тёмных палитр:
// #0f172a отличается от --v4-ink (#111827) на глаз неразличимо, но замена
// запрещалась — и текст оставался жёстко тёмным во всех шести наборах, включая
// тёмные, где он нечитаем. Решение владельца 2026-08-10: мерить перцептивную
// разницу, а не совпадение байтов. Сумма по каналам RGB для этого не годится —
// шесть единиц в синем и в зелёном воспринимаются по-разному, поэтому OKLab.
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

// Шкала ×100, чтобы пороги читались как привычные ΔE.
function deltaE(hexA, hexB) {
  const A = hexToOklab(hexA);
  const B = hexToOklab(hexB);
  return Math.hypot(A.L - B.L, A.a - B.a, A.b - B.b) * 100;
}

const DELTA_SILENT = 2; // заменяем молча
const DELTA_NOTED = 4;  // заменяем, но с пометкой в отчёте; выше — гейт держит

function relLuminance(hex) {
  const h = expand(hex);
  const [r, g, b] = [1, 3, 5].map((i) => srgbToLinear(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Сдвиг чернил на два тона безобиден для плашки, но текст обязан сохранить
// контраст. Фон в общем случае не вычислить статически, поэтому сверяем с
// каноничным фоном набора — для текста это и есть худший реальный случай.
function contrastTo(hex, bg) {
  const [hi, lo] = [relLuminance(hex), relLuminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PROPS = /(^|[;{\s])color\s*:/;

const VAR_RE = /var\(\s*(--v4-[a-z0-9-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g;

// Роль без запасного значения обходит проверку выше: сравнивать не с чем.
// Иногда это правильно — намеренная смена вида, как расформирование
// категорийной палитры. Но тогда это должно быть сказано вслух, а не получиться
// случайно, поэтому такие места требуют маркера рядом.
const BARE_VAR_RE = /var\(\s*(--v4-[a-z0-9-]+)\s*\)/g;
const INTENT_MARK = /v4-(?:intentional|mark-\d)|расформиров/i;

function hasIntentNearby(src, index) {
  const from = src.lastIndexOf('\n', src.lastIndexOf('\n', index - 1) - 1);
  const to = src.indexOf('\n', index);
  return INTENT_MARK.test(src.slice(Math.max(0, from), to === -1 ? src.length : to));
}

// Тёмное правило применяется только при тёмной теме, поэтому сверять его надо с
// каноничной тёмной палитрой, а не со светлой.
function isDarkSelector(sel) {
  return /\[data-theme[^\]]*dark/i.test(sel) || /\bdark\b/i.test(sel);
}

// Правило может быть тёмным не только по селектору, но и по обрамляющему
// @media (prefers-color-scheme: dark) — селектор внутри него выглядит светлым.
function insideDarkMedia(css, index) {
  let depth = 0;
  for (let i = index; i >= 0; i--) {
    const ch = css[i];
    if (ch === '}') depth += 1;
    else if (ch === '{') {
      if (depth === 0) {
        // Комментарии убираем: разделители между блоками длинные и рвут поиск.
        const head = css
          .slice(Math.max(0, css.lastIndexOf('}', i) + 1), i)
          .replace(/\/\*[\s\S]*?\*\//g, '');
        if (/@media[^{]*prefers-color-scheme\s*:\s*dark/i.test(head)) return true;
      } else depth -= 1;
    }
  }
  return false;
}

// html:not([data-theme]) — состояние до инициализации темы: атрибут ещё не
// проставлен, значит ни одна палитра не активна и роли не определены. Запасное
// значение там срабатывает по-настоящему, сравнивать его с палитрой незачем.
function beforeThemeApplied(sel) {
  return /html:not\(\[data-theme\]\)/.test(sel);
}

function selectorAt(css, index) {
  const open = css.lastIndexOf('{', index);
  if (open === -1) return '';
  const prevClose = Math.max(css.lastIndexOf('}', open), css.lastIndexOf(';', open));
  // Без границы слева (первое правило файла) захват уходит в начало файла и
  // ловит слово "dark" из обычной прозы в шапочном комментарии — как здесь,
  // в 1000-messenger.css: «между light/dark при смене темы». Комментарии
  // всегда вычищаем перед проверкой на тёмный селектор.
  return css.slice(prevClose + 1, open).replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

const noted = [];

function checkFile(rel) {
  const abs = path.join(WEB, rel);
  const src = fs.readFileSync(abs, 'utf8');
  const isCss = rel.endsWith('.css');
  const findings = [];

  for (const m of src.matchAll(VAR_RE)) {
    const [full, roleVar, literal] = m;
    const role = roleVar.slice(2);
    // Инлайн-стиль в JS применяется в любой теме, поэтому там всегда классика.
    const selector = isCss ? selectorAt(src, m.index) : '';
    if (beforeThemeApplied(selector)) continue;
    const dark = isCss && (isDarkSelector(selector) || insideDarkMedia(src, m.index));
    const palette = dark ? CLASSIC_DARK : CLASSIC;
    const value = palette.get(role);
    if (!value) continue; // роль не задана — запасное значение сработает, всё честно
    if (!value.startsWith('#')) continue; // rgba-роли сравнивать с hex бессмысленно
    if (expand(value) === expand(literal)) continue;

    const delta = deltaE(value, literal);
    if (delta <= DELTA_NOTED) {
      // Перцептивно неразличимо или почти — замена допустима. Но если это
      // текст, контраст к фону набора не должен просесть: иначе выигрыш в
      // тёмных палитрах куплен ухудшением читаемости в светлой.
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const decl = src.slice(lineStart, src.indexOf('\n', m.index));
      const isText = TEXT_PROPS.test(decl);
      const bg = (dark ? CLASSIC_DARK : CLASSIC).get('v4-bg') || '#ffffff';
      // То же уточнение, что в ui-v4-apply-near-roles.mjs: держим литерал, если
      // контраст уходит ниже AA (4.5) или теряет больше десятой части.
      // Буквальное «не ниже прежнего» блокировало #0f172a при падении 17.85 →
      // 17.74 — величина, которой на экране не существует.
      const before = contrastTo(literal, bg);
      const contrastDropped = isText && contrastTo(value, bg) < Math.max(before >= 4.5 ? 4.5 : 0, before * 0.9);
      if (!contrastDropped) {
        if (delta > DELTA_SILENT) noted.push({ rel, line: src.slice(0, m.index).split('\n').length, literal, role: roleVar, value, delta });
        continue;
      }
    }

    findings.push({
      file: rel,
      line: src.slice(0, m.index).split('\n').length,
      full,
      literal,
      role: roleVar,
      shown: value,
      theme: dark ? 'каноничная тёмная' : 'каноничная',
      delta,
    });
  }
  for (const m of src.matchAll(BARE_VAR_RE)) {
    if (hasIntentNearby(src, m.index)) continue;
    findings.push({
      file: rel,
      line: src.slice(0, m.index).split('\n').length,
      full: m[0],
      literal: null,
      role: m[1],
      shown: 'нечему сравнивать',
      theme: 'без запасного значения',
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
    console.log(
      f.literal
        ? `  :${f.line} ${f.role} — было ${f.literal}, ${f.theme} покажет ${f.shown}`
          + (f.delta ? ` (ΔE ${f.delta.toFixed(1)})` : '')
        : `  :${f.line} ${f.role} — без запасного значения, прежний цвет потерян`,
    );
  }
  if (findings.length > 8) console.log(`  … ещё ${findings.length - 8}`);

  if (fix) {
    let next = src;
    for (const f of findings) {
      if (!f.literal) continue; // вернуть нечего — прежний цвет в коде не сохранён
      next = next.split(f.full).join(f.literal);
    }
    fs.writeFileSync(abs, next);
  }
}

if (noted.length) {
  console.log(`\nЗамены в зоне ΔE ${DELTA_SILENT}–${DELTA_NOTED} — допустимы, но названы вслух: ${noted.length}`);
  const byPair = new Map();
  for (const n of noted) {
    const key = `${n.literal} → ${n.role} (${n.value}) ΔE ${n.delta.toFixed(1)}`;
    byPair.set(key, (byPair.get(key) || 0) + 1);
  }
  for (const [k, c] of [...byPair].sort((a, b) => b[1] - a[1])) console.log(`  ${k} ×${c}`);
}

if (!total) {
  console.log('Сдвигов классики нет: перцептивная разница в пределах порога.');
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
