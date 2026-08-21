/**
 * Flow-раскладка виджетов Главной (канвас home-widgets.v4, строки 33–36, 55, 62,
 * 75, 80). Позиции — производная от порядка чтения: сетка укладывает плитки
 * подряд, освободившееся место отдаёт ближайшей следующей, которая влезает,
 * ищет вперёд не глубже двух и оставляет дырку, если не нашла.
 *
 * Тест исполняет настоящее ядро, а не переписанную копию алгоритма.
 */
import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

const SIZES = {
  '1x1': { cols: 1, rows: 1 },
  '2x1': { cols: 2, rows: 1 },
  '2x2': { cols: 2, rows: 2 },
  '3x2': { cols: 3, rows: 2 }
};

let grid;

beforeAll(() => {
  global.window = global;
  global.HEYS = {};
  const src = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(global);

  global.HEYS.Widgets.registry = {
    getSize: (id) => SIZES[id] || null,
    getType: () => null
  };
  // Шину событий и запись в storage поднимают соседние модули — здесь глушим.
  global.HEYS.Widgets.emit = () => {};
  global.HEYS.Widgets.state._debouncedSave = () => {};
  grid = global.HEYS.Widgets.grid;
});

/** Кадр канваса записывается как список «id:размер» в порядке чтения. */
function layout(spec) {
  const widgets = spec.map((entry) => {
    const [id, size] = entry.split(':');
    return { id, size };
  });
  return grid.computeFlowLayout(widgets, 4);
}

describe('flow-раскладка: порядок чтения вместо координат', () => {
  it('кадр «Расстановка · до смены»: плитки идут подряд по строкам', () => {
    const pos = layout([
      'calories:2x2',
      'weight:2x1',
      'water:2x1',
      'sleep:1x1',
      'steps:1x1',
      'macros:3x2'
    ]);

    expect(pos.calories).toEqual({ col: 0, row: 0 });
    expect(pos.weight).toEqual({ col: 2, row: 0 });
    expect(pos.water).toEqual({ col: 2, row: 1 });
    expect(pos.sleep).toEqual({ col: 0, row: 2 });
    expect(pos.steps).toEqual({ col: 1, row: 2 });
    expect(pos.macros).toEqual({ col: 0, row: 3 });
  });

  it('кадр «рост»: 2×1 → 2×2 — всё, что ниже, съезжает, порядок не меняется', () => {
    const before = layout(['calories:2x2', 'weight:2x1', 'water:2x1', 'sleep:1x1']);
    const after = layout(['calories:2x2', 'weight:2x2', 'water:2x1', 'sleep:1x1']);

    // Выше изменённой плитки ничего не двигается.
    expect(after.calories).toEqual(before.calories);
    expect(after.weight).toEqual({ col: 2, row: 0 });
    // Вода стояла в первой строке под «Весом», после роста уехала ниже.
    expect(before.water).toEqual({ col: 2, row: 1 });
    expect(after.water).toEqual({ col: 0, row: 2 });
    expect(after.sleep).toEqual({ col: 2, row: 2 });
  });

  it('кадр «сжатие»: в освободившуюся колонку поднимается ближайший, кто влезает', () => {
    // «Вода» 2×1 в одну колонку не помещается, «Сон» 1×1 — помещается.
    const pos = layout([
      'calories:2x2',
      'weight:1x1',
      'water:2x1',
      'sleep:1x1',
      'steps:2x1'
    ]);

    expect(pos.weight).toEqual({ col: 2, row: 0 });
    expect(pos.sleep).toEqual({ col: 3, row: 0 });
    expect(pos.water).toEqual({ col: 2, row: 1 });
    expect(pos.steps).toEqual({ col: 0, row: 2 });
  });

  it('кадр «дырка»: две следующие плитки не влезают — место остаётся пустым', () => {
    const pos = layout([
      'calories:2x2',
      'weight:1x1',
      'water:2x1',
      'macros:2x1',
      'sleep:1x1'
    ]);

    expect(pos.weight).toEqual({ col: 2, row: 0 });
    // Колонка 3 первой строки остаётся пустой: «Вода» и «БЖУ» двухколоночные,
    // а «Сон» лежит глубже двух — поиск вперёд его не достаёт.
    expect(pos.water).toEqual({ col: 2, row: 1 });
    expect(pos.macros).toEqual({ col: 0, row: 2 });
    expect(pos.sleep).toEqual({ col: 2, row: 2 });
    const occupiesHole = Object.values(pos).some((p) => p.col === 3 && p.row === 0);
    expect(occupiesHole).toBe(false);
  });

  it('строка 75: рядом с 3×2 в остаток строки поднимается только 1×1', () => {
    const withMini = layout(['macros:3x2', 'water:2x1', 'sleep:1x1']);
    expect(withMini.macros).toEqual({ col: 0, row: 0 });
    expect(withMini.sleep).toEqual({ col: 3, row: 0 });
    expect(withMini.water).toEqual({ col: 0, row: 2 });

    const withoutMini = layout(['macros:3x2', 'water:2x1', 'steps:2x1']);
    expect(withoutMini.water).toEqual({ col: 0, row: 2 });
    expect(Object.values(withoutMini).some((p) => p.col === 3 && p.row === 0)).toBe(false);
  });

  it('поиск идёт только вперёд: плитка глубже двух не поднимается', () => {
    expect(grid.FLOW_LOOKAHEAD).toBe(2);
    const pos = layout(['calories:2x2', 'weight:1x1', 'a:2x1', 'b:2x1', 'mini:1x1']);
    expect(pos.mini).not.toEqual({ col: 3, row: 0 });
  });

  it('раскладка не зависит от координат во входе — только от порядка', () => {
    const widgets = [
      { id: 'a', size: '2x2', position: { col: 3, row: 9 } },
      { id: 'b', size: '1x1', position: { col: 0, row: 0 } }
    ];
    const pos = grid.computeFlowLayout(widgets, 4);
    expect(pos.a).toEqual({ col: 0, row: 0 });
    expect(pos.b).toEqual({ col: 2, row: 0 });
  });

  it('пустой вход и мусор не роняют укладку', () => {
    expect(grid.computeFlowLayout([], 4)).toEqual({});
    expect(grid.computeFlowLayout(null, 4)).toEqual({});
    const pos = grid.computeFlowLayout([null, { id: 'x', size: 'unknown' }], 4);
    expect(pos.x).toEqual({ col: 0, row: 0 });
  });
});

