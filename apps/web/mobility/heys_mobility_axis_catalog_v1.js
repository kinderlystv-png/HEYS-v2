// heys_mobility_axis_catalog_v1.js — Методологический data-слой режима мобильности.
// Аддитивный справочник: 9 осей воздействия (METHODOLOGY ч.2) + enum'ы полей
// атома/блока (CONSTRUCTOR_SPEC §1.2/§1.3). Поведение движка НЕ меняет.
//
// Канонический словарь: где generic-движок (SPORT_CONFIG, fingers §4) задаёт имя,
// держим его; доменные значения (purpose/autonomic/jointRegion) — оси мобильности.
//
// Public API (HEYS.Mobility.axisCatalog):
//   AXES            — 9 осей воздействия (id + label + paired)
//   AXIS_IDS        — массив id осей
//   ENUM            — допустимые значения полей атома/блока
//   isAxis(x)       — x ∈ AXIS_IDS
//   inEnum(val,key) — val ∈ ENUM[key]
//   PAIRED          — парные оси (1↔2 пассив/контроль, 7↔8 мобильность/стабильность)

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__axisCatalogRegistered) return; // idempotent
  Mobility.__axisCatalogRegistered = true;

  // ─── 9 осей воздействия (METHODOLOGY ч.2) ───────────────────────────────────
  const AXES = [
    { id: 'active_rom',      label: 'Подвижность (active ROM)',     pairedWith: 'passive_flex' },
    { id: 'passive_flex',    label: 'Гибкость (passive)',           pairedWith: 'active_rom' },
    { id: 'readiness',       label: 'Готовность к нагрузке',         pairedWith: null },
    { id: 'activation',      label: 'Нервно-мышечная активация',     pairedWith: null },
    { id: 'autonomic',       label: 'Автономное состояние',          pairedWith: null },
    { id: 'tissue_recovery', label: 'Восстановление тканей',         pairedWith: null },
    { id: 'motor_control',   label: 'Моторный контроль',             pairedWith: 'joint_stability' },
    { id: 'joint_stability', label: 'Суставная стабильность',        pairedWith: 'motor_control' },
    { id: 'mental',          label: 'Ментально-эмоциональное',       pairedWith: null }
  ];
  const AXIS_IDS = AXES.map(function (a) { return a.id; });

  // Парные оси (методология ч.2): нельзя растить одну без другой.
  const PAIRED = [
    ['active_rom', 'passive_flex'],
    ['motor_control', 'joint_stability']
  ];

  // ─── enum'ы полей (CONSTRUCTOR_SPEC §1.2/§1.3) ───────────────────────────────
  const ENUM = {
    block:        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    axis:         AXIS_IDS,
    purpose:      ['prep', 'develop', 'recover', 'regulate'],
    autonomic:    ['tonify', 'neutral', 'relax'],
    energySystem: ['phosphagen', 'glycolytic', 'aerobic', null], // мобильность: обычно null
    modality:     ['bodyweight', 'band', 'strap', 'foam_roll', 'ball', 'percussion',
                   'loaded', 'breath', 'bolster', 'wall_env'],
    doseShape:    ['raise', 'dynamic', 'flow', 'activation', 'hold', 'pnf',
                   'eccentric', 'cars', 'smr', 'breath', 'active_rec'],
    jointRegion:  ['ankle', 'knee', 'hip', 'lumbar', 'thoracic', 'shoulder',
                   'wrist', 'neck', 'full', 'systemic'],
    timeOfDay:    ['morning', 'day', 'evening'],
    loadModel:    ['bodyweight', 'addedWeightKg', 'rpe', 'amplitude', 'none'],
    level:        ['beginner', 'intermediate', 'advanced'],
    population:   ['hypermobile', 'pregnancy', 'adolescent', 'older', 'desk'],
    contraind:    ['over_bone', 'over_nerve', 'acute_injury', 'varicose',
                   'valsalva_risk', 'pre_power'],
    equipment:    ['foam_roll', 'band', 'strap', 'ball', 'percussion', 'bolster'],
    fatigueCost:  ['low', 'moderate', 'high'],
    tissueLoad:   ['low', 'moderate', 'high'],
    doseConfidence: ['A', 'B', 'C']
  };

  function isAxis(x) { return AXIS_IDS.indexOf(x) >= 0; }
  function inEnum(val, key) {
    return Object.prototype.hasOwnProperty.call(ENUM, key) && ENUM[key].indexOf(val) >= 0;
  }

  // ─── Экспорт ─────────────────────────────────────────────────────────────────
  Mobility.axisCatalog = {
    __registered: true,
    AXES: AXES,
    AXIS_IDS: AXIS_IDS,
    PAIRED: PAIRED,
    ENUM: ENUM,
    isAxis: isAxis,
    inEnum: inEnum
  };
})(typeof window !== 'undefined' ? window : globalThis);
