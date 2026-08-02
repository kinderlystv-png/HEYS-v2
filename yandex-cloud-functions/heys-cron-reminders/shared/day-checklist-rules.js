'use strict';

/**
 * Ядро правила «чего ещё ждём от клиента сегодня».
 *
 * Один и тот же список нужен двум сторонам: клиенту в мессенджере как «Ждём»
 * и куратору как «Нет в дне». Поэтому правило живёт здесь, а не в клиенте и не
 * внутри одной функции: `heys-cron-reminders` спрашивает у него «пункт ещё
 * missing?» перед пушем, `heys-api-messages` отдаёт по нему чек-лист.
 *
 * Модуль намеренно чистый: без БД, без сети, без push-prefs и тихих часов.
 * Всё, что связано с доставкой уведомления, остаётся в кроне.
 *
 * Пороги здесь не новые — они перенесены один-в-один из уже работающих в
 * проде сценариев `heys-cron-reminders` (завтрак, утренний чек-ин, вода).
 *
 * Контракт статусов:
 *   done    — пункт закрыт;
 *   missing — срок наступил, данных нет (это и есть «ждём»);
 *   skipped — сегодня показывать нечего: срок не наступил либо не хватает
 *             нормы для расчёта. Потребитель такие пункты не показывает.
 */

// Все клиенты считаются в MSK — как в heys-cron-reminders.
const BREAKFAST_DUE_MINUTES = 12 * 60; // 12:00, сценарий 1 крона
const WEIGHT_DUE_OFFSET_MINUTES = 60; // среднее пробуждение + 1 ч, сценарий 2
const DEFAULT_WAKE_MINUTES = 8 * 60; // fallback, когда истории пробуждений мало
const WATER_ACTIVE_UNTIL_MINUTES = 20 * 60; // «активный день» до 20:00, сценарий 4
const WATER_DEFICIT_RATIO = 0.3; // отстаём меньше чем на 30% нормы — не считаем missing

const STATUS_DONE = 'done';
const STATUS_MISSING = 'missing';
const STATUS_SKIPPED = 'skipped';

const MSK_OFFSET_HOURS = 3;
const WAKE_HISTORY_DAYS = 7; // столько дней смотрит крон, считая среднее пробуждение
const WAKE_MIN_SAMPLES = 5; // меньше — данным не доверяем и берём дефолт

// ── Время. Пороги правила заданы в MSK, поэтому и дата, и «сейчас» считаются
// здесь: иначе каждый потребитель заведёт свою копию сдвига и они разъедутся.

/** Текущий момент, сдвинутый в MSK (дальше читается через getUTC*). */
function nowInMsk(now = new Date()) {
  return new Date(now.getTime() + MSK_OFFSET_HOURS * 3600 * 1000);
}

