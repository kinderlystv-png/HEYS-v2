// home-widgets.v4.dc.html, строка контракта «зоны углов» (двенадцатая сборка):
// «нижние углы сетки держатся свободными 52×52 px — по фактическому следу
//  кнопок: настройка слева, «+» справа. В зоне запрещена любая графика, не
//  только числа и полосы: спарклайн, кольцо, полоса и дельта одинаково уходят
//  под палец».
//
// Что изменилось против прежней редакции и почему это переписанный тест:
//   • зона выросла с 48 до 52 — «назвать 48 было ошибкой замера: кнопка «+»
//     занимает 50, и два пикселя вылезали»;
//   • запрет расширен с «чисел и полос» на любую графику — «перечисление
//     всегда неполно: спарклайн в правом углу дефолтной раскладки формально
//     не был ни числом, ни полосой и проходил запрет»;
//   • углов два: правый раньше не защищался вовсе.
// Отступление названо вслух: соседняя строка «что под ней» всё ещё говорит
// «48×48 … свободна от чисел и полос» и знает только левый угол. Верна
// «зоны углов» — она переписана позже и сама объясняет ошибку замера.
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
// Главное, что держит этот тест после починки: мера не должна быть списком
// узлов. Прежняя мера двигала три класса значений и на раскладке по умолчанию
// не срабатывала ни разу. Теперь угол резервирует поле самой плитки — и тест
// проверяет именно поле, то есть меру, которая не зависит от того, что внутри.
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
// Зона угла из строки контракта.
const ZONE = 52;

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
  // Классы углов стоят так, как их вешает WidgetsTab на раскладке по
  // умолчанию: слева «Вес» 2×1, справа «Динамика веса» 2×1.
  document.body.innerHTML = `
    <div class="widgets-tab">
      <div class="widgets-grid-container">
        <div class="widgets-grid">
          <div class="widget widget--2x1 widget--crashRisk widget--corner-bl">
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
          <div class="widget widget--1x1 widget--fiber widget--corner-br">
            <div class="widget-v4-mini widget-v4-fiber">
              <span class="widget-v4-kicker">Клетчатка</span>
              <div class="widget-v4-goal-hero">
                <span class="widget-v4-goal-value">18</span>
                <span class="widget-v4-unit">г</span>
              </div>
              <div class="widget-v4-goalbar"><i class="widget-v4-goalbar__fill"></i></div>
            </div>
          </div>
          <div class="widget widget--2x1 widget--weight">
            <div class="widget-weight widget-weight--2x1 widget-weight--number-week">
              <div class="widget-weight__number-week-head">
                <span class="widget-v4-kicker">Вес</span>
                <span class="widget-weight__number-week-delta">−0,9 за неделю</span>
              </div>
              <div class="widget-weight__number-week-row">
                <span class="widget-weight__number-week-val">91,1</span>
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

// Кто стоит в углах раскладки по умолчанию и что именно там рисуется. Список
// закрытый: новая плитка в углу — красный тест. Он больше не список
// отступлений, а список того, что мера обязана накрыть.
const CORNERS = {
  // Пакет 28 августа переставил нижний ряд: «Динамика веса» съехала в левый
  // угол, а правый занял 1×1 «Клетчатка» (строка «состав дефолта», плитки
  // 11 и 13). «Вес» поднялся в предпоследний ряд и углом больше не является.
  'bottom-left': {
    type: 'crashRisk',
    variant: 'curve',
    size: '2x1',
    tile: '.widget--corner-bl',
    graphics: ['.widget-wd__delta', '.widget-wd__spark'],
  },
  'bottom-right': {
    type: 'fiber',
    variant: 'now',
    size: '1x1',
    tile: '.widget--corner-br',
    graphics: ['.widget-v4-goal-value', '.widget-v4-goalbar'],
  },
};

describe('home-widgets v4 · «зоны углов» — что замерено на 375 px', () => {
  it('контракт: 52×52 в обоих нижних углах и запрет любой графики', () => {
    const line = contractLine('зоны углов');
    expect(line).toContain('52×52');
    expect(line).toContain('нижние углы сетки');
    expect(line).toContain('любая графика');
    expect(line).toContain('спарклайн, кольцо, полоса и дельта');
  });

  it('каскад на 375 px: 4 колонки, зазор 8, ряд 64, поля сетки 16, плитка 11', () => {
    // Числа арифметики ниже держатся на этих значениях — если каскад их
    // перебьёт (медиа-блок, новый v4-слой), таблица форматов станет ложью.
    expect(read('.widgets-grid', 'grid-template-columns')).toBe('repeat(4, minmax(0, 1fr))');
    expect(read('.widgets-grid', 'gap')).toBe('8px');
    expect(read('.widgets-grid', 'grid-auto-rows')).toBe('64px');
    expect(read('.widgets-grid', 'padding')).toBe('16px');
    expect(read('.widgets-grid', 'max-width')).toBe('480px');
    // Явно неугловая 1×1: с 28 августа правый угол занимает 1×1 «Клетчатка»,
    // и выбор «первой попавшейся» 1×1 читал бы её поле с зоной 52.
    expect(read('.widget--1x1.widget--sleep', 'padding')).toBe('11px');
  });

  it('колонка 79,75 и таблица форматов — доля зоны 52×52 в каждом', () => {
    const gridWidth = Math.min(VIEWPORT, px(read('.widgets-grid', 'max-width')));
    const pad = px(read('.widgets-grid', 'padding'));
    const gap = px(read('.widgets-grid', 'gap'));
    const row = px(read('.widgets-grid', 'grid-auto-rows'));
    const cols = Number(/repeat\((\d+),/.exec(read('.widgets-grid', 'grid-template-columns'))[1]);

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

    // Сколько от плитки забирает угловая зона.
    const share = (size) => {
      const t = tile(size);
      const w = Math.min(ZONE, t.w);
      const h = Math.min(ZONE, t.h);
      return {
        widthPct: Number(((w / t.w) * 100).toFixed(1)),
        heightPct: Number(((h / t.h) * 100).toFixed(1)),
        areaPct: Number((((w * h) / (t.w * t.h)) * 100).toFixed(1)),
      };
    };

    expect(share('1x1')).toEqual({ widthPct: 65.2, heightPct: 81.3, areaPct: 53 });
    expect(share('2x1')).toEqual({ widthPct: 31, heightPct: 81.3, areaPct: 25.2 });
    expect(share('2x2')).toEqual({ widthPct: 31, heightPct: 38.2, areaPct: 11.9 });

    // Цена меры названа: в 1×1 зона съедает больше половины плитки. Это
    // открытый вопрос дизайна, а не повод не резервировать угол — в
    // раскладке по умолчанию в углах стоят 2×1.
    expect(share('1x1').areaPct).toBeGreaterThan(50);
  });

  it('след кнопок на сетке укладывается в 52: слева 40, справа 50', () => {
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

    // Ровно то, из-за чего контракт переписал 48 на 52: правая кнопка шире 48,
    // но в 52 укладывается — как и левая с целью касания.
    expect(rightFootprint).toBeGreaterThan(48);
    expect(rightFootprint).toBeLessThanOrEqual(ZONE);
    expect(leftTouchFootprint).toBeLessThanOrEqual(ZONE);
  });
});

describe('home-widgets v4 · кто стоит в углах раскладки по умолчанию', () => {
  it('нижний ряд дефолта — «Динамика веса» слева и «Клетчатка» справа', () => {
    const layout = placed();
    expect(layout).toHaveLength(13);

    const bottomRow = Math.max(...layout.map((w) => w.row + w.rows - 1));
    expect(bottomRow).toBe(7); // восемь рядов, бюджет 32 клетки

    const left = layout.find((w) => w.col === 0 && w.row + w.rows - 1 === bottomRow);
    const right = layout.find((w) => w.col + w.cols === 4 && w.row + w.rows - 1 === bottomRow);

    expect({ type: left.type, variant: left.variant, size: left.size }).toEqual({
      type: CORNERS['bottom-left'].type,
      variant: CORNERS['bottom-left'].variant,
      size: CORNERS['bottom-left'].size,
    });
    expect({ type: right.type, variant: right.variant, size: right.size }).toEqual({
      type: CORNERS['bottom-right'].type,
      variant: CORNERS['bottom-right'].variant,
      size: CORNERS['bottom-right'].size,
    });
  });

  it('в углах есть что накрывать: слева число, справа кривая', () => {
    // Список закрытый — новая графика в углу поднимет этот тест.
    expect(Object.keys(CORNERS)).toEqual(['bottom-left', 'bottom-right']);
    for (const corner of Object.values(CORNERS)) {
      for (const node of corner.graphics) {
        expect(document.querySelector(node), `нет узла ${node}`).not.toBeNull();
      }
    }
    // Спарклайн шире зоны — без меры он ушёл бы под палец целиком.
    expect(Number(document.querySelector('.widget-wd__spark').getAttribute('width'))).toBe(58);
  });
});

describe('home-widgets v4 · мера углов', () => {
  it('оба угла размечены кодом и вешаются на плитки нижнего ряда', () => {
    expect(UI_SRC).toContain('widget--corner-bl');
    expect(UI_SRC).toContain('widget--corner-br');
    expect(UI_SRC).toContain('cornerWidgetIds');
    expect(UI_SRC).toContain('isCornerBottomRight');
    // Правый угол — плитка, чей правый край упирается в последнюю колонку.
    expect(UI_SRC).toContain("=== WIDGETS_GRID_COLS && touchesBottom(w)");
  });

  it('мера — поле плитки, а не список узлов: 52 px с нужной стороны', () => {
    // Ключевое отличие от прежней меры: она двигала три класса значений и на
    // раскладке по умолчанию не срабатывала ни разу. Поле работает независимо
    // от того, что внутри плитки, — и накрывает спарклайн так же, как число.
    expect(read('.widget--corner-bl', 'padding-left')).toBe(`${ZONE}px`);
    expect(read('.widget--corner-br', 'padding-right')).toBe(`${ZONE}px`);
    // Со свободной стороны поле плитки остаётся своим — зона только в углу.
    expect(read('.widget--corner-bl', 'padding-right')).toBe('11px');
    expect(read('.widget--corner-br', 'padding-left')).toBe('11px');
    // Поле подменяет 11 px, а не добавляется к ним: зона считается от края
    // сетки, и 52 — это расстояние до содержимого, а не сверх поля плитки.
    expect(px(read('.widget--corner-bl', 'padding-left'))).toBe(ZONE);
  });

  it('вся графика угловой плитки начинается за зоной', () => {
    const tilePad = { left: 11, right: 11 };
    const zoneLeft = px(read('.widget--corner-bl', 'padding-left'));
    const zoneRight = px(read('.widget--corner-br', 'padding-right'));

    // Содержимое стартует ровно на границе зоны — ни одна графика левее
    // (правее) начаться не может, потому что это край content-box плитки.
    expect(zoneLeft).toBeGreaterThanOrEqual(ZONE);
    expect(zoneRight).toBeGreaterThanOrEqual(ZONE);
    // Прежняя мера давала 11 px поля и 37 px графики внутри зоны — вот та
    // разница, которую закрыла починка.
    expect(zoneLeft - tilePad.left).toBe(41);
    expect(zoneRight - tilePad.right).toBe(41);
  });

  it('содержимому 2×1 после резерва остаётся 104,5 px — плитка живёт', () => {
    const gridWidth = Math.min(VIEWPORT, px(read('.widgets-grid', 'max-width')));
    const pad = px(read('.widgets-grid', 'padding'));
    const gap = px(read('.widgets-grid', 'gap'));
    const column = (gridWidth - 2 * pad - 3 * gap) / 4;
    const tile2x1 = 2 * column + gap;
    expect(tile2x1 - ZONE - 11).toBe(104.5);
  });
});
