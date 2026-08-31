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
      // Объявление роли — это и есть палитра, а не место.
      if (decl.slice(0, i).trim().startsWith('--')) continue;
      for (const c of stripVarFallbacks(decl.slice(i + 1)).matchAll(COLOR)) {
        if (!out.has(family)) out.set(family, []);
        out.get(family).push(c[0].trim());
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
W('Та описывает роли с именем набора; эта — второй источник того же песочного на');
W('синем, который первая не видит по построению. Роль `--v4-sand-*` заменяется на');
W('общую механически; литерал вида `#efe3cf` не заменяется ничем, и после разметки');
W('первой описи эти места **останутся песочными**.', '');
W('**Что сделать с этим файлом.** Разметьте так же, как первую опись: `герой` в');
W('начале строки семейства там, где тёплый тон назван контрактом намеренно.');
W('Неотмеченное — замена на роль отдельной задачей.', '');
W('## Что считается местом — полное правило', '');
W('1. Цветной токен: `#hex` (3, 4, 6 или 8 знаков), `rgb()`, `rgba()`, `hsl()`, `hsla()`.');
W('2. Комментарии вырезаются до счёта: в этом коде принято объяснять словами,');
W('   почему литерал заменён ролью, и такие упоминания цветом на экране не являются.');
W('3. Запасное значение внутри `var(--роль, …)` местом **не** считается — роль там');
W('   есть, и это отдельный вопрос со своим гейтом.');
W('4. Объявление самой роли (`--v4-…: #…`) не считается: это и есть палитра.');
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
