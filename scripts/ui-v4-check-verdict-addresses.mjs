#!/usr/bin/env node
/**
 * Проверяет, что доказательства вердиктов ещё ведут туда, куда обещают.
 *
 * Зачем. У каждой строки контракта в `docs/ui/verdicts/<зона>.json` три поля:
 * вердикт `v`, доказательство `f` (где это в коде) и отпечаток `h` — значение
 * строки контракта на момент разбора. Отпечаток охраняет сторону **контракта**:
 * `ui-v4-check-contract-drift.mjs` падает, когда строка изменилась, появилась
 * или исчезла.
 *
 * Сторону **кода** не охраняло ничто. Файл растёт, строки уезжают, класс
 * переименовывают — и доказательство протухает молча: строка контракта не
 * менялась, гейт зелёный, а адрес в `f` уже ведёт не туда. 31.08 так нашёлся
 * первый случай: вердикт «вид · полоса клетчатки и белка» ссылается на
 * `730-widgets-dashboard.css:12158-12161`, а там давно правило про пилюлю
 * подтверждения смены вида.
 *
 * Что проверяется, по убыванию уверенности:
 *
 *   1. `нет файла`      — файла из адреса не существует;
 *   2. `за концом`      — номер строки больше, чем строк в файле;
 *   3. `имя не в файле` — имя, названное доказательством (класс, функция,
 *                         переменная), в этом файле не встречается вовсе;
 *   4. `имя уехало`     — имя есть, но дальше окна от указанной строки.
 *
 * Первые три — дефекты: доказательство проверить нельзя. Четвёртое мягче
 * (файл мог просто вырасти) и держится храповиком: замороженное число может
 * только уменьшаться.
 *
 * Чего проверка НЕ делает и не притворяется, что делает: она не читает смысл
 * доказательства. «Полоса 4 px» рядом с нужным классом её устроит, даже если
 * там теперь 6 px. Это сторож адреса, а не сверки.
 *
 * Использование:
 *   node scripts/ui-v4-check-verdict-addresses.mjs [--zone=<имя>] [--list]
 *   node scripts/ui-v4-check-verdict-addresses.mjs --update-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { countShorthandAddresses } from './lib/ui-v4-addresses.mjs';

const VERDICTS = 'docs/ui/verdicts';
const ROOTS = ['apps/web', 'apps/landing', 'scripts', 'packages', 'database', '.'];
const WINDOW = 60; // строк в обе стороны — файлы правятся, адрес может слегка съехать

/**
 * Заморозка долга. Гейт не включают на несведённом: красный с рождения
 * выключат в первый день. Поэтому фиксируем текущее и падаем на росте, а
 * уменьшение просим переписать.
 */
const BASELINE = {
  truncated: 0,
  missing: 0,
  beyond: 0,
  absent: 32,
  moved: 273,
};

const args = process.argv.slice(2);
const zoneOnly = (args.find((a) => a.startsWith('--zone=')) || '').slice(7);
const wantList = args.includes('--list');
const updateBaseline = args.includes('--update-baseline');
const asJson = args.includes('--json');

/** Адрес: `<что-то>.<ext>:<число>[-<число>]`. Сокращения вида `ui:2513` пропускаем. */
const ADDRESS = /([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:js|mjs|ts|tsx|css|html|sql)):(\d+)/g;

/**
 * Имена из доказательства: латинские токены, похожие на идентификаторы.
 * Русская проза даёт кириллицу, поэтому латиница — почти всегда имя из кода.
 */
/**
 * Имя ловим вместе с приставкой: `.класс`, `--роль`. Приставка и есть признак
 * того, что перед нами имя из кода, а не слово из прозы вердикта.
 */
const NAME = /(--|\.)?[A-Za-z_$][A-Za-z0-9_$-]{3,}/g;

/**
 * Что считать именем. Проза вердикта написана по-русски, но латиницы в ней
 * хватает: `r999` — радиус, `ink14` — чернила 14 %, `gap4` — зазор, `variants`,
 * `screens`, `legal` — просто слова. 31.08 они дали 39 «пропавших имён» при
 * примерно десятке настоящих, и настоящие в этом шуме тонули. Поэтому имя
 * обязано **выглядеть** идентификатором: snake_case, camelCase либо приставка
 * класса/роли.
 */
