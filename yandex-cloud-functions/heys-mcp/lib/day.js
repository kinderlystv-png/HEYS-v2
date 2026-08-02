'use strict';

/**
 * Чистые мутации дневного блоба `heys_dayv2_YYYY-MM-DD`.
 *
 * Контракт блоба и порядок приёмов повторяют apps/web/heys_day_bundle_v1.js:
 *  - meals сортируются по времени по убыванию, приёмы без времени — в конец;
 *  - удаление приёма ставит tombstone в deletedMealIds (иначе merge вернёт его);
 *  - kcal100 в позиции считается по NET Atwater (TEF 25% в белке), как в UI;
 *  - каждая мутация двигает updatedAt — на нём строится merge на сервере.
 *
 * Модуль не делает сетевых вызовов: всё тестируется без прод-доступа.
 */

const MOSCOW_TZ = 'Europe/Moscow';
const DAY_KEY_PREFIX = 'heys_dayv2_';
const HR_ZONES = 4;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Дата/время пользователя всегда в его таймзоне, а не в UTC функции. */
function nowParts(nowMs = Date.now(), timeZone = MOSCOW_TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [y, m, d] = String(value).split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function normalizeTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return null;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function dayKey(date) {
  return `${DAY_KEY_PREFIX}${date}`;
}

/** Сдвиг даты в UTC: календарные дни считаются без часовых поясов. */
function addDays(date, delta) {
  const [y, m, d] = String(date).split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + Number(delta)));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** Список дат включительно, от старой к новой. */
function enumerateDates(from, to, maxDays = 31) {
  const dates = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    if (dates.length > maxDays) return dates.slice(0, maxDays);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function timeToMinutes(time) {
  const normalized = normalizeTime(time);
  if (!normalized) return null;
  const [hh, mm] = normalized.split(':').map(Number);
  return hh * 60 + mm;
}

/** Порядок как в UI: новые сверху, приёмы без времени — в конец. */
function sortMealsByTime(meals) {
  if (!Array.isArray(meals) || meals.length <= 1) return Array.isArray(meals) ? meals : [];
  return [...meals].sort((a, b) => {
    const timeA = timeToMinutes(a && a.time);
    const timeB = timeToMinutes(b && b.time);
    if (timeA === null && timeB === null) return 0;
    if (timeA === null) return 1;
    if (timeB === null) return -1;
    return timeB - timeA;
  });
}

function emptyDay(date, clientId, nowMs = Date.now()) {
  return {
    date,
    meals: [],
    trainings: [],
    waterMl: 0,
    steps: 0,
    householdMin: 0,
    deletedMealIds: {},
    updatedAt: nowMs,
    schemaVersion: 3,
    _writerCid: clientId,
  };
}

/** Пустой день — валидное состояние: клиент мог ещё не открыть этот день. */
function ensureDay(raw, date, clientId, nowMs = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDay(date, clientId, nowMs);
  return {
    ...raw,
    date: raw.date || date,
    meals: Array.isArray(raw.meals) ? raw.meals : [],
    trainings: Array.isArray(raw.trainings) ? raw.trainings : [],
  };
}

/**
 * NET Atwater — тот же расчёт, что computeTEFKcal100 в UI. Считаем сами,
 * потому что kcal100 продукта в базе — «сырые» калории, а в позицию приёма
 * приложение кладёт уже TEF-скорректированное значение.
 */
function computeTefKcal100(product) {
  const carbs = Number(product.carbs100) || ((Number(product.simple100) || 0) + (Number(product.complex100) || 0));
  const fat = Number(product.fat100) || ((Number(product.badFat100) || 0) + (Number(product.goodFat100) || 0) + (Number(product.trans100) || 0));
  const protein = Number(product.protein100) || 0;
  return Math.round((3 * protein + 4 * carbs + 9 * fat) * 10) / 10;
}

const NUTRIENT_FIELDS = [
  'protein100', 'carbs100', 'fat100', 'simple100', 'complex100',
  'badFat100', 'goodFat100', 'trans100', 'fiber100', 'sodium100',
  'omega3_100', 'omega6_100', 'gi', 'harm', 'nova_group', 'nutrient_density',
  'is_organic', 'is_whole_grain', 'is_fermented', 'is_raw',
  'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'selenium', 'zinc',
  'cholesterol100', 'vitamin_a', 'vitamin_b1', 'vitamin_b2', 'vitamin_b3',
  'vitamin_b6', 'vitamin_b9', 'vitamin_b12', 'vitamin_c', 'vitamin_d',
  'vitamin_e', 'vitamin_k',
];

/**
 * Позиция приёма несёт полный нутриентный слепок продукта. Благодаря этому
 * приём корректно считается и рисуется, даже если продукт взят из общей базы
 * и ещё не склонирован в личный overlay пользователя.
 */
function buildMealItem(product, grams, makeId) {
  const item = {
    id: makeId('it_'),
    product_id: product.id != null ? product.id : product.product_id,
    name: product.name,
    grams: Number(grams),
  };
  if (product.brand) item.brand = product.brand;
  if (product.fingerprint) item.fingerprint = product.fingerprint;
  if (product.shared_origin_id) item.shared_origin_id = product.shared_origin_id;
  if (Array.isArray(product.portions) && product.portions.length) {
    item.portions = product.portions.map((p) => ({ ...p }));
  }
  if (Array.isArray(product.additives)) item.additives = product.additives;

  item.kcal100 = computeTefKcal100(product);
  for (const field of NUTRIENT_FIELDS) {
    const value = product[field];
    if (value !== undefined && value !== null) item[field] = value;
  }
  return item;
}

function itemKcal(item) {
  return ((Number(item.kcal100) || 0) * (Number(item.grams) || 0)) / 100;
}

function macroTotals(meals) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const meal of meals || []) {
    for (const item of (meal && meal.items) || []) {
      const grams = (Number(item.grams) || 0) / 100;
      totals.kcal += itemKcal(item);
      totals.protein += (Number(item.protein100) || 0) * grams;
      const carbs = Number(item.carbs100) || ((Number(item.simple100) || 0) + (Number(item.complex100) || 0));
      totals.carbs += carbs * grams;
      const fat = Number(item.fat100) || ((Number(item.badFat100) || 0) + (Number(item.goodFat100) || 0) + (Number(item.trans100) || 0));
      totals.fat += fat * grams;
    }
  }
  return {
    kcal: Math.round(totals.kcal),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
  };
}

