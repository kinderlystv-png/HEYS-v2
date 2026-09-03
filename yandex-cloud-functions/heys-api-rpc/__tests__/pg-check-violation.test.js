// Запуск: node --test yandex-cloud-functions/heys-api-rpc/__tests__/pg-check-violation.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isCheckViolation,
  mapCheckViolation,
  massFromProductData,
  macroFromProductData,
  constraintName,
  MASS_LIMIT_G,
  MACRO_LIMIT_G,
} = require('../shared/pg-check-violation');

const MEDUTEUT = {
  protein100: 5,
  simple100: 40,
  complex100: 0,
  badFat100: 2,
  goodFat100: 0,
  fiber100: 60,
};

test('MEDUTEUT label sums to 107 g — over the 105 g catalog limit', () => {
  assert.equal(massFromProductData(MEDUTEUT), 107);
  assert.equal(MASS_LIMIT_G, 105);
});

// Разобранный 2026-09-03 мусор из каталога: клетчатка посчитана дважды (чиа) и
// сахарные спирты, записанные в клетчатку (Chika Layers, миграция
// 2026-08-02_fix_polyols_in_fiber.sql). Все четыре батончика стоят на 107.5–109 г
// — то есть ВЫШЕ MEDUTEUT. Поэтому поднять лимит «чтобы 107 прошло» нельзя: тем
// же движением в каталог вернётся класс, из-за которого батончик на 250 ккал
// считался как 186. Тест сторожит решение, а не число.
const KNOWN_BAD_CARDS = [
  { name: 'Семена чиа (клетчатка дважды)', protein100: 16.5, simple100: 0.5, complex100: 41.6, badFat100: 3, goodFat100: 27.5, fiber100: 34.4 },
  { name: 'Chika Layers арахис карамель', protein100: 30, simple100: 2, complex100: 33, badFat100: 4, goodFat100: 5, fiber100: 35 },
  { name: 'Chika Layers фундук и карамель', protein100: 30, simple100: 6, complex100: 29, badFat100: 4, goodFat100: 4, fiber100: 35 },
  { name: 'Chika Layers Crispy Cookies', protein100: 30, simple100: 2.5, complex100: 32.5, badFat100: 4, goodFat100: 3.5, fiber100: 35 },
];

test('raising the mass limit to admit MEDUTEUT would re-admit known garbage', () => {
  for (const card of KNOWN_BAD_CARDS) {
    const mass = massFromProductData(card);
    assert.ok(mass > MASS_LIMIT_G, `${card.name}: ${mass} г должно оставаться выше лимита`);
    assert.ok(
      mass >= massFromProductData(MEDUTEUT),
      `${card.name}: ${mass} г не отделяется от MEDUTEUT одним порогом`,
    );
  }
});

test('macro limit leaves 3 g of label rounding above the 100 g of dry matter', () => {
  assert.equal(MACRO_LIMIT_G, 103);
  // Самые плотные реальные карточки обоих срезов каталога — подсолнечное масло
  // 99.9 г и белый сахар 99.8 г. Оба обязаны проходить с запасом.
  assert.ok(macroFromProductData({ goodFat100: 90.9, badFat100: 9 }) <= MACRO_LIMIT_G);
  assert.ok(macroFromProductData({ simple100: 99.8 }) <= MACRO_LIMIT_G);
});

test('fiber is excluded from the macro sum, in both column spellings', () => {
  assert.equal(macroFromProductData(MEDUTEUT), 47);
  assert.equal(macroFromProductData({
    protein100: 5, simple100: 40, complex100: 0, badfat100: 2, goodfat100: 0, fiber100: 60,
  }), 47);
});

