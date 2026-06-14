// heys_kernel_runner_v1.js — ОБЩЕЕ ЯДРО: runner lifecycle primitives.
//
// This is the small domain-agnostic lifecycle for linear step plans plus shared
// owner-lock helpers for active runners. Rich domain players (fingers countdown,
// breathing pacer, snapshots, cues) stay in domain modules until their shared
// contract is explicit.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.runner && TK.runner.__registered) return; // idempotent

  function totalStepsOf(plan) {
    return (plan && plan.steps && plan.steps.length) || 0;
  }

  function createLinearState(plan, over) {
    return Object.assign({
      status: 'idle',
      index: 0,
      totalSteps: totalStepsOf(plan),
      aborted: false
    }, over || {});
  }

  function transitionLinear(state, event) {
    const s = Object.assign({}, state || createLinearState());
    const total = Math.max(0, Number(s.totalSteps) || 0);
    if (event === 'start') s.status = 'running';
    if (event === 'pause' && s.status === 'running') s.status = 'paused';
    if (event === 'resume' && s.status === 'paused') s.status = 'running';
    if (event === 'next') s.index = Math.min((Number(s.index) || 0) + 1, Math.max(0, total - 1));
    if (event === 'prev') s.index = Math.max((Number(s.index) || 0) - 1, 0);
    if (event === 'complete') s.status = 'complete';
    if (event === 'abort') {
      s.status = 'aborted';
      s.aborted = true;
    }
    return s;
  }

  function phaseDurationSec(phases) {
    return (Array.isArray(phases) ? phases : []).reduce(function (sum, phase) {
      return sum + (Number(phase && phase.durationSec) || 0);
    }, 0);
  }

  function buildCyclicPhasePlan(phases, opts) {
    const o = opts || {};
    const list = (Array.isArray(phases) ? phases : []).map(function (phase) {
      return Object.assign({}, phase || {});
    });
    const cycleSec = phaseDurationSec(list);
    const durationSec = Number(o.durationSec) || cycleSec;
    const minCycles = Math.max(1, Number(o.minCycles) || 1);
    const cycles = cycleSec > 0 ? Math.max(minCycles, Math.floor(durationSec / cycleSec)) : minCycles;
    return Object.assign({
      ok: true,
      durationSec: durationSec,
      cycleSec: cycleSec,
      cycles: cycles,
      phases: list
    }, o.meta || {});
  }

  function remainingSecFromSnapshot(snapshot, opts) {
    const snap = snapshot || {};
    const o = opts || {};
    const nowMs = typeof o.nowMs === 'number' ? o.nowMs : Date.now();
    const startedAt = Number(snap.phaseStartedAt) || nowMs;
    const durationSec = Number(snap.durationSec) || 0;
    const minSec = typeof o.minSec === 'number' ? o.minSec : 0.5;
    const remainingSec = durationSec - ((nowMs - startedAt) / 1000);
    return remainingSec >= minSec ? Math.ceil(remainingSec) : minSec;
  }

  function estimateStepsDurationSec(steps, opts) {
    const o = opts || {};
    const durationKey = o.durationKey || 'durationSec';
    const multiplier = typeof o.multiplier === 'function'
      ? o.multiplier
      : function (step) { return Number(step && step.sets) || 1; };
    return (Array.isArray(steps) ? steps : []).reduce(function (sum, step, index) {
      const duration = Number(step && step[durationKey]) || 0;
      const mult = Number(multiplier(step, index)) || 1;
      return sum + (duration * mult);
    }, 0);
  }

  function num(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : (fallback || 0);
  }

  function avg(value, fallback) {
    if (Array.isArray(value) && value.length) {
      const values = value.map(function (v) { return Number(v); }).filter(function (v) { return isFinite(v); });
      if (values.length) return values.reduce(function (sum, v) { return sum + v; }, 0) / values.length;
    }
    const n = Number(value);
    return isFinite(n) && n > 0 ? n : (fallback || 0);
  }

  function estimateDoseSec(atom, formulas, opts) {
    const o = opts || {};
    const shape = atom && atom.doseShape;
    const dose = (atom && atom.dose) || {};
    const fn = formulas && formulas[shape];
    if (typeof fn !== 'function') return Number(o.defaultSec) || 0;
    const out = fn({
      atom: atom,
      dose: dose,
      num: num,
      avg: avg,
      max: Math.max
    });
    return Number(out) || 0;
  }

  function metricNumber(value) {
    const n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function normalizeDoseMetrics(out, fallbackShape) {
    const m = out && typeof out === 'object' ? out : {};
    return Object.assign({}, m, {
      shape: m.shape || fallbackShape || 'default',
      durationSec: metricNumber(m.durationSec),
      workSec: metricNumber(m.workSec),
      units: metricNumber(m.units),
      unitKind: m.unitKind || 'units'
    });
  }

  function estimateDoseMetrics(atom, formulas, opts) {
    const o = opts || {};
    const shape = (atom && atom.doseShape) || o.defaultShape || 'default';
    const dose = (atom && atom.dose) || {};
    const fn = formulas && (formulas[shape] || formulas.default);
    if (typeof fn !== 'function') {
      return normalizeDoseMetrics(o.defaultMetrics, shape);
    }
    return normalizeDoseMetrics(fn({
      atom: atom,
      exercise: atom,
      dose: dose,
      shape: shape,
      num: num,
      avg: avg,
      max: Math.max
    }), shape);
  }

  function scaleMetrics(metrics, ratio) {
    const m = normalizeDoseMetrics(metrics, metrics && metrics.shape);
    const r = Math.max(0, Number(ratio) || 0);
    return Object.assign({}, metrics || {}, {
      shape: m.shape,
      durationSec: m.durationSec * r,
      workSec: m.workSec * r,
      units: m.units * r,
      unitKind: m.unitKind
    });
  }

  function summarizeMetrics(items, metricFn) {
    const out = {
      durationSec: 0,
      workSec: 0,
      units: 0,
      unitKind: null,
      shapeCounts: {},
      mixedUnits: false
    };
    const fn = typeof metricFn === 'function' ? metricFn : function (item) { return item; };
    (Array.isArray(items) ? items : []).forEach(function (item, index) {
      const m = normalizeDoseMetrics(fn(item, index), item && item.shape);
      out.durationSec += m.durationSec || 0;
      out.workSec += m.workSec || 0;
      out.units += m.units || 0;
      out.shapeCounts[m.shape] = (out.shapeCounts[m.shape] || 0) + 1;
      if (!out.unitKind) out.unitKind = m.unitKind;
      else if (out.unitKind !== m.unitKind) out.mixedUnits = true;
    });
    return out;
  }

  function createRunPlan(session, steps, opts) {
    const o = opts || {};
    const list = Array.isArray(steps) ? steps.slice() : [];
    return {
      sessionMode: session && session.mode,
      totalSteps: list.length,
      steps: list,
      estimatedDurationSec: estimateStepsDurationSec(list, o)
    };
  }

  function readLock(storage, key) {
    if (!storage || typeof storage.getItem !== 'function' || !key) return null;
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function writeLock(storage, key, lock) {
    if (!storage || typeof storage.setItem !== 'function' || !key) return false;
    try {
      storage.setItem(key, JSON.stringify(lock));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function isOwnerLockFresh(lock, nowMs, ttlMs) {
    if (!lock || !lock.ownerTabId) return false;
    const heartbeatAt = Number(lock.heartbeatAt) || 0;
    const ttl = Number(ttlMs) || 0;
    return heartbeatAt > 0 && ttl > 0 && ((Number(nowMs) || 0) - heartbeatAt) <= ttl;
  }

  function removeOwnerLock(storage, key, ownerId) {
    const existing = readLock(storage, key);
    if (existing && existing.ownerTabId && existing.ownerTabId !== ownerId) return false;
    try {
      if (storage && typeof storage.removeItem === 'function') storage.removeItem(key);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function createOwnerLock(opts) {
    const o = opts || {};
    const storage = o.storage || global.localStorage || null;
    const key = o.key;
    const ownerId = o.ownerId || 'owner';
    const ttlMs = Number(o.ttlMs) || 15000;
    const nowFn = typeof o.now === 'function' ? o.now : function () { return Date.now(); };
    const failOpen = o.failOpenOnStorageUnavailable !== false;

    function read() { return readLock(storage, key); }
    function write(lock) { return writeLock(storage, key, lock); }
    function fresh(lock, nowMs) { return isOwnerLockFresh(lock, nowMs == null ? nowFn() : nowMs, ttlMs); }

    function acquire(reason) {
      const now = nowFn();
      const existing = read();
      if (fresh(existing, now) && existing.ownerTabId !== ownerId) {
        return { ok: false, reason: 'held-by-another-owner', existing: existing, deniedAt: now };
      }
      const next = {
        ownerTabId: ownerId,
        acquiredAt: existing && existing.ownerTabId === ownerId ? (existing.acquiredAt || now) : now,
        heartbeatAt: now,
        reason: reason || 'start'
      };
      if (!write(next)) return { ok: !!failOpen, reason: 'storage-unavailable', lock: next };
      const verify = read();
      if (verify && verify.ownerTabId === ownerId) return { ok: true, reason: 'acquired', lock: verify };
      return { ok: false, reason: 'write-race-lost', existing: verify, deniedAt: now };
    }

    function touch() {
      const lock = read();
      if (!lock || lock.ownerTabId !== ownerId) return false;
      lock.heartbeatAt = nowFn();
      return write(lock);
    }

    function release() {
      return removeOwnerLock(storage, key, ownerId);
    }

    return {
      read: read,
      write: write,
      isFresh: fresh,
      acquire: acquire,
      touch: touch,
      release: release
    };
  }

  TK.runner = {
    __registered: true,
    totalStepsOf: totalStepsOf,
    createLinearState: createLinearState,
    transitionLinear: transitionLinear,
    phaseDurationSec: phaseDurationSec,
    buildCyclicPhasePlan: buildCyclicPhasePlan,
    remainingSecFromSnapshot: remainingSecFromSnapshot,
    estimateStepsDurationSec: estimateStepsDurationSec,
    estimateDoseSec: estimateDoseSec,
    estimateDoseMetrics: estimateDoseMetrics,
    scaleMetrics: scaleMetrics,
    summarizeMetrics: summarizeMetrics,
    num: num,
    avg: avg,
    createRunPlan: createRunPlan,
    readLock: readLock,
    writeLock: writeLock,
    isOwnerLockFresh: isOwnerLockFresh,
    removeOwnerLock: removeOwnerLock,
    createOwnerLock: createOwnerLock
  };
})(typeof window !== 'undefined' ? window : globalThis);
