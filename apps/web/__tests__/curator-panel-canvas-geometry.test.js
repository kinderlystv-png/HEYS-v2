// Геометрия кабинета куратора против кадров data-demo="stop" канваса
// curator-cabinet.v4.dc.html на 375 px.
//
// Метод выбран по канвасу: геометрия живёт в классах его собственного <style>
// (.cd, .cl, .av, .cln, .badge, .tier, .mch, .btn, .tab, .fld, .stc, .row),
// поэтому сверка идёт парами «класс кадра → правило продуктового CSS».
//
// Сначала гейт закрывал только панель: остальные вкладки не были сведены, а
// красный тест, который никто не может починить, отключают в первый же день.
// Все шестнадцать кадров сведены 30 августа, и пары расширены на весь
// кабинет — это и есть приёмка покадрового разбора, который дизайнер прислал
// тем же числом: разбор описывает те же элементы теми же числами, но сверка
// по классам берёт числа из самого канваса и потому не устаревает.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/curator-cabinet.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/734-ui-v4-curator-panel.css');

function parseRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map();
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = match[2].trim();
    for (const selector of match[1].split(',')) {
      const key = selector.trim();
      if (!rules.has(key)) rules.set(key, []);
      rules.get(key).push(body);
    }
  }
  return rules;
}

// Канвас пишет шрифт шорткатом `font: 600 11px/1.35 Figtree`, продуктовый CSS —
// раскладкой. Приводим обе формы к одному виду.
function declarations(bodies) {
  const out = {};
  for (const body of bodies || []) {
    for (const decl of body.split(';')) {
      const at = decl.indexOf(':');
      if (at < 0) continue;
      const prop = decl.slice(0, at).trim();
      const value = decl.slice(at + 1).trim();
      if (prop === 'font') {
        const font = /^(\d+)\s+([\d.]+)px\/([\d.]+)/.exec(value);
        if (font) {
          out['font-weight'] = font[1];
          out['font-size'] = `${font[2]}px`;
          out['line-height'] = font[3];
          continue;
        }
      }
      if (prop === 'margin') {
        const parts = value.split(/\s+/);
        if (parts.length === 3) {
          out['margin-top'] = parts[0];
          out['margin-bottom'] = parts[2];
          continue;
        }
      }
      out[prop] = value;
    }
  }
  return out;
}

// Роли канваса → роли продуктовой палитры. Тот же словарь, что у сведённых
// зон: имена канваса продуктовыми ролями не являются.
const ROLE = new Map(Object.entries({
  '--c1': '--v4-surface',
  '--c2': '--v4-hero',
  '--bg': '--v4-bg',
  '--tx': '--v4-ink',
  '--ac': '--v4-act-text',
  '--ac2': '--v4-warn-text',
  '--acs': '--v4-act',
  '--on-acs': '--v4-btn-on-act',
  '--gr': '--v4-ok-text',
  '--gr-bg': '--v4-ok-bg',
  '--red': '--v4-bad-text',
}));

// Прозрачные чернила канваса значат разное в разных местах: у линии это роль
// линии, у текста — ступень тона. Один общий словарь свёл бы подпись 60 % к
// цвету рамки, поэтому нормализация знает, какое свойство сверяет.
function inkRole(alpha, prop) {
  if (prop.startsWith('border')) {
    if (alpha === 0.12) return '--v4-track';
    if (alpha === 0.18) return '--v4-edge';
    return '--v4-line';
  }
  if (alpha === 0.56) return '--v4-ink-data';
  if (alpha >= 0.55) return '--v4-ink-2';
  if (alpha >= 0.38) return '--v4-ink-3';
  return '--v4-line';
}

function normalize(value, prop = '') {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    // запасное значение роли — запись для гейта перекраски, не второе значение
    .replace(/var\((--[a-z0-9-]+)\s*,(?:[^()]|\([^()]*\))*\)/gi, 'var($1)')
    .replace(
      /rgba\(var\(--ink\)\s*,\s*(\.?\d*\.?\d+)\)/gi,
      (whole, a) => `var(${inkRole(parseFloat(a[0] === '.' ? `0${a}` : a), prop)})`,
    )
    // color-mix продукта — та же ступень тона, записанная процентом
    .replace(
      /color-mix\(in srgb, var\(--v4-ink\) (\d+)%, transparent\)/gi,
      (whole, pct) => `var(${inkRole(Number(pct) / 100, prop)})`,
    )
    .replace(/var\((--[a-zA-Z0-9-]+)\)/g, (whole, name) => `var(${ROLE.get(name) || name})`)
    // `flex: none` и `flex: 0 0 auto` — одно и то же, записанное по-разному
    .replace(/^none$/, '0 0 auto')
    // .04em и 0.04em — одно число
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2')
    .toLowerCase();
}

