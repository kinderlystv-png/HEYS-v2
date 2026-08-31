import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditColour, flush as auditFlush } from './role-purpose-audit.mjs';

// Разборщик раздела канваса «Разбор кадров · элемент за элементом»: строки
// разбора читаются из самого канваса, правила — из продуктового CSS, и пара
// «элемент кадра → правило продукта» сверяется по названным свойствам.
//
// Вынесен из `widgets-bd-sheet-canvas-razbor.test.js`, когда тот же разбор
// понадобился «Советам»: раздел один на все канвасы, и второй его читатель
// не должен заводить второй парсер. Кадры «Советы · …» лежат в канвасе дважды —
// песочной и синей палитрой; вторая копия приезжает ключом с «(2)» и в разбор
// не идёт: каноничная палитра снята 24 августа, геометрия у копий одна.

// Строки разбора: «<метка кадра> · NN» → значение.
function readRazbor(source) {
  const rows = new Map();
  const re = /<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g;
  let m;
  while ((m = re.exec(source))) {
    const key = /^(.*) · (\d{2,3})$/.exec(m[1]);
    if (!key) continue;
    rows.set(`${key[1]}|${String(Number(key[2]))}`, m[2]);
  }
  return rows;
}

function readRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map();
  // Свои переменные файла — `--boot-disc`, `--nut-dim` и подобные. Берём первое
  // определение: дальше по файлу их переопределяют тёмные и синие наборы, а
  // сверяемся мы с песочным. Без этого продуктовое `var(--boot-disc)` не с чем
  // сравнить, и сверка звала расхождением каждое такое место.
  const localVars = new Map();
  for (const m of clean.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    if (!localVars.has(m[1])) localVars.set(m[1], m[2].trim());
  }
  rules.localVars = localVars;
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of match[1].split(',')) {
      const key = selector.trim();
      if (!rules.has(key)) rules.set(key, {});
      for (const decl of match[2].split(';')) {
        const at = decl.indexOf(':');
        if (at < 0) continue;
        const prop = decl.slice(0, at).trim();
        const value = decl.slice(at + 1).trim();
        rules.get(key)[prop] = value;
        // Сокращения: `margin: 12px 0 0` и `font: 700 13px/1 inherit`.
        if (prop === 'margin') {
          const parts = value.split(/\s+/);
          rules.get(key)['margin-top'] = parts[0];
          rules.get(key)['margin-bottom'] = parts[2] ?? parts[0];
        }
        if (prop === 'font') {
          // Кегль пишут и в px, и в rem: `font: 600 0.8125rem/1.2` — те же 13 px.
          const f = /^(\d+)\s+([\d.]+)(px|rem)\/([\d.]+)/.exec(value);
          if (f) {
            rules.get(key)['font-weight'] = f[1];
            rules.get(key)['font-size'] = f[3] === 'rem'
              ? `${parseFloat(f[2]) * 16}px`
              : `${f[2]}px`;
            rules.get(key)['line-height'] = f[4];
          }
        }
      }
    }
  }
  return rules;
}

