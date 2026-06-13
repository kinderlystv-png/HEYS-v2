// heys_mobility_records_store_v1.js — client-scoped история режима мобильности.
//
// Storage injection по умолчанию: не хардкодим localStorage в тестах/ядре.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__recordsStoreRegistered) return;
  Mobility.__recordsStoreRegistered = true;

  const PREFIX = 'heys_mobility_records_v1';

  function key(clientId) {
    return PREFIX + ':' + (clientId || 'default');
  }
  function storageOf(storage) {
    return storage || global.localStorage || null;
  }
  function empty() {
    return { sessions: [], assessments: [], painFlags: [] };
  }
  function load(clientId, storage) {
    const s = storageOf(storage);
    if (!s || typeof s.getItem !== 'function') return empty();
    try {
      return Object.assign(empty(), JSON.parse(s.getItem(key(clientId)) || '{}'));
    } catch (e) {
      return empty();
    }
  }
  function save(clientId, data, storage) {
    const s = storageOf(storage);
    if (!s || typeof s.setItem !== 'function') return false;
    s.setItem(key(clientId), JSON.stringify(Object.assign(empty(), data || {})));
    return true;
  }
  function addSession(clientId, sessionResult, storage) {
    const data = load(clientId, storage);
    const item = {
      id: 'mob_sess_' + Date.now() + '_' + data.sessions.length,
      savedAt: new Date().toISOString(),
      mode: sessionResult && sessionResult.session && sessionResult.session.mode,
      ok: !!(sessionResult && sessionResult.ok),
      issues: (sessionResult && sessionResult.issues) || [],
      session: (sessionResult && sessionResult.session) || sessionResult || null
    };
    data.sessions.push(item);
    save(clientId, data, storage);
    return item;
  }
  function addAssessment(clientId, audit, storage) {
    const data = load(clientId, storage);
    const item = {
      id: 'mob_assess_' + Date.now() + '_' + data.assessments.length,
      savedAt: new Date().toISOString(),
      audit: audit
    };
    data.assessments.push(item);
    save(clientId, data, storage);
    return item;
  }
  function addPainFlag(clientId, flag, storage) {
    const data = load(clientId, storage);
    const item = Object.assign({ savedAt: new Date().toISOString() }, flag || {});
    data.painFlags.push(item);
    save(clientId, data, storage);
    return item;
  }
  function latestAssessment(clientId, storage) {
    const items = load(clientId, storage).assessments;
    return items.length ? items[items.length - 1] : null;
  }
  function listSessions(clientId, storage) {
    return load(clientId, storage).sessions;
  }
  function createMemoryStorage() {
    const data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      _data: data
    };
  }

  Mobility.recordsStore = {
    __registered: true,
    key: key,
    load: load,
    save: save,
    addSession: addSession,
    addAssessment: addAssessment,
    addPainFlag: addPainFlag,
    latestAssessment: latestAssessment,
    listSessions: listSessions,
    createMemoryStorage: createMemoryStorage
  };
})(typeof window !== 'undefined' ? window : globalThis);