/** Минуты от полуночи по MSK. */
function nowMinutesMsk(now = new Date()) {
  const d = nowInMsk(now);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function formatIsoDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Сегодняшняя дата по MSK, YYYY-MM-DD. */
function todayDateMsk(now = new Date()) {
  return formatIsoDate(nowInMsk(now));
}

/** Дата N дней назад по MSK, YYYY-MM-DD. */
function isoDateNDaysAgoMsk(n, now = new Date()) {
  const d = nowInMsk(now);
  d.setUTCDate(d.getUTCDate() - n);
  return formatIsoDate(d);
}

/** Ключи дней за последнюю неделю — вход для `averageWakeMinutes`. */
function wakeHistoryDayKeys(now = new Date()) {
  const keys = [];
  for (let i = 0; i < WAKE_HISTORY_DAYS; i++) keys.push(`heys_dayv2_${isoDateNDaysAgoMsk(i, now)}`);
  return keys;
}

/** "HH:MM" → минуты от полуночи. null, если формат не распознан. */
function parseHHMM(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/** Минуты от полуночи → "HH:MM". */
function formatHHMM(minutes) {
  const total = Math.max(0, Math.min(24 * 60 - 1, Math.round(Number(minutes) || 0)));
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Есть ли в дне хотя бы один приём пищи с продуктами.
 * Пустой приём (создан, но ничего не добавлено) не считается.
 *
 * Отличается от `lastMealMinutes`: тот дополнительно требует разбираемого
 * `meal.time`. Крон исторически проверяет «клиент ещё не ел» именно через
 * время, поэтому приём без времени для него не существует. Для чек-листа это
 * неверно — еда внесена, ждать её больше не нужно, — поэтому здесь отдельный
 * предикат, а крон продолжает пользоваться своим.
 */
function hasAnyMeal(day) {
  if (!day || !Array.isArray(day.meals)) return false;
  return day.meals.some((meal) => Array.isArray(meal?.items) && meal.items.length > 0);
}

/**
 * Время последнего непустого приёма в минутах от полуночи. null, если приёмов
 * нет или ни у одного нет разбираемого времени. Перенесено из
 * `lastMealMinutesOfDay` в heys-cron-reminders.
 */
function lastMealMinutes(day) {
  if (!day || !Array.isArray(day.meals)) return null;
  let maxMin = null;
  for (const meal of day.meals) {
    if (!meal?.time) continue;
    if (!Array.isArray(meal.items) || meal.items.length === 0) continue;
    const m = parseHHMM(meal.time);
    if (m === null) continue;
    if (maxMin === null || m > maxMin) maxMin = m;
  }
  return maxMin;
}

/**
 * Дневные нормы клиента из `heys_norms` + `heys_profile`. Чистый порт
 * `getNorms` из heys-cron-reminders, вплоть до порядка fallback-полей.
 *
 * Возвращает null, когда абсолютной нормы калорий нет: крон в этом случае
 * считает, что норм у клиента нет вообще, и пропускает водный сценарий.
 * Чек-лист обязан вести себя так же, иначе он будет ждать воду там, где
 * напоминание молчит.
 */
function resolveNorms({ norms, profile } = {}) {
  const n = norms || {};
  const p = profile || {};
  const kcal = Number(p.dailyKcal || p.kcalGoal || p.targetKcal || n.kcal || 0);
  if (kcal <= 0) return null;
  const proteinPct = Number(n.proteinPct || p.proteinPct || 25);
  const carbsPct = Number(n.carbsPct || p.carbsPct || 45);
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);
  return {
    kcal,
    protein: Math.round((kcal * proteinPct) / 100 / 4),
    carbs: Math.round((kcal * carbsPct) / 100 / 4),
    fat: Math.round((kcal * fatPct) / 100 / 9),
    water: Number(n.water || p.waterGoal || 2000),
  };
}

/**
 * Среднее время пробуждения по дням недели. Чистая часть `getWakeAvgMinutes`:
 * сам запрос к БД остаётся у потребителя, сюда приходят уже загруженные дни.
 * null, когда данных меньше `WAKE_MIN_SAMPLES` — тогда берётся дефолт.
 */
function averageWakeMinutes(days) {
  if (!Array.isArray(days)) return null;
  const minutes = [];
  for (const day of days) {
    const m = parseHHMM(day?.sleepEnd);
    if (m !== null) minutes.push(m);
  }
  if (minutes.length < WAKE_MIN_SAMPLES) return null;
  return Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);
}

/** Утренний вес заполнен. */
function hasMorningWeight(day) {
  const raw = day?.weightMorning;
  return raw != null && Number(raw) > 0;
}

/**
 * На сколько мл клиент отстаёт от ожидаемого к текущему моменту объёма воды.
 * Ожидание распределено линейно от пробуждения до 20:00 — как в сценарии 4.
 * null, когда норма неизвестна и считать нечего.
 */
function waterDeficitMl({ day, waterNorm, nowMinutes, wakeMinutes }) {
  const norm = Number(waterNorm) || 0;
  if (norm <= 0) return null;
  const wake = Number.isFinite(wakeMinutes) ? wakeMinutes : DEFAULT_WAKE_MINUTES;
  const hoursSinceWake = Math.max(1, (nowMinutes - wake) / 60);
  const totalActiveHours = Math.max(1, (WATER_ACTIVE_UNTIL_MINUTES - wake) / 60);
  const expected = Math.min(norm, norm * (hoursSinceWake / totalActiveHours));
  const actual = Number(day?.water || 0);
  return expected - actual;
}

/**
 * Собрать чек-лист дня.
 *
 * @param {object} input
 * @param {object|null} input.day           — payload `heys_dayv2_<date>`
 * @param {object|null} input.norms         — { water } и прочие нормы клиента
 * @param {number} input.nowMinutes         — текущее время MSK в минутах от полуночи
 * @param {number|null} [input.wakeMinutes] — среднее время пробуждения, минуты
 * @returns {{items: Array<object>, completeness: number|null}}
 */
function buildDayChecklist({ day, norms, nowMinutes, wakeMinutes } = {}) {
  const now = Number(nowMinutes);
  if (!Number.isFinite(now)) {
    throw new TypeError('buildDayChecklist: nowMinutes is required');
  }
  const wake = Number.isFinite(wakeMinutes) ? wakeMinutes : DEFAULT_WAKE_MINUTES;
  const items = [];

  // 1) Приём пищи — ждём с 12:00, если за день не внесено ничего.
  const mealDone = hasAnyMeal(day);
  const mealTime = lastMealMinutes(day);
  items.push({
    key: 'meal',
    label: 'Приём пищи',
    status: mealDone
      ? STATUS_DONE
      : now >= BREAKFAST_DUE_MINUTES
        ? STATUS_MISSING
        : STATUS_SKIPPED,
    due_from: formatHHMM(BREAKFAST_DUE_MINUTES),
    // Время известно только для еды: у веса и воды его в дне нет,
    // выдумывать done_at ради полноты поля не станем.
    ...(mealDone && mealTime !== null ? { done_at_local: formatHHMM(mealTime) } : {}),
  });

  // 2) Утренний вес — ждём через час после обычного пробуждения.
  const weightDue = wake + WEIGHT_DUE_OFFSET_MINUTES;
  const weightDone = hasMorningWeight(day);
  items.push({
    key: 'weight',
    label: 'Вес утром',
    status: weightDone
      ? STATUS_DONE
      : now >= weightDue
        ? STATUS_MISSING
        : STATUS_SKIPPED,
    due_from: formatHHMM(weightDue),
  });

  // 3) Вода — «отстаёт» считается от нормы, поэтому без нормы пункта нет.
  const deficit = waterDeficitMl({ day, waterNorm: norms?.water, nowMinutes: now, wakeMinutes: wake });
  const waterNorm = Number(norms?.water) || 0;
  if (deficit === null) {
    items.push({ key: 'water', label: 'Вода', status: STATUS_SKIPPED });
  } else {
    const behind = deficit >= waterNorm * WATER_DEFICIT_RATIO;
    items.push({
      key: 'water',
      label: 'Вода',
      status: behind ? STATUS_MISSING : STATUS_DONE,
      ...(behind ? { deficit_ml: Math.round(deficit) } : {}),
    });
  }

  return { items, completeness: computeCompleteness(items) };
}

/**
 * Доля закрытых пунктов среди актуальных. `skipped` не участвует: пункт, срок
 * которого не наступил, не должен занижать «день собран на N%».
 * null, когда актуальных пунктов сегодня ещё нет.
 */
function computeCompleteness(items) {
  const counted = items.filter((it) => it.status === STATUS_DONE || it.status === STATUS_MISSING);
  if (counted.length === 0) return null;
  const done = counted.filter((it) => it.status === STATUS_DONE).length;
  return Math.round((done / counted.length) * 100) / 100;
}

module.exports = {
  BREAKFAST_DUE_MINUTES,
  WEIGHT_DUE_OFFSET_MINUTES,
  DEFAULT_WAKE_MINUTES,
  WATER_ACTIVE_UNTIL_MINUTES,
  WATER_DEFICIT_RATIO,
  MSK_OFFSET_HOURS,
  WAKE_HISTORY_DAYS,
  WAKE_MIN_SAMPLES,
  STATUS_DONE,
  STATUS_MISSING,
  STATUS_SKIPPED,
  nowInMsk,
  nowMinutesMsk,
  todayDateMsk,
  isoDateNDaysAgoMsk,
  wakeHistoryDayKeys,
  averageWakeMinutes,
  resolveNorms,
  parseHHMM,
  formatHHMM,
  hasAnyMeal,
  lastMealMinutes,
  hasMorningWeight,
  waterDeficitMl,
  buildDayChecklist,
  computeCompleteness,
};
