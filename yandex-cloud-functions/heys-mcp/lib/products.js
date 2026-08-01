'use strict';

/**
 * Каталог продуктов: личный overlay клиента + общая база shared_products.
 *
 * Повторяет toMergedView/buildTypeAProduct из apps/web/heys_products_overlay_v1.js:
 *  - Type A (`shared_origin_id`) = строка shared-базы, поверх которой ложатся overrides;
 *  - Type B (`_custom`) = полностью собственный продукт клиента;
 *  - `in_my_list === false` — мягко удалённая строка, в выдачу не идёт.
 *
 * Поиск отдаёт приоритет продуктам самого клиента: куратор должен вносить еду
 * теми же позициями, которыми пользователь ведёт дневник, иначе в отчётах
 * появятся дубли одного и того же продукта.
 */

const OVERLAY_KEY = 'heys_products_overlay_v2';

/** shared_products приходит из REST с lowercase-колонками — приводим к схеме UI. */
const COLUMN_ALIASES = {
  badfat100: 'badFat100',
  goodfat100: 'goodFat100',
  kcal100: 'kcal100',
  nova_group: 'nova_group',
  nutrient_density: 'nutrient_density',
};

function normalizeSharedRow(row) {
  if (!row || typeof row !== 'object') return null;
  const out = { ...row };
  for (const [column, target] of Object.entries(COLUMN_ALIASES)) {
    if (out[column] !== undefined && out[target] === undefined) out[target] = out[column];
  }
  if (out.carbs100 === undefined) {
    out.carbs100 = (Number(out.simple100) || 0) + (Number(out.complex100) || 0);
  }
  if (out.fat100 === undefined) {
    out.fat100 = (Number(out.badFat100) || 0) + (Number(out.goodFat100) || 0) + (Number(out.trans100) || 0);
  }
  return out;
}

/** Строка без макронутриентов бесполезна для приёма пищи — её нельзя выбирать. */
function hasNutrients(row) {
  if (!row) return false;
  return ['protein100', 'carbs100', 'fat100', 'simple100', 'complex100', 'badFat100', 'goodFat100']
    .some((field) => Number(row[field]) > 0);
}

function buildTypeA(row, base) {
  return {
    ...base,
    ...(row.overrides || {}),
    id: row.id,
    shared_origin_id: row.shared_origin_id,
    fingerprint: row.fingerprint || base.fingerprint,
    user_modified: !!row.user_modified,
  };
}

/**
 * @param {Array} overlayRows строки из KV `heys_products_overlay_v2`
 * @param {Map<string, object>} sharedById индекс shared_products по id
 */
