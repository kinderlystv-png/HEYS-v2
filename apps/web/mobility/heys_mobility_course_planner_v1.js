// heys_mobility_course_planner_v1.js — slot-based course planner.
//
// A course stores qualities/slots, not a frozen exercise list. Daily sessions are
// materialized through routineBuilder so safety gates, equipment and readiness
// rules stay in one path.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__coursePlannerRegistered) return;
  Mobility.__coursePlannerRegistered = true;

  const DEFAULT_WEEKS = 4;
  const POSTURE_SLOT_ORDER = [
    'neck_control',
    'thoracic_mobility',
    'scapular_control',
    'hip_support',
    'spine_cars',
    'supported_downshift'
  ];
  const SLOT_LABELS = {
    neck_control: 'Шея: глубокий контроль',
    thoracic_mobility: 'Грудной отдел: движение',
    scapular_control: 'Лопатка: контроль',
    shoulder_extension: 'Плечо: доступ назад',
    anterior_chain_relief: 'Передняя линия: разгрузка',
    hip_support: 'Таз: опора',
    spine_cars: 'Позвоночник: CARs',
    soft_tissue: 'Мягкие ткани',
    supported_downshift: 'Снижение тонуса'
  };
  const PHASE_GOALS = {
    accumulation: 'техника и регулярность',
    intensification: 'контроль и рабочий объём',
    deload: 'разгрузка и качество',
    retest: 'ретест и обновление лимитера',
    maintenance: 'поддержание',
    taper: 'мягкое поддержание',
    dup: 'волнообразная нагрузка'
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj == null ? null : obj));
  }
  function nowDateKey() {
    const kd = HEYS.TrainingKernel && HEYS.TrainingKernel.dates;
    if (kd && typeof kd.todayKeyLocal === 'function') return kd.todayKeyLocal();
    return new Date().toISOString().slice(0, 10);
  }
  function id(prefix) {
    const kr = HEYS.TrainingKernel && HEYS.TrainingKernel.records;
    if (kr && typeof kr.makeId === 'function') return kr.makeId([prefix, Date.now()]);
    return prefix + '_' + Date.now();
  }
  function clampWeeks(value) {
    const n = Math.round(Number(value) || DEFAULT_WEEKS);
    return Math.max(1, Math.min(12, n));
  }
  function periodization() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.periodization;
  }
  function courseWeeks(opts) {
    const kp = periodization();
    const weeks = clampWeeks(opts && (opts.weeks || opts.weeksTotal));
    if (kp && typeof kp.buildWeeks === 'function') {
      return kp.buildWeeks({
        model: opts && opts.model || 'linear',
        weeks: weeks,
        focusQuality: opts && opts.focusQuality || 'posture'
      });
    }
    const out = [];
    for (let i = 0; i < weeks; i++) {
      out.push({
        weekIdx: i,
        week: i + 1,
        phase: i === weeks - 1 ? 'deload' : (i === weeks - 2 ? 'intensification' : 'accumulation'),
        volumeMultiplier: i === weeks - 1 ? 0.5 : (i === weeks - 2 ? 0.9 : 1)
      });
    }
    return out;
  }
  function currentWeek(course, todayKey) {
    const c = course || {};
    const kp = periodization();
    if (kp && typeof kp.current === 'function') {
      const cur = kp.current({
        model: c.model || 'linear',
        startedAt: c.startedAt,
        weeksTotal: c.weeksTotal || DEFAULT_WEEKS,
        focusQuality: c.focusQuality || c.goal || 'posture'
      }, todayKey || nowDateKey());
      if (cur) return cur;
    }
    return (Array.isArray(c.weeks) && c.weeks[0]) || null;
  }
  function modeSlots(modeId) {
    const mode = Mobility.modeEngine && Mobility.modeEngine.getMode
      ? Mobility.modeEngine.getMode(modeId || 'posture')
      : null;
    return mode && Array.isArray(mode.slots) ? mode.slots : [];
  }
  function slotScore(slot, audit, order) {
    const weights = audit && audit.blockWeights || {};
    const slotWeights = audit && audit.slotWeights || {};
    let score = order.indexOf(slot.id) >= 0 ? (100 - order.indexOf(slot.id) * 4) : 30;
    if (slotWeights[slot.id]) score += Number(slotWeights[slot.id]) * 70;
    if (weights[slot.id]) score += Number(weights[slot.id]) * 40;
    if (weights[slot.block]) score += Number(weights[slot.block]) * 20;
    const leading = audit && audit.leadingLimiter;
    if (leading && leading.jointRegion && String(slot.id).indexOf(leading.jointRegion) >= 0) score += 20;
    const postureLeading = audit && audit.leadingPostureLimiter;
    if (postureLeading && postureLeading.slotId === slot.id) score += 25;
    return score;
  }
  function buildSlots(opts) {
    const o = opts || {};
    const modeId = o.modeId || (o.goal === 'posture' ? 'posture' : 'posture');
    const audit = o.assessmentAudit || o.assessment || null;
    const order = modeId === 'posture' ? POSTURE_SLOT_ORDER : [];
    const slots = modeSlots(modeId)
      .filter(function (slot) { return !slot.optional || order.indexOf(slot.id) >= 0; })
      .map(function (slot) {
        return {
          id: slot.id,
          label: SLOT_LABELS[slot.id] || slot.id,
          block: slot.block,
          atomIds: Array.isArray(slot.atomIds) ? slot.atomIds.slice() : [],
          optional: !!slot.optional,
          priority: slotScore(slot, audit, order),
          progressionAxis: slot.id === 'scapular_control' || slot.id === 'neck_control' ? 'tempo' : 'amplitude'
        };
      })
      .sort(function (a, b) { return b.priority - a.priority || a.id.localeCompare(b.id); });
    return slots.length ? slots : order.map(function (slotId, idx) {
      return { id: slotId, label: SLOT_LABELS[slotId] || slotId, block: null, atomIds: [], optional: false, priority: 100 - idx * 4, progressionAxis: 'amplitude' };
    });
  }
  function buildCourse(opts) {
    const o = opts || {};
    const weeksTotal = clampWeeks(o.weeks || o.weeksTotal || DEFAULT_WEEKS);
    const goal = o.goal || 'posture';
    const modeId = o.modeId || (goal === 'posture' ? 'posture' : (o.modeId || 'posture'));
    const weeks = courseWeeks({
      weeks: weeksTotal,
      model: o.model || 'linear',
      focusQuality: goal
    }).map(function (week) {
      return Object.assign({}, week, {
        goal: PHASE_GOALS[week.phase] || 'плановая работа',
        slotIds: buildSlots(o).slice(0, week.phase === 'deload' ? 4 : 6).map(function (s) { return s.id; })
      });
    });
    return {
      version: 1,
      id: o.id || id('mob_course'),
      goal: goal,
      modeId: modeId,
      model: o.model || 'linear',
      startedAt: o.startedAt || nowDateKey(),
      weeksTotal: weeksTotal,
      loadLevel: o.loadLevel == null ? null : o.loadLevel,
      equipment: Array.isArray(o.equipment) ? o.equipment.slice() : [],
      focusQuality: goal,
      slots: buildSlots(o),
      weeks: weeks,
      substitutions: [],
      createdAt: new Date().toISOString()
    };
  }
  function slotAtomIds(course, week) {
    const c = course || {};
    const slotIds = week && Array.isArray(week.slotIds) ? week.slotIds : [];
    const slots = Array.isArray(c.slots) ? c.slots : [];
    return slots.filter(function (s) { return !slotIds.length || slotIds.indexOf(s.id) >= 0; })
      .reduce(function (out, slot) {
        (slot.atomIds || []).forEach(function (atomId) {
          if (out.indexOf(atomId) < 0) out.push(atomId);
        });
        return out;
      }, []);
  }
  function annotateSession(built, course, week) {
    if (!built || !built.session || !Array.isArray(built.session.blocks)) return built;
    const slots = Array.isArray(course.slots) ? course.slots : [];
    const byAtom = {};
    slots.forEach(function (slot) {
      (slot.atomIds || []).forEach(function (atomId) { byAtom[atomId] = slot.id; });
    });
    const next = clone(built);
    next.session.course = {
      id: course.id,
      goal: course.goal,
      week: week && week.week,
      weekIdx: week && week.weekIdx,
      phase: week && week.phase
    };
    next.session.blocks = next.session.blocks.map(function (block) {
      const atom = block.atoms && block.atoms[0];
      const slotId = byAtom[atom && atom.id] || block.id;
      return Object.assign({}, block, { slotId: slotId });
    });
    return next;
  }
  function buildDailySession(course, profile, context) {
    const c = course && course.version ? course : buildCourse(course || {});
    const ctx = context || {};
    const week = currentWeek(c, ctx.todayKey || ctx.dateKey);
    const preferredAtomIds = slotAtomIds(c, week);
    const options = Object.assign({}, ctx, {
      preferredAtomIds: preferredAtomIds,
      courseId: c.id,
      courseWeek: week && week.week,
      phase: ctx.phase || (week && week.phase === 'deload' ? 'deload' : null),
      loadLevel: ctx.loadLevel != null ? ctx.loadLevel : (c.loadLevel != null ? c.loadLevel : undefined)
    });
    const built = Mobility.routineBuilder && Mobility.routineBuilder.buildSession
      ? Mobility.routineBuilder.buildSession(c.modeId || 'posture', profile || {}, options)
      : null;
    return annotateSession(built, c, week);
  }
  function findAlternative(slot, currentAtomId, context) {
    const ids = (slot && Array.isArray(slot.atomIds) ? slot.atomIds : []).filter(function (id) { return id !== currentAtomId; });
    const cat = Mobility.atomCatalog;
    const validators = Mobility.validators;
    const profile = Object.assign({}, context && context.profile || {});
    if ((!Array.isArray(profile.equipment) || !profile.equipment.length) && context && Array.isArray(context.equipment)) {
      profile.equipment = context.equipment.slice();
    }
    const buildContext = context && context.buildContext || {};
    for (let i = 0; i < ids.length; i++) {
      const atom = cat && cat.getAtom ? cat.getAtom(ids[i]) : null;
      if (!atom) continue;
      const issues = validators && validators.runAtom ? validators.runAtom(atom, profile, buildContext) : [];
      if (!issues.some(function (issue) { return issue && (issue.level === 'error' || issue.code === 'E.equipment_missing'); })) return ids[i];
    }
    return ids[0] || null;
  }
  function replaceWithinSlot(course, slotId, currentAtomId, context) {
    const c = clone(course || buildCourse({}));
    const slots = Array.isArray(c.slots) ? c.slots : [];
    const slot = slots.find(function (s) { return s.id === slotId; });
    if (!slot) return { ok: false, code: 'course.slot_missing', course: c, replacementAtomId: null };
    const replacementAtomId = context && context.replacementAtomId || findAlternative(slot, currentAtomId, context || {});
    if (!replacementAtomId) return { ok: false, code: 'course.no_replacement', course: c, replacementAtomId: null };
    slot.atomIds = [replacementAtomId].concat(slot.atomIds.filter(function (id) { return id !== replacementAtomId && id !== currentAtomId; }));
    c.substitutions = (Array.isArray(c.substitutions) ? c.substitutions : []).concat([{
      slotId: slotId,
      fromAtomId: currentAtomId || null,
      toAtomId: replacementAtomId,
      reason: context && context.reason || 'manual_replace',
      savedAt: new Date().toISOString()
    }]);
    return { ok: true, code: 'course.replaced', course: c, replacementAtomId: replacementAtomId };
  }

  Mobility.coursePlanner = {
    __registered: true,
    DEFAULT_WEEKS: DEFAULT_WEEKS,
    SLOT_LABELS: SLOT_LABELS,
    buildCourse: buildCourse,
    currentWeek: currentWeek,
    buildDailySession: buildDailySession,
    replaceWithinSlot: replaceWithinSlot,
    _buildSlots: buildSlots
  };
})(typeof window !== 'undefined' ? window : globalThis);
