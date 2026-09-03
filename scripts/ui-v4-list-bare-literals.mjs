#!/usr/bin/env node
// Опись голых литералов цвета — второй источник песочного на синем.
//
//   node scripts/ui-v4-list-bare-literals.mjs            # пересобрать опись
//   node scripts/ui-v4-list-bare-literals.mjs --counts   # только числа
//
// Первая опись (UI_V4_SAND_ROLES_INVENTORY.md) описывает роли с именем набора.
// Эта — литералы, у которых роли нет вовсе: их не видит ни гейт неопределённых
// ролей (роли нет), ни гейт чужих запасных значений (запасного значения нет —
// есть само значение).
//
// Правило счёта живёт здесь, а не в прозе документа. Число, которое нельзя
// повторить командой, через неделю превращается в спор о том, ту ли опись
// размечали, — а размечает её человек руками и не один час.
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'docs/ui/UI_V4_BARE_LITERALS_INVENTORY.md';
const PALETTE_FILE = 'apps/web/styles/modules/002-ui-v4-palette-roles.css';
// Файлы палитры описывают цвет по определению — они не «места».
const PALETTE = new Set(['002-ui-v4-palette-roles.css', '001-design-tokens.css']);

// Мёртвый цвет: значение лежит в таблице данных, ключ которой никто не читает,
// — до экрана оно не доходит вовсе. Размечать такое нельзя: решение про героя
// принимается для места, которого нет. Источник списка и разбор каждого случая
// — docs/ui/UI_V4_DEAD_COLORS.md. Пересечение с этой описью маленькое и
// перечислено поимённо, чтобы при росте того списка расхождение было видно.
// Ключ — файл, семейство и значение. Одна только пара «файл + значение»
// вычла бы лишнее: те же #fef3c7 и #92400e стоят в этом файле ещё в шести
// живых местах, под другими семействами.
const DEAD = [
  // friendlySummaries внутри CONSENT_TEXTS — к ветке ноль обращений
  { file: 'heys_consents_v1.js', family: 'CONSENT_TEXTS', value: '#fef3c7' },
  { file: 'heys_consents_v1.js', family: 'CONSENT_TEXTS', value: '#f59e0b' },
  { file: 'heys_consents_v1.js', family: 'CONSENT_TEXTS', value: '#92400e' },
  // RARITY_COLORS.legendary — таблица экспортируется, но её не читает никто:
  // ни по имени ключа, ни индексом по .rarity
  { file: 'heys_gamification_v1.js', family: 'RARITY_COLORS', value: '#eab308' },
];
let deadHits = 0;
const isDead = (file, family, value) =>
  DEAD.some(
    (d) => d.file === file && d.family === family && d.value.toLowerCase() === value.toLowerCase(),
  );

// ── что считается литералом ────────────────────────────────────────────────
const COMMENT = /\/\*[\s\S]*?\*\//g;
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^()]*\)/g;
const VAR_HEAD = /var\(\s*--[\w-]+\s*,/;

// Запасное значение внутри var(--роль, …) местом не считается: роль там есть.
function stripVarFallbacks(value) {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const rest = value.slice(i);
    const m = VAR_HEAD.exec(rest);
    if (!m) return out + rest;
    out += rest.slice(0, m.index);
    let depth = 0;
    let j = i + m.index;
    for (; j < value.length; j++) {
      if (value[j] === '(') depth++;
      else if (value[j] === ')' && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

// ── какой цвет считается тёплым ────────────────────────────────────────────
function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => Math.round(v * 255));
}

function toRgb(literal) {
  const s = literal.trim().toLowerCase();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      h = h
        .slice(0, 3)
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (h.length < 6) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const n = s.match(/-?[\d.]+/g);
  if (!n || n.length < 3) return null;
  if (s.startsWith('hsl'))
    return hslToRgb(Number(n[0]) / 360, Number(n[1]) / 100, Number(n[2]) / 100);
  return n.slice(0, 3).map((x) => Math.min(255, Math.round(Number(x))));
}

// Тёплый = оттенок 12–55°, насыщенность от 10 %, не серый. Альфа НЕ влияет:
// тёплая тень под 8 % на синей поверхности всё равно тёплая, и вопрос «какой
// она должна быть в синем наборе» для неё стоит так же, как для заливки.
function isWarm(literal) {
  const c = toRgb(literal);
  if (!c) return false;
  const [r, g, b] = c;
  if (r === g && g === b) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (max / 255 < 0.04 || d / max < 0.1) return false;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (((h * 60) % 360) + 360) % 360;
  return h >= 12 && h <= 55;
}

function alphaOf(literal) {
  const s = literal.trim().toLowerCase();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 4) return parseInt(h[3] + h[3], 16) / 255;
    if (h.length === 8) return parseInt(h.slice(6, 8), 16) / 255;
    return 1;
  }
  const n = s.match(/-?[\d.]+/g) || [];
  return /^(rgba|hsla)/.test(s) && n.length >= 4 ? Number(n[3]) : 1;
}