describe('порядок как источник правды', () => {
  it('state.reorderWidget переставляет в порядке и пересчитывает позиции', () => {
    const state = global.HEYS.Widgets.state;
    state._widgets = [
      { id: 'a', type: 'calories', size: '2x2', cols: 2, rows: 2, position: { col: 0, row: 0 }, settings: {} },
      { id: 'b', type: 'water', size: '1x1', cols: 1, rows: 1, position: { col: 2, row: 0 }, settings: {} },
      { id: 'c', type: 'sleep', size: '1x1', cols: 1, rows: 1, position: { col: 3, row: 0 }, settings: {} }
    ];
    state._initialized = true;

    expect(state.reorderWidget('c', 0)).toBe(true);
    expect(state._widgets.map((w) => w.id)).toEqual(['c', 'a', 'b']);
    expect(state._widgets[0].position).toEqual({ col: 0, row: 0 });
    expect(state._widgets[1].position).toEqual({ col: 1, row: 0 });
    expect(state._widgets[2].position).toEqual({ col: 3, row: 0 });

    // Индекс вне диапазона зажимается, повтор той же позиции ничего не меняет.
    expect(state.reorderWidget('c', 0)).toBe(false);
    expect(state.reorderWidget('c', 99)).toBe(true);
    expect(state._widgets.map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });

  it('_sortWidgetsByReadingOrder переводит старые координаты в порядок', () => {
    const state = global.HEYS.Widgets.state;
    state._widgets = [
      { id: 'low', size: '1x1', position: { col: 0, row: 4 } },
      { id: 'topRight', size: '1x1', position: { col: 3, row: 0 } },
      { id: 'topLeft', size: '1x1', position: { col: 0, row: 0 } }
    ];
    state._sortWidgetsByReadingOrder();
    expect(state._widgets.map((w) => w.id)).toEqual(['topLeft', 'topRight', 'low']);
  });
});
