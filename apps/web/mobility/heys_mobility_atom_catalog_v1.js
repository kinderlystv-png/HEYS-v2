// heys_mobility_atom_catalog_v1.js — Каталог атомов режима мобильности (данные).
//
// Контент домена как ДАННЫЕ (правило «ядро + контент»). Каждый атом — по схеме
// CONSTRUCTOR_SPEC §1.2 (gates-подобъект — форма контракта валидаторов ядра).
// Все блоки A–J представлены. Instructional content хранится как данные атома.
//
// Зависит от HEYS.Mobility.axisCatalog (ENUM/AXIS_IDS) для validateAtom.
//
// Public API (HEYS.Mobility.atomCatalog):
//   ATOMS              — массив атомов
//   getAtom(id)        — атом по id | null
//   byBlock(block)     — атомы блока
//   byAxis(axis)       — атомы оси
//   byPurpose(purpose) — атомы по цели
//   validateAtom(atom) — Issue[]-подобный массив строк-ошибок (пусто = ок)
//   validateAll()      — { errors:[], count }

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__atomCatalogRegistered) return; // idempotent
  Mobility.__atomCatalogRegistered = true;

  // Дефолт гейтов: безопасные значения (minAge:0 = явно без возрастного гейта).
  function gates(over) {
    return Object.assign({
      minLevel: 'beginner', minAge: 0, populationGate: [],
      contraind: [], equipment: [], prerequisites: []
    }, over || {});
  }

  // ─── Каталог (A–J) ──────────────────────────────────────────────────────────
  const ATOMS = [
    // ── A. Пульс-разминка / разогрев ──
    { id: 'wu_pulse_raise', block: 'A', axis: 'readiness', purpose: 'prep', autonomic: 'tonify', energySystem: null,
      modality: 'bodyweight', doseShape: 'raise', dose: { durationSec: 480, intensity: 'rising' },
      jointRegion: 'full', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['jeffreys2007'], doseConfidence: 'A' },
    { id: 'wu_locomotor', block: 'A', axis: 'readiness', purpose: 'prep', autonomic: 'tonify', energySystem: null,
      modality: 'bodyweight', doseShape: 'raise', dose: { durationSec: 300, intensity: 'rising' },
      jointRegion: 'full', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['jeffreys2007'], doseConfidence: 'B' },

    // ── B. Динамическая мобилизация ──
    { id: 'mob_dynamic_legswing_hip', block: 'B', axis: 'active_rom', purpose: 'prep', autonomic: 'tonify', energySystem: null,
      modality: 'bodyweight', doseShape: 'dynamic', dose: { reps: [8, 12], sets: 1, tempo: 'controlled' },
      jointRegion: 'hip', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['behm2016'], doseConfidence: 'A' },
    { id: 'mob_flow_worlds_greatest', block: 'B', axis: 'active_rom', purpose: 'prep', autonomic: 'neutral', energySystem: null,
      modality: 'bodyweight', doseShape: 'flow', dose: { durationSec: 120, rounds: 2, sequence: ['lunge', 'rotation', 'reach'] },
      jointRegion: 'full', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['behm2016'], doseConfidence: 'B' },
    { id: 'mob_dynamic_thoracic_openbook', block: 'B', axis: 'active_rom', purpose: 'prep', autonomic: 'neutral', energySystem: null,
      modality: 'bodyweight', doseShape: 'dynamic', dose: { reps: [6, 10], sets: 1, tempo: 'controlled' },
      jointRegion: 'thoracic', timeOfDayPref: null, loadModel: 'amplitude', loadValue: 0.7,
      gates: gates(), sourceIds: ['cook_boyle_jbj'], doseConfidence: 'B' },
    { id: 'mob_thoracic_extension_foamroll', block: 'B', axis: 'active_rom', purpose: 'prep', autonomic: 'neutral', energySystem: null,
      modality: 'foam_roll', doseShape: 'dynamic', dose: { reps: [6, 10], sets: 1, tempo: 'slow' },
      jointRegion: 'thoracic', timeOfDayPref: null, loadModel: 'amplitude', loadValue: 0.6,
      gates: gates({ equipment: ['foam_roll'], contraind: ['over_bone', 'acute_injury'] }), sourceIds: ['jospt2017neck', 'cook_boyle_jbj'], doseConfidence: 'B' },
    { id: 'mob_shoulder_extension_strap', block: 'B', axis: 'active_rom', purpose: 'prep', autonomic: 'neutral', energySystem: null,
      modality: 'strap', doseShape: 'dynamic', dose: { reps: [8, 12], sets: 1, tempo: 'controlled' },
      jointRegion: 'shoulder', timeOfDayPref: null, loadModel: 'amplitude', loadValue: 0.55,
      gates: gates({ equipment: ['strap'] }), sourceIds: ['jospt2017neck'], doseConfidence: 'C' },

    // ── C. Активация ──
    { id: 'act_deep_neck_flexor_nod', block: 'C', axis: 'activation', purpose: 'prep', autonomic: 'tonify', energySystem: null,
      modality: 'bodyweight', doseShape: 'activation', dose: { reps: [6, 10], sets: 2, restSec: 20 },
      jointRegion: 'neck', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['jospt2017neck'], doseConfidence: 'A' },
    { id: 'act_wall_angels', block: 'C', axis: 'motor_control', purpose: 'prep', autonomic: 'tonify', energySystem: null,
      modality: 'wall_env', doseShape: 'activation', dose: { reps: [6, 10], sets: 2, restSec: 25 },
      jointRegion: 'shoulder', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['jospt2017neck', 'warneke2024strengthposture'], doseConfidence: 'B' },
    { id: 'act_prone_scapular_w', block: 'C', axis: 'activation', purpose: 'prep', autonomic: 'tonify', energySystem: null,
      modality: 'bodyweight', doseShape: 'activation', dose: { reps: [8, 12], sets: 2, restSec: 30 },
      jointRegion: 'shoulder', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['jospt2017neck', 'warneke2024strengthposture'], doseConfidence: 'B' },
    { id: 'act_band_pullapart', block: 'C', axis: 'activation', purpose: 'prep', autonomic: 'tonify', energySystem: null,
      modality: 'band', doseShape: 'activation', dose: { reps: [12, 20], sets: 2, restSec: 30 },
      jointRegion: 'shoulder', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates({ equipment: ['band'] }), sourceIds: ['cook_boyle_jbj'], doseConfidence: 'B' },
    { id: 'act_glute_bridge', block: 'C', axis: 'activation', purpose: 'prep', autonomic: 'tonify', energySystem: null,
      modality: 'bodyweight', doseShape: 'activation', dose: { reps: [10, 15], sets: 2, restSec: 30 },
      jointRegion: 'hip', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['cook_boyle_jbj'], doseConfidence: 'B' },
    { id: 'act_band_lateral_walk', block: 'C', axis: 'activation', purpose: 'prep', autonomic: 'tonify', energySystem: null,
      modality: 'band', doseShape: 'activation', dose: { reps: [10, 15], sets: 2, restSec: 30 },
      jointRegion: 'hip', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates({ equipment: ['band'] }), sourceIds: ['cook_boyle_jbj'], doseConfidence: 'B' },

    // ── D. Статическая растяжка ──
    { id: 'flex_static_hamstring', block: 'D', axis: 'passive_flex', purpose: 'develop', autonomic: 'neutral', energySystem: null,
      modality: 'strap', doseShape: 'hold', dose: { holdSec: 30, reps: 1, sets: 2, restSec: 20, intensity: 'develop' },
      jointRegion: 'hip', timeOfDayPref: 'evening', loadModel: 'amplitude', loadValue: 0.8,
      gates: gates({ populationGate: ['hypermobile'], equipment: ['strap'] }), sourceIds: ['warneke2025delphi', 'konrad2023'], doseConfidence: 'B' },
    { id: 'flex_static_calf', block: 'D', axis: 'passive_flex', purpose: 'develop', autonomic: 'neutral', energySystem: null,
      modality: 'wall_env', doseShape: 'hold', dose: { holdSec: 30, reps: 1, sets: 2, restSec: 20, intensity: 'develop' },
      jointRegion: 'ankle', timeOfDayPref: 'evening', loadModel: 'amplitude', loadValue: 0.8,
      gates: gates({ populationGate: ['hypermobile'] }), sourceIds: ['warneke2025delphi'], doseConfidence: 'B' },
    { id: 'flex_static_hipflexor', block: 'D', axis: 'passive_flex', purpose: 'develop', autonomic: 'neutral', energySystem: null,
      modality: 'bodyweight', doseShape: 'hold', dose: { holdSec: 30, reps: 1, sets: 2, restSec: 20, intensity: 'develop' },
      jointRegion: 'hip', timeOfDayPref: 'evening', loadModel: 'amplitude', loadValue: 0.8,
      gates: gates({ populationGate: ['hypermobile'] }), sourceIds: ['konrad2023'], doseConfidence: 'B' },
    { id: 'flex_relax_supine_comfort', block: 'D', axis: 'autonomic', purpose: 'regulate', autonomic: 'relax', energySystem: null,
      modality: 'bodyweight', doseShape: 'hold', dose: { holdSec: 45, reps: 1, sets: 2, restSec: 15, intensity: 'comfort' },
      jointRegion: 'full', timeOfDayPref: 'evening', loadModel: 'amplitude', loadValue: 0.4,
      gates: gates(), sourceIds: ['warneke2025delphi'], doseConfidence: 'C' },
    { id: 'flex_static_pec_wall', block: 'D', axis: 'passive_flex', purpose: 'develop', autonomic: 'neutral', energySystem: null,
      modality: 'wall_env', doseShape: 'hold', dose: { holdSec: 30, reps: 1, sets: 2, restSec: 20, intensity: 'comfort' },
      jointRegion: 'shoulder', timeOfDayPref: null, loadModel: 'amplitude', loadValue: 0.55,
      gates: gates({ populationGate: ['hypermobile'] }), sourceIds: ['warneke2024posture', 'jospt2017neck'], doseConfidence: 'C' },

    // ── E. PNF / contract-relax ──
    { id: 'flex_pnf_hamstring_hr', block: 'E', axis: 'passive_flex', purpose: 'develop', autonomic: 'neutral', energySystem: null,
      modality: 'strap', doseShape: 'pnf', dose: { contractSec: 5, contractPct: 30, relaxSec: 3, holdSec: 20, reps: 3 },
      jointRegion: 'hip', timeOfDayPref: null, loadModel: 'amplitude', loadValue: 0.85,
      gates: gates({ minLevel: 'intermediate', minAge: 16, populationGate: ['hypermobile'], contraind: ['valsalva_risk'], equipment: ['strap'] }),
      sourceIds: ['konrad2023'], doseConfidence: 'B' },
    { id: 'flex_pnf_hipflexor_crac', block: 'E', axis: 'passive_flex', purpose: 'develop', autonomic: 'neutral', energySystem: null,
      modality: 'bodyweight', doseShape: 'pnf', dose: { contractSec: 5, contractPct: 30, relaxSec: 3, holdSec: 20, reps: 3 },
      jointRegion: 'hip', timeOfDayPref: null, loadModel: 'amplitude', loadValue: 0.85,
      gates: gates({ minLevel: 'intermediate', minAge: 16, populationGate: ['hypermobile'], contraind: ['valsalva_risk'] }),
      sourceIds: ['konrad2023'], doseConfidence: 'B' },

    // ── F. Нагруженная / эксцентрическая мобильность ──
    { id: 'loadmob_nordic_eccentric', block: 'F', axis: 'motor_control', purpose: 'develop', autonomic: 'neutral', energySystem: null,
      modality: 'bodyweight', doseShape: 'eccentric', dose: { reps: 6, sets: 2, tempoEccSec: 4 },
      jointRegion: 'hip', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null, fatigueCost: 'high', tissueLoad: 'high',
      gates: gates({ minLevel: 'intermediate', minAge: 16 }), sourceIds: ['eccflex2022', 'fifa11plus'], doseConfidence: 'A' },
    { id: 'loadmob_cossack_loaded_hold', block: 'F', axis: 'active_rom', purpose: 'develop', autonomic: 'neutral', energySystem: null,
      modality: 'loaded', doseShape: 'hold', dose: { holdSec: 20, reps: 1, sets: 3, restSec: 30, intensity: 'develop' },
      jointRegion: 'hip', timeOfDayPref: null, loadModel: 'addedWeightKg', loadValue: null, fatigueCost: 'moderate', tissueLoad: 'high',
      gates: gates({ minLevel: 'intermediate', minAge: 16 }), sourceIds: ['eccflex2022'], doseConfidence: 'B' },
    { id: 'loadmob_pails_rails_hip', block: 'F', axis: 'motor_control', purpose: 'develop', autonomic: 'neutral', energySystem: null,
      modality: 'bodyweight', doseShape: 'hold', dose: { holdSec: 15, reps: 2, sets: 2, restSec: 30, intensity: 'develop' },
      jointRegion: 'hip', timeOfDayPref: null, loadModel: 'amplitude', loadValue: 0.95, fatigueCost: 'moderate', tissueLoad: 'moderate',
      gates: gates({ minLevel: 'intermediate', minAge: 16 }), sourceIds: ['spina_frc'], doseConfidence: 'C' },

    // ── G. CARs / суставные вращения ──
    { id: 'joint_cars_hip', block: 'G', axis: 'joint_stability', purpose: 'regulate', autonomic: 'tonify', energySystem: null,
      modality: 'bodyweight', doseShape: 'cars', dose: { reps: [2, 3], tempo: 'slow' },
      jointRegion: 'hip', timeOfDayPref: 'morning', loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['spina_frc'], doseConfidence: 'C' },
    { id: 'joint_cars_shoulder', block: 'G', axis: 'joint_stability', purpose: 'regulate', autonomic: 'tonify', energySystem: null,
      modality: 'bodyweight', doseShape: 'cars', dose: { reps: [2, 3], tempo: 'slow' },
      jointRegion: 'shoulder', timeOfDayPref: 'morning', loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['spina_frc'], doseConfidence: 'C' },
    { id: 'joint_cars_spine', block: 'G', axis: 'motor_control', purpose: 'regulate', autonomic: 'tonify', energySystem: null,
      modality: 'bodyweight', doseShape: 'cars', dose: { reps: [2, 3], tempo: 'slow' },
      jointRegion: 'thoracic', timeOfDayPref: 'morning', loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['spina_frc'], doseConfidence: 'C' },

    // ── H. Самомассаж / МФР ──
    { id: 'smr_foamroll_quad', block: 'H', axis: 'tissue_recovery', purpose: 'recover', autonomic: 'neutral', energySystem: null,
      modality: 'foam_roll', doseShape: 'smr', dose: { durationSec: 60, sets: 1, target: 'quad' },
      jointRegion: 'hip', timeOfDayPref: null, loadModel: 'none', loadValue: null,
      gates: gates({ equipment: ['foam_roll'], contraind: ['over_bone', 'over_nerve', 'acute_injury'] }), sourceIds: ['behmwilke2019'], doseConfidence: 'A' },
    { id: 'smr_ball_glute', block: 'H', axis: 'tissue_recovery', purpose: 'recover', autonomic: 'neutral', energySystem: null,
      modality: 'ball', doseShape: 'smr', dose: { durationSec: 60, sets: 1, target: 'glute' },
      jointRegion: 'hip', timeOfDayPref: null, loadModel: 'none', loadValue: null,
      gates: gates({ equipment: ['ball'], contraind: ['over_bone', 'over_nerve', 'acute_injury'] }), sourceIds: ['behmwilke2019'], doseConfidence: 'B' },
    { id: 'smr_ball_pec_minor', block: 'H', axis: 'tissue_recovery', purpose: 'recover', autonomic: 'neutral', energySystem: null,
      modality: 'ball', doseShape: 'smr', dose: { durationSec: 45, sets: 1, target: 'pec_minor' },
      jointRegion: 'shoulder', timeOfDayPref: null, loadModel: 'none', loadValue: null,
      gates: gates({ equipment: ['ball'], contraind: ['over_bone', 'over_nerve', 'acute_injury'] }), sourceIds: ['behmwilke2019', 'jospt2017neck'], doseConfidence: 'C' },
    { id: 'smr_percussion_calf', block: 'H', axis: 'tissue_recovery', purpose: 'recover', autonomic: 'neutral', energySystem: null,
      modality: 'percussion', doseShape: 'smr', dose: { durationSec: 60, sets: 1, target: 'calf' },
      jointRegion: 'ankle', timeOfDayPref: null, loadModel: 'none', loadValue: null,
      gates: gates({ equipment: ['percussion'], contraind: ['over_bone', 'over_nerve', 'acute_injury', 'pre_power'] }), sourceIds: ['behmwilke2019'], doseConfidence: 'B' },
    { id: 'smr_percussion_upper_back', block: 'H', axis: 'tissue_recovery', purpose: 'recover', autonomic: 'neutral', energySystem: null,
      modality: 'percussion', doseShape: 'smr', dose: { durationSec: 45, sets: 1, target: 'upper_back' },
      jointRegion: 'thoracic', timeOfDayPref: null, loadModel: 'none', loadValue: null,
      gates: gates({ equipment: ['percussion'], contraind: ['over_bone', 'over_nerve', 'acute_injury', 'pre_power'] }), sourceIds: ['behmwilke2019'], doseConfidence: 'C' },

    // ── I. Дыхание / down-regulation ──
    { id: 'breath_cyclic_sigh', block: 'I', axis: 'autonomic', purpose: 'regulate', autonomic: 'relax', energySystem: null,
      modality: 'breath', doseShape: 'breath', dose: { pattern: 'cyclic_sigh', durationSec: 300, ratio: { in: 2, hold: 0, out: 6 } },
      jointRegion: 'systemic', timeOfDayPref: 'evening', loadModel: 'none', loadValue: null,
      gates: gates(), sourceIds: ['spiegel2023'], doseConfidence: 'A' },
    { id: 'breath_resonant', block: 'I', axis: 'autonomic', purpose: 'regulate', autonomic: 'relax', energySystem: null,
      modality: 'breath', doseShape: 'breath', dose: { pattern: 'resonant', durationSec: 300, ratio: { in: 5, hold: 0, out: 5 } },
      jointRegion: 'systemic', timeOfDayPref: 'evening', loadModel: 'none', loadValue: null,
      gates: gates(), sourceIds: ['slowbreath2022'], doseConfidence: 'A' },
    { id: 'breath_box_tonify', block: 'I', axis: 'autonomic', purpose: 'regulate', autonomic: 'tonify', energySystem: null,
      modality: 'breath', doseShape: 'breath', dose: { pattern: 'box', durationSec: 180, ratio: { in: 4, hold: 4, out: 4 } },
      jointRegion: 'systemic', timeOfDayPref: 'morning', loadModel: 'none', loadValue: null,
      gates: gates(), sourceIds: ['slowbreath2022'], doseConfidence: 'B' },
    { id: 'restorative_supported_bolster', block: 'I', axis: 'autonomic', purpose: 'regulate', autonomic: 'relax', energySystem: null,
      modality: 'bolster', doseShape: 'hold', dose: { holdSec: 120, reps: 1, sets: 1, restSec: 0, intensity: 'comfort' },
      jointRegion: 'full', timeOfDayPref: 'evening', loadModel: 'amplitude', loadValue: 0.3,
      gates: gates({ equipment: ['bolster'] }), sourceIds: ['slowbreath2022'], doseConfidence: 'C' },

    // ── J. Активное восстановление / анти-седентарность ──
    { id: 'recov_active_walk', block: 'J', axis: 'tissue_recovery', purpose: 'recover', autonomic: 'neutral', energySystem: null,
      modality: 'bodyweight', doseShape: 'active_rec', dose: { durationSec: 600 },
      jointRegion: 'full', timeOfDayPref: null, loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['dupuy2018'], doseConfidence: 'B' },
    { id: 'recov_movement_snack', block: 'J', axis: 'readiness', purpose: 'prep', autonomic: 'tonify', energySystem: null,
      modality: 'bodyweight', doseShape: 'dynamic', dose: { reps: [5, 10], sets: 1, tempo: 'controlled' },
      jointRegion: 'full', timeOfDayPref: 'day', loadModel: 'bodyweight', loadValue: null,
      gates: gates(), sourceIds: ['dupuy2018'], doseConfidence: 'B' }
  ];

  const LOAD_META = {
    wu_pulse_raise: { difficulty: 3, minLoadLevel: 2, maxLoadLevel: 5 },
    wu_locomotor: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    mob_dynamic_legswing_hip: { difficulty: 3, minLoadLevel: 2, maxLoadLevel: 5 },
    mob_flow_worlds_greatest: { difficulty: 4, minLoadLevel: 3, maxLoadLevel: 5 },
    mob_dynamic_thoracic_openbook: { difficulty: 1, minLoadLevel: 1, maxLoadLevel: 4 },
    mob_thoracic_extension_foamroll: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    mob_shoulder_extension_strap: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    act_deep_neck_flexor_nod: { difficulty: 1, minLoadLevel: 1, maxLoadLevel: 3 },
    act_wall_angels: { difficulty: 3, minLoadLevel: 1, maxLoadLevel: 4 },
    act_prone_scapular_w: { difficulty: 3, minLoadLevel: 2, maxLoadLevel: 5 },
    act_band_pullapart: { difficulty: 3, minLoadLevel: 2, maxLoadLevel: 5 },
    act_glute_bridge: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    act_band_lateral_walk: { difficulty: 4, minLoadLevel: 3, maxLoadLevel: 5 },
    flex_static_hamstring: { difficulty: 3, minLoadLevel: 2, maxLoadLevel: 5 },
    flex_static_calf: { difficulty: 3, minLoadLevel: 2, maxLoadLevel: 5 },
    flex_static_hipflexor: { difficulty: 3, minLoadLevel: 2, maxLoadLevel: 5 },
    flex_relax_supine_comfort: { difficulty: 1, minLoadLevel: 1, maxLoadLevel: 2 },
    flex_static_pec_wall: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    flex_pnf_hamstring_hr: { difficulty: 4, minLoadLevel: 3, maxLoadLevel: 5 },
    flex_pnf_hipflexor_crac: { difficulty: 4, minLoadLevel: 3, maxLoadLevel: 5 },
    loadmob_nordic_eccentric: { difficulty: 5, minLoadLevel: 4, maxLoadLevel: 5 },
    loadmob_cossack_loaded_hold: { difficulty: 5, minLoadLevel: 4, maxLoadLevel: 5 },
    loadmob_pails_rails_hip: { difficulty: 4, minLoadLevel: 3, maxLoadLevel: 5 },
    joint_cars_hip: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    joint_cars_shoulder: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    joint_cars_spine: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    smr_foamroll_quad: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    smr_ball_glute: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    smr_ball_pec_minor: { difficulty: 1, minLoadLevel: 1, maxLoadLevel: 3 },
    smr_percussion_calf: { difficulty: 3, minLoadLevel: 2, maxLoadLevel: 5 },
    smr_percussion_upper_back: { difficulty: 3, minLoadLevel: 2, maxLoadLevel: 5 },
    breath_cyclic_sigh: { difficulty: 1, minLoadLevel: 1, maxLoadLevel: 3 },
    breath_resonant: { difficulty: 1, minLoadLevel: 1, maxLoadLevel: 3 },
    breath_box_tonify: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    restorative_supported_bolster: { difficulty: 1, minLoadLevel: 1, maxLoadLevel: 3 },
    recov_active_walk: { difficulty: 2, minLoadLevel: 1, maxLoadLevel: 4 },
    recov_movement_snack: { difficulty: 1, minLoadLevel: 1, maxLoadLevel: 3 }
  };

  const CONTENT = {
    wu_pulse_raise: {
      title: 'Пульс-разогрев',
      instruction: 'Начни с лёгкого движения и за 5-8 минут плавно подними температуру тела.',
      cues: ['дыши ровно', 'темп растёт постепенно', 'без рывков и боли']
    },
    wu_locomotor: {
      title: 'Локомоторная разминка',
      instruction: 'Чередуй шаги, лёгкие выпады и перемещения, чтобы подготовить всё тело к работе.',
      cues: ['держи амплитуду средней', 'прибавляй скорость к концу', 'не уходи в максимум с холода']
    },
    mob_dynamic_legswing_hip: {
      title: 'Динамические махи бедром',
      instruction: 'Выполняй контролируемые махи ногой вперёд-назад или в сторону, увеличивая амплитуду постепенно.',
      cues: ['корпус стабилен', 'движение без заброса', 'остановись при боли']
    },
    mob_flow_worlds_greatest: {
      title: 'Мобилизационный выпад с ротацией',
      instruction: 'Из выпада мягко чередуй раскрытие грудного отдела, дотягивание рукой и возврат в нейтраль.',
      cues: ['таз не проваливается', 'шея длинная', 'движение текучее']
    },
    mob_dynamic_thoracic_openbook: {
      title: 'Open book для грудного отдела',
      instruction: 'Лёжа на боку раскрывай грудной отдел рукой назад, сохраняя таз спокойным.',
      cues: ['колени вместе', 'выдох на раскрытии', 'не дави плечом в боль']
    },
    mob_thoracic_extension_foamroll: {
      title: 'Разгибание грудного отдела на валике',
      instruction: 'Положи валик под верх спины и мягко раскрой грудной отдел на выдохе без давления на шею.',
      cues: ['валик не под поясницей', 'шея поддержана', 'амплитуда умеренная']
    },
    mob_shoulder_extension_strap: {
      title: 'Мобилизация плеча с ремнём',
      instruction: 'Держи ремень за спиной и мягко отведи руки назад, сохраняя рёбра спокойными.',
      cues: ['не прогибай поясницу', 'плечи не тянуть к ушам', 'движение плавное']
    },
    act_deep_neck_flexor_nod: {
      title: 'Кивок глубоких сгибателей шеи',
      instruction: 'Лёжа или у стены сделай маленький кивок, как будто удлиняешь заднюю поверхность шеи.',
      cues: ['движение маленькое', 'челюсть свободна', 'не дави затылком резко']
    },
    act_wall_angels: {
      title: 'Wall angels',
      instruction: 'Встань у стены и медленно веди руки вверх-вниз, удерживая рёбра и шею спокойными.',
      cues: ['рёбра вниз', 'шея длинная', 'амплитуда без боли']
    },
    act_prone_scapular_w: {
      title: 'W-активация лопаток',
      instruction: 'Лёжа на животе мягко собери лопатки в форму W и вернись без рывка.',
      cues: ['шея длинная', 'плечи от ушей', 'усилие умеренное']
    },
    act_band_pullapart: {
      title: 'Разведение резинки',
      instruction: 'Разведи резинку перед собой, своди лопатки мягко и возвращайся под контролем.',
      cues: ['рёбра не выпячивать', 'плечи вниз', 'работает верх спины']
    },
    act_glute_bridge: {
      title: 'Ягодичный мост',
      instruction: 'Подними таз до прямой линии плечи-таз-колени, задержись коротко и опусти под контролем.',
      cues: ['не переразгибай поясницу', 'давление через пятки', 'без судороги']
    },
    act_band_lateral_walk: {
      title: 'Боковые шаги с резинкой',
      instruction: 'Держи лёгкое натяжение резинки и делай короткие боковые шаги без завала коленей внутрь.',
      cues: ['таз ровно', 'стопы параллельно', 'колени смотрят по стопам']
    },
    flex_static_hamstring: {
      title: 'Статика задней поверхности бедра',
      instruction: 'С ремнём выведи ногу до приятного натяжения и удерживай без боли.',
      cues: ['таз остаётся на полу', 'колено мягкое', 'натяжение не выше умеренного']
    },
    flex_static_calf: {
      title: 'Статика икроножной у стены',
      instruction: 'Поставь стопу назад, пятку оставь на полу и удерживай мягкое натяжение икры.',
      cues: ['носок вперёд', 'пятка не отрывается', 'не пружинить']
    },
    flex_static_hipflexor: {
      title: 'Статика сгибателей бедра',
      instruction: 'Из полувыпада подкрути таз и удерживай натяжение спереди бедра без прогиба в пояснице.',
      cues: ['таз под себя', 'рёбра вниз', 'натяжение спереди, не в пояснице']
    },
    flex_relax_supine_comfort: {
      title: 'Мягкое расслабляющее удержание',
      instruction: 'Ляг удобно, выбери комфортную позицию растяжения и удерживай её без стремления к максимуму.',
      cues: ['длинный выдох', 'лицо расслаблено', 'амплитуда комфортная']
    },
    flex_static_pec_wall: {
      title: 'Мягкое раскрытие грудных у стены',
      instruction: 'Поставь предплечье на стену и слегка разверни корпус, удерживая умеренное натяжение спереди плеча.',
      cues: ['без онемения в руке', 'рёбра не выпячивать', 'растяжение мягкое']
    },
    flex_pnf_hamstring_hr: {
      title: 'PNF задней поверхности бедра',
      instruction: 'Выйди в предел, мягко напряги мышцу против ремня, расслабься и удержи новый диапазон.',
      cues: ['усилие 20-70%', 'не задерживай дыхание', 'не форсируй глубину']
    },
    flex_pnf_hipflexor_crac: {
      title: 'PNF сгибателей бедра',
      instruction: 'В полувыпаде чередуй мягкое изометрическое напряжение и расслабленное удержание.',
      cues: ['таз стабилен', 'усилие субмаксимальное', 'без боли в пояснице']
    },
    loadmob_nordic_eccentric: {
      title: 'Эксцентрический Nordic',
      instruction: 'Медленно уступай корпусом вперёд, контролируя заднюю поверхность бедра, затем вернись безопасным способом.',
      cues: ['малый объём', 'медленная фаза вниз', 'остановись при резкой боли']
    },
    loadmob_cossack_loaded_hold: {
      title: 'Удержание в Cossack squat',
      instruction: 'Опустись в боковой присед с лёгкой нагрузкой или противовесом и удерживай контролируемый диапазон.',
      cues: ['стопа опорной ноги на полу', 'колено по стопе', 'нагрузка лёгкая']
    },
    loadmob_pails_rails_hip: {
      title: 'PAILs/RAILs для бедра',
      instruction: 'В конечном диапазоне чередуй мягкое давление в опору и активную попытку углубить контроль.',
      cues: ['наращивай усилие плавно', 'без задержки дыхания', 'не работай через боль']
    },
    joint_cars_hip: {
      title: 'Hip CARs',
      instruction: 'Медленно проведи бедро по доступной окружности, сохраняя активное напряжение и контроль.',
      cues: ['корпус неподвижен', 'движение медленное', 'не щёлкать через боль']
    },
    joint_cars_shoulder: {
      title: 'Shoulder CARs',
      instruction: 'Проведи плечо по большой медленной окружности, не теряя контроля лопатки и рёбер.',
      cues: ['рёбра вниз', 'шея свободна', 'амплитуда активная']
    },
    joint_cars_spine: {
      title: 'Spine CARs',
      instruction: 'Медленно сгибай, вращай и разгибай грудной отдел в доступной амплитуде.',
      cues: ['таз стабилен', 'темп медленный', 'без рывков']
    },
    smr_foamroll_quad: {
      title: 'Валик для квадрицепса',
      instruction: 'Медленно прокатывай переднюю поверхность бедра, обходя кость и резкие болезненные точки.',
      cues: ['давление умеренное', 'не катай по колену', 'дыши спокойно']
    },
    smr_ball_glute: {
      title: 'Мяч для ягодичных',
      instruction: 'Найди комфортную зону давления мячом в ягодичной области и работай медленно.',
      cues: ['не дави на нерв', 'боль не выше умеренной', 'движение маленькое']
    },
    smr_ball_pec_minor: {
      title: 'Мяч для грудной области',
      instruction: 'Поставь мяч между стеной и мягкими тканями спереди плеча, работай маленькими движениями без давления на кость.',
      cues: ['не дави в подмышку', 'нет онемения', 'давление умеренное']
    },
    smr_percussion_calf: {
      title: 'Перкуссия икры',
      instruction: 'Коротко обработай мягкие ткани икры перкуссионным устройством, избегая костей и острой травмы.',
      cues: ['низкая интенсивность', 'не перед мощной работой', 'не работать по вене']
    },
    smr_percussion_upper_back: {
      title: 'Перкуссия верхней спины',
      instruction: 'Коротко обработай мягкие ткани вокруг верхней спины, не работая по позвоночнику и костям.',
      cues: ['низкая интенсивность', 'не по позвонкам', 'остановись при боли']
    },
    breath_cyclic_sigh: {
      title: 'Циклический вздох',
      instruction: 'Сделай дополнительный короткий довдох через нос и длинный спокойный выдох через рот.',
      cues: ['выдох длиннее вдоха', 'плечи мягкие', 'без головокружения']
    },
    breath_resonant: {
      title: 'Резонансное дыхание',
      instruction: 'Дыши примерно 5 секунд на вдох и 5 секунд на выдох, удерживая ровный ритм.',
      cues: ['носом если удобно', 'без пауз через силу', 'темп спокойный']
    },
    breath_box_tonify: {
      title: 'Box breathing',
      instruction: 'Выполняй равные фазы вдоха, паузы, выдоха и паузы, сохраняя лёгкий тонус.',
      cues: ['не напрягай лицо', 'пауза комфортная', 'остановись при дискомфорте']
    },
    restorative_supported_bolster: {
      title: 'Поддержанная релакс-позиция',
      instruction: 'Устройся на болстере так, чтобы тело было поддержано, а дыхание стало спокойнее.',
      cues: ['нет острого натяжения', 'челюсть расслаблена', 'выходи медленно']
    },
    recov_active_walk: {
      title: 'Активное восстановление',
      instruction: 'Иди легко, без цели устать, чтобы мягко поднять кровоток после нагрузки.',
      cues: ['разговорный темп', 'короткий шаг', 'без добивания']
    },
    recov_movement_snack: {
      title: 'Короткая двигательная пауза',
      instruction: 'Сделай несколько лёгких движений для всего тела, чтобы снять скованность от сидения.',
      cues: ['1-3 минуты достаточно', 'частота важнее длительности', 'движение лёгкое']
    }
  };

  ATOMS.forEach(function (atom) {
    Object.assign(atom, LOAD_META[atom.id] || { difficulty: 3, minLoadLevel: 1, maxLoadLevel: 5 });
    Object.assign(atom, CONTENT[atom.id] || {});
    atom.visualAsset = '/exercises/mobility/' + atom.id + '.webp';
    atom.visualPromptRef = 'methodology/VISUAL_PROMPTS.md#' + atom.id;
  });

  // ─── API (индекс — из ОБЩЕГО ЯДРА; локальный фолбэк) ───────────────────────────
  const _kc = HEYS.TrainingKernel && HEYS.TrainingKernel.catalog;
  const _idx = (_kc && _kc.createIndex) ? _kc.createIndex(ATOMS, { idKey: 'id', groupBy: ['block', 'axis', 'purpose'] }) : null;
  const byId = {};
  if (!_idx) ATOMS.forEach(function (a) { byId[a.id] = a; });

  function getAtom(id) { return _idx ? _idx.get(id) : (byId[id] || null); }
  function byBlock(b) { return _idx ? _idx.by('block', b) : ATOMS.filter(function (a) { return a.block === b; }); }
  function byAxis(ax) { return _idx ? _idx.by('axis', ax) : ATOMS.filter(function (a) { return a.axis === ax; }); }
  function byPurpose(p) { return _idx ? _idx.by('purpose', p) : ATOMS.filter(function (a) { return a.purpose === p; }); }

  // Обязательные поля dose по doseShape (CONSTRUCTOR_SPEC §1.3).
  const DOSE_REQUIRED = {
    raise:      ['durationSec'],
    dynamic:    ['reps', 'sets'],
    flow:       [], // durationSec ИЛИ rounds — проверяется отдельно
    activation: ['reps', 'sets'],
    hold:       ['holdSec'],
    pnf:        ['contractSec', 'relaxSec', 'holdSec'],
    eccentric:  ['reps', 'sets', 'tempoEccSec'],
    cars:       ['reps'],
    smr:        ['durationSec'],
    breath:     ['pattern', 'durationSec'],
    active_rec: ['durationSec']
  };
  function validateDose(id, doseShape, dose, errs) {
    if (!Object.prototype.hasOwnProperty.call(DOSE_REQUIRED, doseShape)) {
      errs.push(id + ': неизвестный doseShape для схемы дозы (' + doseShape + ')');
      return;
    }
    DOSE_REQUIRED[doseShape].forEach(function (f) {
      if (dose[f] === undefined || dose[f] === null) errs.push(id + ': dose.' + f + ' отсутствует для doseShape=' + doseShape);
    });
    if (doseShape === 'flow' && dose.durationSec == null && dose.rounds == null) {
      errs.push(id + ': flow требует durationSec или rounds');
    }
    if (doseShape === 'breath' && dose.pattern && !/^(cyclic_sigh|resonant|box)$/.test(dose.pattern)) {
      errs.push(id + ': breath.pattern невалиден (' + dose.pattern + ')');
    }
  }

  // Самопроверка одного атома против ENUM (CONSTRUCTOR_SPEC §1.2).
  function validateAtom(atom) {
    const errs = [];
    const ac = Mobility.axisCatalog;
    if (!ac) { errs.push('axisCatalog не загружен'); return errs; }
    if (!atom || typeof atom !== 'object') { errs.push('атом не объект'); return errs; }
    const id = atom.id || '(no id)';
    const enumChecks = [
      ['block', 'block'], ['axis', 'axis'], ['purpose', 'purpose'],
      ['autonomic', 'autonomic'], ['modality', 'modality'], ['doseShape', 'doseShape'],
      ['jointRegion', 'jointRegion'], ['loadModel', 'loadModel'], ['doseConfidence', 'doseConfidence']
    ];
    enumChecks.forEach(function (pair) {
      if (!ac.inEnum(atom[pair[0]], pair[1])) errs.push(id + ': ' + pair[0] + ' невалиден (' + atom[pair[0]] + ')');
    });
    if (atom.energySystem !== null && !ac.inEnum(atom.energySystem, 'energySystem')) errs.push(id + ': energySystem невалиден');
    if (atom.timeOfDayPref != null && !ac.inEnum(atom.timeOfDayPref, 'timeOfDay')) errs.push(id + ': timeOfDayPref невалиден');
    // схема дозы по doseShape (CONSTRUCTOR_SPEC §1.3) — иначе runner получит не те поля
    if (!atom.dose || typeof atom.dose !== 'object') {
      errs.push(id + ': dose отсутствует');
    } else {
      validateDose(id, atom.doseShape, atom.dose, errs);
    }
    // gates
    const g = atom.gates;
    if (!g || typeof g !== 'object') { errs.push(id + ': gates отсутствует'); }
    else {
      if (!ac.inEnum(g.minLevel, 'level')) errs.push(id + ': gates.minLevel невалиден');
      if (typeof g.minAge !== 'number') errs.push(id + ': gates.minAge не число (null=нет данных кодируй явно)');
      ['populationGate', 'contraind', 'equipment', 'prerequisites'].forEach(function (k) {
        if (!Array.isArray(g[k])) errs.push(id + ': gates.' + k + ' не массив');
      });
      (g.populationGate || []).forEach(function (p) { if (!ac.inEnum(p, 'population')) errs.push(id + ': populationGate.' + p + ' невалиден'); });
      (g.contraind || []).forEach(function (c) { if (!ac.inEnum(c, 'contraind')) errs.push(id + ': contraind.' + c + ' невалиден'); });
      (g.equipment || []).forEach(function (e) { if (!ac.inEnum(e, 'equipment')) errs.push(id + ': equipment.' + e + ' невалиден'); });
    }
    if (!Array.isArray(atom.sourceIds)) errs.push(id + ': sourceIds не массив');
    ['difficulty', 'minLoadLevel', 'maxLoadLevel'].forEach(function (k) {
      const n = Number(atom[k]);
      if (!Number.isFinite(n) || n < 1 || n > 5) errs.push(id + ': ' + k + ' должен быть числом 1-5');
    });
    if (Number(atom.minLoadLevel) > Number(atom.maxLoadLevel)) errs.push(id + ': minLoadLevel больше maxLoadLevel');
    if (!atom.title || typeof atom.title !== 'string') errs.push(id + ': title отсутствует');
    if (!atom.instruction || typeof atom.instruction !== 'string') errs.push(id + ': instruction отсутствует');
    if (!Array.isArray(atom.cues) || atom.cues.length < 2) errs.push(id + ': cues требует минимум 2 подсказки');
    if (!atom.visualAsset || !/^\/exercises\/mobility\/[a-z0-9_]+\.webp$/.test(atom.visualAsset)) {
      errs.push(id + ': visualAsset отсутствует или не по схеме /exercises/mobility/<atomId>.webp');
    }
    if (!atom.visualPromptRef || atom.visualPromptRef.indexOf('VISUAL_PROMPTS.md#' + id) === -1) {
      errs.push(id + ': visualPromptRef отсутствует');
    }
    return errs;
  }

  function validateAll() {
    let errors = [];
    const seen = {};
    ATOMS.forEach(function (a) {
      if (seen[a.id]) errors.push('дубликат id: ' + a.id);
      seen[a.id] = true;
      errors = errors.concat(validateAtom(a));
    });
    return { errors: errors, count: ATOMS.length };
  }

  // ─── Экспорт ───────────────────────────────────────────────────────────────────
  Mobility.atomCatalog = {
    __registered: true,
    ATOMS: ATOMS,
    getAtom: getAtom,
    byBlock: byBlock,
    byAxis: byAxis,
    byPurpose: byPurpose,
    validateAtom: validateAtom,
    validateAll: validateAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
