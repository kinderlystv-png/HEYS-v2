// home-widgets.v4.dc.html, строка контракта «зоны углов»:
// «48×48 в обоих нижних углах сетки свободны от чисел и полос:
//  слева кнопка настройки, справа «+»».
//
// Строку нельзя закрыть чтением разметки: она про то, что оказывается ПОД
// плавающими кнопками, а это стык трёх вещей — геометрии сетки на 375 px,
// порядка плиток в раскладке по умолчанию и внутренней компоновки той плитки,
// которая в угол попала. Любая из трёх может поехать отдельно.
//
// Как замерено. Числа геометрии берутся не из исходника, а из вычисленного
// стиля: реальные модули CSS кладутся в документ, и каскад отвечает то же, что
// ответил бы браузер (так здесь уже находили перебитые правила). Два уточнения,
// каждое названо:
//   1. happy-dom не считает раскладку — getBoundingClientRect у всего нулевой.
//      Поэтому из каскада берутся ЗНАЧЕНИЯ (колонки, зазор, ряд, поля сетки,
//      поля плитки, размеры кнопок), а сама геометрия считается арифметикой по
//      ним. Проверяется тем самым не «то, что написано», а «то, что выиграло».
//   2. Медиа-блоки happy-dom не сопоставляет вовсе. Те, что действуют на 375 px
//      (≤480 и ≤520), раскрываются на месте с сохранением порядка; ≤374 и ≤360
//      на этой ширине не действуют и остаются проигнорированными — как в
//      браузере.
//
// Итог замера — в таблице DEVIATIONS: поимённый список того, что сегодня стоит
// в зоне угла. Список закрытый: новая плитка в углу, новая полоса или спарклайн
// в нём — красный тест. Починка тоже красный: строку из списка нужно снять
// осознанно, а не молча.
import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const CORE_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');
const UI_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const WIDGETS_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'),
  'utf8',
);

// Рамка канваса: 375 px — узкий край диапазона (строка «рамка канваса»).
const VIEWPORT = 375;

const SIZES = {
  '1x1': { cols: 1, rows: 1 },
  '2x1': { cols: 2, rows: 1 },
  '2x2': { cols: 2, rows: 2 },
  '3x2': { cols: 3, rows: 2 },
};

// ─── контракт ────────────────────────────────────────────────────────────────

function contractLine(key) {
  const html = fs.readFileSync(CANVAS, 'utf8');
  const hit = new RegExp(`<b>${key}</b><span data-v="([^"]*)"`).exec(html);
  if (!hit) throw new Error(`строки «${key}» нет в контракте home-widgets`);
  return hit[1];
}

// ─── каскад ──────────────────────────────────────────────────────────────────

/** Раскрывает на месте медиа-блок, который действует на заданной ширине. */
function unwrapMedia(css, marker) {
  let out = '';
  let i = 0;
  for (;;) {
    const at = css.indexOf(marker, i);
    if (at === -1) return out + css.slice(i);
    out += css.slice(i, at);
    const open = css.indexOf('{', at + marker.length);
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    out += css.slice(open + 1, j - 1);
    i = j;
  }
}

let read;

beforeAll(() => {
  let css = WIDGETS_CSS;
  for (const marker of ['@media (max-width: 480px)', '@media (max-width: 520px)']) {
    css = unwrapMedia(css, marker);
  }
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Фикстура — минимальный скелет Главной: `body:has(.widgets-tab)` включает
  // v4-слой, из-за которого поля сетки и плитки отличаются от базовых.
  document.body.innerHTML = `
    <div class="widgets-tab">
      <div class="widgets-grid-container">
        <div class="widgets-grid">
          <div class="widget widget--2x1 widget--weight widget--corner-bl">
            <div class="widget-weight widget-weight--2x1 widget-weight--number-week">
              <span class="widget-v4-kicker">Вес</span>
              <div class="widget-weight__number-week-row">
                <span class="widget-weight__number-week-delta">−0,9 за неделю</span>
                <span class="widget-weight__number-week-val">91,1</span>
              </div>
            </div>
          </div>
          <div class="widget widget--2x1 widget--crashRisk">
            <div class="widget-wd widget-v4-stack">
              <div class="widget-wd__head">
                <span class="widget-v4-kicker">За месяц</span>
              </div>
              <div class="widget-wd__curve-row">
                <span class="widget-wd__delta">−2,4</span>
                <svg class="widget-wd__spark" width="58" height="24"></svg>
              </div>
            </div>
          </div>
          <div class="widget widget--1x1 widget--sleep"></div>
        </div>
      </div>
      <div class="widgets-fab-left"><button class="widgets-settings-fab"></button></div>
      <div class="widgets-quick-fab-wrap"><button class="widgets-quick-fab"></button></div>
    </div>`;

  read = (selector, prop) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`нет узла ${selector}`);
    return getComputedStyle(el).getPropertyValue(prop).trim();
  };
});