test('macro rule catches inflated macros that the total-mass rule lets through', () => {
  // Задвоенный жир: БЖУ 104 г при нулевой клетчатке. Полная масса 104 ≤ 105,
  // энергия 765 ≤ 950 — до этого правила такая карточка проходила все проверки.
  const doubledFat = { protein100: 14, simple100: 5, complex100: 25, badFat100: 30, goodFat100: 30, fiber100: 0 };
  assert.ok(massFromProductData(doubledFat) <= MASS_LIMIT_G);
  assert.ok(macroFromProductData(doubledFat) > MACRO_LIMIT_G);

  const body = mapCheckViolation({
    code: '23514',
    constraint: 'shared_products_macro_mass_within_100g',
    message: 'new row for relation "shared_products" violates check constraint "shared_products_macro_mass_within_100g"',
  }, { p_product_data: doubledFat });
  assert.equal(body.code, 'CHECK_VIOLATION');
  assert.equal(body.constraint, 'shared_products_macro_mass_within_100g');
  assert.match(body.error, /104 г на 100 г/);
  assert.match(body.error, /лимит 103 г/);
  assert.doesNotMatch(body.error, /Database error/i);
});

test('mass message points at fiber when the macros alone fit', () => {
  const body = mapCheckViolation({
    code: '23514',
    constraint: 'shared_products_mass_within_100g',
    message: 'new row for relation "shared_products" violates check constraint "shared_products_mass_within_100g"',
  }, { p_product_data: MEDUTEUT });
  assert.match(body.error, /107 г на 100 г/);
  assert.match(body.error, /клетчатк/i);
  assert.match(body.error, /вода и зола/);
});

test('mass message does not blame fiber when the macros are the ones that overflow', () => {
  const body = mapCheckViolation({
    code: '23514',
    constraint: 'shared_products_mass_within_100g',
    message: 'new row for relation "shared_products" violates check constraint "shared_products_mass_within_100g"',
  }, { p_product_data: { protein100: 30, simple100: 40, complex100: 40, badFat100: 0, goodFat100: 0, fiber100: 1 } });
  assert.doesNotMatch(body.error, /БЖУ сами по себе в норме/);
});

test('snake_case fat columns from REST still count toward mass', () => {
  assert.equal(massFromProductData({
    protein100: 5,
    simple100: 40,
    complex100: 0,
    badfat100: 2,
    goodfat100: 0,
    fiber100: 60,
  }), 107);
});

test('isCheckViolation only matches SQLSTATE 23514', () => {
  assert.equal(isCheckViolation({ code: '23514' }), true);
  assert.equal(isCheckViolation({ code: 'P0001' }), false);
  assert.equal(isCheckViolation(null), false);
});

test('mass constraint message includes the actual gram sum', () => {
  const error = {
    code: '23514',
    constraint: 'shared_products_mass_within_100g',
    message: 'new row for relation "shared_products" violates check constraint "shared_products_mass_within_100g"',
  };
  const body = mapCheckViolation(error, { p_product_data: MEDUTEUT });
  assert.equal(body.success, false);
  assert.equal(body.code, 'CHECK_VIOLATION');
  assert.equal(body.constraint, 'shared_products_mass_within_100g');
  assert.match(body.error, /107 г на 100 г/);
  assert.match(body.error, /лимит 105 г/);
  assert.equal(body.message, body.error);
});

test('mass constraint without payload still names the rule, not Database error', () => {
  const body = mapCheckViolation({
    code: '23514',
    constraint: 'shared_products_mass_within_100g',
    message: 'new row for relation "shared_products" violates check constraint "shared_products_mass_within_100g"',
  }, {});
  assert.match(body.error, /больше 105 г/);
  assert.doesNotMatch(body.error, /Database error/i);
});

test('constraint name is recovered from the PG message when driver omits .constraint', () => {
  assert.equal(
    constraintName({
      message: 'new row for relation "shared_products" violates check constraint "shared_products_gi_range"',
    }),
    'shared_products_gi_range',
  );
  const body = mapCheckViolation({
    code: '23514',
    message: 'new row for relation "shared_products" violates check constraint "shared_products_gi_range"',
  });
  assert.match(body.error, /Гликемический индекс/);
});

