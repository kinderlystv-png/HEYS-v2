'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const products = require('../lib/products');
const day = require('../lib/day');

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

/**
 * Названия взяты из живого прогона 17.08: на «овсянку» и «яйцо» инструмент
 * возвращал блюда, где слово стоит в перечислении состава, наравне с самим
 * продуктом. Каждый такой лишний кандидат — уточняющий вопрос куратору, то
 * есть десятки секунд против сотен миллисекунд машинного времени.
 */
function realCatalog(names) {
  return {
    all: names.map((name, i) => ({
      id: `p${i}`, name, _source: 'own',
      protein100: 1, simple100: 1, complex100: 1, badFat100: 1, goodFat100: 1,
    })),
  };
}

test('продукт бьёт блюдо, где запрос стоит в перечислении состава', () => {
  const c = realCatalog([
    'Пирог зелёная гречка/овсянка/сухофрукты/яйцо/протеин',
    'Овсяные хлопья №2',
    'Салат курица яйцо горошек йогурт',
    'Яйцо варёное',
    'Кабачковые оладьи (кабачок, яйцо, мука)',
  ]);

  const oats = products.searchProducts(c, 'овсянка', 5);
  assert.equal(oats[0].name, 'Овсяные хлопья №2', 'морфологическая форма в начале названия сильнее слова в составе');

  const egg = products.searchProducts(c, 'яйцо', 5);
  assert.equal(egg[0].name, 'Яйцо варёное');
  // Отрыв важнее порядка: на нём держится решение resolveProduct — спрашивать
  // или писать. Салат и оладьи не должны идти вплотную к самому яйцу.
  const prepared = products.prepareQuery('яйцо');
  const best = products.scoreProduct(egg[0], prepared);
  const dish = products.scoreProduct(
    c.all.find((p) => p.name === 'Салат курица яйцо горошек йогурт'),
    prepared,
  );
  assert.ok(best >= dish * 1.25, `яйцо (${best}) должно уверенно обходить салат (${dish})`);
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
  assert.equal(syrup.writable, true);
});

test('hasStrongMatch: фраза или полное покрытие токенов, не частичное «пп»', () => {
  const classic = { name: 'Салат крабовый классический' };
  const catalogLike = { all: [classic] };
  assert.equal(products.hasStrongMatch(catalogLike, 'крабовый'), true);
  assert.equal(products.hasStrongMatch(catalogLike, 'крабовый салат пп'), false);
  assert.equal(products.matchStrength(classic, products.prepareQuery('крабовый салат пп')), 'weak');
  assert.equal(products.hasStrongMatch(catalogLike, 'салат крабовый классический'), true);
});

test('describeProduct помечает peer как не writable', () => {
  const described = products.describeProduct({
    id: 'own-salad-pp',
    name: 'Салат крабовый ПП',
    _source: 'peer',
    _owner_client_id: 'cid-anton',
    _owner_name: 'Антон',
    protein100: 5,
    carbs100: 7,
    fat100: 3,
  });
  assert.equal(described.writable, false);
  assert.equal(described.source, 'список Антон');
  assert.equal(described.owner_client_id, 'cid-anton');
});

test('describeProduct всегда NET Atwater, даже если в карточке классический kcal100', () => {
  // Регресс 2026-08-06: поиск показывал 4×Б из карточки, день клал 3×Б в приём.
  const milk = {
    id: 'p-milk',
    name: 'Молоко',
    protein100: 3,
    carbs100: 4.7,
    fat100: 3.5,
    kcal100: 62.3, // классический Атуотер — витрина не должна его отдавать
  };
  const described = products.describeProduct(milk);
  assert.equal(described.kcal100, day.computeTefKcal100(milk));
  assert.equal(described.kcal100, 59.3);
  assert.notEqual(described.kcal100, milk.kcal100);
});

// ── Написание, опечатки, штуки ────────────────────────────────────────────

