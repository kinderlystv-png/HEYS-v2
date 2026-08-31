// Геометрия вкладки «Актив» против кадров data-demo="stop" канваса
// tab-activity.v4.dc.html на 375 px.
//
// Глазами это не ловится: сдвиг на 1–2 px или полшага кегля выглядит как «чуть
// иначе» и заметен только рядом с кадром. Сверяем числами — и тест читает сам
// канвас, поэтому расхождение всплывает при правке любой из сторон.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/tab-activity.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/731-ui-v4-activity.css');

function parseRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map();
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = match[2].trim();
    for (const selector of match[1].split(',')) {
      const key = selector.trim().replace(/\s+/g, ' ');
      if (!rules.has(key)) rules.set(key, []);
      rules.get(key).push(body);
    }
  }
  return rules;
}

// Канвас пишет шрифт шорткатом `font: 600 12.5px/1 Figtree`, продуктовый CSS —
// им же или раскладкой. Приводим обе формы к одному виду.
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
      out[prop] = value;
    }
  }
  return out;
}

// Роли канваса → роли продуктовой палитры.
const ROLE = new Map(Object.entries({
  '--c1': '--v4-c1',
  '--c2': '--v4-hero',
  '--bg': '--v4-bg',
  '--tx': '--v4-ink',
  '--ac': '--v4-act-text',
  '--acs': '--v4-act',
  '--gr': '--v4-ok-text',
  '--gr2': '--v4-ok-fill',
  '--val-bad': '--v4-bad-text',
}));

// Ступени чернил набора. Кадр пишет альфу, продукт — роль; сверяем роли, а не
// записи. Ступеней четыре, и совпадают они не со всеми процентами кадра —
// несовпавшие остаются видимыми в отчёте и разобраны в списке исключений.
const INK_STEPS = new Map([
  ['.55', '--v4-ink-2'],
  ['.45', '--v4-ink-3'],
  ['.38', '--v4-ink-4'],
  ['.3', '--v4-ink-30'],
]);

function normalize(value, prop) {
  const isColor = prop === 'color';
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    // запасное значение роли — запись для гейта перекраски, не второе значение
    .replace(/var\((--[a-z0-9-]+)\s*,(?:[^()]|\([^()]*\))*\)/gi, 'var($1)')
    // Линии канваса записаны альфой от чернил. Ступени набора: 8 % — --v4-line,
    // 12 % — --v4-track, 18 % — --v4-edge; прочие проценты сводятся к --v4-line
    // (то же правило, что в сверке «Питания»).
    .replace(/rgba\(var\(--ink\)\s*,\s*(\.\d+)\)/gi, (whole, alpha) => {
      if (isColor) return INK_STEPS.has(alpha) ? `var(${INK_STEPS.get(alpha)})` : whole;
      if (alpha === '.12') return 'var(--v4-track)';
      if (alpha === '.18') return 'var(--v4-edge)';
      return 'var(--v4-line)';
    })
    .replace(/var\((--[a-zA-Z0-9-]+)\)/g, (whole, name) => `var(${ROLE.get(name) || name})`)
    // Первая поверхность объявлена в наборе дважды одним значением: --v4-c1
    // (имя роли канваса) и --v4-surface. Для сверки это одно и то же.
    .replace(/var\(--v4-surface\)/g, 'var(--v4-c1)')
    // .04em и 0.04em — одно число
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2')
    .toLowerCase();
}

// Пары «класс кадра → правило продукта». Пары заведены только там, где
// соответствие однозначно: канвас пользуется общими классами (.grp, .cd, .row),
// и один класс кадра отвечает нескольким блокам продукта.
const PAIRS = [
  ['.tier', '.activity-v4-tier'],
  ['.k', '.activity-v4-hero__label'],
  ['.big', '.activity-v4-hero__value'],

  ['.grp', '.activity-v4-hero'],
  ['.grp', '.activity-v4-steps'],
  ['.grp', '.activity-v4-history-empty'],
  ['.bar', '.activity-v4-steps__track'],
  ['.sm', '.activity-v4-steps__note'],
  ['.p', '.activity-v4-history-empty__text'],

  ['.cd', '.activity-v4-breakdown'],
  ['.cd', '.activity-v4-today'],
  ['.cd', '.activity-v4-history'],
  ['.btn', '.activity-v4-cta'],
  ['.row', '.activity-v4-breakdown__row'],
  ['.row', '.activity-v4-today__row'],
  ['.row', '.activity-v4-history__row'],

  ['.lab', '.activity-v4-today__key'],
  ['.lab', '.activity-v4-history__key'],
  ['.lab', '.activity-v4-breakdown__key'],
];

