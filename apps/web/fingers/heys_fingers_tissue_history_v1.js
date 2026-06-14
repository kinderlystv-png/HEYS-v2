// heys_fingers_tissue_history_v1.js — client-scoped tissue-load log for S2.
//
// Public API (HEYS.Fingers.tissueHistory):
//   recordSession(session, t?) — extract high/max finger-tissue loads
//   record(entries, t?)       — write [{atomId, tissueLoad, gripId?, gripGroup?}]
//   recent({nowMs, windowHours, limit}?) → S2 history [{timestamp, atomId, tissueLoad, gripId, gripGroup}]
//   clear()
//
// LS-key: `heys_<cid>_fingers_tissue_history_v1` (anonymous:
//   `heys_fingers_tissue_history_v1`).

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__tissueHistoryRegistered) return;
  Fingers.__tissueHistoryRegistered = true;

  const MAX_ENTRIES = 120;
  const WINDOW_HOURS = 96; // >72h S2 window, with margin for clock drift.

  const GRIP_GROUP_BY_ID = {
    openhand4: 'open_drag',
    front3: 'open_drag',
    back3: 'open_drag',
    halfcrimp: 'crimp',
    fullcrimp: 'crimp',
    mono: 'mono',
    pinch: 'pinch',
    sloper: 'sloper'
  };

  function _recordsKernel() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.records;
  }

  function _getKey() {
    const cid = HEYS && HEYS.currentClientId;
    return cid ? 'heys_' + cid + '_fingers_tissue_history_v1' : 'heys_fingers_tissue_history_v1';
  }

  function _now() { return Date.now(); }

  function _read() {
    try {
      const u = HEYS.utils;
      if (u && typeof u.lsGet === 'function') return u.lsGet(_getKey(), null);
      const raw = localStorage.getItem(_getKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function _write(obj) {
    try {
      const u = HEYS.utils;
      if (u && typeof u.lsSet === 'function') { u.lsSet(_getKey(), obj); return true; }
      localStorage.setItem(_getKey(), JSON.stringify(obj));
      return true;
    } catch (_) { return false; }
  }

  function _entries() {
    const o = _read();
    return o && Array.isArray(o.entries) ? o.entries : [];
  }

  function _gripGroupOf(gripId) {
    return gripId ? (GRIP_GROUP_BY_ID[gripId] || gripId) : null;
  }

  function _entryFromExercise(ex) {
    if (!ex || typeof ex !== 'object') return null;
    const atom = (Fingers.blockCatalog && typeof Fingers.blockCatalog.getAtom === 'function' && ex.atomId)
      ? Fingers.blockCatalog.getAtom(ex.atomId) : null;
    const tissueLoad = (atom && atom.tissueLoad) || ex.tissueLoad || null;
    if (tissueLoad !== 'high' && tissueLoad !== 'max') return null;
    const gripId = (atom && atom.gripId) || ex.gripId || null;
    return {
      atomId: ex.atomId || (atom && atom.id) || null,
      tissueLoad: tissueLoad,
      gripId: gripId,
      gripGroup: (atom && atom.gripGroup) || ex.gripGroup || _gripGroupOf(gripId)
    };
  }

  function _sessionEntries(session) {
    const ex = session && Array.isArray(session.exercises) ? session.exercises : [];
    return ex.map(_entryFromExercise).filter(Boolean);
  }

  function record(entries, nowMs) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return false;
    const ts = typeof nowMs === 'number' ? nowMs : _now();
    const next = _entries().slice();
    list.forEach(function (e) {
      if (!e || (e.tissueLoad !== 'high' && e.tissueLoad !== 'max')) return;
      const gripId = e.gripId || null;
      next.push({
        timestamp: ts,
        atomId: e.atomId || null,
        tissueLoad: e.tissueLoad,
        gripId: gripId,
        gripGroup: e.gripGroup || _gripGroupOf(gripId)
      });
    });
    const kr = _recordsKernel();
    let pruned = kr && kr.appendWindowed
      ? kr.appendWindowed([], next, {
        timestampKey: 'timestamp',
        nowMs: ts,
        windowHours: WINDOW_HOURS,
        cap: MAX_ENTRIES
      })
      : next.filter(function (e) {
        return typeof e.timestamp !== 'number' || e.timestamp >= ts - WINDOW_HOURS * 3600 * 1000;
      });
    if (!kr || !kr.appendWindowed) {
      if (pruned.length > MAX_ENTRIES) pruned = pruned.slice(pruned.length - MAX_ENTRIES);
    }
    return _write({ version: 1, entries: pruned });
  }

  function recordSession(session, nowMs) {
    return record(_sessionEntries(session), nowMs);
  }

  function recent(opts) {
    const o = opts || {};
    const nowMs = typeof o.nowMs === 'number' ? o.nowMs : _now();
    const windowHours = typeof o.windowHours === 'number' ? o.windowHours : WINDOW_HOURS;
    const limit = typeof o.limit === 'number' ? o.limit : MAX_ENTRIES;
    const kr = _recordsKernel();
    const filtered = kr && kr.recentWindow
      ? kr.recentWindow(_entries(), {
        timestampKey: 'timestamp',
        nowMs: nowMs,
        windowHours: windowHours,
        upperBoundNow: true,
        limit: 0
      })
      : _entries()
        .filter(function (e) {
          return typeof e.timestamp !== 'number' || (e.timestamp >= nowMs - windowHours * 3600 * 1000 && e.timestamp <= nowMs);
        })
        .sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
    return limit > 0 ? filtered.slice(Math.max(0, filtered.length - limit)) : filtered;
  }

  function clear() { return _write({ version: 1, entries: [] }); }

  Fingers.tissueHistory = {
    record: record,
    recordSession: recordSession,
    recent: recent,
    clear: clear,
    __registered: true,
    __getKey: _getKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
