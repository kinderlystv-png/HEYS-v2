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

  // UI renderable doseShape (ревью #3 ограничение 2 / план B1.5 + Шаг 5):
  // UI player умеет рендерить все 6 doseShape из методологии:
  //   - hang (CountdownDisplay, useCountdownCycle)
  //   - reps (RepsCounterDisplay, useRepsCycle, manual completeSet)
  //   - continuous (ContinuousDisplay, useCountdownCycle с workSec=hangSec,
  //     repsPerSet=1 — один длинный таймер; ARC/mileage/technique drills)
  //   - attempts (AttemptsDisplay, useRepsCycle с attempts→setsCount —
  //     болдер-лимит/дайно/кампус/RFD: серия атак с длинным rest 240с)
  //   - circuit (CircuitDisplay, useRepsCycle с rounds→setsCount —
  //     4x4/EMOM/связки/power intervals: round-based с rest restRoundsSec)
  //   - process (ProcessDisplay, useRepsCycle setsCount=1 — чек-лист тактики
  //     redpoint без таймера: сегменты, beta-план, дыхание, меморизация)
  // План B1.5 закрыт полностью: каталог из 36 атомов теперь полностью
  // renderable, никаких «вырожденных 7с виса × 1 повт» (ревью #3).
  const RENDERABLE_DOSESHAPES = {
    hang: true, reps: true, continuous: true, attempts: true, circuit: true, process: true
  };

  // Equipment compatibility: какие modality допустимы в каждом equipmentType.
  const EQUIPMENT_MODALITIES = {
    'full':  ['fingerboard', 'board', 'wall', 'campus', 'weights', 'drill', 'mobility', 'antagonist'],
    'block': ['fingerboard', 'weights', 'mobility', 'antagonist'], // hang block + free weights
    'door':  ['drill', 'mobility', 'antagonist'],
    'none':  ['drill', 'mobility', 'antagonist']
  };

  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function avg(rng) { return Array.isArray(rng) ? (rng[0] + rng[1]) / 2 : (rng || 0); }

  // ─── _deriveLevel (ревью #4-#5 (b)) ──────────────────────────────────────────
  // Маппинг MVC %BW → level через assessment.BENCHMARKS.finger_strength (§3.5).
  // Floor: нет MVC → 'beginner' (безопасная сторона — недооценка стажа).
  // Cap: 'advanced' (никогда не выдаём 'elite' из одного только MVC; настоящий
  // elite требует ещё чего-то кроме силы пальцев — explicit profile).
  // Reviewer #4: «MVC меряет силу. Сильный-от-природы новичок (высокий %BW,
  // низкий стаж) — именно injury-prone — получит от MVC 'advanced' → переоценка
  // в самую опасную сторону. Так что MVC-derived level надо кэпить, не брать
  // как единственный определитель.» Cap='advanced' закрывает elite-overshoot;
  // min-edge с base_>=2y prereq всё равно блокируется S9 без атtest'а.
  function _deriveLevel(mvcPctBW) {
    const m = num(mvcPctBW);
    if (m === null) return 'beginner';
    const BENCH = (Fingers.assessment && Fingers.assessment.BENCHMARKS.finger_strength) ||
      { intermediate: 58, advanced: 82, elite: 107 };
    if (m < BENCH.intermediate) return 'beginner';
    if (m < BENCH.advanced) return 'intermediate';
    return 'advanced'; // cap: даже elite-MVC не выдаёт 'elite' из derive
  }

  // ─── _seedCredentialsFromLevel (ревью #5 (B), уточнено ревью #6) ─────────────
  // Возвращает training-maturity credentials по уровню. Caller ОБЯЗАН вызывать
  // ТОЛЬКО для EXPLICIT level (атtest юзера: profile.level или opts.level).
  // НИКОГДА для MVC-derived level — это конфляция доменов (ревью #6):
  //   MVC меряет силу пальцев, `base_>=2y` кодирует тканевый возраст связок (2
  //   года адаптации). Strong-but-unadapted (сильный новичок, mvcPctBW≥90) — это
  //   ровно та injury-prone популяция, для которой gate `base_>=2y` существует.
  //   Сеять `base_>=2y` из MVC = открыть для них самый опасный протокол
  //   (`fs_minedge_recruit`, dangerLevel:high). Cap='advanced' это НЕ закрывает
  //   потому что base_>=2y сеется уже на advanced.
  // Safety-attestation токены (bfr_cuff_technique, safe_fall_setup,
  // injury_screen) — другой домен (знание/обстановка/здоровье), explicit-only.
  function _seedCredentialsFromLevel(level) {
    switch (level) {
      case 'beginner':     return [];
      case 'intermediate': return ['base_>=1y'];
      case 'advanced':     return ['base_>=1y', 'base_>=2y', 'strength_base'];
      case 'elite':        return ['base_>=1y', 'base_>=2y', 'strength_base'];
      default:             return [];
    }
  }

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

  // ─── Длительность сессии — TUT + rest по doseShape ───────────────────────────
  function _estimateAtomSec(atom) {
    const d = atom && atom.dose;
    if (!d) return 0;
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

  // ─── FTL — finger training load (CONSTRUCTOR_SPEC §3.1) ─────────────────────
  const TISSUE_WEIGHTS = { low: 0.3, moderate: 0.6, high: 1.0, max: 1.3 };
  const GRADE_WEIGHTS = {
    'easy-mid': 0.5, submax: 0.8, 'near-limit': 1.0,
    limit: 1.2, 'limit-skill': 0.6
  };

  function _estimateAtomTutSec(atom) {
    const d = atom && atom.dose;
    if (!d) return 0;
    const sets = num(d.sets) || 1;
    const reps = num(d.reps) || (Array.isArray(d.reps) ? avg(d.reps) : 1);
    const workSec = num(d.workSec) || 0;
    switch (atom.doseShape) {
      case 'hang':
        return workSec * reps * sets;
      case 'attempts':
        return avg(d.movesPerAttempt) * 2.5 * avg(d.attempts);
      case 'circuit':
        return (num(d.problemsPerRound) || 0) * (num(d.rounds) || 1) * 25;
      case 'continuous':
        return workSec * sets;
      case 'reps':
        return avg(d.reps) * 3 * sets;
      case 'process':
        return 0;
      default:
        return 0;
    }
  }

  function _bodyWeightKg(o) {
    const fromOpts = num(o && (o.bodyWeightKg ?? (o.profile && o.profile.bodyWeightKg)));
    if (fromOpts !== null && fromOpts > 0) return fromOpts;
    try {
      const bm = Fingers.getBodyWeight && Fingers.getBodyWeight();
      const kg = num(bm && bm.kg);
      if (kg !== null && kg > 0) return kg;
    } catch (_) {}
    return 70;
  }

  function _intensityWeight(atom, o) {
    if (!atom) return 0;
    const v = num(atom.loadValue);
    switch (atom.loadModel) {
      case 'rm_margin':
        return Math.max(0.3, Math.min(1.5, 1.5 - 0.1 * (v !== null ? v : 3)));
      case 'pctMax':
        return Math.max(0.3, Math.min(1.5, (v !== null ? v : 50) / 100));
      case 'addedWeightKg': {
        const added = v !== null ? v : 0;
        return Math.max(0.3, Math.min(1.5, 1 + added / _bodyWeightKg(o || {})));
      }
      case 'bodyweight':
        return 1.0;
      case 'rpe':
        return Math.max(0.3, Math.min(1.5, (v !== null ? v : 7) / 7));
      case 'grade':
        return GRADE_WEIGHTS[atom.loadValue] || 0.8;
      case 'none':
        return 0;
      default:
        return 1.0;
    }
  }

  function _estimateAtomFtl(atom, o) {
    const tut = _estimateAtomTutSec(atom);
    const intensityW = _intensityWeight(atom, o);
    const tissueW = TISSUE_WEIGHTS[atom && atom.tissueLoad] || 0.6;
    return tut * intensityW * tissueW;
  }

  function _estimateSessionFtl(exercises, o) {
    let total = 0;
    for (let i = 0; i < exercises.length; i++) {
      const atom = Fingers.blockCatalog && Fingers.blockCatalog.getAtom(exercises[i].atomId);
      if (atom) total += _estimateAtomFtl(atom, o);
    }
    return Math.round(total * 10) / 10;
  }

  function _computeS4Trace(o, exercises) {
    const ftl = (o && o.ftl) || {};
    const weekBefore = num(ftl.weekToDate) ?? num(ftl.currentWeek) ?? num(o && o.ftlWeekToDate);
    const trailingAvg = num(ftl.trailingAvg) ?? num(o && o.ftlTrailingAvg);
    const sessionFtl = _estimateSessionFtl(exercises, o || {});
    const projectedWeek = weekBefore !== null ? Math.round((weekBefore + sessionFtl) * 10) / 10 : null;
    const issues = (projectedWeek !== null && Fingers.validators && Fingers.validators.S4_progressionCap)
      ? Fingers.validators.S4_progressionCap(projectedWeek, trailingAvg) : [];
    return {
      sessionFtl: sessionFtl,
      weekBefore: weekBefore,
      projectedWeek: projectedWeek,
      trailingAvg: trailingAvg,
      issues: issues,
      overload: issues.some(function (i) { return i.code === 'S4.acute_overload'; })
    };
  }

  const S4_DROP_ORDER = ['strength-endurance', 'capacity', 'power', 'max-strength'];

  // CONSTRUCTOR_SPEC §3.7: прямых MEV/MAV по пальцам нет, поэтому это proxy по
  // weekly TUT. MAV режет сессию; MEV только объясняет недобор, не добавляет
  // нагрузку поверх safety-caps.
  const QUALITY_WEEKLY_TUT_BANDS = {
    finger_strength:    { mev: 30,  mav: 300 },
    max_strength:       { mev: 30,  mav: 250 },
    anaerobic_capacity: { mev: 120, mav: 750 },
    aerobic_base:       { mev: 600, mav: 5400 },
    power:              { mev: 30,  mav: 360 }
  };

  function _qualityTutWeekToDate(o) {
    const ftl = (o && o.ftl) || {};
    return (o && (o.qualityTutWeekToDate || o.weeklyQualityTutSec)) ||
      ftl.qualityTutWeekToDate ||
      ftl.weeklyQualityTutSec ||
      {};
  }

  function _estimateSessionTutByQuality(exercises) {
    const out = {};
    for (let i = 0; i < exercises.length; i++) {
      const atom = Fingers.blockCatalog && Fingers.blockCatalog.getAtom(exercises[i].atomId);
      if (!atom || !atom.quality) continue;
      out[atom.quality] = Math.round(((out[atom.quality] || 0) + _estimateAtomTutSec(atom)) * 10) / 10;
    }
    return out;
  }

  function _computeQualityBandTrace(o, exercises) {
    const week = _qualityTutWeekToDate(o || {});
    const session = _estimateSessionTutByQuality(exercises);
    const perQuality = {};
    Object.keys(QUALITY_WEEKLY_TUT_BANDS).forEach(function (q) {
      const band = QUALITY_WEEKLY_TUT_BANDS[q];
      const before = num(week[q]) || 0;
      const sessionTut = num(session[q]) || 0;
      const projected = Math.round((before + sessionTut) * 10) / 10;
      perQuality[q] = {
        weekBefore: before,
        sessionTut: sessionTut,
        projected: projected,
        mev: band.mev,
        mav: band.mav,
        underMev: projected > 0 && projected < band.mev,
        overMav: projected > band.mav
      };
    });
    return {
      perQuality: perQuality,
      underMev: Object.keys(perQuality).filter(function (q) { return perQuality[q].underMev; }),
      overMav: Object.keys(perQuality).filter(function (q) { return perQuality[q].overMav; })
    };
  }

  function _enforceQualityMav(o, exercises) {
    let trace = _computeQualityBandTrace(o, exercises);
    const drops = [];
    while (trace.overMav.length > 0) {
      let removed = null;
      for (let i = 0; i < S4_DROP_ORDER.length && !removed; i++) {
        const role = S4_DROP_ORDER[i];
        const idx = exercises.findIndex(function (e) {
          if (e.__role !== role) return false;
          const atom = Fingers.blockCatalog && Fingers.blockCatalog.getAtom(e.atomId);
          return atom && trace.overMav.indexOf(atom.quality) >= 0;
        });
        if (idx >= 0) removed = exercises.splice(idx, 1)[0];
      }
      if (!removed) break;
      drops.push({ role: removed.__role, atomId: removed.atomId });
      trace = _computeQualityBandTrace(o, exercises);
    }
    trace.enforced = drops.length > 0;
    trace.drops = drops;
    return trace;
  }

  function _enforceS4(o, exercises) {
    let trace = _computeS4Trace(o, exercises);
    const drops = [];
    if (!trace.overload) {
      trace.enforced = false;
      trace.drops = drops;
      return trace;
    }
    for (let i = 0; i < S4_DROP_ORDER.length && trace.overload; i++) {
      const role = S4_DROP_ORDER[i];
      const idx = exercises.findIndex(function (e) { return e.__role === role; });
      if (idx < 0) continue;
      const removed = exercises.splice(idx, 1)[0];
      drops.push({ role: role, atomId: removed.atomId });
      trace = _computeS4Trace(o, exercises);
    }
    trace.enforced = drops.length > 0;
    trace.drops = drops;
    return trace;
  }

  function _enforcePlannerVolume(o, exercises, plannerContext) {
    const multiplier = num(plannerContext && plannerContext.volumeMultiplier);
    const drops = [];
    const beforeFtl = _estimateSessionFtl(exercises, o || {});
    if (multiplier === null || multiplier >= 1 || multiplier <= 0 || beforeFtl <= 0) {
      return {
        enforced: false,
        drops: drops,
        multiplier: multiplier,
        beforeFtl: beforeFtl,
        afterFtl: beforeFtl,
        targetFtl: null
      };
    }
    const target = Math.round(beforeFtl * multiplier * 10) / 10;
    let after = beforeFtl;
    for (let i = 0; i < S4_DROP_ORDER.length && after > target; i++) {
      const role = S4_DROP_ORDER[i];
      const idx = exercises.findIndex(function (e) { return e.__role === role; });
      if (idx < 0) continue;
      const removed = exercises.splice(idx, 1)[0];
      drops.push({ role: role, atomId: removed.atomId });
      after = _estimateSessionFtl(exercises, o || {});
    }
    return {
      enforced: drops.length > 0,
      drops: drops,
      multiplier: multiplier,
      beforeFtl: beforeFtl,
      afterFtl: after,
      targetFtl: target
    };
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

  function _sessionFocusLabel(bucket, sessionInt) {
    if (sessionInt === 'max') return 'силовой акцент для пальцев';
    if (bucket === 'recovery' || sessionInt === 'recovery') return 'легкая восстановительная работа';
    return 'умеренная силовая выносливость';
  }

  function _buildDescription(bucket, sessionInt, duration, exercises) {
    const focus = _sessionFocusLabel(bucket, sessionInt);
    const count = exercises.length;
    return 'На сегодня подобрана ' + focus + ': ' + count + ' упражн. примерно на ' + duration + ' мин.';
  }

  function _buildCoachReason(bucket, sessionInt, requiresWarmup, levelIsExplicit, bucketCapReason, plannerCapReason, plannerVolumeTrace, s4Trace, qualityBandTrace, exercises) {
    const parts = [];
    if (bucketCapReason === 'beginner_max_to_moderate') {
      parts.push('Нагрузка снижена до умеренной: пока нет подтвержденного опыта для максимальной работы.');
    } else if (sessionInt === 'max') {
      parts.push('Основной блок выбран под готовность к тяжелой работе пальцев сегодня.');
    } else if (bucket === 'recovery') {
      parts.push('Сессия сделана легкой, чтобы сохранить движение без лишней нагрузки на пальцы.');
    } else {
      parts.push('Выбран умеренный объем: он дает стимул, но оставляет запас для восстановления.');
    }
    if (!levelIsExplicit) {
      parts.push('Уровень не задан явно, поэтому протоколы выбраны консервативно.');
    }
    if (plannerCapReason) {
      parts.push('Фаза плана ограничила интенсивность дня.');
    }
    if (plannerVolumeTrace && plannerVolumeTrace.enforced) {
      parts.push('Фаза плана уменьшила объем сессии.');
    }
    if (requiresWarmup) {
      parts.push('Перед основной частью нужен полный разогрев.');
    }
    if (s4Trace && s4Trace.enforced) {
      parts.push('Объем подрезан по недельной нагрузке, чтобы не делать резкий скачок.');
    }
    if (qualityBandTrace && qualityBandTrace.enforced) {
      parts.push('Объем подрезан по недельному потолку качества.');
    }
    if (qualityBandTrace && qualityBandTrace.underMev && qualityBandTrace.underMev.length > 0) {
      parts.push('По части качеств неделя пока ниже минимального полезного объема.');
    }
    if (exercises.some(function (e) { return e.__role === 'antagonist' || e.__role === 'mobility'; })) {
      parts.push('В конце добавлена работа на баланс и подвижность.');
    }
    return parts.join(' ');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function _allowedModalities(equipmentTypes) {
    const set = Object.create(null);
    (equipmentTypes || []).forEach(function (t) {
      (EQUIPMENT_MODALITIES[t] || []).forEach(function (m) { set[m] = true; });
    });
    return set;
  }

  function _isBlockOnly(equipmentTypes) {
    return Array.isArray(equipmentTypes) &&
      equipmentTypes.length === 1 &&
      equipmentTypes[0] === 'block';
  }

  function _qualitiesForSlot(slot, focusQuality) {
    const base = (SLOT_QUALITIES[slot] || []).slice();
    if (!focusQuality || base.indexOf(focusQuality) < 0) return base;
    return [focusQuality].concat(base.filter(function (q) { return q !== focusQuality; }));
  }

  // §3.2 аэробные под-режимы: доля интермиттента («аэробная мощность») растёт с
  // уровнем (Baláš 2016 `balas2016`). Новичок — только непрерывная ёмкость (ARC/
  // mileage); продвинутый/элита — приоритет интервалов/репитеров. Это ПОРЯДОК
  // предпочтения, не фильтр: под-режим не из списка падает в хвост, но остаётся
  // доступен как fallback (fail-safe — слот не пустеет).
  const AEROBIC_MODE_PREF_BY_LEVEL = {
    beginner:     ['capacity'],
    intermediate: ['capacity', 'power'],
    advanced:     ['power', 'capacity'],
    elite:        ['power', 'capacity']
  };

  function _aerobicModeOf(atom) {
    const qc = Fingers.qualityCatalog;
    if (qc && typeof qc.deriveAerobicMode === 'function') return qc.deriveAerobicMode(atom);
    return atom && atom.energySubMode ? atom.energySubMode : null;
  }

  // Стабильный reorder кандидатов aerobic_base по под-режиму для уровня.
  // Чистый порядок (slice → не мутируем общий catalog-массив); вторичный ключ —
  // исходный индекс, чтобы внутри одного под-режима порядок пула сохранялся.
  function _orderAerobicCandidates(candidates, level) {
    const pref = AEROBIC_MODE_PREF_BY_LEVEL[level] || AEROBIC_MODE_PREF_BY_LEVEL.intermediate;
    return candidates
      .map(function (a, i) { return { a: a, i: i }; })
      .sort(function (x, y) {
        const px = pref.indexOf(_aerobicModeOf(x.a));
        const py = pref.indexOf(_aerobicModeOf(y.a));
        const rx = px < 0 ? pref.length : px;
        const ry = py < 0 ? pref.length : py;
        return rx !== ry ? rx - ry : x.i - y.i;
      })
      .map(function (o) { return o.a; });
  }

  // §1.3/§3.3 FDP/FDS ротация: серия сессий с одним доминантным хватом (напр.
  // crimp=FDP) недогружает второй сгибатель → приоритезируем атомы под-нагруженного
  // lean (open=FDS) по кросс-сессионной истории. Reorder-only (slice → общий
  // catalog-массив не мутируется); нет истории/баланс → catalog-порядок.
  function _orderByEdgeRotation(candidates) {
    const eh = Fingers.edgeHistory;
    if (!eh || typeof eh.underusedLean !== 'function') return candidates;
    const want = eh.underusedLean();
    if (!want) return candidates;
    const leanOf = function (a) { return (a && a.gripId) ? eh.leanOfGrip(a.gripId) : null; };
    return candidates
      .map(function (a, i) { return { a: a, i: i }; })
      .sort(function (x, y) {
        const mx = leanOf(x.a) === want ? 0 : 1;
        const my = leanOf(y.a) === want ? 0 : 1;
        return mx !== my ? mx - my : x.i - y.i;
      })
      .map(function (o) { return o.a; });
  }

  // Кандидаты качества с учётом §3.2 (под-режим аэробной) и §1.3 (FDP/FDS ротация).
  function _candidatesForQuality(quality, level) {
    const list = Fingers.blockCatalog.atomsByQuality(quality);
    if (quality === 'aerobic_base' && level) return _orderAerobicCandidates(list, level);
    if (quality === 'finger_strength') return _orderByEdgeRotation(list);
    return list;
  }

  function _atomFits(atom, profile, allowedModalities) {
    if (!allowedModalities[atom.modality]) return false;
    if (!profile) return false;
    // Единый chokepoint UI-renderability (план B1.5). Не разрешаем атом, чей
    // doseShape player не умеет показать. Покрывает и slot-picks, и
    // safety-floor через тот же путь.
    if (!RENDERABLE_DOSESHAPES[atom.doseShape]) return false;
    // S1 explicit: возраст/уровень.
    const s1 = Fingers.validators.S1_ageLevelGate(atom, profile);
    if (s1.some(function (i) { return i.level === 'error'; })) return false;
    // S9 explicit (ревью #4): prerequisites. Закрывает BFR-без-манжеты,
    // min-edge-без-base, fall-без-safe-setup и т.п. profile.completedPrerequisites
    // — массив выполненных токенов (default []: строго fail-closed).
    const s9 = Fingers.validators.S9_prerequisitesGate(atom, profile);
    if (s9.some(function (i) { return i.level === 'error'; })) return false;
    return true;
  }

  // grip+edge ключ для дедупа (ревью #7). Без grip — атом не дедупится.
  function _gripEdgeKey(atom) {
    if (!atom || !atom.gripId || atom.edgeSizeMm == null) return null;
    return atom.gripId + ':' + atom.edgeSizeMm;
  }

  // Выбрать первый подходящий атом для слота. Порядок атомов в block_catalog
  // зафиксирован (= порядок в PROTOCOL_POOL) → детерминизм без random.
  // usedGripEdge — set ключей grip+edge, уже выбранных в этой сессии (ревью #7
  // дедуп: legacy mix_engine не повторяет хват+ребро в одной сессии).
  function _pickAtomForSlot(slot, opts, usedGripEdge) {
    if (!Fingers.blockCatalog) return null;
    const focusQuality = opts.focusQuality ||
      (opts.plannerContext && opts.plannerContext.focusQuality) ||
      (opts.periodizationContext && opts.periodizationContext.focusQuality) ||
      null;
    const qualities = _qualitiesForSlot(slot, focusQuality);
    const tissuePrefs = SLOT_TISSUE_PREF[slot] || [];
    const allowed = _allowedModalities(opts.equipmentTypes || ['full']);
    const profile = opts.profile ||
      (opts.level ? { age: opts.age, level: opts.level } : null);
    if (!profile) return null; // fail-closed
    const level = (profile && profile.level) || opts.level || null; // §3.2 aerobic под-режим
    const used = usedGripEdge || Object.create(null);
    const blockOnly = _isBlockOnly(opts.equipmentTypes || ['full']);

    function notDuplicate(a) {
      const k = _gripEdgeKey(a);
      return !k || !used[k];
    }

    function progressionAllowed(a) {
      return _progressionAllowsAtom(a, opts.progressionConstraints);
    }

    function fitsEnvelope(a) {
      // Pre-flip duration envelope: pow_rfd_pulls is a valid methodology atom,
      // but in block-only max sessions it adds 15-25 attempts × 150s rest as a
      // separate power slot. Keep it out until the block-only RFD dose is
      // explicitly accepted/tuned; full-equipment power remains unaffected.
      if (slot === 'power' && blockOnly && a && a.id === 'pow_rfd_pulls') {
        return false;
      }
      return true;
    }

    // Focus pass: только если quality уже входит в slot. Не расширяет пул слота,
    // а лишь даёт лимитеру мезоцикла шанс до tissue-pref fallback'ов.
    if (focusQuality && qualities.indexOf(focusQuality) >= 0) {
      const candidates = _candidatesForQuality(focusQuality, level);
      for (let k = 0; k < candidates.length; k++) {
        const a = candidates[k];
        if (!fitsEnvelope(a)) continue;
        if (!progressionAllowed(a)) continue;
        if (!notDuplicate(a)) continue;
        if (_atomFits(a, profile, allowed)) return a;
      }
    }

    // 1-я попытка — match quality + tissue preference + не дубль.
    for (let i = 0; i < qualities.length; i++) {
      const q = qualities[i];
      const candidates = _candidatesForQuality(q, level);
      for (let j = 0; j < tissuePrefs.length; j++) {
        const tissue = tissuePrefs[j];
        for (let k = 0; k < candidates.length; k++) {
          const a = candidates[k];
          if (a.tissueLoad !== tissue) continue;
          if (!fitsEnvelope(a)) continue;
          if (!progressionAllowed(a)) continue;
          if (!notDuplicate(a)) continue;
          if (_atomFits(a, profile, allowed)) return a;
        }
      }
    }
    // 2-я попытка — любой подходящий атом quality + не дубль.
    for (let i = 0; i < qualities.length; i++) {
      const q = qualities[i];
      const candidates = _candidatesForQuality(q, level);
      for (let k = 0; k < candidates.length; k++) {
        const a = candidates[k];
        if (!fitsEnvelope(a)) continue;
        if (!progressionAllowed(a)) continue;
        if (!notDuplicate(a)) continue;
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
      energySubMode: atom.energySubMode || _aerobicModeOf(atom) || null, // §3.2 capacity|power
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

  // ─── B3: progression constraints ────────────────────────────────────────────
  // Раньше progression жил только как advisory `__progressionHints`. Теперь те же
  // hints становятся мягким generator-constraint: atom с осью тяжелее текущей
  // разрешенной оси не выбирается. Safety-гейты (pain/readiness/S4) остаются
  // сильнее и могут дополнительно занулить/подрезать сессию.
  const ATOM_AXIS_OVERRIDES = {
    fs_repeater_73: 'volume',
    fs_density_hang: 'volume',
    fs_nohang_pickup: 'load',
    fs_maxhang_20mm_half: 'load',
    fs_maxhang_20mm_open: 'load',
    fs_minedge_recruit: 'edge',
    pe_on_the_minute: 'density',
    pe_fingerboard_lactic: 'density',
    aer_power_intervals: 'density',
    aer_bfr_lowload: 'density'
  };

  function _atomProgressionAxis(atom) {
    if (!atom) return 'volume';
    if (ATOM_AXIS_OVERRIDES[atom.id]) return ATOM_AXIS_OVERRIDES[atom.id];
    if (atom.quality === 'power') return 'speed';
    if (atom.edgeSizeMm != null && atom.edgeSizeMm < 20) return 'edge';
    if (atom.loadModel === 'addedWeightKg' || atom.loadModel === 'pctMax' || atom.loadModel === 'rm_margin') {
      return 'load';
    }
    return 'volume';
  }

  function _axisPolicyIndex(quality, axis) {
    const policy = (Fingers.progression && Fingers.progression.POLICY && Fingers.progression.POLICY[quality]) || ['volume'];
    const idx = policy.indexOf(axis);
    return idx >= 0 ? idx : 0;
  }

  function _buildProgressionConstraints(o) {
    if (!Fingers.progression || !o || !o.recordsByQuality) return null;
    const constraints = {};
    Object.keys(o.recordsByQuality).forEach(function (q) {
      const series = o.recordsByQuality[q];
      if (!Array.isArray(series)) return;
      const hint = Fingers.progression.suggestProgression({
        quality: q,
        currentAxis: (o.currentAxes && o.currentAxes[q]) || null,
        series: series,
        windowSessions: o.progressionWindow,
        improvementThreshold: o.progressionThreshold
      });
      const policy = hint.policy || ['volume'];
      let allowedAxis = null;
      if (hint.action === 'switch') {
        allowedAxis = hint.nextAxis || policy[0];
      } else if (hint.action === 'exhausted') {
        allowedAxis = hint.currentAxis || policy[policy.length - 1] || 'volume';
      } else {
        allowedAxis = hint.currentAxis || policy[0] || 'volume';
      }
      constraints[q] = {
        hint: hint,
        allowedAxis: allowedAxis,
        allowedPolicyIndex: _axisPolicyIndex(q, allowedAxis)
      };
    });
    return Object.keys(constraints).length > 0 ? constraints : null;
  }

  function _progressionAllowsAtom(atom, constraints) {
    if (!atom || !constraints) return true;
    const c = constraints[atom.quality];
    if (!c) return true;
    const axis = _atomProgressionAxis(atom);
    return _axisPolicyIndex(atom.quality, axis) <= c.allowedPolicyIndex;
  }

  function _computeProgressionHintsFromConstraints(constraints, exercises) {
    if (!constraints) return null;
    const qualities = Object.create(null);
    for (let i = 0; i < exercises.length; i++) {
      const atom = Fingers.blockCatalog && Fingers.blockCatalog.getAtom(exercises[i].atomId);
      if (atom && atom.quality) qualities[atom.quality] = true;
    }
    const hints = {};
    Object.keys(qualities).forEach(function (q) {
      if (constraints[q] && constraints[q].hint) hints[q] = constraints[q].hint;
    });
    return Object.keys(hints).length > 0 ? hints : null;
  }

  // ─── Главная функция ──────────────────────────────────────────────────────────
  function recommendDay(opts) {
    const o = opts || {};
    // age — приоритет opts.age (legacy mixEngine-зеркало) с fallback на
    // profile.age (новый профиль-based contract). Раньше profile.age игнорировался.
    const ageNum = num(o.age) ?? (o.profile && num(o.profile.age));
    if (ageNum === null) return null; // S1 fail-closed на верхнем уровне.

    // Level resolution (ревью #4-#5 (b), provenance ревью #6, ultimate floor #8):
    //   приоритет: explicit profile.level > o.level > derive(mvcPctBW) > 'beginner'.
    // Provenance важна для seed: derived level НЕ сеет training-maturity creds.
    // Ultimate floor (ревью #8): live-opts (зеркало mixEngine) не несут ни level,
    // ни mvcPctBW; раньше билдер возвращал null → роутер всегда fallback на legacy
    // и движок был инертен. Теперь builder отдаёт beginner-сессию: level
    // 'beginner' + creds=[] → только атомы с minLevel:'beginner' и пустыми
    // prereq. Никакого silent intermediate (ревью #2 #1 уважается — beginner
    // консервативнее, не наоборот).
    const explicitLevel = (o.profile && o.profile.level) || o.level || null;
    const derivedLevel = (o.mvcPctBW !== undefined) ? _deriveLevel(o.mvcPctBW) : null;
    const effectiveLevel = explicitLevel || derivedLevel || 'beginner';
    const levelIsExplicit = !!explicitLevel;

    let ceiling = (o.readiness && READINESS_CEILING[o.readiness]) || 'max';
    // Legacy intensity-override (зеркало mixEngine L385): ручная даунгрейд-кнопка.
    // Только понижает потолок; повысить ceiling выше readiness нельзя.
    const intensityOverride = (o.intensity && o.intensity !== 'all' && RANK[o.intensity] != null)
      ? o.intensity : null;
    let bucket = ceiling;
    if (intensityOverride && RANK[intensityOverride] < RANK[ceiling]) {
      bucket = intensityOverride;
    }
    const plannerContext = o.plannerContext || o.periodizationContext || null;
    let plannerCapReason = null;
    if (plannerContext && plannerContext.ceiling && RANK[plannerContext.ceiling] != null &&
        RANK[plannerContext.ceiling] < RANK[bucket]) {
      bucket = plannerContext.ceiling;
      plannerCapReason = plannerContext.phase || 'planner';
    }
    // Duration/safety envelope before flip: beginner-level users do not get max
    // bucket even when readiness=max. Otherwise the only beginner-compatible
    // max-strength atom creates a very short max session (no capacity block),
    // outside the legacy envelope seen in shadow runs.
    let bucketCapReason = null;
    if (bucket === 'max' && effectiveLevel === 'beginner') {
      bucket = 'moderate';
      bucketCapReason = 'beginner_max_to_moderate';
    }
    const slots = (SLOT_TEMPLATES[bucket] || SLOT_TEMPLATES.moderate).slice();

    // Credentials: seed по level ТОЛЬКО если level explicit (ревью #6).
    // Derived level (MVC) → seed=[] потому что сила ≠ тканевый возраст.
    // Explicit creds юзера всегда добавляются (safety-attestation
    // и/или явные training-maturity tokens).
    const seededCreds = levelIsExplicit ? _seedCredentialsFromLevel(effectiveLevel) : [];
    const explicitCreds = (o.profile && Array.isArray(o.profile.completedPrerequisites))
      ? o.profile.completedPrerequisites : [];
    const allCreds = Array.from(new Set(seededCreds.concat(explicitCreds)));

    const baseProfile = o.profile || {};
    const profile = Object.assign({}, baseProfile, {
      age: ageNum,
      level: effectiveLevel,
      painFlag: (baseProfile.painFlag != null) ? baseProfile.painFlag : (o.painFlag || null),
      completedPrerequisites: allCreds
    });

    // S8: боль = стоп до сборки.
    if (profile.painFlag === 'pain') return null;

    const exercises = [];
    const safetyTrace = { picks: [], issues: [] };
    const progressionConstraints = _buildProgressionConstraints(o);
    // Ревью #7: дедуп grip+edge внутри сессии — зеркало legacy mix_engine
    // `ctx.usedGripEdge`. Без этого max-strength слот мог упасть на тот же
    // grip+edge что fs_repeater_73 → дубль атома (видно в shadow snapshot'е).
    const usedGripEdge = Object.create(null);
    function _trackPick(atom) {
      const k = _gripEdgeKey(atom);
      if (k) usedGripEdge[k] = true;
    }

    slots.forEach(function (slot) {
      const atom = _pickAtomForSlot(slot, Object.assign({}, o, {
        profile: profile,
        progressionConstraints: progressionConstraints
      }), usedGripEdge);
      if (atom) {
        exercises.push(_materializeExercise(atom, slot));
        safetyTrace.picks.push({ slot: slot, atomId: atom.id });
        _trackPick(atom);
      } else {
        safetyTrace.picks.push({ slot: slot, atomId: null, skipped: true });
      }
    });

    // ── M3 transfer-мостик (§1.1 специфичность) ─────────────────────────────────
    // Сырая сила на фингерборде переносится в результат только через применение в
    // специфичном движении (METHODOLOGY §1.1 M3). Если в сессии есть фингерборд-
    // стимул силы (finger_strength/max_strength на fingerboard), но НЕТ application-
    // блока (max_strength/power на board/wall — лимит-болдер/первый-мув/дайно),
    // добираем один application-атом. Additive-floor (как antagonist), gated через
    // `_atomFits` (S1/S9/equipment/level/renderable) + дедуп grip+edge. Fail-safe:
    // нет board/wall в снаряжении → атом не fit'ится → мостик не навязывается.
    if ((bucket === 'max' || bucket === 'moderate') && Fingers.blockCatalog) {
      const _atomOf = function (e) { return Fingers.blockCatalog.getAtom(e.atomId); };
      const isFingerboardStrength = function (e) {
        const a = _atomOf(e);
        return !!a && a.modality === 'fingerboard' &&
          (a.quality === 'finger_strength' || a.quality === 'max_strength');
      };
      const isApplication = function (e) {
        const a = _atomOf(e);
        return !!a && (a.modality === 'board' || a.modality === 'wall') &&
          (a.quality === 'max_strength' || a.quality === 'power');
      };
      if (exercises.some(isFingerboardStrength) && !exercises.some(isApplication)) {
        const allowedTransfer = _allowedModalities(o.equipmentTypes || ['full']);
        let appAtom = null;
        const qOrder = ['max_strength', 'power'];
        for (let qi = 0; qi < qOrder.length && !appAtom; qi++) {
          const cands = Fingers.blockCatalog.atomsByQuality(qOrder[qi]);
          for (let i = 0; i < cands.length; i++) {
            const a = cands[i];
            if (a.modality !== 'board' && a.modality !== 'wall') continue;
            if (!_atomFits(a, profile, allowedTransfer)) continue;
            const k = _gripEdgeKey(a);
            if (k && usedGripEdge[k]) continue;
            appAtom = a; break;
          }
        }
        if (appAtom) {
          exercises.push(_materializeExercise(appAtom, 'transfer'));
          safetyTrace.picks.push({ slot: 'transfer-bridge', atomId: appAtom.id });
          _trackPick(appAtom);
        }
      }
    }

    // ── Safety-floor (Риск 1 ревью) ─────────────────────────────────────────────
    // antagonist обязан быть для intensive bucket; mobility — добор разминки.
    // Не выводим из blockWeights — это пол, не вес.
    const hasRole = function (r) { return exercises.some(function (e) { return e.__role === r; }); };
    if ((bucket === 'max' || bucket === 'moderate') && !hasRole('antagonist')) {
      const antAtom = _pickAtomForSlot('antagonist', Object.assign({}, o, {
        profile: profile,
        progressionConstraints: progressionConstraints
      }), usedGripEdge);
      if (antAtom) {
        exercises.push(_materializeExercise(antAtom, 'antagonist'));
        safetyTrace.picks.push({ slot: 'antagonist-floor', atomId: antAtom.id });
        _trackPick(antAtom);
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

    // MAV enforcement: quality-specific weekly TUT caps first, then S4 global FTL.
    const mavTrace = _enforceQualityMav(o, exercises);
    const plannerVolumeTrace = _enforcePlannerVolume(o, exercises, plannerContext);
    if (exercises.length === 0) return null;

    // S4 enforcement: если кандидатная сессия пробивает недельный FTL-cap
    // (>10% к trailing average), режем объёмные load-slots из текущей сессии.
    // Нельзя слепо max→moderate: moderate/recovery могут иметь больший TUT и
    // больший FTL. Поэтому cap применяется к фактической сумме FTL упражнений.
    const s4Trace = _enforceS4(o, exercises);
    if (exercises.length === 0) return null;

    const qualityBandTrace = _computeQualityBandTrace(o, exercises);
    qualityBandTrace.enforced = mavTrace.enforced;
    qualityBandTrace.drops = mavTrace.drops;

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

    const progressionHints = _computeProgressionHintsFromConstraints(progressionConstraints, exercises);

    // Полный контракт mixEngine (ревью 4.2 находка #2). 16 полей, UI-совместимо.
    return {
      id: 'session_builder_' + bucket + '_' + exercises.length,
      __generated: true,
      __engine: 'sessionBuilder_v1',
      __from: 'sessionBuilder_v1', // legacy alias (для существующих router-тестов)
      name: 'Сессия по методологии',
      description: _buildDescription(bucket, sessionInt, duration, exercises),
      coachReason: _buildCoachReason(bucket, sessionInt, requiresWarmup, levelIsExplicit, bucketCapReason, plannerCapReason, plannerVolumeTrace, s4Trace, qualityBandTrace, exercises),
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
      __progressionHints: progressionHints,
      __trace: {
        version: 1,
        inputs: {
          age: ageNum, equipmentTypes: tierList,
          readiness: o.readiness || null, intensityOverride: intensityOverride,
          plannerPhase: plannerContext && plannerContext.phase || null,
          plannerFocusQuality: plannerContext && plannerContext.focusQuality || null,
          profileLevel: profile.level,
          levelIsExplicit: levelIsExplicit,
          seededCredsCount: seededCreds.length,
          explicitCredsCount: explicitCreds.length
        },
        resolution: {
          initialCeiling: ceiling, bucket: bucket,
          bucketCapReason: bucketCapReason,
          plannerCapReason: plannerCapReason,
          slotsTemplate: slots.slice(), slotsSource: intensityOverride ? 'legacy-intensity' : 'bucket',
          s4DroppedSlots: s4Trace.drops,
          progression: progressionConstraints,
          plannerVolume: plannerVolumeTrace
        },
        slots: safetyTrace.picks,
        s4: {
          sessionFtl: s4Trace.sessionFtl,
          weekBefore: s4Trace.weekBefore,
          projectedWeek: s4Trace.projectedWeek,
          trailingAvg: s4Trace.trailingAvg,
          issues: s4Trace.issues,
          overload: s4Trace.overload,
          enforced: s4Trace.enforced,
          drops: s4Trace.drops
        },
        qualityBands: qualityBandTrace,
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
    RENDERABLE_DOSESHAPES: RENDERABLE_DOSESHAPES,
    _pickAtomForSlot: _pickAtomForSlot,
    _deriveLevel: _deriveLevel,
    _seedCredentialsFromLevel: _seedCredentialsFromLevel,
    _estimateAtomTutSec: _estimateAtomTutSec,
    _estimateAtomFtl: _estimateAtomFtl,
    _estimateSessionFtl: _estimateSessionFtl,
    _atomProgressionAxis: _atomProgressionAxis,
    _buildProgressionConstraints: _buildProgressionConstraints,
    _estimateSessionTutByQuality: _estimateSessionTutByQuality,
    _computeQualityBandTrace: _computeQualityBandTrace,
    _qualitiesForSlot: _qualitiesForSlot,
    _enforcePlannerVolume: _enforcePlannerVolume,
    QUALITY_WEEKLY_TUT_BANDS: QUALITY_WEEKLY_TUT_BANDS
  };

})(typeof window !== 'undefined' ? window : globalThis);
