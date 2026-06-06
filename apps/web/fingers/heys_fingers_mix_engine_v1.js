// heys_fingers_mix_engine_v1.js — role-based генератор дня тренировки пальцев.
// Заменяет случайный generateMixedWorkout (programs_catalog) умной сборкой по
// ролям-слотам с учётом потолка готовности, баланса хватов и обязательного
// антагониста. Принцип: goal предлагает, bucket (потолок) распоряжается.
//
// Public API:
//   HEYS.Fingers.mixEngine.recommendDay({ equipmentTypes, intensity, age, readiness })
//     → program object той же формы, что generateMixedWorkout (__generated:true,
//       exercises[], …) + поле coachReason. null если возраст не указан
//       (fail-closed) или нечего собрать.
//
// Лениво читает HEYS.Fingers.* в момент вызова — порядок загрузки модулей не важен,
// лишь бы движок был доступен к моменту useEffect в session_ui.
//
// Слот-шаблоны по bucket (порядок = нейро-нагрузка, max → выносливость → антагонист):
//   max:      [max-strength(anchor half-crimp), strength-endurance, antagonist]
//   moderate: [strength-endurance, capacity, antagonist]
//   recovery: [capacity, antagonist]
//
// Safety (переиспользует существующие гейты):
//   - age null → null; under-18 → ageGate.filterPrograms/filterGrips;
//   - боль → painGate убирает fullcrimp/mono из пула;
//   - bucket recovery → нет max-слота + бан dangerLevel high/very-high;
//   - нет двух упражнений на одном grip+edge; кумулятивный danger-budget по a2ForceRatio.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.mixEngine && Fingers.mixEngine.__registered) return; // idempotent

  const RANK = { recovery: 0, moderate: 1, max: 2 };
  const READINESS_CEILING = { rest: 'recovery', recovery: 'recovery', moderate: 'moderate', max: 'max' };

  // bucket → упорядоченный список ролей-слотов.
  const SLOT_TEMPLATES = {
    // power первым — взрывной/нейро-стимул на самые свежие пальцы (если есть
    // power-протокол под выбранный снаряд; иначе слот тихо пропускается).
    max: ['power', 'max-strength', 'strength-endurance', 'antagonist'],
    moderate: ['strength-endurance', 'capacity', 'antagonist'],
    recovery: ['capacity', 'antagonist'],
  };
  // slotRole → какие protocol-роли его заполняют (с fallback'ами).
  const SLOT_ACCEPT = {
    'power': { 'power': true },
    'max-strength': { 'max-strength': true },
    'strength-endurance': { 'strength-endurance': true },
    'capacity': { 'capacity': true, 'connective': true, 'strength-endurance': true },
    'antagonist': { 'antagonist': true },
  };
  // Кумулятивный потолок суммы a2ForceRatio на сессию (защита от стэка нагрузки
  // на шкивы). Для текущих протоколов почти не срабатывает (нет fullcrimp/mono в
  // exercises), но удерживает инвариант при будущих протоколах.
  const DANGER_BUDGET = { recovery: 8, moderate: 24, max: 48 };

  // ── Goal-axis: «цель» (что тренируем) отдельно от bucket (потолок готовности).
  // goal предлагает шаблон, bucket его режет: цель никогда не превышает готовность.
  const GOAL_TEMPLATES = {
    strength:    ['power', 'max-strength', 'strength-endurance', 'antagonist'],
    endurance:   ['strength-endurance', 'capacity', 'antagonist'],
    recovery:    ['capacity', 'antagonist'],
    maintenance: ['strength-endurance', 'antagonist'],
  };
  // Минимальный bucket-ранг, при котором слот допустим (power/max — только max).
  const SLOT_MIN_RANK = {
    'power': 2, 'max-strength': 2, 'strength-endurance': 1, 'capacity': 0, 'antagonist': 0,
  };
  // Естественная интенсивность цели — для пометки «снижено готовностью».
  const GOAL_NATURAL = { strength: 'max', endurance: 'moderate', recovery: 'recovery', maintenance: 'moderate' };
  // Для UI-селектора (порядок = слева направо).
  const GOALS = [
    { id: 'strength', label: 'Сила' },
    { id: 'endurance', label: 'Выносливость' },
    { id: 'recovery', label: 'Восстановление' },
    { id: 'maintenance', label: 'Поддержка' },
  ];

  const BUCKET_LABEL = {
    max: 'максимум', moderate: 'умеренный', recovery: 'восстановление',
  };
  const ROLE_LABEL = {
    'power': 'взрывная сила (RFD)', 'max-strength': 'макс. сила',
    'strength-endurance': 'силовая выносливость',
    'capacity': 'аэробная ёмкость', 'antagonist': 'антагонист',
  };

  // ── Phase 2a: автоregуляция (MVC-доза / RPE-bias / MAV-объём) ────────────
  // Целевой % MVC по bucket (зеркалит constructor MVC_TARGET_PCT).
  const MVC_TARGET_PCT = { recovery: 60, moderate: 75, max: 90 };
  const MVC_DEFAULT_PCT = 80;
  const MVC_CEILING_PCT = 110; // >110% MVC — риск pulley-травмы (constructor warn)
  const MAV_SETS_PER_GRIP = 5; // верхний предел рабочих сетов на хват за сессию
  const RECOVERY_TRIM = 0.7;   // множитель объёма на recovery/rest
  const RPE_RECENT_DAYS = 2;   // «недавно» для RPE-bias

  function snap(n, step) { return Math.round((Number(n) || 0) / step) * step; }

  // Роль протокола: явное p.role → спец-случай antagonist_bands → по intensity.
  function roleOf(p) {
    if (!p) return 'strength-endurance';
    if (p.role) return p.role;
    if (p.id === 'antagonist_bands') return 'antagonist';
    const pi = p.intensity || 'moderate';
    if (pi === 'max') return 'max-strength';
    if (pi === 'recovery') return 'capacity';
    return 'strength-endurance';
  }

  function slotTemplateFor(bucket) {
    return (SLOT_TEMPLATES[bucket] || SLOT_TEMPLATES.moderate).slice();
  }

  // Шаблон цели, обрезанный потолком готовности. Если после обрезки не осталось
  // ни одного тренировочного слота (только антагонист) — падаем в дефолт bucket'а.
  function cappedGoalTemplate(goal, bucket) {
    const base = GOAL_TEMPLATES[goal] || GOAL_TEMPLATES.maintenance;
    const r = RANK[bucket] != null ? RANK[bucket] : 2;
    const capped = base.filter(function (role) { return r >= (SLOT_MIN_RANK[role] || 0); });
    const hasTraining = capped.some(function (role) { return role !== 'antagonist'; });
    return hasTraining ? capped : slotTemplateFor(bucket);
  }

  // Фактическая интенсивность собранной сессии (для cooldown/логов), по ролям.
  function sessionIntensity(picked) {
    if (picked.some(function (e) { return e.__role === 'power' || e.__role === 'max-strength'; })) return 'max';
    if (picked.some(function (e) { return e.__role === 'strength-endurance'; })) return 'moderate';
    return 'recovery';
  }

  function gripMeta(id) {
    return (Fingers.getGripById && Fingers.getGripById(id)) || null;
  }

  // Собирает множество разрешённых gripId по возрасту + боли.
  function allowedGripIdSet(ageNum) {
    const allGrips = Array.isArray(Fingers.GRIPS) ? Fingers.GRIPS : [];
    const ageGrips = (Fingers.ageGate && typeof Fingers.ageGate.filterGrips === 'function')
      ? Fingers.ageGate.filterGrips(allGrips, ageNum) : allGrips;
    const painInfo = (Fingers.recentFingerPain && Fingers.recentFingerPain()) || { hasPain: false };
    const grips = (painInfo.hasPain && Fingers.painGate && typeof Fingers.painGate.filterGripsForPain === 'function')
      ? Fingers.painGate.filterGripsForPain(ageGrips, true) : ageGrips;
    const set = Object.create(null);
    grips.forEach(function (g) { if (g && g.id) set[g.id] = true; });
    return { set: set, hasPain: !!painInfo.hasPain };
  }

  // Кандидатные программы: age-фильтр, intensity ≤ ceiling, не excludeFromMix.
  function candidatePrograms(ageNum, ceiling) {
    let progs = (Array.isArray(Fingers.PROGRAMS) ? Fingers.PROGRAMS : []).slice();
    if (Fingers.ageGate && typeof Fingers.ageGate.filterPrograms === 'function') {
      progs = Fingers.ageGate.filterPrograms(progs, ageNum);
    }
    return progs.filter(function (p) {
      if (!p || p.excludeFromMix) return false;
      const pi = p.intensity || 'moderate';
      return RANK[pi] != null && RANK[pi] <= RANK[ceiling];
    });
  }

  // Пул (program, exercise, tier) под слот. Для antagonist не требуем пересечения
  // по снаряду — работа на разгибатели снаряжения не требует (tier='none').
  function poolForSlot(slotRole, progs, types, allowedIds) {
    const accept = SLOT_ACCEPT[slotRole] || {};
    const isAntagonist = slotRole === 'antagonist';
    const pool = [];
    progs.forEach(function (p) {
      if (!accept[roleOf(p)]) return;
      const progTiers = (Fingers.getProgramEquipmentTypes && Fingers.getProgramEquipmentTypes(p)) || [];
      (p.exercises || []).forEach(function (ex) {
        if (!ex || !allowedIds[ex.gripId]) return;
        let tier = null;
        if (isAntagonist) {
          tier = ex.equipmentTier || (progTiers.indexOf('none') >= 0 ? 'none' : (progTiers[0] || 'none'));
        } else if (ex.equipmentTier) {
          if (types.indexOf(ex.equipmentTier) < 0) return;
          tier = ex.equipmentTier;
        } else {
          for (let i = 0; i < progTiers.length; i++) {
            if (types.indexOf(progTiers[i]) >= 0) { tier = progTiers[i]; break; }
          }
          if (!tier) return;
        }
        pool.push({ p: p, ex: ex, tier: tier, role: slotRole });
      });
    });
    return pool;
  }

  // Выбор одного упражнения из пула с учётом anchor/дедупа/danger.
  // Если передан `slotTrace` (массив) — складываем в него причины отклонения
  // каждого кандидата, чтобы потом показать в логике сборки.
  function pickFromPool(pool, slotRole, bucket, ctx, slotTrace) {
    // Step 5: сортируем по RPE-штрафу (недавние 'hard' — вниз), затем anchor.
    // Нет lastGripFeedback → штраф 0 у всех → остаётся только anchor (Phase 1).
    let ordered = pool.slice();
    ordered.sort(function (a, b) {
      const pa = gripRpePenalty(a.ex.gripId);
      const pb = gripRpePenalty(b.ex.gripId);
      if (pa !== pb) return pa - pb;
      if (slotRole === 'max-strength') {
        return (a.ex.gripId === 'halfcrimp' ? 0 : 1) - (b.ex.gripId === 'halfcrimp' ? 0 : 1);
      }
      return 0;
    });
    const budget = DANGER_BUDGET[bucket] != null ? DANGER_BUDGET[bucket] : 48;
    const banHighDanger = bucket === 'recovery';
    const trace = Array.isArray(slotTrace) ? slotTrace : null;
    // Проход 1 — со всеми правилами (включая дедуп grip+edge).
    // Проход 2 — ослабляем дедуп, но НЕ ослабляем danger/pain (safety).
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < ordered.length; i++) {
        const c = ordered[i];
        const gm = gripMeta(c.ex.gripId);
        const danger = (gm && Number(gm.a2ForceRatio)) || 0;
        const dl = gm && gm.dangerLevel;
        if (banHighDanger && (dl === 'high' || dl === 'very-high')) {
          if (trace) trace.push({ pass: pass + 1, programId: c.p.id, gripId: c.ex.gripId, edgeMm: c.ex.edgeSizeMm, skip: 'danger-level=' + dl + ' запрещён на recovery' });
          continue;
        }
        if (ctx.dangerSpent + danger > budget) {
          if (trace) trace.push({ pass: pass + 1, programId: c.p.id, gripId: c.ex.gripId, edgeMm: c.ex.edgeSizeMm, skip: 'danger-budget превышен (' + (ctx.dangerSpent + danger).toFixed(2) + ' > ' + budget + ')' });
          continue;
        }
        const key = c.ex.gripId + '_' + c.ex.edgeSizeMm;
        if (pass === 0 && ctx.usedGripEdge[key]) {
          if (trace) trace.push({ pass: pass + 1, programId: c.p.id, gripId: c.ex.gripId, edgeMm: c.ex.edgeSizeMm, skip: 'дубликат grip+edge — отложен на проход 2' });
          continue;
        }
        if (trace) {
          const reasonBits = [];
          if (slotRole === 'max-strength' && c.ex.gripId === 'halfcrimp') reasonBits.push('anchor halfcrimp');
          reasonBits.push('danger ' + danger.toFixed(2) + '/' + budget);
          if (pass === 1) reasonBits.push('второй проход (дубликат разрешён)');
          trace.push({ pass: pass + 1, programId: c.p.id, gripId: c.ex.gripId, edgeMm: c.ex.edgeSizeMm, chosen: true, reason: reasonBits.join(' · ') });
        }
        return c;
      }
    }
    return null;
  }

  function totalDurationMin(exercises) {
    const totalSec = exercises.reduce(function (s, ex) {
      const setSec = (Number(ex.hangSec) + Number(ex.restSec)) * Number(ex.repsPerSet)
        + Number(ex.restBetweenSetsSec);
      return s + setSec * Number(ex.setsCount);
    }, 0);
    return Math.max(10, Math.round(totalSec / 60));
  }

  // Step 5: штраф хвата по недавнему RPE. Нет сигнала → 0 (поведение Phase 1).
  function gripRpePenalty(gripId) {
    if (typeof Fingers.lastGripFeedback !== 'function') return 0;
    let fb = null;
    try { fb = Fingers.lastGripFeedback(gripId); } catch (_) { fb = null; }
    if (!fb || !Array.isArray(fb.rpe) || fb.daysAgo == null) return 0;
    if (Number(fb.daysAgo) > RPE_RECENT_DAYS) return 0;
    const hard = fb.rpe.filter(function (r) { return r === 'hard'; }).length;
    if (hard >= 2) return 100; // деприоритет: 2+ тяжёлых подхода ≤2 дней назад
    if (hard === 1) return 10;
    return 0;
  }

  // Step 4: рабочий вес под %MVC роли. Только max-strength. Нет MVC / нет
  // records → каталожный вес + флаг __needsMvc (UI подскажет калибровку).
  // Если передан traceObj — складывает в него детальное обоснование (используется
  // в MixTraceModal для прозрачности дозировки).
  function doseExercise(ex, bucket, ageNum, traceObj) {
    const writeTrace = function (data) { if (traceObj) Object.assign(traceObj, data); };
    if (ex.__role !== 'max-strength') {
      writeTrace({ skipped: 'не max-strength роль' });
      return ex;
    }
    if (Fingers.ageGate && typeof Fingers.ageGate.warnLevel === 'function') {
      const lvl = Fingers.ageGate.warnLevel(ageNum);
      if (lvl && lvl !== 'ok') {
        writeTrace({ ageClamp: lvl, addedKgFinal: 0, note: 'возраст ' + ageNum + ' (' + lvl + ') — доп.вес обнулён' });
        return Object.assign({}, ex, { addedWeightKg: 0 });
      }
    }
    if (!Fingers.records || typeof Fingers.records.getMVC !== 'function') {
      writeTrace({ note: 'records-модуль не загружен — каталожный вес' });
      return ex;
    }
    let mvc = null;
    try { mvc = Fingers.records.getMVC(ex.gripId, ex.edgeSizeMm); } catch (_) { mvc = null; }
    if (!mvc || mvc.type !== 'weight' || !(Number(mvc.mvcKg) > 0)) {
      let due = false;
      try {
        due = !!(Fingers.calibration && typeof Fingers.calibration.isDue === 'function'
          && Fingers.calibration.isDue('maxHang', ex.gripId));
      } catch (_) { due = false; }
      writeTrace({ note: 'MVC не откалиброван — оставлен каталожный вес ' + (ex.addedWeightKg || 0) + ' кг', needsMvc: true, mvcDue: due });
      return Object.assign({}, ex, { __needsMvc: true, __mvcDue: due });
    }
    const mvcKg = Number(mvc.mvcKg);
    const bw = (Fingers.getBodyWeight && Number(Fingers.getBodyWeight().kg)) || 70;
    const targetPct = MVC_TARGET_PCT[bucket] || MVC_DEFAULT_PCT;
    const maxAdded = Math.max(0, snap(mvcKg * MVC_CEILING_PCT / 100 - bw, 0.5));
    const added = Math.max(0, Math.min(snap(mvcKg * targetPct / 100 - bw, 0.5), maxAdded));
    writeTrace({
      mvcKg: mvcKg, bodyWeightKg: bw, targetPct: targetPct, ceilingPct: MVC_CEILING_PCT,
      formula: '(' + mvcKg + ' × ' + targetPct + '% − ' + bw + ' кг) → ' + added + ' кг',
      addedKgCatalog: ex.addedWeightKg || 0, addedKgFinal: added, maxAddedAllowed: maxAdded
    });
    return Object.assign({}, ex, { addedWeightKg: added, __mvcDosed: true });
  }

  // Step 8: объём — trim на recovery + MAV-кап рабочих сетов на хват.
  // Антагонист не трогаем (минимальный объём, держит баланс).
  // Если передан volumeTrace — пишет в него причины изменения объёма по каждому ex.
  function applyVolume(picked, bucket, volumeTrace) {
    const trim = (bucket === 'recovery') ? RECOVERY_TRIM : 1;
    const gripSets = Object.create(null);
    return picked.map(function (ex) {
      const origSets = Number(ex.setsCount) || 1;
      if (ex.__role === 'antagonist') {
        if (volumeTrace) volumeTrace.push({ gripId: ex.gripId, edgeMm: ex.edgeSizeMm, role: ex.__role, origSets: origSets, finalSets: origSets, reason: 'антагонист — объём не трогаем' });
        return ex;
      }
      let sets = origSets;
      const reasons = [];
      if (trim < 1) {
        const trimmed = Math.max(1, Math.round(sets * trim));
        if (trimmed !== sets) reasons.push('recovery-trim ×' + RECOVERY_TRIM + ' (' + sets + ' → ' + trimmed + ')');
        sets = trimmed;
      }
      const prior = gripSets[ex.gripId] || 0;
      if (prior + sets > MAV_SETS_PER_GRIP) {
        const capped = Math.max(1, MAV_SETS_PER_GRIP - prior);
        reasons.push('MAV-кап ' + MAV_SETS_PER_GRIP + ' сетов/хват (был ' + sets + ', осталось ' + capped + ')');
        sets = capped;
      }
      gripSets[ex.gripId] = prior + sets;
      if (volumeTrace) volumeTrace.push({ gripId: ex.gripId, edgeMm: ex.edgeSizeMm, role: ex.__role, origSets: origSets, finalSets: sets, reason: reasons.length ? reasons.join('; ') : 'без изменений' });
      return sets === origSets ? ex : Object.assign({}, ex, { setsCount: sets });
    });
  }

  function buildReason(bucket, downgraded, picked, hasAntagonist) {
    const roles = picked.map(function (e) { return ROLE_LABEL[e.__role] || e.__role; });
    let head = 'Потолок дня — ' + (BUCKET_LABEL[bucket] || bucket) + '. ';
    if (downgraded) {
      head += 'Цель снижена ради восстановления связок. ';
    }
    let body = 'Собрал по ролям: ' + roles.join(' → ') + '.';
    if (!hasAntagonist) {
      body += ' Добавь в конце разгибатели (антагонист-резинка) для баланса.';
    }
    return head + body;
  }

  /**
   * Главная функция. Совместима по входам/выходу с generateMixedWorkout —
   * drop-in замена в session_ui.
   */
  function recommendDay(opts) {
    const o = opts || {};
    const ageNum = Number(o.age);
    if (!Number.isFinite(ageNum)) return null; // age fail-closed

    const types = (Array.isArray(o.equipmentTypes) && o.equipmentTypes.length)
      ? o.equipmentTypes.slice() : ['full'];
    const initialCeiling = (o.readiness && READINESS_CEILING[o.readiness]) || 'max';
    let ceiling = initialCeiling;
    const goal = (o.goal && GOAL_TEMPLATES[o.goal]) ? o.goal : null; // новая ось
    const intensityOverride = (o.intensity && o.intensity !== 'all' && RANK[o.intensity] != null)
      ? o.intensity : null; // legacy ручная интенсивность

    const allowed = allowedGripIdSet(ageNum);
    const painLoweredCeiling = allowed.hasPain && RANK[ceiling] > RANK.moderate;
    if (painLoweredCeiling) ceiling = 'moderate';

    let bucket = ceiling;
    let slots;
    let downgraded = false;
    let slotsSource;
    if (goal) {
      slots = cappedGoalTemplate(goal, bucket);
      downgraded = RANK[GOAL_NATURAL[goal]] > RANK[bucket];
      slotsSource = 'goal';
    } else {
      if (intensityOverride && RANK[intensityOverride] < RANK[ceiling]) bucket = intensityOverride;
      slots = slotTemplateFor(bucket);
      downgraded = !!(intensityOverride && RANK[intensityOverride] > RANK[bucket]);
      slotsSource = intensityOverride ? 'legacy-intensity' : 'bucket';
    }

    const progs = candidatePrograms(ageNum, ceiling);
    if (!progs.length) return null;

    // ── Build trace skeleton — будет наполняться по мере исполнения ──
    const traceObj = {
      version: 1,
      inputs: {
        goal: o.goal || null,
        readiness: o.readiness || null,
        age: ageNum,
        equipmentTypes: types,
        intensityOverride: intensityOverride
      },
      safety: {
        hasPain: !!allowed.hasPain,
        painLoweredCeiling: painLoweredCeiling,
        allowedGripCount: Object.keys(allowed.set).length,
      },
      resolution: {
        initialCeiling: initialCeiling,
        finalCeiling: ceiling,
        bucket: bucket,
        downgraded: downgraded,
        goalNatural: goal ? GOAL_NATURAL[goal] : null,
        slotsSource: slotsSource,
        slotsTemplate: slots.slice(),
        candidatePoolSize: progs.length
      },
      slots: [],
      dosing: [],
      volume: [],
      warmup: null,
      outputs: null,
      constants: {
        MVC_TARGET_PCT: Object.assign({}, MVC_TARGET_PCT),
        MVC_CEILING_PCT: MVC_CEILING_PCT,
        MAV_SETS_PER_GRIP: MAV_SETS_PER_GRIP,
        RECOVERY_TRIM: RECOVERY_TRIM,
        DANGER_BUDGET: Object.assign({}, DANGER_BUDGET)
      }
    };

    const ctx = { dangerSpent: 0, usedGripEdge: Object.create(null) };
    const picked = [];
    const includedTiers = Object.create(null);
    const sourceIds = Object.create(null);

    slots.forEach(function (slotRole) {
      const pool = poolForSlot(slotRole, progs, types, allowed.set);
      const slotEntry = {
        role: slotRole,
        roleLabel: ROLE_LABEL[slotRole] || slotRole,
        poolSize: pool.length,
        candidates: [],
        chosen: null,
        skipped: null
      };
      if (!pool.length) {
        slotEntry.skipped = 'нет программ под этот слот при выбранном оборудовании';
        traceObj.slots.push(slotEntry);
        return;
      }
      const choice = pickFromPool(pool, slotRole, bucket, ctx, slotEntry.candidates);
      if (!choice) {
        slotEntry.skipped = 'ни один кандидат не прошёл safety-фильтр (danger/pain)';
        traceObj.slots.push(slotEntry);
        return;
      }
      const key = choice.ex.gripId + '_' + choice.ex.edgeSizeMm;
      ctx.usedGripEdge[key] = true;
      const gm = gripMeta(choice.ex.gripId);
      const dangerCost = (gm && Number(gm.a2ForceRatio)) || 0;
      ctx.dangerSpent += dangerCost;
      includedTiers[choice.tier] = true;
      (choice.p.sourceIds || []).forEach(function (s) { sourceIds[s] = true; });
      slotEntry.chosen = {
        programId: choice.p.id,
        programName: choice.p.name,
        gripId: choice.ex.gripId,
        edgeMm: choice.ex.edgeSizeMm,
        tier: choice.tier,
        dangerCost: dangerCost,
        dangerSpentTotal: ctx.dangerSpent,
        catalogAddedKg: choice.ex.addedWeightKg,
        hangSec: choice.ex.hangSec,
        restSec: choice.ex.restSec,
        repsPerSet: choice.ex.repsPerSet,
        setsCount: choice.ex.setsCount,
        restBetweenSetsSec: choice.ex.restBetweenSetsSec
      };
      traceObj.slots.push(slotEntry);
      picked.push(Object.assign({}, choice.ex, {
        equipmentTier: choice.tier, __role: slotRole, __fromProgram: choice.p.id,
      }));
    });

    if (!picked.length) return null;

    // Phase 2a post-passes: сначала MVC-доза, потом объём.
    const finalEx = picked.map(function (ex) {
      const doseEntry = {
        gripId: ex.gripId, edgeMm: ex.edgeSizeMm, role: ex.__role,
        fromProgram: ex.__fromProgram
      };
      const dosed = doseExercise(ex, bucket, ageNum, doseEntry);
      traceObj.dosing.push(doseEntry);
      return dosed;
    });
    const volumedEx = applyVolume(finalEx, bucket, traceObj.volume);

    const hasAntagonist = volumedEx.some(function (e) { return e.__role === 'antagonist'; });
    const reason = buildReason(bucket, downgraded, volumedEx, hasAntagonist);
    const tierList = Object.keys(includedTiers);

    const requiresWarmup = volumedEx.some(function (e) {
      return e.__role === 'power' || e.__role === 'max-strength';
    });
    traceObj.warmup = {
      required: requiresWarmup,
      type: requiresWarmup ? 'ramp' : 'quick',
      reason: requiresWarmup
        ? 'в сессии есть power/max-strength слот — полный RAMP (15-20 мин)'
        : 'нет взрывных/максимальных слотов — короткая 5-8-минутная разминка'
    };
    const duration = totalDurationMin(volumedEx);
    const sessionInt = sessionIntensity(volumedEx);
    traceObj.outputs = {
      durationMin: duration,
      intensity: sessionInt,
      tierList: tierList,
      sourceIds: Object.keys(sourceIds),
      exerciseCount: volumedEx.length,
      hasAntagonist: hasAntagonist
    };

    return {
      id: 'mix_engine_' + Date.now(),
      __generated: true,
      __engine: 'mixEngine_v1',
      name: 'Микс-тренировка',
      description: reason,
      coachReason: reason,
      level: 'mixed',
      durationMin: duration,
      intensity: sessionInt,
      exercises: volumedEx,
      equipmentTypes: tierList,
      sourceIds: Object.keys(sourceIds),
      advisoryBadge: null,
      noEquipment: tierList.length === 1 && tierList[0] === 'none',
      minAge: 14,
      requiresWarmup: requiresWarmup,
      warmupType: requiresWarmup ? 'ramp' : 'quick',
      __trace: traceObj
    };
  }

  Fingers.mixEngine = {
    __registered: true,
    recommendDay: recommendDay,
    GOALS: GOALS, // для UI goal-селектора
    // exposed для тестов:
    _roleOf: roleOf,
    _slotTemplateFor: slotTemplateFor,
    _cappedGoalTemplate: cappedGoalTemplate,
    _SLOT_TEMPLATES: SLOT_TEMPLATES,
    _GOAL_TEMPLATES: GOAL_TEMPLATES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
