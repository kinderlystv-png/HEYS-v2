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

module.exports = {
  OVERLAY_KEY,
  normalizeSharedRow,
  hasNutrients,
  buildCatalog,
  normalizeText,
  scoreProduct,
  searchProducts,
  findById,
  describeProduct,
};
