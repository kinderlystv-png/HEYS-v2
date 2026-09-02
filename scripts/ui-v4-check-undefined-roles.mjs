#!/usr/bin/env node
// ui-v4-check-undefined-roles.mjs — гейт ролей палитры v4, которые молча не
// следуют набору. Держит две проверки.
//
// 1. Неопределённая роль. `var(--v4-роль, #литерал)` выглядит безопасно, но
// если роль не определена НИГДЕ, запасное значение срабатывает всегда — цвет
// молча перестаёт следовать набору. Ровно так на вкладке «Питание» жили
// `--v4-chip` и `--v4-surface-strong`: во всех палитрах показывался один
// песочный литерал, и синие наборы оставались непокрытыми. Глазами это не
// ловится: цвет-то есть.
//
// Эта проверка работает храповиком: список известных мест заморожен и может
// только уменьшаться. Новая неопределённая роль — падение. Исчезнувшая
// запись — тоже падение, чтобы список не превращался в вечную свалку.
//
// 2. Голая `var(--v4-роль)` без запасного значения. Перенесена сюда 2026-08-24
// из снятого гейта `ui-v4-check-classic-drift.mjs`: тот сверял подстановку
// роли с каноничной палитрой, а каноничной палитры больше нет (решение
// владельца — канон живёт только на зеркале stable.heyslab.ru). Правило про
// голую `var()` к каноничной палитре отношения не имело и снятию не подлежит:
// без запасного значения прежний цвет в коде не сохранён вовсе, и потерять
// его можно молча. Иногда это правильно — намеренная смена вида, как
// расформирование категорийной палитры, — но тогда рядом должен стоять маркер
// намеренности, а не «так получилось».
//
// Использование:
//   node scripts/ui-v4-check-undefined-roles.mjs                    # проверить
//   node scripts/ui-v4-check-undefined-roles.mjs --list             # текущее состояние
//   node scripts/ui-v4-check-undefined-roles.mjs --update-baseline  # после закрытия долга

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps/web');

const SKIP_DIRS = new Set(['public', 'dist', 'node_modules', '__tests__', '.next']);
const SKIP_FILE = /(bundle|\.min)\.[cm]?js$/i;

// Файлы, где var(--v4-*) живёт в данных, а не в стиле элемента, — исключены из
// проверки голой var() (список перенесён из снятого гейта classic-drift).
const BARE_SKIP_FILES = new Set([
  '002-ui-v4-palette-roles.css', // сами определения ролей
  // Скомпилированный Tailwind-артефакт: index.html грузит styles/tailwind.css,
  // не src/tailwind.css; prebuild/CI/dev не пересобирают.
  'tailwind.css',
  // Карты подмены этапа 2: применяются только на песочной и синей палитрах
  // (usesV4PaletteRoles), значения там — данные, а не объявления стиля.
  'heys_dark_theme_interceptor.js',
]);

// Замороженный список: роль → файлы, где она сейчас используется без объявления.
// Каждая строка — незакрытый долг. Убирать записи можно и нужно; добавлять —
// только вместе с решением, почему роль остаётся необъявленной.
const BASELINE = {
  'v4-accent': ['styles/modules/000-base-and-gamification.css'],
  'v4-act-line': [
    'styles/modules/733-ui-v4-reports.css',
    'styles/modules/734-ui-v4-insights.css',
  ],
  'v4-bad': ['styles/modules/730-widgets-dashboard.css'],
  'v4-card-bg': ['styles/modules/000-base-and-gamification.css'],
  'v4-card-border': [
    'styles/modules/000-base-and-gamification.css',
    'styles/modules/400-water-and-hydration.css',
  ],
  'v4-ink-1': ['styles/modules/000-base-and-gamification.css'],
  'v4-ok': [
    'heys_widgets_ui_v1.js',
    'styles/modules/730-widgets-dashboard.css',
  ],
  'v4-sand-green-ink': ['styles/modules/715-yesterday-verify.css'],
  'v4-sand-ok-bg': ['styles/modules/611-aps-product-card.css'],
  'v4-sand-tint-green': ['styles/modules/715-yesterday-verify.css'],
  'v4-sand-water': ['styles/modules/730-widgets-dashboard.css'],
  'v4-sand-wave': ['styles/modules/730-widgets-dashboard.css'],
  'v4-surface-2': ['styles/modules/000-base-and-gamification.css'],
  'v4-warn': ['styles/modules/730-widgets-dashboard.css'],
  'v4-warn-fill': ['styles/modules/733-ui-v4-reports.css'],
};