// ── чтение файлов ──────────────────────────────────────────────────────────
function scanCss(file) {
  const src = fs.readFileSync(file, 'utf8').replace(COMMENT, ' ');
  const out = new Map();
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = m[1].trim().replace(/\s+/g, ' ');
    // Сам @media местом не бывает; его внутренности разбираются отдельно.
    if (head.startsWith('@')) continue;
    const cls = head.match(/\.([A-Za-z][\w-]*)/);
    // Правило без класса — шаг keyframes, :root, элементный селектор — не
    // выбрасывается: иначе место исчезает из счёта молча.
    const family = cls ? '.' + cls[1].split('--')[0] : head.slice(0, 40);
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      // Объявление роли в файле палитры — это и есть палитра, а не место; такие
      // файлы сюда не попадают вовсе. Но модуль, объявляющий СВОЮ переменную с
      // зашитым цветом (--profile-tone-wash: #d97e3b), палитре не следует так
      // же, как литерал, и первая опись его тоже не видит: имени набора в нём
      // нет. Считаем — под именем самой переменной, оно и есть локатор.
      const key = prop.startsWith('--') ? prop : family;
      for (const c of stripVarFallbacks(decl.slice(i + 1)).matchAll(COLOR)) {
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(c[0].trim());
      }
    }
  }
  return out;
}

