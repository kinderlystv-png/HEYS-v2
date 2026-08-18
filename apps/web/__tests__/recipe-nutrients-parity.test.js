import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

// Расчёт рецепта живёт в двух рантаймах: сервер считает при сохранении карточки,
// браузер — при правке состава в RationTab. Формулы одинаковые ровно до первой
// правки одной из сторон, и разойдутся они молча: пользователь увидит одно
// число в приложении и другое в ответе куратора. Тест держит их вместе.
let webCompute;
let mcpCompute;

beforeAll(async () => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  const src = fs.readFileSync(path.join(repoRoot, 'apps/web/heys_models_v1.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(global);
  webCompute = global.HEYS.models.computeRecipeNutrients;

  const products = await import(
    path.join(repoRoot, 'yandex-cloud-functions/heys-mcp/lib/products.js')
  );
  mcpCompute = (products.default || products).computeRecipeNutrients;
});

// Салат крабовый ПП — реальный рецепт из прода, шесть позиций и выход, равный
// сумме: холодное блюдо, уварки нет.
const INGREDIENTS = {
  surimi: {
    id: 'surimi', name: 'Крабовые палочки (сурими)',
    protein100: 6.3, simple100: 5.1, complex100: 9, badFat100: 0.2, goodFat100: 0.6,
    trans100: 0, fiber100: 0, gi: 50, harm: 5,
  },
  corn: {
    id: 'corn', name: 'Кукуруза консервированная сладкая',
    protein100: 2.4, simple100: 4.5, complex100: 6.7, badFat100: 0.2, goodFat100: 1,
    trans100: 0, fiber100: 2, gi: 55, harm: 2,
  },
  yogurt: {
    id: 'yogurt', name: 'Греческий йогурт 2',
    protein100: 5, simple100: 3.5, complex100: 0, badFat100: 1.2, goodFat100: 0.8,
    trans100: 0, fiber100: 0, gi: 35, harm: 1,
  },
  cabbage: {
    id: 'cabbage', name: 'Капуста пекинская свежая',
    protein100: 1.2, simple100: 1.4, complex100: 0.6, badFat100: 0, goodFat100: 0.2,
    trans100: 0, fiber100: 1.2, gi: 15, harm: 0,
  },
  egg: {
    id: 'egg', name: 'Яйцо варёное',
    protein100: 12.7, simple100: 0.7, complex100: 0, badFat100: 3.1, goodFat100: 7.5,
    trans100: 0, fiber100: 0, gi: 0, harm: 1,
  },
  cucumber: {
    id: 'cucumber', name: 'Огурец свежий',
    protein100: 0.8, simple100: 2, complex100: 0.5, badFat100: 0, goodFat100: 0.1,
    trans100: 0, fiber100: 0.7, gi: 15, harm: 0,
  },
};

const RECIPE = {
  yield_grams: 1296,
  items: [
    { product_id: 'surimi', grams: 400 },
    { product_id: 'corn', grams: 267 },
    { product_id: 'yogurt', grams: 192 },
    { product_id: 'cabbage', grams: 178 },
    { product_id: 'egg', grams: 192 },
    { product_id: 'cucumber', grams: 67 },
  ],
};

const findProduct = (spec) => INGREDIENTS[spec.product_id] || null;

describe('расчёт рецепта совпадает в MCP и в приложении', () => {
  it('одинаковые числа на одном составе', () => {
    const web = webCompute(RECIPE, findProduct);
    const mcp = mcpCompute(RECIPE, findProduct);
    expect(web.nutrients).toEqual(mcp.nutrients);
  });

  it('ГИ взвешен по массе, а не по углеводам — в обоих рантаймах', () => {
    // Масло без углеводов: по углеводам его ГИ выпал бы из среднего целиком,
    // по массе — тянет результат вниз. День считает по массе, рецепт обязан так же.
    const oats = {
      id: 'oats', name: 'Овёс', protein100: 10, simple100: 0, complex100: 60,
      badFat100: 1, goodFat100: 5, trans100: 0, fiber100: 8, gi: 40, harm: 1,
    };
    const oil = {
      id: 'oil', name: 'Масло', protein100: 0, simple100: 0, complex100: 0,
      badFat100: 14, goodFat100: 86, trans100: 0, fiber100: 0, gi: 0, harm: 2,
    };
    const byId = { oats, oil };
    const recipe = {
      yield_grams: 150,
      items: [{ product_id: 'oats', grams: 100 }, { product_id: 'oil', grams: 50 }],
    };
    const resolve = (spec) => byId[spec.product_id] || null;

    const web = webCompute(recipe, resolve);
    const mcp = mcpCompute(recipe, resolve);
    expect(web.nutrients.gi).toBe(26.7);
    expect(mcp.nutrients.gi).toBe(26.7);
  });

  it('клетчатка не попадает в углеводы ни на одной стороне', () => {
    // Досье PRODUCTS_AND_SEARCH: fiber100 — отдельная масса, не часть complex100.
    // Сложение их в одну сумму занижало бы калорийность вдвое по клетчатке.
    const web = webCompute(RECIPE, findProduct);
    const mcp = mcpCompute(RECIPE, findProduct);
    const carbsFromParts = web.nutrients.simple100 + web.nutrients.complex100;
    expect(web.nutrients.carbs100).toBeCloseTo(carbsFromParts, 1);
    expect(mcp.nutrients.fiber100).toBe(web.nutrients.fiber100);
    expect(web.nutrients.fiber100).toBeGreaterThan(0);
  });
});