function buildCatalog(overlayRows, sharedById) {
  const own = [];
  const ownSharedOrigins = new Set();

  for (const row of Array.isArray(overlayRows) ? overlayRows : []) {
    if (!row || typeof row !== 'object') continue;
    if (row.in_my_list === false) continue;
    if (row._custom) {
      if (row.name) own.push({ ...row, _source: 'own' });
      continue;
    }
    if (!row.shared_origin_id) continue;
    const base = sharedById.get(String(row.shared_origin_id));
    if (!hasNutrients(base)) continue;
    ownSharedOrigins.add(String(row.shared_origin_id));
    own.push({ ...buildTypeA(row, base), _source: 'own' });
  }

  const shared = [];
  for (const [id, row] of sharedById.entries()) {
    if (ownSharedOrigins.has(String(id))) continue;
    if (!hasNutrients(row)) continue;
    shared.push({ ...row, shared_origin_id: id, _source: 'shared' });
  }

  return { own, shared, all: own.concat(shared) };
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Скоринг: точное совпадение → префикс → все слова запроса → подстрока.
 * Свои продукты получают надбавку, поэтому при равном тексте выигрывает
 * позиция из личного списка, а не её общий дубль.
 */
function scoreProduct(product, queryNorm, queryTokens) {
  const nameNorm = normalizeText(product.name);
  if (!nameNorm) return 0;

  let score = 0;
  if (nameNorm === queryNorm) score = 1000;
  else if (nameNorm.startsWith(queryNorm)) score = 600;
  else if (nameNorm.includes(queryNorm)) score = 400;
  else {
    const nameTokens = nameNorm.split(' ');
    const matched = queryTokens.filter((token) => nameTokens.some((nameToken) => nameToken.startsWith(token)));
    if (matched.length === 0) return 0;
    if (matched.length < queryTokens.length) {
      // Частичное совпадение принимаем только если найдено большинство слов —
      // иначе одно общее слово («кофе») вытаскивает десятки нерелевантных строк.
      if (matched.length * 2 <= queryTokens.length) return 0;
      score = 120 * (matched.length / queryTokens.length);
    } else {
      score = 300;
    }
  }

  if (product._source === 'own') score += 60;
  // Короткое имя при равном совпадении точнее длинного составного.
  score -= Math.min(40, nameNorm.length / 4);
  return score;
}

function searchProducts(catalog, query, limit = 10) {
  const queryNorm = normalizeText(query);
  if (!queryNorm) return [];
  const queryTokens = queryNorm.split(' ').filter(Boolean);

  return catalog.all
    .map((product) => ({ product, score: scoreProduct(product, queryNorm, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)))
    .map((entry) => entry.product);
}

function findById(catalog, productId) {
  const wanted = String(productId);
  return catalog.all.find((p) => String(p.id) === wanted)
    || catalog.all.find((p) => String(p.shared_origin_id || '') === wanted)
    || null;
}

/** Витрина продукта для модели: без нутриентного «шума», но с калорийностью. */
function describeProduct(product) {
  const kcal100 = Number(product.kcal100);
  const carbs = Number(product.carbs100) || ((Number(product.simple100) || 0) + (Number(product.complex100) || 0));
  const fat = Number(product.fat100) || ((Number(product.badFat100) || 0) + (Number(product.goodFat100) || 0) + (Number(product.trans100) || 0));
  return {
    product_id: product.id,
    name: product.name,
    source: product._source === 'own' ? 'мой список' : 'общая база',
    kcal100: Number.isFinite(kcal100) && kcal100 > 0
      ? Math.round(kcal100 * 10) / 10
      : Math.round((4 * (Number(product.protein100) || 0) + 4 * carbs + 9 * fat) * 10) / 10,
    protein100: Number(product.protein100) || 0,
    carbs100: Math.round(carbs * 10) / 10,
    fat100: Math.round(fat * 10) / 10,
    portions: Array.isArray(product.portions) && product.portions.length
      ? product.portions.map((p) => ({ name: p.name, grams: p.grams }))
      : undefined,
  };
}

/**
 * Числовые поля карточки продукта. Обязательные — те же 12, что требует
 * parseAIProductString в приложении (apps/web/heys_models_v1.js): без них
 * продукт не считается заполненным ни там, ни здесь.
 */
const REQUIRED_NUTRIENTS = [
  'protein100', 'simple100', 'complex100',
  'badFat100', 'goodFat100', 'trans100', 'fiber100', 'gi', 'harm',
];

const OPTIONAL_NUTRIENTS = [
  'carbs100', 'fat100', 'sodium100', 'cholesterol', 'omega3_100', 'omega6_100',
  'nova_group', 'nutrient_density',
  'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine',
  'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
  'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
];

const BOOLEAN_FLAGS = ['is_organic', 'is_whole_grain', 'is_fermented', 'is_raw'];

/** Та же нормализация, что normalizeBarcode в apps/web/heys_add_product_step_v1.js. */
function normalizeBarcode(value) {
  const cleaned = String(value == null ? '' : value)
    .trim()
    .replace(/[\s-]+/g, '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  return cleaned.length >= 6 && cleaned.length <= 32 ? cleaned : '';
}

/** Та же нормализация, что normalizePortions: имя непустое, граммы больше нуля. */
function normalizePortions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => ({ name: String((p && p.name) || '').trim(), grams: Number((p && p.grams) || 0) }))
    .filter((p) => p.name && p.grams > 0);
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

/**
 * Собирает строку личного продукта (Type B) в том же виде, что кладёт
 * приложение: kcal100 всегда пересчитывается по NET Atwater, а не берётся
 * с упаковки — иначе дневник считал бы этот продукт не так, как остальные.
 */
function buildCustomProduct(input, { nowMs, makeId }) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('product_name_required');

  const missing = REQUIRED_NUTRIENTS.filter((field) => !Number.isFinite(Number(input[field])));
  if (missing.length) {
    const err = new Error('product_fields_missing');
    err.missing = missing;
    throw err;
  }

  const row = { id: makeId(), _custom: true, in_my_list: true, user_modified: true, name };

  for (const field of REQUIRED_NUTRIENTS) row[field] = Number(input[field]);
  for (const field of OPTIONAL_NUTRIENTS) {
    if (input[field] !== undefined && input[field] !== null && Number.isFinite(Number(input[field]))) {
      row[field] = Number(input[field]);
    }
  }
  for (const field of BOOLEAN_FLAGS) {
    if (input[field] !== undefined && input[field] !== null) row[field] = !!input[field];
  }
  if (Array.isArray(input.additives)) {
    row.additives = input.additives.map((a) => String(a).trim().toUpperCase()).filter(Boolean);
  }

  const carbs = Number.isFinite(Number(input.carbs100)) && Number(input.carbs100) > 0
    ? Number(input.carbs100)
    : row.simple100 + row.complex100;
  const fat = Number.isFinite(Number(input.fat100)) && Number(input.fat100) > 0
    ? Number(input.fat100)
    : row.badFat100 + row.goodFat100 + row.trans100;

  row.carbs100 = round1(carbs);
  row.fat100 = round1(fat);
  row.kcal100 = round1(3 * row.protein100 + 4 * carbs + 9 * fat);

  const brand = String(input.brand || '').trim().replace(/\s+/g, ' ');
  row.brand = brand && !['нет', 'no', 'none', '-', '—'].includes(brand.toLowerCase()) ? brand : null;

  const barcode = normalizeBarcode(input.barcode);
  row.barcode = barcode || null;
  row.barcodes = barcode ? [barcode] : [];

  const portions = normalizePortions(input.portions);
  if (portions.length) row.portions = portions;

  row.createdAt = nowMs;
  row.updatedAt = nowMs;
  return row;
}

module.exports = {
  OVERLAY_KEY,
  REQUIRED_NUTRIENTS,
  OPTIONAL_NUTRIENTS,
  BOOLEAN_FLAGS,
  normalizeBarcode,
  normalizePortions,
  buildCustomProduct,
  normalizeSharedRow,
  hasNutrients,
  buildCatalog,
  normalizeText,
  scoreProduct,
  searchProducts,
  findById,
  describeProduct,
};