function stripJsLineComments(src) {
  return src
    .split('\n')
    .map((line) => {
      let quote = null;
      for (let i = 0; i < line.length - 1; i++) {
        const ch = line[i];
        if (quote) {
          if (ch === '\\') i++;
          else if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
        else if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

function scanJs(file) {
  const lines = stripJsLineComments(fs.readFileSync(file, 'utf8').replace(COMMENT, ' ')).split(
    '\n',
  );
  const out = new Map();
  lines.forEach((line, idx) => {
    for (const c of stripVarFallbacks(line).matchAll(COLOR)) {
      // Ближайшее объемлющее имя — единственный локатор, который есть у
      // инлайн-стиля: селектора у него нет.
      let owner = '?';
      for (let k = idx; k >= Math.max(0, idx - 400); k--) {
        const om = lines[k].match(/(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=(]/);
        if (om) {
          owner = om[1];
          break;
        }
      }
      if (!out.has(owner)) out.set(owner, []);
      out.get(owner).push(c[0].trim());
    }
  });
  return out;
}

// ── охват ──────────────────────────────────────────────────────────────────
function listFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'public' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, acc);
    else if (/\.(js|css)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const BY_NAME = new Map();
for (const p of listFiles('apps/web')) {
  const b = path.basename(p);
  if (!BY_NAME.has(b)) BY_NAME.set(b, []);
  BY_NAME.get(b).push(p);
}

function resolve(name) {
  const base = name.split('/').pop();
  const exact = BY_NAME.get(base);
  if (exact) return exact.find((p) => p.replace(/\\/g, '/').endsWith(name)) || exact[0];
  // Обоснования называют файлы короткой формой — «consents.js» вместо
  // heys_consents_v1.js. Без этого восемь живых файлов молча не находились.
  const stem = base.replace(/\.(js|css)$/, '');
  const ext = base.slice(stem.length);
  const near = [...BY_NAME.keys()].filter((n) => n.endsWith(ext) && n.includes(stem));
  return near.length === 1 ? BY_NAME.get(near[0])[0] : null;
}

const VERDICT_DIR = 'docs/ui/verdicts';
const zoneFiles = new Map();
const openZones = [];
const zoneNames = fs.readdirSync(VERDICT_DIR).filter((n) => n.endsWith('.json'));
for (const f of zoneNames) {
  const zone = f.slice(0, -5);
  const rows = Object.values(
    JSON.parse(fs.readFileSync(path.join(VERDICT_DIR, f), 'utf8')).rows || {},
  );
  // Зона закрыта, когда в ней не осталось «?» — строк, про которые никто не
  // сказал, сошлось или нет.
  if (rows.some((r) => r.v === '?')) {
    openZones.push(zone);
    continue;
  }
  for (const r of rows) {
    for (const m of (r.f || '').matchAll(/\b([\w\-./]+\.(?:css|js))\b/g)) {
      if (m[1].includes('.test.')) continue;
      if (!zoneFiles.has(m[1])) zoneFiles.set(m[1], new Set());
      zoneFiles.get(m[1]).add(zone);
    }
  }
}

// Модуль стилей попадает в охват по имени, даже если его не назвал ни один
// вердикт: иначе ноль по нему читается как «чисто», хотя значит «не смотрели».
for (const d of ['apps/web/styles/modules', 'apps/web/styles']) {
  for (const n of fs.readdirSync(d).filter((x) => x.endsWith('.css'))) {
    if (!PALETTE.has(n) && !zoneFiles.has(n)) zoneFiles.set(n, new Set());
  }
}

// Обоснования называют один и тот же файл двумя формами — «day/_meals.js» и
// «_meals.js», «consents.js» и «heys_consents_v1.js». Схлопываем по пути, иначе
// файл попадёт в опись дважды и его места удвоятся в итоге.
const byPath = new Map();
const unresolved = [];
for (const [name, zones] of [...zoneFiles].sort()) {
  if (PALETTE.has(name.split('/').pop())) continue;
  const p = resolve(name);
  if (!p) {
    unresolved.push(name);
    continue;
  }
  if (!byPath.has(p)) byPath.set(p, new Set());
  for (const z of zones) byPath.get(p).add(z);
}

const files = [];
let scannedCss = 0;
let scannedJs = 0;
for (const [p, zones] of byPath) {
  const isCss = p.endsWith('.css');
  if (isCss) scannedCss++;
  else scannedJs++;
  const raw = isCss ? scanCss(p) : scanJs(p);
  const base = path.basename(p);
  const fam = new Map();
  for (const [k, arr] of raw) {
    const keep = arr.filter((c) => {
      if (!isWarm(c)) return false;
      if (isDead(base, k, c)) {
        deadHits++;
        return false;
      }
      return true;
    });
    if (keep.length) fam.set(k, keep);
  }
  files.push({
    name: path.basename(p),
    zones: [...zones].sort(),
    fam,
    total: [...raw.values()].reduce((s, a) => s + a.length, 0),
    isCss,
  });
}

const size = (f) => [...f.fam.values()].reduce((s, a) => s + a.length, 0);
const all = files.flatMap((f) => [...f.fam.values()].flat());
const totalLiterals = files.reduce((s, f) => s + f.total, 0);
const counts = {
  'только hex': all.filter((c) => c.startsWith('#') && alphaOf(c) >= 0.999).length,
  'hex + непрозрачный `rgb()`': all.filter((c) => c.startsWith('#') || alphaOf(c) >= 0.999).length,
  'hex + `rgba()` с альфой ≥ 0,5': all.filter((c) => alphaOf(c) >= 0.5).length,
  'все, включая полупрозрачные': all.length,
};

// Вычет, который перестал совпадать, — это молчаливый ноль: место вернулось в
// опись, а никто не заметил. Поэтому расхождение говорится вслух.
if (deadHits !== DEAD.length) {
  console.warn(
    `Внимание: мёртвых мест вычтено ${deadHits} из ${DEAD.length} — ` +
      'значение или семейство изменилось, сверьтесь с docs/ui/UI_V4_DEAD_COLORS.md.',
  );
}

if (process.argv.includes('--counts')) {
  console.log(`Просмотрено: ${scannedCss} модулей стилей, ${scannedJs} файлов кода.`);
  console.log(
    `Голых литералов ${totalLiterals}, из них тёплых ${all.length} (вычтено мёртвых: ${deadHits}).`,
  );
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.replace(/`/g, '')}: ${v}`);
  if (unresolved.length) console.log(`Не найдено на диске: ${unresolved.join(', ')}`);
  process.exit(0);
}

// ── звёздочка: литерал в точности равен значению песочной роли ─────────────
const paletteSrc = fs.readFileSync(PALETTE_FILE, 'utf8');
function setValues(sel) {
  const i = paletteSrc.indexOf(sel);
  const j = paletteSrc.indexOf('{', i);
  const k = paletteSrc.indexOf('\n}', j);
  const out = new Set();
  for (const m of paletteSrc.slice(j, k).matchAll(/--[\w-]+\s*:\s*([^;]+);/g)) {
    const v = m[1].trim().toLowerCase();
    if (/^(#[0-9a-f]{3,8}|(rgba?|hsla?)\([^()]*\))$/.test(v)) out.add(v);
  }
  return out;
}
const sandOnly = new Set([
  ...setValues('[data-theme-id="sand"],'),
  ...setValues('[data-theme-id="sand-dark"],'),
]);
for (const v of [
  ...setValues('[data-theme-id="blue"],'),
  ...setValues('[data-theme-id="blue-dark"],'),
]) {
  sandOnly.delete(v);
}
const star = (v) => (sandOnly.has(v.toLowerCase()) ? '*' : '');
const exact = all.filter((c) => star(c)).length;

// ── ведра: размечается значение, а не место ────────────────────────────────
//
//   node scripts/ui-v4-list-bare-literals.mjs --buckets
//
// Решение дизайнера 4 сентября: разметки «место за местом» не будет, потому что
// она неверна по существу — 2294 тёплых места это три разных множества,
// склеенных признаком «тёплый», и знак «герой» применим только к одному.
// Ведро 1 чинится механически без дизайнера; ведро 2 решается зоной, а не
// тоном; ведро 3 то же, но выглядит ролью и потому переживает обе описи.
//
// «Герой» в наборе ровно один — `--fab` с парой `--on-fab` (плавающая кнопка,
// строка «вид кнопки» в home-widgets). Второе такое место, главная кнопка шага
// приёма, снято тем же решением: два исключения по одному признаку — это уже
// вторая система.
const CANVAS_CSS =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/v4-canvas.css';

// Янтарная лестница прежней системы: в песочном наборе таких тонов нет ни
// одного, поэтому «намеренным тёплым тоном» их помечать нельзя — это
// легализовало бы палитру, которую v4 не принимал.
const AMBER_LADDER = [
  '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#eab308', '#facc15',
  '#fde047', '#d97706', '#b45309', '#92400e', '#78350f', '#713f12', '#451a03',
  '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407', '#fdba74',
  '#fed7aa', '#ffedd5', '#fb923c', '#ca8a04', '#a16207', '#854d0e',
];

if (process.argv.includes('--buckets')) {
  const key = (v) => {
    const c = toRgb(v);
    return c ? c.join(',') : null;
  };
  const keyA = (v) => {
    const c = toRgb(v);
    return c ? c.join(',') + '/' + alphaOf(v).toFixed(3) : null;
  };

  // Таблица ролей: все четыре набора продуктовой палитры плюс канвас дизайнера.
  const roleSrc =
    paletteSrc + (fs.existsSync(CANVAS_CSS) ? fs.readFileSync(CANVAS_CSS, 'utf8') : '');
  if (!fs.existsSync(CANVAS_CSS)) {
    console.warn(`Внимание: канвас ролей не найден (${CANVAS_CSS}) — ведро 1 считано только по продуктовой палитре.`);
  }
  const roleExact = new Set();
  const roleHue = new Set();
  for (const m of roleSrc.matchAll(/--[\w-]+\s*:\s*([^;{}]+);/g)) {
    const v = m[1].trim();
    if (!/^(#[0-9a-fA-F]{3,8}|(rgba?|hsla?)\([^()]*\))$/.test(v)) continue;
    const a = keyA(v);
    const h = key(v);
    if (a) roleExact.add(a);
    if (h) roleHue.add(h);
  }
  const amber = new Set(AMBER_LADDER.map(key).filter(Boolean));

  const places = [];
  for (const f of files) {
    for (const [fam, arr] of f.fam) {
      for (const v of arr) places.push({ file: f.name, zones: f.zones, fam, v });
    }
  }

  const B = { 1: [], 2: [], 3: [], 0: [] };
  const alphaOnly = [];
  for (const p of places) {
    const a = keyA(p.v);
    const h = key(p.v);
    if (a && roleExact.has(a)) {
      B[1].push(p);
      continue;
    }
    if (h && amber.has(h)) {
      B[2].push(p);
      continue;
    }
    if (p.fam.startsWith('--')) {
      B[3].push(p);
      continue;
    }
    if (h && roleHue.has(h)) alphaOnly.push(p);
    B[0].push(p);
  }

  const pct = (n) => ((n / places.length) * 100).toFixed(0) + ' %';
  console.log(`Тёплых мест всего: ${places.length}`);
  console.log(`  ведро 1 · значение в точности равно роли набора: ${B[1].length} (${pct(B[1].length)})`);
  console.log(`  ведро 2 · янтарная лестница прежней системы:     ${B[2].length} (${pct(B[2].length)})`);
  console.log(`  ведро 3 · своя переменная модуля с цветом:       ${B[3].length} (${pct(B[3].length)})`);
  console.log(`  вне трёх вёдер:                                  ${B[0].length} (${pct(B[0].length)})`);
  console.log(
    `    из них тон роли при другой прозрачности: ${alphaOnly.length} — механически не заменяются, роль не даёт этой альфы`,
  );

  // Ведро 2 решается зоной, поэтому по нему нужен список зон, а не мест.
  const z2 = new Map();
  for (const p of B[2]) {
    for (const z of p.zones.length ? p.zones : ['— вне зон вердиктов']) {
      if (!z2.has(z)) z2.set(z, new Set());
      z2.get(z).add(p.file);
    }
  }
  console.log('');
  console.log('Ведро 2 по зонам (зона — файлов, мест):');
  const cnt2 = new Map();
  for (const p of B[2]) {
    for (const z of p.zones.length ? p.zones : ['— вне зон вердиктов']) {
      cnt2.set(z, (cnt2.get(z) || 0) + 1);
    }
  }
  for (const [z, fs_] of [...z2.entries()].sort((a, b) => cnt2.get(b[0]) - cnt2.get(a[0]))) {
    console.log(`  ${z} — ${fs_.size} файлов, ${cnt2.get(z)} мест`);
  }
  console.log(
    '  (файл, названный вердиктами нескольких зон, считается в каждой — сумма по зонам больше числа мест)',
  );

  // Большая часть ведра 2 лежит в файлах, которых не назвал ни один вердикт:
  // там единица решения — файл, и «список зон» для него пуст по построению.
  console.log('');
  console.log('Ведро 2 по файлам (файл — мест, зоны):');
  const f2 = new Map();
  for (const p of B[2]) {
    if (!f2.has(p.file)) f2.set(p.file, { n: 0, zones: p.zones });
    f2.get(p.file).n++;
  }
  for (const [n, d] of [...f2.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${String(d.n).padStart(4)}  ${n}${d.zones.length ? '  · ' + d.zones.join(', ') : ''}`);
  }

  console.log('');
  console.log('Ведро 3 по переменным (переменная — мест):');
  const v3 = new Map();
  for (const p of B[3]) v3.set(p.fam, (v3.get(p.fam) || 0) + 1);
  for (const [n, c] of [...v3.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${n} — ${c}`);
  }
  process.exit(0);
}

// ── документ ───────────────────────────────────────────────────────────────
const byCount = (a, b) => size(b) - size(a) || a.name.localeCompare(b.name);
const named = files.filter((f) => f.fam.size && f.zones.length).sort(byCount);
const unnamed = files.filter((f) => f.fam.size && !f.zones.length).sort(byCount);

const L = [];
const W = (...s) => L.push(...s);
W('# Голые литералы цвета — опись для разметки', '');
W('Собирается командой `node scripts/ui-v4-list-bare-literals.mjs`: правило счёта');
W('живёт в скрипте, поэтому число можно повторить, а не только прочитать.', '');
W('Вторая опись к [`UI_V4_SAND_ROLES_INVENTORY.md`](UI_V4_SAND_ROLES_INVENTORY.md).');
W('Песочное на синем приходит из **трёх** источников, и до сегодняшнего дня в');
W('списках было два:', '');
W('1. **Роль с именем набора** — `--v4-sand-hero`. Держит песочное значение и в');
W('   синих наборах. Это первая опись; заменяется на общую роль механически.');
W('2. **Голый литерал** — `#efe3cf` прямо в объявлении. Роли у него нет вовсе,');
W('   поэтому его не видит ни гейт неопределённых ролей, ни гейт чужих запасных');
W('   значений. Это основная часть здешнего списка.');
W('3. **Своя переменная модуля** — `--profile-tone-wash: #d97e3b`. Выглядит как');
W('   роль, но набору не следует, а имени набора в ней нет, поэтому первая опись');
W('   её тоже не берёт. Таких мест 139 в 17 файлах, и до 31 августа они не');
W('   попадали **ни в один** список: увидеть их можно было только сложив обе');
W('   описи и не найдя там того, что видно на экране.', '');
W('Первый источник размечается по первой описи, второй и третий — по этой. После');
W('разметки одной только первой описи места из второго и третьего **останутся');
W('песочными**, и заметить это будет некому.', '');
W('**Что сделать с этим файлом.** Разметьте так же, как первую опись: `герой` в');
W('начале строки семейства там, где тёплый тон назван контрактом намеренно.');
W('Неотмеченное — замена на роль отдельной задачей.', '');
W('## Что считается местом — полное правило', '');
W('1. Цветной токен: `#hex` (3, 4, 6 или 8 знаков), `rgb()`, `rgba()`, `hsl()`, `hsla()`.');
W('2. Комментарии вырезаются до счёта: в этом коде принято объяснять словами,');
W('   почему литерал заменён ролью, и такие упоминания цветом на экране не являются.');
W('3. Запасное значение внутри `var(--роль, …)` местом **не** считается — роль там');
W('   есть, и это отдельный вопрос со своим гейтом.');
W('4. Файлы палитры (`002-ui-v4-palette-roles.css`, `001-design-tokens.css`) не');
W('   смотрятся вовсе: объявить там цвет — это и значит быть палитрой. Но модуль,');
W('   объявляющий **свою** переменную с зашитым цветом (`--profile-tone-wash:');
W('   #d97e3b`), палитре не следует так же, как литерал, и первая опись его тоже');
W('   не видит — имени набора в нём нет. Такие места считаются, и стоят под');
W('   именем самой переменной: в таблице их видно по `--` вместо точки.');
W('5. Правило без класса в селекторе (шаг `@keyframes`, `:root`, элементный');
W('   селектор) считается наравне с остальными.');
W('6. Считаются **места**, а не разные значения: один `#efe3cf` в пяти объявлениях —');
W('   пять мест.');
W('7. Тёплый цвет: оттенок 12–55°, насыщенность от 10 %, не серый. **Альфа не');
W('   влияет** — тёплая тень под 8 % на синей поверхности всё равно тёплая.');
W('8. Мёртвый цвет вычитается: значение в таблице данных, ключ которой никто не');
W(`   читает, до экрана не доходит вовсе. Вычтено ${deadHits} — разбор в`);
W('   [`UI_V4_DEAD_COLORS.md`](UI_V4_DEAD_COLORS.md), список в скрипте поимённо.', '');
W('**Насыщенность считается как chroma, а не как saturation из HLS** — это');
W('ловушка, стоившая одной перепроверке целого захода. У почти белых тёплых тонов');
W('HLS-насыщенность раздута по построению: `#f7f5f0` даёт по HLS 0,30 при chroma');
W('0,03, а кремовый `#fff8ea` — ровно 1,00. Со счётом по HLS в тёплые попадают');
W('нейтральные тёплые серые: рамки и подложки вроде `#edebe5` и `#f1efe9`, которых');
W('в мессенджере целая палитра. Разница на одном файле — 57 против 33.', '');
W('Седьмой пункт спорный, поэтому вот то же множество под четырьмя правилами:', '');
W('| правило | мест |', '| --- | ---: |');
for (const [k, v] of Object.entries(counts)) W(`| ${k} | ${v} |`);
W('', `В описи — последняя строка, **${all.length}**.`, '');
W('## Охват', '');
W(`Просмотрены все модули стилей (${scannedCss}) и файлы кода, названные обоснованиями`);
W(`вердиктов закрытых зон (${scannedJs}). Закрытых зон ${zoneNames.length - openZones.length};`);
W(`незакрытой считается та, где ещё стоят «?» — сейчас это`);
W(`${openZones.map((z) => '`' + z + '`').join(', ')}. Всего голых`);
W(`литералов в этих файлах ${totalLiterals}; тёплых ${all.length}. Остальные палитре тоже не`);
W('следуют, но песочными экран не делают, и это отдельный разговор.', '');
W('Файл, которого здесь нет, **просмотрен и чист**: его отсутствие означает ноль, а');
W('не «не смотрели». Так, `733-ui-v4-reports.css` и `734-ui-v4-curator-panel.css` не');
W('содержат ни одного голого литерала — их цвета либо роли, либо запасные значения');
W('при ролях, либо упоминания в комментариях.', '');
W(`**Звёздочка** у литерала означает, что это в точности значение песочной роли и ни`);
W(`одной синей — такое место переводится на роль без разговора. Их ${exact}.`, '');
W(`Всего мест: **${all.length}** в ${named.length + unnamed.length} файлах.`, '', '---', '');

function table(group) {
  for (const f of group) {
    W(`### \`${f.name}\` — ${size(f)}`, '');
    if (f.zones.length) W(`Зоны: ${f.zones.map((z) => '`' + z + '`').join(', ')}`, '');
    W(`| ${f.isCss ? 'семейство' : 'где в коде'} | мест | литералы |`, '| --- | ---: | --- |');
    const rows = [...f.fam].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    for (const [fam, arr] of rows) {
      const uniq = [...new Set(arr)];
      let shown = uniq
        .slice(0, 6)
        .map((u) => `\`${u}\`${star(u)}`)
        .join(', ');
      if (uniq.length > 6) shown += `, … (+${uniq.length - 6})`;
      W(`| \`${fam}\` | ${arr.length} | ${shown} |`);
    }
    W('');
  }
}

W('## Файлы, названные обоснованиями закрытых зон', '');
table(named);
W('## Модули, которых вердикты не называют', '');
W('Эти файлы не назвал ни один вердикт закрытой зоны. Причины разные, и их важно не');
W('путать. Большинство — легаси-экраны, которых v4 не касался вовсе: им нужна своя');
W('зона, а не решение про героя. Но здесь же лежит `731-ui-v4-activity.css` — модуль');
W('**закрытой** зоны `tab-activity`, чьи вердикты ни разу не сослались на свой файл.');
W('Такие места разметки требуют наравне с первым разделом, и найти их можно было');
W('только просмотром по имени файла, а не по обоснованиям.', '');
table(unnamed);

fs.writeFileSync(OUT, L.join('\n') + '\n');
console.log(`${OUT}: ${all.length} мест в ${named.length + unnamed.length} файлах.`);
