// Каркас листа разбора против раздела канваса «Разбор кадров · элемент за
// элементом» (пакет 30 августа). Раздел даёт каждому нарисованному элементу
// собственные числа, и каркас листа во всех восемнадцати кадрах «Разбор · …»
// один и тот же — здесь он сверяется с продуктовым CSS по строкам контракта,
// а не по кадру глазами.
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
        // Сокращение `margin: 12px 0 0` тоже даёт верхний отступ.
        if (prop === 'margin') rules.get(key)['margin-top'] = value.split(/\s+/)[0];
      }
    }
  }
  return rules;
}

// Числа из фразы разбора: «шрифт 600 44px/.9 Figtree», «отступ сверху 16px»…
function pick(value, kind) {
  const num = (re) => {
    const m = re.exec(value);
    return m ? m[1] : null;
  };
  switch (kind) {
    case 'marginTop': return num(/отступ сверху ([\d.]+)px/);
    case 'gap': return num(/зазор ([\d.]+)px/);
    case 'height': return num(/высота ([\d.]+)px/);
    case 'width': return num(/ширина ([\d.]+)px/);
    case 'radius': return num(/радиус ([\d.]+)px/);
    case 'padding': return num(/поля ([^,]+)/);
    case 'fontWeight': return num(/шрифт (\d+) [\d.]+px/);
    case 'fontSize': return num(/шрифт \d+ ([\d.]+)px/);
    case 'lineHeight': return num(/шрифт \d+ [\d.]+px\/([\d.]+)/);
    case 'tracking': return num(/трекинг (-?[\d.]+)em/);
    default: return null;
  }
}

// Нормализация: канвас пишет «.9», продукт — «0.9»; кегль продукта бывает в rem.
function norm(value) {
  if (value == null) return null;
  return String(value)
    .trim()
    .replace(/([\d.]+)rem/g, (_, n) => `${parseFloat(n) * 16}px`)
    .replace(/^\./, '0.')
    .replace(/^-\./, '-0.')
    .replace(/(px|em)$/, '');
}

// Элементы каркаса кадра «Разбор · Калории» → правила продукта. Каркас общий
// у всех восемнадцати листов, поэтому одного кадра достаточно.
const SHELL = [
  ['75', '.widget-bd-sheet__grab', [['width', 'width'], ['height', 'height']]],
  ['76', '.widget-bd-sheet__head', [['gap', 'gap']]],
  ['77', '.widget-bd-sheet__title', [
    ['fontWeight', 'font-weight'], ['fontSize', 'font-size'], ['lineHeight', 'line-height']
  ]],
  ['78', '.widget-bd-sheet__close', [['width', 'width'], ['height', 'height']]],
  ['79', '.widget-bd-sheet__kicker', [
    ['marginTop', 'margin-top'], ['fontWeight', 'font-weight'], ['fontSize', 'font-size']
  ]],
  ['80', '.widget-bd-sheet__hero', [['marginTop', 'margin-top'], ['gap', 'gap']]],
  ['81', '.widget-bd-sheet__hero-val', [
    ['fontWeight', 'font-weight'], ['fontSize', 'font-size'],
    ['lineHeight', 'line-height'], ['tracking', 'letter-spacing']
  ]],
  ['82', '.widget-bd-sheet__hero-unit', [['fontWeight', 'font-weight'], ['fontSize', 'font-size']]],
  ['83', '.widget-bd-sheet__insight', [
    ['marginTop', 'margin-top'], ['fontWeight', 'font-weight'], ['fontSize', 'font-size'],
    ['lineHeight', 'line-height']
  ]],
  ['84', '.widget-bd-sheet__bars', [
    ['marginTop', 'margin-top'], ['gap', 'gap'], ['height', 'height']
  ]],
  ['95', '.widget-bd-sheet__stats', [['marginTop', 'margin-top'], ['gap', 'gap']]],
  ['96', '.widget-bd-sheet__stat-row', [['gap', 'gap']]],
  ['97', '.widget-bd-sheet__stat-label', [
    ['fontWeight', 'font-weight'], ['fontSize', 'font-size'], ['lineHeight', 'line-height']
  ]],
  ['98', '.widget-bd-sheet__stat-value', [
    ['fontWeight', 'font-weight'], ['fontSize', 'font-size'], ['lineHeight', 'line-height']
  ]],
  ['99', '.widget-bd-sheet__norm', [
    ['marginTop', 'margin-top'], ['fontWeight', 'font-weight'], ['fontSize', 'font-size'],
    ['lineHeight', 'line-height']
  ]],
  ['100', '.widget-bd-sheet__action', [['marginTop', 'margin-top']]]
];

