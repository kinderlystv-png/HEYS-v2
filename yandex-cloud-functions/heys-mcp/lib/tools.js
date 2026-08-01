'use strict';

/**
 * Инструменты MCP: то, что куратор реально делает в дневнике клиента.
 *
 * Общий инвариант записи: прочитать текущий день → изменить → отправить через
 * merge с известным updatedAt. Любой инструмент, который пишет, обязан идти
 * этим путём, иначе параллельно открытое PWA потеряет данные.
 */

const crypto = require('node:crypto');
const day = require('./day');
const products = require('./products');
const sharedCatalog = require('./shared-catalog');

/** Наборы приёмов, которые пользователь сохранил в приложении. */
const PRESETS_KEY = 'heys_meal_presets_v1';

/** Список удалённых продуктов: приложение по нему скрывает записи из облака. */
const TOMBSTONES_KEY = 'heys_deleted_ids';

/**
 * Позиция набора — усечённый набор полей, ровно тот, что кладёт приложение
 * (apps/web/heys_add_product_step_v1.js). Полный нутриентный слепок здесь не
 * нужен: он пересобирается из каталога в момент записи приёма.
 */
const PRESET_ITEM_FIELDS = [
  'kcal100', 'protein100', 'fat100', 'simple100', 'complex100',
  'badFat100', 'goodFat100', 'trans100', 'fiber100', 'gi', 'harm',
];

function buildPresetItem(product, grams) {
  const full = day.buildMealItem(product, grams, () => '');
  const item = { product_id: product.id, name: product.name, grams: Number(grams) };
  for (const field of PRESET_ITEM_FIELDS) {
    if (full[field] !== undefined && full[field] !== null) item[field] = full[field];
  }
  return item;
}

function makeId(prefix) {
  return `${prefix}${crypto.randomBytes(6).toString('hex')}`;
}

/** Название приёма по времени — те же ярлыки, что пользователь ставит руками. */
function defaultMealName(time) {
  const minutes = day.timeToMinutes(time);
  if (minutes === null) return 'Приём';
  const hour = Math.floor(minutes / 60);
  if (hour >= 5 && hour < 11) return 'Завтрак';
  if (hour >= 11 && hour < 15) return 'Обед';
  if (hour >= 17 && hour < 22) return 'Ужин';
  return 'Перекус';
}

function resolveDate(input, nowMs) {
  if (input === undefined || input === null || input === '') return day.nowParts(nowMs).date;
  const value = String(input).trim();
  if (!day.isValidDate(value)) throw new ToolError('invalid_date', `Дата "${value}" не в формате YYYY-MM-DD.`);
  return value;
}

class ToolError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function clampSubjective(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1 || num > 10) {
    throw new ToolError('invalid_range', `Поле ${field} должно быть числом от 1 до 10.`);
  }
  return num;
}

/**
 * Контекст создаётся на запрос: клиент API, session-токен клиента HEYS,
 * clientId и «сейчас». Кэш каталога живёт в контексте, чтобы один
 * tools/call с несколькими позициями не тянул общую базу дважды.
 */