const PAIRS = [
  // Полотно вкладки и карточка группы.
  ['.sc', '.cur-panel'],
  ['.tier', '.cur-group__title'],
  ['.cd', '.cur-group__card'],
  ['.grp', '.cur-panel__empty'],
  ['.grp', '.cur-cab__card'],
  ['.h1', '.cur-panel__empty-title'],
  ['.p', '.cur-panel__empty-note'],
  // Строка клиента.
  ['.cl', '.cur-row'],
  ['.av', '.cur-row__avatar'],
  ['.cln', '.cur-row__name'],
  ['.cls', '.cur-row__state'],
  ['.dot', '.cur-row__dot'],
  // Пилюля давности и чип фильтра — одна и та же пилюля кадра.
  ['.badge', '.cur-row__age'],
  ['.badge', '.cur-chip'],
  // Ряд вкладок кабинета.
  ['.tabs', '.cur-cab__tabs'],
  ['.tab', '.cur-cab__tab'],
  // Метка данных: метрики дня, состояние места в очереди, срок подписки.
  ['.mch', '.cur-cab__mch'],
  // Круглые кнопки: «⋯» в карточке и отклонение в очереди.
  ['.ico', '.cur-cab__more'],
  // Кнопки: главная на акценте и вторичная на подложке.
  ['.btn', '.cur-cab__open'],
  ['.btn2c', '.cur-cab__create'],
  // Строка списка «ключ — значение».
  ['.row', '.cur-kv'],
  // Служебный лист снизу. Их в кабинете два, и кадр у них один: служебный
  // лист вкладок и лист разбора клиента на Панели. Второй в парах не стоял
  // вовсе — вместе со всем семейством .cur-sheet*, а это сорок правил.
  ['.sheet', '.cur-cab__sheet'],
  ['.sheet', '.cur-sheet'],
  ['.sheet', '.cur-cab__menu'],
  // Поля формы нового клиента.
  ['.fld', '.cur-field__input'],
  ['.flab', '.cur-field__label'],
  // Плитки диагностики.
  ['.st2', '.cdo-metrics'],
  ['.stc', '.cdo-metric'],
  ['.stv', '.cdo-metric strong'],
  ['.stk', '.cdo-metric span'],
];


const CHECKED = [
  'padding', 'margin-top', 'margin-bottom', 'margin-right', 'border-radius',
  'gap', 'height', 'width', 'font-size', 'font-weight', 'line-height',
  'letter-spacing', 'text-transform', 'background', 'color', 'align-items',
  'justify-content', 'flex', 'border-bottom', 'vertical-align',
];

// Осознанные отступления — поимённо, иначе список молча растёт.
const EXCEPTIONS = new Set([
  // Чип фильтра — кнопка: у кадра это span, и заливка выбранного состояния
  // стоит инлайном. Базовый фон и оба состояния проверяет тест вида.
  '.cur-chip|background',
  // Цвет чипа-фильтра кадры тоже задают инлайном: невыбранный идёт чернилами
  // 45–50 %, выбранный — на акценте. Базовый .badge канваса красит акцентом
  // всегда, потому что им же нарисованы пилюли-значки (срок, давность), а не
  // фильтры. Тон обоих состояний проверяет тест вида.
  '.cur-chip|color',
  // `.sc { flex: none }` — свойство раскладки самого канваса: кадр там флекс-
  // ребёнок макета телефона. Содержимое вкладки в продукте ничьим флекс-
  // ребёнком не является, и повторять это значило бы копировать чужую сетку.
  '.cur-panel|flex',
  // Кегль главной кнопки в кадрах разный: 12,5 в карточке списка и 13 в
  // служебном листе. Базовый класс держит меньший — карточек в кабинете
  // больше, — а лист поднимает его правилом `.cur-cab__sheet-body
  // .cur-cab__open`, которое сверяется отдельной проверкой ниже.
  '.cur-cab__open|font-size',
  // Поля листа стоят на его теле, а не на самом окне: шапка листа с закрытием
  // идёт во всю ширину и своих полей не имеет. Значения кадра проверяются на
  // `.cur-cab__sheet-body` отдельной проверкой ниже.
  '.cur-cab__sheet|padding',
]);

