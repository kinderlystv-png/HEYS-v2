// Кадры Главной против раздела канваса «Разбор кадров · элемент за элементом»
// (пакет 30 августа). Раздел даёт каждому нарисованному элементу собственные
// числа; здесь по ним сверяются с продуктовым CSS каркас листа разбора (общий
// у восемнадцати кадров «Разбор · …») и сам кадр «Главная · дефолтная
// раскладка» — плитка за плиткой.
//
// Метод: строки контракта читаются из самого канваса, поэтому расхождение
// всплывает при правке любой из сторон.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css');

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
          const f = /^(\d+)\s+([\d.]+)px\/([\d.]+)/.exec(value);
          if (f) {
            rules.get(key)['font-weight'] = f[1];
            rules.get(key)['font-size'] = `${f[2]}px`;
            rules.get(key)['line-height'] = f[3];
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
  marginTop: (v) => (/отступ сверху auto/.test(v) ? 'auto' : num(v, /отступ сверху ([\d.]+)px/)),
  marginBottom: (v) => {
    if (/отступ снизу auto/.test(v)) return 'auto';
    const own = num(v, /отступ снизу ([\d.]+)px/);
    if (own != null) return own;
    // Кадр пишет сокращением: «отступы 0 auto 13px».
    const short = /отступы\s+(\S+)\s+(\S+)\s+(\S+)/.exec(v);
    return short ? short[3].replace('px', '') : null;
  },
  gap: (v) => num(v, /зазор ([\d.]+)px/),
  height: (v) => num(v, /высота ([\d.]+)px/),
  width: (v) => num(v, /ширина ([\d.]+)px/),
  radius: (v) => num(v, /радиус ([\d.]+)px/),
  padding: (v) => num(v, /поля ([^,]+?)(?:,|$)/),
  fontWeight: (v) => num(v, /шрифт (\d+) [\d.]+px/),
  fontSize: (v) => num(v, /шрифт \d+ ([\d.]+)px/),
  lineHeight: (v) => num(v, /шрифт \d+ [\d.]+px\/([\d.]+)/),
  tracking: (v) => num(v, /трекинг (-?[\d.]+)em/),
  align: (v) => num(v, /выравнивание (\S+?)(?:,|$)/),
  justify: (v) => num(v, /распределение (\S+?)(?:,|$)/),
  direction: (v) => num(v, /направление (\S+?)(?:,|$)/),
  textAlign: (v) => num(v, /выключка (\S+?)(?:,|$)/),
  background: (v) => grabColor(v, 'фон'),
  color: (v) => grabColor(v, 'цвет')
};
const CSSPROP = {
  marginTop: 'margin-top', marginBottom: 'margin-bottom', gap: 'gap', height: 'height',
  width: 'width', radius: 'border-radius', padding: 'padding', fontWeight: 'font-weight',
  fontSize: 'font-size', lineHeight: 'line-height', tracking: 'letter-spacing',
  align: 'align-items', justify: 'justify-content', direction: 'flex-direction',
  textAlign: 'text-align',
  background: 'background', color: 'color'
};

