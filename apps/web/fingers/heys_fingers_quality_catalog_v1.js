// heys_fingers_quality_catalog_v1.js — Методологический data-слой (Фаза 1 / Шаг 2).
// Аддитивный: НЕ мутирует PROGRAMS. Держит справочник 9 качеств, enum'ы полей
// (CONSTRUCTOR_SPEC §1.2) и таблицу PROGRAM_META — методологическую разметку
// каждой программы каталога. Движок поведение НЕ меняет: эти данные ждут Шага 3.
//
// Public API (HEYS.Fingers.qualityCatalog):
//   QUALITIES                       — 9 осей качеств (методология ч.2)
//   ENUM                            — допустимые значения полей атома/блока
//   deriveEnergySystem(workSec)     — ≤12→phosphagen, 12–180→glycolytic, >180→aerobic (карта 1.1/§3.1)
//   workSecOf(ex)                   — эффективная длительность работы атома
//   energySystemOf(ex, atomMeta)    — explicit override || derive (правило коллизии §3.1)
//   metaFor(programId)              — блок-уровень + atom-defaults
//   atomMetaFor(programId, idx)     — методологические поля конкретного атома
//   enrichProgram(program)          — копия программы с полями на каждом exercise (inline-вид)
//   validateProgramMeta()           — самопроверка enum'ов + правила «intermittent → explicit energySystem»
//
// КОНВЕНЦИЯ energySystem (важно):
//   energySystem = энергосистема, которую протокол ТРЕНИРУЕТ (тренировочная цель),
//   не «сырой субстрат». Для single-effort (repsPerSet=1) выводится из hangSec.
//   Для intermittent (repsPerSet>1) deriveEnergySystem по одиночному хвату врёт
//   (repeaters_7_3: derive(7)=phosphagen, но это strength-endurance/glycolytic),
//   поэтому intermittent-атомы НЕСУТ ЯВНЫЙ energySystem (правило §3.1, density-hang
//   note в IMPLEMENTATION_MAP). Тканевые/тяжёлые-медленные холды тоже задают явно.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__qualityCatalogRegistered) return; // idempotent
  Fingers.__qualityCatalogRegistered = true;

  // ─── 9 качеств (METHODOLOGY ч.2) ────────────────────────────────────────
  const QUALITIES = [
    'finger_strength', 'max_strength', 'power', 'anaerobic_capacity',
    'aerobic_base', 'technique', 'antagonist', 'mobility', 'mental'
  ];
  const QUALITY_LABELS = {
    finger_strength: 'Сила пальцев', max_strength: 'Максимальная сила',
    power: 'Мощность / RFD', anaerobic_capacity: 'Анаэробная ёмкость',
    aerobic_base: 'Аэробная база', technique: 'Техника',
    antagonist: 'Антагонисты', mobility: 'Мобильность', mental: 'Психология'
  };

  // ─── enum'ы полей (CONSTRUCTOR_SPEC §1.2) ───────────────────────────────
  const ENUM = {
    energySystem: ['phosphagen', 'glycolytic', 'aerobic', null],
    doseShape: ['hang', 'attempts', 'circuit', 'continuous', 'reps', 'process'],
    loadModel: ['addedWeightKg', 'pctMax', 'rpe', 'grade', 'bodyweight', 'rm_margin', 'none'],
    emphasis: ['max', 'rfd', 'capacity'],
    targetStimulus: ['develop', 'maintain', 'recover'],
    fatigueCost: ['low', 'moderate', 'high', 'max'],
    tissueLoad: ['low', 'moderate', 'high', 'max'],
    doseConfidence: ['A', 'B', 'C']
  };

  // ─── deriveEnergySystem (карта 1.1 M1 / §3.1) ────────────────────────────
  function deriveEnergySystem(workSec) {
    const w = Number(workSec);
    if (!Number.isFinite(w) || w <= 0) return null;
    if (w <= 12) return 'phosphagen';
    if (w <= 180) return 'glycolytic';
    return 'aerobic';
  }

  // Эффективная длительность работы: single-effort = hangSec; intermittent =
  // cluster-TUT (hangSec×repsPerSet). Для intermittent это лишь справочное
  // значение — авторитетен ЯВНЫЙ energySystem (см. конвенцию в шапке).
  function workSecOf(ex) {
    const hang = Number(ex && ex.hangSec) || 0;
    const reps = Number(ex && ex.repsPerSet) || 1;
    return reps > 1 ? hang * reps : hang;
  }

  function isIntermittent(ex) {
    return (Number(ex && ex.repsPerSet) || 1) > 1;
  }

  // Явный energySystem (atomMeta) переопределяет derive. Для intermittent
  // atomMeta ОБЯЗАН его нести (см. validateProgramMeta).
  function energySystemOf(ex, atomMeta) {
    if (atomMeta && Object.prototype.hasOwnProperty.call(atomMeta, 'energySystem')) {
      return atomMeta.energySystem;
    }
    return deriveEnergySystem(workSecOf(ex));
  }

  // ─── deriveAerobicMode (§3.2 под-режимы аэробной) ─────────────────────────
  // Аэробная база делится на два под-режима (METHODOLOGY §3.2, Baláš 2016):
  //   'capacity' — оксидативная ёмкость: длинная непрерывная работа (ARC,
  //                mileage, BFR-окклюзия) на низкой интенсивности.
  //   'power'    — аэробная мощность: интермиттент (репитеры/интервалы), упор
  //                на скорость реперфузии в микропаузах, выше интенсивность.
  // Авторитетен ЯВНЫЙ energySubMode атома; иначе вывод по форме дозы: непрерывная
  // (continuous) → capacity, интермиттент (circuit/repeaters) → power. Для
  // не-аэробных энергосистем → null.
  function deriveAerobicMode(meta) {
    if (!meta) return null;
    if (Object.prototype.hasOwnProperty.call(meta, 'energySubMode') && meta.energySubMode) {
      return meta.energySubMode;
    }
    const es = Object.prototype.hasOwnProperty.call(meta, 'energySystem')
      ? meta.energySystem : null;
    if (es !== 'aerobic') return null;
    const shape = meta.doseShape;
    if (shape === 'continuous') return 'capacity';
    if (shape === 'circuit' || shape === 'attempts') return 'power';
    // hang/прочее без явного тега — не угадываем, считаем capacity (низконагруз.)
    return 'capacity';
  }

  function aerobicModeOf(ex, atomMeta) {
    if (atomMeta) {
      const m = deriveAerobicMode(atomMeta);
      if (m) return m;
    }
    return energySystemOf(ex, atomMeta) === 'aerobic' ? 'capacity' : null;
  }

  // ─── PROGRAM_META — методологическая разметка каталога ───────────────────
  // block:  поля блока (§1.3): quality/targetStimulus/fatigueCost/tissueLoad
  // atom:   общие методологические поля атомов программы (§1.2)
  // overrides: точечные поля по индексу атома (мешанные программы)
  // loadValue: rm_margin→сек запаса; pctMax→%; bodyweight/none/addedWeightKg→null
  //            (значение addedWeightKg живёт в самом атоме каталога)
  const PROGRAM_META = {
    beastmaker_1000_beginner: {
      block: { quality: 'anaerobic_capacity', targetStimulus: 'develop', fatigueCost: 'moderate', tissueLoad: 'moderate' },
      atom: { quality: 'anaerobic_capacity', doseShape: 'hang', loadModel: 'bodyweight', loadValue: null, emphasis: 'capacity', doseConfidence: 'B', energySystem: 'glycolytic' } // 7:3×6 intermittent
    },
    horst_max_hangs: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'high', tissueLoad: 'high' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'rm_margin', loadValue: 3, emphasis: 'max', doseConfidence: 'A' } // 10×1 → phosphagen (derive)
    },
    lopez_mr: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'high', tissueLoad: 'high' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'rm_margin', loadValue: 3, emphasis: 'max', doseConfidence: 'A' }
    },
    repeaters_7_3: {
      block: { quality: 'anaerobic_capacity', targetStimulus: 'develop', fatigueCost: 'moderate', tissueLoad: 'moderate' },
      atom: { quality: 'anaerobic_capacity', doseShape: 'hang', loadModel: 'bodyweight', loadValue: null, emphasis: 'capacity', doseConfidence: 'B', energySystem: 'glycolytic' } // 7:3×6 (rest 3 → неполное восстановление)
    },
    nelson_no_hangs: {
      block: { quality: 'finger_strength', targetStimulus: 'maintain', fatigueCost: 'low', tissueLoad: 'low' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'pctMax', loadValue: 40, emphasis: 'capacity', doseConfidence: 'B', energySystem: null } // низконагруз. тканевый/recovery — энергосистема нерелевантна (явный null §1.2)
    },
    horst_towel_pulls: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'moderate', tissueLoad: 'moderate' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'pctMax', loadValue: 75, emphasis: 'max', doseConfidence: 'B' } // 6×1 → phosphagen (derive)
    },
    pinch_books: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'moderate', tissueLoad: 'moderate' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'bodyweight', loadValue: null, emphasis: 'max', doseConfidence: 'C' } // pinch, нет специфичного RCT
    },
    antagonist_bands: {
      block: { quality: 'antagonist', targetStimulus: 'maintain', fatigueCost: 'low', tissueLoad: 'low' },
      atom: { quality: 'antagonist', doseShape: 'reps', loadModel: 'none', loadValue: null, emphasis: 'capacity', doseConfidence: 'B', energySystem: null } // разгибатели, энергосистема н/д
    },
    nelson_density_hangs: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'moderate', tissueLoad: 'high' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'bodyweight', loadValue: null, emphasis: 'capacity', doseConfidence: 'C', energySystem: 'phosphagen' } // density: интент сила/ткань (density-hang note §3.1)
    },
    min_edge_progression: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'high', tissueLoad: 'high' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'rm_margin', loadValue: 3, emphasis: 'max', doseConfidence: 'A' } // RM-3 через глубину ребра
    },
    block_hangs_horst: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'high', tissueLoad: 'high' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'rm_margin', loadValue: 3, emphasis: 'max', doseConfidence: 'A' }
    },
    block_lifts_5x5: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'high', tissueLoad: 'high' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'addedWeightKg', loadValue: null, emphasis: 'max', doseConfidence: 'B', energySystem: 'phosphagen' } // 5s×5 lifts, полное восстановление, max-сила
    },
    block_min_edge: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'high', tissueLoad: 'high' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'rm_margin', loadValue: 3, emphasis: 'max', doseConfidence: 'A' }
    },
    horst_mixed_day: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'moderate', tissueLoad: 'moderate' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'pctMax', loadValue: 50, emphasis: 'max', doseConfidence: 'B' }, // дефолт = block max-hang 7s×1
      overrides: {
        1: { loadModel: 'pctMax', loadValue: 75 }, // door towel 6×1
        2: { quality: 'antagonist', doseShape: 'reps', loadModel: 'none', loadValue: null, emphasis: 'capacity', energySystem: null } // none antagonist 1s×20
      }
    },
    cf_test: {
      block: { quality: 'aerobic_base', targetStimulus: 'maintain', fatigueCost: 'high', tissueLoad: 'moderate' },
      atom: { quality: 'aerobic_base', doseShape: 'continuous', loadModel: 'none', loadValue: null, emphasis: 'capacity', doseConfidence: 'A', energySystem: 'aerobic' } // 4-мин all-out, граница CF (диагностика)
    },
    sub_cf_capacity: {
      block: { quality: 'aerobic_base', targetStimulus: 'develop', fatigueCost: 'moderate', tissueLoad: 'moderate' },
      atom: { quality: 'aerobic_base', doseShape: 'hang', loadModel: 'bodyweight', loadValue: null, emphasis: 'capacity', doseConfidence: 'B', energySystem: 'aerobic' } // ниже CF — аэробная ёмкость
    },
    abrahangs_daily: {
      block: { quality: 'finger_strength', targetStimulus: 'maintain', fatigueCost: 'low', tissueLoad: 'low' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'pctMax', loadValue: 40, emphasis: 'capacity', doseConfidence: 'B', energySystem: null } // тканевый: энергосистема нерелевантна (явный null §1.2)
    },
    lattice_foundation: {
      block: { quality: 'finger_strength', targetStimulus: 'develop', fatigueCost: 'high', tissueLoad: 'high' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'rm_margin', loadValue: 3, emphasis: 'max', doseConfidence: 'A' }
    },
    beyer_heavy_iso: {
      block: { quality: 'finger_strength', targetStimulus: 'recover', fatigueCost: 'moderate', tissueLoad: 'high' },
      atom: { quality: 'finger_strength', doseShape: 'hang', loadModel: 'pctMax', loadValue: 70, emphasis: 'max', doseConfidence: 'B', energySystem: null } // HSR на коллаген — не метаболический протокол (явный null §1.2)
    },
    recruitment_pulls: {
      block: { quality: 'power', targetStimulus: 'develop', fatigueCost: 'high', tissueLoad: 'high' },
      atom: { quality: 'power', doseShape: 'hang', loadModel: 'pctMax', loadValue: 90, emphasis: 'rfd', doseConfidence: 'B', energySystem: 'phosphagen' } // взрывной 4s, полное восстановление
    }
  };

  function metaFor(programId) {
    return PROGRAM_META[programId] || null;
  }

  // Методологические поля конкретного атома: atom-defaults + per-index overrides.
  function atomMetaFor(programId, idx) {
    const m = PROGRAM_META[programId];
    if (!m) return null;
    const base = Object.assign({}, m.atom);
    const ov = m.overrides && m.overrides[idx];
    return ov ? Object.assign(base, ov) : base;
  }

  // Возвращает КОПИЮ программы, где на каждом exercise добавлены методологические
  // поля (включая вычисленный energySystem). Источник PROGRAMS не мутируется.
  function enrichProgram(program) {
    if (!program) return null;
    const m = PROGRAM_META[program.id];
    const out = Object.assign({}, program);
    if (m && m.block) Object.assign(out, { __block: Object.assign({}, m.block) });
    out.exercises = (program.exercises || []).map(function (ex, idx) {
      const am = m ? atomMetaFor(program.id, idx) : null;
      const fields = am
        ? {
            quality: am.quality, doseShape: am.doseShape, loadModel: am.loadModel,
            loadValue: am.loadValue, emphasis: am.emphasis, doseConfidence: am.doseConfidence,
            energySystem: energySystemOf(ex, am)
          }
        : {};
      return Object.assign({}, ex, fields);
    });
    return out;
  }

  // Самопроверка: enum-валидность + правило «intermittent → явный energySystem».
  function validateProgramMeta() {
    const errors = [];
    const inEnum = function (val, key) { return ENUM[key].indexOf(val) >= 0; };
    const programs = (Fingers.PROGRAMS && Fingers.PROGRAMS.slice()) || [];
    programs.forEach(function (p) {
      const m = PROGRAM_META[p.id];
      if (!m) { errors.push(p.id + ': нет PROGRAM_META'); return; }
      ['quality', 'targetStimulus', 'fatigueCost', 'tissueLoad'].forEach(function (k) {
        const enumKey = k === 'quality' ? null : k;
        if (k === 'quality') { if (QUALITIES.indexOf(m.block.quality) < 0) errors.push(p.id + ': block.quality невалиден'); }
        else if (!inEnum(m.block[k], enumKey)) errors.push(p.id + ': block.' + k + ' невалиден (' + m.block[k] + ')');
      });
      // V_tissueIntent: низконагруз. finger_strength обязан быть maintain/recover —
      // иначе scoring §3.2 выдернет тканевый протокол как РАЗВИВАЮЩИЙ стимул.
      const _a = m.atom;
      const _lowLoad = _a.loadModel === 'bodyweight' || _a.loadModel === 'none'
        || (_a.loadModel === 'pctMax' && Number(_a.loadValue) < 60);
      if (m.block.quality === 'finger_strength' && m.block.tissueLoad === 'low' && _lowLoad
          && ['maintain', 'recover'].indexOf(m.block.targetStimulus) < 0) {
        errors.push(p.id + ': V_tissueIntent — низконагруз. finger_strength требует targetStimulus maintain/recover');
      }
      (p.exercises || []).forEach(function (ex, idx) {
        const am = atomMetaFor(p.id, idx);
        if (QUALITIES.indexOf(am.quality) < 0) errors.push(p.id + '[' + idx + ']: quality невалиден');
        ['doseShape', 'loadModel', 'emphasis', 'doseConfidence'].forEach(function (k) {
          if (!inEnum(am[k], k)) errors.push(p.id + '[' + idx + ']: ' + k + ' невалиден (' + am[k] + ')');
        });
        // правило коллизии: intermittent обязан нести явный energySystem
        if (isIntermittent(ex) && !Object.prototype.hasOwnProperty.call(am, 'energySystem')) {
          errors.push(p.id + '[' + idx + ']: intermittent (repsPerSet>1) без явного energySystem');
        }
        // если energySystem задан — он валиден
        if (Object.prototype.hasOwnProperty.call(am, 'energySystem') && !inEnum(am.energySystem, 'energySystem')) {
          errors.push(p.id + '[' + idx + ']: energySystem невалиден (' + am.energySystem + ')');
        }
      });
    });
    return errors;
  }

  // ─── Экспорт ─────────────────────────────────────────────────────────────
  Fingers.qualityCatalog = {
    __registered: true,
    QUALITIES: QUALITIES,
    QUALITY_LABELS: QUALITY_LABELS,
    ENUM: ENUM,
    PROGRAM_META: PROGRAM_META,
    deriveEnergySystem: deriveEnergySystem,
    workSecOf: workSecOf,
    isIntermittent: isIntermittent,
    energySystemOf: energySystemOf,
    deriveAerobicMode: deriveAerobicMode,
    aerobicModeOf: aerobicModeOf,
    metaFor: metaFor,
    atomMetaFor: atomMetaFor,
    enrichProgram: enrichProgram,
    validateProgramMeta: validateProgramMeta
  };
})(typeof window !== 'undefined' ? window : globalThis);