function collect(dir = WEB, acc = [], base = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collect(path.join(dir, entry.name), acc, rel);
      continue;
    }
    if (!/\.(css|js)$/.test(entry.name)) continue;
    if (SKIP_FILE.test(entry.name)) continue;
    acc.push(rel);
  }
  return acc;
}

function scanUndefinedRoles() {
  const files = collect();
  const sources = new Map();
  const defined = new Set();

  for (const rel of files) {
    const src = fs.readFileSync(path.join(WEB, rel), 'utf8');
    sources.set(rel, src);
    // Объявления собираются по тексту БЕЗ комментариев. Иначе проза вида
    // «роли под --v4-warn-fill: в наборе нет» считается объявлением: имя
    // рядом с двоеточием выглядит для регулярки так же, как настоящая строка
    // палитры. Цена ошибки не в шуме, а в тишине — гейт объявляет чужой долг
    // закрытым и требует убрать запись из BASELINE, после чего долг перестаёт
    // считаться вовсе. Нашла heys-v2-27, объяснив в комментарии как раз
    // неопределённую роль. Снимаются только блочные /* … */: `//` в JS
    // трогать нельзя — там протоколы в ссылках, и обрезка строки съела бы
    // настоящие объявления.
    const код = src.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of код.matchAll(/--(v4-[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
  }

  const found = new Map();
  for (const [rel, src] of sources) {
    for (const m of src.matchAll(/var\(\s*--(v4-[a-z0-9-]+)/g)) {
      const role = m[1];
      if (defined.has(role)) continue;
      if (!found.has(role)) found.set(role, new Set());
      found.get(role).add(rel);
    }
  }
  return found;
}

// --- Проверка 2: голая var(--v4-роль) без запасного значения ----------------

const BARE_VAR_RE = /var\(\s*(--v4-[a-z0-9-]+)\s*\)/g;
const INTENT_MARK = /v4-(?:intentional|mark-\d)|расформиров/i;

// Маркер ищем в окне «две строки выше — до конца текущей»: столько занимает
// обычная оговорка перед объявлением.
function hasIntentNearby(src, index) {
  const from = src.lastIndexOf('\n', src.lastIndexOf('\n', index - 1) - 1);
  const to = src.indexOf('\n', index);
  return INTENT_MARK.test(src.slice(Math.max(0, from), to === -1 ? src.length : to));
}

// Скоуп не фиксирован списком: каждый следующий батч перекраски добавляет свои
// файлы, и гейт должен ловить их без правки скрипта. Берём всё, где уже есть
// роли v4, кроме сборок и копий.
function collectBareScope(dir = WEB, acc = [], base = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectBareScope(path.join(dir, entry.name), acc, rel);
      continue;
    }
    if (!/\.(css|js)$/.test(entry.name)) continue;
    if (BARE_SKIP_FILES.has(entry.name)) continue;
    const src = fs.readFileSync(path.join(dir, entry.name), 'utf8');
    if (src.includes('var(--v4-')) acc.push(rel);
  }
  return acc;
}

function scanBareRoles() {
  const out = [];
  for (const rel of collectBareScope()) {
    const src = fs.readFileSync(path.join(WEB, rel), 'utf8');
    for (const m of src.matchAll(BARE_VAR_RE)) {
      if (hasIntentNearby(src, m.index)) continue;
      out.push({ file: rel, line: src.slice(0, m.index).split('\n').length, role: m[1] });
    }
  }
  return out;
}

function compare(found) {
  const added = [];
  const resolved = [];
  const moved = [];

  for (const [role, files] of found) {
    const known = BASELINE[role];
    if (!known) {
      added.push({ role, files: [...files].sort() });
      continue;
    }
    const now = [...files].sort();
    const extra = now.filter((f) => !known.includes(f));
    if (extra.length) moved.push({ role, extra });
  }
  for (const role of Object.keys(BASELINE)) {
    if (!found.has(role)) resolved.push(role);
  }
  return { added, resolved, moved };
}

function formatBaseline(found) {
  const lines = [];
  for (const [role, files] of [...found].sort((a, b) => a[0].localeCompare(b[0]))) {
    const list = [...files].sort();
    if (list.length === 1) {
      lines.push(`  '${role}': ['${list[0]}'],`);
      continue;
    }
    lines.push(`  '${role}': [`);
    for (const file of list) lines.push(`    '${file}',`);
    lines.push('  ],');
  }
  return `const BASELINE = {\n${lines.join('\n')}\n};`;
}

// Список обязан уменьшаться, поэтому переписывать его руками неудобно и легко
// ошибиться: флаг перезаписывает блок фактическим состоянием кода.
function updateBaseline(found) {
  const self = fileURLToPath(import.meta.url);
  const src = fs.readFileSync(self, 'utf8');
  const start = src.indexOf('const BASELINE = {');
  const end = src.indexOf('\n};', start) + '\n};'.length;
  fs.writeFileSync(self, src.slice(0, start) + formatBaseline(found) + src.slice(end));
  console.log(`Список переписан: ${found.size} записей.`);
}

function runCli() {
  const found = scanUndefinedRoles();

  if (process.argv.includes('--update-baseline')) {
    updateBaseline(found);
    return;
  }

  const bare = scanBareRoles();

  if (process.argv.includes('--list')) {
    console.log(`Неопределённых ролей v4 сейчас: ${found.size}`);
    for (const [role, files] of [...found].sort()) {
      console.log(`  --${role}: ${[...files].sort().join(', ')}`);
    }
    console.log(`Голых var() без запасного значения и без маркера: ${bare.length}`);
    for (const item of bare) console.log(`  ${item.file}:${item.line} ${item.role}`);
    return;
  }

  const { added, resolved, moved } = compare(found);
  let failed = false;

  if (bare.length) {
    failed = true;
    console.error('\n❌ var(--v4-роль) без запасного значения — прежний цвет потерян:');
    for (const item of bare.slice(0, 20)) {
      console.error(`  ${item.file}:${item.line} ${item.role}`);
    }
    if (bare.length > 20) console.error(`  … ещё ${bare.length - 20}`);
    console.error('\nЛибо дописать запасное значение var(--роль, #прежний),');
    console.error('либо поставить рядом маркер намеренности (v4-intentional / v4-mark-N).');
  }

  if (added.length) {
    failed = true;
    console.error('\n❌ Новые неопределённые роли v4 — цвет не будет следовать набору:');
    for (const item of added) {
      console.error(`  --${item.role} → ${item.files.join(', ')}`);
    }
    console.error('\nЛибо объявить роль во всех четырёх наборах');
    console.error('(apps/web/styles/modules/002-ui-v4-palette-roles.css),');
    console.error('либо взять существующую роль с нужным смыслом.');
  }

  if (moved.length) {
    failed = true;
    console.error('\n❌ Известная неопределённая роль расползлась по новым файлам:');
    for (const item of moved) {
      console.error(`  --${item.role} → ${item.extra.join(', ')}`);
    }
  }

  if (resolved.length) {
    failed = true;
    console.error('\n❌ Долг закрыт, но остался в списке — уберите записи из BASELINE:');
    for (const role of resolved) console.error(`  --${role}`);
    console.error(`\n${path.relative(ROOT, fileURLToPath(import.meta.url))}`);
  }

  if (failed) process.exit(1);

  console.log(`Неопределённых ролей v4: ${found.size} — все известны и не расползлись.`);
  console.log('Голых var(--v4-*) без запасного значения и без маркера нет.');
}

// Модуль импортируется тестом, поэтому отчёт печатается только при прямом
// вызове: иначе импорт ронял бы чужой процесс своим process.exit.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
