// heys_kernel_periodization_v1.js — ОБЩЕЕ ЯДРО: phase machine + load policy.
//
// Generic part: mesocycle phase selection, phase meta, energy focus, current week
// calculation, and simple phase→load policy. Domain modules keep model selection,
// templates, slots, and user-facing wording.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.periodization && TK.periodization.__registered) return; // idempotent

  const DEFAULT_WEEKS = 4;
  const PEAK_LOAD_WINDOW_HOURS = 48; // ключевая нагрузка ближе 48ч → держим maintain
  const PHASE_META = {
    accumulation: { ceiling: 'moderate', volumeMultiplier: 1.0 },
    intensification: { ceiling: 'max', volumeMultiplier: 0.9 },
    deload: { ceiling: 'recovery', volumeMultiplier: 0.5, isDeload: true },
    retest: { ceiling: 'max', volumeMultiplier: 0.4, retestDue: true },
    taper: { ceiling: 'max', volumeMultiplier: 0.45, taper: true },
    maintenance: { ceiling: 'moderate', volumeMultiplier: 0.5, maintenance: true },
    dup: { ceiling: 'max', volumeMultiplier: 0.85, dailyPattern: ['moderate', 'max', 'recovery'] }
  };

  function phaseForModel(model, weekIdx, weeksTotal) {
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

  function energyFocusForPhase(phase) {
    if (phase === 'accumulation') return 'aerobic';
    if (phase === 'intensification' || phase === 'taper') return 'phosphagen';
    if (phase === 'dup') return 'undulating';
    if (phase === 'maintenance') return 'maintain';
    return 'recovery';
  }

  function dates() {
    return TK.dates || null;
  }

  function daysBetween(startKey, todayKey) {
    const kd = dates();
    if (kd && typeof kd.daysBetweenDateKeys === 'function') return kd.daysBetweenDateKeys(startKey, todayKey);
    const a = Date.parse(String(startKey || '') + 'T00:00:00');
    const b = Date.parse(String(todayKey || '') + 'T00:00:00');
    if (!isFinite(a) || !isFinite(b)) return 0;
    return Math.max(0, Math.floor((b - a) / (24 * 60 * 60 * 1000)));
  }

  function todayKeyLocal(now) {
    const kd = dates();
    if (kd && typeof kd.todayKeyLocal === 'function') return kd.todayKeyLocal(now);
    const d = now ? new Date(now) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function buildWeeks(input) {
    const o = input || {};
    const model = o.model || 'linear';
    const weeks = Math.max(1, Math.min(12, Number(o.weeks) || Number(o.weeksTotal) || DEFAULT_WEEKS));
    const focusQuality = o.focusQuality || null;
    const out = [];
    for (let i = 0; i < weeks; i++) {
      const phase = phaseForModel(model, i, weeks);
      out.push(Object.assign({
        weekIdx: i,
        week: i + 1,
        phase: phase,
        focusQuality: focusQuality,
        energyFocus: energyFocusForPhase(phase)
      }, PHASE_META[phase] || PHASE_META.accumulation));
    }
    return out;
  }

  function current(plan, todayKey) {
    const p = plan || {};
    if (!p.startedAt) return null;
    const total = p.weeksTotal || p.weeks || DEFAULT_WEEKS;
    const weekIdx = Math.floor(daysBetween(p.startedAt, todayKey || todayKeyLocal()) / 7);
    const phase = phaseForModel(p.model || 'linear', weekIdx, total);
    const meta = PHASE_META[phase] || PHASE_META.accumulation;
    return Object.assign({
      weekIdx: weekIdx,
      week: weekIdx + 1,
      weeksTotal: total,
      phase: phase,
      model: p.model || 'linear',
      complete: weekIdx >= total,
      focusQuality: p.focusQuality || null,
      energyFocus: energyFocusForPhase(phase)
    }, meta);
  }

  function loadPolicy(input, messages) {
    const o = input || {};
    const msg = messages || {};
    // ВАЖНО: явная проверка типа — иначе null/undefined приводятся к 0 и
    // 0 <= 48 ложно триггерит maintain (баг при keyLoadWithinHours: null из props).
    const keyLoadSoon = typeof o.keyLoadWithinHours === 'number'
      && isFinite(o.keyLoadWithinHours)
      && o.keyLoadWithinHours <= PEAK_LOAD_WINDOW_HOURS;
    if (o.phase === 'peak' || keyLoadSoon) {
      return {
        focus: 'maintain',
        avoidHighTissueLoad: true,
        msg: msg.maintain || 'maintain before peak/key load'
      };
    }
    if (o.phase === 'deload') {
      return {
        focus: 'deload',
        avoidHighTissueLoad: true,
        msg: msg.deload || 'deload: reduce load'
      };
    }
    return {
      focus: 'develop',
      avoidHighTissueLoad: false,
      msg: msg.develop || 'base phase: development allowed'
    };
  }

  TK.periodization = {
    __registered: true,
    DEFAULT_WEEKS: DEFAULT_WEEKS,
    PHASE_META: PHASE_META,
    phaseForModel: phaseForModel,
    energyFocusForPhase: energyFocusForPhase,
    buildWeeks: buildWeeks,
    current: current,
    loadPolicy: loadPolicy
  };
})(typeof window !== 'undefined' ? window : globalThis);
