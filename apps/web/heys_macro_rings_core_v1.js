// heys_macro_rings_core_v1.js — единый расчёт данных для колец БЖУ.
// Используется DayTab, виджетом макросов и недельным отчётом.
// Расчёт цветов и порогов — канон из buildMacroRingsMeta (heys_day_stats_vm_v1.js:972-1007).

; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  const MACRO_COLORS = Object.freeze({
    red: '#ef4444',
    amber: '#f59e0b',
    green: '#22c55e',
    gray: '#6b7280',
  });

  // Градиентные пары (оригинал из widgets/weekly): [light, dark]
  const GRADIENT_STOPS = Object.freeze({
    protein: ['#fecaca', '#ef4444'],
    fat: ['#fde68a', '#f59e0b'],
    carbs: ['#bbf7d0', '#22c55e'],
  });

  // Перебор-цвет: для белка зелёный (норм), для жира/углей — красный (плохо).
  const OVERFLOW_COLORS = Object.freeze({
    protein: MACRO_COLORS.green,
    fat: MACRO_COLORS.red,
    carbs: MACRO_COLORS.red,
  });

  function getProteinColor(actual, norm, hasTraining) {
    if (!norm || norm <= 0) return MACRO_COLORS.gray;
    const ratio = actual / norm;
    const minOk = hasTraining ? 0.7 : 0.6;
    const minGood = hasTraining ? 1.0 : 0.9;
    if (ratio < minOk) return MACRO_COLORS.red;
    if (ratio < minGood) return MACRO_COLORS.amber;
    return MACRO_COLORS.green;
  }

  function getFatColor(actual, norm) {
    if (!norm || norm <= 0) return MACRO_COLORS.gray;
    const ratio = actual / norm;
    if (ratio < 0.5) return MACRO_COLORS.red;
    if (ratio < 0.8) return MACRO_COLORS.amber;
    if (ratio <= 1.2) return MACRO_COLORS.green;
    if (ratio <= 1.5) return MACRO_COLORS.amber;
    return MACRO_COLORS.red;
  }

  function getCarbsColor(actual, norm, hasDeficit) {
    if (!norm || norm <= 0) return MACRO_COLORS.gray;
    const ratio = actual / norm;
    if (hasDeficit) {
      if (ratio < 0.3) return MACRO_COLORS.amber;
      if (ratio <= 1.0) return MACRO_COLORS.green;
      if (ratio <= 1.2) return MACRO_COLORS.amber;
      return MACRO_COLORS.red;
    }
    if (ratio < 0.5) return MACRO_COLORS.red;
    if (ratio < 0.8) return MACRO_COLORS.amber;
    if (ratio <= 1.1) return MACRO_COLORS.green;
    if (ratio <= 1.3) return MACRO_COLORS.amber;
    return MACRO_COLORS.red;
  }

  function buildSlot(kind, value, target, hasTraining, hasDeficit) {
    const safeValue = Number.isFinite(value) ? value : 0;
    const safeTarget = Number.isFinite(target) && target > 0 ? target : 0;
    const ratio = safeTarget > 0 ? safeValue / safeTarget : 0;
    const pct = Math.max(0, Math.round(ratio * 100));
    let color;
    if (kind === 'protein') color = getProteinColor(safeValue, safeTarget, hasTraining);
    else if (kind === 'fat') color = getFatColor(safeValue, safeTarget);
    else color = getCarbsColor(safeValue, safeTarget, hasDeficit);

    const hasOver = ratio > 1;
    // overPct: сколько % сверх нормы (cap 50%), без компенсации скругления (это слой view)
    const overPct = hasOver ? Math.min(50, Math.round((ratio - 1) * 100)) : 0;

    return {
      kind,
      value: safeValue,
      target: safeTarget,
      ratio,
      pct,
      color,
      overflowColor: OVERFLOW_COLORS[kind],
      gradientStops: GRADIENT_STOPS[kind].slice(),
      hasOver,
      overPct,
    };
  }

  /**
   * Pure-функция: посчитать кольца по уже готовым dayTot/normAbs и сигналам.
   * Используется для unit-тестируемости и из weekly-усреднителя.
   */
  function computeRingData(args) {
    const a = args || {};
    const dayTot = a.dayTot || {};
    const normAbs = a.normAbs || {};
    const hasTraining = !!a.hasTraining;
    const hasDeficit = !!a.hasDeficit;
    return {
      protein: buildSlot('protein', dayTot.prot || 0, normAbs.prot || 0, hasTraining, hasDeficit),
      fat:     buildSlot('fat',     dayTot.fat  || 0, normAbs.fat  || 0, false,       hasDeficit),
      carbs:   buildSlot('carbs',   dayTot.carbs|| 0, normAbs.carbs|| 0, false,       hasDeficit),
      hasTraining,
      hasDeficit,
    };
  }

  /**
   * Резолв optimum для дня по приоритету:
   *   1. явный параметр (caller вычислил displayOptimum сам — DayTab)
   *   2. day.savedDisplayOptimum (содержит зафиксированный displayOptimum)
   *   3. fallback: TDEE.calculate + refeed (без знания caloricDebt — он React state)
   *
   * Возвращает число калорий (>=0).
   */
  function resolveDayOptimum(day, profile, explicitOptimum) {
    if (Number.isFinite(explicitOptimum) && explicitOptimum > 0) return explicitOptimum;
    if (Number.isFinite(day && day.savedDisplayOptimum) && day.savedDisplayOptimum > 0) {
      return day.savedDisplayOptimum;
    }
    let optimum = 0;
    if (HEYS.TDEE && typeof HEYS.TDEE.calculate === 'function') {
      try {
        const res = HEYS.TDEE.calculate(day || {}, profile || {}, {}) || {};
        optimum = +res.optimum || 0;
      } catch (_) { /* fall through */ }
    }
    if (day && day.isRefeedDay && HEYS.Refeed && typeof HEYS.Refeed.getRefeedOptimum === 'function') {
      try { optimum = HEYS.Refeed.getRefeedOptimum(optimum, true) || optimum; } catch (_) { }
    }
    return optimum;
  }

  function hasTrainingForDay(day) {
    if (!day) return false;
    if (Array.isArray(day.trainings) && day.trainings.length > 0) return true;
    const t1 = +day.train1k || 0;
    const t2 = +day.train2k || 0;
    return (t1 + t2) > 0;
  }

  function hasDeficitFromProfile(profile, opts) {
    if (opts && typeof opts.hasDeficit === 'boolean') return opts.hasDeficit;
    if (Number.isFinite(opts && opts.dayTargetDef)) return opts.dayTargetDef < 0;
    const p = profile || {};
    const def = +p.deficitPctTarget || +p.deficitPct || 0;
    return def < 0;
  }

  /**
   * Главный wrapper: данные колец на конкретный день.
   *
   * @param {Object} day      — объект дня (с meals, isRefeedDay, savedDisplayOptimum, trainings…)
   * @param {Object} profile  — профиль клиента (вес, рост, deficitPctTarget…)
   * @param {Object} pIndex   — индекс продуктов (HEYS.dayUtils.buildProductIndex)
   * @param {Object} [opts]
   * @param {Object} [opts.normPerc]    — проценты Б/Ж/У (из heys_norms), иначе читается из LS
   * @param {number} [opts.optimum]     — готовый displayOptimum (DayTab передаёт сюда)
   * @param {boolean}[opts.hasTraining] — явный сигнал (иначе выводится из day.trainings)
   * @param {boolean}[opts.hasDeficit]  — явный сигнал (иначе выводится из profile)
   * @param {number} [opts.dayTargetDef]— альтернатива hasDeficit (отрицательное значение → дефицит)
   */
  function computeDayRingData(day, profile, pIndex, opts) {
    const o = opts || {};
    const normPerc = o.normPerc || readNormsFromLS();
    const optimum = resolveDayOptimum(day, profile, o.optimum);

    let dayTot = { prot: 0, fat: 0, carbs: 0 };
    if (HEYS.dayCalculations && typeof HEYS.dayCalculations.calculateDayTotals === 'function' && day) {
      try { dayTot = HEYS.dayCalculations.calculateDayTotals(day, pIndex) || dayTot; } catch (_) { }
    }

    let normAbs = { prot: 0, fat: 0, carbs: 0 };
    if (HEYS.dayCalculations && typeof HEYS.dayCalculations.computeDailyNorms === 'function') {
      try { normAbs = HEYS.dayCalculations.computeDailyNorms(optimum, normPerc) || normAbs; } catch (_) { }
    }

    const hasTraining = typeof o.hasTraining === 'boolean' ? o.hasTraining : hasTrainingForDay(day);
    const hasDeficit = hasDeficitFromProfile(profile, o);

    const slots = computeRingData({ dayTot, normAbs, hasTraining, hasDeficit });
    return Object.assign(slots, { optimum, normPerc, dayTot, normAbs });
  }

  function readNormsFromLS() {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
        return HEYS.utils.lsGet('heys_norms', {}) || {};
      }
      if (global.localStorage) {
        const raw = global.localStorage.getItem('heys_norms');
        if (raw) return JSON.parse(raw) || {};
      }
    } catch (_) { }
    return {};
  }

  /**
   * Обёртка для уже посчитанных средних значений (Weekly уже умеет фильтровать
   * visibleDays по shouldIncludeDay и делить на daysWithData). Передаёт средние
   * в computeRingData и возвращает структуру с цветами без training-сигнала.
   *
   * @param {Object} avgValues  — { prot, fat, carbs } средние факта по неделе
   * @param {Object} avgTargets — { prot, fat, carbs } средние нормы по неделе
   * @param {Object} [opts]
   * @param {boolean}[opts.hasDeficit] — режим дефицита (для цвета углеводов)
   * @param {number} [opts.daysWithData] — для информационного поля результата
   */
  function buildWeeklyRingData(avgValues, avgTargets, opts) {
    const o = opts || {};
    const hasDeficit = !!o.hasDeficit;
    const slots = computeRingData({
      dayTot:  { prot: (avgValues && avgValues.prot)  || 0, fat: (avgValues && avgValues.fat)  || 0, carbs: (avgValues && avgValues.carbs)  || 0 },
      normAbs: { prot: (avgTargets && avgTargets.prot) || 0, fat: (avgTargets && avgTargets.fat) || 0, carbs: (avgTargets && avgTargets.carbs) || 0 },
      hasTraining: false, // training-сигнал на неделю не применяется
      hasDeficit,
    });
    return Object.assign(slots, { daysWithData: Number.isFinite(o.daysWithData) ? o.daysWithData : null });
  }

  HEYS.MacroRings = {
    MACRO_COLORS,
    GRADIENT_STOPS,
    OVERFLOW_COLORS,
    computeRingData,
    computeDayRingData,
    buildWeeklyRingData,
    resolveDayOptimum,
  };

})(typeof window !== 'undefined' ? window : globalThis);
