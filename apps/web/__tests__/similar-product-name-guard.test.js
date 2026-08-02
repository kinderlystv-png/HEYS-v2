// @vitest-environment node
//
// Клиент создаёт «Торт Наполеон222» рядом с уже имеющимся «Торт Наполеон», и
// одна и та же еда попадает в приём дважды — реальный случай из дня
// 2026-04-26, где в ночном приёме стояло 200 г торта двумя позициями.
// Существующие проверки дублей сравнивают названия точно и такие пары не ловят.
//
// Ключевое требование — не ложные срабатывания: «Творог 5%» и «Творог 9%»
// отличаются на ОДИН символ и это разные продукты, а «Наполеон» и
// «Наполеон222» — на три и это дубль. Значит порог по расстоянию сам по себе
// не годится, и тест закрепляет именно характер различия.

import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_add_product_step_v1.js'),
  'utf8'
);

// Из большого UI-модуля берём только чистые функции сравнения имён: остальное
// тянет за собой React и DOM.
function loadNameGuard() {
  const start = source.indexOf('const SIMILAR_NAME_TAIL_MAX');
  const end = source.indexOf('const normalizePortions');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Блок проверки похожих названий не найден — обнови границы выборки');
  }

  const context = {
    console,
    HEYS: {
      models: {
        normalizeProductName: (name) => String(name || '').toLowerCase().trim(),
      },
      SmartSearchWithTypos: {
        utils: {
          // Тот же алгоритм, что в heys_smart_search_v2.js.
          levenshteinDistance(a, b) {
            const m = a.length;
            const n = b.length;
            const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
            for (let j = 0; j <= n; j++) d[0][j] = j;
            for (let i = 1; i <= m; i++) {
              for (let j = 1; j <= n; j++) {
                d[i][j] = Math.min(
                  d[i - 1][j] + 1,
                  d[i][j - 1] + 1,
                  d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
              }
            }
            return d[m][n];
          },
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.__guard = { looksLikeSameProduct, findSimilarPersonalProducts };`, context);
  return context.__guard;
}

const { looksLikeSameProduct, findSimilarPersonalProducts } = loadNameGuard();

describe('распознавание дубля по названию', () => {
  it('ловит приписанный в конец мусорный хвост', () => {
    expect(looksLikeSameProduct('Торт Наполеон222', 'Торт Наполеон')).toBe(true);
    expect(looksLikeSameProduct('Творог 5%1', 'Творог 5%')).toBe(true);
  });

  it('ловит одиночную опечатку внутри слова', () => {
    expect(looksLikeSameProduct('Торт Наполион', 'Торт Наполеон')).toBe(true);
  });

  it('НЕ считает дублем разную жирность и проценты', () => {
    expect(looksLikeSameProduct('Творог 5%', 'Творог 9%')).toBe(false);
    expect(looksLikeSameProduct('Молоко 2,5', 'Молоко 3,5')).toBe(false);
    expect(looksLikeSameProduct('Кефир 1', 'Кефир 3')).toBe(false);
  });

  it('НЕ считает дублем уточнение сорта отдельным словом', () => {
    expect(looksLikeSameProduct('Хлеб белый тостовый', 'Хлеб белый')).toBe(false);
    expect(looksLikeSameProduct('Сыр Российский молодой', 'Сыр Российский')).toBe(false);
  });

  it('НЕ считает дублем разные продукты и одинаковые названия', () => {
    expect(looksLikeSameProduct('Творог 5%', 'Сметана 15%')).toBe(false);
    expect(looksLikeSameProduct('Торт Наполеон', 'Торт Наполеон')).toBe(false);
  });
});

describe('подбор кандидатов из личного списка', () => {
  const list = [
    { id: 'a', name: 'Торт Наполеон', kcal100: 302.7 },
    { id: 'b', name: 'Творог 9%', kcal100: 159 },
    { id: 'c', name: 'Хлеб белый', kcal100: 248 },
  ];

  it('возвращает похожий продукт', () => {
    const found = findSimilarPersonalProducts('Торт Наполеон222', list, 'new-id');
    expect(found.map((p) => p.id)).toEqual(['a']);
  });

  it('исключает сам редактируемый продукт', () => {
    const found = findSimilarPersonalProducts('Торт Наполеон222', list, 'a');
    expect(found).toHaveLength(0);
  });

  it('не предлагает скрытые из списка карточки', () => {
    const hidden = [{ id: 'h', name: 'Торт Наполеон', in_my_list: false }];
    expect(findSimilarPersonalProducts('Торт Наполеон222', hidden, 'new')).toHaveLength(0);
  });

  it('молчит, когда похожего нет', () => {
    expect(findSimilarPersonalProducts('Гречка отварная', list, 'new')).toHaveLength(0);
  });
});
