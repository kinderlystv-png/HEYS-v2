'use strict';

/**
 * PostgreSQL 23514 (check_violation) — бизнес-отказ, не падение БД.
 *
 * Сюда попадают и табличные CHECK, и RAISE EXCEPTION USING ERRCODE =
 * 'check_violation' (например bounds профиля). Раньше RPC отдавал 500
 * "Database error", и куратор видел сырой текст драйвера вместо причины.
 *
 * Пороги shared_products зеркалят миграции:
 *   scripts/db/migrations/2026-08-02_shared_products_sanity_constraints.sql —
 *     полная масса (БЖУ + клетчатка) ≤ 105 г;
 *   scripts/db/migrations/2026-09-03_shared_products_macro_mass_rule.sql —
 *     БЖУ без клетчатки ≤ 103 г (100 г сухого вещества + 3 г округления
 *     этикетки: 0.5 г на каждое из шести объявленных полей).
 * Числа здесь и в SQL должны меняться только вместе, иначе клиент и база
 * будут спорить о том, что именно нарушено.
 */

const MASS_LIMIT_G = 105;
const MACRO_LIMIT_G = 103;

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

function macroFromProductData(data) {
  if (!data || typeof data !== 'object') return null;
  return toNum(data.protein100)
    + toNum(data.simple100)
    + toNum(data.complex100)
    + toNum(data.badFat100 ?? data.badfat100)
    + toNum(data.goodFat100 ?? data.goodfat100);
}

function massFromProductData(data) {
  const macro = macroFromProductData(data);
  if (macro === null) return null;
  return macro + toNum(data.fiber100);
}

// Правило полной массы. Если БЖУ сами по себе умещаются в свой лимит, лишнее
// принесла клетчатка — на неё и указываем: это поле без перекрёстной проверки
// (даёт массу, но 0 ккал), и именно оно ломалось во всех разобранных карточках.
function massMessage(params) {
  const data = productDataFromParams(params);
  const grams = formatGrams(massFromProductData(data));
  const macro = macroFromProductData(data);
  const head = grams
    ? `Сумма белка, углеводов, жиров и клетчатки — ${grams} г на 100 г продукта`
    : `Сумма белка, углеводов, жиров и клетчатки больше ${MASS_LIMIT_G} г на 100 г продукта`;
  const culprit = macro !== null && macro <= MACRO_LIMIT_G
    ? 'БЖУ сами по себе в норме, лишнее принесла клетчатка. На этикетке её часто включают и в углеводы, а в протеиновых батончиках в неё записывают сахарные спирты — тогда масса считается дважды.'
    : 'На этикетке клетчатку часто включают и в углеводы — тогда сумма врёт.';
  return `${head} (лимит ${MASS_LIMIT_G} г, запас на округление). ${culprit} В 100 г продукта, кроме нутриентов, есть ещё вода и зола, поэтому сумма выше 100 г невозможна физически; урежь клетчатку или углеводы, иначе в общую базу не публикуется.`;
}

// Правило БЖУ без клетчатки: 100 г сухого вещества + 3 г на округление этикетки.
function macroMassMessage(params) {
  const grams = formatGrams(macroFromProductData(productDataFromParams(params)));
  const head = grams
    ? `Сумма белка, углеводов и жиров без клетчатки — ${grams} г на 100 г продукта`
    : `Сумма белка, углеводов и жиров без клетчатки больше ${MACRO_LIMIT_G} г на 100 г продукта`;
  return `${head} (лимит ${MACRO_LIMIT_G} г). Столько макронутриентов в 100 г не помещается: там же вода и зола. Обычная причина — задвоенные углеводы или завышенный жир; сверь значения с этикеткой.`;
}

const CONSTRAINT_MESSAGES = {
  shared_products_mass_within_100g: massMessage,
  shared_products_macro_mass_within_100g: macroMassMessage,
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
  MACRO_LIMIT_G,
  isCheckViolation,
  mapCheckViolation,
  massFromProductData,
  macroFromProductData,
  constraintName,
};