const BRANDS = [
  { id: 'own-toffifee', _custom: true, name: 'Конфеты Toffifee', protein100: 6, carbs100: 57, fat100: 31, in_my_list: true, portions: [{ name: '🍬 1 шт', grams: 8 }] },
  { id: 'own-sausage', _custom: true, name: 'Сосиски «Вязанка Сливочные»', protein100: 11, carbs100: 1, fat100: 15, in_my_list: true },
  { id: 'own-soba', _custom: true, name: 'Лапша соба варёная', protein100: 3.7, carbs100: 24.8, fat100: 0.5, in_my_list: true, portions: [{ name: '🍜 1 порция', grams: 180 }] },
  { id: 'own-pack', _custom: true, name: 'Печенье овсяное в упаковке', protein100: 6, carbs100: 60, fat100: 20, in_my_list: true, portions: [{ name: '2 шт', grams: 30 }] },
];

function brands() {
  return products.buildCatalog(BRANDS, new Map());
}

test('транслитерация: кириллический запрос находит латинское название', () => {
  const [first] = products.searchProducts(brands(), 'тоффифи', 5);
  assert.equal(first && first.name, 'Конфеты Toffifee');
});

test('транслитерация работает и в обратную сторону', () => {
  const [first] = products.searchProducts(brands(), 'sosiski vyazanka', 5);
  assert.equal(first && first.name, 'Сосиски «Вязанка Сливочные»');
});

test('смешанный запрос ищет каждое слово в своём написании', () => {
  const [first] = products.searchProducts(brands(), 'конфеты тоффифи', 5);
  assert.equal(first && first.name, 'Конфеты Toffifee');
});

test('опечатка прощается внутри слова, но не в его начале', () => {
  assert.equal(products.searchProducts(brands(), 'сосиски вязанка сливушки', 5).length, 1);
  // Пять букв и две правки до «сахара», но начало другое — не совпадение.
  assert.deepEqual(products.searchProducts(brands(), 'кагор', 5), []);
});

test('вес штуки берётся из порции и делится на количество в названии', () => {
  const c = brands();
  assert.equal(products.pieceGrams(products.findById(c, 'own-toffifee')), 8);
  assert.equal(products.pieceGrams(products.findById(c, 'own-pack')), 15);
  // «порция» — не «штука»: угадывать вес штуки по ней нельзя.
  assert.equal(products.pieceGrams(products.findById(c, 'own-soba')), null);
  assert.equal(products.pieceGrams(products.findById(c, 'own-sausage')), null);
});

test('describeProduct показывает вес штуки, когда он известен', () => {
  const c = brands();
  assert.equal(products.describeProduct(products.findById(c, 'own-toffifee')).piece_grams, 8);
  assert.equal(products.describeProduct(products.findById(c, 'own-soba')).piece_grams, undefined);
});

// ── Словоформы и границы слова ────────────────────────────────────────────
// Инцидент 2026-08-01: «миндаль» не находил продукт клиента. Причина оказалась
// не в скоринге, но прогон вскрыл, что русские окончания ломают совпадение.

const FORMS = [
  ['Миндаль', 21, 22, 50], ['Яйцо куриное', 12.7, 0.7, 11.5], ['Творог 5%', 17, 3, 5],
  ['Сыр твёрдый классический', 25, 0, 30], ['Молоко ультрапастеризованное 3.5', 3, 4.7, 3.5],
  ['Масло сливочное 82,5', 0.8, 0.8, 82.5], ['Вода питьевая', 0, 0, 0], ['Водка', 0, 0.1, 0],
  ['Сахар-песок', 0, 100, 0], ['Сок апельсиновый', 0.7, 10, 0.2], ['Мясо говядина', 20, 0, 12],
].map((r, i) => ({ id: `f${i}`, _custom: true, name: r[0], protein100: r[1], carbs100: r[2], fat100: r[3], in_my_list: true }));

function forms() {
  return products.buildCatalog(FORMS, new Map());
}

test('падежи находят продукт: «миндаля», «яйца», «творога», «молока»', () => {
  const c = forms();
  const top = (q) => (products.searchProducts(c, q, 3)[0] || {}).name;
  assert.equal(top('миндаля'), 'Миндаль');
  assert.equal(top('яйца'), 'Яйцо куриное');
  assert.equal(top('творога'), 'Творог 5%');
  assert.equal(top('молока'), 'Молоко ультрапастеризованное 3.5');
});