test('RAISE EXCEPTION with check_violation keeps the original message', () => {
  const body = mapCheckViolation({
    code: '23514',
    message: 'invalid_profile_age: 5 (allowed: 10..120)',
  });
  assert.equal(body.error, 'invalid_profile_age: 5 (allowed: 10..120)');
  assert.equal(body.constraint, null);
});

test('unknown table CHECK does not leak the raw PG dump as the only text', () => {
  const body = mapCheckViolation({
    code: '23514',
    constraint: 'some_other_chk',
    message: 'new row for relation "foo" violates check constraint "some_other_chk"',
  });
  assert.equal(body.error, 'Данные не прошли проверку базы.');
});

// ── Зеркало SQL ↔ JS ───────────────────────────────────────────────────────
// Пороги живут в двух местах: в CHECK на shared_products и здесь, чтобы отказ
// был человеческим. Разъедутся молча — база откажет по одному числу, а куратор
// прочитает другое. Тест читает сами миграции.
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'scripts', 'db', 'migrations');
const SANITY_SQL = fs.readFileSync(
  path.join(MIGRATIONS_DIR, '2026-08-02_shared_products_sanity_constraints.sql'), 'utf8');
const MACRO_SQL = fs.readFileSync(
  path.join(MIGRATIONS_DIR, '2026-09-03_shared_products_macro_mass_rule.sql'), 'utf8');

function addedConstraints(sql) {
  return [...sql.matchAll(/ADD CONSTRAINT\s+(\w+)/g)].map((m) => m[1]);
}

function checkedLimit(sql, constraint) {
  const at = sql.indexOf(`ADD CONSTRAINT ${constraint} CHECK (`);
  assert.notEqual(at, -1, `${constraint} не найден в миграции`);
  const body = sql.slice(at, sql.indexOf(');', at));
  const limit = body.match(/<=\s*(\d+(?:\.\d+)?)/);
  return limit ? Number(limit[1]) : null;
}

test('SQL thresholds match the constants the curator-facing message quotes', () => {
  assert.equal(checkedLimit(SANITY_SQL, 'shared_products_mass_within_100g'), MASS_LIMIT_G);
  assert.equal(checkedLimit(MACRO_SQL, 'shared_products_macro_mass_within_100g'), MACRO_LIMIT_G);
});

test('every CHECK added by the migrations has its own human message', () => {
  const constraints = [...addedConstraints(SANITY_SQL), ...addedConstraints(MACRO_SQL)];
  assert.ok(constraints.length >= 7, `ожидали минимум 7 констрейнтов, нашли ${constraints.length}`);
  for (const constraint of constraints) {
    const body = mapCheckViolation({
      code: '23514',
      constraint,
      message: `new row for relation "shared_products" violates check constraint "${constraint}"`,
    }, {});
    assert.notEqual(body.error, 'Данные не прошли проверку базы.', `${constraint}: нет своего текста`);
  }
});

test('the macro CHECK sums macronutrients without fiber and without trans fats', () => {
  const at = MACRO_SQL.indexOf('ADD CONSTRAINT shared_products_macro_mass_within_100g CHECK (');
  const body = MACRO_SQL.slice(at, MACRO_SQL.indexOf(');', at));
  for (const column of ['protein100', 'simple100', 'complex100', 'badfat100', 'goodfat100']) {
    assert.ok(body.includes(column), `в сумме нет ${column}`);
  }
  // Клетчатка — предмет отдельного правила; трансжиры уже входят в badfat/goodfat
  // (shared_products_trans_within_fat), второй раз их считать нельзя.
  assert.ok(!body.includes('fiber100'), 'клетчатка не должна входить в правило БЖУ');
  assert.ok(!body.includes('trans100'), 'трансжиры считались бы дважды');
});
