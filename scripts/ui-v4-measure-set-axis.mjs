#!/usr/bin/env node
// ui-v4-measure-set-axis.mjs — замер оси наборов у ролей с именем набора.
//
// Зачем. Опись `docs/ui/UI_V4_SAND_ROLES_INVENTORY.md` ждёт ручной разметки
// владельца: отметить геройские места, всё остальное — механическая замена на
// общую роль. Мест сотни, и читать палитру глазами по каждому — самая дорогая
// часть работы. Замер её снимает: для каждой роли видно, различает ли она
// наборы вообще и что произойдёт с цветом при замене на общую роль.
//
// Почему замером, а не чтением. Правило элемента и итог каскада — разные вещи;
// `var()` бывает цепочкой, роль объявлена не в одном блоке, а в четырёх, и
// границы блоков в файле двигаются. Браузер разрешает всё это сам:
// `getComputedStyle(probe).getPropertyValue(роль)` на четырёх пробниках с
// атрибутами наборов даёт итог, а не намерение.
//
// Чего замер НЕ делает. Полупрозрачная роль различает наборы подложкой, а не
// своим значением, и подложка живёт в разметке продукта, а не в палитре. Такие
// роли помечены отдельно: чтобы досчитать их, нужен прогон по живому DOM.
//
// Опись этот скрипт не трогает — решение по геройским местам за владельцем.
//
// Использование:
//   node scripts/ui-v4-measure-set-axis.mjs            # markdown в docs/ui/
//   node scripts/ui-v4-measure-set-axis.mjs --stdout   # тот же отчёт в консоль
//   node scripts/ui-v4-measure-set-axis.mjs --json     # машинный вид

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'apps/web/styles/modules');
const PALETTE = path.join(MODULES, '002-ui-v4-palette-roles.css');
const TOKENS = path.join(MODULES, '001-design-tokens.css');
const OUT = path.join(ROOT, 'docs/ui/UI_V4_SAND_ROLES_MEASURED.md');

// Четыре набора продукта. Атрибуты — те же, что кладёт heys_theme_v1.js:
// data-theme несёт набор и режим, data-palette — только набор.
const SETS = [
  { id: 'sand', theme: 'sand', palette: 'sand', title: 'песочный', mode: 'светлый' },
  { id: 'sand-dark', theme: 'sand-dark', palette: 'sand', title: 'песочный', mode: 'тёмный' },
  { id: 'blue', theme: 'blue', palette: 'blue', title: 'синий', mode: 'светлый' },
  { id: 'blue-dark', theme: 'blue-dark', palette: 'blue', title: 'синий', mode: 'тёмный' },
];
const LIGHT = ['sand', 'blue'];
const DARK = ['sand-dark', 'blue-dark'];

const args = new Set(process.argv.slice(2));

// ── 1. Где роли с именем набора используются ────────────────────────────────
// Семейство — ведущий класс правила, как в описи (`.aps-v4-meal-summary`).
// Правило может иметь несколько селекторов; берём класс первого, потому что
// именно он в описи и стоит.
function leadingClass(selectorText) {
  const first = selectorText.split(',')[0].trim();
  const m = /\.[a-zA-Z0-9_-]+/.exec(first);
  return m ? m[0] : first.slice(0, 40) || '(без класса)';
}

let rawHits = 0;