const px = (value) => Number.parseFloat(value);

// ─── раскладка по умолчанию ──────────────────────────────────────────────────

function defaultLayout() {
  const start = CORE_SRC.indexOf('const DEFAULT_LAYOUT = [');
  const block = CORE_SRC.slice(start, CORE_SRC.indexOf('\n  ];', start));
  const entries = [];
  const re =
    /type:\s*'([^']+)',\s*\n\s*size:\s*'([^']+)',\s*\n\s*settings:\s*\{([\s\S]*?)\n\s{4}\}/g;
  let m;
  while ((m = re.exec(block))) {
    const variant = /displayVariant:\s*'([^']+)'/.exec(m[3]);
    entries.push({ type: m[1], size: m[2], variant: variant ? variant[1] : null });
  }
  return entries;
}

function placed() {
  const globalScope = globalThis;
  globalScope.window = globalScope;
  globalScope.HEYS = {};
  // eslint-disable-next-line no-new-func
  new Function('window', CORE_SRC)(globalScope);
  globalScope.HEYS.Widgets.registry = {
    getSize: (id) => SIZES[id] || null,
    getType: () => ({}),
    createWidget: (type) => ({ id: `w_${type}`, type, size: '2x1' }),
  };
  globalScope.HEYS.Widgets.emit = () => {};

  const entries = defaultLayout();
  const widgets = entries.map((e, i) => ({ id: `d${i}`, type: e.type, size: e.size }));
  const positions = globalScope.HEYS.Widgets.grid.computeFlowLayout(widgets, 4);
  return entries.map((e, i) => ({
    ...e,
    ...SIZES[e.size],
    ...positions[`d${i}`],
  }));
}

// ─── поимённый список того, что стоит в зоне угла сегодня ────────────────────
//
// Ключ — «тип виджета / вид». `carrier` — что именно попало в 48×48.
// `overlapPx` — сколько пикселей носителя лежит внутри зоны по горизонтали.
const DEVIATIONS = {
  'bottom-left': {
    type: 'weight',
    variant: 'number_week',
    carrier: 'число «−0,9 за неделю» 11 px — левая половина строки значения',
    node: '.widget-weight__number-week-delta',
    // Дельта начинается у левого края содержимого плитки, то есть на
    // расстоянии поля плитки от левого края сетки. Всё, что дальше и до 48, —
    // внутри зоны.
    overlapPx: 37,
  },
  'bottom-right': {
    type: 'crashRisk',
    variant: 'curve',
    carrier: 'кривая «За месяц» — спарклайн 58×24, прижат к правому краю',
    node: '.widget-wd__spark',
    overlapPx: 37,
  },
};

