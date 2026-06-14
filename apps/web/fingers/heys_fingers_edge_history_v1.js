// heys_fingers_edge_history_v1.js — кросс-сессионная история хватов/ребёр для
// FDP/FDS ротации (METHODOLOGY §1.3 вариативность + §3.3 распределение тканей).
//
// Зачем: кримп (half/full) грузит преимущественно FDP, открытый хват — FDS
// (Vigouroux 2006 / Schweizer-Hudek 2011). Серия сессий с одним доминантным
// паттерном недогружает второй сгибатель и концентрирует тканевую нагрузку →
// варьируем хват между сессиями. Этот лог копит, какой lean (FDP/FDS) реально
// тренировался, чтобы `session_builder` приоритезировал под-нагруженный.
//
// Public API (HEYS.Fingers.edgeHistory):
//   leanOfGrip(gripId)        — 'FDP' | 'FDS' | null (из grips_catalog primaryMuscles)
//   recordSession(session, t?)— извлечь хват-висы сессии и записать
//   record(picks, t?)         — записать [{gripId, edgeMm, lean}]
//   recent({limit,windowDays,nowMs}?) — последние записи в окне
//   leanUsage(opts?)          — { FDP:n, FDS:n } по окну
//   underusedLean(opts?)      — под-нагруженный lean для ротации | null
//   clear()
//
// LS-key: `heys_<cid>_fingers_edge_history_v1` (client-scoped, инвариант #9;
//   anonymous: `heys_fingers_edge_history_v1`).

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__edgeHistoryRegistered) return;
  Fingers.__edgeHistoryRegistered = true;

  const MAX_ENTRIES = 40;     // потолок размера лога
  const WINDOW_DAYS = 21;     // окно ротации (≈3 недели)
  const RECENT_DEFAULT = 6;   // сколько последних записей смотреть для lean
  const DAY_MS = 24 * 60 * 60 * 1000;

  function _recordsKernel() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.records;
  }

  function _getKey() {
    const cid = HEYS && HEYS.currentClientId;
    const kr = _recordsKernel();
    if (kr && kr.clientKey) return kr.clientKey('fingers_edge_history_v1', cid, { style: 'heys-client-prefix' });
    return cid ? 'heys_' + cid + '_fingers_edge_history_v1' : 'heys_fingers_edge_history_v1';
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

  // FDP/FDS lean из grips_catalog: первый из {FDP,FDS} в primaryMuscles =
  // доминанта (openhand4=['FDS','FDP',...]→FDS; halfcrimp/full=['FDP',...]→FDP).
  function leanOfGrip(gripId) {
    if (!gripId) return null;
    const g = (Fingers && typeof Fingers.getGripById === 'function') ? Fingers.getGripById(gripId) : null;
    if (!g || !Array.isArray(g.primaryMuscles)) return null;
    for (let i = 0; i < g.primaryMuscles.length; i++) {
      const m = g.primaryMuscles[i];
      if (m === 'FDP' || m === 'FDS') return m;
    }
    return null;
  }

  // Хват-висы сессии: упражнения с gripId, у которых хват несёт FDP/FDS lean.
  function _strengthPicks(session) {
    const ex = session && Array.isArray(session.exercises) ? session.exercises : [];
    const out = [];
    ex.forEach(function (e) {
      if (!e || !e.gripId) return;
      const lean = leanOfGrip(e.gripId);
      if (!lean) return;
      const edge = (e.edgeSizeMm != null) ? e.edgeSizeMm
        : (e.edgeMm != null ? e.edgeMm : null);
      out.push({ gripId: e.gripId, edgeMm: edge, lean: lean });
    });
    return out;
  }

  function record(picks, nowMs) {
    const list = Array.isArray(picks) ? picks : [];
    if (!list.length) return false;
    const ts = typeof nowMs === 'number' ? nowMs : _now();
    const entries = _entries().slice();
    list.forEach(function (p) {
      if (!p || (p.lean !== 'FDP' && p.lean !== 'FDS')) return;
      entries.push({
        ts: ts,
        gripId: p.gripId || null,
        edgeMm: (p.edgeMm != null ? p.edgeMm : null),
        lean: p.lean
      });
    });
    const kr = _recordsKernel();
    let pruned = kr && kr.appendWindowed
      ? kr.appendWindowed([], entries, {
        timestampKey: 'ts',
        nowMs: ts,
        windowDays: WINDOW_DAYS,
        cap: MAX_ENTRIES
      })
      : entries.filter(function (e) {
        return typeof e.ts !== 'number' || e.ts >= ts - WINDOW_DAYS * DAY_MS;
      });
    if (!kr || !kr.appendWindowed) {
      if (pruned.length > MAX_ENTRIES) pruned = pruned.slice(pruned.length - MAX_ENTRIES);
    }
    return _write({ version: 1, entries: pruned });
  }

  function recordSession(session, nowMs) {
    return record(_strengthPicks(session), nowMs);
  }

  function recent(opts) {
    const o = opts || {};
    const limit = typeof o.limit === 'number' ? o.limit : RECENT_DEFAULT;
    const nowMs = typeof o.nowMs === 'number' ? o.nowMs : _now();
    const windowDays = typeof o.windowDays === 'number' ? o.windowDays : WINDOW_DAYS;
    const kr = _recordsKernel();
    const all = kr && kr.recentWindow
      ? kr.recentWindow(_entries(), {
        timestampKey: 'ts',
        nowMs: nowMs,
        windowDays: windowDays,
        limit: 0,
        sortAsc: false
      })
      : _entries().filter(function (e) {
        return typeof e.ts !== 'number' || e.ts >= nowMs - windowDays * DAY_MS;
      });
    return limit > 0 ? all.slice(Math.max(0, all.length - limit)) : all;
  }

  function leanUsage(opts) {
    const r = recent(opts);
    const usage = { FDP: 0, FDS: 0 };
    r.forEach(function (e) { if (e.lean === 'FDP' || e.lean === 'FDS') usage[e.lean]++; });
    return usage;
  }

  // Под-нагруженный lean (меньший счёт) для ротации. null если пусто или баланс
  // — тогда движок сохраняет дефолтный catalog-порядок.
  function underusedLean(opts) {
    const u = leanUsage(opts);
    if (u.FDP === u.FDS) return null;
    return u.FDP < u.FDS ? 'FDP' : 'FDS';
  }

  function clear() { return _write({ version: 1, entries: [] }); }

  Fingers.edgeHistory = {
    leanOfGrip: leanOfGrip,
    record: record,
    recordSession: recordSession,
    recent: recent,
    leanUsage: leanUsage,
    underusedLean: underusedLean,
    clear: clear,
    __registered: true
  };
})(typeof window !== 'undefined' ? window : globalThis);
