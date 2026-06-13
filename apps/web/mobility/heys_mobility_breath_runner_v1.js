// heys_mobility_breath_runner_v1.js — план дыхательных фаз для блока I.
//
// Без DOM/таймеров: только чистая материализация breath-атома в повторяемые фазы.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__breathRunnerRegistered) return;
  Mobility.__breathRunnerRegistered = true;

  function ratioOf(atom) {
    const d = (atom && atom.dose) || {};
    const r = d.ratio || {};
    return { in: Number(r.in) || 0, hold: Number(r.hold) || 0, out: Number(r.out) || 0 };
  }
  function phasesForPattern(pattern, ratio) {
    if (pattern === 'cyclic_sigh') {
      return [
        { type: 'inhale', label: 'вдох', durationSec: ratio.in || 2 },
        { type: 'exhale', label: 'длинный выдох', durationSec: ratio.out || 6 }
      ];
    }
    if (pattern === 'box') {
      return [
        { type: 'inhale', label: 'вдох', durationSec: ratio.in || 4 },
        { type: 'hold', label: 'пауза', durationSec: ratio.hold || 4 },
        { type: 'exhale', label: 'выдох', durationSec: ratio.out || 4 },
        { type: 'hold', label: 'пауза', durationSec: ratio.hold || 4 }
      ];
    }
    return [
      { type: 'inhale', label: 'вдох', durationSec: ratio.in || 5 },
      { type: 'exhale', label: 'выдох', durationSec: ratio.out || 5 }
    ];
  }
  function buildBreathPlan(atom) {
    if (!atom || atom.doseShape !== 'breath') {
      return { ok: false, error: 'not_breath_atom', atomId: atom && atom.id };
    }
    const dose = atom.dose || {};
    const pattern = dose.pattern || 'resonant';
    const phases = phasesForPattern(pattern, ratioOf(atom));
    const cycleSec = phases.reduce(function (sum, p) { return sum + p.durationSec; }, 0);
    const durationSec = Number(dose.durationSec) || cycleSec;
    return {
      ok: true,
      atomId: atom.id,
      pattern: pattern,
      durationSec: durationSec,
      cycleSec: cycleSec,
      cycles: cycleSec > 0 ? Math.max(1, Math.floor(durationSec / cycleSec)) : 1,
      phases: phases
    };
  }

  Mobility.breathRunner = {
    __registered: true,
    buildBreathPlan: buildBreathPlan,
    _phasesForPattern: phasesForPattern
  };
})(typeof window !== 'undefined' ? window : globalThis);