/**
 * Единая точка фиксации мутации дня. Здесь же пересчитываются производные поля
 * блоба (часы сна, средние оценки, dayScore): их входы меняются в четырёх
 * разных инструментах, и оставленное протухшим производное — это неверные
 * числа в дневнике и в отчётах до тех пор, пока клиент не откроет день.
 */
function touch(day, nowMs, clientId) {
  const next = { ...day, updatedAt: nowMs, _writerCid: clientId };
  const hours = totalSleepHours(next);
  if (hours !== null) next.sleepHours = hours;
  return Object.assign(next, dayAverages(next));
}

function addMeal(day, meal, { nowMs, clientId }) {
  const meals = sortMealsByTime([...(day.meals || []), meal]);
  return touch({ ...day, meals }, nowMs, clientId);
}

/**
 * Точечная правка уже записанного приёма.
 *
 * Отдельный путь нужен потому, что «добавь туда ещё» через delete + create
 * теряет шапку приёма (название, время, самочувствие), меняет meal_id и
 * открывает лишнее окно гонки с параллельно открытым приложением.
 *
 * Возвращает список изменений: пустой список — сигнал, что менять нечего,
 * и писать день не нужно.
 */
function updateMeal(day, mealId, patch, { nowMs, clientId }) {
  const meals = day.meals || [];
  const index = meals.findIndex((m) => m && String(m.id) === String(mealId));
  if (index === -1) return { day, meal: null, changed: [], unknownItems: [] };

  const meal = { ...meals[index], items: [...((meals[index] && meals[index].items) || [])] };
  const changed = [];
  const unknownItems = [];

  const removeIds = (patch.removeItemIds || []).map(String);
  if (removeIds.length) {
    for (const id of removeIds) {
      if (!meal.items.some((item) => String(item.id) === id)) unknownItems.push(id);
    }
    const before = meal.items.length;
    meal.items = meal.items.filter((item) => !removeIds.includes(String(item.id)));
    if (meal.items.length !== before) changed.push(`убрано позиций: ${before - meal.items.length}`);
  }

  for (const [itemId, value] of Object.entries(patch.setGrams || {})) {
    const position = meal.items.findIndex((item) => String(item.id) === String(itemId));
    if (position === -1) {
      unknownItems.push(String(itemId));
      continue;
    }
    const grams = Number(value);
    if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) throw new Error(`invalid_grams:${itemId}`);
    meal.items[position] = { ...meal.items[position], grams };
    changed.push(`${meal.items[position].name} → ${grams} г`);
  }

  if (Array.isArray(patch.addItems) && patch.addItems.length) {
    meal.items = [...meal.items, ...patch.addItems];
    changed.push(`добавлено: ${patch.addItems.map((item) => `${item.name} ${item.grams} г`).join(', ')}`);
  }

  let resort = false;
  if (patch.time) {
    meal.time = patch.time;
    changed.push(`время → ${patch.time}`);
    resort = true;
  }
  if (patch.name) {
    meal.name = String(patch.name);
    changed.push(`название → ${meal.name}`);
  }
  for (const field of ['mood', 'wellbeing', 'stress']) {
    if (patch[field] === undefined || patch[field] === null) continue;
    meal[field] = patch[field];
    changed.push(`${field} → ${patch[field]}`);
  }

  if (!changed.length) return { day, meal: meals[index], changed, unknownItems };

  const nextMeals = meals.map((m, i) => (i === index ? meal : m));
  const nextDay = touch({ ...day, meals: resort ? sortMealsByTime(nextMeals) : nextMeals }, nowMs, clientId);
  return { day: nextDay, meal, changed, unknownItems };
}

