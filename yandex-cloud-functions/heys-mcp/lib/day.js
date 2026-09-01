'use strict';

/**
 * Чистые мутации дневного блоба `heys_dayv2_YYYY-MM-DD`.
 *
 * Контракт блоба и порядок приёмов повторяют apps/web/heys_day_bundle_v1.js:
 *  - meals сортируются по времени по убыванию, приёмы без времени — в конец;
 *  - удаление приёма ставит tombstone в deletedMealIds (иначе merge вернёт его);
 *  - удаление позиции ставит tombstone в deletedItemIds (как в apps/web);
 *  - kcal100 в позиции считается по NET Atwater (TEF 25% в белке), как в UI;
 *  - каждая мутация двигает updatedAt — на нём строится merge на сервере.
 *
 * Модуль не делает сетевых вызовов: всё тестируется без прод-доступа.
 */

const crypto = require('node:crypto');
const webMirror = require('./web-mirror');
const { ageFromBirthDate, GENDERS } = require('./profile');

/** Тот же формат, что у id приёмов в lib/tools.js. */
function makeId(prefix) {
  return `${prefix}${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Stable identity for one cross-day move. The target training itself keeps a
 * fresh id (so a compensated retry is not blocked by its tombstone), while
 * transferId lets orchestration find an already-written target after a partial
 * previous attempt without appending a duplicate.
 */
function trainingTransferId(training, index, fromDate, toDate) {
  const plan = training && training.plan ? training.plan : {};
  const raw = [
    fromDate,
    toDate,
    index,
    training && training.id ? training.id : '',
    plan.id || '',
    Number(plan.assignedAt) || 0,
  ].join('|');
  return `mv_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 20)}`;
}

function hasMeaningfulLiveTraining(training) {
  if (!training || typeof training !== 'object') return false;
  const log = training.workoutLog && typeof training.workoutLog === 'object'
    ? training.workoutLog
    : {};
  const lifecycleFields = ['startedAt', 'firstMarkAt', 'lastMarkAt', 'completedAt', 'activeRest'];
  if (lifecycleFields.some((field) => training[field] || log[field])) return true;
  if ((Array.isArray(training.z) ? training.z : []).some((value) => Number(value) > 0)) return true;
  if ((Array.isArray(log.zoneMinutes) ? log.zoneMinutes : []).some((value) => Number(value) > 0)) return true;
  const approachHasDoneWork = (approach) => {
    if (!approach || typeof approach !== 'object') return false;
    if (approach.done === true) return true;
    return ['drops', 'stages', 'dropStages'].some((field) => (
      Array.isArray(approach[field]) && approach[field].some(approachHasDoneWork)
    ));
  };
  return (Array.isArray(log.exercises) ? log.exercises : []).some((exercise) => (
    Array.isArray(exercise && exercise.approaches) && exercise.approaches.some(approachHasDoneWork)
  ));
}

/**
 * Потолки на объём записи. Без них один кривой вызов модели пишет блоб дня
 * на десятки мегабайт, и день клиента перестаёт открываться (проверено
 * аудитом 2026-08-08: 2000 упражнений × 200 подходов = 25.9 МБ).
 */
const MAX_TRAININGS_PER_DAY = 3; // столько слотов рисует приложение
const MAX_EXERCISES = 30;
const MAX_APPROACHES = 30;
const MAX_NAME_LEN = 100;
const MAX_NOTE_LEN = 500;
const MAX_TRAINING_MINUTES = 1440; // сутки

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

/**
 * Тип приёма — та же таксономия, что в приложении (MEAL_TYPES в
 * apps/web/heys_day_utils.js). Коннектор обязан проставлять `mealType` сам:
 * без него карточка дня считает тип на клиенте по своим правилам, и приём,
 * записанный куратором, подписан не тем, чем он является.
 */
const MEAL_TYPE_NAMES = {
  breakfast: 'Завтрак',
  snack1: 'Перекус',
  coffee_break: 'Кофе-брейк',
  lunch: 'Обед',
  snack2: 'Перекус',
  dinner: 'Ужин',
  snack3: 'Перекус',
  night: 'Ночной приём',
};

/**
 * Кофе-брейк: напиток и то, что кладут в напиток. Отдельный тип нужен потому,
 * что кофе с молоком и сиропом — это не перекус: еды в нём нет, а в дневнике
 * он занимал строку наравне с тарелкой каши и портил картину по приёмам.
 *
 * Граница простая и проверяемая: как только в приёме появляется хоть что-то
 * твёрдое — печенье, банан, бутерброд, — это уже перекус, и дальше работает
 * обычная классификация по времени и составу.
 */
const COFFEE_BASE_PATTERNS = [
  /кофе/i, /coffee/i, /латте/i, /latte/i, /капучино/i, /cappuccino/i,
  /раф/i, /americano/i, /американо/i, /эспрессо/i, /espresso/i,
  /чай/i, /tea/i, /какао/i, /матча/i, /цикори/i,
];

/** То, что добавляют в чашку и что само по себе приёмом пищи не является. */
const COFFEE_COMPANION_PATTERNS = [
  /молоко/i, /milk/i, /сливк/i, /сироп/i, /syrup/i, /сахар/i, /подсластител/i,
  /мёд\b/i, /мед\b/i, /корица/i, /вода/i, /water/i, /лимон/i, /пенка/i,
];

function matchesAny(patterns, value) {
  const name = String(value || '');
  return patterns.some((pattern) => pattern.test(name));
}

function isCoffeeBreak(meal) {
  const items = (meal && meal.items) || [];
  if (!items.length) return false;
  const everythingLiquid = items.every((item) => matchesAny(COFFEE_BASE_PATTERNS, item.name)
    || matchesAny(COFFEE_COMPANION_PATTERNS, item.name));
  if (!everythingLiquid) return false;
  // Стакан молока сам по себе кофе-брейком не считается: нужен собственно
  // напиток-основа, иначе тип начнёт подписывать любую жидкость.
  return items.some((item) => matchesAny(COFFEE_BASE_PATTERNS, item.name));
}

const MAIN_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'night']);

/** Зеркало BEVERAGE_LIKE_PATTERNS из apps/web/day/_meal_quality.js. */
const BEVERAGE_LIKE_PATTERNS = [
  /кофе/i, /coffee/i, /латте/i, /latte/i, /капучино/i, /cappuccino/i,
  /раф/i, /americano/i, /американо/i, /чай/i, /tea/i,
  /молоко/i, /milk/i, /кефир/i, /йогурт/i, /смузи/i, /коктейль/i, /shake/i,
];

const MAIN_MEAL_THRESHOLDS = { minProducts: 3, minGrams: 200, minKcal: 300 };

/**
 * Одиночное блюдо тоже бывает полноценным приёмом: пороги приложения рассчитаны
 * на состав из нескольких позиций, и тарелка супа одной строкой в них не
 * проходит. Планка ниже 300, но заметно выше перекуса — кофе с печеньем (≈175)
 * основным приёмом не становится.
 */
const SINGLE_DISH_KCAL = 250;

function isBeverageLikeName(name) {
  const value = String(name || '');
  return BEVERAGE_LIKE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Состав приёма отдельно по еде и по жидкому.
 *
 * Пороги «основного приёма» считаются только по еде, а «еда» здесь — именно
 * то, что кладут в чашку кофе или чая (COFFEE_BASE/COMPANION), не более
 * широкий BEVERAGE_LIKE_PATTERNS. Йогурт, кефир и смузи туда не входят
 * специально: тот список посчитан для другой задачи — бейджа «скорее напиток»
 * в приложении, — где у сытной еды с йогуртом законно высокий beverageRatio.
 * Если исключать их и здесь, гречка с йогуртом и сыром (три позиции, но
 * дотягивает до обеда только вместе с йогуртом) потеряла бы вес и
 * переклассифицировалась в перекус — то есть реальный обед стал бы перекусом.
 */
function mealComposition(meal) {
  const items = (meal && meal.items) || [];
  let grams = 0;
  let kcal = 0;
  let beverageKcal = 0;
  let foodCount = 0;
  let foodGrams = 0;
  let foodKcal = 0;
  for (const item of items) {
    const itemGrams = Number(item.grams) || 0;
    const kc = itemKcal(item);
    grams += itemGrams;
    kcal += kc;
    const cupContent = matchesAny(COFFEE_BASE_PATTERNS, item.name) || matchesAny(COFFEE_COMPANION_PATTERNS, item.name);
    if (isBeverageLikeName(item.name)) beverageKcal += kc;
    if (!cupContent) {
      foodCount += 1;
      foodGrams += itemGrams;
      foodKcal += kc;
    }
  }
  return {
    count: items.length,
    grams,
    kcal,
    foodCount,
    foodGrams,
    foodKcal,
    beverageRatio: kcal > 0 ? beverageKcal / kcal : 0,
  };
}

/**
 * «Скорее напиток, чем еда» — тот же критерий, по которому дневник рисует чип
 * «напиток» (getMealRoleStatus в apps/web/day/_meal_quality.js). Без него кофе
 * с молоком и сиропом — это три продукта, то есть формально основной приём, и
 * подписывался бы «Обедом».
 */
function isDrinkLike(composition) {
  return composition.beverageRatio >= 0.7 && composition.kcal <= 180;
}

function isSubstantialMeal(composition) {
  if (isDrinkLike(composition)) return false;
  if (composition.foodCount >= MAIN_MEAL_THRESHOLDS.minProducts) return true;
  if (composition.foodGrams >= MAIN_MEAL_THRESHOLDS.minGrams && composition.foodCount >= 2) return true;
  if (composition.foodKcal >= MAIN_MEAL_THRESHOLDS.minKcal) return true;
  return composition.foodCount === 1 && composition.foodKcal >= SINGLE_DISH_KCAL;
}

/**
 * Слот суток по времени приёма.
 *
 * Утро и ночь размер не проверяют: еда в 8 утра — это завтрак, даже лёгкий, а
 * еда в полночь — ночной приём, и именно этот факт важен куратору. Днём и
 * вечером обедом или ужином становится только то, что дотягивает по объёму:
 * иначе кофе с печеньем в 15:15 подписывается «Обедом».
 */
function slotTypesForTime(time) {
  const minutes = timeToMinutes(time);
  const hour = minutes === null ? 12 : Math.floor(minutes / 60);
  if (hour >= 5 && hour < 11) return { main: 'breakfast', light: 'breakfast', snack: 'snack1' };
  if (hour >= 11 && hour < 16) return { main: 'lunch', light: 'snack1', snack: 'snack1' };
  if (hour >= 16 && hour < 22) return { main: 'dinner', light: 'snack2', snack: 'snack2' };
  return { main: 'night', light: 'night', snack: 'snack3' };
}

/**
 * Тип и подпись приёма по времени и составу.
 *
 * Второй обед в одном дне не заводится: если основной тип этого слота уже занят
 * другим приёмом, новый становится перекусом того же слота — так же поступает
 * приложение, когда считает тип само.
 */
function classifyMeal(meal, dayData) {
  const composition = mealComposition(meal);
  // Кофе-брейк не зависит от времени суток: кофе в семь утра и кофе в одиннадцать
  // вечера — одно и то же, и завтраком первый из них не становится.
  if (isCoffeeBreak(meal)) {
    return { mealType: 'coffee_break', name: MEAL_TYPE_NAMES.coffee_break, composition };
  }

  const slot = slotTypesForTime(meal && meal.time);
  let type = isSubstantialMeal(composition) ? slot.main : slot.light;

  if (MAIN_MEAL_TYPES.has(type)) {
    const taken = ((dayData && dayData.meals) || [])
      .filter((m) => m && String(m.id) !== String(meal && meal.id))
      .some((m) => m.mealType === type);
    if (taken) type = slot.snack;
  }

  return { mealType: type, name: MEAL_TYPE_NAMES[type], composition };
}

/** Подпись приёма сгенерирована нами (а не названа куратором или набором)? */
function isAutoMealName(name) {
  const value = String(name || '').trim();
  return value === '' || Object.values(MEAL_TYPE_NAMES).includes(value) || value === 'Приём';
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
/**
 * Кэш съеденного за день. Приложение пересчитывает его при открытии дня и само
 * называет «display cache», но читают его не только там: календарь
 * (heys_day_utils.js:1861), cascade-карточка, пороги инсайтов
 * (insights/pi_thresholds.js:35) и расчёт CEB берут блоб напрямую и
 * предпочитают сохранённое значение пересчёту, пока в дне есть строки еды.
 *
 * Поэтому запись коннектора обязана его обновлять. Иначе выходит так: клиент
 * записал завтрак сам (кэш = 500), куратор внёс обед на 700 — в дневнике 1200,
 * а календарь, пороги и CEB продолжают видеть 500. Удалять кэш вместо
 * обновления нельзя: потребители тогда падают на `dayTot`, который заморожен
 * при первом расчёте и врёт ещё хуже.
 *
 * `savedDisplayOptimum` намеренно не трогаем: он считается от TDEE и
 * накопленного долга по калориям, а этих входов у коннектора нет.
 */
const SAVED_EATEN_KEYS = ['savedEatenKcal', 'savedEatenProt', 'savedEatenCarbs', 'savedEatenFat', 'savedEatenFiber'];

function savedEatenCache(meals) {
  const totals = macroTotals(meals);
  let fiber = 0;
  for (const meal of meals || []) {
    for (const item of (meal && meal.items) || []) {
      fiber += ((Number(item.fiber100) || 0) * (Number(item.grams) || 0)) / 100;
    }
  }
  return {
    savedEatenKcal: totals.kcal,
    savedEatenProt: totals.protein,
    savedEatenCarbs: totals.carbs,
    savedEatenFat: totals.fat,
    savedEatenFiber: Math.round(fiber * 10) / 10,
  };
}

function touch(day, nowMs, clientId) {
  const next = { ...day, updatedAt: nowMs, _writerCid: clientId };
  const hours = totalSleepHours(next);
  if (hours !== null) next.sleepHours = hours;

  // Пустой дневник — кэш снимаем, как это делает серверный merge
  // (stripStaleSavedDisplayNutrientsIfEmptyDiary): иначе после удаления
  // последнего приёма в календаре остаются калории несуществующей еды.
  const hasItems = (next.meals || []).some((m) => Array.isArray(m && m.items) && m.items.length > 0);
  if (hasItems) {
    Object.assign(next, savedEatenCache(next.meals));
  } else {
    for (const key of SAVED_EATEN_KEYS) delete next[key];
  }

  return Object.assign(next, dayAverages(next));
}

function addMeal(day, meal, { nowMs, clientId }) {
  const meals = sortMealsByTime([...(day.meals || []), meal]);
  return touch({ ...day, meals }, nowMs, clientId);
}

/**
 * Окно склейки: запись в пределах десяти минут от уже записанного приёма —
 * та же еда за столом, а не второй приём.
 *
 * Коннектор пишет по одной реплике куратора, и «блины» и «кофе к ним» приходят
 * разными вызовами с разницей в минуты. До склейки день распадался на цепочку
 * приёмов по одной позиции: 29 августа в 16:12 так легли отдельно блины со
 * сгущёнкой и отдельно кофе. Дневник это не только показывает лишними
 * карточками — на таком составе ломается и классификация (кофе рядом с едой
 * читается кофе-брейком), и разбор окон приёмов.
 */
const MEAL_MERGE_WINDOW_MIN = 10;

/** Потолок позиций в приёме — тот же, что у одной записи коннектора. */
const MEAL_ITEMS_LIMIT = 20;

/**
 * Ближайший по времени приём в пределах окна.
 *
 * `excludeIds` — приёмы, записанные тем же вызовом: `meals[]` куратор разделил
 * сам, и склеивать их между собой нельзя, иначе «в 15:30 обед, в 15:35 кофе»
 * превратится в один приём против явно сказанного.
 */
function findMealNearTime(day, time, { windowMin = MEAL_MERGE_WINDOW_MIN, excludeIds = [] } = {}) {
  const target = timeToMinutes(time);
  if (target === null) return null;
  const skip = new Set((excludeIds || []).map((id) => String(id)));
  let best = null;
  let bestDelta = Infinity;
  for (const meal of (day && day.meals) || []) {
    if (!meal || skip.has(String(meal.id))) continue;
    const minutes = timeToMinutes(meal.time);
    if (minutes === null) continue;
    const delta = Math.abs(minutes - target);
    if (delta > windowMin) continue;
    // Равные расстояния — берём более поздний приём: он и есть «текущий стол».
    if (delta < bestDelta || (delta === bestDelta && minutes > timeToMinutes(best.time))) {
      best = meal;
      bestDelta = delta;
    }
  }
  return best;
}

/** Один и тот же продукт в той же граммовке — признак повторной записи. */
function isSameMealItem(a, b) {
  const idA = a && a.product_id != null ? String(a.product_id) : '';
  const idB = b && b.product_id != null ? String(b.product_id) : '';
  const sameProduct = idA && idB
    ? idA === idB
    : String((a && a.name) || '').trim().toLowerCase() === String((b && b.name) || '').trim().toLowerCase();
  if (!sameProduct) return false;
  return Math.round(Number(a && a.grams) || 0) === Math.round(Number(b && b.grams) || 0);
}

/**
 * Повтор целиком: КАЖДАЯ входящая позиция уже есть в приёме в той же
 * граммовке.
 *
 * Именно «каждая», а не «хотя бы одна»: «ещё один такой же рулет» — законная
 * добавка, и запрещать её нельзя. А вот когда весь состав совпал до грамма,
 * это почти всегда одна и та же реплика, записанная дважды: 28 августа так
 * появились два приёма 15:30 из одних и тех же рулета 160 г и йогурта 100 г.
 */
function duplicatesWholeMeal(meal, items) {
  const existing = (meal && meal.items) || [];
  if (!existing.length || !Array.isArray(items) || !items.length) return false;
  return items.every((item) => existing.some((prev) => isSameMealItem(prev, item)));
}

/**
 * Дописать позиции в уже записанный приём.
 *
 * Шапка приёма остаётся своей: id, время и названное куратором имя не
 * трогаем — меняется только состав, а тип и авто-подпись пересчитываются по
 * новому составу. Самочувствие переносим только в пустое поле: сказанное про
 * приём раньше сильнее того, что пришло с добавкой.
 */
function mergeItemsIntoMeal(day, mealId, items, { nowMs, clientId, name, mood, wellbeing, stress } = {}) {
  const meals = (day && day.meals) || [];
  const index = meals.findIndex((m) => m && String(m.id) === String(mealId));
  if (index === -1) return { day, meal: null };

  const merged = {
    ...meals[index],
    items: [...((meals[index] && meals[index].items) || []), ...items],
  };
  if (name && isAutoMealName(merged.name)) merged.name = String(name);
  for (const [field, value] of [['mood', mood], ['wellbeing', wellbeing], ['stress', stress]]) {
    if (value !== undefined && value !== null && value !== '' && !merged[field]) merged[field] = value;
  }

  const nextMeals = [...meals];
  nextMeals[index] = merged;
  const classified = classifyMeal(merged, { ...day, meals: nextMeals });
  merged.mealType = classified.mealType;
  if (isAutoMealName(merged.name)) merged.name = classified.name;

  return {
    day: touch({ ...day, meals: sortMealsByTime(nextMeals) }, nowMs, clientId),
    meal: merged,
    classified,
  };
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

  const prevDeletedItemIds = (day.deletedItemIds && typeof day.deletedItemIds === 'object' && !Array.isArray(day.deletedItemIds))
    ? day.deletedItemIds
    : {};
  const nextDeletedItemIds = { ...prevDeletedItemIds };

  const removeIds = (patch.removeItemIds || []).map(String);
  if (removeIds.length) {
    for (const id of removeIds) {
      if (!meal.items.some((item) => String(item.id) === id)) unknownItems.push(id);
    }
    const before = meal.items.length;
    meal.items = meal.items.filter((item) => {
      const id = String(item.id);
      if (!removeIds.includes(id)) return true;
      nextDeletedItemIds[id] = nowMs;
      return false;
    });
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
    // item.updatedAt нужен merge-save: без него stale PWA с тем же day.updatedAt
    // побеждает в mergeItemsById (legacy prefer-local) и затирает граммы куратора.
    meal.items[position] = { ...meal.items[position], grams, updatedAt: nowMs };
    changed.push(`${meal.items[position].name} → ${grams} г`);
  }

  if (Array.isArray(patch.addItems) && patch.addItems.length) {
    const stamped = patch.addItems.map((item) => (
      item && typeof item === 'object' ? { ...item, updatedAt: nowMs } : item
    ));
    meal.items = [...meal.items, ...stamped];
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

  meal.updatedAt = nowMs;

  // Правка меняет не только состав, но и суть приёма: к «перекусу» добавили
  // тарелку супа — это уже обед, и подписан он должен быть обедом. Понижать
  // сами не начинаем: убранная позиция не повод переименовывать чужой обед,
  // а вот сдвиг времени меняет слот в обе стороны.
  const contentChanged = removeIds.length > 0
    || Object.keys(patch.setGrams || {}).length > 0
    || (Array.isArray(patch.addItems) && patch.addItems.length > 0);
  if ((contentChanged || patch.time) && !patch.name) {
    const before = meal.mealType;
    const classified = classifyMeal(meal, day);
    const upgraded = !MAIN_MEAL_TYPES.has(before) && MAIN_MEAL_TYPES.has(classified.mealType);
    // Кофе-брейк перестаёт им быть, как только в чашку добавили еду, — и это
    // тоже повышение, хотя формально «перекус» основным приёмом не является.
    const leftCoffeeBreak = before === 'coffee_break' && classified.mealType !== 'coffee_break';
    if (classified.mealType !== before && (upgraded || leftCoffeeBreak || patch.time)) {
      meal.mealType = classified.mealType;
      if (isAutoMealName(meal.name)) meal.name = classified.name;
      changed.push(`тип → ${classified.name}`);
    }
  }

  const nextMeals = meals.map((m, i) => (i === index ? meal : m));
  const nextDay = touch({
    ...day,
    meals: resort ? sortMealsByTime(nextMeals) : nextMeals,
    deletedItemIds: nextDeletedItemIds,
  }, nowMs, clientId);
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

/**
 * Тренировка в блобе — минуты по 4 пульсовым зонам плюс необязательные поля,
 * которые уже понимает веб-модель (apps/web/heys_day_trainings_v1.js:2995) и
 * читает summarizeDay/isRealTraining/dayAverages здесь же: time, type,
 * activityLabel, mood/wellbeing/stress, comment. До этой правки коннектор их
 * молча терял — heys_log_training писал только `{z, updatedAt}`, и куратор не
 * мог записать ни время, ни субъективную оценку тренировки.
 *
 * `source` не берётся снаружи: коннектор всегда проставляет 'curator_mcp' сам,
 * чтобы отличать записи через MCP от того, что клиент внёс в приложении —
 * это пригодится модели нагрузки, если качество данных из двух источников
 * когда-нибудь придётся взвешивать по-разному.
 */
function addTraining(day, zoneMinutes, extra, { nowMs, clientId }) {
  const z = Array.from({ length: HR_ZONES }, (_, i) => (
    Math.min(MAX_TRAINING_MINUTES, Math.max(0, Number(zoneMinutes[i]) || 0))
  ));
  // id обязателен: по нему merge опознаёт тренировку при удалении. Без него
  // подпись собирается по полям, и две однотипные тренировки за день получают
  // одну подпись — tombstone гасит обе (аудит 2026-08-08).
  const training = { id: makeId('tr_'), z, updatedAt: nowMs, source: 'curator_mcp' };
  const e = extra || {};
  if (typeof e.time === 'string' && e.time.trim()) training.time = e.time.trim();
  if (typeof e.type === 'string' && e.type.trim()) training.type = e.type.trim();
  if (typeof e.activityLabel === 'string' && e.activityLabel.trim()) training.activityLabel = e.activityLabel.trim();
  if (typeof e.comment === 'string' && e.comment.trim()) training.comment = e.comment.trim();
  for (const field of ['mood', 'wellbeing', 'stress']) {
    const v = Number(e[field]);
    if (Number.isFinite(v) && v >= 1 && v <= 10) training[field] = v;
  }
  const list = Array.isArray(day.trainings) ? day.trainings : [];
  // Приложение рисует три слота. Раньше коннектор писал сколько угодно, а
  // удаление потом обрезало список до трёх и молча теряло лишние.
  const real = list.filter(isRealTraining).length;
  if (real >= MAX_TRAININGS_PER_DAY) {
    return { day, error: 'too_many' };
  }
  const trainings = [...list, training];
  return { day: touch({ ...day, trainings }, nowMs, clientId), error: null };
}

/**
 * Правка уже записанной тренировки: оценки, время, тип, комментарий, зоны.
 *
 * Добавить тренировку коннектор умел с самого начала, а дописать к ней оценку —
 * нет: куратор мог только завести новую. История без оценок так и оставалась
 * без них (2026-08-08).
 *
 * Индекс — позиция в `day.trainings`, как её отдаёт summarizeDay. `z` меняем
 * целиком: частичная правка отдельных зон неоднозначна (что делать с
 * непереданными — обнулить или оставить), а тренировка и так короткая.
 */
function updateTraining(day, index, patch, { nowMs, clientId }) {
  const list = Array.isArray(day.trainings) ? day.trainings : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= list.length) {
    return { day, applied: [], error: 'not_found' };
  }
  const current = list[i] || {};
  const next = { ...current };
  const applied = [];
  const p = patch || {};

  if (Array.isArray(p.zoneMinutes)) {
    next.z = Array.from({ length: HR_ZONES }, (_, k) => Math.max(0, Number(p.zoneMinutes[k]) || 0));
    applied.push('zones_minutes');
  }
  for (const [arg, field] of [['time', 'time'], ['type', 'type'], ['activityLabel', 'activityLabel'], ['comment', 'comment']]) {
    if (typeof p[arg] === 'string' && p[arg].trim()) { next[field] = p[arg].trim(); applied.push(arg); }
  }
  for (const field of ['mood', 'wellbeing', 'stress']) {
    if (p[field] === undefined || p[field] === null) continue;
    const v = Number(p[field]);
    if (!Number.isFinite(v) || v < 1 || v > 10) return { day, applied: [], error: 'invalid_range' };
    next[field] = v;
    applied.push(field);
  }
  if (!applied.length) return { day, applied: [], error: 'nothing_to_update' };

  next.updatedAt = nowMs;
  const trainings = list.slice();
  trainings[i] = next;
  return { day: touch({ ...day, trainings }, nowMs, clientId), applied, error: null };
}

/**
 * Записать силовую тренировку конструктором: новая или поверх существующей.
 *
 * Минуты по зонам ставим так же, как приложение выводит их из конструктора
 * (`normalizeWorkoutLogZoneMinutes`): вся длительность в зону 2. Без них
 * тренировка не даст ни калорий в TDEE, ни строки в средних оценках дня.
 */
function setStrengthWorkout(day, index, { exercises, time, comment, durationMin }, { nowMs, clientId }) {
  const built = buildWorkoutLog(exercises, { durationMin });
  if (built.error) return { day, error: built.error };

  const list = Array.isArray(day.trainings) ? day.trainings : [];
  let i = index === undefined || index === null ? list.length : Number(index);
  if (!Number.isInteger(i) || i < 0 || i > list.length) {
    return { day, error: list.length
      ? `В дне тренировок ${list.length} — index от 0 до ${list.length - 1}, либо не передавай его для новой.`
      : 'В дне нет тренировок — не передавай index, чтобы завести новую.' };
  }

  const isNew = i === list.length;
  const prev = list[i] || {};
  // Перезаписывать чужую кардио-тренировку силовой молча нельзя: раньше от неё
  // оставался ярлык («Плавание») поверх силового конструктора.
  if (!isNew && isRealTraining(prev) && prev.type && String(prev.type).toLowerCase() !== 'strength') {
    return { day, error: `Тренировка ${i} — «${prev.activityLabel || prev.type}», не силовая. Не передавай index, чтобы добавить новую, или сначала удали эту.` };
  }
  if (isNew && list.filter(isRealTraining).length >= MAX_TRAININGS_PER_DAY) {
    return { day, error: `В дне уже ${MAX_TRAININGS_PER_DAY} тренировки — больше приложение не показывает. Удали лишнюю или передай index для перезаписи.` };
  }
  // Программа куратора (Слой 2): пачка слотов не должна молча затирать
  // назначенное — куратор обязан явно передать index, чтобы записать поверх
  // своего же плана. Без этой проверки первый же вызов без index создал бы
  // четвёртую фактическую тренировку, а план остался бы висеть отдельно.
  if (isNew) {
    const assignedIdx = list.findIndex((t) => t && t.plan && t.plan.status === 'assigned');
    if (assignedIdx >= 0) {
      return { day, error: `Тренировка ${assignedIdx} в этом дне назначена планом и ещё не начата. Передай index: ${assignedIdx}, чтобы записать факт поверх плана, index для новой отдельной тренировки, или сначала heys_delete_training.` };
    }
  }
  // Куратор правит напрямую только пока план не начат клиентом. Дальше правка
  // идёт предложением (assignTrainingProposal): клиент сам решает, брать ли её,
  // и его отмеченные подходы при этом не трогаются ни при каком ответе.
  if (!isNew && prev.plan && prev.plan.status && prev.plan.status !== 'assigned') {
    return { day, error: `Тренировка ${i} — план со статусом «${prev.plan.status}»: клиент уже открыл его в приложении. Прямая запись поверх заменила бы его работу; отправь правку предложением через heys_propose_training_edit.` };
  }
  const minutes = clampTrainingMinutes(durationMin);
  const keepZ = Array.isArray(prev.z) && prev.z.some((m) => Number(m) > 0);
  const z = minutes !== null
    ? [0, minutes, 0, 0]
    : (keepZ ? prev.z.map((m) => Number(m) || 0) : [0, 1, 0, 0]);

  const training = {
    ...prev,
    id: prev.id || makeId('tr_'),
    z,
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: built.log,
    source: 'curator_mcp',
    updatedAt: nowMs,
  };
  // Запись факта поверх плана снимает статус «назначено»: план и снимок
  // остаются для отчёта (слой 6), но день больше не должен вычитать её из
  // калорий как невыполненную.
  if (training.plan) training.plan = { ...training.plan, status: 'done' };
  if (typeof time === 'string' && time.trim()) training.time = time.trim();
  if (typeof comment === 'string' && comment.trim()) training.comment = comment.trim();

  const trainings = list.slice();
  trainings[i] = training;
  return { day: touch({ ...day, trainings }, nowMs, clientId), index: i, error: null };
}

/**
 * Программа куратора, Слой 2: назначить одну тренировку клиенту.
 *
 * Архитектурное решение протокола — план не отдельная сущность, а та же
 * запись тренировки, помеченная `plan`, плюс неизменяемый `planSnapshot`.
 * Валидатор упражнений переиспользуется целиком из buildWorkoutLog: у плана и
 * факта одна форма данных, расходиться им незачем.
 *
 * `z: [0,0,0,0]` всегда, вне зависимости от durationMin — план не должен
 * поднимать калории и нагрузку клиента, пока тот ничего не сделал (Слой 1,
 * риск «план завышает калории»). Подходы по умолчанию done: false — это
 * задание, а не отчёт.
 */
function assignTraining(day, index, { exercises, time, dayLabel, assignedBy, weekIndex, programId }, { nowMs, clientId }) {
  const built = buildWorkoutLog(exercises, { defaultDone: false });
  if (built.error) return { day, error: built.error };
  if (typeof assignedBy !== 'string' || !assignedBy.trim()) {
    return { day, error: 'assignedBy обязателен: кто назначил тренировку.' };
  }

  const list = Array.isArray(day.trainings) ? day.trainings : [];
  let i = index === undefined || index === null ? list.length : Number(index);
  if (!Number.isInteger(i) || i < 0 || i > list.length) {
    return { day, error: list.length
      ? `В дне тренировок ${list.length} — index от 0 до ${list.length - 1}, либо не передавай его для новой.`
      : 'В дне нет тренировок — не передавай index, чтобы назначить первую.' };
  }
  const isNew = i === list.length;
  const prev = list[i] || {};
  // Свой же нетронутый черновик куратор переписывает поверх: клиент его ещё не
  // открывал, терять нечего. Всё остальное в слоте — чужая работа.
  const prevIsDraft = !isNew && prev.plan && prev.plan.status === 'assigned';
  if (!isNew && !prevIsDraft && isRealTraining(prev)) {
    if (prev.plan && prev.plan.status) {
      return { day, error: `Тренировка ${i} — план со статусом «${prev.plan.status}»: клиент уже открыл его в приложении. Прямая запись поверх заменила бы его работу; отправь правку предложением через heys_propose_training_edit.` };
    }
    return { day, error: `Тренировка ${i} уже существует и это факт клиента, не пустой слот. Не передавай index, чтобы назначить новую, или сначала heys_delete_training.` };
  }
  if (isNew && list.filter(isRealTraining).length >= MAX_TRAININGS_PER_DAY) {
    return { day, error: `В дне уже ${MAX_TRAININGS_PER_DAY} тренировки — больше приложение не показывает.` };
  }

  const prevPlan = prevIsDraft ? prev.plan : null;
  const plan = {
    // Тот же слот и тот же черновик — id сохраняется, иначе правка выглядела бы
    // для приложения новым заданием. Программа и неделя наследуются, чтобы
    // правка одного дня не выбивала его из отчёта по программе.
    id: prevPlan && prevPlan.id ? prevPlan.id : makeId('pl_'),
    programId: typeof programId === 'string' && programId.trim()
      ? programId.trim()
      : (prevPlan && prevPlan.programId) || null,
    weekIndex: Number.isInteger(weekIndex) && weekIndex > 0
      ? weekIndex
      : (prevPlan && Number.isInteger(prevPlan.weekIndex) ? prevPlan.weekIndex : null),
    dayLabel: typeof dayLabel === 'string' && dayLabel.trim()
      ? dayLabel.trim()
      : (prevPlan && prevPlan.dayLabel) || null,
    assignedBy: assignedBy.trim(),
    assignedAt: nowMs,
    status: 'assigned',
  };

  const training = {
    id: prevIsDraft && prev.id ? prev.id : makeId('tr_'),
    z: [0, 0, 0, 0],
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    // До явного старта это только задание. Живой журнал намеренно пуст:
    // иначе приложение обходит экран явного выбора и принимает план за уже
    // начатую тренировку. Нулевая оболочка сохраняет запись для isRealTraining,
    // но не добавляет фиктивную минуту из buildWorkoutLog.
    workoutLog: { version: 1, zoneMinutes: [0, 0, 0, 0], exercises: [] },
    // Снимок задания фиксируется здесь, при назначении, а не при старте:
    // иначе правка куратора между назначением и стартом прошла бы мимо него.
    planSnapshot: { exercises: built.log.exercises },
    plan,
    source: 'curator_mcp',
    updatedAt: nowMs,
  };
  // Не переданное поле при правке черновика значит «оставь как было», а не
  // «сотри»: куратор правит упражнения, не отменяя время и метку дня.
  if (typeof time === 'string' && time.trim()) training.time = time.trim();
  else if (prevIsDraft && typeof prev.time === 'string' && prev.time.trim()) training.time = prev.time;

  const trainings = list.slice();
  trainings[i] = training;
  return { day: touch({ ...day, trainings }, nowMs, clientId), index: i, planId: plan.id, replaced: !!prevIsDraft, error: null };
}

/**
 * Адресная правка черновика: добавить, убрать и изменить упражнения и подходы
 * по id, не пересказывая задание целиком.
 *
 * Полная замена списка (assignTraining) остаётся для «назначь другое», но для
 * «добавь ещё одно упражнение» она опасна: весь список пришлось бы диктовать
 * заново, и каждый такой пересказ — шанс потерять упражнение или переврать вес.
 * Поэтому операции адресные, как у позиций приёма еды.
 *
 * Итог всегда проходит через общий buildWorkoutLog: правила суперсетов, единиц
 * измерения и лимитов у правки и у назначения одни, второго набора условий нет.
 */
function editTrainingPlan(day, index, ops, { nowMs, clientId }) {
  const list = Array.isArray(day.trainings) ? day.trainings : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= list.length) {
    return { day, error: list.length
      ? `В дне тренировок ${list.length} — index от 0 до ${list.length - 1}.`
      : 'В этом дне нет тренировок.' };
  }
  const prev = list[i] || {};
  if (!prev.plan || !prev.plan.status) {
    return { day, error: `Тренировка ${i} — не назначенный план, а обычная запись клиента. Правь её через heys_update_training (время, оценки, комментарий); состав упражнений клиента куратор не переписывает.` };
  }
  if (prev.plan.status !== 'assigned') {
    return { day, error: `Тренировка ${i} — план со статусом «${prev.plan.status}»: клиент уже открыл его в приложении. Прямая правка заменила бы его работу; отправь её предложением через heys_propose_training_edit.` };
  }

  const o = ops || {};
  const asList = (v) => (Array.isArray(v) ? v : []);
  const hasAny = ['exercises_add', 'exercises_remove', 'exercises_patch', 'exercises_order']
    .some((k) => asList(o[k]).length);
  if (!hasAny) {
    return { day, error: 'Нечего менять: передай exercises_add, exercises_remove, exercises_patch или exercises_order.' };
  }

  const snapshotExercises = prev.planSnapshot && Array.isArray(prev.planSnapshot.exercises)
    ? prev.planSnapshot.exercises
    : [];
  if (!snapshotExercises.length) {
    return { day, error: `Тренировка ${i} не содержит planSnapshot с упражнениями: править план без подтверждённого источника нельзя.` };
  }
  let current = exercisesToInput(snapshotExercises);
  const known = () => current.map((ex) => `${ex.id} («${ex.name}»)`).join(', ');

  // Порядок фиксирован: сначала правки существующего, затем удаление, затем
  // добавление, затем перестановка. Иначе результат зависел бы от того, в каком
  // порядке модель перечислила операции в одном вызове.
  for (const patch of asList(o.exercises_patch)) {
    const p = patch || {};
    const target = current.find((ex) => ex.id === p.exercise_id);
    if (!target) {
      return { day, error: `Упражнение ${p.exercise_id || '(без exercise_id)'} в этом плане не найдено. Есть: ${known()}.` };
    }
    for (const [arg, field] of [['name', 'name'], ['unit', 'unit'], ['note', 'note']]) {
      if (typeof p[arg] === 'string') target[field] = p[arg];
    }
    for (const [arg, field] of [['rpe', 'rpe'], ['rest_sec', 'rest_sec'], ['superset_group', 'superset_group'], ['bodyweight_factor', 'bodyweight_factor']]) {
      if (p[arg] !== undefined && p[arg] !== null) target[field] = p[arg];
    }

    for (const ap of asList(p.approaches_patch)) {
      const a = ap || {};
      const hit = target.approaches.find((x) => x.id === a.approach_id);
      if (!hit) {
        const ids = target.approaches.map((x) => x.id).join(', ');
        return { day, error: `Подход ${a.approach_id || '(без approach_id)'} у «${target.name}» не найден. Есть: ${ids}.` };
      }
      for (const [arg, field] of [['weight_kg', 'weight_kg'], ['reps', 'reps'], ['duration_sec', 'duration_sec'], ['distance_m', 'distance_m'], ['extra_weight_kg', 'extra_weight_kg'], ['done', 'done'], ['discomfort', 'discomfort'], ['discomfort_note', 'discomfort_note'], ['drops', 'drops']]) {
        if (a[arg] !== undefined) hit[field] = a[arg];
      }
      // Разминочный ↔ рабочий: снятие пишется явным 'work', иначе снять метку
      // было бы нечем — пропуск поля значит «оставь как было».
      if (a.set_type === 'warmup') hit.set_type = 'warmup';
      else if (a.set_type === 'work') delete hit.set_type;
    }

    const removeAps = asList(p.approaches_remove);
    if (removeAps.length) {
      const missing = removeAps.filter((id) => !target.approaches.some((x) => x.id === id));
      if (missing.length) {
        return { day, error: `У «${target.name}» нет подходов: ${missing.join(', ')}.` };
      }
      target.approaches = target.approaches.filter((x) => !removeAps.includes(x.id));
      if (!target.approaches.length) {
        return { day, error: `У «${target.name}» не осталось бы подходов. Убери упражнение целиком через exercises_remove.` };
      }
    }
    for (const add of asList(p.approaches_add)) {
      const copy = { ...(add || {}) };
      delete copy.id;
      target.approaches.push(copy);
    }
  }

  const removeEx = asList(o.exercises_remove);
  if (removeEx.length) {
    const missing = removeEx.filter((id) => !current.some((ex) => ex.id === id));
    if (missing.length) {
      return { day, error: `В плане нет упражнений: ${missing.join(', ')}. Есть: ${known()}.` };
    }
    current = current.filter((ex) => !removeEx.includes(ex.id));
  }

  for (const add of asList(o.exercises_add)) {
    const raw = { ...(add || {}) };
    const at = raw.at_index;
    delete raw.at_index;
    delete raw.id;
    if (at === undefined || at === null) current.push(raw);
    else {
      const k = Number(at);
      if (!Number.isInteger(k) || k < 0 || k > current.length) {
        return { day, error: `at_index ${at}: место вставки — целое от 0 до ${current.length}.` };
      }
      current.splice(k, 0, raw);
    }
  }

  const order = asList(o.exercises_order);
  if (order.length) {
    if (order.length !== current.length) {
      return { day, error: `exercises_order перечисляет ${order.length} упражнений, а в плане их ${current.length} — порядок задаётся полным списком id.` };
    }
    const reordered = [];
    for (const id of order) {
      const hit = current.find((ex) => ex.id === id);
      if (!hit || reordered.includes(hit)) {
        return { day, error: `exercises_order: ${id} не из этого плана или повторяется. Есть: ${known()}.` };
      }
      reordered.push(hit);
    }
    current = reordered;
  }

  if (!current.length) {
    return { day, error: 'В плане не осталось упражнений. Пустое задание не назначают — убери тренировку через heys_delete_training.' };
  }

  const built = buildWorkoutLog(current, { defaultDone: false, preserveIds: true });
  if (built.error) return { day, error: built.error };

  const training = {
    ...prev,
    workoutLog: { version: 1, zoneMinutes: [0, 0, 0, 0], exercises: [] },
    // Снимок задания едет за правкой, как и при повторном назначении: клиент
    // ещё не начал, сравнивать план с фактом пока не с чем.
    planSnapshot: { exercises: built.log.exercises },
    plan: { ...prev.plan, assignedAt: nowMs },
    updatedAt: nowMs,
  };
  const trainings = list.slice();
  trainings[i] = training;
  return { day: touch({ ...day, trainings }, nowMs, clientId), index: i, exercises: built.log.exercises.length, error: null };
}

/**
 * Программа куратора, Слой 5: правка плана, который клиент уже открыл.
 *
 * Прямой записи здесь нет и быть не может — клиент в этот момент может стоять
 * с гантелей в руке, и его отмеченные подходы чужая версия заменить не вправе.
 * Поэтому правка кладётся рядом с планом как предложение, а решение остаётся
 * за клиентом: применит его приложение через `TK.strength.applyPlanEdit`, и
 * там же сработает правило «отмеченное не трогаем».
 *
 * Живое предложение всегда одно: новое заменяет прежнее, а не встаёт в
 * очередь. Иначе клиент открывает три предложения подряд и не понимает, какое
 * сейчас в силе, а куратор не понимает, на какое ему ответили.
 *
 * Пропущенный день (`skipped`) сюда тоже попадает: защищать в нём нечего —
 * отмеченных подходов нет, — но пропуск был решением человека, и возвращать
 * его в план молчаливой перезаписью нельзя.
 */
function proposeTrainingEdit(day, index, { exercises, proposedBy, note }, { nowMs, clientId }) {
  const built = buildWorkoutLog(exercises, { defaultDone: false });
  if (built.error) return { day, error: built.error };
  if (typeof proposedBy !== 'string' || !proposedBy.trim()) {
    return { day, error: 'proposedBy обязателен: кто предлагает правку.' };
  }

  const list = Array.isArray(day.trainings) ? day.trainings : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= list.length) {
    return { day, error: list.length
      ? `В дне тренировок ${list.length} — index от 0 до ${list.length - 1}.`
      : 'В этом дне нет тренировок.' };
  }
  const prev = list[i] || {};
  if (!prev.plan || !prev.plan.status) {
    return { day, error: `Тренировка ${i} — не назначенный план, а обычная запись клиента. Предлагать правку к ней нельзя: это его тренировка, а не твоё задание.` };
  }
  if (prev.plan.status === 'assigned') {
    return { day, error: `Тренировка ${i} ещё не открыта клиентом — правь её напрямую через heys_assign_training, предложение здесь лишний шаг.` };
  }
  if (prev.plan.status === 'done') {
    return { day, error: `Тренировка ${i} уже завершена клиентом. Изменить сделанное задним числом нельзя — назначь следующую тренировку отдельно.` };
  }

  // Предпросмотр против живого состояния: куратор должен увидеть, что часть
  // правки не ляжет, ещё до отправки. Молчаливого «не применилось» быть не
  // может ни на одной из двух сторон.
  const liveExercises = prev.workoutLog && Array.isArray(prev.workoutLog.exercises)
    ? prev.workoutLog.exercises
    : [];
  const preview = webMirror.applyPlanEdit(liveExercises, built.log.exercises);
  if (!preview.ok) {
    return { day, error: `Такая правка разрывает связку: ${preview.errors.join('; ')}.` };
  }

  const proposal = {
    id: makeId('pp_'),
    exercises: built.log.exercises,
    proposedBy: proposedBy.trim(),
    proposedAt: nowMs,
    status: 'pending',
  };
  if (typeof note === 'string' && note.trim()) proposal.note = note.trim();

  const training = {
    ...prev,
    plan: { ...prev.plan, proposal },
    updatedAt: nowMs,
  };
  const trainings = list.slice();
  trainings[i] = training;
  return {
    day: touch({ ...day, trainings }, nowMs, clientId),
    index: i,
    proposalId: proposal.id,
    preview: { applied: preview.applied, rejected: preview.rejected },
    error: null,
  };
}

/**
 * Перенос тренировки на другую дату (дизайн-ревью 2026-08-10, экраны 16a/16b).
 *
 * Отдельного механизма здесь нет и не нужно: перенос — это то же назначение
 * плана на новый день плюс след в обе стороны. Новых операций не заводим,
 * добавляется только происхождение на перенесённой записи и отметка на
 * исходном дне.
 *
 * Ключевое различие, из которого следует всё остальное: **перенести ≠
 * пропустить**. Перенос освобождает исходный день заранее и пропуском не
 * считается — в отчёте куратора это отдельная строка. Пропуск задним числом
 * остаётся пропуском навсегда: прошедший день не воскрешают, замена приходит
 * новой тренировкой на свободный день.
 *
 * Возвращает исходный день с отметкой и готовую запись для целевого дня —
 * записать её обязан вызывающий, потому что дни лежат под разными ключами и
 * транзакции между ними нет.
 */
function moveTrainingOut(day, index, { toDate, expectedPlanId, expectedAssignedAt, nowMs, clientId }) {
  const list = Array.isArray(day.trainings) ? day.trainings : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= list.length) {
    return { day, error: `В дне тренировок ${list.length} — index от 0 до ${Math.max(0, list.length - 1)}.` };
  }
  if (!isValidDate(toDate)) return { day, error: `Дата "${toDate}" не в формате YYYY-MM-DD.` };
  const prev = list[i] || {};
  if (!prev.plan || !prev.plan.status) {
    return { day, error: `Тренировка ${i} — не назначенный план, а обычная запись. Переносить можно только план.` };
  }
  if (prev.plan.status === 'done' || prev.plan.status === 'started') {
    return { day, error: `Тренировка ${i} уже начата или закончена — перенести её нельзя. Сделанное остаётся на своём дне.` };
  }
  if (prev.plan.status === 'moved') {
    return { day, error: `Тренировка ${i} уже перенесена на ${prev.plan.movedTo || 'другую дату'}.` };
  }
  if (prev.plan.status !== 'assigned') {
    return { day, error: `Тренировка ${i} имеет статус «${prev.plan.status}». Переносить можно только ещё не открытый план в статусе assigned.` };
  }
  const currentPlanId = String(prev.plan.id || '');
  const currentAssignedAt = Number(prev.plan.assignedAt) || 0;
  if (!currentPlanId || !currentAssignedAt) {
    return { day, error: `У тренировки ${i} нет полной ревизии плана (plan.id + assignedAt). Сначала переназначь её, затем повтори перенос.` };
  }
  if (String(expectedPlanId || '') !== currentPlanId || Number(expectedAssignedAt) !== currentAssignedAt) {
    return { day, error: `План тренировки ${i} изменился после чтения: ожидалась ревизия ${expectedPlanId || '—'}/${expectedAssignedAt || '—'}, сейчас ${currentPlanId}/${currentAssignedAt}. Сначала перечитай heys_get_training.` };
  }
  if (hasMeaningfulLiveTraining(prev)) {
    return { day, error: `Тренировка ${i} содержит начатый live-log, несмотря на статус assigned. Перенос остановлен, чтобы не стереть отмеченные подходы, таймер или минуты зон.` };
  }
  if (!isValidDate(day.date)) {
    return { day, error: 'У исходного дня нет валидной даты — безопасно проверить направление переноса нельзя.' };
  }
  if (toDate <= day.date) {
    return { day, error: `Перенос возможен только вперёд: целевая дата ${toDate} должна быть позже ${day.date}.` };
  }
  if (!prev.planSnapshot || !Array.isArray(prev.planSnapshot.exercises) || !prev.planSnapshot.exercises.length) {
    return { day, error: `Тренировка ${i} не содержит planSnapshot с упражнениями: переносить план без подтверждённого источника нельзя.` };
  }

  // Исходный день: не пропуск, а «уехала на такую-то дату». Статус moved
  // держит её вне калорий и нагрузки — считаться она будет на новом дне.
  const transferId = trainingTransferId(prev, i, day.date, toDate);
  const source = {
    ...prev,
    workoutLog: { version: 1, zoneMinutes: [0, 0, 0, 0], exercises: [] },
    plan: { ...prev.plan, status: 'moved', movedTo: toDate, movedAt: nowMs, transferId },
    updatedAt: nowMs,
  };
  // Целевой день получает ту же тренировку целиком, вместе с весами, и след
  // происхождения: клиент должен видеть, что это перенос, а не новое задание.
  const moved = {
    ...prev,
    id: makeId('tr_'),
    // Старые assigned-записи могли хранить назначенный состав в live-log.
    // На новом дне перенос нормализует их к текущему draft-контракту.
    workoutLog: { version: 1, zoneMinutes: [0, 0, 0, 0], exercises: [] },
    plan: {
      ...prev.plan,
      status: 'assigned',
      movedFrom: day.date || null,
      movedAt: nowMs,
      transferId,
      movedSourceId: prev.id || null,
    },
    updatedAt: nowMs,
  };
  delete moved.plan.movedTo;
  // Неотвеченная правка едет вместе с тренировкой: она про её содержание, а не
  // про дату, и на новом дне остаётся ровно тем же незакрытым вопросом.

  const trainings = list.slice();
  trainings[i] = source;
  return {
    day: touch({ ...day, trainings }, nowMs, clientId),
    index: i,
    movedTraining: moved,
    error: null,
  };
}

/**
 * Принять перенесённую тренировку на целевом дне. Отдельная функция, потому
 * что это другой ключ хранилища: вызывающий пишет два дня подряд, и если
 * второй записать не удалось, первый обязан остаться нетронутым.
 */
function moveTrainingIn(day, movedTraining, { nowMs, clientId }) {
  const list = Array.isArray(day.trainings) ? day.trainings : [];
  const transferId = movedTraining && movedTraining.plan && movedTraining.plan.transferId;
  if (transferId) {
    const existingIndex = list.findIndex((training) => (
      training && training.plan && training.plan.transferId === transferId
    ));
    if (existingIndex >= 0) {
      return { day, index: existingIndex, idempotent: true, error: null };
    }
    const movedFrom = movedTraining.plan.movedFrom;
    const movedSourceId = movedTraining.plan.movedSourceId;
    const staleIndex = list.findIndex((training) => (
      training && training.plan && training.plan.transferId &&
      training.plan.transferId !== transferId &&
      training.plan.movedFrom === movedFrom &&
      movedSourceId && training.plan.movedSourceId === movedSourceId
    ));
    if (staleIndex >= 0) {
      return {
        day,
        reason: 'stale_transfer',
        error: `В целевом дне уже есть перенос этой тренировки из ${movedFrom} по предыдущей ревизии плана. Новый перенос не добавлен.`,
      };
    }
  }
  if (list.filter(isRealTraining).length >= MAX_TRAININGS_PER_DAY) {
    return { day, error: `В дне ${day.date || ''} уже ${MAX_TRAININGS_PER_DAY} тренировки — перенести сюда некуда.` };
  }
  const trainings = list.concat([{ ...movedTraining, updatedAt: nowMs }]);
  return { day: touch({ ...day, trainings }, nowMs, clientId), index: trainings.length - 1, idempotent: false, error: null };
}

/**
 * Отозвать своё предложение, пока клиент не ответил. Отзыв — не отказ клиента:
 * запись просто перестаёт существовать, и в истории дня следа не оставляет.
 */
function withdrawTrainingProposal(day, index, { nowMs, clientId }) {
  const list = Array.isArray(day.trainings) ? day.trainings : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= list.length) {
    return { day, error: `В дне тренировок ${list.length} — index от 0 до ${Math.max(0, list.length - 1)}.` };
  }
  const prev = list[i] || {};
  const proposal = prev.plan && prev.plan.proposal;
  if (!proposal || proposal.status !== 'pending') {
    return { day, error: `У тренировки ${i} нет неотвеченного предложения.` };
  }
  const nextPlan = { ...prev.plan };
  delete nextPlan.proposal;
  const trainings = list.slice();
  trainings[i] = { ...prev, plan: nextPlan, updatedAt: nowMs };
  return { day: touch({ ...day, trainings }, nowMs, clientId), index: i, error: null };
}

/**
 * Подпись тренировки для tombstone — зеркало `trainingDeletionSignature`
 * из apps/web/heys_sync_merge_v1.js:157. Стабильного id у тренировки может не
 * быть, поэтому опознаём по полям, а в крайнем случае по минутам зон.
 */
function trainingDeletionSignature(training) {
  if (!training || typeof training !== 'object') return '';
  const id = training.id == null ? '' : String(training.id).trim();
  if (id) return `id:${id}`;
  const identity = [training.type, training.activityLabel, training.source, training.time, training.hobbySubtype]
    .map((v) => String(v == null ? '' : v).trim().toLowerCase());
  if (identity.some(Boolean)) return `fields:${identity.join('|')}`;
  const zones = Array.isArray(training.z) ? training.z.map((v) => Number(v) || 0) : [];
  return zones.some((v) => v > 0) ? `zones:${zones.join('|')}` : '';
}

/**
 * Удалить тренировку. Без tombstone нельзя: merge вернёт её из облака, как это
 * было бы с приёмом еды. Форма записи повторяет приложение
 * (heys_day_trainings_v1.js:2555) — строку вырезаем, список добиваем пустыми
 * заготовками до трёх, подпись кладём в `deletedTrainings`.
 *
 * Тренировка без подписи (пустая заготовка) удалению не подлежит: merge не
 * сможет отличить её от чужой, и tombstone погасил бы лишнее.
 */
function deleteTraining(day, index, { nowMs, clientId }) {
  const list = Array.isArray(day.trainings) ? day.trainings : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= list.length) {
    return { day, error: 'not_found' };
  }
  const removed = list[i];
  const signature = trainingDeletionSignature(removed);
  if (!signature) return { day, error: 'not_deletable' };

  const empty = { z: Array.from({ length: HR_ZONES }, () => 0), time: '', type: '' };
  // Список НЕ обрезаем до трёх: в дне может лежать больше строк, и slice(0,3)
  // терял бы хвост без tombstone. Добиваем заготовкой до прежней длины, чтобы
  // позиционный merge не считал исчезнувший слот чужой правкой.
  const kept = [...list.slice(0, i), ...list.slice(i + 1)];
  // Merge тренировок позиционный, а удаление сдвигает массив влево. У записей
  // приложения нет своего updatedAt, они падают на day.updatedAt и локальная
  // версия побеждает на всех позициях. У наших он свой и разный — после сдвига
  // строка сравнивалась бы с чужой позицией и терялась. Поднимаем штамп у всех
  // оставшихся, повторяя поведение приложения.
  const trainings = [...kept.map((t) => ({ ...t, updatedAt: nowMs })), empty];
  const prevTombstones = Array.isArray(day.deletedTrainings) ? day.deletedTrainings : [];
  const deletedTrainings = [
    { tombstoneId: `${nowMs}:${i}:${signature}`, signature, deletedAt: nowMs, index: i },
    ...prevTombstones,
  ].slice(0, 50);

  return { day: touch({ ...day, trainings, deletedTrainings }, nowMs, clientId), removed, error: null };
}

/** Пресеты отдыха конструктора (apps/web/heys_day_trainings_v1.js:516). */
const REST_PRESETS = [60, 90, 120, 180];

/**
 * Силовая тренировка конструктором: упражнения, подходы, суперсеты, RPE.
 *
 * Форма — та же, что пишет приложение (`ensureWorkoutLogShape`,
 * heys_day_trainings_v1.js:2708). Приложение нормализует блоб при загрузке, но
 * писать надо сразу канонично: иначе тоннаж и рекорды считаются по одному
 * снимку, а рисуются по другому.
 *
 * Проверяем ВСЁ до записи — как это делает пачка слотов: ошибка в третьем
 * упражнении не должна оставить половину тренировки записанной.
 *
 * `done` по умолчанию true: куратор вносит уже состоявшуюся тренировку, а не
 * план. В приложении наоборот — там подход отмечают по ходу.
 */
/**
 * Модель упражнений → та же форма, которую принимает buildWorkoutLog.
 *
 * Одно представление на чтение и запись: куратор видит ровно те имена полей,
 * которые потом отправляет назад, и правка не требует перевода между двумя
 * словарями. Отсюда же берётся исходник для адресных операций над планом —
 * применили изменения к этой форме и прогнали через общий валидатор.
 */
function exercisesToInput(exercises) {
  return (Array.isArray(exercises) ? exercises : []).map((ex) => {
    const unit = typeof ex.unit === 'string' && ex.unit ? ex.unit : 'weight_reps';
    const out = {
      id: ex.id,
      name: ex.name || '',
      unit,
      note: typeof ex.note === 'string' ? ex.note : '',
      rpe: Number(ex.rpe) || 0,
      superset_group: Number(ex.ssGroup) || 0,
      rest_sec: Number(ex.restSec) || 90,
      approaches: (Array.isArray(ex.approaches) ? ex.approaches : []).map((a) => {
        const ap = { id: a.id, done: a.done !== false };
        const w = a.weightKg === '' || a.weightKg === undefined || a.weightKg === null ? null : Number(a.weightKg);
        if (w !== null && Number.isFinite(w)) ap.weight_kg = w;
        if (a.reps !== undefined && a.reps !== null) ap.reps = Number(a.reps);
        if (a.durationSec !== undefined && a.durationSec !== null) ap.duration_sec = Number(a.durationSec);
        if (a.distanceM !== undefined && a.distanceM !== null) ap.distance_m = Number(a.distanceM);
        if (a.type === 'warmup') ap.set_type = 'warmup';
        if (a.extraWeightKg !== undefined && a.extraWeightKg !== null) ap.extra_weight_kg = Number(a.extraWeightKg);
        if (a.discomfort) {
          ap.discomfort = true;
          if (a.discomfortNote) ap.discomfort_note = String(a.discomfortNote);
        }
        if (Array.isArray(a.drops) && a.drops.length) {
          ap.drops = a.drops.map((d) => ({
            weight_kg: Number(d.weightKg),
            reps: Number(d.reps),
            done: d.done !== false,
          }));
        }
        return ap;
      }),
    };
    if (unit === 'bodyweight' && ex.bodyweightFactor !== undefined && ex.bodyweightFactor !== null) {
      out.bodyweight_factor = Number(ex.bodyweightFactor);
    }
    return out;
  });
}

function buildWorkoutLog(exercises, { durationMin, defaultDone, preserveIds } = {}) {
  // Назначение плана пишет подходы невыполненными (Слой 2 программы куратора):
  // куратор вносит задание, а не отчёт о том, что клиент уже поднял вес.
  const doneDefault = defaultDone === undefined ? true : !!defaultDone;
  if (!Array.isArray(exercises) || !exercises.length) {
    return { error: 'Нужен непустой список exercises.' };
  }
  if (exercises.length > MAX_EXERCISES) {
    return { error: `Слишком много упражнений: ${exercises.length}, максимум ${MAX_EXERCISES}.` };
  }
  // Число, а не «что угодно, приводимое к числу»: Number(true) === 1 и
  // Number([]) === 0 молча превращали булев и пустой массив в вес и повторы.
  const strictNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const out = [];
  const usedIds = new Set();
  for (let i = 0; i < exercises.length; i += 1) {
    const raw = exercises[i] || {};
    const where = `Упражнение ${i + 1}`;
    if (typeof raw.name !== 'string' || !raw.name.trim()) {
      return { error: `${where}: нужно название (name) строкой.` };
    }
    const name = raw.name.trim();
    if (name.length > MAX_NAME_LEN) {
      return { error: `${where}: название длиннее ${MAX_NAME_LEN} символов.` };
    }
    if (raw.note !== undefined && raw.note !== null && typeof raw.note !== 'string') {
      return { error: `${where} «${name}»: note — строка.` };
    }
    if (typeof raw.note === 'string' && raw.note.length > MAX_NOTE_LEN) {
      return { error: `${where} «${name}»: заметка длиннее ${MAX_NOTE_LEN} символов.` };
    }

    const rawAps = Array.isArray(raw.approaches) ? raw.approaches : null;
    if (!rawAps || !rawAps.length) return { error: `${where} «${name}»: нужен непустой список approaches.` };
    if (rawAps.length > MAX_APPROACHES) {
      return { error: `${where} «${name}»: подходов ${rawAps.length}, максимум ${MAX_APPROACHES}.` };
    }
    const rawSsGroup = raw.superset_group === undefined || raw.superset_group === null
      ? 0
      : strictNum(raw.superset_group);
    // Единица измерения — снимок со справочника (heys_exercise_catalog_v1.js).
    // Пусто = weight_reps, как у старых записей. Время/дистанция — планка,
    // фермерская переноска и т.п.: там повторов нет вовсе.
    const rawUnit = raw.unit === undefined || raw.unit === null || raw.unit === ''
      ? 'weight_reps'
      : String(raw.unit);
    if (!['weight_reps', 'bodyweight', 'time', 'distance'].includes(rawUnit)) {
      return { error: `${where} «${name}»: unit — weight_reps, bodyweight, time или distance.` };
    }
    const measuredByTime = rawUnit === 'time';
    const measuredByDistance = rawUnit === 'distance';
    // Коэффициент — снимок со справочника, а не переменная настройка: где
    // неизвестен, остаётся null, тоннаж честно не считается (как в приложении).
    let bodyweightFactor = null;
    if (rawUnit === 'bodyweight' && raw.bodyweight_factor !== undefined && raw.bodyweight_factor !== null) {
      bodyweightFactor = strictNum(raw.bodyweight_factor);
      if (bodyweightFactor === null || !(bodyweightFactor > 0) || bodyweightFactor > 2) {
        return { error: `${where} «${name}»: bodyweight_factor — число от 0 до 2.` };
      }
    }
    const approaches = [];
    for (let k = 0; k < rawAps.length; k += 1) {
      const a = rawAps[k] || {};
      let reps = null;
      if (!measuredByTime && !measuredByDistance) {
        reps = strictNum(a.reps);
        if (reps === null || !Number.isInteger(reps) || reps < 1 || reps > 200) {
          return { error: `${where} «${name}», подход ${k + 1}: reps — целое число от 1 до 200.` };
        }
      }
      let durSec = null;
      if (measuredByTime) {
        durSec = strictNum(a.duration_sec);
        if (durSec === null || !(durSec > 0) || durSec > 86400) {
          return { error: `${where} «${name}», подход ${k + 1}: duration_sec — число секунд от 1 до 86400.` };
        }
      }
      let distM = null;
      if (measuredByDistance) {
        distM = strictNum(a.distance_m);
        if (distM === null || !(distM > 0) || distM > 200000) {
          return { error: `${where} «${name}», подход ${k + 1}: distance_m — число метров от 1 до 200000.` };
        }
      }
      let w = null;
      if (a.weight_kg !== undefined && a.weight_kg !== null && a.weight_kg !== '') {
        w = strictNum(a.weight_kg);
        if (w === null || w < 0 || w > 1000) {
          return { error: `${where} «${name}», подход ${k + 1}: weight_kg — число от 0 до 1000 или пусто для своего веса.` };
        }
      }
      if (a.done !== undefined && typeof a.done !== 'boolean') {
        return { error: `${where} «${name}», подход ${k + 1}: done — true или false.` };
      }
      if (a.set_type !== undefined && a.set_type !== null && !['work', 'warmup'].includes(a.set_type)) {
        return { error: `${where} «${name}», подход ${k + 1}: set_type — work или warmup.` };
      }
      if (a.discomfort !== undefined && typeof a.discomfort !== 'boolean') {
        return { error: `${where} «${name}», подход ${k + 1}: discomfort — true или false.` };
      }
      if (a.discomfort_note !== undefined && a.discomfort_note !== null && typeof a.discomfort_note !== 'string') {
        return { error: `${where} «${name}», подход ${k + 1}: discomfort_note — строка.` };
      }
      if (typeof a.discomfort_note === 'string' && a.discomfort_note.length > 100) {
        return { error: `${where} «${name}», подход ${k + 1}: discomfort_note длиннее 100 символов.` };
      }

      // Сброс — ступень ВНУТРИ подхода, а не отдельный подход: иначе счётчик
      // подходов у коннектора и приложения разойдётся на каждом дроп-сете.
      const rawDrops = a.drops === undefined || a.drops === null ? [] : a.drops;
      if (!Array.isArray(rawDrops)) {
        return { error: `${where} «${name}», подход ${k + 1}: drops — список ступеней сброса.` };
      }
      const drops = [];
      for (let d = 0; d < rawDrops.length; d += 1) {
        const st = rawDrops[d] || {};
        const dReps = strictNum(st.reps);
        const dW = strictNum(st.weight_kg);
        if (dReps === null || dW === null) {
          return { error: `${where} «${name}», подход ${k + 1}, ступень ${d + 1}: нужны weight_kg и reps.` };
        }
        drops.push({
          weightKg: String(dW),
          reps: dReps,
          done: st.done === undefined ? (a.done === undefined ? true : a.done) : st.done,
        });
      }

      const extra = a.extra_weight_kg === undefined || a.extra_weight_kg === null || a.extra_weight_kg === ''
        ? null
        : strictNum(a.extra_weight_kg);

      const approach = {
        // Правка существующего подхода не должна выглядеть для приложения
        // новым: id живёт, пока живёт сам подход.
        id: preserveIds && typeof a.id === 'string' && a.id ? a.id : makeId('ap_'),
        weightKg: w === null ? '' : String(w),
        done: a.done === undefined ? doneDefault : a.done,
      };
      if (reps !== null) approach.reps = reps;
      if (durSec !== null) approach.durationSec = durSec;
      if (distM !== null) approach.distanceM = distM;
      if (a.set_type === 'warmup') approach.type = 'warmup';
      if (extra !== null && extra !== 0) approach.extraWeightKg = extra;
      if (drops.length) approach.drops = drops;
      if (a.discomfort) {
        approach.discomfort = true;
        const note = typeof a.discomfort_note === 'string' ? a.discomfort_note.trim() : '';
        if (note) approach.discomfortNote = note;
      }

      // Правила подхода живут в ядре в одном экземпляре — свой набор условий
      // здесь разошёлся бы с приложением молча.
      const verdict = webMirror.validateApproach(approach, { inSuperset: rawSsGroup > 0, unit: rawUnit });
      if (!verdict.ok) {
        return { error: `${where} «${name}», подход ${k + 1}: ${verdict.errors.join('; ')}.` };
      }
      approaches.push(approach);
    }

    const rpe = raw.rpe === undefined || raw.rpe === null ? 0 : strictNum(raw.rpe);
    if (rpe === null || !Number.isInteger(rpe) || rpe < 0 || rpe > 10) {
      return { error: `${where} «${name}»: rpe — целое число от 0 до 10.` };
    }
    const ssGroup = rawSsGroup;
    if (ssGroup === null || !Number.isInteger(ssGroup) || ssGroup < 0) {
      return { error: `${where} «${name}»: superset_group — целое число ≥ 0 (0 = без связки, одинаковый номер = один суперсет).` };
    }
    const restSec = raw.rest_sec === undefined || raw.rest_sec === null ? 90 : strictNum(raw.rest_sec);
    if (restSec === null || !REST_PRESETS.includes(restSec)) {
      return { error: `${where} «${name}»: rest_sec — одно из ${REST_PRESETS.join(', ')}.` };
    }

    // sets/reps/weightKg — legacy-поля, приложение держит их синхронными с
    // первой строкой подходов (syncLegacyFieldsFromApproaches).
    let exId = preserveIds && typeof raw.id === 'string' && raw.id ? raw.id : makeId('ex_');
    while (usedIds.has(exId)) exId = makeId('ex_');
    usedIds.add(exId);
    const exOut = {
      id: exId,
      name,
      approaches,
      note: typeof raw.note === 'string' ? raw.note.trim() : '',
      ssGroup,
      rpe,
      restSec,
      restManual: false,
      collapsed: false,
      sets: approaches.length,
      reps: approaches[0].reps || 0,
      weightKg: approaches[0].weightKg,
    };
    if (rawUnit !== 'weight_reps') exOut.unit = rawUnit;
    if (rawUnit === 'bodyweight') exOut.bodyweightFactor = bodyweightFactor;
    out.push(exOut);
  }

  // Суперсет из одного упражнения приложение распускает само (pruneSsGroups) —
  // не даём завести заведомо мусорную связку.
  const counts = {};
  for (const ex of out) if (ex.ssGroup > 0) counts[ex.ssGroup] = (counts[ex.ssGroup] || 0) + 1;
  for (const [g, n] of Object.entries(counts)) {
    if (n < 2) return { error: `superset_group ${g} стоит у одного упражнения — в связке нужно минимум два.` };
  }

  // Смежность участников — инвариант писателя: раунд выводится из позиции, и
  // разорванная связка молча перестала бы давать раунды. Проверка та же, что у
  // приложения — из ядра, а не второй набор условий.
  const layout = webMirror.validateSupersetLayout(out);
  if (!layout.ok) {
    return { error: `${layout.errors.join('; ')}. Участники связки идут подряд в списке exercises.` };
  }

  // Форма как у приложения (ensureWorkoutLogShape): version + zoneMinutes +
  // totalDurationMinutes + exercises. Без zoneMinutes наша запись слабее в
  // тай-брейке merge — workoutLogRichness даёт за него +100 очков, и при
  // конфликте с версией из приложения наша проигрывала бы.
  const minutes = clampTrainingMinutes(durationMin);
  const log = {
    version: 1,
    zoneMinutes: minutes !== null ? [0, minutes, 0, 0] : [0, 1, 0, 0],
    exercises: out,
  };
  // totalDurationMinutes держим согласованным с zoneMinutes, а не сырым
  // значением: раньше duration_min=500 давало z=[0,180,0,0] при
  // totalDurationMinutes=500, и сервер с приложением видели разное.
  if (minutes !== null) log.totalDurationMinutes = minutes;
  return { log };
}

/** Минуты одной тренировки в границах приложения (clampWbZoneMin: 1..180). */
function clampTrainingMinutes(durationMin) {
  const dur = typeof durationMin === 'number' && Number.isFinite(durationMin) ? durationMin : null;
  if (dur === null || dur <= 0) return null;
  return Math.max(1, Math.min(180, Math.round(dur)));
}

const DAY_FIELD_MAP = {
  weight: 'weightMorning',
  steps: 'steps',
  // household_min здесь нет намеренно: быт пишется списком активностей через
  // setHouseholdActivities, иначе скаляр расходится со списком.
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

/**
 * Погасить метку авторства — клиент назвал значение сам.
 *
 * Зеркалит HEYS.models.clearCuratorMarks в apps/web/heys_models_v1.js: метка не
 * удаляется, а перезаписывается пустым значением. Удалённый ключ вернулся бы со
 * второй стороны — merge объединяет этот словарь union'ом по свежести. Просто
 * «не ставить метку» при записи недостаточно: старая метка пережила бы запись,
 * и повтор того же числа снова читался бы как кураторский.
 */
function clearCuratorEdits(day, targets, nowMs) {
  const marks = (day._curatorEdits && typeof day._curatorEdits === 'object' && !Array.isArray(day._curatorEdits))
    ? day._curatorEdits
    : null;
  if (!marks) return undefined;
  const touched = targets.filter((f) => marks[f]);
  if (!touched.length) return marks;
  const next = { ...marks };
  for (const field of touched) next[field] = { at: nowMs, value: null };
  return next;
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
  let base = day;
  const applied = [];
  // Быт — не обычное числовое поле: расчёт читает список активностей и молча
  // игнорирует скаляр рядом с ним, поэтому пишем оба разом (см.
  // setHouseholdActivities). Ноль снимает быт целиком.
  if (fields.household_min !== undefined && fields.household_min !== null) {
    const minutes = Math.round(Number(fields.household_min));
    if (!Number.isFinite(minutes) || minutes < 0) throw new Error('invalid_number:household_min');
    base = setHouseholdActivities(base, minutes > 0 ? [{ minutes }] : [], { nowMs, clientId }).day;
    applied.push('household_min');
  }
  const next = { ...base };
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
  // Поля с собственным штампом в merge (DAY_USER_MUTATION_GROUPS в
  // heys_sync_merge_v1.cjs): без штампа правка коннектора проигрывает облачной
  // версии, даже когда та старее, — и молча откатывается при следующем синке.
  const FIELD_STAMPS = {
    steps: 'stepsUpdatedAt',
    sleep_note: 'sleepNoteUpdatedAt',
    comment: 'dayCommentUpdatedAt',
  };
  for (const [publicName, stamp] of Object.entries(FIELD_STAMPS)) {
    if (applied.includes(publicName)) next[stamp] = nowMs;
  }
  if (!applied.length) return { day, applied };
  const targets = applied.map((name) => DAY_FIELD_MAP[name]).filter(Boolean);
  if (byCurator) {
    next._curatorEdits = markCuratorEdits(next, targets, nowMs);
  } else {
    // Клиент назвал значение сам — старую метку надо именно погасить, а не
    // просто не ставить новую: иначе поле, однажды вписанное куратором,
    // осталось бы помеченным навсегда, и повтор того же числа не закрыл бы
    // шаг чек-ина. Так же поступает сам шаг в приложении (clearCuratorMarks).
    const cleared = clearCuratorEdits(next, targets, nowMs);
    if (cleared !== undefined) next._curatorEdits = cleared;
  }
  return { day: touch(next, nowMs, clientId), applied };
}

/**
 * Типы холодового воздействия — тот же список, что в шаге чек-ина приложения
 * (apps/web/heys_steps_v1.js, COLD_TYPES). Здесь не импортируется: клиентский
 * бандл и облачная функция — разные пакеты, дублирование меньше зла, чем связь
 * между ними. Разойдутся — заметно по отказу инструмента на новом значении.
 */
const COLD_EXPOSURE_TYPES = new Set(['none', 'coldShower', 'coldBath', 'coldSwim']);

/**
 * Причины загрузочного дня — тот же каталог, что apps/web/heys_refeed_v1.js (REFEED_REASONS).
 * MCP не импортирует клиентский бандл; расхождение списка ловится отказом инструмента.
 */
const REFEED_REASONS = new Set(['deficit', 'training', 'holiday', 'rest']);

/**
 * Нужен ли шаг refeed в чек-ине — зеркалит shouldIncludeRefeedStep в
 * apps/web/heys_morning_checkin_v1.js. Рекомендация по caloric debt здесь не
 * считается: без полного движка долга MCP не знает needsRefeed, остаётся
 * allowManualRefeed из профиля.
 */
function shouldIncludeRefeedStep(day, profile) {
  if (typeof day.isRefeedDay === 'boolean') return false;
  return Boolean(profile && profile.allowManualRefeed === true);
}

/** Загрузочный день (refeed): isRefeedDay + refeedReason на карточке дня. */
function applyRefeedDay(day, isRefeedDay, refeedReason, { nowMs, clientId } = {}) {
  if (isRefeedDay === true) {
    const reason = refeedReason ? String(refeedReason) : '';
    if (!REFEED_REASONS.has(reason)) throw new Error(`invalid_refeed_reason:${reason}`);
    const next = { ...day, isRefeedDay: true, refeedReason: reason };
    return touch(next, nowMs, clientId);
  }
  if (isRefeedDay === false) {
    const next = { ...day, isRefeedDay: false, refeedReason: null };
    return touch(next, nowMs, clientId);
  }
  throw new Error('invalid_refeed_day');
}

/** Записать холодовое воздействие — форма объекта та же, что пишет сам шаг приложения. */
function applyColdExposure(day, type, { nowMs, clientId } = {}) {
  if (!COLD_EXPOSURE_TYPES.has(type)) {
    throw new Error(`invalid_cold_type:${type}`);
  }
  const time = nowParts(nowMs).time;
  const next = {
    ...day,
    coldExposure: type === 'none'
      ? { type: 'none', time: null, answeredAt: nowMs }
      : { type, time, answeredAt: nowMs },
  };
  return touch(next, nowMs, clientId);
}

/** Замеры тела — форма объекта та же, что пишет шаг приложения (measurements). */
function applyMeasurements(day, values, { nowMs, clientId } = {}) {
  const pick = (v) => (v === undefined || v === null || v === '') ? null : Number(v);
  const measurements = {
    waist: pick(values.waist), hips: pick(values.hips),
    thigh: pick(values.thigh), biceps: pick(values.biceps),
    measuredAt: day.date,
  };
  const hasAny = ['waist', 'hips', 'thigh', 'biceps'].some((k) => measurements[k] !== null && Number.isFinite(measurements[k]));
  if (!hasAny) throw new Error('empty_measurements');
  return touch({ ...day, measurements }, nowMs, clientId);
}

/**
 * Каталог добавок — те же id, что в apps/web/heys_supplements_v1.js
 * (SUPPLEMENTS_CATALOG). Дублируется по той же причине, что COLD_EXPOSURE_TYPES:
 * клиентский бандл и облачная функция не делят код. `custom_*` больше не принимаются.
 */
const SUPPLEMENT_IDS = new Set([
  'vitD', 'vitC', 'zinc', 'selenium', 'omega3', 'magnesium', 'b12', 'b6', 'lecithin',
  'calcium', 'k2', 'collagen', 'glucosamine', 'creatine', 'bcaa', 'protein', 'biotin',
  'vitE', 'hyaluronic', 'iron', 'folic', 'melatonin', 'glycine', 'ltheanine', 'coq10',
  'berberine', 'cinnamon', 'chromium', 'vinegar', 'flaxOil', 'oliveOil', 'fishOil',
]);

/** Дефолтный timing из apps/web/heys_supplements_v1.js SUPPLEMENTS_CATALOG. */
const SUPPLEMENT_CATALOG_TIMING = {
  vitD: 'withFat', vitC: 'anytime', zinc: 'withFood', selenium: 'withFood',
  omega3: 'withFood', magnesium: 'evening', b12: 'morning', b6: 'morning', lecithin: 'withFood',
  calcium: 'withFood', k2: 'withFat', collagen: 'anytime', glucosamine: 'withFood',
  creatine: 'anytime', bcaa: 'anytime', protein: 'anytime',
  biotin: 'withFood', vitE: 'withFat', hyaluronic: 'anytime',
  iron: 'empty', folic: 'morning',
  melatonin: 'beforeBed', glycine: 'beforeBed', ltheanine: 'evening',
  coq10: 'withFat',
  berberine: 'beforeMeal', cinnamon: 'withFood', chromium: 'withFood', vinegar: 'withFood',
  flaxOil: 'withFood', oliveOil: 'withFood', fishOil: 'withFood',
};

function isValidSupplementId(id) {
  return SUPPLEMENT_IDS.has(id);
}

function validateSupplementIds(ids) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  const bad = list.filter((id) => !isValidSupplementId(id));
  if (bad.length) throw new Error(`unknown_supplement:${bad.join(',')}`);
  return list;
}

function normalizeSupplementList(ids) {
  return validateSupplementIds(ids);
}

function plannedSupplementsEqual(next, prev) {
  const a = normalizeSupplementList(next || []);
  const b = normalizeSupplementList(prev || []);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function getSupplementTiming(suppId, profile) {
  const settings = profile && profile.supplementSettings && profile.supplementSettings[suppId];
  if (settings && settings.timing) return settings.timing;
  return SUPPLEMENT_CATALOG_TIMING[suppId] || 'anytime';
}

function isMorningSupplementTiming(timing) {
  return timing === 'morning' || timing === 'empty';
}

function isEveningSupplementTiming(timing) {
  return timing === 'evening' || timing === 'beforeBed';
}

function filterSupplementsByTimingSlot(ids, slot, profile) {
  if (slot !== 'morning' && slot !== 'evening') throw new Error(`invalid_supplement_timing:${slot}`);
  const list = normalizeSupplementList(ids);
  return list.filter((id) => {
    const timing = getSupplementTiming(id, profile);
    return slot === 'morning' ? isMorningSupplementTiming(timing) : isEveningSupplementTiming(timing);
  });
}

/** Добавки на день — id из каталога (custom_* отключены). */
function applySupplements(day, ids, { nowMs, clientId } = {}) {
  const list = normalizeSupplementList(ids);
  const mutationAt = Math.max(nowMs, (Number(day.supplementsPlannedUpdatedAt) || 0) + 1);
  return touch({ ...day, supplementsPlanned: list, supplementsPlannedUpdatedAt: mutationAt }, mutationAt, clientId);
}

/**
 * План на день: set целиком, либо add/remove без затрагивания остальных.
 * Зеркалит savePlannedSupplements на уровне списка supplementsPlanned.
 */
function patchSupplementsPlanned(day, patch, { nowMs, clientId } = {}) {
  let list;
  if (patch.set !== undefined && patch.set !== null) {
    list = normalizeSupplementList(patch.set);
  } else {
    const base = Array.isArray(day.supplementsPlanned) ? [...day.supplementsPlanned] : [];
    if (patch.remove) {
      const remove = new Set(normalizeSupplementList(patch.remove));
      list = base.filter((id) => !remove.has(id));
    } else {
      list = [...base];
    }
    if (patch.add) {
      for (const id of normalizeSupplementList(patch.add)) {
        if (!list.includes(id)) list.push(id);
      }
    }
    list = normalizeSupplementList(list);
  }
  if (plannedSupplementsEqual(list, day.supplementsPlanned)) return day;
  const mutationAt = Math.max(nowMs, (Number(day.supplementsPlannedUpdatedAt) || 0) + 1);
  return touch({ ...day, supplementsPlanned: list, supplementsPlannedUpdatedAt: mutationAt }, mutationAt, clientId);
}

/**
 * Курс в профиле (plannedSupplements). Не трогает day — синхронизация дня отдельно.
 */
function applyPlannedSupplementsToProfile(profile, args, nowMs) {
  const base = (profile && typeof profile === 'object' && !Array.isArray(profile)) ? { ...profile } : {};
  const current = normalizeSupplementList(base.plannedSupplements || []);
  let next;
  if (args.planned_supplements !== undefined && args.planned_supplements !== null) {
    next = normalizeSupplementList(args.planned_supplements);
  } else {
    next = [...current];
    if (args.planned_supplements_remove) {
      const remove = new Set(normalizeSupplementList(args.planned_supplements_remove));
      next = next.filter((id) => !remove.has(id));
    }
    if (args.planned_supplements_add) {
      for (const id of normalizeSupplementList(args.planned_supplements_add)) {
        if (!next.includes(id)) next.push(id);
      }
    }
    next = normalizeSupplementList(next);
  }
  if (plannedSupplementsEqual(next, current)) {
    return { value: profile, changed: [], planned: current };
  }
  base.plannedSupplements = next;
  base.updatedAt = nowMs;
  const changed = [`курс добавок: ${current.join(',') || '—'} → ${next.join(',')}`];
  return { value: base, changed, planned: next };
}

/**
 * Отметить/снять принятые добавки — зеркалит markSupplementsTaken в приложении.
 */
function markSupplementsTaken(day, suppIds, taken, { nowMs, clientId, profile } = {}) {
  const ids = validateSupplementIds(suppIds);
  if (!ids.length) throw new Error('empty_supplements');
  const next = { ...day };
  if (!Array.isArray(next.supplementsTaken)) next.supplementsTaken = [];
  if (!next.supplementsTakenAt || typeof next.supplementsTakenAt !== 'object') next.supplementsTakenAt = {};
  if (!next.supplementsTakenMeta || typeof next.supplementsTakenMeta !== 'object') next.supplementsTakenMeta = {};
  const timeStr = nowParts(nowMs).time;

  for (const id of ids) {
    if (taken) {
      if (!next.supplementsTaken.includes(id)) next.supplementsTaken.push(id);
      next.supplementsTakenAt[id] = timeStr;
      const setting = profile && profile.supplementSettings && profile.supplementSettings[id];
      if (setting && (setting.form || setting.dose || setting.unit)) {
        next.supplementsTakenMeta[id] = {
          form: setting.form,
          dose: setting.dose,
          unit: setting.unit,
        };
      }
    } else {
      next.supplementsTaken = next.supplementsTaken.filter((x) => x !== id);
      delete next.supplementsTakenAt[id];
      delete next.supplementsTakenMeta[id];
    }
  }

  const mutationAt = Math.max(nowMs, (Number(next.supplementsTakenUpdatedAt) || 0) + 1);
  next.supplementsTakenUpdatedAt = mutationAt;
  return touch(next, mutationAt, clientId);
}

const CYCLE_WINDOW_DAYS = 7;

/**
 * Даты недельного окна цикла вокруг дня `dayNumber` (1–7), считая от `anchorDate`.
 * Та же арифметика, что HEYS.Cycle.setCycleDaysAuto/clearCycleDays в приложении:
 * окно фиксировано в семь дней и якорится на введённый номер дня, поэтому часть
 * дат уходит в прошлое, часть — в будущее относительно anchorDate.
 */
function cycleWindowDates(anchorDate, dayNumber) {
  const out = [];
  for (let d = 1; d <= CYCLE_WINDOW_DAYS; d += 1) {
    out.push({ day: d, date: addDays(anchorDate, d - dayNumber) });
  }
  return out;
}

/** Записать номер дня цикла в один день окна — вызывается по кругу для всех семи дат. */
function applyCycleDay(day, dayNumber, { nowMs, clientId } = {}) {
  const mutationAt = Math.max(nowMs, (Number(day.cycleUpdatedAt) || 0) + 1);
  return touch({ ...day, cycleDay: dayNumber, cycleStatus: null, cycleAnsweredAt: mutationAt, cycleUpdatedAt: mutationAt }, mutationAt, clientId);
}

/**
 * Снять номер цикла с одного дня окна — вызывается по кругу для соседних дат
 * при отмене. Статус здесь не трогаем: и в приложении (clearCycleDays) статус
 * ставится только на тот день, с которого явно ответили «нет цикла», а не на
 * весь снятый диапазон — иначе шесть соседних дней тоже осели бы как «нет
 * цикла», хотя вопрос про них никто не задавал.
 */
function clearCycleDay(day, { nowMs, clientId } = {}) {
  const mutationAt = Math.max(nowMs, (Number(day.cycleUpdatedAt) || 0) + 1);
  return touch({ ...day, cycleDay: null, cycleUpdatedAt: mutationAt }, mutationAt, clientId);
}

/** Явный ответ «нет цикла сегодня / пропустил» — только для дня, за который отвечают. */
function setCycleStatus(day, status, { nowMs, clientId } = {}) {
  const mutationAt = Math.max(nowMs, (Number(day.cycleUpdatedAt) || 0) + 1);
  return touch({ ...day, cycleDay: null, cycleStatus: status, cycleAnsweredAt: mutationAt, cycleUpdatedAt: mutationAt }, mutationAt, clientId);
}

/**
 * Тот же вопрос, что hasCycleDecision в apps/web/heys_steps_v1.js: нужен ли
 * вообще ответ про цикл сегодня. Не нужен, если трекинг выключен в профиле
 * (гейт по полу и флагу — та же граница, что защищает от переноса цикла на
 * профиль, где он не включён), либо ответ уже есть — либо номер дня, либо
 * явное «нет цикла / пропустил».
 */
function hasCycleDecision(day, profile) {
  // Same gate as apps/web morning check-in / steps: only when profile has cycle on.
  if (!profile || profile.gender !== 'Женский' || profile.cycleTrackingEnabled !== true) return true;
  const cycleDay = Number(day && day.cycleDay);
  if (Number.isFinite(cycleDay) && cycleDay >= 1 && cycleDay <= 7) return true;
  const answeredAt = Number(day && day.cycleAnsweredAt);
  return (day && (day.cycleStatus === 'none' || day.cycleStatus === 'skipped')) && Number.isFinite(answeredAt) && answeredAt > 0;
}

/**
 * Шаги утреннего чек-ина — какие из них реально закрывают гейт в приложении.
 *
 * Мостит два разных источника правды намеренно: обязательные поля дня решает
 * `curatorAuthoredFields` (та же функция, что кормит `heys_get_day.curator_authored`
 * и app-side `isCuratorAuthored`), а `stepsGoal` живёт в профиле и авторства
 * не знает вовсе — `hasStepsGoal` в приложении смотрит только на число.
 * Список шагов и условие «пройден» зеркалят apps/web/heys_morning_checkin_v1.js
 * (MORNING_CORE_STEPS, hasCheckinWeight/hasSleepTime/hasSleepQuality/
 * hasMorningMood/hasStepsGoal) — если приложение поменяет условие, эта копия
 * должна поменяться вместе с ним, отдельного стража на неё сейчас нет.
 */
function checkinStatus(day, profile) {
  const authored = new Set(curatorAuthoredFields(day));
  const hasNum = (v) => Number.isFinite(Number(v)) && Number(v) > 0;
  const steps = [
    {
      id: 'weight', label: 'вес', required: true,
      done: hasNum(day.weightMorning),
      curatorAuthored: authored.has('weightMorning'),
      value: day.weightMorning ?? null,
    },
    {
      id: 'sleep', label: 'сон', required: true,
      done: Boolean(day.sleepStart) && Boolean(day.sleepEnd),
      curatorAuthored: authored.has('sleepStart') || authored.has('sleepEnd'),
      value: (day.sleepStart || day.sleepEnd) ? { start: day.sleepStart || null, end: day.sleepEnd || null } : null,
    },
    {
      id: 'sleep_quality', label: 'качество сна', required: true,
      done: hasNum(day.sleepQuality),
      curatorAuthored: authored.has('sleepQuality'),
      value: day.sleepQuality ?? null,
    },
    {
      id: 'mood', label: 'самочувствие', required: true,
      done: hasNum(day.moodMorning),
      curatorAuthored: authored.has('moodMorning'),
      value: day.moodMorning ?? null,
    },
    {
      id: 'steps_goal', label: 'цель по шагам', required: true,
      done: hasNum(profile && profile.stepsGoal),
      value: (profile && profile.stepsGoal) ?? null,
      note: 'поле профиля — пишется heys_update_profile(steps_goal), не heys_checkin',
    },
    {
      id: 'refeed_day', label: 'загрузочный день', required: false,
      done: typeof day.isRefeedDay === 'boolean' || !shouldIncludeRefeedStep(day, profile),
      value: typeof day.isRefeedDay === 'boolean'
        ? { is_refeed_day: day.isRefeedDay, refeed_reason: day.refeedReason ?? null }
        : null,
      note: shouldIncludeRefeedStep(day, profile)
        ? undefined
        : 'ручный refeed выключен в профиле (allowManualRefeed) — шаг в приложении не показывается',
    },
    {
      id: 'cold_exposure', label: 'холод', required: false,
      done: Boolean(day.coldExposure && day.coldExposure.type),
      value: day.coldExposure || null,
    },
    {
      id: 'measurements', label: 'замеры тела', required: false,
      done: Boolean(day.measurements && ['waist', 'hips', 'thigh', 'biceps'].some((k) => hasNum(day.measurements[k]))),
      value: day.measurements || null,
      note: (profile && profile.measurementsTrackingEnabled === true)
        ? undefined
        : 'трекинг замеров выключен в профиле — шаг в приложении не показывается',
    },
    {
      id: 'supplements', label: 'добавки', required: false,
      done: Array.isArray(day.supplementsPlanned),
      value: day.supplementsPlanned || null,
      note: (profile && profile.supplementsTrackingEnabled === true)
        ? undefined
        : 'трекинг добавок выключен в профиле — шаг в приложении не показывается',
    },
    {
      id: 'cycle', label: 'цикл', required: false,
      done: hasCycleDecision(day, profile),
      value: { cycleDay: day.cycleDay ?? null, cycleStatus: day.cycleStatus ?? null },
      note: (profile && profile.gender === 'Женский' && profile.cycleTrackingEnabled === true)
        ? undefined
        : 'трекинг цикла выключен в профиле — шаг в приложении не показывается',
    },
  ];
  const required = steps.filter((s) => s.required);
  const doneCount = required.filter((s) => s.done).length;
  const status = doneCount === 0 ? 'not_started' : doneCount === required.length ? 'done' : 'partial';
  return { date: day.date, status, steps };
}

/**
 * Норма дня: сколько клиенту положено съесть — калории и БЖУ в граммах.
 *
 * Без неё картина дня после записи бесполезна: «1400 ккал» ничего не значит,
 * пока не видно, что норма 1900.
 *
 * Три источника, строго в этом порядке.
 *
 * 1. `savedDisplayOptimum` из блоба дня (`source: 'client_saved'`) — ровно то
 *    число, которое клиент видел в шапке дневника. Пишет его приложение
 *    (apps/web/heys_day_caloric_display_state.js), и оно уже учитывает поправку
 *    на накопленный недобор и рефид. Пересчитать эту поправку здесь нельзя: она
 *    считается из истории за неделю в ~1900 строках
 *    apps/web/heys_day_caloric_balance_v1.js.
 *
 *    Но это КЭШ ОТРИСОВКИ, а не норма, и брать его безусловно нельзя. Пишет его
 *    только браузер и только пока клиент держит день открытым; записи куратора
 *    через коннектор его не трогают. Он замерзает на моменте последнего
 *    просмотра, пока шаги, тренировки и вес продолжают меняться — 07.08.2026
 *    коннектор отдал 1282 ккал там, где в приложении стояло 2209, потому что
 *    клиент смотрел день утром, а 13 320 шагов и 79 минут тренировки приехали
 *    позже. Ошибка не косметическая: норма — знаменатель всего, и знака у неё
 *    нет (после рефида кэш наоборот завышен).
 *
 *    Поэтому кэш отдаётся как есть только если `savedOptimumMeta` подтверждает,
 *    что с момента его записи ничего влияющего на норму не изменилось. Иначе
 *    (`source: 'recomputed'`) база считается заново, а из кэша переиспользуется
 *    только серверно-невычислимая поправка. Блоб без меты — `client_saved_unverified`.
 * 2. Базовый `optimum` по TDEE (`source: 'estimate'`) — когда поля нет. Это
 *    частый случай: приложение пишет его, только если клиент сам открывал день,
 *    а дни, заполненные куратором, остаются без него. Считается зеркалом
 *    apps/web/heys_tdee_v1.js, поэтому формула — не наша копипаста. Не учтены
 *    поправка на недобор и надбавка за вчерашнюю тренировку (NDTE): последняя
 *    живёт в apps/web/heys_iw_constants.js и опирается на локальные часы
 *    браузера, серверу их взять негде. Отсюда пометка «оценка».
 * 3. Ничего (`source: null`) — когда в профиле нет веса, роста, возраста или
 *    пола. Дефолты приложения (70 кг / 30 лет / 170 см / мужской) здесь не
 *    повторяем намеренно: подсунуть куратору чужую норму хуже, чем не дать
 *    никакой.
 *
 * Проценты БЖУ → граммы считает то же зеркало
 * (apps/web/heys_day_calculations.js), включая вывод жиров остатком
 * `100 − углеводы% − белок%`. Отдельный случай — пустой `heys_norms`: там все
 * нули, и формула честно отдаёт «жиры = 100% калорий». Это вырожденное
 * состояние, а не норма, поэтому граммы в таком случае не отдаём вовсе.
 */
const NORM_REASONS = {
  no_inputs: 'нет доступа к профилю и нормам клиента',
  no_profile: 'профиль клиента не заполнен',
  profile_incomplete: 'в профиле клиента не хватает веса, роста, возраста или пола',
  no_norms: 'в карточке клиента не заданы проценты белка и углеводов',
};

/**
 * Собственный оптимум дня: база по TDEE плюс надбавка за тренировку накануне.
 *
 * Нужен и для запрошенного дня, и для каждого дня в окне долга — расчёт долга
 * сравнивает съеденное именно с базовой нормой дня, а не с тем, что клиент
 * тогда видел на экране (в экранном числе уже сидит долг, и он бы удвоился).
 */
function dayOptimum(dayBlob, inputs, prevBlob) {
  const parts = estimateOptimum(dayBlob, inputs.profile, inputs.hrZones);
  if (parts.kcal <= 0) return { kcal: 0, ndte: 0, parts };
  const ndte = serverNdteBoost(prevBlob, inputs.profile, parts.bmr, { date: dayBlob && dayBlob.date });
  return { kcal: optimumWithNdte(parts, ndte), ndte, parts };
}

/**
 * Окно прошлых дней для расчёта долга — в той форме, которую ждёт зеркальное
 * ядро (`sparklineData` в приложении).
 *
 * Ядро само отсеет сегодняшний день, будущее и дни с неполными данными; наша
 * задача — отдать честные `kcal` и `baseTarget` по каждому дню. Окно ядра —
 * три дня до запрошенного, поэтому блоб за четвёртый день назад тоже нужен: он
 * даёт надбавку самому раннему дню окна.
 */
function buildDebtWindow(date, inputs) {
  const blobs = (inputs && inputs.pastBlobs) || null;
  if (!blobs) return [];
  const out = [];
  for (let back = 3; back >= 1; back -= 1) {
    const d = addDays(date, -back);
    const blob = blobs[d];
    if (!blob || typeof blob !== 'object') continue;
    const own = dayOptimum(blob, inputs, blobs[addDays(date, -back - 1)] || null);
    if (own.kcal <= 0) continue;
    out.push({
      date: d,
      kcal: macroTotals(blob.meals).kcal,
      baseTarget: own.kcal,
      target: own.kcal,
      isRefeedDay: blob.isRefeedDay === true,
      isFastingDay: blob.isFastingDay === true,
      isIncomplete: blob.isIncomplete === true,
      hasTraining: own.parts.trainingsKcal > 0,
      trainingKcal: own.parts.trainingsKcal,
      isToday: false,
      isFuture: false,
    });
  }
  return out;
}

/**
 * Что именно изменилось в дне с момента записи кэша — человеческим языком.
 *
 * Только для объяснения в `note`: решение о свежести принимается по сравнению
 * пересчитанного оптимума с сохранённым, а не по этому списку. Поэтому пустая
 * строка здесь — не «ничего не изменилось», а «изменилось что-то помимо
 * активности» (профиль, зоны пульса, дефицит), и текст для этого случая свой.
 */
function activityDrift(meta, day) {
  // Назначенное куратором в дрейф не входит: план не «доехал в день», а лишь
  // ждёт выполнения, и сравнивать его с активностью на момент записи кэша
  // нельзя — иначе назначение выглядело бы как проведённая тренировка.
  const trainingMin = ((day && day.trainings) || [])
    .filter((t) => !isNotPerformedTraining(t))
    .reduce((sum, t) => sum + (((t && t.z) || []).reduce((a, m) => a + (Number(m) || 0), 0)), 0);
  const householdMin = ((day && day.householdActivities)
    || (day && Number(day.householdMin) > 0 ? [{ minutes: day.householdMin }] : []))
    .reduce((sum, h) => sum + (Number(h && h.minutes) || 0), 0);

  const parts = [];
  const cmp = (label, was, now, unit, eps) => {
    if (Math.abs(was - now) > eps) parts.push(`${label} ${was}${unit} → ${now}${unit}`);
  };
  cmp('шаги', Number(meta.steps) || 0, Number(day && day.steps) || 0, '', 50);
  cmp('тренировка', Number(meta.trainingMin) || 0, trainingMin, ' мин', 0);
  cmp('быт', Number(meta.householdMin) || 0, householdMin, ' мин', 0);
  cmp('вес', Number(meta.weight) || 0, Number(day && day.weightMorning) || 0, ' кг', 0.05);
  return parts.length ? `в день доехало: ${parts.join(', ')}` : '';
}

function normMacros(kcal, norms, ctx = {}) {
  const n = (norms && typeof norms === 'object' && !Array.isArray(norms)) ? norms : {};
  const proteinPct = Number(n.proteinPct) || 0;
  const carbsPct = Number(n.carbsPct) || 0;
  // Оба нуля — это не «норма 0 г белка», а незаполненный ключ: computeDailyNorms
  // на нём выдаст жиры = 100% калорий.
  if (proteinPct <= 0 && carbsPct <= 0) {
    return { protein_g: null, carbs_g: null, fat_g: null, macros_reason: 'no_norms' };
  }
  const abs = webMirror.computeDailyNorms(kcal, n, {
    profile: ctx.profile,
    day: ctx.day,
    tdeeResult: ctx.tdeeResult,
  });
  return {
    protein_g: Math.round(abs.prot * 10) / 10,
    carbs_g: Math.round(abs.carbs * 10) / 10,
    fat_g: Math.round(abs.fat * 10) / 10,
    macros_reason: null,
  };
}

/**
 * Надбавка за вчерашнюю тренировку (NDTE) — та часть базы, которую сервер
 * раньше не считал вовсе.
 *
 * Зеркальный `getPreviousDayTrainings` здесь намеренно не зовётся: он ищет
 * вчерашний день через `lsGet`. Вчерашний блоб приходит из облака, окно
 * затухания — HEYS-сутки запрошенного `date` (`{ date }`), не `nowMs`.
 * Сам расчёт (`calculateNDTEDayAverage`) — чистая функция из зеркала.
 *
 * @param {object|null} prevDay блоб за `date − 1`
 * @param {object} profile профиль клиента (нужен рост для BMI)
 * @param {number} bmr из того же расчёта TDEE, что и база
 * @param {object} [opts]
 * @param {string} [opts.date] календарная дата нормы (YYYY-MM-DD)
 */
function serverNdteBoost(prevDay, profile, bmr, opts) {
  const options = (opts && typeof opts === 'object') ? opts : {};
  const date = options.date;
  const iw = webMirror.insulinWaveInternals();
  // Назначенное куратором отсеивается до расчёта, а не только по калориям:
  // дальше от массива берутся ещё длина (множитель за две тренировки) и тип
  // якоря. Невыполненный вчерашний план не должен ни поднимать буст,
  // ни выдавать себя за силовую, если сам человек делал кардио.
  const allTrainings = (prevDay && Array.isArray(prevDay.trainings)) ? prevDay.trainings : [];
  const trainings = allTrainings.filter((t) => !isNotPerformedTraining(t));
  if (!iw || !trainings.length || !bmr) return 0;
  if (typeof iw.calculateNDTEDayAverage !== 'function') return 0;

  const volW = Number(profile && profile.weight)
    || Number(prevDay && prevDay.weightMorning)
    || 70;
  let totalKcal = 0;
  for (const t of trainings) {
    totalKcal += iw.utils.calculateTrainingKcal(t, volW);
  }
  // 300, а не 200: `calculateNDTE` ниже 300 всё равно возвращает нулевой буст
  // (порог поднят в v4.3). Прежние 200 создавали коридор 200–299, где внешний
  // гейт пропускал, а внутренний молча обнулял.
  if (totalKcal < 300) return 0;

  const pick = typeof iw.pickNdteAnchorTraining === 'function'
    ? iw.pickNdteAnchorTraining(trainings)
    : null;
  const prevDate = (prevDay && prevDay.date) || (date ? addDays(date, -1) : null);
  const height = (Number(profile && profile.height) || 170) / 100;
  const weight = Number(profile && profile.weight) || Number(prevDay && prevDay.weightMorning) || 0;
  const bmi = weight && height ? Math.round(weight / (height * height) * 10) / 10 : 22;
  const ndte = iw.calculateNDTEDayAverage({
    trainingKcal: totalKcal,
    bmi,
    trainingType: (pick && pick.type) || (trainings[0] && trainings[0].type) || 'cardio',
    trainingsCount: trainings.length,
    dayDate: date,
    prevDate,
    trainingTime: pick && pick.time,
  });
  return Math.round(bmr * ((ndte && ndte.tdeeBoost) || 0));
}

/** Базовый оптимум по зеркалу TDEE — или причина, по которой его не посчитать. */
function estimateOptimum(day, profile, hrZones) {
  const p = (profile && typeof profile === 'object' && !Array.isArray(profile)) ? profile : null;
  if (!p) return { kcal: 0, reason: 'no_profile' };

  const weight = Number(day && day.weightMorning) || Number(p.weight) || 0;
  const height = Number(p.height) || 0;
  // Дата рождения важнее сохранённого `age`: поле протухает молча. У Полтавского
  // в блобе лежало `age: 30` при дате рождения 1988 года — BMR считался как для
  // тридцатилетнего, +40 ккал каждый день (2026-08-08).
  const age = ageFromBirthDate(p.birthDate, Date.now()) || Number(p.age) || 0;
  const gender = GENDERS.includes(p.gender) ? p.gender : null;
  if (!weight || !height || !age || !gender) return { kcal: 0, reason: 'profile_incomplete' };

  const result = webMirror.calculateTDEE(
    day || {},
    { weight, height, age, gender, deficitPctTarget: Number(p.deficitPctTarget) || 0 },
    {
      hrZones: Array.isArray(hrZones) ? hrZones : [],
      // NDTE и localStorage приложения серверу недоступны — гасим оба пути явно,
      // чтобы расчёт не зависел от того, что окажется в песочнице.
      includeNDTE: false,
      lsGet: () => null,
    },
  );
  const kcal = Number(result && result.optimum) || 0;
  if (kcal <= 0) return { kcal: 0, reason: 'profile_incomplete' };
  return {
    kcal,
    reason: null,
    // Слагаемые нужны, чтобы долить NDTE: `calculateTDEE` зовётся с
    // `includeNDTE: false`, а надбавка считается отдельно (`serverNdteBoost`).
    bmr: Number(result.bmr) || 0,
    trainingsKcal: Number(result.trainingsKcal) || 0,
    // Слагаемые активности — чтобы ответ инструмента мог показать, из чего
    // выросла норма. Без них «день малоподвижный» пишется вслепую: цифра нормы
    // одна и та же и при 5 часах быта, и при нуле (incident 2026-08-22).
    stepsKcal: Number(result.stepsKcal) || 0,
    householdKcal: Number(result.householdKcal) || 0,
    baseExpenditure: Number(result.baseExpenditure) || 0,
    deficitPct: Number(result.deficitPct) || 0,
    cycleMultiplier: Number(result.cycleMultiplier) || 1,
  };
}

/**
 * Тот же `optimum`, но с возвращённой в базу надбавкой за вчерашнюю тренировку.
 *
 * Единственная часть базы, которой у сервера нет: `HEYS.InsulinWave` считает
 * NDTE по локальным часам браузера. Приложение сохраняет уже посчитанное число,
 * и здесь оно доливается в `baseExpenditure` до умножения на дефицит и цикл —
 * порядок операций повторяет apps/web/heys_tdee_v1.js:209-222 (зеркало
 * инъекцию не поддерживает, поэтому две строки формулы продублированы; тест
 * «реконструкция без NDTE совпадает с estimate» держит их в связке).
 */
function optimumWithNdte(parts, ndte) {
  const base = Math.round((Number(parts.baseExpenditure) || 0) + (Number(ndte) || 0));
  return Math.round(Math.round(base * (1 + parts.deficitPct / 100)) * parts.cycleMultiplier);
}

/**
 * Быт в дне одним числом — ровно так, как его читает расчёт: список
 * `householdActivities` перебивает скаляр `householdMin`, и пустой список
 * означает «быта нет» (apps/web/heys_tdee_v1.js:290). Поэтому скаляр отдельно
 * от списка писать нельзя: в дне, где список уже заведён, он не считается.
 */
function householdMinutes(day) {
  const list = day && Array.isArray(day.householdActivities) ? day.householdActivities : null;
  if (list) return list.reduce((sum, h) => sum + Math.max(0, Number(h && h.minutes) || 0), 0);
  return Math.max(0, Number(day && day.householdMin) || 0);
}

/** Быт, записанный в обход поля — тренировкой. Тип свободный, отсюда и слова. */
const HOUSEHOLD_TRAINING_RE = /(быт|уборк|househ|домашние\s+дел)/i;

function isHouseholdTraining(training) {
  if (!training) return false;
  const type = String(training.type || '').trim().toLowerCase();
  if (type === 'household') return true;
  return HOUSEHOLD_TRAINING_RE.test(`${training.type || ''} ${training.activityLabel || ''}`);
}

/**
 * Тренировки, которые на самом деле быт. Нужны обеим сторонам гейта: и чтобы не
 * дать записать те же минуты вторым способом, и чтобы показать их в ответе.
 *
 * Зачем гейт: `calculateTDEE` складывает тренировки и `householdMin`
 * независимо, так что один и тот же быт, записанный обоими способами, попадает
 * в расход дважды. 21.08.2026 пять часов быта стали десятью и подняли норму на
 * 710 ккал — ошибку заметили только по трейсу, из ответов инструментов она не
 * читалась никак.
 */
function householdTrainings(day) {
  return (day && Array.isArray(day.trainings) ? day.trainings : [])
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => isRealTraining(t) && isHouseholdTraining(t))
    .map(({ t, index }) => ({
      index,
      minutes: (Array.isArray(t.z) ? t.z : []).reduce((sum, v) => sum + (Number(v) || 0), 0),
      label: t.activityLabel || t.type || 'быт',
      time: t.time || null,
    }));
}

/**
 * Быт в том же виде, в каком его держит приложение: список активностей плюс
 * производные `householdMin` и `householdTime`
 * (apps/web/heys_day_trainings_v1.js:3392). Пустой список — снятие быта.
 */
function setHouseholdActivities(day, activities, { nowMs = Date.now(), clientId = null } = {}) {
  const list = [];
  for (const raw of Array.isArray(activities) ? activities : []) {
    const minutes = Math.round(Number(raw && raw.minutes));
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('invalid_household_minutes');
    if (minutes > 1440) throw new Error('household_minutes_too_big');
    const entry = { minutes };
    const time = normalizeTime(raw && raw.time);
    if (time) entry.time = time;
    const label = String((raw && raw.label) || '').trim();
    if (label) entry.label = label;
    list.push(entry);
  }
  const total = list.reduce((sum, h) => sum + h.minutes, 0);
  const next = { ...day };
  next.householdActivities = list;
  next.householdMin = total;
  next.householdTime = (list[0] && list[0].time) || '';
  next.householdUpdatedAt = nowMs;
  // Метки авторства быт не носит: householdMin не входит в
  // CHECKIN_AUTHORED_FIELDS и шага чек-ина не закрывает.
  return { day: touch(next, nowMs, clientId), applied: ['household_min'], total_minutes: total };
}

/**
 * Из чего сложилась активность дня. Печатается в каждом ответе про день: без
 * неё норма — одно число, по которому не видно, отмечено в дне хоть что-то или
 * там пусто, и «день малоподвижный» пишется не глядя.
 */
function activityParts(day, fresh) {
  const real = (day && Array.isArray(day.trainings) ? day.trainings : []).filter(isRealTraining);
  const trainingsMin = real.reduce(
    (sum, t) => sum + (Array.isArray(t.z) ? t.z : []).reduce((a, b) => a + (Number(b) || 0), 0),
    0,
  );
  const asTraining = householdTrainings(day);
  return {
    steps: Math.max(0, Number(day && day.steps) || 0),
    steps_kcal: Math.round(Number(fresh && fresh.stepsKcal) || 0),
    household_min: householdMinutes(day),
    household_kcal: Math.round(Number(fresh && fresh.householdKcal) || 0),
    trainings_min: trainingsMin,
    trainings_kcal: Math.round(Number(fresh && fresh.trainingsKcal) || 0),
    // Отдельной строкой: эти минуты уже сидят в trainings_*, но по смыслу это быт.
    household_as_training_min: asTraining.reduce((sum, h) => sum + h.minutes, 0),
    total_kcal: Math.round(
      (Number(fresh && fresh.stepsKcal) || 0)
      + (Number(fresh && fresh.householdKcal) || 0)
      + (Number(fresh && fresh.trainingsKcal) || 0),
    ),
  };
}

function dailyNorm(day, inputs) {
  const has = inputs && typeof inputs === 'object';
  const eaten = macroTotals(day && day.meals);
  const empty = {
    source: null,
    kcal: null,
    parts: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    left: null,
    // Активность известна даже когда нормы нет: она берётся из самого дня, а не
    // из профиля. Отсутствие нормы — не повод судить о дне вслепую.
    activity: activityParts(day, null),
  };

  if (!has) return { ...empty, reason: 'no_inputs', note: `Норма не рассчитана: ${NORM_REASONS.no_inputs}.` };

  // `savedDisplayOptimum` больше не источник числа — только то, что клиент
  // последний раз видел на экране. Сравнение с ним остаётся в ответе, потому
  // что расхождение стоит замечать сразу, а не через месяц.
  const clientSaw = Number(day && day.savedDisplayOptimum) || 0;
  const meta = (day && day.savedOptimumMeta && typeof day.savedOptimumMeta === 'object')
    ? day.savedOptimumMeta
    : null;

  const resolved = webMirror.resolveDayNorm(day || {}, inputs.profile, {
    pastBlobs: inputs.pastBlobs,
    prevDay: inputs.prevDay,
    hrZones: inputs.hrZones,
    lsGet: () => null,
  });
  const fresh = resolved && resolved.tdee;

  if (!resolved || !(resolved.kcal > 0)) {
    const reason = (resolved && resolved.reason) || 'profile_incomplete';
    return {
      ...empty,
      reason,
      note: `Норма не рассчитана: ${NORM_REASONS[reason] || reason}.`,
    };
  }

  const kcal = resolved.kcal;
  const source = resolved.source;
  const why = resolved.why;
  const ndte = resolved.ndte;
  const base = resolved.base;
  const correction = resolved.correction;
  const maintenance = resolved.maintenance;
  const deficitPct = resolved.deficit_pct;
  const parts = {
    base,
    maintenance,
    deficit_pct: deficitPct,
    correction,
    ndte,
    window_days: resolved.window_days,
    client_saw: clientSaw || null,
  };

  let note = source === 'computed'
    ? `Норма посчитана сервером по данным дня: ${why}.`
    : `Расчётная оценка: ${why}.`;
  note += deficitPct
    ? ` Целевой ${deficitPct < 0 ? 'дефицит' : 'профицит'} ${Math.abs(deficitPct)}% уже учтён: без него расход дня — ${maintenance} ккал.`
    : ' Целевой дефицит в профиле не задан (0%) — это норма поддержания.';
  // Расхождение с экраном возможно штатно: клиент мог смотреть день раньше.
  // Молчать о нём всё равно нельзя — именно так протухший кэш и прожил незамеченным.
  if (clientSaw > 0 && Math.abs(clientSaw - kcal) > 2) {
    note += ` Клиент последний раз видел ${Math.round(clientSaw)} ккал`;
    const drift = meta ? activityDrift(meta, day) : '';
    note += drift ? ` — с тех пор ${drift}.` : '.';
  }

  const macros = normMacros(kcal, inputs.norms, {
    profile: inputs.profile,
    day,
    tdeeResult: fresh,
  });
  const macrosNote = macros.macros_reason ? ` БЖУ в граммах не считаем: ${NORM_REASONS[macros.macros_reason]}.` : '';

  return {
    source,
    kcal,
    parts,
    activity: activityParts(day, fresh),
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    // Сколько ещё влезает: то же вычитание, что куратор делает в уме.
    left: {
      kcal: kcal - eaten.kcal,
      protein: macros.protein_g === null ? null : Math.round((macros.protein_g - eaten.protein) * 10) / 10,
      carbs: macros.carbs_g === null ? null : Math.round((macros.carbs_g - eaten.carbs) * 10) / 10,
      fat: macros.fat_g === null ? null : Math.round((macros.fat_g - eaten.fat) * 10) / 10,
    },
    reason: macros.macros_reason,
    note: `${note}${macrosNote}`,
  };
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
  // isRealTraining, не «есть минуты»: силовая с workout_builder может иметь
  // z=[0,0,0,0] (нагрузка не в пульсовых зонах) и раньше выпадала из сводки
  // целиком — куратор не видел тренировку вовсе, только на глаз по дневнику.
  const trainings = (day.trainings || [])
    // Индекс — позиция в исходном массиве, до фильтра: его передают в
    // heys_update_training, и он должен указывать на ту же тренировку в блобе.
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => isRealTraining(t))
    .map(({ t, index }) => {
      const z = (Array.isArray(t.z) ? t.z : [0, 0, 0, 0]).map(Number);
      const out = { index, zones_minutes: z, total_minutes: z.reduce((a, b) => a + b, 0) };
      if (t.time) out.time = t.time;
      if (t.type) out.type = t.type;
      // Назначенное куратором в дне видно — иначе он не поймёт, что назначил, —
      // но помечено явно, чтобы не читалось как проведённая тренировка. Поле
      // необязательное, как time/type: у обычной записи `plan` нет вовсе.
      if (t.plan && t.plan.status) out.plan_status = String(t.plan.status);
      if (t.plan && t.plan.movedFrom) out.moved_from = String(t.plan.movedFrom);
      if (t.plan && t.plan.movedTo) out.moved_to = String(t.plan.movedTo);
      if (t.plan && t.plan.movedAt) out.moved_at = Number(t.plan.movedAt);
      if (t.plan && t.plan.transferId) out.transfer_id = String(t.plan.transferId);
      if (t.activityLabel) out.activity_label = t.activityLabel;
      if (t.comment) out.comment = t.comment;
      for (const field of ['mood', 'wellbeing', 'stress']) {
        if (t[field] !== undefined && t[field] !== null && t[field] !== '') out[field] = Number(t[field]);
      }
      return out;
    });

  return {
    date: day.date,
    totals: macroTotals(day.meals),
    meals,
    water_ml: Number(day.waterMl) || 0,
    weight_morning: day.weightMorning ?? null,
    steps: Number(day.steps) || 0,
    household_min: householdMinutes(day),
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
    supplements_planned: Array.isArray(day.supplementsPlanned) ? day.supplementsPlanned : [],
    supplements_taken: Array.isArray(day.supplementsTaken) ? day.supplementsTaken : [],
    is_refeed_day: day.isRefeedDay === true,
    refeed_reason: day.isRefeedDay === true ? (day.refeedReason || null) : null,
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
  // Назначенное куратором минут не даёт: у плана зоны могут быть уже
  // проставлены, и без отсева сводка «за неделю N минут тренировок» раздувалась
  // бы назначением, которое клиент ещё не выполнял.
  const trainingMinutes = (day.trainings || []).reduce((sum, t) => {
    if (isNotPerformedTraining(t)) return sum;
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
    household_min: householdMinutes(day),
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

/**
 * Назначенная куратором, но ещё не выполненная тренировка.
 *
 * Условие не повторяется здесь, а берётся из ядра через фасад зеркала: второй
 * экземпляр «есть `plan` и статус `assigned`» разошёлся бы с ядром молча — и
 * заметили бы это по расхождению чисел у клиента и куратора, а не по ошибке.
 *
 * Отсев идёт только там, где считается ФАКТ (минуты за период, счётчики
 * сессий). В `isRealTraining` и `summarizeDay` его нет намеренно: куратор
 * обязан видеть назначенное, просто с явным признаком плана.
 */
function isNotPerformedTraining(t) {
  return webMirror.isNotPerformedTraining(t);
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
  MEAL_TYPE_NAMES,
  classifyMeal,
  isAutoMealName,
  mealComposition,
  isDrinkLike,
  isCoffeeBreak,
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
  dailyNorm,
  NORM_REASONS,
  addMeal,
  findMealNearTime,
  mergeItemsIntoMeal,
  duplicatesWholeMeal,
  isSameMealItem,
  MEAL_MERGE_WINDOW_MIN,
  MEAL_ITEMS_LIMIT,
  updateMeal,
  deleteMeal,
  addWater,
  addTraining,
  updateTraining,
  deleteTraining,
  setStrengthWorkout,
  assignTraining,
  editTrainingPlan,
  exercisesToInput,
  proposeTrainingEdit,
  hasMeaningfulLiveTraining,
  moveTrainingOut,
  moveTrainingIn,
  withdrawTrainingProposal,
  buildWorkoutLog,
  isRealTraining,
  isNotPerformedTraining,
  updateDayFields,
  householdMinutes,
  householdTrainings,
  isHouseholdTraining,
  setHouseholdActivities,
  summarizeDay,
  applyColdExposure,
  applyRefeedDay,
  shouldIncludeRefeedStep,
  REFEED_REASONS,
  applyMeasurements,
  applySupplements,
  patchSupplementsPlanned,
  applyPlannedSupplementsToProfile,
  markSupplementsTaken,
  filterSupplementsByTimingSlot,
  normalizeSupplementList,
  validateSupplementIds,
  plannedSupplementsEqual,
  applyCycleDay,
  clearCycleDay,
  setCycleStatus,
  cycleWindowDates,
  hasCycleDecision,
  checkinStatus,
  COLD_EXPOSURE_TYPES,
  SUPPLEMENT_IDS,
  CYCLE_WINDOW_DAYS,
};