test('падежи работают и в словосочетании', () => {
  const c = forms();
  assert.equal(products.searchProducts(c, 'сыра твердого', 3)[0].name, 'Сыр твёрдый классический');
  assert.equal(products.searchProducts(c, 'масла сливочного', 3)[0].name, 'Масло сливочное 82,5');
});

test('общая основа не склеивает разные продукты', () => {
  const c = forms();
  const names = (q) => products.searchProducts(c, q, 5).map((p) => p.name);
  // Расхождение начинается слишком рано и несимметрично — это разные слова.
  assert.equal(names('вода').includes('Водка'), false);
  assert.equal(names('мясо').includes('Масло сливочное 82,5'), false);
  assert.deepEqual(products.searchProducts(c, 'кагор', 5), []);
});

test('подстрока засчитывается только с границы слова', () => {
  const c = forms();
  const names = products.searchProducts(c, 'сок', 5).map((p) => p.name);
  assert.ok(names.includes('Сок апельсиновый'));
  // «песок» содержит «сок», но это середина слова.
  assert.equal(names.includes('Сахар-песок'), false);
});

test('подстрока внутри скобок и перечислений по-прежнему находится', () => {
  const c = products.buildCatalog(
    [{ id: 'mix', _custom: true, name: 'Орехи микс (миндаль,кешью,фундук)', protein100: 18, carbs100: 18, fat100: 53, in_my_list: true }],
    new Map(),
  );
  assert.equal(products.searchProducts(c, 'миндаль', 3).length, 1);
});

// ── Клетчатка ────────────────────────────────────────────────────────────
// Инвариант, а не деталь реализации: в HEYS клетчатка — отдельная от углеводов
// масса (в схеме shared_products она суммируется с ними при проверке «до 100 г»),
// и в калорийность она не входит. Формула здесь намеренно повторяет
// computeTEFKcal100 приложения: разойтись — значит показать разные калории для
// одного продукта в дневнике и в приложении. Менять только синхронно с вебом.

test('клетчатка не входит в углеводы и не даёт калорий', () => {
  const bran = {
    name: 'Отруби овсяные',
    protein100: 13, simple100: 2, complex100: 34, fiber100: 24,
    badFat100: 1, goodFat100: 6, trans100: 0, gi: 40, harm: 1,
  };
  const row = products.buildCustomProduct(bran, { nowMs: 1, makeId: () => 'p1' });

  assert.equal(row.carbs100, 36, 'углеводы — это простые плюс сложные, без клетчатки');
  assert.equal(row.kcal100, day.computeTefKcal100(row));
  assert.equal(row.kcal100, 3 * 13 + 4 * 36 + 9 * 7);

  // Та же карточка без клетчатки считается так же: поле в расчёт не входит.
  const withoutFiber = products.buildCustomProduct({ ...bran, fiber100: 0 }, { nowMs: 1, makeId: () => 'p2' });
  assert.equal(withoutFiber.kcal100, row.kcal100);
});

// ── Отпечаток продукта ───────────────────────────────────────────────────
// Вектор снят с живой общей базы: по этому отпечатку сервер отсекает
// дубликаты и связывает личные карточки с каталогом. Если тест упал —
// алгоритм разошёлся с приложением, и коннектор начнёт заводить дубли
// вместо того, чтобы находить существующий продукт.

test('отпечаток совпадает с тем, что лежит в общей базе', () => {
  assert.equal(
    products.computeProductFingerprint({
      name: 'Стейк говяжий на гриле',
      simple100: 0, complex100: 0, protein100: 26,
      badFat100: 7, goodFat100: 9, trans100: 0, fiber100: 0, gi: 0, harm: 0.9,
    }),
    '9257c5e86403ee33df960caa4b86413b3f12cbe6e45e780ad3f10670d1c02e27',
  );
  assert.equal(
    products.computeProductFingerprint({
      name: 'Салат крабовый классический',
      simple100: 5, complex100: 9, protein100: 6,
      badFat100: 3.2, goodFat100: 8.9, trans100: 0, fiber100: 1, gi: 60, harm: 5,
    }),
    'd38a1aac8760f399d1cb43e925dd51c0b14a806189c0e279542863e83df5fe41',
  );
});