function createTools({ api, sessionToken, clientId, nowMs = Date.now() }) {
  let catalogPromise = null;

  async function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = (async () => {
        const [overlayRes, sharedRes] = await Promise.all([
          api.getKV(sessionToken, products.OVERLAY_KEY),
          sharedCatalog.loadSharedProducts(api, { nowMs }),
        ]);
        if (overlayRes.error) throw new ToolError('upstream_error', `Не удалось прочитать список продуктов: ${overlayRes.error.message}`);
        if (sharedRes.error) throw new ToolError('upstream_error', `Не удалось прочитать общую базу продуктов: ${sharedRes.error.message}`);

        const sharedById = new Map();
        for (const row of sharedRes.rows || []) {
          const normalized = products.normalizeSharedRow(row);
          if (normalized && normalized.id) sharedById.set(String(normalized.id), normalized);
        }

        // Большинство личных продуктов — это Type A: ссылка на строку общей базы
        // плюс overrides. Если общая база не доехала, такие строки молча выпадут
        // из каталога, инструмент ответит «не нашлось», а модель пойдёт заводить
        // дубликат уже существующего продукта. Пустая общая база при наличии
        // Type A строк — это сбой загрузки, а не легальное состояние.
        const overlayRows = Array.isArray(overlayRes.data) ? overlayRes.data : [];
        const linkedRows = overlayRows.filter((row) => row && !row._custom && row.shared_origin_id && row.in_my_list !== false);
        if (linkedRows.length > 0 && sharedById.size === 0) {
          throw new ToolError(
            'shared_catalog_unavailable',
            'Общая база продуктов сейчас недоступна, поэтому личный список клиента прочитан не полностью. Повтори запрос — заводить продукт заново не нужно, он может уже существовать.',
          );
        }

        return products.buildCatalog(overlayRes.data, sharedById);
      })();
    }
    return catalogPromise;
  }

  let presetsPromise = null;

  async function loadPresets() {
    if (!presetsPromise) {
      presetsPromise = (async () => {
        const { data, error } = await api.getKV(sessionToken, PRESETS_KEY);
        if (error) throw new ToolError('upstream_error', `Не удалось прочитать наборы: ${error.message}`);
        return Array.isArray(data) ? data.filter((p) => p && Array.isArray(p.items)) : [];
      })();
    }
    return presetsPromise;
  }

  /**
   * Позиции набора сохранялись давно и несут исторические product_id, которые
   * могли не пережить переезд на overlay. Поэтому id — это подсказка, а
   * авторитетом остаётся название: иначе набор молча потеряет позицию.
   */
  async function resolvePresetItem(item, presetName) {
    const catalog = await loadCatalog();
    const byId = item.product_id ? products.findById(catalog, item.product_id) : null;
    if (byId) return { product: byId, grams: Number(item.grams) || 100 };

    const nameNorm = products.normalizeText(item.name);
    const byName = catalog.all.find((p) => products.normalizeText(p.name) === nameNorm);
    if (byName) return { product: byName, grams: Number(item.grams) || 100 };

    throw new ToolError('preset_item_missing', `В наборе «${presetName}» продукт «${item.name}» больше не найден в базе. Собери приём позициями вручную.`);
  }

  async function readDay(date) {
    const key = day.dayKey(date);
    const { data, error } = await api.getKV(sessionToken, key);
    if (error) throw new ToolError('upstream_error', `Не удалось прочитать день ${date}: ${error.message}`);
    return day.ensureDay(data, date, clientId, nowMs);
  }

  async function writeDay(date, nextDay, lastSeenUpdatedAt) {
    const res = await api.mergeSaveKV(sessionToken, day.dayKey(date), nextDay, lastSeenUpdatedAt);
    if (!res.ok) throw new ToolError('save_failed', `Сервер отклонил запись дня ${date}: ${res.error}`);
    return res;
  }

  /**
   * Позиция задаётся product_id (точно) или query (поиск). При неоднозначном
   * совпадении инструмент не угадывает, а возвращает кандидатов — уточнение
   * дешевле, чем неверная еда в дневнике.
   */
  async function resolveProduct(spec, label) {
    const catalog = await loadCatalog();

    if (spec.product_id) {
      const found = products.findById(catalog, spec.product_id);
      if (!found) throw new ToolError('product_not_found', `Продукт с id "${spec.product_id}" не найден.`);
      return found;
    }

    if (!spec.query) {
      throw new ToolError('invalid_item', `${label}: нужен product_id или query.`);
    }

    const matches = products.searchProducts(catalog, spec.query, 5);
    if (!matches.length) {
      throw new ToolError('product_not_found', `По запросу "${spec.query}" ничего не найдено. Уточни название или подбери продукт через heys_search_products.`);
    }
    const prepared = products.prepareQuery(spec.query);
    const best = products.scoreProduct(matches[0], prepared);
    const second = matches[1] ? products.scoreProduct(matches[1], prepared) : 0;
    // Единственное совпадение в личном списке считаем однозначным даже при
    // неточном названии: конкурента у него нет, а пользователь вносит еду
    // именно своими позициями.
    const soleOwnMatch = matches.length === 1 && matches[0]._source === 'own' && best > 0;
    const confident = soleOwnMatch || (best >= 400 && (second === 0 || best >= second * 1.25));
    if (!confident) {
      throw new ToolError(
        'ambiguous_product',
        `По запросу "${spec.query}" несколько подходящих продуктов — уточни у пользователя, какой из них.`,
        { candidates: matches.map(products.describeProduct) },
      );
    }
    return matches[0];
  }

  /**
   * Граммовка: либо прямо в граммах, либо в штуках. Вес штуки берётся из
   * карточки продукта, а если его там нет — инструмент отказывается угадывать
   * и просит спросить у пользователя. Названный вес запоминается в карточке.
   */
  function resolveGrams(spec, product, label) {
    const pieces = Number(spec && spec.pieces);
    if (Number.isFinite(pieces) && pieces > 0) {
      if (pieces > 200) throw new ToolError('invalid_pieces', `${label}: слишком много штук (${pieces}).`);
      const known = products.pieceGrams(product);
      const explicit = Number(spec.piece_grams);
      const hasExplicit = Number.isFinite(explicit) && explicit > 0 && explicit <= 5000;
      const perPiece = hasExplicit ? explicit : known;
      if (!perPiece) {
        throw new ToolError(
          'piece_weight_unknown',
          `${label}: у продукта «${product.name}» не задан вес одной штуки. Спроси у пользователя, сколько граммов в одной штуке, и передай piece_grams — вес сохранится в карточку, и дальше «штуки» будут считаться сами.`,
          { product: products.describeProduct(product) },
        );
      }
      const grams = Math.round(pieces * perPiece * 10) / 10;
      if (grams > 5000) throw new ToolError('invalid_grams', `${label}: получилось ${grams} г — больше допустимых 5000.`);
      return { grams, learnPieceGrams: hasExplicit && !known ? perPiece : null };
    }

    const grams = Number(spec && spec.grams);
    if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) {
      throw new ToolError('invalid_grams', `${label}: нужны grams (число от 1 до 5000) или pieces (штуки).`);
    }
    return { grams, learnPieceGrams: null };
  }

  async function resolveItem(spec, index) {
    const label = `Позиция #${index + 1}`;
    const product = await resolveProduct(spec || {}, label);
    const { grams, learnPieceGrams } = resolveGrams(spec, product, label);
    return { product, grams, learnPieceGrams };
  }

  /**
   * Вес штуки, названный пользователем, дописывается в карточку продукта, чтобы
   * второй раз «четыре штуки» не потребовали вопроса. Пишем только в свои
   * строки overlay: продукт общей базы правится через модерацию, не отсюда.
   */
  async function persistPieceGrams(resolved) {
    const learned = resolved.filter((entry) => entry.learnPieceGrams);
    if (!learned.length) return [];

    const overlayRes = await api.getKV(sessionToken, products.OVERLAY_KEY);
    if (overlayRes.error) return [];
    const overlay = Array.isArray(overlayRes.data) ? overlayRes.data : [];

    const saved = [];
    const next = overlay.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const hit = learned.find((entry) => String(entry.product.id) === String(row.id));
      if (!hit) return row;
      const portions = products.normalizePortions(row.portions);
      if (portions.some((p) => products.normalizeText(p.name).includes('шт'))) return row;
      saved.push({ name: row.name, grams: hit.learnPieceGrams });
      return { ...row, portions: [...portions, { name: '1 шт', grams: hit.learnPieceGrams }], updatedAt: nowMs };
    });
    if (!saved.length) return [];

    const res = await api.upsertKV(sessionToken, products.OVERLAY_KEY, next);
    if (!res.ok) return [];
    catalogPromise = null;
    return saved;
  }

  const tools = {
    async heys_get_day(args) {
      const date = resolveDate(args.date, nowMs);
      const current = await readDay(date);
      const summary = day.summarizeDay(current);
      const text = summary.meals.length || summary.water_ml
        ? `День ${date}: ${summary.totals.kcal} ккал, Б${summary.totals.protein} У${summary.totals.carbs} Ж${summary.totals.fat}, вода ${summary.water_ml} мл, приёмов: ${summary.meals.length}.`
        : `День ${date} пока пустой.`;
      return { text, structured: summary };
    },

    async heys_search_products(args) {
      if (!args.query || !String(args.query).trim()) {
        throw new ToolError('invalid_query', 'Нужен непустой query.');
      }
      const catalog = await loadCatalog();
      const found = products.searchProducts(catalog, args.query, args.limit || 10);
      const described = found.map(products.describeProduct);
      const text = described.length
        ? `Нашёл ${described.length}: ${described.map((p) => `${p.name} (${p.kcal100} ккал/100, ${p.source})`).join('; ')}`
        : `По запросу "${args.query}" ничего не нашлось.`;
      return { text, structured: { query: args.query, results: described } };
    },

    async heys_log_meal(args) {
      const date = resolveDate(args.date, nowMs);
      const time = args.time === undefined || args.time === null || args.time === ''
        ? day.nowParts(nowMs).time
        : day.normalizeTime(args.time);
      if (!time) throw new ToolError('invalid_time', `Время "${args.time}" не в формате HH:MM.`);

      const resolved = [];
      let presetName = null;

      if (args.preset) {
        const presets = await loadPresets();
        const wanted = products.normalizeText(args.preset);
        const preset = presets.find((p) => String(p.id) === String(args.preset))
          || presets.find((p) => products.normalizeText(p.name) === wanted)
          || presets.find((p) => products.normalizeText(p.name).includes(wanted));
        if (!preset) {
          throw new ToolError('preset_not_found', `Набор «${args.preset}» не найден. Список — heys_list_meal_presets.`);
        }
        presetName = preset.name;
        const overrides = (args.preset_grams && typeof args.preset_grams === 'object') ? args.preset_grams : {};
        for (const item of preset.items) {
          const entry = await resolvePresetItem(item, preset.name);
          const overrideKey = Object.keys(overrides)
            .find((key) => products.normalizeText(key) === products.normalizeText(item.name));
          if (overrideKey && Number(overrides[overrideKey]) > 0) entry.grams = Number(overrides[overrideKey]);
          resolved.push(entry);
        }
      }

      const specs = Array.isArray(args.items) ? args.items : [];
      if (!specs.length && !resolved.length) {
        throw new ToolError('invalid_items', 'Нужна хотя бы одна позиция в items или набор в preset.');
      }
      if (specs.length + resolved.length > 20) {
        throw new ToolError('invalid_items', 'За раз можно внести не больше 20 позиций.');
      }
      for (let i = 0; i < specs.length; i += 1) {
        resolved.push(await resolveItem(specs[i], i));
      }

      const meal = {
        id: makeId('m_'),
        name: args.name ? String(args.name) : (presetName || defaultMealName(time)),
        time,
        mood: clampSubjective(args.mood, 'mood') ?? '',
        wellbeing: clampSubjective(args.wellbeing, 'wellbeing') ?? '',
        stress: clampSubjective(args.stress, 'stress') ?? '',
        items: resolved.map(({ product, grams }) => day.buildMealItem(product, grams, makeId)),
      };

      const current = await readDay(date);
      const next = day.addMeal(current, meal, { nowMs, clientId });
      await writeDay(date, next, Number(current.updatedAt) || 0);
      const learned = await persistPieceGrams(resolved);

      const kcal = day.macroTotals([meal]);
      const itemsText = meal.items.map((item) => `${item.name} ${item.grams} г`).join(', ');
      const learnedText = learned.length
        ? ` Запомнил вес штуки: ${learned.map((l) => `${l.name} — ${l.grams} г`).join(', ')}.`
        : '';
      return {
        text: `Записал: ${meal.name} в ${time} (${date}) — ${itemsText}. ≈${kcal.kcal} ккал, Б${kcal.protein} У${kcal.carbs} Ж${kcal.fat}.${learnedText}`,
        structured: {
          date,
          meal_id: meal.id,
          name: meal.name,
          time,
          totals: kcal,
          items: meal.items.map((i) => ({ id: i.id, name: i.name, grams: i.grams })),
          learned_piece_grams: learned.length ? learned : undefined,
        },
      };
    },

    /**
     * Правка уже записанного приёма. Нужен для «добавь туда ещё» и «поменяй
     * граммовку»: пересоздание приёма меняет meal_id, теряет шапку и лишний раз
     * гоняется с открытым приложением.
     */
    async heys_update_meal(args) {
      const date = resolveDate(args.date, nowMs);
      if (!args.meal_id) throw new ToolError('invalid_meal_id', 'Нужен meal_id (его отдаёт heys_get_day).');

      const time = args.time === undefined || args.time === null || args.time === ''
        ? null
        : day.normalizeTime(args.time);
      if (args.time && !time) throw new ToolError('invalid_time', `Время "${args.time}" не в формате HH:MM.`);

      const specs = Array.isArray(args.add_items) ? args.add_items : [];
      if (specs.length > 20) throw new ToolError('invalid_items', 'За раз можно добавить не больше 20 позиций.');

      const current = await readDay(date);
      const target = (current.meals || []).find((m) => m && String(m.id) === String(args.meal_id));
      if (!target) {
        throw new ToolError('meal_not_found', `Приём ${args.meal_id} не найден в дне ${date}. Возьми актуальный meal_id через heys_get_day.`);
      }

      const resolved = [];
      for (let i = 0; i < specs.length; i += 1) {
        resolved.push(await resolveItem(specs[i], i));
      }

      const patch = {
        addItems: resolved.map(({ product, grams }) => day.buildMealItem(product, grams, makeId)),
        removeItemIds: Array.isArray(args.remove_item_ids) ? args.remove_item_ids : [],
        setGrams: (args.set_grams && typeof args.set_grams === 'object') ? args.set_grams : {},
        name: args.name,
        time,
        mood: clampSubjective(args.mood, 'mood'),
        wellbeing: clampSubjective(args.wellbeing, 'wellbeing'),
        stress: clampSubjective(args.stress, 'stress'),
      };

      let result;
      try {
        result = day.updateMeal(current, args.meal_id, patch, { nowMs, clientId });
      } catch (e) {
        throw new ToolError('invalid_grams', `Некорректная граммовка: ${e.message}`);
      }
      if (result.unknownItems.length) {
        throw new ToolError(
          'item_not_found',
          `В приёме нет позиций с id: ${result.unknownItems.join(', ')}. Возьми актуальные id через heys_get_day.`,
          { meal_id: args.meal_id, items: (target.items || []).map((i) => ({ id: i.id, name: i.name, grams: i.grams })) },
        );
      }
      if (!result.changed.length) {
        throw new ToolError('nothing_to_update', 'Не передано ни одного изменения: нужен add_items, remove_item_ids, set_grams, name, time или оценка самочувствия.');
      }
      if (!result.meal.items.length) {
        throw new ToolError('meal_would_be_empty', 'После правки в приёме не осталось позиций. Если приём нужно убрать целиком — heys_delete_meal.');
      }

      await writeDay(date, result.day, Number(current.updatedAt) || 0);
      const learned = await persistPieceGrams(resolved);

      const kcal = day.macroTotals([result.meal]);
      const learnedText = learned.length
        ? ` Запомнил вес штуки: ${learned.map((l) => `${l.name} — ${l.grams} г`).join(', ')}.`
        : '';
      return {
        text: `Обновил «${result.meal.name}» (${result.meal.time}, ${date}): ${result.changed.join('; ')}. Теперь в приёме ${result.meal.items.length} позиций, ≈${kcal.kcal} ккал, Б${kcal.protein} У${kcal.carbs} Ж${kcal.fat}.${learnedText}`,
        structured: {
          date,
          meal_id: result.meal.id,
          name: result.meal.name,
          time: result.meal.time,
          changed: result.changed,
          totals: kcal,
          items: result.meal.items.map((i) => ({ id: i.id, name: i.name, grams: i.grams })),
          learned_piece_grams: learned.length ? learned : undefined,
        },
      };
    },

    async heys_create_product(args) {
      const name = String(args.name || '').trim();
      if (!name) throw new ToolError('invalid_name', 'Нужно название продукта.');

      const catalog = await loadCatalog();
      const nameNorm = products.normalizeText(name);
      const duplicate = catalog.all.find((p) => products.normalizeText(p.name) === nameNorm);
      if (duplicate && !args.allow_duplicate) {
        throw new ToolError(
          'product_exists',
          `Продукт «${duplicate.name}» уже есть (${duplicate._source === 'own' ? 'в твоём списке' : 'в общей базе'}). Если это другой продукт — уточни название, например добавь бренд.`,
          { existing: products.describeProduct(duplicate) },
        );
      }

      // Удалённый когда-то продукт с тем же именем приложение отфильтрует по
      // tombstone — новый продукт просто не появится в списке. Молча создавать
      // его бессмысленно, поэтому проверяем заранее.
      const tombstones = await api.getKV(sessionToken, TOMBSTONES_KEY);
      if (Array.isArray(tombstones.data)) {
        const hidden = tombstones.data.some((t) => t && t.name && products.normalizeText(t.name) === nameNorm);
        if (hidden && !args.allow_duplicate) {
          throw new ToolError(
            'product_tombstoned',
            `Продукт с названием «${name}» ты раньше удалял, и приложение скроет новый с тем же именем. Восстанови его в приложении или назови иначе.`,
          );
        }
      }

      let row;
      try {
        row = products.buildCustomProduct(args, {
          nowMs,
          makeId: () => `p_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
        });
      } catch (e) {
        if (e.missing) {
          throw new ToolError('nutrients_missing', `Не хватает обязательных полей: ${e.missing.join(', ')}. Все значения — на 100 г.`, { missing: e.missing });
        }
        throw new ToolError('invalid_product', e.message);
      }

      const overlayRes = await api.getKV(sessionToken, products.OVERLAY_KEY);
      if (overlayRes.error) throw new ToolError('upstream_error', `Не удалось прочитать список продуктов: ${overlayRes.error.message}`);
      const overlay = Array.isArray(overlayRes.data) ? overlayRes.data : [];

      const saveRes = await api.upsertKV(sessionToken, products.OVERLAY_KEY, [...overlay, row]);
      if (!saveRes.ok) throw new ToolError('save_failed', `Сервер отклонил создание продукта: ${saveRes.error}`);
      catalogPromise = null;

      const extras = [];
      if (row.brand) extras.push(`бренд ${row.brand}`);
      if (row.barcode) extras.push(`штрихкод ${row.barcode}`);
      if (row.portions) extras.push(`порции: ${row.portions.map((p) => `${p.name} ${p.grams} г`).join(', ')}`);

      return {
        text: `Создал продукт «${row.name}» — ${row.kcal100} ккал/100 г, Б${row.protein100} У${row.carbs100} Ж${row.fat100}${extras.length ? '. ' + extras.join(', ') : ''}. Калорийность пересчитана по правилам HEYS, поэтому может отличаться от цифры на упаковке.`,
        structured: {
          product_id: row.id,
          name: row.name,
          kcal100: row.kcal100,
          protein100: row.protein100,
          carbs100: row.carbs100,
          fat100: row.fat100,
          brand: row.brand,
          barcode: row.barcode,
          portions: row.portions || [],
        },
      };
    },

    async heys_save_meal_preset(args) {
      const name = String(args.name || '').trim();
      if (!name) throw new ToolError('invalid_name', 'Нужно название набора.');

      const specs = Array.isArray(args.items) ? args.items : [];
      if (!specs.length) throw new ToolError('invalid_items', 'Нужна хотя бы одна позиция в items.');
      if (specs.length > 20) throw new ToolError('invalid_items', 'В наборе не больше 20 позиций.');

      const resolved = [];
      for (let i = 0; i < specs.length; i += 1) {
        resolved.push(await resolveItem(specs[i], i));
      }

      // Перечитываем прямо перед записью: ключ пишется целым блобом, без merge,
      // поэтому чем короче окно между чтением и записью, тем меньше риск гонки
      // с отложенной (500 мс) выгрузкой из приложения.
      presetsPromise = null;
      const presets = await loadPresets();

      const target = args.preset_id
        ? presets.find((p) => String(p.id) === String(args.preset_id))
        : presets.find((p) => products.normalizeText(p.name) === products.normalizeText(name));
      if (args.preset_id && !target) {
        throw new ToolError('preset_not_found', `Набор с id "${args.preset_id}" не найден.`);
      }

      const preset = {
        id: target ? target.id : `mp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        name,
        items: resolved.map(({ product, grams }) => buildPresetItem(product, grams)),
        createdAt: target ? (target.createdAt || nowMs) : nowMs,
        updatedAt: nowMs,
      };

      // Приложение кладёт новые наборы в начало списка — сохраняем тот же порядок.
      const next = target
        ? presets.map((p) => (String(p.id) === String(preset.id) ? preset : p))
        : [preset, ...presets];

      const res = await api.upsertKV(sessionToken, PRESETS_KEY, next);
      if (!res.ok) throw new ToolError('save_failed', `Сервер отклонил сохранение набора: ${res.error}`);
      presetsPromise = Promise.resolve(next);

      const itemsText = preset.items.map((i) => `${i.name} ${i.grams} г`).join(' + ');
      return {
        text: `${target ? 'Обновил' : 'Сохранил'} набор «${name}»: ${itemsText}. В открытом приложении появится в течение ~15 секунд; если модалка наборов открыта — переоткрой её.`,
        structured: { preset_id: preset.id, name, created: !target, items: preset.items.map((i) => ({ name: i.name, grams: i.grams })) },
      };
    },

    async heys_delete_meal_preset(args) {
      if (!args.preset_id && !args.name) {
        throw new ToolError('invalid_args', 'Нужен preset_id или name.');
      }
      presetsPromise = null;
      const presets = await loadPresets();
      const wanted = args.preset_id ? null : products.normalizeText(args.name);
      const target = args.preset_id
        ? presets.find((p) => String(p.id) === String(args.preset_id))
        : presets.find((p) => products.normalizeText(p.name) === wanted);
      if (!target) throw new ToolError('preset_not_found', 'Такой набор не найден.');

      const next = presets.filter((p) => p !== target);
      const res = await api.upsertKV(sessionToken, PRESETS_KEY, next);
      if (!res.ok) throw new ToolError('save_failed', `Сервер отклонил удаление набора: ${res.error}`);
      presetsPromise = Promise.resolve(next);
      return {
        text: `Удалил набор «${target.name}». Осталось наборов: ${next.length}.`,
        structured: { preset_id: target.id, name: target.name, deleted: true, remaining: next.length },
      };
    },

    async heys_list_meal_presets() {
      const presets = await loadPresets();
      const described = presets.map((preset) => ({
        preset_id: preset.id,
        name: preset.name,
        items: preset.items.map((item) => ({ name: item.name, grams: Number(item.grams) || 100 })),
      }));
      const text = described.length
        ? `Сохранённые наборы: ${described.map((p) => `«${p.name}» (${p.items.map((i) => `${i.name} ${i.grams} г`).join(' + ')})`).join('; ')}`
        : 'Сохранённых наборов нет.';
      return { text, structured: { presets: described } };
    },

    async heys_delete_meal(args) {
      const date = resolveDate(args.date, nowMs);
      if (!args.meal_id) throw new ToolError('invalid_meal_id', 'Нужен meal_id (его отдаёт heys_get_day).');
      const current = await readDay(date);
      const { day: next, removed } = day.deleteMeal(current, args.meal_id, { nowMs, clientId });
      if (!removed) throw new ToolError('meal_not_found', `Приём ${args.meal_id} не найден в дне ${date}.`);
      await writeDay(date, next, Number(current.updatedAt) || 0);
      return { text: `Удалил приём ${args.meal_id} из дня ${date}.`, structured: { date, meal_id: args.meal_id, deleted: true } };
    },

    async heys_add_water(args) {
      const date = resolveDate(args.date, nowMs);
      const ml = Number(args.ml);
      if (!Number.isFinite(ml) || ml === 0 || Math.abs(ml) > 5000) {
        throw new ToolError('invalid_ml', 'Поле ml должно быть числом от -5000 до 5000 и не равным нулю.');
      }
      const current = await readDay(date);
      const next = day.addWater(current, ml, { nowMs, clientId });
      await writeDay(date, next, Number(current.updatedAt) || 0);
      return {
        text: `Вода за ${date}: ${next.waterMl} мл (${ml > 0 ? '+' : ''}${ml}).`,
        structured: { date, water_ml: next.waterMl, delta_ml: ml },
      };
    },

    async heys_log_training(args) {
      const date = resolveDate(args.date, nowMs);
      const zones = Array.isArray(args.zones_minutes) ? args.zones_minutes : null;
      if (!zones || zones.length === 0 || zones.length > day.HR_ZONES) {
        throw new ToolError('invalid_zones', `zones_minutes — массив минут по пульсовым зонам, от 1 до ${day.HR_ZONES} чисел.`);
      }
      const total = zones.reduce((sum, value) => sum + (Number(value) || 0), 0);
      if (total <= 0) throw new ToolError('invalid_zones', 'Суммарная длительность тренировки должна быть больше нуля.');
      const current = await readDay(date);
      const next = day.addTraining(current, zones, { nowMs, clientId });
      await writeDay(date, next, Number(current.updatedAt) || 0);
      return {
        text: `Записал тренировку ${date}: ${total} мин по зонам [${zones.join(', ')}].`,
        structured: { date, zones_minutes: zones, total_minutes: total },
      };
    },

    async heys_update_day(args) {
      const date = resolveDate(args.date, nowMs);
      const fields = {
        weight: args.weight,
        steps: args.steps,
        household_min: args.household_min,
        sleep_start: args.sleep_start,
        sleep_end: args.sleep_end,
        sleep_quality: clampSubjective(args.sleep_quality, 'sleep_quality'),
        sleep_note: args.sleep_note,
        comment: args.comment,
        mood: clampSubjective(args.mood, 'mood'),
        wellbeing: clampSubjective(args.wellbeing, 'wellbeing'),
        stress: clampSubjective(args.stress, 'stress'),
      };
      const current = await readDay(date);
      let updated;
      try {
        updated = day.updateDayFields(current, fields, { nowMs, clientId });
      } catch (e) {
        throw new ToolError('invalid_field', e.message);
      }
      if (!updated.applied.length) throw new ToolError('nothing_to_update', 'Не передано ни одного поля для обновления.');
      await writeDay(date, updated.day, Number(current.updatedAt) || 0);
      return {
        text: `Обновил ${date}: ${updated.applied.join(', ')}.`,
        structured: { date, updated: updated.applied },
      };
    },
  };

  return { tools, ToolError };
}

const DATE_ARG = { type: 'string', description: 'Дата в формате YYYY-MM-DD. По умолчанию — сегодня по московскому времени.' };

/** Одна позиция: какой продукт и сколько. Количество — граммы либо штуки. */
const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    product_id: { type: 'string', description: 'Точный id продукта из heys_search_products.' },
    query: { type: 'string', description: 'Название продукта, если id неизвестен.' },
    grams: { type: 'number', description: 'Вес порции в граммах (для напитков — миллилитры).' },
    pieces: { type: 'number', description: 'Количество штук, когда пользователь считает штуками («четыре конфеты»). Вес одной штуки берётся из карточки продукта — не подставляй граммы от себя.' },
    piece_grams: { type: 'number', description: 'Вес одной штуки в граммах. Нужен только если в карточке продукта его ещё нет: инструмент попросит, а полученное значение сохранит в карточку.' },
  },
};

