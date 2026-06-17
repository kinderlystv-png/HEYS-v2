// heys_kernel_active_session_v1.js — домен-агностичный LS-snapshot активной
// тренировочной сессии (вынос из доменного persistence, Этап 3 унификации).
//
// Задача: пережить reload / closed tab / crash во время активной сессии.
// Snapshot пишется debounced на каждый state transition; на boot (после
// heysSyncCompleted) detectOnBoot вызывает callback со снимком или stale-prompt.
//
// Фабрика на домен:
//   const store = HEYS.TrainingKernel.activeSession.create({
//     keySuffix: 'finger_active_session',  // LS-ключ: heys_<cid>_<keySuffix>
//     staleMs: 24*3600e3, debounceMs: 250,
//     clientIdFn?: () => string,           // default: HEYS.currentClientId
//     matchFn?: (snapshot, ctx) => bool    // default: dateKey/trainingIndex
//   });
//   store.save(snapshot) | load() -> null|{stale,snapshot} | clear()
//        | clearForTraining(ctx) -> count | detectOnBoot(cb)
//
// Инвариант (жёсткий): LS-ключ ВСЕГДА scoped по clientIdFn(); anonymous →
// глобальный fallback. Snapshot — local-only artefact (cloud replay воскресил бы
// отменённые сессии на reload), поэтому пишем напрямую в localStorage.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.activeSession && TK.activeSession.create) return; // idempotent

  const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000; // 24h
  const DEFAULT_DEBOUNCE_MS = 250;

  function _defaultClientId() {
    const cid = (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
    return cid ? String(cid) : '';
  }

  function _defaultMatch(snapshot, ctx) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (!ctx || typeof ctx !== 'object') return true;
    const ctxDate = ctx.dateKey == null ? null : String(ctx.dateKey);
    const snapDate = snapshot.dateKey == null ? null : String(snapshot.dateKey);
    if (ctxDate && snapDate && ctxDate !== snapDate) return false;
    if (ctx.trainingIndex != null && snapshot.trainingIndex != null) {
      const ctxIdx = Number(ctx.trainingIndex);
      const snapIdx = Number(snapshot.trainingIndex);
      if (Number.isFinite(ctxIdx) && Number.isFinite(snapIdx) && ctxIdx !== snapIdx) return false;
    }
    return true;
  }

  function _escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function create(opts) {
    const o = opts || {};
    const keySuffix = String(o.keySuffix || 'active_session');
    const staleMs = Number(o.staleMs) > 0 ? Number(o.staleMs) : DEFAULT_STALE_MS;
    const debounceMs = Number(o.debounceMs) >= 0 ? Number(o.debounceMs) : DEFAULT_DEBOUNCE_MS;
    const clientIdFn = typeof o.clientIdFn === 'function' ? o.clientIdFn : _defaultClientId;
    const matchFn = typeof o.matchFn === 'function' ? o.matchFn : _defaultMatch;
    const keyRe = new RegExp('^heys_[a-f0-9-]{36}_' + _escapeRegExp(keySuffix) + '$', 'i');
    const globalKey = 'heys_' + keySuffix;

    // Per-instance состояние — у каждого домена свой debounce/snapshot/boot-flag.
    let _saveTimer = null;
    let _pendingSnapshot = null;
    let _detectAlreadyFired = false;

    function _getKey() {
      const cid = clientIdFn();
      return cid ? ('heys_' + cid + '_' + keySuffix) : globalKey;
    }

    function _safeReadLS(key) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) {
        console.warn('[kernel.activeSession] LS read failed:', e);
        return null;
      }
    }

    function _isActiveSessionKey(key) {
      if (!key) return false;
      if (key === globalKey) return true;
      return keyRe.test(String(key));
    }

    function _isCurrentActiveSessionKey(key) {
      if (!_isActiveSessionKey(key)) return false;
      return String(key) === _getKey();
    }

    function _listActiveSessionKeys() {
      const keys = [];
      const seen = new Set();
      const add = (key) => {
        if (!key || seen.has(key)) return;
        seen.add(key);
        keys.push(key);
      };
      add(_getKey());
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (_isCurrentActiveSessionKey(key)) add(key);
        }
      } catch (_) { /* noop */ }
      return keys;
    }

    function _safeWriteLS(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('[kernel.activeSession] LS write failed:', e);
        return false;
      }
    }

    function _safeRemoveLS(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        console.warn('[kernel.activeSession] LS remove failed:', e);
        return false;
      }
    }

    function save(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return;
      _pendingSnapshot = Object.assign({}, snapshot, { lastTickAt: Date.now() });
      if (_saveTimer) return; // already scheduled
      _saveTimer = setTimeout(() => {
        _saveTimer = null;
        const toWrite = _pendingSnapshot;
        _pendingSnapshot = null;
        if (!toWrite) return;
        const key = _getKey();
        // Multi-tab race guard: более свежий stateEnteredAt в LS не перезаписываем.
        const existing = _safeReadLS(key);
        if (existing && existing.stateEnteredAt && toWrite.stateEnteredAt
            && existing.stateEnteredAt > toWrite.stateEnteredAt) {
          return;
        }
        _safeWriteLS(key, toWrite);
      }, debounceMs);
    }

    function load() {
      const key = _getKey();
      const snapshot = _safeReadLS(key);
      if (!snapshot) return null;
      const lastTickAt = Number(snapshot.lastTickAt) || 0;
      const age = Date.now() - lastTickAt;
      const stale = age > staleMs;
      return { stale, snapshot };
    }

    function clear() {
      if (_saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
        _pendingSnapshot = null;
      }
      _safeRemoveLS(_getKey());
    }

    function clearForTraining(ctx) {
      if (_saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
        _pendingSnapshot = null;
      }
      let cleared = 0;
      _listActiveSessionKeys().forEach((key) => {
        const snapshot = _safeReadLS(key);
        if (!snapshot) return;
        if (!matchFn(snapshot, ctx)) return;
        if (_safeRemoveLS(key)) cleared++;
      });
      return cleared;
    }

    // Synchronous flush — для beforeunload/pagehide/visibility. Пишем напрямую
    // в LS, чтобы успеть до закрытия вкладки.
    function _flushSync() {
      if (!_pendingSnapshot) return;
      if (_saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
      }
      try {
        localStorage.setItem(_getKey(), JSON.stringify(_pendingSnapshot));
      } catch (e) { /* quota / private mode — лучше потерять snapshot чем краш */ }
      _pendingSnapshot = null;
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', _flushSync);
      window.addEventListener('pagehide', _flushSync);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') _flushSync();
      });
    }

    function detectOnBoot(callback) {
      if (typeof callback !== 'function') return;
      const tryDetect = () => {
        if (_detectAlreadyFired) return;
        const result = load();
        _detectAlreadyFired = true;
        if (!result) return;
        try { callback(result); }
        catch (e) { console.warn('[kernel.activeSession] detectOnBoot callback threw:', e); }
      };
      if (typeof window === 'undefined') return; // SSR/Node — no-op
      const alreadySynced = window.__heysSyncCompletedFired === true;
      if (alreadySynced) {
        Promise.resolve().then(tryDetect);
        return;
      }
      const handler = () => {
        window.__heysSyncCompletedFired = true;
        tryDetect();
        window.removeEventListener('heysSyncCompleted', handler);
      };
      window.addEventListener('heysSyncCompleted', handler);
    }

    return {
      save: save,
      load: load,
      clear: clear,
      clearForTraining: clearForTraining,
      detectOnBoot: detectOnBoot,
      __getKey: _getKey,
      __isActiveSessionKey: _isActiveSessionKey,
      __isCurrentActiveSessionKey: _isCurrentActiveSessionKey,
      __STALE_THRESHOLD_MS: staleMs
    };
  }

  TK.activeSession = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