function deleteMeal(day, mealId, { nowMs, clientId }) {
  const meals = (day.meals || []).filter((m) => m && String(m.id) !== String(mealId));
  if (meals.length === (day.meals || []).length) return { day, removed: false };
  const prevTombstones = (day.deletedMealIds && typeof day.deletedMealIds === 'object' && !Array.isArray(day.deletedMealIds))
    ? day.deletedMealIds
    : {};
  const next = touch({
    ...day,
    meals,
    deletedMealIds: { ...prevTombstones, [String(mealId)]: nowMs },
  }, nowMs, clientId);
  return { day: next, removed: true };
}

function addWater(day, ml, { nowMs, clientId }) {
  const current = Number(day.waterMl) || 0;
  const next = Math.max(0, current + Number(ml));
  return touch({
    ...day,
    waterMl: next,
    lastWaterTime: nowMs,
    waterUpdatedAt: nowMs,
  }, nowMs, clientId);
}

/** Тренировка в блобе — это минуты по 4 пульсовым зонам. */
function addTraining(day, zoneMinutes, { nowMs, clientId }) {
  const z = Array.from({ length: HR_ZONES }, (_, i) => Math.max(0, Number(zoneMinutes[i]) || 0));
  const trainings = [...(day.trainings || []), { z, updatedAt: nowMs }];
  return touch({ ...day, trainings }, nowMs, clientId);
}

const DAY_FIELD_MAP = {
  weight: 'weightMorning',
  steps: 'steps',
  household_min: 'householdMin',
  sleep_start: 'sleepStart',
  sleep_end: 'sleepEnd',
  sleep_quality: 'sleepQuality',
  sleep_note: 'sleepNote',
  comment: 'dayComment',
  // Утренние оценки — это ручной ввод чек-ина. Одноимённые *Avg в блобе
  // производные: приложение усредняет утро с оценками приёмов и тренировок и
  // перезаписывает их, так что запись коннектора туда не доживала до следующего
  // открытия дня.
  mood: 'moodMorning',
  wellbeing: 'wellbeingMorning',
  stress: 'stressMorning',
};

/**
 * Поля чек-ина, для которых важно, чья это запись: по ним закрываются шаги
 * утреннего чек-ина и растёт стрик дисциплины.
 */
const CHECKIN_AUTHORED_FIELDS = new Set([
  'weightMorning',
  'sleepStart',
  'sleepEnd',
  'sleepQuality',
  'moodMorning',
  'wellbeingMorning',
  'stressMorning',
  'steps',
]);

/**
 * Метка авторства живёт вместе со значением, которое вписал куратор, и потому
 * самоочищается: как только клиент вводит своё, значения расходятся и метка
 * перестаёт действовать. Tombstone не нужен — а он и невозможен, пока merge
 * объединяет такие словари union'ом.
 */
function markCuratorEdits(day, targets, nowMs) {
  const prev = (day._curatorEdits && typeof day._curatorEdits === 'object' && !Array.isArray(day._curatorEdits))
    ? day._curatorEdits
    : {};
  const marks = { ...prev };
  for (const field of targets) {
    if (!CHECKIN_AUTHORED_FIELDS.has(field)) continue;
    marks[field] = { at: nowMs, value: day[field] };
  }
  return marks;
}

/** Поля, значение которых до сих пор то самое, что вписал куратор. */
function curatorAuthoredFields(day) {
  const marks = (day && day._curatorEdits && typeof day._curatorEdits === 'object' && !Array.isArray(day._curatorEdits))
    ? day._curatorEdits
    : null;
  if (!marks) return [];
  return Object.keys(marks).filter((field) => {
    const mark = marks[field];
    if (!mark || typeof mark !== 'object') return false;
    return String(day[field] ?? '') === String(mark.value ?? '');
  }).sort();
}

