// heys_mobility_assessment_v1.js — ROM-скрины и аудит лимитера.
//
// Не медицинская диагностика: нормы — референс для приоритизации блоков и ретеста.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__assessmentRegistered) return;
  Mobility.__assessmentRegistered = true;

  const TESTS = {
    ankle_dorsiflexion: { id: 'ankle_dorsiflexion', jointRegion: 'ankle', norm: 20, unit: 'deg', mobilityJoint: true },
    knee_to_wall_cm: { id: 'knee_to_wall_cm', jointRegion: 'ankle', norm: 10, unit: 'cm', mobilityJoint: true },
    hip_flexion: { id: 'hip_flexion', jointRegion: 'hip', norm: 120, unit: 'deg', mobilityJoint: true },
    hip_extension_thomas: { id: 'hip_extension_thomas', jointRegion: 'hip', norm: 20, unit: 'deg', mobilityJoint: true },
    hamstring_slr: { id: 'hamstring_slr', jointRegion: 'hip', norm: 75, unit: 'deg', mobilityJoint: true },
    thoracic_rotation: { id: 'thoracic_rotation', jointRegion: 'thoracic', norm: 35, unit: 'deg', mobilityJoint: true },
    shoulder_flexion: { id: 'shoulder_flexion', jointRegion: 'shoulder', norm: 180, unit: 'deg', mobilityJoint: true },
    shoulder_er: { id: 'shoulder_er', jointRegion: 'shoulder', norm: 90, unit: 'deg', mobilityJoint: true },
    knee_flexion: { id: 'knee_flexion', jointRegion: 'knee', norm: 135, unit: 'deg', mobilityJoint: false }
  };
  const TEST_IDS = Object.keys(TESTS);

  function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function scoreMeasurement(input) {
    const item = input || {};
    const test = TESTS[item.testId];
    if (!test) return { ok: false, code: 'assessment.unknown_test', testId: item.testId };
    const measure = num(item.measure);
    if (measure === null) return { ok: false, code: 'assessment.measure_missing', testId: item.testId };
    const norm = num(item.norm) || test.norm;
    // формула дефицита — из ОБЩЕГО ЯДРА (HEYS.TrainingKernel.assess); фолбэк локальный
    const ka = HEYS.TrainingKernel && HEYS.TrainingKernel.assess;
    const deficit = ka && ka.deficit ? ka.deficit(norm, measure) : clamp((norm - measure) / norm, 0, 1);
    const passiveROM = num(item.passiveROM);
    const activeROM = num(item.activeROM);
    const gap = passiveROM !== null && activeROM !== null ? Math.max(0, passiveROM - activeROM) : null;
    return {
      ok: true,
      testId: test.id,
      jointRegion: item.jointRegion || test.jointRegion,
      measure: measure,
      norm: norm,
      unit: test.unit,
      deficit: deficit,
      activePassiveGap: gap,
      mobilityJoint: test.mobilityJoint
    };
  }
  function classifyLimiter(scored) {
    if (!scored || scored.ok !== true) return { type: 'unknown', priority: 0 };
    const gap = scored.activePassiveGap;
    if (scored.deficit >= 0.18) {
      return { type: 'ceiling', priority: scored.deficit, blocks: ['D', 'E', 'F'], reason: 'пассивный потолок ниже нормы' };
    }
    if (gap !== null && gap >= 12) {
      return { type: 'control', priority: clamp(gap / 45, 0, 1), blocks: ['F', 'G'], reason: 'пассивный диапазон есть, активного контроля мало' };
    }
    if (!scored.mobilityJoint && scored.deficit >= 0.12) {
      return { type: 'strength_or_technique', priority: scored.deficit * 0.5, blocks: [], reason: 'вероятнее сила/техника вне основного scope мобильности' };
    }
    return { type: 'ok', priority: 0, blocks: [], reason: 'значимого лимитера не видно' };
  }
  function limiterAudit(screens) {
    const rows = (Array.isArray(screens) ? screens : []).map(function (s) {
      const scored = scoreMeasurement(s);
      const limiter = classifyLimiter(scored);
      return Object.assign({}, scored, { limiter: limiter });
    });
    const valid = rows.filter(function (r) { return r.ok; });
    const ka = HEYS.TrainingKernel && HEYS.TrainingKernel.assess;
    const kResult = ka && typeof ka.limiter === 'function'
      ? ka.limiter(valid.map(function (row) {
        return {
          id: row.testId,
          score: row.limiter.priority,
          deficit: row.deficit,
          prior: 1,
          row: row
        };
      }), {
        blockWeights: function (_items, leadingItem) {
          const leadingRow = leadingItem && (leadingItem.payload || leadingItem.raw.row);
          const weights = {};
          if (leadingRow && leadingRow.limiter && Array.isArray(leadingRow.limiter.blocks)) {
            leadingRow.limiter.blocks.forEach(function (b, idx) { weights[b] = Math.max(0.4, 1 - idx * 0.15); });
          }
          return weights;
        }
      })
      : null;
    const leading = kResult && kResult.leading ? (kResult.leading.payload || kResult.leading.raw.row) : (
      valid.slice().sort(function (a, b) { return b.limiter.priority - a.limiter.priority; })[0] || null
    );
    const blockWeights = kResult ? kResult.blockWeights : {};
    if (!kResult && leading && leading.limiter.blocks) {
      leading.limiter.blocks.forEach(function (b, idx) { blockWeights[b] = Math.max(0.4, 1 - idx * 0.15); });
    }
    return {
      rows: rows,
      leadingLimiter: leading ? {
        testId: leading.testId,
        jointRegion: leading.jointRegion,
        type: leading.limiter.type,
        priority: leading.limiter.priority,
        reason: leading.limiter.reason
      } : null,
      blockWeights: blockWeights
    };
  }
  function retestDue(lastTestDate, nowDate, intervalWeeks) {
    if (!lastTestDate) return true;
    const last = new Date(lastTestDate).getTime();
    const now = nowDate ? new Date(nowDate).getTime() : Date.now();
    if (!isFinite(last) || !isFinite(now)) return true;
    const weeks = intervalWeeks || 6;
    return now - last >= weeks * 7 * 24 * 60 * 60 * 1000;
  }

  Mobility.assessment = {
    __registered: true,
    TESTS: TESTS,
    TEST_IDS: TEST_IDS,
    scoreMeasurement: scoreMeasurement,
    classifyLimiter: classifyLimiter,
    limiterAudit: limiterAudit,
    retestDue: retestDue
  };
})(typeof window !== 'undefined' ? window : globalThis);
