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
const webMirror = require('./web-mirror');
const cycleReleaseGate = require('./cycle_release_gate.cjs');

/** Верхняя граница обзора периода: месяц читается одним пакетом без риска для таймаута. */
const MAX_PERIOD_DAYS = 31;
/**
 * Окно для модели нагрузки: постоянная времени тренированности — 42 дня
 * (_kernel/heys_kernel_load_v1.js, DEFAULT_CTL_TAU). Читается одним батчем,
 * поэтому шире, чем MAX_PERIOD_DAYS: тот ограничивает листинг дней в ответе,
 * а не стоимость чтения.
 */
const LOAD_WINDOW_DAYS = 42;

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
 * Индекс программы куратора — кэш, не источник правды (CURATOR_TRAINING_
 * PROGRAM_PROTOCOL_2026-08-09.md, 4.2). Содержание всегда в днях (`plan`
 * на записи тренировки); ключ существует, чтобы показать цикл клиенту одним
 * чтением, не собирая блобы по всем датам программы.
 */
const PROGRAM_KEY = 'heys_training_program';

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

function mealItemFromResolved(entry, makeId) {
  const item = day.buildMealItem(entry.product, entry.grams, makeId);
  const snap = entry.recipeSnapshot;
  if (snap && Array.isArray(snap.recipe_items) && snap.recipe_items.length) {
    item.recipe_items = snap.recipe_items;
    item.recipe_yield = snap.recipe_yield;
    item.recipe_rev = snap.recipe_rev;
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

/**
 * Слой 6: сырое сравнение подходов planSnapshot vs фактического workoutLog —
 * только факты (вес/повторы отличаются или нет), без оценки значимости
 * расхождения (протокол её сознательно не определяет).
 */
function compareProgramApproaches(plannedApproaches, actualApproaches) {
  const planned = Array.isArray(plannedApproaches) ? plannedApproaches : [];
  const actual = Array.isArray(actualApproaches) ? actualApproaches : [];
  const rows = [];
  for (let i = 0; i < Math.max(planned.length, actual.length); i++) {
    const p = planned[i];
    const a = actual[i];
    const pW = p ? Number(p.weightKg) || 0 : null;
    const aW = a ? Number(a.weightKg) || 0 : null;
    const pR = p ? Number(p.reps) || 0 : null;
    const aR = a ? Number(a.reps) || 0 : null;
    if (pW === aW && pR === aR) continue;
    rows.push({ index: i, planned_weight_kg: pW, actual_weight_kg: aW, planned_reps: pR, actual_reps: aR });
  }
  return rows;
}

/** Сравнение упражнений по позиции — та же форма, что уже читает heys_get_program_status. */
function compareProgramExercises(plannedExercises, actualExercises) {
  const planned = Array.isArray(plannedExercises) ? plannedExercises : [];
  const actual = Array.isArray(actualExercises) ? actualExercises : [];
  const out = [];
  for (let i = 0; i < Math.max(planned.length, actual.length); i++) {
    const p = planned[i];
    const a = actual[i];
    if (!p || !a) {
      out.push({ name: (a && a.name) || (p && p.name) || `упр. ${i + 1}`, structure_changed: true });
      continue;
    }
    if (p.name !== a.name) {
      out.push({ name: a.name, planned_name: p.name, structure_changed: true });
      continue;
    }
    const approaches = compareProgramApproaches(p.approaches, a.approaches);
    if (approaches.length) out.push({ name: a.name, approaches });
  }
  return out;
}

const RELATIVE_DATE_OFFSETS = {
  сегодня: 0,
  today: 0,
  вчера: -1,
  вчерашний: -1,
  yesterday: -1,
  позавчера: -2,
  позавчерашний: -2,
};

function resolveDate(input, nowMs) {
  if (input === undefined || input === null || input === '') return day.nowParts(nowMs).date;
  const raw = String(input).trim();
  const relative = RELATIVE_DATE_OFFSETS[raw.toLowerCase()];
  if (relative !== undefined) return day.addDays(day.nowParts(nowMs).date, relative);
  if (!day.isValidDate(raw)) {
    throw new ToolError('invalid_date', `Дата "${raw}" не в формате YYYY-MM-DD и не «вчера»/«позавчера».`);
  }
  return raw;
}

/**
 * «Сегодня» для чек-ина — тот же порог 3 утра, что в самом приложении
 * (apps/web/heys_morning_checkin_v1.js:getTodayKey). Это не общий `resolveDate`:
 * остальные day-инструменты берут календарную дату по Москве, и здесь этого
 * не менял — блока радиус слишком широкий для правки чек-ина. Расхождение
 * бьёт только в окне 00:00–03:00: календарный день уже следующий, а
 * приложение (и чек-ин вместе с ним) ещё живёт вчерашним.
 */
function checkinToday(nowMs) {
  return day.nowParts(nowMs - 3 * 60 * 60 * 1000).date;
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
function createTools({
  api,
  sessionToken,
  clientId,
  nowMs = Date.now(),
  byCurator = false,
  findPeerProduct = null,
  loadPeerHits = null,
}) {
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
   * Карточка продукта, восстановленная из снимка в самой позиции набора.
   *
   * `buildPresetItem` кладёт в позицию не только id и имя, но и весь набор
   * нутриентов на 100 г. До 21.08 этот снимок никто не читал: если карточки в
   * каталоге больше нет, разворачивание падало целиком — при том, что все
   * данные для записи приёма лежали прямо здесь.
   */
  function presetItemSnapshot(item) {
    const hasNutrients = PRESET_ITEM_FIELDS.some((field) => item[field] !== undefined && item[field] !== null);
    if (!hasNutrients) return null;
    const snapshot = { id: item.product_id != null ? item.product_id : null, name: item.name };
    for (const field of PRESET_ITEM_FIELDS) {
      if (item[field] !== undefined && item[field] !== null) snapshot[field] = item[field];
    }
    return snapshot;
  }

  /**
   * Позиции набора сохранялись давно и несут исторические product_id, которые
   * могли не пережить переезд на overlay. Поэтому id — это подсказка, а
   * авторитетом остаётся название: иначе набор молча потеряет позицию.
   *
   * Если не нашлось ни по id, ни по имени — приём всё равно пишется, по снимку
   * из самой позиции. Так делает приложение (`handleAddAll` в
   * apps/web/heys_add_product_step_v1.js), и MCP был строже него на пустом
   * месте: `preset_item_missing` ронял ВЕСЬ вызов, даже когда остальные
   * позиции живы. 21.08 на этом встал живой приём куратора, а на проде в таком
   * состоянии оказались четыре набора двух клиентов — карточки удалили, ссылки
   * в наборах остались (`heys_delete_product` их не проверяет).
   *
   * Отказ остаётся только там, где данных действительно нет: позиция без
   * нутриентного снимка — не еда, а пустая ссылка, и подставлять нули нельзя.
   */
  async function resolvePresetItem(item, presetName) {
    const catalog = await loadCatalog();
    const byId = item.product_id ? products.findById(catalog, item.product_id) : null;
    if (byId) return { product: byId, grams: Number(item.grams) || 100 };

    const nameNorm = products.normalizeText(item.name);
    const byName = catalog.all.find((p) => products.normalizeText(p.name) === nameNorm);
    if (byName) return { product: byName, grams: Number(item.grams) || 100 };

    const snapshot = presetItemSnapshot(item);
    if (snapshot) {
      return { product: snapshot, grams: Number(item.grams) || 100, fromSnapshot: true };
    }

    throw new ToolError(
      'preset_item_missing',
      `В наборе «${presetName}» продукт «${item.name}» не найден в базе, и в самом наборе его КБЖУ не сохранены — восстанавливать нечего. Собери приём позициями вручную.`,
    );
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

  /**
   * Гейт по тарифу Pro Спорт (CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09.md,
   * слой 5): «Программа тренировок на 4 недели» продаётся тарифом `proplus` —
   * лендинг и текст соглашения ([`heys_subscriptions_v1.js:66-77`](../../apps/web/heys_subscriptions_v1.js)),
   * до этой проверки серверного гейта не было ни в каком виде (только
   * клиентский UI-пейволл, обходимый прямым вызовом инструмента). Читает тот
   * же `heys_profile`, куда `activateSubscription` пишет `subscription_plan` —
   * второго источника правды по тарифу в MCP нет.
   */
  async function requireProSportTier(actionLabel) {
    const blobs = await readMany([profile.PROFILE_KEY]);
    const p = blobs[profile.PROFILE_KEY] || {};
    if (p.subscription_plan !== 'proplus') {
      throw new ToolError(
        'tariff_required',
        `${actionLabel} — функция тарифа Pro Спорт. У клиента сейчас «${p.subscription_plan || 'нет подписки'}». Оформи Pro Спорт (heys_manage_subscription) или предложи клиенту апгрейд.`,
      );
    }
  }

  /** Чтение → патч → merge для ключей карточки клиента (профиль, нормы, зоны). */
  async function saveCardKey(key, value, lastSeenUpdatedAt) {
    const res = await api.mergeSaveKV(sessionToken, key, value, lastSeenUpdatedAt);
    if (!res.ok) throw new ToolError('save_failed', `Сервер отклонил запись ${key}: ${res.error}`);
    return res;
  }

  const normInputsByDate = new Map();

  /**
   * Входы для нормы дня: профиль, проценты БЖУ, пульсовые зоны и блоб за
   * вчера. Читаются один раз на дату и одним пакетом.
   *
   * Вчерашний день нужен для NDTE — надбавки за вчерашнюю тренировку. В
   * браузере её источник лезет в localStorage, серверу блоб доступен напрямую,
   * и без него норма занижена на всю надбавку (до ~200 ккал).
   *
   * Сбой чтения гасим здесь же: норма — справочная величина в отчёте о записи,
   * и ронять из-за неё уже прошедшую запись еды нельзя. Куратор увидит «норма
   * не рассчитана», а не ошибку инструмента.
   */
  function loadNormInputs(date) {
    const cacheKey = date || '';
    if (!normInputsByDate.has(cacheKey)) {
      normInputsByDate.set(cacheKey, (async () => {
        // Окно долга — три дня до запрошенного, плюс четвёртый: он даёт
        // надбавку самому раннему дню окна. Всё одним пакетом.
        const backDates = date ? [1, 2, 3, 4].map((back) => day.addDays(date, -back)) : [];
        const keys = [profile.PROFILE_KEY, profile.NORMS_KEY, profile.ZONES_KEY]
          .concat(backDates.map((d) => day.dayKey(d)));
        try {
          const data = await readMany(keys);
          const pastBlobs = {};
          for (const d of backDates) pastBlobs[d] = data[day.dayKey(d)] || null;
          return {
            profile: data[profile.PROFILE_KEY] || null,
            norms: data[profile.NORMS_KEY] || null,
            hrZones: data[profile.ZONES_KEY] || null,
            // undefined — «вчера не читали», null — «читали, дня нет». Разница
            // важна: в первом случае dailyNorm падает на NDTE из отпечатка.
            prevDay: date ? pastBlobs[backDates[0]] : undefined,
            pastBlobs: date ? pastBlobs : null,
            nowMs,
          };
        } catch (_) {
          return null;
        }
      })());
    }
    return normInputsByDate.get(cacheKey);
  }

  async function writeDay(date, nextDay, lastSeenUpdatedAt) {
    // Запускаем до await'а записи: норма нужна сразу после неё, и читать её
    // последовательно значило бы добавить лишний round-trip к каждой записи еды.
    loadNormInputs(date);
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
  async function dayAfterWrite(res, fallbackDay) {
    const saved = (res && res.value && typeof res.value === 'object' && !Array.isArray(res.value))
      ? res.value
      : fallbackDay;
    return {
      date: saved.date || fallbackDay.date,
      totals: day.macroTotals(saved.meals),
      // Съеденное без нормы ни о чём не говорит: «1400 ккал» читается только
      // рядом с «из 1900». Источник цифры указан в norm.source — куратор должен
      // видеть, сверяется он с тем, что видит клиент, или с нашей оценкой.
      norm: day.dailyNorm(saved, await loadNormInputs(saved.date || fallbackDay.date)),
      meals: (saved.meals || []).length,
      water_ml: Number(saved.waterMl) || 0,
      // Показатели дня — из того же сохранённого блоба, что и калории. Без них
      // heys_update_day отчитывался «обновил steps», не показывая значения, и
      // потеря записи была неотличима от успеха (20.08.2026: шаги остались 0).
      steps: Number(saved.steps) || 0,
      weight_morning: saved.weightMorning ?? null,
      household_min: day.householdMinutes(saved),
      sleep: {
        start: saved.sleepStart || null,
        end: saved.sleepEnd || null,
        hours: day.totalSleepHours(saved) ?? saved.sleepHours ?? null,
        quality: saved.sleepQuality ?? null,
      },
      // Утренние отметки, а не средние по дню: коннектор пишет именно их.
      morning: {
        mood: saved.moodMorning ?? null,
        wellbeing: saved.wellbeingMorning ?? null,
        stress: saved.stressMorning ?? null,
      },
      sleep_note: saved.sleepNote || '',
      comment: saved.dayComment || '',
      is_refeed_day: saved.isRefeedDay === true,
      refeed_reason: saved.isRefeedDay === true ? (saved.refeedReason || null) : null,
      // 'saved' — наша версия победила, 'day_merged' — сервер слил с облачной,
      // 'stale_write_blocked' — нашу отбросили. Последнее ассистент обязан
      // назвать вслух, а не отчитаться «записал».
      outcome: (res && res.outcome) || null,
    };
  }

  /**
   * Как показать в тексте показатель, который правил этот вызов. Ключи — те же
   * публичные имена, что возвращает `applied` из day.updateDayFields.
   */
  const DAY_AFTER_FIELD_TEXT = {
    weight: (a) => (a.weight_morning == null ? null : `вес ${a.weight_morning} кг`),
    steps: (a) => `шаги ${a.steps}`,
    water: (a) => `вода ${a.water_ml} мл`,
    household_min: (a) => `быт ${a.household_min} мин`,
    sleep_start: (a) => (a.sleep.start ? `засыпание ${a.sleep.start}` : null),
    sleep_end: (a) => (a.sleep.end ? `подъём ${a.sleep.end}` : null),
    sleep_quality: (a) => (a.sleep.quality == null ? null : `качество сна ${a.sleep.quality}`),
    mood: (a) => (a.morning.mood == null ? null : `настроение ${a.morning.mood}`),
    wellbeing: (a) => (a.morning.wellbeing == null ? null : `самочувствие ${a.morning.wellbeing}`),
    stress: (a) => (a.morning.stress == null ? null : `стресс ${a.morning.stress}`),
    // Тексты не эхо'им целиком — в ответе важен факт, что запись доехала.
    sleep_note: (a) => (a.sleep_note ? 'заметка о сне записана' : null),
    comment: (a) => (a.comment ? 'комментарий записан' : null),
  };

  /**
   * Значения показателей после записи — по сохранённому блобу, а не по тому,
   * что мы отправляли. Печатаются только поля этого вызова: в ответе на еду или
   * воду шаги и сон были бы шумом.
   */
  function dayFieldsText(after, appliedFields) {
    if (!Array.isArray(appliedFields) || !appliedFields.length) return '';
    const parts = [];
    for (const name of appliedFields) {
      const format = DAY_AFTER_FIELD_TEXT[name];
      if (!format) continue;
      const text = format(after);
      if (text) parts.push(text);
    }
    return parts.length ? ` В дне после записи: ${parts.join(', ')}.` : '';
  }

  /**
   * Хвост к тексту ответа: показатели этого вызова + итог дня + outcome, если
   * запись не «чистая».
   * stale_write_blocked — в начале и явно: иначе модель отчитается «записал».
   */
  function dayAfterText(after, appliedFields) {
    const fields = dayFieldsText(after, appliedFields);
    const body = ` Итого за ${after.date}: ${after.totals.kcal} ккал, приёмов ${after.meals}, вода ${after.water_ml} мл.${normText(after.norm)}`;
    if (after.outcome === 'stale_write_blocked') {
      // Значения показываем и здесь: они доказывают, что в дне осталось старое.
      return ` НЕ ЗАПИСАНО (stale_write_blocked).${fields}${body}`;
    }
    if (after.outcome && after.outcome !== 'incoming_wins' && after.outcome !== 'saved') {
      return `${fields}${body} outcome=${after.outcome}.`;
    }
    return `${fields}${body}`;
  }

  /** Строка приёма для модели: id обязательны — structuredContent в Cursor часто не виден. */
  function formatMealLine(meal) {
    if (!meal) return '';
    const items = (meal.items || [])
      .map((item) => `${item.name || '?'} ${item.id || '?'} ${item.grams}г`)
      .join('; ');
    const time = meal.time ? ` ${meal.time}` : '';
    return `${meal.name || 'Приём'} ${meal.id || '?'}${time}: ${items || 'пусто'}`;
  }

  function formatDayMealsBlock(summary) {
    const meals = summary && Array.isArray(summary.meals) ? summary.meals : [];
    if (!meals.length) return '';
    return `\n${meals.map(formatMealLine).join('\n')}`;
  }

  /** Блоб дня после merge_save: серверная правда, иначе наша оптимистичная копия. */
  function savedDayBlob(res, fallbackDay) {
    if (res && res.value && typeof res.value === 'object' && !Array.isArray(res.value)) return res.value;
    return fallbackDay;
  }

  /** Норма одной строкой: цифра, БЖУ и откуда она взялась. */
  /**
   * Из чего сложилась активность дня — одной строкой в каждом ответе про день.
   *
   * Без неё в ответе была только норма, а она одинаково выглядит и при пяти
   * часах быта, и при неподвижном дне: 22.08.2026 «день почти неподвижный» было
   * написано по дню с 300 минутами быта, потому что в ответе на запись шагов
   * этих минут не было вовсе.
   */
  function activityText(norm) {
    const a = norm && norm.activity;
    if (!a) return '';
    const known = !!(norm && norm.source);
    const kcal = (value) => (known ? ` (+${value} ккал)` : '');
    const bits = [];
    if (a.steps > 0) bits.push(`шаги ${a.steps}${kcal(a.steps_kcal)}`);
    if (a.household_min > 0) bits.push(`быт ${a.household_min} мин${kcal(a.household_kcal)}`);
    if (a.trainings_min > 0) bits.push(`тренировки ${a.trainings_min} мин${kcal(a.trainings_kcal)}`);
    if (!bits.length) return ' Активность за день не отмечена: ни шагов, ни быта, ни тренировок.';
    const total = known ? ` → +${a.total_kcal} ккал в расход дня.` : '.';
    // Быт, записанный тренировкой, считается дважды, если его же вписать в
    // household_min. Называем минуты вслух, чтобы это было видно до записи.
    const mixed = a.household_as_training_min > 0
      ? ` Из тренировок ${a.household_as_training_min} мин — это записанный быт.`
      : '';
    return ` Активность: ${bits.join(', ')}${total}${mixed}`;
  }

  function normText(norm) {
    if (!norm || !norm.source) return ` Норма не рассчитана (${norm && norm.reason ? day.NORM_REASONS[norm.reason] : 'нет данных'}).${activityText(norm)}`;
    const approx = norm.source === 'estimate' ? '≈' : '';
    const macros = norm.protein_g === null
      ? ' (проценты БЖУ в карточке не заданы)'
      : `, Б${norm.protein_g} У${norm.carbs_g} Ж${norm.fat_g} г`;
    // Каждый источник называется своим именем. Раньше «та, что видит клиент»
    // стояло у всего, кроме оценки, — и протухший кэш подавался как истина.
    const FROM = {
      computed: ' — посчитана по данным дня',
      estimate: ' — расчётная оценка, история за прошлые дни недоступна',
    };
    return ` Норма: ${approx}${norm.kcal} ккал${macros}${FROM[norm.source] || FROM.estimate}.${activityText(norm)}`;
  }

  /**
   * Позиция задаётся product_id (точно) или query (поиск). При неоднозначном
   * совпадении инструмент не угадывает, а возвращает кандидатов — уточнение
   * дешевле, чем неверная еда в дневнике.
   */
  /**
   * Ингредиент рецепта: сначала личная карточка клиента, а чего у него нет —
   * из общей базы. Раньше любое второе совпадение по названию давало «не
   * найден», хотя личный «Огурец свежий» рядом с общим «Огурцом» — не
   * неоднозначность, а очевидный ответ: клиент ведёт дневник своей карточкой.
   * Настоящую неоднозначность («молоко» при трёх сортах) отдаём кандидатами,
   * а не молчаливой догадкой.
   */
  function findRecipeIngredient(catalog, spec) {
    if (spec.product_id) {
      const byId = products.findById(catalog, spec.product_id);
      if (byId) return byId;
    }
    if (!spec.query) return null;
    const matches = products.searchProducts(catalog, spec.query, 5);
    if (!matches.length) return null;

    const wanted = products.normalizeText(spec.query);
    const exactOwn = matches.filter((m) => m._source === 'own' && products.normalizeText(m.name) === wanted);
    if (exactOwn.length === 1) return exactOwn[0];

    const prepared = products.prepareQuery(spec.query);
    const best = products.scoreProduct(matches[0], prepared);
    const second = matches[1] ? products.scoreProduct(matches[1], prepared) : 0;
    if (matches.length === 1 && best > 0) return matches[0];
    if (best >= 400 && (second === 0 || best >= second * 1.25)) return matches[0];

    const err = new Error('recipe_item_ambiguous');
    err.code = 'recipe_item_ambiguous';
    err.query = spec.query;
    err.candidates = matches.slice(0, 5).map(products.describeProduct);
    throw err;
  }

  async function resolveProduct(spec, label) {
    const catalog = await loadCatalog();

    if (spec.product_id) {
      const found = products.findById(catalog, spec.product_id);
      if (!found) {
        if (byCurator && typeof findPeerProduct === 'function') {
          const peer = await findPeerProduct(spec.product_id);
          if (peer && peer.product) {
            throw new ToolError(
              'product_not_found',
              `Продукт «${peer.product.name}» (${spec.product_id}) в списке ${peer.owner_client_name}, а не у этого клиента. Сначала heys_create_product(from_product_id=${spec.product_id}) — получишь новый id, им и пиши приём.`,
              {
                peer: {
                  product_id: spec.product_id,
                  name: peer.product.name,
                  owner_client_id: peer.owner_client_id,
                  owner_client_name: peer.owner_client_name,
                },
              },
            );
          }
        }
        throw new ToolError('product_not_found', `Продукт с id "${spec.product_id}" не найден.`);
      }
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
    // Личная карточка с ТЕМ ЖЕ названием, что у общей, — не неоднозначность, а
    // очевидный ответ: клиент ведёт дневник своей позицией. Правило дословно
    // повторяет `findRecipeIngredient` — там оно живёт с самого начала, а сюда
    // его забыли перенести, хотя случай тот же.
    //
    // Без него пара «личная + общая» была неразрешима арифметически: точное имя
    // даёт обеим по 1000, надбавка own — всего +60, а порог требует
    // превосходства в 1.25 раза. То есть модель не «не смогла выбрать» — ей не
    // давали выбрать. 21.08 на этом встало сохранение набора («Хлеб тостовый
    // Премиум суперсемечковый», 276.7 в личном списке против 274 в общей базе).
    const wanted = products.normalizeText(spec.query);
    const exactOwn = matches.filter((m) => m._source === 'own'
      && products.normalizeText(m.name) === wanted);
    const soleExactOwn = exactOwn.length === 1;
    const confident = soleOwnMatch || soleExactOwn
      || (best >= 400 && (second === 0 || best >= second * 1.25));
    if (soleExactOwn && !soleOwnMatch) return exactOwn[0];
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
   * Граммовка: граммы, штуки, либо единственная порция с карточки.
   * Без цифры и без порции — спрашиваем; не ходим в прошлые дни за «привычной»
   * порцией из кода (это лишние вызовы). Несколько порций — кандидатный список.
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
      return { grams, learnPieceGrams: hasExplicit && !known ? perPiece : null, portionNote: null };
    }

    const grams = Number(spec && spec.grams);
    if (Number.isFinite(grams) && grams > 0 && grams <= 5000) {
      return { grams, learnPieceGrams: null, portionNote: null };
    }

    const portions = products.normalizePortions(product.portions);
    if (portions.length === 1) {
      return {
        grams: portions[0].grams,
        learnPieceGrams: null,
        portionNote: `порция «${portions[0].name}» ${portions[0].grams} г с карточки`,
      };
    }
    if (portions.length > 1) {
      throw new ToolError(
        'grams_required',
        `${label}: граммы не названы, у «${product.name}» несколько порций — уточни граммы или какую порцию взять.`,
        { product: products.describeProduct(product), portions },
      );
    }
    throw new ToolError(
      'invalid_grams',
      `${label}: нужны grams (1–5000), pieces (штуки) или порция в карточке продукта. Спроси граммовку у куратора.`,
      { product: products.describeProduct(product) },
    );
  }

  async function resolveItem(spec, index) {
    const label = `Позиция #${index + 1}`;
    let product;
    let createdRow = null;
    let newProductIgnored = false;
    try {
      product = await resolveProduct(spec || {}, label);
      newProductIgnored = !!(spec && spec.new_product);
    } catch (e) {
      // Незнакомый продукт с приложенным составом заводится тут же: круг
      // «fail → create → повторный log» стоит дороже любой работы сервера
      // (TIMING_LOG.md → «Круги агента»). Только точное «не найдено»:
      // неоднозначность по-прежнему возвращается кандидатами, а не карточкой.
      if (e.code === 'product_not_found' && spec && spec.new_product && typeof spec.new_product === 'object') {
        const created = await tools.heys_create_product({
          ...spec.new_product,
          name: String(spec.new_product.name || spec.query || '').trim(),
        });
        createdRow = created.structured.created_row;
        product = createdRow;
      } else {
        throw e;
      }
    }
    const { grams, learnPieceGrams, portionNote } = resolveGrams(spec, product, label);
    const recipeSnapshot = products.recipeSnapshotFields(product);
    return { product, grams, learnPieceGrams, portionNote, recipeSnapshot, createdRow, newProductIgnored };
  }

  /** Копия позиции из уже записанного приёма: граммы × count, продукт по product_id или имени. */
  async function resolveCopiedItem(item, index, count) {
    const label = `Копия позиции #${index + 1}`;
    const baseGrams = Number(item && item.grams);
    if (!(baseGrams > 0)) {
      throw new ToolError('invalid_items', `${label}: в исходном приёме нет граммовки.`);
    }
    const grams = Math.round(baseGrams * count * 10) / 10;
    if (grams > 5000) {
      throw new ToolError('invalid_grams', `${label}: получилось ${grams} г — больше допустимых 5000.`);
    }
    const spec = item.product_id
      ? { product_id: item.product_id }
      : { query: String(item.name || '').trim() };
    const product = await resolveProduct(spec, label);
    const snapshot = Array.isArray(item.recipe_items) && item.recipe_items.length
      ? {
        recipe_items: item.recipe_items.map((entry) => ({
          name: String(entry.name || '').trim(),
          grams: Number(entry.grams) || 0,
        })),
        recipe_yield: Number(item.recipe_yield) || 0,
        recipe_rev: Number(item.recipe_rev) || 0,
      }
      : null;
    return {
      product,
      grams,
      learnPieceGrams: null,
      portionNote: count > 1 ? `×${count} от приёма-источника` : null,
      recipeSnapshot: snapshot,
    };
  }

  /** Позиции из copy_meal — общий путь log_meal и update_meal. */
  async function resolveCopyMealItems(cm) {
    const srcDate = resolveDate(cm.date, nowMs);
    const srcDay = await readDay(srcDate);
    const mid = cm.meal_id;
    if (!mid) {
      throw new ToolError('invalid_copy_meal', 'copy_meal.meal_id обязателен — возьми из heys_get_day.');
    }
    const srcMeal = (srcDay.meals || []).find((m) => m && String(m.id) === String(mid));
    if (!srcMeal) {
      throw new ToolError(
        'meal_not_found',
        `Приём ${mid} не найден за ${srcDate}. Сначала heys_get_day за эту дату и возьми meal_id из текста.`,
      );
    }
    const count = Math.max(1, Math.min(20, Number(cm.count) || 1));
    let srcItems = (srcMeal.items || []).filter(Boolean);
    const itemIds = Array.isArray(cm.item_ids)
      ? [...new Set(cm.item_ids.map((id) => String(id || '').trim()).filter(Boolean))]
      : [];
    if (itemIds.length) {
      const allowed = new Set(itemIds);
      srcItems = srcItems.filter((it) => it && allowed.has(String(it.id)));
      // Частичное совпадение — тоже ошибка. Скопировать две позиции из трёх и
      // ответить «готово» хуже, чем отказать: куратор не перечитывает состав
      // приёма после успешного ответа, и недостающая еда просто исчезает из дня.
      if (srcItems.length !== itemIds.length) {
        const found = new Set(srcItems.map((it) => String(it.id)));
        const missing = itemIds.filter((id) => !found.has(id));
        throw new ToolError(
          'item_not_found',
          `В приёме «${srcMeal.name || mid}» за ${srcDate} нет позиций: ${missing.join(', ')}. Возьми item_id из heys_get_day — частичную копию сервер не делает.`,
        );
      }
    }
    if (!srcItems.length) {
      throw new ToolError('invalid_items', `Приём «${srcMeal.name || mid}» за ${srcDate} пустой — копировать нечего.`);
    }
    const resolved = [];
    for (let i = 0; i < srcItems.length; i += 1) {
      resolved.push(await resolveCopiedItem(srcItems[i], i, count));
    }
    return { resolved, sourceName: srcMeal.name || null };
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

    const res = await products.saveOverlayRows(api, sessionToken, next);
    if (!res.ok) return [];
    catalogPromise = null;
    return saved;
  }

  const tools = {
    async heys_get_day(args) {
      const date = resolveDate(args.date, nowMs);
      const current = await readDay(date);
      const summary = day.summarizeDay(current);
      // Норма и чек-ин в том же ответе: иначе «из N» и «можно ли писать еду»
      // тянут лишний heys_checkin(get) / догадку без цифры (diary UX 2026-08-07).
      const inputs = await loadNormInputs(date);
      const norm = day.dailyNorm(current, inputs);
      const todayKey = checkinToday(nowMs);
      let checkinText = '';
      let checkin = null;
      if (date === todayKey) {
        checkin = day.checkinStatus(current, inputs && inputs.profile);
        checkinText = checkin.status === 'done'
          ? ' Чек-ин: пройден.'
          : ` Чек-ин: ${checkin.status} — еду за сегодня не пиши, пока не закрыт (heys_checkin); отдельный get не нужен, статус уже здесь.`;
      }
      const head = summary.meals.length || summary.water_ml
        ? `День ${date}: ${summary.totals.kcal} ккал, Б${summary.totals.protein} У${summary.totals.carbs} Ж${summary.totals.fat}, вода ${summary.water_ml} мл, приёмов: ${summary.meals.length}.${normText(norm)}${checkinText}${formatDayMealsBlock(summary)}`
        : `День ${date} пока пустой.${normText(norm)}${checkinText}`;
      return {
        text: head,
        structured: { ...summary, norm, ...(checkin ? { checkin } : {}) },
      };
    },

    async heys_search_products(args) {
      if (!args.query || !String(args.query).trim()) {
        throw new ToolError('invalid_query', 'Нужен непустой query.');
      }
      const scope = args.scope == null || args.scope === '' ? undefined : String(args.scope);
      if (scope && scope !== 'client' && scope !== 'curator') {
        throw new ToolError('invalid_scope', 'scope — «client» или «curator».');
      }
      const catalog = await loadCatalog();
      const limit = args.limit || 10;
      const localFound = products.searchProducts(catalog, args.query, 50);
      let peerHits = [];
      const needPeer = byCurator && typeof loadPeerHits === 'function' && scope !== 'client'
        && (scope === 'curator' || !products.hasStrongMatch(catalog, args.query));
      if (needPeer) {
        peerHits = await loadPeerHits(args.query);
      }
      const found = products.mergeSearchLayers({
        own: localFound.filter((p) => p._source === 'own'),
        peer: peerHits,
        shared: localFound.filter((p) => p._source !== 'own'),
        limit,
      });
      const described = found.map(products.describeProduct);
      // Есть ли среди выдачи точное попадание. Без этого ответ «нашёл три»
      // выглядит одинаково и когда продукт найден, и когда это просто
      // ближайшее по словам — модель во втором случае идёт перебирать
      // формулировки, хотя каталог уже просмотрен целиком (TIMING_LOG.md →
      // «Круги агента», замер 18–20.08: 55 повторных поисков за сутки).
      const prepared = products.prepareQuery(args.query);
      const hasExact = prepared
        ? found.some((product) => products.matchStrength(product, prepared) === 'strong')
        : false;
      const text = described.length
        ? `Нашёл ${described.length}: ${described.map((p) => {
          const parts = [`${p.name} (${p.product_id}, ${p.kcal100} ккал/100, ${p.source})`];
          if (p.writable === false) parts.push('нельзя записать напрямую — сначала heys_create_product(from_product_id)');
          if (p.barcode) parts.push(`штрихкод ${p.barcode}`);
          if (p.piece_grams) parts.push(`шт=${p.piece_grams}г`);
          if (Array.isArray(p.portions) && p.portions.length) {
            parts.push(`порции: ${p.portions.map((x) => `${x.name} ${x.grams}г`).join(', ')}`);
          }
          return parts.join(', ');
        }).join('; ')}${hasExact ? '' : `. Точного совпадения с «${args.query}» среди них нет — это ближайшее по словам. Если ни один не подходит, другая формулировка вернёт тот же список: heys_create_product (from_product_id ближайшего, если состав неизвестен), затем приём.`}`
        : `По запросу "${args.query}" ничего не нашлось. Каталог просмотрен целиком, включая написания латиницей и кириллицей, — другая формулировка того же продукта вернёт тот же ответ. Дальше: heys_create_product (from_product_id ближайшего, если состав неизвестен), затем heys_log_meal.`;
      return { text, structured: { query: args.query, results: described, exact_match: hasExact } };
    },

    /**
     * Разбор состава. В выдаче поиска рецепт — одна строка «имя граммы»: по
     * ней нельзя ни поправить ингредиент (нет id), ни заметить, что карточка
     * ингредиента с тех пор изменилась, а КБЖУ блюда остались от прошлого
     * сохранения. Оба вопроса закрывает этот tool; пересчитывать состав руками
     * в голове нельзя — так теряются ингредиенты.
     */
    async heys_get_recipe(args) {
      const catalog = await loadCatalog();
      const findIngredient = (spec) => {
        try {
          return findRecipeIngredient(catalog, spec);
        } catch (e) {
          if (e.code === 'recipe_item_ambiguous') return null;
          throw e;
        }
      };

      if (!args.product_id && !args.query) {
        const rows = products.listRecipes(catalog).map((product) => {
          const info = products.describeRecipe(product, findIngredient);
          return {
            product_id: product.id,
            name: product.name,
            rev: info.rev,
            yield_grams: info.yield_grams,
            items_count: info.items.length,
            kcal100: info.saved.kcal100,
            stale: info.stale ? info.stale.kcal100_delta : undefined,
          };
        });
        const staleRows = rows.filter((row) => row.stale !== undefined);
        return {
          text: rows.length
            ? `Блюда с составом (${rows.length}): ${rows.map((row) => `«${row.name}» (${row.product_id}, ${row.kcal100} ккал/100, ${row.items_count} ингр., выход ${row.yield_grams} г, rev ${row.rev})`).join('; ')}.${staleRows.length ? ` Разошлись с карточками ингредиентов: ${staleRows.map((row) => `${row.name} (${row.stale > 0 ? '+' : ''}${row.stale} ккал/100)`).join(', ')} — обнови heys_update_product(recipe_patch:{}).` : ''}`
            : 'У клиента нет блюд с составом. Составное домашнее блюдо заводится как продукт с recipe: heys_create_product(name, recipe:{yield_grams, items}).',
          structured: { recipes: rows },
        };
      }

      const product = await resolveProduct({ product_id: args.product_id, query: args.query }, 'Блюдо');
      const info = products.describeRecipe(product, findIngredient);
      if (!info) {
        throw new ToolError(
          'not_a_recipe',
          `У «${product.name}» (${product.id}) нет состава — это карточка с ручными КБЖУ. Если это домашнее составное блюдо, оформи его рецептом: heys_update_product(product_id=${product.id}, recipe:{yield_grams, items}), и калорийность посчитается из ингредиентов.`,
          { product_id: product.id, name: product.name },
        );
      }

      const itemsText = info.items.map((item) => {
        const parts = [`${item.name} ${item.grams} г`];
        if (item.kcal != null) parts.push(`${item.kcal} ккал`);
        if (item.kcal_share_pct != null) parts.push(`${item.kcal_share_pct}%`);
        parts.push(item.product_id ? `id=${item.product_id}` : 'без id');
        if (item.card_source && item.card_source !== 'мой список') parts.push(item.card_source);
        if (item.card_missing) parts.push('карточки уже нет');
        return parts.join(', ');
      }).join('; ');
      const shrinkText = info.shrink_grams === 0
        ? ''
        : info.shrink_grams < 0
          ? ` Уварка ${Math.abs(info.shrink_grams)} г (сумма ингредиентов ${info.items_grams_total} г).`
          : ` Выход больше суммы ингредиентов на ${info.shrink_grams} г — проверь, не потерян ли ингредиент.`;
      const staleText = info.missing_items
        ? ` Пересчитать нельзя: в списке клиента больше нет карточек — ${info.missing_items.join(', ')}.`
        : info.stale
          ? ` Карточки ингредиентов менялись после сохранения: сейчас состав даёт ${info.recomputed.kcal100} ккал/100 (${info.stale.kcal100_delta > 0 ? '+' : ''}${info.stale.kcal100_delta}). Обновить КБЖУ блюда, не трогая состав: heys_update_product(product_id=${info.product_id}, recipe_patch:{}).`
          : ' Сохранённые КБЖУ сходятся с текущими карточками ингредиентов.';
      const portionsText = info.portions.length
        ? ` Порции: ${info.portions.map((p) => `${p.name} ${p.grams} г ≈ ${p.kcal} ккал`).join(', ')}.`
        : '';

      const scopeText = info.writable === false
        ? ` Карточка живёт в списке другого клиента (${info.source}): править её отсюда нельзя, сначала heys_create_product(from_product_id=${info.product_id}) — состав перенесётся и пересчитается по карточкам этого клиента.`
        : info.source === 'мой список'
          ? ' Карточка личная (список клиента), в общую базу состав не уходит.'
          : ` Карточка из общей базы (${info.source}).`;
      return {
        text: `Рецепт «${info.name}» (${info.product_id}, rev ${info.rev}), выход ${info.yield_grams} г: ${itemsText}.${shrinkText} Сохранено ${info.saved.kcal100} ккал/100 (Б${info.saved.protein100} У${info.saved.carbs100} Ж${info.saved.fat100}).${staleText}${portionsText}${scopeText} Правка состава — heys_update_product(recipe_patch), прошлые записи в дневнике при этом не меняются (для них heys_reapply_recipe).`,
        structured: info,
      };
    },

    async heys_log_meal(args) {
      const date = resolveDate(args.date, nowMs);
      const batch = Array.isArray(args.meals) && args.meals.length ? args.meals : null;
      if (batch && (args.items || args.preset || args.copy_meal || args.time || args.name)) {
        throw new ToolError('invalid_items',
          'meals[] — самостоятельная форма: время, название и позиции живут внутри каждого приёма. Не передавай рядом items/preset/copy_meal/time/name.');
      }
      if (batch && batch.length > 6) {
        throw new ToolError('invalid_items', 'За раз можно внести не больше 6 приёмов.');
      }

      // День (и профиль — для гейта чек-ина) стартуют сразу: от разбора
      // позиций они не зависят. Последовательно эти чтения ложились сверху
      // каталога продуктов; запущенные здесь, они едут вместе с ним.
      const dayPromise = readDay(date).catch((error) => ({ __error: error }));
      const profilePromise = byCurator && date === checkinToday(nowMs)
        ? readMany([profile.PROFILE_KEY]).catch(() => null)
        : null;

      // Каждый приём: время + позиции. Одиночная форма (items/preset/copy_meal)
      // собирается в такой же вход из одного элемента.
      const mealInputs = [];

      if (batch) {
        for (let m = 0; m < batch.length; m += 1) {
          const entry = batch[m] || {};
          const time = entry.time === undefined || entry.time === null || entry.time === ''
            ? day.nowParts(nowMs).time
            : day.normalizeTime(entry.time);
          if (!time) throw new ToolError('invalid_time', `Приём #${m + 1}: время "${entry.time}" не в формате HH:MM.`);
          const specs = Array.isArray(entry.items) ? entry.items : [];
          if (!specs.length) throw new ToolError('invalid_items', `Приём #${m + 1}: нужна хотя бы одна позиция в items.`);
          if (specs.length > 20) throw new ToolError('invalid_items', `Приём #${m + 1}: не больше 20 позиций.`);
          const resolved = [];
          for (let i = 0; i < specs.length; i += 1) {
            resolved.push(await resolveItem(specs[i], i));
          }
          mealInputs.push({
            time,
            explicitName: entry.name ? String(entry.name) : null,
            mood: clampSubjective(entry.mood, 'mood') ?? '',
            wellbeing: clampSubjective(entry.wellbeing, 'wellbeing') ?? '',
            stress: clampSubjective(entry.stress, 'stress') ?? '',
            resolved,
          });
        }
      } else {
        const time = args.time === undefined || args.time === null || args.time === ''
          ? day.nowParts(nowMs).time
          : day.normalizeTime(args.time);
        if (!time) throw new ToolError('invalid_time', `Время "${args.time}" не в формате HH:MM.`);

        const resolved = [];
        let presetName = null;
        let copyMealName = null;

        if (args.copy_meal && typeof args.copy_meal === 'object') {
          const { resolved: copied, sourceName } = await resolveCopyMealItems(args.copy_meal);
          resolved.push(...copied);
          if (!args.name && sourceName) copyMealName = sourceName;
        }

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
          throw new ToolError('invalid_items', 'Нужна хотя бы одна позиция в items, набор в preset, copy_meal из heys_get_day или meals[] для нескольких приёмов.');
        }
        if (specs.length + resolved.length > 20) {
          throw new ToolError('invalid_items', 'За раз можно внести не больше 20 позиций.');
        }
        for (let i = 0; i < specs.length; i += 1) {
          resolved.push(await resolveItem(specs[i], i));
        }

        mealInputs.push({
          time,
          explicitName: args.name ? String(args.name) : (presetName || copyMealName || null),
          mood: clampSubjective(args.mood, 'mood') ?? '',
          wellbeing: clampSubjective(args.wellbeing, 'wellbeing') ?? '',
          stress: clampSubjective(args.stress, 'stress') ?? '',
          resolved,
        });
      }

      const current = await dayPromise;
      if (current && current.__error) throw current.__error;

      // Гейт чек-ина — здесь, а не в инструкции: правило «за сегодня сначала
      // heys_get_day» стоило лишний круг на каждую сегодняшнюю еду, а
      // проверить его мог только сам сервер. Fail-open: без профиля статус
      // не посчитать — не блокируем.
      if (profilePromise) {
        const blobs = await profilePromise;
        const prof = blobs && blobs[profile.PROFILE_KEY];
        if (prof) {
          const st = day.checkinStatus(current, prof);
          if (st.status !== 'done') {
            const missing = st.steps.filter((step) => step.required && !step.done).map((step) => step.label).join(', ');
            throw new ToolError('checkin_required',
              `Чек-ин за сегодня не закрыт (${st.status}${missing ? `: не хватает ${missing}` : ''}) — сначала heys_checkin, потом еда. Прошлые даты пишутся без гейта.`);
          }
        }
      }

      let next = current;
      const written = [];
      for (const input of mealInputs) {
        const meal = {
          id: makeId('m_'),
          name: input.explicitName || defaultMealName(input.time),
          time: input.time,
          mood: input.mood,
          wellbeing: input.wellbeing,
          stress: input.stress,
          items: input.resolved.map((entry) => mealItemFromResolved(entry, makeId)),
        };
        // Тип приёма проставляем сами, по времени и составу: без `mealType`
        // дневник подписывает приём собственным расчётом, и запись куратора
        // оказывается не тем, чем она является. Название куратора и имя набора
        // сильнее — они и есть ответ на вопрос «что это было».
        const classified = day.classifyMeal(meal, next);
        meal.mealType = classified.mealType;
        if (!input.explicitName) meal.name = classified.name;
        next = day.addMeal(next, meal, { nowMs, clientId });
        written.push({ meal, classified, resolved: input.resolved });
      }

      // Один writeDay на все приёмы: одна merge-запись вместо цепочки — меньше
      // окно гонки с открытым приложением.
      const saved = await writeDay(date, next, Number(current.updatedAt) || 0);
      const after = await dayAfterWrite(saved, next);
      const allResolved = written.flatMap((w) => w.resolved);
      const learned = await persistPieceGrams(allResolved);

      const learnedText = learned.length
        ? ` Запомнил вес штуки: ${learned.map((l) => `${l.name} — ${l.grams} г`).join(', ')}.`
        : '';
      const portionNotes = allResolved.map((e) => e.portionNote).filter(Boolean);
      const portionText = portionNotes.length
        ? ` Граммовка с карточки: ${portionNotes.join('; ')}.`
        : '';
      // Позиции, восстановленные из снимка набора. Молчать нельзя: приём
      // записан верно, но карточки в базе нет, и в приложении такая позиция
      // отметится как ненайденная. Куратор должен узнать это здесь, а не из
      // оранжевого баннера через сутки.
      const snapshotNames = allResolved.filter((e) => e.fromSnapshot).map((e) => e.product.name);
      const snapshotText = snapshotNames.length
        ? ` Внимание: ${snapshotNames.join(', ')} — карточки в базе больше нет, позиция записана по снимку из набора (КБЖУ верные). Вернуть карточку — heys_create_product, затем heys_save_meal_preset пересоберёт набор.`
        : '';
      // Карточки, заведённые по new_product, называются вслух: их значения дала
      // модель, а не этикетка, и куратор должен успеть поправить.
      const createdRows = allResolved.map((e) => e.createdRow).filter(Boolean);
      const createdText = createdRows.length
        ? ` Новые карточки (значения от модели, не с этикетки): ${createdRows.map((r) => `«${r.name}» (${r.id}, ${r.kcal100} ккал/100, Б${r.protein100} У${r.carbs100} Ж${r.fat100})`).join('; ')}.`
        : '';
      const dedupedNames = allResolved.filter((e) => e.newProductIgnored).map((e) => e.product.name);
      const dedupedText = dedupedNames.length
        ? ` new_product не понадобился: ${dedupedNames.map((n) => `«${n}»`).join(', ')} уже в каталоге — записал существующей карточкой.`
        : '';
      const extras = `${portionText}${snapshotText}${createdText}${dedupedText}${learnedText}`;

      if (written.length === 1) {
        const { meal, classified } = written[0];
        const kcal = day.macroTotals([meal]);
        // Тип называем вслух, когда подпись приёма его не показывает (набор,
        // своё название): куратор должен видеть, чем запись легла в дневник, и
        // успеть поправить, если это не обед.
        const typeHint = meal.name === classified.name ? '' : ` (${classified.name})`;
        // item_id в text — иначе «убери сироп из только что внесённого» снова
        // зовёт get_day (structured в Cursor часто не виден).
        return {
          text: `Записал: ${formatMealLine(meal)}${typeHint} (${date}). ≈${kcal.kcal} ккал, Б${kcal.protein} У${kcal.carbs} Ж${kcal.fat}.${extras}${dayAfterText(after)}`,
          structured: {
            date,
            meal_id: meal.id,
            name: meal.name,
            meal_type: meal.mealType,
            time: meal.time,
            totals: kcal,
            items: meal.items.map((i) => ({ id: i.id, name: i.name, grams: i.grams })),
            learned_piece_grams: learned.length ? learned : undefined,
            portion_defaults: portionNotes.length ? portionNotes : undefined,
            from_preset_snapshot: snapshotNames.length ? snapshotNames : undefined,
            created_products: createdRows.length ? createdRows.map((r) => ({ product_id: r.id, name: r.name })) : undefined,
            day_after: after,
          },
        };
      }

      const lines = written.map(({ meal }) => {
        const kcal = day.macroTotals([meal]);
        return `${formatMealLine(meal)} — ≈${kcal.kcal} ккал`;
      });
      return {
        text: `Записал ${written.length} приёма(ов) за ${date}: ${lines.join('; ')}.${extras}${dayAfterText(after)}`,
        structured: {
          date,
          meals: written.map(({ meal }) => ({
            meal_id: meal.id,
            name: meal.name,
            meal_type: meal.mealType,
            time: meal.time,
            totals: day.macroTotals([meal]),
            items: meal.items.map((i) => ({ id: i.id, name: i.name, grams: i.grams })),
          })),
          learned_piece_grams: learned.length ? learned : undefined,
          created_products: createdRows.length ? createdRows.map((r) => ({ product_id: r.id, name: r.name })) : undefined,
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
      const hasOtherPatch = Boolean(
        (Array.isArray(args.remove_item_ids) && args.remove_item_ids.length)
        || (args.set_grams && typeof args.set_grams === 'object' && Object.keys(args.set_grams).length)
        || args.name
        || time
        || args.mood !== undefined
        || args.wellbeing !== undefined
        || args.stress !== undefined,
      );

      const resolved = [];
      if (args.copy_meal && typeof args.copy_meal === 'object') {
        const { resolved: copied } = await resolveCopyMealItems(args.copy_meal);
        resolved.push(...copied);
      }
      if (resolved.length + specs.length > 20) {
        throw new ToolError('invalid_items', 'За раз можно добавить не больше 20 позиций.');
      }
      if (!resolved.length && !specs.length && !hasOtherPatch) {
        throw new ToolError('nothing_to_update', 'Не передано ни одного изменения: нужен copy_meal, add_items, remove_item_ids, set_grams, name, time или оценка самочувствия.');
      }

      const current = await readDay(date);
      const target = (current.meals || []).find((m) => m && String(m.id) === String(args.meal_id));
      if (!target) {
        throw new ToolError('meal_not_found', `Приём ${args.meal_id} не найден в дне ${date}. Возьми актуальный meal_id через heys_get_day.`);
      }

      for (let i = 0; i < specs.length; i += 1) {
        resolved.push(await resolveItem(specs[i], i));
      }

      const patch = {
        addItems: resolved.map((entry) => mealItemFromResolved(entry, makeId)),
        removeItemIds: Array.isArray(args.remove_item_ids) ? args.remove_item_ids : [],
        setGrams: (args.set_grams && typeof args.set_grams === 'object') ? args.set_grams : {},
        name: args.name,
        time,
        mood: clampSubjective(args.mood, 'mood'),
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
        throw new ToolError('nothing_to_update', 'Не передано ни одного изменения: нужен copy_meal, add_items, remove_item_ids, set_grams, name, time или оценка самочувствия.');
      }
      if (!result.meal.items.length) {
        throw new ToolError('meal_would_be_empty', 'После правки в приёме не осталось позиций. Если приём нужно убрать целиком — heys_delete_meal.');
      }

      const saved = await writeDay(date, result.day, Number(current.updatedAt) || 0);
      const after = await dayAfterWrite(saved, result.day);
      // Состав приёма — с сервера: оптимистичный result.meal врёт при воскрешении
      // позиции merge'ом (incident 2026-08-07 черри/помидор).
      const serverDay = savedDayBlob(saved, result.day);
      const serverMeal = (serverDay.meals || []).find((m) => m && String(m.id) === String(args.meal_id)) || result.meal;
      const removeIds = Array.isArray(args.remove_item_ids) ? args.remove_item_ids.map(String) : [];
      if (removeIds.length) {
        const resurrected = removeIds.filter((id) => (serverMeal.items || []).some((item) => String(item.id) === id));
        if (resurrected.length) {
          throw new ToolError(
            'item_resurrected',
            `Удаление не удержалось после записи (merge вернул позиции: ${resurrected.join(', ')}). Перечитай heys_get_day и повтори; если повторится — в дне нет tombstone deletedItemIds.`,
            {
              meal_id: args.meal_id,
              resurrected,
              items: (serverMeal.items || []).map((i) => ({ id: i.id, name: i.name, grams: i.grams })),
            },
          );
        }
      }
      const learned = await persistPieceGrams(resolved);

      const kcal = day.macroTotals([serverMeal]);
      const learnedText = learned.length
        ? ` Запомнил вес штуки: ${learned.map((l) => `${l.name} — ${l.grams} г`).join(', ')}.`
        : '';
      const portionNotes = resolved.map((e) => e.portionNote).filter(Boolean);
      const portionText = portionNotes.length
        ? ` Граммовка с карточки: ${portionNotes.join('; ')}.`
        : '';
      return {
        text: `Обновил «${serverMeal.name}» ${serverMeal.id} (${serverMeal.time}, ${date}): ${result.changed.join('; ')}. ${formatMealLine(serverMeal)}. ≈${kcal.kcal} ккал, Б${kcal.protein} У${kcal.carbs} Ж${kcal.fat}.${portionText}${learnedText}${dayAfterText(after)}`,
        structured: {
          date,
          meal_id: serverMeal.id,
          name: serverMeal.name,
          time: serverMeal.time,
          changed: result.changed,
          totals: kcal,
          items: (serverMeal.items || []).map((i) => ({ id: i.id, name: i.name, grams: i.grams })),
          learned_piece_grams: learned.length ? learned : undefined,
          portion_defaults: portionNotes.length ? portionNotes : undefined,
          day_after: after,
        },
      };
    },

    async heys_create_product(args) {
      // Каталог и tombstones — обе проверки до записи и друг от друга не
      // зависят. Последовательно они складывались в два ожидания подряд на
      // каждом заведении продукта с этикетки.
      // catch — не глушение ошибки, а защита от unhandled rejection: проверка
      // дубликата ниже может бросить раньше, чем этот промис дождутся.
      const tombstonesPromise = api.getKV(sessionToken, TOMBSTONES_KEY)
        .catch((error) => ({ data: null, error }));
      const catalog = await loadCatalog();

      let base = null;
      let peerHit = null;
      if (args.from_product_id) {
        base = products.findById(catalog, args.from_product_id);
        if (!base && typeof findPeerProduct === 'function') {
          peerHit = await findPeerProduct(args.from_product_id);
          base = peerHit && peerHit.product;
        }
        if (!base) {
          throw new ToolError('product_not_found', `Продукт-источник с id "${args.from_product_id}" не найден.`);
        }
      }

      const name = String(args.name || (base && base.name) || '').trim();
      if (!name) throw new ToolError('invalid_name', 'Нужно название продукта или from_product_id источника.');

      if (base && products.isSharedLinked(base)
        && products.normalizeText(name) === products.normalizeText(base.name)) {
        const sharedId = base.shared_origin_id || base.id;
        throw new ToolError(
          'product_already_shared',
          `«${base.name}» уже в общей базе (product_id=${sharedId}). Копировать с тем же именем не нужно — записывай этим id. Новое имя (черри ← помидор) — передай name.`,
          { shared_origin_id: sharedId, existing: products.describeProduct(base) },
        );
      }

      const nameNorm = products.normalizeText(name);
      const duplicate = catalog.all.find((p) => products.normalizeText(p.name) === nameNorm);
      if (duplicate && !args.allow_duplicate) {
        const existing = products.describeProduct(duplicate);
        throw new ToolError(
          'product_exists',
          `Продукт «${duplicate.name}» уже есть (${duplicate._source === 'own' ? 'в твоём списке' : 'в общей базе'}, product_id=${existing.product_id}). Используй этот id или, если это другой продукт, уточни название (например бренд) и allow_duplicate.`,
          { existing },
        );
      }

      // Точного совпадения нет, но название может быть той же позицией другими
      // словами («крабовый салат» vs «Салат крабовый классический»): matchStrength
      // ловит общий стем/фразу без точного текста. Порог 'strong' — тот же, что
      // отсекает лишний шум в поиске (см. matchStrength в products.js).
      if (!duplicate && !args.allow_duplicate) {
        const prepared = products.prepareQuery(name);
        const similar = prepared
          ? catalog.all
            .filter((p) => products.normalizeText(p.name) !== nameNorm
              && products.matchStrength(p, prepared) === 'strong')
            .slice(0, 5)
          : [];
        if (similar.length) {
          const candidates = similar.map(products.describeProduct);
          const list = candidates.map((c) => `«${c.name}» (${c.product_id})`).join('; ');
          throw new ToolError(
            'product_similar_exists',
            `Похоже, это уже есть под другим названием: ${list}. Это тот же продукт — используй его id, а если другой — allow_duplicate.`,
            { existing: candidates[0], candidates },
          );
        }
      }

      // Удалённый когда-то продукт с тем же именем приложение отфильтрует по
      // tombstone — новый продукт просто не появится в списке. Молча создавать
      // его бессмысленно, поэтому проверяем заранее.
      const tombstones = await tombstonesPromise;
      if (Array.isArray(tombstones.data)) {
        const hidden = tombstones.data.some((t) => t && t.name && products.normalizeText(t.name) === nameNorm);
        if (hidden && !args.allow_duplicate) {
          throw new ToolError(
            'product_tombstoned',
            `Продукт с названием «${name}» ты раньше удалял, и приложение скроет новый с тем же именем. Восстанови его в приложении или назови иначе.`,
          );
        }
      }

      // Рецепт, from_product_id или ручные нутриенты — взаимоисключающие входы.
      let createInput = { ...args, name };
      let clonedFrom = null;
      let recipePayload = null;
      if (args.recipe) {
        if (products.hasManualNutrientInput(args) || args.from_product_id) {
          throw new ToolError(
            'recipe_and_manual',
            'Рецепт сам считает КБЖУ. Вместе с recipe не передавай ручные нутриенты или from_product_id — только состав, порции, имя.',
          );
        }
        try {
          recipePayload = products.buildRecipePayload(
            args.recipe,
            (spec) => findRecipeIngredient(catalog, spec),
            { nowMs, previousRev: 0 },
          );
        } catch (e) {
          if (e.code === 'recipe_item_ambiguous') {
            throw new ToolError(
              'recipe_item_ambiguous',
              `Ингредиент «${e.query}» подходит к нескольким карточкам — передай product_id. Кандидаты: ${e.candidates.map((c) => `${c.name} (${c.product_id}, ${c.kcal100} ккал/100, ${c.source})`).join('; ')}.`,
              { candidates: e.candidates },
            );
          }
          if (e.code === 'recipe_item_not_found') {
            throw new ToolError(
              'recipe_item_not_found',
              `Ингредиент рецепта не найден${e.product_id ? ` (product_id=${e.product_id})` : e.query ? ` («${e.query}»)` : ''}. Ищется сначала в личном списке клиента, затем в общей базе — заведи карточку или уточни название.`,
              { product_id: e.product_id, query: e.query },
            );
          }
          throw new ToolError('invalid_recipe', `Не могу собрать рецепт: ${e.message}.`);
        }
        createInput = {
          ...recipePayload.nutrients,
          name,
          portions: args.portions,
          brand: args.brand,
          barcode: args.barcode,
        };
      } else if (args.from_product_id) {
        if (!base) {
          throw new ToolError('product_not_found', `Продукт-источник с id "${args.from_product_id}" не найден.`);
        }
        // Копия блюда без состава — копия без главного: у клиента остаётся
        // карточка с цифрами и без ответа «что внутри», ради которого рецепт и
        // заводился. Состав переносим, но пересчитываем по каталогу нового
        // владельца: у него могут быть свои карточки тех же продуктов, и КБЖУ
        // честнее взять его, чем притащить чужие. id — подсказка, авторитет за
        // именем, как в наборах: у нового владельца тот же продукт живёт под
        // своим id.
        if (base.recipe && Array.isArray(base.recipe.items) && base.recipe.items.length) {
          try {
            recipePayload = products.buildRecipePayload(
              {
                yield_grams: base.recipe.yield_grams,
                items: base.recipe.items.map((item) => ({
                  product_id: item.product_id,
                  query: item.name,
                  grams: item.grams,
                })),
              },
              (spec) => findRecipeIngredient(catalog, spec),
              { nowMs, previousRev: 0 },
            );
          } catch (e) {
            if (e.code === 'recipe_item_not_found') {
              throw new ToolError(
                'recipe_item_not_found',
                `Ингредиент «${e.query || e.product_id}» из рецепта «${base.name}» не найден в списке этого клиента. Заведи его сначала — или скопируй продукт без рецепта, передав нужные нутриенты вручную.`,
                { product_id: e.product_id, query: e.query, source_product_id: args.from_product_id },
              );
            }
            throw new ToolError('invalid_recipe', `Не могу перенести рецепт «${base.name}»: ${e.message}.`);
          }
        }
        const baseInput = {};
        for (const field of products.REQUIRED_NUTRIENTS) {
          if (Number.isFinite(Number(base[field]))) baseInput[field] = Number(base[field]);
        }
        for (const field of products.OPTIONAL_NUTRIENTS) {
          if (Number.isFinite(Number(base[field]))) baseInput[field] = Number(base[field]);
        }
        if (Number.isFinite(Number(base.carbs100))) baseInput.carbs100 = Number(base.carbs100);
        if (Number.isFinite(Number(base.fat100))) baseInput.fat100 = Number(base.fat100);
        for (const field of products.BOOLEAN_FLAGS) {
          if (base[field] != null) baseInput[field] = !!base[field];
        }
        if (Array.isArray(base.additives)) baseInput.additives = base.additives;
        const basePortions = products.normalizePortions(base.portions);
        if (basePortions.length) baseInput.portions = basePortions;
        createInput = { ...baseInput, ...args, name };
        if (recipePayload) {
          createInput = { ...createInput, ...recipePayload.nutrients };
        }
        clonedFrom = {
          product_id: base.id,
          name: base.name,
          ...(peerHit ? { owner_client_name: peerHit.owner_client_name } : {}),
        };
      }

      let row;
      try {
        row = products.buildCustomProduct(createInput, {
          nowMs,
          makeId: () => `p_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
        });
      } catch (e) {
        if (e.missing) {
          throw new ToolError(
            'nutrients_missing',
            `Не хватает обязательных полей: ${e.missing.join(', ')}. Все значения — на 100 г. Либо передай их с этикетки, либо from_product_id ближайшего продукта (например помидор → черри).`,
            { missing: e.missing },
          );
        }
        throw new ToolError('invalid_product', e.message);
      }

      if (recipePayload) {
        row.recipe = recipePayload.recipe;
      }

      const overlayRes = await api.getKV(sessionToken, products.OVERLAY_KEY);
      if (overlayRes.error) throw new ToolError('upstream_error', `Не удалось прочитать список продуктов: ${overlayRes.error.message}`);
      const overlay = Array.isArray(overlayRes.data) ? overlayRes.data : [];

      const saveRes = await products.saveOverlayRows(api, sessionToken, [...overlay, row]);
      if (!saveRes.ok) throw new ToolError('save_failed', `Сервер отклонил создание продукта: ${saveRes.error}`);
      catalogPromise = null;

      const extras = [];
      if (clonedFrom) extras.push(`клон нутриентов с «${clonedFrom.name}» (${clonedFrom.product_id})`);
      if (row.brand) extras.push(`бренд ${row.brand}`);
      if (row.barcode) extras.push(`штрихкод ${row.barcode}`);
      if (row.portions) extras.push(`порции: ${row.portions.map((p) => `${p.name} ${p.grams} г`).join(', ')}`);
      if (row.recipe) extras.push(`рецепт: ${products.formatRecipeSummary(row.recipe)}`);

      return {
        text: `Создал продукт «${row.name}» (product_id=${row.id}) — ${row.kcal100} ккал/100 г, Б${row.protein100} У${row.carbs100} Ж${row.fat100}${extras.length ? '. ' + extras.join(', ') : ''}. Калорийность пересчитана по правилам HEYS, поэтому может отличаться от цифры на упаковке.${row.recipe ? ' КБЖУ рецепта зафиксированы при сохранении: смена карточки ингредиента их не пересчитает — только heys_update_product с новым recipe.' : ''}`,
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
          cloned_from: clonedFrom || undefined,
          recipe: row.recipe || undefined,
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
      const after = await dayAfterWrite(saved, next);
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
      const after = await dayAfterWrite(saved, next);
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
      // Быт, записанный тренировкой, живёт в дне отдельно от household_min и
      // складывается с ним в расходе. Тип тренировки — свободная строка, так что
      // «уборка» сюда проходила молча (incident 2026-08-22).
      if (args.allow_as_training !== true
        && day.isHouseholdTraining({ type: args.type, activityLabel: args.activity_label })) {
        throw new ToolError('household_not_training',
          'Бытовая активность — это heys_update_day(household_min: минуты), а не тренировка:'
          + ' в приложении она отдельный вид записи, и расход считает её отдельно от тренировок.'
          + ' Если это действительно тренировка (мытьё окон по пульсу, а не быт), передай allow_as_training: true.');
      }
      const extra = {
        time: args.time, type: args.type, activityLabel: args.activity_label, comment: args.comment,
        mood: args.mood, wellbeing: args.wellbeing, stress: args.stress,
      };
      const current = await readDay(date);
      const added = day.addTraining(current, zones, extra, { nowMs, clientId });
      if (added.error === 'too_many') {
        throw new ToolError('too_many', 'В дне уже три тренировки — больше приложение не показывает. Удали лишнюю через heys_delete_training.');
      }
      const next = added.day;
      const saved = await writeDay(date, next, Number(current.updatedAt) || 0);
      const after = await dayAfterWrite(saved, next);
      // Нагрузка сессии — MET-минуты по зонам клиента (web-mirror, зеркало
      // apps/web/_kernel/heys_kernel_load_v1.js). Только этой сессии, без чтения
      // истории: накопленную тренированность отдаёт heys_get_training_status.
      const inputs = await loadNormInputs(date);
      const zoneMets = Array.isArray(inputs && inputs.hrZones)
        ? inputs.hrZones.map((z) => Number(z && z.MET) || 0)
        : null;
      // По записанным зонам, а не по сырому вводу: отрицательные и запредельные
      // значения клампятся при записи, и число в ответе обязано совпадать с блобом.
      const writtenZ = next.trainings[next.trainings.length - 1].z;
      const sessionLoad = webMirror.sessionLoad({ z: writtenZ, type: extra.type }, zoneMets);
      const extraBits = [];
      if (extra.time) extraBits.push(`в ${extra.time}`);
      if (extra.type) extraBits.push(extra.type);
      return {
        text: `Записал тренировку ${date}${extraBits.length ? ` (${extraBits.join(', ')})` : ''}: ${total} мин по зонам [${zones.join(', ')}], нагрузка ≈${Math.round(sessionLoad)} MET-мин.${dayAfterText(after)}`,
        structured: { date, zones_minutes: zones, total_minutes: total, session_load: Math.round(sessionLoad), day_after: after },
      };
    },

    async heys_log_strength_workout(args) {
      const date = resolveDate(args.date, nowMs);
      const current = await readDay(date);
      const res = day.setStrengthWorkout(current, args.index, {
        exercises: args.exercises,
        time: args.time,
        comment: args.comment,
        durationMin: args.duration_min,
      }, { nowMs, clientId });
      if (res.error) throw new ToolError('invalid_workout', res.error);

      const saved = await writeDay(date, res.day, Number(current.updatedAt) || 0);
      const after = await dayAfterWrite(saved, res.day);
      const written = res.day.trainings[res.index];
      // Свой вес — из веса тела за сегодня (чек-ин), а не из воздуха: без него
      // bodyweight-упражнения честно остаются «без тоннажа», как в приложении.
      const bodyWeightKg = Number(res.day.weightMorning) || 0;
      const agg = webMirror.trainingTonnage(written, { bodyWeightKg });
      const exCount = written.workoutLog.exercises.length;
      const tonnage = agg.totalVolume >= 1000
        ? `${(agg.totalVolume / 1000).toFixed(1).replace(/\.0$/, '')} т`
        : `${Math.round(agg.totalVolume)} кг`;
      return {
        text: `Записал силовую ${date}: ${exCount} упр., ${agg.doneApproaches} подходов, тоннаж ${tonnage}.${dayAfterText(after)}`,
        structured: {
          date,
          index: res.index,
          exercises: exCount,
          approaches_done: agg.doneApproaches,
          total_volume_kg: Math.round(agg.totalVolume),
          max_weight_kg: agg.maxWeight,
          day_after: after,
        },
      };
    },

    async heys_assign_training(args) {
      await requireProSportTier('Назначение плана тренировки');
      const date = resolveDate(args.date, nowMs);
      const current = await readDay(date);
      const res = day.assignTraining(current, args.index, {
        exercises: args.exercises,
        time: args.time,
        dayLabel: args.day_label,
        assignedBy: args.assigned_by,
        weekIndex: args.week_index,
        programId: args.program_id,
      }, { nowMs, clientId });
      if (res.error) throw new ToolError('invalid_assignment', res.error);

      const saved = await writeDay(date, res.day, Number(current.updatedAt) || 0);
      const after = await dayAfterWrite(saved, res.day);
      const written = res.day.trainings[res.index];
      const exCount = written.workoutLog.exercises.length;
      return {
        text: `Назначил силовую на ${date}${written.plan.dayLabel ? ` («${written.plan.dayLabel}»)` : ''}: ${exCount} упр. Клиент увидит план при открытии дня, в калории и нагрузку не войдёт, пока не начнёт.${dayAfterText(after)}`,
        structured: {
          date,
          index: res.index,
          plan_id: res.planId,
          exercises: exCount,
          day_after: after,
        },
      };
    },

    /**
     * Программа куратора, Слой 5: правка плана, который клиент уже открыл.
     *
     * Прямая запись здесь запрещена guard'ом в setStrengthWorkout — клиент в
     * этот момент может быть в зале. Правка кладётся предложением, решение за
     * ним. Предпросмотр возвращается сразу: куратор должен видеть, что часть
     * правки не ляжет, до того как её отправил, а не узнавать об этом после.
     */
    async heys_propose_training_edit(args) {
      await requireProSportTier('Правка назначенной тренировки');
      const date = resolveDate(args.date, nowMs);
      const current = await readDay(date);
      const res = day.proposeTrainingEdit(current, args.index, {
        exercises: args.exercises,
        proposedBy: args.proposed_by,
        note: args.note,
      }, { nowMs, clientId });
      if (res.error) throw new ToolError('invalid_proposal', res.error);

      await writeDay(date, res.day, Number(current.updatedAt) || 0);
      const blocked = res.preview.rejected;
      const bits = [`Отправил правку на ${date}. Клиент увидит её в приложении и решит сам — до его ответа план у него прежний.`];
      if (blocked.length) {
        bits.push(`Ляжет не всё: ${blocked.map((r) => `«${r.name}» (${r.reason === 'started_cannot_remove'
          ? 'клиент уже начал — останется в плане'
          : r.reason === 'superset_composition_frozen'
            ? 'связка начата, состав менять нельзя'
            : 'сделанные подходы остаются'})`).join('; ')}.`);
      }
      return {
        text: bits.join(' '),
        structured: {
          date,
          index: res.index,
          proposal_id: res.proposalId,
          will_apply: res.preview.applied,
          will_not_apply: blocked,
        },
      };
    },

    /**
     * Перенос назначенной тренировки на другую дату (16a/16b). Дни — разные
     * ключи, транзакции нет: сначала пишем целевой день, потом отметку на
     * исходном. Порядок именно такой — если второй записать не удалось, у
     * клиента окажется лишняя тренировка на новом дне, а не потерянная.
     */
    async heys_move_training(args) {
      await requireProSportTier('Перенос назначенной тренировки');
      const fromDate = resolveDate(args.date, nowMs);
      const toDate = String(args.to_date || '').trim();
      const sourceDay = await readDay(fromDate);
      const out = day.moveTrainingOut(sourceDay, args.index, { toDate, nowMs, clientId });
      if (out.error) throw new ToolError('invalid_move', out.error);

      const targetDay = await readDay(toDate);
      const into = day.moveTrainingIn(targetDay, out.movedTraining, { nowMs, clientId });
      if (into.error) throw new ToolError('target_day_full', into.error);

      await writeDay(toDate, into.day, Number(targetDay.updatedAt) || 0);
      await writeDay(fromDate, out.day, Number(sourceDay.updatedAt) || 0);

      const label = out.movedTraining.plan && out.movedTraining.plan.dayLabel;
      return {
        text: `Перенёс${label ? ` «${label}»` : ''} с ${fromDate} на ${toDate}. Это не пропуск: ${fromDate} освобождён заранее, тренировка ждёт на новой дате вместе с весами.`,
        structured: { from: fromDate, to: toDate, index: into.index },
      };
    },

    async heys_withdraw_training_proposal(args) {
      const date = resolveDate(args.date, nowMs);
      const current = await readDay(date);
      const res = day.withdrawTrainingProposal(current, args.index, { nowMs, clientId });
      if (res.error) throw new ToolError('nothing_to_withdraw', res.error);
      await writeDay(date, res.day, Number(current.updatedAt) || 0);
      return {
        text: `Отозвал правку на ${date}: у клиента план остался прежним, следа в его истории отзыв не оставляет.`,
        structured: { date, index: res.index },
      };
    },

    /**
     * Программа куратора, Слой 4: назначить несколько дней одним вызовом.
     *
     * Транзакции на несколько дней нет и не будет — дни лежат под разными
     * ключами KV. Поэтому валидация идёт целиком до первой записи (та же
     * assignTraining, что пишет по одному дню, — источник правил один), и
     * только если все дни проходят, начинается запись. Сбой посреди записи
     * (сеть, stale write) не должен уронить уже записанные дни: остальные
     * пишутся, а куратор получает точный список удавшихся и нет.
     */
    async heys_assign_program(args) {
      await requireProSportTier('Назначение программы тренировок');
      const daysInput = Array.isArray(args.days) ? args.days : [];
      if (!daysInput.length) {
        throw new ToolError('nothing_to_assign', 'Передай days — список дат с упражнениями на каждый день программы.');
      }
      if (typeof args.assigned_by !== 'string' || !args.assigned_by.trim()) {
        throw new ToolError('invalid_assignment', 'assigned_by обязателен: кто назначил программу.');
      }
      const title = typeof args.title === 'string' ? args.title.trim() : '';
      if (!title) throw new ToolError('invalid_assignment', 'title обязателен: как программа называется клиенту.');

      const normalized = [];
      const seenDates = new Set();
      for (const d of daysInput) {
        const date = resolveDate(d && d.date, nowMs);
        if (seenDates.has(date)) {
          throw new ToolError('invalid_assignment', `Дата ${date} указана в программе дважды.`);
        }
        seenDates.add(date);
        normalized.push({
          date,
          dayLabel: d && d.day_label,
          weekIndex: d && d.week_index,
          time: d && d.time,
          exercises: d && d.exercises,
        });
      }

      const programId = makeId('pr_');
      const blobs = await readMany(normalized.map((d) => day.dayKey(d.date)));
      // Каждый день проверяется той же функцией, что и пишет: расхождения
      // правил валидации и записи здесь исключены по построению.
      const prepared = normalized.map((d) => {
        const current = day.ensureDay(blobs[day.dayKey(d.date)], d.date, clientId, nowMs);
        const res = day.assignTraining(current, undefined, {
          exercises: d.exercises,
          time: d.time,
          dayLabel: d.dayLabel,
          assignedBy: args.assigned_by,
          weekIndex: d.weekIndex,
          programId,
        }, { nowMs, clientId });
        return { date: d.date, dayLabel: d.dayLabel, weekIndex: d.weekIndex, current, res };
      });

      const invalid = prepared.filter((p) => p.res.error);
      if (invalid.length) {
        throw new ToolError(
          'invalid_assignment',
          `Программа не назначена: ${invalid.length} из ${prepared.length} дней не проходят проверку, ничего не записано.\n${invalid.map((p) => `${p.date}: ${p.res.error}`).join('\n')}`,
          { invalid: invalid.map((p) => ({ date: p.date, error: p.res.error })) },
        );
      }

      const written = [];
      const failed = [];
      for (const p of prepared) {
        try {
          await writeDay(p.date, p.res.day, Number(p.current.updatedAt) || 0);
          written.push({
            date: p.date,
            dayLabel: p.dayLabel || null,
            weekIndex: p.weekIndex || null,
            trainingId: p.res.day.trainings[p.res.index].id,
          });
        } catch (e) {
          failed.push({ date: p.date, error: e.message || String(e) });
        }
      }

      const status = failed.length === 0 ? 'active' : (written.length === 0 ? 'failed' : 'partial');
      if (written.length > 0) {
        // Индекс — кэш поверх дней (см. PROGRAM_KEY): перезаписывается целиком,
        // известного updatedAt для сравнения нет, как и у profile/zones.
        await saveCardKey(PROGRAM_KEY, {
          id: programId,
          title,
          weeks: Number.isInteger(args.weeks) && args.weeks > 0 ? args.weeks : null,
          startDate: written.slice().sort((a, b) => (a.date < b.date ? -1 : 1))[0].date,
          assignedBy: args.assigned_by.trim(),
          assignedAt: nowMs,
          version: 1,
          status,
          days: written,
        }, 0);
      }

      const lines = [`Программа «${title}» (${programId}): назначено ${written.length} из ${prepared.length} дней.`];
      if (failed.length) lines.push(`Не удалось: ${failed.map((f) => `${f.date} (${f.error})`).join('; ')}.`);
      return {
        text: lines.join(' '),
        structured: { program_id: programId, status, written, failed },
      };
    },

    async heys_delete_training(args) {
      const date = resolveDate(args.date, nowMs);
      const current = await readDay(date);
      const res = day.deleteTraining(current, args.index, { nowMs, clientId });
      if (res.error === 'not_found') {
        const total = (current.trainings || []).length;
        throw new ToolError('not_found', total
          ? `В дне ${date} тренировок ${total} — index от 0 до ${total - 1}. Индексы смотри в heys_get_day.`
          : `В дне ${date} нет тренировок.`);
      }
      if (res.error === 'not_deletable') {
        throw new ToolError('not_deletable', 'Это пустая заготовка без данных — удалять нечего.');
      }
      const saved = await writeDay(date, res.day, Number(current.updatedAt) || 0);
      const after = await dayAfterWrite(saved, res.day);
      const what = res.removed.activityLabel || res.removed.type || 'тренировку';
      return {
        text: `Удалил ${what} за ${date} (${args.index}).${dayAfterText(after)}`,
        structured: { date, index: Number(args.index), day_after: after },
      };
    },

    async heys_update_training(args) {
      const date = resolveDate(args.date, nowMs);
      const current = await readDay(date);
      const patch = {
        zoneMinutes: args.zones_minutes, time: args.time, type: args.type,
        activityLabel: args.activity_label, comment: args.comment,
        mood: args.mood, wellbeing: args.wellbeing, stress: args.stress,
      };
      const res = day.updateTraining(current, args.index, patch, { nowMs, clientId });
      if (res.error === 'not_found') {
        const total = (current.trainings || []).length;
        throw new ToolError('not_found', total
          ? `В дне ${date} тренировок ${total} — index от 0 до ${total - 1}. Индексы смотри в heys_get_day.`
          : `В дне ${date} нет ни одной тренировки — сначала heys_log_training.`);
      }
      if (res.error === 'invalid_range') throw new ToolError('invalid_range', 'Оценки mood/wellbeing/stress — целые от 1 до 10.');
      if (res.error === 'nothing_to_update') {
        throw new ToolError('nothing_to_update', 'Не передано ни одного изменения: нужны zones_minutes, time, type, activity_label, comment или оценки.');
      }
      const saved = await writeDay(date, res.day, Number(current.updatedAt) || 0);
      const after = await dayAfterWrite(saved, res.day);
      return {
        text: `Поправил тренировку ${args.index} за ${date}: ${res.applied.join(', ')}.${dayAfterText(after)}`,
        structured: { date, index: Number(args.index), applied: res.applied, day_after: after },
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
      const hasPlannedSet = args.supplements_planned !== undefined && args.supplements_planned !== null;
      const hasPlannedAdd = args.supplements_planned_add !== undefined && args.supplements_planned_add !== null;
      const hasPlannedRemove = args.supplements_planned_remove !== undefined && args.supplements_planned_remove !== null;
      const hasSupplementsMark = args.supplements_mark !== undefined && args.supplements_mark !== null;
      const hasSupplementsUnmark = args.supplements_unmark !== undefined && args.supplements_unmark !== null;
      const hasSupplementsTiming = args.supplements_timing !== undefined && args.supplements_timing !== null;
      const hasRefeed = args.refeed_day !== undefined && args.refeed_day !== null;
      const needsProfile = hasSupplementsMark || hasSupplementsUnmark || hasSupplementsTiming
        || hasPlannedSet || hasPlannedAdd || hasPlannedRemove;
      const current = await readDay(date);
      // Быт нельзя записать поверх быта, уже записанного тренировкой: расход
      // складывает тренировки и householdMin независимо, и те же минуты уходят
      // в норму дважды (21.08.2026: пять часов стали десятью, +710 ккал).
      const householdAsTraining = day.householdTrainings(current);
      const askedHousehold = Array.isArray(args.household_activities)
        ? args.household_activities.reduce((sum, h) => sum + (Number(h && h.minutes) || 0), 0)
        : Number(args.household_min) || 0;
      if (askedHousehold > 0 && householdAsTraining.length) {
        const list = householdAsTraining
          .map((h) => `«${h.label}» ${h.minutes} мин (index ${h.index})`)
          .join(', ');
        throw new ToolError('household_already_as_training',
          `Быт за ${date} уже записан тренировкой: ${list}. Расход считает и тренировки, и household_min — эти минуты уйдут в норму дважды.`
          + ' Либо оставь как есть (быт уже учтён), либо сначала удали тренировку через heys_delete_training и запиши минуты сюда.');
      }
      if (Array.isArray(args.household_activities) && args.household_min !== undefined && args.household_min !== null) {
        throw new ToolError('invalid_field', 'household_min и household_activities — два способа записать одно и то же. Передай что-то одно.');
      }
      let working = current;
      const applied = [];
      let profileBlob = null;
      if (needsProfile) {
        const blobs = await readMany([profile.PROFILE_KEY]);
        profileBlob = blobs[profile.PROFILE_KEY];
      }
      const supplementsWriteRequested = hasPlannedSet || hasPlannedAdd || hasPlannedRemove
        || hasSupplementsMark || hasSupplementsUnmark || hasSupplementsTiming;
      if (supplementsWriteRequested && !cycleReleaseGate.isSupplementsFeatureAvailable(profileBlob)) {
        throw new ToolError('supplements_tracking_removed',
          'Трекинг добавок снят с релиза: запись отклоняется для обычных аккаунтов.');
      }
      if (supplementsWriteRequested && !(profileBlob && profileBlob.supplementsTrackingEnabled === true)) {
        throw new ToolError('supplements_tracking_disabled',
          'Трекинг добавок выключен в профиле клиента — включи supplements_tracking_enabled через heys_update_profile.');
      }
      if (hasPlannedSet || hasPlannedAdd) {
        const rawIds = [
          ...(hasPlannedSet && Array.isArray(args.supplements_planned) ? args.supplements_planned : []),
          ...(hasPlannedAdd && Array.isArray(args.supplements_planned_add) ? args.supplements_planned_add : []),
        ];
        const customIds = rawIds.filter((id) => String(id).startsWith('custom_'));
        if (customIds.length) {
          throw new ToolError('invalid_field',
            `Свободный текст добавок отключён — custom_* не принимаются: ${customIds.join(', ')}.`);
        }
      }
      try {
        if (Array.isArray(args.household_activities)) {
          working = day.setHouseholdActivities(working, args.household_activities, { nowMs, clientId }).day;
          applied.push('household_min');
        }
        // Вода тем же вызовом: «вода 500 и шаги 2000» — одна реплика, и она не
        // должна стоить два круга. Семантика та же, что у heys_add_water:
        // прибавка, отрицательное уменьшает.
        if (args.water_add_ml !== undefined && args.water_add_ml !== null) {
          const ml = Number(args.water_add_ml);
          if (!Number.isFinite(ml) || ml === 0) {
            throw new ToolError('invalid_field', 'water_add_ml — ненулевое число миллилитров; отрицательное уменьшает.');
          }
          working = day.addWater(working, ml, { nowMs, clientId });
          applied.push('water');
        }
        const updated = day.updateDayFields(working, fields, { nowMs, clientId, byCurator });
        if (updated.applied.length) {
          working = updated.day;
          applied.push(...updated.applied);
        }
        if (hasPlannedSet || hasPlannedAdd || hasPlannedRemove) {
          working = day.patchSupplementsPlanned(working, {
            set: hasPlannedSet ? args.supplements_planned : undefined,
            add: hasPlannedAdd ? args.supplements_planned_add : undefined,
            remove: hasPlannedRemove ? args.supplements_planned_remove : undefined,
          }, { nowMs, clientId });
          applied.push('supplements_planned');
        }
        if (hasSupplementsTiming) {
          const slot = args.supplements_timing;
          if (slot !== 'morning' && slot !== 'evening') {
            throw new ToolError('invalid_field', 'supplements_timing — "morning" или "evening".');
          }
          const planned = working.supplementsPlanned
            || (profileBlob && profileBlob.plannedSupplements)
            || [];
          const ids = day.filterSupplementsByTimingSlot(planned, slot, profileBlob);
          if (!ids.length) throw new ToolError('nothing_to_update', `В плане нет добавок для слота «${slot}».`);
          working = day.markSupplementsTaken(working, ids, true, { nowMs, clientId, profile: profileBlob });
          applied.push(`supplements_timing:${slot}`);
        }
        if (hasSupplementsMark) {
          working = day.markSupplementsTaken(working, args.supplements_mark, true, { nowMs, clientId, profile: profileBlob });
          applied.push('supplements_mark');
        }
        if (hasSupplementsUnmark) {
          working = day.markSupplementsTaken(working, args.supplements_unmark, false, { nowMs, clientId, profile: profileBlob });
          applied.push('supplements_unmark');
        }
        if (hasRefeed) {
          if (args.refeed_day === true && !args.refeed_reason) {
            throw new ToolError('invalid_field',
              'refeed_day:true — нужна причина refeed_reason: deficit, training, holiday или rest.');
          }
          if (args.refeed_reason && !day.REFEED_REASONS.has(args.refeed_reason)) {
            throw new ToolError('invalid_field',
              `refeed_reason — один из: ${[...day.REFEED_REASONS].join(', ')}.`);
          }
          try {
            working = day.applyRefeedDay(working, args.refeed_day, args.refeed_reason, { nowMs, clientId });
          } catch (e) {
            throw new ToolError('invalid_field', e.message);
          }
          applied.push(args.refeed_day ? 'refeed_day' : 'refeed_day:false');
        }
      } catch (e) {
        if (e instanceof ToolError) throw e;
        const HOUSEHOLD_ERRORS = {
          invalid_household_minutes: 'В household_activities каждая запись — minutes больше нуля.',
          household_minutes_too_big: 'В сутках 1440 минут — столько быта не бывает.',
        };
        if (HOUSEHOLD_ERRORS[e.message]) throw new ToolError('invalid_field', HOUSEHOLD_ERRORS[e.message]);
        throw new ToolError('invalid_field', String(e.message).startsWith('unknown_supplement:')
          ? `Добавка не из каталога: ${String(e.message).slice('unknown_supplement:'.length)}.`
          : e.message);
      }
      if (!applied.length) throw new ToolError('nothing_to_update', 'Не передано ни одного поля для обновления.');
      const saved = await writeDay(date, working, Number(current.updatedAt) || 0);
      const after = await dayAfterWrite(saved, working);
      return {
        text: `Обновил ${date}: ${applied.join(', ')}.${dayAfterText(after, applied)}`,
        structured: { date, updated: applied, day_after: after },
      };
    },

    /**
     * Утренний чек-ин — не то же самое, что heys_update_day.
     *
     * `get` отвечает, какие шаги закрыты, тем же условием, что смотрит само
     * приложение: поле заполнено И не помечено кураторским (day.checkinStatus).
     * `submit` пишет day-поля с `byCurator: false` — потому что смысл этого
     * инструмента ровно в том, что клиент диктует значения только что и живьём,
     * а не в том, что куратор вписывает их по своему усмотрению. Это и отличает
     * его от heys_update_day, где то же самое поле осталось бы помеченным
     * кураторским и не закрыло бы шаг в приложении.
     * Задним числом чек-ин не проходится (решено 04.08, docs/preferences.md):
     * submit работает только на сегодняшний день по границе приложения (3:00
     * по Москве) — прошлый день правится через heys_update_day, и он честно
     * останется пропущенным.
     */
    async heys_checkin(args) {
      const action = args.action;
      if (action !== 'get' && action !== 'submit') {
        throw new ToolError('invalid_action', 'action — "get" или "submit".');
      }
      const date = args.date ? resolveDate(args.date, nowMs) : checkinToday(nowMs);

      if (action === 'get') {
        const [currentDay, blobs] = await Promise.all([readDay(date), readMany([profile.PROFILE_KEY])]);
        const status = day.checkinStatus(currentDay, blobs[profile.PROFILE_KEY]);
        const pending = status.steps.filter((s) => s.required && !s.done).map((s) => s.label);
        const optionalOpen = status.steps.filter((s) => !s.required && !s.done).map((s) => s.label);
        const head = status.status === 'done' ? 'пройден'
          : status.status === 'not_started' ? 'не начат' : 'частично';
        return {
          text: `Чек-ин за ${date}: ${head}.`
            + (pending.length ? ` Не хватает: ${pending.join(', ')}.` : '')
            + (optionalOpen.length ? ` Необязательно: ${optionalOpen.join(', ')}.` : ''),
          structured: status,
        };
      }

      if (date !== checkinToday(nowMs)) {
        throw new ToolError('retroactive_checkin',
          'Чек-ин задним числом не проходится — так устроено и в приложении. '
          + `День ${date} останется пропущенным; отдельные поля правь heys_update_day.`);
      }

      const dayFields = {
        weight: args.weight,
        sleep_start: args.sleep_start,
        sleep_end: args.sleep_end,
        sleep_quality: clampSubjective(args.sleep_quality, 'sleep_quality'),
        // Шаг «утреннее настроение» в приложении спрашивает три оценки разом и
        // все три пишет одним сохранением (apps/web/heys_steps_v1.js,
        // registerStep('morning_mood')). Проверка «шаг пройден» смотрит только
        // на настроение, но принимать здесь одно его — значит отправить две
        // другие оценки в heys_update_day и пометить их кураторскими, хотя
        // клиент назвал их тем же голосом и в ту же секунду.
        mood: clampSubjective(args.mood, 'mood'),
        wellbeing: clampSubjective(args.wellbeing, 'wellbeing'),
        stress: clampSubjective(args.stress, 'stress'),
      };
      const hasDayFields = Object.values(dayFields).some((v) => v !== undefined && v !== null);
      const hasCold = args.cold_type !== undefined && args.cold_type !== null;
      const hasStepsGoal = args.steps_goal !== undefined && args.steps_goal !== null;
      const hasMeasurements = args.measurements !== undefined && args.measurements !== null;
      const hasSupplements = args.supplements !== undefined && args.supplements !== null;
      const hasCycleDay = args.cycle_day !== undefined && args.cycle_day !== null;
      const hasCycleStatus = args.cycle_status !== undefined && args.cycle_status !== null;
      const hasRefeed = args.refeed_day !== undefined && args.refeed_day !== null;
      if (hasCycleDay && hasCycleStatus) {
        throw new ToolError('invalid_field', 'cycle_day и cycle_status — разные ответы на один вопрос, передай только один.');
      }
      if (!hasDayFields && !hasCold && !hasStepsGoal && !hasMeasurements && !hasSupplements && !hasCycleDay && !hasCycleStatus && !hasRefeed) {
        throw new ToolError('nothing_to_update', 'Не передано ни одного шага чек-ина.');
      }
      if (hasRefeed && args.refeed_day === true && !args.refeed_reason) {
        throw new ToolError('invalid_field',
          'refeed_day:true — нужна причина refeed_reason: deficit, training, holiday или rest.');
      }
      if (hasRefeed && args.refeed_reason && !day.REFEED_REASONS.has(args.refeed_reason)) {
        throw new ToolError('invalid_field',
          `refeed_reason — один из: ${[...day.REFEED_REASONS].join(', ')}.`);
      }

      // Профиль читаем заранее, если он нужен для гейта цикла: тот же гейт,
      // что в приложении (hasCycleDecision) — трекинг цикла в принципе не
      // задаётся женским полом и включённым флагом. Он же переиспользуется
      // для steps_goal и для итогового статуса, чтобы не читать карточку дважды.
      let currentProfile;
      let profileForStatus;
      if (hasStepsGoal || hasCycleDay || hasCycleStatus || hasMeasurements || hasSupplements) {
        const blobs = await readMany([profile.PROFILE_KEY]);
        currentProfile = blobs[profile.PROFILE_KEY];
        profileForStatus = currentProfile;
      }
      if ((hasCycleDay || hasCycleStatus)) {
        if (!cycleReleaseGate.isCycleFeatureAvailable(currentProfile)) {
          throw new ToolError('cycle_tracking_removed',
            'Трекинг менструального цикла снят с релиза: cycle_day / cycle_status не пишутся ни одним путём. Функция вернётся после релиза в архитектуре device-only.');
        }
        if (!(currentProfile && currentProfile.gender === 'Женский' && currentProfile.cycleTrackingEnabled === true)) {
          throw new ToolError('cycle_tracking_disabled',
            'Трекинг цикла выключен в профиле клиента — для служебного аккаунта включи cycle_tracking_enabled через heys_update_profile.');
        }
      }
      if (hasMeasurements && !cycleReleaseGate.isMeasurementsFeatureAvailable(currentProfile)) {
        throw new ToolError('measurements_tracking_removed',
          'Трекинг замеров снят с релиза: measurements не пишутся для обычных аккаунтов.');
      }
      if (hasMeasurements && !(currentProfile && currentProfile.measurementsTrackingEnabled === true)) {
        throw new ToolError('measurements_tracking_disabled',
          'Трекинг замеров выключен в профиле клиента — включи measurements_tracking_enabled через heys_update_profile.');
      }
      if (hasSupplements && !cycleReleaseGate.isSupplementsFeatureAvailable(currentProfile)) {
        throw new ToolError('supplements_tracking_removed',
          'Трекинг добавок снят с релиза: supplements не пишутся для обычных аккаунтов.');
      }
      if (hasSupplements && !(currentProfile && currentProfile.supplementsTrackingEnabled === true)) {
        throw new ToolError('supplements_tracking_disabled',
          'Трекинг добавок выключен в профиле клиента — включи supplements_tracking_enabled через heys_update_profile.');
      }
      if (hasSupplements) {
        const ids = Array.isArray(args.supplements) ? args.supplements : [];
        const customIds = ids.filter((id) => String(id).startsWith('custom_'));
        if (customIds.length) {
          throw new ToolError('invalid_field',
            `Свободный текст добавок отключён — custom_* не принимаются: ${customIds.join(', ')}.`);
        }
      }
      if (hasCycleDay) {
        const n = Number(args.cycle_day);
        if (!Number.isInteger(n) || n < 1 || n > 7) throw new ToolError('invalid_field', 'cycle_day — целое число 1–7.');
      }
      if (hasCycleStatus && args.cycle_status !== 'none' && args.cycle_status !== 'skipped') {
        throw new ToolError('invalid_field', 'cycle_status — "none" или "skipped".');
      }

      const original = await readDay(date);
      let working = original;
      const applied = [];

      if (hasDayFields) {
        let updated;
        try {
          updated = day.updateDayFields(working, dayFields, { nowMs, clientId, byCurator: false });
        } catch (e) {
          throw new ToolError('invalid_field', e.message);
        }
        if (updated.applied.length) { working = updated.day; applied.push(...updated.applied); }
      }
      if (hasCold) {
        if (!day.COLD_EXPOSURE_TYPES.has(args.cold_type)) {
          throw new ToolError('invalid_field', `cold_type — один из: ${[...day.COLD_EXPOSURE_TYPES].join(', ')}.`);
        }
        working = day.applyColdExposure(working, args.cold_type, { nowMs, clientId });
        applied.push('cold_type');
      }
      if (hasMeasurements) {
        try {
          working = day.applyMeasurements(working, args.measurements || {}, { nowMs, clientId });
        } catch (e) {
          throw new ToolError('invalid_field', e.message === 'empty_measurements'
            ? 'measurements — нужен хотя бы один из waist/hips/thigh/biceps.' : e.message);
        }
        applied.push('measurements');
      }
      if (hasSupplements) {
        try {
          working = day.applySupplements(working, args.supplements, { nowMs, clientId });
        } catch (e) {
          throw new ToolError('invalid_field', String(e.message).startsWith('unknown_supplement:')
            ? `Неизвестные добавки: ${String(e.message).split(':')[1]}. Список — в схеме инструмента.`
            : e.message);
        }
        applied.push('supplements');
      }
      if (hasRefeed) {
        working = day.applyRefeedDay(working, args.refeed_day, args.refeed_reason, { nowMs, clientId });
        applied.push('refeed_day');
      }
      // Цикл — окно в семь дней, а не одна дата: почти всегда выходит за
      // пределы дня чек-ина, поэтому пишется отдельными вызовами writeDay
      // по каждой дате окна, а не через общий `working`/финальный writeDay.
      // Сегодняшний день внутри окна — исключение: его правим прямо в
      // `working`, чтобы после общего writeDay ниже в нём уже было верное
      // значение и не понадобилось лишнее чтение для итогового статуса.
      if (hasCycleDay) {
        const n = Number(args.cycle_day);
        const targets = day.cycleWindowDates(date, n);
        for (const t of targets) {
          if (t.date === date) {
            working = day.applyCycleDay(working, n, { nowMs, clientId });
            continue;
          }
          const other = await readDay(t.date);
          // Каждой дате окна — её собственный номер дня, не тот, что назвали
          // для сегодня: иначе соседние семь дней получили бы один и тот же
          // cycleDay вместо последовательности 1..7 вокруг названного.
          const nextOther = day.applyCycleDay(other, t.day, { nowMs, clientId });
          await writeDay(t.date, nextOther, Number(other.updatedAt) || 0);
        }
        applied.push(`cycle_day (окно ${targets[0].date}…${targets[targets.length - 1].date})`);
      } else if (hasCycleStatus) {
        const anchorDay = Number(working.cycleDay);
        const targets = (Number.isInteger(anchorDay) && anchorDay >= 1 && anchorDay <= 7)
          ? day.cycleWindowDates(date, anchorDay)
          : [{ day: null, date }];
        for (const t of targets) {
          if (t.date === date) {
            working = day.setCycleStatus(working, args.cycle_status, { nowMs, clientId });
            continue;
          }
          const other = await readDay(t.date);
          const nextOther = day.clearCycleDay(other, { nowMs, clientId });
          await writeDay(t.date, nextOther, Number(other.updatedAt) || 0);
        }
        applied.push('cycle_status');
      }
      // Профиль для итогового статуса — тот же объект, что только что записан
      // (или прочитан выше для гейта цикла / steps_goal), а не повторное
      // чтение: повторное чтение отвечало бы на вопрос «что видит следующий
      // вызов», а не «что мы сейчас сохранили», и с любым запаздывающим
      // кэшем API соврало бы про только что записанную цель.
      if (hasStepsGoal) {
        let patch;
        try {
          patch = profile.applyProfileFields(currentProfile, { steps_goal: args.steps_goal }, nowMs);
        } catch (e) {
          throw new ToolError(e.code || 'invalid_field', e.message);
        }
        if (patch.changed.length) {
          await saveCardKey(profile.PROFILE_KEY, patch.value, Number(currentProfile && currentProfile.updatedAt) || 0);
          profileForStatus = patch.value;
          applied.push('steps_goal');
        }
      }
      if (!applied.length) throw new ToolError('nothing_to_update', 'Ни один шаг чек-ина не изменился.');

      let after = null;
      if (working !== original) {
        const saved = await writeDay(date, working, Number(original.updatedAt) || 0);
        after = await dayAfterWrite(saved, working);
        if (saved && saved.value && typeof saved.value === 'object') working = saved.value;
      }
      if (profileForStatus === undefined) {
        const blobs = await readMany([profile.PROFILE_KEY]);
        profileForStatus = blobs[profile.PROFILE_KEY];
      }
      const status = day.checkinStatus(working, profileForStatus);
      const head = status.status === 'done' ? 'пройден' : status.status === 'partial' ? 'частично' : 'не начат';
      return {
        text: `Чек-ин за ${date}: записано ${applied.join(', ')}. Статус — ${head}.${after ? dayAfterText(after, applied) : ''}`,
        structured: { date, applied, status, day_after: after },
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

      const {
        product_id: _id, query: _query, recipe: recipeArg, recipe_patch: recipePatchArg, ...fields
      } = args;
      if (recipeArg && recipePatchArg) {
        throw new ToolError(
          'recipe_and_patch',
          'recipe заменяет состав целиком, recipe_patch правит названные позиции. Передавай что-то одно.',
        );
      }
      // Патч состава разворачивается в полный recipe до общей ветки: дальше
      // сохранение, пересчёт КБЖУ и rev у них общие, различается только вход.
      let recipeInput = recipeArg;
      let patchResult = null;
      if (recipePatchArg) {
        if (!target.recipe || !Array.isArray(target.recipe.items) || !target.recipe.items.length) {
          throw new ToolError(
            'not_a_recipe',
            `У «${target.name}» нет состава — патчить нечего. Заведи рецепт целиком: recipe:{yield_grams, items}.`,
          );
        }
        try {
          patchResult = products.applyRecipePatch(target.recipe, recipePatchArg);
        } catch (e) {
          if (e.code === 'recipe_patch_item_not_found') {
            throw new ToolError(
              'recipe_patch_item_not_found',
              `В составе «${target.name}» нет позиции «${e.ref}». Сейчас там: ${(e.available || []).join(', ')}.`,
              { available: e.available },
            );
          }
          if (e.code === 'recipe_patch_ambiguous') {
            throw new ToolError(
              'recipe_patch_ambiguous',
              `«${e.ref}» подходит сразу к нескольким позициям состава — назови ингредиент точнее или передай product_id.`,
            );
          }
          throw new ToolError('invalid_recipe_patch', `Не могу применить правку состава: ${e.message}.`);
        }
        recipeInput = patchResult.recipe_input;
      }
      if (recipeInput) {
        if (!target._custom) {
          throw new ToolError(
            'recipe_on_shared_forbidden',
            `«${target.name}» из общей базы — рецепт можно завести только на личной карточке (Type B). Создай свой продукт с recipe.`,
          );
        }
        if (products.hasManualNutrientInput(fields)) {
          throw new ToolError(
            'recipe_and_manual',
            'Рецепт сам считает КБЖУ. Вместе с recipe не передавай ручные нутриенты — только состав, порции, имя.',
          );
        }
        let recipePayload;
        try {
          recipePayload = products.buildRecipePayload(
            recipeInput,
            (spec) => findRecipeIngredient(catalog, spec),
            { nowMs, previousRev: Number(target.recipe && target.recipe.rev) || 0 },
          );
        } catch (e) {
          if (e.code === 'recipe_item_ambiguous') {
            throw new ToolError(
              'recipe_item_ambiguous',
              `Ингредиент «${e.query}» подходит к нескольким карточкам — передай product_id. Кандидаты: ${e.candidates.map((c) => `${c.name} (${c.product_id}, ${c.kcal100} ккал/100, ${c.source})`).join('; ')}.`,
              { candidates: e.candidates },
            );
          }
          if (e.code === 'recipe_item_not_found') {
            throw new ToolError(
              'recipe_item_not_found',
              `Ингредиент рецепта не найден${e.product_id ? ` (product_id=${e.product_id})` : e.query ? ` («${e.query}»)` : ''}. Ищется сначала в личном списке клиента, затем в общей базе — заведи карточку или уточни название.`,
              { product_id: e.product_id, query: e.query },
            );
          }
          throw new ToolError('invalid_recipe', `Не могу собрать рецепт: ${e.message}.`);
        }
        const nutrientPatch = { ...recipePayload.nutrients, recipe: recipePayload.recipe };
        if (fields.name) nutrientPatch.name = fields.name;
        if (fields.portions) nutrientPatch.portions = fields.portions;
        if (fields.brand !== undefined) nutrientPatch.brand = fields.brand;
        const overlayRes = await api.getKV(sessionToken, products.OVERLAY_KEY);
        if (overlayRes.error) throw new ToolError('upstream_error', `Не удалось прочитать список продуктов: ${overlayRes.error.message}`);
        const applied = products.applyProductPatchToOverlay(overlayRes.data, target, {
          ...nutrientPatch,
          user_modified: true,
          updatedAt: nowMs,
        }, {
          nowMs,
          makeId: () => `p_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
        });
        const saveRes = await products.saveOverlayRows(api, sessionToken, applied.rows);
        if (!saveRes.ok) throw new ToolError('save_failed', `Сервер отклонил правку продукта: ${saveRes.error}`);
        catalogPromise = null;
        const changesText = patchResult
          ? (patchResult.changes.length
            ? ` Изменения: ${patchResult.changes.join('; ')}.`
            : ' Состав не менялся — пересчитал КБЖУ по текущим карточкам ингредиентов.')
          : '';
        const yieldNote = patchResult && patchResult.yield_mode === 'follows_items'
          ? ' Выход пересчитан вслед за составом (он совпадал с суммой ингредиентов); нужен другой — передай yield_grams.'
          : patchResult && patchResult.yield_mode === 'kept_ratio'
            ? ' Выход пересчитан с сохранением прежней уварки; нужен другой — передай yield_grams.'
            : '';
        return {
          text: `Поправил рецепт «${target.name}»: ${recipePayload.nutrients.kcal100} ккал/100 из состава (rev ${recipePayload.recipe.rev}).${changesText}${yieldNote} Состав теперь: ${products.formatRecipeSummary(recipePayload.recipe)}. Прошлые записи в дневнике не менялись — только новые приёмы возьмут новый состав. Исправление прошлого — отдельная операция heys_reapply_recipe.`,
          structured: {
            product_id: target.id,
            name: nutrientPatch.name || target.name,
            mode: applied.mode,
            recipe: recipePayload.recipe,
            kcal100: recipePayload.nutrients.kcal100,
            changes: patchResult ? patchResult.changes : undefined,
            yield_mode: patchResult ? patchResult.yield_mode : undefined,
          },
        };
      }

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
      const saveRes = await products.saveOverlayRows(api, sessionToken, rows);
      if (!saveRes.ok) throw new ToolError('save_failed', `Сервер отклонил правку продукта: ${saveRes.error}`);
      catalogPromise = null;

      const note = mode === 'linked'
        ? ' Продукт был из общей базы — правка сохранена как личная версия, общая карточка не изменилась.'
        : mode === 'override'
          ? ' Правка сохранена поверх карточки общей базы, у других клиентов она не изменится.'
          : '';
      const usedIn = products.findRecipesUsingProduct(catalog, target);
      const usedNote = usedIn.length
        ? ` Продукт входит в блюда: ${usedIn.map((row) => `«${row.name}» (${row.product_id}, ${row.grams} г)`).join(', ')} — их КБЖУ считались при сохранении и сами не пересчитаются. Обнови каждое: heys_update_product(product_id=…, recipe_patch:{}).`
        : '';
      return {
        text: `Поправил «${target.name}»: ${built.changed.join('; ')}.${note}${usedNote}`,
        structured: {
          product_id: target.id,
          name: built.patch.name || target.name,
          mode,
          updated: built.changed,
          ignored: built.ignored,
          used_in_recipes: usedIn.length ? usedIn : undefined,
          catalog_size: catalog.all.length,
        },
      };
    },

    /**
     * Ретро: пересчитать прошлые позиции рецепта текущей карточкой.
     * Превью — пакет getKVMany. Применение — только writeDay/mergeSaveKV
     * по одному дню. upsertKVMany здесь нельзя: нет версии, затрёт правку клиента.
     */
    async heys_reapply_recipe(args) {
      const dateFrom = resolveDate(args.date_from, nowMs);
      const dateTo = resolveDate(args.date_to, nowMs);
      if (dateFrom > dateTo) {
        throw new ToolError('invalid_range', `date_from ${dateFrom} позже date_to ${dateTo}.`);
      }
      const dates = day.enumerateDates(dateFrom, dateTo, 120);
      if (!dates.length) throw new ToolError('invalid_range', 'Пустой период.');
      if (dates.length >= 120 && dates[dates.length - 1] < dateTo) {
        throw new ToolError('invalid_range', 'Период длиннее 120 дней — сузь даты.');
      }
      const product = await resolveProduct(
        { product_id: args.product_id, query: args.query },
        'Рецепт',
      );
      if (!product.recipe || !Array.isArray(product.recipe.items) || !product.recipe.items.length) {
        throw new ToolError(
          'not_a_recipe',
          `«${product.name}» без состава recipe — ретро не к чему применять.`,
        );
      }
      const recipeRev = args.recipe_rev != null && args.recipe_rev !== ''
        ? Number(args.recipe_rev)
        : null;
      if (recipeRev != null && !(recipeRev > 0)) {
        throw new ToolError('invalid_recipe_rev', 'recipe_rev должен быть положительным числом.');
      }

      const blobs = await readMany(dates.map((d) => day.dayKey(d)));
      const daysByDate = {};
      for (const date of dates) {
        const raw = blobs[day.dayKey(date)];
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          daysByDate[date] = day.ensureDay(raw, date, clientId, nowMs);
        }
      }
      const preview = products.previewRecipeReapply(daysByDate, product, { recipeRev });
      const revParts = Object.keys(preview.by_rev).sort().map((key) => (
        key === 'none'
          ? `без версии: ${preview.by_rev[key]}`
          : `rev ${key}: ${preview.by_rev[key]} записей`
      ));
      const warning = preview.warning_norms ? ' Нормы дней заметно изменятся — проверь Δккал.' : '';
      const ingredientsNote = ' Ингредиенты берутся с текущих карточек, истории карточек нет.';
      const previewText = preview.items_count
        ? `Превью «${product.name}» ${dateFrom}…${dateTo}: ${preview.days_count} дн., ${preview.items_count} позиций, Δ ${preview.kcal_delta} ккал. ${revParts.join(', ')}.${warning}${ingredientsNote}`
        : `В периоде ${dateFrom}…${dateTo} нет записей «${product.name}».`;

      const applyNow = args.confirm === true && args.dry_run !== true;
      if (!applyNow) {
        return {
          text: `${previewText} Чтобы применить — heys_reapply_recipe с confirm:true (dry_run не ставь).`,
          structured: { preview, product_id: product.id, dry_run: true },
        };
      }

      const applied = [];
      for (const row of preview.days) {
        const current = daysByDate[row.date];
        const lastSeen = Number(current && current.updatedAt) || 0;
        const result = products.applyRecipeToDay(current, product, { recipeRev, nowMs });
        if (!result.changed) continue;
        const saved = await writeDay(row.date, result.day, lastSeen);
        if (saved && saved.outcome === 'stale_write_blocked') {
          throw new ToolError(
            'stale_day',
            applied.length
              ? `День ${row.date} изменился, дальше не пошёл. Уже исправлено дней: ${applied.length} (${applied.map((a) => a.date).join(', ')}) — повторный запуск их пропустит, так что просто повтори вызов.`
              : `День ${row.date} изменился, повтори.`,
            { date: row.date, preview, applied },
          );
        }
        applied.push({
          date: row.date,
          items_count: result.items_count,
          kcal_delta: result.kcal_delta,
        });
      }

      return {
        text: `Исправил записи «${product.name}» в ${applied.length} дн. (${applied.reduce((sum, row) => sum + row.items_count, 0)} позиций).${ingredientsNote}`,
        structured: { preview, applied, product_id: product.id, dry_run: false },
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

      const usedIn = products.findRecipesUsingProduct(await loadCatalog(), target);
      // Наборы приёмов — вторая половина той же проверки, и до 21.08 её просто
      // не было: рецепты смотрели, наборы нет. В результате на проде четыре
      // набора двух клиентов ссылались на удалённые карточки. Матч тот же, что
      // при разворачивании (`resolvePresetItem`): id, затем нормализованное имя,
      // иначе предупреждение разойдётся с тем, что реально сломается.
      const targetNameNorm = products.normalizeText(target.name);
      const usedInPresets = (await loadPresets())
        .filter((preset) => preset.items.some((item) => (
          (item.product_id != null && String(item.product_id) === String(target.id))
          || products.normalizeText(item.name) === targetNameNorm
        )))
        .map((preset) => preset.name);

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

      const saveOverlay = await products.saveOverlayRows(api, sessionToken, rows);
      if (!saveOverlay.ok) throw new ToolError('save_failed', `Сервер отклонил удаление продукта: ${saveOverlay.error}`);
      const saveTomb = await api.upsertKV(sessionToken, TOMBSTONES_KEY, tombstones);
      if (!saveTomb.ok) {
        throw new ToolError(
          'tombstone_failed',
          `Продукт «${target.name}» убран из списка, но пометку об удалении сохранить не удалось (${saveTomb.error}). Синхронизация может вернуть его — проверь в приложении.`,
        );
      }
      catalogPromise = null;

      const usedNote = usedIn.length
        ? ` Он входил в состав блюд: ${usedIn.map((row) => `«${row.name}» (${row.product_id})`).join(', ')} — их сохранённые КБЖУ остались прежними, но пересчитать состав теперь нечем. Замени позицию: heys_update_product(product_id=…, recipe_patch:{remove:[…], set:[…]}).`
        : '';
      // Набор не разваливается: позиция развернётся по снимку КБЖУ, который в
      // ней лежит. Но состав набора теперь врёт про карточку, и в приложении
      // такая позиция отметится как ненайденная — сказать об этом надо сразу.
      const presetNote = usedInPresets.length
        ? ` Он входит в наборы: ${usedInPresets.map((name) => `«${name}»`).join(', ')} — они продолжат разворачиваться по сохранённому снимку КБЖУ, но карточки за позицией больше нет. Если продукт нужен дальше, заведи его заново (heys_create_product) и пересобери набор (heys_save_meal_preset).`
        : '';
      return {
        text: `Удалил продукт «${target.name}» из списка клиента.${usedNote}${presetNote}`,
        structured: {
          product_id: target.id,
          name: target.name,
          deleted: true,
          used_in_recipes: usedIn.length ? usedIn : undefined,
          used_in_presets: usedInPresets.length ? usedInPresets : undefined,
        },
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

      // Норме каждого дня нужны четыре предыдущих (окно долга), поэтому
      // читаем период с запасом — одним пакетом, а не по дню на вызов.
      const warmup = [4, 3, 2, 1].map((back) => day.addDays(from, -back));
      const blobs = await readMany([
        ...warmup.map((date) => day.dayKey(date)),
        ...dates.map((date) => day.dayKey(date)),
        profile.PROFILE_KEY,
        profile.NORMS_KEY,
        profile.ZONES_KEY,
      ]);
      const normBase = {
        profile: blobs[profile.PROFILE_KEY] || null,
        norms: blobs[profile.NORMS_KEY] || null,
        hrZones: blobs[profile.ZONES_KEY] || null,
        nowMs,
      };
      const days = dates.map((date) => {
        const dayObj = day.ensureDay(blobs[day.dayKey(date)], date, clientId, nowMs);
        const brief = day.summarizeDayBrief(dayObj);
        // Съеденное без нормы ничего не говорит — то же правило, что в
        // heys_get_day. Без неё разбор недели уходил обратно в get_day по дню.
        const backDates = [1, 2, 3, 4].map((back) => day.addDays(date, -back));
        const pastBlobs = {};
        for (const past of backDates) pastBlobs[past] = blobs[day.dayKey(past)] || null;
        const norm = day.dailyNorm(dayObj, {
          ...normBase,
          prevDay: pastBlobs[backDates[0]],
          pastBlobs,
        });
        return {
          ...brief,
          norm_kcal: norm && Number.isFinite(norm.kcal) ? norm.kcal : null,
          norm_source: (norm && norm.source) || null,
        };
      });

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

      // Разбивка по дням идёт в текст, а не только в structured: модель читает
      // текст, и без неё «как прошла неделя» превращалось в семь heys_get_day
      // следом за этим вызовом (трейс 2026-08-18, сессия ed342581dd34).
      const dayLines = days.map((d) => {
        if (d.empty) return `${d.date}: пусто`;
        const parts = [`${d.kcal}${d.norm_kcal ? `/${d.norm_kcal}` : ''} ккал`];
        parts.push(`Б${d.protein} У${d.carbs} Ж${d.fat}`);
        if (d.water_ml) parts.push(`вода ${d.water_ml}`);
        if (d.steps) parts.push(`шаги ${d.steps}`);
        if (d.sleep_hours) parts.push(`сон ${d.sleep_hours} ч`);
        if (d.training_min) parts.push(`тренировки ${d.training_min} мин`);
        if (d.weight_morning) parts.push(`вес ${d.weight_morning}`);
        return `${d.date}: ${parts.join(', ')}`;
      }).join('; ');
      const text = filled.length
        ? `Период ${from}…${to}: заполнено ${filled.length} из ${days.length} дней, в среднем ${totals.avg_kcal ?? '—'} ккал, вода ${totals.avg_water_ml ?? '—'} мл, шаги ${totals.avg_steps ?? '—'}, сон ${totals.avg_sleep_hours ?? '—'} ч.${missing.length ? ` Пустые дни: ${missing.join(', ')}.` : ''} По дням — ${dayLines}. Позиции приёмов сюда не входят: за составом конкретного дня иди в heys_get_day.`
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
      const today = day.nowParts(nowMs).date;
      const asked = resolveDate(args.to, nowMs);
      // Будущее не читаем: там блобов нет, и модель отдала бы нули, выглядящие
      // как «клиент не тренируется».
      const to = asked > today ? today : asked;
      // Окно нагрузки шире периода отчёта: постоянная времени тренированности
      // 42 дня, и на более коротком ряде экспонента не успевает прогреться.
      // MAX_PERIOD_DAYS (31) — эргономика листинга дней, не предел чтения:
      // readMany уходит одним RPC batch_get_client_kv_by_session независимо от
      // числа ключей, так что окно стоит объёма ответа, а не round-trip'ов.
      const days = Math.min(Math.max(Number(args.days) || 30, 1), MAX_PERIOD_DAYS);
      const from = day.addDays(to, -(days - 1));
      const loadFrom = day.addDays(to, -(LOAD_WINDOW_DAYS - 1));
      const loadDates = day.enumerateDates(loadFrom, to, LOAD_WINDOW_DAYS);
      const dates = day.enumerateDates(from, to, MAX_PERIOD_DAYS);
      const blobs = await readMany(loadDates.map((date) => day.dayKey(date)));

      const sessions = [];
      for (const date of dates) {
        const blob = blobs[day.dayKey(date)];
        const trainings = (blob && Array.isArray(blob.trainings)) ? blob.trainings : [];
        trainings.forEach((tr, index) => {
          // Раньше фильтр был `!tr.type`, и тренировка без типа выпадала из
          // списка молча. Это давало внутренне противоречивый ответ: «последняя
          // тренировка 01.08» рядом с усталостью за сессии 04–08.08, которые
          // модель нагрузки видит (ей тип не нужен). Проверено на живых данных
          // 2026-08-08 — heys_log_training до сегодняшнего дня тип не писал,
          // поэтому таких тренировок в истории много.
          // Тип ИЛИ реальная нагрузка. Только `isRealTraining` мало: сессии
          // модулей (пальцы, мобильность) не пишут ни минут, ни времени — они
          // опознаются как раз по типу, и сужение фильтра выкинуло бы их.
          if (!tr || (!tr.type && !day.isRealTraining(tr))) return;
          // Назначенное куратором в состоявшиеся не идёт: этот список кормит
          // by_type[].count и last_date, и план поднимал бы счётчик тренировок
          // и двигал «последнюю» на дату, когда клиент ничего не делал.
          // Ряды нагрузки ниже отсекают его сами — фильтр стоит в ядре
          // (sessionLoad/dayTonnage), а не здесь.
          if (day.isNotPerformedTraining(tr)) return;
          const log = tr.fingersLog || tr.mobilityLog || null;
          sessions.push({
            date,
            index,
            type: tr.type || null,
            program_id: (log && log.programId) || null,
            holds: (log && Array.isArray(log.holds)) ? log.holds.length : null,
            partial: !!(log && log.partial),
            note: tr.notes || '',
          });
        });
      }

      const byType = {};
      for (const s of sessions) {
        // Тренировка без типа попадает в свою корзину, а не пропадает: тип
        // необязателен, а нагрузку она несёт наравне с остальными.
        const key = s.type || 'без типа';
        if (!byType[key]) byType[key] = { count: 0, last_date: null };
        byType[key].count += 1;
        if (!byType[key].last_date || s.date > byType[key].last_date) byType[key].last_date = s.date;
      }
      const summary = Object.entries(byType).map(([type, info]) => `${type}: ${info.count}, последняя ${info.last_date}`);

      // Накопленная нагрузка: тренированность/усталость/готовность зеркальным
      // ядром (apps/web/_kernel/heys_kernel_load_v1.js). Считается на чтении из
      // блобов — ничего производного в блоб не пишется, иначе правка прошлого
      // дня оставила бы устаревшее число (урок savedDisplayOptimum).
      const inputs = await loadNormInputs(to);
      const zoneMets = Array.isArray(inputs && inputs.hrZones)
        ? inputs.hrZones.map((z) => Number(z && z.MET) || 0)
        : null;
      // Ряд ПЛОТНЫЙ: день без тренировок — ноль, а не пропуск, иначе распад
      // экспоненты посчитается по неверному числу дней.
      const cardioSeries = [];
      const tonnageSeries = [];
      // Дни, за которые блоб реально есть. Ряд плотный (пропуск = 0), поэтому
      // его длина всегда равна окну и уверенностью служить не может.
      let daysWithData = 0;
      for (const date of loadDates) {
        const blob = blobs[day.dayKey(date)];
        if (blob) daysWithData += 1;
        const trainings = (blob && Array.isArray(blob.trainings)) ? blob.trainings : [];
        let cardio = 0;
        for (const tr of trainings) cardio += webMirror.sessionLoad(tr, zoneMets);
        cardioSeries.push(cardio);
        tonnageSeries.push(blob ? webMirror.dayTonnage(blob) : 0);
      }
      // Кардио и силовая — раздельные ряды: единого коэффициента «кг тоннажа =
      // MET-минуты» не существует, сводить их в одно число рано.
      const cardioLoad = webMirror.fitnessFatigue(cardioSeries, { daysWithData });
      const strengthLoad = tonnageSeries.some((v) => v > 0)
        ? webMirror.fitnessFatigue(tonnageSeries, { daysWithData })
        : null;

      const loadBits = [
        `тренированность ${cardioLoad.ctl}, усталость ${cardioLoad.atl}, готовность ${cardioLoad.tsb} MET-мин/д`,
        cardioLoad.confidence !== 'high' ? `(уверенность ${cardioLoad.confidence}: история ${cardioLoad.daysOfHistory} дн)` : null,
      ].filter(Boolean).join(' ');

      return {
        text: (sessions.length
          ? `Тренировки за ${from}…${to} — ${summary.join('; ')}.`
          : `За ${from}…${to} тренировок не записано.`)
          + ` Кардио-нагрузка за ${LOAD_WINDOW_DAYS} дн: ${loadBits}.`,
        structured: {
          from,
          to,
          by_type: byType,
          sessions,
          load: {
            window_days: LOAD_WINDOW_DAYS,
            cardio: cardioLoad,
            strength_tonnage: strengthLoad,
          },
        },
      };
    },

    /**
     * Программа куратора, Слой 6: отчёт по назначенному циклу.
     *
     * Формат «значимых отклонений» протокол сознательно оставляет открытым
     * (CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09.md, «Открытое») — сюда
     * попадают только объективные факты (подход отличается от planSnapshot по
     * весу/повторам), без оценки «это уже плохо» или «ещё нормально»: решать
     * куратору по цифрам, а не инструменту за него.
     */
    async heys_get_program_status() {
      const blobs = await readMany([PROGRAM_KEY]);
      const program = blobs[PROGRAM_KEY];
      if (!program || !Array.isArray(program.days) || !program.days.length) {
        return {
          text: 'У клиента сейчас нет назначенной программы тренировок.',
          structured: { has_program: false },
        };
      }

      const sortedDays = program.days.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const dayBlobs = await readMany(sortedDays.map((d) => day.dayKey(d.date)));

      // 'moved' — отдельная строка рядом с «выполнено» и «пропущено»: перенос
      // пропуском не считается, иначе куратор увидит провал там, где клиент
      // просто передвинул день (дизайн-ревью 2026-08-10, 16f).
      const counts = { assigned: 0, started: 0, done: 0, skipped: 0, moved: 0, missing: 0 };
      const sessions = sortedDays.map((d) => {
        const blob = dayBlobs[day.dayKey(d.date)];
        const trainings = Array.isArray(blob && blob.trainings) ? blob.trainings : [];
        const training = trainings.find((t) => t && t.id === d.trainingId);
        const base = { date: d.date, dayLabel: d.dayLabel || null, weekIndex: d.weekIndex || null };
        if (!training || !training.plan) {
          counts.missing += 1;
          return { ...base, status: 'missing' };
        }
        const status = training.plan.status || 'assigned';
        counts[status] = (counts[status] || 0) + 1;
        const out = { ...base, status };
        if (status === 'done' && training.planSnapshot && training.workoutLog) {
          const bodyWeightKg = Number(blob && blob.weightMorning) || 0;
          const plannedShell = { type: 'strength', strengthEntryMode: 'workout_builder', workoutLog: training.planSnapshot };
          out.planned_volume_kg = Math.round(webMirror.trainingTonnage(plannedShell, { bodyWeightKg }).plannedVolume);
          out.actual_volume_kg = Math.round(webMirror.trainingTonnage(training, { bodyWeightKg }).totalVolume);
          out.deviations = compareProgramExercises(training.planSnapshot.exercises, training.workoutLog.exercises);
        }
        return out;
      });

      const withDeviations = sessions.filter((s) => Array.isArray(s.deviations) && s.deviations.length);
      const textParts = [
        `Программа «${program.title || 'без названия'}»${program.weeks ? `, ${program.weeks} нед.` : ''}: ` +
          `назначено ${counts.assigned}, идёт ${counts.started}, выполнено ${counts.done}, пропущено ${counts.skipped}` +
          (counts.moved ? `, перенесено ${counts.moved}` : '') +
          (counts.missing ? `, не найдено ${counts.missing}` : '') + '.',
      ];
      if (withDeviations.length) {
        textParts.push(
          'Отличия от плана: ' + withDeviations
            .map((s) => `${s.date}${s.dayLabel ? ` (${s.dayLabel})` : ''} — ${s.deviations.length} упр.`)
            .join('; ') + '.',
        );
      }

      return {
        text: textParts.join(' '),
        structured: {
          has_program: true,
          program: { id: program.id, title: program.title, weeks: program.weeks || null, status: program.status },
          counts,
          sessions,
        },
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
      const hasPlanned = args.planned_supplements !== undefined && args.planned_supplements !== null
        || (args.planned_supplements_add !== undefined && args.planned_supplements_add !== null)
        || (args.planned_supplements_remove !== undefined && args.planned_supplements_remove !== null);
      let patch;
      try {
        patch = profile.applyProfileFields(current, args, nowMs, { clientId });
      } catch (e) {
        throw new ToolError(e.code || 'invalid_field', e.message);
      }
      let profileValue = patch.value;
      let plannedChanged = [];
      let plannedList = null;
      if (hasPlanned) {
        if (!cycleReleaseGate.isSupplementsFeatureAvailable(profileValue)) {
          throw new ToolError('supplements_tracking_removed',
            'Трекинг добавок снят с релиза: planned_supplements не пишутся для обычных аккаунтов.');
        }
        if (!(profileValue && profileValue.supplementsTrackingEnabled === true)) {
          throw new ToolError('supplements_tracking_disabled',
            'Трекинг добавок выключен в профиле клиента — включи supplements_tracking_enabled через heys_update_profile.');
        }
        const rawPlanned = [
          ...(args.planned_supplements != null && Array.isArray(args.planned_supplements) ? args.planned_supplements : []),
          ...(args.planned_supplements_add != null && Array.isArray(args.planned_supplements_add) ? args.planned_supplements_add : []),
        ];
        const customIds = rawPlanned.filter((id) => String(id).startsWith('custom_'));
        if (customIds.length) {
          throw new ToolError('invalid_field',
            `Свободный текст добавок отключён — custom_* не принимаются: ${customIds.join(', ')}.`);
        }
        try {
          const plannedPatch = day.applyPlannedSupplementsToProfile(profileValue, args, nowMs);
          profileValue = plannedPatch.value;
          plannedChanged = plannedPatch.changed;
          plannedList = plannedPatch.planned;
        } catch (e) {
          throw new ToolError('invalid_field', String(e.message).startsWith('unknown_supplement:')
            ? `Добавка не из каталога: ${String(e.message).slice('unknown_supplement:'.length)}.`
            : e.message);
        }
      }
      const allChanged = [...patch.changed, ...plannedChanged];
      if (!allChanged.length) {
        throw new ToolError('nothing_to_update', patch.ignored.length
          ? `Эти поля профиль не хранит: ${patch.ignored.join(', ')}.`
          : 'Ни одно поле профиля не изменилось.');
      }
      await saveCardKey(profile.PROFILE_KEY, profileValue, Number(current && current.updatedAt) || 0);
      const syncDay = args.sync_planned_to_day !== false && plannedList && plannedChanged.length;
      if (syncDay) {
        const syncDate = args.sync_planned_date
          ? resolveDate(args.sync_planned_date, nowMs)
          : day.nowParts(nowMs).date;
        const dayCurrent = await readDay(syncDate);
        const dayNext = day.patchSupplementsPlanned(dayCurrent, { set: plannedList }, { nowMs, clientId });
        if (!day.plannedSupplementsEqual(plannedList, dayCurrent.supplementsPlanned)) {
          await writeDay(syncDate, dayNext, Number(dayCurrent.updatedAt) || 0);
        }
      }
      return {
        text: `Профиль обновлён — ${allChanged.join('; ')}.`,
        structured: {
          updated: allChanged,
          ignored: patch.ignored,
          planned_supplements: plannedList || (profileValue && profileValue.plannedSupplements) || [],
        },
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

const DATE_ARG = {
  type: 'string',
  description: 'Дата: YYYY-MM-DD или «сегодня»/«вчера»/«позавчера». По умолчанию — сегодня по московскому времени.',
};

/** Одна позиция: какой продукт и сколько. Количество — граммы либо штуки. */
const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    product_id: { type: 'string', description: 'Точный id продукта из heys_search_products.' },
    query: { type: 'string', description: 'Название продукта, если id неизвестен.' },
    grams: { type: 'number', description: 'Вес порции в граммах (для напитков — миллилитры). Если не передать и у продукта ровно одна порция в карточке — возьмётся она.' },
    pieces: { type: 'number', description: 'Количество штук, когда пользователь считает штуками («четыре конфеты»). Вес одной штуки берётся из карточки продукта — не подставляй граммы от себя.' },
    piece_grams: { type: 'number', description: 'Вес одной штуки в граммах. Нужен только если в карточке продукта его ещё нет: инструмент попросит, а полученное значение сохранит в карточку.' },
    new_product: {
      type: 'object',
      description: 'Запасной вариант на случай product_not_found: сервер заведёт карточку из этих полей (те же, что у heys_create_product: нутриенты на 100 г — protein100, simple100, complex100, badFat100, goodFat100, trans100, fiber100, gi, harm; опционально name/brand/portions/share) и сразу запишет позицию — без отдельного круга create. Если продукт по query нашёлся, поле игнорируется и дубль не создаётся. Передавай, когда состав известен (этикетка или типовые значения).',
    },
  },
};

const RECIPE_SCHEMA = {
  type: 'object',
  description: 'Состав блюда: ингредиенты и выход готового. КБЖУ считаются при сохранении и дальше не живут — смена карточки ингредиента рецепт не пересчитает.',
  properties: {
    yield_grams: { type: 'number', description: 'Выход готового блюда в граммах. Может быть меньше суммы ингредиентов (уварка).' },
    items: {
      type: 'array',
      description: 'Ингредиенты рецепта.',
      items: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'id ингредиента из heys_search_products.' },
          query: { type: 'string', description: 'Название ингредиента, если id неизвестен.' },
          grams: { type: 'number', description: 'Граммы ингредиента в замесе.' },
          name: { type: 'string', description: 'Подпись ингредиента в составе. Если не передать — имя продукта.' },
        },
        required: ['grams'],
      },
    },
  },
  required: ['yield_grams', 'items'],
};

/**
 * Правка названного, а не пересборка целого. Полная замена items требует от
 * модели помнить весь состав — так из блюда молча исчезают ингредиенты,
 * которых никто не называл.
 */
const RECIPE_PATCH_SCHEMA = {
  type: 'object',
  description: 'Точечная правка состава: меняются только названные позиции, остальные остаются как есть. Пустой объект — пересчитать КБЖУ по текущим карточкам ингредиентов, не трогая состав. Выход по умолчанию едет за составом (с прежней уваркой) — переопредели yield_grams, если это не так.',
  properties: {
    set: {
      type: 'array',
      description: 'Добавить ингредиент или задать ему новый вес. Если позиция с таким product_id или названием уже есть — меняется её вес, второй строки не появится.',
      items: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'id ингредиента из heys_search_products или heys_get_recipe.' },
          query: { type: 'string', description: 'Название ингредиента, если id неизвестен.' },
          name: { type: 'string', description: 'Подпись позиции в составе.' },
          grams: { type: 'number', description: 'Итоговый вес этой позиции в замесе (не прибавка).' },
        },
        required: ['grams'],
      },
    },
    remove: {
      type: 'array',
      description: 'Убрать позиции: product_id или название так, как оно записано в составе.',
      items: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'id позиции из heys_get_recipe.' },
          name: { type: 'string', description: 'Название позиции в составе.' },
        },
      },
    },
    yield_grams: { type: 'number', description: 'Новый выход готового блюда. Без него выход пересчитается вслед за составом, сохранив прежнюю уварку.' },
  },
};

const TOOL_SCHEMAS = [
  {
    name: 'heys_get_day',
    description: 'Показать день пользователя в HEYS: приёмы с meal_id и item_id в тексте, итоги БЖУ, норма («из N»), для сегодня — статус чек-ина. Вызывай перед правкой или удалением приёма — id и чек-ин бери из текста, не ищи в коде/БД и не делай отдельный heys_checkin(get).',
    inputSchema: {
      type: 'object',
      properties: { date: DATE_ARG },
    },
  },
  {
    name: 'heys_update_day',
    description: 'Куратор вписывает дневные показатели по своему усмотрению или задним числом: вес, шаги, быт, сон, настроение, самочувствие, стресс, комментарий, загрузочный день (refeed_day + refeed_reason), план добавок (supplements_planned / add / remove), отметки «принял» (supplements_mark / unmark / timing: morning|evening). Поле остаётся помеченным кураторским и не закрывает шаг утреннего чек-ина в приложении — клиент увидит его снова. Для «клиент диктует значения прямо сейчас, живьём» — heys_checkin, не этот инструмент.',
    inputSchema: {
      type: 'object',
      properties: {
        date: DATE_ARG,
        weight: { type: 'number', description: 'Утренний вес, кг.' },
        steps: { type: 'integer', description: 'Шаги за день.' },
        household_min: {
          type: 'integer',
          description: 'Минуты бытовой активности за день — единственное место для быта. ЗАМЕНЯЕТ прежнее значение целиком (0 — снять). Тренировкой быт писать нельзя: расход учтёт те же минуты дважды.',
        },
        water_add_ml: {
          type: 'number',
          description: 'Добавить выпитую воду (мл) этой же записью — когда в реплике и вода, и другие показатели, не делай отдельный heys_add_water. Прибавляется к текущему; отрицательное уменьшает.',
        },
        household_activities: {
          type: 'array',
          description: 'Быт несколькими записями, как в приложении: заменяет весь список за день. Нужен, когда у активности есть время начала или название («уборка на студии с 07:00»).',
          items: {
            type: 'object',
            properties: {
              minutes: { type: 'integer', description: 'Длительность в минутах, больше нуля.' },
              time: { type: 'string', description: 'Время начала HH:MM.' },
              label: { type: 'string', description: 'Название активности («уборка на студии»).' },
            },
            required: ['minutes'],
          },
        },
        sleep_start: { type: 'string', description: 'Время засыпания HH:MM.' },
        sleep_end: { type: 'string', description: 'Время подъёма HH:MM.' },
        sleep_quality: { type: 'integer', description: 'Качество сна, 1–10.' },
        sleep_note: { type: 'string', description: 'Заметка про сон.' },
        mood: { type: 'integer', description: 'Настроение, 1–10. В приложении это один утренний вопрос чек-ина — среднее за день считается вместе с оценками приёмов и тренировок.' },
        wellbeing: { type: 'integer', description: 'Самочувствие, 1–10. Поле карточки дня, не шаг утреннего чек-ина приложения.' },
        stress: { type: 'integer', description: 'Стресс, 1–10. Поле карточки дня, не шаг утреннего чек-ина приложения.' },
        comment: { type: 'string', description: 'Комментарий к дню.' },
        supplements_planned: {
          type: 'array', items: { type: 'string' },
          description: 'План добавок на день — заменяет прежний список supplementsPlanned.',
        },
        supplements_planned_add: {
          type: 'array', items: { type: 'string' },
          description: 'Добавить в план дня без снятия остальных.',
        },
        supplements_planned_remove: {
          type: 'array', items: { type: 'string' },
          description: 'Убрать из плана дня.',
        },
        supplements_mark: {
          type: 'array', items: { type: 'string' },
          description: 'Отметить принятые добавки в дневнике (supplementsTaken). Один, несколько или любой набор id.',
        },
        supplements_unmark: {
          type: 'array', items: { type: 'string' },
          description: 'Снять отметку «принял» для указанных id.',
        },
        supplements_timing: {
          type: 'string', enum: ['morning', 'evening'],
          description: 'Отметить все добавки из плана дня (или курса) с timing утро/вечер — как в приложении.',
        },
        refeed_day: {
          type: 'boolean',
          description: 'Загрузочный день (refeed): true — отметить (+35% к норме), false — снять. При true обязательна refeed_reason.',
        },
        refeed_reason: {
          type: 'string',
          enum: ['deficit', 'training', 'holiday', 'rest'],
          description: 'Причина загрузочного дня — тот же каталог, что в приложении: deficit (дефицит), training (тренировка), holiday (праздник), rest (ментальный отдых).',
        },
      },
    },
  },
  {
    name: 'heys_checkin',
    description: 'Утренний чек-ин приложения — не то же самое, что heys_update_day. `get` показывает, какие шаги уже закрыты (тем же условием, что и само приложение), `submit` пишет значения так, будто их ввели в самом приложении: без кураторской метки, шаг закрывается по-настоящему. Годится ровно для случая «клиент диктует прямо сейчас, живьём» — если куратор вписывает значение по своей догадке или задним числом, это heys_update_day, и оно останется помеченным. Задним числом submit не работает: день либо проходится сегодня, либо остаётся пропущенным — правь его heys_update_day.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['get', 'submit'], description: '"get" — статус и то, чего не хватает. "submit" — записать продиктованное.' },
        date: { type: 'string', description: 'YYYY-MM-DD. По умолчанию — сегодня по границе приложения (3:00 по Москве, как и сама доска задач). У submit — только сегодняшний день, у get можно смотреть любой.' },
        weight: { type: 'number', description: 'Утренний вес, кг.' },
        sleep_start: { type: 'string', description: 'Время засыпания HH:MM.' },
        sleep_end: { type: 'string', description: 'Время подъёма HH:MM.' },
        sleep_quality: { type: 'integer', description: 'Качество сна, 1–10.' },
        mood: { type: 'integer', description: 'Настроение утром, 1–10. Шаг «утреннее настроение» спрашивает три оценки разом — настроение, самочувствие, стресс; передавай их вместе, если клиент назвал все три.' },
        wellbeing: { type: 'integer', description: 'Самочувствие утром, 1–10 — вторая из трёх оценок того же шага.' },
        stress: { type: 'integer', description: 'Стресс утром, 1–10 — третья из трёх оценок того же шага. Здесь больше значит хуже.' },
        cold_type: { type: 'string', enum: ['none', 'coldShower', 'coldBath', 'coldSwim'], description: 'Холодовое воздействие — необязательный шаг. none — не было (обычный душ), coldShower/coldBath/coldSwim — холодный душ/ванна/моржевание.' },
        steps_goal: { type: 'integer', description: 'Цель по шагам на день — поле профиля, не дня; пишется тем же вызовом для удобства, физически уходит через heys_update_profile.' },
        measurements: {
          type: 'object',
          description: 'Замеры тела, необязательный шаг. Передавай только названные — остальные не тронутся.',
          properties: {
            waist: { type: 'number', description: 'Талия, см.' },
            hips: { type: 'number', description: 'Бёдра, см.' },
            thigh: { type: 'number', description: 'Бедро (обхват), см.' },
            biceps: { type: 'number', description: 'Бицепс, см.' },
          },
        },
        supplements: {
          type: 'array', items: { type: 'string' },
          description: 'Добавки на сегодня, необязательный шаг. Id из каталога приложения: vitD, vitC, zinc, selenium, omega3, magnesium, b12, b6, lecithin, calcium, k2, collagen, glucosamine, creatine, bcaa, protein, biotin, vitE, hyaluronic, iron, folic, melatonin, glycine, ltheanine, coq10, berberine, cinnamon, chromium, vinegar, flaxOil, oliveOil, fishOil — либо custom_* для того, что клиент завёл сам в приложении. Список целиком заменяет прежний, а не дополняет его.',
        },
        cycle_day: {
          type: 'integer', minimum: 1, maximum: 7,
          description: 'Снято с релиза: запись cycle_day отклоняется (cycle_tracking_removed). Исторически — номер дня цикла 1–7.',
        },
        cycle_status: {
          type: 'string', enum: ['none', 'skipped'],
          description: 'Снято с релиза: запись cycle_status отклоняется (cycle_tracking_removed).',
        },
        refeed_day: {
          type: 'boolean',
          description: 'Загрузочный день — необязательный шаг чек-ина. true + refeed_reason — отметить; false — обычный день. При true причина обязательна.',
        },
        refeed_reason: {
          type: 'string',
          enum: ['deficit', 'training', 'holiday', 'rest'],
          description: 'Причина refeed при refeed_day:true — deficit, training, holiday или rest.',
        },
      },
    },
  },
  {
    name: 'heys_log_meal',
    description: 'Создать приём пищи в дневнике. Несколько приёмов из одной реплики («два часа назад X, час назад Y, сейчас Z») — ОДИН вызов с meals: [{time, items}, …]. «Такой же перекус/приём целиком»: heys_get_day → copy_meal { date, meal_id }. «Такой же конверт/одну позицию» из приёма с несколькими блюдами: copy_meal { date, meal_id, item_ids } — граммы с сервера, не из текста get_day. count при «два»/«три». Новые позиции из той же реплики — items рядом с copy_meal в одном вызове. Составной напиток — позициями или preset. Одиночный продукт — items: [{ query или product_id, grams }]. Незнакомый продукт с известным составом — new_product внутри позиции, без отдельного heys_create_product. Гейт чек-ина за сегодня сервер проверяет сам: не закрыт — вернёт checkin_required.',
    inputSchema: {
      type: 'object',
      properties: {
        copy_meal: {
          type: 'object',
          description: 'Скопировать уже записанный приём («как вчера»). meal_id — из heys_get_day. item_ids — только эти позиции (для «такой же конверт»). count умножает граммовку. items/preset не обязательны; если переданы вместе с copy_meal — складываются с копией в один приём.',
          properties: {
            date: { type: 'string', description: 'Дата приёма-источника: YYYY-MM-DD, «вчера», «позавчера».' },
            meal_id: { type: 'string', description: 'meal_id из heys_get_day.' },
            item_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Скопировать только эти позиции (item_id из heys_get_day). Без item_ids — весь приём. «Такой же конверт» / одна позиция из приёма с несколькими блюдами — передай item_ids, не add_items с граммами из текста. Каждый id обязан быть в приёме-источнике: один неверный — весь вызов отклоняется с item_not_found, частичной копии не бывает.',
            },
            count: { type: 'number', description: 'Множитель граммовок, по умолчанию 1.' },
          },
          required: ['date', 'meal_id'],
        },
        preset: { type: 'string', description: 'Имя или preset_id сохранённого набора из heys_list_meal_presets. Позиции набора добавляются к items.' },
        preset_grams: { type: 'object', description: 'Переопределение граммовок для позиций набора: { "Молоко ультрапастеризованное 3.5": 200 }.' },
        items: {
          type: 'array',
          description: 'Позиции приёма.',
          items: ITEM_SCHEMA,
        },
        meals: {
          type: 'array',
          description: 'Несколько приёмов одной записью — когда в реплике их больше одного. Самостоятельная форма: не передавай рядом items/preset/copy_meal/time/name. До 6 приёмов, все за одну дату date; день сохраняется одной записью.',
          items: {
            type: 'object',
            properties: {
              time: { type: 'string', description: 'Время приёма HH:MM. По умолчанию — текущее московское.' },
              name: { type: 'string', description: 'Название приёма. По умолчанию — по времени.' },
              items: { type: 'array', items: ITEM_SCHEMA, description: 'Позиции приёма.' },
              mood: { type: 'integer', description: 'Настроение во время приёма, 1–10.' },
              wellbeing: { type: 'integer', description: 'Самочувствие во время приёма, 1–10.' },
              stress: { type: 'integer', description: 'Стресс во время приёма, 1–10.' },
            },
            required: ['items'],
          },
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
    description: 'Изменить уже записанный приём: добавить позиции, убрать их, поправить граммовку, переименовать, сдвинуть время. «В завтрак/обед такой же …»: heys_get_day(сегодня + источник) → heys_update_meal с copy_meal. Приём целиком — copy_meal { date, meal_id }; одна позиция («конверт как вчера») — copy_meal { date, meal_id, item_ids }. Граммы не собирай из текста get_day. meal_id приёма сегодня и item_id источника — из heys_get_day.',
    inputSchema: {
      type: 'object',
      properties: {
        meal_id: { type: 'string', description: 'Идентификатор приёма из heys_get_day.' },
        date: DATE_ARG,
        copy_meal: {
          type: 'object',
          description: 'Скопировать позиции из уже записанного приёма («как вчера») в этот meal_id. date/meal_id — приём-источник. item_ids — только эти позиции. count умножает граммовку. add_items не обязательны; если переданы вместе — складываются с копией.',
          properties: {
            date: { type: 'string', description: 'Дата приёма-источника: YYYY-MM-DD, «вчера», «позавчера».' },
            meal_id: { type: 'string', description: 'meal_id приёма-источника из heys_get_day.' },
            item_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Скопировать только эти позиции (item_id из heys_get_day). Без item_ids — весь приём. Каждый id обязан быть в приёме-источнике: один неверный — весь вызов отклоняется с item_not_found, частичной копии не бывает.',
            },
            count: { type: 'number', description: 'Множитель граммовок, по умолчанию 1.' },
          },
          required: ['date', 'meal_id'],
        },
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
    name: 'heys_search_products',
    description: 'Найти продукт в живом каталоге HEYS: личный список клиента, затем общая база. Для «какие продукты / что в базе / найди X» — основной инструмент; heys_code_* не заменяет. Возвращает product_id, КБЖУ на 100 г, порции, recipe_summary. Query — название или штрихкод. До create — когда нужно уточнить или проверить наличие.',
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
    name: 'heys_get_recipe',
    description: 'Показать состав блюда: ингредиенты с id и граммами, вклад каждого в калорийность, выход и уварку, порции, и сверку сохранённых КБЖУ с текущими карточками ингредиентов. Без product_id и query — список всех блюд клиента с составом. Вызывай перед разбором или правкой состава: recipe_summary в поиске — это подпись без id, считать по ней состав руками нельзя.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Точный id блюда из heys_search_products.' },
        query: { type: 'string', description: 'Название блюда, если id неизвестен.' },
      },
    },
  },
  {
    name: 'heys_create_product',
    description: [
      'Создать новый продукт в личном списке пользователя — например по фотографии этикетки с составом и пищевой ценностью.',
      'Без этикетки для близкого продукта (черри ← помидор) передай from_product_id: нутриенты копируются, имя новое — не выдумывай состав.',
      'Все значения указываются НА 100 Г продукта. Если на упаковке пищевая ценность дана на порцию, пересчитай на 100 г сам.',
      'Без from_product_id обязательны: protein100, simple100, complex100, badFat100, goodFat100, trans100, fiber100, gi, harm.',
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
        from_product_id: { type: 'string', description: 'Скопировать нутриенты с уже существующего продукта (product_id из search/get). Для «черри как помидор» без этикетки — не выдумывай состав. Если у источника есть рецепт, состав переезжает вместе с карточкой и пересчитывается по списку этого клиента: ингредиент ищется по его id, затем по имени. Нет ингредиента у клиента — вызов отклонён, заведи его первым.' },
        recipe: RECIPE_SCHEMA,
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
        allow_duplicate: { type: 'boolean', description: 'Создать, даже если продукт с таким или похожим названием уже есть, или был удалён. Ставь только после подтверждения пользователя.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'heys_get_period',
    description: 'Обзор нескольких дней сразу: по каждому дню калории против нормы, БЖУ, вода, шаги, сон, тренировки и утренний вес — прямо в тексте ответа, плюс средние за период и список пустых дней. Разбор недели закрывается одним этим вызовом: добирать дни через heys_get_day после него не нужно. Вызывай на вопросы «как прошла неделя», «что с весом за месяц», «где пробелы в дневнике» — вместо того чтобы дёргать heys_get_day по одному дню. Позиции приёмов здесь не возвращаются: за составом конкретного дня иди в heys_get_day.',
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
    name: 'heys_get_program_status',
    description: 'Отчёт по назначенной программе тренировок (heys_assign_program/heys_assign_training): сколько дней назначено, сколько идёт, выполнено, пропущено. Для выполненных дней — тоннаж по плану против факта и список подходов, где вес или повторы разошлись с planSnapshot (сырые цифры, без оценки «это уже плохо» — решай по числам сам). У клиента нет активной программы — скажет прямо, без ошибки.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'heys_get_profile',
    description: 'Карточка клиента: пол, возраст, рост, вес, целевой вес, целевой дефицит, норма сна и шагов, трекинг цикла, доступ с десктопа, нормы рациона в процентах и пульсовые зоны. Вызывай перед правкой этих настроек и когда нужно понять, из чего считаются нормы клиента.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'heys_update_profile',
    description: 'Изменить настройки клиента, которые куратор обычно вбивает во вкладке «Пользователь»: рост, вес, целевой вес, дату рождения, пол, норму сна, целевой дефицит, цель по шагам, трекинг цикла/замеров/добавок, доступ с десктопа, курс добавок (planned_supplements). Передавай только те поля, которые действительно меняешь: остальные останутся как были. Имя клиента отсюда не меняется. Курс можно заменить целиком (planned_supplements), добавить (planned_supplements_add) или убрать (planned_supplements_remove) — id из каталога vitD, omega3, … (custom_* отключены). По умолчанию новый курс синхронизируется в план сегодняшнего дня; sync_planned_to_day: false — только профиль.',
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
        cycle_tracking_enabled: { type: 'boolean', description: 'Снято с релиза: запись отклоняется (cycle_tracking_removed).' },
        measurements_tracking_enabled: { type: 'boolean', description: 'Трекинг замеров тела (талия, бёдра и т.д.).' },
        supplements_tracking_enabled: { type: 'boolean', description: 'Трекинг витаминов и добавок.' },
        desktop_allowed: { type: 'boolean', description: 'Разрешить клиенту вход с десктопа.' },
        planned_supplements: {
          type: 'array', items: { type: 'string' },
          description: 'Курс добавок целиком — заменяет прежний список в профиле. Id из каталога или custom_*.',
        },
        planned_supplements_add: {
          type: 'array', items: { type: 'string' },
          description: 'Добавить в курс без снятия остальных.',
        },
        planned_supplements_remove: {
          type: 'array', items: { type: 'string' },
          description: 'Убрать из курса, остальные остаются.',
        },
        sync_planned_date: { type: 'string', description: 'YYYY-MM-DD — в какой день синхронизировать план после смены курса. По умолчанию сегодня.' },
        sync_planned_to_day: { type: 'boolean', description: 'false — менять только профиль, не трогать supplementsPlanned в дне.' },
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
    name: 'heys_list_meal_presets',
    description: 'Показать сохранённые наборы приёмов пользователя (готовые комбинации продуктов с граммовками). Вызывай перед записью НОВОГО составного приёма через heys_log_meal. Для правки уже записанного приёма (heys_update_meal) наборы не нужны — бери meal_id и item_id из heys_get_day.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'heys_update_product',
    description: 'Поправить карточку продукта в списке клиента: нутриенты, название, бренд, штрихкод, порции, гликемический индекс, вредность. Составное блюдо: recipe заводит или заменяет состав целиком, recipe_patch правит названные позиции («убери кукурузу», «положи 4 яйца», «замени майонез на сметану»), пустой recipe_patch пересчитывает КБЖУ по текущим карточкам ингредиентов. Перед правкой состава — heys_get_recipe: пересобирать items по памяти нельзя, теряются ингредиенты. КБЖУ пересчитаются из состава, rev поднимется, прошлые записи в дневнике не изменятся (это не ретро). Продукт из общей базы правится только для этого клиента: общая карточка не меняется. Калорийность пересчитывается сама. Клетчатка (fiber100) — отдельная от углеводов масса: в complex100 её включать не нужно.',
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
        recipe: RECIPE_SCHEMA,
        recipe_patch: RECIPE_PATCH_SCHEMA,
      },
    },
  },
  {
    name: 'heys_reapply_recipe',
    description: 'Исправить уже записанные в дневник порции рецепта: подставить текущий состав и КБЖУ карточки на прошлые дни. Save рецепта этого не делает. Сначала dry_run (по умолчанию): превью числа дней/позиций, Δккал и группы по recipe_rev. Применение — только с confirm:true. Пишет по одному дню через merge, не пакетным upsert. Ингредиенты берутся с текущих карточек, истории карточек нет. Позиции без recipe_rev матчатся по product_id.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'id рецепта из heys_search_products.' },
        query: { type: 'string', description: 'Название рецепта, если id неизвестен.' },
        date_from: { type: 'string', description: 'Начало периода YYYY-MM-DD включительно.' },
        date_to: { type: 'string', description: 'Конец периода YYYY-MM-DD включительно.' },
        recipe_rev: { type: 'integer', description: 'Опционально: править только позиции с этой версией снимка.' },
        dry_run: { type: 'boolean', description: 'Только превью, без записи. По умолчанию true, пока нет confirm.' },
        confirm: { type: 'boolean', description: 'true — применить после превью. Без него запись не происходит.' },
      },
      required: ['date_from', 'date_to'],
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
    name: 'heys_log_training',
    description: 'Записать тренировку как минуты по пульсовым зонам: [зона1, зона2, зона3, зона4]. Если известна только общая длительность и интенсивность, положи минуты в соответствующую зону. Время, тип и ощущения — необязательные поля того же приёма, что заполняет клиент в приложении. Бытовая активность (уборка, ремонт, «просто на ногах») сюда НЕ пишется — она идёт в heys_update_day(household_min).',
    inputSchema: {
      type: 'object',
      properties: {
        zones_minutes: { type: 'array', items: { type: 'number' }, description: 'Минуты по пульсовым зонам, до 4 чисел.' },
        date: DATE_ARG,
        time: { type: 'string', description: 'Время начала, HH:MM. Без него тренировка не попадёт в расчёт средних оценок дня (правило приложения).' },
        type: { type: 'string', description: 'Тип: cardio, strength, hobby и т.п. — свободная строка, как в приложении.' },
        activity_label: { type: 'string', description: 'Название активности для отображения, если тип не покрывает («йога», «плавание»).' },
        mood: { type: 'integer', description: 'Настроение после тренировки, 1–10.' },
        wellbeing: { type: 'integer', description: 'Самочувствие после тренировки, 1–10.' },
        stress: { type: 'integer', description: 'Стресс после тренировки, 1–10.' },
        comment: { type: 'string', description: 'Свободный комментарий к тренировке.' },
        allow_as_training: {
          type: 'boolean',
          description: 'Записать бытовую по названию активность именно тренировкой — когда это была нагрузка по пульсу, а не быт. По умолчанию сервер такую запись отклоняет.',
        },
      },
      required: ['zones_minutes'],
    },
  },
  {
    name: 'heys_log_strength_workout',
    description: 'Записать силовую тренировку конструктором — так же, как её ведёт клиент в приложении: упражнения, подходы с весом и повторами, суперсеты, RPE, отдых. Куратор диктует тренировку целиком, поэтому вся она пишется ОДНИМ вызовом: список exercises и есть пачка. Проверяются все упражнения до записи — ошибка в одном не оставит половину тренировки записанной. Подходы по умолчанию считаются выполненными: вносится состоявшаяся тренировка, а не план. Дропсет — это ступени сброса ВНУТРИ одного подхода (поле drops), а не отдельные подходы: иначе счётчик подходов завысится. Разминочный подход помечается set_type=warmup и в тоннаж не идёт. Упражнение на своём весе (подтягивания, отжимания) — unit=bodyweight + bodyweight_factor, иначе довес (extra_weight_kg) в тоннаж не попадёт. Упражнение на время или дистанцию (планка, фермерская переноска) — unit=time/distance на упражнении, тогда у подходов вместо reps duration_sec/distance_m. Обычная тренировка по пульсовым зонам пишется через heys_log_training.',
    inputSchema: {
      type: 'object',
      properties: {
        exercises: {
          type: 'array',
          description: 'Упражнения по порядку. Каждое — со своим списком подходов.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Название упражнения, свободная строка: «Жим лёжа».' },
              unit: { type: 'string', enum: ['weight_reps', 'bodyweight', 'time', 'distance'], description: 'Как измеряется подход. По умолчанию weight_reps (вес×повторы). bodyweight — свой вес (подтягивания, отжимания; нужен bodyweight_factor), time — планка и т.п. (нужен duration_sec у подходов), distance — переноски и т.п. (нужен distance_m).' },
              bodyweight_factor: { type: 'number', description: 'Доля веса тела в движении, 0–2 (подтягивания 1.0, брусья 0.95, отжимания 0.64, обратные отжимания 0.4). Только при unit=bodyweight; без него тоннаж честно не считается — дефолт не выдумывается.' },
              approaches: {
                type: 'array',
                description: 'Подходы по порядку. Дропсет — не отдельные подходы, а ступени drops внутри одного подхода.',
                items: {
                  type: 'object',
                  properties: {
                    weight_kg: { type: 'number', description: 'Вес, кг. Пусто или 0 — свой вес (подтягивания, отжимания).' },
                    reps: { type: 'integer', description: 'Повторы, 1–200. Не нужен при unit=time/distance.' },
                    duration_sec: { type: 'integer', description: 'Время под нагрузкой, секунды, 1–86400. Только при unit=time.' },
                    distance_m: { type: 'number', description: 'Дистанция, метры, 1–200000. Только при unit=distance.' },
                    done: { type: 'boolean', description: 'Выполнен ли. По умолчанию true — вносится уже сделанная тренировка.' },
                    set_type: { type: 'string', enum: ['work', 'warmup'], description: 'Рабочий или разминочный. По умолчанию рабочий; разминка не идёт в тоннаж.' },
                    extra_weight_kg: { type: 'number', description: 'Довес к своему весу: блин на поясе при подтягиваниях. Свойство подхода, 0–500.' },
                    discomfort: { type: 'boolean', description: 'Был дискомфорт/боль на этом подходе — сигнал снизить вес или пропустить упражнение, а не просто пометка.' },
                    discomfort_note: { type: 'string', description: 'Где именно и что почувствовал, до 100 символов. Имеет смысл только вместе с discomfort=true.' },
                    drops: {
                      type: 'array',
                      description: 'Ступени сброса внутри этого подхода, по порядку. Вес каждой следующей ниже предыдущей, всего не больше двух ступеней. В связке дропсет запрещён.',
                      items: {
                        type: 'object',
                        properties: {
                          weight_kg: { type: 'number', description: 'Вес ступени, кг — ниже предыдущей.' },
                          reps: { type: 'integer', description: 'Повторы на ступени, 1–200.' },
                          done: { type: 'boolean', description: 'Выполнена ли ступень. По умолчанию как у подхода.' },
                        },
                        required: ['weight_kg', 'reps'],
                      },
                    },
                  },
                  required: [],
                },
              },
              rpe: { type: 'integer', description: 'Субъективная тяжесть упражнения, 0–10.' },
              superset_group: { type: 'integer', description: 'Номер связки: одинаковый у упражнений одного суперсета, 0 — без связки. В связке нужно минимум два упражнения.' },
              rest_sec: { type: 'integer', description: 'Отдых между подходами: 60, 90, 120 или 180. По умолчанию 90.' },
              note: { type: 'string', description: 'Заметка к упражнению.' },
            },
            required: ['name', 'approaches'],
          },
        },
        date: DATE_ARG,
        index: { type: 'integer', description: 'Номер тренировки в дне, если переписываешь существующую. Без него добавляется новая.' },
        time: { type: 'string', description: 'Время начала, HH:MM.' },
        duration_min: { type: 'integer', description: 'Длительность в минутах — из неё считаются калории тренировки.' },
        comment: { type: 'string', description: 'Комментарий к тренировке целиком.' },
      },
      required: ['exercises'],
    },
  },
  {
    name: 'heys_assign_training',
    description: 'Назначить клиенту план силовой тренировки — куратор задаёт задание, а не отчитывается о сделанном. Та же форма упражнений и подходов, что в heys_log_strength_workout, но подходы по умолчанию НЕ выполнены (done: false) и в калории с нагрузкой клиента план не входит, пока тот не начнёт тренировку в приложении. Клиент увидит план на карточке дня ("Начать по плану") и либо стартует его как обычную тренировку, либо отметит пропуск. Правка плана куратором возможна только пока клиент его не начал — после старта heys_log_strength_workout и повторный heys_assign_training на этот index откажут.',
    inputSchema: {
      type: 'object',
      properties: {
        exercises: {
          type: 'array',
          description: 'Упражнения по порядку. Каждое — со своим списком подходов.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Название упражнения, свободная строка: «Жим лёжа».' },
              unit: { type: 'string', enum: ['weight_reps', 'bodyweight', 'time', 'distance'], description: 'Как измеряется подход. По умолчанию weight_reps. bodyweight — нужен bodyweight_factor, time — нужен duration_sec у подходов, distance — distance_m.' },
              bodyweight_factor: { type: 'number', description: 'Доля веса тела в движении, 0–2 (подтягивания 1.0, брусья 0.95, отжимания 0.64). Только при unit=bodyweight.' },
              approaches: {
                type: 'array',
                description: 'Подходы по порядку. Дропсет — не отдельные подходы, а ступени drops внутри одного подхода.',
                items: {
                  type: 'object',
                  properties: {
                    weight_kg: { type: 'number', description: 'Вес, кг. Пусто или 0 — свой вес (подтягивания, отжимания).' },
                    reps: { type: 'integer', description: 'Повторы, 1–200. Не нужен при unit=time/distance.' },
                    duration_sec: { type: 'integer', description: 'Время под нагрузкой, секунды, 1–86400. Только при unit=time.' },
                    distance_m: { type: 'number', description: 'Дистанция, метры, 1–200000. Только при unit=distance.' },
                    done: { type: 'boolean', description: 'Выполнен ли. По умолчанию true — вносится уже сделанная тренировка.' },
                    set_type: { type: 'string', enum: ['work', 'warmup'], description: 'Рабочий или разминочный. По умолчанию рабочий; разминка не идёт в тоннаж.' },
                    extra_weight_kg: { type: 'number', description: 'Довес к своему весу: блин на поясе при подтягиваниях. Свойство подхода, 0–500.' },
                    discomfort: { type: 'boolean', description: 'Был дискомфорт/боль на этом подходе.' },
                    discomfort_note: { type: 'string', description: 'Где именно и что почувствовал, до 100 символов.' },
                    drops: {
                      type: 'array',
                      description: 'Ступени сброса внутри этого подхода, по порядку. Вес каждой следующей ниже предыдущей, всего не больше двух ступеней. В связке дропсет запрещён.',
                      items: {
                        type: 'object',
                        properties: {
                          weight_kg: { type: 'number', description: 'Вес ступени, кг — ниже предыдущей.' },
                          reps: { type: 'integer', description: 'Повторы на ступени, 1–200.' },
                          done: { type: 'boolean', description: 'Выполнена ли ступень. По умолчанию как у подхода.' },
                        },
                        required: ['weight_kg', 'reps'],
                      },
                    },
                  },
                  required: [],
                },
              },
              rpe: { type: 'integer', description: 'Субъективная тяжесть упражнения, 0–10.' },
              superset_group: { type: 'integer', description: 'Номер связки: одинаковый у упражнений одного суперсета, 0 — без связки. В связке нужно минимум два упражнения.' },
              rest_sec: { type: 'integer', description: 'Отдых между подходами: 60, 90, 120 или 180. По умолчанию 90.' },
              note: { type: 'string', description: 'Заметка к упражнению.' },
            },
            required: ['name', 'approaches'],
          },
        },
        date: DATE_ARG,
        index: { type: 'integer', description: 'Номер тренировки в дне, если переназначаешь уже стоящий там план. Без него назначается новая.' },
        time: { type: 'string', description: 'Время начала, HH:MM.' },
        day_label: { type: 'string', description: 'Как называть этот день клиенту: «День B», «Верх тела».' },
        assigned_by: { type: 'string', description: 'Обязательно: имя куратора, который назначил тренировку.' },
        week_index: { type: 'integer', description: 'Номер недели цикла, с 1 — если план часть многонедельной программы.' },
        program_id: { type: 'string', description: 'Идентификатор программы, если план — часть многонедельного цикла, а не разовое назначение.' },
      },
      required: ['exercises', 'assigned_by'],
    },
  },
  {
    name: 'heys_propose_training_edit',
    description: 'Изменить назначенную тренировку ПОСЛЕ того, как клиент её открыл (план в статусе started или skipped). Записать поверх нельзя — клиент может быть в зале прямо сейчас, — поэтому правка уходит ему предложением, и решает он. Главное правило: предложение никогда не трогает отмеченные подходы, оно ложится только на то, к чему клиент ещё не приступал. Отсюда следствия: закрытый подход не изменится ни весом, ни повторами, ни удалением; незакрытые подходы начатого упражнения правятся, включая их число; начатое упражнение останется в плане, даже если ты его вычеркнул; у начатой связки состав заморожен, правятся только веса. Что не ляжет — инструмент назовёт сразу, до отправки. Пока план не открыт (assigned) правь напрямую через heys_assign_training, а завершённую тренировку не меняют вовсе.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Номер тренировки в дне, с нуля — как в heys_get_day.' },
        date: DATE_ARG,
        proposed_by: { type: 'string', description: 'Обязательно: имя куратора, который предлагает правку.' },
        note: { type: 'string', description: 'Короткое объяснение клиенту, почему правка: «плечо ещё не готово к жиму под углом».' },
        exercises: {
          type: 'array',
          description: 'Тренировка целиком в том виде, в каком она должна выглядеть после правки — та же форма, что в heys_assign_training. Не список изменений: пришли полный состав, а что из него можно тронуть, решит правило выше.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Название упражнения.' },
              unit: { type: 'string', enum: ['weight_reps', 'bodyweight', 'time', 'distance'], description: 'Как измеряется подход. По умолчанию weight_reps. bodyweight — нужен bodyweight_factor, time — duration_sec у подходов, distance — distance_m.' },
              bodyweight_factor: { type: 'number', description: 'Доля веса тела в движении, 0–2 (подтягивания 1.0, брусья 0.95, отжимания 0.64). Только при unit=bodyweight; без него тоннаж не считается — дефолт не выдумывается.' },
              approaches: {
                type: 'array',
                description: 'Подходы по порядку. Дропсет — не отдельные подходы, а ступени drops внутри одного подхода.',
                items: {
                  type: 'object',
                  properties: {
                    weight_kg: { type: 'number', description: 'Вес, кг. Пусто или 0 — свой вес.' },
                    reps: { type: 'integer', description: 'Повторы, 1–200. Не нужен при unit=time/distance.' },
                    duration_sec: { type: 'integer', description: 'Время под нагрузкой, секунды, 1–86400. Только при unit=time.' },
                    distance_m: { type: 'number', description: 'Дистанция, метры, 1–200000. Только при unit=distance.' },
                    done: { type: 'boolean', description: 'Выполнен ли.' },
                    set_type: { type: 'string', enum: ['work', 'warmup'], description: 'Рабочий или разминочный.' },
                    extra_weight_kg: { type: 'number', description: 'Довес к своему весу, 0–500.' },
                    discomfort: { type: 'boolean', description: 'Был дискомфорт/боль на этом подходе.' },
                    discomfort_note: { type: 'string', description: 'Где именно и что почувствовал, до 100 символов.' },
                    drops: {
                      type: 'array',
                      description: 'Ступени сброса внутри этого подхода, по порядку. Вес каждой следующей ниже предыдущей, всего не больше двух ступеней. В связке дропсет запрещён.',
                      items: {
                        type: 'object',
                        properties: {
                          weight_kg: { type: 'number', description: 'Вес ступени, кг — ниже предыдущей.' },
                          reps: { type: 'integer', description: 'Повторы на ступени, 1–200.' },
                          done: { type: 'boolean', description: 'Выполнена ли ступень. По умолчанию как у подхода.' },
                        },
                        required: ['weight_kg', 'reps'],
                      },
                    },
                  },
                  required: [],
                },
              },
              rpe: { type: 'integer', description: 'Субъективная тяжесть упражнения, 0–10.' },
              superset_group: { type: 'integer', description: 'Номер связки, 0 — без связки.' },
              rest_sec: { type: 'integer', description: 'Отдых между подходами: 60, 90, 120 или 180.' },
              note: { type: 'string', description: 'Заметка к упражнению.' },
            },
            required: ['name', 'approaches'],
          },
        },
      },
      required: ['index', 'exercises', 'proposed_by'],
    },
  },
  {
    name: 'heys_move_training',
    description: 'Перенести назначенную тренировку на другую дату — целиком, вместе с весами. Перенос это НЕ пропуск: исходный день освобождается заранее и в отчёте идёт отдельной строкой, а не в «пропущено». Переносить можно только план, который клиент ещё не открыл: начатую и завершённую тренировку не переносят, сделанное остаётся на своём дне. Прошедший день не воскрешают — если день уже пропущен, назначь замену обычным heys_assign_training на свободную дату, это будет отдельная тренировка, а не воскресший вторник. Если на целевом дне уже три тренировки, перенос откажет: выбери другую дату.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Номер тренировки в дне, с нуля — как в heys_get_day.' },
        date: DATE_ARG,
        to_date: { type: 'string', description: 'Куда переносим, YYYY-MM-DD.' },
      },
      required: ['index', 'to_date'],
    },
  },
  {
    name: 'heys_withdraw_training_proposal',
    description: 'Отозвать свою правку, пока клиент на неё не ответил. Отзыв следа в истории клиента не оставляет — в отличие от его отказа. Нужен, когда правку отправили по ошибке или передумали; чтобы заменить её другой, отзывать не обязательно — новое предложение и так вытесняет прежнее.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Номер тренировки в дне, с нуля.' },
        date: DATE_ARG,
      },
      required: ['index'],
    },
  },
  {
    name: 'heys_assign_program',
    description: 'Назначить клиенту программу силовых тренировок на несколько дней одним вызовом — например «верх/низ на 4 недели». Каждый день из days назначается тем же способом, что heys_assign_training (план, не факт: подходы не выполнены, в калории и нагрузку не входит). Все дни проверяются целиком до первой записи — ошибка в одном дне не даст назначить ни одного. Пишутся дни по одному, потому что это разные ключи в облаке: при сбое посреди программа помечается частичной (status: partial), а ответ называет, какие даты записались, а какие нет — вызови инструмент повторно только для незаписанных дат, не для всей программы заново. Замена уже активной программы (новая версия взамен старой) этим инструментом не делается: он всегда создаёт независимый program_id. Клиент увидит программу сам, когда откроет день или карточку тренировок, но пуш и сообщение об этом не уходят — как и с любым другим действием, писать клиенту об этом или нет решает куратор (heys_reply_message), инструмент не пишет за него сам.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Название программы для клиента: «Верх/низ, 4 недели».' },
        assigned_by: { type: 'string', description: 'Обязательно: имя куратора, который назначил программу.' },
        weeks: { type: 'integer', description: 'Длительность цикла в неделях — для отображения клиенту, на валидацию не влияет.' },
        days: {
          type: 'array',
          description: 'Дни программы по датам. Каждый день — как один вызов heys_assign_training.',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'Дата дня в формате YYYY-MM-DD.' },
              day_label: { type: 'string', description: 'Как называть этот день клиенту: «День B», «Верх тела».' },
              week_index: { type: 'integer', description: 'Номер недели цикла, с 1.' },
              time: { type: 'string', description: 'Время начала, HH:MM.' },
              exercises: {
                type: 'array',
                description: 'Упражнения дня по порядку, та же форма, что в heys_assign_training.exercises.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Название упражнения, свободная строка: «Жим лёжа».' },
                    unit: { type: 'string', enum: ['weight_reps', 'bodyweight', 'time', 'distance'], description: 'Как измеряется подход. По умолчанию weight_reps. bodyweight — нужен bodyweight_factor, time — нужен duration_sec у подходов, distance — distance_m.' },
              bodyweight_factor: { type: 'number', description: 'Доля веса тела в движении, 0–2 (подтягивания 1.0, брусья 0.95, отжимания 0.64). Только при unit=bodyweight.' },
                    approaches: {
                      type: 'array',
                      description: 'Подходы по порядку.',
                      items: {
                        type: 'object',
                        properties: {
                          weight_kg: { type: 'number', description: 'Вес, кг. Пусто или 0 — свой вес.' },
                          reps: { type: 'integer', description: 'Повторы, 1–200. Не нужен при unit=time/distance.' },
                          duration_sec: { type: 'integer', description: 'Время под нагрузкой, секунды, 1–86400. Только при unit=time.' },
                          distance_m: { type: 'number', description: 'Дистанция, метры, 1–200000. Только при unit=distance.' },
                          set_type: { type: 'string', enum: ['work', 'warmup'], description: 'Рабочий или разминочный.' },
                          extra_weight_kg: { type: 'number', description: 'Довес к своему весу, 0–500.' },
                        },
                        required: [],
                      },
                    },
                    rpe: { type: 'integer', description: 'Субъективная тяжесть упражнения, 0–10.' },
                    superset_group: { type: 'integer', description: 'Номер связки: одинаковый у упражнений одного суперсета, 0 — без связки.' },
                    rest_sec: { type: 'integer', description: 'Отдых между подходами: 60, 90, 120 или 180.' },
                    note: { type: 'string', description: 'Заметка к упражнению.' },
                  },
                  required: ['name', 'approaches'],
                },
              },
            },
            required: ['date', 'exercises'],
          },
        },
      },
      required: ['title', 'assigned_by', 'days'],
    },
  },
  {
    name: 'heys_delete_training',
    description: 'Удалить тренировку из дня. Индекс — её позиция в списке из heys_get_day (с нуля). Удаление ставит tombstone, поэтому тренировка не вернётся из облака при следующей синхронизации.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Номер тренировки в дне, с нуля — как в heys_get_day.' },
        date: DATE_ARG,
      },
      required: ['index'],
    },
  },
  {
    name: 'heys_update_training',
    description: 'Поправить уже записанную тренировку: дописать оценки самочувствия, время, тип или комментарий, изменить минуты по зонам. Индекс тренировки — её позиция в списке из heys_get_day (с нуля). Передавай только то, что меняешь.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Номер тренировки в дне, с нуля — как в heys_get_day.' },
        date: DATE_ARG,
        zones_minutes: { type: 'array', items: { type: 'number' }, description: 'Заменить минуты по зонам целиком, до 4 чисел.' },
        time: { type: 'string', description: 'Время начала, HH:MM.' },
        type: { type: 'string', description: 'Тип: cardio, strength, hobby и т.п.' },
        activity_label: { type: 'string', description: 'Название активности для отображения.' },
        mood: { type: 'integer', description: 'Настроение после тренировки, 1–10.' },
        wellbeing: { type: 'integer', description: 'Самочувствие после тренировки, 1–10.' },
        stress: { type: 'integer', description: 'Стресс после тренировки, 1–10.' },
        comment: { type: 'string', description: 'Свободный комментарий к тренировке.' },
      },
      required: ['index'],
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
  'heys_log_strength_workout',
  'heys_assign_training',
  'heys_assign_program',
  'heys_propose_training_edit',
  'heys_move_training',
  'heys_withdraw_training_proposal',
  'heys_update_training',
  'heys_delete_training',
  'heys_update_day',
  'heys_checkin',
  'heys_update_profile',
  'heys_update_norms',
  'heys_update_hr_zones',
  'heys_create_product',
  'heys_update_product',
  'heys_reapply_recipe',
  'heys_delete_product',
  'heys_save_meal_preset',
  'heys_delete_meal_preset',
]);

// Аннотации MCP (readOnlyHint/…) — см. lib/tool-annotations.js.
const { annotateToolSchemas } = require('./tool-annotations');
const TOOL_SCHEMAS_ANNOTATED = annotateToolSchemas(TOOL_SCHEMAS);

module.exports = {
  createTools,
  TOOL_SCHEMAS: TOOL_SCHEMAS_ANNOTATED,
  WRITE_TOOLS,
  ToolError,
  defaultMealName,
  makeId,
};
