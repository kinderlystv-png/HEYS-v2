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

  /**
   * Сводка одной тренировки.
   *
   * Различаются ДВА тоннажа, и это не дубликат, а разный смысл:
   *   totalVolume   — только отмеченные подходы: сколько реально поднято;
   *   plannedVolume — все подходы, включая неотмеченные: сколько набрано в план.
   *
   * До 2026-08-08 обе величины считались независимо в двух местах
   * heys_day_trainings_v1.js (computeDayTotalTonnage — по done, подпись на
   * карточке через calcWorkoutBuilderVolumeKg — по всем), и разойтись они могли
   * молча. Теперь формула одна, а выбор величины — за вызывающим.
   *
   * Упражнение без массива approaches — старый снимок: там подходов нет, есть
   * sets/reps/weightKg. Такие строки идут в обе величины целиком: признака
   * выполнения в них не существует, и отбросить их значило бы потерять историю.
   */
  function trainingTonnage(training) {
    const out = {
      totalVolume: 0, plannedVolume: 0, maxWeight: 0,
      totalApproaches: 0, doneApproaches: 0, exerciseCount: 0,
    };
    if (!isStrengthBuilder(training)) return out;
    const exercises = Array.isArray(training.workoutLog.exercises) ? training.workoutLog.exercises : [];
    for (let j = 0; j < exercises.length; j++) {
      const ex = exercises[j];
      if (!ex) continue;
      const aps = Array.isArray(ex.approaches) ? ex.approaches : [];
      if (aps.length) {
        out.exerciseCount += 1;
        for (let k = 0; k < aps.length; k++) {
          const a = aps[k];
          out.totalApproaches += 1;
          const w = parseFloat(String((a && a.weightKg) || '').replace(',', '.')) || 0;
          const r = +(a && a.reps) || 0;
          const vol = (w > 0 && r > 0) ? w * r : 0;
          out.plannedVolume += vol;
          if (!a || !a.done) continue;
          out.doneApproaches += 1;
          out.totalVolume += vol;
          if (w > out.maxWeight) out.maxWeight = w;
        }
        continue;
      }
      // Legacy-строка: sets × reps × вес, признака выполнения нет.
      const w = parseFloat(String(ex.weightKg || '').replace(',', '.')) || 0;
      const sets = +ex.sets || 0;
      const reps = +ex.reps || 0;
      if (w > 0 && sets > 0 && reps > 0) {
        out.exerciseCount += 1;
        out.totalApproaches += sets;
        out.doneApproaches += sets;
        const vol = w * sets * reps;
        out.totalVolume += vol;
        out.plannedVolume += vol;
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
