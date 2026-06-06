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
    max: ['max-strength', 'strength-endurance', 'antagonist'],
    moderate: ['strength-endurance', 'capacity', 'antagonist'],
    recovery: ['capacity', 'antagonist'],
  };
  // slotRole → какие protocol-роли его заполняют (с fallback'ами).
  const SLOT_ACCEPT = {
    'max-strength': { 'max-strength': true },
    'strength-endurance': { 'strength-endurance': true },
    'capacity': { 'capacity': true, 'connective': true, 'strength-endurance': true },
    'antagonist': { 'antagonist': true },
  };
  // Кумулятивный потолок суммы a2ForceRatio на сессию (защита от стэка нагрузки
  // на шкивы). Для текущих протоколов почти не срабатывает (нет fullcrimp/mono в
  // exercises), но удерживает инвариант при будущих протоколах.
  const DANGER_BUDGET = { recovery: 8, moderate: 24, max: 48 };

  const BUCKET_LABEL = {
    max: 'максимум', moderate: 'умеренный', recovery: 'восстановление',
  };
  const ROLE_LABEL = {
    'max-strength': 'макс. сила', 'strength-endurance': 'силовая выносливость',
    'capacity': 'аэробная ёмкость', 'antagonist': 'антагонист',
  };

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
  function pickFromPool(pool, slotRole, bucket, ctx) {
    let ordered = pool.slice();
    if (slotRole === 'max-strength') {
      // anchor: half-crimp первым.
      ordered.sort(function (a, b) {
        return (a.ex.gripId === 'halfcrimp' ? 0 : 1) - (b.ex.gripId === 'halfcrimp' ? 0 : 1);
      });
    }
    const budget = DANGER_BUDGET[bucket] != null ? DANGER_BUDGET[bucket] : 48;
    const banHighDanger = bucket === 'recovery';
    // Проход 1 — со всеми правилами (включая дедуп grip+edge).
    // Проход 2 — ослабляем дедуп, но НЕ ослабляем danger/pain (safety).
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < ordered.length; i++) {
        const c = ordered[i];
        const gm = gripMeta(c.ex.gripId);
        const danger = (gm && Number(gm.a2ForceRatio)) || 0;
        const dl = gm && gm.dangerLevel;
        if (banHighDanger && (dl === 'high' || dl === 'very-high')) continue;
        if (ctx.dangerSpent + danger > budget) continue;
        const key = c.ex.gripId + '_' + c.ex.edgeSizeMm;
        if (pass === 0 && ctx.usedGripEdge[key]) continue;
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

  function buildReason(bucket, goal, ceiling, picked, hasAntagonist) {
    const roles = picked.map(function (e) { return ROLE_LABEL[e.__role] || e.__role; });
    let head = 'Потолок дня — ' + (BUCKET_LABEL[bucket] || bucket) + '. ';
    if (goal && RANK[goal] != null && RANK[goal] > RANK[bucket]) {
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
    let ceiling = (o.readiness && READINESS_CEILING[o.readiness]) || 'max';
    const goal = (o.intensity && o.intensity !== 'all') ? o.intensity : null;

    const allowed = allowedGripIdSet(ageNum);
    // Боль в пальцах — жёсткий safety-кап: никакого max-слота (плюс painGate уже
    // убрал fullcrimp/mono из allowed). Опускаем потолок до moderate.
    if (allowed.hasPain && RANK[ceiling] > RANK.moderate) ceiling = 'moderate';

    // bucket = min(goal, ceiling). goal не задан → bucket = ceiling.
    let bucket = ceiling;
    if (goal && RANK[goal] != null && RANK[goal] < RANK[ceiling]) bucket = goal;

    const progs = candidatePrograms(ageNum, ceiling);
    if (!progs.length) return null;

    const slots = slotTemplateFor(bucket);
    const ctx = { dangerSpent: 0, usedGripEdge: Object.create(null) };
    const picked = [];
    const includedTiers = Object.create(null);
    const sourceIds = Object.create(null);

    slots.forEach(function (slotRole) {
      const pool = poolForSlot(slotRole, progs, types, allowed.set);
      if (!pool.length) return;
      const choice = pickFromPool(pool, slotRole, bucket, ctx);
      if (!choice) return;
      const key = choice.ex.gripId + '_' + choice.ex.edgeSizeMm;
      ctx.usedGripEdge[key] = true;
      const gm = gripMeta(choice.ex.gripId);
      ctx.dangerSpent += (gm && Number(gm.a2ForceRatio)) || 0;
      includedTiers[choice.tier] = true;
      (choice.p.sourceIds || []).forEach(function (s) { sourceIds[s] = true; });
      picked.push(Object.assign({}, choice.ex, {
        equipmentTier: choice.tier, __role: slotRole, __fromProgram: choice.p.id,
      }));
    });

    if (!picked.length) return null;

    const hasAntagonist = picked.some(function (e) { return e.__role === 'antagonist'; });
    const reason = buildReason(bucket, goal, ceiling, picked, hasAntagonist);
    const tierList = Object.keys(includedTiers);

    return {
      id: 'mix_engine_' + Date.now(),
      __generated: true,
      __engine: 'mixEngine_v1',
      name: 'Микс-тренировка',
      description: reason,
      coachReason: reason,
      level: 'mixed',
      durationMin: totalDurationMin(picked),
      intensity: bucket,
      exercises: picked,
      equipmentTypes: tierList,
      sourceIds: Object.keys(sourceIds),
      advisoryBadge: null,
      noEquipment: tierList.length === 1 && tierList[0] === 'none',
      minAge: 14,
    };
  }

  Fingers.mixEngine = {
    __registered: true,
    recommendDay: recommendDay,
    // exposed для тестов:
    _roleOf: roleOf,
    _slotTemplateFor: slotTemplateFor,
    _SLOT_TEMPLATES: SLOT_TEMPLATES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
