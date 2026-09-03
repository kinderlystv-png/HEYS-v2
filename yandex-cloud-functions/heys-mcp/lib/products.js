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
const OVERLAY_MANIFEST_KEY = 'heys_products_overlay_v2_rpc_manifest';
const OVERLAY_TAIL_KEY_PREFIX = 'heys_products_overlay_v2_rpc_tail_';
const MAX_OVERLAY_TAIL_SHARDS = 16;
const OVERLAY_SHARD_TARGET_BYTES = 42 * 1024;
const AGGREGATE_COMPOSITION_TOLERANCE = 0.05;

// Кодек — байт-в-байт зеркало apps/web/heys_overlay_shard_codec_v1.js, расхождение
// ловит cmp в test-functions.sh. Модуль вешает api на globalThis.HEYS, а в
// CommonJS ещё и в module.exports; берём то, что доступно.
const overlayCodec = require('../shared/overlay-shard-codec.js').createSingle
  ? require('../shared/overlay-shard-codec.js')
  : globalThis.HEYS.OverlayShardCodec;

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
  const tokens = norm.split(' ').filter(Boolean);
  const phrases = uniq([norm, toLatin(norm), toCyrillic(norm)]);
  // Инверсия соседних слов запроса: «масло подсолнечное» = «подсолнечное масло»
  // на ярусе prefix. Только полная перестановка, не «все токены где угодно».
  if (tokens.length === 2) {
    const inverted = `${tokens[1]} ${tokens[0]}`;
    phrases.push(...uniq([inverted, toLatin(inverted), toCyrillic(inverted)]));
  }
  return {
    norm,
    phrases,
    tokens: tokens.map((token) => uniq([token, toLatin(token), toCyrillic(token)])),
  };
}

function macroNum(row, camelKey, lowerKey) {
  if (!row || typeof row !== 'object') return 0;
  const raw = row[camelKey] != null ? row[camelKey] : row[lowerKey];
  const num = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
}

function aggregateMacros(row) {
  const protein = macroNum(row, 'protein100', 'protein100');
  const carbs = macroNum(row, 'carbs100', 'carbs100')
    || macroNum(row, 'simple100', 'simple100') + macroNum(row, 'complex100', 'complex100');
  const fat = macroNum(row, 'fat100', 'fat100')
    || macroNum(row, 'badFat100', 'badfat100')
    + macroNum(row, 'goodFat100', 'goodfat100')
    + macroNum(row, 'trans100', 'trans100');
  return { protein, carbs, fat };
}

function sameAggregateComposition(a, b, tolerance = AGGREGATE_COMPOSITION_TOLERANCE) {
  const ma = aggregateMacros(a);
  const mb = aggregateMacros(b);
  return Math.abs(ma.protein - mb.protein) <= tolerance
    && Math.abs(ma.carbs - mb.carbs) <= tolerance
    && Math.abs(ma.fat - mb.fat) <= tolerance;
}

/** Среди кандидатов одного запроса: own с тем же именем и агрегатами важнее shared. */
function preferOwnOverMatchingShared(matches) {
  const owns = matches.filter((m) => m && m._source === 'own');
  if (!owns.length) return matches;
  const dropIds = new Set();
  for (const own of owns) {
    const ownName = normalizeText(own.name);
    for (const m of matches) {
      if (!m || m._source !== 'shared') continue;
      if (normalizeText(m.name) !== ownName) continue;
      if (sameAggregateComposition(own, m)) dropIds.add(String(m.id));
    }
  }
  if (!dropIds.size) return matches;
  return matches.filter((m) => m && !dropIds.has(String(m.id)));
}

function nameQueryCoverage(product, prepared) {
  const nameTokens = normalizeText(product && product.name).split(' ').filter(Boolean);
  if (!nameTokens.length || !prepared || !prepared.tokens.length) {
    return { matched: 0, queryTokens: prepared ? prepared.tokens.length : 0, nameTokens: nameTokens.length, ratio: 0 };
  }
  let matched = 0;
  for (const forms of prepared.tokens) {
    let best = 0;
    forms.forEach((form) => {
      for (const nameToken of nameTokens) {
        best = Math.max(best, tokenMatches(nameToken, form));
      }
    });
    if (best >= 0.8) matched += 1;
  }
  const ratio = nameTokens.length ? matched / nameTokens.length : 0;
  return { matched, queryTokens: prepared.tokens.length, nameTokens: nameTokens.length, ratio };
}

function applyCoverageAdjustment(score, coverage) {
  if (!coverage || score <= 0) return score;
  const unmatchedName = Math.max(0, coverage.nameTokens - coverage.matched);
  return score + coverage.matched * 35 - unmatchedName * 18;
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
  return applyCoverageAdjustment(score, nameQueryCoverage(product, prepared));
}

/**
 * Выбор однозначного продукта из кандидатов поиска — общий для resolve и рецептов.
 * Возвращает { ok:true, product } или { ok:false, code:'ambiguous_product'|'not_found', candidates? }.
 */
