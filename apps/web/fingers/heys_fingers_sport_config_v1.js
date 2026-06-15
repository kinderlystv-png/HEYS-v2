// heys_fingers_sport_config_v1.js — SPORT_CONFIG instance for climbing fingers.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};
  if (Fingers.__sportConfigRegistered) return;
  Fingers.__sportConfigRegistered = true;

  const QC = Fingers.qualityCatalog || {};
  const qualities = Array.isArray(QC.QUALITIES) ? QC.QUALITIES : [
    'finger_strength', 'max_strength', 'power', 'anaerobic_capacity',
    'aerobic_base', 'technique', 'antagonist', 'mobility', 'mental'
  ];
  const labels = QC.QUALITY_LABELS || {};
  const enumMap = QC.ENUM || {};

  const SPORT_CONFIG = {
    sportId: 'climbing-fingers',
    label: 'Сила хвата',
    namespace: 'Fingers',
    qualityAxes: qualities.map(function (id) {
      return { id: id, label: labels[id] || id };
    }),
    modalities: Array.isArray(enumMap.loadModel)
      ? ['fingerboard', 'board', 'wall', 'campus', 'weights', 'drill', 'mobility', 'antagonist']
      : ['fingerboard'],
    positionAxes: [
      { id: 'gripId', label: 'Хват' },
      { id: 'edgeMm', label: 'Размер зацепа' },
      { id: 'boardId', label: 'Снаряд' }
    ],
    tissueRiskModel: {
      riskTissue: 'A2/A4 pulley, flexor tendons, finger joints',
      loadRatioField: 'a2ForceRatio',
      dangerBudgetCap: 'session bucket cap by readiness/intensity'
    },
    recoveryWindows: { low: 0, moderate: 24, high: 48, max: 72 },
    intensityWeightMap: {
      addedWeightKg: 'addedKg/bodyweight',
      pctMax: 'pctMax/100',
      rpe: 'rpe/10',
      grade: 'domain grade bucket',
      bodyweight: 1,
      rm_margin: 'seconds-to-failure inverse',
      none: 0
    },
    tissueWeights: { low: 0.25, moderate: 0.6, high: 1.0, max: 1.25 },
    benchmarks: 'domain: heys_fingers_assessment_v1',
    transferFunctions: 'domain: calibration/test battery',
    mevMav: 'domain: session_builder/progression policy',
    skillAllocation: 'domain: level policy',
    prerequisitesCatalog: {
      warmup_done: 'session.context.warmupDone === true',
      strength_base: 'profile/training age gate',
      'base_>=1y': 'training age gate',
      'base_>=2y': 'training age gate'
    },
    painLocations: ['finger', 'joint', 'wrist', 'elbow', 'shoulder'],
    ageGate: { highRiskGripMinAge: 18, defaultMinAge: 14 }
  };

  Fingers.SPORT_CONFIG = SPORT_CONFIG;
  const sports = HEYS.TrainingKernel && HEYS.TrainingKernel.sports;
  Fingers.sportConfigResult = sports && typeof sports.register === 'function'
    ? sports.register(SPORT_CONFIG)
    : { ok: true, config: SPORT_CONFIG, issues: [] };
})(typeof window !== 'undefined' ? window : globalThis);