function looksLikeIdentifier(token) {
  if (token.startsWith('.') || token.startsWith('--')) return true;
  if (token.includes('_')) return true;
  if (/[a-z][A-Z]/.test(token)) return true;
  return false;
}
const NOT_A_NAME = new Set([
  'px', 'css', 'js', 'mjs', 'html', 'json', 'rgba', 'true', 'false', 'null',
  'flex', 'grid', 'auto', 'none', 'span', 'div', 'left', 'right', 'top',
  'bottom', 'gap', 'min', 'max', 'width', 'height', 'color', 'font',
  'inset', 'blur', 'clamp', 'calc', 'var', 'data', 'test', 'spec', 'todo',
  'sand', 'blue', 'dark', 'light', 'good', 'text', 'fill', 'line', 'card',
  // Значения CSS в прозе — не имена из кода.
  'space-between', 'space-around', 'flex-start', 'flex-end', 'center',
  'absolute', 'relative', 'sticky', 'fixed', 'hidden', 'block', 'inline',
  'border-box', 'nowrap', 'wrap', 'ellipsis', 'currentcolor', 'inherit',
  // Куски путей.
  'apps', 'styles', 'modules', 'scripts', 'public', 'tests', '__tests__',
]);

/**
 * Указатель «базовое имя → пути». Строится один раз обходом дерева: угадывать
 * корни бесполезно — файлы лежат в двух десятках каталогов, и промах указателя
 * читался бы как «файла нет», то есть как дефект там, где его нет.
 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'public', 'dist', 'build', 'coverage', 'tmp',
  '.next', '.turbo', 'TOOLS', 'security-reports',
]);
const byBasename = new Map();
(function indexTree(dir, depth) {
  if (depth > 8) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.husky') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      indexTree(full, depth + 1);
      continue;
    }
    if (!/\.(js|mjs|ts|tsx|css|html|sql)$/.test(e.name)) continue;
    if (!byBasename.has(e.name)) byBasename.set(e.name, []);
    byBasename.get(e.name).push(full.split(path.sep).join('/'));
  }
})('.', 0);

const fileCache = new Map();
function resolveFile(rel) {
  if (fileCache.has(rel)) return fileCache.get(rel);
  let found = null;
  const norm = rel.split(path.sep).join('/');
  if (fs.existsSync(norm) && fs.statSync(norm).isFile()) found = norm;
  if (!found) {
    let candidates = byBasename.get(path.basename(norm)) || [];
    if (!candidates.length) {
      // Доказательства пишут имя сокращённо: `login_screen.js` вместо
      // `heys_login_screen_v1.js`, `insulin_wave_v4.js` вместо модуля внутри
      // виджетов. Это соглашение записи, а не отсутствие файла, и путать их
      // нельзя: иначе гейт объявит дефектом пятьдесят живых адресов.
      const stem = path.basename(norm).replace(/\.[a-z]+$/i, '');
      const ext = path.extname(norm);
      for (const [name, paths] of byBasename) {
        if (path.extname(name) !== ext) continue;
        if (!name.includes(stem)) continue;
        candidates = candidates.concat(paths);
      }
    }
    // Если путь дан частично, предпочитаем совпадение по хвосту.
    // Одноимённых файлов в дереве много (`index.html` — десяток). Выбор наугад
    // читается как «строка за концом файла», то есть как дефект там, где его
    // нет: 31.08 `index.html` так разрешился в `apps/genda-tests/src` на 33
    // строки и дал 61 ложное срабатывание. Поэтому — явный порядок предпочтения.
    const rank = (c) => {
      // `endsWith` годится только для частичного пути: для голого базового имени
      // ему удовлетворяет любой кандидат, и выбор снова падает на длину строки —
      // так `TESTS/index.html` обходил `apps/web/index.html`.
      if (norm.includes('/') && c.endsWith(norm)) return 0;
      if (/^apps\/web\/[^/]+$/.test(c)) return 1;
      if (c.startsWith('apps/web/styles/')) return 2;
      if (c.startsWith('apps/web/')) return 3;
      if (/__tests__|TESTS|bundle|genda|hobby/i.test(c)) return 9;
      return 5;
    };
    found = candidates.slice().sort((a, b) => rank(a) - rank(b) || a.length - b.length)[0] || null;
  }
  fileCache.set(rel, found);
  return found;
}

const textCache = new Map();
function linesOf(file) {
  if (!textCache.has(file)) {
    textCache.set(file, fs.readFileSync(file, 'utf8').split(/\r?\n/));
  }
  return textCache.get(file);
}

const problems = { truncated: [], missing: [], beyond: [], absent: [], moved: [] };
// Записи с несколькими адресами: имя из прозы не привязать к нужному адресу.
let multiAddressSkipped = 0;
let zones = 0;
let rowsSeen = 0;
let withEvidence = 0;
let addressesChecked = 0;
let shorthandSkipped = 0;

for (const file of fs.readdirSync(VERDICTS).filter((f) => f.endsWith('.json'))) {
  const zone = file.replace(/\.json$/, '');
  if (zoneOnly && zone !== zoneOnly) continue;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(VERDICTS, file), 'utf8'));
  } catch {
    continue;
  }
  const rows = data.rows;
  if (!rows) continue;
  zones += 1;
  for (const [key, row] of Object.entries(rows)) {
    rowsSeen += 1;
    const evidence = row && typeof row === 'object' ? row.f || '' : '';
    if (!evidence) continue;
    withEvidence += 1;

    // Сокращения без расширения (`ui:2513`, `css:10741`) адресом не считаем.
    shorthandSkipped += countShorthandAddresses(evidence);

    // Все файлы, названные этим доказательством, — их имена якорями не служат.
    const mentionedFiles = [...evidence.matchAll(/[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:js|mjs|ts|tsx|css|html|sql)/g)].map(
      (m) => m[0],
    );

    // Имя из доказательства можно привязать к адресу только когда адрес один.
    // Иначе «класс не найден» означает лишь то, что он относится к соседнему
    // адресу: 31.08 так вышло семь ложных у чинилки и десятки у самой проверки.
    const singleAddress = mentionedFiles.length === 1;

    for (const m of evidence.matchAll(ADDRESS)) {
      const [, rel, lineRaw] = m;
      const line = Number(lineRaw);
      addressesChecked += 1;
      if (rel.includes('...')) {
        // Доказательство записано с сокращением («400-...css») — адрес есть, а
        // проверить его нельзя. Это не дефект кода, а дефект записи.
        problems.truncated.push({ zone, key, rel, line });
        continue;
      }
      const resolved = resolveFile(rel);
      if (!resolved) {
        problems.missing.push({ zone, key, rel, line });
        continue;
      }
      const lines = linesOf(resolved);
      if (line > lines.length) {
        problems.beyond.push({ zone, key, rel: resolved, line, total: lines.length });
        continue;
      }
      if (!singleAddress) {
        multiAddressSkipped += 1;
        continue;
      }
      // Имена из доказательства — ищем хотя бы одно рядом с адресом.
      const names = [...new Set((evidence.match(NAME) || []).map((n) => n.replace(/-$/, '')))]
        .filter(looksLikeIdentifier)
        .filter((n) => !NOT_A_NAME.has(n.replace(/^(--|\.)/, '').toLowerCase()))
        .filter((n) => !/^(js|css|html|sql|mjs|ts|tsx)$/i.test(n))
        // Имена файлов — не якоря: доказательство часто называет соседний
        // файл, и искать его имя внутри другого файла бессмысленно.
        .filter((n) => !mentionedFiles.some((f) => f.includes(n)))
        // Приставка нужна была, чтобы отличить имя от прозы. Искать по ней
        // нельзя: в JS класс живёт строкой `'wr-ok'` без точки, а роль в CSS —
        // и с двумя дефисами, и без них в `var()`. Ищем голое имя.
        .map((n) => n.replace(/^(--|\.)/, ''));
      if (!names.length) continue;

      const whole = lines.join('\n');
      const present = names.filter((n) => whole.includes(n));
      if (!present.length) {
        problems.absent.push({ zone, key, rel: resolved, line, names: names.slice(0, 4) });
        continue;
      }
      const near = present.some((n) => {
        const from = Math.max(0, line - 1 - WINDOW);
        const to = Math.min(lines.length, line - 1 + WINDOW);
        return lines.slice(from, to).some((l) => l.includes(n));
      });
      if (!near) {
        problems.moved.push({ zone, key, rel: resolved, line, names: present.slice(0, 3) });
      }
    }
  }
}

if (asJson) {
  // Машинный вывод для чинилки: она берёт отсюда адрес, имена и зону.
  process.stdout.write(
    JSON.stringify({ zones, rowsSeen, withEvidence, addressesChecked, problems }, null, 2),
  );
  process.exit(0);
}

const hard =
  problems.truncated.length +
  problems.missing.length +
  problems.beyond.length +
  problems.absent.length;

function show(title, list, fmt) {
  if (!list.length) return;
  console.log(`\n${title} — ${list.length}`);
  const limit = wantList ? list.length : 12;
  for (const item of list.slice(0, limit)) console.log('  ' + fmt(item));
  if (list.length > limit) console.log(`  … ещё ${list.length - limit}, покажет --list`);
}

show(
  'Адрес записан с сокращением',
  problems.truncated,
  (i) => `${i.zone} · ${i.rel}:${i.line} · «${i.key}»`,
);
show('Нет файла', problems.missing, (i) => `${i.zone} · ${i.rel}:${i.line} · «${i.key}»`);
show(
  'Строка за концом файла',
  problems.beyond,
  (i) => `${i.zone} · ${i.rel}:${i.line} (в файле ${i.total}) · «${i.key}»`,
);
show(
  'Имя из доказательства в файле не встречается',
  problems.absent,
  (i) => `${i.zone} · ${i.rel}:${i.line} · нет: ${i.names.join(', ')} · «${i.key}»`,
);
show(
  `Имя есть, но дальше ${WINDOW} строк от адреса`,
  problems.moved,
  (i) => `${i.zone} · ${i.rel}:${i.line} · ${i.names.join(', ')} · «${i.key}»`,
);

console.log(
  `\nОхват: ${zones} зон, ${rowsSeen} строк, ${withEvidence} с доказательством, ` +
    `${addressesChecked} разрешимых адресов проверено.`,
);
if (multiAddressSkipped) {
  console.log(
    `Адресов в записях с несколькими ссылками: ${multiAddressSkipped} — у них ` +
      'проверены существование файла и длина, но не имя: привязать имя к нужному адресу нельзя.',
  );
}
if (shorthandSkipped) {
  console.log(
    `Сокращений без имени файла (вида «ui:2513») пропущено: ${shorthandSkipped} — ` +
      'их нельзя разрешить, и это не ноль, а слепая зона.',
  );
}
console.log(
  'Проверка сторожит адрес, а не смысл: «полоса 4 px» рядом с нужным классом её устроит,',
);
console.log('даже если там теперь 6 px.');

if (updateBaseline) {
  const src = fs.readFileSync(process.argv[1], 'utf8');
  const next = src.replace(
    /const BASELINE = \{[^}]*\};/,
    [
      'const BASELINE = {',
      ...Object.keys(BASELINE).map((k) => `  ${k}: ${problems[k].length},`),
      '};',
    ].join('\n'),
  );
  fs.writeFileSync(process.argv[1], next);
  console.log('\nЗаморозка переписана.');
  process.exit(0);
}

const grew = Object.keys(BASELINE).filter((k) => problems[k].length > BASELINE[k]);
const shrank = Object.keys(BASELINE).filter((k) => problems[k].length < BASELINE[k]);

if (grew.length) {
  console.log('\nДолг вырос — доказательства протухли сильнее, чем было заморожено:');
  for (const k of grew) console.log(`  ${k}: было ${BASELINE[k]}, стало ${problems[k].length}`);
  console.log('Почините адрес в docs/ui/verdicts/<зона>.json либо объясните рост.');
  process.exit(1);
}
if (shrank.length) {
  console.log('\nДолг уменьшился:');
  for (const k of shrank) console.log(`  ${k}: ${BASELINE[k]} → ${problems[k].length}`);
  console.log('  node scripts/ui-v4-check-verdict-addresses.mjs --update-baseline');
}
