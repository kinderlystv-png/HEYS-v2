// heys_mobility_sport_config_v1.js — SPORT_CONFIG instance for mobility.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};
  if (Mobility.__sportConfigRegistered) return;
  Mobility.__sportConfigRegistered = true;

  const AC = Mobility.axisCatalog || {};
  const axes = Array.isArray(AC.AXES) ? AC.AXES : [];
  const enumMap = AC.ENUM || {};

  const SPORT_CONFIG = {
    sportId: 'mobility',
    label: 'Мобильность',
    namespace: 'Mobility',
    qualityAxes: axes.length ? axes.map(function (axis) {
      return { id: axis.id, label: axis.label, pairedWith: axis.pairedWith || null };
    }) : [
      { id: 'active_rom', label: 'Подвижность (active ROM)', pairedWith: 'passive_flex' },
      { id: 'passive_flex', label: 'Гибкость (passive)', pairedWith: 'active_rom' },
      { id: 'readiness', label: 'Готовность к нагрузке', pairedWith: null }
    ],
    modalities: Array.isArray(enumMap.modality) ? enumMap.modality.slice() : ['bodyweight', 'band', 'strap'],
    positionAxes: [
      { id: 'jointRegion', label: 'Сустав / зона' },
      { id: 'timeOfDay', label: 'Время суток' }
    ],
    tissueRiskModel: {
      riskTissue: 'joint capsule, muscle-tendon unit, instability risk in hypermobility',
      loadRatioField: 'endRangeLoad × amplitude',
      dangerBudgetCap: 'end-range / ballistic volume cap by level'
    },
    recoveryWindows: { low: 0, moderate: 12, high: 48 },
    intensityWeightMap: {
      bodyweight: 0.4,
      amplitude: '0.4..1.0 by available range',
      addedWeightKg: '1 + added/bodyweight',
      rpe: 'rpe/7',
      none: 0
    },
    tissueWeights: { low: 0.3, moderate: 0.6, high: 1.0 },
    benchmarks: 'domain: heys_mobility_assessment_v1',
    doseDefaults: 'domain: atom/protocol catalogs',
    progressionRule: 'hold-default; switch-variable-on-plateau',
    mevMav: { rom_development: '~5–10 min/week per muscle, 2–3×/week' },
    skillAllocation: null,
    modes: [
      { id: 'morning_tonify', purpose: 'prep', autonomic: 'tonify' },
      { id: 'pre_workout_ramp', purpose: 'prep', autonomic: 'tonify' },
      { id: 'post_workout', purpose: 'recover', autonomic: 'relax' },
      { id: 'develop_mobility', purpose: 'develop', autonomic: 'neutral' },
      { id: 'evening_relax', purpose: 'regulate', autonomic: 'relax' },
      { id: 'rehab', purpose: 'recover', autonomic: 'neutral' },
      { id: 'anti_sedentary', purpose: 'prep', autonomic: 'tonify' }
    ],
    prerequisitesCatalog: {
      warmup_done: 'session.warmupCompleted === true',
      'equipment:<X>': 'X in profile.equipment',
      no_acute_pain: 'no active pain flag for atom zone'
    },
    painLocations: Array.isArray(enumMap.jointRegion) ? enumMap.jointRegion.slice() : ['ankle', 'hip', 'shoulder'],
    ageGate: {
      aggressivePnf: 'adolescents require conservative gate',
      hypermobile: 'stability-first'
    }
  };

  Mobility.SPORT_CONFIG = SPORT_CONFIG;
  const sports = HEYS.TrainingKernel && HEYS.TrainingKernel.sports;
  Mobility.sportConfigResult = sports && typeof sports.register === 'function'
    ? sports.register(SPORT_CONFIG)
    : { ok: true, config: SPORT_CONFIG, issues: [] };
})(typeof window !== 'undefined' ? window : globalThis);
