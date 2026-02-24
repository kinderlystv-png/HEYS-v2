// heys_cascade_card_v1.js — Cascade Card — «Ваш позитивный каскад»
// Standalone компонент. Визуализация цепочки здоровых решений в реальном времени.
// v3.1.0 | 2026-02-20 — Cascade Rate Score (CRS) cumulative momentum + goal-aware calorie penalty
// Фильтр в консоли: [HEYS.cascade]
if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // ─────────────────────────────────────────────────────
  // КОНСТАНТЫ
  // ─────────────────────────────────────────────────────

  const STATES = {
    EMPTY: 'EMPTY',
    BUILDING: 'BUILDING',
    GROWING: 'GROWING',
    STRONG: 'STRONG',
    BROKEN: 'BROKEN',
    RECOVERY: 'RECOVERY'
  };

  const STATE_CONFIG = {
    EMPTY: { icon: '🌅', color: '#94a3b8', label: 'Начни день' },
    BUILDING: { icon: '🔗', color: '#3b82f6', label: 'Импульс формируется' },
    GROWING: { icon: '⚡', color: '#22c55e', label: 'Каскад набирает силу' },
    STRONG: { icon: '🔥', color: '#eab308', label: 'Устойчивый импульс' },
    BROKEN: { icon: '💪', color: '#f59e0b', label: 'Начни с малого' },
    RECOVERY: { icon: '🌱', color: '#0ea5e9', label: 'Возвращение' }
  };

  const MESSAGES = {
    BUILDING: [
      { short: 'Импульс формируется. Позитивные действия начинают складываться.' },
      { short: 'Первые дни — самые важные. Каждое решение закладывает фундамент.' }
    ],
    GROWING: [
      { short: 'Каскад набирает силу. Позитивные действия накапливаются день за днём.' },
      { short: 'На восходящей. Каждый хороший день поднимает тебя выше.' },
      { short: 'Прогресс виден. Ещё немного — и импульс станет устойчивым.' }
    ],
    STRONG: [
      { short: 'Устойчивый импульс. Ты на пике — каждый день поддерживает привычку.' },
      { short: 'Мощная инерция. Даже небольшой сбой не перечеркнёт твой прогресс.' },
      { short: 'Система работает. Две+ недели позитивных решений — это уже фундамент.' }
    ],
    BROKEN: [
      { short: 'Начни с малого — каждое действие запускает новый каскад.' },
      { short: 'Нулевой импульс — это чистый старт. Первый день строит всё остальное.' },
      { short: 'Не всё или ничего. Даже 70% хороших решений — отличный день.' }
    ],
    RECOVERY: [
      { short: 'Один шаг назад не отменяет неделю прогресса. Ты уже возвращаешься.' },
      { short: 'Импульс снизился, но не обнулился. Один хороший день — и ты на пути.' },
      { short: 'После перерыва каждое решение имеет значение. Ты уже на пути.' }
    ],
    ANTI_LICENSING: [
      { short: 'Тренировка — сама по себе победа. Не «награждай» себя едой.' },
      { short: 'После нагрузки организм лучше всего усвоит белок и овощи.' },
      { short: 'Классная тренировка! Выбери качество, а не количество.' }
    ],
    // v3.1.0: показывается при перебор калорий в режиме дефицита (похудение)
    // Акцент — CRS защитил инерцию, один срыв не перечёркивает прогресс
    DEFICIT_OVERSHOOT: [
      { short: 'Перебор, но накопленный прогресс защищает тебя. Завтра — новый шанс.' },
      { short: 'Один перебор не перечёркивает неделю дисциплины. Импульс сохранён.' },
      { short: 'Перебрал — бывает. Посмотри на свою неделю: ты справляешься.' },
      { short: 'Калории выше цели, но каскад инерции на твоей стороне.' }
    ]
  };

  const EVENT_ICONS = {
    meal: '🥗',
    training: '💪',
    household: '🏠',
    sleep: '😴',
    checkin: '⚖️',
    measurements: '📏',
    steps: '🚶',
    supplements: '💊',
    insulin: '⚡'
  };

  // ─────────────────────────────────────────────────────
  // СИСТЕМА СКОРИНГА v2.1.0 — Continuous Scientific Scoring
  // 10 факторов с непрерывными функциями + 3 метасистемы.
  // Personalized baselines (14-day median), confidence layer,
  // day-type awareness, cross-factor synergies.
  // Хороший день: meals(3.0) + training(2.5) + sleep(1.5) + steps(1.0) + synergies(0.9) ≈ 8.9
  // Отличный: meals(4.5) + training(3.0) + sleep(2.5) + steps(1.3) + synergies(1.3) ≈ 12.6
  // ─────────────────────────────────────────────────────

  // [LEGACY FALLBACK] — v2.0.0 step-function weights, used only in meal quality fallback
  const EVENT_WEIGHTS = {
    // Еда: вес через getMealQualityScore (0–100)
    meal_positive: 1.0,   // Фолбэк при недоступном getMealQualityScore
    meal_negative: -1.0,  // Жёсткое нарушение
    // Бытовая активность (householdMin)
    household_high: 1.0,  // ≥ 60 мин
    household_mid: 0.5,   // 30-59 мин
    household_low: 0.2,   // 10-29 мин
    // Тренировка (по длительности)
    training_60plus: 2.5, // ≥ 60 мин
    training_45: 2.0,     // 45-59 мин
    training_30: 1.5,     // 30-44 мин
    training_15: 1.0,     // 15-29 мин
    training_short: 0.5,  // 1-14 мин
    // Сон (время отбоя)
    sleep_onset_good: 1.0,   // ≤ 22:00
    sleep_onset_ok: 0.5,     // 22:01-23:00
    sleep_onset_neutral: 0.0, // 23:01-00:00
    sleep_onset_bad: -1.0,   // 00:01-01:00
    sleep_onset_worse: -1.5, // 01:01-02:00
    sleep_onset_worst: -2.0, // > 02:00
    // Сон (длительность)
    sleep_dur_ideal: 1.0,  // 7.0-8.5 ч
    sleep_dur_ok: 0.3,     // 6.0-6.9 / 8.6-9.5 ч
    sleep_dur_low: -0.5,   // 5.0-5.9 ч
    sleep_dur_over: -0.3,  // 9.6-10.5 ч
    sleep_dur_very_low: -1.5, // < 5.0 ч
    sleep_dur_too_long: -0.5, // > 10.5 ч
    // Чекин
    checkin: 0.5,
    // Измерения
    measurements_today: 1.0,
    measurements_old: -0.1,       // 8-14 дней назад
    measurements_very_old: -0.3,  // > 14 дней назад
    // Шаги
    steps_great: 1.0,   // ≥ 120%
    steps_full: 0.7,    // 100-119%
    steps_partial: 0.3, // 70-99%
    steps_half: 0.0,    // 50-69%
    steps_low: -0.3,    // < 50% (не 0)
    // Витамины/добавки
    supplements_all: 0.5,
    supplements_half: 0.2,
    supplements_poor: -0.2,
    // Инсулиновые волны
    insulin_gap_great: 1.0,   // avgGap ≥ 240 мин
    insulin_gap_good: 0.5,    // 180-239 мин
    insulin_gap_ok: 0.2,      // 120-179 мин
    insulin_night_long: 0.5,  // ночной пост ≥ 14 ч
    insulin_night_mid: 0.3,   // 12-13 ч
    insulin_night_short: 0.1, // 10-11 ч
    insulin_overlap_high: -0.5,
    insulin_overlap_med: -0.3,
    insulin_overlap_low: -0.1
  };

  // ─────────────────────────────────────────────────────
  // v2.1.0 SCORING CONSTANTS
  // ─────────────────────────────────────────────────────

  const INTENSITY_MULTIPLIERS = {
    hiit: 1.8, strength: 1.5, cardio: 1.2,
    yoga: 0.8, stretching: 0.6, walk: 0.5
  };

  const CIRCADIAN_MEAL_MODIFIERS = [
    { start: 360, end: 600, mult: 1.3 },    // 06:00–10:00 breakfast
    { start: 600, end: 840, mult: 1.0 },    // 10:00–14:00 lunch
    { start: 840, end: 1080, mult: 0.9 },   // 14:00–18:00 snack
    { start: 1080, end: 1260, mult: 0.85 }, // 18:00–21:00 dinner
    { start: 1260, end: 1380, mult: 0.7 }   // 21:00–23:00 late dinner
  ];

  const POPULATION_DEFAULTS = {
    householdMin: 30,
    sleepOnsetMins: 1380, // 23:00
    sleepHours: 7.5,
    steps: 7000,
    weeklyTrainingLoad: 200
  };

  const SCORE_THRESHOLDS = {
    STRONG: 8.0,    // Мощный день
    GROWING: 4.5,   // Каскад растёт
    BUILDING: 1.5   // Начало
  };

  const MOMENTUM_TARGET = 10.0; // score при 100% прогресс-бара (v3.2.0: снижен с 12 для реалистичного DCS)

  // v2.2.0: Soft chain — penalty tiers by event severity
  // Minor (weight ≥ -0.5): -1 link, Medium (-1.5 ≤ w < -0.5): -2 links, Severe (w < -1.5): -3 links
  const CHAIN_PENALTY = { MINOR: 1, MEDIUM: 2, SEVERE: 3 };
  const CHAIN_PENALTY_THRESHOLDS = { MEDIUM: -0.5, SEVERE: -1.5 };

  function getChainPenalty(weight) {
    if (weight < CHAIN_PENALTY_THRESHOLDS.SEVERE) return CHAIN_PENALTY.SEVERE;
    if (weight < CHAIN_PENALTY_THRESHOLDS.MEDIUM) return CHAIN_PENALTY.MEDIUM;
    return CHAIN_PENALTY.MINOR;
  }

  // ─────────────────────────────────────────────────────
  // v3.0.0 CRS (Cascade Rate Score) CONSTANTS
  // ─────────────────────────────────────────────────────

  const CRS_DECAY = 0.95;            // EMA decay factor (α) (v3.3.0: 0.92→0.95, half-life 14d вместо 8d)
  const CRS_WINDOW = 30;             // days for EMA computation
  const CRS_DCS_CLAMP_NEG = -0.3;    // inertia protection for normal bad days
  const CRS_CEILING_BASE = 0.65;     // starting ceiling for all users
  const CRS_KEY_VERSION = 'v4';      // localStorage schema version (v4: full retroactive DCS recalculation with accurate algorithm)
  const CRS_PREV_KEY_VERSION = 'v3';  // for migration detection

  const CRS_THRESHOLDS = {
    STRONG: 0.75,    // Устойчивый импульс
    GROWING: 0.45,   // Каскад набирает силу
    BUILDING: 0.20,  // Импульс формируется
    RECOVERY: 0.05   // Возвращение (> 0.05)
  };

  // ─────────────────────────────────────────────────────
  // УТИЛИТЫ
  // ─────────────────────────────────────────────────────

  function parseTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (!parts) return null;
    return parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }

  function formatTimeShort(timeStr) {
    if (!timeStr) return '—';
    const parts = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (!parts) return '—';
    return `${parts[1].padStart(2, '0')}:${parts[2]}`;
  }

  function pickMessage(pool, poolKey) {
    if (!pool || !pool.length) return { short: '' };
    const hour = new Date().getHours();
    const idx = hour % pool.length;
    const msg = pool[idx];
    console.info('[HEYS.cascade] 💬 Message selected:', {
      pool: poolKey || 'UNKNOWN',
      index: idx,
      poolSize: pool.length,
      message: msg.short
    });
    return msg;
  }

  function isWithinHours(timeStr, hours) {
    const mins = parseTime(timeStr);
    if (mins === null) return false;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const diff = nowMins - mins;
    return diff >= 0 && diff <= hours * 60;
  }

  function getMealLabel(meal, index) {
    const time = parseTime(meal && meal.time);
    if (time !== null) {
      if (time < 600) return 'Ранний приём';
      if (time < 660) return 'Завтрак';
      if (time < 720) return 'Поздний завтрак';
      if (time < 840) return 'Обед';
      if (time < 1020) return 'Перекус';
      if (time < 1200) return 'Ужин';
      return 'Поздний приём';
    }
    const labels = ['Завтрак', 'Обед', 'Перекус', 'Ужин'];
    return labels[index] || ('Приём ' + (index + 1));
  }

  function checkMealHarm(meal, pIndex) {
    if (!meal || !meal.items || !pIndex) return false;
    for (var i = 0; i < meal.items.length; i++) {
      var item = meal.items[i];
      var product = (HEYS.dayUtils && HEYS.dayUtils.getProductFromItem && HEYS.dayUtils.getProductFromItem(item, pIndex))
        || (HEYS.models && HEYS.models.getProductFromItem && HEYS.models.getProductFromItem(item, pIndex));
      if (product && (product.harm || 0) >= 7) return true;
    }
    return false;
  }

  // Загружает N предыдущих дней из localStorage (для стрик-штрафов и истории измерений)
  function getPreviousDays(n) {
    var result = [];
    var nullDates = [];
    var U = HEYS.utils;
    var clientId = (U && U.getCurrentClientId && U.getCurrentClientId()) || HEYS.currentClientId || '';
    for (var i = 1; i <= n; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var ds = d.toISOString().slice(0, 10);
      var key = clientId ? 'heys_' + clientId + '_dayv2_' + ds : 'heys_dayv2_' + ds;
      try {
        var raw = (HEYS.store && HEYS.store.get) ? HEYS.store.get(key, null) : localStorage.getItem(key);
        if (raw) {
          result.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
        } else {
          result.push(null);
          nullDates.push(ds);
        }
      } catch (e) {
        result.push(null);
        nullDates.push(ds + '(err)');
      }
    }
    if (nullDates.length > 0) {
      console.warn('[HEYS.cascade] ⚠️ getPreviousDays: ' + nullDates.length + '/' + n + ' days missing from localStorage:', nullDates.join(', '));
    }
    return result; // array[0] = yesterday, array[n-1] = n days ago
  }

  // ─────────────────────────────────────────────────────
  // HELPER: buildDayEventsSimple — лёгкие события для истории
  // Строит массив событий из любого day-объекта без сложного скоринга
  // ─────────────────────────────────────────────────────

  function buildDayEventsSimple(dayObj) {
    var evts = [];
    if (!dayObj) return evts;

    // Checkin (вес)
    if ((dayObj.weightMorning || 0) > 0) {
      evts.push({
        type: 'checkin', icon: EVENT_ICONS.checkin, positive: true, weight: 0.5,
        time: null, sortKey: 0,
        label: 'Вес ' + (+dayObj.weightMorning).toFixed(1) + ' кг'
      });
    }

    // Приёмы пищи
    var hMeals = dayObj.meals || [];
    for (var hmi = 0; hmi < hMeals.length; hmi++) {
      var hm = hMeals[hmi];
      var hmt = parseTime(hm && hm.time);
      var isLateMeal = hmt !== null && hmt >= 1380;
      evts.push({
        type: 'meal', icon: EVENT_ICONS.meal,
        positive: !isLateMeal, weight: isLateMeal ? -0.5 : 0.4,
        time: hm && hm.time, sortKey: hmt !== null ? hmt : 500,
        label: (hm && hm.name) || 'Приём пищи',
        breakReason: isLateMeal ? '⏰' : null
      });
    }

    // Тренировки
    var hTrains = dayObj.trainings || [];
    for (var hti = 0; hti < hTrains.length; hti++) {
      var htr = hTrains[hti];
      var htrMin = (htr && htr.durationMin) || 0;
      var htrSort = parseTime(htr && htr.startTime);
      evts.push({
        type: 'training', icon: EVENT_ICONS.training, positive: true, weight: 1.5,
        time: htr && htr.startTime, sortKey: htrSort !== null ? htrSort : 600,
        label: (htr && htr.type || 'Тренировка') + (htrMin ? ' ' + htrMin + ' мин' : '')
      });
    }

    // Сон
    if (dayObj.sleepStart) {
      var hslh = dayObj.sleepHours || 0;
      var hslEnd = dayObj.sleepEnd || null;
      // Fallback: вычислить sleepHours из sleepEnd если не задан
      if (!hslh && hslEnd) {
        var hsdm = parseTime(dayObj.sleepStart); var hedm = parseTime(hslEnd);
        if (hsdm !== null && hedm !== null) {
          if (hsdm < 360) hsdm += 1440;
          if (hedm <= hsdm) hedm += 1440;
          hslh = Math.round((hedm - hsdm) / 60 * 10) / 10;
        }
      }
      var hstRaw = parseTime(dayObj.sleepStart);
      // Нормализация: after-midnight (00:xx–05:xx) → +1440 для корректного isLateSleep
      var hst = hstRaw !== null ? (hstRaw < 360 ? hstRaw + 1440 : hstRaw) : null;
      var goodSleep = hslh >= 6 && hslh <= 9;
      // sortKey: after-midnight → отрицательный (до чекина)
      var hstSort = hstRaw !== null ? (hstRaw < 360 ? hstRaw - 1440 : hstRaw) : 1440;
      // Качественный лейбл + время конца + длительность
      // v3.3.0: labels aligned with v3.2.0 chronotype clamp (01:30)
      var hslOnsetLabel = hst === null ? 'Сон'
        : hst <= 1320 ? 'Ранний сон'
          : hst <= 1380 ? 'Сон до 23:00'
            : hst <= 1440 ? 'Сон до полуночи'
              : hst <= 1530 ? 'Поздний сон'  // 00:00-01:30: within chronotype clamp
                : hst <= 1620 ? 'Очень поздний сон'  // 01:30-03:00
                  : 'Критически поздний сон';  // >03:00 (hard floor zone)
      var hslLabel = hslOnsetLabel;
      if (hslEnd) hslLabel += ' →' + hslEnd;
      if (hslh > 0) hslLabel += ' (' + hslh.toFixed(1) + 'ч)';
      // v3.3.0: graduated sleep weights matching v3.2.0 sigmoid direction
      // instead of hardcoded -1.0 for everything ≥ 23:00
      var hslWeight;
      if (hst === null) { hslWeight = 0; }
      else if (hst <= 1380) { hslWeight = goodSleep ? 0.8 : -0.3; }   // ≤23:00: early
      else if (hst <= 1440) { hslWeight = goodSleep ? 0.3 : -0.1; }   // 23:00–00:00
      else if (hst <= 1530) { hslWeight = goodSleep ? 0.0 : -0.2; }   // 00:00–01:30 (within chronotype clamp)
      else if (hst <= 1620) { hslWeight = goodSleep ? -0.3 : -0.5; }  // 01:30–03:00
      else if (hst <= 1680) { hslWeight = -1.0; }                      // 03:00–04:00 (near hard floor)
      else { hslWeight = -2.0; }                                       // >04:00 catastrophe
      var hslPositive = hslWeight >= 0;
      evts.push({
        type: 'sleep', icon: hslPositive ? EVENT_ICONS.sleep : '🌙',
        positive: hslPositive,
        weight: hslWeight,
        time: dayObj.sleepStart, timeEnd: hslEnd, sleepHours: hslh,
        sortKey: hstSort,
        label: hslLabel,
        breakReason: hslWeight < -0.5 ? '⏰' : null
      });
    }

    // Шаги
    if ((dayObj.steps || 0) > 1000) {
      evts.push({
        type: 'steps', icon: EVENT_ICONS.steps,
        positive: dayObj.steps >= 7500, weight: dayObj.steps >= 7500 ? 0.8 : 0.2,
        time: null, sortKey: 650,
        label: (+dayObj.steps).toLocaleString('ru') + ' шагов'
      });
    }

    // Бытовая активность
    if ((dayObj.householdMin || 0) > 0) {
      evts.push({
        type: 'household', icon: EVENT_ICONS.household, positive: true, weight: 0.4,
        time: null, sortKey: 599,
        label: 'Бытовая ' + dayObj.householdMin + ' мин'
      });
    }

    // Измерения
    if (dayObj.measurements && Object.keys(dayObj.measurements).some(function (k) { return dayObj.measurements[k] > 0; })) {
      evts.push({
        type: 'measurements', icon: EVENT_ICONS.measurements, positive: true, weight: 0.5,
        time: null, sortKey: 1,
        label: 'Замеры тела'
      });
    }

    evts.sort(function (a, b) { return a.sortKey - b.sortKey; });
    return evts;
  }

  function getDateLabel(offsetFromToday) {
    if (offsetFromToday === 1) return 'Вчера';
    var MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    var DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    var d = new Date();
    d.setDate(d.getDate() - offsetFromToday);
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  // ─────────────────────────────────────────────────────
  // v2.1.0 MATH UTILITIES
  // ─────────────────────────────────────────────────────

  function clamp(val, lo, hi) {
    return val < lo ? lo : val > hi ? hi : val;
  }

  function median(arr) {
    if (!arr.length) return 0;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function stdev(arr) {
    if (arr.length < 2) return 0;
    var m = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    var variance = arr.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / arr.length;
    return Math.sqrt(variance);
  }

  // ─────────────────────────────────────────────────────
  // v3.1.0: GOAL-AWARE CALORIE PENALTY HELPER
  // Определяет режим цели по deficitPctTarget из профиля.
  // Переиспользует логику getGoalMode из heys_advice_bundle_v1.js
  // с приоритетом на HEYS.advice.getGoalMode при наличии.
  // ─────────────────────────────────────────────────────

  function getGoalMode(deficitPct) {
    // Попробуем взять из advice bundle если доступен
    if (HEYS.advice && typeof HEYS.advice.getGoalMode === 'function') {
      return HEYS.advice.getGoalMode(deficitPct);
    }
    // Локальная копия (зеркало heys_advice_bundle_v1.js)
    var pct = deficitPct || 0;
    if (pct <= -10) {
      return {
        mode: 'deficit', label: 'Похудение', emoji: '🔥',
        targetRange: { min: 0.90, max: 1.05 }, criticalOver: 1.15, criticalUnder: 0.80
      };
    } else if (pct <= -5) {
      return {
        mode: 'deficit', label: 'Лёгкое похудение', emoji: '🎯',
        targetRange: { min: 0.92, max: 1.08 }, criticalOver: 1.20, criticalUnder: 0.75
      };
    } else if (pct >= 10) {
      return {
        mode: 'bulk', label: 'Набор массы', emoji: '💪',
        targetRange: { min: 0.95, max: 1.10 }, criticalOver: 1.25, criticalUnder: 0.85
      };
    } else if (pct >= 5) {
      return {
        mode: 'bulk', label: 'Лёгкий набор', emoji: '💪',
        targetRange: { min: 0.93, max: 1.12 }, criticalOver: 1.20, criticalUnder: 0.80
      };
    } else {
      return {
        mode: 'maintenance', label: 'Поддержание', emoji: '⚖️',
        targetRange: { min: 0.90, max: 1.10 }, criticalOver: 1.25, criticalUnder: 0.70
      };
    }
  }

  function getPersonalBaseline(prevDays, extractor, defaultVal) {
    var values = [];
    for (var i = 0; i < prevDays.length; i++) {
      if (!prevDays[i]) continue;
      var val = extractor(prevDays[i]);
      if (val != null && val > 0) values.push(val);
    }
    return values.length >= 3 ? median(values) : defaultVal;
  }

  function getFactorConfidence(prevDays, extractor) {
    var count = 0;
    for (var i = 0; i < prevDays.length; i++) {
      if (!prevDays[i]) continue;
      var val = extractor(prevDays[i]);
      if (val != null && val > 0) count++;
    }
    if (count >= 10) return 1.0;
    if (count >= 7) return 0.8;
    if (count >= 3) return 0.5;
    if (count >= 1) return 0.3;
    return 0.1;
  }

  function countConsecutive(prevDays, predicate) {
    var count = 0;
    for (var i = 0; i < prevDays.length; i++) {
      if (predicate(prevDays[i])) count++;
      else break;
    }
    return count;
  }

  function getCircadianMultiplier(timeMins) {
    if (timeMins === null || timeMins === undefined) return 1.0;
    for (var i = 0; i < CIRCADIAN_MEAL_MODIFIERS.length; i++) {
      var mod = CIRCADIAN_MEAL_MODIFIERS[i];
      if (timeMins >= mod.start && timeMins < mod.end) return mod.mult;
    }
    return 1.0;
  }

  function getTrainingDuration(tr) {
    var dur = 0;
    if (tr && tr.z && Array.isArray(tr.z)) {
      dur = tr.z.reduce(function (a, b) { return a + (b || 0); }, 0);
    }
    if (!dur && tr && tr.duration) dur = tr.duration;
    if (!dur && tr && tr.type) {
      var typeDefaults = { cardio: 40, strength: 50, hiit: 30, yoga: 60, stretching: 30 };
      dur = typeDefaults[tr.type] || 40;
    }
    return dur || 40;
  }

  function getTrainingLoad(tr) {
    var dur = getTrainingDuration(tr);
    var type = (tr && tr.type) || '';
    var mult = INTENSITY_MULTIPLIERS[type] || 1.0;
    return dur * mult;
  }

  function buildInputSignature(day, normAbs, prof) {
    var meals = (day && day.meals) || [];
    var trainings = (day && day.trainings) || [];

    var mealsSig = meals.map(function (m) {
      var items = (m && m.items) || [];
      var gramsSum = items.reduce(function (acc, it) {
        return acc + (it.grams || it.g || 0);
      }, 0);
      // v5.0.2: Включаем kcal100 (× 10, округлённое) чтобы инвалидировать кэш
      // когда cascade batch обновляет нутриенты в localStorage
      var kcal100Sum = items.reduce(function (acc, it) {
        return acc + Math.round((it.kcal100 || 0) * 10);
      }, 0);
      return [m && m.time || '-', items.length, gramsSum, kcal100Sum].join('|');
    }).join(';');

    var trainingsSig = trainings.map(function (t) {
      return [t && t.time || '-', t && t.duration || 0].join('|');
    }).join(';');

    return [
      meals.length,
      mealsSig,
      trainings.length,
      trainingsSig,
      (day && day.water) || 0,
      (day && day.steps) || 0,
      (normAbs && normAbs.kcal) || 0,
      (prof && prof.water_norm) || 2000,
      (prof && (prof.stepsGoal || prof.steps_goal)) || 8000,
      // v2.0.0: новые факторы
      (day && day.householdMin) || 0,
      (day && day.sleepStart) || '',
      (day && day.sleepHours) || 0,
      (day && (day.weightMorning > 0 ? 1 : 0)) || 0,
      (day && day.measurements) ? JSON.stringify(day.measurements) : '',
      (day && day.supplementsTaken) ? day.supplementsTaken.length : 0,
      (day && day.supplementsPlanned) ? (Array.isArray(day.supplementsPlanned) ? day.supplementsPlanned.length : day.supplementsPlanned) : 0,
      (prof && prof.plannedSupplements) ? (Array.isArray(prof.plannedSupplements) ? prof.plannedSupplements.length : prof.plannedSupplements) : 0
    ].join('::');
  }

  // ─────────────────────────────────────────────────────
  // v3.0.0 CRS (Cascade Rate Score) ENGINE
  // ─────────────────────────────────────────────────────

  function getCrsStorageKey(clientId) {
    return clientId
      ? 'heys_' + clientId + '_cascade_dcs_' + CRS_KEY_VERSION
      : 'heys_cascade_dcs_' + CRS_KEY_VERSION;
  }

  function loadDcsHistory(clientId) {
    var key = getCrsStorageKey(clientId);
    try {
      var raw = (HEYS.store && HEYS.store.get) ? HEYS.store.get(key, null) : localStorage.getItem(key);
      if (raw) {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (e) {
      console.warn('[HEYS.cascade.crs] ⚠️ Failed to load DCS history:', e && e.message);
    }

    // v4 migration: FULL PURGE — all entries invalidated and recalculated.
    // Previous retroactive formula (v1-v3) over-estimated DCS by 50-100%
    // (e.g. 0.875 retro vs 0.259 real-time for same day with late sleep).
    // v4 retroactive formula mirrors the full 10-factor algorithm (sigmoid sleep,
    // circadian meal penalties, tanh steps, etc.) producing honest estimates.
    // All entries are purged so backfill recalculates with the accurate formula.
    // Today's DCS is still computed real-time by the full algorithm.
    var prevVersions = ['v3', 'v2', 'v1'];
    for (var pvi = 0; pvi < prevVersions.length; pvi++) {
      var oldKey = clientId
        ? 'heys_' + clientId + '_cascade_dcs_' + prevVersions[pvi]
        : 'heys_cascade_dcs_' + prevVersions[pvi];
      try {
        var oldRaw = (HEYS.store && HEYS.store.get) ? HEYS.store.get(oldKey, null) : localStorage.getItem(oldKey);
        if (oldRaw) {
          var oldData = typeof oldRaw === 'string' ? JSON.parse(oldRaw) : oldRaw;
          var oldCount = Object.keys(oldData).length;
          console.info('[HEYS.cascade.crs] 🔄 DCS ' + prevVersions[pvi] + '→v4 migration: purging ' + oldCount + ' entries for full recalculation (accurate retroactive formula)');
          // Clean up old key
          try {
            if (HEYS.store && HEYS.store.set) {
              HEYS.store.set(oldKey, null);
            } else {
              localStorage.removeItem(oldKey);
            }
          } catch (ignore) { }
          // Return empty — backfill will recalculate all days
          return {};
        }
      } catch (e) {
        console.warn('[HEYS.cascade.crs] ⚠️ ' + prevVersions[pvi] + '→v4 migration failed:', e && e.message);
      }
    }

    return {};
  }

  function saveDcsHistory(clientId, dcsMap) {
    var key = getCrsStorageKey(clientId);
    // Auto-cleanup: remove entries older than 35 days
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 35);
    var cutoffStr = cutoff.toISOString().slice(0, 10);
    var cleaned = {};
    var dates = Object.keys(dcsMap);
    for (var i = 0; i < dates.length; i++) {
      if (dates[i] >= cutoffStr) {
        cleaned[dates[i]] = dcsMap[dates[i]];
      }
    }
    try {
      var json = JSON.stringify(cleaned);
      if (HEYS.store && HEYS.store.set) {
        HEYS.store.set(key, json);
      } else {
        localStorage.setItem(key, json);
      }
    } catch (e) {
      console.warn('[HEYS.cascade.crs] ⚠️ Failed to save DCS history:', e && e.message);
    }
    return cleaned;
  }

  /**
   * Retroactive DCS estimation for days without full scoring.
   * v3.4.0: rewritten to approximate the full 10-factor algorithm —
   *   uses same daily-score scale (0–10) normalized by MOMENTUM_TARGET.
   *   Accounts for sleep onset sigmoid, late-meal penalties, training load,
   *   steps tanh, and chronotype baseline from prevDays.
   *
   * @param {Object} day — day data object from localStorage (dayv2_*)
   * @param {Array}  prevDays — up to 14 preceding days (for chronotype baseline)
   * @returns {number|null} — estimated DCS (−0.3 … 1.0), or null if no data
   */
  function getRetroactiveDcs(day, prevDays) {
    if (!day) return null;
    var estScore = 0; // estimated daily score on 0–10+ scale

    // ── 1. Meals: time-band scoring (v3.4.1 — matches full algo scale) ──
    // Full algo uses getMealQualityScore (0–100) → clamp((qs-40)/40) × circadian.
    // Average quality ~75–85 → base weight ~0.9–1.1. With circadian modifiers:
    //   breakfast <10:00 ×1.3 → ~1.15,  daytime ×1.0 → ~0.95,
    //   21–23:00 ×0.6 → ~0.50,  ≥23:00 or 00–06:00 → hard violation −1.0
    var meals = day.meals || [];
    var retroMealCount = 0; // count positive meals for synergy check
    for (var lmi = 0; lmi < meals.length; lmi++) {
      var lmt = parseTime(meals[lmi] && meals[lmi].time);
      var mealContrib;
      if (lmt !== null) {
        if (lmt >= 0 && lmt < 360) {
          // After midnight 00:00–06:00: hard violation (full algo: −1.0)
          mealContrib = -1.0;
        } else if (lmt >= 1380) {
          // ≥ 23:00: hard violation (full algo: −1.0)
          mealContrib = -1.0;
        } else if (lmt >= 1260) {
          // 21:00–23:00: mild circadian discount
          mealContrib = 0.50;
          retroMealCount++;
        } else if (lmt < 600) {
          // Breakfast < 10:00: circadian bonus ×1.3
          mealContrib = 1.15;
          retroMealCount++;
        } else {
          // Normal daytime meal 10:00–21:00
          mealContrib = 0.95;
          retroMealCount++;
        }
      } else {
        // No time data: assume average daytime meal
        mealContrib = 0.80;
        retroMealCount++;
      }
      estScore += mealContrib;
    }

    // ── 2. Training: load-aware scoring (approximate ШАГ 3) ──
    var trains = day.trainings || [];
    var retroHasTraining = trains.length > 0;
    if (trains.length > 0) {
      var firstLoad = getTrainingLoad(trains[0]);
      // sqrt-curve like full algo: clamp(sqrt(load/30)*1.2, 0.3, 3.0)
      estScore += clamp(Math.sqrt(Math.max(firstLoad, 30) / 30) * 1.2, 0.5, 2.5);
      // Diminishing returns for additional sessions (v3.4.1: 3rd+ at ×0.25)
      if (trains.length > 1) {
        var secondLoad = getTrainingLoad(trains[1]);
        estScore += clamp(Math.sqrt(Math.max(secondLoad, 20) / 30) * 0.6, 0.2, 1.0);
      }
      for (var rti = 2; rti < trains.length; rti++) {
        var addLoad = getTrainingLoad(trains[rti]);
        estScore += clamp(Math.sqrt(Math.max(addLoad, 20) / 30) * 0.3, 0.1, 0.5);
      }
    }

    // ── 3. Sleep onset: sigmoid matching full ШАГ 4 ──
    if (day.sleepStart) {
      var slMins = parseTime(day.sleepStart);
      if (slMins !== null) {
        if (slMins < 360) slMins += 1440; // normalize after-midnight

        // Compute chronotype baseline from prevDays (mirrors full algo)
        var retroOnsetValues = [];
        var rpd = prevDays || [];
        for (var roi = 0; roi < rpd.length; roi++) {
          if (!rpd[roi] || !rpd[roi].sleepStart) continue;
          var roVal = parseTime(rpd[roi].sleepStart);
          if (roVal !== null) {
            if (roVal < 360) roVal += 1440;
            retroOnsetValues.push(roVal);
          }
        }
        // Also include current day in baseline estimate
        retroOnsetValues.push(slMins);

        var retroPersonalOnset = retroOnsetValues.length >= 3
          ? median(retroOnsetValues)
          : POPULATION_DEFAULTS.sleepOnsetMins;
        var retroOptimalOnset = Math.max(1290, Math.min(retroPersonalOnset, 1530)); // clamp 21:30–01:30

        // Same sigmoid formula as full algo v3.2.0
        var retroOnsetDev = slMins - retroOptimalOnset;
        var retroOnsetWeight = -Math.tanh(retroOnsetDev / 60) * 1.5 + 0.5;
        retroOnsetWeight = clamp(retroOnsetWeight, -2.0, 1.2);

        // Hard floor: > 04:00 = catastrophe
        if (slMins > 1680) retroOnsetWeight = -2.0;

        estScore += retroOnsetWeight;
      }
    }

    // ── 4. Sleep duration: bell-curve matching full ШАГ 5 ──
    var slH = day.sleepHours || 0;
    // Fallback: compute from sleepStart + sleepEnd if available
    if (!slH && day.sleepStart && day.sleepEnd) {
      var sFm = parseTime(day.sleepStart);
      var eFm = parseTime(day.sleepEnd);
      if (sFm !== null && eFm !== null) {
        if (eFm < sFm) eFm += 1440;
        slH = (eFm - sFm) / 60;
      }
    }
    if (slH > 0) {
      // Personal optimal from prevDays median (mirrors full algo)
      var retroSleepVals = [];
      var rpds = prevDays || [];
      for (var rsi = 0; rsi < rpds.length; rsi++) {
        if (rpds[rsi] && rpds[rsi].sleepHours > 0) retroSleepVals.push(rpds[rsi].sleepHours);
      }
      var retroSleepOpt = retroSleepVals.length >= 3
        ? clamp(median(retroSleepVals), 6.0, 9.0)
        : POPULATION_DEFAULTS.sleepHours;

      // Bell curve: 1.5 × exp(−dev²/(2×0.8²)) − 0.5
      var slDev = Math.abs(slH - retroSleepOpt);
      var slWeight = 1.5 * Math.exp(-(slDev * slDev) / (2 * 0.8 * 0.8)) - 0.5;
      // Asymmetry: undersleep 1.3× worse
      if (slH < retroSleepOpt) slWeight *= 1.3;
      slWeight = clamp(slWeight, -2.0, 1.5);
      // Hard limits
      if (slH < 4.0) slWeight = -2.0;
      else if (slH > 12.0) slWeight = -0.5;

      estScore += slWeight;
    }

    // ── 5. Steps: tanh matching full ШАГ 6 ──
    var retSteps = day.steps || 0;
    if (retSteps > 0) {
      var retStepsGoal = 8000; // population default
      // Use prevDays rolling avg if available
      var retStepVals = [];
      var rpst = prevDays || [];
      for (var sti = 0; sti < rpst.length; sti++) {
        if (rpst[sti] && rpst[sti].steps > 0) retStepVals.push(rpst[sti].steps);
      }
      if (retStepVals.length >= 5) {
        var retStepAvg = retStepVals.reduce(function (a, b) { return a + b; }, 0) / retStepVals.length;
        retStepsGoal = Math.max(5000, retStepAvg * 1.05);
      }
      var stRatio = retSteps / retStepsGoal;
      var stWeight = clamp(Math.tanh((stRatio - 0.6) * 2.5) * 1.0 + 0.15, -0.5, 1.3);
      estScore += stWeight;
    }

    // ── 6. Checkin: streak-aware scoring (v3.4.1 — matches full ШАГ 7) ──
    if (day.weightMorning > 0) {
      var retroCheckinStreak = 0;
      var rpdCk = prevDays || [];
      for (var cki = 0; cki < rpdCk.length; cki++) {
        if (rpdCk[cki] && rpdCk[cki].weightMorning > 0) retroCheckinStreak++;
        else break;
      }
      var retroStreakBonus = Math.min(0.5, retroCheckinStreak * 0.05);
      estScore += Math.min(0.8, 0.3 + retroStreakBonus);
    }

    // ── 7. Household: log2-relative with adaptive baseline (v3.4.1) ──
    var retHM = day.householdMin || 0;
    if (retHM > 0) {
      // Use prevDays baseline if available (mirrors full algo getPersonalBaseline)
      var retHMbaseline = 30; // population default
      var hmHistVals = [];
      var rpdHM = prevDays || [];
      for (var hmi = 0; hmi < rpdHM.length; hmi++) {
        if (rpdHM[hmi] && rpdHM[hmi].householdMin > 0) hmHistVals.push(rpdHM[hmi].householdMin);
      }
      if (hmHistVals.length >= 3) retHMbaseline = median(hmHistVals);
      var retHMratio = retHM / retHMbaseline;
      var hmWeight = clamp(Math.log2(retHMratio + 0.5) * 0.8, -0.5, 1.2);
      estScore += hmWeight;
    }

    // ── 8. Supplements: simple ratio ──
    var retSuppTaken = day.supplementsTaken || 0;
    var retSuppPlanned = day.supplementsPlanned || 0;
    if (retSuppPlanned > 0) {
      var suppRatio = (typeof retSuppTaken === 'number' ? retSuppTaken : (Array.isArray(retSuppTaken) ? retSuppTaken.length : 0))
        / (typeof retSuppPlanned === 'number' ? retSuppPlanned : (Array.isArray(retSuppPlanned) ? retSuppPlanned.length : 0));
      estScore += clamp(suppRatio * 0.7 - 0.1, -0.3, 0.5);
    }

    // ── 9. Insulin wave approximation (meal gap proxy) ──
    // Can approximate from meal times: good gaps → bonus
    if (meals.length >= 2) {
      var mealTimes = [];
      for (var mti = 0; mti < meals.length; mti++) {
        var mtVal = parseTime(meals[mti] && meals[mti].time);
        if (mtVal !== null) mealTimes.push(mtVal);
      }
      mealTimes.sort(function (a, b) { return a - b; });
      if (mealTimes.length >= 2) {
        var avgGap = 0;
        for (var gi = 1; gi < mealTimes.length; gi++) {
          avgGap += mealTimes[gi] - mealTimes[gi - 1];
        }
        avgGap /= (mealTimes.length - 1);
        // Good gaps (≥ 150 min) → small bonus, poor gaps → small penalty
        var gapWeight = clamp((avgGap - 120) / 180 * 0.5, -0.3, 0.5);
        estScore += gapWeight;
      }
    }

    // ── 10. Measurements: approximate full algo ШАГ 8 ──
    var retMeas = (day && day.measurements) || null;
    var retMeasKeys = retMeas ? Object.keys(retMeas).filter(function (k) { return retMeas[k] > 0; }) : [];
    if (retMeasKeys.length > 0) {
      var retMeasCompleteness = retMeasKeys.length / 4; // 4 measurements: waist, hips, thigh, biceps
      estScore += clamp(0.5 + retMeasCompleteness * 0.7, 0, 1.2);
    }

    // ── 11. Cross-factor synergy approximation (v3.4.1) ──
    // Full algo awards up to +1.3 for synergies. Approximate with simple rules.
    var retroPositiveFactors = 0;
    if (retroMealCount >= 3) retroPositiveFactors++;
    if (retroHasTraining) retroPositiveFactors++;
    if (slH >= 6.5) retroPositiveFactors++;
    if (retSteps > 0) retroPositiveFactors++;
    if (day.weightMorning > 0) retroPositiveFactors++;
    if (retHM > 0) retroPositiveFactors++;
    var retroSynergyBonus = 0;
    if (retroPositiveFactors >= 5) retroSynergyBonus = 0.5;
    else if (retroPositiveFactors >= 4) retroSynergyBonus = 0.3;
    else if (retroPositiveFactors >= 3) retroSynergyBonus = 0.15;
    estScore += retroSynergyBonus;

    // Normalize: estScore / MOMENTUM_TARGET → DCS
    // Full algo can reach 10+ for great days with synergies; retro tops out ~8
    var retroDcs = clamp(estScore / MOMENTUM_TARGET, CRS_DCS_CLAMP_NEG, 1.0);

    return retroDcs;
  }

  /**
   * Compute Daily Contribution Score (DCS) from daily score.
   * Normalizes to -1.0..+1.0 with inertia protection.
   * Critical Violation Override bypasses inertia for severe events.
   */
  function computeDailyContribution(dailyScore, day, normAbs, pIndex, prof) {
    var dcs = clamp(dailyScore / MOMENTUM_TARGET, CRS_DCS_CLAMP_NEG, 1.0);
    var hasCriticalViolation = false;
    var violationType = null;

    var meals = (day && day.meals) || [];
    var normKcal = (normAbs && normAbs.kcal) || 2000;
    var hasNightHarm = false;
    var hasExcessKcal = false;

    // Night eating with harm ≥ 7 (00:00–06:00)
    for (var i = 0; i < meals.length; i++) {
      var mealTime = parseTime(meals[i] && meals[i].time);
      if (mealTime !== null && mealTime >= 0 && mealTime < 360) {
        if (checkMealHarm(meals[i], pIndex)) {
          hasNightHarm = true;
        }
      }
    }

    // Excess kcal > 150% of norm
    var totalKcal = 0;
    for (var j = 0; j < meals.length; j++) {
      var items = (meals[j] && meals[j].items) || [];
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        var g = it.grams || it.g || 100;
        var product = pIndex
          ? ((HEYS.dayUtils && HEYS.dayUtils.getProductFromItem && HEYS.dayUtils.getProductFromItem(it, pIndex))
            || (HEYS.models && HEYS.models.getProductFromItem && HEYS.models.getProductFromItem(it, pIndex)))
          : null;
        if (product) {
          totalKcal += ((product.kcal || product.kcal100 || 0) * g / 100);
        } else {
          totalKcal += (it.kcal || 0);
        }
      }
    }
    if (normKcal > 0 && totalKcal > normKcal * 1.5) hasExcessKcal = true;

    // Critical Violation Override — bypasses inertia protection
    if (hasNightHarm && hasExcessKcal) {
      dcs = -1.0; violationType = 'night_harm_excess';
    } else if (hasNightHarm) {
      dcs = -0.8; violationType = 'night_harm';
    } else if (hasExcessKcal) {
      dcs = -0.6; violationType = 'excess_kcal';
    }

    // v3.1.0: Goal-aware DCS override for deficit/bulk users
    // v3.3.0: training-day calorie tolerance — training burns extra, don't penalize normal eating
    var deficitContext = null;
    var totalKcalRatio = normKcal > 0 ? totalKcal / normKcal : 0;
    var dayTrainings = (day && day.trainings) || [];
    var isTrainingDayForDeficit = dayTrainings.length > 0;
    var deficitTolerance = isTrainingDayForDeficit ? 1.2 : 1.0; // +20% kcal allowance on training days
    if (prof) {
      var dcGoalMode = getGoalMode(prof.deficitPctTarget);
      if (dcGoalMode.mode === 'deficit') {
        // v3.3.0: apply training-day tolerance to all deficit thresholds
        var adjCriticalOver = dcGoalMode.criticalOver * deficitTolerance;
        var adjTargetMax = dcGoalMode.targetRange.max * deficitTolerance;
        var adjLevel3 = 1.5 * deficitTolerance;
        if (totalKcalRatio > adjLevel3) {
          // Level 3: >150% (×tolerance) в дефиците — жёстче generic -0.6 (если нет ночного вреда)
          if (!hasNightHarm) {
            dcs = -0.7; violationType = 'deficit_critical_excess';
          }
          deficitContext = { goalMode: 'deficit', ratio: +totalKcalRatio.toFixed(2), appliedPenalty: dcs, level: 3 };
        } else if (totalKcalRatio > adjCriticalOver) {
          // Level 2: e.g. >115%×tolerance — критическое нарушение, не покрытое generic
          if (violationType === null) {
            dcs = -0.5; violationType = 'deficit_overshoot';
          }
          deficitContext = { goalMode: 'deficit', ratio: +totalKcalRatio.toFixed(2), appliedPenalty: dcs, level: 2 };
        } else if (totalKcalRatio > adjTargetMax) {
          // Level 1: e.g. >105%×tolerance — ослабляем инерционную защиту
          if (violationType === null) {
            dcs = Math.min(dcs, -0.4); // vs стандартный clamp -0.3
          }
          deficitContext = { goalMode: 'deficit', ratio: +totalKcalRatio.toFixed(2), appliedPenalty: dcs, level: 1 };
        }
        if (deficitContext) {
          deficitContext.trainingTolerance = deficitTolerance;
          console.info('[HEYS.cascade.deficit] 📊 Goal-aware DCS override:', {
            level: deficitContext.level,
            ratio: deficitContext.ratio,
            criticalOver: +adjCriticalOver.toFixed(2),
            targetMax: +adjTargetMax.toFixed(2),
            rawCriticalOver: dcGoalMode.criticalOver,
            rawTargetMax: dcGoalMode.targetRange.max,
            trainingTolerance: deficitTolerance,
            isTrainingDay: isTrainingDayForDeficit,
            appliedPenalty: deficitContext.appliedPenalty,
            violationType: violationType
          });
        }
      } else if (dcGoalMode.mode === 'bulk' && totalKcalRatio <= 1.8 && violationType === 'excess_kcal') {
        // Bulk: не штрафуем превышение до 180% (фаза набора)
        violationType = null;
        dcs = clamp(dailyScore / MOMENTUM_TARGET, CRS_DCS_CLAMP_NEG, 1.0);
        deficitContext = { goalMode: 'bulk', ratio: +totalKcalRatio.toFixed(2), appliedPenalty: 0, bulkExempt: true };
        console.info('[HEYS.cascade.deficit] 💪 Bulk exemption: kcal overage ' + (totalKcalRatio * 100).toFixed(0) + '% ≤ 180%, penalty removed');
      }
    }

    hasCriticalViolation = violationType !== null;
    return { dcs: dcs, hasCriticalViolation: hasCriticalViolation, violationType: violationType, deficitContext: deficitContext };
  }

  /**
   * Compute individual ceiling — max CRS for this user.
   * Grows with consistency, factor diversity, and data depth.
   * ceiling = min(1.0, base × consistency × diversity + dataDepth)
   */
  function computeIndividualCeiling(dcsByDate, prevDays, rawWeights) {
    var dcsValues = [];
    var dates = Object.keys(dcsByDate);
    for (var i = 0; i < dates.length; i++) {
      dcsValues.push(dcsByDate[dates[i]]);
    }

    // Consistency: 1 + clamp((1 - CV) × 0.3, 0, 0.3)
    var consistency = 1.0;
    if (dcsValues.length >= 5) {
      var meanVal = dcsValues.reduce(function (a, b) { return a + b; }, 0) / dcsValues.length;
      if (meanVal > 0) {
        var cv = stdev(dcsValues) / meanVal;
        consistency = 1 + clamp((1 - cv) * 0.3, 0, 0.3);
      }
    }

    // Diversity: count unique factor types with data in 3+ of 30 days
    var factorCounts = {
      household: 0, sleepOnset: 0, sleepDur: 0, steps: 0,
      checkin: 0, measurements: 0, supplements: 0, insulin: 0, training: 0
    };
    for (var di = 0; di < prevDays.length; di++) {
      var d = prevDays[di];
      if (!d) continue;
      if (d.householdMin > 0) factorCounts.household++;
      if (d.sleepStart) factorCounts.sleepOnset++;
      if (d.sleepHours > 0) factorCounts.sleepDur++;
      if (d.steps > 0) factorCounts.steps++;
      if (d.weightMorning > 0) factorCounts.checkin++;
      if (d.measurements && Object.keys(d.measurements).some(function (k) { return d.measurements[k] > 0; })) factorCounts.measurements++;
      if (d.supplementsTaken && d.supplementsTaken.length > 0) factorCounts.supplements++;
      if (d.meals && d.meals.length >= 2) factorCounts.insulin++;
      if (d.trainings && d.trainings.length > 0) factorCounts.training++;
    }
    var activatedFactors = 0;
    var ftKeys = Object.keys(factorCounts);
    for (var fk = 0; fk < ftKeys.length; fk++) {
      if (factorCounts[ftKeys[fk]] >= 3) activatedFactors++;
    }
    var diversity = 1 + (activatedFactors / 10) * 0.15;

    // Data depth: +0.03 per full week (up to 4 weeks = +0.12)
    var daysWithData = 0;
    for (var dd = 0; dd < prevDays.length; dd++) {
      if (prevDays[dd]) daysWithData++;
    }
    var fullWeeks = Math.min(4, Math.floor(daysWithData / 7));
    var dataDepth = 0.03 * fullWeeks;

    var ceiling = Math.min(1.0, CRS_CEILING_BASE * consistency * diversity + dataDepth);

    return {
      ceiling: +ceiling.toFixed(3),
      consistency: +consistency.toFixed(3),
      diversity: +diversity.toFixed(3),
      dataDepth: +dataDepth.toFixed(3),
      activatedFactors: activatedFactors,
      daysWithData: daysWithData,
      fullWeeks: fullWeeks
    };
  }

  /**
   * Compute CRS via Exponential Moving Average (EMA).
   * 30-day window, α=0.95 decay. Days without data are skipped.
   * v3.3.0: today (i=0) is weighted by day completion fraction
   * to avoid incomplete day dragging CRS down.
   */
  function computeCascadeRate(dcsByDate, ceiling, todayDate) {
    var weights = [];
    var values = [];
    var today = todayDate ? new Date(todayDate + 'T12:00:00') : new Date();

    // v3.3.0: compute day progress fraction for today
    var now = new Date();
    var todayProgress = Math.max(0.2, Math.min(1.0,
      (now.getHours() * 60 + now.getMinutes()) / 1440));

    for (var i = 0; i < CRS_WINDOW; i++) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var dateKey = d.toISOString().slice(0, 10);
      var dcsVal = dcsByDate[dateKey];

      if (dcsVal !== undefined && dcsVal !== null) {
        var weight = Math.pow(CRS_DECAY, i);
        // v3.3.0: discount today's weight by day completion fraction
        // At 8am weight ×0.33, at 17:00 ×0.71, at 23:59 ×1.0
        if (i === 0) weight *= todayProgress;
        weights.push(weight);
        values.push(dcsVal * weight);
      }
      // Days without data are skipped (not penalized)
    }

    if (weights.length === 0) return 0;

    var totalWeight = weights.reduce(function (a, b) { return a + b; }, 0);
    var crsRaw = values.reduce(function (a, b) { return a + b; }, 0) / totalWeight;

    return +clamp(crsRaw, 0, ceiling).toFixed(3);
  }

  /**
   * Compute CRS trend over last 7 days (up/down/flat).
   * Compares recent 3-day avg DCS to prior 4-7 day avg DCS.
   */
  function getCrsTrend(dcsByDate, todayDate) {
    var today = todayDate ? new Date(todayDate + 'T12:00:00') : new Date();
    var recent = []; // last 3 days DCS
    var prior = [];  // 4-7 days ago DCS

    for (var i = 0; i < 7; i++) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var dateKey = d.toISOString().slice(0, 10);
      var val = dcsByDate[dateKey];
      if (val !== undefined && val !== null) {
        if (i < 3) recent.push(val);
        else prior.push(val);
      }
    }

    if (recent.length === 0 || prior.length === 0) return 'flat';

    var recentAvg = recent.reduce(function (a, b) { return a + b; }, 0) / recent.length;
    var priorAvg = prior.reduce(function (a, b) { return a + b; }, 0) / prior.length;
    var diff = recentAvg - priorAvg;

    if (diff > 0.05) return 'up';
    if (diff < -0.05) return 'down';
    return 'flat';
  }

  // ─────────────────────────────────────────────────────
  // ДВИЖОК: computeCascadeState
  // ─────────────────────────────────────────────────────

  function computeCascadeState(day, dayTot, normAbs, prof, pIndex) {
    var t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    console.info('[HEYS.cascade] ─── computeCascadeState v3.3.0 START ────────');
    console.info('[HEYS.cascade] 🧬 v3.3.0 features: CRS cumulative momentum | soft chain degradation | continuous scoring | personal baselines | circadian awareness | confidence layer | day-type detection | cross-factor synergies | goal-aware calorie penalty | chronotype-tolerant sleep scoring | partial-day weighting');
    console.info('[HEYS.cascade] 📥 Input data:', {
      hasMeals: !!(day && day.meals && day.meals.length),
      mealsCount: (day && day.meals && day.meals.length) || 0,
      hasTrainings: !!(day && day.trainings && day.trainings.length),
      trainingsCount: (day && day.trainings && day.trainings.length) || 0,
      water: (day && day.water) || 0,
      steps: (day && day.steps) || 0,
      sleepStart: (day && day.sleepStart) || null,
      sleepHours: (day && day.sleepHours) || 0,
      householdMin: (day && day.householdMin) || 0,
      weightMorning: (day && day.weightMorning) || 0,
      hasMeasurements: !!(day && day.measurements),
      hasSupplements: !!(day && day.supplementsTaken),
      hasNormAbs: !!normAbs,
      kcalNorm: normAbs ? normAbs.kcal : null,
      hasProf: !!prof,
      hasPIndex: !!pIndex
    });

    var events = [];
    var meals = (day && day.meals) || [];
    var trainings = (day && day.trainings) || [];
    var water = (day && day.water) || 0;
    var steps = (day && day.steps) || 0;
    var now = new Date();
    var currentHour = now.getHours();
    var currentMinutes = now.getHours() * 60 + now.getMinutes();

    var score = 0;

    // v3.0.0: Load 30-day history for CRS; first 14 for baseline/confidence/streak
    var prevDays30 = getPreviousDays(CRS_WINDOW);
    var prevDays14 = prevDays30.slice(0, 14);
    var confidenceMap = {};
    var rawWeights = {};
    var iwAvgGap = 0; // hoisted for synergy access

    // ── ШАГ 1: Бытовая активность (adaptive baseline + log2) ──
    var householdMin = (day && day.householdMin) || 0;
    var baselineNEAT = getPersonalBaseline(prevDays14, function (d) { return d.householdMin; }, POPULATION_DEFAULTS.householdMin);
    var neatConfidence = getFactorConfidence(prevDays14, function (d) { return d.householdMin; });
    confidenceMap.household = neatConfidence;

    if (householdMin > 0) {
      var neatRatio = householdMin / baselineNEAT;
      var householdWeight = clamp(Math.log2(neatRatio + 0.5) * 0.8, -0.5, 1.2);
      var rawHousehold = householdWeight;
      householdWeight *= neatConfidence;
      rawWeights.household = rawHousehold;
      score += householdWeight;
      events.push({
        type: 'household',
        time: null,
        positive: true,
        icon: EVENT_ICONS.household,
        label: 'Бытовая активность ' + householdMin + ' мин',
        sortKey: 599,
        weight: householdWeight
      });
      console.info('[HEYS.cascade] 🏠 [EVENT] household (model v2.1.0 log2 adaptive):', {
        householdMin: householdMin, baseline: Math.round(baselineNEAT),
        ratio: +neatRatio.toFixed(2), formula: 'log2(' + +neatRatio.toFixed(2) + '+0.5)×0.8',
        rawWeight: +rawHousehold.toFixed(2),
        confidence: neatConfidence, adjustedWeight: +householdWeight.toFixed(2)
      });
    } else {
      var houseStreak = countConsecutive(prevDays14, function (d) { return !d || !(d.householdMin > 9); });
      if (houseStreak > 2) {
        var hPenalty = Math.max(-0.5, -0.08 * Math.pow(houseStreak - 2, 0.7));
        hPenalty *= neatConfidence;
        rawWeights.household = hPenalty / (neatConfidence || 1);
        score += hPenalty;
        console.info('[HEYS.cascade] 🏠 Household streak penalty:', { streakDays: houseStreak, penalty: +hPenalty.toFixed(2), confidence: neatConfidence });
      } else {
        rawWeights.household = 0;
        console.info('[HEYS.cascade] 🏠 No household data today, streak=' + houseStreak + ' (no penalty yet)');
      }
    }

    // ── ШАГ 2: Приёмы пищи ──────────────────────────────
    var cumulativeKcal = 0;

    // v3.1.0: Goal-aware calorie penalty — определяем режим цели один раз до цикла
    var mealGoalMode = getGoalMode(prof && prof.deficitPctTarget);
    var hasDeficitOvershoot = false;
    var deficitOvershootRatio = 0;
    console.info('[HEYS.cascade.deficit] 🎯 Goal mode for meal loop:', {
      mode: mealGoalMode.mode, label: mealGoalMode.label,
      targetRange: mealGoalMode.targetRange, criticalOver: mealGoalMode.criticalOver,
      deficitPctTarget: prof && prof.deficitPctTarget
    });

    console.info('[HEYS.cascade] 🥗 Processing', meals.length, 'meals...');

    meals.forEach(function (meal, i) {
      var items = (meal && meal.items) || [];
      var mealKcal = items.reduce(function (sum, it) {
        var g = it.grams || it.g || 100;
        var p = pIndex
          ? ((HEYS.dayUtils && HEYS.dayUtils.getProductFromItem && HEYS.dayUtils.getProductFromItem(it, pIndex))
            || (HEYS.models && HEYS.models.getProductFromItem && HEYS.models.getProductFromItem(it, pIndex)))
          : null;
        if (p) {
          var kcal100 = p.kcal || p.kcal100 || 0;
          return sum + (kcal100 * g / 100);
        }
        return sum + (it.kcal || 0);
      }, 0);

      cumulativeKcal += mealKcal;
      var normKcal = (normAbs && normAbs.kcal) || 0;
      var cumulativeRatio = normKcal ? (cumulativeKcal / normKcal) : 0;
      var overNorm = normKcal ? cumulativeRatio > 1.2 : false;
      var hasHarm = checkMealHarm(meal, pIndex);
      var timeMins = parseTime(meal && meal.time);
      var isLate = timeMins !== null && timeMins >= 1380;

      // ─ v2.1.0: Hard violations (harm ≥ 7, late > 23:00) ─
      var hasHardViolation = hasHarm || isLate;
      var positive = !hasHardViolation;
      var breakReason = hasHarm ? 'Вредный продукт' : (isLate ? 'Поздний приём' : null);

      // ─ Quality scoring via getMealQualityScore (0–100) ─
      var mealQS = null;
      var mealScoringFn = (HEYS.mealScoring && typeof HEYS.mealScoring.getMealQualityScore === 'function')
        ? HEYS.mealScoring.getMealQualityScore.bind(HEYS.mealScoring)
        : (typeof HEYS.getMealQualityScore === 'function' ? HEYS.getMealQualityScore : null);

      if (mealScoringFn && pIndex) {
        try {
          mealQS = mealScoringFn(meal, null, normKcal || 2000, pIndex, null);
        } catch (err) {
          // Non-blocking — continue with fallback
        }
      }

      // ─ v2.1.0: Continuous scoring (linear interpolation) ─
      // 0→-1.0, 20→-0.5, 40→0.0, 60→+0.5, 80→+1.0, 100→+1.5
      var mealWeight;
      var qualityGrade = null;

      if (mealQS && mealQS.score != null) {
        var qs = mealQS.score; // 0–100
        mealWeight = clamp((qs - 40) / 40, -1.0, 1.5);
        qualityGrade = qs >= 80 ? 'excellent' : qs >= 60 ? 'good' : qs >= 40 ? 'ok' : qs >= 20 ? 'poor' : 'bad';

        // Poor/bad quality → break chain
        if (qs < 20 && positive) {
          positive = false;
          breakReason = breakReason || 'Низкое качество';
        } else if (qs < 40 && positive) {
          positive = false;
          breakReason = breakReason || 'Слабый приём';
        }
      } else {
        // Fallback binary
        mealWeight = positive ? EVENT_WEIGHTS.meal_positive : EVENT_WEIGHTS.meal_negative;
      }

      // Circadian modifier: breakfast ×1.3, late dinner ×0.7
      if (timeMins !== null && timeMins < 1380 && !hasHardViolation) {
        var circMult = getCircadianMultiplier(timeMins);
        mealWeight *= circMult;
      }

      // Progressive cumulative penalty (sigmoid) — v3.1.0 goal-aware
      if (normKcal > 0 && !hasHardViolation) {
        var penaltyThreshold, penaltyStrength, penaltyLabel;
        if (mealGoalMode.mode === 'bulk') {
          // При наборе массы: штрафуем только при грубом переедании >130%
          penaltyThreshold = 1.30;
          penaltyStrength = 1.0;
          penaltyLabel = 'Перебор ккал (' + Math.round(cumulativeRatio * 100) + '%)';
        } else if (mealGoalMode.mode === 'deficit') {
          // При дефиците: штраф начинается раньше (выше целевого максимума) и жёсче
          penaltyThreshold = mealGoalMode.targetRange.max; // 1.05 или 1.08
          penaltyStrength = 2.0; // строже стандартных 1.5
          penaltyLabel = 'Перебор при дефиците (' + Math.round(cumulativeRatio * 100) + '%)';
        } else {
          // Maintenance: стандартная логика
          penaltyThreshold = 1.0;
          penaltyStrength = 1.5;
          penaltyLabel = 'Перебор ккал (' + Math.round(cumulativeRatio * 100) + '%)';
        }
        if (cumulativeRatio > penaltyThreshold) {
          var cumulPenalty = -Math.tanh((cumulativeRatio - penaltyThreshold) / 0.2) * penaltyStrength;
          mealWeight = Math.min(mealWeight, cumulPenalty);
          positive = false;
          breakReason = breakReason || penaltyLabel;
        }
      }

      // Hard violations always force -1.0
      if (hasHardViolation) {
        mealWeight = -1.0;
      }

      score += mealWeight;

      events.push({
        type: 'meal',
        time: (meal && meal.time) || null,
        positive: positive,
        icon: EVENT_ICONS.meal,
        label: getMealLabel(meal, i),
        sortKey: timeMins !== null ? timeMins : (500 + i * 120),
        breakReason: breakReason,
        weight: mealWeight,
        qualityScore: mealQS ? mealQS.score : null,
        qualityGrade: qualityGrade,
        qualityColor: mealQS ? mealQS.color : null
      });

      // Явная строка — всегда читается без разворачивания объекта
      if (mealQS && mealQS.score != null) {
        console.info('[HEYS.cascade] 🎯 Meal quality (' + getMealLabel(meal, i) + '): score=' + mealQS.score + ' grade=' + qualityGrade + ' weight=' + (+mealWeight).toFixed(2) + ' color=' + mealQS.color + ' scoringModel=v2.1.0-continuous');
      } else {
        console.warn('[HEYS.cascade] ⚠️ getMealQualityScore недоступен (' + getMealLabel(meal, i) + ') → fallback weight=' + mealWeight + ' | HEYS.mealScoring=' + (typeof (HEYS.mealScoring && HEYS.mealScoring.getMealQualityScore)) + ' pIndex=' + (!!pIndex));
      }

      console.info('[HEYS.cascade] 🍽️ [MEAL ' + (i + 1) + '/' + meals.length + '] ' + getMealLabel(meal, i) + ' (model v2.1.0 continuous + circadian):', {
        time: (meal && meal.time) || null,
        mealKcal: Math.round(mealKcal),
        cumulativeKcal: Math.round(cumulativeKcal),
        normKcal: Math.round(normKcal),
        cumulativeRatio: +cumulativeRatio.toFixed(2),
        circadianModifier: (timeMins !== null && timeMins < 1380 && !hasHardViolation) ? +getCircadianMultiplier(timeMins).toFixed(2) : 'N/A',
        hasHarm: hasHarm,
        isLate: isLate,
        positive: positive,
        breakReason: breakReason,
        quality: mealQS
          ? { score: mealQS.score, grade: qualityGrade, formula: 'clamp((' + mealQS.score + '-40)/40)' }
          : '(getMealQualityScore недоступен)',
        weight: +(mealWeight).toFixed(2)
      });
    });

    // ── ШАГ 2.5: Deficit Overshoot Summary (v3.1.0) ────────────
    // После обработки всех приёмов пищи — итоговый срыв по калориям при цели похудения
    if (mealGoalMode.mode === 'deficit' && normAbs && normAbs.kcal > 0) {
      var finalKcalRatio = cumulativeKcal / normAbs.kcal;
      if (finalKcalRatio > mealGoalMode.criticalOver) {
        // Критический перебор (>115% при активном дефиците, >120% при лёгком)
        var defCritPenalty = -1.5;
        score += defCritPenalty;
        hasDeficitOvershoot = true;
        deficitOvershootRatio = finalKcalRatio;
        events.push({
          type: 'deficit_overshoot',
          positive: false,
          icon: '🔴',
          label: 'Перебор при похудении — ' + Math.round(finalKcalRatio * 100) + '% от нормы',
          sortKey: 1439,
          breakReason: 'Критический перебор: ' + Math.round(finalKcalRatio * 100) + '% (цель: ' + mealGoalMode.label + ')',
          weight: defCritPenalty
        });
        console.info('[HEYS.cascade.deficit] 🔴 Критический перебор при дефиците:', {
          goalMode: mealGoalMode.mode, goalLabel: mealGoalMode.label,
          criticalOver: mealGoalMode.criticalOver, actualRatio: +finalKcalRatio.toFixed(2),
          overshootPct: '+' + Math.round((finalKcalRatio - 1) * 100) + '%',
          penalty: defCritPenalty, crsNote: 'DCS override → -0.7 (через computeDailyContribution)'
        });
      } else if (finalKcalRatio > mealGoalMode.targetRange.max) {
        // Ощутимый перебор (>105%/108%)
        var defWarnPenalty = -0.5;
        score += defWarnPenalty;
        hasDeficitOvershoot = true;
        deficitOvershootRatio = finalKcalRatio;
        events.push({
          type: 'deficit_warning',
          positive: false,
          icon: '⚠️',
          label: 'Калории выше цели (' + Math.round(finalKcalRatio * 100) + '% от нормы)',
          sortKey: 1438,
          breakReason: 'Перебор при ' + mealGoalMode.label + ': ' + Math.round(finalKcalRatio * 100) + '%',
          weight: defWarnPenalty
        });
        console.info('[HEYS.cascade.deficit] ⚠️ Ощутимый перебор при дефиците:', {
          goalMode: mealGoalMode.mode, goalLabel: mealGoalMode.label,
          targetMax: mealGoalMode.targetRange.max, actualRatio: +finalKcalRatio.toFixed(2),
          overshootPct: '+' + Math.round((finalKcalRatio - 1) * 100) + '%',
          penalty: defWarnPenalty, crsNote: 'DCS clamp → -0.4 (через computeDailyContribution)'
        });
      }
    }
    if (mealGoalMode.mode === 'deficit') {
      console.info('[HEYS.cascade.deficit] ✅ Deficit calorie check complete:', {
        hasDeficitOvershoot: hasDeficitOvershoot,
        deficitRatio: deficitOvershootRatio ? +deficitOvershootRatio.toFixed(2) : null,
        cumulativeKcal: Math.round(cumulativeKcal),
        normKcal: (normAbs && normAbs.kcal) || 0,
        goalLabel: mealGoalMode.label
      });
    }

    // ── ШАГ 3: Тренировки (load × intensity, diminishing returns, recovery-aware) ──
    console.info('[HEYS.cascade] 💪 Processing', trainings.length, 'trainings...');
    var todayTotalLoad = 0;
    var trainingConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.trainings && d.trainings.length; });
    confidenceMap.training = trainingConfidence;

    if (trainings.length > 0) {
      var sessionWeights = [];
      trainings.forEach(function (tr, ti) {
        var timeMins = parseTime(tr && tr.time);
        var dur = getTrainingDuration(tr);
        var load = getTrainingLoad(tr);
        todayTotalLoad += load;
        // sqrt-curve: diminishing returns on load
        var sessionWeight = clamp(Math.sqrt(load / 30) * 1.2, 0.3, 3.0);
        sessionWeights.push(sessionWeight);
        var trainingWeight;
        if (ti === 0) {
          trainingWeight = sessionWeight;
        } else if (ti === 1) {
          trainingWeight = sessionWeight * 0.5; // 2nd session: half credit
        } else {
          trainingWeight = sessionWeight * 0.25; // 3rd+: quarter credit
        }
        trainingWeight *= trainingConfidence;
        rawWeights['training_' + ti] = sessionWeight;
        score += trainingWeight;
        var trType = (tr && tr.type) || '';
        events.push({
          type: 'training',
          time: (tr && tr.time) || null,
          positive: true,
          icon: EVENT_ICONS.training,
          label: 'Тренировка ' + dur + ' мин' + (trType ? ' (' + trType + ')' : ''),
          sortKey: timeMins !== null ? timeMins : 700,
          weight: trainingWeight
        });
        console.info('[HEYS.cascade] 💪 [TRAINING ' + (ti + 1) + '/' + trainings.length + '] (model v2.1.0 load×intensity + sqrt curve):', {
          time: (tr && tr.time) || null, duration: dur, type: trType || 'unknown',
          load: Math.round(load), formula: 'sqrt(' + Math.round(load) + '/30)×1.2',
          sessionWeight: +sessionWeight.toFixed(2),
          diminishingFactor: ti === 0 ? '1.0 (full)' : ti === 1 ? '0.5 (2nd session)' : '0.25 (3rd+)',
          confidence: trainingConfidence, adjustedWeight: +trainingWeight.toFixed(2)
        });
      });
    } else {
      // Recovery-aware: check if yesterday had intense training
      var yesterdayLoad = 0;
      if (prevDays14[0] && prevDays14[0].trainings) {
        prevDays14[0].trainings.forEach(function (t) { yesterdayLoad += getTrainingLoad(t); });
      }
      var isPlannedRecovery = yesterdayLoad > 60;
      if (isPlannedRecovery) {
        // Planned recovery after heavy training: small bonus instead of penalty
        var recoveryBonus = 0.2 * trainingConfidence;
        rawWeights.training_recovery = 0.2;
        score += recoveryBonus;
        console.info('[HEYS.cascade] 💪 Planned recovery day (yesterday load=' + Math.round(yesterdayLoad) + '):', { bonus: +recoveryBonus.toFixed(2) });
      } else {
        var trainStreak = countConsecutive(prevDays14, function (d) { return !d || !(d.trainings && d.trainings.length > 0); });
        if (trainStreak > 2) {
          var weeklyLoad = 0;
          for (var wl = 0; wl < Math.min(7, prevDays14.length); wl++) {
            if (prevDays14[wl] && prevDays14[wl].trainings) {
              prevDays14[wl].trainings.forEach(function (t) { weeklyLoad += getTrainingLoad(t); });
            }
          }
          var weeklyTarget = POPULATION_DEFAULTS.weeklyTrainingLoad;
          var weeklyRatio = weeklyTarget > 0 ? weeklyLoad / weeklyTarget : 0;
          if (weeklyRatio < 0.8) {
            var tPenalty = Math.max(-0.5, -0.15 * (trainStreak - 2));
            tPenalty *= trainingConfidence;
            rawWeights.training_penalty = tPenalty / (trainingConfidence || 1);
            score += tPenalty;
            console.info('[HEYS.cascade] 💪 Training streak penalty:', {
              streakDays: trainStreak, weeklyLoad: Math.round(weeklyLoad),
              weeklyTarget: Math.round(weeklyTarget), weeklyRatio: +weeklyRatio.toFixed(2),
              penalty: +tPenalty.toFixed(2), confidence: trainingConfidence
            });
          } else {
            rawWeights.training_penalty = 0;
            console.info('[HEYS.cascade] 💪 No trainings today, streak=' + trainStreak + ' but weekly load OK (' + weeklyRatio.toFixed(2) + ')');
          }
        } else {
          rawWeights.training_penalty = 0;
          console.info('[HEYS.cascade] 💪 No trainings today, streak=' + trainStreak + ' (no penalty yet)');
        }
      }
    }

    // ── ШАГ 4: Засыпание (chronotype-adaptive sigmoid + consistency) ──
    var sleepStart = (day && day.sleepStart) || '';
    var sleepEndVal = (day && day.sleepEnd) || null;
    // Pre-compute sleepHours для лейбла (ШАГ 5 пересчитает с full logic)
    var sleepHoursForLabel = (day && day.sleepHours) || 0;
    if (!sleepHoursForLabel && sleepStart && sleepEndVal) {
      var slPre = parseTime(sleepStart); var elPre = parseTime(sleepEndVal);
      if (slPre !== null && elPre !== null) {
        if (slPre < 360) slPre += 1440;
        if (elPre <= slPre) elPre += 1440;
        sleepHoursForLabel = Math.round((elPre - slPre) / 60 * 10) / 10;
      }
    }
    var sleepOnsetConfidence = getFactorConfidence(prevDays14, function (d) {
      return d && d.sleepStart ? parseTime(d.sleepStart) : null;
    });
    confidenceMap.sleepOnset = sleepOnsetConfidence;

    if (sleepStart) {
      var sleepMins = parseTime(sleepStart);
      if (sleepMins !== null && sleepMins < 360) sleepMins += 1440; // after midnight
      if (sleepMins !== null) {
        // v2.1.0: Chronotype-adaptive baseline from 14-day history
        var sleepOnsetValues = [];
        for (var si = 0; si < prevDays14.length; si++) {
          if (!prevDays14[si] || !prevDays14[si].sleepStart) continue;
          var soVal = parseTime(prevDays14[si].sleepStart);
          if (soVal !== null) {
            if (soVal < 360) soVal += 1440;
            sleepOnsetValues.push(soVal);
          }
        }
        var personalOnset = sleepOnsetValues.length >= 3 ? median(sleepOnsetValues) : POPULATION_DEFAULTS.sleepOnsetMins;
        var optimalOnset = Math.max(1290, Math.min(personalOnset, 1530)); // clamp 21:30–01:30 (v3.2.0: расширен для хронотипов-сов)

        // Sigmoid scoring: deviation from personal optimal
        var onsetDeviation = sleepMins - optimalOnset; // minutes (positive = later)
        // v3.2.0: смягчён sigmoid — длительность сна важнее точного времени засыпания
        var rawSleepOnset = -Math.tanh(onsetDeviation / 60) * 1.5 + 0.5;
        rawSleepOnset = clamp(rawSleepOnset, -2.0, 1.2);

        // Consistency bonus (low variance in sleep onset → stable circadian rhythm)
        var consistencyBonus = 0;
        if (sleepOnsetValues.length >= 5) {
          var onsetVariance = stdev(sleepOnsetValues);
          if (onsetVariance < 30) consistencyBonus = 0.3;
          else if (onsetVariance < 45) consistencyBonus = 0.15;
        }

        // Hard floor: after 04:00 = circadian catastrophe (v3.2.0: сдвинут с 03:00)
        if (sleepMins > 1680) { rawSleepOnset = -2.0; consistencyBonus = 0; }

        var sleepOnsetWeightFinal = (rawSleepOnset + consistencyBonus) * sleepOnsetConfidence;
        rawWeights.sleepOnset = rawSleepOnset + consistencyBonus;
        score += sleepOnsetWeightFinal;

        // v3.3.0: labels aligned with buildDayEventsSimple + v3.2.0 chronotype clamp (01:30)
        var sleepOnsetLabel = sleepMins <= 1320 ? 'Ранний сон' : sleepMins <= 1380 ? 'Сон до 23:00'
          : sleepMins <= 1440 ? 'Сон до полуночи' : sleepMins <= 1530 ? 'Поздний сон'
            : sleepMins <= 1620 ? 'Очень поздний сон' : 'Критически поздний сон';
        // sortKey: after-midnight sleep (sleepMins > 1440) → negative so it sorts
        // before morning checkin (sortKey=0) and meals. Pre-midnight → use raw value.
        var sleepSortKey = sleepMins > 1440 ? sleepMins - 2880 : sleepMins;
        // Полный лейбл: качество + время конца + длительность
        var sleepFullLabel = sleepOnsetLabel;
        if (sleepEndVal) sleepFullLabel += ' →' + sleepEndVal;
        if (sleepHoursForLabel > 0) sleepFullLabel += ' (' + sleepHoursForLabel.toFixed(1) + 'ч)';
        events.push({
          type: 'sleep',
          time: sleepStart,
          timeEnd: sleepEndVal,
          sleepHours: sleepHoursForLabel,
          positive: rawSleepOnset >= 0,
          icon: EVENT_ICONS.sleep,
          label: sleepFullLabel,
          sortKey: sleepSortKey,
          weight: sleepOnsetWeightFinal
        });
        console.info('[HEYS.cascade] 😴 Sleep onset (model v3.2.0 chronotype-tolerant sigmoid):', {
          sleepStart: sleepStart, sleepMins: sleepMins,
          personalOnset: Math.round(personalOnset), optimalOnset: Math.round(optimalOnset),
          deviationMin: Math.round(onsetDeviation),
          formula: '-tanh(' + Math.round(onsetDeviation) + '/60)×1.5+0.5',
          rawWeight: +rawSleepOnset.toFixed(2), consistencyBonus: +consistencyBonus.toFixed(2),
          onsetVariance: sleepOnsetValues.length >= 5 ? Math.round(stdev(sleepOnsetValues)) : 'N/A (need 5+ days)',
          confidence: sleepOnsetConfidence, adjustedWeight: +sleepOnsetWeightFinal.toFixed(2)
        });
      }
    } else {
      console.info('[HEYS.cascade] 😴 No sleepStart data — ШАГ 4 skipped');
    }

    // ── ШАГ 5: Длительность сна (personalized bell-curve + training recovery) ──
    var sleepHours = (day && day.sleepHours) || 0;
    if (!sleepHours && (day && day.sleepStart) && (day && day.sleepEnd)) {
      var sdm = parseTime(day.sleepStart); var edm = parseTime(day.sleepEnd);
      if (sdm !== null && edm !== null) {
        if (edm < sdm) edm += 1440;
        sleepHours = (edm - sdm) / 60;
      }
    }
    var sleepDurConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.sleepHours; });
    confidenceMap.sleepDur = sleepDurConfidence;

    if (sleepHours > 0) {
      // Personal optimal from 14-day median
      var personalSleepOpt = getPersonalBaseline(prevDays14, function (d) { return d.sleepHours; }, POPULATION_DEFAULTS.sleepHours);
      personalSleepOpt = clamp(personalSleepOpt, 6.0, 9.0);

      // Training recovery: need +0.5h after intense training yesterday
      var yesterdayTrainLoad = 0;
      if (prevDays14[0] && prevDays14[0].trainings) {
        prevDays14[0].trainings.forEach(function (t) { yesterdayTrainLoad += getTrainingLoad(t); });
      }
      if (yesterdayTrainLoad > 60) personalSleepOpt += 0.5;

      // Bell-curve scoring: Gaussian around personal optimal
      var sleepDev = Math.abs(sleepHours - personalSleepOpt);
      var rawSleepDur = 1.5 * Math.exp(-(sleepDev * sleepDev) / (2 * 0.8 * 0.8)) - 0.5;

      // Asymmetry: undersleep penalized 1.3x more than oversleep
      if (sleepHours < personalSleepOpt) rawSleepDur *= 1.3;

      // Hard limits
      if (sleepHours < 4.0) rawSleepDur = -2.0;
      else if (sleepHours > 12.0) rawSleepDur = -0.5;

      rawSleepDur = clamp(rawSleepDur, -2.0, 1.5);
      var sleepDurWeight = rawSleepDur * sleepDurConfidence;
      rawWeights.sleepDur = rawSleepDur;
      score += sleepDurWeight;
      console.info('[HEYS.cascade] 😴 Sleep duration (model v2.1.0 Gaussian bell-curve):', {
        sleepHours: +sleepHours.toFixed(1), personalOptimal: +personalSleepOpt.toFixed(1),
        deviation: +sleepDev.toFixed(1), formula: '1.5×exp(-' + sleepDev.toFixed(1) + '²/(2×0.8²))-0.5',
        asymmetry: sleepHours < personalSleepOpt ? '×1.3 (undersleep penalty)' : 'none',
        yesterdayTrainLoad: Math.round(yesterdayTrainLoad),
        trainingRecovery: yesterdayTrainLoad > 60 ? '+0.5h optimal shift' : 'none',
        rawWeight: +rawSleepDur.toFixed(2), confidence: sleepDurConfidence,
        adjustedWeight: +sleepDurWeight.toFixed(2)
      });
    } else {
      console.info('[HEYS.cascade] 😴 No sleepHours data — ШАГ 5 skipped');
    }

    // ── ШАГ 6: Шаги (rolling adaptive goal + tanh continuous) ──
    var stepsConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.steps; });
    confidenceMap.steps = stepsConfidence;
    var stepsWeight = 0;

    if (steps > 0) {
      // Adaptive goal: 14-day median × 1.05 (progressive overload)
      var rollingStepsAvg = getPersonalBaseline(prevDays14, function (d) { return d.steps; },
        (prof && (prof.stepsGoal || prof.steps_goal)) || POPULATION_DEFAULTS.steps);
      var adaptiveGoal = Math.max(5000, rollingStepsAvg * 1.05);
      var stepsRatio = steps / adaptiveGoal;

      // Continuous tanh scoring
      var rawSteps = clamp(Math.tanh((stepsRatio - 0.6) * 2.5) * 1.0 + 0.15, -0.5, 1.3);
      stepsWeight = rawSteps * stepsConfidence;
      rawWeights.steps = rawSteps;
      score += stepsWeight;

      var stepsLabel = stepsRatio >= 1.2
        ? ('Шаги — ' + Math.round(steps / 1000 * 10) / 10 + 'k (отлично!)')
        : stepsRatio >= 1.0
          ? ('Шаги — ' + Math.round(steps / 1000 * 10) / 10 + 'k (цель)')
          : ('Шаги — ' + Math.round(stepsRatio * 100) + '%');
      events.push({
        type: 'steps',
        time: null,
        positive: rawSteps > 0,
        icon: EVENT_ICONS.steps,
        label: stepsLabel,
        sortKey: 1100,
        weight: stepsWeight
      });
      console.info('[HEYS.cascade] 🚶 Steps (model v2.1.0 rolling adaptive + tanh):', {
        steps: steps, adaptiveGoal: Math.round(adaptiveGoal),
        ratio: +stepsRatio.toFixed(2), formula: 'tanh((' + stepsRatio.toFixed(2) + '-0.6)×2.5)×1.0+0.15',
        rawWeight: +rawSteps.toFixed(2),
        confidence: stepsConfidence, adjustedWeight: +stepsWeight.toFixed(2)
      });
    } else {
      rawWeights.steps = 0;
      console.info('[HEYS.cascade] 🚶 No steps data — ШАГ 6 skipped');
    }

    // ── ШАГ 7: Чекин веса (streak bonus + trend awareness) ──
    var weightMorning = (day && day.weightMorning) || 0;
    var checkinConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.weightMorning; });
    confidenceMap.checkin = checkinConfidence;

    if (weightMorning > 0) {
      var checkinBase = 0.3;
      // Streak bonus: consecutive check-ins (+0.05/day, max +0.5)
      var checkinStreak = countConsecutive(prevDays14, function (d) { return d && d.weightMorning > 0; });
      var streakBonus = Math.min(0.5, checkinStreak * 0.05);

      // Trend awareness: stability bonus if weight is stable ±50g/day
      var trendBonus = 0;
      var recentWeights = [];
      for (var cw = 0; cw < Math.min(7, prevDays14.length); cw++) {
        if (prevDays14[cw] && prevDays14[cw].weightMorning > 0) recentWeights.push(prevDays14[cw].weightMorning);
      }
      if (recentWeights.length >= 3) {
        var wFirst = recentWeights[recentWeights.length - 1];
        var wLast = recentWeights[0];
        var slope = (wLast - wFirst) / recentWeights.length;
        if (Math.abs(slope) < 0.05) trendBonus = 0.05; // stable weight
      }

      var rawCheckin = clamp(checkinBase + streakBonus + trendBonus, 0, 0.8);
      var checkinWeight = rawCheckin * checkinConfidence;
      rawWeights.checkin = rawCheckin;
      score += checkinWeight;
      events.push({
        type: 'checkin',
        time: null,
        positive: true,
        icon: EVENT_ICONS.checkin,
        label: 'Чекин веса: ' + weightMorning + ' кг' + (checkinStreak > 2 ? ' (' + (checkinStreak + 1) + ' д.)' : ''),
        sortKey: 540,
        weight: checkinWeight
      });
      console.info('[HEYS.cascade] ⚖️ Weight checkin (model v2.1.0 streak + trend):', {
        weight: weightMorning, base: checkinBase,
        streak: checkinStreak, streakBonus: +streakBonus.toFixed(2),
        trendBonus: +trendBonus.toFixed(2),
        formula: 'base(' + checkinBase + ') + streak(' + streakBonus.toFixed(2) + ') + trend(' + trendBonus.toFixed(2) + ')',
        rawWeight: +rawCheckin.toFixed(2),
        confidence: checkinConfidence, adjustedWeight: +checkinWeight.toFixed(2)
      });
    } else {
      // Mild habit-break penalty if streak was active
      var brokenStreak = countConsecutive(prevDays14, function (d) { return d && d.weightMorning > 0; });
      if (brokenStreak >= 3) {
        var breakPenalty = -0.1 * checkinConfidence;
        rawWeights.checkin = -0.1;
        score += breakPenalty;
        console.info('[HEYS.cascade] ⚖️ Checkin streak broken (was ' + brokenStreak + ' days):', { penalty: +breakPenalty.toFixed(2) });
      } else {
        rawWeights.checkin = 0;
        console.info('[HEYS.cascade] ⚖️ No weight checkin today — ШАГ 7 skipped');
      }
    }

    // ── ШАГ 8: Замеры (smart cadence + completeness score) ──
    var measurements = (day && day.measurements) || null;
    var measKeys = measurements ? Object.keys(measurements).filter(function (k) { return measurements[k] > 0; }) : [];
    var hasMeasToday = measKeys.length > 0;
    var measConfidence = getFactorConfidence(prevDays14, function (d) {
      return d && d.measurements && Object.keys(d.measurements).some(function (k) { return d.measurements[k] > 0; }) ? 1 : 0;
    });
    confidenceMap.measurements = measConfidence;

    if (hasMeasToday) {
      var totalPossible = 4; // waist, hips, thigh, biceps
      var completeness = measKeys.length / totalPossible;
      var rawMeas = 0.5 + completeness * 0.7; // 1 part → +0.67, all 4 → +1.2

      // Diminishing returns if measured yesterday too (weekly cadence is optimal)
      var lastMeasDayIdx = -1;
      for (var lm = 0; lm < prevDays14.length; lm++) {
        var plm = prevDays14[lm];
        if (plm && plm.measurements && Object.keys(plm.measurements).some(function (k) { return plm.measurements[k] > 0; })) {
          lastMeasDayIdx = lm + 1; break;
        }
      }
      if (lastMeasDayIdx !== -1 && lastMeasDayIdx <= 2) rawMeas *= 0.5;

      rawMeas = clamp(rawMeas, 0, 1.2);
      var measWeight = rawMeas * measConfidence;
      rawWeights.measurements = rawMeas;
      score += measWeight;
      events.push({
        type: 'measurements',
        time: null,
        positive: true,
        icon: EVENT_ICONS.measurements,
        label: 'Замеры тела (' + measKeys.length + '/' + totalPossible + ')',
        sortKey: 545,
        weight: measWeight
      });
      console.info('[HEYS.cascade] 📏 Measurements (model v2.1.0 completeness + cadence):', {
        count: measKeys.length, completeness: +completeness.toFixed(2),
        formula: '0.5 + ' + completeness.toFixed(2) + '×0.7',
        lastMeasDay: lastMeasDayIdx, diminishing: lastMeasDayIdx !== -1 && lastMeasDayIdx <= 2 ? '×0.5 (recent)' : 'none',
        rawWeight: +rawMeas.toFixed(2),
        confidence: measConfidence, adjustedWeight: +measWeight.toFixed(2)
      });
    } else {
      // Penalty if too long since last measurement
      var lastMeasSearch = -1;
      for (var pms = 0; pms < prevDays14.length; pms++) {
        var pds = prevDays14[pms];
        if (pds && pds.measurements && Object.keys(pds.measurements).some(function (k) { return pds.measurements[k] > 0; })) {
          lastMeasSearch = pms + 1; break;
        }
      }
      if (lastMeasSearch > 7) {
        var measPenalty = clamp(-0.05 * (lastMeasSearch - 7), -0.3, 0);
        measPenalty *= measConfidence;
        rawWeights.measurements = measPenalty / (measConfidence || 1);
        score += measPenalty;
        console.info('[HEYS.cascade] 📏 Measurements penalty:', { lastMeasDay: lastMeasSearch, penalty: +measPenalty.toFixed(2) });
      } else {
        rawWeights.measurements = 0;
      }
    }

    // ── ШАГ 9: Витамины (continuous + streak bonus) ─────
    var suppTaken = (day && day.supplementsTaken) ? day.supplementsTaken.length : 0;
    var suppPlannedRaw = (day && day.supplementsPlanned) || (prof && prof.plannedSupplements) || 0;
    var suppPlanned = Array.isArray(suppPlannedRaw) ? suppPlannedRaw.length : (typeof suppPlannedRaw === 'number' ? suppPlannedRaw : 0);

    // Если плана нет, но витамины выпиты — считаем план выполненным на 100%
    if (suppPlanned === 0 && suppTaken > 0) {
      suppPlanned = suppTaken;
    }

    var suppConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.supplementsTaken && d.supplementsTaken.length; });
    confidenceMap.supplements = suppConfidence;

    if (suppPlanned > 0) {
      var suppRatio = suppTaken / suppPlanned;
      // Continuous scoring: ratio × 0.7 - 0.1
      var rawSupp = clamp(suppRatio * 0.7 - 0.1, -0.3, 0.5);

      // Streak bonus
      var suppStreak = countConsecutive(prevDays14, function (d) {
        if (!d || !d.supplementsTaken) return false;
        var st = d.supplementsTaken.length || 0;
        var spRaw = d.supplementsPlanned || d.plannedSupplements || suppPlanned;
        var sp = Array.isArray(spRaw) ? spRaw.length : (typeof spRaw === 'number' ? spRaw : 0);
        if (sp === 0 && st > 0) sp = st;
        return sp > 0 && (st / sp) >= 0.8;
      });
      var suppStreakBonus = suppStreak >= 7 ? 0.2 : suppStreak >= 3 ? 0.1 : 0;

      // Habit break penalty
      if (suppTaken === 0 && suppStreak >= 3) {
        rawSupp = -0.3;
        suppStreakBonus = 0;
      }

      rawSupp = clamp(rawSupp + suppStreakBonus, -0.3, 0.7);
      var suppWeight = rawSupp * suppConfidence;
      rawWeights.supplements = rawSupp;
      score += suppWeight;
      events.push({
        type: 'supplements',
        time: null,
        positive: rawSupp > 0,
        icon: EVENT_ICONS.supplements,
        label: suppRatio >= 1 ? 'Добавки: всё' : ('Добавки: ' + suppTaken + '/' + suppPlanned),
        sortKey: 550,
        weight: suppWeight
      });
      console.info('[HEYS.cascade] 💊 Supplements (model v2.1.0 continuous + streak):', {
        taken: suppTaken, planned: suppPlanned, ratio: +suppRatio.toFixed(2),
        formula: 'clamp(' + suppRatio.toFixed(2) + '×0.7-0.1)',
        streak: suppStreak, streakBonus: +suppStreakBonus.toFixed(2),
        rawWeight: +rawSupp.toFixed(2), confidence: suppConfidence,
        adjustedWeight: +suppWeight.toFixed(2)
      });
    } else {
      rawWeights.supplements = 0;
      console.info('[HEYS.cascade] 💊 No supplement plan configured — ШАГ 9 skipped');
    }

    // ── ШАГ 10: Инсулиновые волны (sigmoid overlap + log2 gap + post-training + night fasting) ──
    var insulinConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.meals && d.meals.length >= 2 ? 1 : 0; });
    confidenceMap.insulin = insulinConfidence;

    if (meals.length >= 2 && HEYS.InsulinWave && typeof HEYS.InsulinWave.calculate === 'function') {
      try {
        var iw = HEYS.InsulinWave.calculate({
          meals: meals, pIndex: pIndex,
          getProductFromItem: (HEYS.getProductFromItem || function () { return {}; }),
          trainings: trainings, dayData: { profile: prof }
        });
        var overlaps = (iw && iw.overlaps) || [];
        var gaps = (iw && iw.gaps) || [];
        iwAvgGap = (iw && iw.avgGapToday) || 0;
        var iwScore = 0;

        // Sigmoid overlap penalty (severity-weighted, continuous)
        overlaps.forEach(function (ov) {
          var overlapMins = ov.overlapMinutes || (ov.severity === 'high' ? 60 : ov.severity === 'medium' ? 40 : 15);
          var ovPenalty = -(1 / (1 + Math.exp(-overlapMins / 30))) * 0.6;
          iwScore += ovPenalty;
        });
        iwScore = Math.max(-2.0, iwScore); // cap overlap penalty

        // Log2 gap scoring (continuous)
        if (gaps.length > 0) {
          gaps.forEach(function (g) {
            var gapMins = g.gapMinutes || g.gap || 0;
            if (gapMins > 120) {
              var gapBonus = clamp(Math.log2(gapMins / 120), 0, 1.0) * 0.4;
              iwScore += gapBonus;
            }
          });
        } else if (iwAvgGap > 0) {
          // Fallback to avgGap if individual gaps not available
          if (iwAvgGap > 120) iwScore += clamp(Math.log2(iwAvgGap / 120), 0, 1.0) * 0.4;
        }

        // Post-training meal timing bonus (anabolic window)
        if (trainings.length > 0) {
          trainings.forEach(function (tr) {
            var trEnd = parseTime(tr && tr.time);
            if (trEnd === null) return;
            var trDur = getTrainingDuration(tr);
            trEnd += trDur; // approximate end time
            meals.forEach(function (m) {
              var mTime = parseTime(m && m.time);
              if (mTime === null) return;
              var diff = mTime - trEnd;
              if (diff >= 30 && diff <= 120) iwScore += 0.3; // anabolic window
              else if (diff >= 0 && diff < 30) iwScore += 0.15; // too soon but ok
            });
          });
        }

        // Night fasting bonus (continuous)
        var longestGap = 0;
        if (gaps.length > 0) {
          gaps.forEach(function (g) { longestGap = Math.max(longestGap, g.gapMinutes || g.gap || 0); });
        }
        if (longestGap > 0) {
          var nightGapHours = longestGap / 60;
          var nightBonus = clamp((nightGapHours - 10) * 0.15, 0, 0.5);
          iwScore += nightBonus;
        }

        iwScore = clamp(iwScore, -2.0, 2.0);
        var iwAdjusted = iwScore * insulinConfidence;
        rawWeights.insulin = iwScore;
        if (iwAdjusted !== 0) {
          score += iwAdjusted;
          events.push({
            type: 'insulin',
            time: null,
            positive: iwScore > 0,
            icon: EVENT_ICONS.insulin,
            label: iwScore > 0 ? 'Инсулиновые промежутки ✓' : 'Наложение инсулиновых волн',
            sortKey: 1200,
            weight: iwAdjusted
          });
          console.info('[HEYS.cascade] ⚡ InsulinWave (model v2.1.0 sigmoid overlap + log2 gap + night fasting):', {
            overlaps: overlaps.length, avgGap: Math.round(iwAvgGap),
            longestGap: Math.round(longestGap),
            nightFasting: longestGap > 0 ? +(longestGap / 60).toFixed(1) + 'h' : 'N/A',
            postTrainingMealBonus: trainings.length > 0 ? 'checked' : 'no training',
            rawScore: +iwScore.toFixed(2), confidence: insulinConfidence,
            adjustedScore: +iwAdjusted.toFixed(2)
          });
        }
      } catch (e) {
        console.warn('[HEYS.cascade] ⚡ InsulinWave error (non-fatal):', e && e.message);
      }
    } else {
      rawWeights.insulin = 0;
      console.info('[HEYS.cascade] ⚡ InsulinWave skipped:', { meals: meals.length, hasModule: !!(HEYS.InsulinWave && HEYS.InsulinWave.calculate) });
    }

    // ── ШАГ 11: Scoring summary + Confidence ────────────
    console.info('[HEYS.cascade] 📊 Scoring summary (model v2.2.0, before synergies):', {
      factorScores: rawWeights,
      totalScore: +score.toFixed(2),
      activeFactors: Object.keys(rawWeights).filter(function (k) { return rawWeights[k] !== 0; }).length,
      skippedFactors: Object.keys(rawWeights).filter(function (k) { return rawWeights[k] === 0; }).length,
      scoringMethod: 'v2.2.0 continuous (sigmoid/bell-curve/log2/tanh)'
    });

    var avgConfidence = 0;
    var confKeys = Object.keys(confidenceMap);
    if (confKeys.length > 0) {
      var confSum = 0;
      confKeys.forEach(function (k) { confSum += confidenceMap[k]; });
      avgConfidence = confSum / confKeys.length;
    }
    console.info('[HEYS.cascade] 🎯 Confidence layer (model v2.2.0):', {
      factors: confidenceMap,
      avgConfidence: +avgConfidence.toFixed(2),
      dataQuality: avgConfidence >= 0.8 ? 'HIGH' : avgConfidence >= 0.5 ? 'MEDIUM' : 'LOW',
      effect: 'weights × confidence = noise reduction with sparse data'
    });

    // ── ШАГ 12: Day-Type detection ──────────────────────
    var dayType = 'normal';
    if (todayTotalLoad > 60) {
      dayType = 'training_day';
    } else if (todayTotalLoad > 0 && todayTotalLoad <= 30) {
      dayType = 'active_rest';
    } else {
      var yLoad = 0;
      if (prevDays14[0] && prevDays14[0].trainings) {
        prevDays14[0].trainings.forEach(function (t) { yLoad += getTrainingLoad(t); });
      }
      if (yLoad > 60 && todayTotalLoad === 0) {
        dayType = 'rest_day';
      }
    }

    // Day-type adjustments to score
    if (dayType === 'training_day') {
      // Training days: meal timing matters more, sleep recovery more important
      // (already handled by per-factor logic, but add small bonus for high-effort days)
      if (score > 0) score *= 1.05;
    } else if (dayType === 'rest_day') {
      // Rest days: no training penalty (already handled), sleep is king
    }

    console.info('[HEYS.cascade] 📅 Day-type (model v2.1.0 context-aware):', {
      dayType: dayType, todayTrainingLoad: Math.round(todayTotalLoad),
      modifier: dayType === 'training_day' ? '×1.05 score bonus' : 'none',
      effect: dayType === 'rest_day' ? 'no training penalty, recovery focus'
        : dayType === 'active_rest' ? 'low-intensity encouraged'
          : dayType === 'training_day' ? 'higher calorie tolerance, sleep importance'
            : 'standard expectations'
    });

    // ── ШАГ 13: Cross-factor synergies ──────────────────
    var synergies = [];

    // 1. Sleep + Training Recovery: good sleep after training day
    if (dayType === 'rest_day' && sleepHours >= 7.5 && rawWeights.sleepDur > 0) {
      synergies.push({ name: 'sleep_training_recovery', bonus: 0.3, reason: 'Восстановительный сон после тренировки' });
    }

    // 2. NEAT + Steps: household activity pairs well with steps
    if (rawWeights.household > 0 && rawWeights.steps > 0) {
      synergies.push({ name: 'neat_steps', bonus: 0.2, reason: 'Высокая бытовая + шаговая активность' });
    }

    // 3. Meals + Insulin: quality meals with good insulin spacing
    if (rawWeights.insulin > 0.2) {
      var avgMealWeight = 0;
      var mealCount = 0;
      events.forEach(function (e) { if (e.type === 'meal') { avgMealWeight += e.weight; mealCount++; } });
      if (mealCount > 0) avgMealWeight /= mealCount;
      if (avgMealWeight > 0.3) {
        synergies.push({ name: 'meals_insulin', bonus: 0.25, reason: 'Качественные приёмы + правильные промежутки' });
      }
    }

    // 4. Morning Ritual: checkin + early meal/training before 10:00
    var hasEarlyAction = events.some(function (e) {
      return (e.type === 'meal' || e.type === 'training') && e.sortKey < 600;
    });
    if (rawWeights.checkin > 0 && hasEarlyAction) {
      synergies.push({ name: 'morning_ritual', bonus: 0.2, reason: 'Утренний ритуал: чекин + ранняя активность' });
    }

    // 5. Full Recovery Day: rest day + good sleep + no overeating
    if (dayType === 'rest_day' && rawWeights.sleepOnset > 0 && rawWeights.sleepDur > 0) {
      var noOvereating = !events.some(function (e) { return e.type === 'meal' && !e.positive; });
      if (noOvereating) {
        synergies.push({ name: 'full_recovery', bonus: 0.35, reason: 'Полный день восстановления' });
      }
    }

    // Apply synergy bonuses (max +1.3 total)
    var totalSynergyBonus = 0;
    synergies.forEach(function (s) { totalSynergyBonus += s.bonus; });
    totalSynergyBonus = Math.min(1.3, totalSynergyBonus);
    score += totalSynergyBonus;

    if (synergies.length > 0) {
      console.info('[HEYS.cascade] 🔗 Cross-factor synergies:', {
        count: synergies.length,
        synergies: synergies.map(function (s) { return s.name + ' (+' + s.bonus + ')'; }),
        totalBonus: +totalSynergyBonus.toFixed(2),
        capped: totalSynergyBonus === 1.3
      });
    }

    // ── ШАГ 14: Сортировка ───────────────────────────────
    events.sort(function (a, b) { return (a.sortKey || 0) - (b.sortKey || 0); });

    console.info('[HEYS.cascade] 📋 Events sorted (' + events.length + ' total):', events.map(function (e) {
      return { type: e.type, time: e.time, positive: e.positive, label: e.label, sortKey: e.sortKey };
    }));

    // ── ШАГ 15: Алгоритм цепочки (v2.2.0 soft chain) ────
    // v2.2.0: негативное событие уменьшает цепочку пропорционально тяжести,
    // а не обнуляет. Одна ошибка не перечёркивает весь прогресс.
    var chain = 0;
    var maxChain = 0;
    var warnings = [];
    var totalPenalty = 0;
    var chainLog = [];

    for (var ei = 0; ei < events.length; ei++) {
      var ev = events[ei];
      var prevChain = chain;
      if (ev.positive) {
        chain++;
        if (chain > maxChain) maxChain = chain;
        chainLog.push({
          type: ev.type, label: ev.label, positive: true,
          chainBefore: prevChain, chainAfter: chain,
          delta: '+1 → ' + chain
        });
      } else {
        var penalty = getChainPenalty(ev.weight || 0);
        var chainBefore = chain;
        chain = Math.max(0, chain - penalty);
        totalPenalty += penalty;
        warnings.push({
          time: ev.time,
          reason: ev.breakReason || 'Отклонение',
          label: ev.label,
          chainBefore: chainBefore,
          chainAfter: chain,
          penalty: penalty,
          weight: +(ev.weight || 0).toFixed(2)
        });
        chainLog.push({
          type: ev.type, label: ev.label, positive: false,
          chainBefore: chainBefore, chainAfter: chain,
          delta: '-' + penalty + ' → ' + chain + ' (weight=' + (ev.weight || 0).toFixed(2) + ', severity=' + (penalty === 3 ? 'SEVERE' : penalty === 2 ? 'MEDIUM' : 'MINOR') + ')'
        });
      }
    }

    console.info('[HEYS.cascade] ⛓️ Chain algorithm (model v2.2.0 soft degradation):', chainLog);
    console.info('[HEYS.cascade] 🔗 Chain result:', {
      finalChainLength: chain,
      maxChainToday: maxChain,
      warningsCount: warnings.length,
      totalPenalty: totalPenalty,
      model: 'v2.2.0 soft chain (penalty 1/2/3 by severity)',
      warnings: warnings.map(function (w) { return { time: w.time, reason: w.reason, penalty: w.penalty, chain: w.chainBefore + '→' + w.chainAfter }; })
    });

    // ── ШАГ 15b: CRS (Cascade Rate Score) v3.1.0 — кумулятивный импульс ──
    console.info('[HEYS.cascade.crs] ─── CRS v3.1.0 computation START ────────');

    // 1. Compute Daily Contribution Score (DCS)
    var dcsResult = computeDailyContribution(score, day, normAbs, pIndex, prof);
    var todayDcs = dcsResult.dcs;

    console.info('[HEYS.cascade.crs] 📊 DCS (Daily Contribution Score):', {
      dailyScore: +score.toFixed(2),
      formula: 'clamp(' + score.toFixed(2) + '/' + MOMENTUM_TARGET + ', ' + CRS_DCS_CLAMP_NEG + ', 1.0)',
      baseDcs: +clamp(score / MOMENTUM_TARGET, CRS_DCS_CLAMP_NEG, 1.0).toFixed(3),
      hasCriticalViolation: dcsResult.hasCriticalViolation,
      violationType: dcsResult.violationType,
      finalDcs: +todayDcs.toFixed(3)
    });

    // 2. Load DCS history and save today's DCS
    var crsClientId = (HEYS.utils && HEYS.utils.getCurrentClientId && HEYS.utils.getCurrentClientId()) || HEYS.currentClientId || '';
    var dcsHistory = loadDcsHistory(crsClientId);
    var todayStr = new Date().toISOString().slice(0, 10);
    dcsHistory[todayStr] = +todayDcs.toFixed(3);

    // 3. Backfill retroactive DCS for days without cached values
    // v3.4.0: pass surrounding days window for chronotype baseline computation
    var backfillCount = 0;
    for (var bi = 0; bi < prevDays30.length; bi++) {
      var bd = new Date();
      bd.setDate(bd.getDate() - (bi + 1));
      var bDateKey = bd.toISOString().slice(0, 10);
      if (dcsHistory[bDateKey] === undefined && prevDays30[bi]) {
        // Build surrounding window for this day's chronotype baseline:
        // use days bi-7..bi+7 from prevDays30 (excluding current day bi)
        var retroWindow = [];
        for (var bwi = Math.max(0, bi - 7); bwi < Math.min(prevDays30.length, bi + 8); bwi++) {
          if (bwi !== bi && prevDays30[bwi]) retroWindow.push(prevDays30[bwi]);
        }
        var retroDcs = getRetroactiveDcs(prevDays30[bi], retroWindow);
        if (retroDcs !== null) {
          dcsHistory[bDateKey] = +retroDcs.toFixed(3);
          backfillCount++;
        }
      }
    }
    if (backfillCount > 0) {
      console.info('[HEYS.cascade.crs] 📋 Retroactive DCS backfill (v3.4.0 accurate formula):', { backfilledDays: backfillCount });
    }

    // Save updated history
    dcsHistory = saveDcsHistory(crsClientId, dcsHistory);

    // 4. Compute individual ceiling
    var ceilingResult = computeIndividualCeiling(dcsHistory, prevDays30, rawWeights);
    var ceiling = ceilingResult.ceiling;

    console.info('[HEYS.cascade.crs] 🏔️ Individual ceiling:', ceilingResult);

    // 5. Compute CRS via EMA
    var crs = computeCascadeRate(dcsHistory, ceiling, todayStr);

    console.info('[HEYS.cascade.crs] 📈 CRS (Cascade Rate Score):', {
      crs: +crs.toFixed(3),
      ceiling: ceiling,
      dcsToday: +todayDcs.toFixed(3),
      dcsHistoryDays: Object.keys(dcsHistory).length,
      emaDecay: CRS_DECAY,
      window: CRS_WINDOW + ' days'
    });

    // 6. Compute CRS trend
    var crsTrend = getCrsTrend(dcsHistory, todayStr);

    console.info('[HEYS.cascade.crs] 📊 CRS trend:', {
      trend: crsTrend,
      interpretation: crsTrend === 'up' ? 'Улучшение за 7 дней' : crsTrend === 'down' ? 'Снижение за 7 дней' : 'Стабильно'
    });

    // 7. Compute daysAtPeak — consecutive days starting FROM today with DCS ≥ 0.5
    // If today is weak, streak must be 0 (historical streak is considered broken).
    var daysAtPeak = 0;
    if (todayDcs >= 0.5) {
      daysAtPeak = 1;
      var sortedHistoryDates = Object.keys(dcsHistory)
        .filter(function (d) { return d !== todayStr; })
        .sort()
        .reverse();
      for (var _pi = 0; _pi < sortedHistoryDates.length; _pi++) {
        if (dcsHistory[sortedHistoryDates[_pi]] >= 0.5) {
          daysAtPeak++;
        } else {
          break;
        }
      }
    }

    console.info('[HEYS.cascade.crs] 🔥 Days at peak (DCS ≥ 0.5 consecutively):', {
      daysAtPeak: daysAtPeak,
      todayDcs: +todayDcs.toFixed(3)
    });

    console.info('[HEYS.cascade.crs] ─── CRS v3.1.0 computation DONE ────────');

    // ── ШАГ 16: Определение состояния (v3.1.0 CRS-driven) ───
    // v3.1.0: состояние определяется по CRS (кумулятивный импульс),
    // а не по дневному score. 14 дней хороших решений создают инерцию,
    // которую один плохой день не может разрушить.
    var state = STATES.EMPTY;

    if (events.length === 0) {
      state = STATES.EMPTY;
    } else if (crs >= CRS_THRESHOLDS.STRONG) {
      state = STATES.STRONG;
    } else if (crs >= CRS_THRESHOLDS.GROWING) {
      state = STATES.GROWING;
    } else if (crs >= CRS_THRESHOLDS.BUILDING) {
      state = STATES.BUILDING;
    } else if (crs > CRS_THRESHOLDS.RECOVERY) {
      state = STATES.RECOVERY;
    } else {
      state = STATES.BROKEN;
    }

    console.info('[HEYS.cascade] 🏷️ State determination (v3.1.0 CRS-driven):', {
      eventsLength: events.length,
      crs: +crs.toFixed(3),
      dailyScore: +score.toFixed(2),
      thresholds: CRS_THRESHOLDS,
      model: 'CRS-driven (cumulative momentum)',
      crsTrend: crsTrend,
      detectedState: state
    });

    // ── ШАГ 17: Post-training window ──────────────────────
    var lastTraining = trainings.length > 0 ? trainings[trainings.length - 1] : null;
    var postTrainingWindow = lastTraining && lastTraining.time ? isWithinHours(lastTraining.time, 2) : false;

    console.info('[HEYS.cascade] ⏰ Post-training window:', {
      lastTrainingTime: (lastTraining && lastTraining.time) || null,
      windowActive: postTrainingWindow,
      windowDuration: '2ч после последней тренировки',
      effect: postTrainingWindow ? 'Пул: ANTI_LICENSING' : 'Обычный пул состояния'
    });

    // ── ШАГ 18: Выбор сообщения ──────────────────────────
    var messagePoolKey;
    if (hasDeficitOvershoot && state !== STATES.BROKEN && state !== STATES.EMPTY) {
      // v3.1.0: перебор калорий при дефиците — приоритет выше тренировочного окна
      messagePoolKey = 'DEFICIT_OVERSHOOT';
    } else if (postTrainingWindow && state !== STATES.BROKEN && state !== STATES.EMPTY) {
      messagePoolKey = 'ANTI_LICENSING';
    } else {
      messagePoolKey = state;
    }
    console.info('[HEYS.cascade] 💬 Message pool selected:', {
      pool: messagePoolKey, hasDeficitOvershoot: hasDeficitOvershoot,
      postTrainingWindow: postTrainingWindow, state: state
    });
    var messagePool = MESSAGES[messagePoolKey] || MESSAGES.BUILDING;
    var message = pickMessage(messagePool, messagePoolKey);

    // ── ШАГ 19: Momentum score (v3.1.0 CRS-based) ────────
    // v3.1.0: прогресс-бар = CRS (кумулятивный импульс), не дневной score
    var momentumScore = crs;
    var dailyMomentum = Math.min(1, Math.max(0, score) / MOMENTUM_TARGET);

    console.info('[HEYS.cascade] 📊 Momentum score (v3.1.0 CRS):', {
      formula: 'CRS (cumulative momentum)',
      crs: +crs.toFixed(3),
      dailyScore: +score.toFixed(2),
      dailyProgress: Math.round(dailyMomentum * 100) + '%',
      crsProgress: Math.round(crs * 100) + '%',
      crsTrend: crsTrend
    });

    // ── ШАГ 20: Next step hint ────────────────────────────
    var nextStepHint = null;
    if (hasDeficitOvershoot) {
      // v3.1.0: срыв по калориям при дефиците — специальная подсказка
      nextStepHint = 'Завтра верни калории в норму — один день всегда можно компенсировать';
    } else if (state !== STATES.EMPTY) {
      var hasMeal = events.some(function (e) { return e.type === 'meal'; });
      var hasTraining = events.some(function (e) { return e.type === 'training'; });
      var hasSleepEv = events.some(function (e) { return e.type === 'sleep'; });
      var hasCheckinEv = events.some(function (e) { return e.type === 'checkin'; });
      var hasMeasEv = events.some(function (e) { return e.type === 'measurements'; });

      if (!hasMeal && currentHour < 20) {
        nextStepHint = 'Добавь первый приём пищи';
      } else if (!hasTraining && currentHour >= 6 && currentHour < 20) {
        nextStepHint = 'Тренировка или прогулка добавят звено в цепочку';
      } else if (!hasCheckinEv && currentHour < 11) {
        nextStepHint = 'Взвесься утром — это поможет отслеживать прогресс';
      } else if (!hasMeasEv && currentHour < 11) {
        nextStepHint = 'Сними замеры — это повысит точность анализа';
      } else if (!hasSleepEv) {
        nextStepHint = 'Зафиксируй время засыпания для анализа сна';
      } else if (currentHour < 21 && chain > 0) {
        nextStepHint = 'Продолжай — следующее решение усилит цепочку';
      }

      console.info('[HEYS.cascade] 💡 Next step hint:', {
        hasMeal: hasMeal, hasTraining: hasTraining, hasSleep: hasSleepEv,
        hasCheckin: hasCheckinEv, hasMeasurements: hasMeasEv,
        currentHour: currentHour, hint: nextStepHint
      });
    }

    // ── ИТОГОВЫЙ РЕЗУЛЬТАТ ────────────────────────────────
    var elapsed = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0;

    console.info('[HEYS.cascade] ✅ computeCascadeState v3.3.0 DONE:', {
      state: state,
      crs: +crs.toFixed(3),
      crsTrend: crsTrend,
      ceiling: ceiling,
      dailyScore: +score.toFixed(2),
      dailyContribution: +todayDcs.toFixed(3),
      chainLength: chain,
      maxChainToday: maxChain,
      momentumScore: +momentumScore.toFixed(3),
      progressPercent: Math.round(momentumScore * 100) + '%',
      eventsCount: events.length,
      warningsCount: warnings.length,
      totalPenalty: totalPenalty,
      chainModel: 'soft (penalty 1/2/3)',
      stateModel: 'CRS-driven (cumulative momentum)',
      postTrainingWindow: postTrainingWindow,
      // v3.1.0: goal-aware calorie penalty result
      goalMode: mealGoalMode ? mealGoalMode.mode : null,
      hasDeficitOvershoot: hasDeficitOvershoot,
      deficitOvershootRatio: deficitOvershootRatio ? +deficitOvershootRatio.toFixed(2) : null,
      deficitViolationType: dcsResult.violationType,
      message: message.short,
      nextStepHint: nextStepHint,
      elapsed: elapsed.toFixed(2) + 'ms'
    });
    console.info('[HEYS.cascade] 🧬 v3.1.0 subsystems:', {
      crs: {
        value: +crs.toFixed(3),
        ceiling: ceiling,
        dcsToday: +todayDcs.toFixed(3),
        trend: crsTrend,
        emaDecay: CRS_DECAY,
        window: CRS_WINDOW,
        thresholds: CRS_THRESHOLDS,
        hasCriticalViolation: dcsResult.hasCriticalViolation
      },
      dayType: dayType,
      synergies: synergies.length > 0
        ? synergies.map(function (s) { return s.name + ' (+' + s.bonus + ': ' + s.reason + ')'; })
        : '(none)',
      synergiesBonus: +synergies.reduce(function (s, x) { return s + x.bonus; }, 0).toFixed(2),
      confidenceLayer: {
        avg: +avgConfidence.toFixed(2),
        quality: avgConfidence >= 0.8 ? 'HIGH' : avgConfidence >= 0.5 ? 'MEDIUM' : 'LOW',
        perFactor: confidenceMap
      },
      chainModel: {
        type: 'soft degradation',
        penalties: { MINOR: CHAIN_PENALTY.MINOR, MEDIUM: CHAIN_PENALTY.MEDIUM, SEVERE: CHAIN_PENALTY.SEVERE },
        thresholds: CHAIN_PENALTY_THRESHOLDS,
        totalPenalty: totalPenalty,
        warningsCount: warnings.length
      },
      stateModel: 'CRS-driven (STRONG≥0.75, GROWING≥0.45, BUILDING≥0.20, RECOVERY>0.05, BROKEN≤0.05)',
      scoringMethod: 'continuous (sigmoid/bell-curve/log2/tanh)',
      personalBaselines: '14-day rolling median → 30-day for CRS',
      thresholds: { CRS: CRS_THRESHOLDS, daily: SCORE_THRESHOLDS, MOMENTUM_TARGET: MOMENTUM_TARGET },
      // v3.1.0: goal-aware calorie penalty sub-system
      goalAwarePenalty: {
        goalMode: mealGoalMode ? mealGoalMode.mode : null,
        goalLabel: mealGoalMode ? mealGoalMode.label : null,
        hasDeficitOvershoot: hasDeficitOvershoot,
        deficitOvershootRatio: deficitOvershootRatio ? +deficitOvershootRatio.toFixed(2) : null,
        dcsContext: dcsResult.deficitContext || null,
        messagePool: hasDeficitOvershoot ? 'DEFICIT_OVERSHOOT' : null
      }
    });
    console.info('[HEYS.cascade] ─────────────────────────────────────────────');

    // ── ИСТОРИЧЕСКИЕ СОБЫТИЯ для multi-day timeline ──────
    var historicalDays = [];
    for (var hdi = 0; hdi < prevDays30.length; hdi++) {
      var hDayRef = prevDays30[hdi];
      if (!hDayRef) continue;
      var hEvts = buildDayEventsSimple(hDayRef);
      if (hEvts.length === 0) continue;
      var hDateD = new Date();
      hDateD.setDate(hDateD.getDate() - (hdi + 1));
      historicalDays.push({
        dateStr: hDateD.toISOString().slice(0, 10),
        label: getDateLabel(hdi + 1),
        events: hEvts
      });
    }
    // 🚀 PERF: Reduced cascade history logging — summary only instead of 30+ individual logs
    if (historicalDays.length > 0) {
      console.info('[HEYS.cascade] 📅 historicalDays built: ' + historicalDays.length + ' days, events: ' + historicalDays.reduce(function (s, d) { return s + d.events.length; }, 0));
    }

    var result = {
      events: events,
      chainLength: chain,
      maxChainToday: maxChain,
      score: +score.toFixed(2),
      warnings: warnings,
      state: state,
      momentumScore: momentumScore,
      postTrainingWindow: postTrainingWindow,
      message: message,
      nextStepHint: nextStepHint,
      dayType: dayType,
      synergies: synergies,
      confidence: confidenceMap,
      avgConfidence: +avgConfidence.toFixed(2),
      rawWeights: rawWeights,
      // v3.1.0 CRS fields
      crs: +crs.toFixed(3),
      ceiling: ceiling,
      dailyContribution: +todayDcs.toFixed(3),
      dailyMomentum: +dailyMomentum.toFixed(3),
      hasCriticalViolation: dcsResult.hasCriticalViolation,
      crsTrend: crsTrend,
      daysAtPeak: daysAtPeak,
      dcsHistory: dcsHistory,
      historicalDays: historicalDays,
      // v3.1.0: Goal-aware overshoot fields
      hasDeficitOvershoot: hasDeficitOvershoot,
      deficitOvershootRatio: deficitOvershootRatio ? +deficitOvershootRatio.toFixed(2) : null,
      goalMode: mealGoalMode ? mealGoalMode.mode : null
    };

    // Сохраняем глобально для CrsProgressBar и диспатчим событие
    window.HEYS = window.HEYS || {};
    window.HEYS._lastCrs = result;

    console.info('[dotcascade] ⚙️ computeCascadeState finished. New CRS:', result.crs, 'Events:', events.map(function (e) { return e.type + '(' + e.weight.toFixed(2) + ')'; }).join(', '));

    window.dispatchEvent(new CustomEvent('heys:crs-updated', { detail: result }));

    return result;
  }

  // ─────────────────────────────────────────────────────
  // SUB-КОМПОНЕНТ: ChainDots
  // ─────────────────────────────────────────────────────

  function getEventColor(w) {
    if (w <= -0.5) return '#dc2626'; // Red (хуже)
    if (w < 0) return '#f97316'; // Orange (негативное)
    if (w === 0) return '#facc15'; // Yellow (нейтральное)
    if (w <= 0.5) return '#84cc16'; // Light Green (хорошее)
    if (w <= 1.5) return '#22c55e'; // Green (очень хорошее)
    return '#10b981'; // Emerald (отличное)
  }

  function ChainDots(props) {
    var events = props.events;
    if (!events || events.length === 0) return null;

    var children = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var isLast = i === events.length - 1;
      var dotClass = [
        'cascade-dot',
        (isLast && ev.positive) ? 'cascade-dot--latest' : null
      ].filter(Boolean).join(' ');

      if (i > 0) {
        children.push(React.createElement('div', {
          key: 'conn-' + i,
          className: 'cascade-dot-connector' + (!ev.positive ? ' cascade-dot-connector--warning' : '')
        }));
      }

      var w = ev.weight || 0;
      var wStr = (w > 0 ? '+' : '') + w.toFixed(1);

      children.push(React.createElement('div', {
        key: 'dot-' + i,
        className: dotClass,
        style: { background: getEventColor(w) },
        title: (ev.time ? formatTimeShort(ev.time) + ' · ' : '') + ev.label + ' (' + wStr + ')'
      }));
    }

    return React.createElement('div', { className: 'cascade-chain-dots' }, children);
  }

  // ─────────────────────────────────────────────────────
  // SUB-КОМПОНЕНТ: CascadeTimeline
  // ─────────────────────────────────────────────────────

  function CascadeTimeline(props) {
    var events = props.events;
    var historicalDays = props.historicalDays || [];
    var nextStepHint = props.nextStepHint;

    function renderEventRow(ev, key) {
      var w = ev.weight || 0;
      var wAbs = Math.abs(w);
      var wSign = w >= 0 ? '+' : '−';
      var wLabel = wSign + (wAbs >= 0.05 ? (wAbs >= 10 ? Math.round(wAbs).toString() : wAbs.toFixed(1)) : '<0.1');
      var wClass = w >= 0.05 ? 'cascade-timeline-weight--pos'
        : w <= -0.05 ? 'cascade-timeline-weight--neg'
          : 'cascade-timeline-weight--zero';

      return React.createElement('div', {
        key: key,
        className: 'cascade-timeline-row cascade-timeline-row--' + (ev.positive ? 'positive' : 'warning')
      },
        React.createElement('span', { className: 'cascade-timeline-icon' }, ev.icon),
        React.createElement('span', { className: 'cascade-timeline-time' },
          ev.time ? formatTimeShort(ev.time) : '—'
        ),
        React.createElement('span', { className: 'cascade-timeline-label' }, ev.label),
        React.createElement('span', { className: 'cascade-timeline-weight ' + wClass }, wLabel),
        React.createElement('span', { className: 'cascade-timeline-badge' },
          ev.positive ? '✓' : (ev.breakReason || '⚠')
        )
      );
    }

    function renderSectionHeader(label, isToday, key) {
      return React.createElement('div', {
        key: key,
        className: 'cascade-timeline-section' + (isToday ? ' cascade-timeline-section--today' : '')
      }, label);
    }

    var children = [];

    // Секция «Сегодня»
    children.push(renderSectionHeader('📅 Сегодня', true, 'h-today'));
    for (var ti = events.length - 1; ti >= 0; ti--) {
      children.push(renderEventRow(events[ti], 'today-' + ti));
    }

    // Исторические секции
    for (var hi = 0; hi < historicalDays.length; hi++) {
      var hd = historicalDays[hi];
      children.push(renderSectionHeader(hd.label, false, 'h-sec-' + hi));
      for (var hei = hd.events.length - 1; hei >= 0; hei--) {
        children.push(renderEventRow(hd.events[hei], 'h-' + hi + '-' + hei));
      }
    }

    if (nextStepHint) {
      children.push(React.createElement('div', { key: 'next', className: 'cascade-next-step' },
        React.createElement('span', { className: 'cascade-next-step-icon' }, '💡'),
        React.createElement('span', null, nextStepHint)
      ));
    }

    return React.createElement('div', { className: 'cascade-timeline-scroll' },
      React.createElement('div', { className: 'cascade-timeline' }, children)
    );
  }

  // ─────────────────────────────────────────────────────
  // ГЛАВНЫЙ КОМПОНЕНТ: CascadeCard (standalone, no deps)
  // Полностью независим от HEYS.ExpandableCard.
  // Управляет expanded через React.useState.
  // ─────────────────────────────────────────────────────

  function CascadeCard(props) {
    var events = props.events;
    var chainLength = props.chainLength;
    var maxChainToday = props.maxChainToday;
    var state = props.state;
    var momentumScore = props.momentumScore;
    var postTrainingWindow = props.postTrainingWindow;
    var message = props.message;
    var nextStepHint = props.nextStepHint;
    var warnings = props.warnings;
    var crsTrend = props.crsTrend || 'flat';
    var crs = props.crs || 0;
    var ceiling = props.ceiling || 0;
    var dailyMomentum = props.dailyMomentum || 0;
    var dailyContribution = props.dailyContribution || 0;
    var daysAtPeak = props.daysAtPeak || 0;
    var dcsHistory = props.dcsHistory || {};
    var historicalDays = props.historicalDays || [];

    var expandedState = React.useState(false);
    var expanded = expandedState[0];
    var setExpanded = expandedState[1];

    var config = STATE_CONFIG[state] || STATE_CONFIG.EMPTY;
    // v3.1.0: Badge shows CRS progress with trend arrow
    var trendArrow = crsTrend === 'up' ? ' ↑' : crsTrend === 'down' ? ' ↓' : '';
    var progressPct = Math.round(momentumScore * 100);
    var badgeText = progressPct > 0 ? (progressPct + '%' + trendArrow) : '—';
    var ceilingPct = Math.round(ceiling * 100);
    // Russian plural for дней подряд
    var peakDaysLabel = daysAtPeak === 1 ? '1 день' : (daysAtPeak >= 2 && daysAtPeak <= 4) ? daysAtPeak + ' дня' : daysAtPeak + ' дней';

    var copyCascadeHistory = async function (e) {
      if (e && e.stopPropagation) e.stopPropagation();

      var startedAt = Date.now();
      var dcsDates = Object.keys(dcsHistory || {}).sort().reverse();
      var historicalEventsCount = (historicalDays || []).reduce(function (sum, day) {
        return sum + (((day && day.events) || []).length);
      }, 0);

      console.info('[HEYS.cascade.copy] ✅ Start copy CRS history:', {
        state: state,
        crs: +crs.toFixed(3),
        dcsDays: dcsDates.length,
        todayEvents: (events || []).length,
        historicalDays: (historicalDays || []).length,
        historicalEvents: historicalEventsCount,
        warnings: (warnings || []).length
      });

      try {
        var lines = [
          '═══════════════════════════════════════════════',
          '📈 HEYS — История влияния на каскад (CRS)',
          'Дата выгрузки: ' + new Date().toLocaleString('ru-RU'),
          '═══════════════════════════════════════════════',
          '',
          'Сводка:',
          '  • Состояние: ' + state,
          '  • CRS: ' + progressPct + '% (' + (+crs.toFixed(3)) + ')',
          '  • Потолок (ceiling): ' + ceilingPct + '% (' + (+ceiling.toFixed(3)) + ')',
          '  • Тренд CRS: ' + crsTrend,
          '  • Дней на пике (DCS ≥ 0.5): ' + daysAtPeak,
          '  • Текущий score дня: ' + (+((props && props.score) || 0).toFixed(2)),
          '  • Дневной вклад (DCS): ' + (+dailyContribution.toFixed(3)),
          ''
        ];

        lines.push('DCS история (для расчёта CRS, свежие сверху):');
        if (!dcsDates.length) {
          lines.push('  (нет данных)');
        } else {
          for (var di = 0; di < dcsDates.length; di++) {
            var dDate = dcsDates[di];
            var dVal = dcsHistory[dDate];
            var dSign = dVal >= 0 ? '+' : '';
            lines.push('  ' + (di + 1) + '. ' + dDate + ' → ' + dSign + (+dVal).toFixed(3));
          }
        }

        lines.push('');
        lines.push('События сегодня (влияние на score):');
        if (!events || events.length === 0) {
          lines.push('  (нет событий)');
        } else {
          for (var ei = 0; ei < events.length; ei++) {
            var ev = events[ei];
            var w = typeof ev.weight === 'number' ? ev.weight : 0;
            var wSign = w >= 0 ? '+' : '';
            lines.push(
              '  ' + (ei + 1) + '. ' +
              (ev.time ? (formatTimeShort(ev.time) + ' | ') : '') +
              (ev.type || 'event') +
              ' | ' + (ev.label || '—') +
              ' | вес=' + wSign + w.toFixed(2) +
              ' | ' + (ev.positive ? 'positive' : 'warning') +
              (ev.breakReason ? (' | причина: ' + ev.breakReason) : '')
            );
          }
        }

        lines.push('');
        lines.push('История дней (ретроспектива влияния):');
        if (!historicalDays || historicalDays.length === 0) {
          lines.push('  (нет ретроспективы)');
        } else {
          for (var hi = 0; hi < historicalDays.length; hi++) {
            var hd = historicalDays[hi];
            lines.push('  [' + (hd.dateStr || hd.label || ('day_' + hi)) + '] ' + (hd.label || ''));
            var hdEvents = (hd && hd.events) || [];
            if (!hdEvents.length) {
              lines.push('    • (нет событий)');
              continue;
            }
            for (var hde = 0; hde < hdEvents.length; hde++) {
              var hev = hdEvents[hde];
              var hw = typeof hev.weight === 'number' ? hev.weight : 0;
              var hwSign = hw >= 0 ? '+' : '';
              lines.push(
                '    • ' +
                (hev.time ? (formatTimeShort(hev.time) + ' | ') : '') +
                (hev.type || 'event') +
                ' | ' + (hev.label || '—') +
                ' | вес=' + hwSign + hw.toFixed(2) +
                ' | ' + (hev.positive ? 'positive' : 'warning')
              );
            }
          }
        }

        lines.push('');
        lines.push('Предупреждения / штрафы цепочки:');
        if (!warnings || warnings.length === 0) {
          lines.push('  (нет)');
        } else {
          for (var wi = 0; wi < warnings.length; wi++) {
            var wng = warnings[wi];
            lines.push(
              '  ' + (wi + 1) + '. ' +
              (wng.time ? formatTimeShort(wng.time) + ' | ' : '') +
              (wng.reason || 'Отклонение') +
              ' | penalty=' + (wng.penalty || 0) +
              ' | chain: ' + (wng.chainBefore == null ? '?' : wng.chainBefore) + '→' + (wng.chainAfter == null ? '?' : wng.chainAfter) +
              (typeof wng.weight === 'number' ? (' | weight=' + wng.weight.toFixed(2)) : '')
            );
          }
        }

        lines.push('');
        lines.push('═══════════════════════════════════════════════');

        var text = lines.join('\n');

        try {
          if (!navigator || !navigator.clipboard || !navigator.clipboard.writeText) {
            throw new Error('Clipboard API unavailable');
          }
          await navigator.clipboard.writeText(text);
        } catch (_clipErr) {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }

        console.info('[HEYS.cascade.copy] ✅ CRS history copied:', {
          chars: text.length,
          dcsDays: dcsDates.length,
          todayEvents: (events || []).length,
          historicalDays: (historicalDays || []).length,
          tookMs: Date.now() - startedAt
        });
        if (HEYS.Toast && HEYS.Toast.success) {
          HEYS.Toast.success('История влияния CRS скопирована');
        }
      } catch (err) {
        console.error('[HEYS.cascade.copy] ❌ Copy failed:', {
          message: err && err.message ? err.message : String(err)
        });
        if (HEYS.Toast && HEYS.Toast.error) {
          HEYS.Toast.error('Не удалось скопировать историю CRS');
        }
      }
    };

    // Throttle render log — once per session (same strategy as MealRec P1 fix)
    if (!window.__heysLoggedCascadeRender) {
      window.__heysLoggedCascadeRender = true;
      console.info('[HEYS.cascade] ✅ CascadeCard rendered:', {
        state: state,
        crs: crs,
        crsTrend: crsTrend,
        chainLength: chainLength,
        maxChainToday: maxChainToday,
        progressPct: progressPct + '/' + ceilingPct + '%',
        daysAtPeak: daysAtPeak,
        eventsCount: events.length
      });
    }

    return React.createElement('div', {
      className: 'cascade-card cascade-card--' + state.toLowerCase(),
      style: { borderLeft: '3px solid ' + config.color }
    },

      // ── Header (кликабельный toggle) ─────────────────
      React.createElement('button', {
        className: 'cascade-card__header',
        onClick: function () {
          var next = !expanded;
          setExpanded(next);
          console.info('[HEYS.cascade] 🔄 Toggle expanded:', next, '| state:', state);
        },
        'aria-expanded': expanded,
        'aria-label': 'Развернуть позитивный каскад'
      },

        // Заголовок
        React.createElement('div', { className: 'cascade-card__title-row' },
          React.createElement('span', { className: 'cascade-card__icon' }, config.icon),
          React.createElement('span', { className: 'cascade-card__title' }, 'Ваш позитивный каскад'),
          progressPct > 0 && React.createElement('span', {
            className: 'cascade-card__badge',
            style: { background: config.color }
          }, badgeText)
        ),

        // Подзаголовок / сообщение
        React.createElement('div', { className: 'cascade-card__subtitle' },
          (message && message.short) || config.label
        ),

        // Хинт anti-licensing (2ч после тренировки)
        postTrainingWindow && React.createElement('div', {
          className: 'cascade-card__hint cascade-card__hint--training'
        }, '⏰ Окно после тренировки — выбери качество, а не количество'),

        // Цепочка точек (всегда показываем в шапке)
        React.createElement(ChainDots, { events: events }),

        // Прогресс-бар
        React.createElement('div', { className: 'cascade-card__progress-track' },
          React.createElement('div', {
            className: 'cascade-card__progress-bar',
            style: { width: progressPct + '%', background: config.color }
          })
        ),

        // Chevron
        React.createElement('span', {
          className: 'cascade-card__chevron' + (expanded ? ' cascade-card__chevron--open' : '')
        }, '›')
      ),

      // ── Развёрнутый контент ──────────────────────────
      expanded && React.createElement('div', { className: 'cascade-card__body' },
        React.createElement(CascadeTimeline, {
          events: events,
          historicalDays: historicalDays,
          nextStepHint: nextStepHint
        }),
        warnings && warnings.length > 0 && React.createElement('div', { className: 'cascade-card__breaks-info' },
          React.createElement('span', { className: 'cascade-card__breaks-label' },
            '⚠️ Отклонений: ' + warnings.length + ' (−' + warnings.reduce(function (s, w) { return s + w.penalty; }, 0) + ' к цепочке)'
          )
        ),
        React.createElement('div', { className: 'cascade-card__stats' },
          React.createElement('span', { className: 'cascade-card__stat' },
            '📈 Импульс: ', React.createElement('strong', null, progressPct + '/' + ceilingPct + '%'),
            trendArrow ? (' ' + trendArrow) : null
          ),
          React.createElement('span', { className: 'cascade-card__stat' },
            '🔗 Цепочка: ', React.createElement('strong', null, chainLength)
          ),
          React.createElement('span', { className: 'cascade-card__stat' },
            '💎 Потолок: ', React.createElement('strong', null, ceilingPct + '%')
          ),
          React.createElement('span', { className: 'cascade-card__stat' },
            '🔥 На пике: ', React.createElement('strong', null, peakDaysLabel)
          )
        ),
        React.createElement('div', { className: 'cascade-card__copy-wrap' },
          React.createElement('button', {
            type: 'button',
            className: 'cascade-card__copy-btn',
            onClick: copyCascadeHistory,
            title: 'Скопировать всю историю влияния на CRS в буфер обмена'
          }, 'copy CRS log')
        )
      )
    );
  }

  // ─────────────────────────────────────────────────────
  // ТОЧКА ВХОДА: renderCard
  // ─────────────────────────────────────────────────────

  // P2-cascade fix: React.memo to skip re-render when cascade data hasn't changed
  var MemoizedCascadeCard = React.memo(CascadeCard, function (prev, next) {
    return prev.state === next.state &&
      prev.score === next.score &&
      prev.chainLength === next.chainLength &&
      prev.maxChainToday === next.maxChainToday &&
      prev.momentumScore === next.momentumScore &&
      prev.crs === next.crs &&
      prev.crsTrend === next.crsTrend &&
      prev.ceiling === next.ceiling &&
      prev.daysAtPeak === next.daysAtPeak &&
      Object.keys(prev.dcsHistory || {}).length === Object.keys(next.dcsHistory || {}).length &&
      (prev.historicalDays || []).length === (next.historicalDays || []).length &&
      prev.nextStepHint === next.nextStepHint &&
      prev.postTrainingWindow === next.postTrainingWindow &&
      (prev.events && prev.events.length) === (next.events && next.events.length);
  });

  // P1-cascade fix: throttle renderCard log to once per session (mirrors mealRec P1)
  var _cascadeRenderCount = 0;
  var _cascadeCache = {
    signature: null,
    result: null,
    hits: 0,
    misses: 0
  };

  function renderCard(params) {
    var day = params && params.day;
    var dayTot = params && params.dayTot;
    var normAbs = params && params.normAbs;
    var prof = params && params.prof;
    var pIndex = params && params.pIndex;

    _cascadeRenderCount++;
    // v5.0.2: log on 1st call only; suppress counter capped at 1 summary (at 50).
    // 40-50 calls per sync is architectural (multiple setProducts listeners) — all cache HITs, no DOM updates.
    if (_cascadeRenderCount === 1) {
      console.info('[HEYS.cascade] 📌 renderCard called:', {
        hasDay: !!day,
        hasMeals: !!(day && day.meals && day.meals.length),
        hasTrainings: !!(day && day.trainings && day.trainings.length),
        water: (day && day.water) || null,
        steps: (day && day.steps) || null
      });
    } else if (_cascadeRenderCount === 50) {
      console.info('[HEYS.cascade] 📌 renderCard hot-path: ' + _cascadeRenderCount + ' calls (cache active, no recompute)');
    }

    if (!day) {
      console.warn('[HEYS.cascade] ⚠️ No day data — skipping render');
      return null;
    }

    var hasMeals = day.meals && day.meals.length > 0;
    var hasTrainings = day.trainings && day.trainings.length > 0;
    var hasSteps = (day.steps || 0) > 0;
    var hasHousehold = (day.householdMin || 0) > 0;
    var hasWeightCheckin = (day.weightMorning || 0) > 0;
    var hasSleepData = !!(day.sleepStart);
    var hasMeasData = !!(day.measurements && Object.keys(day.measurements).some(function (k) { return day.measurements[k] > 0; }));
    var hasSupplements = !!(day.supplementsTaken && day.supplementsTaken.length > 0);

    if (!hasMeals && !hasTrainings && !hasSteps && !hasHousehold && !hasWeightCheckin && !hasSleepData && !hasMeasData && !hasSupplements) {
      console.info('[HEYS.cascade] ⏭️ No activity data yet — card not shown');
      return null;
    }

    var signature = buildInputSignature(day, normAbs, prof);
    var cascadeState;

    // 🚀 PERF v6.0: Pre-sync guard — до завершения heysSyncCompleted профиль нестабилен
    // (prof.plannedSupplements и др. ещё не пришли из облака), что вызывает cache MISS
    // и двойной computeCascadeState. Если sync не завершён и кеш есть — держимся на нём.
    var _cascadeSyncDone = !!(window.HEYS && (window.HEYS.initialSyncDone || window.HEYS.syncCompletedAt));
    if (!_cascadeSyncDone && _cascadeCache.result) {
      _cascadeCache.hits++;
      cascadeState = _cascadeCache.result;
      console.info('[HEYS.cascade] ⏳ Pre-sync guard: held on cached compute (profile unstable)');
    } else if (_cascadeCache.signature === signature && _cascadeCache.result) {
      _cascadeCache.hits++;
      cascadeState = _cascadeCache.result;
      // 🚀 PERF: Log only on significant intervals to reduce console noise
      if (_cascadeCache.hits === 1 || _cascadeCache.hits === 100) {
        console.info('[HEYS.cascade] ⚡ Cache HIT (compute skipped):', {
          hits: _cascadeCache.hits,
          misses: _cascadeCache.misses
        });
      }
    } else {
      _cascadeCache.misses++;
      cascadeState = computeCascadeState(day, dayTot, normAbs, prof, pIndex);
      _cascadeCache.signature = signature;
      _cascadeCache.result = cascadeState;
      console.info('[HEYS.cascade] 🧠 Cache MISS (recompute):', {
        hits: _cascadeCache.hits,
        misses: _cascadeCache.misses,
        state: cascadeState.state,
        chainLength: cascadeState.chainLength
      });
    }

    if (cascadeState.state === STATES.EMPTY) {
      console.info('[HEYS.cascade] ⏭️ State = EMPTY — card not shown');
      return null;
    }

    var renderKey = [cascadeState.state, cascadeState.chainLength, cascadeState.maxChainToday, cascadeState.momentumScore].join('|');
    if (window.__heysCascadeLastRenderKey !== renderKey) {
      window.__heysCascadeLastRenderKey = renderKey;
      console.info('[HEYS.cascade] 🚀 Rendering CascadeCard, state:', cascadeState.state);
    }
    return React.createElement(MemoizedCascadeCard, cascadeState);
  }

  // ─────────────────────────────────────────────────────
  // ЭКСПОРТ
  // ─────────────────────────────────────────────────────

  // v5.0.2: Инвалидировать кэш при cascade batch update (нутриенты изменились)
  if (typeof window !== 'undefined' && !window.__heysCascadeCacheInvalidator) {
    window.__heysCascadeCacheInvalidator = true;
    window.addEventListener('heys:mealitems-cascaded', function () {
      _cascadeCache.signature = null;
      console.info('[HEYS.cascade] 🔄 Cache invalidated by cascade-batch (nutrients updated)');
    });
  }

  // ─────────────────────────────────────────────────────
  // SUB-КОМПОНЕНТ: CrsProgressBar (для нижнего меню)
  // ─────────────────────────────────────────────────────
  function CrsProgressBar() {
    var [crsData, setCrsData] = React.useState(window.HEYS && window.HEYS._lastCrs ? window.HEYS._lastCrs : null);
    var [isSettled, setIsSettled] = React.useState(false);

    function getCrsNumber(data) {
      if (!data) return null;
      var raw = data.crs;
      if (typeof raw === 'number' && isFinite(raw)) return raw;
      if (typeof raw === 'string') {
        var parsed = parseFloat(raw);
        if (isFinite(parsed)) return parsed;
      }
      return null;
    }

    var isSettledRef = React.useRef(false);
    var isSettlingRef = React.useRef(false);
    var hasValidCrsRef = React.useRef(getCrsNumber(crsData) !== null);
    var pendulumTicksRef = React.useRef(0);
    var settleArmedRef = React.useRef(false);
    var lastPendulumOffsetRef = React.useRef(null);
    var currentPercentRef = React.useRef(50);
    var crsTargetRef = React.useRef(getCrsNumber(crsData));
    var debugLastLogTsRef = React.useRef(0);
    var debugLastReasonRef = React.useRef('');
    var introProgressRef = React.useRef(0);
    var instanceIdRef = React.useRef('cb-' + Math.random().toString(36).slice(2, 8));
    var containerRef = React.useRef(null);
    var greenRef = React.useRef(null);
    var orangeRef = React.useRef(null);
    var dividerRef = React.useRef(null);
    var debugEnabledRef = React.useRef(!!(window && window.__HEYS_DEBUG_CASCADEBAR));

    function applyCascadeVisual(percent, introK) {
      var p = Math.max(0, Math.min(100, percent));
      var k = Math.max(0, Math.min(1, introK));
      var gw = p * k;
      var ow = (100 - p) * k;

      if (greenRef.current) {
        greenRef.current.style.setProperty('right', (100 - p) + '%', 'important');
        greenRef.current.style.setProperty('width', gw + '%', 'important');
      }
      if (orangeRef.current) {
        orangeRef.current.style.setProperty('left', p + '%', 'important');
        orangeRef.current.style.setProperty('width', ow + '%', 'important');
      }
      if (dividerRef.current) {
        dividerRef.current.style.setProperty('left', p + '%', 'important');
        dividerRef.current.style.setProperty('transform', 'translate(-50%, -50%) scale(' + k + ')', 'important');
      }
    }

    React.useEffect(function () {
      // Требуемый UX:
      // 1) Точка по центру + линии плавно расходятся >= 1с
      // 2) Потом минимум пару маятников
      // 3) Затем плавный сдвиг в фактический CRS (когда данные готовы)
      var INTRO_DURATION_MS = 1000; // По запросу: разъезд строго ~1 сек
      var PENDULUM_PERIOD_MS = 1800;
      var PENDULUM_AMPLITUDE = 3.5;
      var MIN_PENDULUM_CYCLES = 2; // минимум 2 полных маятника
      var MIN_PENDULUM_TIME_MS = MIN_PENDULUM_CYCLES * PENDULUM_PERIOD_MS;
      var SETTLE_DURATION_MS = 1800;

      var introRafId;
      var settleCheckTimer;
      var domDebugTimer;
      var rafId;
      var settleRafId;
      var pendulumStartTs = 0;

      var ensureSingleBar = function () {
        if (!containerRef.current || !containerRef.current.parentElement) return;
        var bars = containerRef.current.parentElement.querySelectorAll('.crs-bar-container');
        if (bars.length <= 1) return;
        bars.forEach(function (el) {
          if (el !== containerRef.current) {
            el.style.setProperty('display', 'none', 'important');
          }
        });
        if (debugEnabledRef.current) {
          console.info('[cascadebar] duplicate-bars-hidden', { count: bars.length });
        }
      };

      // Инициализируем визуал строго в центре до старта интро.
      applyCascadeVisual(50, 0);
      ensureSingleBar();

      var logCascadeBar = function (stage, payload, force, throttleMs) {
        if (!debugEnabledRef.current && !force) return;
        var now = Date.now();
        var gap = typeof throttleMs === 'number' ? throttleMs : 1000;
        if (!force && (now - debugLastLogTsRef.current) < gap) return;
        debugLastLogTsRef.current = now;
        console.info('[cascadebar] ' + stage, Object.assign({ instanceId: instanceIdRef.current }, payload || {}));
      };

      var getDomSnapshot = function () {
        var c = containerRef.current;
        var g = greenRef.current;
        var o = orangeRef.current;
        var d = dividerRef.current;
        if (!c || !g || !o || !d) return { ready: false };

        var cRect = c.getBoundingClientRect();
        var dRect = d.getBoundingClientRect();
        var gRect = g.getBoundingClientRect();
        var oRect = o.getBoundingClientRect();
        var cw = cRect.width || 0;
        var dividerCenterPx = (dRect.left + dRect.width / 2) - cRect.left;
        var actualPercentFromDom = cw > 0 ? (dividerCenterPx / cw) * 100 : null;

        var gcs = window.getComputedStyle(g);
        var ocs = window.getComputedStyle(o);
        var dcs = window.getComputedStyle(d);

        return {
          ready: true,
          barsInDocument: document.querySelectorAll('.crs-bar-container').length,
          barsInParent: c.parentElement ? c.parentElement.querySelectorAll('.crs-bar-container').length : 0,
          containerWidth: +cw.toFixed(2),
          dividerCenterPx: +dividerCenterPx.toFixed(2),
          actualPercentFromDom: actualPercentFromDom === null ? null : +actualPercentFromDom.toFixed(2),
          currentPercentState: +currentPercentRef.current.toFixed(2),
          targetPercent: crsTargetRef.current === null ? null : +(crsTargetRef.current * 100).toFixed(2),
          introProgress: +introProgressRef.current.toFixed(3),
          isSettled: isSettledRef.current,
          isSettling: isSettlingRef.current,
          computed: {
            greenRight: gcs.right,
            greenWidth: gcs.width,
            orangeLeft: ocs.left,
            orangeWidth: ocs.width,
            dividerLeft: dcs.left,
            dividerTransform: dcs.transform
          },
          rects: {
            containerLeft: +cRect.left.toFixed(2),
            containerRight: +cRect.right.toFixed(2),
            dividerLeft: +dRect.left.toFixed(2),
            dividerRight: +dRect.right.toFixed(2),
            greenLeft: +gRect.left.toFixed(2),
            greenRight: +gRect.right.toFixed(2),
            orangeLeft: +oRect.left.toFixed(2),
            orangeRight: +oRect.right.toFixed(2)
          }
        };
      };

      if (debugEnabledRef.current) {
        window.__cascadebarDump = function () {
          var snap = getDomSnapshot();
          console.info('[cascadebar] manual-dump', Object.assign({ instanceId: instanceIdRef.current }, snap));
          return snap;
        };
      }

      var easeInOutCubic = function (t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };

      var beginSettleTransition = function (reason) {
        if (isSettlingRef.current || isSettledRef.current) return;

        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }

        isSettlingRef.current = true;
        settleArmedRef.current = false;
        var settleTo = crsTargetRef.current !== null ? (crsTargetRef.current * 100) : currentPercentRef.current;

        logCascadeBar('settle-begin', {
          reason: reason,
          from: +currentPercentRef.current.toFixed(2),
          to: +settleTo.toFixed(2)
        }, true);

        animateToPercent(settleTo, SETTLE_DURATION_MS, function () {
          isSettledRef.current = true;
          isSettlingRef.current = false;
          setIsSettled(true);
        });
      };

      var animateToPercent = function (targetPercent, durationMs, onDone) {
        if (settleRafId) cancelAnimationFrame(settleRafId);
        var from = currentPercentRef.current;
        var to = Math.max(0, Math.min(100, targetPercent));
        var startTs = 0;

        if (Math.abs(to - from) < 0.05) {
          currentPercentRef.current = to;
          applyCascadeVisual(to, 1);
          if (typeof onDone === 'function') onDone();
          return;
        }

        logCascadeBar('settle-start', {
          from: +from.toFixed(2),
          to: +to.toFixed(2),
          durationMs: durationMs,
          hasValidCrs: hasValidCrsRef.current,
          targetCrs: crsTargetRef.current
        }, true);

        var step = function (ts) {
          if (!startTs) startTs = ts;
          var p = Math.max(0, Math.min(1, (ts - startTs) / durationMs));
          var k = easeInOutCubic(p);
          var nextPercent = from + (to - from) * k;
          currentPercentRef.current = nextPercent;
          applyCascadeVisual(nextPercent, 1);

          if (p < 1) {
            logCascadeBar('settle-progress', {
              p: +p.toFixed(3),
              currentPercent: +nextPercent.toFixed(2)
            }, false, 1200);
            settleRafId = requestAnimationFrame(step);
            return;
          }

          logCascadeBar('settle-done', {
            currentPercent: +nextPercent.toFixed(2)
          }, true);

          if (typeof onDone === 'function') onDone();
        };
        settleRafId = requestAnimationFrame(step);
      };

      var startPendulum = function () {
        settleArmedRef.current = false;
        lastPendulumOffsetRef.current = null;

        logCascadeBar('pendulum-start', {
          periodMs: PENDULUM_PERIOD_MS,
          amplitude: PENDULUM_AMPLITUDE
        }, true);

        // После интро запускаем плавный маятник (sin wave), без перескоков.
        var animatePendulum = function (ts) {
          if (!pendulumStartTs) pendulumStartTs = ts;
          var elapsed = ts - pendulumStartTs;
          pendulumTicksRef.current = elapsed;
          var phase = (elapsed / PENDULUM_PERIOD_MS) * Math.PI * 2;
          var next = Math.sin(phase) * PENDULUM_AMPLITUDE;
          var prevOffset = lastPendulumOffsetRef.current;
          lastPendulumOffsetRef.current = next;

          currentPercentRef.current = 50 + next;
          applyCascadeVisual(50 + next, 1);

          logCascadeBar('pendulum-frame', {
            elapsedMs: Math.round(elapsed),
            offset: +next.toFixed(3),
            currentPercent: +(50 + next).toFixed(2),
            hasValidCrs: hasValidCrsRef.current,
            targetCrs: crsTargetRef.current
          }, false, 1200);

          trySettleToActual();

          // Старт settle НЕ в центре, а сразу после последнего качания влево:
          // когда прошли левый экстремум и начали движение вправо.
          if (settleArmedRef.current && prevOffset !== null) {
            var nearLeftExtreme = prevOffset <= (-PENDULUM_AMPLITUDE * 0.88);
            var turnedRight = next > prevOffset;
            if (nearLeftExtreme && turnedRight) {
              beginSettleTransition('left-extremum');
              return;
            }
          }

          if (!isSettledRef.current) {
            rafId = requestAnimationFrame(animatePendulum);
          }
        };
        rafId = requestAnimationFrame(animatePendulum);
      };

      var trySettleToActual = function () {
        if (isSettledRef.current) return;
        if (isSettlingRef.current) return;

        // Если CRS появился в глобальном кеше позже — подхватываем его.
        if (!hasValidCrsRef.current) {
          var globalCrs = window.HEYS && window.HEYS._lastCrs;
          var globalNum = getCrsNumber(globalCrs);
          if (globalNum !== null) {
            setCrsData(globalCrs);
            hasValidCrsRef.current = true;
          }
        }

        var elapsed = pendulumTicksRef.current;
        var hasMinimumPendulum = elapsed >= MIN_PENDULUM_TIME_MS;

        // Критично: не фиксируем центр без валидного CRS,
        // иначе точка может "застрять" на 50%.
        if (!hasValidCrsRef.current) {
          if (debugLastReasonRef.current !== 'waiting-crs') {
            debugLastReasonRef.current = 'waiting-crs';
            logCascadeBar('settle-waiting-crs', {
              elapsedMs: Math.round(elapsed),
              currentPercent: +currentPercentRef.current.toFixed(2),
              targetCrs: crsTargetRef.current
            }, true);
          }
          return;
        }
        if (hasValidCrsRef.current && !hasMinimumPendulum) {
          if (debugLastReasonRef.current !== 'waiting-min-pendulum') {
            debugLastReasonRef.current = 'waiting-min-pendulum';
            logCascadeBar('settle-waiting-pendulum', {
              elapsedMs: Math.round(elapsed),
              requiredMs: MIN_PENDULUM_TIME_MS,
              currentPercent: +currentPercentRef.current.toFixed(2),
              targetCrs: crsTargetRef.current
            }, true);
          }
          return;
        }

        debugLastReasonRef.current = 'ready-to-settle';
        // Вооружаем settle и ждём левый экстремум маятника,
        // чтобы не было замирания в центре.
        if (!settleArmedRef.current) {
          logCascadeBar('settle-ready', {
            elapsedMs: Math.round(elapsed),
            currentPercent: +currentPercentRef.current.toFixed(2),
            targetCrs: crsTargetRef.current
          }, true);
          settleArmedRef.current = true;
          logCascadeBar('settle-armed', {
            strategy: 'start-after-left-swing',
            currentPercent: +currentPercentRef.current.toFixed(2)
          }, true);
        }
      };

      // Жёсткое интро: покадрово раскрываем линии из центра ровно 1 секунду.
      var introStartTs = 0;
      var animateIntro = function (ts) {
        if (!introStartTs) introStartTs = ts;
        var elapsed = ts - introStartTs;
        var p = Math.max(0, Math.min(1, elapsed / INTRO_DURATION_MS));
        introProgressRef.current = p;
        applyCascadeVisual(50, p);

        logCascadeBar('intro-frame', {
          p: +p.toFixed(3),
          elapsedMs: Math.round(elapsed)
        }, false, 1000);

        if (p < 1) {
          introRafId = requestAnimationFrame(animateIntro);
          return;
        }

        logCascadeBar('intro-done', { durationMs: INTRO_DURATION_MS }, true);
        startPendulum();
      };
      introRafId = requestAnimationFrame(animateIntro);

      // Периодическая проверка на случай, если данные пришли без движения маятника.
      settleCheckTimer = setInterval(function () {
        trySettleToActual();
      }, 120);

      if (debugEnabledRef.current) {
        domDebugTimer = setInterval(function () {
          var snap = getDomSnapshot();
          if (!snap.ready) return;

          var stateP = currentPercentRef.current;
          var domP = typeof snap.actualPercentFromDom === 'number' ? snap.actualPercentFromDom : null;
          var targetP = crsTargetRef.current === null ? null : (crsTargetRef.current * 100);

          logCascadeBar('dom-brief', {
            statePercent: +stateP.toFixed(2),
            domPercent: domP === null ? null : +domP.toFixed(2),
            targetPercent: targetP === null ? null : +targetP.toFixed(2),
            intro: +introProgressRef.current.toFixed(3),
            settled: isSettledRef.current,
            settling: isSettlingRef.current,
            barsInDocument: snap.barsInDocument,
            barsInParent: snap.barsInParent
          }, false, 900);

          // Если DOM визуально уехал от расчётного state — принудительно синхронизируем.
          if (domP !== null && Math.abs(domP - stateP) > 2.5) {
            applyCascadeVisual(stateP, 1);
            logCascadeBar('dom-desync-corrected', {
              statePercent: +stateP.toFixed(2),
              domPercentBefore: +domP.toFixed(2),
              delta: +(stateP - domP).toFixed(2)
            }, true);
          }

          // Если после settle DOM застрял возле центра, но target далеко — жёстко дотягиваем к target.
          if (
            isSettledRef.current &&
            !isSettlingRef.current &&
            targetP !== null &&
            domP !== null &&
            Math.abs(domP - 50) <= 2 &&
            Math.abs(targetP - 50) >= 6
          ) {
            animateToPercent(targetP, 1400);
            logCascadeBar('center-stuck-force-target', {
              domPercentBefore: +domP.toFixed(2),
              targetPercent: +targetP.toFixed(2)
            }, true);
          }
        }, 900);
      }

      function handleCrsUpdate(e) {
        if (e.detail) {
          setCrsData(e.detail);
          var nextCrs = getCrsNumber(e.detail);
          hasValidCrsRef.current = nextCrs !== null;
          crsTargetRef.current = nextCrs;

          logCascadeBar('crs-update', {
            nextCrs: nextCrs,
            currentPercent: +currentPercentRef.current.toFixed(2),
            isSettled: isSettledRef.current,
            isSettling: isSettlingRef.current
          }, true);

          // Уже в settled-состоянии: любые новые значения CRS двигаем плавно,
          // а не резким прыжком.
          if (isSettledRef.current && nextCrs !== null) {
            animateToPercent(nextCrs * 100, 1600);
          }

          trySettleToActual();
        }
      }

      function handleSyncCompleted() {
        // Иногда CRS уже в window.HEYS._lastCrs, но событие обновления не прилетело.
        var fallback = window.HEYS && window.HEYS._lastCrs;
        var fallbackCrs = getCrsNumber(fallback);
        if (fallbackCrs !== null) {
          setCrsData(fallback);
          hasValidCrsRef.current = true;
          crsTargetRef.current = fallbackCrs;

          if (isSettledRef.current) {
            animateToPercent(fallbackCrs * 100, 1600);
          }

          logCascadeBar('sync-fallback-crs', {
            fallbackCrs: fallbackCrs,
            currentPercent: +currentPercentRef.current.toFixed(2),
            isSettled: isSettledRef.current
          }, true);

          trySettleToActual();
        }
      }

      logCascadeBar('mount', {
        initialCrs: getCrsNumber(crsData),
        initialPercent: +currentPercentRef.current.toFixed(2)
      }, debugEnabledRef.current);

      window.addEventListener('heys:crs-updated', handleCrsUpdate);
      window.addEventListener('heysSyncCompleted', handleSyncCompleted);

      return function () {
        if (introRafId) cancelAnimationFrame(introRafId);
        if (settleCheckTimer) clearInterval(settleCheckTimer);
        if (domDebugTimer) clearInterval(domDebugTimer);
        if (rafId) cancelAnimationFrame(rafId);
        if (settleRafId) cancelAnimationFrame(settleRafId);
        window.removeEventListener('heys:crs-updated', handleCrsUpdate);
        window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
        if (window.__cascadebarDump) {
          try { delete window.__cascadebarDump; } catch (_) { window.__cascadebarDump = undefined; }
        }
      };
    }, []);

    React.useEffect(function () {
      var v = getCrsNumber(crsData);
      hasValidCrsRef.current = v !== null;
      crsTargetRef.current = v;
    }, [crsData]);

    // Даже если данных CRS ещё нет, держим линию видимой по центру (50%),
    // чтобы нижний индикатор не пропадал из меню.
    var crsValue = getCrsNumber(crsData);
    var hasValidCrs = crsValue !== null;

    // Если CRS ещё нет — стартуем из 50/50, затем маятник до загрузки данных.
    // Анимация появления из центра работает через isLoaded.
    // --- Цвет левой линии: фиксированный зелёный градиент (светлее у центра → насыщеннее у края) ---
    var goodGrad = 'linear-gradient(90deg, #10b981, #34d399)';
    var goodShadow = '0 0 4px rgba(52, 211, 153, 0.8), 0 0 10px rgba(16, 185, 129, 0.6), 0 0 16px rgba(5, 150, 105, 0.4)';

    // --- Цвет правой линии: фиксированный градиент жёлтый → оранжевый → красный ---
    // Цвет определяется позицией на шкале, а не значением CRS — не меняется при движении точки
    var badGrad = 'linear-gradient(90deg, #dc2626, #f97316, #fde047)';
    var badShadow = '0 0 4px rgba(253, 224, 71, 0.7), 0 0 10px rgba(249, 115, 22, 0.6), 0 0 16px rgba(220, 38, 38, 0.4)';

    return React.createElement(
      'div',
      { className: 'crs-bar-container', ref: containerRef },
      React.createElement('div', {
        className: 'crs-bar-green',
        ref: greenRef,
        style: {
          transition: 'none',
          background: goodGrad,
          boxShadow: goodShadow
        }
      }),
      React.createElement('div', {
        className: 'crs-bar-orange',
        ref: orangeRef,
        style: {
          transition: 'none',
          background: badGrad,
          boxShadow: badShadow
        }
      }),
      React.createElement('div', {
        className: 'crs-bar-divider',
        ref: dividerRef,
        style: {
          transition: 'none',
        }
      })
    );
  }

  HEYS.CascadeCard = {
    computeCascadeState: computeCascadeState,
    renderCard: renderCard,
    CrsProgressBar: CrsProgressBar,
    STATES: STATES,
    STATE_CONFIG: STATE_CONFIG,
    MESSAGES: MESSAGES,
    CRS_THRESHOLDS: CRS_THRESHOLDS,
    VERSION: '3.3.0'
  };

  console.info('[HEYS.cascade] ✅ Module loaded v3.3.0 | CRS (Cascade Rate Score) cumulative momentum | EMA α=0.95, 30-day window, individual ceiling, partial-day weighting | Scientific scoring: continuous functions, personal baselines, cross-factor synergies | Goal-aware calorie penalty (deficit/bulk) | Filter: [HEYS.cascade] | Sub-filter: [HEYS.cascade.crs] [HEYS.cascade.deficit]');

})(typeof window !== 'undefined' ? window : global);
