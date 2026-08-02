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
const profile = require('./profile');
const sharedCatalog = require('./shared-catalog');

/** Верхняя граница обзора периода: месяц читается одним пакетом без риска для таймаута. */
const MAX_PERIOD_DAYS = 31;

/** Ключи планирования, из которых собирается сводка по задачам клиента. */
const PLANNING_KEYS = [
  'heys_planning_tasks',
  'heys_planning_projects',
  'heys_planning_goals_v1',
  'heys_planning_checklists_v1',
];

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
function createTools({ api, sessionToken, clientId, nowMs = Date.now(), byCurator = false }) {
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

  /**
   * Пакетное чтение с деградацией в поштучное: адаптеры API старше этого
   * инструмента метода не имеют, и терять из-за этого весь инструмент нельзя.
   */
  async function readMany(keys) {
    if (typeof api.getKVMany === 'function') {
      const { data, error } = await api.getKVMany(sessionToken, keys);
      if (error) throw new ToolError('upstream_error', `Не удалось прочитать данные клиента: ${error.message}`);
      return data || {};
    }
    const out = {};
    for (const key of keys) {
      const { data, error } = await api.getKV(sessionToken, key);
      if (error) throw new ToolError('upstream_error', `Не удалось прочитать ${key}: ${error.message}`);
      out[key] = data;
    }
    return out;
  }

  /** Чтение → патч → merge для ключей карточки клиента (профиль, нормы, зоны). */
  async function saveCardKey(key, value, lastSeenUpdatedAt) {
    const res = await api.mergeSaveKV(sessionToken, key, value, lastSeenUpdatedAt);
    if (!res.ok) throw new ToolError('save_failed', `Сервер отклонил запись ${key}: ${res.error}`);
    return res;
  }

  async function writeDay(date, nextDay, lastSeenUpdatedAt) {
    const res = await api.mergeSaveKV(sessionToken, day.dayKey(date), nextDay, lastSeenUpdatedAt);
    if (!res.ok) throw new ToolError('save_failed', `Сервер отклонил запись дня ${date}: ${res.error}`);
    return res;
  }

  /**
   * Состояние дня после записи — считается по блобу, который вернул сервер
   * (`v` из merge_save), а не по нашей оптимистичной копии.
   *
   * Зачем: инструмент отчитывается «внёс» сразу после ok, и до сих пор это был
   * отчёт о намерении. Если merge принял чужую параллельную правку, отбросил
   * нашу как stale или в дне уже лежит такой же приём от повторного вызова —
   * по ответу это не видно, а следующего heys_get_day ассистент обычно не
   * делает. Итог дня возвращается тем же запросом, без лишнего round-trip.
   */
  function dayAfterWrite(res, fallbackDay) {
    const saved = (res && res.value && typeof res.value === 'object' && !Array.isArray(res.value))
      ? res.value
      : fallbackDay;
    return {
      date: saved.date || fallbackDay.date,
      totals: day.macroTotals(saved.meals),
      meals: (saved.meals || []).length,
      water_ml: Number(saved.waterMl) || 0,
      // 'saved' — наша версия победила, 'day_merged' — сервер слил с облачной,
      // 'stale_write_blocked' — нашу отбросили. Последнее ассистент обязан
      // назвать вслух, а не отчитаться «записал».
      outcome: (res && res.outcome) || null,
    };
  }

  /** Хвост к тексту ответа: то же, что в day_after, одной строкой для модели. */
  function dayAfterText(after) {
    return ` Итого за ${after.date}: ${after.totals.kcal} ккал, приёмов ${after.meals}, вода ${after.water_ml} мл.`;
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
      // Тип приёма проставляем сами, по времени и составу: без `mealType`
      // дневник подписывает приём собственным расчётом, и запись куратора
      // оказывается не тем, чем она является. Название куратора и имя набора
      // сильнее — они и есть ответ на вопрос «что это было».
      const classified = day.classifyMeal(meal, current);
      meal.mealType = classified.mealType;
      if (!args.name && !presetName) meal.name = classified.name;

      const next = day.addMeal(current, meal, { nowMs, clientId });
      const saved = await writeDay(date, next, Number(current.updatedAt) || 0);
      const after = dayAfterWrite(saved, next);
      const learned = await persistPieceGrams(resolved);

      const kcal = day.macroTotals([meal]);
      const itemsText = meal.items.map((item) => `${item.name} ${item.grams} г`).join(', ');
      const learnedText = learned.length
        ? ` Запомнил вес штуки: ${learned.map((l) => `${l.name} — ${l.grams} г`).join(', ')}.`
        : '';
      // Тип называем вслух, когда подпись приёма его не показывает (набор,
      // своё название): куратор должен видеть, чем запись легла в дневник, и
      // успеть поправить, если это не обед.
      const typeHint = meal.name === classified.name ? '' : ` (${classified.name})`;
      return {
        text: `Записал: ${meal.name}${typeHint} в ${time} (${date}) — ${itemsText}. ≈${kcal.kcal} ккал, Б${kcal.protein} У${kcal.carbs} Ж${kcal.fat}.${learnedText}${dayAfterText(after)}`,
        structured: {
          date,
          meal_id: meal.id,
          name: meal.name,
          meal_type: meal.mealType,
          time,
          totals: kcal,
          items: meal.items.map((i) => ({ id: i.id, name: i.name, grams: i.grams })),
          learned_piece_grams: learned.length ? learned : undefined,
          day_after: after,
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

      const saved = await writeDay(date, result.day, Number(current.updatedAt) || 0);
      const after = dayAfterWrite(saved, result.day);
      const learned = await persistPieceGrams(resolved);

      const kcal = day.macroTotals([result.meal]);
      const learnedText = learned.length
        ? ` Запомнил вес штуки: ${learned.map((l) => `${l.name} — ${l.grams} г`).join(', ')}.`
        : '';
      return {
        text: `Обновил «${result.meal.name}» (${result.meal.time}, ${date}): ${result.changed.join('; ')}. Теперь в приёме ${result.meal.items.length} позиций, ≈${kcal.kcal} ккал, Б${kcal.protein} У${kcal.carbs} Ж${kcal.fat}.${learnedText}${dayAfterText(after)}`,
        structured: {
          date,
          meal_id: result.meal.id,
          name: result.meal.name,
          time: result.meal.time,
          changed: result.changed,
          totals: kcal,
          items: result.meal.items.map((i) => ({ id: i.id, name: i.name, grams: i.grams })),
          learned_piece_grams: learned.length ? learned : undefined,
          day_after: after,
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
          // Карточка целиком нужна кураторскому слою: по ней считается
          // отпечаток для общей базы. Без неё пришлось бы пересобирать
          // продукт из аргументов и разойтись с тем, что реально записано.
          created_row: row,
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
      const saved = await writeDay(date, next, Number(current.updatedAt) || 0);
      const after = dayAfterWrite(saved, next);
      return {
        text: `Удалил приём ${args.meal_id} из дня ${date}.${dayAfterText(after)}`,
        structured: { date, meal_id: args.meal_id, deleted: true, day_after: after },
      };
    },

    async heys_add_water(args) {
      const date = resolveDate(args.date, nowMs);
      const ml = Number(args.ml);
      if (!Number.isFinite(ml) || ml === 0 || Math.abs(ml) > 5000) {
        throw new ToolError('invalid_ml', 'Поле ml должно быть числом от -5000 до 5000 и не равным нулю.');
      }
      const current = await readDay(date);
      const next = day.addWater(current, ml, { nowMs, clientId });
      const saved = await writeDay(date, next, Number(current.updatedAt) || 0);
      const after = dayAfterWrite(saved, next);
      return {
        text: `Вода за ${date}: ${after.water_ml} мл (${ml > 0 ? '+' : ''}${ml}).${dayAfterText(after)}`,
        structured: { date, water_ml: after.water_ml, delta_ml: ml, day_after: after },
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
      const saved = await writeDay(date, next, Number(current.updatedAt) || 0);
      const after = dayAfterWrite(saved, next);
      return {
        text: `Записал тренировку ${date}: ${total} мин по зонам [${zones.join(', ')}].${dayAfterText(after)}`,
        structured: { date, zones_minutes: zones, total_minutes: total, day_after: after },
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
        updated = day.updateDayFields(current, fields, { nowMs, clientId, byCurator });
      } catch (e) {
        throw new ToolError('invalid_field', e.message);
      }
      if (!updated.applied.length) throw new ToolError('nothing_to_update', 'Не передано ни одного поля для обновления.');
      const saved = await writeDay(date, updated.day, Number(current.updatedAt) || 0);
      const after = dayAfterWrite(saved, updated.day);
      return {
        text: `Обновил ${date}: ${updated.applied.join(', ')}.${dayAfterText(after)}`,
        structured: { date, updated: updated.applied, day_after: after },
      };
    },

    /**
     * Правка личной карточки продукта. Нужна ровно затем, чтобы ошибка в
     * нутриентах не закрывалась созданием второго продукта с тем же именем:
     * дубль тянется в дневник, в наборы и в отчёты и живёт там годами.
     */
    async heys_update_product(args) {
      const catalog = await loadCatalog();
      const target = await resolveProduct(
        { product_id: args.product_id, query: args.query },
        'Продукт',
      );

      const { product_id: _id, query: _query, ...fields } = args;
      let built;
      try {
        built = products.buildProductPatch(target, fields, nowMs);
      } catch (e) {
        throw new ToolError('invalid_field', `Не могу применить правку: ${e.message}.`);
      }
      if (!built.changed.length) {
        throw new ToolError('nothing_to_update', built.ignored.length
          ? `Эти поля у продукта не хранятся: ${built.ignored.join(', ')}.`
          : `Карточка «${target.name}» уже содержит эти значения.`);
      }

      // Правка по имени — самый опасный вход: «поправь молоко» при трёх видах
      // молока должно упереться в вопрос, а не в тихую правку не той карточки.
      // Это уже обеспечивает resolveProduct, отказывающий при неоднозначности.
      const overlayRes = await api.getKV(sessionToken, products.OVERLAY_KEY);
      if (overlayRes.error) throw new ToolError('upstream_error', `Не удалось прочитать список продуктов: ${overlayRes.error.message}`);

      const { rows, mode } = products.applyProductPatchToOverlay(overlayRes.data, target, built.patch, {
        nowMs,
        makeId: () => `p_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
      });
      const saveRes = await api.upsertKV(sessionToken, products.OVERLAY_KEY, rows);
      if (!saveRes.ok) throw new ToolError('save_failed', `Сервер отклонил правку продукта: ${saveRes.error}`);
      catalogPromise = null;

      const note = mode === 'linked'
        ? ' Продукт был из общей базы — правка сохранена как личная версия, общая карточка не изменилась.'
        : mode === 'override'
          ? ' Правка сохранена поверх карточки общей базы, у других клиентов она не изменится.'
          : '';
      return {
        text: `Поправил «${target.name}»: ${built.changed.join('; ')}.${note}`,
        structured: {
          product_id: target.id,
          name: built.patch.name || target.name,
          mode,
          updated: built.changed,
          ignored: built.ignored,
          catalog_size: catalog.all.length,
        },
      };
    },

    /**
     * Удаление личного продукта. Кроме строки overlay обязателен tombstone:
     * без него облачная синхронизация вернёт продукт при следующем обмене, и
     * «удалил, а он на месте» — исторический баг именно этого механизма.
     */
    async heys_delete_product(args) {
      const target = await resolveProduct({ product_id: args.product_id, query: args.query }, 'Продукт');
      if (target._source !== 'own') {
        throw new ToolError(
          'shared_product',
          `«${target.name}» — продукт общей базы, а не личный список клиента. Удалить его отсюда нельзя; если он мешает, скажи об этом куратору.`,
        );
      }

      const [overlayRes, tombRes] = await Promise.all([
        api.getKV(sessionToken, products.OVERLAY_KEY),
        api.getKV(sessionToken, TOMBSTONES_KEY),
      ]);
      if (overlayRes.error) throw new ToolError('upstream_error', `Не удалось прочитать список продуктов: ${overlayRes.error.message}`);

      const overlay = Array.isArray(overlayRes.data) ? overlayRes.data : [];
      const rows = overlay.filter((row) => row && String(row.id) !== String(target.id));
      if (rows.length === overlay.length) {
        throw new ToolError('product_not_found', `Строка продукта «${target.name}» не найдена в личном списке.`);
      }

      const existing = Array.isArray(tombRes.data) ? tombRes.data : [];
      // Лимит и форма записи — те же, что в приложении (heys_core_v12.js):
      // список читается обеими сторонами, расхождение здесь означало бы
      // воскрешение продукта после синхронизации.
      const tombstones = [...existing.filter((t) => t && String(t.id) !== String(target.id)),
        { id: target.id, name: target.name || null, ts: nowMs }].slice(-200);

      const saveOverlay = await api.upsertKV(sessionToken, products.OVERLAY_KEY, rows);
      if (!saveOverlay.ok) throw new ToolError('save_failed', `Сервер отклонил удаление продукта: ${saveOverlay.error}`);
      const saveTomb = await api.upsertKV(sessionToken, TOMBSTONES_KEY, tombstones);
      if (!saveTomb.ok) {
        throw new ToolError(
          'tombstone_failed',
          `Продукт «${target.name}» убран из списка, но пометку об удалении сохранить не удалось (${saveTomb.error}). Синхронизация может вернуть его — проверь в приложении.`,
        );
      }
      catalogPromise = null;

      return {
        text: `Удалил продукт «${target.name}» из списка клиента.`,
        structured: { product_id: target.id, name: target.name, deleted: true },
      };
    },

    /**
     * Обзор периода. Отдельный инструмент нужен потому, что «как прошла
     * неделя» через heys_get_day — это семь вызовов и семь полных дневных
     * блобов; здесь один пакетный запрос и сводка без позиций приёмов.
     */
    async heys_get_period(args) {
      const to = resolveDate(args.to, nowMs);
      const from = args.from
        ? resolveDate(args.from, nowMs)
        : day.addDays(to, -(Math.min(Math.max(Number(args.days) || 7, 1), MAX_PERIOD_DAYS) - 1));
      if (from > to) throw new ToolError('invalid_range', `Начало периода (${from}) позже конца (${to}).`);
      const dates = day.enumerateDates(from, to, MAX_PERIOD_DAYS);
      if (dates.length >= MAX_PERIOD_DAYS && day.addDays(dates[dates.length - 1], 1) <= to) {
        throw new ToolError('invalid_range', `За один раз можно посмотреть не больше ${MAX_PERIOD_DAYS} дней.`);
      }

      const blobs = await readMany(dates.map((date) => day.dayKey(date)));
      const days = dates.map((date) => day.summarizeDayBrief(day.ensureDay(blobs[day.dayKey(date)], date, clientId, nowMs)));

      const filled = days.filter((d) => !d.empty);
      const average = (pick) => {
        const values = filled.map(pick).filter((v) => Number.isFinite(v) && v > 0);
        if (!values.length) return null;
        return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
      };
      const totals = {
        days: days.length,
        days_with_data: filled.length,
        avg_kcal: average((d) => d.kcal),
        avg_protein: average((d) => d.protein),
        avg_carbs: average((d) => d.carbs),
        avg_fat: average((d) => d.fat),
        avg_water_ml: average((d) => d.water_ml),
        avg_steps: average((d) => d.steps),
        avg_sleep_hours: average((d) => d.sleep_hours),
        training_min: filled.reduce((sum, d) => sum + d.training_min, 0),
        weight_first: (filled.find((d) => d.weight_morning) || {}).weight_morning ?? null,
        weight_last: ([...filled].reverse().find((d) => d.weight_morning) || {}).weight_morning ?? null,
      };
      const missing = days.filter((d) => d.empty).map((d) => d.date);

      const text = filled.length
        ? `Период ${from}…${to}: заполнено ${filled.length} из ${days.length} дней, в среднем ${totals.avg_kcal ?? '—'} ккал, вода ${totals.avg_water_ml ?? '—'} мл, шаги ${totals.avg_steps ?? '—'}, сон ${totals.avg_sleep_hours ?? '—'} ч.${missing.length ? ` Пустые дни: ${missing.join(', ')}.` : ''}`
        : `Период ${from}…${to}: данных нет ни за один день.`;
      return { text, structured: { from, to, totals, days, missing_dates: missing } };
    },

    /**
     * Задачи и цели клиента — только чтение.
     *
     * Запись сюда сознательно не сделана: планирование синхронизируется
     * заменой списка без tombstone'ов, и правка из коннектора в момент, когда
     * у клиента открыто приложение, потеряла бы его изменения. Чтение этой
     * проблемы не имеет.
     */
    async heys_get_planning(args = {}) {
      const blobs = await readMany(PLANNING_KEYS);
      const asArray = (value) => (Array.isArray(value) ? value : []);
      const tasks = asArray(blobs.heys_planning_tasks);
      const projects = asArray(blobs.heys_planning_projects);
      const goals = asArray(blobs.heys_planning_goals_v1);
      const checklists = asArray(blobs.heys_planning_checklists_v1);

      const today = day.nowParts(nowMs).date;
      const isTerminal = (t) => t && (t.status === 'done' || t.status === 'cancelled');
      const active = tasks.filter((t) => !isTerminal(t));
      const overdue = active.filter((t) => t && t.dueDate && t.dueDate < today);
      const dueToday = active.filter((t) => t && t.dueDate === today);
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);

      const describeTask = (t) => ({
        id: t.id ?? null,
        title: t.title || t.name || '(без названия)',
        status: t.status || null,
        due_date: t.dueDate || null,
        project_id: t.projectId ?? null,
      });

      return {
        text: `Задачи: активных ${active.length}, просрочено ${overdue.length}, на сегодня ${dueToday.length}. Проектов ${projects.length}, целей ${goals.length}, чек-листов ${checklists.length}.`,
        structured: {
          totals: {
            tasks_total: tasks.length,
            tasks_active: active.length,
            overdue: overdue.length,
            due_today: dueToday.length,
            projects: projects.length,
            goals: goals.length,
            checklists: checklists.length,
          },
          overdue: overdue.slice(0, limit).map(describeTask),
          due_today: dueToday.slice(0, limit).map(describeTask),
          active: active.slice(0, limit).map(describeTask),
        },
      };
    },

    /**
     * Тренировочные модули (пальцы, мобильность) — только чтение.
     *
     * Сессии этих модулей живут не в отдельном хранилище, а в тренировках
     * дневного блоба (`trainings[].type`), поэтому статус собирается из тех же
     * дней, что и остальной дневник — без обхода валидаторов самих модулей.
     */
    async heys_get_training_status(args = {}) {
      const to = resolveDate(args.to, nowMs);
      const days = Math.min(Math.max(Number(args.days) || 30, 1), MAX_PERIOD_DAYS);
      const from = day.addDays(to, -(days - 1));
      const dates = day.enumerateDates(from, to, MAX_PERIOD_DAYS);
      const blobs = await readMany(dates.map((date) => day.dayKey(date)));

      const sessions = [];
      for (const date of dates) {
        const blob = blobs[day.dayKey(date)];
        const trainings = (blob && Array.isArray(blob.trainings)) ? blob.trainings : [];
        trainings.forEach((tr, index) => {
          if (!tr || !tr.type) return;
          const log = tr.fingersLog || tr.mobilityLog || null;
          sessions.push({
            date,
            index,
            type: tr.type,
            program_id: (log && log.programId) || null,
            holds: (log && Array.isArray(log.holds)) ? log.holds.length : null,
            partial: !!(log && log.partial),
            note: tr.notes || '',
          });
        });
      }

      const byType = {};
      for (const s of sessions) {
        if (!byType[s.type]) byType[s.type] = { count: 0, last_date: null };
        byType[s.type].count += 1;
        if (!byType[s.type].last_date || s.date > byType[s.type].last_date) byType[s.type].last_date = s.date;
      }
      const summary = Object.entries(byType).map(([type, info]) => `${type}: ${info.count}, последняя ${info.last_date}`);

      return {
        text: sessions.length
          ? `Тренировки за ${from}…${to} — ${summary.join('; ')}.`
          : `За ${from}…${to} тренировок не записано.`,
        structured: { from, to, by_type: byType, sessions },
      };
    },

    /** Карточка клиента целиком: профиль, нормы и пульсовые зоны одним чтением. */
    async heys_get_profile() {
      const blobs = await readMany([profile.PROFILE_KEY, profile.NORMS_KEY, profile.ZONES_KEY]);
      const card = profile.describeCard(
        blobs[profile.PROFILE_KEY],
        blobs[profile.NORMS_KEY],
        Array.isArray(blobs[profile.ZONES_KEY]) && blobs[profile.ZONES_KEY].length
          ? blobs[profile.ZONES_KEY]
          : profile.DEFAULT_ZONES,
        nowMs,
      );
      const p = card.profile;
      const text = [
        `Профиль: ${p.gender || '—'}, ${p.age ?? '—'} лет, рост ${p.height ?? '—'} см, вес ${p.weight ?? '—'} кг`,
        p.weight_goal ? `цель ${p.weight_goal} кг` : null,
        p.deficit_pct_target ? `дефицит ${p.deficit_pct_target}%` : null,
        p.steps_goal ? `шаги ${p.steps_goal}` : null,
        `сон ${p.sleep_hours ?? '—'} ч`,
      ].filter(Boolean).join(', ') + '.';
      return { text, structured: card };
    },

    async heys_update_profile(args) {
      const blobs = await readMany([profile.PROFILE_KEY]);
      const current = blobs[profile.PROFILE_KEY];
      let patch;
      try {
        patch = profile.applyProfileFields(current, args, nowMs);
      } catch (e) {
        throw new ToolError(e.code || 'invalid_field', e.message);
      }
      if (!patch.changed.length) {
        throw new ToolError('nothing_to_update', patch.ignored.length
          ? `Эти поля профиль не хранит: ${patch.ignored.join(', ')}.`
          : 'Ни одно поле профиля не изменилось.');
      }
      await saveCardKey(profile.PROFILE_KEY, patch.value, Number(current && current.updatedAt) || 0);
      return {
        text: `Профиль обновлён — ${patch.changed.join('; ')}.`,
        structured: { updated: patch.changed, ignored: patch.ignored },
      };
    },

    async heys_update_norms(args) {
      const blobs = await readMany([profile.NORMS_KEY]);
      const current = blobs[profile.NORMS_KEY];
      let patch;
      try {
        patch = profile.applyNormsFields(current, args, nowMs);
      } catch (e) {
        throw new ToolError(e.code || 'invalid_field', e.message);
      }
      if (!patch.changed.length) {
        throw new ToolError('nothing_to_update', patch.ignored.length
          ? `Эти нормы не хранятся: ${patch.ignored.join(', ')}.`
          : 'Ни одна норма не изменилась.');
      }
      await saveCardKey(profile.NORMS_KEY, patch.value, Number(current && current.updatedAt) || 0);
      return {
        text: `Нормы обновлены — ${patch.changed.join('; ')}.`,
        structured: { updated: patch.changed, ignored: patch.ignored },
      };
    },

    async heys_update_hr_zones(args) {
      const patches = Array.isArray(args.zones) ? args.zones : [];
      if (!patches.length) throw new ToolError('nothing_to_update', 'Передай массив zones: [{ zone: 1, hr_from: 90, hr_to: 105 }].');
      const blobs = await readMany([profile.ZONES_KEY]);
      const current = blobs[profile.ZONES_KEY];
      let patch;
      try {
        patch = profile.applyZonePatches(current, patches);
      } catch (e) {
        throw new ToolError(e.code || 'invalid_field', e.message);
      }
      if (!patch.changed.length) throw new ToolError('nothing_to_update', 'Пульсовые зоны не изменились.');
      // Зоны — массив: сервер меняет его целиком, поэтому известного
      // updatedAt у значения нет и merge сводится к «свежее выигрывает».
      await saveCardKey(profile.ZONES_KEY, patch.value, 0);
      return {
        text: `Пульсовые зоны обновлены — ${patch.changed.join('; ')}.`,
        structured: {
          updated: patch.changed,
          hr_zones: patch.value.map((z, i) => ({ zone: i + 1, name: z.name, hr_from: z.hrFrom, hr_to: z.hrTo, met: z.MET })),
        },
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
    name: 'heys_get_period',
    description: 'Обзор нескольких дней сразу: калории и БЖУ по дням, вода, утренний вес, шаги, сон, тренировки, настроение, а также средние за период и список пустых дней. Вызывай на вопросы «как прошла неделя», «что с весом за месяц», «где пробелы в дневнике» — вместо того чтобы дёргать heys_get_day по одному дню. Позиции приёмов здесь не возвращаются: за составом конкретного дня иди в heys_get_day.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'Сколько последних дней показать, 1–31. По умолчанию 7. Игнорируется, если задан from.' },
        from: { type: 'string', description: 'Начало периода YYYY-MM-DD включительно.' },
        to: { type: 'string', description: 'Конец периода YYYY-MM-DD включительно. По умолчанию — сегодня.' },
      },
    },
  },
  {
    name: 'heys_get_planning',
    description: 'Задачи, проекты, цели и чек-листы клиента: сколько активных, что просрочено, что на сегодня. Только чтение — менять планирование из чата нельзя, его синхронизация этого не переживёт.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Сколько задач показать в каждом списке, по умолчанию 20.' },
      },
    },
  },
  {
    name: 'heys_get_training_status',
    description: 'Тренировочные модули клиента (пальцы, мобильность и прочие): сколько сессий за период, когда была последняя, какие программы. Только чтение — записывать тренировки модулей из чата нельзя, их протоколы проверяются в самом приложении. Обычная тренировка по пульсовым зонам записывается через heys_log_training.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'За сколько последних дней смотреть, 1–31. По умолчанию 30.' },
        to: { type: 'string', description: 'Последний день периода YYYY-MM-DD. По умолчанию — сегодня.' },
      },
    },
  },
  {
    name: 'heys_get_profile',
    description: 'Карточка клиента: пол, возраст, рост, вес, целевой вес, целевой дефицит, норма сна и шагов, трекинг цикла, доступ с десктопа, нормы рациона в процентах и пульсовые зоны. Вызывай перед правкой этих настроек и когда нужно понять, из чего считаются нормы клиента.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'heys_update_profile',
    description: 'Изменить настройки клиента, которые куратор обычно вбивает во вкладке «Пользователь»: рост, вес, целевой вес, дату рождения, пол, норму сна, целевой дефицит, цель по шагам, трекинг цикла, доступ с десктопа. Передавай только те поля, которые действительно меняешь: остальные останутся как были. Имя клиента отсюда не меняется.',
    inputSchema: {
      type: 'object',
      properties: {
        gender: { type: 'string', description: 'Пол: «Мужской» или «Женский».' },
        birth_date: { type: 'string', description: 'Дата рождения YYYY-MM-DD. Если задана, возраст считается автоматически.' },
        age: { type: 'integer', description: 'Возраст в годах — только если дата рождения неизвестна.' },
        height: { type: 'number', description: 'Рост, см.' },
        weight: { type: 'number', description: 'Текущий вес в профиле, кг. Утренний вес конкретного дня пишется через heys_update_day.' },
        base_weight: { type: 'number', description: 'Базовый вес, кг — точка отсчёта прогресса.' },
        weight_goal: { type: 'number', description: 'Целевой вес, кг. 0 — цель не задана.' },
        sleep_hours: { type: 'number', description: 'Норма сна, часов.' },
        insulin_wave_hours: { type: 'number', description: 'Длительность инсулиновой волны, часов (0.5–12).' },
        deficit_pct_target: { type: 'number', description: 'Целевой дефицит калорий в процентах, от -50 до 50.' },
        steps_goal: { type: 'integer', description: 'Цель по шагам за день.' },
        cycle_tracking_enabled: { type: 'boolean', description: 'Трекинг менструального цикла.' },
        desktop_allowed: { type: 'boolean', description: 'Разрешить клиенту вход с десктопа.' },
      },
    },
  },
  {
    name: 'heys_update_norms',
    description: 'Изменить нормы рациона клиента — доли белка, углеводов, простых углеводов, клетчатки, насыщенных и транс-жиров, пороги гликемического индекса и вредности. Все значения в процентах. Передавай только изменяемые поля.',
    inputSchema: {
      type: 'object',
      properties: {
        protein_pct: { type: 'number', description: 'Доля белка, %.' },
        carbs_pct: { type: 'number', description: 'Доля углеводов, %.' },
        simple_carb_pct: { type: 'number', description: 'Доля простых углеводов, %.' },
        fiber_pct: { type: 'number', description: 'Норма клетчатки, %.' },
        bad_fat_pct: { type: 'number', description: 'Доля насыщенных жиров, %.' },
        superbad_fat_pct: { type: 'number', description: 'Доля транс-жиров, %.' },
        gi_pct: { type: 'number', description: 'Порог гликемического индекса, %.' },
        harm_pct: { type: 'number', description: 'Порог вредности рациона, %.' },
      },
    },
  },
  {
    name: 'heys_update_hr_zones',
    description: 'Поправить границы пульсовых зон клиента: зона 1 — бытовая активность, 2 — умеренная, 3 — аэробная, 4 — анаэробная. Меняются только присланные зоны и только границы пульса и MET; названия зон фиксированы. По ним считаются калории тренировок, записанных через heys_log_training.',
    inputSchema: {
      type: 'object',
      properties: {
        zones: {
          type: 'array',
          description: 'Правки по зонам.',
          items: {
            type: 'object',
            properties: {
              zone: { type: 'integer', description: 'Номер зоны, 1–4.' },
              hr_from: { type: 'number', description: 'Нижняя граница пульса, уд/мин.' },
              hr_to: { type: 'number', description: 'Верхняя граница пульса, уд/мин.' },
              met: { type: 'number', description: 'MET зоны — во сколько раз расход выше покоя.' },
            },
            required: ['zone'],
          },
        },
      },
      required: ['zones'],
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
      'Клетчатка в HEYS — отдельная от углеводов масса, а не их часть. На российской этикетке углеводы уже указаны без пищевых волокон, и вычитать ничего не нужно. Но если этикетка импортная и клетчатка входит в «Total carbohydrate» (её часто печатают отступом как «in which: dietary fibre»), вычти её: complex100 = углеводы минус сахара минус клетчатка. Иначе клетчатка посчитается дважды — и как масса, и как калории.',
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
    name: 'heys_update_product',
    description: 'Поправить карточку продукта в списке клиента: нутриенты, название, бренд, штрихкод, порции, гликемический индекс, вредность. Используй это вместо heys_create_product, когда продукт уже есть, но в нём ошибка — второй продукт с тем же именем потом тянется в дневник, наборы и отчёты. Продукт из общей базы правится только для этого клиента: общая карточка не меняется. Калорийность пересчитывается сама. Клетчатка (fiber100) — отдельная от углеводов масса: в complex100 её включать не нужно.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Точный id продукта из heys_search_products.' },
        query: { type: 'string', description: 'Название продукта, если id неизвестен. При нескольких похожих инструмент попросит уточнить.' },
        name: { type: 'string', description: 'Новое название.' },
        brand: { type: 'string', description: 'Бренд. «нет» — очистить.' },
        barcode: { type: 'string', description: 'Штрихкод с упаковки.' },
        protein100: { type: 'number', description: 'Белки, г на 100 г.' },
        simple100: { type: 'number', description: 'Простые углеводы (сахара), г на 100 г.' },
        complex100: { type: 'number', description: 'Сложные углеводы, г на 100 г.' },
        badFat100: { type: 'number', description: 'Насыщенные жиры, г на 100 г.' },
        goodFat100: { type: 'number', description: 'Ненасыщенные жиры, г на 100 г.' },
        trans100: { type: 'number', description: 'Транс-жиры, г на 100 г.' },
        fiber100: { type: 'number', description: 'Клетчатка, г на 100 г.' },
        gi: { type: 'number', description: 'Гликемический индекс, 0–100.' },
        harm: { type: 'number', description: 'Вредность по шкале HEYS, 0–10.' },
        sodium100: { type: 'number', description: 'Натрий, мг на 100 г.' },
        nova_group: { type: 'integer', description: 'Группа NOVA, 1–4.' },
        additives: { type: 'array', items: { type: 'string' }, description: 'E-добавки из состава.' },
        portions: {
          type: 'array',
          description: 'Типовые порции. Передаётся целиком: новый список заменяет прежний.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Название порции, например «1 шт».' },
              grams: { type: 'number', description: 'Вес порции в граммах.' },
            },
            required: ['name', 'grams'],
          },
        },
      },
    },
  },
  {
    name: 'heys_delete_product',
    description: 'Удалить продукт из личного списка клиента вместе с пометкой об удалении, чтобы синхронизация не вернула его обратно. Продукты общей базы удалить нельзя. Уже записанные приёмы пищи не меняются: они хранят собственный слепок нутриентов.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Точный id продукта из heys_search_products.' },
        query: { type: 'string', description: 'Название продукта, если id неизвестен.' },
      },
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
        mood: { type: 'integer', description: 'Утреннее настроение из чек-ина, 1–10. Среднее за день считается вместе с оценками приёмов и тренировок.' },
        wellbeing: { type: 'integer', description: 'Утреннее самочувствие из чек-ина, 1–10.' },
        stress: { type: 'integer', description: 'Утренний стресс из чек-ина, 1–10.' },
        comment: { type: 'string', description: 'Комментарий к дню.' },
      },
    },
  },
];

/**
 * Инструменты, которые меняют данные клиента.
 *
 * Список живёт рядом с обработчиками намеренно: по нему кураторский режим
 * решает, можно ли принимать клиента по частичному совпадению имени. Завёл
 * новый пишущий инструмент — впиши его сюда, иначе адресовать запись можно
 * будет подстрокой. Тест `tools.test.cjs` сверяет список с обработчиками,
 * которые реально вызывают writeDay/saveCardKey/upsertKV.
 */
const WRITE_TOOLS = new Set([
  'heys_log_meal',
  'heys_update_meal',
  'heys_delete_meal',
  'heys_add_water',
  'heys_log_training',
  'heys_update_day',
  'heys_update_profile',
  'heys_update_norms',
  'heys_update_hr_zones',
  'heys_create_product',
  'heys_update_product',
  'heys_delete_product',
  'heys_save_meal_preset',
  'heys_delete_meal_preset',
]);

module.exports = { createTools, TOOL_SCHEMAS, WRITE_TOOLS, ToolError, defaultMealName, makeId };
