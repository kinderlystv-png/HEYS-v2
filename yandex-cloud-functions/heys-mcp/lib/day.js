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

function touch(day, nowMs, clientId) {
  return { ...day, updatedAt: nowMs, _writerCid: clientId };
}

function addMeal(day, meal, { nowMs, clientId }) {
  const meals = sortMealsByTime([...(day.meals || []), meal]);
  return touch({ ...day, meals }, nowMs, clientId);
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
  mood: 'moodAvg',
  wellbeing: 'wellbeingAvg',
  stress: 'stressAvg',
};

function updateDayFields(day, fields, { nowMs, clientId }) {
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
  if (!applied.length) return { day, applied };
  return { day: touch(next, nowMs, clientId), applied };
}

/** Компактная сводка для ответа модели — без нутриентных слепков позиций. */
function summarizeDay(day) {
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
      hours: day.sleepHours ?? null,
      quality: day.sleepQuality ?? null,
    },
    mood: day.moodAvg ?? null,
    wellbeing: day.wellbeingAvg ?? null,
    stress: day.stressAvg ?? null,
    comment: day.dayComment || '',
    trainings,
  };
}

module.exports = {
  MOSCOW_TZ,
  HR_ZONES,
  nowParts,
  isValidDate,
  normalizeTime,
  dayKey,
  timeToMinutes,
  sortMealsByTime,
  emptyDay,
  ensureDay,
  computeTefKcal100,
  buildMealItem,
  macroTotals,
  addMeal,
  deleteMeal,
  addWater,
  addTraining,
  updateDayFields,
  summarizeDay,
};
