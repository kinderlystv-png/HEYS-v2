// heys_kernel_strength_v1.js — ОБЩЕЕ ЯДРО: тоннаж силовых тренировок.
//
// Формулы перенесены дословно из apps/web/heys_day_trainings_v1.js (2026-08-08):
// там они читали localStorage напрямую (computeDayTotalTonnage,
// countStrengthWorkoutsOnDay), поэтому ни ядро, ни MCP-коннектор не могли их
// переиспользовать. Здесь — чистые функции от блоба дня / объекта тренировки,
// heys_day_trainings_v1.js делегирует сюда, читая день из своего стора сам.
//
// НЕ вынесено (сознательно): findPrevDayTonnage и поиск исторического рекорда
// по имени упражнения — оба сканируют неограниченную историю по localStorage.
// Тянуть такой скан в MCP значит на каждый запрос читать десятки блобов дней;
// это тот же риск, что у окна модели нагрузки (см. TRAINING_LOAD_MODEL_PROMPT.md,
// этап 5) — сначала измерить, нужен ли скан вообще, потом решать про кэш.
//
// Public API (HEYS.TrainingKernel.strength):
//   trainingTonnage(training)   — {totalVolume, maxWeight, totalApproaches, doneApproaches, exerciseCount} одной тренировки
//   dayTonnage(day)              — суммарный тоннаж дня по всем силовым workout_builder
//   countStrengthWorkouts(day)   — сколько силовых workout_builder тренировок в дне

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.strength && TK.strength.__registered) return; // idempotent

  function isStrengthBuilder(t) {
    return !!t && String(t.type) === 'strength' && t.strengthEntryMode === 'workout_builder'
      && !!t.workoutLog && typeof t.workoutLog === 'object';
  }

  /** Сводка одной тренировки: тоннаж и объём выполненных подходов. */
  function trainingTonnage(training) {
    const out = { totalVolume: 0, maxWeight: 0, totalApproaches: 0, doneApproaches: 0, exerciseCount: 0 };
    if (!isStrengthBuilder(training)) return out;
    const exercises = Array.isArray(training.workoutLog.exercises) ? training.workoutLog.exercises : [];
    for (let j = 0; j < exercises.length; j++) {
      const ex = exercises[j];
      const aps = ex && Array.isArray(ex.approaches) ? ex.approaches : [];
      if (aps.length) out.exerciseCount += 1;
      for (let k = 0; k < aps.length; k++) {
        const a = aps[k];
        out.totalApproaches += 1;
        if (!a || !a.done) continue;
        out.doneApproaches += 1;
        const w = parseFloat(String(a.weightKg || '').replace(',', '.')) || 0;
        const r = +a.reps || 0;
        if (w > 0 && r > 0) out.totalVolume += w * r;
        if (w > out.maxWeight) out.maxWeight = w;
      }
    }
    return out;
  }

  /** Сумма тоннажа (вес × повторы) всех завершённых подходов всех силовых в дне. */
  function dayTonnage(day) {
    if (!day || !Array.isArray(day.trainings)) return 0;
    let total = 0;
    for (let i = 0; i < day.trainings.length; i++) {
      total += trainingTonnage(day.trainings[i]).totalVolume;
    }
    return total;
  }

  /** Сколько workout_builder-тренировок в дне. */
  function countStrengthWorkouts(day) {
    if (!day || !Array.isArray(day.trainings)) return 0;
    let n = 0;
    for (let i = 0; i < day.trainings.length; i++) {
      if (isStrengthBuilder(day.trainings[i])) n += 1;
    }
    return n;
  }

  TK.strength = {
    __registered: true,
    isStrengthBuilder: isStrengthBuilder,
    trainingTonnage: trainingTonnage,
    dayTonnage: dayTonnage,
    countStrengthWorkouts: countStrengthWorkouts
  };
})(typeof window !== 'undefined' ? window : globalThis);