function pickSearchMatch(query, matches) {
  const list = preferOwnOverMatchingShared(Array.isArray(matches) ? matches : []);
  if (!list.length) return { ok: false, code: 'not_found' };
  const prepared = prepareQuery(query);
  if (!prepared) return { ok: false, code: 'not_found' };

  const scored = list.map((product) => ({
    product,
    score: scoreProduct(product, prepared),
    coverage: nameQueryCoverage(product, prepared),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  const soleOwnMatch = scored.length === 1 && best.product._source === 'own' && best.score > 0;
  const wanted = normalizeText(query);
  const exactOwn = scored.filter((s) => s.product._source === 'own'
    && normalizeText(s.product.name) === wanted);
  const soleExactOwn = exactOwn.length === 1;
  if (soleExactOwn) return { ok: true, product: exactOwn[0].product };
  if (soleOwnMatch) return { ok: true, product: best.product };

  const gapOk = !second || best.score >= second.score * 1.25;
  if (best.score >= 400 && gapOk) return { ok: true, product: best.product };

  if (best.score >= 400 && second && second.score >= 400) {
    const betterCoverage = best.coverage.ratio > second.coverage.ratio + 0.01
      || (Math.abs(best.coverage.ratio - second.coverage.ratio) <= 0.01
        && best.coverage.nameTokens < second.coverage.nameTokens);
    if (betterCoverage) return { ok: true, product: best.product };
  }

  if (scored.length === 1 && best.score >= 400) return { ok: true, product: best.product };

  if (best.score <= 0) return { ok: false, code: 'not_found' };

  return { ok: false, code: 'ambiguous_product', candidates: scored.slice(0, 5).map((s) => s.product) };
}

/**
 * Похожесть на случай, когда точный скоринг не нашёл ничего.
 *
 * Повод (22.08.2026): «ареон» не находил «Орион» — в `tokenMatches` опечатка
 * допускается только при совпадающих первых трёх буквах, а тут разъехались
 * ровно гласные. Ноль результатов стоил куратору восьми кругов разведки
 * (`tasks_mcp_trace` 13:28: 11 вызовов, 229 с, из них сервер 5 с).
 *
 * Две меры вместо одной, потому что и промахи бывают двух видов:
 * 1. Триграммы (коэффициент Дайса) — обычные опечатки и лишние/пропущенные
 *    буквы: «гречьнивая» → «гречневая».
 * 2. Скелет согласных — ошибки распознавания речи. Они почти всегда в гласных,
 *    согласные выживают: «ареон» и «орион» дают один скелет «рн».
 *
 * Обе — только как fallback при пустой выдаче: на непустом поиске такая
 * вольность тащила бы мусор в нормальные ответы.
 */
const VOWELS_RE = /[аеиоуыэюяaeiouy]/g;

function consonantSkeleton(token) {
  return String(token || '').replace(VOWELS_RE, '');
}

function trigrams(token) {
  const padded = ` ${token} `;
  const out = new Set();
  for (let i = 0; i + 3 <= padded.length; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}

/** Коэффициент Дайса по триграммам: 0 — ничего общего, 1 — совпали. */
function trigramSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  for (const gram of ta) if (tb.has(gram)) shared += 1;
  return (2 * shared) / (ta.size + tb.size);
}

/**
 * Насколько слово запроса похоже на слово названия. Порог и ограничение длины
 * держат ложные срабатывания: «сок» и «сыр» дают один скелет «с-р»/«с-к», но
 * трёхбуквенные слова сюда не попадают вовсе.
 */
function fuzzyTokenSimilarity(nameToken, queryToken) {
  if (!nameToken || !queryToken) return 0;
  if (queryToken.length < 4 || nameToken.length < 4) return 0;
  const longer = Math.max(nameToken.length, queryToken.length);
  if (Math.abs(nameToken.length - queryToken.length) > Math.ceil(longer * 0.4)) return 0;

  const trigram = trigramSimilarity(nameToken, queryToken);
  if (trigram >= 0.5) return trigram;

  // Скелет согласных: ASR-искажение. Требуем не короче двух согласных —
  // иначе «ария» и «урюк» схлопнулись бы в одно.
  const skeletonName = consonantSkeleton(nameToken);
  const skeletonQuery = consonantSkeleton(queryToken);
  if (skeletonQuery.length >= 2 && skeletonName === skeletonQuery) return 0.75;
  // Один промах в скелете при длинном слове — тоже распознавание («шаварма»).
  if (skeletonQuery.length >= 4 && withinDistance(skeletonName, skeletonQuery, 1)) return 0.6;

  return 0;
}

/**
 * Похожесть продукта на запрос: среднее по словам запроса, каждое — лучшим
 * словом названия. Возвращает 0..1; вызывающий решает, что делать с порогом.
 */
function fuzzyProductSimilarity(product, prepared) {
  const nameNorm = normalizeText(product && product.name);
  if (!nameNorm || !prepared || !prepared.tokens.length) return 0;
  const nameTokens = nameNorm.split(' ').filter(Boolean);
  if (!nameTokens.length) return 0;

  let total = 0;
  for (const forms of prepared.tokens) {
    let best = 0;
    for (const form of forms) {
      for (const nameToken of nameTokens) {
        const sim = fuzzyTokenSimilarity(nameToken, form);
        if (sim > best) best = sim;
      }
    }
    total += best;
  }
  return total / prepared.tokens.length;
}

const FUZZY_MIN_SIMILARITY = 0.5;

/**
 * Похожие продукты, когда точный поиск пуст. Возвращает копии строк с пометкой
 * `_fuzzy` — сам каталог не трогаем, он кэшируется на инстансе.
 */
function fuzzySearchProducts(catalog, query, limit = 5) {
  const prepared = prepareQuery(query);
  if (!prepared) return [];
  return (catalog.all || [])
    .map((product) => ({ product, similarity: fuzzyProductSimilarity(product, prepared) }))
    .filter((entry) => entry.similarity >= FUZZY_MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 5)))
    .map((entry) => ({ ...entry.product, _fuzzy: Math.round(entry.similarity * 100) / 100 }));
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

/**
 * Сила совпадения без own-надбавки: по ней решаем, лезть ли в списки
 * других клиентов куратора. «Крабовый» внутри «Салат крабовый классический» —
 * точное вхождение фразы. «Крабовый салат пп» против того же классического —
 * токен «пп» не покрыт, это слабое совпадение.
 */
function matchStrength(product, prepared) {
  const nameNorm = normalizeText(product && product.name);
  if (!nameNorm || !prepared) return 'none';

  for (const phrase of prepared.phrases) {
    if (!phrase) continue;
    if (nameNorm === phrase || nameNorm.startsWith(phrase) || nameNorm.includes(` ${phrase}`)) {
      return 'strong';
    }
  }

  if (!prepared.tokens.length) return 'none';
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
  if (!(matched > 0 && matched * 2 > prepared.tokens.length)) return 'none';
  return matched >= prepared.tokens.length * 0.9 ? 'strong' : 'weak';
}

function hasStrongMatch(catalog, query) {
  const prepared = prepareQuery(query);
  if (!prepared) return false;
  const list = catalog && Array.isArray(catalog.all) ? catalog.all : [];
  return list.some((product) => matchStrength(product, prepared) === 'strong');
}

/** own → peer → shared, без повторных id. Порядок внутри слоя — как пришёл из поиска. */
function mergeSearchLayers({ own = [], peer = [], shared = [], limit = 10 } = {}) {
  const seen = new Set();
  const out = [];
  const cap = Math.max(1, Math.min(50, Number(limit) || 10));
  for (const product of [...own, ...peer, ...shared]) {
    if (!product || product.id == null) continue;
    const id = String(product.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(product);
    if (out.length >= cap) break;
  }
  return out;
}

/** Type A / строка общей базы: клон с тем же именем бессмыслен — продукт уже доступен. */
function isSharedLinked(product) {
  if (!product || product._custom) return false;
  return !!(product.shared_origin_id || product._source === 'shared');
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
    source: product._source === 'own'
      ? 'мой список'
      : product._source === 'peer'
        ? `список ${product._owner_name || 'другого клиента'}`
        : 'общая база',
    writable: product._source !== 'peer',
    kcal100: computeTefKcal100(product),
    protein100: Number(product.protein100) || 0,
    carbs100: Math.round(carbs * 10) / 10,
    fat100: Math.round(fat * 10) / 10,
    barcode: product.barcode || undefined,
    portions: Array.isArray(product.portions) && product.portions.length
      ? product.portions.map((p) => ({ name: p.name, grams: p.grams }))
      : undefined,
    piece_grams: pieceGrams(product) ?? undefined,
    has_recipe: !!(product.recipe && Array.isArray(product.recipe.items) && product.recipe.items.length) || undefined,
    recipe_rev: product.recipe && Number(product.recipe.rev) > 0 ? Number(product.recipe.rev) : undefined,
    yield_grams: product.recipe && Number(product.recipe.yield_grams) > 0
      ? Number(product.recipe.yield_grams)
      : undefined,
    recipe_summary: formatRecipeSummary(product.recipe) || undefined,
    ...(product._source === 'peer' ? {
      owner_client_id: product._owner_client_id || undefined,
      owner_client_name: product._owner_name || undefined,
    } : {}),
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

const RECIPE_MASS_FIELDS = [
  'protein100', 'simple100', 'complex100',
  'badFat100', 'goodFat100', 'trans100', 'fiber100',
  'sodium100', 'cholesterol', 'omega3_100', 'omega6_100',
  'nutrient_density',
  'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine',
  'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
  'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
];

function recipeError(code, extra) {
  const err = new Error(code);
  err.code = code;
  if (extra) Object.assign(err, extra);
  return err;
}

function normalizeRecipe(recipe, { nowMs, previousRev = 0 } = {}) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
    throw recipeError('invalid_recipe');
  }
  const yieldGrams = Number(recipe.yield_grams);
  if (!(yieldGrams > 0) || yieldGrams > 50000) {
    throw recipeError('invalid_recipe_yield');
  }
  const rawItems = Array.isArray(recipe.items) ? recipe.items : [];
  if (!rawItems.length) throw recipeError('recipe_items_empty');
  if (rawItems.length > 40) throw recipeError('recipe_items_too_many');

  const items = rawItems.map((item, index) => {
    const grams = Number(item && item.grams);
    if (!(grams > 0) || grams > 50000) {
      throw recipeError('invalid_recipe_item_grams', { index });
    }
    const productId = item && item.product_id != null ? String(item.product_id).trim() : '';
    const name = String((item && item.name) || '').trim();
    return {
      product_id: productId || undefined,
      query: !productId && item && item.query ? String(item.query).trim() : undefined,
      name,
      grams: round1(grams),
    };
  });

  const prev = Number(previousRev);
  const rev = Number.isFinite(prev) && prev > 0 ? prev + 1 : 1;
  return {
    yield_grams: round1(yieldGrams),
    items,
    rev,
    updatedAt: nowMs || Date.now(),
  };
}

function computeRecipeNutrients(recipe, findProduct) {
  if (typeof findProduct !== 'function') throw recipeError('invalid_recipe');
  const yieldGrams = Number(recipe && recipe.yield_grams);
  if (!(yieldGrams > 0)) throw recipeError('invalid_recipe_yield');
  const rawItems = recipe && Array.isArray(recipe.items) ? recipe.items : [];
  if (!rawItems.length) throw recipeError('recipe_items_empty');

  const items = [];
  const totals = {};
  for (const field of RECIPE_MASS_FIELDS) totals[field] = 0;
  let giMass = 0;
  let harmMass = 0;
  let novaWeighted = 0;
  let novaMass = 0;
  let itemGrams = 0;

  for (let index = 0; index < rawItems.length; index += 1) {
    const spec = rawItems[index] || {};
    const grams = Number(spec.grams);
    if (!(grams > 0)) throw recipeError('invalid_recipe_item_grams', { index });
    const product = findProduct({
      product_id: spec.product_id,
      query: spec.query,
    });
    if (!product) {
      throw recipeError('recipe_item_not_found', {
        product_id: spec.product_id,
        query: spec.query,
        index,
      });
    }
    const name = String(spec.name || product.name || '').trim();
    items.push({
      product_id: product.id != null ? String(product.id) : String(spec.product_id || ''),
      name,
      grams: round1(grams),
    });
    itemGrams += grams;
    const factor = grams / 100;
    for (const field of RECIPE_MASS_FIELDS) {
      const value = Number(product[field]);
      if (Number.isFinite(value)) totals[field] += value * factor;
    }
    giMass += (Number(product.gi) || 0) * grams;
    harmMass += (Number(product.harm) || 0) * grams;
    if (Number.isFinite(Number(product.nova_group))) {
      novaWeighted += Number(product.nova_group) * grams;
      novaMass += grams;
    }
  }

  const scale = 100 / yieldGrams;
  const nutrients = {};
  for (const field of RECIPE_MASS_FIELDS) {
    const value = totals[field] * scale;
    if (REQUIRED_NUTRIENTS.includes(field)) nutrients[field] = round1(value);
    else if (value) nutrients[field] = round1(value);
  }
  nutrients.gi = itemGrams > 0 ? round1(giMass / itemGrams) : 0;
  nutrients.harm = itemGrams > 0 ? round1(harmMass / itemGrams) : 0;
  if (novaMass > 0) nutrients.nova_group = Math.round(novaWeighted / novaMass);

  const carbs = (Number(nutrients.simple100) || 0) + (Number(nutrients.complex100) || 0);
  const fat = (Number(nutrients.badFat100) || 0) + (Number(nutrients.goodFat100) || 0) + (Number(nutrients.trans100) || 0);
  nutrients.carbs100 = round1(carbs);
  nutrients.fat100 = round1(fat);
  nutrients.kcal100 = round1(3 * (Number(nutrients.protein100) || 0) + 4 * carbs + 9 * fat);
  return { nutrients, items, yield_grams: round1(yieldGrams) };
}

function formatRecipeSummary(recipe) {
  if (!recipe || !Array.isArray(recipe.items) || !recipe.items.length) return '';
  const parts = recipe.items.map((item) => `${item.name || '?'} ${item.grams} г`);
  const yieldPart = Number(recipe.yield_grams) > 0 ? ` · выход ${recipe.yield_grams} г` : '';
  return `${parts.join(', ')}${yieldPart}`;
}

function formatRecipePortionApprox(recipe, portionGrams) {
  const yieldGrams = Number(recipe && recipe.yield_grams);
  const portion = Number(portionGrams);
  if (!(yieldGrams > 0) || !(portion > 0) || !Array.isArray(recipe.items)) return '';
  const scale = portion / yieldGrams;
  return recipe.items
    .map((item) => `≈ ${item.name || '?'} ${round1((Number(item.grams) || 0) * scale)} г`)
    .join(', ');
}

function recipeSnapshotFields(product) {
  const recipe = product && product.recipe;
  if (!recipe || !Array.isArray(recipe.items) || !recipe.items.length) return null;
  return {
    recipe_yield: Number(recipe.yield_grams) || 0,
    recipe_items: recipe.items.map((item) => ({
      name: String(item.name || '').trim(),
      grams: Number(item.grams) || 0,
    })),
    recipe_rev: Number(recipe.rev) || 0,
  };
}

function hasManualNutrientInput(input) {
  if (!input || typeof input !== 'object') return false;
  return REQUIRED_NUTRIENTS.some((field) => input[field] !== undefined && input[field] !== null && input[field] !== '')
    || OPTIONAL_NUTRIENTS.some((field) => input[field] !== undefined && input[field] !== null && input[field] !== '');
}

function buildRecipePayload(recipeInput, findProduct, { nowMs, previousRev = 0 } = {}) {
  const computed = computeRecipeNutrients(recipeInput, findProduct);
  const recipe = normalizeRecipe({
    yield_grams: computed.yield_grams,
    items: computed.items,
  }, { nowMs, previousRev });
  return { recipe, nutrients: computed.nutrients };
}

/** Ссылка на ингредиент в патче: id, если он известен, иначе название. */
function matchRecipeItemIndex(items, ref) {
  const id = ref && ref.product_id != null ? String(ref.product_id).trim() : '';
  if (id) {
    const byId = items.findIndex((item) => String(item.product_id || '') === id);
    if (byId >= 0) return byId;
  }
  const nameRef = normalizeText((ref && (ref.name || ref.query)) || '');
  if (!nameRef) return -1;
  const exact = items.findIndex((item) => normalizeText(item.name) === nameRef);
  if (exact >= 0) return exact;
  const partial = items.filter((item) => {
    const name = normalizeText(item.name);
    return name && (name.includes(nameRef) || nameRef.includes(name));
  });
  if (partial.length === 1) return items.indexOf(partial[0]);
  if (partial.length > 1) throw recipeError('recipe_patch_ambiguous', { ref: nameRef });
  return -1;
}

/**
 * Точечная правка состава: «убери кукурузу», «положи 4 яйца», «замени майонез
 * на сметану». Полная замена items — главный способ молча потерять строку:
 * модель пересобирает список по памяти и роняет ингредиент, которого никто не
 * называл вслух. Патч меняет только то, что названо, остальное несёт как есть.
 *
 * Выход готового при этом не «остаётся прежним»: если из салата убрать
 * четверть массы, а yield не тронуть, КБЖУ на 100 г уедут вниз без всякой
 * причины. Поэтому выход по умолчанию следует за составом, сохраняя прежнюю
 * уварку, и явный yield_grams всегда сильнее.
 */
function applyRecipePatch(currentRecipe, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw recipeError('invalid_recipe_patch');
  }
  const rawItems = currentRecipe && Array.isArray(currentRecipe.items) ? currentRecipe.items : [];
  if (!rawItems.length) throw recipeError('recipe_items_empty');
  const items = rawItems.map((item) => ({
    product_id: item.product_id ? String(item.product_id) : undefined,
    name: String(item.name || '').trim(),
    grams: Number(item.grams) || 0,
  }));
  const prevYield = Number(currentRecipe.yield_grams) || 0;
  const prevItemsGrams = items.reduce((sum, item) => sum + item.grams, 0);
  const changes = [];

  const removeList = Array.isArray(patch.remove) ? patch.remove : [];
  for (const ref of removeList) {
    const spec = typeof ref === 'string' ? { name: ref } : ref || {};
    const index = matchRecipeItemIndex(items, spec);
    if (index < 0) {
      throw recipeError('recipe_patch_item_not_found', {
        ref: spec.product_id || spec.name || spec.query || '',
        available: items.map((item) => item.name),
      });
    }
    changes.push(`убрано ${items[index].name} (${items[index].grams} г)`);
    items.splice(index, 1);
  }

  const setList = Array.isArray(patch.set) ? patch.set : [];
  for (const raw of setList) {
    const spec = raw || {};
    const grams = Number(spec.grams);
    if (!(grams > 0) || grams > 50000) throw recipeError('invalid_recipe_item_grams');
    const index = matchRecipeItemIndex(items, spec);
    if (index >= 0) {
      const before = items[index].grams;
      if (spec.product_id) items[index].product_id = String(spec.product_id);
      if (spec.name) items[index].name = String(spec.name).trim();
      items[index].grams = round1(grams);
      if (before !== items[index].grams) {
        changes.push(`${items[index].name}: ${before} → ${items[index].grams} г`);
      }
      continue;
    }
    if (!spec.product_id && !spec.query && !spec.name) throw recipeError('invalid_recipe_patch');
    items.push({
      product_id: spec.product_id ? String(spec.product_id) : undefined,
      query: spec.product_id ? undefined : String(spec.query || spec.name).trim(),
      name: spec.name ? String(spec.name).trim() : '',
      grams: round1(grams),
    });
    changes.push(`добавлено ${spec.name || spec.query || spec.product_id} ${round1(grams)} г`);
  }

  if (!items.length) throw recipeError('recipe_items_empty');
  const nextItemsGrams = items.reduce((sum, item) => sum + (Number(item.grams) || 0), 0);

  let yieldGrams;
  let yieldMode;
  if (patch.yield_grams != null && patch.yield_grams !== '') {
    yieldGrams = Number(patch.yield_grams);
    yieldMode = 'explicit';
  } else if (!changes.length || prevItemsGrams <= 0) {
    yieldGrams = prevYield;
    yieldMode = 'kept';
  } else if (Math.abs(prevYield - prevItemsGrams) <= prevItemsGrams * 0.01) {
    // Выход равнялся сумме ингредиентов — холодное блюдо, уварки нет.
    yieldGrams = round1(nextItemsGrams);
    yieldMode = 'follows_items';
  } else {
    // Была уварка (или долив) — сохраняем её долю, а не абсолютный вес.
    yieldGrams = round1(nextItemsGrams * (prevYield / prevItemsGrams));
    yieldMode = 'kept_ratio';
  }
  if (!(yieldGrams > 0) || yieldGrams > 50000) throw recipeError('invalid_recipe_yield');
  if (yieldMode !== 'kept' && round1(yieldGrams) !== round1(prevYield)) {
    changes.push(`выход ${round1(prevYield)} → ${round1(yieldGrams)} г`);
  }

  return {
    recipe_input: { yield_grams: round1(yieldGrams), items },
    changes,
    yield_mode: yieldMode,
    prev_yield_grams: round1(prevYield),
  };
}

/**
 * Разбор состава для куратора: вклад каждого ингредиента и сверка сохранённых
 * КБЖУ с текущими карточками. Рецепт считается один раз при сохранении, так
 * что «блюдо из старых цифр» — штатное состояние базы, и заметить его можно
 * только этой сверкой. Без неё куратор пересчитывает состав руками по строке
 * из поиска и теряет ингредиенты.
 */
function describeRecipe(product, findProduct) {
  const recipe = product && product.recipe;
  if (!recipe || !Array.isArray(recipe.items) || !recipe.items.length) return null;
  const yieldGrams = Number(recipe.yield_grams) || 0;
  const resolve = typeof findProduct === 'function' ? findProduct : () => null;

  const items = [];
  const missing = [];
  let itemsGrams = 0;
  let knownKcal = 0;
  for (const item of recipe.items) {
    const grams = Number(item.grams) || 0;
    itemsGrams += grams;
    const current = resolve({ product_id: item.product_id, query: item.name }) || null;
    const kcal100 = current ? computeTefKcal100(current) : null;
    const kcal = kcal100 == null ? null : round1((kcal100 * grams) / 100);
    if (kcal != null) knownKcal += kcal;
    items.push({
      product_id: item.product_id || undefined,
      name: item.name || (current && current.name) || '?',
      grams: round1(grams),
      kcal100: kcal100 == null ? undefined : kcal100,
      kcal: kcal == null ? undefined : kcal,
      card_name: current && current.name && current.name !== item.name ? current.name : undefined,
      // Ингредиент может лежать и в личном списке, и в общей базе: видно, чей
      // именно взят, — иначе непонятно, чья правка сдвинет калорийность блюда.
      card_source: current
        ? (current._source === 'own' ? 'мой список' : current._source === 'peer' ? 'список другого клиента' : 'общая база')
        : undefined,
      card_missing: current ? undefined : true,
    });
    if (!current) missing.push(item.name || item.product_id || '?');
  }
  for (const item of items) {
    if (item.kcal != null && knownKcal > 0) {
      item.kcal_share_pct = Math.round((item.kcal / knownKcal) * 1000) / 10;
    }
  }

  const saved = {
    kcal100: computeTefKcal100(product),
    protein100: round1(Number(product.protein100) || 0),
    carbs100: round1(Number(product.carbs100)
      || ((Number(product.simple100) || 0) + (Number(product.complex100) || 0))),
    fat100: round1(Number(product.fat100)
      || ((Number(product.badFat100) || 0) + (Number(product.goodFat100) || 0) + (Number(product.trans100) || 0))),
  };

  let recomputed = null;
  let drift = null;
  if (!missing.length) {
    try {
      const computed = computeRecipeNutrients({ yield_grams: yieldGrams, items: recipe.items }, resolve);
      recomputed = {
        kcal100: computed.nutrients.kcal100,
        protein100: computed.nutrients.protein100,
        carbs100: computed.nutrients.carbs100,
        fat100: computed.nutrients.fat100,
      };
      const delta = round1(recomputed.kcal100 - saved.kcal100);
      // Полграмма-полкалории — округление самих полей карточки, а не правка
      // ингредиента; шуметь на этом нельзя, иначе предупреждение обесценится.
      if (Math.abs(delta) > 0.5) drift = { kcal100_delta: delta };
    } catch (e) {
      recomputed = null;
    }
  }

  const portions = Array.isArray(product.portions) ? product.portions : [];
  return {
    product_id: product.id,
    name: product.name,
    // Где живёт карточка: рецепт клиента не должен ни путаться с общей базой,
    // ни уезжать в неё. Куратор видит это в каждом разборе состава.
    source: product._source === 'own'
      ? 'мой список'
      : product._source === 'peer'
        ? `список ${product._owner_name || 'другого клиента'}`
        : 'общая база',
    writable: product._source !== 'peer',
    rev: Number(recipe.rev) || 0,
    updated_at: Number(recipe.updatedAt) || undefined,
    yield_grams: round1(yieldGrams),
    items_grams_total: round1(itemsGrams),
    // Разница выхода и суммы ингредиентов: уварка (минус) или долив (плюс).
    shrink_grams: yieldGrams > 0 ? round1(yieldGrams - itemsGrams) : 0,
    items,
    saved,
    recomputed: recomputed || undefined,
    stale: drift || undefined,
    missing_items: missing.length ? missing : undefined,
    portions: portions.map((p) => ({
      name: p.name,
      grams: Number(p.grams) || 0,
      kcal: round1((saved.kcal100 * (Number(p.grams) || 0)) / 100),
      composition: formatRecipePortionApprox(recipe, p.grams) || undefined,
    })),
  };
}

/** Личные карточки клиента, у которых есть состав. */
function listRecipes(catalog) {
  const own = catalog && Array.isArray(catalog.own) ? catalog.own : [];
  return own.filter((product) => product
    && product.recipe
    && Array.isArray(product.recipe.items)
    && product.recipe.items.length);
}

/**
 * Блюда, куда входит этот продукт. Правка карточки ингредиента КБЖУ рецептов
 * не пересчитывает — расходятся они молча именно так, поэтому после правки
 * нужно хотя бы назвать пострадавшие блюда.
 */
function findRecipesUsingProduct(catalog, product) {
  if (!product) return [];
  const ids = new Set([String(product.id || '')]);
  if (product.shared_origin_id) ids.add(String(product.shared_origin_id));
  const nameNorm = normalizeText(product.name);
  return listRecipes(catalog)
    .filter((row) => String(row.id) !== String(product.id))
    .map((row) => {
      const hit = row.recipe.items.find((item) => {
        if (item.product_id && ids.has(String(item.product_id))) return true;
        return !item.product_id && nameNorm && normalizeText(item.name) === nameNorm;
      });
      return hit
        ? {
          product_id: row.id,
          name: row.name,
          grams: Number(hit.grams) || 0,
          rev: Number(row.recipe.rev) || 0,
        }
        : null;
    })
    .filter(Boolean);
}

function itemKcalLocal(item) {
  return ((Number(item && item.kcal100) || 0) * (Number(item && item.grams) || 0)) / 100;
}

function itemMatchesRecipeProduct(item, productId, recipeRevFilter) {
  if (!item) return false;
  if (String(item.product_id || '') !== String(productId || '')) return false;
  if (recipeRevFilter == null || recipeRevFilter === '') return true;
  const rev = Number(item.recipe_rev);
  if (Number.isFinite(rev) && rev > 0) return rev === Number(recipeRevFilter);
  return false;
}

function recipeRevBucket(item) {
  const rev = Number(item && item.recipe_rev);
  return Number.isFinite(rev) && rev > 0 ? String(rev) : 'none';
}

function applyRecipeSnapshotToItem(item, product) {
  const snap = recipeSnapshotFields(product);
  const next = { ...item };
  if (snap) {
    next.recipe_yield = snap.recipe_yield;
    next.recipe_items = snap.recipe_items;
    next.recipe_rev = snap.recipe_rev;
  }
  if (product && product.name) next.name = product.name;
  for (const field of RECIPE_MASS_FIELDS) {
    if (product && product[field] !== undefined && product[field] !== null) next[field] = product[field];
  }
  if (product) {
    if (product.gi !== undefined && product.gi !== null) next.gi = product.gi;
    if (product.harm !== undefined && product.harm !== null) next.harm = product.harm;
    const carbs = (Number(product.simple100) || 0) + (Number(product.complex100) || 0);
    const fat = (Number(product.badFat100) || 0) + (Number(product.goodFat100) || 0) + (Number(product.trans100) || 0);
    next.carbs100 = product.carbs100 != null ? product.carbs100 : carbs;
    next.fat100 = product.fat100 != null ? product.fat100 : fat;
    next.kcal100 = computeTefKcal100(product);
  }
  return next;
}

function collectRecipeMatches(day, productId, recipeRevFilter) {
  const matches = [];
  for (const meal of (day && Array.isArray(day.meals) ? day.meals : [])) {
    for (const item of (meal && Array.isArray(meal.items) ? meal.items : [])) {
      if (itemMatchesRecipeProduct(item, productId, recipeRevFilter)) {
        matches.push({ meal, item });
      }
    }
  }
  return matches;
}

function countUnversionedRecipeItems(day, productId) {
  let count = 0;
  for (const meal of (day && Array.isArray(day.meals) ? day.meals : [])) {
    for (const item of (meal && Array.isArray(meal.items) ? meal.items : [])) {
      if (String(item && item.product_id || '') !== String(productId || '')) continue;
      const rev = Number(item.recipe_rev);
      if (!(Number.isFinite(rev) && rev > 0)) count += 1;
    }
  }
  return count;
}

function previewRecipeReapply(daysByDate, product, { recipeRev } = {}) {
  const productId = product && (product.id != null ? product.id : product.product_id);
  const byRev = {};
  let items = 0;
  let kcalDelta = 0;
  let unversioned = 0;
  const days = [];
  for (const date of Object.keys(daysByDate || {}).sort()) {
    const day = daysByDate[date];
    if (!day) continue;
    unversioned += countUnversionedRecipeItems(day, productId);
    const matches = collectRecipeMatches(day, productId, recipeRev);
    if (!matches.length) continue;
    let dayDelta = 0;
    for (const { item } of matches) {
      const after = applyRecipeSnapshotToItem(item, product);
      dayDelta += itemKcalLocal(after) - itemKcalLocal(item);
      items += 1;
      const bucket = recipeRevBucket(item);
      byRev[bucket] = (byRev[bucket] || 0) + 1;
    }
    kcalDelta += dayDelta;
    days.push({ date, items: matches.length, kcal_delta: round1(dayDelta) });
  }
  return {
    days_count: days.length,
    items_count: items,
    kcal_delta: round1(kcalDelta),
    by_rev: byRev,
    unversioned_count: unversioned,
    days,
    ingredients_current: true,
    warning_norms: days.some((row) => Math.abs(Number(row.kcal_delta) || 0) >= 50),
  };
}

function applyRecipeToDay(day, product, { recipeRev, nowMs } = {}) {
  const productId = product && (product.id != null ? product.id : product.product_id);
  const matches = collectRecipeMatches(day, productId, recipeRev);
  if (!matches.length) return { changed: false, day, kcal_delta: 0, items_count: 0 };
  let kcalDelta = 0;
  const next = {
    ...day,
    meals: (day.meals || []).map((meal) => ({
      ...meal,
      items: (meal.items || []).map((item) => {
        if (!itemMatchesRecipeProduct(item, productId, recipeRev)) return item;
        const updated = applyRecipeSnapshotToItem(item, product);
        kcalDelta += itemKcalLocal(updated) - itemKcalLocal(item);
        return updated;
      }),
    })),
  };
  const log = Array.isArray(day.recipe_backfill_log) ? day.recipe_backfill_log.slice() : [];
  log.push({
    at: nowMs || Date.now(),
    product_id: String(productId || ''),
    name: String((product && product.name) || ''),
    items_count: matches.length,
    kcal_delta: round1(kcalDelta),
  });
  next.recipe_backfill_log = log;
  next.updatedAt = nowMs || Date.now();
  return { changed: true, day: next, kcal_delta: round1(kcalDelta), items_count: matches.length };
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

  if (input.recipe && typeof input.recipe === 'object') {
    row.recipe = input.recipe;
  }

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
 * Колонки `shared_products`, которые принимает REST-шлюз.
 *
 * Список повторяет ALLOWED_COLUMNS.shared_products в heys-api-rest/index.js:
 * колонка вне него отбивается там как `invalid_insert_column`, поэтому
 * собирать payload «как получится» из карточки нельзя — у карточки есть и
 * `kcal100`, и `carbs100`, и `recipe`, которых в таблице нет вовсе.
 *
 * `created_at`/`updated_at` сюда не входят намеренно: время правки ставит сам
 * шлюз, и присланное значение затёрло бы его.
 */
const SHARED_PRODUCT_COLUMNS = [
  'id', 'name', 'brand', 'brand_fingerprint', 'name_norm', 'fingerprint',
  'barcode', 'barcodes', 'variant_of',
  'simple100', 'complex100', 'protein100', 'badfat100', 'goodfat100', 'trans100', 'fiber100',
  'gi', 'harm', 'category', 'portions', 'description',
  'sodium100', 'omega3_100', 'omega6_100', 'nova_group', 'additives', 'nutrient_density',
  'is_organic', 'is_whole_grain', 'is_fermented', 'is_raw',
  'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
  'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
  'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine',
];

/** Колонка таблицы → поле карточки, если они называются по-разному. */
const SHARED_COLUMN_SOURCE = { badfat100: 'badFat100', goodfat100: 'goodFat100' };

/** Та же нормализация, что normalizeName в кураторском UI приложения. */
function normalizeProductNameNorm(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/ё/g, 'е');
}

/**
 * Строка общей базы после правки — под upsert по `id`.
 *
 * Основа берётся из самой общей карточки, а не из объединённой с личными
 * правками клиента: иначе правка общей карточки заодно опубликовала бы
 * персональные overrides этого клиента всем остальным.
 *
 * Отпечатки пересчитываются, как это делает кураторский UI: по ним общая база
 * отсекает дубликаты, и оставить их от прежних нутриентов значит завести
 * второй такой же продукт при следующей публикации.
 *
 * Колонки, которых нет в исходной строке, в payload не попадают: upsert
 * трогает только перечисленные, поэтому не пришедшее из базы остаётся как
 * было, а не обнуляется.
 */
function buildSharedProductPayload(baseRow, patch) {
  const merged = { ...(baseRow || {}), ...(patch || {}) };
  const row = {};
  for (const column of SHARED_PRODUCT_COLUMNS) {
    const source = SHARED_COLUMN_SOURCE[column];
    const value = source !== undefined && merged[source] !== undefined ? merged[source] : merged[column];
    if (value !== undefined) row[column] = value;
  }
  row.name_norm = normalizeProductNameNorm(merged.name);
  row.fingerprint = computeProductFingerprint(merged);
  row.brand_fingerprint = computeProductBrandFingerprint(merged) || null;
  if (row.brand === undefined) row.brand = merged.brand || null;
  return row;
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

function countStoredOverlayTailShards(tailValues) {
  if (!Array.isArray(tailValues)) return 0;
  let count = 0;
  for (const tail of tailValues) {
    if (Array.isArray(tail)) count += 1;
  }
  return count;
}

function priorTailCountFromRead(manifest, tailValues) {
  const stored = countStoredOverlayTailShards(tailValues);
  const fromManifest = overlayCodec.isManifest(manifest) ? Math.max(0, manifest.count - 1) : 0;
  return Math.max(stored, fromManifest);
}

async function loadOverlayAssembled(api, sessionToken) {
  const tailKeys = Array.from(
    { length: MAX_OVERLAY_TAIL_SHARDS },
    (_, index) => `${OVERLAY_TAIL_KEY_PREFIX}${index + 1}`,
  );
  const keys = [OVERLAY_KEY, OVERLAY_MANIFEST_KEY, ...tailKeys];
  const readMany = typeof api.getKVMany === 'function'
    ? api.getKVMany(sessionToken, keys)
    : Promise.all(keys.map(async (key) => {
      const res = await api.getKV(sessionToken, key);
      return { key, data: res.data };
    })).then((entries) => ({
      data: Object.fromEntries(entries.map(({ key, data }) => [key, data])),
      error: null,
    }));

  const { data, error } = await readMany;
  if (error) return { ok: false, error, rows: null };

  const main = data && data[OVERLAY_KEY] != null ? data[OVERLAY_KEY] : null;
  const manifest = data && data[OVERLAY_MANIFEST_KEY] != null ? data[OVERLAY_MANIFEST_KEY] : null;
  const tails = tailKeys.map((key) => (data && data[key] != null ? data[key] : null));
  const assembled = overlayCodec.assemble(main, tails, manifest);
  if (!assembled.ok) {
    return { ok: false, error: assembled.status || 'incomplete', assembled, rows: null };
  }
  if (assembled.status !== 'complete' && assembled.status !== 'legacy') {
    return { ok: false, error: assembled.status, assembled, rows: null, priorTailCount: 0 };
  }
  const priorTailCount = priorTailCountFromRead(manifest, tails);
  return {
    ok: true,
    rows: Array.isArray(assembled.rows) ? assembled.rows : [],
    assembled,
    priorTailCount,
  };
}

async function deleteOverlayTailKeys(api, sessionToken, newTailCount, priorTailCount = 0) {
  if (typeof api.deleteKV !== 'function') return;
  const from = Math.max(1, newTailCount + 1);
  const to = Math.max(0, priorTailCount);
  if (from > to) return;
  for (let index = from; index <= to; index += 1) {
    const key = `${OVERLAY_TAIL_KEY_PREFIX}${index}`;
    try {
      await api.deleteKV(sessionToken, key);
    } catch (_) { /* best-effort, как в веб-клиенте */ }
  }
}

/**
 * Записать личный каталог клиента: строки И сторож целостности.
 *
 * Почему нельзя просто upsertKV(OVERLAY_KEY, rows). Каталог — это пара ключей:
 * строки и манифест (`rowCount` + хеш строк). Клиент собирает каталог через
 * codec.assemble(): не сошёлся хеш или длина — вся пара отвергается, причём
 * молча (heys_storage_supabase_v1.js: `if (!assembled.ok) return out;`). На
 * устройстве человека каталог продолжает жить из локального хранилища, а на
 * новом приезжает пустым, и ошибки в интерфейсе при этом нет.
 *
 * Инцидент 2026-08-22: три инструмента MCP писали только строки. Первый же
 * заведённый куратором продукт разводил пару навсегда — у двух клиентов из трёх
 * расхождение накопилось до 5 и 18 позиций (см. apps/web/BUGS_HISTORY.md).
 *
 * Порядок как у веб-клиента: строки, затем манифест — «commit marker written
 * last». Если манифест не записался, возвращаем ошибку, а не тихий успех:
 * рассогласованная пара хуже, чем незаписанный продукт, и куратор должен об
 * этом узнать сразу.
 */
async function saveOverlayRows(api, sessionToken, rows, options = {}) {
  if (!Array.isArray(rows)) {
    return { ok: false, error: 'rows_not_array' };
  }

  const publication = overlayCodec.splitRows(rows, {
    targetBytes: OVERLAY_SHARD_TARGET_BYTES,
    maxShards: MAX_OVERLAY_TAIL_SHARDS + 1,
  });
  if (!publication.ok) {
    return { ok: false, error: `манифест каталога не построился (${publication.reason})` };
  }

  const priorTailCount = Number.isFinite(Number(options.priorTailCount))
    ? Math.max(0, Number(options.priorTailCount))
    : 0;

  const shards = publication.shards;
  const mainShard = shards[0];
  const tails = shards.slice(1);

  // Порядок как у веб-клиента: хвосты → main → manifest (commit marker).
  for (let tailIndex = tails.length - 1; tailIndex >= 0; tailIndex -= 1) {
    const tailKey = `${OVERLAY_TAIL_KEY_PREFIX}${tailIndex + 1}`;
    const saveTail = await api.upsertKV(sessionToken, tailKey, tails[tailIndex]);
    if (!saveTail.ok) return saveTail;
  }

  const saveRows = await api.upsertKV(sessionToken, OVERLAY_KEY, mainShard);
  if (!saveRows.ok) return saveRows;

  const saveManifest = await api.upsertKV(sessionToken, OVERLAY_MANIFEST_KEY, publication.manifest);
  if (!saveManifest.ok) {
    return {
      ok: false,
      error: `строки записаны, но сторож целостности каталога — нет (${saveManifest.error}). `
        + 'Каталог в этом состоянии не приедет на новое устройство: повторить операцию.',
    };
  }

  await deleteOverlayTailKeys(api, sessionToken, tails.length, priorTailCount);
  return { ok: true };
}

module.exports = {
  OVERLAY_KEY,
  OVERLAY_MANIFEST_KEY,
  OVERLAY_TAIL_KEY_PREFIX,
  MAX_OVERLAY_TAIL_SHARDS,
  AGGREGATE_COMPOSITION_TOLERANCE,
  priorTailCountFromRead,
  countStoredOverlayTailShards,
  loadOverlayAssembled,
  saveOverlayRows,
  EDITABLE_FIELDS,
  RECIPE_MASS_FIELDS,
  buildProductPatch,
  applyProductPatchToOverlay,
  computeProductFingerprint,
  computeProductBrandFingerprint,
  SHARED_PRODUCT_COLUMNS,
  normalizeProductNameNorm,
  buildSharedProductPayload,
  looksIndustrial,
  computeRecipeNutrients,
  normalizeRecipe,
  formatRecipeSummary,
  formatRecipePortionApprox,
  recipeSnapshotFields,
  hasManualNutrientInput,
  buildRecipePayload,
  applyRecipePatch,
  describeRecipe,
  listRecipes,
  findRecipesUsingProduct,
  previewRecipeReapply,
  applyRecipeToDay,
  applyRecipeSnapshotToItem,
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
  pickSearchMatch,
  preferOwnOverMatchingShared,
  sameAggregateComposition,
  aggregateMacros,
  nameQueryCoverage,
  searchProducts,
  fuzzySearchProducts,
  fuzzyProductSimilarity,
  trigramSimilarity,
  matchStrength,
  hasStrongMatch,
  mergeSearchLayers,
  isSharedLinked,
  findById,
  pieceGrams,
  describeProduct,
};