function updateDayFields(day, fields, { nowMs, clientId, byCurator = false }) {
  const next = { ...day };
  const applied = [];
  for (const [publicName, target] of Object.entries(DAY_FIELD_MAP)) {
    const value = fields[publicName];
    if (value === undefined || value === null) continue;
    if (target === 'sleepStart' || target === 'sleepEnd') {
      const time = normalizeTime(value);
      if (!time) throw new Error(`invalid_time:${publicName}`);
      next[target] = time;
    } else if (target === 'sleepNote' || target === 'dayComment') {
      next[target] = String(value);
    } else {
      const num = Number(value);
      if (!Number.isFinite(num)) throw new Error(`invalid_number:${publicName}`);
      next[target] = num;
    }
    applied.push(publicName);
  }
  if (fields.weight !== undefined && fields.weight !== null) next.weightUpdatedAt = nowMs;
  // Шаги в merge разрешаются по своему штампу: без него запись коннектора
  // проигрывает облачной версии даже когда она старее.
  if (applied.includes('steps')) next.stepsUpdatedAt = nowMs;
  if (!applied.length) return { day, applied };
  if (byCurator) {
    next._curatorEdits = markCuratorEdits(next, applied.map((name) => DAY_FIELD_MAP[name]), nowMs);
  }
  return { day: touch(next, nowMs, clientId), applied };
}

/** Компактная сводка для ответа модели — без нутриентных слепков позиций. */
function summarizeDay(day) {
  const averages = dayAverages(day);
  const meals = (day.meals || []).map((meal) => ({
    id: meal.id,
    name: meal.name || '',
    time: meal.time || '',
    mood: meal.mood === '' ? null : meal.mood ?? null,
    kcal: Math.round((meal.items || []).reduce((sum, item) => sum + itemKcal(item), 0)),
    items: (meal.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      grams: item.grams,
      kcal: Math.round(itemKcal(item)),
    })),
  }));
  const trainings = (day.trainings || [])
    .map((t) => (Array.isArray(t && t.z) ? t.z.map(Number) : []))
    .filter((z) => z.some((m) => m > 0))
    .map((z) => ({ zones_minutes: z, total_minutes: z.reduce((a, b) => a + b, 0) }));

  return {
    date: day.date,
    totals: macroTotals(day.meals),
    meals,
    water_ml: Number(day.waterMl) || 0,
    weight_morning: day.weightMorning ?? null,
    steps: Number(day.steps) || 0,
    household_min: Number(day.householdMin) || 0,
    sleep: {
      start: day.sleepStart || null,
      end: day.sleepEnd || null,
      hours: totalSleepHours(day) ?? day.sleepHours ?? null,
      quality: day.sleepQuality ?? null,
    },
    // Средние по дню (утро + приёмы + тренировки) и отдельно то, что реально
    // ввели утром: куратор должен видеть, что его «настроение 7» — это утренняя
    // отметка, а среднее по дню считается вместе с оценками приёмов.
    mood: averages.moodAvg === '' ? null : averages.moodAvg,
    wellbeing: averages.wellbeingAvg === '' ? null : averages.wellbeingAvg,
    stress: averages.stressAvg === '' ? null : averages.stressAvg,
    morning: {
      mood: day.moodMorning ?? null,
      wellbeing: day.wellbeingMorning ?? null,
      stress: day.stressMorning ?? null,
    },
    comment: day.dayComment || '',
    trainings,
    // Что в этом дне до сих пор стоит с кураторской руки, а не введено клиентом.
    curator_authored: curatorAuthoredFields(day),
  };
}

/**
 * Строка дня для обзора периода: без позиций приёмов и нутриентных слепков.
 * Неделя в полном виде — это десятки килобайт, из которых куратору нужны
 * калории, вес, вода, сон и активность.
 */
function summarizeDayBrief(day) {
  const totals = macroTotals(day.meals);
  const trainingMinutes = (day.trainings || []).reduce((sum, t) => {
    const z = Array.isArray(t && t.z) ? t.z : [];
    return sum + z.reduce((a, b) => a + (Number(b) || 0), 0);
  }, 0);
  const sleepHours = totalSleepHours(day) ?? day.sleepHours ?? null;
  const averages = dayAverages(day);

  return {
    date: day.date,
    kcal: totals.kcal,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    meals: (day.meals || []).length,
    water_ml: Number(day.waterMl) || 0,
    weight_morning: day.weightMorning ?? null,
    steps: Number(day.steps) || 0,
    household_min: Number(day.householdMin) || 0,
    training_min: trainingMinutes,
    sleep_hours: sleepHours,
    sleep_quality: day.sleepQuality ?? null,
    mood: averages.moodAvg === '' ? null : averages.moodAvg,
    wellbeing: averages.wellbeingAvg === '' ? null : averages.wellbeingAvg,
    stress: averages.stressAvg === '' ? null : averages.stressAvg,
    comment: day.dayComment || '',
    empty: !(day.meals || []).length && !Number(day.waterMl) && !day.weightMorning && !Number(day.steps),
  };
}

