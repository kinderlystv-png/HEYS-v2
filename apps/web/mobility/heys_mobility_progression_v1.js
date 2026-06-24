// heys_mobility_progression_v1.js — безопасные подсказки прогрессии ROM.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__progressionRegistered) return;
  Mobility.__progressionRegistered = true;

  const AXIS_ORDER = ['amplitude', 'tempo', 'load', 'endrange'];
  function recordsKernel() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.records;
  }
  function progressionKernel() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.progression;
  }
  function targetReps(reps, fallback) {
    if (Array.isArray(reps) && reps.length) {
      const values = reps.map(function (v) { return Number(v); }).filter(function (v) { return isFinite(v) && v > 0; });
      if (values.length) return Math.round(values.reduce(function (sum, v) { return sum + v; }, 0) / values.length);
    }
    const n = Number(reps);
    return isFinite(n) && n > 0 ? n : (fallback || 1);
  }

  function hasPain(history) {
    return (history && Array.isArray(history.painFlags) ? history.painFlags : []).some(function (f) { return f && f.level === 'pain'; });
  }
  function isPlateau(history) {
    const vals = history && Array.isArray(history.romValues) ? history.romValues : [];
    const kp = progressionKernel();
    if (kp && kp.rangePlateau) return kp.rangePlateau(vals, { windowSize: 3, rangeThreshold: 2 }).hasPlateau;
    if (vals.length < 3) return false;
    const last = vals.slice(-3);
    return Math.max.apply(null, last) - Math.min.apply(null, last) < 2;
  }
  function weeklyHoldVolumeSec(records, atomId) {
    const sessions = records && Array.isArray(records.sessions) ? records.sessions : [];
    return sessions.reduce(function (sum, s) {
      const blocks = s.session && Array.isArray(s.session.blocks) ? s.session.blocks : [];
      blocks.forEach(function (b) {
        (Array.isArray(b.atoms) ? b.atoms : []).forEach(function (a) {
          if (a.id === atomId && a.doseShape === 'hold') {
            const d = a.dose || {};
            sum += (Number(d.holdSec) || 0) * targetReps(d.reps, 1) * (Number(d.sets) || 1);
          }
        });
      });
      return sum;
    }, 0);
  }
  function assessmentSavedAt(item) {
    return item && (item.savedAt || item.date || item.createdAt || null);
  }
  function rowFromAssessment(item) {
    const audit = item && (item.audit || item);
    return audit && Array.isArray(audit.rows) ? audit.rows : [];
  }
  function romSeries(records, testId) {
    const assessments = records && Array.isArray(records.assessments) ? records.assessments : [];
    const rows = assessments.reduce(function (out, item) {
      rowFromAssessment(item).forEach(function (row) {
        if (!row || row.ok !== true) return;
        if (testId && row.testId !== testId) return;
        const measure = Number(row.measure);
        if (!isFinite(measure)) return;
        out.push({
          testId: row.testId,
          jointRegion: row.jointRegion || null,
          measure: measure,
          norm: Number(row.norm) || null,
          unit: row.unit || '',
          deficit: Number(row.deficit) || 0,
          savedAt: assessmentSavedAt(item)
        });
      });
      return out;
    }, []);
    const kr = recordsKernel();
    return kr && kr.sortByTimestamp
      ? kr.sortByTimestamp(rows, { timestampKey: 'savedAt' })
      : rows.sort(function (a, b) {
        const ta = a.savedAt ? new Date(a.savedAt).getTime() : 0;
        const tb = b.savedAt ? new Date(b.savedAt).getTime() : 0;
        return ta - tb;
      });
  }
  function romTrend(records, testId) {
    const series = romSeries(records, testId);
    if (!series.length) return { ok: false, code: 'progress.no_rom_history', series: [] };
    const first = series[0];
    const last = series[series.length - 1];
    const delta = last.measure - first.measure;
    return {
      ok: true,
      testId: last.testId,
      jointRegion: last.jointRegion,
      unit: last.unit,
      first: first.measure,
      latest: last.measure,
      delta: delta,
      direction: delta > 1 ? 'improving' : delta < -1 ? 'declining' : 'flat',
      series: series
    };
  }
  function suggest(atom, history, readiness) {
    if (!atom) return { action: 'none', reason: 'no_atom' };
    if (hasPain(history) || (readiness && readiness.band === 'red')) {
      return { action: 'regress', axis: 'intensity', reason: 'pain_or_low_readiness' };
    }
    if (isPlateau(history)) {
      const current = history.progressionAxis || 'amplitude';
      const kp = progressionKernel();
      const axis = kp && kp.nextAxis ? kp.nextAxis(AXIS_ORDER, current) : null;
      const idx = AXIS_ORDER.indexOf(current);
      const next = axis && axis.nextAxis ? axis.nextAxis : AXIS_ORDER[Math.min(AXIS_ORDER.length - 1, idx + 1)];
      return { action: 'switch_axis', axis: next, reason: 'plateau_detected' };
    }
    if (atom.doseConfidence === 'C') {
      return { action: 'hold', axis: history && history.progressionAxis || 'amplitude', reason: 'low_dose_confidence' };
    }
    return { action: 'hold_default', axis: history && history.progressionAxis || 'amplitude', reason: 'minimum_effective_dose_first' };
  }

  Mobility.progression = {
    __registered: true,
    AXIS_ORDER: AXIS_ORDER,
    suggest: suggest,
    isPlateau: isPlateau,
    weeklyHoldVolumeSec: weeklyHoldVolumeSec,
    romSeries: romSeries,
    romTrend: romTrend
  };
})(typeof window !== 'undefined' ? window : globalThis);
