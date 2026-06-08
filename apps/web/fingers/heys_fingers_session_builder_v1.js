// heys_fingers_session_builder_v1.js — New engine (Phase 1 / step 4 part 2).
//
// Реализует генерацию сессии на новых модулях:
//   block_catalog (атомы) + assessment (приоритеты) + validators (S1/S6/S8/S2).
// Вызывается через engine_router при flag=on. Под flag=off лежит мёртвым.
//
// Ключевые методологические швы (из ревью 3.1-4.1):
//   Риск 1: safety-floor для antagonist/mobility — НЕ из blockWeights (assessment
//           даёт им =0 по §3.5 «нет нормативов»). Builder заставляет их быть
//           в intensive-сессиях независимо от scoring.
//   Риск 2: выход совместим с mixEngine контрактом — `{intensity, exercises[]}`
//           с непустым exercises, каждый имеет `__role`. Контракт-guard в
//           engine_router отловит регресс.
//
// Детерминизм: никакого Date.now()/random. Время для S2 передаётся через opts.now.
//
// Public API:
//   HEYS.Fingers.sessionBuilder.recommendDay(opts) → Session | null
//   HEYS.Fingers.sessionBuilder.SLOT_TEMPLATES     — справочник bucket→slots
//   HEYS.Fingers.sessionBuilder._pickAtomForSlot(slot, opts)  — для тестов

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__sessionBuilderRegistered) return; // idempotent
  Fingers.__sessionBuilderRegistered = true;

  // ─── Маппинги bucket / readiness (зеркало mixEngine для совместимости) ────────
  const READINESS_CEILING = {
    rest: 'recovery', recovery: 'recovery', moderate: 'moderate', max: 'max'
  };
  const RANK = { recovery: 0, moderate: 1, max: 2 };

  const SLOT_TEMPLATES = {
    max: ['power', 'max-strength', 'strength-endurance', 'antagonist'],
    moderate: ['strength-endurance', 'capacity', 'antagonist'],
    recovery: ['capacity', 'antagonist']
  };

  // Slot → quality(ies) приоритетных блоков из block_catalog. Порядок = приоритет.
  // 'max-strength' слот тянет finger_strength high-tissue (max-hang) ИЛИ
  // max_strength блок B; в нашем пуле fs приоритетнее для пальцев.
  const SLOT_QUALITIES = {
    'power':              ['power'],
    'max-strength':       ['finger_strength', 'max_strength'],
    'strength-endurance': ['finger_strength', 'anaerobic_capacity'],
    'capacity':           ['aerobic_base', 'anaerobic_capacity'],
    'antagonist':         ['antagonist']
  };

  // Для 'max-strength' хотим high tissueLoad (max-hangs), для 'strength-endurance'
  // — moderate (repeaters). Различитель внутри одного quality.
  const SLOT_TISSUE_PREF = {
    'power':              ['moderate', 'high'],
    'max-strength':       ['high', 'max'],
    'strength-endurance': ['moderate'],
    'capacity':           ['low'],
    'antagonist':         ['low']
  };

  // Equipment compatibility: какие modality допустимы в каждом equipmentType.
  const EQUIPMENT_MODALITIES = {
    'full':  ['fingerboard', 'board', 'wall', 'campus', 'weights', 'drill', 'mobility', 'antagonist'],
    'block': ['fingerboard', 'weights', 'mobility', 'antagonist'], // hang block + free weights
    'door':  ['drill', 'mobility', 'antagonist'],
    'none':  ['drill', 'mobility', 'antagonist']
  };

  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }

  // ─── Session intensity — выводится из НАПОЛНЕНИЯ (зеркало mixEngine L126-130) ─
  // Ревью 4.2 находка #3: intensity-домен расходился (bucket vs sessionIntensity).
  // Используем sessionIntensity → домен совпадает с mixEngine.
  // Бонус: equipment-starved max (нет стимула) автоматически даунгрейдится до
  // recovery, не ложь «max без power-блока».
  function sessionIntensity(exercises) {
    if (exercises.some(function (e) {
      return e.__role === 'power' || e.__role === 'max-strength';
    })) return 'max';
    if (exercises.some(function (e) {
      return e.__role === 'strength-endurance';
    })) return 'moderate';
    return 'recovery';
  }

  // ─── Длительность сессии — TUT_sec по doseShape (CONSTRUCTOR_SPEC §3.1) ──────
  function _estimateAtomSec(atom) {
    const d = atom && atom.dose;
    if (!d) return 0;
    function avg(rng) { return Array.isArray(rng) ? (rng[0] + rng[1]) / 2 : (rng || 0); }
    const sets = num(d.sets) || 1;
    const reps = num(d.reps) || (Array.isArray(d.reps) ? avg(d.reps) : 1);
    const workSec = num(d.workSec) || 0;
    const restSec = num(d.restSec) || 0;
    const restSetsSec = num(d.restSetsSec) || 0;
    switch (atom.doseShape) {
      case 'hang':
        // workSec×reps×sets + intra-set rest + inter-set rest
        return workSec * reps * sets +
               restSec * Math.max(0, reps - 1) * sets +
               restSetsSec * Math.max(0, sets - 1);
      case 'attempts': {
        const moves = avg(d.movesPerAttempt) * 2.5;
        const attempts = avg(d.attempts);
        return moves * attempts + (num(d.restSetsSec) || 0) * Math.max(0, attempts - 1);
      }
      case 'circuit': {
        const ppr = num(d.problemsPerRound) || 0;
        const rounds = num(d.rounds) || 1;
        const restRounds = num(d.restRoundsSec) || 0;
        return ppr * rounds * 25 + restRounds * Math.max(0, rounds - 1);
      }
      case 'continuous':
        return workSec * sets;
      case 'reps':
        return avg(d.reps) * 3 * sets + restSetsSec * Math.max(0, sets - 1);
      case 'process':
        return 0;
      default:
        return 0;
    }
  }

  function totalDurationMin(exercises) {
    let totalSec = 0;
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const atom = Fingers.blockCatalog && Fingers.blockCatalog.getAtom(ex.atomId);
      if (atom) totalSec += _estimateAtomSec(atom);
    }
    return Math.max(10, Math.round(totalSec / 60));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function _allowedModalities(equipmentTypes) {
    const set = Object.create(null);
    (equipmentTypes || []).forEach(function (t) {
      (EQUIPMENT_MODALITIES[t] || []).forEach(function (m) { set[m] = true; });
    });
    return set;
  }

  function _atomFits(atom, profile, allowedModalities) {
    if (!allowedModalities[atom.modality]) return false;
    if (!profile) return false;
    // S1 explicit: возраст/уровень.
    const issues = Fingers.validators.S1_ageLevelGate(atom, profile);
    if (issues.some(function (i) { return i.level === 'error'; })) return false;
    return true;
  }

  // Выбрать первый подходящий атом для слота. Порядок атомов в block_catalog
  // зафиксирован (= порядок в PROTOCOL_POOL) → детерминизм без random.
  // Профиль ОБЯЗАТЕЛЕН с явным `level` — без него возвращаем null (fail-closed
  // вместо silent intermediate-дефолта, который обходил S1 для beginner — см.
  // ревью 4.2 находка #1).
  function _pickAtomForSlot(slot, opts) {
    if (!Fingers.blockCatalog) return null;
    const qualities = SLOT_QUALITIES[slot] || [];
    const tissuePrefs = SLOT_TISSUE_PREF[slot] || [];
    const allowed = _allowedModalities(opts.equipmentTypes || ['full']);
    const profile = opts.profile ||
      (opts.level ? { age: opts.age, level: opts.level } : null);
    if (!profile) return null; // fail-closed

    // 1-я попытка — match quality + tissue preference.
    for (let i = 0; i < qualities.length; i++) {
      const q = qualities[i];
      const candidates = Fingers.blockCatalog.atomsByQuality(q);
      for (let j = 0; j < tissuePrefs.length; j++) {
        const tissue = tissuePrefs[j];
        for (let k = 0; k < candidates.length; k++) {
          const a = candidates[k];
          if (a.tissueLoad !== tissue) continue;
          if (_atomFits(a, profile, allowed)) return a;
        }
      }
    }
    // 2-я попытка — любой подходящий атом quality, без tissue-preference.
    for (let i = 0; i < qualities.length; i++) {
      const q = qualities[i];
      const candidates = Fingers.blockCatalog.atomsByQuality(q);
      for (let k = 0; k < candidates.length; k++) {
        const a = candidates[k];
        if (_atomFits(a, profile, allowed)) return a;
      }
    }
    return null;
  }

  // Атом → exercise object совместимый с mixEngine output.
  // Legacy aliases (hangSec/restSec/repsPerSet/setsCount/restBetweenSetsSec) —
  // UI читает их напрямую (session_ui_v1.js L77-92, L715-716). Заполняем для
  // hang-shape; для остальных shape'ов оставляем null (UI игнорирует 0/null).
  function _materializeExercise(atom, role) {
    const d = atom.dose || {};
    const isHang = atom.doseShape === 'hang';
    return {
      __role: role,
      atomId: atom.id,
      name: atom.id, // плейсхолдер; ui-friendly название — отдельный слой
      modality: atom.modality,
      gripId: atom.gripId || null,
      edgeSizeMm: atom.edgeSizeMm || null,
      doseShape: atom.doseShape,
      dose: d,
      loadModel: atom.loadModel,
      loadValue: atom.loadValue,
      sourceIds: atom.sourceIds,
      // Legacy aliases для UI потребления:
      hangSec: isHang ? (num(d.workSec) || 0) : 0,
      restSec: isHang ? (num(d.restSec) || 0) : 0,
      repsPerSet: isHang ? (num(d.reps) || 1) : 1,
      setsCount: num(d.sets) || 1,
      restBetweenSetsSec: num(d.restSetsSec) || 0,
      // Сохраняем addedWeightKg для legacy (UI читает у max-strength блоков):
      addedWeightKg: atom.loadModel === 'addedWeightKg' ? (num(atom.loadValue) || 0) : 0
    };
  }

  // ─── Главная функция ──────────────────────────────────────────────────────────
  function recommendDay(opts) {
    const o = opts || {};
    const ageNum = num(o.age);
    if (ageNum === null) return null; // S1 fail-closed на верхнем уровне.

    // Level fail-closed (ревью 4.2 находка #1): убрали `|| 'intermediate'`,
    // который тихо подставлял intermediate-контент beginner-пользователю и
    // обходил S1 `S1.profile_level_missing`. Без явного profile/level → null.
    if (!o.profile && !o.level) return null;

    let ceiling = (o.readiness && READINESS_CEILING[o.readiness]) || 'max';
    // Legacy intensity-override (зеркало mixEngine L385): ручная даунгрейд-кнопка.
    // Только понижает потолок; повысить ceiling выше readiness нельзя.
    const intensityOverride = (o.intensity && o.intensity !== 'all' && RANK[o.intensity] != null)
      ? o.intensity : null;
    let bucket = ceiling;
    if (intensityOverride && RANK[intensityOverride] < RANK[ceiling]) {
      bucket = intensityOverride;
    }
    const slots = (SLOT_TEMPLATES[bucket] || SLOT_TEMPLATES.moderate).slice();

    const profile = o.profile || {
      age: ageNum,
      level: o.level,
      painFlag: o.painFlag || null
    };

    // S8: боль = стоп до сборки.
    if (profile.painFlag === 'pain') return null;

    const exercises = [];
    const safetyTrace = { picks: [], issues: [] };

    slots.forEach(function (slot) {
      const atom = _pickAtomForSlot(slot, Object.assign({}, o, { profile: profile }));
      if (atom) {
        exercises.push(_materializeExercise(atom, slot));
        safetyTrace.picks.push({ slot: slot, atomId: atom.id });
      } else {
        safetyTrace.picks.push({ slot: slot, atomId: null, skipped: true });
      }
    });

    // ── Safety-floor (Риск 1 ревью) ─────────────────────────────────────────────
    // antagonist обязан быть для intensive bucket; mobility — добор разминки.
    // Не выводим из blockWeights — это пол, не вес.
    const hasRole = function (r) { return exercises.some(function (e) { return e.__role === r; }); };
    if ((bucket === 'max' || bucket === 'moderate') && !hasRole('antagonist')) {
      const antAtom = _pickAtomForSlot('antagonist', Object.assign({}, o, { profile: profile }));
      if (antAtom) {
        exercises.push(_materializeExercise(antAtom, 'antagonist'));
        safetyTrace.picks.push({ slot: 'antagonist-floor', atomId: antAtom.id });
      }
    }
    if (bucket === 'max' && Fingers.blockCatalog) {
      // Mobility-floor: добавляем 1 атом из block H в конец.
      const mob = Fingers.blockCatalog.atomsByBlock('H').find(function (a) {
        return _atomFits(a, profile, _allowedModalities(o.equipmentTypes || ['full']));
      });
      if (mob) {
        exercises.push(_materializeExercise(mob, 'mobility'));
        safetyTrace.picks.push({ slot: 'mobility-floor', atomId: mob.id });
      }
    }

    // ── Explicit safety validators (не через runAll presence-dispatch) ──────────
    // S1 на каждом атоме сессии.
    exercises.forEach(function (ex) {
      const atom = Fingers.blockCatalog.getAtom(ex.atomId);
      if (atom) {
        const r = Fingers.validators.S1_ageLevelGate(atom, profile);
        r.forEach(function (i) { if (i.level === 'error') safetyTrace.issues.push(i); });
      }
    });
    // S6 на «сессии-как-микроцикле» (упрощённо: 1 сессия).
    const s6 = Fingers.validators.S6_antagonistBalance({
      sessions: [{ blocks: exercises.map(function (e) {
        const atom = Fingers.blockCatalog.getAtom(e.atomId);
        return {
          quality: atom ? atom.quality : null,
          fatigueCost: atom ? atom.fatigueCost : null
        };
      }) }]
    });
    s6.forEach(function (i) { if (i.level !== 'ok') safetyTrace.issues.push(i); });
    // S8 если есть painFlag в логе (опциональный вход).
    if (o.sessionLog) {
      const s8 = Fingers.validators.S8_painStop(o.sessionLog);
      s8.forEach(function (i) { if (i.level === 'error') safetyTrace.issues.push(i); });
    }
    // S2 если есть история и now.
    if (Array.isArray(o.history)) {
      exercises.forEach(function (ex) {
        const atom = Fingers.blockCatalog.getAtom(ex.atomId);
        if (atom) {
          const r = Fingers.validators.S2_tissueFreshness(atom, o.history, o.now);
          r.forEach(function (i) { if (i.level === 'error') safetyTrace.issues.push(i); });
        }
      });
    }

    // Fail-closed по error.
    if (safetyTrace.issues.some(function (i) { return i.level === 'error'; })) {
      return null;
    }

    // Пустой набор упражнений — невалидный выход (контракт-guard в роутере отловит,
    // но честнее вернуть null здесь).
    if (exercises.length === 0) return null;

    // intensity — sessionIntensity(exercises) (ревью 4.2 находка #3): домен
    // совпадает с mixEngine; equipment-starved max автоматически даунгрейдится.
    const sessionInt = sessionIntensity(exercises);
    const duration = totalDurationMin(exercises);
    const requiresWarmup = exercises.some(function (e) {
      return e.__role === 'power' || e.__role === 'max-strength';
    });
    const tierList = (o.equipmentTypes && o.equipmentTypes.length) ?
      o.equipmentTypes.slice() : ['full'];
    const allSourceIds = Object.create(null);
    exercises.forEach(function (e) {
      (e.sourceIds || []).forEach(function (sid) { allSourceIds[sid] = true; });
    });

    // Полный контракт mixEngine (ревью 4.2 находка #2). 16 полей, UI-совместимо.
    return {
      id: 'session_builder_' + bucket + '_' + exercises.length,
      __generated: true,
      __engine: 'sessionBuilder_v1',
      __from: 'sessionBuilder_v1', // legacy alias (для существующих router-тестов)
      name: 'Сессия по методологии',
      description: 'Собрано из block_catalog по bucket=' + bucket,
      coachReason: 'Bucket=' + bucket + '; safety-floor antagonist/mobility активен',
      level: 'mixed',
      durationMin: duration,
      intensity: sessionInt,
      exercises: exercises,
      equipmentTypes: tierList,
      sourceIds: Object.keys(allSourceIds),
      advisoryBadge: null,
      noEquipment: tierList.length === 1 && tierList[0] === 'none',
      minAge: 14,
      requiresWarmup: requiresWarmup,
      warmupType: requiresWarmup ? 'ramp' : 'quick',
      __bucket: bucket,
      __safetyTrace: safetyTrace,
      __trace: {
        version: 1,
        inputs: {
          age: ageNum, equipmentTypes: tierList,
          readiness: o.readiness || null, intensityOverride: intensityOverride,
          profileLevel: profile.level
        },
        resolution: {
          initialCeiling: ceiling, bucket: bucket,
          slotsTemplate: slots.slice(), slotsSource: intensityOverride ? 'legacy-intensity' : 'bucket'
        },
        slots: safetyTrace.picks,
        outputs: {
          durationMin: duration, intensity: sessionInt,
          tierList: tierList, exerciseCount: exercises.length,
          requiresWarmup: requiresWarmup
        }
      }
    };
  }

  Fingers.sessionBuilder = {
    recommendDay: recommendDay,
    SLOT_TEMPLATES: SLOT_TEMPLATES,
    SLOT_QUALITIES: SLOT_QUALITIES,
    _pickAtomForSlot: _pickAtomForSlot
  };

})(typeof window !== 'undefined' ? window : globalThis);
