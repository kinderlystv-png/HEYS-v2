// heys_day_realdata_actions_v1.js — Shared actions for low-calorie day handling
;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function toInt(value, fallback = 0) {
    return Math.round(toNumber(value, fallback));
  }

  function clearEstimatedDayFields(dayData) {
    if (!dayData || typeof dayData !== 'object') return dayData;
    delete dayData.savedEatenKcal;
    delete dayData.savedDisplayOptimum;
    delete dayData.savedEatenProt;
    delete dayData.savedEatenCarbs;
    delete dayData.savedEatenFat;
    delete dayData.savedEatenFiber;
    delete dayData.estimatedDayFill;
    return dayData;
  }

  function applyDayStatusAction(dayData, actionId, options = {}) {
    const nowTs = options.nowTs || Date.now();
    const nextDay = (dayData && typeof dayData === 'object')
      ? { ...dayData }
      : {};

    if (actionId === 'confirm_real_data') {
      nextDay.isFastingDay = true;
      nextDay.isIncomplete = false;
      clearEstimatedDayFields(nextDay);
    } else if (actionId === 'clear_day') {
      nextDay.meals = [];
      nextDay.isFastingDay = false;
      nextDay.isIncomplete = false;
      clearEstimatedDayFields(nextDay);
    } else if (actionId === 'fill_later') {
      nextDay.isIncomplete = true;
    }

    nextDay.updatedAt = nowTs;
    return nextDay;
  }

  function getPreferredAction(params = {}) {
    const ratio = toNumber(params.ratio, 0);
    const mealCount = Math.max(0, toInt(params.mealCount, 0));

    if (ratio > 0 && ratio < 0.3 && mealCount === 0) {
      return 'clear_day';
    }
    return 'confirm_real_data';
  }

  function shouldOfferConfirmation(params = {}) {
    const ratio = toNumber(params.ratio, 0);
    const eatenKcal = toNumber(params.eatenKcal, 0);
    const mealCount = Math.max(0, toInt(params.mealCount, 0));

    return Boolean(
      params.dateKey
      && !params.isFuture
      && !params.isToday
      && !params.isFastingDay
      && !params.isIncomplete
      && !params.hasEstimatedFill
      && ratio > 0
      && ratio < 0.5
      && (eatenKcal > 0 || mealCount > 0)
    );
  }

  function getConfirmDialogText(actionId, params = {}) {
    const eatenKcal = toInt(params.eatenKcal, 0);
    const targetKcal = toInt(params.targetKcal, 0);

    if (actionId === 'clear_day') {
      return 'Очистить данные за этот день?\n\n'
        + 'Сейчас: ' + eatenKcal + ' из ' + targetKcal + ' ккал.\n'
        + 'Мы удалим приёмы пищи за день, статистика пересчитается.\n'
        + 'После очистки действие можно быстро отменить через «Отменить».';
    }

    return 'Учесть этот день как реальные данные?\n\n'
      + 'Сейчас: ' + eatenKcal + ' из ' + targetKcal + ' ккал.\n'
      + 'День останется в статистике, даже если это меньше 50% нормы.';
  }

  function getImpactHint() {
    return 'Влияет на средний дефицит, тренд и рекомендации.';
  }

  HEYS.DayRealDataActions = {
    clearEstimatedDayFields,
    applyDayStatusAction,
    getPreferredAction,
    shouldOfferConfirmation,
    getConfirmDialogText,
    getImpactHint,
  };
})(typeof window !== 'undefined' ? window : globalThis);
