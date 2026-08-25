// home-widgets.v4.dc.html, пятнадцатая сборка — три строки контракта про
// нижние углы сетки (решение владельца 25 августа):
//   • «1×1 в нижнем углу не ставится» — движок не ставит плитку 1×1 в две
//     угловые клетки последнего ряда; правило живёт в раскладке, а не в
//     стилях, и содержимое плитки от близости к углу не меняется;
//   • «прежние раскладки с 1×1 в углу» — при первом открытии такая плитка
//     молча сдвигается в соседнюю клетку того же ряда, остальные плитки со
//     своих мест не едут, плашки и подсветки нет;
//   • «2×1 в углу» — формат шире одной колонки в угол встаёт, содержимое
//     уходит вбок в свободные 117,5×64, кегли и поля прежние.
//
// Почему это симуляция, а не «посмотри на локалке». Правило укладки видно
// только на стыке трёх вещей: порядка плиток, их форматов и того, какой ряд
// оказался последним. Руками такой стык не собрать — нужно поймать раскладку
// до и после первого открытия и убедиться, что сдвинулась ровно одна плитка
// и ровно один раз.
//
// Числа контракта и продукта расходятся на пиксель, и это названо вслух:
// строки углов считают колонку 80,8 px (поля сетки 14), а строка «сетка» того
// же канваса и продуктовый CSS дают поля 16 и колонку 79,75. На решение это
// не влияет — зона 52×52 забирает у 1×1 больше половины площади при любом из
// двух замеров (53,0 % против 52,0 %), — но замер в контракте неточен.
// Геометрию углов держит соседний тест widgets-v4-corner-zones.test.js.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const CORE_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');
const REGISTRY_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_registry_v1.js'), 'utf8');

const LAYOUT_KEY = 'heys_widget_layout_v1';
const META_KEY = 'heys_widget_layout_meta_v1';
const COLS = 4;

const SIZES = {
  '1x1': { cols: 1, rows: 1 },
  '2x1': { cols: 2, rows: 1 },
  '2x2': { cols: 2, rows: 2 },
  '3x2': { cols: 3, rows: 2 },
};

function contractLine(key) {
  const html = fs.readFileSync(CANVAS, 'utf8');
  const hit = new RegExp(`<b>${key}</b><span data-v="([^"]*)"`).exec(html);
  if (!hit) throw new Error(`строки «${key}» нет в контракте home-widgets`);
  return hit[1];
}

// ─── движок ──────────────────────────────────────────────────────────────────

/** Ядро исполняется настоящее — алгоритм в тест не переписывается. */
function makeGrid() {
  const scope = globalThis;
  scope.window = scope;
  scope.HEYS = {};
  // eslint-disable-next-line no-new-func
  new Function('window', CORE_SRC)(scope);
  scope.HEYS.Widgets.registry = { getSize: (id) => SIZES[id] || null, getType: () => null };
  scope.HEYS.Widgets.emit = () => {};
  scope.HEYS.Widgets.state._debouncedSave = () => {};
  return scope.HEYS.Widgets.grid;
}

/** Кадр записывается как список «id:размер» в порядке чтения. */
function layout(grid, spec) {
  const widgets = spec.map((entry) => {
    const [id, size] = entry.split(':');
    return { id, size };
  });
  return grid.computeFlowLayout(widgets, COLS);
}

/** Кто занимает клетку и какой ряд последний — по тем же правилам, что UI. */
function occupancy(spec, positions) {
  const cells = new Map();
  let bottomRow = 0;
  for (const entry of spec) {
    const [id, size] = entry.split(':');
    const s = SIZES[size];
    const p = positions[id];
    for (let c = 0; c < s.cols; c += 1) {
      for (let r = 0; r < s.rows; r += 1) cells.set(`${p.col + c},${p.row + r}`, id);
    }
    bottomRow = Math.max(bottomRow, p.row + s.rows - 1);
  }
  return { cells, bottomRow };
}

/** Формат плитки, стоящей в угловой клетке последнего ряда (или null). */
function cornerSizes(spec, positions) {
  const { cells, bottomRow } = occupancy(spec, positions);
  const sizeOf = (id) => (id ? spec.find((e) => e.startsWith(`${id}:`)).split(':')[1] : null);
  return {
    bottomRow,
    left: sizeOf(cells.get(`0,${bottomRow}`)),
    right: sizeOf(cells.get(`${COLS - 1},${bottomRow}`)),
  };
}

let grid;

beforeEach(() => {
  grid = makeGrid();
});