// Новые виды графика шести листов пакета 22 августа: кадр → правило продукта.
const CHARTS = [
  ['Разбор · Клетчатка', '84', '.widget-bd-sheet__sources', [['marginTop', 'margin-top'], ['gap', 'gap']]],
  ['Разбор · Клетчатка', '87', '.widget-bd-sheet__source-bar', [['height', 'height'], ['marginTop', 'margin-top']]],
  ['Разбор · Белок', '84', '.widget-bd-sheet__meal-bars', [
    ['marginTop', 'margin-top'], ['gap', 'gap'], ['height', 'height']
  ]],
  ['Разбор · Белок', '90', '.widget-bd-sheet__meal-axis', [
    ['gap', 'gap'], ['marginTop', 'margin-top'], ['fontWeight', 'font-weight'], ['fontSize', 'font-size']
  ]],
  ['Разбор · Качество еды', '84', '.widget-bd-sheet__stack', [
    ['marginTop', 'margin-top'], ['gap', 'gap'], ['height', 'height']
  ]],
  ['Разбор · Качество еды', '85', '.widget-bd-sheet__stack-col', [['gap', 'gap']]],
  ['Разбор · Готовность ко сну', '84', '.widget-bd-sheet__evening', [
    ['marginTop', 'margin-top'], ['gap', 'gap']
  ]],
  ['Разбор · Готовность ко сну', '85', '.widget-bd-sheet__evening-row', [['gap', 'gap']]],
  ['Разбор · Готовность ко сну', '86', '.widget-bd-sheet__evening-label', [
    ['width', 'width'], ['fontWeight', 'font-weight'], ['fontSize', 'font-size']
  ]],
  ['Разбор · Готовность ко сну', '87', '.widget-bd-sheet__evening-track', [['height', 'height']]],
  ['Разбор · Готовность ко сну', '92', '.widget-bd-sheet__evening-dots', [
    ['gap', 'gap'], ['marginTop', 'margin-top']
  ]],
  ['Разбор · Готовность ко сну', '94', '.widget-bd-sheet__evening-dot', [
    ['width', 'width'], ['height', 'height']
  ]]
];

// Отступления, названные вслух: каждое стоит на строке контракта или на
// инварианте продукта, который старше кадра.
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
  ['stackedDays|обработанное', 'третья часть ждёт разметки базы']
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
    const drift = [];
    for (const [index, selector, props] of SHELL) {
      const value = razbor.get(`Разбор · Калории|${index}`);
      expect(value, `нет строки разбора ${index}`).toBeTruthy();
      const rule = rules.get(selector);
      expect(rule, `нет правила ${selector}`).toBeTruthy();
      for (const [kind, cssProp] of props) {
        const want = norm(pick(value, kind));
        if (want == null) continue;
        const got = norm(rule[cssProp]);
        if (want !== got) drift.push(`${selector} { ${cssProp} } — кадр: ${want}, код: ${got}`);
      }
    }
    expect(drift).toEqual([]);
  });

  it('новые виды графика совпадают со своими кадрами', () => {
    const drift = [];
    for (const [frame, index, selector, props] of CHARTS) {
      const value = razbor.get(`${frame}|${index}`);
      expect(value, `нет строки разбора ${frame} ${index}`).toBeTruthy();
      const rule = rules.get(selector);
      expect(rule, `нет правила ${selector}`).toBeTruthy();
      for (const [kind, cssProp] of props) {
        const want = norm(pick(value, kind));
        if (want == null) continue;
        const got = norm(rule[cssProp]);
        if (want !== got) drift.push(`${selector} { ${cssProp} } — кадр: ${want}, код: ${got}`);
      }
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
    expect(EXCEPTIONS.size).toBe(3);
  });
});
