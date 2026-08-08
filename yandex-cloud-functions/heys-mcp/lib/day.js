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

const webMirror = require('./web-mirror');
const { ageFromBirthDate, GENDERS } = require('./profile');

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
  // Поля с собственным штампом в merge (DAY_USER_MUTATION_GROUPS в
  // heys_sync_merge_v1.cjs): без штампа правка коннектора проигрывает облачной
  // версии, даже когда та старее, — и молча откатывается при следующем синке.
  const FIELD_STAMPS = {
    steps: 'stepsUpdatedAt',
    household_min: 'householdUpdatedAt',
    sleep_note: 'sleepNoteUpdatedAt',
    comment: 'dayCommentUpdatedAt',
  };
  for (const [publicName, stamp] of Object.entries(FIELD_STAMPS)) {
    if (applied.includes(publicName)) next[stamp] = nowMs;
  }
  if (!applied.length) return { day, applied };
  const targets = applied.map((name) => DAY_FIELD_MAP[name]);
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
 * клиентский бандл и облачная функция не делят код. `custom_*` — пользовательские
 * записи из приложения, пропускаются без проверки состава.
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
  return SUPPLEMENT_IDS.has(id) || String(id).startsWith('custom_');
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

/** Добавки на день — id из каталога или пользовательские `custom_*`. */
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
    },
    {
      id: 'supplements', label: 'добавки', required: false,
      done: Array.isArray(day.supplementsPlanned),
      value: day.supplementsPlanned || null,
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
  const ndte = serverNdteBoost(prevBlob, inputs.profile, parts.bmr, inputs.nowMs);
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
  const trainingMin = ((day && day.trainings) || []).reduce(
    (sum, t) => sum + (((t && t.z) || []).reduce((a, m) => a + (Number(m) || 0), 0)), 0);
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

function normMacros(kcal, norms) {
  const n = (norms && typeof norms === 'object' && !Array.isArray(norms)) ? norms : {};
  const proteinPct = Number(n.proteinPct) || 0;
  const carbsPct = Number(n.carbsPct) || 0;
  // Оба нуля — это не «норма 0 г белка», а незаполненный ключ: computeDailyNorms
  // на нём выдаст жиры = 100% калорий.
  if (proteinPct <= 0 && carbsPct <= 0) {
    return { protein_g: null, carbs_g: null, fat_g: null, macros_reason: 'no_norms' };
  }
  const abs = webMirror.computeDailyNorms(kcal, n);
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
 * вчерашний день через `lsGet` и берёт `new Date()` процесса. У функции Yandex
 * Cloud это UTC, а у клиента — Москва, и затухание уехало бы на три часа. Входы
 * те же, что в apps/web/heys_iw_constants.js:2883-2915, но вчерашний блоб
 * приходит из облака, а час — из `nowParts`. Сам расчёт (`calculateNDTE`) —
 * чистая функция из зеркала, своей копии формулы здесь нет.
 *
 * @param {object|null} prevDay блоб за `date − 1`
 * @param {object} profile профиль клиента (нужен рост для BMI)
 * @param {number} bmr из того же расчёта TDEE, что и база
 */
function serverNdteBoost(prevDay, profile, bmr, nowMs = Date.now()) {
  const iw = webMirror.insulinWaveInternals();
  const trainings = (prevDay && Array.isArray(prevDay.trainings)) ? prevDay.trainings : [];
  if (!iw || !trainings.length || !bmr) return 0;

  // Вес 70 захардкожен в оригинале: калории нужны только как мера объёма
  // вчерашней нагрузки для порога, а не как реальный расход.
  let totalKcal = 0;
  let lastTrainingTime = null;
  for (const t of trainings) {
    totalKcal += iw.utils.calculateTrainingKcal(t, 70);
    if (t && t.time) lastTrainingTime = t.time;
  }
  if (totalKcal < 200) return 0;

  let hoursSince = 24;
  if (lastTrainingTime) {
    const [h, m] = String(lastTrainingTime).split(':').map(Number);
    const trainingMinutes = (h || 0) * 60 + (m || 0);
    const [nowH, nowM] = nowParts(nowMs).time.split(':').map(Number);
    hoursSince = (24 * 60 - trainingMinutes + (nowH * 60 + nowM)) / 60;
  }

  const height = (Number(profile && profile.height) || 170) / 100;
  const weight = Number(profile && profile.weight) || 0;
  const bmi = weight && height ? Math.round(weight / (height * height) * 10) / 10 : 22;
  const ndte = iw.calculateNDTE({
    trainingKcal: totalKcal,
    hoursSince,
    bmi,
    trainingType: trainings[0].type || 'cardio',
    trainingsCount: trainings.length,
  });
  return Math.round(bmr * ((ndte && ndte.tdeeBoost) || 0));
}

/** Базовый оптимум по зеркалу TDEE — или причина, по которой его не посчитать. */
function estimateOptimum(day, profile, hrZones) {
  const p = (profile && typeof profile === 'object' && !Array.isArray(profile)) ? profile : null;
  if (!p) return { kcal: 0, reason: 'no_profile' };

  const weight = Number(day && day.weightMorning) || Number(p.weight) || 0;
  const height = Number(p.height) || 0;
  const age = Number(p.age) || ageFromBirthDate(p.birthDate, Date.now()) || 0;
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
  };

  if (!has) return { ...empty, reason: 'no_inputs', note: `Норма не рассчитана: ${NORM_REASONS.no_inputs}.` };

  // `savedDisplayOptimum` больше не источник числа — только то, что клиент
  // последний раз видел на экране. Сравнение с ним остаётся в ответе, потому
  // что расхождение стоит замечать сразу, а не через месяц.
  const clientSaw = Number(day && day.savedDisplayOptimum) || 0;
  const meta = (day && day.savedOptimumMeta && typeof day.savedOptimumMeta === 'object')
    ? day.savedOptimumMeta
    : null;

  // База: TDEE по текущим данным дня плюс надбавка за вчерашнюю тренировку.
  const fresh = estimateOptimum(day, inputs.profile, inputs.hrZones);
  // Если вчерашний блоб не читали вовсе (`prevDay === undefined`), берём
  // надбавку из отпечатка: это лучше, чем молча занулить её.
  const ndte = inputs.prevDay !== undefined
    ? serverNdteBoost(inputs.prevDay, inputs.profile, fresh.bmr, inputs.nowMs)
    : (meta ? Number(meta.ndte) || 0 : 0);
  const base = fresh.kcal > 0 ? optimumWithNdte(fresh, ndte) : 0;

  if (base <= 0) {
    return { ...empty, reason: fresh.reason, note: `Норма не рассчитана: ${NORM_REASONS[fresh.reason]}.` };
  }

  // Долг и перебор считает зеркальное ядро приложения — то же, что рисует
  // число на экране клиента. Своей формулы здесь нет и быть не должно.
  const windowDays = buildDebtWindow(day.date, inputs);
  const debt = windowDays.length >= 2
    ? webMirror.computeDebtCore({
      date: day.date,
      day,
      prof: inputs.profile,
      optimum: base,
      sparklineData: windowDays,
      fmtDate: (d) => d.toISOString().slice(0, 10),
    })
    : null;

  // Порядок веток повторяет apps/web/heys_day_caloric_display_state.js:
  // загрузочный день перебивает всё, затем надбавка за долг, затем мягкое
  // снижение при переборе.
  let kcal = base;
  let correction = 0;
  let source = 'computed';
  let why = 'ни долга, ни перебора за последние дни нет';

  if (day && day.isRefeedDay === true) {
    kcal = webMirror.getRefeedOptimum(base, true);
    correction = kcal - base;
    why = 'загрузочный день, норма поднята';
  } else if (debt && debt.dailyBoost > 0) {
    correction = debt.dailyBoost;
    kcal = base + correction;
    why = `накопленный недобор за ${windowDays.length} дн — надбавка ${correction} ккал`;
  } else if (debt && debt.dailyReduction > 0 && !debt.hasDebt) {
    correction = -debt.dailyReduction;
    kcal = base + correction;
    why = `перебор за последние дни — мягкое снижение на ${debt.dailyReduction} ккал`;
  }

  if (!debt) {
    // Долг посчитать не на чем. Причины две и они разные: блобов вообще нет —
    // или они есть, но ядро отсеяло их как дни с неполными данными.
    if (windowDays.length >= 2) {
      why = 'в прошлых днях слишком мало еды для расчёта долга — поправка не применена';
    } else {
      source = 'estimate';
      why = 'история за прошлые дни недоступна, поправка на недобор не учтена';
    }
  }

  const parts = {
    base,
    correction,
    ndte,
    window_days: windowDays.length,
    client_saw: clientSaw || null,
  };

  let note = source === 'computed'
    ? `Норма посчитана сервером по данным дня: ${why}.`
    : `Расчётная оценка: ${why}.`;
  // Расхождение с экраном возможно штатно: NDTE затухает по часам, и клиент мог
  // смотреть день раньше. Молчать о нём всё равно нельзя — именно так протухший
  // кэш и прожил незамеченным.
  if (clientSaw > 0 && Math.abs(clientSaw - kcal) > 2) {
    note += ` Клиент последний раз видел ${Math.round(clientSaw)} ккал`;
    const drift = meta ? activityDrift(meta, day) : '';
    note += drift ? ` — с тех пор ${drift}.` : '.';
  }

  const macros = normMacros(kcal, inputs.norms);
  const macrosNote = macros.macros_reason ? ` БЖУ в граммах не считаем: ${NORM_REASONS[macros.macros_reason]}.` : '';

  return {
    source,
    kcal,
    parts,
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
  updateMeal,
  deleteMeal,
  addWater,
  addTraining,
  updateDayFields,
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