describe('home-widgets v4 · контракт про нижние углы', () => {
  it('строка «1×1 в нижнем углу не ставится» решает укладкой, а не стилями', () => {
    const line = contractLine('1×1 в нижнем углу не ставится');
    expect(line).toContain('не ставит плитку 1×1');
    expect(line).toContain('следующую свободную клетку того же ряда');
    expect(line).toContain('Правило живёт в раскладке, а не в стилях');
    // Запрет узкий: только 1×1 и только два угла последнего ряда.
    expect(line).toContain('в двух нижних углах последнего ряда');
    expect(line).toContain('все остальные форматы в углы встают');
  });

  it('строка «прежние раскладки» обещает один молчаливый сдвиг', () => {
    const line = contractLine('прежние раскладки с 1×1 в углу');
    expect(line).toContain('молча сдвигается в соседнюю клетку того же ряда');
    expect(line).toContain('остальные плитки со своих мест не едут');
    expect(line).toContain('Плашки, диалога и подсветки переехавшей плитки нет');
  });

  it('строка «2×1 в углу» оставляет формат в углу и двигает только содержимое', () => {
    const line = contractLine('2×1 в углу');
    expect(line).toContain('содержимое смещается вбок');
    expect(line).toContain('117,5×64');
    expect(line).toContain('кегли не меняются');
  });

  it('угол не трогает кегль: у правил .widget--corner-* нет размера шрифта', () => {
    // Геометрию зоны держит widgets-v4-corner-zones; здесь закрыта вторая
    // половина строки «2×1 в углу» — угловая плитка не должна отличаться от
    // такой же неугловой ничем, кроме места, откуда начинается содержимое.
    const css = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
    const blocks = css.match(/\.widget--corner-b[lr][^{}]*\{[^}]*\}/g) || [];
    expect(blocks.length, 'правил про углы в CSS не найдено').toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block, `кегль в угловом правиле: ${block}`).not.toMatch(/font-size|font-weight|(^|[\s;])font:/);
    }
  });
});

