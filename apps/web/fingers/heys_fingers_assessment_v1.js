// heys_fingers_assessment_v1.js — Scoring лимитера (Phase 1 / step 3 part 3).
//
// Источник: CONSTRUCTOR_SPEC §3.2 (алгоритм scoring), §3.5 (бенчмарки 🟠),
// §3.8 (skill-аллокация / levelPrior источник). METHODOLOGY §1.4 (лимитер
// мигрирует) + §8.3 (батарея тестов).
//
// Off-live-path: модуль НЕ читается mix_engine'ом. Подключение — Шаг 4 за флагом.
//
// Контракт `assess(testScores, skillFlags, level) → AssessResult`:
//   AssessResult {
//     leadingLimiter,        // ID качества с max limiterScore
//     limiterScores,         // {quality: number} все scoring'и
//     deficits,              // {quality: 0..1}
//     flags,                 // {quality: 0..1}  (только technique/mental)
//     blockWeights,          // {quality: 0..1}, сумма = 1.0 (normalize)
//     stimulus               // {quality: 'develop'|'maintain'} — Q-1.4-3 гибрид
//   }
//
// Public API:
//   HEYS.Fingers.assessment.BENCHMARKS                — таблица §3.5 (🟠 default)
//   HEYS.Fingers.assessment.LEVEL_PRIOR               — appraisal-приоры по уровню
//   HEYS.Fingers.assessment.computeDeficit(q, lvl, score) → 0..1
//   HEYS.Fingers.assessment.computeFlag(markers, max)     → 0..1
//   HEYS.Fingers.assessment.assess(testScores, skillFlags, level) → AssessResult
//
// Все коэффициенты — тюнируемый конфиг. Числа из §3.5/§3.8, не из прозы.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__assessmentRegistered) return; // idempotent
  Fingers.__assessmentRegistered = true;

  // ─── BENCHMARKS — §3.5 🟠 default-таблица ─────────────────────────────────────
  // Только finger_strength имеет уровневую таблицу (1-arm pull, 20мм half-crimp,
  // 7–10с, %BW). Остальные качества: CF/aerobic_base, W′/anaerobic_capacity —
  // нет уровневых нормативов (§3.5), max_strength/power/mobility — нет открытых.
  // Для них на первом тесте deficit=0; лимитер через flag-маркеры (§8.3).
  // null означает «нет данных» → используем flag/нейтрально.
  const BENCHMARKS = {
    finger_strength: {
      beginner: null,        // §3.5: нет данных, экстраполяция вниз недостоверна
      intermediate: 58,      // V4–V7, середина 49–67%
      advanced: 82,          // V8–V11, середина 73–91%
      elite: 107             // V12+, середина 96–118%
    },
    // Остальные q не имеют валидированных уровневых бенчмарков (§3.5):
    max_strength: { beginner: null, intermediate: null, advanced: null, elite: null },
    power: { beginner: null, intermediate: null, advanced: null, elite: null },
    anaerobic_capacity: { beginner: null, intermediate: null, advanced: null, elite: null },
    aerobic_base: { beginner: null, intermediate: null, advanced: null, elite: null },
    mobility: { beginner: null, intermediate: null, advanced: null, elite: null }
  };

  // Качества с flag-based scoring (нет числового теста — навыковые маркеры §8.3).
  const FLAG_QUALITIES = ['technique', 'mental'];
  const ALL_QUALITIES = [
    'finger_strength', 'max_strength', 'power',
    'anaerobic_capacity', 'aerobic_base',
    'technique', 'antagonist', 'mobility', 'mental'
  ];

  // ─── LEVEL_PRIOR — приоры уровня (§3.2 + §3.8 синтез) ────────────────────────
  // Принцип §3.2: «низкий уровень → выше вес technique/mental; элита → выше
  // finger_strength». Это про **чувствительность scoring к дефициту**, не про
  // распределение времени (§3.8 — другая ось).
  // Цифры — 🟠 экспертный baseline, тюнируемый конфиг.
  const LEVEL_PRIOR = {
    beginner: {
      technique: 1.5, mental: 1.3,
      finger_strength: 0.7, max_strength: 0.8, power: 0.8,
      aerobic_base: 0.9, anaerobic_capacity: 0.9,
      antagonist: 1.0, mobility: 1.0
    },
    intermediate: {
      technique: 1.2, mental: 1.1,
      finger_strength: 1.0, max_strength: 1.0, power: 1.0,
      aerobic_base: 1.0, anaerobic_capacity: 1.0,
      antagonist: 1.0, mobility: 1.0
    },
    advanced: {
      technique: 0.9, mental: 1.0,
      finger_strength: 1.2, max_strength: 1.1, power: 1.1,
      aerobic_base: 1.0, anaerobic_capacity: 1.0,
      antagonist: 1.0, mobility: 1.0
    },
    elite: {
      technique: 0.8, mental: 1.0,
      finger_strength: 1.5, max_strength: 1.2, power: 1.2,
      aerobic_base: 1.0, anaerobic_capacity: 1.0,
      antagonist: 1.0, mobility: 1.0
    }
  };

  // ─── Хелперы ──────────────────────────────────────────────────────────────────
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  // ─── computeDeficit (§3.2 шаг 1) ──────────────────────────────────────────────
  // deficit_q = clamp((benchmark − score) / benchmark, 0, 1)
  // benchmark null → 0 (нет данных, нейтрально; см. §3.5 оговорка).
  function computeDeficit(quality, level, score) {
    const benchTable = BENCHMARKS[quality];
    if (!benchTable) return 0;
    const benchmark = num(benchTable[level]);
    if (benchmark === null || benchmark <= 0) return 0; // нет уровневого бенчмарка
    const s = num(score);
    if (s === null) return 0; // нет данных теста
    return clamp01((benchmark - s) / benchmark);
  }

  // ─── computeFlag (§3.2 шаг 2) ─────────────────────────────────────────────────
  // flag_q = markers / max, clamp 0..1
  function computeFlag(markers, max) {
    const m = num(markers);
    const mx = num(max);
    if (m === null || mx === null || mx <= 0) return 0;
    return clamp01(m / mx);
  }

  // ─── assess (§3.2 шаги 3–5 + Q-1.4-3 гибрид) ──────────────────────────────────
  // testScores: { quality: percentBW_number } (числовые тесты)
  // skillFlags: { technique: 0..1, mental: 0..1 }
  // level: 'beginner' | 'intermediate' | 'advanced' | 'elite'
  function assess(testScores, skillFlags, level) {
    if (!LEVEL_PRIOR[level]) {
      return { error: 'assessment.level_unknown', level: level };
    }
    const scores = testScores || {};
    const flags = skillFlags || {};
    const priors = LEVEL_PRIOR[level];

    const deficits = {};
    const flagOut = {};
    const limiterScores = {};

    ALL_QUALITIES.forEach(function (q) {
      let deficit = 0;
      let flag = 0;
      if (FLAG_QUALITIES.indexOf(q) >= 0) {
        flag = clamp01(num(flags[q]) || 0);
      } else {
        deficit = computeDeficit(q, level, scores[q]);
      }
      deficits[q] = deficit;
      flagOut[q] = flag;
      const prior = num(priors[q]);
      limiterScores[q] = Math.max(deficit, flag) * (prior !== null ? prior : 1.0);
    });

    // argmax leadingLimiter
    let leadingLimiter = null;
    let maxScore = -1;
    ALL_QUALITIES.forEach(function (q) {
      if (limiterScores[q] > maxScore) {
        maxScore = limiterScores[q];
        leadingLimiter = q;
      }
    });

    // normalize blockWeights (сумма = 1)
    const total = ALL_QUALITIES.reduce(function (s, q) { return s + limiterScores[q]; }, 0);
    const blockWeights = {};
    ALL_QUALITIES.forEach(function (q) {
      blockWeights[q] = total > 0 ? limiterScores[q] / total : (1 / ALL_QUALITIES.length);
    });

    // Q-1.4-3 гибрид: ведущий = develop, остальные = maintain (порог 0).
    const stimulus = {};
    ALL_QUALITIES.forEach(function (q) {
      stimulus[q] = (q === leadingLimiter) ? 'develop' : 'maintain';
    });

    return {
      leadingLimiter: leadingLimiter,
      limiterScores: limiterScores,
      deficits: deficits,
      flags: flagOut,
      blockWeights: blockWeights,
      stimulus: stimulus,
      maxLimiterScore: maxScore
    };
  }

  Fingers.assessment = {
    BENCHMARKS: BENCHMARKS,
    LEVEL_PRIOR: LEVEL_PRIOR,
    ALL_QUALITIES: ALL_QUALITIES,
    FLAG_QUALITIES: FLAG_QUALITIES,
    computeDeficit: computeDeficit,
    computeFlag: computeFlag,
    assess: assess
  };

})(typeof window !== 'undefined' ? window : globalThis);
