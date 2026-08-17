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

const crypto = require('node:crypto');
const { computeTefKcal100 } = require('./day');

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
 * Бренды живут в двух написаниях сразу: в базе продукт заведён как «Toffifee»,
 * а пользователь пишет «тоффифи». Поэтому запрос сравнивается с названием во
 * всех написаниях, а не только в том, которым его набрали.
 */
const CYRILLIC_TO_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Порядок важен: диграфы разбираются раньше одиночных букв. */
const LATIN_TO_CYRILLIC = [
  ['sch', 'щ'], ['zh', 'ж'], ['ch', 'ч'], ['sh', 'ш'], ['yu', 'ю'], ['ya', 'я'],
  ['a', 'а'], ['b', 'б'], ['c', 'к'], ['d', 'д'], ['e', 'е'], ['f', 'ф'],
  ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'дж'], ['k', 'к'], ['l', 'л'],
  ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['q', 'к'], ['r', 'р'],
  ['s', 'с'], ['t', 'т'], ['u', 'у'], ['v', 'в'], ['w', 'в'], ['x', 'кс'],
  ['y', 'й'], ['z', 'з'],
];

function toLatin(text) {
  let out = '';
  for (const char of text) out += (CYRILLIC_TO_LATIN[char] !== undefined ? CYRILLIC_TO_LATIN[char] : char);
  return out;
}

