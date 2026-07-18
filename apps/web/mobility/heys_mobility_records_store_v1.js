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
    return { sessions: [], assessments: [], painFlags: [], courses: [], slotHistory: [], stepFeedback: [] };
  }
  function adapter(storage) {
    const kr = kernelRecords();
    if (!kr || typeof kr.createStoreAdapter !== 'function') return null;
    return kr.createStoreAdapter({
      prefix: PREFIX,
      style: 'heys-client-prefix',
      empty: empty,
      storage: storageOf(storage),
      getClientId: function () { return resolveClientId(); }
    });
  }
  function load(clientId, storage) {
    const a = adapter(storage);
    if (a) return a.load(clientId, storageOf(storage));
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
    const a = adapter(storage);
    if (a) return a.save(clientId, data, storageOf(storage));
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
  function addSession(clientId, sessionResult, storage, options) {
    const data = load(clientId, storage);
    const opts = options && typeof options === 'object' ? options : {};
    const idempotencyKey = opts.idempotencyKey ? String(opts.idempotencyKey) : null;
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    if (idempotencyKey) {
      const existing = sessions.find(function (session) {
        return session && session.idempotencyKey === idempotencyKey;
      });
      if (existing) return existing;
    }
    const item = {
      id: idempotencyKey
        ? recordId(['mob_sess', idempotencyKey])
        : recordId(['mob_sess', Date.now(), sessions.length]),
      idempotencyKey: idempotencyKey,
      savedAt: new Date().toISOString(),
      mode: sessionResult && sessionResult.session && sessionResult.session.mode,
      ok: !!(sessionResult && sessionResult.ok),
      issues: (sessionResult && sessionResult.issues) || [],
      session: (sessionResult && sessionResult.session) || sessionResult || null
    };
    const a = adapter(storage);
    const next = Object.assign({}, data, { sessions: sessions.concat([item]).slice(-500) });
    const saved = a
      ? a.save(clientId, next, storageOf(storage))
      : save(clientId, next, storage);
    return saved ? item : null;
  }
  function addAssessment(clientId, audit, storage) {
    const data = load(clientId, storage);
    const item = {
      id: recordId(['mob_assess', Date.now(), data.assessments.length]),
      savedAt: new Date().toISOString(),
      audit: audit
    };
    const a = adapter(storage);
    if (a) a.append(clientId, 'assessments', item, { cap: 200 }, storageOf(storage));
    else save(clientId, Object.assign(data, { assessments: data.assessments.concat([item]) }), storage);
    return item;
  }
  function addPainFlag(clientId, flag, storage) {
    const data = load(clientId, storage);
    const item = Object.assign({ savedAt: new Date().toISOString() }, flag || {});
    const a = adapter(storage);
    if (a) a.append(clientId, 'painFlags', item, { cap: 200 }, storageOf(storage));
    else save(clientId, Object.assign(data, { painFlags: data.painFlags.concat([item]) }), storage);
    return item;
  }
  function saveCourse(clientId, course, storage) {
    const data = load(clientId, storage);
    const item = Object.assign({
      id: recordId(['mob_course', Date.now(), data.courses.length]),
      savedAt: new Date().toISOString()
    }, course || {});
    const list = (Array.isArray(data.courses) ? data.courses : []).filter(function (c) { return c && c.id !== item.id; }).concat([item]);
    const next = Object.assign(data, { courses: list.slice(-50) });
    save(clientId, next, storage);
    return item;
  }
  function latestCourse(clientId, storage) {
    const data = load(clientId, storage);
    const list = Array.isArray(data.courses) ? data.courses : [];
    return list.length ? list[list.length - 1] : null;
  }
  function addSlotHistory(clientId, entry, storage) {
    const data = load(clientId, storage);
    const item = Object.assign({ savedAt: new Date().toISOString() }, entry || {});
    const a = adapter(storage);
    if (a) a.append(clientId, 'slotHistory', item, { cap: 500 }, storageOf(storage));
    else save(clientId, Object.assign(data, { slotHistory: data.slotHistory.concat([item]).slice(-500) }), storage);
    return item;
  }
  function addStepFeedback(clientId, feedback, storage) {
    const data = load(clientId, storage);
    const item = Object.assign({ savedAt: new Date().toISOString() }, feedback || {});
    const a = adapter(storage);
    if (a) a.append(clientId, 'stepFeedback', item, { cap: 800 }, storageOf(storage));
    else save(clientId, Object.assign(data, { stepFeedback: data.stepFeedback.concat([item]).slice(-800) }), storage);
    return item;
  }
  function latestAssessment(clientId, storage) {
    const a = adapter(storage);
    if (a) return a.latest(clientId, 'assessments', storageOf(storage));
    const data = load(clientId, storage);
    return data.assessments.length ? data.assessments[data.assessments.length - 1] : null;
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
    saveCourse: saveCourse,
    latestCourse: latestCourse,
    addSlotHistory: addSlotHistory,
    addStepFeedback: addStepFeedback,
    latestAssessment: latestAssessment,
    listSessions: listSessions,
    createMemoryStorage: createMemoryStorage
  };
})(typeof window !== 'undefined' ? window : globalThis);