describe('home-widgets v4 · движок не ставит 1×1 в нижний угол', () => {
  it('левый угол: плитка встаёт в соседнюю клетку, соседи не едут', () => {
    const spec = ['a:2x2', 'b:2x2', 'c:1x1'];
    const pos = layout(grid, spec);

    // «c» открывала бы последний ряд с нулевой колонки — она сдвинута вправо.
    expect(pos.c).toEqual({ col: 1, row: 2 });
    // Соседи остались там же, где стояли бы без правила.
    expect(pos.a).toEqual({ col: 0, row: 0 });
    expect(pos.b).toEqual({ col: 2, row: 0 });
    expect(cornerSizes(spec, pos)).toEqual({ bottomRow: 2, left: null, right: null });
  });

  it('правый угол: ряд занят целиком — плитка уходит одна в следующий', () => {
    const spec = ['a:2x1', 'b:1x1', 'c:1x1'];
    const pos = layout(grid, spec);

    // Свободной неугловой клетки в ряду нет, поэтому «c» уходит вниз — и не
    // в нулевую колонку, потому что там угол нового последнего ряда.
    expect(pos.c).toEqual({ col: 1, row: 1 });
    expect(pos.a).toEqual({ col: 0, row: 0 });
    expect(pos.b).toEqual({ col: 2, row: 0 });
    expect(cornerSizes(spec, pos)).toEqual({ bottomRow: 1, left: null, right: null });
  });

  it('ряд из четырёх 1×1: сдвигается одна плитка, три остаются', () => {
    const spec = ['a:1x1', 'b:1x1', 'c:1x1', 'd:1x1'];
    const pos = layout(grid, spec);

    expect(pos.a).toEqual({ col: 0, row: 0 });
    expect(pos.b).toEqual({ col: 1, row: 0 });
    expect(pos.c).toEqual({ col: 2, row: 0 });
    expect(pos.d).toEqual({ col: 1, row: 1 });
    // Уход «d» вниз снял и левый угол: нулевая колонка ряда 0 больше не нижняя.
    expect(cornerSizes(spec, pos)).toEqual({ bottomRow: 1, left: null, right: null });
  });

  it('1×1 в верхнем ряду у края разрешена — запрет только про последний ряд', () => {
    const spec = ['a:3x2', 'b:1x1'];
    const pos = layout(grid, spec);

    // «b» стоит в последней колонке, но в ряду 0, а последний ряд — первый.
    expect(pos.b).toEqual({ col: 3, row: 0 });
    expect(cornerSizes(spec, pos).bottomRow).toBe(1);
    expect(cornerSizes(spec, pos).right).toBeNull();
  });

  it('форматы шире одной колонки в углах остаются', () => {
    const spec = ['a:2x1', 'b:2x1'];
    const pos = layout(grid, spec);

    expect(pos.a).toEqual({ col: 0, row: 0 });
    expect(pos.b).toEqual({ col: 2, row: 0 });
    expect(cornerSizes(spec, pos)).toEqual({ bottomRow: 0, left: '2x1', right: '2x1' });
  });

  it('раскладка по умолчанию не изменилась: в углах те же 2×1', () => {
    // Дефолт разбирался двенадцатой сборкой («Вес» слева, «Динамика веса»
    // справа) — правило про 1×1 не должно было его тронуть.
    const spec = [
      'calories:2x2', 'insulinWave:2x2', 'macros:3x2', 'sleep:1x1', 'water:1x1',
      'steps:2x1', 'heatmap:2x1', 'relapseRisk:2x2', 'healthTrend:2x2',
      'weight:2x1', 'crashRisk:2x1',
    ];
    const pos = layout(grid, spec);

    expect(pos.weight).toEqual({ col: 0, row: 7 });
    expect(pos.crashRisk).toEqual({ col: 2, row: 7 });
    expect(cornerSizes(spec, pos)).toEqual({ bottomRow: 7, left: '2x1', right: '2x1' });
  });

  it('в углах не остаётся 1×1 ни на одной из перебранных раскладок', () => {
    // Отрицательный вывод — не с одного кадра: перебираем все порядки из
    // четырёх плиток по трём форматам и проверяем каждый.
    const formats = ['1x1', '2x1', '2x2'];
    let checked = 0;
    for (const s1 of formats) {
      for (const s2 of formats) {
        for (const s3 of formats) {
          for (const s4 of formats) {
            const spec = [`a:${s1}`, `b:${s2}`, `c:${s3}`, `d:${s4}`];
            const pos = layout(grid, spec);
            const corners = cornerSizes(spec, pos);
            expect(corners.left, `левый угол на ${spec.join(' ')}`).not.toBe('1x1');
            expect(corners.right, `правый угол на ${spec.join(' ')}`).not.toBe('1x1');
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(formats.length ** 4);
  });

  it('повторная укладка ничего не двигает — правило устойчиво', () => {
    const spec = ['a:2x1', 'b:1x1', 'c:1x1', 'd:1x1'];
    const once = layout(grid, spec);
    const twice = layout(grid, spec);
    expect(twice).toEqual(once);

    // И то же самое поверх уже исправленных координат: второй проход по тем
    // же позициям не находит, что сдвигать.
    const widgets = spec.map((entry) => {
      const [id, size] = entry.split(':');
      return { id, size };
    });
    expect(grid.keepBottomCornersClear(once, widgets, COLS)).toEqual(once);
  });
});

// ─── прежние раскладки ───────────────────────────────────────────────────────

/** Числа версий берём из ядра, чтобы meta теста не разошлась с продуктом. */
function coreNumber(name) {
  const hit = new RegExp(`const ${name} = (\\d+);`).exec(CORE_SRC);
  if (!hit) throw new Error(`в ядре нет константы ${name}`);
  return Number(hit[1]);
}

/** Ключ уже проведённого снятия типов — источник правды один, реестр. */
function retiredKey() {
  const win = { HEYS: {} };
  const fn = new Function('window', 'globalThis', 'self', REGISTRY_SRC);
  fn.call(win, win, win, win);
  return win.HEYS.Widgets.registry
    .getAllTypes()
    .filter((t) => t.retired)
    .map((t) => String(t.type ?? t.id))
    .sort()
    .join(',');
}

/**
 * Meta вернувшегося человека: все миграции ядра уже проведены, поэтому при
 * загрузке не должно срабатывать ничего, кроме проверяемого правила.
 *
 * Собирать её приходится руками: одноразовое снятие типов дописывает свой
 * ключ поверх `meta`, прочитанной в начале init, — а она в этот момент ещё
 * прежняя. У человека, у которого meta не было вовсе, поля сетки после этого
 * шага пропадают, и следующая загрузка запускает миграцию 2→4 колонки заново.
 * Это отдельный дефект ядра, не относящийся к углам; тест просто не даёт ему
 * подменить собой проверяемое поведение.
 */
function returningMeta(extra = {}) {
  return {
    gridVersion: coreNumber('GRID_VERSION'),
    gridCols: coreNumber('GRID_COLS'),
    layoutPresetVersion: coreNumber('LAYOUT_PRESET_VERSION'),
    retiredMigration: retiredKey(),
    migratedAt: 1,
    ...extra,
  };
}

/** Хранилище в памяти + настоящие реестр и ядро; init() запускает миграцию. */
function boot(savedLayout, meta = returningMeta()) {
  const memory = new Map();
  if (savedLayout) memory.set(LAYOUT_KEY, savedLayout);
  if (meta) memory.set(META_KEY, meta);

  const events = [];
  window.HEYS = {
    Widgets: { emit: (name, payload) => events.push({ name, payload }), on: () => {}, off: () => {} },
    store: {
      get: (k, d) => (memory.has(k) ? memory.get(k) : d),
      set: (k, v) => { memory.set(k, v); },
    },
  };
  eval(REGISTRY_SRC);
  eval(CORE_SRC);
  window.HEYS.Widgets.state.init();
  return { state: window.HEYS.Widgets.state, memory, events };
}

function tile(type, size, col, row) {
  return { id: `w_${type}`, type, size, position: { col, row }, settings: {} };
}

function posById(state) {
  const out = {};
  for (const w of state.getWidgets()) out[w.type] = { col: w.position.col, row: w.position.row };
  return out;
}

describe('home-widgets v4 · прежняя раскладка с 1×1 в углу', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.HEYS;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('при первом открытии сдвигается только угловая плитка', () => {
    // Записана раскладка старого правила: «Сон» 1×1 открывает последний ряд
    // с нулевой колонки, то есть стоит ровно под кнопкой настройки экрана.
    const saved = [
      tile('calories', '2x2', 0, 0),
      tile('insulinWave', '2x2', 2, 0),
      tile('sleep', '1x1', 0, 2),
      tile('water', '1x1', 2, 2),
    ];
    const { state } = boot(saved);

    const pos = posById(state);
    expect(pos.sleep).toEqual({ col: 1, row: 2 });
    // Обещание строки: соседи не едут.
    expect(pos.calories).toEqual({ col: 0, row: 0 });
    expect(pos.insulinWave).toEqual({ col: 2, row: 0 });
    expect(pos.water).toEqual({ col: 2, row: 2 });
    // Состав не меняется — сдвиг не повод потерять плитку.
    expect(state.getWidgets()).toHaveLength(4);
  });

  it('сдвиг один раз: второе открытие уже ничего не двигает', () => {
    const saved = [
      tile('calories', '2x2', 0, 0),
      tile('insulinWave', '2x2', 2, 0),
      tile('sleep', '1x1', 0, 2),
      tile('water', '1x1', 2, 2),
    ];
    const first = boot(saved);
    const stored = first.memory.get(LAYOUT_KEY);
    const storedWidgets = Array.isArray(stored) ? stored : stored.widgets;
    expect(storedWidgets.find((w) => w.type === 'sleep').position).toEqual({ col: 1, row: 2 });

    delete window.HEYS;
    const second = boot(storedWidgets);
    expect(posById(second.state)).toEqual(posById(first.state));
    // Второй запуск не пишет ничего: сдвигать больше нечего.
    expect(second.events.filter((e) => e.name === 'layout:saved')).toHaveLength(0);
  });

  it('сдвиг молчит: ни плашки, ни подсветки, ни следа в записи', () => {
    const saved = [
      tile('calories', '2x2', 0, 0),
      tile('insulinWave', '2x2', 2, 0),
      tile('sleep', '1x1', 0, 2),
    ];
    const { memory, events } = boot(saved);

    // Ядро сообщает только о записи раскладки — отдельного события о переезде
    // плитки нет, потому что показывать его не из чего.
    const names = new Set(events.map((e) => e.name));
    for (const name of names) {
      expect(name, `лишнее событие ${name}`).not.toMatch(/mov|migrat|highlight|hint|notice/i);
    }

    const stored = memory.get(LAYOUT_KEY);
    const storedWidgets = Array.isArray(stored) ? stored : stored.widgets;
    const moved = storedWidgets.find((w) => w.type === 'sleep');
    expect(moved.position).toEqual({ col: 1, row: 2 });
    // В записи не заводится ни флага «переехала», ни метки для подсветки.
    expect(Object.keys(moved).sort()).toEqual(
      ['createdAt', 'id', 'position', 'settings', 'size', 'type'],
    );
  });

  it('прежняя раскладка с 2×1 в углу не трогается вовсе', () => {
    const saved = [
      tile('calories', '2x2', 0, 0),
      tile('insulinWave', '2x2', 2, 0),
      tile('weight', '2x1', 0, 2),
      tile('crashRisk', '2x1', 2, 2),
    ];
    const { state, events } = boot(saved);

    expect(posById(state)).toEqual({
      calories: { col: 0, row: 0 },
      insulinWave: { col: 2, row: 0 },
      weight: { col: 0, row: 2 },
      crashRisk: { col: 2, row: 2 },
    });
    expect(events.filter((e) => e.name === 'layout:saved')).toHaveLength(0);
  });
});
