// Снятие типа виджета — одноразовая миграция, а не фильтр при каждой загрузке.
//
// Контракт home-widgets, строки «как снимается тип» и «снятие — одноразовая
// миграция». Обе появились после разбора 21.08.2026: постоянный фильтр означает,
// что любая будущая ошибка в списке снятых молча стирает плитки при каждом
// входе — и человек не может вернуть их даже руками. А удаление незнакомого
// типа прячет настоящий дефект под видом «сжатия раскладки».
//
// Живьём не собрать: нужно поймать раскладку до и после миграции и убедиться,
// что второй запуск её уже не трогает.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REGISTRY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_registry_v1.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_core_v1.js'), 'utf8');

const LAYOUT_KEY = 'heys_widget_layout_v1';
const META_KEY = 'heys_widget_layout_meta_v1';

function tile(type, col = 0, row = 0) {
  return { type, size: '2x1', position: { col, row } };
}

/** Хранилище в памяти + загруженные реестр и ядро виджетов. */
function boot(savedLayout, meta) {
  const memory = new Map();
  if (savedLayout) memory.set(LAYOUT_KEY, savedLayout);
  if (meta) memory.set(META_KEY, meta);

  window.HEYS = {
    // Ядро шлёт события о раскладке — в тесте они не нужны, но без шины упадёт.
    Widgets: { emit: () => {}, on: () => {}, off: () => {} },
    store: {
      get: (k, d) => (memory.has(k) ? memory.get(k) : d),
      set: (k, v) => { memory.set(k, v); },
    },
  };
  eval(REGISTRY_SRC);
  eval(CORE_SRC);
  window.HEYS.Widgets.state.init();
  return { state: window.HEYS.Widgets.state, memory };
}

/** Типы, которые реестр объявил снятыми — источник правды один. */
function retiredIds() {
  const win = { HEYS: {} };
  const fn = new Function('window', 'globalThis', 'self', REGISTRY_SRC);
  fn.call(win, win, win, win);
  return win.HEYS.Widgets.registry.getAllTypes().filter((t) => t.retired).map((t) => t.type ?? t.id);
}

describe('снятые виджеты · одноразовая миграция раскладки', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.HEYS;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('снятые типы объявлены реестром, а не именем в коде', () => {
    // Имена соседних типов почти совпадают (insulin / insulinWave,
    // streak / heatmap с видом «Серия»), поэтому снятие идёт по точному id.
    const ids = retiredIds();
    expect(ids.length, 'в реестре нет ни одного снятого типа').toBeGreaterThan(0);
    for (const id of ids) expect(typeof id).toBe('string');
  });

  it('плитка снятого типа уходит из раскладки', () => {
    const [firstRetired] = retiredIds();
    const { state } = boot([tile('calories'), tile(firstRetired, 0, 2), tile('weight', 2, 2)]);

    const types = state.getWidgets().map((w) => w.type);
    expect(types).not.toContain(firstRetired);
    expect(types).toContain('calories');
    expect(types).toContain('weight');
  });

  it('соседний тип с похожим именем не задет', () => {
    // Ровно та ошибка, ради которой контракт назвал id вместо имени.
    const { state } = boot([tile('insulinWave'), tile('heatmap', 2, 0), tile('steps', 0, 2)]);

    const types = state.getWidgets().map((w) => w.type);
    expect(types, 'снятие задело чужие типы').toEqual(
      expect.arrayContaining(['insulinWave', 'heatmap', 'steps']),
    );
  });

  it('незнакомый тип не удаляется молча — это дефект, а не сжатие', () => {
    const { state } = boot([tile('calories'), tile('какой-то-неизвестный-тип', 2, 0)]);

    const types = state.getWidgets().map((w) => w.type);
    expect(
      types,
      'виджет, которого нет в списке снятых, стёрли молча',
    ).toContain('какой-то-неизвестный-тип');
  });

  it('второй запуск раскладку уже не чистит', () => {
    const [firstRetired] = retiredIds();
    const { memory } = boot([tile('calories'), tile(firstRetired, 0, 2)]);

    // После миграции результат сохранён, а в мете записан список, по которому
    // чистили. Возвращаем снятую плитку руками — второй запуск обязан её
    // оставить: список снятых не менялся, работа уже сделана.
    // saveLayout хранит { widgets, updatedAt }, а старые раскладки — голый
    // массив; читаем обе формы, как это делает loadLayout.
    const stored = memory.get(LAYOUT_KEY);
    const afterFirst = Array.isArray(stored) ? stored : (stored?.widgets || []);
    const metaAfterFirst = memory.get(META_KEY);
    expect(metaAfterFirst?.retiredMigration, 'миграция не отметилась в мете').toBeTruthy();
    expect(afterFirst.map((w) => w.type)).not.toContain(firstRetired);

    const { state: second } = boot([...afterFirst, tile(firstRetired, 0, 4)], metaAfterFirst);

    expect(
      second.getWidgets().map((w) => w.type),
      'постоянный фильтр всё-таки работает при каждой загрузке',
    ).toContain(firstRetired);
  });
});