const CHECKED = [
  'padding', 'margin-top', 'border-radius', 'gap', 'height',
  'min-height', 'font-size', 'font-weight', 'line-height',
  'letter-spacing', 'background', 'color', 'align-items', 'justify-content',
  'flex-direction', 'text-transform',
];

// Осознанные отступления. Каждое названо в
// docs/implementation/ACTIVITY_TAB_V4_PROTOCOL.md §4 с причиной.
const EXCEPTIONS = new Set([
  // Ступени чернил в наборе фиксированы (55 / 45 / 38 / 30 %), и список ролей
  // заморожен — может только уменьшаться. Там, где кадр называет ступень,
  // которой нет, берётся ближайшая существующая, а новая не заводится.
  // 42 % → 45 %:
  '.activity-v4-hero__label|color',
  '.activity-v4-steps__note|color',
  // 60 % → 55 %:
  '.activity-v4-history-empty__text|color',

  // Шапка цели дня — .grp кадра, но фон кадр переопределяет прямо в разметке
  // на --c2 (контракт строка 34). Класс несёт --c1, поэтому фон парой не
  // сверяется; это не отступление, а граница метода.
  '.activity-v4-hero|background',

  // Кнопка действия стоит на акценте, а роли «текст на акценте» в наборе нет:
  // .btn кадра красит текст в --on-acs, продукт называет цвет поимённо.
  '.activity-v4-cta|color',

  // Сноска шагов отбита на 10 px — это её собственное число из разбора кадра
  // («Актив · шаги оценены · 18»), а 12 px у класса .sm общие для всех сносок
  // канваса. Число элемента старше числа его класса.
  '.activity-v4-steps__note|margin-top',
]);

// Сколько клеток «пара × свойство» гейт реально сверяет. Свойство читается,
// только если стоит в правиле класса канваса: если разбор кадра написан
// инлайном, `if (!(prop in want)) continue` молча пропускает его. Число
// заморожено — падение значит потерю пары или правила, рост просит поднять.
const COVERAGE_FLOOR = 77;

describe('геометрия вкладки «Актив» против кадров канваса', () => {
  const canvasSource = fs.readFileSync(CANVAS, 'utf8');
  const helmet = canvasSource.slice(
    canvasSource.indexOf('<style>') + '<style>'.length,
    canvasSource.indexOf('</style>'),
  );
  const canvas = parseRules(helmet);
  const product = parseRules(fs.readFileSync(CSS, 'utf8'));

  it('каждый класс кадра имеет пару в продуктовом CSS', () => {
    const orphans = PAIRS.filter(([c, m]) => !canvas.has(c) || !product.has(m));
    expect(orphans).toEqual([]);
  });

  it('числа совпадают с кадрами', () => {
    const drift = [];
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
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

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(6);
  });

  it('гейт называет свой охват', () => {
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
    const never = [...blind.entries()]
      .filter(([, n]) => n === PAIRS.length)
      .map(([prop]) => prop)
      .sort();
    console.info(
      `[актив] сверено ${compared} из ${compared + skipped} клеток `
      + `(${((compared / (compared + skipped)) * 100).toFixed(1)} %), пар ${PAIRS.length}; `
      + `не читается ни в одной паре: ${never.length ? never.join(', ') : 'нет'}`,
    );
    expect(compared).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    if (compared > COVERAGE_FLOOR) {
      throw new Error(
        `Охват вырос: сверяется ${compared} клеток вместо ${COVERAGE_FLOOR}. `
        + 'Поднимите COVERAGE_FLOOR, иначе следующее падение пройдёт незаметно.',
      );
    }
  });
});
