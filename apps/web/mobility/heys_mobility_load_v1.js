// heys_mobility_load_v1.js — adaptive load scale for mobility routines.
//
// Shared data/API for UI, routine builder and runner. The UI selects one of
// five levels; builder prefers atoms near that level; runner materializes an
// exact dose for reps/sets/seconds.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__loadScaleRegistered) return;
  Mobility.__loadScaleRegistered = true;

  const LEVELS = [
    {
      value: 1,
      key: 'restore',
      label: 'Восстановление',
      shortLabel: 'Очень легко',
      tone: 'мягко',
      description: 'минимальная нагрузка, больше контроля и комфорта',
      repsMultiplier: 0.78,
      setsDelta: -1,
      durationMultiplier: 0.78,
      holdMultiplier: 0.82,
      restMultiplier: 1.25
    },
    {
      value: 2,
      key: 'easy',
      label: 'Лёгкая',
      shortLabel: 'Легко',
      tone: 'спокойно',
      description: 'безопасная база для нетренированного дня',
      repsMultiplier: 0.9,
      setsDelta: 0,
      durationMultiplier: 0.9,
      holdMultiplier: 0.92,
      restMultiplier: 1.12
    },
    {
      value: 3,
      key: 'base',
      label: 'База',
      shortLabel: 'База',
      tone: 'ровно',
      description: 'стандартная методологическая доза',
      repsMultiplier: 1,
      setsDelta: 0,
      durationMultiplier: 1,
      holdMultiplier: 1,
      restMultiplier: 1
    },
    {
      value: 4,
      key: 'strong',
      label: 'Сильная',
      shortLabel: 'Сложно',
      tone: 'плотно',
      description: 'больше подходов и более требовательные упражнения',
      repsMultiplier: 1.14,
      setsDelta: 1,
      durationMultiplier: 1.1,
      holdMultiplier: 1.12,
      restMultiplier: 0.95
    },
    {
      value: 5,
      key: 'athlete',
      label: 'Атлет',
      shortLabel: 'Тяжело',
      tone: 'атлетично',
      description: 'верхняя доза для подготовленного человека',
      repsMultiplier: 1.28,
      setsDelta: 1,
      durationMultiplier: 1.18,
      holdMultiplier: 1.2,
      restMultiplier: 0.9
    }
  ];

  function clampLevel(value) {
    const n = Math.round(Number(value));
    return Math.min(5, Math.max(1, Number.isFinite(n) ? n : 3));
  }
  function getLevel(value) {
    const normalized = clampLevel(value);
    return LEVELS[normalized - 1] || LEVELS[2];
  }
  function fromProfile(profile, options) {
    const opts = options || {};
    const src = opts.loadLevel != null ? opts.loadLevel
      : opts.trainingLoad != null ? opts.trainingLoad
      : profile && profile.loadLevel != null ? profile.loadLevel
      : profile && profile.trainingLoad != null ? profile.trainingLoad
      : 3;
    return clampLevel(src);
  }
  function loadClass(atom) {
    const raw = atom && (atom.difficulty != null ? atom.difficulty : atom.loadDifficulty);
    return clampLevel(raw == null ? 3 : raw);
  }
  function roundTo(value, step) {
    const n = Number(value);
    const s = step || 1;
    if (!Number.isFinite(n)) return value;
    return Math.max(s, Math.round(n / s) * s);
  }
  function scaleNumber(value, multiplier, options) {
    const opts = options || {};
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return value;
    const step = opts.step || 1;
    const min = opts.min == null ? step : opts.min;
    const max = opts.max == null ? Infinity : opts.max;
    return Math.min(max, Math.max(min, roundTo(raw * multiplier, step)));
  }
  function exactReps(reps, level, policy) {
    if (Array.isArray(reps) && reps.length) {
      const values = reps.map(function (v) { return Number(v); }).filter(function (v) { return Number.isFinite(v) && v > 0; });
      if (!values.length) return reps;
      const min = Math.min.apply(null, values);
      const max = Math.max.apply(null, values);
      const ratio = (clampLevel(level) - 1) / 4;
      return Math.max(1, Math.round(min + (max - min) * ratio));
    }
    return scaleNumber(reps, policy.repsMultiplier, { min: 1, step: 1 });
  }
  function tuneDose(atom, levelValue) {
    if (!atom || !atom.dose || typeof atom.dose !== 'object') return atom && atom.dose;
    const level = getLevel(levelValue);
    if (level.value === 3) {
      const base = Object.assign({}, atom.dose);
      if (Array.isArray(base.reps)) base.reps = exactReps(base.reps, level.value, level);
      return base;
    }
    const d = Object.assign({}, atom.dose);
    if (d.reps != null) d.reps = exactReps(d.reps, level.value, level);
    if (d.sets != null) d.sets = Math.min(4, Math.max(1, Math.round(Number(d.sets) + level.setsDelta)));
    if (d.holdSec != null) d.holdSec = scaleNumber(d.holdSec, level.holdMultiplier, { min: 8, step: 1, max: 180 });
    if (d.durationSec != null) d.durationSec = scaleNumber(d.durationSec, level.durationMultiplier, { min: 20, step: 5, max: 900 });
    if (d.restSec != null) d.restSec = Math.max(0, scaleNumber(d.restSec, level.restMultiplier, { min: 5, step: 5, max: 90 }));
    if (d.contractSec != null && atom.doseShape === 'pnf') d.contractSec = scaleNumber(d.contractSec, level.value >= 5 ? 1.1 : 1, { min: 4, step: 1, max: 8 });
    if (d.relaxSec != null && atom.doseShape === 'pnf') d.relaxSec = scaleNumber(d.relaxSec, level.value <= 2 ? 1.15 : 1, { min: 3, step: 1, max: 6 });
    return d;
  }
  function scoreBias(atom, levelValue) {
    const target = clampLevel(levelValue);
    const difficulty = loadClass(atom);
    const distance = Math.abs(difficulty - target);
    let score = -distance * 18;
    const min = atom && atom.minLoadLevel != null ? clampLevel(atom.minLoadLevel) : 1;
    const max = atom && atom.maxLoadLevel != null ? clampLevel(atom.maxLoadLevel) : 5;
    if (target < min) score -= (min - target) * 35;
    if (target > max) score -= (target - max) * 25;
    if (target <= 2 && atom && (atom.fatigueCost === 'high' || atom.tissueLoad === 'high')) score -= 60;
    if (target >= 4 && difficulty >= 4) score += 14;
    if (target >= 5 && atom && atom.doseShape === 'eccentric') score += 10;
    return score;
  }
  function hasPainFlag(flags) {
    return (Array.isArray(flags) ? flags : []).some(function (f) { return f && f.level === 'pain'; });
  }
  function recentFeedbackSignals(history) {
    const h = history || {};
    const feedback = Array.isArray(h.stepFeedback) ? h.stepFeedback.slice(-12) : [];
    const hard = feedback.filter(function (f) {
      return f && (f.effort === 'hard' || f.effort === 'too_hard' || f.technique === 'unstable');
    }).length;
    const easy = feedback.filter(function (f) { return f && f.effort === 'easy'; }).length;
    return { hard: hard, easy: easy, count: feedback.length };
  }
  function readinessBand(readiness) {
    if (!readiness) return null;
    if (typeof readiness === 'string') return readiness;
    return readiness.band || readiness.status || null;
  }
  function effectiveLevel(selectedLevel, readiness, painFlags, history, opts) {
    const selected = clampLevel(selectedLevel);
    const o = opts || {};
    let effective = selected;
    const reasons = [];
    const band = readinessBand(readiness);
    if (hasPainFlag(painFlags)) {
      effective = Math.min(effective, Math.max(1, selected - 2));
      reasons.push('effective_load_pain_downshift');
    }
    if (band === 'red') {
      effective = Math.min(effective, Math.max(1, selected - 2));
      reasons.push('effective_load_readiness_red');
    } else if (band === 'yellow') {
      effective = Math.min(effective, Math.max(1, selected - 1));
      reasons.push('effective_load_readiness_yellow');
    }
    if (o.phase === 'deload' || o.periodizationPhase === 'deload') {
      effective = Math.min(effective, Math.max(1, selected - 1));
      reasons.push('effective_load_deload');
    }
    const fb = recentFeedbackSignals(history);
    if (fb.hard >= 2) {
      effective = Math.min(effective, Math.max(1, selected - 1));
      reasons.push('effective_load_feedback_hard');
    }
    if (fb.easy >= 4 && !reasons.length) {
      effective = Math.min(5, selected + 1);
      reasons.push('effective_load_feedback_easy');
    }
    if (effective > selected && o.allowAutoIncrease !== true) {
      effective = selected;
      reasons.push('effective_load_increase_capped');
    }
    return {
      selectedLevel: selected,
      effectiveLevel: clampLevel(effective),
      reasons: reasons,
      readinessBand: band,
      feedback: fb
    };
  }

  Mobility.loadScale = {
    __registered: true,
    LEVELS: LEVELS,
    normalize: clampLevel,
    getLevel: getLevel,
    fromProfile: fromProfile,
    loadClass: loadClass,
    tuneDose: tuneDose,
    scoreBias: scoreBias,
    effectiveLevel: effectiveLevel,
    effectiveLoadLevel: effectiveLevel
  };
})(typeof window !== 'undefined' ? window : globalThis);