const TOOL_SCHEMAS = [
  {
    name: 'heys_get_day',
    description: 'Показать день пользователя в HEYS: приёмы пищи с id и калориями, итоги по БЖУ, вода, вес, сон, настроение, тренировки. Вызывай перед правкой или удалением приёма, чтобы взять meal_id.',
    inputSchema: {
      type: 'object',
      properties: { date: DATE_ARG },
    },
  },
  {
    name: 'heys_search_products',
    description: 'Найти продукт в базе HEYS: сначала личный список пользователя, затем общая база. Возвращает product_id, калорийность на 100 г и типовые порции. Используй, когда нужно уточнить, какой именно продукт имеется в виду.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Название продукта, например «флэт уайт» или «овсянка».' },
        limit: { type: 'integer', description: 'Сколько вариантов вернуть (1–50, по умолчанию 10).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'heys_log_meal',
    description: 'Создать приём пищи в дневнике. Составной напиток или блюдо вносится набором позиций, а не одним «итоговым» продуктом: сначала проверь heys_list_meal_presets — если у пользователя есть подходящий сохранённый набор, вноси его через preset. Каждая позиция задаётся product_id (точно) или query (поиск по названию) плюс граммы. Если по query несколько похожих продуктов, инструмент вернёт кандидатов — тогда уточни у пользователя, а не угадывай.',
    inputSchema: {
      type: 'object',
      properties: {
        preset: { type: 'string', description: 'Имя или preset_id сохранённого набора из heys_list_meal_presets. Позиции набора добавляются к items.' },
        preset_grams: { type: 'object', description: 'Переопределение граммовок для позиций набора: { "Молоко ультрапастеризованное 3.5": 200 }.' },
        items: {
          type: 'array',
          description: 'Позиции приёма.',
          items: ITEM_SCHEMA,
        },
        date: DATE_ARG,
        time: { type: 'string', description: 'Время приёма HH:MM. По умолчанию — текущее московское время.' },
        name: { type: 'string', description: 'Название приёма. По умолчанию подбирается по времени: Завтрак / Обед / Ужин / Перекус.' },
        mood: { type: 'integer', description: 'Настроение во время приёма, 1–10.' },
        wellbeing: { type: 'integer', description: 'Самочувствие во время приёма, 1–10.' },
        stress: { type: 'integer', description: 'Стресс во время приёма, 1–10.' },
      },
    },
  },
  {
    name: 'heys_update_meal',
    description: 'Изменить уже записанный приём: добавить позиции, убрать их, поправить граммовку, переименовать, сдвинуть время. Именно этим инструментом вносится «добавь туда ещё» — НЕ удаляй и не пересоздавай приём, иначе он получит новый id и потеряет оценки самочувствия. meal_id и id позиций берутся из heys_get_day.',
    inputSchema: {
      type: 'object',
      properties: {
        meal_id: { type: 'string', description: 'Идентификатор приёма из heys_get_day.' },
        date: DATE_ARG,
        add_items: { type: 'array', description: 'Позиции, которые нужно добавить к приёму.', items: ITEM_SCHEMA },
        remove_item_ids: { type: 'array', items: { type: 'string' }, description: 'Id позиций, которые нужно убрать из приёма.' },
        set_grams: { type: 'object', description: 'Новые граммовки для позиций по их id: { "it_08399c46e4ff": 180 }.' },
        name: { type: 'string', description: 'Новое название приёма.' },
        time: { type: 'string', description: 'Новое время приёма HH:MM.' },
        mood: { type: 'integer', description: 'Настроение во время приёма, 1–10.' },
        wellbeing: { type: 'integer', description: 'Самочувствие во время приёма, 1–10.' },
        stress: { type: 'integer', description: 'Стресс во время приёма, 1–10.' },
      },
      required: ['meal_id'],
    },
  },
  {
    name: 'heys_list_meal_presets',
    description: 'Показать сохранённые наборы приёмов пользователя (готовые комбинации продуктов с граммовками). Вызывай перед записью составного приёма — набор точнее ручной сборки и совпадает с тем, как пользователь ведёт дневник сам.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'heys_create_product',
    description: [
      'Создать новый продукт в личном списке пользователя — например по фотографии этикетки с составом и пищевой ценностью.',
      'Все значения указываются НА 100 Г продукта. Если на упаковке пищевая ценность дана на порцию, пересчитай на 100 г сам.',
      'Обязательны: protein100, simple100, complex100, badFat100, goodFat100, trans100, fiber100, gi, harm.',
      'Как заполнять то, чего нет на этикетке: simple100 — «в том числе сахара»; complex100 = углеводы минус сахара; badFat100 — «в том числе насыщенные»; goodFat100 = жиры минус насыщенные минус транс; trans100 — 0, если не указано; fiber100 — 0, если не указано.',
      'gi — гликемический индекс 0–100 по оценке, harm — вредность 0–10 по шкале HEYS (цельный продукт ближе к 0, ультрапереработанный со сложным составом ближе к 10).',
      'Калорийность не передаётся: HEYS считает её сам по своей формуле, поэтому она может отличаться от цифры на упаковке — это нормально и так задумано.',
      'Штрихкод и порции указывай, если они видны на упаковке.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Название продукта. Если есть бренд, лучше включить его в название — так проще искать.' },
        brand: { type: 'string', description: 'Производитель или бренд.' },
        barcode: { type: 'string', description: 'Штрихкод с упаковки, 6–32 символа.' },
        protein100: { type: 'number', description: 'Белки, г на 100 г.' },
        simple100: { type: 'number', description: 'Простые углеводы (сахара), г на 100 г.' },
        complex100: { type: 'number', description: 'Сложные углеводы, г на 100 г.' },
        carbs100: { type: 'number', description: 'Углеводы всего, г. Если не указать — сумма простых и сложных.' },
        badFat100: { type: 'number', description: 'Насыщенные жиры, г на 100 г.' },
        goodFat100: { type: 'number', description: 'Ненасыщенные жиры, г на 100 г.' },
        trans100: { type: 'number', description: 'Транс-жиры, г на 100 г.' },
        fat100: { type: 'number', description: 'Жиры всего, г. Если не указать — сумма насыщенных, ненасыщенных и транс.' },
        fiber100: { type: 'number', description: 'Клетчатка, г на 100 г.' },
        gi: { type: 'number', description: 'Гликемический индекс, 0–100.' },
        harm: { type: 'number', description: 'Вредность по шкале HEYS, 0–10.' },
        sodium100: { type: 'number', description: 'Натрий, мг на 100 г.' },
        cholesterol: { type: 'number', description: 'Холестерин, мг на 100 г.' },
        omega3_100: { type: 'number', description: 'Омега-3, г на 100 г.' },
        omega6_100: { type: 'number', description: 'Омега-6, г на 100 г.' },
        nova_group: { type: 'integer', description: 'Группа NOVA, 1–4 (степень переработки).' },
        nutrient_density: { type: 'number', description: 'Нутриентная плотность, 0–100.' },
        additives: { type: 'array', items: { type: 'string' }, description: 'E-добавки из состава, например ["E322","E500"].' },
        is_organic: { type: 'boolean', description: 'Органический продукт.' },
        is_whole_grain: { type: 'boolean', description: 'Цельнозерновой.' },
        is_fermented: { type: 'boolean', description: 'Ферментированный.' },
        is_raw: { type: 'boolean', description: 'Сырой, без термообработки.' },
        portions: {
          type: 'array',
          description: 'Типовые порции с упаковки, например одна печенька или один стакан.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Название порции, например «1 шт».' },
              grams: { type: 'number', description: 'Вес порции в граммах.' },
            },
            required: ['name', 'grams'],
          },
        },
        allow_duplicate: { type: 'boolean', description: 'Создать, даже если продукт с таким названием уже есть или был удалён. Ставь только после подтверждения пользователя.' },
      },
      required: ['name', 'protein100', 'simple100', 'complex100', 'badFat100', 'goodFat100', 'trans100', 'fiber100', 'gi', 'harm'],
    },
  },
  {
    name: 'heys_save_meal_preset',
    description: 'Создать новый набор приёма или обновить существующий. Предлагай это, когда пользователь второй-третий раз вносит ту же комбинацию продуктов. Если передан preset_id или совпало название — набор перезаписывается, иначе создаётся новый.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Название набора, например «Кофе Киндерли».' },
        items: {
          type: 'array',
          description: 'Позиции набора.',
          items: ITEM_SCHEMA,
        },
        preset_id: { type: 'string', description: 'Id существующего набора для обновления.' },
      },
      required: ['name', 'items'],
    },
  },
  {
    name: 'heys_delete_meal_preset',
    description: 'Удалить сохранённый набор приёма по preset_id или точному названию.',
    inputSchema: {
      type: 'object',
      properties: {
        preset_id: { type: 'string', description: 'Id набора из heys_list_meal_presets.' },
        name: { type: 'string', description: 'Точное название набора, если id неизвестен.' },
      },
    },
  },
  {
    name: 'heys_delete_meal',
    description: 'Удалить приём пищи целиком по meal_id (взять из heys_get_day). Только когда приём не нужен вовсе; чтобы поправить состав или граммовку — heys_update_meal.',
    inputSchema: {
      type: 'object',
      properties: { meal_id: { type: 'string', description: 'Идентификатор приёма.' }, date: DATE_ARG },
      required: ['meal_id'],
    },
  },
  {
    name: 'heys_add_water',
    description: 'Добавить выпитую воду в миллилитрах за день. Значение прибавляется к текущему; отрицательное число уменьшает (для исправления).',
    inputSchema: {
      type: 'object',
      properties: { ml: { type: 'number', description: 'Сколько миллилитров добавить.' }, date: DATE_ARG },
      required: ['ml'],
    },
  },
  {
    name: 'heys_log_training',
    description: 'Записать тренировку как минуты по пульсовым зонам: [зона1, зона2, зона3, зона4]. Если известна только общая длительность и интенсивность, положи минуты в соответствующую зону.',
    inputSchema: {
      type: 'object',
      properties: {
        zones_minutes: { type: 'array', items: { type: 'number' }, description: 'Минуты по пульсовым зонам, до 4 чисел.' },
        date: DATE_ARG,
      },
      required: ['zones_minutes'],
    },
  },
  {
    name: 'heys_update_day',
    description: 'Обновить дневные показатели: утренний вес, шаги, бытовая активность, сон (начало, конец, качество), настроение, самочувствие, стресс, комментарий к дню.',
    inputSchema: {
      type: 'object',
      properties: {
        date: DATE_ARG,
        weight: { type: 'number', description: 'Утренний вес, кг.' },
        steps: { type: 'integer', description: 'Шаги за день.' },
        household_min: { type: 'integer', description: 'Минуты бытовой активности.' },
        sleep_start: { type: 'string', description: 'Время засыпания HH:MM.' },
        sleep_end: { type: 'string', description: 'Время подъёма HH:MM.' },
        sleep_quality: { type: 'integer', description: 'Качество сна, 1–10.' },
        sleep_note: { type: 'string', description: 'Заметка про сон.' },
        mood: { type: 'integer', description: 'Настроение за день, 1–10.' },
        wellbeing: { type: 'integer', description: 'Самочувствие за день, 1–10.' },
        stress: { type: 'integer', description: 'Стресс за день, 1–10.' },
        comment: { type: 'string', description: 'Комментарий к дню.' },
      },
    },
  },
];

module.exports = { createTools, TOOL_SCHEMAS, ToolError, defaultMealName, makeId };
