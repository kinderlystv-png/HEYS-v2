// heys_fingers_session_persistence_v1.js — LS-snapshot активной finger-сессии.
//
// Задача: пережить reload / closed tab / crash во время активной тренировки.
// Snapshot пишется debounced (250ms) на каждый state transition; на boot
// (после heysSyncCompleted) detectOnBoot вызывает callback с snapshot или
// stale-prompt.
//
// Public API:
//   HEYS.Fingers.persistence.save(snapshot)
//   HEYS.Fingers.persistence.load() → null | { stale, snapshot }
//   HEYS.Fingers.persistence.clear()
//   HEYS.Fingers.persistence.detectOnBoot(callback)
//
// LS-key: `heys_<cid>_finger_active_session` если HEYS.currentClientId доступен,
// иначе `heys_finger_active_session` (global, для anonymous PIN-less контекстов).
//
// Stale rule (план):
//   now - lastTickAt > 1ч → load() возвращает { stale: true, snapshot }
//   <= 1ч → load() возвращает { stale: false, snapshot } для prompt
//           «Продолжить? / Сохранить / Удалить».
//
// Multi-tab race: используем monotonic stateEnteredAt + lastTickAt чтобы
// выбрать самую свежую запись если два tab'а конкурируют. Если incoming
// snapshot старее текущего LS → ignore (last-write-wins, но по timestamp).

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.persistence && Fingers.persistence.__registered) return;

  // Stale = «забытая» сессия. Раньше 1h — слишком жёстко: если закрыл вкладку
  // вечером и открыл утром, snapshot уже отмечался как stale → resume banner
  // не появлялся. Расширил до 24h — UI отдельно показывает «давно открыта»
  // для snapshots старше 1h, чтоб юзер мог решить продолжить или удалить.
  const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
  const AGING_THRESHOLD_MS = 60 * 60 * 1000;       // 1 hour — soft "aging" warning
  const DEBOUNCE_MS = 250;

  function _getCurrentClientId() {
    const cid = (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
    return cid ? String(cid) : '';
  }

  function _getKey() {
    const cid = _getCurrentClientId();
    return cid ? `heys_${cid}_finger_active_session` : 'heys_finger_active_session';
  }

  function _safeReadLS(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Fingers.persistence] LS read failed:', e);
      return null;
    }
  }

  function _isActiveSessionKey(key) {
    if (!key) return false;
    if (key === 'heys_finger_active_session') return true;
    return /^heys_[a-f0-9-]{36}_finger_active_session$/i.test(String(key));
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
      // Active-session marker is a per-tab recovery artefact. It must stay local:
      // cloud replay would resurrect discarded/cancelled sessions on reload.
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[Fingers.persistence] LS write failed:', e);
      return false;
    }
  }

  function _safeRemoveLS(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('[Fingers.persistence] LS remove failed:', e);
      return false;
    }
  }

  // ─── Debounced save ─────────────────────────────────────────────────────
  let _saveTimer = null;
  let _pendingSnapshot = null;

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

      // Multi-tab race guard: если в LS уже есть запись с более свежим
      // stateEnteredAt — НЕ overwrite (вторая вкладка должна победить).
      const existing = _safeReadLS(key);
      if (existing && existing.stateEnteredAt && toWrite.stateEnteredAt
          && existing.stateEnteredAt > toWrite.stateEnteredAt) {
        return;
      }

      _safeWriteLS(key, toWrite);
    }, DEBOUNCE_MS);
  }

  // ─── Synchronous load + stale check ─────────────────────────────────────
  function load() {
    const key = _getKey();
    const snapshot = _safeReadLS(key);
    if (!snapshot) return null;

    const lastTickAt = Number(snapshot.lastTickAt) || 0;
    const age = Date.now() - lastTickAt;
    const stale = age > STALE_THRESHOLD_MS;

    return { stale, snapshot };
  }

  function clear() {
    // Flush pending — иначе debounced timer перезапишет clear.
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
      _pendingSnapshot = null;
    }
    _safeRemoveLS(_getKey());
  }

  function _matchesTraining(snapshot, ctx) {
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
      if (!_matchesTraining(snapshot, ctx)) return;
      if (_safeRemoveLS(key)) cleared++;
    });
    return cleared;
  }

  // Synchronous flush — для beforeunload/pagehide. Не уходит через
  // HEYS.utils (async cloud sync), а пишет напрямую в LS чтобы успеть
  // до закрытия вкладки.
  function _flushSync() {
    if (!_pendingSnapshot) return;
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }
    try {
      localStorage.setItem(_getKey(), JSON.stringify(_pendingSnapshot));
    } catch (e) {
      // LS quota / private mode — ignore, лучше потерять snapshot чем краш.
    }
    _pendingSnapshot = null;
  }

  if (typeof window !== 'undefined') {
    // beforeunload — большинство десктоп браузеров. На iOS Safari часто не
    // срабатывает → pagehide как fallback (срабатывает при back-forward cache
    // и закрытии таба на iOS).
    window.addEventListener('beforeunload', _flushSync);
    window.addEventListener('pagehide', _flushSync);
    // visibility hidden — тоже хороший сигнал, особенно для PWA.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') _flushSync();
    });
  }

  // ─── Boot detection ─────────────────────────────────────────────────────
  // Slушаем heysSyncCompleted (initial cloud sync done) и вызываем callback
  // с актуальным snapshot. Если callback вернёт truthy «handled» — не
  // повторяем при следующих sync (one-shot).
  let _detectAlreadyFired = false;

  function detectOnBoot(callback) {
    if (typeof callback !== 'function') return;

    const tryDetect = () => {
      if (_detectAlreadyFired) return;
      const result = load();
      if (!result) {
        _detectAlreadyFired = true;
        return;
      }
      _detectAlreadyFired = true;
      try {
        callback(result);
      } catch (e) {
        console.warn('[Fingers.persistence] detectOnBoot callback threw:', e);
      }
    };

    if (typeof window === 'undefined') {
      // SSR / Node — no-op (boot detection в DOM only).
      return;
    }

    // Если sync уже completed до загрузки модуля — defer на microtask чтобы
    // не блокировать loader chain.
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

  Fingers.persistence = {
    save,
    load,
    clear,
    clearForTraining,
    detectOnBoot,
    __registered: true,
    // Test/internal helpers (не публичный API, но удобно для дебага)
    __getKey: _getKey,
    __isActiveSessionKey: _isActiveSessionKey,
    __isCurrentActiveSessionKey: _isCurrentActiveSessionKey,
    __STALE_THRESHOLD_MS: STALE_THRESHOLD_MS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
