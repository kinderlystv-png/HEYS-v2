// heys_fingers_periodization_engine_v1.js — meso/macro planning context.
//
// Public API:
//   HEYS.Fingers.periodization.buildPlan(opts)
//   HEYS.Fingers.periodization.current(plan?, todayKey?)
//   HEYS.Fingers.periodization.savePlan(plan) / loadPlan() / clearPlan()
//
// Storage:
//   heys_<cid>_fingers_periodization_v1 (anonymous: heys_fingers_periodization_v1)

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__periodizationRegistered) return;
  Fingers.__periodizationRegistered = true;

  const DEFAULT_WEEKS = 4;
  const PHASE_META = {
    accumulation: { ceiling: 'moderate', volumeMultiplier: 1.0 },
    intensification: { ceiling: 'max', volumeMultiplier: 0.9 },
    deload: { ceiling: 'recovery', volumeMultiplier: 0.5, isDeload: true },
    retest: { ceiling: 'max', volumeMultiplier: 0.4, retestDue: true },
    taper: { ceiling: 'max', volumeMultiplier: 0.45, taper: true },
    maintenance: { ceiling: 'moderate', volumeMultiplier: 0.5, maintenance: true },
    dup: { ceiling: 'max', volumeMultiplier: 0.85, dailyPattern: ['moderate', 'max', 'recovery'] }
  };

  function _getKey() {
    const cid = HEYS && HEYS.currentClientId;
    return cid ? 'heys_' + cid + '_fingers_periodization_v1' : 'heys_fingers_periodization_v1';
  }

  function _todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function _daysBetween(startKey, todayKey) {
    const a = Date.parse(startKey + 'T00:00:00');
    const b = Date.parse(todayKey + 'T00:00:00');
    if (!isFinite(a) || !isFinite(b)) return 0;
    return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
  }

  function _phaseForModel(model, weekIdx, weeksTotal) {
    const w = Number(weekIdx);
    const total = Number(weeksTotal) || DEFAULT_WEEKS;
    if (!Number.isFinite(w) || w < 0) return 'accumulation';
    if (w >= total) return 'retest';
    if (model === 'maintenance') return 'maintenance';
    if (model === 'taper') return w >= total - 1 ? 'taper' : 'intensification';
    if (model === 'dup') return w === total - 1 ? 'deload' : 'dup';
    if (model === 'nonlinear') return w === total - 1 ? 'deload' : (w % 2 === 0 ? 'accumulation' : 'intensification');
    if (w === total - 1) return 'deload';
    if (w === total - 2) return 'intensification';
    return 'accumulation';
  }

  function _energyFocusForPhase(phase) {
    if (phase === 'accumulation') return 'aerobic';
    if (phase === 'intensification' || phase === 'taper') return 'phosphagen';
    if (phase === 'dup') return 'undulating';
    if (phase === 'maintenance') return 'maintain';
    return 'recovery';
  }

  // selectModel — авто-выбор модели периодизации (METHODOLOGY §6.4): формат-цели
  // + ведущий лимитер (8.3). Инвариант: лимитер первичен. Возврат {model,
  // periodize, reason}; periodize:false → новичок/навыковый лимитер (тяжёлую
  // периодизацию не гнать). Все возвращаемые модели клампят нагрузку безопасно.
  function selectModel(input) {
    const o = input || {};
    const level = o.level || 'beginner';
    const limiter = o.leadingLimiter || o.focusQuality || null;
    const hasGoalDate = !!o.goalDate;
    const spw = Number(o.sessionsPerWeek) || 0;
    const onSeason = o.onSeason === true || o.season === 'on';

    if (level === 'beginner') {
      return { model: 'maintenance', periodize: false, reason: 'новичок: объём+база+техника, без периодизации' };
    }
    if (limiter === 'technique' || limiter === 'mental') {
      return { model: 'maintenance', periodize: false, reason: 'лимитер=' + limiter + ': навык первичен, силовое поддерживающее' };
    }
    if (hasGoalDate) {
      return { model: 'linear', periodize: true, reason: 'дата-цель → линейная (Anderson) к пику' };
    }
    if (limiter === 'finger_strength' || limiter === 'max_strength') {
      return { model: 'linear', periodize: true, reason: 'лимитер=сила пальцев → силовой мезо (линейная)' };
    }
    if (limiter === 'anaerobic_capacity' || limiter === 'aerobic_base') {
      return { model: 'nonlinear', periodize: true, reason: 'лимитер=энергосистема → нелинейная' };
    }
    if (spw >= 3 && onSeason) {
      return { model: 'dup', periodize: true, reason: '3+ сессий/нед on-season → DUP (Hörst)' };
    }
    return { model: 'nonlinear', periodize: true, reason: 'круглый год → нелинейная (Bechtel, по умолчанию)' };
  }

  function buildPlan(opts) {
    const o = opts || {};
    const focusQuality = o.focusQuality ||
      (o.assessment && o.assessment.leadingLimiter) ||
      (o.assessmentResult && o.assessmentResult.leadingLimiter) ||
      null;
    const explicitModel = ['linear', 'nonlinear', 'dup', 'taper', 'maintenance'].indexOf(o.model) >= 0
      ? o.model : null;
    const auto = explicitModel ? null : selectModel({
      level: o.level, leadingLimiter: focusQuality, goalDate: o.goalDate,
      sessionsPerWeek: o.sessionsPerWeek, onSeason: o.onSeason, season: o.season
    });
    const model = explicitModel || (auto && auto.model) || 'linear';
    const weeks = Math.max(1, Math.min(12, Number(o.weeks) || DEFAULT_WEEKS));
    const startedAt = o.startedAt || _todayKey();
    const planWeeks = [];
    for (let i = 0; i < weeks; i++) {
      const phase = _phaseForModel(model, i, weeks);
      planWeeks.push(Object.assign({
        weekIdx: i,
        week: i + 1,
        phase: phase,
        focusQuality: focusQuality,
        energyFocus: _energyFocusForPhase(phase)
      }, PHASE_META[phase] || PHASE_META.accumulation));
    }
    return {
      version: 1,
      model: model,
      startedAt: startedAt,
      weeksTotal: weeks,
      focusQuality: focusQuality,
      goalDate: o.goalDate || null,
      modelAutoSelected: !explicitModel,
      modelReason: auto ? auto.reason : ('явная модель: ' + model),
      weeks: planWeeks
    };
  }

  function current(plan, todayKey) {
    const p = plan || loadPlan();
    if (!p || !p.startedAt) return null;
    const days = _daysBetween(p.startedAt, todayKey || _todayKey());
    const weekIdx = Math.floor(days / 7);
    const phase = _phaseForModel(p.model, weekIdx, p.weeksTotal || p.weeks || DEFAULT_WEEKS);
    const meta = PHASE_META[phase] || PHASE_META.accumulation;
    return Object.assign({
      weekIdx: weekIdx,
      week: weekIdx + 1,
      weeksTotal: p.weeksTotal || p.weeks || DEFAULT_WEEKS,
      phase: phase,
      model: p.model || 'linear',
      complete: weekIdx >= (p.weeksTotal || p.weeks || DEFAULT_WEEKS),
      focusQuality: p.focusQuality || null,
      energyFocus: _energyFocusForPhase(phase)
    }, meta);
  }

  function savePlan(plan) {
    try {
      const u = HEYS.utils;
      if (u && typeof u.lsSet === 'function') {
        u.lsSet(_getKey(), plan || null);
        return true;
      }
      localStorage.setItem(_getKey(), JSON.stringify(plan || null));
      return true;
    } catch (_) { return false; }
  }

  function loadPlan() {
    try {
      const u = HEYS.utils;
      if (u && typeof u.lsGet === 'function') return u.lsGet(_getKey(), null);
      const raw = localStorage.getItem(_getKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function clearPlan() {
    try {
      const u = HEYS.utils;
      if (u && typeof u.lsSet === 'function') {
        u.lsSet(_getKey(), null);
        return true;
      }
      localStorage.removeItem(_getKey());
      return true;
    } catch (_) { return false; }
  }

  Fingers.periodization = {
    buildPlan: buildPlan,
    selectModel: selectModel,
    current: current,
    savePlan: savePlan,
    loadPlan: loadPlan,
    clearPlan: clearPlan,
    phaseForModel: _phaseForModel,
    energyFocusForPhase: _energyFocusForPhase,
    PHASE_META: PHASE_META,
    __registered: true
  };
})(typeof window !== 'undefined' ? window : globalThis);
