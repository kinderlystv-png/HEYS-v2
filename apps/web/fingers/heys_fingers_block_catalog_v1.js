// heys_fingers_block_catalog_v1.js — Каталог блоков ч.4 методологии (Phase 1 / step 3).
//
// Источник истины: apps/web/fingers/methodology/PROTOCOL_POOL.md (36 атомов).
// Карта: IMPLEMENTATION_MAP block-A…block-I. Контракт атома: CONSTRUCTOR_SPEC §1.2.
//
// Off-live-path: это чистые данные + sanity API; mix_engine их пока не читает.
// Wiring в mix_engine — Шаг 4 за флагом.
//
// Public API:
//   HEYS.Fingers.blockCatalog.BLOCKS         — 9 блоков [{id, label, quality, atomIds:[...]}]
//   HEYS.Fingers.blockCatalog.ATOMS          — 36 атомов в формате §1.2
//   HEYS.Fingers.blockCatalog.getBlock(id)   — блок по id (A..I)
//   HEYS.Fingers.blockCatalog.getAtom(id)    — атом по id
//   HEYS.Fingers.blockCatalog.atomsByBlock(blockId)   — атомы блока
//   HEYS.Fingers.blockCatalog.atomsByQuality(quality) — атомы качества
//   HEYS.Fingers.blockCatalog.validate()     — sanity enum'ов + сверка с qualityCatalog
//
// Инвариант: данные ВЕРНОСТЬ-1:1 с PROTOCOL_POOL. При обновлении пула —
// синхронизировать ATOMS и прогнать validate().

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__blockCatalogRegistered) return; // idempotent
  Fingers.__blockCatalogRegistered = true;

  // ─── Метаданные блоков A..I (METHODOLOGY ч.4 / IMPLEMENTATION_MAP block-*) ────
  const BLOCKS = [
    { id: 'A', label: 'Сила пальцев',                   quality: 'finger_strength' },
    { id: 'B', label: 'Макс. сила тела',                quality: 'max_strength' },
    { id: 'C', label: 'Мощность / контактная сила',     quality: 'power' },
    { id: 'D', label: 'Анаэробная ёмкость',             quality: 'anaerobic_capacity' },
    { id: 'E', label: 'Аэробная база предплечий',       quality: 'aerobic_base' },
    { id: 'F', label: 'Техника',                        quality: 'technique' },
    { id: 'G', label: 'Антагонисты / прехаб',           quality: 'antagonist' },
    { id: 'H', label: 'Мобильность',                    quality: 'mobility' },
    { id: 'I', label: 'Ментальное / тактика',           quality: 'mental' }
  ];

  // ─── ATOMS — 36 атомов из PROTOCOL_POOL.md, формат CONSTRUCTOR_SPEC §1.2 ──────
  // energySystem на атомах = тренировочный интент (а не naive-derive); пул уже
  // зашил явные override'ы (заметка целостности §3.1: density-hang phosphagen,
  // repeaters phosphagen с примечанием "дрейфует в glycolytic при наборе объёма").
  const ATOMS = [
    // ─── Блок A — finger_strength (6) ─────────────────────────────────────────
    {
      id: 'fs_maxhang_20mm_half', blockId: 'A',
      quality: 'finger_strength', energySystem: 'phosphagen',
      modality: 'fingerboard', doseShape: 'hang',
      dose: { workSec: 10, restSec: 0, reps: 1, sets: 5, restSetsSec: 180 },
      loadModel: 'rm_margin', loadValue: 3,
      gripId: 'halfcrimp', edgeSizeMm: 20,
      fatigueCost: 'high', tissueLoad: 'high',
      gates: { minLevel: 'intermediate', minAge: 16, dangerLevel: 'moderate',
               prerequisites: ['warmup_done', 'base_>=1y'] },
      sourceIds: ['lopez2019', 'lopez2012', 'horst_tfc'], doseConfidence: 'A'
    },
    {
      id: 'fs_maxhang_20mm_open', blockId: 'A',
      quality: 'finger_strength', energySystem: 'phosphagen',
      modality: 'fingerboard', doseShape: 'hang',
      dose: { workSec: 10, restSec: 0, reps: 1, sets: 5, restSetsSec: 180 },
      loadModel: 'rm_margin', loadValue: 3,
      gripId: 'openhand4', edgeSizeMm: 20,
      fatigueCost: 'high', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 16, dangerLevel: 'low',
               prerequisites: ['warmup_done', 'base_>=1y'] },
      sourceIds: ['lopez2019', 'horst_tfc', 'feehally_beastmaking'], doseConfidence: 'A'
    },
    {
      id: 'fs_repeater_73', blockId: 'A',
      // explicit override: интент = strength-endurance, но пул держит phosphagen
      // (примечание PROTOCOL_POOL: "дрейфует в glycolytic при наборе объёма").
      quality: 'finger_strength', energySystem: 'phosphagen',
      modality: 'fingerboard', doseShape: 'hang',
      dose: { workSec: 7, restSec: 3, reps: 6, sets: 4, restSetsSec: 150 },
      loadModel: 'rm_margin', loadValue: 2,
      gripId: 'openhand4', edgeSizeMm: 20,
      fatigueCost: 'moderate', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 14, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['medernach2015', 'horst_tfc', 'beastmaker_app'], doseConfidence: 'A'
    },
    {
      id: 'fs_nohang_pickup', blockId: 'A',
      quality: 'finger_strength', energySystem: 'phosphagen',
      modality: 'fingerboard', doseShape: 'hang',
      dose: { workSec: 8, restSec: 0, reps: 1, sets: 4, restSetsSec: 150 },
      loadModel: 'addedWeightKg', loadValue: null,
      gripId: 'halfcrimp', edgeSizeMm: 20,
      fatigueCost: 'moderate', tissueLoad: 'moderate',
      gates: { minLevel: 'beginner', minAge: 14, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['nelson_c4hp', 'lattice_research'], doseConfidence: 'B'
    },
    {
      id: 'fs_density_hang', blockId: 'A',
      // explicit override (заметка целостности §3.1): derive по workSec=30 дал бы
      // glycolytic, но интент блока A — сила/ткань → phosphagen.
      quality: 'finger_strength', energySystem: 'phosphagen',
      modality: 'fingerboard', doseShape: 'hang',
      dose: { workSec: 30, restSec: 0, reps: 1, sets: 4, restSetsSec: 150 },
      loadModel: 'rm_margin', loadValue: 5,
      gripId: 'openhand4', edgeSizeMm: 25,
      fatigueCost: 'moderate', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 16, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['nelson_c4hp'], doseConfidence: 'C'
    },
    {
      id: 'fs_minedge_recruit', blockId: 'A',
      quality: 'finger_strength', energySystem: 'phosphagen',
      modality: 'fingerboard', doseShape: 'hang',
      dose: { workSec: 5, restSec: 0, reps: 1, sets: 4, restSetsSec: 180 },
      loadModel: 'rm_margin', loadValue: 2,
      gripId: 'halfcrimp', edgeSizeMm: 8,
      fatigueCost: 'high', tissueLoad: 'high',
      gates: { minLevel: 'advanced', minAge: 18, dangerLevel: 'high',
               prerequisites: ['warmup_done', 'base_>=2y', 'strength_base'] },
      sourceIds: ['lopez2019', 'horst_tfc'], doseConfidence: 'B'
    },

    // ─── Блок B — max_strength (4) ────────────────────────────────────────────
    {
      id: 'str_limit_boulder', blockId: 'B',
      quality: 'max_strength', energySystem: 'phosphagen',
      modality: 'board', doseShape: 'attempts',
      dose: { movesPerAttempt: [1, 5], attempts: [6, 12], restSetsSec: 240 },
      loadModel: 'grade', loadValue: 'limit',
      fatigueCost: 'high', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 14, dangerLevel: 'moderate',
               prerequisites: ['warmup_done'] },
      sourceIds: ['anderson_rctm'], doseConfidence: 'A'
    },
    {
      id: 'str_weighted_pullup', blockId: 'B',
      quality: 'max_strength', energySystem: 'phosphagen',
      modality: 'weights', doseShape: 'reps',
      dose: { reps: [3, 5], sets: 4, restSetsSec: 180 },
      loadModel: 'addedWeightKg', loadValue: null,
      fatigueCost: 'moderate', tissueLoad: 'low',
      gates: { minLevel: 'intermediate', minAge: 14, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['horst_tfc', 'anderson_rctm'], doseConfidence: 'B'
    },
    {
      id: 'str_lockoff_iso', blockId: 'B',
      quality: 'max_strength', energySystem: 'phosphagen',
      modality: 'weights', doseShape: 'hang',
      dose: { workSec: 8, restSec: 0, reps: 1, sets: 4, restSetsSec: 150 },
      loadModel: 'bodyweight', loadValue: null,
      fatigueCost: 'moderate', tissueLoad: 'low',
      gates: { minLevel: 'intermediate', minAge: 14, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['horst_tfc'], doseConfidence: 'B'
    },
    {
      id: 'str_body_tension', blockId: 'B',
      quality: 'max_strength', energySystem: 'phosphagen',
      modality: 'board', doseShape: 'reps',
      dose: { reps: [4, 8], sets: 3, restSetsSec: 120 },
      loadModel: 'bodyweight', loadValue: null,
      fatigueCost: 'moderate', tissueLoad: 'low',
      gates: { minLevel: 'intermediate', minAge: 14, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['feehally_beastmaking'], doseConfidence: 'B'
    },

    // ─── Блок C — power (5) ───────────────────────────────────────────────────
    {
      id: 'pow_dyno_limit', blockId: 'C',
      quality: 'power', energySystem: 'phosphagen',
      modality: 'board', doseShape: 'attempts',
      dose: { movesPerAttempt: [1, 3], attempts: [6, 10], restSetsSec: 240 },
      loadModel: 'grade', loadValue: 'limit',
      fatigueCost: 'high', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 16, dangerLevel: 'moderate',
               prerequisites: ['warmup_done'] },
      sourceIds: ['horst_tfc', 'anderson_rctm'], doseConfidence: 'A'
    },
    {
      id: 'pow_first_move_max', blockId: 'C',
      quality: 'power', energySystem: 'phosphagen',
      modality: 'board', doseShape: 'attempts',
      dose: { movesPerAttempt: [1, 1], attempts: [8, 12], restSetsSec: 180 },
      loadModel: 'grade', loadValue: 'limit',
      fatigueCost: 'high', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 16, dangerLevel: 'moderate',
               prerequisites: ['warmup_done'] },
      sourceIds: ['horst_tfc'], doseConfidence: 'B'
    },
    {
      id: 'pow_plyo_catch', blockId: 'C',
      quality: 'power', energySystem: 'phosphagen',
      modality: 'campus', doseShape: 'attempts',
      dose: { movesPerAttempt: [1, 2], attempts: [4, 6], restSetsSec: 240 },
      loadModel: 'bodyweight', loadValue: null,
      fatigueCost: 'high', tissueLoad: 'high',
      gates: { minLevel: 'advanced', minAge: 18, dangerLevel: 'high',
               prerequisites: ['warmup_done', 'strength_base', 'base_>=2y'] },
      sourceIds: ['horst_tfc'], doseConfidence: 'C'
    },
    {
      id: 'pow_campus_ladder', blockId: 'C',
      quality: 'power', energySystem: 'phosphagen',
      modality: 'campus', doseShape: 'attempts',
      dose: { movesPerAttempt: [3, 5], attempts: [3, 5], restSetsSec: 300 },
      loadModel: 'bodyweight', loadValue: null,
      fatigueCost: 'max', tissueLoad: 'high',
      gates: { minLevel: 'advanced', minAge: 18, dangerLevel: 'very-high',
               prerequisites: ['warmup_done', 'strength_base', 'base_>=2y'] },
      sourceIds: ['horst_tfc', 'anderson_rctm'], doseConfidence: 'B'
    },
    {
      id: 'pow_rfd_pulls', blockId: 'C',
      quality: 'power', energySystem: 'phosphagen',
      modality: 'fingerboard', doseShape: 'attempts',
      dose: { movesPerAttempt: [1, 1], attempts: [15, 25], restSetsSec: 150 },
      loadModel: 'rpe', loadValue: 9,
      gripId: 'halfcrimp', edgeSizeMm: 20,
      fatigueCost: 'moderate', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 16, dangerLevel: 'moderate',
               prerequisites: ['warmup_done'] },
      sourceIds: ['levernier2019'], doseConfidence: 'B'
    },

    // ─── Блок D — anaerobic_capacity (5) ──────────────────────────────────────
    {
      id: 'pe_boulder_4x4', blockId: 'D',
      quality: 'anaerobic_capacity', energySystem: 'glycolytic',
      modality: 'wall', doseShape: 'circuit',
      dose: { problemsPerRound: 4, rounds: 4, restRoundsSec: 240 },
      loadModel: 'grade', loadValue: 'submax',
      fatigueCost: 'high', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 14, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['anderson_rctm', 'horst_tfc'], doseConfidence: 'A'
    },
    {
      id: 'pe_fingerboard_lactic', blockId: 'D',
      quality: 'anaerobic_capacity', energySystem: 'glycolytic',
      modality: 'fingerboard', doseShape: 'hang',
      dose: { workSec: 30, restSec: 20, reps: 6, sets: 3, restSetsSec: 180 },
      loadModel: 'rpe', loadValue: 7,
      gripId: 'openhand4', edgeSizeMm: 20,
      fatigueCost: 'high', tissueLoad: 'moderate',
      gates: { minLevel: 'advanced', minAge: 16, dangerLevel: 'moderate',
               prerequisites: ['warmup_done', 'base_>=2y'] },
      sourceIds: ['maciejczyk2022', 'horst_tfc'], doseConfidence: 'B'
    },
    {
      id: 'pe_linkups', blockId: 'D',
      quality: 'anaerobic_capacity', energySystem: 'glycolytic',
      modality: 'wall', doseShape: 'circuit',
      dose: { problemsPerRound: 1, rounds: 6, restRoundsSec: 180 },
      loadModel: 'grade', loadValue: 'near-limit',
      fatigueCost: 'high', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 14, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['anderson_rctm'], doseConfidence: 'A'
    },
    {
      id: 'pe_route_repeats', blockId: 'D',
      quality: 'anaerobic_capacity', energySystem: 'glycolytic',
      modality: 'wall', doseShape: 'circuit',
      dose: { problemsPerRound: 1, rounds: 4, restRoundsSec: 360 },
      loadModel: 'grade', loadValue: 'submax',
      fatigueCost: 'high', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 14, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['anderson_rctm', 'horst_tfc'], doseConfidence: 'A'
    },
    {
      id: 'pe_on_the_minute', blockId: 'D',
      quality: 'anaerobic_capacity', energySystem: 'glycolytic',
      modality: 'wall', doseShape: 'circuit',
      dose: { problemsPerRound: 1, rounds: 10, restRoundsSec: 60 },
      loadModel: 'grade', loadValue: 'submax',
      fatigueCost: 'high', tissueLoad: 'moderate',
      gates: { minLevel: 'intermediate', minAge: 14, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['horst_tfc'], doseConfidence: 'B'
    },

    // ─── Блок E — aerobic_base (4) ────────────────────────────────────────────
    {
      id: 'aer_arc', blockId: 'E',
      quality: 'aerobic_base', energySystem: 'aerobic', energySubMode: 'capacity',
      modality: 'wall', doseShape: 'continuous',
      dose: { workSec: 1800, sets: 1 },
      loadModel: 'rpe', loadValue: 3,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 14, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['anderson_rctm', 'maciejczyk2022'], doseConfidence: 'B'
    },
    {
      id: 'aer_power_intervals', blockId: 'E',
      quality: 'aerobic_base', energySystem: 'aerobic', energySubMode: 'power',
      modality: 'wall', doseShape: 'circuit',
      dose: { problemsPerRound: 1, rounds: 4, restRoundsSec: 300 },
      loadModel: 'rpe', loadValue: 6,
      fatigueCost: 'moderate', tissueLoad: 'low',
      gates: { minLevel: 'intermediate', minAge: 14, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['maciejczyk2022', 'horst_tfc'], doseConfidence: 'B'
    },
    {
      id: 'aer_mileage', blockId: 'E',
      quality: 'aerobic_base', energySystem: 'aerobic', energySubMode: 'capacity',
      modality: 'wall', doseShape: 'continuous',
      dose: { workSec: 2700, sets: 1 },
      loadModel: 'grade', loadValue: 'easy-mid',
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['anderson_rctm', 'macleod_9of10'], doseConfidence: 'A'
    },
    {
      id: 'aer_bfr_lowload', blockId: 'E',
      quality: 'aerobic_base', energySystem: 'aerobic', energySubMode: 'capacity',
      modality: 'fingerboard', doseShape: 'hang',
      dose: { workSec: 0, restSec: 0, reps: 1, sets: 4, restSetsSec: 60 },
      loadModel: 'pctMax', loadValue: 40,
      gripId: 'openhand4', edgeSizeMm: 20,
      fatigueCost: 'moderate', tissueLoad: 'low',
      gates: { minLevel: 'intermediate', minAge: 18, dangerLevel: 'moderate',
               prerequisites: ['warmup_done', 'bfr_cuff_technique'] },
      sourceIds: ['perrin2026'], doseConfidence: 'B'
    },

    // ─── Блок F — technique (4) ───────────────────────────────────────────────
    {
      id: 'tech_silent_feet', blockId: 'F',
      quality: 'technique', energySystem: null,
      modality: 'drill', doseShape: 'continuous',
      dose: { workSec: 900, sets: 1 },
      loadModel: 'rpe', loadValue: 2,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['macleod_9of10', 'motor_learning'], doseConfidence: 'A'
    },
    {
      id: 'tech_constraint_led', blockId: 'F',
      quality: 'technique', energySystem: null,
      modality: 'drill', doseShape: 'continuous',
      dose: { workSec: 900, sets: 1 },
      loadModel: 'rpe', loadValue: 3,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['cla_framework', 'lattice_research'], doseConfidence: 'B'
    },
    {
      id: 'tech_limit_project_movement', blockId: 'F',
      quality: 'technique', energySystem: null,
      modality: 'wall', doseShape: 'attempts',
      dose: { movesPerAttempt: [3, 8], attempts: [6, 12], restSetsSec: 180 },
      loadModel: 'grade', loadValue: 'limit-skill',
      fatigueCost: 'moderate', tissueLoad: 'low',
      gates: { minLevel: 'intermediate', minAge: 0, dangerLevel: 'low',
               prerequisites: ['warmup_done'] },
      sourceIds: ['macleod_9of10', 'motor_learning'], doseConfidence: 'A'
    },
    {
      id: 'tech_variety_mileage', blockId: 'F',
      quality: 'technique', energySystem: null,
      modality: 'wall', doseShape: 'continuous',
      dose: { workSec: 2700, sets: 1 },
      loadModel: 'grade', loadValue: 'easy-mid',
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['macleod_9of10'], doseConfidence: 'A'
    },

    // ─── Блок G — antagonist (3) ──────────────────────────────────────────────
    {
      id: 'ant_push_shoulder', blockId: 'G',
      quality: 'antagonist', energySystem: null,
      modality: 'antagonist', doseShape: 'reps',
      dose: { reps: [8, 15], sets: 3, restSetsSec: 60 },
      loadModel: 'rpe', loadValue: 6,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['vagy_rockrehab', 'vigouroux2014'], doseConfidence: 'C'
    },
    {
      id: 'ant_finger_extensors', blockId: 'G',
      quality: 'antagonist', energySystem: null,
      modality: 'antagonist', doseShape: 'reps',
      dose: { reps: [15, 25], sets: 3, restSetsSec: 45 },
      loadModel: 'rpe', loadValue: 5,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['vagy_rockrehab', 'vigouroux2014'], doseConfidence: 'C'
    },
    {
      id: 'ant_prehab_targeted', blockId: 'G',
      quality: 'antagonist', energySystem: null,
      modality: 'antagonist', doseShape: 'reps',
      dose: { reps: [10, 15], sets: 3, restSetsSec: 60 },
      loadModel: 'rpe', loadValue: 5,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low',
               prerequisites: ['injury_screen'] },
      sourceIds: ['vagy_rockrehab', 'schoffl2003', 'miro_schoffl2021'], doseConfidence: 'A'
    },

    // ─── Блок H — mobility (2) ────────────────────────────────────────────────
    {
      id: 'mob_hip_turnout', blockId: 'H',
      quality: 'mobility', energySystem: null,
      modality: 'mobility', doseShape: 'reps',
      dose: { reps: [8, 12], sets: 2, restSetsSec: 30 },
      loadModel: 'bodyweight', loadValue: null,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['feehally_beastmaking'], doseConfidence: 'B'
    },
    {
      id: 'mob_shoulder', blockId: 'H',
      quality: 'mobility', energySystem: null,
      modality: 'mobility', doseShape: 'reps',
      dose: { reps: [8, 12], sets: 2, restSetsSec: 30 },
      loadModel: 'bodyweight', loadValue: null,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['feehally_beastmaking', 'vagy_rockrehab'], doseConfidence: 'B'
    },

    // ─── Блок I — mental (3) ──────────────────────────────────────────────────
    {
      id: 'mental_fall_practice', blockId: 'I',
      quality: 'mental', energySystem: null,
      modality: 'wall', doseShape: 'reps',
      dose: { reps: [5, 10], sets: 1, restSetsSec: 120 },
      loadModel: 'rpe', loadValue: 4,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'moderate',
               prerequisites: ['safe_fall_setup'] },
      sourceIds: ['macleod_9of10'], doseConfidence: 'B'
    },
    {
      id: 'mental_redpoint_tactics', blockId: 'I',
      quality: 'mental', energySystem: null,
      modality: 'wall', doseShape: 'process',
      dose: { checklist: ['сегменты', 'beta-план', 'точки отдыха', 'дыхание', 'меморизация'] },
      loadModel: 'none', loadValue: null,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'intermediate', minAge: 0, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['macleod_9of10'], doseConfidence: 'C'
    },
    {
      id: 'mental_efficiency_under_load', blockId: 'I',
      quality: 'mental', energySystem: null,
      modality: 'wall', doseShape: 'continuous',
      dose: { workSec: 1200, sets: 1 },
      loadModel: 'rpe', loadValue: 4,
      fatigueCost: 'low', tissueLoad: 'low',
      gates: { minLevel: 'intermediate', minAge: 0, dangerLevel: 'low', prerequisites: [] },
      sourceIds: ['macleod_9of10'], doseConfidence: 'B'
    }
  ];

  // ─── Runtime-state vs credential separation (ревью #5 находка #5) ────────────
  // PROTOCOL_POOL.md документирует `warmup_done` в `gates.prerequisites` чтобы
  // отметить «этому атому нужна разминка». Но это **runtime session-context**:
  // S3_warmupRequired валидирует наличие warmup-блока на собранной сессии, не
  // на атоме. Если оставить warmup_done в build-time S9-гейте, билдер блокирует
  // ВСЕ тренировочные атомы пока кто-то не засеет credential — итог в проде
  // = вырожденная сессия. Поэтому здесь пост-фильтруем runtime-токены, оставляя
  // в prerequisites ТОЛЬКО credentials (training-maturity + safety-attestation).
  // PROTOCOL_POOL.md как источник истины **не правится** — там документация.
  const RUNTIME_PREREQ_TOKENS = { warmup_done: true };
  ATOMS.forEach(function (a) {
    if (a.gates && Array.isArray(a.gates.prerequisites)) {
      a.gates.prerequisites = a.gates.prerequisites.filter(function (p) {
        return !RUNTIME_PREREQ_TOKENS[p];
      });
    }
  });

  // ─── Производные индексы (механизм — из ОБЩЕГО ЯДРА; локальный фолбэк) ─────────
  const _kc = HEYS.TrainingKernel && HEYS.TrainingKernel.catalog;
  const _idx = (_kc && _kc.createIndex) ? _kc.createIndex(ATOMS, { idKey: 'id', groupBy: ['blockId', 'quality'] }) : null;

  const ATOMS_BY_ID = Object.create(null);
  const ATOMS_BY_BLOCK = Object.create(null);
  const ATOMS_BY_QUALITY = Object.create(null);
  if (!_idx) {
    BLOCKS.forEach(function (b) { ATOMS_BY_BLOCK[b.id] = []; });
    for (var i = 0; i < ATOMS.length; i++) {
      var a = ATOMS[i];
      ATOMS_BY_ID[a.id] = a;
      if (ATOMS_BY_BLOCK[a.blockId]) ATOMS_BY_BLOCK[a.blockId].push(a);
      if (!ATOMS_BY_QUALITY[a.quality]) ATOMS_BY_QUALITY[a.quality] = [];
      ATOMS_BY_QUALITY[a.quality].push(a);
    }
  }

  function getBlock(id) { return BLOCKS.find(function (b) { return b.id === id; }) || null; }
  function getAtom(id) { return _idx ? _idx.get(id) : (ATOMS_BY_ID[id] || null); }
  function atomsByBlock(blockId) { return _idx ? _idx.by('blockId', blockId) : (ATOMS_BY_BLOCK[blockId] || []).slice(); }
  function atomsByQuality(q) { return _idx ? _idx.by('quality', q) : (ATOMS_BY_QUALITY[q] || []).slice(); }

  // Заполнить blocks[].atomIds через активный индекс (kernel или fallback)
  for (var j = 0; j < BLOCKS.length; j++) {
    BLOCKS[j].atomIds = atomsByBlock(BLOCKS[j].id).map(function (a) { return a.id; });
  }

  // ─── validate() — sanity enum'ов + сверка с qualityCatalog ───────────────────
  // Запускать на CI/в тестах. Возвращает {errors:[...], warnings:[...]}.
  function validate() {
    const errors = [];
    const warnings = [];

    const QC = (Fingers.qualityCatalog || {});
    const QUALITIES = QC.QUALITIES || ['finger_strength', 'max_strength', 'power',
      'anaerobic_capacity', 'aerobic_base', 'technique', 'antagonist', 'mobility', 'mental'];
    const ENERGY_SYSTEMS = ['phosphagen', 'glycolytic', 'aerobic']; // null допустим отдельно
    const DOSE_SHAPES = ['hang', 'attempts', 'circuit', 'continuous', 'reps', 'process'];
    const LOAD_MODELS = ['addedWeightKg', 'pctMax', 'rpe', 'grade', 'bodyweight', 'rm_margin', 'none'];
    const MODALITIES = ['fingerboard', 'board', 'wall', 'campus', 'weights',
                        'drill', 'mobility', 'antagonist'];
    const FATIGUE = ['low', 'moderate', 'high', 'max'];
    const TISSUE = ['low', 'moderate', 'high', 'max'];
    const LEVELS = ['beginner', 'intermediate', 'advanced', 'elite'];
    const DANGER = ['low', 'moderate', 'high', 'very-high'];
    const CONFIDENCE = ['A', 'B', 'C'];

    // Проверка покрытия: каждый блок должен иметь >=1 атом.
    // Через atomsByBlock() — работает и на kernel-индексе, и на fallback
    // (локальный ATOMS_BY_BLOCK пуст, когда активен kernel; см. прод-порядок загрузки).
    BLOCKS.forEach(function (b) {
      if (atomsByBlock(b.id).length === 0) {
        errors.push('block ' + b.id + ' (' + b.label + ') пуст');
      }
    });

    ATOMS.forEach(function (a) {
      function err(msg) { errors.push(a.id + ': ' + msg); }
      function warn(msg) { warnings.push(a.id + ': ' + msg); }

      if (QUALITIES.indexOf(a.quality) < 0) err('quality "' + a.quality + '" не в enum');
      if (a.energySystem !== null && ENERGY_SYSTEMS.indexOf(a.energySystem) < 0)
        err('energySystem "' + a.energySystem + '" не в enum');
      if (DOSE_SHAPES.indexOf(a.doseShape) < 0) err('doseShape "' + a.doseShape + '" не в enum');
      if (LOAD_MODELS.indexOf(a.loadModel) < 0) err('loadModel "' + a.loadModel + '" не в enum');
      if (MODALITIES.indexOf(a.modality) < 0) err('modality "' + a.modality + '" не в enum');
      if (FATIGUE.indexOf(a.fatigueCost) < 0) err('fatigueCost "' + a.fatigueCost + '" не в enum');
      if (TISSUE.indexOf(a.tissueLoad) < 0) err('tissueLoad "' + a.tissueLoad + '" не в enum');
      if (CONFIDENCE.indexOf(a.doseConfidence) < 0)
        err('doseConfidence "' + a.doseConfidence + '" не в enum');

      var g = a.gates || {};
      if (LEVELS.indexOf(g.minLevel) < 0) err('gates.minLevel "' + g.minLevel + '" не в enum');
      if (g.minAge === null) err('gates.minAge=null запрещён (§1.2 fail-closed; явное "без гейта" = 0)');
      if (typeof g.minAge !== 'number') err('gates.minAge не число');
      if (DANGER.indexOf(g.dangerLevel) < 0) err('gates.dangerLevel "' + g.dangerLevel + '" не в enum');
      if (!Array.isArray(g.prerequisites)) err('gates.prerequisites не массив');

      if (!Array.isArray(a.sourceIds) || a.sourceIds.length === 0)
        err('sourceIds пуст (нет провенанса)');

      // Привязка блока к качеству согласована.
      var b = getBlock(a.blockId);
      if (b && b.quality !== a.quality)
        err('quality "' + a.quality + '" не совпадает с quality блока ' +
            b.id + ' "' + b.quality + '"');

      // Сверка derive↔explicit: предупреждение (не ошибка), если energySystem явно
      // отличается от derive по основному workSec — это допустимо как override.
      if (typeof QC.deriveEnergySystem === 'function' && a.doseShape === 'hang') {
        var workSec = a.dose && a.dose.workSec;
        if (typeof workSec === 'number' && workSec > 0) {
          var derived = QC.deriveEnergySystem(workSec);
          if (a.energySystem !== null && derived !== a.energySystem) {
            warnings.push(a.id + ': energySystem=' + a.energySystem +
                          ' переопределяет derive=' + derived + ' (workSec=' + workSec + ')');
          }
        }
      }
    });

    return { errors: errors, warnings: warnings };
  }

  Fingers.blockCatalog = {
    BLOCKS: BLOCKS,
    ATOMS: ATOMS,
    getBlock: getBlock,
    getAtom: getAtom,
    atomsByBlock: atomsByBlock,
    atomsByQuality: atomsByQuality,
    validate: validate
  };

})(typeof window !== 'undefined' ? window : globalThis);
