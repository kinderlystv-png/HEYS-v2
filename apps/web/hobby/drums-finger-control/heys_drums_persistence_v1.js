// heys_drums_persistence_v1.js — scoped storage for drum pad finger control.
;(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  const Hobby = (HEYS.Hobby = HEYS.Hobby || {});
  const DFC = (Hobby._drumsInternal = Hobby._drumsInternal || {});

  if (Hobby.DrumsFingerControl && Hobby.DrumsFingerControl.__registered) return;

  const { MODULE_ID, ACTIVE_SESSION_KEY, DAY_SCOPED_RE, DAY_BASE_RE, isDrumsTraining } = DFC;

  function lsGet(key, fallback) {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') return HEYS.utils.lsGet(key, fallback);
      const raw = global.localStorage && global.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function lsSet(key, value) {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
        HEYS.utils.lsSet(key, value);
        return;
      }
      global.localStorage && global.localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      /* noop */
    }
  }

  function lsRemove(key) {
    try {
      global.localStorage && global.localStorage.removeItem(key);
    } catch (_) {
      /* noop */
    }
  }

  function getCurrentClientId() {
    try {
      return HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
    } catch (_) {
      return '';
    }
  }

  function getDayKeys(dateKey) {
    const cid = getCurrentClientId();
    return {
      scoped: cid ? 'heys_' + cid + '_dayv2_' + dateKey : '',
      base: 'heys_dayv2_' + dateKey,
    };
  }

  function getActiveSessionKeys() {
    const cid = getCurrentClientId();
    return {
      scoped: cid ? 'heys_' + cid + '_drums_finger_active_session' : '',
      base: ACTIVE_SESSION_KEY,
    };
  }

  function getReadableDayInfo(key) {
    const currentClientId = getCurrentClientId();
    const scopedMatch = String(key || '').match(DAY_SCOPED_RE);
    if (scopedMatch) {
      if (!currentClientId || scopedMatch[1].toLowerCase() !== String(currentClientId).toLowerCase()) return null;
      return { dateKey: scopedMatch[2], scoped: true };
    }
    const baseMatch = String(key || '').match(DAY_BASE_RE);
    if (baseMatch) {
      if (currentClientId) return null;
      return { dateKey: baseMatch[1], scoped: false };
    }
    return null;
  }

  function readDay(dateKey) {
    const keys = getDayKeys(dateKey);
    if (keys.scoped) {
      const scoped = lsGet(keys.scoped, null);
      if (scoped && scoped.date === dateKey) return { day: scoped, key: keys.scoped };
      return { day: { date: dateKey, meals: [], trainings: [] }, key: keys.scoped };
    }
    const base = lsGet(keys.base, null);
    if (base && base.date === dateKey) return { day: base, key: keys.base };
    return { day: { date: dateKey, meals: [], trainings: [] }, key: keys.scoped || keys.base };
  }

  function writeDay(dateKey, day) {
    const keys = getDayKeys(dateKey);
    const targetKey = keys.scoped || keys.base;
    lsSet(targetKey, day);
  }

  function readActiveSession() {
    const keys = getActiveSessionKeys();
    const snapshot = lsGet(keys.scoped || keys.base, null);
    if (!snapshot || snapshot.moduleId !== MODULE_ID) return null;
    return snapshot;
  }

  function writeActiveSession(state) {
    const keys = getActiveSessionKeys();
    const targetKey = keys.scoped || keys.base;
    if (!state || state.completedAt) {
      lsRemove(targetKey);
      if (keys.scoped) lsRemove(keys.base);
      return;
    }
    lsSet(targetKey, {
      ...state,
      savedAt: Date.now(),
      running: false,
      countInSec: 0,
      tapTest: state.tapTest ? { ...DFC.makeInitialTapTest(state.tapTest), running: false } : undefined,
    });
    if (keys.scoped) lsRemove(keys.base);
  }

  function clearActiveSession() {
    const keys = getActiveSessionKeys();
    lsRemove(keys.scoped || keys.base);
    if (keys.scoped) lsRemove(keys.base);
  }

  function scanLogs(limitDays) {
    const out = [];
    const max = Number.isFinite(+limitDays) ? +limitDays : 180;
    try {
      const ls = global.localStorage;
      if (!ls) return out;
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        const dayInfo = getReadableDayInfo(key);
        if (!dayInfo) continue;
        const day = lsGet(key, null);
        if (!day || !Array.isArray(day.trainings)) continue;
        const dateKey = day.date || dayInfo.dateKey;
        day.trainings.forEach((training, trainingIndex) => {
          if (!isDrumsTraining(training)) return;
          const log = training.hobbyLog || {};
          if (!log.completedAt) return;
          out.push({ dateKey, trainingIndex, training, log });
        });
      }
    } catch (_) {
      return out;
    }
    out.sort((a, b) => (b.log.completedAt || 0) - (a.log.completedAt || 0));
    return out.slice(0, max);
  }

  function getBlockPRLogKey() {
    const cid = getCurrentClientId();
    return cid ? 'heys_' + cid + '_drums_block_prs_v1' : 'heys_drums_block_prs_v1';
  }

  function readBlockPRLog() {
    const list = lsGet(getBlockPRLogKey(), []);
    return Array.isArray(list) ? list : [];
  }

  function writeBlockPRLog(entries) {
    lsSet(getBlockPRLogKey(), Array.isArray(entries) ? entries : []);
  }

  function appendBlockPR(entry) {
    if (!entry || !entry.blockId) return null;
    const cleaned = {
      blockId: String(entry.blockId),
      bpm: Number(entry.bpm) || 0,
      clean: !!entry.clean,
      completedAt: Number(entry.completedAt) || Date.now(),
      dateKey: typeof entry.dateKey === 'string' ? entry.dateKey : '',
      sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : '',
      sessionLabel: typeof entry.sessionLabel === 'string' ? entry.sessionLabel : '',
    };
    if (!cleaned.bpm) return null;
    const existing = readBlockPRLog();
    const filtered = existing.filter(
      (row) => !(row && row.blockId === cleaned.blockId && Number(row.completedAt) === cleaned.completedAt)
    );
    filtered.push(cleaned);
    if (filtered.length > 500) filtered.splice(0, filtered.length - 500);
    writeBlockPRLog(filtered);
    return cleaned;
  }

  Object.assign(DFC, {
    lsGet,
    lsSet,
    lsRemove,
    getCurrentClientId,
    getDayKeys,
    getActiveSessionKeys,
    getReadableDayInfo,
    readDay,
    writeDay,
    readActiveSession,
    writeActiveSession,
    clearActiveSession,
    scanLogs,
    getBlockPRLogKey,
    readBlockPRLog,
    writeBlockPRLog,
    appendBlockPR,
  });
})(typeof window !== 'undefined' ? window : globalThis);
