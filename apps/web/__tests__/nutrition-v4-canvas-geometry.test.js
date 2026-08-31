// Геометрия вкладки «Питание» против кадров data-demo="stop" канваса
// nutrition-tab.v4.dc.html на 375 px.
//
// Глазами это не ловится: отдельный сдвиг на 1–2 px или полшага кегля выглядит
// как «чуть иначе», а заметен только рядом с кадром. Сверяем числами.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/nutrition-tab.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/732-ui-v4-nutrition.css');

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

// Канвас пишет шрифт шорткатом `font: 600 10.5px/1 Figtree`, продуктовый CSS —
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
      out[prop] = value;
    }
  }
  return out;
}

// Роли канваса → роли продуктовой палитры. Прозрачные линии канваса выражены
// альфой от чернил, у нас для этого есть роль линии набора.
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
  '--gr2': '--v4-ok-fill',
  '--gr-bg': '--v4-ok-bg',
  '--red': '--v4-bad-text',
  '--dim': '--nut-dim',
  '--dimIco': '--nut-dim-icon',
}));

function normalize(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    // Кегль подписей в продукте задан в rem, а канвас пишет px. Это не
    // расхождение геометрии: при корневом кегле 16 значения совпадают до
    // сотых, а rem нужен строке «нажатие и крупный шрифт» — подписи обязаны
    // расти за системным шрифтом, числа героя и итогов нет. Приводим rem к
    // пикселям, чтобы сверка сравнивала размер, а не запись.
    .replace(/(\d*\.?\d+)rem/g, (whole, n) => `${+(parseFloat(n) * 16).toFixed(4)}px`)
    // запасное значение роли — запись для гейта перекраски, не второе значение;
    // у него бывают свои скобки, как у rgba(0, 0, 0, 0.08)
    .replace(/var\((--[a-z0-9-]+)\s*,(?:[^()]|\([^()]*\))*\)/gi, 'var($1)')
    // Канвас пишет линии как rgba(var(--ink), .NN). В продукте им отвечает
    // одна из трёх ролей линии (home-widgets, «роли линий · правило продукта»):
    // 8 % — --v4-line, 12 % — --v4-track, 18 % — --v4-edge. Остальные проценты
    // контракт поимённо не называет, они сводятся к --v4-line как и раньше.
    .replace(/rgba\(var\(--ink\)\s*,\s*\.12\)/gi, 'var(--v4-track)')
    .replace(/rgba\(var\(--ink\)\s*,\s*\.18\)/gi, 'var(--v4-edge)')
    .replace(/rgba\(var\(--ink\)\s*,\s*\.\d+\)/gi, 'var(--v4-line)')
    .replace(/var\((--[a-zA-Z0-9-]+)\)/g, (whole, name) => `var(${ROLE.get(name) || name})`)
    // .04em и 0.04em — одно число
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2')
    .toLowerCase();
}

