// heys_mobility_records_store_v1.js — client-scoped история режима мобильности.
//
// Storage injection по умолчанию: не хардкодим localStorage в тестах/ядре.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__recordsStoreRegistered) return;
  Mobility.__recordsStoreRegistered = true;

  // Канонический client-scoped ключ: heys_<clientId>_mobility_records_v1 — матчит
  // CLIENT_SCOPED_KEY_RE (/^heys_([a-f0-9-]{36})_/) в heys_storage_supabase_v1.js,
  // поэтому корректно синкается per-client и чистится при смене клиента (инвариант
  // #4/#9). НЕ colon-стиль и НЕ общий 'default'-бакет (был cross-client риск).
  const PREFIX = 'mobility_records_v1';
  function kernelRecords() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.records;
  }

  // clientId резолвится так же, как у пальцев: явный аргумент → HEYS.currentClientId
  // → global-ключ (без cid). Никогда не 'default', чтобы клиенты не делили бакет.
  function resolveClientId(clientId) {
    if (clientId) return clientId;
    return (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
  }

  function key(clientId) {
    const cid = resolveClientId(clientId);
    const kr = kernelRecords();
    if (kr && kr.clientKey) return kr.clientKey(PREFIX, cid, { style: 'heys-client-prefix' });
    return cid ? ('heys_' + cid + '_' + PREFIX) : ('heys_' + PREFIX);
  }
  function storageOf(storage) {
    return storage || global.localStorage || null;
  }
  function empty() {
    return { sessions: [], assessments: [], painFlags: [] };
  }
  function load(clientId, storage) {
    const kr = kernelRecords();
    if (kr && kr.readJson) return kr.readJson(storageOf(storage), key(clientId), empty);
    const s = storageOf(storage);
    if (!s || typeof s.getItem !== 'function') return empty();
    try {
      return Object.assign(empty(), JSON.parse(s.getItem(key(clientId)) || '{}'));
    } catch (e) {
      return empty();
    }
  }
  function save(clientId, data, storage) {
    const kr = kernelRecords();
    if (kr && kr.writeJson) return kr.writeJson(storageOf(storage), key(clientId), data, empty);
    const s = storageOf(storage);
    if (!s || typeof s.setItem !== 'function') return false;
    s.setItem(key(clientId), JSON.stringify(Object.assign(empty(), data || {})));
    return true;
  }
  function recordId(parts) {
    const kr = kernelRecords();
    if (kr && kr.makeId) return kr.makeId(parts);
    return parts.join('_');
  }
  function addSession(clientId, sessionResult, storage) {
    const data = load(clientId, storage);
    const kr = kernelRecords();
    const item = {
      id: recordId(['mob_sess', Date.now(), data.sessions.length]),
      savedAt: new Date().toISOString(),
      mode: sessionResult && sessionResult.session && sessionResult.session.mode,
      ok: !!(sessionResult && sessionResult.ok),
      issues: (sessionResult && sessionResult.issues) || [],
      session: (sessionResult && sessionResult.session) || sessionResult || null
    };
    save(clientId, kr && kr.appendField ? kr.appendField(data, 'sessions', item) : Object.assign(data, { sessions: data.sessions.concat([item]) }), storage);
    return item;
  }
  function addAssessment(clientId, audit, storage) {
    const data = load(clientId, storage);
    const kr = kernelRecords();
    const item = {
      id: recordId(['mob_assess', Date.now(), data.assessments.length]),
      savedAt: new Date().toISOString(),
      audit: audit
    };
    save(clientId, kr && kr.appendField ? kr.appendField(data, 'assessments', item) : Object.assign(data, { assessments: data.assessments.concat([item]) }), storage);
    return item;
  }
  function addPainFlag(clientId, flag, storage) {
    const data = load(clientId, storage);
    const kr = kernelRecords();
    const item = Object.assign({ savedAt: new Date().toISOString() }, flag || {});
    save(clientId, kr && kr.appendField ? kr.appendField(data, 'painFlags', item) : Object.assign(data, { painFlags: data.painFlags.concat([item]) }), storage);
    return item;
  }
  function latestAssessment(clientId, storage) {
    const data = load(clientId, storage);
    const kr = kernelRecords();
    return kr && kr.latestInField ? kr.latestInField(data, 'assessments') : (data.assessments.length ? data.assessments[data.assessments.length - 1] : null);
  }
  function listSessions(clientId, storage) {
    return load(clientId, storage).sessions;
  }
  function createMemoryStorage() {
    const kr = kernelRecords();
    if (kr && kr.createMemoryStorage) return kr.createMemoryStorage();
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
