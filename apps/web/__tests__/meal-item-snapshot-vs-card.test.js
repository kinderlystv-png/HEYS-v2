// Что считается цифрами приёма: снимок в позиции дня или текущая карточка.
// Аудит 2026-08-23 показал, что вопрос стоит ровно наоборот тому, как его
// обычно формулируют: снимок в позиции есть всегда, но пока карточка жива, он
// не участвует в расчёте. Тест закрепляет именно это разделение — иначе смена
// режима в getProductFromItem пройдёт молча и перепишет всю историю дневника.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

let models;

beforeAll(() => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  // Тот же приём, что в curator-authorship.test.js: vitest держит isolate:false,
  // а модуль регистрируется сайд-эффектом IIFE.
  const src = fs.readFileSync(path.join(repoRoot, 'apps/web/heys_models_v1.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(global);
  models = global.HEYS.models;
});

beforeEach(() => {
  // Кэш итогов ключуется именами id в индексе, а не значениями карточек: без
  // сброса второй вызов вернул бы первый результат (см. тест про кэш ниже).
  models.clearMealTotalsCache();
});

const CARD = {
  id: 'p1',
  name: 'Молоко',
  protein100: 3,
  simple100: 5,
  complex100: 0,
  badFat100: 1,
  goodFat100: 2,
  trans100: 0,
  fiber100: 0,
};

// Позиция дня несёт полный снимок нутриентов — так её пишет buildAddProductItem.
const ITEM = {
  id: 'it1',
  product_id: 'p1',
  name: 'Молоко',
  grams: 200,
  protein100: 3,
  simple100: 5,
  complex100: 0,
  badFat100: 1,
  goodFat100: 2,
  trans100: 0,
  fiber100: 0,
};

function indexOf(...cards) {
  return {
    byId: new Map(cards.map((c) => [String(c.id).toLowerCase(), c])),
    byName: new Map(cards.map((c) => [c.name.toLowerCase(), c])),
    byFingerprint: new Map(),
  };
}

const EMPTY_INDEX = { byId: new Map(), byName: new Map(), byFingerprint: new Map() };

describe('позиция приёма: снимок против карточки', () => {
  it('живая карточка перебивает снимок — прошлый день пересчитывается', () => {
    const meal = { id: 'm1', items: [ITEM] };
    const before = models.mealTotals(meal, indexOf(CARD));

    models.clearMealTotalsCache();
    const edited = { ...CARD, protein100: 30, simple100: 50 };
    const after = models.mealTotals(meal, indexOf(edited));

    expect(before.prot).toBe(6);
    expect(after.prot).toBe(60);
    expect(after.kcal).toBeGreaterThan(before.kcal);
  });

  it('снимок работает только когда карточку не нашли', () => {
    const meal = { id: 'm2', items: [ITEM] };
    const withCard = models.mealTotals(meal, indexOf(CARD));

    models.clearMealTotalsCache();
    const orphan = models.mealTotals(meal, EMPTY_INDEX);

    expect(orphan).toEqual(withCard);
  });

  it('снимок дополняет карточку только там, где у неё поля нет', () => {
    const cardWithoutFiber = { ...CARD, fiber100: null };
    const itemWithFiber = { ...ITEM, fiber100: 9, protein100: 99 };

    const resolved = models.getProductFromItem(itemWithFiber, indexOf(cardWithoutFiber));

    expect(resolved.fiber100).toBe(9); // у карточки пусто — берём из позиции
    expect(resolved.protein100).toBe(3); // у карточки есть — позиция игнорируется
  });

  it('кэш итогов не видит правку карточки: пересчёт держится на сбросе кэша', () => {
    const meal = { id: 'm3', items: [ITEM] };
    const before = models.mealTotals(meal, indexOf(CARD));
    const edited = { ...CARD, protein100: 30, simple100: 50 };

    // Без clearMealTotalsCache тот же ключ — тот же ответ, хотя карточка другая.
    expect(models.mealTotals(meal, indexOf(edited))).toEqual(before);

    models.clearMealTotalsCache();
    expect(models.mealTotals(meal, indexOf(edited)).prot).toBe(60);
  });
});
