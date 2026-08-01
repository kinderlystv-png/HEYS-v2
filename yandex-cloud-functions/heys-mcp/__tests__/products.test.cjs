'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const products = require('../lib/products');

const SHARED = new Map([
  ['s-americano', { id: 's-americano', name: 'Кофе американо', protein100: 0.1, simple100: 0, complex100: 0.3, badfat100: 0, goodfat100: 0 }],
  ['s-milk', { id: 's-milk', name: 'Молоко ультрапастеризованное 3.5', protein100: 3, simple100: 4.7, complex100: 0, badfat100: 2.2, goodfat100: 1.3 }],
  ['s-syrup', { id: 's-syrup', name: 'Сироп для кофе (классический сахарный)', protein100: 0, simple100: 75, complex100: 0, badfat100: 0, goodfat100: 0 }],
  ['s-empty', { id: 's-empty', name: 'Пустышка без нутриентов' }],
  ['s-oats', { id: 's-oats', name: 'Овсяные хлопья', protein100: 12, simple100: 1, complex100: 58, badfat100: 1, goodfat100: 5 }],
]);

const OVERLAY = [
  { id: 'own-milk', shared_origin_id: 's-milk', overrides: {}, in_my_list: true },
  { id: 'own-syrup', shared_origin_id: 's-syrup', overrides: {}, in_my_list: true },
  { id: 'own-hidden', shared_origin_id: 's-oats', overrides: {}, in_my_list: false },
  { id: 'own-broken', shared_origin_id: 's-empty', overrides: {}, in_my_list: true },
  { id: 'own-custom', _custom: true, name: 'Флэт уайт домашний', protein100: 3, carbs100: 8.7, fat100: 3.3, in_my_list: true },
];

function catalog() {
  return products.buildCatalog(OVERLAY, SHARED);
}

test('normalizeSharedRow приводит lowercase-колонки REST к схеме приложения', () => {
  const row = products.normalizeSharedRow({ id: 'x', name: 'X', badfat100: 2, goodfat100: 1, trans100: 0.1, simple100: 4, complex100: 1 });
  assert.equal(row.badFat100, 2);
  assert.equal(row.goodFat100, 1);
  assert.equal(row.carbs100, 5);
  assert.equal(Math.round(row.fat100 * 10) / 10, 3.1);
});

test('каталог собирает Type A поверх shared и Type B как есть', () => {
  const c = catalog();
  const milk = c.own.find((p) => p.id === 'own-milk');
  assert.equal(milk.name, 'Молоко ультрапастеризованное 3.5');
  assert.equal(milk.shared_origin_id, 's-milk');
  assert.ok(c.own.some((p) => p.id === 'own-custom'));
});

test('мягко удалённые строки и строки без нутриентов не попадают в каталог', () => {
  const c = catalog();
  assert.equal(c.all.some((p) => p.id === 'own-hidden'), false);
  assert.equal(c.all.some((p) => p.id === 'own-broken'), false);
  assert.equal(c.all.some((p) => p.id === 's-empty'), false);
});

test('продукт из личного списка не дублируется своим shared-оригиналом', () => {
  const c = catalog();
  const milkRows = c.all.filter((p) => p.name === 'Молоко ультрапастеризованное 3.5');
  assert.equal(milkRows.length, 1);
  assert.equal(milkRows[0]._source, 'own');
});

test('shared-продукт, которого нет у клиента, доступен для поиска', () => {
  const c = catalog();
  const americano = c.all.find((p) => p.name === 'Кофе американо');
  assert.ok(americano);
  assert.equal(americano._source, 'shared');
});

test('поиск ставит личный продукт выше одноимённого общего', () => {
  const c = products.buildCatalog(
    [{ id: 'own-oats', shared_origin_id: 's-oats', overrides: {}, in_my_list: true }],
    SHARED,
  );
  const [first] = products.searchProducts(c, 'овсяные хлопья', 5);
  assert.equal(first._source, 'own');
});

test('поиск находит по подстроке и переживает ё/регистр/пунктуацию', () => {
  const c = catalog();
  const found = products.searchProducts(c, 'СИРОП, для кофе', 5);
  assert.equal(found[0].name, 'Сироп для кофе (классический сахарный)');
});

test('поиск не выдаёт мусор по одному общему слову длинного запроса', () => {
  const c = catalog();
  const found = products.searchProducts(c, 'кофе с кокосовым молоком без сахара тройной', 10);
  assert.equal(found.some((p) => p.name === 'Овсяные хлопья'), false);
});

test('пустой запрос ничего не возвращает', () => {
  assert.deepEqual(products.searchProducts(catalog(), '   ', 5), []);
});

test('findById ищет и по id строки, и по shared_origin_id', () => {
  const c = catalog();
  assert.equal(products.findById(c, 'own-milk').id, 'own-milk');
  assert.equal(products.findById(c, 's-americano').name, 'Кофе американо');
  assert.equal(products.findById(c, 'нет-такого'), null);
});

test('describeProduct считает калорийность, если её нет в карточке', () => {
  const c = catalog();
  const syrup = products.describeProduct(products.findById(c, 'own-syrup'));
  assert.equal(syrup.kcal100, 300);
  assert.equal(syrup.source, 'мой список');
});