function scanUsages() {
  const perFile = new Map();
  for (const name of fs.readdirSync(MODULES)) {
    if (!name.endsWith('.css') || name.startsWith('002-')) continue;
    const raw = fs.readFileSync(path.join(MODULES, name), 'utf8');
    // Комментарии вырезаем до разбора: `var()` в комментарии — не
    // использование, а текст перед правилом иначе уезжает в имя семейства.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
    rawHits += [...src.matchAll(/var\(\s*--v4-(?:sand|blue)-[a-z0-9-]+/g)].length;
    // Грубый разбор на правила: нам нужен только селектор перед блоком и роли
    // внутри него. Полноценный парсер CSS тут избыточен — @-правила дают
    // «селектор» вида `@media …`, и это честно видно в отчёте.
    const families = new Map();
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const roles = [...m[2].matchAll(/var\(\s*(--v4-(?:sand|blue)-[a-z0-9-]+)/g)].map((r) => r[1]);
      if (!roles.length) continue;
      const family = leadingClass(m[1]);
      if (!families.has(family)) families.set(family, { count: 0, roles: new Set() });
      const slot = families.get(family);
      slot.count += roles.length;
      for (const r of roles) slot.roles.add(r);
    }
    if (families.size) perFile.set(name, families);
  }
  return perFile;
}

// ── 2. Чему роль равна в каждом наборе ──────────────────────────────────────
async function resolve(roles) {
  const href = (p) => 'file:///' + p.replace(/\\/g, '/');
  const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="${href(TOKENS)}">
<link rel="stylesheet" href="${href(PALETTE)}">
${SETS.map((s) => `<div id="${s.id}" data-theme="${s.theme}" data-palette="${s.palette}"></div>`).join('\n')}`;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'v4-axis-')), 'probe.html');
  fs.writeFileSync(file, html);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
    const loaded = await page.evaluate(() =>
      getComputedStyle(document.getElementById('sand')).getPropertyValue('--v4-ink').trim());
    if (!loaded) throw new Error(`палитра не загрузилась: ${PALETTE}`);
    return await page.evaluate(
      ({ roles, setIds }) => {
        const out = {};
        for (const role of roles) {
          out[role] = {};
          for (const id of setIds) {
            const v = getComputedStyle(document.getElementById(id)).getPropertyValue(role).trim();
            out[role][id] = v || null;
          }
        }
        return out;
      },
      { roles, setIds: SETS.map((s) => s.id) },
    );
  } finally {
    await browser.close();
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

// ── 3. Вердикты ─────────────────────────────────────────────────────────────
const norm = (v) => (v == null ? null : v.replace(/\s+/g, ' ').trim().toLowerCase());
const translucent = (v) => v != null && /rgba\(|\/\s*0?\.\d/.test(v);

function verdictForRole(role, values) {
  const general = role.replace(/^--v4-(?:sand|blue)-/, '--v4-');
  const own = values[role];
  const gen = values[general];
  const missing = SETS.filter((s) => !own[s.id]);

  // Роль не объявлена нигде — запасное у каждого места побеждает всегда. Это
  // долг соседнего гейта (`ui-v4-check-undefined-roles`), но для описи он
  // важнее пометки «герой»: заменять нечего, цвет держит литерал в модуле.
  if (missing.length === SETS.length) {
    return {
      role, general: null, blindToSet: true, kind: 'роль не объявлена',
      note: 'роли нет ни в одном наборе — цвет держит запасное значение у каждого места',
      changes: [],
    };
  }
  // Объявлена не везде: там, где её нет, снова побеждает запасное.
  if (missing.length) {
    return {
      role, general: null, blindToSet: true, kind: 'роль не во всех наборах',
      note: `нет в наборах: ${missing.map((s) => `${s.title} ${s.mode}`).join(', ')} — там цвет держит запасное`,
      changes: [],
    };
  }

  // Различает ли сама роль наборы: сравниваем песочный с синим ВНУТРИ режима.
  const blindToSet =
    norm(own[LIGHT[0]]) === norm(own[LIGHT[1]]) && norm(own[DARK[0]]) === norm(own[DARK[1]]);

  const genDeclared = gen && SETS.every((s) => gen[s.id]);
  if (!genDeclared) {
    return {
      role, general: null, blindToSet, kind: 'нет пары по имени',
      note: `общей роли \`${general}\` во всех наборах нет — пару называет владелец`,
      changes: [],
    };
  }

  const changes = SETS.filter((s) => norm(own[s.id]) !== norm(gen[s.id]))
    .map((s) => `${s.title} ${s.mode}: \`${own[s.id]}\` → \`${gen[s.id]}\``);

  if (!changes.length) {
    return {
      role, general, blindToSet, kind: 'механическая',
      note: 'значения совпадают во всех четырёх наборах — замена цвет не меняет',
      changes,
    };
  }
  return {
    role, general, blindToSet, kind: 'меняет цвет',
    note: translucent(own.sand)
      ? 'роль полупрозрачная: часть различия даёт подложка, нужен прогон по живому DOM'
      : 'замена меняет цвет — решение владельца',
    changes,
  };
}