/** Часы сна из времён засыпания и подъёма, с переходом через полночь. */
function sleepDuration(start, end) {
  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  if (from === null || to === null) return null;
  const minutes = to >= from ? to - from : to + 24 * 60 - from;
  return Math.round((minutes / 60) * 10) / 10;
}

function normalizeDaySleepMinutes(value) {
  const num = Math.round(Number(value) || 0);
  return num > 0 ? num : 0;
}

/**
 * Контракт поля sleepHours в блобе дня: ночной интервал плюс дневной досып,
 * округлённые до 0.1 ч. Веб считает так же (apps/web/heys_steps_v1.js), и если
 * MCP запишет только времена, не тронув производное поле, дневник и обзор
 * покажут часы от прежнего интервала.
 */
function totalSleepHours(day) {
  const night = sleepDuration(day.sleepStart, day.sleepEnd);
  if (night === null) return null;
  const nap = normalizeDaySleepMinutes(day.daySleepMinutes) / 60;
  return Math.round((night + nap) * 10) / 10;
}

function ratingValues(source, field) {
  return (source || [])
    .filter((row) => row && row[field] && !Number.isNaN(Number(row[field])))
    .map((row) => Number(row[field]));
}

/** Тренировка-заготовка без времени и минут в средние не входит — как в приложении. */
function isRealTraining(t) {
  if (!t) return false;
  const hasTime = typeof t.time === 'string' && t.time.trim() !== '';
  const hasMinutes = Array.isArray(t.z) && t.z.some((m) => Number(m) > 0);
  const hasBuilder = t.type === 'strength'
    && t.strengthEntryMode === 'workout_builder'
    && !!t.workoutLog && typeof t.workoutLog === 'object';
  return hasTime || hasMinutes || hasBuilder;
}

/**
 * Средние оценки дня и dayScore — производные от утреннего чек-ина, оценок
 * приёмов и тренировок (apps/web/heys_day_calculations.js). Коннектор пишет
 * только источник, но обязан пересчитать производные: иначе дневник и отчёты
 * показывают прежние средние до тех пор, пока клиент не откроет день.
 */
function dayAverages(day) {
  const meals = day.meals || [];
  const trainings = (day.trainings || []).filter(isRealTraining);
  const out = {};
  const scores = {};
  for (const [key, morningField] of [['mood', 'moodMorning'], ['wellbeing', 'wellbeingMorning'], ['stress', 'stressMorning']]) {
    const morning = day[morningField] && !Number.isNaN(Number(day[morningField])) ? [Number(day[morningField])] : [];
    const all = [...morning, ...ratingValues(meals, key), ...ratingValues(trainings, key)];
    const avg = all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : '';
    out[`${key}Avg`] = avg;
    scores[key] = avg;
  }
  if (scores.mood !== '' || scores.wellbeing !== '' || scores.stress !== '') {
    const m = scores.mood !== '' ? scores.mood : 5;
    const w = scores.wellbeing !== '' ? scores.wellbeing : 5;
    const s = scores.stress !== '' ? scores.stress : 5;
    const raw = (m + w + (10 - s)) / 3; // низкий стресс — это хорошо, поэтому инверсия
    out.dayScoreRaw = Math.round(raw * 10) / 10;
    if (!day.dayScoreManual) out.dayScore = Math.round(raw);
  }
  return out;
}

module.exports = {
  MOSCOW_TZ,
  HR_ZONES,
  nowParts,
  isValidDate,
  normalizeTime,
  dayKey,
  addDays,
  enumerateDates,
  sleepDuration,
  totalSleepHours,
  dayAverages,
  curatorAuthoredFields,
  summarizeDayBrief,
  timeToMinutes,
  sortMealsByTime,
  emptyDay,
  ensureDay,
  computeTefKcal100,
  buildMealItem,
  macroTotals,
  addMeal,
  updateMeal,
  deleteMeal,
  addWater,
  addTraining,
  updateDayFields,
  summarizeDay,
};
