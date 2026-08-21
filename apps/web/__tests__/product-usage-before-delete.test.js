import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

/**
 * Удаление продукта не чистит ссылки на него. 21.08 это вскрылось на живой
 * записи еды: четыре набора двух клиентов висели на удалённых карточках, и
 * куратор упёрся в это посреди дня. Еда при этом не теряется — и набор, и
 * позиция дня хранят снимок КБЖУ, — но связь с карточкой рвётся молча.
 *
 * Здесь проверяется предупреждение: человек должен узнать о последствиях до
 * удаления. Функция чистая, поэтому вырезается из исходника и гоняется без
 * React и localStorage.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Function ${name} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) {
      const fnSource = source.slice(start, i + 1);
      return Function(`"use strict"; return (${fnSource});`)();
    }
  }
  throw new Error(`Function ${name} body is not closed`);
}

const coreSource = read('apps/web/heys_core_v12.js');
const findProductUsage = extractFunction(coreSource, 'findProductUsage');

const PRESETS = [
  {
    id: 'mp_coffee',
    name: 'Кофе Киндерли',
    items: [
      { product_id: 'own-coffee', name: 'Домашний кофе', grams: 300, kcal100: 17.7 },
      { product_id: 'own-milk', name: 'Молоко 2,5', grams: 100, kcal100: 52 },
    ],
  },
  {
    id: 'mp_oat',
    name: 'Овсяная каша с кофе',
    // Историческая позиция: id не пережил переезд на overlay, узнаётся по имени.
    items: [{ product_id: 'legacy-id-gone', name: 'Домашний кофе', grams: 350 }],
  },
  {
    id: 'mp_other',
    name: 'Творог с ягодами',
    items: [{ product_id: 'own-curd', name: 'Творог 5%', grams: 200 }],
  },
];

const PRODUCTS = [
  { id: 'own-coffee', name: 'Домашний кофе' },
  { id: 'own-curd', name: 'Творог 5%' },
  {
    id: 'own-breakfast',
    name: 'Завтрак выходного дня',
    recipe: { yield_grams: 400, items: [{ product_id: 'own-coffee', name: 'Домашний кофе', grams: 300 }] },
  },
];

describe('поиск использований продукта перед удалением', () => {
  it('находит наборы по id и по названию — историческая позиция тоже считается', () => {
    const usage = findProductUsage('own-coffee', 'Домашний кофе', { presets: PRESETS, products: PRODUCTS });
    expect(usage.presets).toEqual(['Кофе Киндерли', 'Овсяная каша с кофе']);
  });

  it('находит блюда, в состав которых входит продукт', () => {
    const usage = findProductUsage('own-coffee', 'Домашний кофе', { presets: PRESETS, products: PRODUCTS });
    expect(usage.recipes).toEqual(['Завтрак выходного дня']);
  });

  it('не считает продукт использованием самого себя', () => {
    const selfRecipe = [{
      id: 'own-coffee',
      name: 'Домашний кофе',
      recipe: { items: [{ product_id: 'own-coffee', name: 'Домашний кофе', grams: 100 }] },
    }];
    const usage = findProductUsage('own-coffee', 'Домашний кофе', { presets: [], products: selfRecipe });
    expect(usage.recipes).toEqual([]);
  });

  it('неиспользуемый продукт не даёт ложного предупреждения', () => {
    const usage = findProductUsage('own-milk-unused', 'Молоко ультрапастеризованное', {
      presets: PRESETS,
      products: PRODUCTS,
    });
    expect(usage).toEqual({ presets: [], recipes: [] });
  });

  it('различия в регистре и «ё» совпадению не мешают', () => {
    const presets = [{ id: 'p1', name: 'Полдник', items: [{ product_id: 'x', name: 'Творог Обезжиренный' }] }];
    const usage = findProductUsage('own-curd-2', 'творог обезжиренный', { presets, products: [] });
    expect(usage.presets).toEqual(['Полдник']);
  });

  it('пустые входы не роняют проверку', () => {
    expect(findProductUsage(null, null, {})).toEqual({ presets: [], recipes: [] });
    expect(findProductUsage('id', 'Имя', { presets: null, products: null })).toEqual({ presets: [], recipes: [] });
  });
});

describe('удаление во вкладке «База» спрашивает до удаления', () => {
  it('deleteRow зовёт проверку использований и умеет отменить удаление', () => {
    const deleteRowStart = coreSource.indexOf('function deleteRow(id)');
    expect(deleteRowStart).toBeGreaterThan(-1);
    const filterStart = coreSource.indexOf('ШАГ 2/7', deleteRowStart);
    const head = coreSource.slice(deleteRowStart, filterStart);

    // Проверка обязана стоять ДО фильтрации массива продуктов, иначе отменять
    // будет уже нечего.
    expect(head).toContain('findProductUsage');
    expect(head).toContain('getMealPresets');
    expect(head).toContain('confirm');
    expect(head).toContain('return;');
  });

  it('проверка не блокирует удаление, если сама сломалась', () => {
    const deleteRowStart = coreSource.indexOf('function deleteRow(id)');
    const filterStart = coreSource.indexOf('ШАГ 2/7', deleteRowStart);
    const head = coreSource.slice(deleteRowStart, filterStart);
    expect(head).toContain('catch');
  });

  it('функция доступна через публичный фасад продуктов', () => {
    expect(coreSource).toContain('HEYS.products.findUsage = findProductUsage;');
  });
});