// Роли канваса → песочные значения набора; продуктовая роль → её запасное.
// За тем, что роль вообще заведена, отдельно следит ui:v4:check.
const ROLE = {
  '--c1': '#f7efe2', '--c2': '#efe3cf', '--bg': '#fffaf1', '--tx': '#201e1d',
  '--ac': '#8a4a20', '--acs': '#c67139', '--on-acs': '#2b1608',
  '--gr': '#5c6a45', '--gr2': '#7a8a5e', '--gr-bg': '#eaefe0',
  '--red': '#b4442a', '--warn': '#c9922e', '--ovl': '#d99a63', '--val-bad': '#a8382b'
};
function norm(value) {
  if (value == null) return null;
  let s = String(value).trim().toLowerCase();
  s = s.replace(/var\(\s*(--[a-z0-9-]+)\s*\)/g, (_, r) => ROLE[r] || `var(${r})`);
  s = s.replace(/var\(\s*--[a-z0-9-]+\s*,\s*([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '$1');
  s = s.replace(/rgba\(var\(--ink\)\s*,\s*\.?(\d+)\)/g, (_, d) => `rgba(0,0,0,.${d})`);
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

function compare({ razbor, rules, frame, pairs }) {
  const drift = [];
  for (const pair of pairs) {
    const anchored = pair.length === 4;
    const found = resolveIndex(razbor, frame, pair[0]);
    if (found.error) { drift.push(found.error); continue; }
    const index = found.index + (anchored ? pair[1] : 0);
    const sel = anchored ? pair[2] : pair[1];
    const props = anchored ? pair[3] : pair[2];
    const value = razbor.get(`${frame}|${String(Number(index))}`);
    if (!value) { drift.push(`${frame} · ${index}: строки разбора нет`); continue; }
    const chain = Array.isArray(sel) ? sel : [sel];
    const merged = {};
    for (const s of chain) {
      if (!rules.has(s)) { drift.push(`${frame} · ${index}: нет правила ${s}`); continue; }
      Object.assign(merged, rules.get(s));
    }
    for (const kind of props) {
      const want = norm(PICK[kind](value));
      if (want == null) { drift.push(`${frame} · ${index}: в кадре нет «${kind}»`); continue; }
      const got = norm(merged[CSSPROP[kind]]);
      if (want !== got) {
        drift.push(`${chain[chain.length - 1]} { ${CSSPROP[kind]} } — кадр: ${want} · код: ${got}`);
      }
    }
  }
  return drift;
}

// Элементы каркаса кадра «Разбор · Калории» → правила продукта. Каркас общий
// у всех восемнадцати листов, поэтому одного кадра достаточно.
// Каркас листа разбора: элементы кадра «Разбор · Калории» → правила продукта.
// Каркас общий у всех восемнадцати листов, поэтому одного кадра достаточно.
const SHELL = [
  [75, '.widget-bd-sheet__grab', ['width', 'height']],
  [76, '.widget-bd-sheet__head', ['gap']],
  [77, '.widget-bd-sheet__title', ['fontWeight', 'fontSize', 'lineHeight']],
  [78, '.widget-bd-sheet__close', ['width', 'height']],
  [79, '.widget-bd-sheet__kicker', ['marginTop', 'fontWeight', 'fontSize']],
  [80, '.widget-bd-sheet__hero', ['marginTop', 'gap']],
  [81, '.widget-bd-sheet__hero-val', ['fontWeight', 'fontSize', 'lineHeight', 'tracking']],
  [82, '.widget-bd-sheet__hero-unit', ['fontWeight', 'fontSize']],
  [83, '.widget-bd-sheet__insight', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight']],
  [84, '.widget-bd-sheet__bars', ['marginTop', 'gap', 'height']],
  [95, '.widget-bd-sheet__stats', ['marginTop', 'gap']],
  [96, '.widget-bd-sheet__stat-row', ['gap']],
  [97, '.widget-bd-sheet__stat-label', ['fontWeight', 'fontSize', 'lineHeight']],
  [98, '.widget-bd-sheet__stat-value', ['fontWeight', 'fontSize', 'lineHeight']],
  [99, '.widget-bd-sheet__norm', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight']],
  [100, '.widget-bd-sheet__action', ['marginTop']]
];

// Новые виды графика шести листов пакета 22 августа: кадр → правило продукта.
const CHARTS = [
  ['Разбор · Клетчатка', 84, '.widget-bd-sheet__sources', ['marginTop', 'gap']],
  ['Разбор · Клетчатка', 87, '.widget-bd-sheet__source-bar', ['height', 'marginTop']],
  ['Разбор · Белок', 84, '.widget-bd-sheet__meal-bars', ['marginTop', 'gap', 'height']],
  ['Разбор · Белок', 90, '.widget-bd-sheet__meal-axis', ['gap', 'marginTop', 'fontWeight', 'fontSize']],
  ['Разбор · Качество еды', 84, '.widget-bd-sheet__stack', ['marginTop', 'gap', 'height']],
  ['Разбор · Качество еды', 85, '.widget-bd-sheet__stack-col', ['gap']],
  ['Разбор · Готовность ко сну', 84, '.widget-bd-sheet__evening', ['marginTop', 'gap']],
  ['Разбор · Готовность ко сну', 85, '.widget-bd-sheet__evening-row', ['gap']],
  ['Разбор · Готовность ко сну', 86, '.widget-bd-sheet__evening-label', ['width', 'fontWeight', 'fontSize']],
  ['Разбор · Готовность ко сну', 87, '.widget-bd-sheet__evening-track', ['height']],
  ['Разбор · Готовность ко сну', 91, '.widget-bd-sheet__evening-dots', ['gap', 'marginTop']],
  ['Разбор · Готовность ко сну', 93, '.widget-bd-sheet__evening-dot', ['width', 'height']]
];

// Кадр «Главная · дефолтная раскладка» — плитка за плиткой. Он же подложка
// всех восемнадцати листов разбора: больше тысячи строк снимка побайтово
// повторяют эти, поэтому закрытие кадра закрывает и их.
//
// Пары держатся не на номерах элементов, а на якоре: плитка опознаётся по
// своей приметной строке, остальное берётся смещением внутри неё. Дизайнер
// переставляет плитки в кадре (31 августа порядок вернулся к контракту, и
// элементы 61–73 перенумеровались) — таблица это переживает, а якорь, который
// перестал быть единственным, гейт называет вслух.
const MAIN = [
  // Калории, плитка-герой 2×2
  ['плитка: фон var(--c2), поля 14px', 0, 'body:has(.widgets-tab) .widget--calories', ['background', 'padding']],
  ['плитка: фон var(--c2), поля 14px', 1, '.widget-calories__hero-value', ['align', 'gap']],
  ['плитка: фон var(--c2), поля 14px', 2, '.widget-calories__hero-value .widget-calories__value--lg', ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  ['плитка: фон var(--c2), поля 14px', 3, '.widget-calories__hero-remaining-label', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  ['плитка: фон var(--c2), поля 14px', 4, '.widget-calories__hero-bar-wrap', ['marginTop']],
  ['плитка: фон var(--c2), поля 14px', 5, '.widget-calories__hero-bar', ['height', 'radius', 'background']],
  ['плитка: фон var(--c2), поля 14px', 6, '.widget-calories__hero-bar-fill', ['height', 'radius', 'background']],
  ['плитка: фон var(--c2), поля 14px', 7, '.widget-calories__hero-bar-foot', ['justify', 'align', 'marginTop']],
  ['плитка: фон var(--c2), поля 14px', 8, '.widget-calories__hero-bar-col', ['direction', 'gap']],
  ['плитка: фон var(--c2), поля 14px', 9, '.widget-calories__hero-bar-num', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['плитка: фон var(--c2), поля 14px', 10, '.widget-calories__hero-bar-cap', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['плитка: фон var(--c2), поля 14px', 11, '.widget-calories__hero-bar-col--end', ['align']],
  ['плитка: фон var(--c2), поля 14px', 12, '.widget-calories__hero-bar-num--good', ['color']],

  // Инсулиновая волна 2×2 — подпись под графиком
  ['отступ сверху auto, распределение space-between, выравнивание baseline', 0,
    ['.widget-v4-stack__footer', '.widget-v4-insulin-wave__footer'], ['marginTop', 'justify', 'align']],
  ['«3 приёма»', 0, ['.widget-v4-row__meta', '.widget-v4-row__meta--count'], ['fontWeight', 'fontSize', 'lineHeight']],

  // Кольца БЖУ 3×2
  ['зазор 6px, отступ сверху auto, отступ снизу auto', 0, '.widget-v4-macros', ['gap', 'marginTop', 'marginBottom']],
  ['зазор 6px, отступ сверху auto, отступ снизу auto', 1, '.widget-v4-macro', ['textAlign']],
  ['«Белки» — ключ', 0, '.widget-v4-macro__label', ['marginBottom']],
  ['«96» — моноцифры', 0, ['.widget-v4-macro__fact', '.widget-v4-macro__fact--bad'], ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['«/ 150»', 0, '.widget-v4-macro__fact-tgt', ['color']],
  ['«48» — моноцифры', 0, '.widget-v4-macro__fact', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],

  // Шаги 2×1
  ['распределение space-between, выравнивание baseline, зазор 6px', 0,
    ['.widget-v4-row', '.widget-v4-row--tight'], ['justify', 'align', 'gap']],
  ['«в среднем 8 940»', 0, '.widget-v4-row__meta', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['«в среднем 8 940»', 1, '.widget-v4-stepbars', ['align', 'gap', 'height', 'marginTop']],
  ['«в среднем 8 940»', 2, '.widget-v4-stepbars__bar', ['radius', 'background']],
  ['«в среднем 8 940»', 4, '.widget-v4-stepbars__bar.is-goal', ['background']],

  // Тепловая карта 2×1
  ['зазор 4px, отступ сверху auto', 0, '.widget-v4-heat', ['gap', 'marginTop']],
  ['зазор 4px, отступ сверху auto', 1, ['.widget-v4-heat__bar', '.widget-v4-heat__bar--d3'], ['height', 'radius', 'background']],
  ['зазор 4px, отступ сверху auto', 2, ['.widget-v4-heat__bar', '.widget-v4-heat__bar--d1'], ['height', 'radius', 'background']],
  ['зазор 4px, отступ сверху auto', 3, ['.widget-v4-heat__bar', '.widget-v4-heat__bar--d2'], ['height', 'radius', 'background']],

  // Сон 1×1
  ['«6,4» — моноцифры', 0, '.widget-v4-mini__value', ['marginTop']],

  // Риск-радар 2×2, вид «Шкала»
  ['«низкий»', -1, ['.widget-v4-hero-num', '.widget-v4-hero-num.widget-risk-scale-hero'], ['align', 'gap', 'marginTop']],
  ['«низкий»', 0, ['.widget-v4-hero-num__val', '.widget-risk-scale-hero .widget-v4-hero-num__val--risk'], ['fontWeight', 'fontSize', 'lineHeight']],
  ['«низкий»', 1, '.widget-risk-steps', ['gap', 'marginTop']],
  ['«низкий»', 2, '.widget-risk-steps__seg', ['height', 'radius']],
  ['«поднимут:', 0, '.widget-risk-rise', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],

  // Тренд здоровья 2×1: заливка плитки, низ и спарклайн
  ['плитка: фон var(--gr-bg)', 0, 'body:has(.widgets-tab) .widget--healthTrend', ['background']],
  ['плитка: фон var(--gr-bg)', 1, '.widget-trend-compact__row', ['align', 'justify', 'gap', 'marginTop']],
  ['плитка: фон var(--gr-bg)', 3, '.widget-trend-compact__spark', ['marginBottom']],

  // Вес 2×1, вид «Число и неделя»
  ['«−0,9 за неделю»', 0, '.widget-weight__number-week-delta', ['fontWeight', 'fontSize', 'lineHeight']],
  ['«−0,9 за неделю»', 1, '.widget-weight__number-week-spark', ['marginBottom']],

  // Белок и Клетчатка 1×1
  ['высота 4px, радиус 999px, фон rgba(var(--ink),.08), отступ сверху 7px', 0, '.widget-v4-goalbar', ['height', 'radius', 'background', 'marginTop']],
  ['высота 4px, радиус 999px, фон rgba(var(--ink),.08), отступ сверху 7px', 1, '.widget-v4-goalbar__fill', ['radius']],

  // Ярус «Рекомендуемый экран» и пустой экран
  ['радиус 20px, фон var(--c1), поля 26px 20px', 0, '.widget-v4-empty', ['radius', 'background', 'padding']],
  ['радиус 20px, фон var(--c1), поля 16px', 0, '.widget-v4-recommended__card', ['radius', 'background', 'padding', 'align', 'gap']],
  ['«Вернуть рекомендуемый экран»', 0, '.widget-v4-recommended__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['«Вернуть рекомендуемый экран»', 1, '.widget-v4-recommended__desc', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  ['«Вернуть рекомендуемый экран»', 2, '.widget-v4-recommended__btn', ['align', 'padding', 'radius', 'fontWeight', 'fontSize', 'lineHeight', 'color']],

  // Пустой экран
  ['«Виджетов нет»', 0, ['.widgets-empty__title', '.widget-v4-empty .widgets-empty__title'], ['fontWeight', 'fontSize', 'color']],
  ['«Виджетов нет»', 1, '.widget-v4-empty .widgets-empty__desc', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  ['«Виджетов нет»', 2, '.widget-v4-empty__btn', ['align', 'gap', 'marginTop', 'padding', 'radius', 'background', 'fontWeight', 'fontSize', 'color']],
  ['«Вернуть стандартный экран»', 0, '.widget-v4-empty__reset', ['align', 'justify', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']]
];

// Кадры «Шторка · …» — лист смены вида, десять штук. Каркас у всех один, но
// номера подписи, галочки и превью в каждом свои: таблица собирается из самого
// разбора по форме строки, поэтому переживает перенумерацию кадра.
function shutterPairs(razbor) {
  const frames = [...new Set([...razbor.keys()]
    .map((k) => k.split('|')[0])
    .filter((f) => /^Шторка · [^·]+$/.test(f)))];
  const pairs = [];
  for (const frame of frames) {
    pairs.push([frame, 11, '.widget-wd-sheet__grab', ['width', 'height', 'radius', 'background', 'marginBottom']]);
    pairs.push([frame, 12, '.widget-wd-sheet__subtitle', ['marginTop']]);
    pairs.push([frame, 13, '.widget-wd-sheet__list', ['direction', 'gap', 'marginTop']]);
    // Строка варианта: превью 3×2 не оставляет места подписи рядом, и кадр
    // складывает её колонкой.
    const row = razbor.get(`${frame}|14`) || '';
    pairs.push(/направление column/.test(row)
      ? [frame, 14, '.widget-wd-sheet__opt--stacked', ['direction', 'gap']]
      : [frame, 14, '.widget-wd-sheet__opt', ['align', 'gap']]);
    let title = null;
    let check = null;
    let preview = null;
    for (let i = 15; i <= 60 && !(title && check && preview); i += 1) {
      const value = razbor.get(`${frame}|${i}`);
      if (value == null) continue;
      if (!title && /шрифт 700 11\.5px\/1\.3/.test(value)) {
        title = [frame, i, '.widget-wd-sheet__opt-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']];
      }
      if (!check && /^флекс none, цвет var\(--ac\)$/.test(value)) {
        check = [frame, i, '.widget-wd-sheet__check', ['color']];
      }
      if (!preview) {
        const size = /^плитка: ширина (\d+)px, высота (\d+)px/.exec(value);
        if (size) {
          const key = size[1] === '68' ? '1x1' : size[1] === '218' ? '3x2' : (size[2] === '64' ? '2x1' : '2x2');
          preview = [frame, i,
            ['.widget-wd-sheet__preview', `.widget-wd-sheet__preview--${key}`], ['width', 'height']];
        }
      }
    }
    for (const p of [title, check, preview]) if (p) pairs.push(p);
  }
  return pairs;
}


const EXCEPTIONS = new Map([
  // Кадр рисует круг 30×30 без зоны нажатия. Палец меньше 44 px не ловит,
  // поэтому круг остался 30 px, а зона растянута псевдоэлементом ::before.
  ['.widget-bd-sheet__close|hit-area', 'зона нажатия 44 px псевдоэлементом'],
  // Кадр «Разбор · Готовность ко сну» рисует четвёртым фактором экранное
  // время. Владелец 30 августа решил его не заводить: это самоотчёт, а
  // чек-ин мы сознательно укорачивали. Четвёртым идёт вода.
  ['factorRows|экран', 'экранное время не заводим, решение владельца 30.08'],
  // Тот же кадр даёт «обработанное» третьей частью столбика качества еды.
  // Признак продукта в базе не размечен — столбик из двух частей.
  ['stackedDays|обработанное', 'третья часть ждёт разметки базы'],
  // Инвариант product-модалок (CLAUDE.md): dim подложки берётся из токена
  // --v4-modal-backdrop-dim (0.45), кадры шторки рисуют 0.42.
  ['.widget-wd-sheet__scrim|background', 'dim из токена набора, инвариант старше кадра'],
  // Лист стоит на нижнем крае экрана: без env(safe-area-inset-bottom) его низ
  // уезжает под домашний индикатор. Кадр рисует телефон без выреза.
  ['.widget-wd-sheet|padding', 'нижнее поле держит safe-area, кадр её не рисует']
]);

describe('каркас листа разбора против разбора кадров канваса', () => {
  const source = fs.readFileSync(CANVAS, 'utf8');
  const razbor = readRazbor(source);
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('раздел «Разбор кадров» в канвасе есть и покрывает восемнадцать листов', () => {
    expect(source).toContain('Разбор кадров · элемент за элементом');
    const sheets = new Set(
      [...razbor.keys()]
        .map((k) => k.split('|')[0])
        .filter((label) => label.startsWith('Разбор · '))
    );
    expect(sheets.size).toBe(18);
  });

  it('каркас листа совпадает с кадром «Разбор · Калории»', () => {
    expect(compare({ razbor, rules, frame: 'Разбор · Калории', pairs: SHELL })).toEqual([]);
  });

  it('новые виды графика совпадают со своими кадрами', () => {
    const drift = [];
    for (const [frame, index, sel, props] of CHARTS) {
      drift.push(...compare({ razbor, rules, frame, pairs: [[index, sel, props]] }));
    }
    expect(drift).toEqual([]);
  });

  // Кадр Главной — плитка за плиткой. Он же подложка восемнадцати листов
  // разбора, поэтому его закрытие закрывает 1 044 строки снимка следом.
  it('кадр «Главная · дефолтная раскладка» совпадает с плитками', () => {
    expect(compare({
      razbor, rules, frame: 'Главная · дефолтная раскладка', pairs: MAIN
    })).toEqual([]);
  });

  it('подложка листов разбора — тот же экран, что и кадр Главной', () => {
    // Строки 02…72 каждого листа повторяют строки 01…71 кадра Главной: под
    // шторкой стоит он же. Совпадение проверяется, чтобы закрытие кадра
    // Главной честно закрывало и подложку.
    const main = [];
    for (let i = 1; i <= 87; i += 1) {
      const v = razbor.get(`Главная · дефолтная раскладка|${i}`);
      if (v != null) main.push(v);
    }
    const frames = [...new Set([...razbor.keys()]
      .map((k) => k.split('|')[0])
      .filter((f) => f.startsWith('Разбор · ')))];
    let same = 0;
    for (const frame of frames) {
      for (let i = 2; i <= 72; i += 1) {
        if (razbor.get(`${frame}|${i}`) === main[i - 2]) same += 1;
      }
    }
    expect(same).toBeGreaterThanOrEqual(1000);
  });

  it('десять кадров «Шторка · …» совпадают с листом смены вида', () => {
    const pairs = shutterPairs(razbor);
    // Десять кадров: каркас, подпись, галочка и размер превью в каждом.
    expect(new Set(pairs.map((p) => p[0])).size).toBe(10);
    const drift = [];
    for (const [frame, index, sel, props] of pairs) {
      drift.push(...compare({ razbor, rules, frame, pairs: [[index, sel, props]] }));
    }
    expect(drift).toEqual([]);
  });

  // Дефект, который нашло превью 30 августа: столбик недели рисовался
  // вложенным <i> с высотой в процентах внутри флекс-элемента, у которого
  // своей высоты нет, — проценты считать было не от чего, и все столбики
  // схлопывались в линию. Кадр рисует столбик одним элементом.
  it('высота столбика недели живёт на самом столбике, не на вложенном', () => {
    const variants = fs.readFileSync(
      path.resolve(__dirname, '../heys_widgets_variants_v4.js'), 'utf8'
    );
    expect(rules.has('.widget-bd-sheet__bar > i')).toBe(false);
    expect(rules.get('.widget-bd-sheet__bar')['border-radius']).toBe('6px 6px 3px 3px');
    expect(variants).not.toMatch(/widget-bd-sheet__bar'[\s\S]{0,200}createElement\('i'/);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(5);
  });
});
