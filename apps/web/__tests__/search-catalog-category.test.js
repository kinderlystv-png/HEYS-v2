// @vitest-environment node
//
// Поиск по категории раньше опирался только на словарь ключевых слов и искал их
// в НАЗВАНИИ продукта. Поле `category`, проставленное в каталоге, не читалось
// вообще — то есть про продукт существовало два независимых мнения о его
// категории, и они расходились: «Мясо по-французски» по названию попадало в
// мясо, хотя это готовое блюдо с майонезом и картошкой.
//
// Инвариант: категория из каталога — первичный признак, ключевые слова остаются
// запасным вариантом для карточек без категории.

import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { describe, expect, it } from 'vitest';

const searchSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_smart_search_v2.js'),
  'utf8'
);

function loadSearch() {
  const store = new Map();
  const context = {
    console,
    setTimeout,
    clearTimeout,
    requestIdleCallback: (fn) => setTimeout(fn, 0),
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    HEYS: {},
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(searchSource, context);
  return context.HEYS.SmartSearchWithTypos;
}

describe('поиск по категории использует поле каталога', () => {
  it('берёт продукт по категории, даже если в названии нет ключевого слова', () => {
    const search = loadSearch();
    const catalog = [
      { id: '1', name: 'Мясо по-французски', category: 'готовые блюда' },
      { id: '2', name: 'Творог 5%', category: 'молочные' },
    ];

    const result = search.findCategoryProducts('молочные', catalog);
    const ids = result.map((r) => r.id);

    expect(ids).toContain('2');
    expect(ids).not.toContain('1');
  });

  it('не относит готовое блюдо к мясу, хотя в названии есть «мясо»', () => {
    const search = loadSearch();
    const catalog = [
      { id: 'dish', name: 'Мясо по-французски', category: 'готовые блюда' },
      { id: 'meat', name: 'Стейк говяжий на гриле', category: 'мясо/птица' },
    ];

    const ids = search.findCategoryProducts('мясо', catalog).map((r) => r.id);

    expect(ids).toContain('meat');
    expect(ids).not.toContain('dish');
  });

  it('находит категории, которых нет в словаре ключевых слов', () => {
    const search = loadSearch();
    const catalog = [
      { id: 'bar', name: 'Chika Layers фундук и карамель', category: 'спортпит' },
      { id: 'wine', name: 'Красное вино полусладкое', category: 'алкоголь' },
      { id: 'egg', name: 'Яйцо варёное', category: 'яйца' },
    ];

    expect(search.findCategoryProducts('спортпит', catalog).map((r) => r.id)).toEqual(['bar']);
    expect(search.findCategoryProducts('алкоголь', catalog).map((r) => r.id)).toEqual(['wine']);
  });

  it('карточка без категории по-прежнему ищется по ключевым словам', () => {
    const search = loadSearch();
    const catalog = [{ id: 'legacy', name: 'Творог обезжиренный' }];

    const ids = search.findCategoryProducts('молочные', catalog).map((r) => r.id);

    expect(ids).toContain('legacy');
  });
});
