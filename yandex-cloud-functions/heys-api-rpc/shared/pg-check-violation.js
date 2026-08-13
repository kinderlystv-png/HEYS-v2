'use strict';

/**
 * PostgreSQL 23514 (check_violation) — бизнес-отказ, не падение БД.
 *
 * Сюда попадают и табличные CHECK, и RAISE EXCEPTION USING ERRCODE =
 * 'check_violation' (например bounds профиля). Раньше RPC отдавал 500
 * "Database error", и куратор видел сырой текст драйвера вместо причины.
 *
 * Пороги shared_products зеркалят
 * scripts/db/migrations/2026-08-02_shared_products_sanity_constraints.sql:
 * сумма нутриентов ≤ 105 г (5 г запас на округление).
 */

const MASS_LIMIT_G = 105;

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatGrams(n) {
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function productDataFromParams(params) {
  if (!params || typeof params !== 'object') return null;
  const data = params.p_product_data;
  return data && typeof data === 'object' ? data : null;
}

function massFromProductData(data) {
  if (!data || typeof data !== 'object') return null;
  return toNum(data.protein100)
    + toNum(data.simple100)
    + toNum(data.complex100)
    + toNum(data.badFat100 ?? data.badfat100)
    + toNum(data.goodFat100 ?? data.goodfat100)
    + toNum(data.fiber100);
}

function massMessage(params) {
  const mass = massFromProductData(productDataFromParams(params));
  const grams = formatGrams(mass);
  const head = grams
    ? `Сумма белка, углеводов, жиров и клетчатки — ${grams} г на 100 г продукта`
    : 'Сумма белка, углеводов, жиров и клетчатки больше 105 г на 100 г продукта';
  return `${head} (лимит ${MASS_LIMIT_G} г, запас на округление). На этикетке клетчатку часто включают и в углеводы — тогда сумма врёт; урежь клетчатку или углеводы, иначе в общую базу не публикуется.`;
}

const CONSTRAINT_MESSAGES = {
  shared_products_mass_within_100g: massMessage,
  shared_products_nutrients_non_negative: () => 'Нутриенты не могут быть отрицательными.',
  shared_products_energy_plausible: () =>
    'Калорийность по белкам, углеводам и жирам выше 950 ккал на 100 г — это физически невозможно (чистый жир даёт около 900).',
  shared_products_trans_within_fat: () => 'Трансжиры больше суммы жиров — часть не может превышать целое.',
  shared_products_gi_range: () => 'Гликемический индекс должен быть от 0 до 110.',
  shared_products_harm_range: () => 'Вредность должна быть от 0 до 10.',
};

function constraintName(error) {
  if (error && typeof error.constraint === 'string' && error.constraint) return error.constraint;
  const match = String((error && error.message) || '').match(/constraint "([^"]+)"/);
  return match ? match[1] : null;
}

function isCheckViolation(error) {
  return Boolean(error && error.code === '23514');
}

function fallbackMessage(error) {
  const message = String((error && error.message) || '').trim();
  if (message && !/violates check constraint/i.test(message)) return message;
  return 'Данные не прошли проверку базы.';
}

function mapCheckViolation(error, params) {
  const constraint = constraintName(error);
  const mapped = CONSTRAINT_MESSAGES[constraint];
  const message = typeof mapped === 'function' ? mapped(params) : fallbackMessage(error);
  return {
    success: false,
    error: message,
    message,
    code: 'CHECK_VIOLATION',
    constraint: constraint || null,
  };
}

module.exports = {
  MASS_LIMIT_G,
  isCheckViolation,
  mapCheckViolation,
  massFromProductData,
  constraintName,
};