// ── 4. Отчёт ────────────────────────────────────────────────────────────────
function render(perFile, verdicts) {
  const V = new Map(verdicts.map((v) => [v.role, v]));
  const kindOf = (roles) => {
    const kinds = [...roles].map((r) => V.get(r).kind);
    // Семейство настолько же «механическое», насколько худшая из его ролей.
    for (const k of ['роль не объявлена', 'роль не во всех наборах', 'меняет цвет', 'нет пары по имени']) {
      if (kinds.includes(k)) return k;
    }
    return 'механическая';
  };

  let places = 0;
  let mech = 0;
  const rows = [];
  for (const [file, families] of [...perFile].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const [family, slot] of [...families].sort((a, b) => b[1].count - a[1].count)) {
      const kind = kindOf(slot.roles);
      places += slot.count;
      if (kind === 'механическая') mech += slot.count;
      rows.push({ file, family, count: slot.count, kind, roles: [...slot.roles].sort() });
    }
  }

  const out = [];
  out.push('# Роли набора — замер оси, разметка к описи');
  out.push('');
  out.push('Сгенерировано `scripts/ui-v4-measure-set-axis.mjs`. Правьте скрипт, не файл.');
  out.push('');
  out.push('Файл **не заменяет** [опись](UI_V4_SAND_ROLES_INVENTORY.md) и ничего в ней не');
  out.push('решает: пометку `герой` ставит владелец. Замер отвечает на один вопрос —');
  out.push('«что случится с цветом, если заменить роль с именем набора на общую» — и');
  out.push('показывает ответ по каждому набору отдельно, чтобы решать не вслепую.');
  out.push('');
  out.push(`Мест с ролью набора: **${rawHits}** вне комментариев.`);
  if (rawHits !== places) {
    out.push(`По семействам разнесено ${places}; остальные лежат вне правил с ведущим`);
    out.push('классом (объявления переменных, @-правила) — на вердикт это не влияет,');
    out.push('но в таблицу мест они не попадают.');
  }
  out.push('');
  out.push('Число мест дрейфует: модули правятся параллельно, и за один рабочий день оно');
  out.push('менялось трижды. Сверяйтесь с прогоном, а не с числом в тексте: SHA прогона в');
  out.push('отчёт намеренно не пишется — иначе файл пачкается при каждом запуске и мешает');
  out.push('параллельным сессиям.');
  out.push('');
  out.push(mech
    ? `Замена не меняет цвет у **${mech}** мест — их можно закрыть без владельца.`
    : 'Мест, где замена не меняла бы цвет, **нет ни одного** — почему, ниже.');
  out.push('');
  out.push('## Что показал замер');
  out.push('');
  out.push('**Ожидаемого короткого пути нет.** Замысел был такой: место, где роль не');
  out.push('различает наборы, можно заменить механически, без владельца. Замер этого не');
  out.push('подтверждает. Роль с именем набора действительно почти нигде не различает');
  out.push('песочный и синий — но общая роль, на которую её меняют, различает. Поэтому');
  out.push('«не различает наборы» означает не «замена безопасна», а ровно наоборот:');
  out.push('замена и есть то, что вернёт этому месту ось набора, и вместе с ней — другой');
  out.push('цвет в синих. Решение по каждому семейству остаётся за владельцем.');
  out.push('');
  out.push('Зато замер делит места на три разных разговора вместо одного:');
  out.push('');
  const bucket = (k) => rows.filter((r) => r.kind === k).reduce((a, r) => a + r.count, 0);
  out.push(`* 🎨 **${bucket('меняет цвет')} мест** — пара по имени есть, замена меняет цвет.`);
  out.push('  Здесь и нужен вердикт «герой или нет»: в таблице ролей видно, каким именно');
  out.push('  станет цвет в каждом наборе.');
  out.push(`* ❓ **${bucket('нет пары по имени')} мест** — общей роли с таким именем нет вовсе`);
  out.push('  (`--v4-act-deep`, `--v4-surface-soft` и подобные). Тут владельцу нужно сперва');
  out.push('  назвать пару, и только потом решать про героя. Имя не подсказывает её сам:');
  out.push('  честная пара к `--v4-sand-act-deep` — `--v4-act-text`, а не `--v4-act-deep`.');
  const broken = bucket('роль не объявлена') + bucket('роль не во всех наборах');
  out.push(`* 🚨 **${broken} мест** — роль не объявлена вовсе или объявлена не во всех`);
  out.push('  наборах. Это не вопрос разметки: там цвет держит запасное значение у каждого');
  out.push('  места, и продукт уже сейчас не следует набору. Разбирать их стоит первыми и');
  out.push('  отдельно от разговора про героя.');
  out.push('');
  out.push('## Роли');
  out.push('');
  out.push('| роль | различает наборы | общая пара | что даст замена |');
  out.push('| --- | --- | --- | --- |');
  for (const v of verdicts) {
    const axis = v.blindToSet ? '❌ нет' : '✅ да';
    const pair = v.general ? `\`${v.general}\`` : '—';
    const what = v.changes.length ? `${v.note}<br>${v.changes.join('<br>')}` : v.note;
    out.push(`| \`${v.role}\` | ${axis} | ${pair} | ${what} |`);
  }
  out.push('');
  out.push('«Различает наборы» сравнивает песочный с синим **внутри режима**: роль,');
  out.push('меняющаяся светлая↔тёмная, но одинаковая песочная↔синяя, оси набора не даёт —');
  out.push('это и есть предмет описи.');
  out.push('');
  out.push('## Места');
  out.push('');
  out.push('| модуль | семейство | мест | вердикт | роли |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const mark = {
      'механическая': '⚙️ механическая',
      'меняет цвет': '🎨 меняет цвет',
      'нет пары по имени': '❓ нет пары',
      'роль не объявлена': '🚨 роль не объявлена',
      'роль не во всех наборах': '🚨 роль не во всех наборах',
    }[r.kind];
    out.push(`| \`${r.file}\` | \`${r.family}\` | ${r.count} | ${mark} | ${r.roles.map((x) => `\`${x}\``).join(', ')} |`);
  }
  out.push('');
  return out.join('\n');
}

// ── main ────────────────────────────────────────────────────────────────────
const perFile = scanUsages();
const used = new Set();
for (const families of perFile.values()) for (const slot of families.values()) for (const r of slot.roles) used.add(r);

const needed = [...used];
for (const r of used) needed.push(r.replace(/^--v4-(?:sand|blue)-/, '--v4-'));
const values = await resolve([...new Set(needed)]);

const verdicts = [...used].sort().map((r) => verdictForRole(r, values));

if (args.has('--json')) {
  console.log(JSON.stringify({ verdicts, files: [...perFile].map(([f, fam]) => ({ file: f, families: [...fam].map(([k, v]) => ({ family: k, count: v.count, roles: [...v.roles] })) })) }, null, 2));
} else {
  const md = render(perFile, verdicts);
  if (args.has('--stdout')) console.log(md);
  else {
    fs.writeFileSync(OUT, md);
    console.log(`Записано: ${path.relative(ROOT, OUT)}`);
  }
}