const PAIRS = [
  ['.hero', '.nutrition-v4-hero'],
  ['.hk', '.nutrition-v4-hero__label'],
  ['.hn', '.nutrition-v4-hero__value-row'],
  ['.hn b', '.nutrition-v4-hero__value'],
  ['.hn i', '.nutrition-v4-hero__unit'],
  ['.htr', '.nutrition-v4-hero__track'],
  ['.htr i', '.nutrition-v4-hero__fill'],
  ['.hb', '.nutrition-v4-hero__budget'],
  ['.win', '.nutrition-v4-window'],
  ['.win span:first-child', '.nutrition-v4-window__label'],
  ['.win span:last-child', '.nutrition-v4-window__value'],
  ['.win.open span:last-child', ".nutrition-v4-window[data-tone='ok'] .nutrition-v4-window__value"],
  ['.win.warn span:last-child', ".nutrition-v4-window[data-tone='warn'] .nutrition-v4-window__value"],
  ['.dry', '.nutrition-v4-diary'],
  ['.dryE', '.nutrition-v4-diary__empty'],
  ['.meal', '.nutrition-v4-meal-row'],
  ['.mt', '.nutrition-v4-meal-row__head'],
  ['.mt b', '.nutrition-v4-meal-row__title'],
  ['.mt s', '.nutrition-v4-meal-row__kcal'],
  ['.mnum', '.nutrition-v4-meal-row__num'],
  ['.mb', '.nutrition-v4-meal-row__body'],
  ['.mb span', '.nutrition-v4-meal-row__items'],
  ['.mchev', '.nutrition-v4-meal-row__chevron'],
  ['.plusO', '.nutrition-v4-meal-row__add'],
  ['.plus', '.nutrition-v4-meal-row--empty .nutrition-v4-meal-row__add'],
  ['.streak', '.nutrition-v4-streak'],
  ['.cta', '.nutrition-v4-cta'],
  ['.tot', '.nutrition-v4-totals'],
  ['.totH', '.nutrition-v4-totals__title'],
  ['.tr', '.nutrition-v4-total-row'],
  ['.trh', '.nutrition-v4-total-row__head'],
  ['.trh b', '.nutrition-v4-total-row__head b'],
  ['.trh span', '.nutrition-v4-total-row__head span'],
  ['.trk', '.nutrition-v4-bar'],
  ['.trk i', '.nutrition-v4-bar i'],
  ['.qual', '.nutrition-v4-quality__row'],
  ['.qc', '.nutrition-v4-quality__card'],
  ['.qc.ok', '.nutrition-v4-quality__card.is-ok'],
  ['.qk', '.nutrition-v4-quality__label'],
  ['.qv', '.nutrition-v4-quality__value'],
  ['.qv b', '.nutrition-v4-quality__value b'],
  ['.qv i', '.nutrition-v4-quality__value i'],
  ['.qh', '.nutrition-v4-quality__hint'],
  ['.blk', '.nutrition-v4-block'],
  ['.blkH', '.nutrition-v4-block__head'],
  ['.blkH b', '.nutrition-v4-block__head b'],
  ['.blkH span', '.nutrition-v4-block__meta'],
  ['.blkH span.open', '.nutrition-v4-block__meta.is-ok'],
  ['.blkH span.warn', '.nutrition-v4-block__meta.is-warn'],
  ['.tl', '.nutrition-v4-timeline'],
  ['.tlr', '.nutrition-v4-timeline__row'],
  ['.tlb', '.nutrition-v4-timeline__track'],
  ['.tlb i', '.nutrition-v4-timeline__track i'],
  ['.hg', '.nutrition-v4-mini-row'],
  ['.hgc', '.nutrition-v4-mini'],
  ['.hgc b', '.nutrition-v4-mini b'],
  ['.hgc s', '.nutrition-v4-mini s'],
  ['.hgc s i', '.nutrition-v4-mini s i'],
  ['.hgs', '.nutrition-v4-scale'],
  ['.hgs i', '.nutrition-v4-scale i'],
  ['.lst', '.nutrition-v4-list'],
  ['.lrow', '.nutrition-v4-list__row'],
  ['.lrow b', '.nutrition-v4-list__row b'],
  ['.lrow span', '.nutrition-v4-list__row span'],
  ['.cfg', '.nutrition-v4-config'],
  ['.cfgH', '.nutrition-v4-config__title'],
  ['.cfgR', '.nutrition-v4-config__row'],
  ['.cfgC', '.nutrition-v4-chip'],
  ['.cfgC.off', '.nutrition-v4-chip.is-off'],
  ['.why', '.nutrition-v4-why'],
  ['.more', '.nutrition-v4-disclose'],
  ['.repl', '.nutrition-v4-note'],
  ['.shH', '.nutrition-v4-sheet__head'],
  ['.shH b', '.nutrition-v4-sheet__head b'],
  ['.shH span', '.nutrition-v4-sheet__head span'],
  ['.shR', '.nutrition-v4-sheet__row'],
  ['.shR b', '.nutrition-v4-sheet__row b'],
  ['.shR span', '.nutrition-v4-sheet__row span'],
  ['.shDel', '.nutrition-v4-sheet__delete'],
];

const CHECKED = [
  'padding', 'margin-top', 'margin-bottom', 'border-radius', 'gap', 'height',
  'min-height', 'width', 'font-size', 'font-weight', 'line-height',
  'letter-spacing', 'background', 'color', 'align-items', 'justify-content',
  'flex-direction', 'flex', 'text-align', 'box-shadow',
];

// Отступы блока канвас задаёт обёрткой .sec (margin: 0 18px) — в продукте те же
// 18 px даёт .page-day, поэтому боковой margin у самих блоков нулевой.
const SKIP_MARGIN = new Set(['.hero', '.cfg', '.shR', '.shDel']);

// Осознанные отступления. Пакет 21.08 закрыл четыре из пяти: дизайн развёл
// залитую и обводную кнопки (`.plusO`), развернул дефолт состояний на
// нейтральный и снял инлайн у `.qual`.
const EXCEPTIONS = new Set([
  // home-widgets «цель у чипов в переносимых рядах»: 30 px, не 44 и не 34 кадра.
  '.nutrition-v4-chip|min-height',
]);

// Сколько клеток «пара × свойство» гейт реально сверяет. Свойство читается,
// только если стоит в правиле класса канваса: если разбор кадра написан
// инлайном, `if (!(prop in want)) continue` молча пропускает его. Число
// заморожено — падение значит потерю пары или правила, рост просит поднять.
const COVERAGE_FLOOR = 340;

describe('геометрия вкладки «Питание» против кадров канваса', () => {
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
      // Значение может стоять на самом узле, на его базовом классе (если это
      // модификатор) или наследоваться от родителя блока — собираем цепочку
      // так же, как её видит браузер: от общего к частному.
      const base = productSel.split(/\s+/).pop().replace(/\[[^\]]*\]/g, '');
      const parent = base.replace(/(__[a-z-]+|\.is-[a-z-]+|--[a-z-]+)$/, '');
      const chain = [];
      for (const sel of [parent, base, productSel]) {
        if (sel && product.has(sel) && !chain.includes(sel)) chain.push(sel);
      }
      const got = declarations(chain.flatMap((sel) => product.get(sel) || []));

      for (const prop of CHECKED) {
        if (!(prop in want)) continue;
        if (prop.startsWith('margin') && SKIP_MARGIN.has(canvasSel)) continue;
        if (EXCEPTIONS.has(`${productSel}|${prop}`)) continue;
        const expected = normalize(want[prop]);
        const actual = prop in got ? normalize(got[prop]) : '— нет —';
        if (expected !== actual) {
          drift.push(`${productSel} { ${prop} } — кадр: ${expected}, код: ${actual}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(1);
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
      `[питание] сверено ${compared} из ${compared + skipped} клеток `
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