// Сколько клеток «пара × свойство» гейт реально сверяет. Число заморожено:
// падение означает, что проверка потеряла пару или правило класса, рост —
// что охват расширили и число пора поднять.
// 162, а не 163: 31 августа к исключениям добавился цвет чипа-фильтра, и
// сверяемая клетка честно ушла из счёта. Падение порога допустимо только так —
// вместе с новым названным исключением; падение без него означает потерю пары
// или правила класса, и тогда чинить нужно причину, а не число.
const COVERAGE_FLOOR = 165;

// Свойства, которых нет ни в одном правиле класса канваса: гейт не читает их
// ни разу, и ссылаться на него по ним нельзя. Сейчас список пуст — кегль,
// начертание и интерлиньяж приходят из шортката `font:`, который declarations
// раскрывает. Список именно проверяется, а не описывается: если у канваса
// пропадёт класс с типографикой, свойство молча выпадет из сверки, и тест
// скажет об этом здесь.
const BLIND_PROPS = [];

describe('геометрия панели куратора против кадров канваса', () => {
  const canvasSource = fs.readFileSync(CANVAS, 'utf8');
  const helmet = canvasSource.slice(
    canvasSource.indexOf('<style>') + '<style>'.length,
    canvasSource.indexOf('</style>'),
  );
  const canvas = parseRules(helmet);
  const product = parseRules(fs.readFileSync(CSS, 'utf8'));

  it('каждый блок кадра имеет пару в продуктовом CSS', () => {
    const orphans = PAIRS.filter(([c, m]) => !canvas.has(c) || !product.has(m));
    expect(orphans).toEqual([]);
  });

  it('числа совпадают с кадрами', () => {
    const drift = [];
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
      // Значение может стоять на самом узле или на его базовом классе —
      // собираем цепочку так же, как её видит браузер: от общего к частному.
      const base = productSel.split(/\s+/).pop().replace(/\[[^\]]*\]/g, '');
      const parent = base.replace(/(__[a-z-]+|\.is-[a-z-]+|--[a-z-]+)$/, '');
      const chain = [];
      for (const sel of [parent, base, productSel]) {
        if (sel && product.has(sel) && !chain.includes(sel)) chain.push(sel);
      }
      const got = declarations(chain.flatMap((sel) => product.get(sel) || []));

      for (const prop of CHECKED) {
        if (!(prop in want)) continue;
        if (EXCEPTIONS.has(`${productSel}|${prop}`)) continue;
        const expected = normalize(want[prop], prop);
        const actual = prop in got ? normalize(got[prop], prop) : '— нет —';
        if (expected !== actual) {
          drift.push(`${productSel} { ${prop} } — кадр: ${expected}, код: ${actual}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  // Сколько гейт на самом деле читает. Свойство сверяется, только если оно
  // стоит в правиле класса канваса: разбор кадров кабинета написан почти весь
  // инлайном, и `if (!(prop in want)) continue` молча пропускает остальное.
  // Пока охват не назван числом, «сверено гейтом» в вердикте означает не то,
  // что читатель думает: 31 августа на этой фразе стояло 127 вердиктов, а
  // читалась пятая часть клеток.
  function measureCoverage() {
    let compared = 0;
    let skipped = 0;
    const blind = new Map();
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
      for (const prop of CHECKED) {
        if (EXCEPTIONS.has(`${productSel}|${prop}`)) continue;
        if (prop in want) compared += 1;
        else {
          skipped += 1;
          blind.set(prop, (blind.get(prop) || 0) + 1);
        }
      }
    }
    return { compared, skipped, blind };
  }

  it('гейт называет свой охват', () => {
    const { compared, skipped, blind } = measureCoverage();
    const total = compared + skipped;
    const never = [...blind.entries()]
      .filter(([, n]) => n === PAIRS.length)
      .map(([prop]) => prop)
      .sort();

    console.info(
      `[кабинет] сверено ${compared} из ${total} клеток `
      + `(${((compared / total) * 100).toFixed(1)} %), пар ${PAIRS.length}; `
      + `не читается ни в одной паре: ${never.length ? never.join(', ') : 'нет'}`,
    );

    // Храповик охвата: опускаться нельзя, подниматься нужно с новым числом.
    // Иначе пара, у которой пропало правило класса, тихо уходит из сверки —
    // ровно так и появляются вердикты, ссылающиеся на несуществующую защиту.
    expect(compared).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    if (compared > COVERAGE_FLOOR) {
      throw new Error(
        `Охват вырос: сверяется ${compared} клеток вместо ${COVERAGE_FLOOR}. `
        + 'Поднимите COVERAGE_FLOOR — иначе следующее падение охвата пройдёт незаметно.',
      );
    }

    // Свойства, которых гейт не читает ни в одной паре, обязаны быть названы:
    // на них нельзя ссылаться как на проверенные.
    expect(never).toEqual(BLIND_PROPS);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(5);
  });

  it('оба отступления держат числа кадра там, где они живут', () => {
    // Кегль кнопки листа и поля листа вынесены из общей сверки не потому, что
    // разошлись, а потому что стоят на другом селекторе. Здесь они проверены.
    const sheetButton = declarations(product.get('.cur-cab__sheet-body .cur-cab__open'));
    expect(normalize(sheetButton['font-size'])).toBe('13px');
    expect(normalize(sheetButton['min-height'])).toBe('48px');
    const sheetBody = declarations(product.get('.cur-cab__sheet-body'));
    // Кадр даёт полю листа 20 сверху, 18 по бокам, 16 снизу. Верх забирает
    // шапка листа, поэтому телу остаются бока и низ.
    expect(normalize(sheetBody.padding)).toContain('18px');
    expect(normalize(sheetBody.padding)).toContain('20px');
  });

  it('полотно вкладки одно на кабинет и держит поля кадра', () => {
    // Поля вкладки живут на её полотне, а не на прокручиваемой области: иначе
    // они складываются, и вкладки встают на разном расстоянии от края —
    // «Панель» на 34, «Очередь» на 32, «Клиенты» на 16. Оба класса полотна
    // держат числа кадрового `.sc`, а у .cur-cab__content полей нет вовсе.
    const sc = declarations(canvas.get('.sc'));
    const pane = declarations(product.get('.cur-cab__pane'));
    const panel = declarations(product.get('.cur-panel'));
    const content = declarations(product.get('.cur-cab__content'));
    expect(normalize(pane.padding)).toBe(normalize(sc.padding));
    expect(normalize(panel.padding)).toBe(normalize(sc.padding));
    expect(content.padding).toBeUndefined();
  });

  it('гейт закрывает весь кабинет, а не одну панель', () => {
    // Пока была сведена только панель, кадры остальных вкладок в пары не
    // входили. Теперь входят все — проверка держит это утверждение, чтобы
    // класс не выпал из пар молча при следующей правке.
    const everyTab = ['.mch', '.tabs', '.tab', '.btn', '.btn2c', '.row',
      '.sheet', '.fld', '.stc'];
    for (const sel of everyTab) {
      expect(PAIRS.some(([c]) => c === sel), sel).toBe(true);
    }
  });
});

describe('кабинет куратора · единая роль данных', () => {
  const product = parseRules(fs.readFileSync(CSS, 'utf8'));
  const selectors = [
    '.cur-row__count--muted',
    '.cur-row__age.is-data',
    '.cur-sheet__fact-hint',
    '.cur-cab__subtitle',
    '.cur-cab__tab',
    '.cur-cab__mch',
    '.cur-cab__event',
    '.cdo-metric span',
    '.cdo-list-row:last-child .cdo-list-val',
    '.cur-cab__tab-note',
    '.cur-cab__source',
    '.cur-kv__val',
    '.cur-cab__queue-limits-key',
    '.cur-cab__queue-limits-val',
    '.cur-field__label',
    '.cdo-note',
    '.cur-cab__subtabs-hint',
    '.cur-cab__queue-state',
  ];

  it('изменённые строки canvas используют --v4-ink-data (56 %)', () => {
    for (const selector of selectors) {
      expect(declarations(product.get(selector)).color, selector)
        .toContain('--v4-ink-data');
    }
  });
});