function toCyrillic(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const hit = LATIN_TO_CYRILLIC.find(([latin]) => rest.startsWith(latin));
    if (hit) {
      out += hit[1];
      i += hit[0].length;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

/** Расстояние Левенштейна с ранним выходом: дальше порога считать незачем. */
function withinDistance(a, b, max) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

function commonPrefixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Одна основа при разных окончаниях: «яйца»/«яйцо», «твердого»/«твёрдый».
 * Русский словоформы различает именно хвостом, поэтому дешёвый стемминг без
 * словаря даёт больше, чем расстояние Левенштейна: оно на коротких словах
 * пришлось бы делать таким щедрым, что «вода» слилась бы с «водкой».
 *
 * Отсюда два порога вместо одного: длинным словам прощаем окончание до трёх
 * букв, коротким — только одну. «вода»/«водка» отсекается тем, что расхождение
 * несимметрично (1 против 2) и начинается слишком рано.
 */
function sameStem(a, b) {
  if (a === b) return true;
  const prefix = commonPrefixLength(a, b);
  const tailA = a.length - prefix;
  const tailB = b.length - prefix;
  if (prefix >= 4 && tailA <= 3 && tailB <= 3) return true;
  if (prefix >= 3 && tailA <= 1 && tailB <= 1) return true;
  return false;
}

/**
 * Слово запроса против слова названия. Порядок проверок — от точного к
 * вольному: префикс (в обе стороны, потому что «сыра» длиннее «сыр»), одна
 * основа, и лишь потом опечатка. Опечатка допускается только внутри слова при
 * совпадающем начале — иначе «сахар» и «кагор» стали бы одним продуктом.
 */
function tokenMatches(nameToken, queryToken) {
  if (nameToken.startsWith(queryToken)) return 1;
  // Запрос длиннее названия: «сыра» → «Сыр», «молока» → «Молоко 2,5».
  if (queryToken.length > nameToken.length && queryToken.startsWith(nameToken) && nameToken.length >= 3) return 1;
  if (sameStem(nameToken, queryToken)) return 0.95;
  const length = queryToken.length;
  if (length < 5) return 0;
  if (nameToken.slice(0, 3) !== queryToken.slice(0, 3)) return 0;
  return withinDistance(nameToken, queryToken, length >= 7 ? 2 : 1) ? 0.8 : 0;
}

function uniq(values) {
  const out = [];
  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/**
 * Запрос во всех написаниях. Написания хранятся и целиком (для совпадения по
 * фразе), и отдельно по словам: в «конфеты тоффифи» латиницей стоит искать
 * только второе слово, а транслитерация всей строки сломала бы первое.
 * Первый вариант в каждом списке — то, что действительно набрал пользователь.
 */
function prepareQuery(query) {
  const norm = normalizeText(query);
  if (!norm) return null;
  return {
    norm,
    phrases: uniq([norm, toLatin(norm), toCyrillic(norm)]),
    tokens: norm.split(' ').filter(Boolean).map((token) => uniq([token, toLatin(token), toCyrillic(token)])),
  };
}

/**
 * Скоринг: точное совпадение → префикс → подстрока → слова запроса.
 * Свои продукты получают надбавку, поэтому при равном тексте выигрывает
 * позиция из личного списка, а не её общий дубль.
 */
function scoreProduct(product, prepared) {
  const nameNorm = normalizeText(product.name);
  if (!nameNorm || !prepared) return 0;

  // Штрихкод с этикетки: точное совпадение важнее имени — иначе модель
  // прочитает EAN и всё равно уйдёт в неоднозначный поиск по бренду.
  const barcodeQuery = normalizeBarcode(prepared.norm);
  if (barcodeQuery) {
    const codes = [];
    if (product.barcode) codes.push(String(product.barcode));
    if (Array.isArray(product.barcodes)) {
      for (const code of product.barcodes) {
        if (code) codes.push(String(code));
      }
    }
    if (codes.some((code) => normalizeBarcode(code) === barcodeQuery)) return 2000;
  }

  let score = 0;
  prepared.phrases.forEach((phrase, index) => {
    let value = 0;
    if (nameNorm === phrase) value = 1000;
    else if (nameNorm.startsWith(phrase)) value = 600;
    // Подстрока засчитывается только с границы слова: иначе «сок» вытаскивает
    // «Сахар-песок», а «мясо» — «Мясо» внутри любого составного слова.
    else {
      const at = nameNorm.indexOf(` ${phrase}`);
      if (at >= 0) {
        // Чем глубже слово в названии, тем вероятнее это перечисление состава,
        // а не сам продукт: «овсянка» в «Пирог зелёная гречка овсянка
        // сухофрукты яйцо протеин» — ингредиент, и он не должен обходить
        // «Овсяные хлопья», где то же слово стоит первым.
        const wordIndex = nameNorm.slice(0, at + 1).split(' ').length - 1;
        value = wordIndex <= 1 ? 400 : 260;
      }
    }
    // Транслитерация — догадка, а не то, что написал пользователь: чуть дешевле.
    if (index > 0) value *= 0.9;
    if (value > score) score = value;
  });

  if (score === 0 && prepared.tokens.length) {
    const nameTokens = nameNorm.split(' ');
    let matched = 0;
    for (const forms of prepared.tokens) {
      let best = 0;
      forms.forEach((form, index) => {
        for (const nameToken of nameTokens) {
          const hit = tokenMatches(nameToken, form) * (index === 0 ? 1 : 0.9);
          if (hit > best) best = hit;
        }
      });
      matched += best;
    }
    // Частичное совпадение принимаем только если найдено большинство слов —
    // иначе одно общее слово («кофе») вытаскивает десятки нерелевантных строк.
    if (matched > 0 && matched * 2 > prepared.tokens.length) {
      // Морфологическая форма — то же слово, а не половина совпадения.
      // «овсянка» против «овсяные» даёт 0.95, и строгое сравнение роняло такой
      // матч со трёхсот до ста с небольшим — ниже любого вхождения в середину
      // составного названия.
      const full = matched >= prepared.tokens.length * 0.9;
      score = full ? 300 : 120 * (matched / prepared.tokens.length);
    }
  }

  if (score <= 0) return 0;

  if (product._source === 'own') score += 60;
  // Короткое имя при равном совпадении точнее длинного составного.
  score -= Math.min(40, nameNorm.length / 4);
  return score;
}

function searchProducts(catalog, query, limit = 10) {
  const prepared = prepareQuery(query);
  if (!prepared) return [];

  return catalog.all
    .map((product) => ({ product, score: scoreProduct(product, prepared) }))
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

/**
 * Вес одной штуки из типовых порций продукта. «4 конфетки» превращаются в
 * граммы только здесь: своей константы у инструмента нет и быть не должно —
 * вес штуки берётся из карточки, которую заполнил пользователь.
 * Порция вида «2 шт» тоже годится: делим на количество из названия.
 */
function pieceGrams(product) {
  const portions = Array.isArray(product && product.portions) ? product.portions : [];
  let best = null;
  for (const portion of portions) {
    const grams = Number(portion && portion.grams);
    if (!Number.isFinite(grams) || grams <= 0) continue;
    const match = /(?:^|\s)(\d+)?\s*(?:шт|штук|штуки|штука|pcs|pc)(?:\s|$)/.exec(normalizeText(portion.name));
    if (!match) continue;
    const perPiece = grams / (Number(match[1]) || 1);
    if (best === null || perPiece < best) best = perPiece;
  }
  return best === null ? null : Math.round(best * 10) / 10;
}

/** Витрина продукта для модели: без нутриентного «шума», но с калорийностью. */
function describeProduct(product) {
  const carbs = Number(product.carbs100) || ((Number(product.simple100) || 0) + (Number(product.complex100) || 0));
  const fat = Number(product.fat100) || ((Number(product.badFat100) || 0) + (Number(product.goodFat100) || 0) + (Number(product.trans100) || 0));
  // Всегда NET Atwater (как день/позиция приёма), не сырой kcal100 из карточки
  // и не классический 4×Б — иначе поиск и дневник расходятся на глазах куратора.
  return {
    product_id: product.id,
    name: product.name,
    source: product._source === 'own' ? 'мой список' : 'общая база',
    kcal100: computeTefKcal100(product),
    protein100: Number(product.protein100) || 0,
    carbs100: Math.round(carbs * 10) / 10,
    fat100: Math.round(fat * 10) / 10,
    barcode: product.barcode || undefined,
    portions: Array.isArray(product.portions) && product.portions.length
      ? product.portions.map((p) => ({ name: p.name, grams: p.grams }))
      : undefined,
    piece_grams: pieceGrams(product) ?? undefined,
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

/**
 * Отпечаток продукта: `sha256(имя::нутриенты)`.
 *
 * Повторяет computeProductFingerprint из apps/web/heys_models_v1.js побайтово —
 * порядок полей, округление до одного знака и разделители менять нельзя. По
 * этому отпечатку общая база отсекает дубликаты и связывает личные карточки с
 * каталогом: разойтись здесь значит завести второй продукт там, где должен был
 * найтись существующий.
 */
function fingerprintNutrientsPart(product) {
  return [
    round1(Number(product.simple100) || 0),
    round1(Number(product.complex100) || 0),
    round1(Number(product.protein100) || 0),
    round1(Number(product.badFat100) || 0),
    round1(Number(product.goodFat100) || 0),
    round1(Number(product.trans100) || 0),
    round1(Number(product.fiber100) || 0),
    round1(Number(product.gi) || 0),
    round1(Number(product.harm) || 0),
  ].join('|');
}

function normalizeFingerprintText(value) {
  return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function computeProductFingerprint(product) {
  if (!product) return '';
  const combined = `${normalizeFingerprintText(product.name)}::${fingerprintNutrientsPart(product)}`;
  return crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
}

/** Отпечаток с брендом — пустой, если бренда нет: так же ведёт себя приложение. */
function computeProductBrandFingerprint(product) {
  if (!product) return '';
  const brandPart = normalizeFingerprintText(product.brand);
  if (!brandPart) return '';
  const combined = `${normalizeFingerprintText(product.name)}::${brandPart}::${fingerprintNutrientsPart(product)}`;
  return crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
}

/**
 * Похож ли продукт на промышленный. Бренд или штрихкод — признак того, что
 * такую же упаковку купит и другой клиент, значит карточке место в общей базе.
 * Домашнее блюдо этих признаков не имеет, и в общий каталог ему не нужно:
 * состав у него уникальный, дедупликация его не отсечёт, а пользы другим от
 * «Торта маминого» нет.
 */
function looksIndustrial(product) {
  return !!(product && (product.brand || product.barcode));
}

/** Поля, которые разрешено править в личной карточке продукта. */
const EDITABLE_FIELDS = ['name', 'brand', 'barcode', 'portions']
  .concat(REQUIRED_NUTRIENTS)
  .concat(OPTIONAL_NUTRIENTS)
  .concat(BOOLEAN_FLAGS)
  .concat(['additives']);

/**
 * Патч карточки продукта.
 *
 * Возвращает `patch` — только изменённые поля, и `changed` — их человеческое
 * описание. Патч сознательно не собирает карточку заново: у Type A строки
 * собственных полей нет вовсе, есть только `overrides` поверх общей базы, и
 * пересборка превратила бы ссылку в копию, которая перестанет получать правки
 * общей базы.
 *
 * @param {object} current объединённая карточка продукта (как её видит поиск)
 * @param {object} input поля из аргументов инструмента
 */
function buildProductPatch(current, input, nowMs) {
  const patch = {};
  const changed = [];
  const ignored = [];

  for (const [key, raw] of Object.entries(input || {})) {
    if (raw === undefined || raw === null || raw === '') continue;
    if (!EDITABLE_FIELDS.includes(key)) {
      ignored.push(key);
      continue;
    }

    if (key === 'name') {
      const name = String(raw).trim();
      if (!name) throw new Error('invalid_name');
      if (name === current.name) continue;
      patch.name = name;
      changed.push(`название: «${current.name}» → «${name}»`);
      continue;
    }
    if (key === 'brand') {
      const brand = String(raw).trim().replace(/\s+/g, ' ');
      const next = ['нет', 'no', 'none', '-', '—'].includes(brand.toLowerCase()) ? null : brand;
      if (next === (current.brand || null)) continue;
      patch.brand = next;
      changed.push(`бренд: ${next || '—'}`);
      continue;
    }
    if (key === 'barcode') {
      const barcode = normalizeBarcode(raw);
      if (!barcode) throw new Error('invalid_barcode');
      if (barcode === current.barcode) continue;
      patch.barcode = barcode;
      const known = Array.isArray(current.barcodes) ? current.barcodes.filter(Boolean) : [];
      patch.barcodes = known.includes(barcode) ? known : [...known, barcode];
      changed.push(`штрихкод: ${barcode}`);
      continue;
    }
    if (key === 'portions') {
      const portions = normalizePortions(raw);
      if (!portions.length) throw new Error('invalid_portions');
      patch.portions = portions;
      changed.push(`порции: ${portions.map((p) => `${p.name} ${p.grams} г`).join(', ')}`);
      continue;
    }
    if (key === 'additives') {
      if (!Array.isArray(raw)) throw new Error('invalid_additives');
      patch.additives = raw.map((a) => String(a).trim().toUpperCase()).filter(Boolean);
      changed.push(`добавки: ${patch.additives.join(', ') || '—'}`);
      continue;
    }
    if (BOOLEAN_FLAGS.includes(key)) {
      const next = !!raw;
      if (next === !!current[key]) continue;
      patch[key] = next;
      changed.push(`${key}: ${next ? 'да' : 'нет'}`);
      continue;
    }

    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) throw new Error(`invalid_number:${key}`);
    if (num === Number(current[key])) continue;
    patch[key] = num;
    changed.push(`${key}: ${current[key] ?? '—'} → ${num}`);
  }

  if (!changed.length) return { patch: {}, changed, ignored };

  // Калорийность и суммарные макросы — производные: если поменялась любая
  // составляющая, пересчитываем их здесь, иначе карточка разъедется с
  // приёмами, которые считаются по kcal100.
  const merged = { ...current, ...patch };
  const touchesMacros = Object.keys(patch).some((key) => REQUIRED_NUTRIENTS.includes(key)
    || ['carbs100', 'fat100'].includes(key));
  if (touchesMacros) {
    const carbs = patch.carbs100 !== undefined
      ? Number(patch.carbs100)
      : (Number(merged.simple100) || 0) + (Number(merged.complex100) || 0);
    const fat = patch.fat100 !== undefined
      ? Number(patch.fat100)
      : (Number(merged.badFat100) || 0) + (Number(merged.goodFat100) || 0) + (Number(merged.trans100) || 0);
    patch.carbs100 = round1(carbs);
    patch.fat100 = round1(fat);
    patch.kcal100 = round1(3 * (Number(merged.protein100) || 0) + 4 * carbs + 9 * fat);
    changed.push(`калорийность: ${current.kcal100 ?? '—'} → ${patch.kcal100} ккал/100 г`);
  }
  patch.updatedAt = nowMs;
  return { patch, changed, ignored };
}

/**
 * Строка overlay для правки продукта.
 *
 * Три случая, и различать их обязательно:
 *  - своя карточка (`_custom`) — поля правятся прямо в строке;
 *  - Type A (ссылка на общую базу) — правка ложится в `overrides`, сама общая
 *    строка остаётся нетронутой;
 *  - продукт только из общей базы — заводится Type A строка с overrides, ровно
 *    как это делает приложение, когда пользователь правит чужой продукт «под
 *    себя». Копия общей карточки при этом не создаётся.
 */
function applyProductPatchToOverlay(overlayRows, product, patch, { nowMs, makeId }) {
  const rows = Array.isArray(overlayRows) ? [...overlayRows] : [];
  const productId = String(product.id);
  const index = rows.findIndex((r) => r && String(r.id) === productId);

  if (index >= 0 && rows[index]._custom) {
    rows[index] = { ...rows[index], ...patch, user_modified: true };
    return { rows, mode: 'custom' };
  }
  if (index >= 0) {
    rows[index] = {
      ...rows[index],
      overrides: { ...(rows[index].overrides || {}), ...patch },
      user_modified: true,
      updatedAt: nowMs,
    };
    return { rows, mode: 'override' };
  }

  const sharedId = product.shared_origin_id || product.id;
  rows.push({
    id: makeId(),
    shared_origin_id: String(sharedId),
    fingerprint: product.fingerprint || null,
    overrides: { ...patch },
    in_my_list: true,
    user_modified: true,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return { rows, mode: 'linked' };
}

module.exports = {
  OVERLAY_KEY,
  EDITABLE_FIELDS,
  buildProductPatch,
  applyProductPatchToOverlay,
  computeProductFingerprint,
  computeProductBrandFingerprint,
  looksIndustrial,
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
  toLatin,
  toCyrillic,
  prepareQuery,
  scoreProduct,
  searchProducts,
  findById,
  pieceGrams,
  describeProduct,
};
