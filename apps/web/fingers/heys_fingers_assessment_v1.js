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
//     stimulus,              // {quality: 'develop'|'maintain'} — Q-1.4-3 гибрид
//     maxLimiterScore        // scalar = limiterScores[leadingLimiter]; для телеметрии/отладки
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

  // ─── BENCHMARKS — §3.5 🟢 Berta 2025 baseline ─────────────────────────────────
  // Только finger_strength имеет уровневую таблицу: MVC on rung, normalized to
  // body mass. Berta et al. 2025 Table 3 даёт mean MVC %BW по IRCRA-группам и
  // полу; ниже — sex-neutral weighted means по n (intermediate 70, advanced 87,
  // elite 102). Supplementary deciles S2–S5 нужны для будущей percentile-UI, но
  // runtime limiter использует один target на уровень. Остальные качества:
  // CF/aerobic_base, W′/anaerobic_capacity — нет уровневых нормативов (§3.5),
  // max_strength/power/mobility — нет открытых. Для них на первом тесте
  // deficit=0; лимитер через flag-маркеры (§8.3). null = «нет данных».
  const BENCHMARKS = {
    finger_strength: {
      beginner: null,        // §3.5: нет данных, экстраполяция вниз недостоверна
      intermediate: 70,      // Berta 2025 Table 3: (48×73 + 27×64) / 75
      advanced: 87,          // Berta 2025 Table 3: (85×92 + 55×78) / 140
      elite: 102             // Berta 2025 Table 3: (45×107 + 39×96) / 84
    },
    // Остальные q не имеют валидированных уровневых бенчмарков (§3.5):
    max_strength: { beginner: null, intermediate: null, advanced: null, elite: null },
    power: { beginner: null, intermediate: null, advanced: null, elite: null },
    anaerobic_capacity: { beginner: null, intermediate: null, advanced: null, elite: null },
    aerobic_base: { beginner: null, intermediate: null, advanced: null, elite: null },
    mobility: { beginner: null, intermediate: null, advanced: null, elite: null }
  };

  // Качества с flag-based scoring (нет числового теста — навыковые маркеры §8.3).
  const FLAG_QUALITIES = ['technique', 'mental', 'mobility', 'antagonist'];
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

  const TEST_BATTERY = Object.freeze({
    maxHang20mmHalf: {
      id: 'maxHang20mmHalf',
      quality: 'finger_strength',
      scoreKey: 'finger_strength',
      label: '20mm half-crimp max hang',
      unit: 'pctBW',
      cadenceDays: 56
    },
    weightedPull: {
      id: 'weightedPull',
      quality: 'max_strength',
      scoreKey: 'max_strength',
      label: 'Weighted pull / pull strength',
      unit: 'pctBW',
      cadenceDays: 56
    },
    rfdContact: {
      id: 'rfdContact',
      quality: 'power',
      scoreKey: 'power',
      label: 'Contact strength / RFD',
      unit: 'score',
      cadenceDays: 56
    },
    criticalForce: {
      id: 'criticalForce',
      quality: 'aerobic_base',
      scoreKey: 'aerobic_base',
      label: 'Critical Force',
      unit: 'pctMVC',
      cadenceDays: 56
    },
    wPrime: {
      id: 'wPrime',
      quality: 'anaerobic_capacity',
      scoreKey: 'anaerobic_capacity',
      label: 'W prime / capacity',
      unit: 'score',
      cadenceDays: 56
    },
    techniqueMarkers: {
      id: 'techniqueMarkers',
      quality: 'technique',
      flagKey: 'technique',
      label: 'Technique checklist',
      unit: 'markers',
      maxMarkers: 5,
      cadenceDays: 28
    },
    mentalMarkers: {
      id: 'mentalMarkers',
      quality: 'mental',
      flagKey: 'mental',
      label: 'Mental / tactics checklist',
      unit: 'markers',
      maxMarkers: 3,
      cadenceDays: 28
    },
    mobilityMarkers: {
      id: 'mobilityMarkers',
      quality: 'mobility',
      flagKey: 'mobility',
      label: 'Mobility checklist',
      unit: 'markers',
      maxMarkers: 3,
      cadenceDays: 28
    },
    antagonistMarkers: {
      id: 'antagonistMarkers',
      quality: 'antagonist',
      flagKey: 'antagonist',
      label: 'Antagonist / prehab checklist',
      unit: 'markers',
      maxMarkers: 3,
      cadenceDays: 28
    }
  });

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
    // формула дефицита — из ОБЩЕГО ЯДРА (HEYS.TrainingKernel.assess); фолбэк локальный
    const ka = HEYS.TrainingKernel && HEYS.TrainingKernel.assess;
    return ka && ka.deficit ? ka.deficit(benchmark, s) : clamp01((benchmark - s) / benchmark);
  }

  // ─── computeFlag (§3.2 шаг 2) ─────────────────────────────────────────────────
  // flag_q = markers / max, clamp 0..1
  function computeFlag(markers, max) {
    const m = num(markers);
    const mx = num(max);
    if (m === null || mx === null || mx <= 0) return 0;
    return clamp01(m / mx);
  }

  function normalizeBatteryResults(raw) {
    const input = raw || {};
    const out = {};
    Object.keys(TEST_BATTERY).forEach(function (id) {
      const test = TEST_BATTERY[id];
      const r = input[id] || input[test.quality] || null;
      if (!r || typeof r !== 'object') return;
      const score = num(r.score);
      const markers = num(r.markers);
      out[id] = {
        id: id,
        quality: test.quality,
        score: score,
        markers: markers,
        maxMarkers: num(r.maxMarkers) || test.maxMarkers || null,
        testedAt: r.testedAt || null,
        source: r.source || 'manual'
      };
    });
    return out;
  }

  function scoresFromBattery(raw) {
    const normalized = normalizeBatteryResults(raw);
    const testScores = {};
    const skillFlags = {};
    Object.keys(normalized).forEach(function (id) {
      const test = TEST_BATTERY[id];
      const r = normalized[id];
      if (test.scoreKey && r.score !== null) {
        testScores[test.scoreKey] = r.score;
      }
      if (test.flagKey) {
        skillFlags[test.flagKey] = computeFlag(r.markers, r.maxMarkers || test.maxMarkers);
      }
    });
    return { testScores: testScores, skillFlags: skillFlags, normalized: normalized };
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

    const ka = HEYS.TrainingKernel && HEYS.TrainingKernel.assess;
    const candidates = ALL_QUALITIES.map(function (q) {
      return { id: q, deficit: deficits[q], flag: flagOut[q], prior: priors[q] };
    });
    const kResult = ka && typeof ka.limiter === 'function'
      ? ka.limiter(candidates, { zeroTotalPolicy: 'uniform' })
      : null;

    let leadingLimiter = kResult && kResult.leadingLimiter;
    let maxScore = kResult ? kResult.maxLimiterScore : -1;
    let blockWeights = kResult && kResult.blockWeights;
    let stimulus = kResult && kResult.stimulus;

    if (!kResult) {
      ALL_QUALITIES.forEach(function (q) {
        if (limiterScores[q] > maxScore) {
          maxScore = limiterScores[q];
          leadingLimiter = q;
        }
      });
      const total = ALL_QUALITIES.reduce(function (s, q) { return s + limiterScores[q]; }, 0);
      blockWeights = {};
      ALL_QUALITIES.forEach(function (q) {
        blockWeights[q] = total > 0 ? limiterScores[q] / total : (1 / ALL_QUALITIES.length);
      });
      stimulus = {};
      ALL_QUALITIES.forEach(function (q) {
        stimulus[q] = (q === leadingLimiter) ? 'develop' : 'maintain';
      });
    } else {
      Object.keys(kResult.limiterScores || {}).forEach(function (q) {
        limiterScores[q] = kResult.limiterScores[q];
      });
    }

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

  function assessBattery(rawBatteryResults, level) {
    const mapped = scoresFromBattery(rawBatteryResults);
    const result = assess(mapped.testScores, mapped.skillFlags, level);
    return Object.assign({}, result, {
      battery: mapped.normalized,
      testScores: mapped.testScores,
      skillFlags: mapped.skillFlags
    });
  }

  function dueTests(rawBatteryResults, nowMs) {
    const normalized = normalizeBatteryResults(rawBatteryResults);
    const now = num(nowMs) || Date.now();
    return Object.keys(TEST_BATTERY).map(function (id) {
      const test = TEST_BATTERY[id];
      const r = normalized[id];
      const t = r && r.testedAt ? Date.parse(r.testedAt) : 0;
      const daysSince = t > 0 ? Math.floor((now - t) / (1000 * 60 * 60 * 24)) : null;
      const due = daysSince === null || daysSince >= test.cadenceDays;
      return {
        id: id,
        quality: test.quality,
        due: due,
        daysSince: daysSince,
        cadenceDays: test.cadenceDays
      };
    });
  }

  Fingers.assessment = {
    BENCHMARKS: BENCHMARKS,
    LEVEL_PRIOR: LEVEL_PRIOR,
    TEST_BATTERY: TEST_BATTERY,
    ALL_QUALITIES: ALL_QUALITIES,
    FLAG_QUALITIES: FLAG_QUALITIES,
    computeDeficit: computeDeficit,
    computeFlag: computeFlag,
    normalizeBatteryResults: normalizeBatteryResults,
    scoresFromBattery: scoresFromBattery,
    assess: assess,
    assessBattery: assessBattery,
    dueTests: dueTests
  };

})(typeof window !== 'undefined' ? window : globalThis);