describe('home-widgets v4 · «зоны углов» — что замерено на 375 px', () => {
  it('контракт всё ещё требует 48×48 в обоих нижних углах', () => {
    const line = contractLine('зоны углов');
    expect(line).toContain('48×48');
    expect(line).toContain('в обоих нижних углах сетки');
    expect(line).toContain('свободны от чисел и полос');
  });

  it('каскад на 375 px: 4 колонки, зазор 8, ряд 64, поля сетки 16, плитка 11', () => {
    // Числа арифметики ниже держатся на этих значениях — если каскад их
    // перебьёт (медиа-блок, новый v4-слой), таблица форматов станет ложью.
    // Число колонок читается по подставленному значению в grid-template-columns:
    // саму переменную happy-dom на унаследовавшем её узле не отдаёт, а
    // подстановку var() делает — она и есть то, что увидит браузер.
    expect(read('.widgets-grid', 'grid-template-columns')).toBe('repeat(4, minmax(0, 1fr))');
    expect(read('.widgets-grid', 'gap')).toBe('8px');
    expect(read('.widgets-grid', 'grid-auto-rows')).toBe('64px');
    expect(read('.widgets-grid', 'padding')).toBe('16px');
    expect(read('.widgets-grid', 'max-width')).toBe('480px');
    expect(read('.widget--weight', 'padding')).toBe('11px');
    expect(read('.widget--1x1', 'padding')).toBe('11px');
  });

  it('колонка 79,75 и таблица форматов — доля зоны 48×48 в каждом', () => {
    const gridWidth = Math.min(VIEWPORT, px(read('.widgets-grid', 'max-width')));
    const pad = px(read('.widgets-grid', 'padding'));
    const gap = px(read('.widgets-grid', 'gap'));
    const row = px(read('.widgets-grid', 'grid-auto-rows'));
    const cols = Number(/repeat\((\d+),/.exec(read('.widgets-grid', 'grid-template-columns'))[1]);
    const zone = 48;

    const column = (gridWidth - 2 * pad - (cols - 1) * gap) / cols;
    expect(column).toBeCloseTo(79.75, 5);

    const tile = (size) => ({
      w: SIZES[size].cols * column + (SIZES[size].cols - 1) * gap,
      h: SIZES[size].rows * row + (SIZES[size].rows - 1) * gap,
    });

    expect(tile('1x1')).toEqual({ w: 79.75, h: 64 });
    expect(tile('2x1')).toEqual({ w: 167.5, h: 64 });
    expect(tile('2x2')).toEqual({ w: 167.5, h: 136 });
    expect(tile('3x2')).toEqual({ w: 255.25, h: 136 });

    // Сколько от плитки забирает угловая зона и сколько остаётся содержимому.
    const share = (size) => {
      const t = tile(size);
      const w = Math.min(zone, t.w);
      const h = Math.min(zone, t.h);
      return {
        widthPct: Number(((w / t.w) * 100).toFixed(1)),
        heightPct: Number(((h / t.h) * 100).toFixed(1)),
        areaPct: Number((((w * h) / (t.w * t.h)) * 100).toFixed(1)),
      };
    };

    expect(share('1x1')).toEqual({ widthPct: 60.2, heightPct: 75, areaPct: 45.1 });
    expect(share('2x1')).toEqual({ widthPct: 28.7, heightPct: 75, areaPct: 21.5 });
    expect(share('2x2')).toEqual({ widthPct: 28.7, heightPct: 35.3, areaPct: 10.1 });

    // По содержимому 1×1 (поля плитки 11) зона съедает больше половины —
    // то самое, из-за чего в коде отступ на 48 сделан только для чисел.
    const tilePad = px(read('.widget--1x1', 'padding'));
    const content = { w: tile('1x1').w - 2 * tilePad, h: tile('1x1').h - 2 * tilePad };
    const inZone = { w: zone - tilePad, h: Math.min(content.h, zone - tilePad) };
    expect(inZone.w).toBe(37);
    expect(
      Number((((inZone.w * inZone.h) / (content.w * content.h)) * 100).toFixed(1)),
    ).toBeGreaterThan(50);
  });

  it('след кнопок на сетке: слева 40 (44 с целью касания), справа 52', () => {
    const gridPad = px(read('.widgets-grid', 'padding'));
    const gridLeft = gridPad;
    const gridRight = VIEWPORT - gridPad;

    const settings = px(read('.widgets-settings-fab', 'width'));
    const settingsLeft = px(read('.widgets-fab-left', 'left'));
    expect(settings).toBe(40);
    expect(px(read('.widgets-settings-fab', 'height'))).toBe(40);
    // Цель касания 44 pt — прозрачным припуском ::after inset -2px.
    expect(WIDGETS_CSS).toMatch(/\.widgets-settings-fab::after \{[^}]*inset: -2px/);
    const settingsTouch = settings + 4;

    const quick = px(read('.widgets-quick-fab', 'width'));
    const quickRight = px(read('.widgets-quick-fab-wrap', 'right'));
    expect(quick).toBe(52);
    expect(px(read('.widgets-quick-fab', 'height'))).toBe(52);

    // Кнопки фиксированы к экрану, поэтому их след на сетке — пересечение
    // с её содержимым, а не собственный размер.
    const leftFootprint = settingsLeft + settings - gridLeft;
    const leftTouchFootprint = settingsLeft - 2 + settingsTouch - gridLeft;
    const rightFootprint = gridRight - (VIEWPORT - quickRight - quick);
    expect(leftFootprint).toBe(38);
    expect(leftTouchFootprint).toBe(40);
    expect(rightFootprint).toBe(50);

    // Правая кнопка шире зарезервированных 48 — «+» выходит за зону, которую
    // контракт просит держать пустой; левая укладывается.
    expect(rightFootprint).toBeGreaterThan(48);
    expect(leftTouchFootprint).toBeLessThan(48);
  });
});

describe('home-widgets v4 · кто стоит в углах раскладки по умолчанию', () => {
  it('нижний ряд дефолта — «Вес» слева и «Динамика веса» справа', () => {
    const layout = placed();
    expect(layout).toHaveLength(11);

    const bottomRow = Math.max(...layout.map((w) => w.row + w.rows - 1));
    expect(bottomRow).toBe(7); // восемь рядов, бюджет 32 клетки

    const left = layout.find((w) => w.col === 0 && w.row + w.rows - 1 === bottomRow);
    const right = layout.find((w) => w.col + w.cols === 4 && w.row + w.rows - 1 === bottomRow);

    expect({ type: left.type, variant: left.variant, size: left.size }).toEqual({
      type: DEVIATIONS['bottom-left'].type,
      variant: DEVIATIONS['bottom-left'].variant,
      size: '2x1',
    });
    expect({ type: right.type, variant: right.variant, size: right.size }).toEqual({
      type: DEVIATIONS['bottom-right'].type,
      variant: DEVIATIONS['bottom-right'].variant,
      size: '2x1',
    });
  });

  it('слева в зоне лежит число: дельта прижата к левому краю содержимого', () => {
    // Строка вида «Число и неделя»: число уходит вправо (margin-left: auto),
    // но дельта остаётся слева — а она тоже число.
    expect(
      read('.widget-weight--number-week .widget-weight__number-week-row', 'justify-content'),
    ).toBe('space-between');
    expect(read('.widget-weight__number-week-val', 'margin-left')).toBe('auto');
    expect(read('.widget-weight__number-week-delta', 'font-size')).toBe('11px');
    expect(read('.widget-weight__number-week-delta', 'margin-left')).not.toBe('auto');

    const tilePad = px(read('.widget--weight', 'padding'));
    expect(48 - tilePad).toBe(DEVIATIONS['bottom-left'].overlapPx);
  });

  it('справа в зоне лежит спарклайн: кривая 58 px прижата к правому краю', () => {
    expect(read('.widget-wd__curve-row', 'justify-content')).toBe('space-between');
    expect(read('.widget-wd__spark', 'flex')).toBe('0 0 auto');
    const spark = document.querySelector('.widget-wd__spark');
    expect(Number(spark.getAttribute('width'))).toBe(58);

    const tilePad = px(read('.widget--crashRisk', 'padding'));
    const overlap = 48 - tilePad;
    expect(overlap).toBe(DEVIATIONS['bottom-right'].overlapPx);
    // Кривая шире перекрытия — часть её действительно уходит под «+».
    expect(Number(spark.getAttribute('width'))).toBeGreaterThan(overlap);
  });
});

describe('home-widgets v4 · что продукт делает с углами сегодня', () => {
  it('левый угол: класс есть и вешается на плитку столбца 0 нижнего ряда', () => {
    expect(UI_SRC).toContain('widget--corner-bl');
    expect(UI_SRC).toContain('cornerBottomLeftId');
    expect(WIDGETS_CSS).toMatch(/\.widget--corner-bl [^{]*\{[^}]*align-self: flex-end/);
  });

  it('правого угла у продукта нет вовсе — «+» шире зоны и ничем не обойдён', () => {
    // Если появится corner-br, эта строка покраснеет: значит правый угол
    // начали разводить, и таблицу отступлений надо пересобрать.
    expect(WIDGETS_CSS).not.toMatch(/corner-br/);
    expect(UI_SRC).not.toMatch(/corner-br|cornerBottomRight/);
  });

  it('отступ левого угла не достаёт до плитки, которая туда попадает', () => {
    // Правило двигает только .widget-v4-mini__value / -row__value / -hero-num.
    // «Вес» в виде «Число и неделя» рисуется своими узлами и под правило не
    // попадает — то есть мера есть, а на дефолтной раскладке не работает.
    const rule = /\.widget--corner-bl ([^{]+)\{/.exec(WIDGETS_CSS);
    expect(rule).not.toBeNull();
    const covered = WIDGETS_CSS.slice(
      WIDGETS_CSS.indexOf('.widget--corner-bl'),
      WIDGETS_CSS.indexOf('{', WIDGETS_CSS.indexOf('.widget--corner-bl')),
    );
    expect(covered).toContain('.widget-v4-mini__value');
    expect(covered).not.toContain('number-week');
  });

  it('таблица отступлений закрыта: в углах ровно два известных носителя', () => {
    expect(Object.keys(DEVIATIONS)).toEqual(['bottom-left', 'bottom-right']);
    for (const dev of Object.values(DEVIATIONS)) {
      expect(document.querySelector(dev.node)).not.toBeNull();
      expect(dev.overlapPx).toBe(37);
    }
  });
});