test('брендовый отпечаток пуст без бренда и отличается от обычного', () => {
  const card = { name: 'Творог 5%', protein100: 16, simple100: 3, complex100: 0, badFat100: 3, goodFat100: 2, gi: 30, harm: 2 };
  assert.equal(products.computeProductBrandFingerprint(card), '');
  const branded = { ...card, brand: 'Простоквашино' };
  assert.notEqual(products.computeProductBrandFingerprint(branded), products.computeProductFingerprint(branded));
});

test('промышленным считается продукт с брендом или штрихкодом', () => {
  assert.equal(products.looksIndustrial({ name: 'Торт мамин' }), false);
  assert.equal(products.looksIndustrial({ name: 'Творог', brand: 'Домик' }), true);
  assert.equal(products.looksIndustrial({ name: 'Творог', barcode: '4600000000012' }), true);
});

test('поиск по штрихкоду находит продукт точнее имени', () => {
  const shared = new Map([
    ['s-a', { id: 's-a', name: 'Йогурт клубничный', protein100: 3, simple100: 10, complex100: 0, badfat100: 1, goodfat100: 1, barcode: '4600000123456' }],
    ['s-b', { id: 's-b', name: 'Йогурт персиковый', protein100: 3, simple100: 10, complex100: 0, badfat100: 1, goodfat100: 1 }],
  ]);
  const c = products.buildCatalog([], shared);
  const [hit] = products.searchProducts(c, '4600 0001-23456', 3);
  assert.equal(hit.id, 's-a');
  assert.equal(products.describeProduct(hit).barcode, '4600000123456');
});


// ── Похожесть как fallback пустого поиска ───────────────────────────────────
// Инцидент 22.08.2026: «ареон» не находил «Грудку копчёную Орион» — в
// tokenMatches опечатка допускается только при совпадающих первых трёх буквах,
// а разъехались ровно гласные. Ноль результатов стоил восьми кругов разведки.

const FUZZY_CATALOG = {
  all: [
    'Грудка копчёная Орион',
    'Шаурма классическая с курицей и соусами',
    'Молоко ультрапастеризованное 3.5',
    'Кефир 2,5',
    'Гречневая каша',
    'Сахар-песок',
    'Сок яблочный',
    'Сыр российский',
  ].map((name, i) => ({ id: `p${i}`, name, _source: 'own', kcal100: 100 })),
};

test('ошибка распознавания находится по скелету согласных', () => {
  assert.deepEqual(products.searchProducts(FUZZY_CATALOG, 'ареон', 5), [], 'точный поиск такое не ловит');
  const fuzzy = products.fuzzySearchProducts(FUZZY_CATALOG, 'ареон', 5);
  assert.equal(fuzzy.length, 1);
  assert.equal(fuzzy[0].name, 'Грудка копчёная Орион');
  assert.ok(fuzzy[0]._fuzzy >= 0.5, 'похожесть проставлена в строке-копии');
});

test('искажения гласных и опечатки ловятся, каталог при этом не мутируется', () => {
  for (const [query, expected] of [
    ['шаварма', 'Шаурма классическая с курицей и соусами'],
    ['малако', 'Молоко ультрапастеризованное 3.5'],
    ['кифир', 'Кефир 2,5'],
  ]) {
    const found = products.fuzzySearchProducts(FUZZY_CATALOG, query, 3);
    assert.equal(found[0] && found[0].name, expected, `«${query}» должен подсказать «${expected}»`);
  }
  assert.ok(FUZZY_CATALOG.all.every((row) => row._fuzzy === undefined), 'каталог кэшируется — правим только копии');
});

test('похожесть не выдумывает совпадений там, где их нет', () => {
  // Короткие слова не участвуют вовсе: у «сок» и «сыр» один скелет длиной 2.
  for (const query of ['сыр', 'сок', 'мясо', 'банан', 'лосось', 'протеин']) {
    const found = products.fuzzySearchProducts(FUZZY_CATALOG, query, 3)
      .filter((row) => products.searchProducts(FUZZY_CATALOG, query, 3).length === 0);
    assert.deepEqual(found.map((r) => r.name), [], `«${query}» не должен давать ложную подсказку`);
  }
});