// Числа и роли из фразы разбора: «шрифт 600 44px/.9 Figtree», «отступ сверху
// 16px», «фон var(--acs)». Цвет бывает вложенным — rgba(var(--ink),.42), —
// поэтому скобки считаются, а не режутся первым «)».
function grabColor(value, word) {
  const at = value.indexOf(`${word} `);
  if (at < 0) return null;
  const i = at + word.length + 1;
  if (value[i] === '#') { const m = /^#[0-9a-f]{3,8}/i.exec(value.slice(i)); return m ? m[0] : null; }
  if (!/^(var|rgba|rgb)\(/.test(value.slice(i))) return null;
  let depth = 0; let j = i;
  for (; j < value.length; j += 1) {
    if (value[j] === '(') depth += 1;
    else if (value[j] === ')') { depth -= 1; if (depth === 0) { j += 1; break; } }
  }
  return value.slice(i, j);
}

const num = (v, re) => { const m = re.exec(v); return m ? m[1] : null; };
const PICK = {
  marginTop: (v) => {
    if (/отступ сверху auto/.test(v)) return 'auto';
    const own = num(v, /отступ сверху ([\d.]+)px/);
    if (own != null) return own;
    // Кадр пишет сокращением: «отступы 18px 0 4px» — верх это первое число.
    const short = /отступы\s+(\S+)\s+(\S+)\s+(\S+)/.exec(v);
    return short ? short[1].replace('px', '') : null;
  },
  marginBottom: (v) => {
    if (/отступ снизу auto/.test(v)) return 'auto';
    const own = num(v, /отступ снизу ([\d.]+)px/);
    if (own != null) return own;
    // Кадр пишет сокращением: «отступы 0 auto 13px».
    const short = /отступы\s+(\S+)\s+(\S+)\s+(\S+)/.exec(v);
    return short ? short[3].replace('px', '') : null;
  },
  // «зазор 10px 14px» — две оси; вторая теряется, если брать только первое число.
  gap: (v) => num(v, /зазор ([\d.]+px(?:\s+[\d.]+px)?)/),
  height: (v) => num(v, /высота ([\d.]+)px/),
  minHeight: (v) => num(v, /высота от ([\d.]+)px/),
  width: (v) => num(v, /ширина ([\d.]+)px/),
  // Кадр пишет радиус и одним числом, и четырьмя — «2px 2px 0 0», причём
  // четвёрка может начинаться с голого нуля: «радиус 0 999px 999px 0».
  radius: (v) => num(v, /радиус ((?:[\d.]+px|0)(?:\s+(?:[\d.]+px|0))*)/),
  padding: (v) => num(v, /поля ([^,]+?)(?:,|$)/),
  fontWeight: (v) => num(v, /шрифт (\d+) [\d.]+px/),
  fontSize: (v) => num(v, /шрифт \d+ ([\d.]+)px/),
  // Кадр пишет интерлиньяж и внутри шрифта, и отдельным словом, когда кегль
  // задан не здесь: «ширина 8px, флекс none, интерлиньяж 1».
  lineHeight: (v) => num(v, /шрифт \d+ [\d.]+px\/([\d.]+)/) ?? num(v, /интерлиньяж ([\d.]+)/),
  tracking: (v) => num(v, /трекинг (-?[\d.]+)em/),
  align: (v) => num(v, /выравнивание (\S+?)(?:,|$)/),
  justify: (v) => num(v, /распределение (\S+?)(?:,|$)/),
  direction: (v) => num(v, /направление (\S+?)(?:,|$)/),
  textAlign: (v) => num(v, /выключка (\S+?)(?:,|$)/),
  transform: (v) => num(v, /регистр (\S+?)(?:,|$)/),
  minWidth: (v) => num(v, /ширина от ([\d.]+)px/),
  flex: (v) => num(v, /флекс (\S+?)(?:,|$)/),
  background: (v) => grabColor(v, 'фон'),
  color: (v) => grabColor(v, 'цвет')
};
const CSSPROP = {
  marginTop: 'margin-top', marginBottom: 'margin-bottom', gap: 'gap', height: 'height',
  minHeight: 'min-height',
  width: 'width', radius: 'border-radius', padding: 'padding', fontWeight: 'font-weight',
  fontSize: 'font-size', lineHeight: 'line-height', tracking: 'letter-spacing',
  align: 'align-items', justify: 'justify-content', direction: 'flex-direction',
  textAlign: 'text-align', transform: 'text-transform', flex: 'flex',
  minWidth: 'min-width',
  background: 'background', color: 'color'
};

// Роли канваса → песочные значения набора; продуктовая роль → её запасное.
// За тем, что роль вообще заведена, отдельно следит ui:v4:check.
const ROLE = {
  '--c1': '#f7efe2', '--c2': '#efe3cf', '--bg': '#fffaf1', '--tx': '#201e1d',
  '--ac': '#8a4a20', '--ac2': '#a1471c', '--acs': '#c67139', '--on-acs': '#2b1608',
  '--edge': '#d6cec1',
  '--gr': '#5c6a45', '--gr2': '#7a8a5e', '--gr-bg': '#eaefe0', '--on-gr': '#171d0d',
  '--tint': '#f6e6dd', '--wat': '#5e808f',
  // Роли, объявленные внутри отдельных канвасов, и продуктовые псевдонимы того
  // же тона: канвас «Питания» зовёт приглушённые чернила --dim, продукт —
  // --nut-dim, значение у обоих одно (#6b5f4f в песочном наборе).
  '--dim': '#6b5f4f', '--nut-dim': '#6b5f4f',
  '--sage': '#eaefe0', '--sagetx': '#3f4a2e',
  '--red': '#b4442a', '--warn': '#c9922e', '--ovl': '#d99a63', '--val-bad': '#a8382b'
};
// Значения ролей продукта берутся из самого набора, а не из запасных значений,
// написанных рядом с `var()`. Запасное — это то, что нарисуется, если роль не
// заведена; ui:v4:check гарантирует, что заведена всегда, поэтому рисует роль.
// Разошлись они — и сверка по запасному молча одобряет чужой цвет: так
// карточка совета годами стояла на второй поверхности, объявляя первую.
let ROLE_VALUES = null;
function roleValues() {
  if (ROLE_VALUES) return ROLE_VALUES;
  ROLE_VALUES = new Map();
  const css = fs.readFileSync(
    path.resolve(fileURLToPath(import.meta.url), '../../styles/modules/002-ui-v4-palette-roles.css'),
    'utf8',
  );
  // Песочный набор — базовый; тёмные и синие кадры сверяются своими зонами.
  const at = css.indexOf('[data-theme-id="sand"]');
  const end = css.indexOf('[data-theme-id=', at + 1);
  for (const m of css.slice(at, end < 0 ? undefined : end).matchAll(/(--v4-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    ROLE_VALUES.set(m[1], m[2].trim());
  }
  return ROLE_VALUES;
}

function norm(value, localVars) {
  if (value == null) return null;
  let s = String(value).trim().toLowerCase();
  // `!important` — про приоритет каскада, а не про значение: у кадра его нет
  // по построению, и без снятия сверка звала бы расхождением каждое такое
  // правило (в теме входа их полтора десятка).
  s = s.replace(/\s*!important\s*$/, '');
  s = s.replace(/var\(\s*(--[a-z0-9-]+)\s*\)/g, (_, r) => ROLE[r] || `var(${r})`);
  s = s.replace(
    /var\(\s*(--[a-z0-9-]+)\s*,\s*([^()]*(?:\([^()]*\)[^()]*)*)\)/g,
    (_, role, fallback) => (roleValues().get(role) || fallback),
  );
  // Голая `var(--роль)` без запасного значения — тоже роль набора: её пишут
  // там, где запасное осознанно не нужно (маркер `v4-intentional`). Без этой
  // подстановки сверка сравнивала бы имя роли с цветом кадра и звала бы
  // расхождением каждое такое место.
  s = s.replace(/var\(\s*(--v4-[a-z0-9-]+)\s*\)/g, (whole, role) => roleValues().get(role) || whole);
  // Своя переменная сверяемого файла — последняя ступень: роли набора и роли
  // канваса уже разобраны выше, здесь остаётся то, что файл объявил сам.
  if (localVars) {
    s = s.replace(/var\(\s*(--[a-z0-9-]+)\s*\)/g, (whole, name) => localVars.get(name) || whole);
  }
  s = s.replace(/rgba\(var\(--ink\)\s*,\s*\.?(\d+)\)/g, (_, d) => `rgba(0,0,0,.${d})`);
  // Чернила канваса — 32,30,29, и сам он печатает их в разборе то через
  // `var(--ink)`, то литералом `rgba(0,0,0,…)`. Продукт пишет тот же цвет
  // третьей формой — `rgba(32,30,29,…)`. Все три это один цвет, поэтому
  // сводим их к одному написанию, а не заводим отступление на каждый тон.
  // `color-mix(in srgb, <цвет> N%, transparent)` — тот же полупрозрачный тон,
  // что `rgba(<цвет>, .N)`. В продукте так набирают тона чернил, которых нет
  // отдельной ролью; без сведения к одной форме сверка звала бы их расхождением.
  s = s.replace(
    /color-mix\(in srgb,\s*#([0-9a-f]{6})\s*([\d.]+)%\s*,\s*transparent\)/g,
    (_, hex, pct) => {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${String(Number(pct) / 100).replace(/^0/, '')})`;
    },
  );
  s = s.replace(/rgba\(\s*32\s*,\s*30\s*,\s*29\s*,/g, 'rgba(0,0,0,');
  s = s.replace(/([\d.]+)rem/g, (_, n) => `${parseFloat(n) * 16}px`);
  s = s.replace(/\s+/g, ' ').replace(/,\s*/g, ',');
  s = s.replace(/(^|[\s(,])\.(\d)/g, '$10.$2').replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2');
  s = s.replace(/(px|em)\b/g, '');
  return s;
}

// Одна сверка на все таблицы: «строка разбора → правило продукта → свойства».
// Номер элемента по якорю: приметная строка плитки плюс смещение внутри неё.
// Якорь обязан находиться ровно один раз — иначе гейт говорит об этом, а не
// молча сверяет чужой элемент.
function resolveIndex(razbor, frame, anchor) {
  if (typeof anchor === 'number') return { index: anchor };
  const hits = [];
  for (const [key, value] of razbor) {
    const at = key.lastIndexOf('|');
    if (key.slice(0, at) !== frame) continue;
    if (value.includes(anchor)) hits.push(Number(key.slice(at + 1)));
  }
  if (hits.length !== 1) {
    return { error: `${frame}: якорь «${anchor}» найден ${hits.length} раз, нужен один` };
  }
  return { index: hits[0] };
}

// Какие строки разбора гейт вообще брал в руки за прогон. Заполняется самим
// compare: перечислять вызовы руками в каждом гейте — это второй список,
// который разъедется с первым.
const TOUCHED = new Map();

function markTouched(frame, index) {
  if (!TOUCHED.has(frame)) TOUCHED.set(frame, new Set());
  TOUCHED.get(frame).add(String(Number(index)));
}

function compare({ razbor, rules, frame, pairs }) {
  const drift = [];
  for (const pair of pairs) {
    const anchored = pair.length === 4;
    const found = resolveIndex(razbor, frame, pair[0]);
    if (found.error) { drift.push(found.error); continue; }
    const index = found.index + (anchored ? pair[1] : 0);
    const sel = anchored ? pair[2] : pair[1];
    const props = anchored ? pair[3] : pair[2];
    markTouched(frame, index);
    const value = razbor.get(`${frame}|${String(Number(index))}`);
    if (!value) { drift.push(`${frame} · ${index}: строки разбора нет`); continue; }
    const chain = Array.isArray(sel) ? sel : [sel];
    const merged = {};
    for (const s of chain) {
      if (!rules.has(s)) { drift.push(`${frame} · ${index}: нет правила ${s}`); continue; }
      Object.assign(merged, rules.get(s));
    }
    for (const kind of props) {
      const want = norm(PICK[kind](value), rules.localVars);
      if (want == null) { drift.push(`${frame} · ${index}: в кадре нет «${kind}»`); continue; }
      const got = norm(merged[CSSPROP[kind]], rules.localVars);
      // Пара сошлась по песочному значению — это ещё не значит, что взята та
      // роль: 94 пары ролей в наборе совпадают в песочной и расходятся дальше.
      // Аудит включается переменной HEYS_ROLE_PURPOSE_AUDIT и ничего не роняет.
      if (want === got && (kind === 'background' || kind === 'color')) {
        auditColour({
          frame, index, selector: chain[chain.length - 1], kind,
          frameValue: PICK[kind](value), codeValue: merged[CSSPROP[kind]],
          localVars: rules.localVars, rules, cssProp: CSSPROP[kind]
        });
      }
      if (want !== got) {
        drift.push(`${chain[chain.length - 1]} { ${CSSPROP[kind]} } — кадр: ${want} · код: ${got}`);
      }
    }
  }
  auditFlush();
  return drift;
}


/**
 * Какие строки разбора кадра гейт вообще берёт в руки.
 *
 * `compare` сверяет только те строки, что перечислены в парах: всё
 * остальное молча не участвует. Пока охват не назван числом, вердикт
 * «сверено гейтом» читается как «проверено», хотя строки может не быть в
 * парах вовсе. Возвращает по кадру: сколько строк в разборе, сколько взято
 * парами и какие индексы остались нетронутыми.
 */
function coverage({ razbor, calls } = {}) {
  const seen = new Map();
  if (calls) {
    for (const { frame, pairs } of calls) {
      if (!seen.has(frame)) seen.set(frame, new Set());
      const taken = seen.get(frame);
      for (const pair of pairs) {
        const anchored = pair.length === 4;
        const found = resolveIndex(razbor, frame, pair[0]);
        if (found.error) continue;
        taken.add(String(Number(found.index + (anchored ? pair[1] : 0))));
      }
    }
  } else {
    for (const [frame, taken] of TOUCHED) seen.set(frame, taken);
  }

  const frames = new Set([...razbor.keys()].map((key) => key.slice(0, key.lastIndexOf('|'))));
  const perFrame = [];
  let total = 0;
  let covered = 0;
  for (const frame of frames) {
    const rows = [...razbor.keys()]
      .filter((key) => key.startsWith(`${frame}|`))
      .map((key) => key.slice(frame.length + 1));
    const taken = seen.get(frame) || new Set();
    const missed = rows.filter((index) => !taken.has(index));
    total += rows.length;
    covered += rows.length - missed.length;
    perFrame.push({ frame, rows: rows.length, covered: rows.length - missed.length, missed });
  }
  return { total, covered, missed: total - covered, perFrame, untouched: perFrame.filter((f) => !f.covered).length };
}

/** Сбросить реестр — нужно, когда в одном файле сверяются два разных канваса. */
function resetCoverage() {
  TOUCHED.clear();
}

export {
  readRazbor,
  readRules,
  grabColor,
  norm,
  resolveIndex,
  compare,
  coverage,
  resetCoverage,
  PICK,
  CSSPROP,
  ROLE,
};
