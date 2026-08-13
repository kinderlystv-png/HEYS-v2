// Запуск: node --test yandex-cloud-functions/heys-api-rpc/__tests__/pg-check-violation.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isCheckViolation,
  mapCheckViolation,
  massFromProductData,
  constraintName,
  MASS_LIMIT_G,
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
