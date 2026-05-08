// heys_storage_supabase_v1.js — cloud storage bridge (HISTORICAL NAME)
//
// ⚠️  IMPORTANT (2025-12-25): Supabase JS SDK was removed from this module.
//     Despite the filename, ALL cloud calls now route through HEYS.YandexAPI
//     (Yandex Cloud Functions + API Gateway at https://api.heyslab.ru).
//     The "supabase" suffix is kept for backwards compatibility with legacy
//     boot order, bundle manifest hashes and localStorage keys
//     (e.g. heys_supabase_auth_token — token name only, value is YC JWT).
//     For new code: use HEYS.YandexAPI.rpc() / .rest() directly. Do NOT
//     reintroduce a Supabase client here.
//     Policy: keep localStorage key `heys_supabase_auth_token` until an explicit
//     migration ships; renaming without migration would sign users out.
//
// v59: Fix cache invalidation on cloud sync — UI now shows synced data when changing dates
// v60: FIX dayv2 overwrite — БЛОКИРОВКА записи старых данных из cloud в localStorage (timestamp check)
// v61: FIX offline→online race — flush before download + dayv2 backup + meals count guard
// v62: [HEYS.sinhron] dayv2 sync diagnostics
// v63: Fix backup keys in diagnostics, auto-cleanup old backups
// v64: Fix null dayv2 values from cloud, cleanup "null" in LS, debounce double heysSyncCompleted

; (function (global) {
  (global.console || console).info('[HEYS.sinhron] 🚀 Storage v64 загружен — защита от null dayv2 активна');
  const HEYS = global.HEYS = global.HEYS || {};

  // 🆕 Heartbeat для watchdog — storage загружен
  if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();

  const cloud = HEYS.cloud = HEYS.cloud || {};
  const DEV = global.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };
  const devWarn = typeof DEV.warn === 'function' ? DEV.warn.bind(DEV) : function () { };
  const devInfo = typeof DEV.info === 'function' ? DEV.info.bind(DEV) : function () { };
  const devDebug = typeof DEV.debug === 'function' ? DEV.debug.bind(DEV) : function () { };
  const trackError = (error, context) => {
    if (!HEYS?.analytics?.trackError) return;
    try {
      const err = error instanceof Error ? error : new Error(String(error || 'HEYS.cloud error'));
      HEYS.analytics.trackError(err, context);
    } catch (_) { }
  };
  const quietConsole = {
    log: (...args) => devLog(...args),
    info: (...args) => devInfo(...args),
    debug: (...args) => devDebug(...args),
    warn: (...args) => devWarn(...args),
    error: (...args) => {
      devWarn(...args);
      trackError(args[0], { scope: 'HEYS.cloud', details: args.slice(1) });
    },
    trace: (...args) => { if (window.console && typeof window.console.trace === 'function') window.console.trace(...args); }
  };
  const console = quietConsole;

  // ═══════════════════════════════════════════════════════════════════
  // 🔍 SYNC TRACE BUFFER — диагностика очереди и cloud миррoring
  // ═══════════════════════════════════════════════════════════════════
  const SYNC_TRACE_MAX = 300;
  const _syncTraceBuffer = [];
  function pushSyncTrace(event, payload, level) {
    const entry = { ts: Date.now(), t: new Date().toISOString(), event, ...(payload || {}) };
    _syncTraceBuffer.push(entry);
    if (_syncTraceBuffer.length > SYNC_TRACE_MAX) _syncTraceBuffer.shift();
    const tag = '[HEYS.syncTrace]';
    if (level === 'warn') { (global.console || console).warn(tag, event, payload || ''); }
    else if (level === 'error') { (global.console || console).error(tag, event, payload || ''); }
    else { (global.console || console).info(tag, event, payload || ''); }
  }
  if (!global.HEYS) global.HEYS = {};
  if (!global.HEYS.debug) global.HEYS.debug = {};
  global.HEYS.debug.getSyncTraceBuffer = function () { return _syncTraceBuffer.slice(); };
  global.HEYS.debug.clearSyncTraceBuffer = function () { _syncTraceBuffer.length = 0; };
  global.HEYS.debug._pushSyncTrace = pushSyncTrace;

  // Sampled perf counters (opt-in: localStorage heys_perf_smoothness_sample = "1")
  const _smoothnessMinute = { start: Date.now(), counts: Object.create(null) };
  function bumpSmoothnessCounter(name) {
    try {
      if (!global.localStorage || global.localStorage.getItem('heys_perf_smoothness_sample') !== '1') return;
    } catch (_) { return; }
    const now = Date.now();
    if (now - _smoothnessMinute.start > 60000) {
      const c = _smoothnessMinute.counts;
      const keys = Object.keys(c);
      if (keys.length) {
        pushSyncTrace('PERF_SMOOTHNESS_WINDOW', { ms: now - _smoothnessMinute.start, counts: { ...c } });
      }
      _smoothnessMinute.counts = Object.create(null);
      _smoothnessMinute.start = now;
    }
    _smoothnessMinute.counts[name] = (_smoothnessMinute.counts[name] || 0) + 1;
  }
  global.HEYS.debug.bumpSmoothnessCounter = bumpSmoothnessCounter;

  // ═══════════════════════════════════════════════════════════════════
  // 🔧 КОНСТАНТЫ
  // ═══════════════════════════════════════════════════════════════════

  /** Префиксы ключей для зеркалирования в cloud */
  const KEY_PREFIXES = {
    HEYS: 'heys_',
    DAY: 'day'
  };

  // 🛟 Cloud row decompress safety net. ok=false → caller MUST skip the write
  // (better to leave the previous value than to write garbage compressed string).
  function decompressCloudRowValue(rawValue, contextKey) {
    if (typeof rawValue !== 'string' || !rawValue.startsWith('¤Z¤')) {
      return { value: rawValue, ok: true };
    }
    const Store = global.HEYS && global.HEYS.store;
    if (!Store || typeof Store.decompress !== 'function') {
      console.warn('[HEYS.products] cloud-row decompress unavailable', { key: contextKey });
      return { value: null, ok: false };
    }
    try {
      const decoded = Store.decompress(rawValue);
      return { value: decoded, ok: true };
    } catch (e) {
      console.warn('[HEYS.products] cloud-row decompress failed', { key: contextKey, error: e && e.message });
      return { value: null, ok: false };
    }
  }

  // (cloud-write verbose logging removed for prod; HOT-sync BLOCK warn covers shrink protection)
  function logProductsCloudWrite(_path, _key, _value) { /* no-op stub kept for callsite compat */ }

  /** Ключи, требующие client-specific storage */
  const CLIENT_SPECIFIC_KEYS = [
    // Основные данные клиента
    'heys_products',
    'heys_products_overlay_v2',  // Overlay (TypeA + TypeB) — нужен для real-time sync удалений между устройствами
    'heys_profile',
    'heys_hr_zones',
    'heys_norms',
    'heys_ratio_zones',       // Настройки цветовых зон ratio
    'heys_grams_history',     // История введённых граммов (для автокомплита)

    // Советы (advice)
    'heys_advice_settings',   // Настройки (автопоказ, звук)
    'heys_advice_read_today',
    'heys_advice_hidden_today',
    'heys_first_meal_tip',
    'heys_best_day_last_check',
    'heys_evening_snacker_check',
    'heys_morning_skipper_check',
    'heys_last_visit',

    // Onboarding & Tours (FIX: Added missing keys)
    'heys_tour_completed',
    'heys_insights_tour_completed',
    'heys_tour_interrupted_step',
    'heys_onboarding_complete',

    // Gamification
    'heys_game',              // XP, уровни, достижения
    'heys_best_streak',       // Лучший streak
    'heys_weekly_wrap_view_count', // Счетчик просмотров итогов недели

    // Planning module (PIN-only)
    'heys_planning_projects',
    'heys_planning_tasks',
    'heys_planning_slots',
    'heys_planning_links_v1',
  ];

  /** Префиксы ключей, требующих client-specific storage */
  const CLIENT_SPECIFIC_PREFIXES = [
    'heys_milestone_'         // Достигнутые вехи (heys_milestone_7_days, etc.)
  ];

  /** Префиксы для client-specific данных */
  const CLIENT_KEY_PATTERNS = {
    DAY_V2: 'dayv2_',
    HEYS_CLIENT: 'heys_',
    DAY_CLIENT: 'day_'
  };

  /** Scoped key pattern: heys_{uuid}_... */
  const CLIENT_SCOPED_KEY_RE = /^heys_([a-f0-9-]{36})_/i;

  /** Возможные статусы подключения */
  const CONNECTION_STATUS = {
    OFFLINE: 'offline',
    SIGNIN: 'signin',
    SYNC: 'sync',
    ONLINE: 'online'
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🔧 УТИЛИТЫ
  // ═══════════════════════════════════════════════════════════════════

  function stripClientScopePrefixes(key) {
    if (typeof key !== 'string') {
      return { key, strippedClientIds: [] };
    }

    let normalized = key;
    const strippedClientIds = [];
    let guard = 0;

    while (guard < 4) {
      const match = normalized.match(CLIENT_SCOPED_KEY_RE);
      if (!match) break;
      strippedClientIds.push(match[1]);
      normalized = `heys_${normalized.slice(match[0].length)}`;
      guard += 1;
    }

    return { key: normalized, strippedClientIds };
  }

  function getLeadingClientScopeId(key) {
    const match = typeof key === 'string' ? key.match(CLIENT_SCOPED_KEY_RE) : null;
    return match ? match[1] : '';
  }

  function stripCurrentClientScopePrefixes(key, clientId) {
    if (!clientId || typeof key !== 'string') return key;

    let normalized = key;
    const ownPrefix = `heys_${clientId}_`;
    let guard = 0;

    while (guard < 4 && normalized.startsWith(ownPrefix)) {
      normalized = `heys_${normalized.slice(ownPrefix.length)}`;
      guard += 1;
    }

    return normalized;
  }

  function isForeignClientScopedKey(key, clientId) {
    if (!clientId || typeof key !== 'string') return false;
    const leadingClientId = getLeadingClientScopeId(key);
    return !!leadingClientId && leadingClientId !== clientId;
  }

  function isSensitiveSessionStorageKey(key) {
    if (typeof key !== 'string' || !key) return false;
    if (key.indexOf('sb-') === 0) return true;

    const normalizedKey = stripClientScopePrefixes(key).key;
    return normalizedKey === 'heys_supabase_auth_token'
      || normalizedKey === 'heys_pin_auth_client'
      || normalizedKey === 'heys_curator_session'
      || normalizedKey === 'heys_session_token';
  }

  function extractProfileBasics(value) {
    if (value == null) return null;

    let candidate = value;
    if (typeof candidate === 'string') {
      try {
        candidate = tryParse(candidate);
      } catch (_) { }
    }
    if (typeof candidate === 'string') {
      try {
        candidate = JSON.parse(candidate);
      } catch (_) {
        return null;
      }
    }

    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null;
    }

    const weight = Number(candidate.weight);
    const height = Number(candidate.height);
    const gender = typeof candidate.gender === 'string' ? candidate.gender : '';
    if (!Number.isFinite(weight) || !Number.isFinite(height) || !gender) {
      return null;
    }

    return { w: weight, h: height, g: gender };
  }

  const DEFAULT_TAB_SYNC_GRACE_BYPASS_MS = 15000;

  function getPendingDefaultTabSyncState() {
    const pending = global.HEYS?._pendingProfileSyncFlags?.defaultTab;
    if (!pending || typeof pending !== 'object') return null;

    const requestedTab = typeof pending.requestedTab === 'string' ? pending.requestedTab : '';
    const createdAt = Number(pending.createdAt || 0);

    if (!requestedTab || !Number.isFinite(createdAt) || createdAt <= 0) {
      return null;
    }

    return { requestedTab, createdAt };
  }

  function clearPendingDefaultTabSyncState() {
    if (!global.HEYS?._pendingProfileSyncFlags?.defaultTab) return;
    delete global.HEYS._pendingProfileSyncFlags.defaultTab;
  }

  function shouldBypassGraceForDefaultTabSync(normalizedKey, value, now = Date.now()) {
    if (normalizedKey !== 'heys_profile' || !value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const pending = getPendingDefaultTabSyncState();
    if (!pending) return false;

    if ((now - pending.createdAt) > DEFAULT_TAB_SYNC_GRACE_BYPASS_MS) {
      clearPendingDefaultTabSyncState();
      return false;
    }

    if (value.defaultTab !== pending.requestedTab) {
      return false;
    }

    clearPendingDefaultTabSyncState();
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🛡️ WRITE-TIME CLIENT ISOLATION GUARD (P2 hardening)
  // Last-resort assertion: reject localStorage writes for foreign clients.
  // This is a SECOND defence line after isForeignClientScopedKey filters.
  // ═══════════════════════════════════════════════════════════════════
  let _syncWriteIsolationViolations = 0;

  function assertSyncWriteOwnership(key, clientId, source) {
    if (!clientId || typeof key !== 'string') return true;
    if (isForeignClientScopedKey(key, clientId)) {
      _syncWriteIsolationViolations++;
      console.error(
        `[HEYS.sync] 🚨 WRITE BLOCKED — foreign key at write-time! ` +
        `key="${key}" client="${clientId.slice(0, 8)}" source="${source}" ` +
        `violations=${_syncWriteIsolationViolations}`
      );
      // Emit telemetry event for monitoring
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:sync-isolation-violation', {
          detail: { key, clientId: clientId.slice(0, 8), source, count: _syncWriteIsolationViolations }
        }));
      }
      return false; // caller MUST skip this write
    }
    return true; // safe to proceed
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🔔 POST-SWITCH ANOMALY TELEMETRY (P4 hardening)
  // Lightweight check after switchClient to detect residual cross-client data.
  // ═══════════════════════════════════════════════════════════════════
  function detectPostSwitchAnomalies(newClientId, oldClientId) {
    if (!newClientId) return null;
    const anomalies = [];
    const ls = global.localStorage;
    const newPrefix = 'heys_' + newClientId + '_';
    const oldPrefix = oldClientId ? 'heys_' + oldClientId + '_' : null;

    let foreignDayKeys = 0;
    let foreignOtherKeys = 0;
    let newClientDays = 0;

    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || !k.startsWith('heys_')) continue;

      // Skip global keys
      if (k === 'heys_client_current' || isSensitiveSessionStorageKey(k)) continue;

      if (k.startsWith(newPrefix)) {
        if (k.includes('dayv2_')) newClientDays++;
        continue;
      }

      // Any remaining client-scoped key that's NOT for the new client
      const leadId = getLeadingClientScopeId(k);
      if (leadId && leadId !== newClientId) {
        if (k.includes('dayv2_')) foreignDayKeys++;
        else foreignOtherKeys++;
      }
    }

    if (foreignDayKeys > 0) {
      anomalies.push({ type: 'foreign_day_keys', count: foreignDayKeys, oldClient: oldClientId?.slice(0, 8) });
    }
    if (foreignOtherKeys > 0) {
      anomalies.push({ type: 'foreign_other_keys', count: foreignOtherKeys, oldClient: oldClientId?.slice(0, 8) });
    }

    if (anomalies.length > 0) {
      console.error(
        `[HEYS.sync] 🚨 POST-SWITCH ANOMALY: ${anomalies.length} issue(s) detected ` +
        `after switch to ${newClientId.slice(0, 8)}:`,
        anomalies.map(a => `${a.type}=${a.count}`).join(', ')
      );
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:switch-anomaly', {
          detail: { newClient: newClientId.slice(0, 8), oldClient: oldClientId?.slice(0, 8), anomalies, newClientDays }
        }));
      }
    } else {
      console.info(`[HEYS.sync] ✅ Post-switch clean: ${newClientDays} day keys, 0 foreign keys`);
    }

    return anomalies.length > 0 ? anomalies : null;
  }

  // 🔧 Dedup set: log foreign scope anomaly summary only once per sync cycle.
  const _scopeFixLoggedKeys = new Set();
  let _scopeFixSummaryLogged = false;
  const _cloudGarbageCleanupInFlight = new Map();
  const _cloudGarbageCleanupLastRun = new Map();

  function createCloudGarbageCollector() {
    return {
      foreign: new Set(),
      doubleScoped: new Set(),
      quoted: new Set(),
      sensitive: new Set()
    };
  }

  function recordCloudGarbageCandidate(collector, kind, key) {
    if (!collector || !kind || !key || !collector[kind]) return;
    collector[kind].add(key);
  }

  function getCloudGarbageKeys(collector) {
    if (!collector) return [];
    return Array.from(new Set([
      ...Array.from(collector.foreign || []),
      ...Array.from(collector.doubleScoped || []),
      ...Array.from(collector.quoted || []),
      ...Array.from(collector.sensitive || [])
    ].filter(Boolean)));
  }

  function logCloudGarbageSummary(clientId, collector, source) {
    if (!clientId || !collector) return 0;
    const foreignCount = collector.foreign?.size || 0;
    const doubleScopedCount = collector.doubleScoped?.size || 0;
    const quotedCount = collector.quoted?.size || 0;
    const sensitiveCount = collector.sensitive?.size || 0;
    const total = foreignCount + doubleScopedCount + quotedCount + sensitiveCount;
    if (!total) return 0;

    const sample = getCloudGarbageKeys(collector).slice(0, 4).join(', ');
    logCritical(
      `🧹 [CLOUD GARBAGE] ${source}: client=${clientId.slice(0, 8)} ` +
      `foreign=${foreignCount} double=${doubleScopedCount} quoted=${quotedCount} sensitive=${sensitiveCount}` +
      (sample ? ` | sample=${sample}` : '')
    );
    return total;
  }

  cloud.cleanupCloudGarbageKeys = async function (clientId, keys, source = 'sync') {
    const uniqueKeys = Array.from(new Set(Array.isArray(keys) ? keys.filter(Boolean) : []));
    if (!clientId || uniqueKeys.length === 0) {
      return { deleted: 0, failed: 0, skipped: true };
    }

    const existing = _cloudGarbageCleanupInFlight.get(clientId);
    if (existing) return existing;

    const cleanupPromise = (async () => {
      try {
        const YandexAPI = global.HEYS?.YandexAPI || global.YandexAPI;
        const isPinAuth = _pinAuthClientId && _pinAuthClientId === clientId;
        if (!YandexAPI?.rest) {
          return { deleted: 0, failed: uniqueKeys.length, error: 'YandexAPI unavailable' };
        }
        if (!user && !isPinAuth) {
          return { deleted: 0, failed: uniqueKeys.length, error: 'Not authenticated' };
        }

        let deleted = 0;
        let failed = 0;
        for (const key of uniqueKeys) {
          try {
            const { error } = await YandexAPI.rest('client_kv_store', {
              method: 'DELETE',
              filters: {
                'eq.client_id': clientId,
                'eq.k': key
              }
            });
            if (error) failed += 1;
            else deleted += 1;
          } catch (_) {
            failed += 1;
          }
        }

        _cloudGarbageCleanupLastRun.set(clientId, Date.now());
        if (deleted > 0 || failed > 0) {
          logCritical(`☁️ [CLOUD CLEANUP] ${source}: client=${clientId.slice(0, 8)} deleted=${deleted} failed=${failed}`);
        }
        return { deleted, failed };
      } finally {
        _cloudGarbageCleanupInFlight.delete(clientId);
      }
    })();

    _cloudGarbageCleanupInFlight.set(clientId, cleanupPromise);
    return cleanupPromise;
  };

  function scheduleCloudGarbageCleanup(clientId, collector, source) {
    const keys = getCloudGarbageKeys(collector);
    if (!clientId || keys.length === 0) return;

    logCloudGarbageSummary(clientId, collector, source);

    const lastRun = _cloudGarbageCleanupLastRun.get(clientId) || 0;
    if ((Date.now() - lastRun) < 15000) return;

    setTimeout(() => {
      cloud.cleanupCloudGarbageKeys(clientId, keys, source)
        .catch((e) => console.warn('[CLOUD GARBAGE CLEANUP] Error:', e?.message || e));
    }, 0);
  }

  function scopeKeyForClientStorage(key, clientId) {
    if (!clientId || typeof key !== 'string') return key;

    let normalized = stripCurrentClientScopePrefixes(key, clientId);

    if (normalized.startsWith(`heys_${clientId}_`)) {
      return normalized;
    }

    if (isForeignClientScopedKey(normalized, clientId)) {
      // 🛡️ v65 FIX: foreign-scoped keys (including dayv2) are NOT adopted.
      // Previously dayv2 keys from other clients were re-scoped to the current
      // client, causing data contamination (wrong kcal, meals, etc.).
      // Caller must LOAD SKIP all foreign-scoped keys uniformly.
      if (!_scopeFixLoggedKeys.has(key)) {
        _scopeFixLoggedKeys.add(key);
      }
      if (!_scopeFixSummaryLogged) {
        _scopeFixSummaryLogged = true;
        logCritical('🐛 [SCOPE] Foreign-scoped cloud keys detected — adoption disabled; invalid rows will be skipped and scheduled for cleanup');
      }
      return normalized;
    }


    if (normalized.startsWith('heys_')) {
      return `heys_${clientId}_${normalized.slice('heys_'.length)}`;
    }

    if (normalized.startsWith('day_')) {
      return `day_${clientId}_${normalized.slice('day_'.length)}`;
    }

    return normalized;
  }

  /**
   * Нормализует ключ для Supabase: убирает embedded client_id
   * heys_{clientId}_dayv2_2025-12-11 → heys_dayv2_2025-12-11
   * @param {string} key - исходный ключ
   * @param {string} clientId - ID клиента
   * @returns {string} нормализованный ключ
   */
  function normalizeKeyForSupabase(key, clientId) {
    if (!clientId || typeof key !== 'string') return key;

    const feedbackKey = `heys_insights_feedback_${clientId}`;
    const normalized = stripCurrentClientScopePrefixes(key, clientId);

    // Специальный случай: feedback loop уже хранит client_id в суффиксе ключа,
    // а в client_kv_store client_id лежит отдельной колонкой.
    if (normalized === feedbackKey) {
      return 'heys_insights_feedback';
    }

    // 🔧 FIX: Если ключ всё ещё содержит чужой client scope — стрипаем ВСЕ
    // scope-префиксы. Cloud хранит ключи без embedded clientId (client_id
    // лежит в отдельной колонке), поэтому foreign prefix нужно убирать.
    if (isForeignClientScopedKey(normalized, clientId)) {
      return stripClientScopePrefixes(normalized).key;
    }

    return normalized;
  }

  /** Временный шард каталога при 413 на RPC — мержится с heys_products при download. */
  const HEYS_PRODUCTS_RPC_TAIL_K = 'heys_products_rpc_tail';
  const isProductsTailRpcKey = (k) => String(k || '') === HEYS_PRODUCTS_RPC_TAIL_K
    || String(k || '').startsWith(`${HEYS_PRODUCTS_RPC_TAIL_K}_`);

  /** Шард overlay v2 при 413 на RPC — мержится с heys_products_overlay_v2 при download. */
  const HEYS_OVERLAY_RPC_TAIL_K = 'heys_products_overlay_v2_rpc_tail';
  const isOverlayBaseKey = (k) => String(k || '') === 'heys_products_overlay_v2';
  const isOverlayTailRpcKey = (k) => String(k || '') === HEYS_OVERLAY_RPC_TAIL_K
    || String(k || '').startsWith(`${HEYS_OVERLAY_RPC_TAIL_K}_`);
  const MAX_TAIL_SHARDS = 16;

  // Numeric sort by trailing _N — fixes localeCompare bug where _tail_10 < _tail_2.
  const tailIndexFromKey = (k) => {
    const m = /_(\d+)$/.exec(String(k || ''));
    return m ? parseInt(m[1], 10) : 0;
  };
  const sortByTailIndex = (a, b, getter) => tailIndexFromKey(getter(a)) - tailIndexFromKey(getter(b));

  // Generic raw-rows tail merger — works for both products and overlay families.
  function mergeRpcTailRawClientRows(rows, clientId, isTailKey, mainKey) {
    if (!Array.isArray(rows) || rows.length === 0 || !clientId) return rows;
    const tailIdxs = [];
    let mainIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const nk = normalizeKeyForSupabase(rows[i]?.k, clientId);
      if (isTailKey(nk)) tailIdxs.push(i);
      if (nk === mainKey) mainIdx = i;
    }
    if (tailIdxs.length === 0) return rows;
    const tailSet = new Set(tailIdxs);
    const tailRows = tailIdxs
      .map((idx) => rows[idx])
      .sort((a, b) => sortByTailIndex(a, b, (r) => r?.k));
    const tailArr = [];
    for (let i = 0; i < tailRows.length; i++) {
      const arr = Array.isArray(tailRows[i]?.v) ? tailRows[i].v : [];
      if (arr.length) tailArr.push(...arr);
    }
    const out = rows.filter((_, i) => !tailSet.has(i));
    if (mainIdx >= 0) {
      const tailsBeforeMain = tailIdxs.filter((i) => i < mainIdx).length;
      const newMainIdx = mainIdx - tailsBeforeMain;
      const mainRow = out[newMainIdx];
      const mainArr = Array.isArray(mainRow?.v) ? mainRow.v : [];
      mainRow.v = [...mainArr, ...tailArr];
      return out;
    }
    const tr = tailRows[0] || rows[tailIdxs[0]];
    out.push({ ...tr, k: mainKey, v: tailArr });
    return out;
  }

  function mergeRpcTailDeduped(deduped, client_id, isTailKey, mainKey) {
    if (!Array.isArray(deduped) || !client_id) return deduped;
    const mainScoped = scopeKeyForClientStorage(mainKey, client_id);
    const tailIdxs = [];
    for (let i = 0; i < deduped.length; i++) {
      const scopedKey = String(deduped[i]?.scopedKey || '');
      const normalized = normalizeKeyForSupabase(scopedKey, client_id);
      if (isTailKey(normalized)) tailIdxs.push(i);
    }
    if (tailIdxs.length === 0) return deduped;
    const tailSet = new Set(tailIdxs);
    const tailEntries = tailIdxs
      .map((idx) => deduped[idx])
      .sort((a, b) => sortByTailIndex(a, b, (e) => e?.row?.k));
    const tailArr = [];
    for (let i = 0; i < tailEntries.length; i++) {
      const arr = Array.isArray(tailEntries[i]?.row?.v) ? tailEntries[i].row.v : [];
      if (arr.length) tailArr.push(...arr);
    }
    const withoutTail = deduped.filter((_, i) => !tailSet.has(i));
    const mi = withoutTail.findIndex(d => d.scopedKey === mainScoped);
    if (mi >= 0) {
      const r = withoutTail[mi].row;
      const mainArr = Array.isArray(r.v) ? r.v : [];
      r.v = [...mainArr, ...tailArr];
      return withoutTail;
    }
    withoutTail.push({
      scopedKey: mainScoped,
      row: { ...(tailEntries[0]?.row || {}), k: mainKey, v: tailArr }
    });
    return withoutTail;
  }

  function mergeProductsRpcTailRawClientRows(rows, clientId) {
    return mergeRpcTailRawClientRows(rows, clientId, isProductsTailRpcKey, 'heys_products');
  }

  function mergeProductsRpcTailDeduped(deduped, client_id) {
    return mergeRpcTailDeduped(deduped, client_id, isProductsTailRpcKey, 'heys_products');
  }

  function mergeOverlayRpcTailRawClientRows(rows, clientId) {
    return mergeRpcTailRawClientRows(rows, clientId, isOverlayTailRpcKey, 'heys_products_overlay_v2');
  }

  function mergeOverlayRpcTailDeduped(deduped, client_id) {
    return mergeRpcTailDeduped(deduped, client_id, isOverlayTailRpcKey, 'heys_products_overlay_v2');
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🌐 ГЛОБАЛЬНОЕ СОСТОЯНИЕ
  // ═══════════════════════════════════════════════════════════════════

  let client = null;
  cloud.client = null;
  let status = CONNECTION_STATUS.OFFLINE;
  let user = null;
  let muteMirror = false;
  let _syncPauseUntil = 0;
  let _syncPauseToken = 0;
  let _syncPauseReason = '';
  let _productsSaveBlockedUntil = 0;

  // 🔁 v4.9.x FUNDAMENTAL FIX: deferred retry для products после блок-окон
  // Старая архитектура: гейты waitingForSync, 20s product-grace, 10s general-grace
  // делали silent `return` — реальные user-правки терялись.
  // Новая архитектура: вместо drop'а — планируем повторную отправку,
  // которая дождётся закрытия окон, перечитает СВЕЖИЙ heys_products из localStorage
  // (учитывая cloud merge) и пере-вызовет saveClientKey. Идемпотентно — несколько
  // блокировок схлопываются в один retry; quality-проверки снова применятся.
  let _productsRetryScheduled = false;
  function scheduleProductsPostWindowRetry(client_id) {
    if (!client_id) return;
    if (_productsRetryScheduled) return;
    _productsRetryScheduled = true;

    const tryRetry = () => {
      if (!initialSyncCompleted) {
        setTimeout(tryRetry, 1000);
        return;
      }
      const ageAfterSync = cloud._syncCompletedAt ? (Date.now() - cloud._syncCompletedAt) : Infinity;
      const graceRemaining = Math.max(0, 20500 - ageAfterSync);
      const cooldownRemaining = Math.max(0, _productsSaveBlockedUntil - Date.now());
      const wait = Math.max(graceRemaining, cooldownRemaining);
      if (wait > 0) {
        setTimeout(tryRetry, wait + 100);
        return;
      }
      _productsRetryScheduled = false;
      try {
        // Phase ε: scoped legacy `heys_${cid}_products` is "frozen" under
        // overlay-mode — applyForegroundHotSyncValue (~:10689) explicitly skips
        // writing it back from cloud, and anti-shrink (~:10773) blocks
        // cloud→local overwrite. Reading raw scoped LS here can pick up a
        // stale, larger snapshot from a prior session and push it to cloud
        // — contradicting "cloud copy is no longer being pushed by us".
        // Prefer canonical merged view via HEYS.products.getAll() when ready;
        // fall back to scoped LS only when getAll is unavailable (early boot).
        let value = null;
        let source = 'unknown';
        try {
          if (HEYS && HEYS.products && typeof HEYS.products.getAll === 'function') {
            const canonical = HEYS.products.getAll();
            if (Array.isArray(canonical) && canonical.length > 0) {
              value = canonical;
              source = 'getAll';
            }
          }
        } catch (_) { /* fall through to LS */ }
        if (!Array.isArray(value) || value.length === 0) {
          const scopedKey = `heys_${client_id}_products`;
          const raw = global.localStorage && global.localStorage.getItem(scopedKey);
          if (!raw) return;
          try {
            value = HEYS && HEYS.store && typeof HEYS.store.decompress === 'function'
              ? HEYS.store.decompress(raw)
              : JSON.parse(raw);
          } catch (_) { return; }
          source = 'ls-scoped';
        }
        if (!Array.isArray(value) || value.length === 0) return;

        // Anti-grow guard: when value came from raw scoped LS (early-boot
        // fallback), compare against canonical merged view if it became
        // available. Refuse pushing dramatically inflated payloads — those
        // are the symptom of a poisoned scoped LS from a previous session.
        if (source === 'ls-scoped') {
          try {
            if (HEYS && HEYS.products && typeof HEYS.products.getAll === 'function') {
              const canonical = HEYS.products.getAll();
              const canonicalLen = Array.isArray(canonical) ? canonical.length : null;
              if (canonicalLen != null && canonicalLen > 0
                  && value.length > canonicalLen * 1.3
                  && value.length - canonicalLen > 30) {
                logCritical(`⛔ [PRODUCTS RETRY] BLOCKED grow: ls=${value.length} canonical=${canonicalLen} source=ls-scoped`);
                return;
              }
            }
          } catch (_) { /* anti-grow best-effort */ }
        }

        try { logCritical(`🔁 [PRODUCTS RETRY] Re-pushing products after windows closed: ${value.length} items source=${source}`); } catch (_) {}
        cloud.saveClientKey(client_id, 'heys_products', value);
      } catch (_) { /* best-effort */ }
    };

    setTimeout(tryRetry, 200);
  }

  cloud.pauseSync = function (durationMs = 10 * 60 * 1000, reason = '') {
    const now = Date.now();
    const until = now + Math.max(0, durationMs || 0);
    if (until > _syncPauseUntil) {
      _syncPauseUntil = until;
      _syncPauseReason = reason || _syncPauseReason || '';
    }
    _syncPauseToken += 1;
    return { token: _syncPauseToken, until: _syncPauseUntil, reason: _syncPauseReason };
  };

  cloud.resumeSync = function (token) {
    if (token && token.token && token.token !== _syncPauseToken) return false;
    _syncPauseUntil = 0;
    _syncPauseReason = '';
    return true;
  };

  cloud.isSyncPaused = function () {
    return Date.now() < _syncPauseUntil;
  };

  cloud.getSyncPauseUntil = function () {
    return _syncPauseUntil;
  };

  cloud.getSyncPauseReason = function () {
    return _syncPauseReason;
  };

  // 🔐 PIN-авторизация: client_id проверенный через verify_client_pin (без Supabase user)
  let _pinAuthClientId = null;
  let _rpcOnlyMode = false; // Режим RPC для сохранений (без Supabase user)

  cloud.setPinAuthClient = function (clientId) {
    _pinAuthClientId = clientId;
    _rpcOnlyMode = true;
    log('🔐 PIN auth client set + RPC mode ON:', clientId?.substring(0, 8) + '...');
  };
  cloud.getPinAuthClient = function () { return _pinAuthClientId; };
  cloud.clearPinAuthClient = function () {
    _pinAuthClientId = null;
    _rpcOnlyMode = false;
  };

  // Экспорт для отладки
  Object.defineProperty(cloud, '_rpcOnlyMode', { get: () => _rpcOnlyMode });
  Object.defineProperty(cloud, '_pinAuthClientId', { get: () => _pinAuthClientId });

  // 🔄 Флаг для предотвращения race condition между автовосстановлением и явным signIn
  let _signInInProgress = false;
  // v62: replaces dead _rpcSyncInProgress — set SYNCHRONOUSLY before fire-and-forget cloud.syncClient()
  // in PIN auth restore so controllerchange can detect this window and defer PWA reload.
  let _authSyncPending = false;
  let originalSetItem = null;
  let _logoutSuppressionUntil = 0;

  function isLogoutSuppressionActive() {
    try {
      if (global.HEYS?._isLoggingOut) return true;
    } catch (_) { }
    return Date.now() < _logoutSuppressionUntil;
  }

  function armLogoutSuppression(ms = 5000) {
    _logoutSuppressionUntil = Date.now() + ms;
    try {
      global.HEYS = global.HEYS || {};
      global.HEYS._logoutSuppressionUntil = _logoutSuppressionUntil;
    } catch (_) { }
  }

  // 🚨 Флаг блокировки сохранения до завершения первого sync
  let initialSyncCompleted = false;
  let failsafeTimerId = null;
  let _syncEverStarted = false; // 🔄 v5: true после первого вызова bootstrapClientSync
  cloud.isInitialSyncCompleted = function () { return initialSyncCompleted; };

  // 🔧 Debug getters (для консоли) — только если ещё не определены
  if (!Object.getOwnPropertyDescriptor(cloud, '_rpcOnlyMode')) {
    Object.defineProperty(cloud, '_initialSyncCompleted', { get: () => initialSyncCompleted });
    Object.defineProperty(cloud, '_authSyncPending', { get: () => _authSyncPending });
    Object.defineProperty(cloud, '_rpcOnlyMode', { get: () => _rpcOnlyMode });
    Object.defineProperty(cloud, '_pinAuthClientId', { get: () => _pinAuthClientId });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🔄 AUTO TOKEN REFRESH — автоматическое обновление истёкшего токена
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Проверяет токен и обновляет его если истёк.
   * Вызывается перед sync операциями.
   * 
   * @returns {Promise<{valid: boolean, refreshed: boolean, error?: string}>}
   */
  let _refreshInProgress = null; // Deduplication
  const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 минут до истечения — уже обновляем

  async function waitForSyncMethodReady(timeoutMs = 1500) {
    const hasSyncMethod = () => typeof cloud.bootstrapClientSync === 'function' || typeof cloud.syncClientViaRPC === 'function';
    if (hasSyncMethod()) return true;

    const startedAt = Date.now();
    while ((Date.now() - startedAt) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (hasSyncMethod()) return true;
    }

    return hasSyncMethod();
  }

  cloud.ensureValidToken = async function () {
    // PIN auth не использует токены куратора
    if (_rpcOnlyMode) {
      return { valid: true, refreshed: false };
    }

    // Deduplication: если проверка уже в процессе — ждём её
    if (_refreshInProgress) {
      log('🔄 [TOKEN] Verification already in progress, waiting...');
      return _refreshInProgress;
    }

    // Проверяем текущий токен
    const AUTH_KEY = 'heys_supabase_auth_token';
    let storedToken;
    try {
      const stored = global.localStorage?.getItem(AUTH_KEY);
      storedToken = stored ? JSON.parse(stored) : null;
    } catch (_) {
      storedToken = null;
    }

    if (!storedToken || !storedToken.access_token) {
      // Нет токена — нужен вход
      // 🚨 КРИТИЧНО: Сбрасываем user чтобы UI мог отреагировать
      user = null;
      status = CONNECTION_STATUS.OFFLINE;
      logCritical('🔐 [TOKEN] Токен отсутствует — требуется вход');
      return { valid: false, refreshed: false, error: 'no_token' };
    }

    // Проверяем expires_at
    const now = Date.now();
    const expiresAtMs = (storedToken.expires_at || 0) * 1000;
    const timeUntilExpiry = expiresAtMs - now;

    // ✅ FIX 2025-12-25: Если токен ещё свежий (>5 мин) — сразу возвращаем valid!
    // Раньше здесь был баг: при client=null (Supabase SDK удалён) всегда возвращался error
    if (timeUntilExpiry > TOKEN_REFRESH_BUFFER_MS) {
      logCritical('✅ [TOKEN] Токен валиден, истекает через', Math.round(timeUntilExpiry / 60000), 'мин');
      return { valid: true, refreshed: false };
    }

    // Токен истекает скоро или уже истёк — нужна проверка на сервере
    const isExpired = timeUntilExpiry <= 0;
    const minutesUntilExpiry = Math.round(timeUntilExpiry / 60000);
    logCritical(`🔄 [TOKEN] ${isExpired ? 'Токен истёк' : `Токен истекает через ${minutesUntilExpiry} мин`}, проверяем на сервере...`);

    // Запускаем проверку с deduplication
    _refreshInProgress = (async () => {
      try {
        // ✅ FIX 2025-12-25: Используем Yandex API вместо Supabase SDK
        // Supabase SDK был удалён, поэтому client = null всегда
        // Проверяем токен через YandexAPI.verifyCuratorToken()

        if (!global.YandexAPI || !global.YandexAPI.verifyCuratorToken) {
          // YandexAPI ещё не загружен — доверяем локальному токену если он не сильно просрочен
          if (timeUntilExpiry > -60 * 60 * 1000) { // Просрочен менее чем на час
            logCritical('⚠️ [TOKEN] YandexAPI не загружен, доверяем локальному токену');
            return { valid: true, refreshed: false };
          }
          logCritical('⚠️ [TOKEN] YandexAPI not loaded and token expired');
          return { valid: false, refreshed: false, error: 'api_not_loaded' };
        }

        // Проверяем токен на сервере
        const { data, error } = await global.YandexAPI.verifyCuratorToken(storedToken.access_token);

        if (error || !data?.valid) {
          logCritical('🔐 [TOKEN] Сервер отклонил токен:', error?.message || 'invalid');
          // НЕ очищаем токен автоматически — пусть пользователь сам решит
          // Это предотвращает случайный logout при временных проблемах с сетью
          if (isExpired) {
            // Только если токен реально истёк — требуем перелогин
            user = null;
            status = CONNECTION_STATUS.OFFLINE;
            return { valid: false, refreshed: false, error: 'token_expired', authRequired: true };
          }
          // Если не истёк — доверяем локально, возможно сеть глючит
          logCritical('⚠️ [TOKEN] Сервер отклонил, но локально не истёк — доверяем локальному');
          return { valid: true, refreshed: false };
        }

        // Сервер подтвердил токен — обновляем expires_at локально
        // JWT токен на сервере живёт 24ч, так что продлеваем на 1ч локально
        const freshExpiresAt = Math.floor(Date.now() / 1000) + 3600;
        const tokenData = {
          ...storedToken,
          expires_at: freshExpiresAt,
          user: data.user || storedToken.user
        };

        try {
          const setFn = originalSetItem || global.localStorage.setItem.bind(global.localStorage);
          setFn(AUTH_KEY, JSON.stringify(tokenData));
          logCritical('✅ [TOKEN] Токен подтверждён, продлили expires_at до', new Date(freshExpiresAt * 1000).toISOString());
        } catch (e) {
          logCritical('⚠️ [TOKEN] Ошибка сохранения:', e?.message);
        }

        if (data.user) {
          user = data.user;
        }
        status = CONNECTION_STATUS.ONLINE;
        return { valid: true, refreshed: true };

      } catch (e) {
        logCritical('⚠️ [TOKEN] Ошибка проверки:', e?.message);
        // При ошибках сети — доверяем локальному токену если он не сильно просрочен
        if (timeUntilExpiry > -60 * 60 * 1000) {
          logCritical('⚠️ [TOKEN] Ошибка сети, доверяем локальному токену');
          return { valid: true, refreshed: false };
        }
        return { valid: false, refreshed: false, error: e?.message };
      } finally {
        _refreshInProgress = null;
      }
    })();

    return _refreshInProgress;
  };

  /**
   * 🔐 Универсальный sync — выбирает правильную стратегию (RPC для PIN auth, bootstrap для обычной)
   * In-flight deduplication: если sync уже в процессе — возвращаем тот же Promise
   * Автоматически обновляет токен если он истёк.
   * @param {string} clientId - ID клиента
   * @param {Object} options - { force: boolean }
   * @returns {Promise<{ success?: boolean, authRequired?: boolean, error?: string }>}
   */
  let _syncInFlight = null; // { clientId, promise }
  let _syncLastCompleted = {}; // 🚀 PERF: { clientId: timestamp } — cooldown after sync
  /** Пока идёт syncClient(clientId) — user-queue может использовать clientId до записи heys_client_current */
  let _activeSyncClientId = null;
  let _deferUserPushNoClientTimer = null;
  let _deferUserPushBackoffMs = 2500;
  const USER_QUEUE_NO_CLIENT_BACKOFF_MIN_MS = 2500;
  const USER_QUEUE_NO_CLIENT_BACKOFF_MAX_MS = 30000;

  cloud.syncClient = async function (clientId, options = {}) {
    // Deduplication: если sync для этого же клиента уже идёт — вернём тот же Promise
    if (_syncInFlight && _syncInFlight.clientId === clientId && !options.force) {
      log('🔄 [SYNC] Already in flight for', clientId.slice(0, 8) + '..., reusing promise');
      return _syncInFlight.promise;
    }

    // 🚀 PERF: Cooldown — skip sync if completed < 5s ago (unless force)
    if (!options.force && _syncLastCompleted[clientId]) {
      const elapsed = Date.now() - _syncLastCompleted[clientId];
      if (elapsed < 5000) {
        console.info('[HEYS.sync] ⏳ syncClient cooldown: ' + Math.round(elapsed) + 'ms since last sync, skipping');
        return { success: true, cached: true };
      }
    }

    logCritical('[syncClient] START clientId:', clientId?.slice(0, 8), 'user:', !!user, 'isPinAuth:', _rpcOnlyMode && _pinAuthClientId === clientId);

    _activeSyncClientId = clientId || null;
    clearDeferredUserPushNoClientTimer();
    _deferUserPushBackoffMs = USER_QUEUE_NO_CLIENT_BACKOFF_MIN_MS;

    // 🔧 Clear scope-fix dedup log set for fresh sync cycle
    _scopeFixLoggedKeys.clear();
    _scopeFixSummaryLogged = false;

    const isPinAuth = _rpcOnlyMode && _pinAuthClientId === clientId;

    // � PERF v7.0: Set _syncInFlight IMMEDIATELY (before async ensureValidToken)
    // to prevent race condition: DayTabWithCloudSync and syncEffects can call syncClient
    // before ensureValidToken resolves, slipping past the dedup check.
    const syncPromise = (async () => {
      try {
        const syncMethodReady = await waitForSyncMethodReady();
        if (!syncMethodReady) {
          return { success: false, deferred: true, error: 'sync_method_not_ready' };
        }

        // User-queue: clientId уже известен sync-циклу, даже если heys_client_current ещё не записан в LS
        try {
          if (user && (upsertQueue.length || upsertInFlightQueue.length) && !_userUploadInProgress) {
            if (upsertTimer) {
              clearTimeout(upsertTimer);
              upsertTimer = null;
            }
            schedulePush();
          }
        } catch (_) { /* очереди ещё не инициализированы — пропуск */ }

        // 🔄 AUTO REFRESH: Проверяем и обновляем токен перед sync (только для куратора)
        if (!isPinAuth && typeof cloud.ensureValidToken === 'function') {
          const tokenResult = await cloud.ensureValidToken();
          if (!tokenResult.valid) {
            logCritical('🔐 [SYNC] Токен недействителен:', tokenResult.error);
            return {
              success: false,
              authRequired: true,
              error: tokenResult.error
            };
          }
          if (tokenResult.refreshed) {
            logCritical('🔄 [SYNC] Токен обновлён перед синхронизацией');
          }
        }

        let result;
        let usedSyncStrategy = false;
        // v60 FIX: PIN clients now use bootstrapClientSync (paginated REST)
        // instead of syncClientViaRPC (monolithic RPC that 502s on 530+ keys).
        // bootstrapClientSync uses heys-api-rest CF with PAGE_SIZE=400 pagination,
        // Phase A fast-load (5 critical keys → UI unblocked), and delta sync.
        if (typeof cloud.bootstrapClientSync === 'function') {
          usedSyncStrategy = true;
          // 🔧 v63 FIX #2: sync-level retry — if bootstrapClientSync throws
          // (502 cold start, network blip), retry once after 3s delay.
          try {
            result = await cloud.bootstrapClientSync(clientId, options);
          } catch (syncErr) {
            logCritical('[SYNC] ⚠️ bootstrapClientSync failed, retrying in 3s:', syncErr?.message || syncErr);
            await new Promise(r => setTimeout(r, 3000));
            result = await cloud.bootstrapClientSync(clientId, options);
          }
        } else if (isPinAuth && typeof cloud.syncClientViaRPC === 'function') {
          // Legacy fallback: syncClientViaRPC only if bootstrapClientSync unavailable
          usedSyncStrategy = true;
          result = await cloud.syncClientViaRPC(clientId);
        }

        // v61.1: distinguish benign no-op/skip from real missing strategy.
        if (!usedSyncStrategy) {
          result = { success: false, error: 'No sync method available at boot time' };
        } else if (typeof result === 'undefined') {
          result = { success: true, skipped: true, reason: 'noop_or_throttled' };
          log('[SYNC] Strategy finished without payload — treating as benign no-op');
        }

        // ⚡ v5.2.0: Invalidate pattern cache after successful sync
        if (result?.success && HEYS.InsightsPI?.cache?.invalidateCache) {
          HEYS.InsightsPI.cache.invalidateCache('all');
          logCritical('🔄 [SYNC] Pattern cache invalidated after successful sync');
        }

        return result;
      } finally {
        // Очищаем in-flight после завершения
        if (_syncInFlight && _syncInFlight.clientId === clientId) {
          _syncInFlight = null;
        }
        if (_activeSyncClientId === clientId) {
          _activeSyncClientId = null;
        }
        // 🚀 PERF: Record completion time for cooldown
        _syncLastCompleted[clientId] = Date.now();
      }
    })();

    _syncInFlight = { clientId, promise: syncPromise };
    return syncPromise;
  };

  function clearDeferredUserPushNoClientTimer() {
    if (_deferUserPushNoClientTimer) {
      clearTimeout(_deferUserPushNoClientTimer);
      _deferUserPushNoClientTimer = null;
    }
  }

  /**
   * User-queue не может уйти в RPC без clientId; вместо schedulePush(300ms) — backoff, иначе спам re-queue.
   * Когда появится getCurrentClientId / HEYS.currentClientId / _activeSyncClientId — обычный schedulePush.
   */
  function scheduleUserQueueRetryWhenNoClient() {
    if (_deferUserPushNoClientTimer) return;
    const tick = () => {
      _deferUserPushNoClientTimer = null;
      if (!user || (!upsertQueue.length && !upsertInFlightQueue.length)) {
        _deferUserPushBackoffMs = USER_QUEUE_NO_CLIENT_BACKOFF_MIN_MS;
        return;
      }
      const rpcTarget = (typeof cloud.getCurrentClientId === 'function' && cloud.getCurrentClientId())
        || global.HEYS?.currentClientId
        || _activeSyncClientId;
      if (rpcTarget) {
        _deferUserPushBackoffMs = USER_QUEUE_NO_CLIENT_BACKOFF_MIN_MS;
        if (upsertTimer) {
          clearTimeout(upsertTimer);
          upsertTimer = null;
        }
        schedulePush();
        return;
      }
      const delay = Math.min(_deferUserPushBackoffMs, USER_QUEUE_NO_CLIENT_BACKOFF_MAX_MS);
      _deferUserPushBackoffMs = Math.min(
        Math.max(Math.floor(_deferUserPushBackoffMs * 1.5), USER_QUEUE_NO_CLIENT_BACKOFF_MIN_MS),
        USER_QUEUE_NO_CLIENT_BACKOFF_MAX_MS,
      );
      _deferUserPushNoClientTimer = setTimeout(tick, delay);
    };
    _deferUserPushNoClientTimer = setTimeout(tick, _deferUserPushBackoffMs);
  }

  // v61: Expose sync-in-flight state for PWA reload deferral (heys_platform_apis_v1.js checks this)
  cloud.isSyncing = () => (_syncInFlight ? _syncInFlight.promise : null);
  // v62: Expose pre-sync auth pending flag — set BEFORE _syncInFlight is created (PIN auth race window)
  cloud.isAuthSyncPending = () => _authSyncPending;

  // ═══════════════════════════════════════════════════════════════════
  // � PULL-REFRESH ORCHESTRATION API
  // Single entry point: handles flush + sync + structured result.
  // UI layer should call this instead of manually assembling flush → delay → syncClient.
  // ═══════════════════════════════════════════════════════════════════
  cloud.pullRefresh = async function (clientId) {
    if (!clientId) {
      clientId = cloud.getCurrentClientId?.() ||
        (global.HEYS?.utils?.getCurrentClientId?.());
      if (!clientId) return { success: false, status: 'error', error: 'no_client_id' };
    }

    const start = performance.now();

    // 1. Flush pending writes — sync engine owns consistency, no time-based guesses
    const pendingCount = cloud.getPendingCount?.() || 0;
    if (pendingCount > 0) {
      console.info('[HEYS.pullRefresh] ⏳ Flushing', pendingCount, 'pending writes...');
      await cloud.flushPendingQueue(5000);
    }

    // 2. Force delta sync (all heavy lifting delegated to syncClient)
    const result = await cloud.syncClient(clientId, { force: true });

    // 3. Enrich with total duration including flush time
    const totalMs = Math.round(performance.now() - start);
    return {
      ...(result || {}),
      success: result?.success !== false,
      totalMs,
      pendingFlushed: pendingCount
    };
  };

  // ═══════════════════════════════════════════════════════════════════
  // �🔐 AUTH TOKEN SANITIZE (RTR-safe)
  // ═══════════════════════════════════════════════════════════════════
  // ВАЖНО: делаем это СРАЗУ при загрузке скрипта, до heys_app_v12.js.
  // Иначе app может увидеть протухший токен и/или Supabase SDK может попытаться
  // refresh'нуть одноразовый refresh_token (RTR) → 400 refresh_token_already_used.
  const OLD_AUTH_KEY__BOOT = 'sb-ukqolcziqcuplqfgrmsh-auth-token';
  const NEW_AUTH_KEY__BOOT = 'heys_supabase_auth_token';

  function sanitizeStoredAuthToken__BOOT() {
    try {
      const stored = global.localStorage && global.localStorage.getItem
        ? global.localStorage.getItem(NEW_AUTH_KEY__BOOT)
        : null;
      if (!stored) return;

      const parsed = JSON.parse(stored);
      const accessToken = parsed?.access_token;
      const storedUser = parsed?.user;

      // Если токен битый/неполный — удаляем
      // ⚠️ НЕ проверяем expires_at — в нашем Supabase проекте токены INFINITE (отключены)
      // Supabase SDK всё равно возвращает expires_at = now + 1 hour по умолчанию,
      // но это не означает что токен реально истечёт!
      if (!accessToken || !storedUser) {
        try {
          global.localStorage.removeItem(NEW_AUTH_KEY__BOOT);
          global.localStorage.removeItem(OLD_AUTH_KEY__BOOT);
        } catch (_) { }
        return;
      }

      // Токен выглядит валидным — оставляем
      // (реальная проверка будет при первом запросе к Supabase)
    } catch (e) {
      // Не парсится → удаляем
      try {
        global.localStorage.removeItem(NEW_AUTH_KEY__BOOT);
        global.localStorage.removeItem(OLD_AUTH_KEY__BOOT);
      } catch (_) { }
    }
  }

  // Запускаем раннюю санацию (sync)
  sanitizeStoredAuthToken__BOOT();

  // 🔄 FAILSAFE: Если sync не завершился за N секунд — разрешаем сохранения
  // На localhost: 30 сек (throttled network may need more time)
  // В production: 45 сек (пользователю нужно время на ввод логина/пароля)
  const isLocalhostDev = typeof window !== 'undefined' &&
    (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1');
  const FAILSAFE_TIMEOUT_MS = isLocalhostDev ? 30000 : 45000;

  function startFailsafeTimer() {
    if (failsafeTimerId) clearTimeout(failsafeTimerId);
    failsafeTimerId = setTimeout(() => {
      if (!initialSyncCompleted) {
        // 🔄 v5: Не стреляем если sync ещё не начинался (скрипты грузятся на медленной сети)
        if (!_syncEverStarted) {
          logCritical('⏳ [FAILSAFE] Timer fired but sync not started yet (scripts still loading) — deferring');
          return;
        }
        logCritical(`⚠️ [FAILSAFE] Sync timeout (${FAILSAFE_TIMEOUT_MS / 1000}s) — enabling offline mode`);
        initialSyncCompleted = true;
      }
    }, FAILSAFE_TIMEOUT_MS);
  }

  function cancelFailsafeTimer() {
    if (failsafeTimerId) {
      clearTimeout(failsafeTimerId);
      failsafeTimerId = null;
    }
  }

  // Запускаем failsafe при загрузке (будет отменён при signIn)
  startFailsafeTimer();

  // ═══════════════════════════════════════════════════════════════════
  // 📦 ПЕРСИСТЕНТНАЯ ОЧЕРЕДЬ СИНХРОНИЗАЦИИ
  // ═══════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════
  // 🔀 MERGE ЛОГИКА ДЛЯ КОНФЛИКТОВ
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Merge items (продукты) внутри meal по ID
   * @param {Array} remoteItems - items из облака
   * @param {Array} localItems - локальные items
   * @param {boolean} preferLocal - если true, локальная версия побеждает при конфликте
   *                                если false, берём ТОЛЬКО remote items (для pull-to-refresh)
   * @returns {Array} объединённый массив items
   */
  function mergeItemsById(remoteItems = [], localItems = [], preferLocal = true) {
    // 🆕 При preferLocal=false (preferRemote): берём ТОЛЬКО remote items
    // Это нужно чтобы удаления с других устройств применялись при pull-to-refresh
    if (!preferLocal) {
      return remoteItems.filter(item => item && item.id);
    }

    // preferLocal=true: объединяем оба списка, local версии перезаписывают remote
    const itemsMap = new Map();

    // Добавляем remote items
    remoteItems.forEach(item => {
      if (item && item.id) {
        itemsMap.set(item.id, item);
      }
    });

    // Добавляем/заменяем local items
    localItems.forEach(item => {
      if (item && item.id) {
        itemsMap.set(item.id, item);
      }
    });

    return Array.from(itemsMap.values());
  }

  /**
   * Remove stale saved display nutrients when the diary has no food lines (same invariant as dayMealsIntegrity).
   */
  function stripStaleSavedDisplayNutrientsIfEmptyDiary(dayObj) {
    if (!dayObj || typeof dayObj !== 'object') return dayObj;
    const meals = Array.isArray(dayObj.meals) ? dayObj.meals : [];
    const hasItems = meals.some((m) => Array.isArray(m?.items) && m.items.length > 0);
    if (hasItems) return dayObj;
    const next = { ...dayObj };
    delete next.savedEatenKcal;
    delete next.savedDisplayOptimum;
    delete next.savedEatenProt;
    delete next.savedEatenCarbs;
    delete next.savedEatenFat;
    delete next.savedEatenFiber;
    return next;
  }

  /**
   * Умный merge данных дня при конфликте local vs remote
   * Стратегия: объединить meals по ID, взять максимальные значения для числовых полей
   * @param {Object} local - локальные данные дня
   * @param {Object} remote - данные из облака
   * @returns {Object|null} merged данные или null если merge не нужен
   */
  /**
   * Merge day data from two sources
   * @param {Object} local - локальные данные дня
   * @param {Object} remote - данные из облака
   * @param {Object} options - опции
   * @param {boolean} options.forceKeepAll - при true НЕ считать meals "удалёнными", объединять ВСЕ
   * @param {boolean} options.preferRemote - при true, remote items/meals побеждают (для pull-to-refresh)
   */
  function mergeDayData(local, remote, options = {}) {
    const forceKeepAll = options.forceKeepAll || false;
    const preferRemote = options.preferRemote || false; // 🆕 Для pull-to-refresh: remote побеждает
    // Приводим тренировки к новой схеме (quality/feelAfter → mood/wellbeing/stress)
    const normalizeTrainings = (trainings = []) => trainings.map((t = {}) => {
      if (t.quality !== undefined || t.feelAfter !== undefined) {
        const { quality, feelAfter, ...rest } = t;
        return {
          ...rest,
          mood: rest.mood ?? quality ?? 5,
          wellbeing: rest.wellbeing ?? feelAfter ?? 5,
          stress: rest.stress ?? 5
        };
      }
      return t;
    });

    local = {
      ...local,
      trainings: normalizeTrainings(local?.trainings)
    };
    remote = {
      ...remote,
      trainings: normalizeTrainings(remote?.trainings)
    };

    if (!local || !remote) return null;

    // PERF #8 + Foundation 0: content-hash вместо двойного JSON.stringify.
    // Раньше: O(meals + trainings + supplements) sequenся на каждый sync-tick.
    // Теперь: hashDay использует cached _h полей → O(1) после первой инициализации.
    // Fallback на stringify сохранён, если contentHash не загружен (load-order edge).
    const ch = global.HEYS?.contentHash;
    if (ch && typeof ch.hashDay === 'function') {
      // Hash без updatedAt — оба объекта проходят те же шаги hash, updatedAt не входит в primitives части
      const localHash = ch.hashDay(local);
      const remoteHash = ch.hashDay(remote);
      if (localHash === remoteHash) return null;
    } else {
      const localJson = JSON.stringify({ ...local, updatedAt: 0, _sourceId: '' });
      const remoteJson = JSON.stringify({ ...remote, updatedAt: 0, _sourceId: '' });
      if (localJson === remoteJson) return null;
    }

    const merged = {
      ...remote, // База — remote
      date: local.date || remote.date,
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, Date.now()),
      _mergedAt: Date.now(),
    };

    // 📊 Числовые поля: для шагов/воды берём максимум, для householdMin — свежее
    // Логика шаги/вода: если на одном устройстве ввели 5000 шагов, а на другом 8000 — значит 8000 актуальнее
    // Логика householdMin: это редактируемое значение, берём свежее
    merged.steps = Math.max(local.steps || 0, remote.steps || 0);
    merged.waterMl = Math.max(local.waterMl || 0, remote.waterMl || 0);

    // householdMin — берём свежее значение (редактируемое поле)
    // householdActivities — массив активностей
    if ((local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      merged.householdMin = local.householdMin ?? remote.householdMin ?? 0;
      merged.householdTime = local.householdTime ?? remote.householdTime ?? '';
      merged.householdActivities = local.householdActivities || remote.householdActivities || undefined;
    } else {
      merged.householdMin = remote.householdMin ?? local.householdMin ?? 0;
      merged.householdTime = remote.householdTime ?? local.householdTime ?? '';
      merged.householdActivities = remote.householdActivities || local.householdActivities || undefined;
    }

    // 📊 Вес: берём ЛЮБОЕ ненулевое значение (приоритет — свежему)
    // ВАЖНО: вес может быть 0 у нового пустого дня, поэтому приоритет ненулевому
    if (local.weightMorning && remote.weightMorning) {
      // Оба есть — берём свежее
      merged.weightMorning = (local.updatedAt || 0) >= (remote.updatedAt || 0)
        ? local.weightMorning
        : remote.weightMorning;
    } else {
      // Берём любое ненулевое
      merged.weightMorning = local.weightMorning || remote.weightMorning || 0;
    }

    // 😴 Сон: берём непустые значения (приоритет свежему только если оба заполнены)
    merged.sleepStart = local.sleepStart || remote.sleepStart || '';
    merged.sleepEnd = local.sleepEnd || remote.sleepEnd || '';
    merged.sleepQuality = local.sleepQuality || remote.sleepQuality || '';
    merged.sleepNote = local.sleepNote || remote.sleepNote || '';

    // ⭐ Оценка дня: приоритет вручную установленной
    if (local.dayScoreManual) {
      merged.dayScore = local.dayScore;
      merged.dayScoreManual = true;
    } else if (remote.dayScoreManual) {
      merged.dayScore = remote.dayScore;
      merged.dayScoreManual = true;
    } else {
      merged.dayScore = local.dayScore || remote.dayScore || '';
    }
    merged.dayComment = local.dayComment || remote.dayComment || '';

    // 🌸 Cycle: намеренный сброс (null) имеет приоритет если local свежее
    // cycleDay: 1-7 = день цикла, null = сброшено, undefined = не было данных
    if (local.cycleDay === null && (local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      // Намеренный сброс — local свежее и явно установил null
      merged.cycleDay = null;
    } else if (remote.cycleDay === null && (remote.updatedAt || 0) > (local.updatedAt || 0)) {
      // Remote свежее и сбросил
      merged.cycleDay = null;
    } else {
      // Берём непустое значение
      merged.cycleDay = local.cycleDay || remote.cycleDay || null;
    }

    // �🍽️ Meals: merge по ID с учётом УДАЛЕНИЙ
    // Если local свежее и meal отсутствует в local — значит удалён!
    // НО: при forceKeepAll — объединяем ВСЁ (для pull-to-refresh после фикса багов)
    const localMeals = local.meals || [];
    const remoteMeals = remote.meals || [];
    const mealsMap = new Map();
    const localMealIds = new Set(localMeals.filter(m => m?.id).map(m => m.id));
    const localIsNewer = (local.updatedAt || 0) >= (remote.updatedAt || 0);

    // morningActivation: merge by freshness, but 'done'/'missed' status takes priority
    // NOTE: This block must appear AFTER 'const localIsNewer' to avoid TDZ ReferenceError
    {
      const localMA = local.morningActivation || null;
      const remoteMA = remote.morningActivation || null;
      const localMAStatus = localMA?.status;
      const remoteMAStatus = remoteMA?.status;
      if (localMAStatus === 'done' || localMAStatus === 'missed') {
        // Local status confirmed — always take local
        merged.morningActivation = localMA;
      } else if (remoteMAStatus === 'done' || remoteMAStatus === 'missed') {
        // Remote confirmed, local not — take remote
        merged.morningActivation = remoteMA;
      } else if (localIsNewer) {
        merged.morningActivation = localMA ?? remoteMA ?? null;
      } else {
        merged.morningActivation = remoteMA ?? localMA ?? null;
      }
    }

    // Добавляем remote meals, но ТОЛЬКО если:
    // 1. forceKeepAll = true (pull-to-refresh: берём ВСЕ meals), ИЛИ
    // 2. Local НЕ свежее (remote приоритетнее), ИЛИ
    // 3. Meal присутствует в local (не был удалён)
    remoteMeals.forEach(meal => {
      if (!meal || !meal.id) return;

      if (!forceKeepAll && !preferRemote && localIsNewer && !localMealIds.has(meal.id)) {
        // Local свежее и этого meal нет в local = УДАЛЁН пользователем
        log(`🗑️ [MERGE] Meal ${meal.id} deleted locally, skipping from remote`);
        return;
      }

      mealsMap.set(meal.id, meal);
    });

    // Потом local meals — если ID совпадает, берём ЛОКАЛЬНУЮ версию (она более свежая)
    // ВАЖНО: При удалении item из приёма — locаl имеет меньше items, но это правильно!
    // При ДОБАВЛЕНИИ item — нужен merge items по ID чтобы не терять данные с других устройств
    // 🆕 При preferRemote — remote items побеждают (для pull-to-refresh)
    localMeals.forEach(meal => {
      if (!meal || !meal.id) return;
      const existing = mealsMap.get(meal.id);
      if (!existing) {
        // 🆕 При preferRemote: если meal нет в remote — это может быть локальное добавление
        // которое ещё не синкнулось. Оставляем его.
        mealsMap.set(meal.id, meal);
      } else {
        // Конфликт по ID — MERGE items внутри meal!
        // 🆕 При preferRemote: remote items имеют приоритет (удаления применяются)
        const preferLocal = preferRemote ? false : localIsNewer;

        if (preferRemote) {
          // 🔇 PERF: Отключено — слишком много логов при merge
          // logCritical(`🔄 [MERGE] preferRemote: meal "${meal.name}" | local items: ${meal.items?.length || 0} | remote items: ${existing.items?.length || 0} → using remote`);
        }

        const mergedItems = mergeItemsById(existing.items || [], meal.items || [], preferLocal);

        // Берём остальные поля из более свежей версии
        // 🆕 При preferRemote: берём remote как базу
        const mergedMeal = preferRemote
          ? { ...meal, ...existing, items: mergedItems } // remote (existing) поля поверх local
          : localIsNewer
            ? { ...existing, ...meal, items: mergedItems }
            : { ...meal, ...existing, items: mergedItems };

        mealsMap.set(meal.id, mergedMeal);
      }
    });

    merged.meals = Array.from(mealsMap.values())
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    // 🏋️ Trainings: merge по индексу, берём свежую версию
    const localTrainings = local.trainings || [];
    const remoteTrainings = remote.trainings || [];
    merged.trainings = [];

    // Local свежее — берём local тренировки как базу
    const localIsNewerForTrainings = (local.updatedAt || 0) >= (remote.updatedAt || 0);

    const isMorningActivationTrainingRow = (t) => {
      if (!t || typeof t !== 'object') return false;
      if (t.source === 'morning_activation') return true;
      const lab = String(t.activityLabel || '').trim().toLowerCase();
      return lab === 'зарядка';
    };
    const localMaStatusForTrainings = local.morningActivation?.status;
    const protectLocalMorningActivationRow =
      localMaStatusForTrainings === 'done' || localMaStatusForTrainings === 'missed';

    /** Для workout_builder сумма z часто 0 — без этого remote «пустышка» затирает локальный дневник. */
    const workoutLogRichness = (t) => {
      if (!t || !t.workoutLog || typeof t.workoutLog !== 'object') return 0;
      const wl = t.workoutLog;
      const n = Array.isArray(wl.exercises) ? wl.exercises.length : 0;
      let score = n * 10;
      if (n > 1) score += 5;
      if (Array.isArray(wl.zoneMinutes) && wl.zoneMinutes.some((m) => +m > 0)) score += 100;
      try {
        const fn = global.HEYS && global.HEYS.dayCalculations && typeof global.HEYS.dayCalculations.workoutLogHasTrackableContent === 'function'
          ? global.HEYS.dayCalculations.workoutLogHasTrackableContent
          : null;
        if (fn && fn(wl)) score += 1000;
      } catch (e) { /* noop */ }
      return score;
    };

    const maxTrainings = Math.max(localTrainings.length, remoteTrainings.length, 3);
    for (let i = 0; i < maxTrainings; i++) {
      const lt = localTrainings[i] || { z: [0, 0, 0, 0] };
      const rt = remoteTrainings[i] || { z: [0, 0, 0, 0] };

      // Берём тренировку из более свежего источника
      const ltSum = (lt.z || []).reduce((a, b) => a + (b || 0), 0);
      const rtSum = (rt.z || []).reduce((a, b) => a + (b || 0), 0);

      // Выбираем базовую версию по updatedAt
      // ВАЖНО: если local свежее и пустая — это НАМЕРЕННОЕ удаление!
      let winner;
      if (localIsNewerForTrainings) {
        // Local свежее — всегда берём local (даже если пустая = удалена)
        winner = lt;
      } else if (ltSum === 0 && rtSum > 0) {
        // Local не свежее и пустая — берём remote
        winner = rt;
      } else if (rtSum === 0 && ltSum > 0) {
        // Remote пустая, local непустая — берём local
        winner = lt;
      } else if (ltSum === 0 && rtSum === 0) {
        const lRich = workoutLogRichness(lt);
        const rRich = workoutLogRichness(rt);
        if (lRich > rRich) {
          winner = lt;
        } else if (rRich > lRich) {
          winner = rt;
        } else if (lRich > 0 && rRich > 0) {
          // Одинаковый «вес» дневника — не отдаём приоритет устаревшему remote только из‑за дня
          winner = lt;
        } else if (protectLocalMorningActivationRow && isMorningActivationTrainingRow(lt) && !isMorningActivationTrainingRow(rt)) {
          winner = lt;
        } else {
          winner = rt;
        }
      } else {
        // Обе непустые, remote свежее — по умолчанию remote; но не затираем строку «Зарядка»,
        // если в облаке на том же слоте ещё старая тренировка (лаг синка после done/missed).
        if (protectLocalMorningActivationRow && isMorningActivationTrainingRow(lt) && !isMorningActivationTrainingRow(rt)) {
          winner = lt;
        } else {
          winner = rt;
        }
      }
      const loser = winner === lt ? rt : lt;

      // ВСЕГДА объединяем оценки (mood/wellbeing/stress) из обеих версий
      // Берём значение которое ЗАДАНО (не undefined), предпочитаем winner
      const getMergedRating = (field) => {
        const wVal = winner[field];
        const lVal = loser[field];
        // Предпочитаем значение от winner если оно задано (включая 0!)
        if (wVal !== undefined) return wVal;
        if (lVal !== undefined) return lVal;
        return undefined; // Не задано ни там ни там
      };

      winner = {
        ...winner,
        // Объединяем оценки — берём заданные из любой версии
        mood: getMergedRating('mood'),
        wellbeing: getMergedRating('wellbeing'),
        stress: getMergedRating('stress'),
        // Удаляем старые поля если они пустые
        quality: undefined,
        feelAfter: undefined
      };

      merged.trainings.push(winner);
    }

    log('🔀 [MERGE] Result:', {
      meals: merged.meals.length,
      steps: merged.steps,
      water: merged.waterMl,
      trainings: merged.trainings.filter(t => t.z?.some(z => z > 0)).length
    });

    return stripStaleSavedDisplayNutrientsIfEmptyDiary(merged);
  }

  /**
   * Merge products when local and remote conflict.
   *
   * Strategy overview:
   * 1) Deduplicate each side by normalized name (name is the ONLY identity key).
   * 2) For duplicates, keep the "better" product by data completeness score.
   * 3) Merge remote + local by name, preferring the better product version.
   *
   * Architecture note:
   * - Name is the canonical identity key (UI prevents duplicates by name).
   * - Product IDs are not used for identity during merge.
   *
  * @param {Array<Object>} localProducts - Products from local storage.
  * @param {Array<Object>} remoteProducts - Products from cloud storage.
  * @returns {Array<Object>} Merged products (deduped by name).
  * @see isBetterProduct
  * @see normalizeName
   */
  function mergeProductsData(localProducts, remoteProducts) {
    const local = Array.isArray(localProducts) ? localProducts : [];
    const remote = Array.isArray(remoteProducts) ? remoteProducts : [];

    /**
     * Normalize product name for identity key comparison.
     * @param {string} name
     * @returns {string}
     */
    const normalizeName = (name) => String(name || '').trim().toLowerCase();

    /**
     * Check if product has a valid identity name.
     * @param {Object} p
     * @returns {boolean}
     */
    const isValidProduct = (p) => {
      if (!p) return false;
      const name = normalizeName(p.name);
      return name.length > 0;
    };

    /**
     * 🆕 v4.8.0: Check if product is in deleted products ignore list.
     * Prevents "zombie" products from resurrecting via cloud sync.
     * @param {Object} p
     * @returns {boolean}
     */
    // 🔧 v4.8.10: Загружаем tombstones из ОБЕИХ систем один раз для merge
    const _tombstonesForMerge = global.HEYS?.store?.get?.('heys_deleted_ids') || [];
    const _tombstoneIdSetForMerge = new Set(Array.isArray(_tombstonesForMerge) ? _tombstonesForMerge.map(t => t.id).filter(Boolean) : []);
    const _tombstoneNameSetForMerge = new Set(Array.isArray(_tombstonesForMerge) ? _tombstonesForMerge.map(t => (t.name || '').trim().toLowerCase()).filter(Boolean) : []);

    const isDeletedProduct = (p) => {
      if (!p) return false;
      // 1️⃣ Проверяем heys_deleted_ids (Store-based tombstones — выживают при очистке localStorage)
      if (p.id && _tombstoneIdSetForMerge.has(p.id)) return true;
      if (p.name && _tombstoneNameSetForMerge.has(String(p.name).trim().toLowerCase())) return true;
      // 2️⃣ Проверяем HEYS.deletedProducts API (localStorage-based ignore list)
      if (global.HEYS?.deletedProducts?.isProductDeleted) {
        return global.HEYS.deletedProducts.isProductDeleted(p);
      }
      // Fallback: прямая проверка
      if (global.HEYS?.deletedProducts?.isDeleted) {
        return global.HEYS.deletedProducts.isDeleted(p.name) ||
          global.HEYS.deletedProducts.isDeleted(p.id) ||
          global.HEYS.deletedProducts.isDeleted(p.fingerprint);
      }
      return false;
    };

    /**
     * Calculate data completeness score for product conflict resolution.
     * @param {Object} p
     * @returns {number}
     */
    const getProductScore = (p) => {
      let score = 0;
      if (p.id) score += 1;
      if (p.name) score += 2; // Имя важнее
      if (p.kcal100 > 0) score += 1;
      if (p.protein100 > 0) score += 1;
      if (p.carbs100 > 0 || p.simple100 > 0 || p.complex100 > 0) score += 1;
      if (p.fat100 > 0 || p.badFat100 > 0 || p.goodFat100 > 0) score += 1;
      if (p.fiber100 > 0) score += 1;
      if (p.gi > 0) score += 1;
      if (p.portions && p.portions.length > 0) score += 2; // Порции важны
      if (p.createdAt) score += 1;
      // v4.8.2: Микронутриенты дают бонус — предпочитаем продукты с полными данными
      if (p.iron > 0 || p.vitamin_c > 0 || p.calcium > 0) score += 2;
      if (p.magnesium > 0 || p.zinc > 0 || p.potassium > 0) score += 1;
      return score;
    };

    /**
     * Compare two products and decide which one is "better" for merge.
     * @param {Object} p1
     * @param {Object} p2
     * @returns {boolean}
     */
    const isBetterProduct = (p1, p2) => {
      const score1 = getProductScore(p1);
      const score2 = getProductScore(p2);

      // 1. Сначала сравниваем по полноте данных
      if (score1 !== score2) return score1 > score2;

      // 2. При равном score — предпочитаем более новый (по createdAt)
      const time1 = p1.createdAt || 0;
      const time2 = p2.createdAt || 0;
      return time1 > time2;
    };

    // ═══════════════════════════════════════════════════════════════
    // ЭТАП 0.5: 🆕 Фильтрация удалённых продуктов (v4.8.0)
    // ═══════════════════════════════════════════════════════════════

    let deletedFiltered = 0;
    const filterDeleted = (arr, source) => {
      return arr.filter(p => {
        if (isDeletedProduct(p)) {
          deletedFiltered++;
          return false;
        }
        return true;
      });
    };

    const localFiltered = filterDeleted(local, 'local');
    const remoteFiltered = filterDeleted(remote, 'remote');

    if (deletedFiltered > 0) {
      logCritical(`🚫 [MERGE] Filtered out ${deletedFiltered} deleted product(s) from ignore list`);
    }

    // ═══════════════════════════════════════════════════════════════
    // ЭТАП 1: Дедупликация ВНУТРИ каждого массива (детектим legacy дубли)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Deduplicate products by normalized name within one source.
     * @param {Array<Object>} arr
     * @param {string} source
     * @returns {Array<Object>}
     */
    const dedupeArray = (arr, source) => {
      const seen = new Map(); // normalizedName → bestProduct
      const duplicates = [];

      arr.forEach(p => {
        if (!isValidProduct(p)) return;
        const key = normalizeName(p.name);
        const existing = seen.get(key);

        if (!existing) {
          seen.set(key, p);
        } else {
          // Дубль внутри массива! Выбираем лучший
          duplicates.push({ name: p.name, source });
          if (isBetterProduct(p, existing)) {
            seen.set(key, p);
          }
        }
      });

      if (duplicates.length > 0) {
        logCritical(`⚠️ [MERGE] Found ${duplicates.length} duplicate(s) in ${source}: ${duplicates.map(d => `"${d.name}"`).join(', ')}`);
      }

      return Array.from(seen.values());
    };

    const localDeduped = dedupeArray(localFiltered, 'local');
    const remoteDeduped = dedupeArray(remoteFiltered, 'remote');

    // Если одна из сторон пуста — возвращаем другую
    if (localDeduped.length === 0) return remoteDeduped;
    if (remoteDeduped.length === 0) return localDeduped;

    // ═══════════════════════════════════════════════════════════════
    // ЭТАП 2: Merge local + remote (name = единственный ключ)
    // ═══════════════════════════════════════════════════════════════

    const resultMap = new Map(); // normalizedName → product

    // Сначала добавляем все remote (база)
    remoteDeduped.forEach(p => {
      const key = normalizeName(p.name);
      resultMap.set(key, p);
    });

    // 🆕 v4.8.3: Field-level merge для микронутриентов
    // Когда один продукт выбран как "лучший", копируем missing микронутриенты из другого
    const MICRO_FIELDS = ['iron', 'vitamin_c', 'calcium', 'vitamin_d', 'vitamin_b12',
      'vitamin_a', 'vitamin_e', 'magnesium', 'zinc', 'potassium', 'sodium', 'folate'];
    const enrichMicronutrients = (winner, donor) => {
      for (const f of MICRO_FIELDS) {
        const wVal = Number(winner[f]) || 0;
        const dVal = Number(donor[f]) || 0;
        if (wVal === 0 && dVal > 0) {
          winner[f] = dVal;
        }
      }
    };

    // Затем мержим локальные
    let addedFromLocal = 0;
    let updatedFromLocal = 0;

    localDeduped.forEach(p => {
      const key = normalizeName(p.name);
      const existing = resultMap.get(key);

      if (!existing) {
        // Новый продукт (есть только локально)
        resultMap.set(key, p);
        addedFromLocal++;
      } else if (isBetterProduct(p, existing)) {
        // Локальная версия лучше — заменяем, но копируем микронутриенты из remote
        const enriched = { ...p };
        enrichMicronutrients(enriched, existing);
        resultMap.set(key, enriched);
        updatedFromLocal++;
      } else {
        // Remote лучше — копируем микронутриенты из local если remote их не имеет
        const enriched = { ...existing };
        enrichMicronutrients(enriched, p);
        resultMap.set(key, enriched);
      }
    });

    const merged = Array.from(resultMap.values());

    // ═══════════════════════════════════════════════════════════════
    // ЭТАП 3: Статистика и логирование
    // ═══════════════════════════════════════════════════════════════

    const localDupes = local.length - localDeduped.length;
    const remoteDupes = remote.length - remoteDeduped.length;
    const totalDupes = localDupes + remoteDupes;

    const stats = {
      local: local.length,
      localDeduped: localDeduped.length,
      remote: remote.length,
      remoteDeduped: remoteDeduped.length,
      merged: merged.length,
      addedFromLocal,
      updatedFromLocal,
      duplicatesRemoved: totalDupes
    };

    // Краткий лог
    const delta = merged.length - remoteDeduped.length;
    logCritical(`🔀 [MERGE PRODUCTS] local: ${stats.local}${localDupes ? ` (−${localDupes} dupes)` : ''}, remote: ${stats.remote}${remoteDupes ? ` (−${remoteDupes} dupes)` : ''} → merged: ${merged.length} (${delta >= 0 ? '+' : ''}${delta})`);

    if (addedFromLocal > 0 || updatedFromLocal > 0) {
      log(`📦 [MERGE] Added ${addedFromLocal} new, updated ${updatedFromLocal} existing`);
    }

    // 🆕 v4.8.4: Set updatedAt for all merged products to enable timestamp-based stale detection
    // After sync, localStorage will have fresh timestamps, while stale React state has old ones
    const now = Date.now();

    // v4.8.5: DEBUG - проверяем микронутриенты BEFORE timestamp update
    const beforeIron = merged.filter(p => p.iron && +p.iron > 0).length;
    const beforeVitC = merged.filter(p => p.vitamin_c && +p.vitamin_c > 0).length;
    const beforeCa = merged.filter(p => p.calcium && +p.calcium > 0).length;

    merged.forEach(p => {
      // 🆕 v4.8.6: Preserve individual createdAt for correct sort order in personal list.
      // Priority: existing camelCase createdAt → DB created_at → existing updatedAt → now
      // This way each product keeps its unique creation timestamp, not a batch sync time.
      if (!p.createdAt) {
        const dbCreated = p.created_at;
        if (dbCreated) {
          // Parse PostgreSQL timestamptz → millis
          const ts = typeof dbCreated === 'number'
            ? dbCreated
            : (() => {
              let parsed = Date.parse(dbCreated);
              if (!Number.isFinite(parsed)) {
                const norm = String(dbCreated).replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/\+00$/, 'Z').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
                parsed = Date.parse(norm);
              }
              return Number.isFinite(parsed) ? parsed : 0;
            })();
          if (ts > 0) p.createdAt = ts;
        }
        // fallback: keep whatever was in updatedAt before (individual per-product, if existed)
        // но не ставим now — иначе все новые получат одинаковый batch-timestamp
      }
      p.updatedAt = now;
    });

    logCritical(`🕐 [MERGE TIMESTAMP] Set updatedAt=${now} (${new Date(now).toISOString()}) for all ${merged.length} products`);
    const withCreatedAt = merged.filter(p => p.createdAt).length;
    logCritical(`📅 [MERGE TIMESTAMP] Products with individual createdAt: ${withCreatedAt}/${merged.length} (used for sort order)`);
    logCritical(`   Micronutrients: Fe=${beforeIron}, VitC=${beforeVitC}, Ca=${beforeCa}`);

    return merged;
  }

  const PENDING_QUEUE_KEY = 'heys_pending_sync_queue';
  const PENDING_USER_INFLIGHT_QUEUE_KEY = 'heys_pending_sync_inflight_queue';
  const PENDING_CLIENT_INFLIGHT_QUEUE_KEY = 'heys_pending_client_sync_inflight_queue';
  const PENDING_QUEUE_COMPRESS_MIN_BYTES = 16 * 1024;
  const PENDING_QUEUE_INLINE_VALUE_MAX_BYTES = 32 * 1024;

  const _pendingQueuePure = HEYS.pendingQueuePure;
  if (!_pendingQueuePure || typeof _pendingQueuePure.getPendingQueueIdentity !== 'function' || typeof _pendingQueuePure.compactPendingQueue !== 'function') {
    throw new Error('[HEYS.storage] Load heys_pending_queue_pure_v1.js before heys_storage_supabase_v1.js (boot-core order)');
  }
  const _syncQueueRuntimePure = HEYS.syncQueueRuntimePure;
  if (
    !_syncQueueRuntimePure ||
    typeof _syncQueueRuntimePure.enqueueClientSave !== 'function' ||
    typeof _syncQueueRuntimePure.flushPendingQueueCore !== 'function' ||
    typeof _syncQueueRuntimePure.shouldScheduleRetryAfterRpcError !== 'function' ||
    typeof _syncQueueRuntimePure.restorePersistentQueueState !== 'function' ||
    typeof _syncQueueRuntimePure.requeueInFlightBatch !== 'function' ||
    typeof _syncQueueRuntimePure.getSyncStatusForKey !== 'function'
  ) {
    throw new Error('[HEYS.storage] Load heys_sync_queue_runtime_pure_v1.js before heys_storage_supabase_v1.js (boot-core order)');
  }
  const PENDING_CLIENT_QUEUE_KEY = _pendingQueuePure.PENDING_CLIENT_QUEUE_KEY;
  const getPendingQueueIdentity = _pendingQueuePure.getPendingQueueIdentity.bind(_pendingQueuePure);
  const compactPendingQueue = _pendingQueuePure.compactPendingQueue.bind(_pendingQueuePure);
  const enqueueClientSave = _syncQueueRuntimePure.enqueueClientSave.bind(_syncQueueRuntimePure);
  const flushPendingQueueCore = _syncQueueRuntimePure.flushPendingQueueCore.bind(_syncQueueRuntimePure);
  const shouldScheduleRetryAfterRpcError = _syncQueueRuntimePure.shouldScheduleRetryAfterRpcError.bind(_syncQueueRuntimePure);
  const restorePersistentQueueState = _syncQueueRuntimePure.restorePersistentQueueState.bind(_syncQueueRuntimePure);
  const requeueInFlightBatch = _syncQueueRuntimePure.requeueInFlightBatch.bind(_syncQueueRuntimePure);
  const getSyncStatusForKey = _syncQueueRuntimePure.getSyncStatusForKey.bind(_syncQueueRuntimePure);

  function getPendingQueueLocalStorageKey(item) {
    if (!item || typeof item !== 'object') return '';

    const normalizedKey = String(item.k || '');
    if (!normalizedKey) return '';

    if (item.client_id) {
      return scopeKeyForClientStorage(normalizedKey, item.client_id);
    }

    return normalizedKey;
  }

  const LOCAL_ONLY_STORAGE_EXACT_KEYS = new Set([
    'heys_advice_trace_day_v1',
    'heys_perf_log',  // debug tool — not user data
    'heys_boot_log',  // boot diagnostics — local only
    'heys_sync_log',              // sync metadata — local only, syncing it causes infinite loop
    'heys_pending_sync_ui_queue', // sync badge UI state — local only, must not be synced to cloud
  ]);

  const LOCAL_ONLY_STORAGE_SUFFIXES = [
    '_advice_trace_day_v1'
  ];

  const LOCAL_ONLY_STORAGE_PREFIXES = [
    'heys_products_pre_overlay_',  // β: rollback snapshots, never sync to cloud
    'heys_overlay_',               // β/γ: overlay-specific markers (migrated_at, status, etc.)
  ];

  function isLocalOnlyStorageKey(key) {
    const normalizedKey = String(key || '');
    if (!normalizedKey) return false;
    if (LOCAL_ONLY_STORAGE_EXACT_KEYS.has(normalizedKey)) return true;
    if (LOCAL_ONLY_STORAGE_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix))) return true;
    return LOCAL_ONLY_STORAGE_SUFFIXES.some((suffix) => normalizedKey.endsWith(suffix));
  }

  function filterLocalOnlyPendingQueueItems(queue, storageKey, options = {}) {
    const safeQueue = Array.isArray(queue) ? queue : [];
    const filtered = safeQueue.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const itemKey = String(item.k || '');
      const persistKey = getPendingQueueLocalStorageKey(item);
      return !isLocalOnlyStorageKey(itemKey) && !isLocalOnlyStorageKey(persistKey);
    });

    if (options.mutate && Array.isArray(queue)) {
      queue.splice(0, queue.length, ...filtered);
    }

    const removedCount = safeQueue.length - filtered.length;
    if (removedCount > 0) {
      logQuotaThrottled(
        `pending-queue-local-only:${storageKey}`,
        `🧹 [SYNC] Dropped ${removedCount} local-only pending item(s) from ${storageKey}`
      );
    }

    return options.mutate && Array.isArray(queue) ? queue : filtered;
  }

  function createPersistablePendingQueueItem(item, storageKey) {
    if (!item || typeof item !== 'object') return item;

    const persistable = { ...item };
    const isClientQueue = storageKey === PENDING_CLIENT_QUEUE_KEY || !!persistable.client_id;
    if (!isClientQueue) return persistable;

    try {
      const rawValue = JSON.stringify(persistable.v);
      const valueBytes = (rawValue || '').length * 2;
      if (valueBytes < PENDING_QUEUE_INLINE_VALUE_MAX_BYTES) {
        return persistable;
      }

      const localStorageKey = getPendingQueueLocalStorageKey(persistable);
      delete persistable.v;
      persistable.__persistRef = true;
      if (localStorageKey) {
        persistable.__persistKey = localStorageKey;
      }
      logQuotaThrottled(`pending-queue-ref:${storageKey}:${persistable.k}`, `🪶 [SYNC] Pending queue stores large value by ref: ${persistable.k} (${formatStorageBytes(valueBytes)})`);
      return persistable;
    } catch (_) {
      return persistable;
    }
  }

  function hydratePendingQueueItem(item) {
    if (!item || typeof item !== 'object' || !item.__persistRef || typeof item.v !== 'undefined') {
      return item;
    }

    if (isLocalOnlyStorageKey(item.k) || isLocalOnlyStorageKey(item.__persistKey)) {
      return null;
    }

    const localStorageKey = item.__persistKey || getPendingQueueLocalStorageKey(item);
    const fallbackKeys = [localStorageKey, item.k].filter(Boolean);
    // Post-switch: persisted ref may still point at heys_<oldUuid>_… while item.client_id is already new.
    try {
      if (item.client_id) {
        const nk = stripClientScopePrefixes(String(item.k || '')).key;
        if (nk) {
          const rescoped = scopeKeyForClientStorage(nk, item.client_id);
          if (rescoped && !fallbackKeys.includes(rescoped)) {
            fallbackKeys.unshift(rescoped);
          }
        }
      }
    } catch (_) { }

    for (const key of fallbackKeys) {
      try {
        const raw = global.localStorage.getItem(key);
        if (!raw) continue;

        const Store = global.HEYS?.store;
        const value = (typeof raw === 'string' && raw.startsWith('¤Z¤') && typeof Store?.decompress === 'function')
          ? Store.decompress(raw)
          : JSON.parse(raw);

        try {
          if (key && key !== localStorageKey && key !== item.k) {
            bumpSmoothnessCounter('pending_hydrate_remap_ok');
          }
        } catch (_) { }

        return {
          ...item,
          v: value
        };
      } catch (_) { }
    }

    logQuotaThrottled(`pending-queue-hydrate-miss:${item.k}`, `⚠️ [SYNC] Pending queue ref hydrate missed local value: ${item.k}`);
    bumpSmoothnessCounter('pending_hydrate_miss');
    return null;
  }

  /**
   * After switchClient clears _switchClientInProgress, replay writes that were deferred
   * (Store.set / saveClientKey) so nothing is dropped mid-switch.
   */
  cloud._flushDeferredWritesAfterSwitch = function (newClientId, oldClientId) {
    if (!newClientId) return;
    try {
      bumpSmoothnessCounter('deferred_switch_flush_start');
    } catch (_) { }
    try {
      const storeMap = cloud._deferredStoreWriteMap;
      if (storeMap && typeof storeMap.values === 'function' && storeMap.size > 0 && global.HEYS?.store && typeof global.HEYS.store.__replayDeferredSwitchWrites === 'function') {
        const rows = Array.from(storeMap.values());
        storeMap.clear();
        const rep = global.HEYS.store.__replayDeferredSwitchWrites(rows, newClientId, oldClientId || '');
        try {
          bumpSmoothnessCounter('deferred_store_replay_' + (rep.replayed > 0 ? 'ok' : 'noop'));
        } catch (_) { }
      }
    } catch (_) {
      try { bumpSmoothnessCounter('deferred_store_replay_err'); } catch (__) { }
    }
    try {
      let dm = cloud._deferredSaveClientKeyMap;
      if (!dm || typeof dm.clear !== 'function' || typeof dm.values !== 'function') {
        cloud._deferredSaveClientKeyMap = new Map();
        dm = cloud._deferredSaveClientKeyMap;
      }
      if (dm.size > 0) {
        const rows = Array.from(dm.values());
        dm.clear();
        const oldC = oldClientId || '';
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row.client_id || !row.k) continue;
          const lead = getLeadingClientScopeId(row.k);
          if (lead) {
            if (lead !== newClientId && (!oldC || lead !== oldC)) continue;
          } else {
            if (row.client_id !== newClientId && (!oldC || row.client_id !== oldC)) continue;
          }
          try {
            cloud.saveClientKey(row.client_id, row.k, row.value);
            bumpSmoothnessCounter('deferred_save_replay_ok');
          } catch (_) {
            bumpSmoothnessCounter('deferred_save_replay_err');
          }
        }
      }
    } catch (_) {
      try { bumpSmoothnessCounter('deferred_save_replay_batch_err'); } catch (__) { }
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🧹 QUOTA MANAGEMENT — ЗАЩИТА ОТ ПЕРЕПОЛНЕНИЯ STORAGE
  // ═══════════════════════════════════════════════════════════════════

  const MAX_STORAGE_MB = 4.5; // Лимит ~5MB, оставляем запас
  const OLD_DATA_DAYS = 90; // Удаляем данные старше 90 дней
  const HYDRATION_DAY_QUOTA_SKIP_AFTER_DAYS = 45; // Старые dayv2 оставляем в cloud, если localStorage уже упёрся в quota
  const QUOTA_LOG_THROTTLE_MS = 5000;
  const QUOTA_CLEANUP_COOLDOWN_MS = 3000;
  const STORAGE_SIZE_CACHE_TTL_MS = 10000;
  const quotaLogTimestamps = new Map();
  let _lastAggressiveCleanupAt = 0;
  let _storageSizeCache = { mb: 0, ts: 0 };

  /** Получить размер localStorage в MB */
  function getStorageSize(options = {}) {
    try {
      const forceRecalc = options && options.forceRecalc === true;
      const now = Date.now();
      if (!forceRecalc && (now - _storageSizeCache.ts) < STORAGE_SIZE_CACHE_TTL_MS) {
        return _storageSizeCache.mb;
      }

      let total = 0;
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (!key) continue;
        total += (global.localStorage.getItem(key) || '').length * 2; // UTF-16
      }
      const sizeMB = total / 1024 / 1024;
      _storageSizeCache = { mb: sizeMB, ts: now };
      return sizeMB;
    } catch (e) {
      return 0;
    }
  }

  /** Получить дату из ключа dayv2_YYYY-MM-DD */
  function getDateFromDayKey(key) {
    const match = key.match(/dayv2_(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return new Date(match[1]);
    }
    return null;
  }

  function getDayAgeDaysFromKey(key, nowTs = Date.now()) {
    const date = getDateFromDayKey(key);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return Math.floor((nowTs - date.getTime()) / (24 * 60 * 60 * 1000));
  }

  function shouldSkipHydrationDayOnQuota(key, options = {}) {
    if (!options?.preserveRecentDuringHydration) return false;
    if (!String(key || '').includes('dayv2_')) return false;
    const ageDays = getDayAgeDaysFromKey(key, options.nowTs || Date.now());
    return Number.isFinite(ageDays) && ageDays > HYDRATION_DAY_QUOTA_SKIP_AFTER_DAYS;
  }

  function logQuotaThrottled(kind, message) {
    try {
      const now = Date.now();
      const lastTs = quotaLogTimestamps.get(kind) || 0;
      if ((now - lastTs) >= QUOTA_LOG_THROTTLE_MS) {
        quotaLogTimestamps.set(kind, now);
        logCritical(message);
      }
    } catch (e) {
      logCritical(message);
    }
  }

  function getCurrentQuotaClientId() {
    try {
      const utilsClientId = global.HEYS?.utils?.getCurrentClientId?.();
      if (utilsClientId) return utilsClientId;

      const globalClientId = global.HEYS?.currentClientId;
      if (globalClientId) return globalClientId;

      const storedClientId = global.localStorage.getItem('heys_client_current');
      if (!storedClientId) return '';
      try {
        return JSON.parse(storedClientId) || '';
      } catch (_) {
        return storedClientId;
      }
    } catch (e) {
      return '';
    }
  }

  function isRecoverableStorageKey(key) {
    const normalizedKey = String(key || '');
    return normalizedKey === 'heys_shared_products_cache_v1' ||
      normalizedKey === 'heys_sync_log' ||
      normalizedKey.includes('_debug') ||
      normalizedKey.includes('_temp') ||
      normalizedKey.includes('_cache') ||
      normalizedKey.includes('_log') ||
      normalizedKey.includes('_backup') ||
      normalizedKey.includes('heys_ews_') ||
      normalizedKey.includes('heys_insights_') ||
      normalizedKey.includes('heys_adaptive_');
  }

  function formatStorageBytes(bytes) {
    const safeBytes = Number.isFinite(bytes) ? bytes : 0;
    if (safeBytes >= 1024 * 1024) {
      return `${(safeBytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(safeBytes / 1024).toFixed(1)} KB`;
  }

  function getStorageWriteMeta(key, value) {
    try {
      const normalizedKey = String(key || '');
      const rawValue = typeof value === 'string' ? value : JSON.stringify(value);
      const payloadBytes = (rawValue || '').length * 2;
      const currentSizeBytes = Math.round(getStorageSize() * 1024 * 1024);
      let kind = 'other';
      if (isRecoverableStorageKey(normalizedKey)) kind = 'recoverable_cache';
      else if (normalizedKey.includes('dayv2_')) kind = 'dayv2';
      else if (normalizedKey.includes('_products')) kind = 'products';
      else if (
        normalizedKey === PENDING_QUEUE_KEY ||
        normalizedKey === PENDING_USER_INFLIGHT_QUEUE_KEY ||
        normalizedKey === PENDING_CLIENT_QUEUE_KEY ||
        normalizedKey === PENDING_CLIENT_INFLIGHT_QUEUE_KEY
      ) kind = 'pending_queue';
      return {
        key: normalizedKey,
        kind,
        payloadBytes,
        currentSizeBytes,
        summary: `key=${normalizedKey} kind=${kind} payload=${formatStorageBytes(payloadBytes)} storage=${formatStorageBytes(currentSizeBytes)}`
      };
    } catch (e) {
      return {
        key: String(key || ''),
        kind: 'unknown',
        payloadBytes: 0,
        currentSizeBytes: 0,
        summary: `key=${String(key || '')} kind=unknown`
      };
    }
  }

  function cleanupRecoverableStorage() {
    try {
      const currentClientId = getCurrentQuotaClientId();
      const scopedProductsKey = currentClientId ? `heys_${currentClientId}_products` : '';
      const recoverableKeys = [];

      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (!key) continue;

        const isRecoverableCache = isRecoverableStorageKey(key);

        const isOtherClientProducts =
          key.includes('_products') &&
          key !== scopedProductsKey &&
          key !== 'heys_products' &&
          !key.includes('_hidden_products') &&
          !key.includes('_favorite_products') &&
          !key.includes('_deleted_products');

        const clientScopedMatch = key.match(CLIENT_SCOPED_KEY_RE);
        const isOtherClientScopedKey = !!(clientScopedMatch && currentClientId && clientScopedMatch[1] !== currentClientId);

        if (isRecoverableCache || isOtherClientProducts || isOtherClientScopedKey) {
          recoverableKeys.push(key);
        }
      }

      if (scopedProductsKey && global.localStorage.getItem(scopedProductsKey) && global.localStorage.getItem('heys_products')) {
        recoverableKeys.push('heys_products');
      }

      const uniqueKeys = Array.from(new Set(recoverableKeys));
      uniqueKeys.forEach((key) => global.localStorage.removeItem(key));

      if (uniqueKeys.length > 0) {
        logCritical(`🧹 Очищено ${uniqueKeys.length} восстанавливаемых cache/backup ключей`);
      }

      return uniqueKeys.length;
    } catch (e) {
      return 0;
    }
  }

  function cleanupOptionalPreferenceStorage() {
    try {
      const optionalKeys = [];
      const exactKeys = new Set([
        'heys_hidden_products',
        'heys_favorite_products',
        'heys_deleted_products',
        'heys_deleted_products_ignore_list',
        'heys_grams_history',
        'heys_advice_trace_day_v1',
        'test_large'
      ]);
      const suffixMatchers = [
        '_hidden_products',
        '_favorite_products',
        '_deleted_products',
        '_advice_trace_day_v1'
      ];

      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (!key) continue;
        const matchesSuffix = suffixMatchers.some((suffix) => key.endsWith(suffix));
        const isTestKey = /^test_/i.test(key);
        // Note: _insights_feedback_* keys are intentionally excluded here.
        // cleanupViaRegistry() prunes them to maxSize instead of wiping, preserving ML weights.
        if (exactKeys.has(key) || key.startsWith('heys_last_grams_') || matchesSuffix || isTestKey) {
          optionalKeys.push(key);
        }
      }

      optionalKeys.forEach((key) => global.localStorage.removeItem(key));

      if (optionalKeys.length > 0) {
        logCritical(`🧹 Очищено ${optionalKeys.length} optional preference/layout ключей`);
      }

      return optionalKeys.length;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Registry-aware cleanup: prune/wipe localStorage keys per their declared policies.
   * Called at the start of aggressiveCleanup() — before any hardcoded pattern deletion.
   * Unlike cleanupOptionalPreferenceStorage which wipes entire arrays, this function
   * PRUNES array keys to their policy maxSize, preserving the most recent records.
   * Handles insights_feedback keys safely: prune to 30 records, not delete.
   * Returns estimated bytes freed.
   */
  function cleanupViaRegistry() {
    try {
      const reg = global.HEYS && global.HEYS.storageRegistry;
      if (!reg || typeof reg.match !== 'function') return 0;

      const keys = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const k = global.localStorage.key(i);
        if (k) keys.push(k);
      }

      let freed = 0;
      for (const k of keys) {
        try {
          if (reg.isNeverTouch && reg.isNeverTouch(k)) continue;
          const policy = reg.match(k);
          if (!policy || policy.maxSize == null) continue;
          const raw = global.localStorage.getItem(k);
          if (!raw) continue;
          const sizeBytes = (k.length + raw.length) * 2;
          if (sizeBytes <= policy.maxSize) continue;

          if (policy.maxSize === 0 || policy.pruneStrategy === 'wipe') {
            global.localStorage.removeItem(k);
            freed += sizeBytes;
            logCritical('🧹 [registry] wipe ' + k + ': ' + (sizeBytes / 1024).toFixed(1) + ' KB');
          } else {
            // Prune: works for sliding-window, oldest-first, and manual keys (local-only prune in emergency).
            let parsed;
            try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
            if (!Array.isArray(parsed)) {
              global.localStorage.removeItem(k);
              freed += sizeBytes;
              continue;
            }
            // Remove from front (oldest) until the array fits within maxSize or only 1 item remains.
            let pruned = parsed;
            while (pruned.length > 1 && (k.length + JSON.stringify(pruned).length) * 2 > policy.maxSize) {
              pruned = pruned.slice(1);
            }
            const prunedStr = JSON.stringify(pruned);
            const prunedSize = (k.length + prunedStr.length) * 2;
            try {
              global.localStorage.setItem(k, prunedStr);
              freed += sizeBytes - prunedSize;
              logCritical('🧹 [registry] pruned ' + k + ': ' + (sizeBytes / 1024).toFixed(1) + ' KB → ' + (prunedSize / 1024).toFixed(1) + ' KB');
            } catch (_) {
              // If the prune write itself fails (quota), fall back to removing the key entirely.
              global.localStorage.removeItem(k);
              freed += sizeBytes;
            }
          }
        } catch (_) { /* noop — never let one key block the rest */ }
      }
      if (freed > 0) {
        logCritical('🧹 [registry] суммарно освобождено: ' + (freed / 1024).toFixed(1) + ' KB');
      }
      return freed;
    } catch (_) {
      return 0;
    }
  }

  function logLargestStorageKeys(limit = 8) {
    try {
      const entries = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (!key) continue;
        const raw = global.localStorage.getItem(key) || '';
        const bytes = raw.length * 2;
        entries.push({ key, bytes });
      }

      entries
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, limit)
        .forEach((entry, index) => {
          logCritical(`📦 [STORAGE TOP ${index + 1}] ${entry.key} = ${(entry.bytes / 1024).toFixed(1)} KB`);
        });
    } catch (e) { }
  }

  function logLargestStorageKeysThrottled(limit = 8) {
    const kind = `quota-top-keys-${limit}`;
    const now = Date.now();
    const lastTs = quotaLogTimestamps.get(kind) || 0;
    if ((now - lastTs) < QUOTA_LOG_THROTTLE_MS) return;
    quotaLogTimestamps.set(kind, now);
    logLargestStorageKeys(limit);
  }

  /** Очистить старые данные для освобождения места */
  function cleanupOldData(daysToKeep = OLD_DATA_DAYS) {
    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() - daysToKeep * 24 * 60 * 60 * 1000);
      let cleaned = 0;

      // Собираем ключи для удаления
      const keysToRemove = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (key && key.includes('dayv2_')) {
          const date = getDateFromDayKey(key);
          if (date && date < cutoff) {
            keysToRemove.push(key);
          }
        }
      }

      // Удаляем старые данные
      keysToRemove.forEach(key => {
        global.localStorage.removeItem(key);
        cleaned++;
      });

      if (cleaned > 0) {
        logCritical(`🧹 Очищено ${cleaned} старых записей (>${daysToKeep} дней)`);
      }

      return cleaned;
    } catch (e) {
      return 0;
    }
  }

  /** Агрессивная очистка при критическом переполнении */
  function aggressiveCleanup() {
    logQuotaThrottled('quota-aggressive', '🚨 Агрессивная очистка storage...');

    // 0. Registry-aware prune: trims known keys per declared policies before any hardcoded deletion.
    // Prevents blindly wiping user-state arrays (ML weights, feedback history) — prunes instead.
    cleanupViaRegistry();

    // 1. Сначала удаляем то, что можно безопасно восстановить
    cleanupRecoverableStorage();

    // 2. Очищаем pending queues и тяжёлые кэши insights
    global.localStorage.removeItem(PENDING_QUEUE_KEY);
    global.localStorage.removeItem(PENDING_USER_INFLIGHT_QUEUE_KEY);
    global.localStorage.removeItem(PENDING_CLIENT_QUEUE_KEY);
    global.localStorage.removeItem(PENDING_CLIENT_INFLIGHT_QUEUE_KEY);
    global.localStorage.removeItem(SYNC_LOG_KEY);
    // Очищаем кэши insights (восстановятся при следующем запуске)
    const insightsKeys = [
      'heys_adaptive_thresholds', 'heys_thresholds_rolling_stats',
      'heys_ews_trends_v1', 'heys_ews_weekly_v1', 'heys_insights_cache'
    ];
    insightsKeys.forEach(k => global.localStorage.removeItem(k));

    // 3. Лишь затем начинаем ужимать историю dayv2
    cleanupOldData(30);

    // 4. Показываем размер после очистки
    let sizeMB = getStorageSize({ forceRecalc: true });
    logCritical(`📊 Размер после очистки: ${sizeMB.toFixed(2)} MB`);

    // 5. Если всё ещё > 4MB — ужимаем dayv2 агрессивнее и ещё раз чистим recoverable
    if (sizeMB > 4) {
      cleanupRecoverableStorage();
      cleanupOldData(14);

      sizeMB = getStorageSize({ forceRecalc: true });
      if (sizeMB > 4) {
        cleanupOptionalPreferenceStorage();
        cleanupOldData(7);

        // Самая агрессивная очистка - удаляем всё что можем восстановить
        const aggressiveKeys = [];
        for (let i = 0; i < global.localStorage.length; i++) {
          const key = global.localStorage.key(i);
          if (key && (key.includes('heys_ews_') || key.includes('heys_insights_') || key.includes('heys_adaptive_'))) {
            aggressiveKeys.push(key);
          }
        }
        aggressiveKeys.forEach(k => global.localStorage.removeItem(k));
      }

      sizeMB = getStorageSize({ forceRecalc: true });
      logCritical(`📊 После ultra-aggressive очистки: ${sizeMB.toFixed(2)} MB`);
      if (sizeMB > 4) {
        logLargestStorageKeys();
      }
    }
  }

  /** Безопасная запись в localStorage с обработкой QuotaExceeded */
  function safeSetItem(key, value, options = {}) {
    // Используем оригинальный setItem если доступен (избегаем рекурсии через перехват)
    const setFn = originalSetItem || global.localStorage.setItem.bind(global.localStorage);
    let writeMeta = null;
    const getWriteMeta = () => {
      if (!writeMeta) writeMeta = getStorageWriteMeta(key, value);
      return writeMeta;
    };

    try {
      setFn(key, value);
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        const quotaMeta = getWriteMeta();
        if (shouldSkipHydrationDayOnQuota(key, options)) {
          logQuotaThrottled('quota-hydration-skip', `⚠️ [SYNC] Quota: старый dayv2 оставлен только в cloud: ${quotaMeta.summary}`);
          return false;
        }

        if (quotaMeta.kind === 'recoverable_cache') {
          try { global.localStorage.removeItem(key); } catch (_) { }
          logQuotaThrottled('quota-recoverable-skip', `⚠️ [STORAGE] Quota: пропускаем recoverable cache write: ${quotaMeta.summary}`);
          return false;
        }
        // Если другой таб держит advisory cleanup lock (Phase 4) — возвращаем false
        // чтобы вызывающий код поставил запись в pending-очередь, не запуская конкурентный cleanup.
        if (global.HEYS?.storageRegistry?.isCleanupActive?.()) {
          logQuotaThrottled('quota-cleanup-defer', `⚠️ [STORAGE] Quota: cleanup активен в другом табе, defer: ${quotaMeta.summary}`);
          return false;
        }
        // Сначала очищаем безопасно-восстановимые ключи и старые данные
        logQuotaThrottled('quota-warning', `⚠️ localStorage переполнен, очищаем старые данные... ${quotaMeta.summary}`);
        cleanupRecoverableStorage();
        cleanupOldData();

        // Пробуем ещё раз
        try {
          setFn(key, value);
          return true;
        } catch (e2) {
          // Всё ещё не помещается — удаляем pending queues и sync log
          global.localStorage.removeItem(PENDING_QUEUE_KEY);
          global.localStorage.removeItem(PENDING_USER_INFLIGHT_QUEUE_KEY);
          global.localStorage.removeItem(PENDING_CLIENT_QUEUE_KEY);
          global.localStorage.removeItem(PENDING_CLIENT_INFLIGHT_QUEUE_KEY);
          global.localStorage.removeItem(SYNC_LOG_KEY);

          try {
            setFn(key, value);
            return true;
          } catch (e3) {
            // Агрессивная очистка — но не чаще чем раз в несколько секунд
            const now = Date.now();
            if ((now - _lastAggressiveCleanupAt) >= QUOTA_CLEANUP_COOLDOWN_MS) {
              _lastAggressiveCleanupAt = now;
              aggressiveCleanup();
            }
            try {
              setFn(key, value);
              return true;
            } catch (e4) {
              logQuotaThrottled('quota-critical', `❌ Не удалось сохранить данные: storage критически переполнен (${quotaMeta.summary})`);
              logLargestStorageKeysThrottled();
              return false;
            }
          }
        }
      }
      return false;
    }
  }

  let _cachedDayHydrationProductsRef = null;
  let _cachedDayHydrationProductIndex = null;

  function getDayHydrationProductIndex() {
    const products = global.HEYS?.products?.getAll?.();
    if (!Array.isArray(products) || products.length === 0) return null;
    if (_cachedDayHydrationProductsRef === products && _cachedDayHydrationProductIndex) {
      return _cachedDayHydrationProductIndex;
    }

    const buildProductIndex = global.HEYS?.models?.buildProductIndex;
    if (typeof buildProductIndex !== 'function') return null;

    _cachedDayHydrationProductsRef = products;
    _cachedDayHydrationProductIndex = buildProductIndex(products);
    return _cachedDayHydrationProductIndex;
  }

  function ensureDayV2ComputedTotals(valueToSave) {
    if (!valueToSave || typeof valueToSave !== 'object') return valueToSave;

    valueToSave = stripStaleSavedDisplayNutrientsIfEmptyDiary({ ...valueToSave });

    const mealsCount = Array.isArray(valueToSave.meals) ? valueToSave.meals.length : 0;
    const hasDayTot = !!(valueToSave.dayTot && Object.keys(valueToSave.dayTot).length > 0);
    if (mealsCount === 0 || hasDayTot) return valueToSave;

    const calculateDayTotals = global.HEYS?.dayCalculations?.calculateDayTotals;
    if (typeof calculateDayTotals !== 'function') return valueToSave;

    try {
      const pIndex = getDayHydrationProductIndex();
      if (!pIndex) return valueToSave;

      const computedDayTot = calculateDayTotals(valueToSave, pIndex);
      if (!computedDayTot || Object.keys(computedDayTot).length === 0) return valueToSave;

      const nextDay = {
        ...valueToSave,
        dayTot: computedDayTot
      };
      if (!(Number(nextDay.savedEatenKcal) > 0) && Number(computedDayTot.kcal) > 0) {
        nextDay.savedEatenKcal = Math.round(Number(computedDayTot.kcal) || 0);
      }
      return nextDay;
    } catch (_) {
      return valueToSave;
    }
  }

  function writeDayKeyWithQuotaGuard(key, valueToSave, options = {}) {
    const hydratedValue = ensureDayV2ComputedTotals(valueToSave);
    const rawValue = JSON.stringify(hydratedValue);
    const written = safeSetItem(key, rawValue, {
      preserveRecentDuringHydration: !!options.preserveRecentDuringHydration,
      nowTs: options.nowTs || Date.now()
    });

    if (!written && options.preserveRecentDuringHydration) {
      window.console.warn('[HEYS.sinhron] ⚠️ SKIP_LOCAL_QUOTA ' + key + ' — старый dayv2 оставлен только в cloud');
    }

    return written;
  }

  /** Debounced disk writes for hot pending queues (client + user) — reduces main-thread churn */
  const PENDING_SAVE_DEBOUNCE_MS = 120;
  const _pendingLsFlushTimers = Object.create(null);
  const _pendingLsLastQueueRef = Object.create(null);

  function isDebouncedPendingQueueKey(key) {
    return key === PENDING_QUEUE_KEY || key === PENDING_CLIENT_QUEUE_KEY;
  }

  function flushDebouncedPendingQueueWrites() {
    try {
      Object.keys(_pendingLsFlushTimers).forEach((k) => {
        clearTimeout(_pendingLsFlushTimers[k]);
        delete _pendingLsFlushTimers[k];
      });
      [PENDING_CLIENT_QUEUE_KEY, PENDING_QUEUE_KEY].forEach((storageKey) => {
        const q = _pendingLsLastQueueRef[storageKey];
        if (q) {
          delete _pendingLsLastQueueRef[storageKey];
          savePendingQueueImmediate(storageKey, q);
        }
      });
    } catch (_) { /* noop */ }
  }

  function scheduleDebouncedSavePendingQueue(key, queue) {
    _pendingLsLastQueueRef[key] = queue;
    if (_pendingLsFlushTimers[key]) clearTimeout(_pendingLsFlushTimers[key]);
    _pendingLsFlushTimers[key] = setTimeout(() => {
      _pendingLsFlushTimers[key] = null;
      const latest = _pendingLsLastQueueRef[key];
      if (latest) {
        delete _pendingLsLastQueueRef[key];
        savePendingQueueImmediate(key, latest);
      }
    }, PENDING_SAVE_DEBOUNCE_MS);
  }

  /** Сохранить очередь в localStorage (немедленно; внутренний ремонт очереди, in-flight ключи) */
  function savePendingQueueImmediate(key, queue) {
    const perf = global.HEYS?.perfMainThread;
    const run = () => {
      try {
        const queueRef = Array.isArray(queue) ? queue : [];
        const filteredQueue = filterLocalOnlyPendingQueueItems(queueRef, key, { mutate: true });
        const originalLength = filteredQueue.length;
        const compactedQueue = compactPendingQueue(filteredQueue, key, { mutate: true });

        if (compactedQueue.length > 0) {
          const persistableQueue = compactedQueue.map(item => createPersistablePendingQueueItem(item, key));
          let serializedQueue = JSON.stringify(persistableQueue);
          const Store = global.HEYS?.store;
          if ((serializedQueue.length * 2) >= PENDING_QUEUE_COMPRESS_MIN_BYTES && typeof Store?.compress === 'function') {
            try {
              const compressedQueue = Store.compress(persistableQueue);
              if (typeof compressedQueue === 'string' && compressedQueue.length < serializedQueue.length) {
                serializedQueue = compressedQueue;
              }
            } catch (_) { }
          }

          if ((originalLength - compactedQueue.length) >= 3) {
            logQuotaThrottled(`pending-queue-compacted:${key}`, `🗜️ [SYNC] Pending queue compacted: ${key} ${originalLength} → ${compactedQueue.length}`);
          }

          safeSetItem(key, serializedQueue);
        } else {
          global.localStorage.removeItem(key);
        }
      } catch (e) { }
    };
    if (perf && typeof perf.measureSync === 'function') {
      perf.measureSync('savePendingQueue:' + String(key).slice(0, 40), run, { threshold: 10 });
    } else {
      run();
    }
  }

  /** Загрузить очередь из localStorage */
  function loadPendingQueue(key) {
    try {
      const data = global.localStorage.getItem(key);
      if (!data) return [];

      const Store = global.HEYS?.store;
      const parsed = (typeof data === 'string' && data.startsWith('¤Z¤') && typeof Store?.decompress === 'function')
        ? Store.decompress(data)
        : JSON.parse(data);

      const localOnlyFiltered = filterLocalOnlyPendingQueueItems(Array.isArray(parsed) ? parsed : [], key);
      const compacted = compactPendingQueue(localOnlyFiltered, key);

      if (Array.isArray(parsed) && (localOnlyFiltered.length !== parsed.length || compacted.length !== localOnlyFiltered.length)) {
        savePendingQueueImmediate(key, compacted);
      }

      return compacted;
    } catch (e) {
      return [];
    }
  }

  /** Сохранить очередь в localStorage */
  function savePendingQueue(key, queue) {
    if (isDebouncedPendingQueueKey(key)) {
      scheduleDebouncedSavePendingQueue(key, queue);
      return;
    }
    savePendingQueueImmediate(key, queue);
  }

  if (typeof window !== 'undefined' && !window.__heysDebouncedQueueFlushHook) {
    window.__heysDebouncedQueueFlushHook = true;
    window.addEventListener('pagehide', () => { flushDebouncedPendingQueueWrites(); });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushDebouncedPendingQueueWrites();
      });
    }
  }

  function isClientOnlySyncMode() {
    return !!(_rpcOnlyMode && _pinAuthClientId);
  }

  function getPendingQueuesSnapshot() {
    const clientQueueLen = Array.isArray(clientUpsertQueue) ? clientUpsertQueue.length : 0;
    const clientPersistedInFlightLen = Array.isArray(clientUpsertInFlightQueue) ? clientUpsertInFlightQueue.length : 0;
    const clientInFlightLen = (_uploadInProgress || clientPersistedInFlightLen > 0)
      ? Math.max(_uploadInFlightCount, clientPersistedInFlightLen)
      : 0;

    const clientOnlyMode = isClientOnlySyncMode();
    const userQueueLen = (!clientOnlyMode && Array.isArray(upsertQueue)) ? upsertQueue.length : 0;
    const userPersistedInFlightLen = (!clientOnlyMode && Array.isArray(upsertInFlightQueue)) ? upsertInFlightQueue.length : 0;
    const userInFlightLen = clientOnlyMode
      ? 0
      : ((_userUploadInProgress || userPersistedInFlightLen > 0)
        ? Math.max(_userUploadInFlightCount, userPersistedInFlightLen)
        : 0);

    return {
      isClientOnlyMode: clientOnlyMode,
      clientQueueLen,
      clientInFlightLen,
      userQueueLen,
      userInFlightLen,
      queueLen: clientQueueLen + userQueueLen,
      inFlight: clientInFlightLen + userInFlightLen,
      uploadInProgress: !!_uploadInProgress || (!clientOnlyMode && !!_userUploadInProgress),
      totalCount: clientQueueLen + clientInFlightLen + userQueueLen + userInFlightLen,
    };
  }

  /** Получить количество ожидающих изменений (включая in-flight) */
  cloud.getPendingCount = function () {
    return getPendingQueuesSnapshot().totalCount;
  };

  /** Снимок очередей (для UI/логов): client vs user, in-flight, upload */
  cloud.getPendingQueuesSnapshot = function () {
    return getPendingQueuesSnapshot();
  };

  /** Проверить есть ли данные в процессе отправки */
  cloud.isUploadInProgress = function () {
    return getPendingQueuesSnapshot().uploadInProgress;
  };

  /** Сбросить debounced pending-queue записи на диск (перед flush в облако / при уходе со страницы) */
  cloud.flushDebouncedPendingQueueWrites = flushDebouncedPendingQueueWrites;

  /** Получить детализацию pending (для UI) */
  cloud.getPendingDetails = function () {
    const details = { days: 0, products: 0, profile: 0, other: 0 };

    const snapshot = getPendingQueuesSnapshot();
    const allItems = [];
    if (Array.isArray(clientUpsertQueue)) allItems.push(...clientUpsertQueue);
    if (Array.isArray(clientUpsertInFlightQueue)) allItems.push(...clientUpsertInFlightQueue);
    if (!snapshot.isClientOnlyMode) {
      if (Array.isArray(upsertQueue)) allItems.push(...upsertQueue);
      if (Array.isArray(upsertInFlightQueue)) allItems.push(...upsertInFlightQueue);
    }

    allItems.forEach(item => {
      const k = item.k || '';
      if (k.includes('dayv2_')) details.days++;
      else if (k.includes('products')) details.products++;
      else if (k.includes('profile')) details.profile++;
      else details.other++;
    });

    return details;
  };

  /**
   * 🔄 Flush pending queue — дождаться отправки всех pending изменений в облако
   * Критично для PullRefresh: сначала сохраняем локальные изменения, потом загружаем с сервера
   * 
   * v=34 FIX: Используем doImmediateClientUpload() для немедленной отправки
   * вместо scheduleClientPush() который создавал 500ms debounce!
   * 
   * @param {number} timeoutMs - максимальное время ожидания (default: 5000ms)
   * @returns {Promise<boolean>} - true если очередь очищена, false если timeout
   */
  cloud.flushPendingQueue = async function (timeoutMs = 5000) {
    flushDebouncedPendingQueueWrites();
    const flushStartTs = Date.now();
    const snapshotBefore = () => getPendingQueuesSnapshot();
    const doImmediateAllUploads = async () => {
      await doImmediateClientUpload();
      if (!isClientOnlySyncMode()) {
        await doImmediateUserUpload();
      }
    };

    const before = snapshotBefore();
    const totalBefore = before.queueLen + before.inFlight;
    const logFlushSummary = (label, afterCount) => {
      logCritical(`🧾 [FLUSH] ${label} before=${totalBefore} after=${afterCount} ms=${Date.now() - flushStartTs}`);
    };

    const result = await flushPendingQueueCore({
      timeoutMs,
      getSnapshot: () => {
        const s = snapshotBefore();
        return { queueLen: s.queueLen, inFlight: s.inFlight, uploadInProgress: s.uploadInProgress };
      },
      doImmediateClientUpload: doImmediateAllUploads,
      getPendingCount: () => cloud.getPendingCount(),
      addQueueDrainedListener: (handler) => window.addEventListener('heys:queue-drained', handler),
      removeQueueDrainedListener: (handler) => window.removeEventListener('heys:queue-drained', handler),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (id) => clearTimeout(id),
      now: () => Date.now(),
      onLog: (phase, payload) => {
        if (phase === 'check') {
          const current = snapshotBefore();
          logCritical(
            `🔄 [FLUSH] Check: clientQueue=${current.clientQueueLen}, userQueue=${current.userQueueLen}${current.isClientOnlyMode ? ' (ignored in PIN mode)' : ''}, inFlight=${current.inFlight}`
          );
          if (current.queueLen === 0 && !current.uploadInProgress) {
            logCritical('✅ [FLUSH] Queue already empty and no uploads in progress');
          } else {
            logCritical(`🔄 [FLUSH] Need to upload ${totalBefore} pending items IMMEDIATELY...`);
            if (current.queueLen > 0) {
              logCritical('🔄 [FLUSH] Starting IMMEDIATE upload (no debounce)...');
            }
          }
          return;
        }
        if (phase === 'immediate-upload-done') {
          logCritical('✅ [FLUSH] Immediate upload completed');
          return;
        }
        if (phase === 'immediate-upload-failed') {
          err('❌ [FLUSH] Immediate upload failed:', payload?.error || payload);
          return;
        }
        if (phase === 'queue-drained-but-uploading') {
          logCritical('🔄 [FLUSH] queue-drained fired but upload still in progress, waiting...');
          return;
        }
        if (phase === 'timeout') {
          const stillPending = payload?.stillPending ?? cloud.getPendingCount();
          logCritical(`⚠️ [FLUSH] Timeout after ${timeoutMs}ms, ${stillPending} items still pending, inFlight=${getPendingQueuesSnapshot().inFlight}`);
          logFlushSummary('timeout', stillPending);
          return;
        }
        if (phase === 'noop') {
          logFlushSummary('noop', 0);
          return;
        }
        if (phase === 'done') {
          const elapsed = payload?.elapsedMs ?? Date.now() - flushStartTs;
          logCritical(`✅ [FLUSH] Queue drained in ${elapsed}ms`);
          logFlushSummary('done', 0);
        }
      },
    });

    return result;
  };

  /** Получить информацию о storage */
  cloud.getStorageInfo = function () {
    const sizeMB = getStorageSize();
    const usedPercent = Math.round((sizeMB / MAX_STORAGE_MB) * 100);
    return {
      sizeMB: sizeMB.toFixed(2),
      maxMB: MAX_STORAGE_MB,
      usedPercent,
      isNearLimit: usedPercent > 80
    };
  };

  /** Принудительная очистка старых данных */
  cloud.cleanupStorage = cleanupOldData;

  // ═══════════════════════════════════════════════════════════════════
  // 📜 SYNC HISTORY LOG — ЖУРНАЛ СИНХРОНИЗАЦИЙ
  // ═══════════════════════════════════════════════════════════════════

  const SYNC_LOG_KEY = 'heys_sync_log';
  const MAX_SYNC_LOG_ENTRIES = 150;
  const SYNC_PROGRESS_EVENT = 'heys:sync-progress';
  const SYNC_COMPLETED_EVENT = 'heysSyncCompleted';
  let syncProgressTotal = 0;
  let syncProgressDone = 0;
  /** Dedupe identical pending snapshots (burst enqueue + scheduleClientPush). */
  let _lastPendingEmitSig = '';
  /** Throttle identical sync-progress pairs (React + logs). */
  let _lastSyncProgressEmittedTotal = -1;
  let _lastSyncProgressEmittedDone = -1;
  let _lastSyncProgressEmitAt = 0;
  const SYNC_PROGRESS_DEDUPE_MS = 55;
  const AUTH_ERROR_CODES = new Set(['401', '42501', 'PGRST301']);

  /** Проверка, является ли ошибка ошибкой авторизации (401, RLS) */
  function isAuthError(error) {
    if (!error) return false;
    // HTTP статус 401
    if (error.status === 401 || error.statusCode === 401) return true;
    // PostgreSQL RLS error
    if (error.code && AUTH_ERROR_CODES.has(String(error.code))) return true;
    // Supabase error message
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('unauthorized') || msg.includes('jwt') || msg.includes('invalid claim')) return true;
    return false;
  }

  /** Добавить запись в журнал синхронизации */
  function addSyncLogEntry(type, details) {
    const perf = global.HEYS?.perfMainThread;
    const run = () => {
      try {
        const log = JSON.parse(global.localStorage.getItem(SYNC_LOG_KEY) || '[]');
        log.unshift({
          ts: Date.now(),
          type, // 'sync_ok' | 'sync_error' | 'offline' | 'online' | 'quota_error'
          details
        });
        // Ограничиваем размер лога
        if (log.length > MAX_SYNC_LOG_ENTRIES) {
          log.length = MAX_SYNC_LOG_ENTRIES;
        }
        global.localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(log));
      } catch (e) { }
    };
    if (perf && typeof perf.measureSync === 'function') {
      perf.measureSync('addSyncLogEntry:' + String(type).slice(0, 24), run, { threshold: 10 });
    } else {
      run();
    }
  }

  /** Получить журнал синхронизации */
  cloud.getSyncLog = function () {
    try {
      return JSON.parse(global.localStorage.getItem(SYNC_LOG_KEY) || '[]');
    } catch (e) {
      return [];
    }
  };

  /** Очистить журнал синхронизации */
  cloud.clearSyncLog = function () {
    global.localStorage.removeItem(SYNC_LOG_KEY);
  };

  // Last upload diagnostic — held in memory only, exposed via cloud.getLastUploadDiag()
  // for badge-tap snapshot to surface real cause of upload failures (413 etc).
  let _lastUploadDiag = null;
  function recordUploadDiag(info) {
    try {
      _lastUploadDiag = { ts: Date.now(), ...info };
    } catch (_) { /* noop */ }
  }
  cloud.getLastUploadDiag = function () { return _lastUploadDiag; };

  // Inspect pending queue: for each item return { k, sizeBytes, compressed, vKind }.
  // Used by debug snapshot. Reads stored JSON from localStorage.
  cloud.getPendingItemsDetail = function () {
    const out = { queue: [], inflight: [], totalSizeBytes: 0 };
    const PENDING_KEYS = ['heys_pending_client_sync_queue', 'heys_pending_client_sync_inflight_queue'];
    const TARGETS = ['queue', 'inflight'];
    for (let i = 0; i < PENDING_KEYS.length; i++) {
      const raw = global.localStorage.getItem(PENDING_KEYS[i]);
      if (!raw) continue;
      let arr;
      try { arr = JSON.parse(raw); } catch (_) { continue; }
      if (!Array.isArray(arr)) continue;
      for (let j = 0; j < arr.length; j++) {
        const it = arr[j];
        if (!it) continue;
        const v = it.v;
        let sizeBytes = 0;
        let compressed = false;
        let vKind = 'unknown';
        try {
          if (typeof v === 'string') {
            sizeBytes = v.length;
            compressed = v.startsWith('¤Z¤');
            vKind = compressed ? 'compressed-string' : 'string';
          } else if (Array.isArray(v)) {
            sizeBytes = JSON.stringify(v).length;
            vKind = `array[${v.length}]`;
          } else if (v && typeof v === 'object') {
            sizeBytes = JSON.stringify(v).length;
            vKind = 'object';
          } else {
            sizeBytes = JSON.stringify(v ?? null).length;
            vKind = String(typeof v);
          }
        } catch (_) { sizeBytes = -1; vKind = 'serialize-fail'; }
        out[TARGETS[i]].push({ k: it.k, sizeBytes, compressed, vKind, updated_at: it.updated_at });
        if (sizeBytes > 0) out.totalSizeBytes += sizeBytes;
      }
    }
    return out;
  };

  /** Событие для UI об изменении pending count */
  const _notifyPendingRafFn = global.requestAnimationFrame
    ? global.requestAnimationFrame.bind(global)
    : function (cb) { return setTimeout(cb, 0); };
  let _notifyPendingRaf = null;
  function notifyPendingChange() {
    if (_notifyPendingRaf != null) return;
    _notifyPendingRaf = _notifyPendingRafFn(() => {
      _notifyPendingRaf = null;
      const count = cloud.getPendingCount();
      const details = cloud.getPendingDetails();
      const snap = getPendingQueuesSnapshot();
      const pendingSig = [
        count,
        snap.uploadInProgress ? 1 : 0,
        snap.clientQueueLen,
        snap.clientInFlightLen,
        snap.userQueueLen,
        snap.userInFlightLen,
        details.days,
        details.products,
        details.profile,
        details.other
      ].join(':');
      // Defer event dispatch to avoid setState during render
      queueMicrotask(() => {
        try {
          if (pendingSig !== _lastPendingEmitSig) {
            _lastPendingEmitSig = pendingSig;
            bumpSmoothnessCounter('pending_change_emit');
            global.dispatchEvent(new CustomEvent('heys:pending-change', {
              detail: { count, details }
            }));
          }
        } catch (e) { }
        // PERF: do not call updateSyncProgressTotal() here — it ratcheted total on every
        // pending signature change and drove curator sync UI + overlay thrash. Progress
        // updates on upload start (doClientUpload) and RPC/legacy batch completion.
      });
    });
  }

  /** Событие: прогресс синхронизации */
  function notifySyncProgress(total, done) {
    const t = Number(total) || 0;
    const d = Number(done) || 0;
    const now = Date.now();
    if (
      t === _lastSyncProgressEmittedTotal &&
      d === _lastSyncProgressEmittedDone &&
      (now - _lastSyncProgressEmitAt) < SYNC_PROGRESS_DEDUPE_MS
    ) {
      return;
    }
    _lastSyncProgressEmittedTotal = t;
    _lastSyncProgressEmittedDone = d;
    _lastSyncProgressEmitAt = now;
    bumpSmoothnessCounter('sync_progress_emit');
    try {
      global.dispatchEvent(new CustomEvent(SYNC_PROGRESS_EVENT, { detail: { total: t, done: d } }));
    } catch (e) { }
  }

  /** Событие: завершение синхронизации обеих очередей (upload) */
  function notifySyncCompletedIfDrained() {
    const snapshot = getPendingQueuesSnapshot();
    if (snapshot.totalCount === 0 && !snapshot.uploadInProgress) {
      _lastPendingEmitSig = '';
      _lastSyncProgressEmittedTotal = -1;
      _lastSyncProgressEmittedDone = -1;
      syncProgressTotal = 0;
      syncProgressDone = 0;
      // Событие "очередь пуста" — для UI индикатора синхронизации
      // НЕ используем heysSyncCompleted — это для initial sync клиента!
      try {
        global.dispatchEvent(new CustomEvent('heys:queue-drained', { detail: {} }));
      } catch (e) { }
    }
  }

  /** Событие: синхронизация восстановлена */
  function notifySyncRestored(syncedCount) {
    try {
      addSyncLogEntry('sync_ok', { count: syncedCount });
      global.dispatchEvent(new CustomEvent('heys:sync-restored', {
        detail: { count: syncedCount }
      }));
    } catch (e) { }
  }

  /** Событие: ошибка синхронизации */
  function notifySyncError(error, retryIn) {
    try {
      const errorMsg = error?.message || String(error);
      if (typeof navigator !== 'undefined') {
        logCritical(`🌐 [NET] Sync error: ${navigator.onLine ? 'online' : 'offline'}`);
      }
      console.error('🔥 [SYNC ERROR] Critical sync failure:', errorMsg);

      addSyncLogEntry('sync_error', { error: errorMsg });

      // Отправляем событие с флагом persistent, чтобы UI знал, что это важно
      global.dispatchEvent(new CustomEvent('heys:sync-error', {
        detail: {
          error: errorMsg,
          retryIn,
          persistent: true // 🆕 Флаг для UI: не скрывать ошибку само
        }
      }));
    } catch (e) { }
  }

  /** Обработка ошибок авторизации/RLS */
  function handleAuthFailure(err) {
    try {
      const errMsg = err?.message || err?.code || String(err);
      logCritical('🚨 [handleAuthFailure] ВЫЗВАН! Причина:', errMsg);
      console.trace('[handleAuthFailure] Stack trace:');

      // 🛡️ Защита: если недавно был успешный signIn — игнорируем
      if (Date.now() < _ignoreSignedOutUntil) {
        logCritical('🛡️ [handleAuthFailure] Игнорируем — защитный период после signIn');
        return;
      }

      // 🔐 RTR (Refresh Token Rotation) ошибка — НЕ УДАЛЯЕМ токен!
      // При infinite токенах access_token всё ещё валиден, даже если refresh_token уже использован.
      // Пример: "Invalid Refresh Token: Already Used"
      const isRTRError = errMsg.includes('Refresh Token') || errMsg.includes('Already Used') || errMsg.includes('refresh_token');
      if (isRTRError) {
        logCritical('⏭️ [handleAuthFailure] RTR ошибка — токен НЕ удаляем (access_token валиден)');
        return; // Не удаляем токен, не сбрасываем user
      }

      // 🔐 RLS ошибка — НЕ УДАЛЯЕМ токен!
      // RLS ошибка означает что запрос ПРОШЁЛ аутентификацию (иначе был бы 401),
      // просто политика не позволяет операцию. Access_token всё ещё валиден!
      // Пример: "new row violates row-level security policy for table"
      const isRLSError = errMsg.includes('row-level security') || errMsg.includes('policy') || errMsg.includes('RLS');
      if (isRLSError) {
        logCritical('⏭️ [handleAuthFailure] RLS ошибка — токен НЕ удаляем (access_token валиден)');
        return; // Не удаляем токен, не сбрасываем user
      }

      // Только реальные ошибки аутентификации (401 Unauthorized, invalid token) должны удалять токен
      // Проверяем что это именно ошибка авторизации, а не что-то другое
      // ⚠️ Используем точные паттерны чтобы не матчить "token valid" или "policy token"
      const isRealAuthError = errMsg.includes('401') ||
        errMsg.includes('Unauthorized') ||
        errMsg.includes('invalid token') ||
        errMsg.includes('token expired') ||
        errMsg.includes('token invalid') ||
        errMsg.includes('missing token') ||
        errMsg.includes('no token') ||
        errMsg.includes('expired') ||
        errMsg.includes('JWT');

      if (!isRealAuthError) {
        logCritical('⏭️ [handleAuthFailure] Не-auth ошибка — токен НЕ удаляем');
        return;
      }

      status = CONNECTION_STATUS.OFFLINE;
      user = null;
      // 🔄 Очистка невалидного токена — предотвращает повторные 401 ошибки
      try {
        localStorage.removeItem('heys_supabase_auth_token');
      } catch (e) { }
      addSyncLogEntry('sync_error', { error: 'auth_required' });

      // 🔥 INSTANT FEEDBACK: Критическая ошибка авторизации
      global.dispatchEvent(new CustomEvent('heys:sync-error', {
        detail: {
          error: 'auth_required',
          persistent: true
        }
      }));

      logCritical('❌ Требуется повторный вход (auth/RLS error)');
    } catch (e) { }
  }

  /** Обновить total прогресса (max между уже сделанным и новым pending) */
  function updateSyncProgressTotal() {
    const pending = cloud.getPendingCount();
    const candidate = syncProgressDone + pending;
    if (candidate > syncProgressTotal) {
      syncProgressTotal = candidate;
      notifySyncProgress(syncProgressTotal, syncProgressDone);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🔄 EXPONENTIAL BACKOFF ДЛЯ RETRY
  // ═══════════════════════════════════════════════════════════════════

  let retryAttempt = 0;
  const MAX_RETRY_ATTEMPTS = 5;
  const BASE_RETRY_DELAY = 1000; // 1 сек

  /** Вычислить задержку с exponential backoff */
  function getRetryDelay() {
    // 1s, 2s, 4s, 8s, 16s (max)
    return Math.min(BASE_RETRY_DELAY * Math.pow(2, retryAttempt), 16000);
  }

  /** Сбросить счётчик retry при успешной синхронизации */
  function resetRetry() {
    retryAttempt = 0;
  }

  /** Увеличить счётчик retry */
  function incrementRetry() {
    if (retryAttempt < MAX_RETRY_ATTEMPTS) {
      retryAttempt++;
    }
  }

  // Умное логирование: только критические операции
  // Включается через localStorage: localStorage.setItem('heys_debug_sync', 'true')
  const isDebugSync = () =>
    global.__heysLogControl?.isEnabled?.('cloud') === true ||
    global.localStorage.getItem('heys_debug_sync') === 'true';

  function log() {
    // Тихий режим по умолчанию — только для debug
    if (isDebugSync()) {
      try {
        if (HEYS?.log) {
          HEYS.log('HEYS.cloud', ...arguments);
          return;
        }
        console.log.apply(console, ['[HEYS.cloud]'].concat([].slice.call(arguments)));
      } catch (e) { }
    }
  }
  function err() {
    try {
      if (HEYS?.err) {
        HEYS.err('HEYS.cloud:ERR', ...arguments);
        return;
      }
      console.error.apply(console, ['[HEYS.cloud:ERR]'].concat([].slice.call(arguments)));
    } catch (e) { }
  }

  // 🔐 Критический лог — ВСЕГДА виден (синхронизация, auth, важные операции)
  function logCritical() {
    try {
      // Шумные индикаторные/диагностические логи оставляем только в debug-режиме,
      // чтобы не перегружать main thread на проде/обычном локальном запуске.
      if (!isDebugSync() && arguments.length > 0) {
        const first = String(arguments[0] || '');
        if (
          first.includes('[IND]') ||
          first.includes('[SAVE DEBUG]') ||
          first.includes('[TIMESTAMP CHECK]')
        ) {
          return;
        }
      }
      if (global.console && typeof global.console.info === 'function') {
        global.console.info.apply(global.console, ['[HEYS.sync]'].concat([].slice.call(arguments)));
        return;
      }
      console.info.apply(console, ['[HEYS.sync]'].concat([].slice.call(arguments)));
    } catch (e) { }
  }

  const _syncLogThrottleMap = new Map();
  function logCriticalThrottled(throttleKey, intervalMs, ...args) {
    const now = Date.now();
    const last = _syncLogThrottleMap.get(throttleKey) || 0;
    if (now - last < Math.max(0, intervalMs || 0)) return;
    _syncLogThrottleMap.set(throttleKey, now);
    logCritical(...args);
  }

  /**
   * Проверка, является ли ошибка сетевой (QUIC, fetch failed, network error)
   * @param {Object|Error} error - Объект ошибки
   * @returns {boolean} true если это сетевая ошибка
   */
  function isNetworkError(error) {
    if (!error) return false;
    const msg = (error.message || error.details || '').toLowerCase();
    return msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('quic') ||
      msg.includes('connection') ||
      msg.includes('timeout') ||
      msg.includes('aborted');
  }

  /**
   * Выполнение запроса с retry и exponential backoff для сетевых ошибок
   * @param {Function} requestFn - Функция, возвращающая Promise (должна быть функцией, не Promise!)
   * @param {Object} options - Опции
   * @param {number} options.maxRetries - Максимум ретраев (по умолчанию 3)
   * @param {number} options.baseDelayMs - Базовая задержка (по умолчанию 1000)
   * @param {number} options.timeoutMs - Таймаут каждого запроса (по умолчанию 15000)
   * @param {string} options.label - Метка для логирования
   * @returns {Promise} { data, error } или результат запроса
   */
  async function fetchWithRetry(requestFn, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const baseDelayMs = options.baseDelayMs || 1000;
    const timeoutMs = options.timeoutMs || 15000;
    const label = options.label || 'request';

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Таймаут для каждой попытки
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeoutMs)
        );

        // requestFn — функция, которая создаёт новый Promise при каждом вызове
        const result = await Promise.race([requestFn(), timeoutPromise]);

        // Supabase возвращает { data, error } — проверяем error
        if (result && result.error && isNetworkError(result.error)) {
          throw new Error(result.error.message || 'Network error');
        }

        // Успешный запрос — регистрируем
        registerSuccess();
        return result;
      } catch (e) {
        lastError = e;

        // Если это не сетевая ошибка — не ретраим
        if (!isNetworkError({ message: e.message })) {
          return { data: null, error: { message: e.message } };
        }

        // Регистрируем ошибку
        registerError();

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s с jitter ±20%
          const baseDelay = baseDelayMs * Math.pow(2, attempt);
          const jitter = baseDelay * (0.8 + Math.random() * 0.4); // ±20%
          const delay = Math.round(jitter);
          console.warn(`[HEYS.cloud] ⚡ ${label}: сетевая ошибка, retry ${attempt + 1}/${maxRetries} через ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // Все ретраи исчерпаны — попробуем fallback
    if (options._afterFallback) {
      // Уже пробовали fallback — сдаёмся
      console.warn(`[HEYS.cloud] ❌ ${label}: fallback тоже не помог, переход в offline режим`);
      return { data: null, error: { message: lastError?.message || 'Network error after retries', isNetworkFailure: true } };
    }

    // Проверяем можно ли переключаться
    if (!canSwitch()) {
      console.warn(`[HEYS.cloud] ❌ ${label}: все ${maxRetries} попытки не удались, переключение заблокировано (debounce)`);
      return { data: null, error: { message: lastError?.message || 'Network error after retries', isNetworkFailure: true } };
    }

    // Попробуем переключиться на другой режим
    if (!_usingDirectConnection && cloud._directUrl && cloud._proxyUrl !== cloud._directUrl) {
      // Сейчас на proxy — переключаемся на direct
      console.warn(`[HEYS.cloud] 🔄 ${label}: переключаемся на прямое подключение к Supabase...`);
      try {
        _lastSwitchTime = Date.now();
        _consecutiveErrors = 0;
        await switchToDirectConnection();
        return await fetchWithRetry(requestFn, { ...options, _afterFallback: true });
      } catch (fallbackErr) {
        console.warn(`[HEYS.cloud] ❌ Direct fallback не сработал:`, fallbackErr?.message);
      }
    } else if (_usingDirectConnection && cloud._proxyUrl) {
      // Сейчас на direct — переключаемся на proxy
      console.warn(`[HEYS.cloud] 🔄 ${label}: переключаемся обратно на proxy...`);
      try {
        await switchToProxyConnection();
        return await fetchWithRetry(requestFn, { ...options, _afterFallback: true });
      } catch (fallbackErr) {
        console.warn(`[HEYS.cloud] ❌ Proxy fallback не сработал:`, fallbackErr?.message);
      }
    }

    console.warn(`[HEYS.cloud] ❌ ${label}: все ${maxRetries} попытки не удались, переход в offline режим`);
    return { data: null, error: { message: lastError?.message || 'Network error after retries', isNetworkFailure: true } };
  }

  /**
   * Переключение на прямое подключение к Supabase (fallback при недоступности proxy)
   * ⚠️ Не пересоздаём client чтобы избежать "Multiple GoTrueClient" warning
   * Просто сохраняем режим — при следующей перезагрузке применится
   */
  async function switchToDirectConnection() {
    if (_usingDirectConnection) return; // Уже переключились
    if (!cloud._directUrl || !cloud._anonKey) {
      throw new Error('Direct URL not configured');
    }

    _usingDirectConnection = true;
    _lastSwitchTime = Date.now();
    _consecutiveErrors = 0;
    _successCount = 0;

    // Сохраняем режим для следующей загрузки
    try {
      localStorage.setItem('heys_connection_mode', 'direct');
      logCritical('🔄 [ROUTING] Режим "direct" сохранён — применится после перезагрузки');
    } catch (e) {
      console.warn('[ROUTING] Не удалось сохранить режим:', e.message);
    }

    // НЕ пересоздаём client — текущая сессия продолжит работать на proxy
    // При следующей загрузке приложение стартует с direct
    addSyncLogEntry('mode_change', { newMode: 'direct', appliedAt: 'next_reload' });
  }

  /**
   * Переключение обратно на proxy подключение (fallback при недоступности direct)
   * ⚠️ Не пересоздаём client чтобы избежать "Multiple GoTrueClient" warning
   * Просто сохраняем режим — при следующей перезагрузке применится
   */
  async function switchToProxyConnection() {
    if (!_usingDirectConnection) return; // Уже на прокси
    if (!cloud._proxyUrl || !cloud._anonKey) {
      throw new Error('Proxy URL not configured');
    }

    _usingDirectConnection = false;
    _lastSwitchTime = Date.now();
    _consecutiveErrors = 0;
    _successCount = 0;

    // Сохраняем режим для следующей загрузки
    try {
      localStorage.setItem('heys_connection_mode', 'proxy');
      logCritical('🔄 [ROUTING] Режим "proxy" сохранён — применится после перезагрузки');
    } catch (e) {
      console.warn('[ROUTING] Не удалось сохранить режим:', e.message);
    }

    // НЕ пересоздаём client — текущая сессия продолжит работать на direct
    // При следующей загрузке приложение стартует с proxy
    addSyncLogEntry('mode_change', { newMode: 'proxy', appliedAt: 'next_reload' });
  }

  /**
   * Проверка, можно ли переключаться на другой режим
   */
  function canSwitch() {
    // Debounce: не переключаться слишком часто
    if (Date.now() - _lastSwitchTime < SWITCH_DEBOUNCE_MS) {
      log(`[ROUTING] Переключение заблокировано — прошло ${Date.now() - _lastSwitchTime}ms < ${SWITCH_DEBOUNCE_MS}ms`);
      return false;
    }
    // Требуем несколько последовательных ошибок
    if (_consecutiveErrors < MIN_ERRORS_FOR_SWITCH) {
      log(`[ROUTING] Переключение заблокировано — только ${_consecutiveErrors} ошибок < ${MIN_ERRORS_FOR_SWITCH}`);
      return false;
    }
    return true;
  }

  /**
   * Регистрация успешного запроса
   */
  function registerSuccess() {
    _consecutiveErrors = 0;
    _successCount++;

    // После 3+ успешных запросов сохраняем режим
    if (_successCount === MIN_SUCCESS_FOR_SAVE) {
      const mode = _usingDirectConnection ? 'direct' : 'proxy';
      try {
        localStorage.setItem('heys_connection_mode', mode);
        log(`[ROUTING] ✅ Режим '${mode}' сохранён после ${_successCount} успешных запросов`);
      } catch (e) {
        console.warn('[ROUTING] Не удалось сохранить режим в localStorage:', e.message);
      }
    }
  }

  /**
   * Регистрация ошибки запроса
   */
  function registerError() {
    // Не накапливать ошибки в offline режиме — это не проблема с routing
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    _consecutiveErrors++;
    _successCount = 0;
  }

  // Экспортируем для отладки и использования из других модулей
  cloud.switchToDirectConnection = switchToDirectConnection;
  cloud.switchToProxyConnection = switchToProxyConnection;
  cloud.registerSuccess = registerSuccess;
  cloud.registerError = registerError;
  cloud.fetchWithRetry = fetchWithRetry; // Для внешних модулей (heys_app_v12.js)
  cloud.getRoutingStatus = function () {
    return {
      mode: _usingDirectConnection ? 'direct' : 'proxy',
      consecutiveErrors: _consecutiveErrors,
      successCount: _successCount,
      lastSwitchTime: _lastSwitchTime,
      canSwitch: canSwitch()
    };
  };

  /**
   * Обёртка для запросов с таймаутом (legacy, для простых запросов)
   * @param {Promise} promise - Promise для выполнения
   * @param {number} ms - Таймаут в миллисекундах (по умолчанию 10000)
   * @param {string} label - Метка для логирования ошибки
   * @returns {Promise} Результат или {error} при таймауте
   */
  async function withTimeout(promise, ms = 10000, label = 'request') {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} took too long`)), ms)
    );
    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (e) {
      // Для bootstrapSync таймаут — это нормально при медленной сети, не критическая ошибка
      if (label.includes('bootstrap')) {
        console.warn(`[HEYS.cloud] ⏳ ${label}: медленная сеть, синхронизация продолжается...`);
      } else {
        err(`${label} timeout`, e.message);
      }
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * Безопасный парсинг JSON
   * @param {string} v - Строка для парсинга
   * @returns {*} Распарсенное значение или исходная строка при ошибке
   */
  function tryParse(v) {
    try {
      // 🔧 FIX 2025-12-26: Используем decompress для обработки сжатых данных
      // Без этого сжатые строки "¤Z¤[{..." сохранялись в cloud как есть, ломая sync
      const Store = global.HEYS?.store;
      if (Store && typeof Store.decompress === 'function') {
        return Store.decompress(v);
      }
      // Fallback если store ещё не загружен
      return JSON.parse(v);
    } catch (e) {
      return v;
    }
  }

  /**
   * Проверка, является ли ключ нашим (для зеркалирования/очистки)
   * @param {string} k - Ключ для проверки
   * @returns {boolean} true если это наш ключ
   */
  function isOurKey(k) {
    if (typeof k !== 'string') return false;

    // 🔒 Никогда не трогаем auth-сессию Supabase
    // Иначе bootstrapSync/clearNamespace удалит токен и пользователь «вылетит» сразу после входа.
    if (isSensitiveSessionStorageKey(k)) return false;

    // 🧪 A/B тестирование и локальная аналитика — НЕ синхронизировать в облако
    if (k.indexOf('heys_ab_') === 0) return false;
    if (k.indexOf('heys_predicted_risk_') === 0) return false;

    if (k.indexOf(KEY_PREFIXES.HEYS) === 0) return true;
    // также разрешаем ключи дней
    const lower = k.toLowerCase();
    if (lower.indexOf(KEY_PREFIXES.DAY) >= 0) return true;
    return false;
  }

  /**
   * Очистка namespace в localStorage (наши ключи)
   * @param {string} clientId - ID клиента для очистки специфичных ключей, или null для полной очистки
   */
  function clearNamespace(clientId) {
    try {
      const ls = global.localStorage;
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (!k) continue;
        const lower = k.toLowerCase();

        if (clientId) {
          // Очистка только client-specific ключей
          const heysClientPrefix = (KEY_PREFIXES.HEYS + clientId + '_').toLowerCase();
          const dayClientPrefix = (CLIENT_KEY_PATTERNS.DAY_CLIENT + clientId + '_').toLowerCase();

          if (lower.indexOf(heysClientPrefix) === 0) {
            ls.removeItem(k);
            continue;
          }
          if (lower.indexOf(dayClientPrefix) === 0) {
            ls.removeItem(k);
            continue;
          }

          // Также очищаем общие ключи, которые должны быть client-specific
          if (CLIENT_SPECIFIC_KEYS.includes(k)) {
            ls.removeItem(k);
            continue;
          }
        } else {
          // Полная очистка всех наших ключей
          if (isOurKey(k)) ls.removeItem(k);
        }
      }
    } catch (e) {
      err('clearNamespace', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🔄 ПЕРЕХВАТ LOCALSTORAGE
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Проверка, требует ли ключ client-specific хранилища
   * @param {string} k - Ключ для проверки (может быть scoped: heys_{clientId}_game)
   * @returns {boolean} true если нужен client_kv_store
   */
  function needsClientStorage(k) {
    if (!k) return false;
    // Проверяем дни пользователя
    if (k.includes(CLIENT_KEY_PATTERNS.DAY_V2)) return true;

    // Извлекаем базовый ключ из scoped (heys_{clientId}_game → heys_game)
    // Pattern: heys_{uuid}_suffix → heys_suffix
    const baseKey = stripClientScopePrefixes(String(k || '')).key;

    // Проверяем общие client-specific ключи
    if (CLIENT_SPECIFIC_KEYS.includes(k) || CLIENT_SPECIFIC_KEYS.includes(baseKey)) return true;

    // Проверяем префиксы (динамические ключи типа heys_milestone_7_days)
    for (const prefix of CLIENT_SPECIFIC_PREFIXES) {
      if (k.startsWith(prefix) || baseKey.startsWith(prefix)) return true;
    }
    return false;
  }

  /**
   * Перехват localStorage.setItem для автоматического зеркалирования в cloud
   * Зеркалирует наши ключи (heys_*, day*) в Supabase
   * Обрабатывает QuotaExceededError автоматической очисткой
   */
  // Дедупликация: последние сохранённые ключи и их updatedAt
  const _lastSavedKeys = new Map(); // key → { updatedAt, timestamp }
  const DEDUP_WINDOW_MS = 1000; // Окно дедупликации: 1 секунда

  // 🔒 Ключи, которые НИКОГДА нельзя зеркалировать в cloud (и нельзя триггерить SDK запросы)
  // Причина: при записи Supabase session эти ключи могут вызвать _useSession/__loadSession
  // и привести к refresh_token 400 (RTR), а также это чувствительные данные.
  const AUTH_STORAGE_KEYS_TO_SKIP = new Set([
    'heys_curator_session',
    'heys_pin_auth_client',
    'heys_session_token',
    'heys_supabase_auth_token',
    'sb-ukqolcziqcuplqfgrmsh-auth-token'
  ]);

  function interceptSetItem() {
    try {
      if (originalSetItem) return; // Защита от повторного перехвата

      // Сохраняем оригинальный метод в глобальную переменную
      originalSetItem = global.localStorage.setItem.bind(global.localStorage);
      // Track last seen totalItems per dayv2 key to detect regressions (writer
      // overwrites with stale snapshot). On regression we escalate to warn+stack.
      const _dayv2LastSeenItems = new Map();
      global.localStorage.setItem = function (k, v) {
        // 🔬 [HEYS.day-trace] 5b/8 LS interceptor — every dayv2 setItem is captured here.
        try {
          if (typeof k === 'string' && /heys_(?:[0-9a-f-]+_)?dayv2_\d{4}-\d{2}-\d{2}/.test(k)) {
            // Use Store.decompress to handle compressed values correctly.
            let parsed = null;
            try {
              const _Store = global.HEYS && global.HEYS.store;
              if (_Store && typeof _Store.decompress === 'function' && typeof v === 'string') {
                parsed = _Store.decompress(v);
              } else {
                parsed = typeof v === 'string' ? JSON.parse(v) : v;
              }
            } catch (_) { /* noop */ }
            const _meals = (parsed && Array.isArray(parsed.meals)) ? parsed.meals : null;
            const _totalItems = _meals ? _meals.reduce((acc, m) => acc + ((m && Array.isArray(m.items)) ? m.items.length : 0), 0) : null;
            // Regression detection: did we just shrink a previously-larger snapshot?
            // This is the smoking gun for stale-writer races (e.g. gamification overwrite).
            const _prevItems = _dayv2LastSeenItems.get(k);
            const _shrunk = _prevItems != null && _totalItems != null && _totalItems < _prevItems;
            if (_totalItems != null) _dayv2LastSeenItems.set(k, Math.max(_prevItems || 0, _totalItems));
            if (_shrunk) {
              // Escalate: regression detected. Warn + stack trace identifies the writer.
              console.warn('[HEYS.day-trace] 5b/8 LS interceptor ⚠️ SHRINK', {
                key: k,
                prevTotalItems: _prevItems,
                newTotalItems: _totalItems,
                vSize: typeof v === 'string' ? v.length : '<obj>',
                updatedAt: parsed && parsed.updatedAt,
                sourceId: parsed && parsed._sourceId,
                stack: new Error().stack.split('\n').slice(1, 10).join('\n'),
              });
            } else {
              // Normal write — single-line info, no stack noise.
              console.info('[HEYS.day-trace] 5b/8 LS interceptor', {
                key: k,
                mealsCount: _meals ? _meals.length : '<not-array>',
                totalItems: _totalItems,
                updatedAt: parsed && parsed.updatedAt,
              });
            }
          }
        } catch (_) { /* noop */ }
        // ── Overlay self-heal guard ──────────────────────────────────────────────
        // Blocks ALL paths (YANDEX RESTORE, HOT-sync, bootstrapClientSync paginated)
        // from overwriting a freshly self-healed overlay with stale/dirty cloud data.
        // Marker 'heys_overlay_self_healed_at' = '<healedCount>:<timestamp>' is
        // written by migration overlayBigger branch after TypeA dedup. TTL: 5 min.
        try {
          const _kStr = String(k || '');
          if (_kStr.endsWith('_products_overlay_v2') || _kStr === 'heys_products_overlay_v2') {
            const _rawMarker = typeof global.localStorage.getItem === 'function'
              ? global.localStorage.getItem('heys_overlay_self_healed_at') : null;
            if (_rawMarker) {
              const _mParts = _rawMarker.split(':');
              const _healedCount = parseInt(_mParts[0], 10);
              const _healedAt = parseInt(_mParts[1], 10);
              if (!isNaN(_healedCount) && _healedCount > 0 && !isNaN(_healedAt)
                  && (Date.now() - _healedAt) < 300000 /* 5 min */) {
                let _incomingCount = 0;
                try {
                  let _arr = null;
                  if (typeof v === 'string') {
                    if (v.startsWith('¤Z¤') && global.HEYS && global.HEYS.store
                        && typeof global.HEYS.store.decompress === 'function') {
                      _arr = global.HEYS.store.decompress(v);
                    } else {
                      _arr = JSON.parse(v);
                    }
                  } else if (Array.isArray(v)) {
                    _arr = v;
                  }
                  if (Array.isArray(_arr)) _incomingCount = _arr.length;
                } catch (_e2) { /* noop */ }
                if (_incomingCount > _healedCount) {
                  if (typeof logCritical === 'function') {
                    logCritical(`⛔ [OVERLAY GUARD] Blocked dirty restore: incoming=${_incomingCount} > healed=${_healedCount}, key=…${_kStr.slice(-36)}`);
                  }
                  return; // Silently drop the write — local healed state wins
                }
              }
            }
          }
        } catch (_e) { /* noop — never crash setItem */ }
        // ────────────────────────────────────────────────────────────────────────
        // (verbose ls.setItem logging removed for prod; HOT-sync BLOCK + setAll BLOCKED still warn)
        // Используем безопасную запись с обработкой QuotaExceeded
        if (!safeSetItem(k, v)) {
          // Если не удалось сохранить даже после очистки — логируем
          console.warn('[HEYS] Не удалось сохранить:', k);
          return;
        }

        // ──────────────────────────────────────────────────────────────────
        // Phase β: universal dual-write to overlay store. Catches ALL writes
        // to legacy heys_<cid>_products regardless of code path (setAll, Store.set
        // self-heal, best-keyspace fallback, applyForegroundHotSyncValue, etc.).
        // Plan ref: β-audit fix #1 (CRITICAL — was silently bypassed by ~20 sites).
        //
        // Skip:
        //   - the overlay key itself (would loop forever)
        //   - pre_overlay snapshots (rollback safety, not real products)
        //   - hidden/favorite/deleted/rpc_tail (not the personal product list)
        // Gate:
        //   - dual_write_legacy flag
        //   - migration_status === 'success'
        //   - shared cache populated
        // ──────────────────────────────────────────────────────────────────
        try {
          const keyStr = String(k || '');
          const isOverlayKey = keyStr.endsWith('_products_overlay_v2') || keyStr === 'heys_products_overlay_v2';
          const isPreOverlay = keyStr.indexOf('heys_products_pre_overlay_') === 0;
          const isProductsKey = /^heys_.*products$/.test(keyStr) && !/(_hidden_products|_favorite_products|_deleted_products|_rpc_tail)/.test(keyStr);
          // Cloud-canonical guard: после первичной миграции overlay = source of truth.
          // Любая запись в legacy heys_products (через cloud-sync setAll, orphan-recovery
          // setAll, и т.п.) НЕ должна перестраивать overlay. Overlay управляется только
          // через applyCloudSnapshot / upsertRow / addFromShared. Эта ветка ранее затирала
          // 285 TypeA строк когда cloud присылал stale legacy 150 — пропускаем целиком.
          // Если overlay пустой (свежий клиент, ещё не было миграции) — даём dual-write
          // отработать, чтобы первичный bootstrap из legacy сработал.
          let _overlayCanonical = false;
          try {
            if (global.HEYS && global.HEYS.OverlayStore
                && typeof global.HEYS.OverlayStore.readRaw === 'function') {
              const _existingOverlay = global.HEYS.OverlayStore.readRaw();
              _overlayCanonical = Array.isArray(_existingOverlay) && _existingOverlay.length > 0;
            }
          } catch (_) { /* noop */ }
          if (_overlayCanonical && isProductsKey && !isOverlayKey && !isPreOverlay) {
            try { console.info('[HEYS.products] interceptor skipped: overlay non-empty, cloud-canonical', { keyTail: keyStr.slice(-30) }); } catch (_) {}
          } else if (isProductsKey && !isOverlayKey && !isPreOverlay
              && global.HEYS && global.HEYS.flags
              && global.HEYS.flags.isEnabled && global.HEYS.flags.isEnabled('dual_write_legacy')
              && global.localStorage.getItem('heys_overlay_migration_status') === 'success'
              && global.HEYS.OverlayStore && global.HEYS.cloud && global.HEYS.cloud.getSharedIndex) {
            const sharedById = global.HEYS.cloud.getSharedIndex();
            if (sharedById && sharedById.size > 0) {
              // Decompress if needed: Store.set compresses big arrays into '¤Z¤...' strings.
              let arr = null;
              if (typeof v === 'string') {
                if (v.startsWith('¤Z¤') && global.HEYS.store && typeof global.HEYS.store.decompress === 'function') {
                  try { arr = global.HEYS.store.decompress(v); } catch (_) { /* noop */ }
                } else {
                  try { arr = JSON.parse(v); } catch (_) { /* noop */ }
                }
              } else {
                arr = v;
              }
              // 🔬 TRACE: ALWAYS log when interceptor runs for products keys (with reason if skipped).
              try {
                console.info('[HEYS.products] interceptor enter', {
                  keyTail: keyStr.slice(-30),
                  vKind: typeof v === 'string' ? (v.startsWith('¤Z¤') ? 'compressed' : v.startsWith('"') ? 'json-string' : 'raw') : typeof v,
                  vSize: typeof v === 'string' ? v.length : (Array.isArray(v) ? v.length + ' items' : '?'),
                  arrParsed: Array.isArray(arr) ? `array[${arr.length}]` : 'NOT-ARRAY',
                });
              } catch (_) { /* noop */ }
              if (Array.isArray(arr)) {
                const result = global.HEYS.OverlayStore.migrate(arr, sharedById);
                // 🔬 TRACE: migrate result
                try {
                  console.info('[HEYS.products] dual-write trace', {
                    keyTail: keyStr.slice(-30),
                    arrLen: arr.length,
                    migrateOk: result && result.ok,
                    migrateRows: result && result.rows ? result.rows.length : 0,
                    typeA: result?.typeA, typeAByFallback: result?.typeAByFallback, typeB: result?.typeB,
                  });
                } catch (_) { /* noop */ }
                if (result.ok) {
                  // Guards against cloud-stale data overwriting richer overlay state.
                  // Two checks: (a) iron-cliff (was: stale data with iron=1 vs local 200+),
                  // (b) length-shrink (cloud's smaller heys_products clobbering orphan-recovered
                  // 95 stamps that were just added). Both indicate the source has stale info.
                  const prevRows = global.HEYS.OverlayStore.readRaw();
                  const prevLen = Array.isArray(prevRows) ? prevRows.length : 0;
                  const newLen = result.rows.length;

                  const prevMerged = global.HEYS.OverlayStore.toMergedView(sharedById) || [];
                  const prevIronCount = Array.isArray(prevMerged) ? prevMerged.filter(p => p && Number(p.iron) > 0).length : 0;
                  let newIronCount = 0;
                  for (const r of result.rows) {
                    if (!r) continue;
                    if (r._custom) {
                      if (Number(r.iron) > 0) newIronCount++;
                    } else {
                      const base = sharedById.get(String(r.shared_origin_id));
                      const iron = (r.overrides && r.overrides.iron != null) ? Number(r.overrides.iron) : (base ? Number(base.iron) : 0);
                      if (iron > 0) newIronCount++;
                    }
                  }

                  // Stale-cloud guard: skip dual-write when incoming data looks dramatically
                  // worse than current overlay (iron-cliff OR length-cliff).
                  const ironCliff = prevIronCount > 10 && newIronCount < (prevIronCount / 2);
                  const lengthCliff = prevLen > 50 && newLen < prevLen * 0.7;

                  // ID-merge guard: local-only additions (Type B custom OR user_modified) must
                  // survive cloud-restore that doesn't yet have them. Detect by id-set diff:
                  // if current overlay has user-additions the incoming arr lacks, MERGE them back.
                  let rowsToWrite = result.rows;
                  let rescuedCount = 0;
                  try {
                    if (Array.isArray(prevRows) && prevRows.length > 0) {
                      const newIds = new Set(result.rows.map(r => String(r?.id || '')));
                      const localOnly = prevRows.filter(r => {
                        if (!r || r.id == null) return false;
                        if (newIds.has(String(r.id))) return false;
                        // Preserve only local-only additions: customs OR user-modified.
                        return r._custom === true || r.user_modified === true;
                      });
                      if (localOnly.length > 0) {
                        rowsToWrite = result.rows.concat(localOnly);
                        rescuedCount = localOnly.length;
                      }
                    }
                  } catch (_) { /* noop */ }

                  if (ironCliff || lengthCliff) {
                    console.warn('[HEYS.products] dual-write SKIP stale-cloud', {
                      reason: ironCliff ? (lengthCliff ? 'iron+length-cliff' : 'iron-cliff') : 'length-cliff',
                      prevLen, newLen, lenRatio: prevLen > 0 ? (newLen / prevLen).toFixed(3) : 'n/a',
                      prevIron: prevIronCount, newIron: newIronCount,
                      arrLen: arr.length,
                    });
                  } else {
                    if (rescuedCount > 0) {
                      console.info('[HEYS.products] dual-write rescued local-only rows', {
                        rescuedCount,
                        total: rowsToWrite.length,
                        sampleNames: prevRows.filter(r => r && (r._custom || r.user_modified)).slice(0, 3).map(r => r.name),
                      });
                    }
                    global.HEYS.OverlayStore.writeRaw(rowsToWrite);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('[HEYS.products] interceptor dual-write failed (non-fatal):', e && e.message);
        }

        if (isLogoutSuppressionActive()) {
          return;
        }

        // 🔒 Никогда не зеркалим ключи авторизации (и любые sb-* ключи)
        try {
          const keyStr = String(k || '');
          if (AUTH_STORAGE_KEYS_TO_SKIP.has(keyStr) || isSensitiveSessionStorageKey(keyStr)) {
            return;
          }
        } catch (_) { }

        if (isLocalOnlyStorageKey(k)) {
          return;
        }

        // Во время signIn не зеркалим вообще ничего — это источник гонок и RTR refresh 400
        if (typeof _signInInProgress !== 'undefined' && _signInInProgress) {
          return;
        }

        // 🚫 Не зеркалим backup-ключи (во избежание перезаписи базы при sync)
        if (String(k || '').includes('_backup')) {
          return;
        }

        if (muteMirror && isOurKey(k) && String(k).includes('dayv2_')) {
          pushSyncTrace('MUTE_MIRROR_SKIP', { key: k }, 'warn');
        }
        if (!muteMirror && isOurKey(k)) {
          // 🔒 Дедупликация: пропускаем повторные сохранения с тем же updatedAt
          const parsed = tryParse(v);
          const updatedAt = parsed?.updatedAt || 0;
          const now = Date.now();
          const lastSaved = _lastSavedKeys.get(k);

          if (lastSaved && updatedAt > 0 && lastSaved.updatedAt === updatedAt && (now - lastSaved.timestamp) < DEDUP_WINDOW_MS) {
            if (String(k).includes('dayv2_')) {
              pushSyncTrace('INTERCEPT_DEDUP_SKIP', { key: k, updatedAt, age: now - lastSaved.timestamp }, 'warn');
            }
            return;
          }

          // Запоминаем это сохранение
          if (updatedAt > 0) {
            _lastSavedKeys.set(k, { updatedAt, timestamp: now });
            // Очищаем старые записи (>10 сек)
            for (const [key, val] of _lastSavedKeys) {
              if (now - val.timestamp > 10000) _lastSavedKeys.delete(key);
            }
          }

          if (needsClientStorage(k)) {
            if (String(k).includes('dayv2_')) {
              const _mCnt = Array.isArray(parsed?.meals) ? parsed.meals.length : '?';
              const _iCnt = Array.isArray(parsed?.meals) ? parsed.meals.reduce((s, m) => s + (m.items?.length || 0), 0) : '?';
              pushSyncTrace('INTERCEPT_MIRROR_dayv2', { key: k, meals: _mCnt, items: _iCnt, updatedAt: parsed?.updatedAt });
            }
            cloud.saveClientKey(k, parsed);
            // ⚡ PERF: hot-sync от каждого local-write создавал шторм таймеров и message handlers.
            // Синхронизацию уже делает очередь cloud.saveClientKey + scheduleClientPush, поэтому
            // здесь не дёргаем requestForegroundAutoSync.
          } else {
            cloud.saveKey(k, parsed);
          }
        }
      };
    } catch (e) {
      err('intercept setItem failed', e);
    }
  }

  // Флаг для fallback на прямое подключение
  let _usingDirectConnection = false;
  cloud.isUsingDirectConnection = function () { return _usingDirectConnection; };

  // Защита от ping-pong переключений
  let _lastSwitchTime = 0;
  let _consecutiveErrors = 0;
  let _successCount = 0;
  const SWITCH_DEBOUNCE_MS = 30000; // Не переключаться чаще чем раз в 30 сек
  const MIN_ERRORS_FOR_SWITCH = 2; // Требуем 2+ ошибок подряд для переключения
  const MIN_SUCCESS_FOR_SAVE = 3; // 3+ успешных запросов для сохранения режима

  cloud.init = function ({ url, anonKey, localhostProxyUrl }) {
    // Idempotent init: avoid double creation & duplicate intercept logs
    if (cloud._inited) { return; }

    // ✅ 2025-12-25: Supabase SDK УДАЛЁН — используем YandexAPI
    // Теперь НЕ проверяем global.supabase, модуль работает через heys_yandex_api_v1.js
    if (!global.supabase || !global.supabase.createClient) {
      // НЕ прерываем инициализацию! Работаем через YandexAPI.
      log('Supabase SDK отсутствует — используем YandexAPI mode');
    }

    // Legacy: URL для fallback (не используется при активном YandexAPI)
    cloud._proxyUrl = localhostProxyUrl || url;
    cloud._directUrl = null; // Supabase отключён — используем Yandex Cloud
    cloud._anonKey = anonKey;

    // Определяем среду
    const isLocalhost = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1'));

    // 🌐 Статус сети при старте + слушатели online/offline
    if (typeof navigator !== 'undefined') {
      logCritical(`🌐 [NET] Старт: ${navigator.onLine ? 'online' : 'offline'}`);
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          logCritical('🌐 [NET] online');
        });
        window.addEventListener('offline', () => {
          logCritical('🌐 [NET] offline');
        });
      }
    }

    // 🔄 Smart выбор режима при старте
    let initialUrl = url;
    let needsHealthCheck = false;

    // На localhost: всегда используем переданный URL (direct), игнорируем сохранённый режим
    // На production: восстанавливаем сохранённый режим
    if (isLocalhost) {
      log('[ROUTING] Localhost — используем direct, игнорируем сохранённый режим');
      _usingDirectConnection = (url === cloud._directUrl);
      needsHealthCheck = true; // Проверим доступность direct, если нет — переключим на proxy
    } else {
      try {
        const savedMode = localStorage.getItem('heys_connection_mode');
        if (savedMode === 'direct' && cloud._directUrl) {
          log('[ROUTING] Восстанавливаем сохранённый режим: direct');
          initialUrl = cloud._directUrl;
          _usingDirectConnection = true;
          needsHealthCheck = true; // Проверим доступность direct после инициализации
        } else if (savedMode === 'proxy') {
          log('[ROUTING] Используем сохранённый режим: proxy');
        } else {
          log('[ROUTING] Нет сохранённого режима, используем proxy (default для РФ)');
        }
      } catch (e) {
        console.warn('[ROUTING] Ошибка чтения режима из localStorage:', e.message);
      }
    }

    // Health-ping функция — вызывается после создания client
    // ⚠️ На production: только сохраняет режим для следующей загрузки (не пересоздаёт client)
    // ⚠️ На localhost: пересоздаёт client сразу (dev режим, удобство важнее)
    const runHealthCheck = async () => {
      if (!needsHealthCheck || !client) return;
      try {
        log('[ROUTING] 🏥 Health-check подключения...');

        // 🆕 Используем /health эндпоинт Yandex Cloud Functions
        // вместо Supabase-формата /rest/v1/... который не поддерживается API Gateway
        const healthUrl = `${initialUrl.replace(/\/$/, '')}/health`;

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health-check timeout')), 3000),
        );

        const fetchPromise = fetch(healthUrl, {
          method: 'GET',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        });

        const res = await Promise.race([fetchPromise, timeoutPromise]);
        if (!res || !res.ok) {
          const msg = res ? `${res.status} ${res.statusText}` : 'no response';
          log('[ROUTING] ⚠️ Текущий режим недоступен:', msg);
          await handleHealthCheckFailure();
          return;
        }

        log('[ROUTING] ✅ Подключение работает');
        registerSuccess();
      } catch (e) {
        log('[ROUTING] ⚠️ Health-check timeout/error:', e.message);
        await handleHealthCheckFailure();
      }
    };

    // Обработка провала health-check
    const handleHealthCheckFailure = async () => {
      const fallbackMode = _usingDirectConnection ? 'proxy' : 'direct';

      // Сохраняем режим для следующей загрузки — НЕ пересоздаём клиент!
      // Пересоздание клиента вызывает "Multiple GoTrueClient instances" предупреждение
      // и может привести к race conditions с токенами
      try {
        localStorage.setItem('heys_connection_mode', fallbackMode);
        log('[ROUTING] 💾 Сохранён режим', fallbackMode, 'для следующей загрузки');
      } catch (_) { }

      // На localhost показываем сообщение о необходимости перезагрузки
      if (isLocalhost && !cloud._healthCheckFallbackDone) {
        cloud._healthCheckFallbackDone = true;
        log('[ROUTING] ⚠️ Localhost: требуется перезагрузка для переключения на', fallbackMode);
      }
    };

    try {
      // ⚠️ RTR-safe: НЕ мигрируем сессии из старого sb-* ключа.
      // При Refresh Token Rotation старые refresh_token могут быть уже использованы,
      // и любая попытка их «восстановить» приводит к 400 refresh_token_already_used.
      const OLD_AUTH_KEY = 'sb-ukqolcziqcuplqfgrmsh-auth-token';
      const NEW_AUTH_KEY = 'heys_supabase_auth_token';

      // 🔄 RTR-safe v3: Очищаем ИСТЁКШИЕ токены ДО создания клиента
      // Иначе SDK при инициализации попытается сделать refresh и получит 400
      try {
        // Удаляем старый ключ (sb-*)
        const hadOld = !!localStorage.getItem(OLD_AUTH_KEY);
        if (hadOld) {
          log('[AUTH] 🧹 Удаляем старый auth токен (sb-*)');
          localStorage.removeItem(OLD_AUTH_KEY);
        }

        // ⚠️ Проверка expires_at ОТКЛЮЧЕНА — токены отключены в Supabase
        // Раньше тут был код удаления истёкших токенов, но т.к. refresh tokens
        // отключены в проекте, expires_at не обновляется и токен "истекает"
        // хотя сессия на самом деле валидна. Просто проверяем что JSON валидный.
        const stored = localStorage.getItem(NEW_AUTH_KEY);
        if (stored) {
          try {
            JSON.parse(stored); // Проверка что JSON валидный
          } catch (_) {
            // Невалидный JSON — удаляем
            localStorage.removeItem(NEW_AUTH_KEY);
          }
        }
      } catch (_) { }

      // ✅ 2025-12-25: Supabase SDK УДАЛЁН — НЕ создаём клиент
      // Все операции идут через YandexAPI (heys_yandex_api_v1.js)
      if (global.supabase && global.supabase.createClient) {
        // Если SDK вдруг появился — создаём клиент (legacy fallback)
        client = global.supabase.createClient(initialUrl, anonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          }
        });
        cloud.client = client;
      } else {
        // 🆕 YandexAPI mode — клиент не нужен
        client = null;
        cloud.client = null;
        log('☁️ YandexAPI mode — Supabase client не создан');
      }

      status = 'offline';
      interceptSetItem();
      cloud._inited = true;
      log('cloud bridge loaded', _usingDirectConnection ? '(direct)' : '(proxy)');

      // 🔐 Восстановление PIN auth при перезагрузке страницы
      // ⚠️ ВАЖНО: Восстанавливаем PIN auth только если НЕТ сохранённой сессии куратора!
      // Иначе при следующей загрузке куратор потеряет список клиентов.
      try {
        const pinAuthClient = global.localStorage.getItem('heys_pin_auth_client');
        const curatorSession = global.localStorage.getItem('heys_supabase_auth_token');

        // Проверяем есть ли валидная сессия куратора
        let hasCuratorSession = false;
        if (curatorSession) {
          try {
            const parsed = JSON.parse(curatorSession);
            hasCuratorSession = !!(parsed?.user && parsed?.access_token);
          } catch (_) { }
        }

        if (pinAuthClient && !hasCuratorSession) {
          // Нет сессии куратора — восстанавливаем PIN auth режим
          _pinAuthClientId = pinAuthClient;
          _rpcOnlyMode = true;
          logCritical('🔐 PIN auth восстановлен для клиента:', pinAuthClient.substring(0, 8) + '...');

          // 🔄 v53 FIX: Используем cloud.syncClient() вместо прямого syncClientViaRPC
          // Это позволяет deduplication работать если App useEffect тоже вызовет syncClient
          // v62: _authSyncPending = true SYNCHRONOUSLY before async call so that
          // controllerchange (PWA reload) can detect this race window and defer reload.
          _authSyncPending = true;
          cloud.syncClient(pinAuthClient).then(result => {
            _authSyncPending = false;
            if (result?.success) {
              const raw = result.loaded ?? result.keys ?? result.saved;
              const keyCount = (typeof raw === 'number' && Number.isFinite(raw))
                ? raw
                : (typeof raw === 'string' && /^\d+$/.test(raw) ? parseInt(raw, 10) : 0);
              logCritical('✅ [YANDEX RESTORE] Sync завершён:', keyCount, 'ключей');
            } else {
              logCritical('⚠️ [YANDEX RESTORE] Sync failed:', result?.error || 'no result');
            }
          }).catch(e => {
            _authSyncPending = false;
            logCritical('❌ [YANDEX RESTORE] Error:', e.message);
          });
        } else if (pinAuthClient && hasCuratorSession) {
          // Есть сессия куратора — НЕ включаем PIN auth режим, удаляем флаг
          logCritical('🔐 PIN auth пропущен — есть сессия куратора');
          global.localStorage.removeItem('heys_pin_auth_client');
        }
      } catch (_) { }

      // 🏥 Health-check если стартуем в direct режиме (проверяем VPN доступен ли)
      // Запускаем асинхронно но НЕ блокируем — fetchWithRetry сам переключится при ошибках
      if (needsHealthCheck) {
        // Фоновая проверка — если direct недоступен, переключимся
        runHealthCheck().catch(() => { });
      }

      // 🔄 Автовосстановление сессии при старте (RTR-safe)
      // 🔄 Восстановление сессии при старте
      // Проверяем expires_at — если access_token истёк, refresh_token скорее всего тоже
      // (RTR = Refresh Token Rotation, одноразовые токены)
      const restoreSessionFromStorage = () => {
        try {
          const stored = localStorage.getItem('heys_supabase_auth_token');
          if (!stored) return { user: null };
          const parsed = JSON.parse(stored);
          const accessToken = parsed?.access_token;
          const refreshToken = parsed?.refresh_token;
          const storedUser = parsed?.user;
          const expiresAt = parsed?.expires_at;

          // Мини-валидация
          if (!accessToken || !storedUser) return { user: null };

          // 🕐 Проверка expires_at: если access_token истёк более 1 часа назад,
          // то refresh_token скорее всего уже "Already Used" (RTR)
          // Supabase access_token по умолчанию живёт 1 час
          const now = Math.floor(Date.now() / 1000);
          const bufferSeconds = 60 * 60; // 1 час запас после expiry
          const isExpired = expiresAt && (now > expiresAt + bufferSeconds);

          if (isExpired) {
            const hoursAgo = Math.round((now - expiresAt) / 3600);
            logCritical(`⏰ Токен истёк ${hoursAgo}ч назад, требуется перелогин`);
            // Удаляем просроченный токен и PIN auth флаг
            // Иначе система включит PIN auth режим вместо показа экрана входа
            try {
              localStorage.removeItem('heys_supabase_auth_token');
              localStorage.removeItem('heys_pin_auth_client');
            } catch (_) { }
            return { user: null };
          }

          return { user: storedUser, accessToken, refreshToken, expiresAt };
        } catch (_) {
          return { user: null };
        }
      };

      // ✅ FIX 2025-12-25: Supabase SDK УДАЛЁН — вся эта логика больше не работает.
      // Авторизация теперь через YandexAPI (heys_yandex_api_v1.js).
      // Оставляем только базовое восстановление user/status из localStorage.
      if (!_signInInProgress) {
        const restored = restoreSessionFromStorage();

        if (restored.user) {
          // Токен есть — устанавливаем user/status
          user = restored.user;
          status = CONNECTION_STATUS.SYNC;
          logCritical('🔄 Сессия восстановлена:', user.email || user.id);
          logCritical('[AUTH] ✅ user установлен из restore:', user?.email, '| user:', !!user);

          // 🔐 v=35 FIX: После миграции на Yandex API — ВКЛЮЧАЕМ RPC режим!
          // Supabase SDK удалён, все операции через REST API
          // PIN auth client сбрасываем только _pinAuthClientId (это для клиента по PIN)
          // но _rpcOnlyMode оставляем = true для куратора!
          if (_pinAuthClientId) {
            logCritical('🔐 Куратор восстановлен — сбрасываем PIN auth clientId, но RPC mode остаётся ON');
            _pinAuthClientId = null;
            try { global.localStorage.removeItem('heys_pin_auth_client'); } catch (_) { }
          }
          // 🔄 RPC режим ВКЛЮЧЁН для куратора (Yandex API)
          _rpcOnlyMode = true;
          // 🔇 v4.7.1: Лог отключён

          // Устанавливаем status = ONLINE и делаем sync если есть clientId
          // ⚠️ НЕ используем Supabase SDK (client.auth.setSession) — он удалён!
          setTimeout(() => {
            if (_signInInProgress) return;
            status = CONNECTION_STATUS.ONLINE;

            const clientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
            logCritical('[restoreSession] setTimeout fired, clientId:', clientId ? clientId.slice(0, 8) + '...' : 'NULL');
            if (clientId) {
              logCritical('🔄 Запускаем bootstrap sync для клиента:', clientId.substring(0, 8) + '...');
              cloud.syncClient(clientId).then(result => {
                const errorText = result?.error || (result?.success === false ? 'unknown_error' : null);
                if (errorText) {
                  logCritical('⚠️ Bootstrap sync failed:', errorText);
                } else {
                  logCritical('✅ Bootstrap sync завершён');
                }
              }).catch(e => {
                logCritical('⚠️ Bootstrap sync error:', e?.message || e);
              });
            }
          }, 100);
        }
      }

      // ⚠️ Legacy Supabase onAuthStateChange — ПОЛНОСТЬЮ ОТКЛЮЧЁН
      // client = null (Supabase SDK удалён), авторизация через YandexAPI.
      // Код обработки auth events удалён 2025-12-25.

      // 🔄 AUTO-SYNC при возвращении на вкладку (visibilitychange)
      // Синхронизирует данные с сервера когда пользователь возвращается в приложение
      // Это критично для multi-device сценариев (телефон ↔ ноутбук)
      let lastSyncOnFocusTime = 0;
      const SYNC_ON_FOCUS_DEBOUNCE = 60000; // Раз в 60с — критичные ключи уже тянутся через hot-sync каждые 2с

      const syncOnFocus = async () => {
        // Debounce: не синхронизировать слишком часто
        if (Date.now() - lastSyncOnFocusTime < SYNC_ON_FOCUS_DEBOUNCE) return;
        lastSyncOnFocusTime = Date.now();

        // Только если авторизованы
        if (!user || status !== CONNECTION_STATUS.ONLINE) return;

        const clientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
        if (!clientId) return;

        log('[SYNC-ON-FOCUS] 🔄 Вкладка активна — синхронизация...');

        try {
          await cloud.bootstrapClientSync(clientId, { silent: true });
          log('[SYNC-ON-FOCUS] ✅ Синхронизация завершена');
        } catch (e) {
          log('[SYNC-ON-FOCUS] ⚠️ Ошибка синхронизации:', e?.message || e);
        }
      };

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            syncOnFocus();
          }
        });

        // Также синхронизируем при focus окна (для десктопа)
        window.addEventListener('focus', syncOnFocus);

        // 🚀 v10.1: Горячий подхват сессии после логина без reload
        // LoginGate в index.html диспатчит это событие вместо location.reload()
        window.addEventListener('heys-auth-ready', function onAuthReady(e) {
          try {
            var detail = e && e.detail || {};
            logCritical('[AUTH] 🔑 heys-auth-ready received:', detail.mode);

            // Повторяем restoreSessionFromStorage чтобы подхватить новые данные
            var restored = restoreSessionFromStorage();
            if (restored.user) {
              user = restored.user;
              status = CONNECTION_STATUS.ONLINE;
              _rpcOnlyMode = true;
              logCritical('[AUTH] ✅ Hot session restore:', user.email || user.id);

              // Уведомляем React через глобальное событие
              try {
                window.dispatchEvent(new CustomEvent('heys-session-restored', {
                  detail: { user: user, mode: detail.mode }
                }));
              } catch (_) { }
            } else {
              // Данные не найдены — fallback reload
              logCritical('[AUTH] ⚠️ No session data found after login, reloading');
              window.location.reload();
            }
          } catch (err) {
            logCritical('[AUTH] ❌ heys-auth-ready handler error:', err);
            window.location.reload();
          }
        }, { once: true });
      }

    } catch (e) { err('init failed', e); }
  };

  cloud.signIn = async function (email, password) {
    // 🆕 v2.0: Используем собственный Yandex Cloud Auth (не Supabase SDK)
    // Это решает проблемы с CORS и соответствует 152-ФЗ

    // Проверяем YandexAPI
    if (!HEYS.YandexAPI) {
      err('YandexAPI not initialized');
      return { error: { message: 'API сервис недоступен. Попробуйте позже.' } };
    }

    // Проверяем сеть перед попыткой входа
    if (!navigator.onLine) {
      status = 'offline';
      return { error: { message: 'Нет подключения к интернету' } };
    }

    // 🔄 Предотвращаем повторный вызов во время входа
    if (_signInInProgress) {
      log('[AUTH] ⏳ signIn уже выполняется, ждём...');
      // Ждём завершения текущего входа (max 10 сек)
      for (let i = 0; i < 100 && _signInInProgress; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (user) return { user }; // Вход уже выполнен
    }

    _signInInProgress = true;

    try {
      status = 'signin';

      // 🧹 Перед входом удаляем любые старые токены из storage.
      try {
        localStorage.removeItem('heys_supabase_auth_token');
        localStorage.removeItem('sb-ukqolcziqcuplqfgrmsh-auth-token');
      } catch (_) { }

      // 🆕 Используем наш Yandex Cloud Auth endpoint
      const { data, error } = await HEYS.YandexAPI.curatorLogin(email, password);

      if (error) {
        status = 'offline';
        _signInInProgress = false;
        logCritical('❌ Ошибка входа:', error.message || error);
        return { error };
      }

      if (!data?.user) {
        status = 'offline';
        _signInInProgress = false;
        err('no user after signin');
        return { error: { message: 'no user' } };
      }

      user = data.user;
      logCritical('[AUTH] ✅ user установлен:', user?.email);

      // До bootstrapSync и любых schedulePush: kv_store снят с REST whitelist — без RPC-режима
      // doUserUpload уйдёт в legacy upsert и получит 404.
      _rpcOnlyMode = true;

      // 🔄 Сохраняем токен в localStorage (в формате совместимом со старым кодом)
      try {
        const tokenData = {
          access_token: data.access_token,
          refresh_token: null, // Наш JWT не имеет refresh token
          expires_at: data.expires_at,
          user: data.user
        };
        const tokenJson = JSON.stringify(tokenData);
        const setFn = originalSetItem || global.localStorage.setItem.bind(global.localStorage);
        setFn('heys_supabase_auth_token', tokenJson);
        logCritical('[AUTH] ✅ Сессия сохранена (Yandex Auth), expires_at:', new Date(data.expires_at * 1000).toISOString());

        // 🆕 v2.1: Сохраняем curator session для TrialQueue админки
        // heys_trial_queue_v1.js проверяет этот ключ для admin API calls
        setFn('heys_curator_session', data.access_token);
        logCritical('[AUTH] ✅ Curator session сохранена для adminAPI');

        // Верификация
        const check = global.localStorage.getItem('heys_supabase_auth_token');
        if (!check) {
          logCritical('[AUTH] ❌ ВЕРИФИКАЦИЯ ПРОВАЛЕНА: токен не читается обратно!');
        } else {
          logCritical('[AUTH] ✅ Верификация OK, токен сохранён');
        }
      } catch (saveErr) {
        logCritical('[AUTH] ❌ Ошибка сохранения сессии:', saveErr?.message || saveErr);
      }

      status = 'sync';
      await cloud.bootstrapSync();
      status = 'online';

      // _rpcOnlyMode уже true до bootstrapSync (см. выше)

      // 🛡️ Защитный период: игнорируем SIGNED_OUT в течение 10 секунд после signIn
      _ignoreSignedOutUntil = Date.now() + 10000;

      _signInInProgress = false;
      logCritical('✅ Вход выполнен:', user.email);
      return { user };
    } catch (e) {
      status = 'offline';
      _signInInProgress = false;
      logCritical('❌ Ошибка входа (exception):', e.message || e);
      return { error: e };
    }
  };

  cloud.signOut = function () {
    armLogoutSuppression();
    try {
      global.HEYS = global.HEYS || {};
      global.HEYS._isLoggingOut = true;
    } catch (_) { }

    // scope: 'local' — очищаем только локальную сессию, НЕ инвалидируем refresh token на сервере.
    // Это предотвращает 400 Bad Request если пользователь сразу залогинится обратно,
    // т.к. SDK в памяти мог закэшировать старый refresh token.
    if (client) client.auth.signOut({ scope: 'local' });
    dropAllPendingSyncState('sign-out');
    user = null;
    status = 'offline';
    _rpcOnlyMode = false;
    _pinAuthClientId = null;
    _ignoreSignedOutUntil = 0;
    _activeSyncClientId = null;
    _syncInFlight = null;
    _syncInProgress = null;
    if (global.HEYS) {
      global.HEYS.currentClientId = null;
      if (global.HEYS.store?.flushMemory) {
        global.HEYS.store.flushMemory();
      }
    }
    clearNamespace();
    // 🔄 Очистка auth токена — предотвращает 400 Bad Request при следующем запуске
    try {
      localStorage.removeItem('heys_supabase_auth_token');
      // 🆕 v2.1: Очистка curator session для TrialQueue админки
      localStorage.removeItem('heys_curator_session');
      localStorage.removeItem('heys_pin_auth_client');
      localStorage.removeItem('heys_session_token');
    } catch (e) { }
    // 🔄 Сброс флагов sync — при следующем входе нужна новая синхронизация
    initialSyncCompleted = false;
    startFailsafeTimer(); // Перезапустить failsafe для нового входа
    // 🔄 Сброс сохранённого режима — при следующем входе определится заново
    try {
      localStorage.removeItem('heys_connection_mode');
    } catch (e) { }
    try {
      window.dispatchEvent(new Event('heys:auth-changed'));
    } catch (_) { }
    setTimeout(() => {
      try {
        if (global.HEYS && Date.now() >= _logoutSuppressionUntil) {
          global.HEYS._isLoggingOut = false;
          global.HEYS._logoutSuppressionUntil = 0;
        }
      } catch (_) { }
    }, 5100);
    logCritical('🚪 Выход из системы');
  };

  cloud.getUser = function () { return user; };
  cloud.getStatus = function () { return status; };

  /**
   * Принудительный push продуктов из localStorage в облако
   * Вызывать из консоли: HEYS.cloud.forcePushProducts()
   */
  cloud.forcePushProducts = async function () {
    const clientId = HEYS.utils?.getCurrentClientId?.() || HEYS.currentClientId;
    if (!clientId) {
      console.error('❌ Нет clientId');
      return { error: 'No clientId' };
    }
    if (!user || !user.id) {
      console.error('❌ Не авторизован');
      return { error: 'Not authenticated' };
    }

    const key = `heys_${clientId}_products`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      console.error(`❌ Нет продуктов в localStorage по ключу ${key}`);
      return { error: 'No products in localStorage' };
    }

    let products;
    try {
      products = JSON.parse(raw);
    } catch (e) {
      return { error: 'Parse error' };
    }

    if (!Array.isArray(products) || products.length === 0) {
      return { error: 'Empty products array' };
    }

    // Фильтруем валидные продукты
    const valid = products.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0);
    if (valid.length === 0) {
      return { error: 'Empty products array' };
    }

    // 🔇 v4.7.1: Debug логи отключены

    // Сохраняем через YandexAPI
    const { error } = await YandexAPI.from('client_kv_store')
      .upsert({
        user_id: user.id,
        client_id: clientId,
        k: 'heys_products',
        v: valid,
        updated_at: new Date().toISOString()
      }, { onConflict: 'client_id,k' });

    if (error) {
      console.error('❌ Ошибка сохранения:', error);
      return { error: error.message };
    }

    // 🔇 v4.7.1: Лог отключён
    return { success: true, count: valid.length, clientId };
  };

  /**
   * Принудительный push данных дня из localStorage в облако
   * Вызывать из консоли: HEYS.cloud.forcePushDay('2025-12-12') или без аргументов для сегодня
   */
  cloud.forcePushDay = async function (dateStr) {
    const clientId = HEYS.utils?.getCurrentClientId?.() || HEYS.currentClientId;
    if (!clientId) {
      console.error('❌ Нет clientId');
      return { error: 'No clientId' };
    }
    if (!user || !user.id) {
      console.error('❌ Не авторизован');
      return { error: 'Not authenticated' };
    }

    // Если дата не передана — используем сегодня
    const date = dateStr || new Date().toISOString().split('T')[0];
    const key = `heys_${clientId}_dayv2_${date}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      console.error(`❌ Нет данных дня в localStorage по ключу ${key}`);
      return { error: 'No day data in localStorage' };
    }

    let dayData;
    try {
      dayData = JSON.parse(raw);
    } catch (e) {
      return { error: 'Parse error' };
    }

    // 🔇 v4.7.1: Debug логи отключены

    // Сохраняем через YandexAPI
    const { error } = await YandexAPI.from('client_kv_store')
      .upsert({
        user_id: user.id,
        client_id: clientId,
        k: `heys_dayv2_${date}`,
        v: dayData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'client_id,k' });

    if (error) {
      console.error('❌ Ошибка сохранения:', error);
      return { error: error.message };
    }

    // 🔇 v4.7.1: Лог отключён
    return { success: true, date, mealsCount: dayData.meals?.length || 0, clientId };
  };

  /**
   * Принудительный push ВСЕХ данных дней за последние N дней
   * Вызывать из консоли: HEYS.cloud.forcePushAllDays(7) — за неделю
   */
  cloud.forcePushAllDays = async function (daysBack = 7) {
    const clientId = HEYS.utils?.getCurrentClientId?.() || HEYS.currentClientId;
    if (!clientId || !user || !user.id) {
      return { error: 'Not authenticated or no clientId' };
    }

    const results = [];
    for (let i = 0; i < daysBack; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const result = await cloud.forcePushDay(dateStr);
      if (result.success) results.push(dateStr);
    }

    // 🔇 v4.7.1: Лог отключён
    return { success: true, days: results };
  };

  /**
   * Полная очистка auth-данных для решения проблем с токенами
   * Вызывать из консоли: HEYS.cloud.resetAuth()
   */
  cloud.resetAuth = function () {
    try {
      // Очищаем все auth-related ключи
      const keysToRemove = [
        'heys_supabase_auth_token',
        'sb-ukqolcziqcuplqfgrmsh-auth-token',
        'heys_connection_mode',
        'heys_remember_me',
        'heys_saved_email',
        'heys_remember_email'
      ];
      keysToRemove.forEach(key => {
        try { localStorage.removeItem(key); } catch (e) { }
      });

      // Выходим из Supabase
      if (client && client.auth) {
        client.auth.signOut().catch(() => { });
      }

      user = null;
      status = CONNECTION_STATUS.OFFLINE;

      logCritical('🔄 Auth данные очищены. Перезагрузите страницу.');
      return { success: true, message: 'Auth reset. Please reload the page.' };
    } catch (e) {
      console.error('[resetAuth] Error:', e);
      return { error: e.message };
    }
  };

  /**
   * Очищает невалидные продукты из localStorage (без name)
   * Вызывать для восстановления после бага с undefined продуктами
   */
  cloud.cleanupProducts = function () {
    try {
      const clientId = HEYS.utils?.getCurrentClientId?.() || '';
      // Ключ продуктов в localStorage всегда heys_{clientId}_products
      const key = clientId ? `heys_${clientId}_products` : 'heys_products';
      const raw = localStorage.getItem(key);

      // Если ключ не найден — попробуем без clientId (legacy)
      if (!raw && clientId) {
        const legacyRaw = localStorage.getItem('heys_products');
        if (legacyRaw) {
          // Миграция: скопировать в ключ с clientId
          try {
            const parsed = JSON.parse(legacyRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              localStorage.setItem(key, legacyRaw);
              // 🔇 v4.7.1: Лог миграции отключён
            }
          } catch (_) { }
        }
      }

      const finalRaw = localStorage.getItem(key);
      if (!finalRaw) return { cleaned: 0, total: 0 };

      // Защита от повреждённых данных (не-JSON)
      let products;
      try {
        products = tryParse(finalRaw);
      } catch (parseError) {
        products = null;
      }

      if (!Array.isArray(products)) {
        // Данные временно некорректны (возможно race condition при записи)
        // НЕ удаляем — пусть следующий sync перезапишет
        console.warn(`⚠️ [CLEANUP] Temporary parse error for ${key}, skipping (will retry)`);
        return { cleaned: 0, total: 0, parseError: true };
      }

      if (!Array.isArray(products)) return { cleaned: 0, total: 0 };

      const before = products.length;
      const cleaned = products.filter(p =>
        p && typeof p.name === 'string' && p.name.trim().length > 0
      );
      const after = cleaned.length;

      if (after < before) {
        localStorage.setItem(key, JSON.stringify(cleaned));
        logCritical(`🧹 [CLEANUP] Removed ${before - after} invalid products (${before} → ${after})`);
      }

      return { cleaned: before - after, total: after };
    } catch (e) {
      console.error('[CLEANUP] Error:', e);
      return { error: e.message };
    }
  };

  /**
   * Удаляет orphan продукты из приёмов пищи
   * @param {string[]} orphanNames - список названий продуктов для удаления
   * @returns {Object} статистика { daysAffected, itemsRemoved }
   */
  cloud.cleanupOrphanMealItems = function (orphanNames) {
    if (!Array.isArray(orphanNames) || orphanNames.length === 0) {
      console.warn('[CLEANUP ORPHANS] No orphan names provided');
      return { daysAffected: 0, itemsRemoved: 0 };
    }

    const clientId = HEYS.utils?.getCurrentClientId?.() || '';
    const prefix = clientId ? `heys_${clientId}_dayv2_` : 'heys_dayv2_';
    const orphanSet = new Set(orphanNames.map(n => n.toLowerCase().trim()));

    let daysAffected = 0;
    let itemsRemoved = 0;

    // Проходим по всем ключам localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.includes('dayv2_')) continue;

      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        const dayData = JSON.parse(raw);
        if (!dayData || !Array.isArray(dayData.meals)) continue;

        let dayModified = false;

        // Фильтруем items в каждом meal
        dayData.meals = dayData.meals.map(meal => {
          if (!meal || !Array.isArray(meal.items)) return meal;

          const beforeCount = meal.items.length;
          meal.items = meal.items.filter(item => {
            const itemName = (item.name || '').toLowerCase().trim();
            const isOrphan = orphanSet.has(itemName);
            if (isOrphan) itemsRemoved++;
            return !isOrphan;
          });

          if (meal.items.length !== beforeCount) {
            dayModified = true;
          }

          return meal;
        });

        // Удаляем пустые meals
        dayData.meals = dayData.meals.filter(meal =>
          meal && Array.isArray(meal.items) && meal.items.length > 0
        );

        if (dayModified) {
          daysAffected++;
          dayData.updatedAt = Date.now();
          localStorage.setItem(key, JSON.stringify(dayData));

          // Синхронизируем изменения в облако
          const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
          if (dateMatch && clientId) {
            const dayKey = `heys_dayv2_${dateMatch[1]}`;
            cloud.saveClientKey(clientId, dayKey, dayData);
          }
        }
      } catch (e) {
        console.warn('[CLEANUP ORPHANS] Error processing', key, e);
      }
    }

    if (itemsRemoved > 0) {
      logCritical(`🧹 [CLEANUP ORPHANS] Removed ${itemsRemoved} orphan items from ${daysAffected} days: ${orphanNames.join(', ')}`);
    } else {
      log(`🧹 [CLEANUP ORPHANS] No orphan items found for: ${orphanNames.join(', ')}`);
    }

    return { daysAffected, itemsRemoved };
  };

  /**
   * Очищает невалидные продукты в ОБЛАКЕ (client_kv_store).
   * kv_store больше не в whitelist heys-api-rest (только RPC) — REST-очистку legacy kv_store не вызываем, иначе 404.
   */
  cloud.cleanupCloudProducts = async function () {
    try {
      if (!user) return { error: 'Not authenticated' };

      // Сохраняем user.id локально — user может стать null во время async операций
      const userId = user.id;
      if (!userId) return { error: 'No userId' };

      const clientId = HEYS.utils?.getCurrentClientId?.() || '';
      if (!clientId) return { error: 'No clientId' };

      let totalCleaned = 0;
      let totalAfter = 0;
      let totalDeleted = 0;
      let totalRecords = 0;

      // ===== 1. ОЧИСТКА client_kv_store (данные клиента) =====
      const { data: clientData, error: clientError } = await YandexAPI.from('client_kv_store')
        .select('k,v')
        .eq('client_id', clientId)
        .like('k', '%products%');

      if (clientError) {
        logCritical('☁️ [CLOUD CLEANUP] client_kv_store error:', clientError.message);
      } else if (clientData && clientData.length > 0) {
        totalRecords += clientData.length;
        for (const row of clientData) {
          // Проверяем что user ещё авторизован (мог logout во время цикла)
          if (!user) {
            log('☁️ [CLOUD CLEANUP] Aborted — user logged out');
            return { error: 'User logged out during cleanup' };
          }
          const result = await cleanupProductRecord('client_kv_store', row, { client_id: clientId }, clientId);
          totalCleaned += result.cleaned;
          totalAfter += result.kept;
          if (result.deleted) totalDeleted++;
        }
      }

      // Логируем только если были изменения или много записей
      if (totalDeleted > 0 || totalCleaned > 0) {
        logCritical(`☁️ [CLOUD CLEANUP] Done: ${totalRecords} records, deleted ${totalDeleted} empty, cleaned ${totalCleaned} invalid, kept ${totalAfter} valid`);
      } else if (totalRecords > 0) {
        log(`☁️ [CLOUD CLEANUP] OK: ${totalRecords} records, ${totalAfter} products`);
      }

      return { cleaned: totalCleaned, deleted: totalDeleted, total: totalAfter };
    } catch (e) {
      console.error('[CLOUD CLEANUP] Error:', e);
      return { error: e.message };
    }
  };

  /**
   * Хелпер: очистка одной записи продуктов
   * - Удаляет записи с 0 продуктами (мусор)
   * - Удаляет невалидные продукты из записей
   * - Тихий режим для OK записей
   */
  async function cleanupProductRecord(table, row, filters, clientId) {
    // Защита от race condition при logout (YandexAPI mode — no Supabase client)
    if (!user) {
      return { cleaned: 0, kept: 0, error: 'Not authenticated' };
    }

    // 🔧 FIX 2025-12-26: Декомпрессируем row.v если это сжатая строка
    let products = row.v;
    const Store = global.HEYS?.store;
    if (typeof products === 'string' && products.startsWith('¤Z¤')) {
      try {
        if (Store && typeof Store.decompress === 'function') {
          products = Store.decompress(products);
        }
      } catch (e) {
        logCritical(`⚠️ [DECOMPRESS] Failed in cleanupProductRecord: ${e.message}`);
      }
    }

    // Пустой массив или не массив — удаляем запись
    if (!Array.isArray(products) || products.length === 0) {
      // Строим filters объект для YandexAPI.rest()
      const deleteFilters = {};
      for (const [key, val] of Object.entries(filters)) {
        deleteFilters[`eq.${key}`] = val;
      }
      deleteFilters['eq.k'] = row.k;

      const { error: deleteError } = await YandexAPI.rest(table, { method: 'DELETE', filters: deleteFilters });

      if (!deleteError) {
        logCritical(`☁️ [CLOUD CLEANUP] DELETED empty ${table}.${row.k}`);
      }
      return { cleaned: 0, kept: 0, deleted: true };
    }

    const before = products.length;
    const cleaned = products.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0);
    const after = cleaned.length;

    // Все продукты валидные — тихий OK (не логируем каждую запись)
    if (after === before) {
      return { cleaned: 0, kept: after };
    }

    // 🚨 Если ВСЕ продукты невалидные — удаляем запись полностью!
    if (after === 0) {
      // Строим filters объект для YandexAPI.rest()
      const deleteFilters = {};
      for (const [key, val] of Object.entries(filters)) {
        deleteFilters[`eq.${key}`] = val;
      }
      deleteFilters['eq.k'] = row.k;

      const { error: deleteError } = await YandexAPI.rest(table, { method: 'DELETE', filters: deleteFilters });

      if (deleteError) {
        logCritical(`☁️ [CLOUD CLEANUP] Failed to delete ${table}.${row.k}:`, deleteError.message);
        return { cleaned: 0, kept: 0 };
      } else {
        logCritical(`☁️ [CLOUD CLEANUP] DELETED garbage ${table}.${row.k} (had ${before} invalid)`);
        return { cleaned: before, kept: 0, deleted: true };
      }
    }

    // Сохраняем очищенные обратно
    const upsertData = {
      ...filters,
      k: table === 'client_kv_store' && clientId ? normalizeKeyForSupabase(row.k, clientId) : row.k,
      v: cleaned,
      updated_at: new Date().toISOString()
    };
    // client_kv_store требует client_id
    if (table === 'client_kv_store' && !upsertData.client_id) {
      upsertData.client_id = clientId;
    }

    const onConflict = table === 'kv_store' ? 'user_id,k' : 'client_id,k';
    const { error: upsertError } = await YandexAPI.from(table).upsert(upsertData, { onConflict });

    if (upsertError) {
      logCritical(`☁️ [CLOUD CLEANUP] Failed to save ${table}.${row.k}:`, upsertError.message);
      return { cleaned: 0, kept: after };
    } else {
      logCritical(`☁️ [CLOUD CLEANUP] ${table}.${row.k}: Cleaned ${before - after} invalid (${before} → ${after})`);
      return { cleaned: before - after, kept: after };
    }
  }

  cloud.bootstrapSync = async function () {
    try {
      muteMirror = true;
      if (!user) { muteMirror = false; return; }

      // 🧹 Очистка невалидных продуктов перед синхронизацией
      cloud.cleanupProducts();

      // 🇷🇺 Используем Yandex API вместо Supabase (152-ФЗ compliant)
      const YandexAPI = global.HEYS?.YandexAPI;
      if (!YandexAPI) {
        err('bootstrapSync: YandexAPI not loaded');
        muteMirror = false;
        return;
      }

      // heys-api-rest: kv_store не в whitelist — SELECT даёт 404 в Network; при RPC-режиме не вызываем.
      if (_rpcOnlyMode) {
        logCritical('bootstrapSync: пропуск kv_store (RPC-only, legacy user-bootstrap не используется)');
        muteMirror = false;
        return;
      }

      const { data, error } = await YandexAPI.from('kv_store').select('k,v,updated_at');

      // Graceful degradation: если сеть не работает — продолжаем с localStorage
      if (error) {
        if (error.isNetworkFailure) {
          console.warn('[HEYS.cloud] 📴 bootstrapSync: работаем offline с локальными данными');
        } else if (error.code === 404 || error.code === '404') {
          // heys-api-rest: таблица kv_store не в whitelist — SELECT всегда 404
          logCritical('bootstrapSync: kv_store REST недоступен (404) — legacy user-bootstrap пропущен');
        } else {
          err('bootstrap select', error);
        }
        muteMirror = false;
        return;
      }
      const ls = global.localStorage;

      // 🔒 ФИЛЬТРАЦИЯ: загружаем только глобальные ключи или ключи текущего клиента
      // kv_store содержит legacy данные с clientId внутри ключа — их нужно фильтровать
      const currentClientId = ls.getItem('heys_client_current');
      let parsedClientId = null;
      try { parsedClientId = currentClientId ? JSON.parse(currentClientId) : null; } catch (e) { parsedClientId = currentClientId; }

      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

      // clear only global keys for full bootstrap (no clientId)
      clearNamespace();

      let loadedCount = 0;
      let skippedCount = 0;

      (data || []).forEach(row => {
        try {
          const key = row.k;

          // 🔐 КРИТИЧНО: НЕ перезаписываем auth токен из облака!
          // Auth токен уже сохранён локально со свежим expires_at после signIn.
          // Токен в облаке имеет старый expires_at → перезапишет свежий → ошибка при reload.
          if (key === 'heys_supabase_auth_token') {
            logCritical('⏭️ [BOOTSTRAP] Skipping auth token from cloud (use local fresh token)');
            return;
          }

          // Проверяем: содержит ли ключ UUID (clientId)?
          const uuids = key.match(uuidPattern);

          if (uuids && uuids.length > 0) {
            // Ключ содержит UUID — это клиентские данные
            // Загружаем только если UUID совпадает с текущим клиентом
            const hasCurrentClient = parsedClientId && uuids.some(id =>
              id.toLowerCase() === parsedClientId.toLowerCase()
            );

            if (!hasCurrentClient) {
              // Чужой клиент — пропускаем
              skippedCount++;
              return;
            }
          }

          // 🔧 FIX 2025-12-26: Декомпрессия данных из cloud
          // Если данные были ошибочно сохранены в сжатом виде — декомпрессируем
          const __decompBoot = decompressCloudRowValue(row.v, key);
          if (!__decompBoot.ok) {
            return; // skip this row — would write garbage to localStorage
          }
          let valueToStore = __decompBoot.value;
          if (typeof row.v === 'string' && row.v.startsWith('¤Z¤')) {
            log(`🔧 [BOOTSTRAP] Decompressed ${key} from cloud`);
          }

          // 🛡️ v61 FIX: Защита dayv2 от перезатирания пустыми данными
          const isDayKey = key.includes('dayv2_');
          if (isDayKey) {
            const existingRaw = ls.getItem(key);
            if (existingRaw) {
              try {
                const existing = JSON.parse(existingRaw);
                const localMeaningful = isMeaningfulDayData(existing);
                const remoteMeaningful = isMeaningfulDayData(valueToStore);

                if (localMeaningful && !remoteMeaningful) {
                  logCritical(`🛡️ [BOOTSTRAP] KEEP LOCAL: meaningful local, empty remote for ${key}`);
                  return;
                }

                const localMealsCount = Array.isArray(existing?.meals) ? existing.meals.length : 0;
                const remoteMealsCount = Array.isArray(valueToStore?.meals) ? valueToStore.meals.length : 0;
                if (localMealsCount > remoteMealsCount) {
                  logCritical(`🛡️ [BOOTSTRAP] KEEP LOCAL: local has MORE meals (${localMealsCount} > ${remoteMealsCount}) for ${key}`);
                  return;
                }

                const existingUpdatedAt = existing?.updatedAt || 0;
                const incomingUpdatedAt = valueToStore?.updatedAt || 0;
                if (existingUpdatedAt > incomingUpdatedAt) {
                  logCritical(`🛡️ [BOOTSTRAP] KEEP LOCAL: local is newer (${existingUpdatedAt} > ${incomingUpdatedAt}) for ${key}`);
                  return;
                }

                backupDayV2BeforeOverwrite(key, valueToStore, 'bootstrap');
              } catch (_) { }
            }
          }

          // Глобальный ключ или ключ текущего клиента — загружаем
          ls.setItem(key, JSON.stringify(valueToStore));
          logProductsCloudWrite('bootstrap', key, valueToStore);
          loadedCount++;
        } catch (e) { }
      });

      if (skippedCount > 0) {
        logCritical(`🔒 [BOOTSTRAP] Loaded ${loadedCount} keys, skipped ${skippedCount} foreign client keys`);
      }

      muteMirror = false;
    } catch (e) { err('bootstrap exception', e); muteMirror = false; }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🔐 SYNC VIA YANDEX API — для входа клиента по телефону+PIN (РФ 152-ФЗ)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Синхронизирует данные клиента через Yandex API (без Supabase сессии)
   * Используется после успешной верификации PIN клиента
   * @param {string} clientId - UUID клиента
   * @param {Object} options - { force: boolean }
   * @returns {Promise<{success: boolean, loaded?: number, error?: string}>}
   */
  cloud.syncClientViaRPC = async function (clientId, options = {}) {
    // Используем YandexAPI вместо Supabase для соответствия 152-ФЗ
    const YandexAPI = global.HEYS?.YandexAPI;
    if (!YandexAPI) {
      logCritical('❌ [YANDEX SYNC] YandexAPI not loaded!');
      return { success: false, error: 'yandex_api_not_loaded' };
    }

    if (!clientId) {
      return { success: false, error: 'no_client_id' };
    }

    if (!options?.force && typeof cloud.isSyncPaused === 'function' && cloud.isSyncPaused()) {
      return { success: false, error: 'sync_paused' };
    }

    const ls = global.localStorage;

    try {
      const syncStartTime = performance.now();
      logCritical(`🇷🇺 [YANDEX SYNC] Загрузка данных клиента ${clientId.slice(0, 8)}...`);

      // 🔴 CRITICAL FIX: Сначала отправляем локальные изменения в облако!
      // Без этого syncClientViaRPC удалит несохранённые данные при очистке localStorage
      const pendingCount = cloud.getPendingCount?.() || 0;
      if (pendingCount > 0 || _uploadInProgress) {
        logCritical(`🔄 [YANDEX SYNC] Flushing ${pendingCount} pending items (uploadInProgress: ${_uploadInProgress}) BEFORE download`);
        await cloud.flushPendingQueue?.(10000); // 10 секунд таймаут
        // Дополнительная задержка для гарантии записи в облако
        await new Promise(r => setTimeout(r, 200));
        logCritical(`✅ [YANDEX SYNC] Flush completed`);
      }

      // Уведомляем UI о начале синхронизации
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heysSyncStarting', { detail: { clientId } }));
      }

      // 🚀 Delta Sync: если есть last_sync_ts — загружаем только изменения
      const lastSyncKey = `heys_${clientId}_last_sync_ts`;
      const lastSyncTs = ls.getItem(lastSyncKey);
      const since = (lastSyncTs && !options?.force) ? lastSyncTs : null;
      if (since) {
        logCritical(`🚀 [DELTA SYNC] Using delta mode since ${since}`);
      }

      // Вызываем Yandex REST API для получения данных (вместо Supabase RPC)
      const { data, error, delta: isDelta } = await YandexAPI.getAllKV(clientId, { since });

      if (error) {
        logCritical(`❌ Ошибка загрузки: ${error}`);

        // 🔔 v59 FIX G: Dispatch heysSyncCompleted on early-return error path
        // getAllKV catches 502 internally and returns { error } — catch block never fires.
        // Without this dispatch, UI (cascade, skeleton) stays in loading state forever.
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
            detail: { clientId, error: true, loaded: 0, viaYandex: true, phase: 'full' }
          }));
        }

        return { success: false, error: error };
      }

      // Записываем данные в localStorage
      muteMirror = true;
      let loadedCount = 0;

      // Считаем текущие ключи клиента, чтобы безопасно решить очистку
      const prefix = `heys_${clientId}_`;
      const keysToRemove = [];
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }

      let syncRowsMerged = mergeProductsRpcTailRawClientRows(Array.isArray(data) ? data.slice() : [], clientId);
      syncRowsMerged = mergeOverlayRpcTailRawClientRows(syncRowsMerged, clientId);

      // Собираем список ключей, пришедших из облака (нормализованные)
      const remoteKeys = new Set(syncRowsMerged.map(row => row?.k).filter(Boolean));
      const hasRemoteProfile = remoteKeys.has('heys_profile');

      // 🛡️ SAFE MODE: НЕ чистим все локальные ключи.
      // Перезаписываем только те, что пришли из облака.
      const hasRemoteData = Array.isArray(syncRowsMerged) && syncRowsMerged.length > 0;
      if (!hasRemoteData) {
        logCritical(`⚠️ [YANDEX SYNC] Remote empty, local keys preserved (${keysToRemove.length})`);
      }

      // Записываем новые данные и собираем ключи для инвалидации кэша
      const syncedKeys = [];
      const _cloudGarbage = createCloudGarbageCollector();
      syncRowsMerged.forEach(row => {
        try {
          // Ключи в client_kv_store уже нормализованы (heys_profile, heys_dayv2_2025-12-12)
          if (isForeignClientScopedKey(row?.k, clientId)) {
            recordCloudGarbageCandidate(_cloudGarbage, 'foreign', row.k);
            return;
          }
          if (isSensitiveSessionStorageKey(row?.k)) {
            recordCloudGarbageCandidate(_cloudGarbage, 'sensitive', row.k);
            return;
          }
          const localKey = `heys_${clientId}_${row.k.replace(/^heys_/, '')}`;

          // 🔧 FIX 2025-12-26: Декомпрессия данных из cloud
          // Если данные были ошибочно сохранены в сжатом виде — декомпрессируем
          const __decompYandex = decompressCloudRowValue(row.v, row.k);
          if (!__decompYandex.ok) {
            return; // skip this row — would write garbage to localStorage
          }
          let valueToStore = __decompYandex.value;
          if (typeof row.v === 'string' && row.v.startsWith('¤Z¤')) {
            log(`🔧 [YANDEX SYNC] Decompressed ${row.k} from cloud`);
          }
          const isDayKey = localKey.includes('dayv2_');
          if (isDayKey && (valueToStore == null || valueToStore === 'null')) {
            logCritical(`🛡️ [YANDEX SYNC] SKIP NULL dayv2: ${localKey}`);
            return; // skip this row — null data corrupts getDayData
          }

          // 🛡️ v61 FIX: Защита dayv2 от перезатирания пустыми данными (аналогично bootstrapClientSync)
          if (isDayKey) {
            const existingRaw = ls.getItem(localKey);
            if (existingRaw) {
              try {
                const existing = JSON.parse(existingRaw);
                const localMeaningful = isMeaningfulDayData(existing);
                const remoteMeaningful = isMeaningfulDayData(valueToStore);

                // Не затираем meaningful локальные данные пустым remote
                if (localMeaningful && !remoteMeaningful) {
                  logCritical(`🛡️ [YANDEX SYNC] KEEP LOCAL: meaningful local, empty remote for ${localKey}`);
                  return; // skip this row
                }

                // Не затираем если local имеет БОЛЬШЕ meals
                const localMealsCount = Array.isArray(existing?.meals) ? existing.meals.length : 0;
                const remoteMealsCount = Array.isArray(valueToStore?.meals) ? valueToStore.meals.length : 0;
                if (localMealsCount > remoteMealsCount) {
                  logCritical(`🛡️ [YANDEX SYNC] KEEP LOCAL: local has MORE meals (${localMealsCount} > ${remoteMealsCount}) for ${localKey}`);
                  return; // skip this row
                }

                // Не затираем если local новее по timestamp
                const existingUpdatedAt = existing?.updatedAt || 0;
                const incomingUpdatedAt = valueToStore?.updatedAt || 0;
                if (existingUpdatedAt > incomingUpdatedAt) {
                  logCritical(`🛡️ [YANDEX SYNC] KEEP LOCAL: local is newer (${existingUpdatedAt} > ${incomingUpdatedAt}) for ${localKey}`);
                  return; // skip this row
                }

                // 🧷 Backup перед возможной перезаписью
                backupDayV2BeforeOverwrite(localKey, valueToStore, 'yandex-sync');
              } catch (_) { }
            }
          }

          ls.setItem(localKey, JSON.stringify(valueToStore));
          logProductsCloudWrite('yandex-sync', localKey, valueToStore);
          syncedKeys.push(row.k); // Сохраняем оригинальный ключ для инвалидации
          loadedCount++;
        } catch (e) {
          console.warn('[YANDEX SYNC] Failed to save key:', row.k, e);
        }
      });

      muteMirror = false;
      scheduleCloudGarbageCleanup(clientId, _cloudGarbage, 'yandex-sync');

      // 🧹 Если профиль уже заполнен — очищаем флаг регистрации.
      // Голый JSON.parse падает на сжатых данных (Store.set добавляет префикс ¤Z¤),
      // поэтому используем decompress: он сам обрабатывает оба случая.
      try {
        const profileKey = `heys_${clientId}_profile`;
        const rawProfile = ls.getItem(profileKey);
        if (rawProfile) {
          const parsedProfile = global.HEYS?.store?.decompress
            ? global.HEYS.store.decompress(rawProfile)
            : JSON.parse(rawProfile);
          if (parsedProfile?.profileCompleted === true) {
            localStorage.removeItem('heys_registration_in_progress');
          }
        }
      } catch (_) { }

      // 🔄 CRITICAL: Инвалидируем memory cache для всех синхронизированных ключей
      // Без этого Store.get() будет возвращать устаревшие данные из памяти
      if (global.HEYS && global.HEYS.store && global.HEYS.store.invalidate) {
        syncedKeys.forEach(k => {
          global.HEYS.store.invalidate(k);
        });
        logCritical(`🗑️ [YANDEX SYNC] Инвалидирован кэш для ${syncedKeys.length} ключей`);
      }

      // Обновляем timestamp последней синхронизации
      cloud._lastClientSync = { clientId, ts: Date.now(), viaYandex: true };

      // 🔐 Убеждаемся что currentClientId выставлен (важно для scoped store.get)
      try {
        if (global.HEYS) {
          if (!global.HEYS.currentClientId || global.HEYS.currentClientId !== clientId) {
            global.HEYS.currentClientId = clientId;
          }
        }
        const storedCurrent = localStorage.getItem('heys_client_current');
        if (!storedCurrent) {
          localStorage.setItem('heys_client_current', JSON.stringify(clientId));
        }
      } catch (_) { }

      // Помечаем initial sync как завершённый и отменяем failsafe
      if (!initialSyncCompleted) {
        initialSyncCompleted = true;
        cancelFailsafeTimer(); // 🔐 Отменяем failsafe — sync успешен
      }

      logCritical(`✅ Загружено ${loadedCount} ключей для клиента ${clientId.slice(0, 8)}`);
      const syncDuration = Math.round(performance.now() - syncStartTime);
      logCritical(`✅ [SYNC DONE] client=${clientId.slice(0, 8)} keys=${loadedCount} ms=${syncDuration} via=rpc${isDelta ? ' (delta)' : ' (full)'}`);
      addSyncLogEntry('download_ok', { n: loadedCount, ms: syncDuration, mode: isDelta ? 'delta' : 'full', via: 'yandex' });

      // 🚀 Delta Sync: сохраняем timestamp для следующего delta sync
      try {
        ls.setItem(`heys_${clientId}_last_sync_ts`, new Date().toISOString());
      } catch (_) { }

      // Уведомляем UI о завершении
      // 🆕 PERF v9.2: Yandex full sync завершён
      window.__heysPerfMark && window.__heysPerfMark('heysSyncCompleted: viaYandex dispatch');
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
          detail: { clientId, loaded: loadedCount, viaYandex: true, phase: 'full' }
        }));
      }

      return { success: true, loaded: loadedCount };

    } catch (e) {
      muteMirror = false;
      logCritical(`❌ [YANDEX SYNC] Exception: ${e.message}`);

      // 🔔 v58 FIX: Dispatch heysSyncCompleted even on error
      // Without this, UI (cascade, skeleton) stays in loading state forever
      // when sync fails — it only received the event on success path.
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
          detail: { clientId, error: true, loaded: 0, viaYandex: true, phase: 'full' }
        }));
      }

      return { success: false, error: e.message };
    }
  };

  /**
   * Сохраняет данные клиента через Yandex API (без auth.uid())
   * Используется для клиентов, вошедших по PIN
   * @param {string} clientId - UUID клиента
   * @param {Array<{k: string, v: any, updated_at?: string}>} items - массив данных для сохранения
   * @returns {Promise<{success: boolean, saved?: number, error?: string}>}
   */
  cloud.saveClientViaRPC = async function (clientId, items) {
    // Используем YandexAPI вместо Supabase
    const YandexAPI = global.HEYS?.YandexAPI;
    if (!YandexAPI) {
      logCritical('❌ [YANDEX SAVE] YandexAPI not loaded!');
      return { success: false, error: 'yandex_api_not_loaded' };
    }

    if (!clientId || !items || items.length === 0) {
      return { success: false, error: 'invalid_params' };
    }

    try {
      // Преобразуем items в формат для YandexAPI
      const yandexItems = items.map(item => ({
        k: normalizeKeyForSupabase(item.k, clientId),
        v: item.v,
        updated_at: item.updated_at || new Date().toISOString()
      }));

      const Store = global.HEYS?.store;
      const isProductsBaseKey = (k) => {
        const s = String(k || '');
        return s === 'heys_products' || /(^|_)heys_products$/.test(s);
      };
      const isProductsFamilyRpcKey = (k) => {
        const s = String(k || '');
        return isProductsBaseKey(s) || isProductsTailRpcKey(s);
      };
      const isOverlayFamilyRpcKey = (k) => {
        const s = String(k || '');
        return isOverlayBaseKey(s) || isOverlayTailRpcKey(s);
      };
      const isIsolatedRpcKey = (k) => isProductsFamilyRpcKey(k) || isOverlayFamilyRpcKey(k);

      const slimProductsForRpcUpload = (products, tier) => {
        if (!Array.isArray(products)) return products;
        if (tier >= 3) {
          // Аварийный ultra-slim при 413: оставляем только поля, нужные для резолва и базовых расчётов.
          return products.map((p) => {
            if (!p || typeof p !== 'object') return p;
            return {
              id: p.id ?? p.product_id ?? null,
              product_id: p.product_id ?? p.id ?? null,
              name: typeof p.name === 'string' ? p.name.slice(0, 160) : '',
              kcal100: p.kcal100 ?? null,
              protein100: p.protein100 ?? null,
              fat100: p.fat100 ?? null,
              carbs100: p.carbs100 ?? null,
              updatedAt: p.updatedAt ?? p.updated_at ?? null,
              fingerprint: p.fingerprint ?? null,
            };
          });
        }
        const stripKeys = tier >= 2
          ? ['photo', 'image', 'imageUrl', 'imageData', 'thumb', 'thumbnail', 'rawPhoto', 'barcodeImage', 'icon']
          : ['photo', 'image', 'imageUrl', 'rawPhoto'];
        const maxStr = tier >= 2 ? 400 : 2000;
        return products.map(p => {
          if (!p || typeof p !== 'object') return p;
          const o = { ...p };
          for (let si = 0; si < stripKeys.length; si++) delete o[stripKeys[si]];
          if (typeof o.notes === 'string' && o.notes.length > maxStr) o.notes = o.notes.slice(0, maxStr);
          if (typeof o.description === 'string' && o.description.length > maxStr) o.description = o.description.slice(0, maxStr);
          if (typeof o.name === 'string' && o.name.length > 200) o.name = o.name.slice(0, 200);
          return o;
        });
      };

      const productsArrayFromClientKvValue = (v) => {
        if (Array.isArray(v)) return v;
        if (typeof v === 'string' && v.startsWith('¤Z¤') && Store && typeof Store.decompress === 'function') {
          try {
            const d = Store.decompress(v);
            return Array.isArray(d) ? d : null;
          } catch (_) {
            return null;
          }
        }
        return null;
      };

      // 🗜️ Slim + pattern-compress heys_products / tail before RPC (gateway 413).
      for (let ii = 0; ii < yandexItems.length; ii++) {
        const row = yandexItems[ii];
        if (!row || !isProductsFamilyRpcKey(row.k)) continue;
        if (typeof row.v === 'string' && row.v.startsWith('¤Z¤')) continue;
        const arr0 = productsArrayFromClientKvValue(row.v);
        if (!Array.isArray(arr0)) continue;
        row.v = slimProductsForRpcUpload(arr0, 1);
        if (!Store) continue;
        try {
          const raw = JSON.stringify(row.v);
          if (raw.length < 2048) continue;
          let wire = typeof Store.compressProductsWire === 'function' ? Store.compressProductsWire(row.v) : null;
          if (!wire && typeof Store.compress === 'function') {
            const c = Store.compress(row.v);
            if (typeof c === 'string' && c.startsWith('¤Z¤')) wire = c;
          }
          if (typeof wire === 'string' && wire.startsWith('¤Z¤') && wire.length + 8 < raw.length) {
            row.v = wire;
            logCritical(`🗜️ [YANDEX SAVE] Compressed ${row.k} ${Math.round(raw.length / 1024)}KB → ${Math.round(wire.length / 1024)}KB`);
          }
        } catch (_) { /* keep */ }
      }

      const isCascadeDcsRpcKey = (k) => /cascade_dcs_/i.test(String(k || ''));
      for (let ci = 0; ci < yandexItems.length; ci++) {
        const row = yandexItems[ci];
        if (!row || !isCascadeDcsRpcKey(row.k)) continue;
        if (typeof row.v === 'string' && row.v.startsWith('¤Z¤')) continue;
        if (!row.v || typeof row.v !== 'object' || Array.isArray(row.v)) continue;
        const slim = {};
        const dkeys = Object.keys(row.v);
        for (let di = 0; di < dkeys.length; di++) {
          const dk = dkeys[di];
          const dv = row.v[dk];
          slim[dk] = typeof dv === 'number' ? Math.round(dv * 1000) / 1000 : dv;
        }
        row.v = slim;
      }

      const jsonSize = JSON.stringify(yandexItems).length;
      const jsonSizeKB = Math.round(jsonSize / 1024);
      if (jsonSize > 100000) {
        logCritical(`⚠️ [YANDEX SAVE] Large payload: ${jsonSizeKB}KB, ${yandexItems.length} items`);
      }

      const isPayloadTooLargeRpc = (err) => {
        const msg = String(err?.message || err || '');
        const code = err && err.code;
        return code === 413 || /413|payload too large|request entity too large/i.test(msg);
      };

      const itemWireBytes = (it) => {
        try {
          return JSON.stringify({ k: it.k, v: it.v, updated_at: it.updated_at }).length;
        } catch (_) {
          return 1e9;
        }
      };

      const LARGE_ITEM_PRECOMPRESS_BYTES = 48 * 1024;
      if (Store && typeof Store.compress === 'function') {
        for (let pj = 0; pj < yandexItems.length; pj++) {
          const row = yandexItems[pj];
          if (!row) continue;
          if (typeof row.v === 'string' && row.v.startsWith('¤Z¤')) continue;
          if (row.v === null || typeof row.v !== 'object') continue;
          // Arrays from products-family keys go through dedicated slim/compress path above —
          // skip them here. Other arrays (e.g. heys_products_overlay_v2 ~470KB) need wire compress
          // to fit into RPC payload budget; without this they trigger 413 and stall the queue.
          if (Array.isArray(row.v) && isProductsFamilyRpcKey(row.k)) continue;
          const sz0 = itemWireBytes(row);
          if (sz0 < LARGE_ITEM_PRECOMPRESS_BYTES) continue;
          try {
            const c = Store.compress(row.v);
            if (typeof c !== 'string' || !c.startsWith('¤Z¤')) continue;
            const sz1 = JSON.stringify({ k: row.k, v: c, updated_at: row.updated_at }).length;
            if (sz1 + 400 < sz0) {
              row.v = c;
              logCritical(`🗜️ [YANDEX SAVE] Pre-RPC compress ${row.k}: ${Math.round(sz0 / 1024)}KB → ${Math.round(sz1 / 1024)}KB`);
            }
          } catch (_) { /* noop */ }
        }
      }

      // Budget for p_items JSON only (session wrapper adds overhead — stay conservative).
      const P_ITEMS_BUDGET_BYTES = 96 * 1024;

      const buildSizeBudgetChunks = () => {
        const isolated = [];
        const rest = [];
        for (let i = 0; i < yandexItems.length; i++) {
          const it = yandexItems[i];
          if (isIsolatedRpcKey(it.k)) isolated.push([it]);
          else rest.push(it);
        }
        const out = [];
        let cur = [];
        let curSz = 0;
        for (let j = 0; j < rest.length; j++) {
          const it = rest[j];
          const sz = itemWireBytes(it);
          if (sz > P_ITEMS_BUDGET_BYTES) {
            if (cur.length) {
              out.push(cur);
              cur = [];
              curSz = 0;
            }
            out.push([it]);
            continue;
          }
          if (cur.length && curSz + sz > P_ITEMS_BUDGET_BYTES) {
            out.push(cur);
            cur = [];
            curSz = 0;
          }
          cur.push(it);
          curSz += sz;
        }
        if (cur.length) out.push(cur);
        for (let k = 0; k < isolated.length; k++) out.push(isolated[k]);
        return out;
      };

      let didSaveProductsMain = false;
      let didSplitProductsUpload = false;
      let didSaveOverlayMain = false;
      let didSplitOverlayUpload = false;

      const uploadChunkResilient = async (chunk) => {
        let res = await YandexAPI.batchSaveKV(clientId, chunk);
        if (res.success) {
          for (let ui = 0; ui < chunk.length; ui++) {
            const k = chunk[ui]?.k;
            if (isProductsBaseKey(k)) didSaveProductsMain = true;
            if (isOverlayBaseKey(k)) didSaveOverlayMain = true;
          }
          return { success: true, saved: res.saved || chunk.length };
        }
        if (isPayloadTooLargeRpc(res.error)) {
          try {
            const chunkBytes = JSON.stringify(chunk).length;
            const items = chunk.map(it => {
              let bytes = 0; let kind = 'unknown';
              try {
                if (typeof it.v === 'string') { bytes = it.v.length; kind = it.v.startsWith('¤Z¤') ? 'compressed' : 'string'; }
                else if (Array.isArray(it.v)) { bytes = JSON.stringify(it.v).length; kind = `array[${it.v.length}]`; }
                else if (it.v && typeof it.v === 'object') { bytes = JSON.stringify(it.v).length; kind = 'object'; }
                else { bytes = JSON.stringify(it.v ?? null).length; }
              } catch (_) { /* noop */ }
              return { k: it.k, bytes, kind };
            });
            recordUploadDiag({
              kind: '413',
              chunkBytes,
              chunkLen: chunk.length,
              items,
              error: String(res?.error?.message || res?.error || ''),
              code: res?.error?.code || res?.error?.status,
            });
          } catch (_) { /* noop */ }
        }
        if (isPayloadTooLargeRpc(res.error) && chunk.length > 1) {
          const mid = Math.ceil(chunk.length / 2);
          const a = await uploadChunkResilient(chunk.slice(0, mid));
          if (!a.success) return a;
          const b = await uploadChunkResilient(chunk.slice(mid));
          return {
            success: !!(a.success && b.success),
            saved: (a.saved || 0) + (b.saved || 0),
            error: b.error || a.error,
          };
        }
        if (isPayloadTooLargeRpc(res.error) && chunk.length === 1) {
          const it = { ...chunk[0] };
          const tryWireUpload = async (value) => {
            const attempt = await YandexAPI.batchSaveKV(clientId, [{ ...it, v: value }]);
            if (attempt.success) return { ok: true, saved: attempt.saved || 1 };
            const one = await YandexAPI.saveKV(clientId, it.k, value);
            if (one.success) return { ok: true, saved: 1 };
            return { ok: false, err: one.error || attempt.error };
          };

          if (Store && typeof it.v === 'object' && it.v !== null && !Array.isArray(it.v)) {
            try {
              const c = Store.compress(it.v);
              if (typeof c === 'string' && c.startsWith('¤Z¤')) {
                const w = await tryWireUpload(c);
                if (w.ok) {
                  if (isProductsBaseKey(it.k)) didSaveProductsMain = true;
                  if (isOverlayBaseKey(it.k)) didSaveOverlayMain = true;
                  return { success: true, saved: w.saved || 1 };
                }
              }
            } catch (_) { /* fall through */ }
          }

          if (isProductsBaseKey(it.k) && Store) {
            const arr = productsArrayFromClientKvValue(it.v);
            if (Array.isArray(arr) && arr.length > 0) {
              const slim2 = slimProductsForRpcUpload(arr, 2);
              let wire2 = typeof Store.compressProductsWire === 'function' ? Store.compressProductsWire(slim2) : null;
              if (!wire2 && typeof Store.compress === 'function') {
                const c2 = Store.compress(slim2);
                if (typeof c2 === 'string' && c2.startsWith('¤Z¤')) wire2 = c2;
              }
              if (wire2) {
                const w2 = await tryWireUpload(wire2);
                if (w2.ok) {
                  didSaveProductsMain = true;
                  return { success: true, saved: w2.saved || 1 };
                }
              }
              if (arr.length >= 2) {
                // Жёсткий fallback при 413: бьём products на N шардов фиксированного размера
                // и сохраняем как heys_products + heys_products_rpc_tail_1..N.
                // Atomic order: пишем tails ПЕРВЫМИ (от хвоста к началу), main — последним
                // как commit-marker. Если хвост падает — main не обновляется, старая версия
                // в облаке остаётся консистентной, retry повторит весь сценарий.
                const shardTargetBytes = 42 * 1024;
                const slim = slimProductsForRpcUpload(arr, 3);
                const shards = [];
                let cur = [];
                let curBytes = 0;
                for (let si = 0; si < slim.length; si++) {
                  const one = slim[si];
                  const oneBytes = Math.max(1, JSON.stringify(one).length + 1);
                  if (cur.length > 0 && curBytes + oneBytes > shardTargetBytes) {
                    shards.push(cur);
                    cur = [];
                    curBytes = 0;
                  }
                  cur.push(one);
                  curBytes += oneBytes;
                }
                if (cur.length > 0) shards.push(cur);
                if (shards.length === 0) shards.push([]);

                const mainShard = shards[0];
                const tails = shards.slice(1);

                // 1. Tails first (reverse order — N..1)
                for (let ti = tails.length - 1; ti >= 0; ti--) {
                  const tailKey = `${HEYS_PRODUCTS_RPC_TAIL_K}_${ti + 1}`;
                  const tr = await YandexAPI.saveKV(clientId, tailKey, tails[ti]);
                  if (!tr.success) return { success: false, saved: 0, error: tr.error || res.error };
                }
                // 2. Main last (commit marker)
                const t2 = await YandexAPI.saveKV(clientId, it.k, mainShard);
                if (!t2.success) return { success: false, saved: 0, error: t2.error || res.error };

                // best-effort cleanup неиспользуемых старых tail-ключей
                if (typeof YandexAPI.deleteKV === 'function') {
                  for (let ci = tails.length + 1; ci <= MAX_TAIL_SHARDS; ci++) {
                    YandexAPI.deleteKV(clientId, `${HEYS_PRODUCTS_RPC_TAIL_K}_${ci}`).catch(() => { });
                  }
                }
                didSaveProductsMain = true;
                didSplitProductsUpload = tails.length > 0;
                logCritical(`📑 [YANDEX SAVE] Split heys_products RPC: ${shards.length} shard(s), total=${arr.length} items (413 fallback)`);
                return { success: true, saved: 1 };
              }
            }
          }

          // Overlay v2 shard fallback (parity with products family).
          // Overlay rows have rich nutrient data per item (~1.5KB raw / ~0.5KB compressed)
          // — slim is unsafe (would lose user nutrients) so we shard the array as-is.
          // Atomic order: tails first (reverse), main last as commit-marker.
          if (isOverlayBaseKey(it.k) && Store) {
            const arr = productsArrayFromClientKvValue(it.v);
            if (Array.isArray(arr) && arr.length >= 2) {
              const shardTargetBytes = 42 * 1024;
              const shards = [];
              let cur = [];
              let curBytes = 0;
              for (let si = 0; si < arr.length; si++) {
                const one = arr[si];
                const oneBytes = Math.max(1, JSON.stringify(one).length + 1);
                if (cur.length > 0 && curBytes + oneBytes > shardTargetBytes) {
                  shards.push(cur);
                  cur = [];
                  curBytes = 0;
                }
                cur.push(one);
                curBytes += oneBytes;
              }
              if (cur.length > 0) shards.push(cur);
              if (shards.length === 0) shards.push([]);

              const mainShard = shards[0];
              const tails = shards.slice(1);

              if (tails.length > MAX_TAIL_SHARDS) {
                logCritical(`⚠️ [YANDEX SAVE] Overlay v2 has ${tails.length + 1} shards, exceeds MAX_TAIL_SHARDS (${MAX_TAIL_SHARDS}). Aborting split.`);
                return { success: false, saved: 0, error: res.error };
              }

              // 1. Tails first (reverse order)
              for (let ti = tails.length - 1; ti >= 0; ti--) {
                const tailKey = `${HEYS_OVERLAY_RPC_TAIL_K}_${ti + 1}`;
                const tr = await YandexAPI.saveKV(clientId, tailKey, tails[ti]);
                if (!tr.success) return { success: false, saved: 0, error: tr.error || res.error };
              }
              // 2. Main last (commit marker)
              const tm = await YandexAPI.saveKV(clientId, it.k, mainShard);
              if (!tm.success) return { success: false, saved: 0, error: tm.error || res.error };

              // best-effort cleanup unused tail keys
              if (typeof YandexAPI.deleteKV === 'function') {
                for (let ci = tails.length + 1; ci <= MAX_TAIL_SHARDS; ci++) {
                  YandexAPI.deleteKV(clientId, `${HEYS_OVERLAY_RPC_TAIL_K}_${ci}`).catch(() => { });
                }
              }
              didSaveOverlayMain = true;
              didSplitOverlayUpload = tails.length > 0;
              logCritical(`📑 [YANDEX SAVE] Split heys_products_overlay_v2 RPC: ${shards.length} shard(s), total=${arr.length} rows (413 fallback)`);
              return { success: true, saved: 1 };
            }
          }

          // Последний fallback для heys_products: ultra-slim + compress.
          // Лучше сохранить урезанный каталог, чем бесконечно ловить 413 и держать очередь.
          if (isProductsBaseKey(it.k) && Store) {
            const arr3 = productsArrayFromClientKvValue(it.v);
            if (Array.isArray(arr3) && arr3.length > 0) {
              const slim3 = slimProductsForRpcUpload(arr3, 3);
              let wire3 = null;
              try {
                if (typeof Store.compressProductsWire === 'function') wire3 = Store.compressProductsWire(slim3);
                if ((!wire3 || typeof wire3 !== 'string') && typeof Store.compress === 'function') {
                  const c3 = Store.compress(slim3);
                  if (typeof c3 === 'string' && c3.startsWith('¤Z¤')) wire3 = c3;
                }
              } catch (_) { /* noop */ }

              const u3 = await tryWireUpload(wire3 || slim3);
              if (u3.ok) {
                didSaveProductsMain = true;
                logCritical(`🧩 [YANDEX SAVE] Ultra-slim heys_products fallback applied (${arr3.length} items)`);
                return { success: true, saved: u3.saved || 1 };
              }
            }
          }

          const sk = await YandexAPI.saveKV(clientId, it.k, it.v);
          if (sk.success) {
            if (isProductsBaseKey(it.k)) didSaveProductsMain = true;
            return { success: true, saved: 1 };
          }
          return { success: false, saved: 0, error: sk.error || res.error };
        }
        return { success: false, saved: 0, error: res.error };
      };

      const chunks = buildSizeBudgetChunks();
      if (chunks.length > 1 || jsonSize > P_ITEMS_BUDGET_BYTES) {
        logCritical(`📦 [YANDEX SAVE] RPC plan: ${chunks.length} chunk(s) (budget ${Math.round(P_ITEMS_BUDGET_BYTES / 1024)}KB p_items), total ${jsonSizeKB}KB`);
      }

      let totalSaved = 0;
      for (let ci = 0; ci < chunks.length; ci++) {
        const r = await uploadChunkResilient(chunks[ci]);
        if (!r.success) {
          logCritical(`❌ [YANDEX SAVE] Chunk ${ci + 1}/${chunks.length} failed: ${r.error}`);
          return { success: false, error: r.error, saved: totalSaved };
        }
        totalSaved += r.saved || chunks[ci].length;
      }

      if (didSaveProductsMain && !didSplitProductsUpload && typeof YandexAPI.deleteKV === 'function') {
        queueMicrotask(() => {
          YandexAPI.deleteKV(clientId, HEYS_PRODUCTS_RPC_TAIL_K).catch(() => { });
          for (let ci = 1; ci <= MAX_TAIL_SHARDS; ci++) {
            YandexAPI.deleteKV(clientId, `${HEYS_PRODUCTS_RPC_TAIL_K}_${ci}`).catch(() => { });
          }
        });
      }
      // Symmetric cleanup for overlay v2: when it goes through non-shard path
      // (compressed string fits the budget), delete any leftover tails from previous splits.
      if (didSaveOverlayMain && !didSplitOverlayUpload && typeof YandexAPI.deleteKV === 'function') {
        queueMicrotask(() => {
          YandexAPI.deleteKV(clientId, HEYS_OVERLAY_RPC_TAIL_K).catch(() => { });
          for (let ci = 1; ci <= MAX_TAIL_SHARDS; ci++) {
            YandexAPI.deleteKV(clientId, `${HEYS_OVERLAY_RPC_TAIL_K}_${ci}`).catch(() => { });
          }
        });
      }

      logCritical(`☁️ [YANDEX SAVE] Сохранено ${totalSaved} записей (${jsonSizeKB}KB) для клиента ${clientId.slice(0, 8)}`);
      return { success: true, saved: totalSaved };

    } catch (e) {
      logCritical(`❌ [YANDEX SAVE] Exception: ${e.message}`);
      return { success: false, error: e.message };
    }
  };

  // Вспомогательная проверка «день содержит реальные данные»
  const isMeaningfulDayData = (data) => {
    if (!data || typeof data !== 'object') return false;
    // Strength workout_builder: must upload even when zone minutes are 0 (unlike editing "minutes" on card).
    // dayHasTrackableWorkoutBuilder alone can be false while user is filling rows — then cloud save was blocked.
    try {
      const tr = data.trainings;
      if (Array.isArray(tr)) {
        for (let i = 0; i < tr.length; i++) {
          const t = tr[i];
          if (!t || String(t.type) !== 'strength' || t.strengthEntryMode !== 'workout_builder') continue;
          const wl = t.workoutLog;
          if (wl && typeof wl === 'object' && Array.isArray(wl.exercises) && wl.exercises.length >= 1) {
            return true;
          }
        }
      }
    } catch (e) { /* noop */ }
    try {
      const dc = global.HEYS && global.HEYS.dayCalculations && typeof global.HEYS.dayCalculations.dayHasTrackableWorkoutBuilder === 'function'
        ? global.HEYS.dayCalculations.dayHasTrackableWorkoutBuilder(data)
        : false;
      if (dc) return true;
    } catch (e) { /* noop */ }
    const mealsCount = Array.isArray(data.meals) ? data.meals.length : 0;
    const trainingsCount = Array.isArray(data.trainings) ? data.trainings.length : 0;
    if (mealsCount > 0 || trainingsCount > 0) return true;
    if ((data.waterMl || 0) > 0) return true;
    if ((data.steps || 0) > 0) return true;
    if ((data.weightMorning || 0) > 0) return true;
    if (data.sleepStart || data.sleepEnd || data.sleepQuality || data.sleepNote) return true;
    if (data.dayScore || data.moodAvg || data.wellbeingAvg || data.stressAvg) return true;
    if (data.moodMorning || data.wellbeingMorning || data.stressMorning) return true;
    if (data.householdMin || (Array.isArray(data.householdActivities) && data.householdActivities.length > 0)) return true;
    if (data.isRefeedDay || data.refeedReason) return true;
    if (data.cycleDay !== null && data.cycleDay !== undefined) return true;
    if (data.deficitPct !== null && data.deficitPct !== undefined && data.deficitPct !== '') return true;
    if ((Array.isArray(data.supplementsPlanned) && data.supplementsPlanned.length > 0) ||
      (Array.isArray(data.supplementsTaken) && data.supplementsTaken.length > 0)) return true;
    return false;
  };

  function getDayDataSyncScore(value) {
    const meals = Array.isArray(value?.meals) ? value.meals : [];
    const mealsWithItems = meals.filter(meal => Array.isArray(meal?.items) && meal.items.length > 0).length;
    const totalItems = meals.reduce((sum, meal) => sum + (Array.isArray(meal?.items) ? meal.items.length : 0), 0);
    const trainings = Array.isArray(value?.trainings) ? value.trainings.filter(Boolean).length : 0;
    const savedEatenKcal = Number(value?.savedEatenKcal || 0);
    const hasDayTot = !!(value?.dayTot && typeof value.dayTot === 'object' && Object.keys(value.dayTot).length > 0);
    const meaningful = isMeaningfulDayData(value);

    return {
      meaningful,
      mealsCount: meals.length,
      mealsWithItems,
      totalItems,
      trainings,
      savedEatenKcal,
      hasDayTot,
      score:
        (meaningful ? 1000 : 0) +
        (totalItems * 100) +
        (mealsWithItems * 20) +
        (meals.length * 5) +
        (savedEatenKcal > 0 && mealsWithItems > 0 ? 25 : 0) +
        (hasDayTot ? 15 : 0) +
        trainings
    };
  }

  function readDayV2Backup(key) {
    try {
      if (!key || !key.includes('dayv2_') || key.includes('dayv2_backup_')) return null;
      const backupKey = key.replace('dayv2_', 'dayv2_backup_');
      const raw = global.localStorage.getItem(backupKey);
      if (!raw) return null;
      const payload = tryParse(raw);
      const data = payload?.data || null;
      if (!data || typeof data !== 'object') return null;
      return { backupKey, payload, data };
    } catch (_) {
      return null;
    }
  }

  function maybeRestoreDayV2FromBackup(key, incomingValue, source = 'sync') {
    const backupEntry = readDayV2Backup(key);
    if (!backupEntry) return { value: incomingValue, restored: false };

    const incomingStats = getDayDataSyncScore(incomingValue);
    const backupStats = getDayDataSyncScore(backupEntry.data);
    if (!backupStats.meaningful) return { value: incomingValue, restored: false };

    const incomingUpdatedAt = incomingValue?.updatedAt || 0;
    const backupUpdatedAt = backupEntry.data?.updatedAt || backupEntry.payload?.localUpdatedAt || 0;

    const shouldRestore = backupStats.score > incomingStats.score && (
      backupUpdatedAt >= incomingUpdatedAt ||
      backupStats.totalItems > incomingStats.totalItems ||
      (incomingStats.savedEatenKcal === 0 && backupStats.savedEatenKcal > 0)
    );

    if (!shouldRestore) {
      return { value: incomingValue, restored: false };
    }

    logCritical(
      `🛡️ [DAYV2 BACKUP RESTORE] ${key}: using backup (${backupStats.totalItems} items, kcal=${backupStats.savedEatenKcal}, updAt=${backupUpdatedAt}) ` +
      `over incoming (${incomingStats.totalItems} items, kcal=${incomingStats.savedEatenKcal}, updAt=${incomingUpdatedAt}) | source=${source}`
    );

    return { value: backupEntry.data, restored: true, backupKey: backupEntry.backupKey };
  }

  /**
   * 🧷 Backup dayv2 before overwriting with remote data
   * Храним локальный снапшот чтобы можно было восстановиться после race condition
   * Backup-ключи НЕ зеркалируются в облако (см. interceptSetItem)
   */
  function backupDayV2BeforeOverwrite(key, incomingValue, source = 'sync') {
    try {
      if (!key || !key.includes('dayv2_') || key.includes('dayv2_backup_')) return;

      const ls = global.localStorage;
      const existingRaw = ls.getItem(key);
      if (!existingRaw) return;

      const existing = tryParse(existingRaw);
      if (!isMeaningfulDayData(existing)) return;

      const incomingMeaningful = isMeaningfulDayData(incomingValue);
      const existingUpdatedAt = existing?.updatedAt || 0;
      const incomingUpdatedAt = incomingValue?.updatedAt || 0;
      const existingMeals = Array.isArray(existing?.meals) ? existing.meals.length : 0;
      const incomingMeals = Array.isArray(incomingValue?.meals) ? incomingValue.meals.length : 0;

      // Бэкап нужен только если incoming выглядит «хуже» или потенциально рискованно
      const shouldBackup = !incomingMeaningful || incomingMeals < existingMeals || incomingUpdatedAt < existingUpdatedAt;
      if (!shouldBackup) return;

      const backupKey = key.replace('dayv2_', 'dayv2_backup_');
      const existingBackupRaw = ls.getItem(backupKey);
      if (existingBackupRaw) {
        try {
          const existingBackup = tryParse(existingBackupRaw);
          const lastTs = existingBackup?.ts || 0;
          const lastUpdatedAt = existingBackup?.localUpdatedAt || 0;
          if (Date.now() - lastTs < 5 * 60 * 1000 && lastUpdatedAt === existingUpdatedAt) {
            return; // не плодим частые бэкапы
          }
        } catch (_) { }
      }

      const payload = {
        ts: Date.now(),
        source,
        localUpdatedAt: existingUpdatedAt,
        incomingUpdatedAt,
        localMeals: existingMeals,
        incomingMeals,
        data: existing,
      };

      safeSetItem(backupKey, JSON.stringify(payload));
      logCritical(`🧷 [DAYV2 BACKUP] Saved ${backupKey} (${existingMeals} meals) before overwrite | source=${source}`);
    } catch (e) { }
  }

  // Флаг для дедупликации параллельных вызовов bootstrapClientSync
  let _syncInProgress = null; // null | Promise
  // options.force = true — bypass throttling (для pull-to-refresh)
  cloud.bootstrapClientSync = async function (client_id, options) {
    console.info(`[HEYS.sync] 🚀 Начало синхронизации для клиента ${client_id?.slice(0, 8)}...`);

    // 🔐 PIN-авторизация: работаем без user, если client_id проверен через verify_client_pin
    const isPinAuth = _pinAuthClientId && _pinAuthClientId === client_id;

    // v60: PIN clients now use bootstrapClientSync (paginated REST).
    // Old guard (_rpcOnlyMode && isPinAuth → skip) removed.
    // Deduplication handled by _syncInProgress + _syncInFlight in syncClient().

    // Проверка: нужен client_id
    // 🔧 FIX 2025-12-24: Убрана проверка `client` — для Yandex API режима client=null
    // Для PIN-авторизации не нужен user, для куратора — нужен user через YandexAPI
    if (!client_id) {
      log('[SYNC] Skipping — no client_id');
      return;
    }

    // Проверка авторизации: либо PIN auth, либо curator (переменная user)
    // 🔧 FIX 2025-12-24: Используем переменную `user` из scope (устанавливается при signIn)
    const hasAuth = isPinAuth || user;
    if (!hasAuth) {
      console.warn('[HEYS.sync] ⚠️ Пропуск — нет авторизации');
      return;
    }

    console.info('[HEYS.sync] ✅ Авторизация подтверждена');

    // Дедупликация: если sync уже в процессе для этого клиента — ждём его завершения
    if (_syncInProgress) {
      log('sync already in progress, waiting...');
      return _syncInProgress;
    }

    // 🔄 v5: Отмечаем что sync начался (для failsafe логики)
    _syncEverStarted = true;

    // 🔄 v5: Smart failsafe reset — если failsafe стрельнул во время загрузки скриптов
    // (до начала sync), то initialSyncCompleted = true ошибочно.
    // Сбрасываем и запускаем новый таймер для реального sync
    cancelFailsafeTimer();
    if (initialSyncCompleted && !cloud._lastClientSync) {
      // FAILSAFE fired during script loading (before any sync completed) → reset
      logCritical('🔄 [FAILSAFE] Resetting premature failsafe (fired before sync started)');
      initialSyncCompleted = false;
    }
    // Всегда запускаем sync-specific failsafe (30 сек на сам sync)
    if (!initialSyncCompleted) {
      failsafeTimerId = setTimeout(() => {
        if (!initialSyncCompleted) {
          logCritical('⚠️ [FAILSAFE] Sync timeout (30s) — enabling saves');
          initialSyncCompleted = true;
        }
      }, 30000);
    }

    // КРИТИЧЕСКАЯ ПРОВЕРКА: синхронизировать только текущего клиента
    let currentClientId = global.localStorage.getItem('heys_client_current');
    // Распарсить JSON если это строка в кавычках
    if (currentClientId) {
      try {
        currentClientId = JSON.parse(currentClientId);
      } catch (e) {
        // Уже простая строка, не JSON
      }
    }
    if (currentClientId && client_id !== currentClientId) {
      log('client bootstrap skipped (not current client)', client_id, 'current:', currentClientId);
      return;
    }

    const now = Date.now();

    // Throttling 15 секунд — баланс между нагрузкой и актуальностью данных
    // 5 сек было слишком мало — 3 компонента вызывают sync параллельно при монтировании
    const SYNC_THROTTLE_MS = 15000;
    const forceSync = options && options.force;
    if (!forceSync && typeof cloud.isSyncPaused === 'function' && cloud.isSyncPaused()) {
      return;
    }
    if (!forceSync && cloud._lastClientSync && cloud._lastClientSync.clientId === client_id && (now - cloud._lastClientSync.ts) < SYNC_THROTTLE_MS) {
      // Тихий пропуск throttled запросов
      log('sync throttled, last sync:', Math.round((now - cloud._lastClientSync.ts) / 1000), 'sec ago');
      return;
    }

    // Устанавливаем флаг что sync в процессе
    _syncInProgress = (async () => {
      try {
        const ls = global.localStorage; // 🚀 used for delta sync ts and key processing
        cloud._syncStartPerf = performance.now(); // 🚀 PERF: timing reference for fast paths

        // 🔄 Уведомляем UI что sync начинается (для показа скелетона)
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('heysSyncStarting', { detail: { clientId: client_id } }));
        }

        // � PARALLEL: Запускаем загрузку shared products ПАРАЛЛЕЛЬНО с sync (не после)
        // Они грузятся в фоне пока sync скачивает данные клиента
        let _sharedProductsPromise = null;
        const cachedSharedEarly = cloud.getCachedSharedProducts?.() || [];
        if (!cloud._sharedProductsLoaded && cachedSharedEarly.length === 0) {
          cloud._sharedProductsLoaded = true;
          _sharedProductsPromise = cloud.getAllSharedProducts({ limit: 1000, excludeBlocklist: true })
            .then(result => {
              if (result.data && result.data.length > 0) {
                logCritical(`📦 [SHARED PRODUCTS] Parallel pre-loaded ${result.data.length} products`);
              }
            })
            .catch(e => console.warn('[SHARED PRODUCTS] Parallel pre-load error:', e));
        }


        // DELTA FAST-PATH v2: check last_sync_ts IMMEDIATELY, before any other work
        // If exists - skip flush/cleanup/ensureClient/meta/PhaseA -> direct fetch
        // Saves 1.5-5 seconds (all heavy pre-work deferred after fetch)
        const lastSyncKey = `heys_${client_id}_last_sync_ts`;
        let lastSyncTs = ls.getItem(lastSyncKey);
        // Guard: localStorage.setItem(key, null) stores literal string "null"
        if (lastSyncTs === 'null') { lastSyncTs = null; try { ls.removeItem(lastSyncKey); } catch (_) { } }
        const isDeltaFastPath = !!lastSyncTs && !forceSync;
        // 🚀 PERF: Force sync also uses delta when we have lastSyncTs and initial sync is done
        // This avoids re-fetching all 679 keys on pull-to-refresh — only changed keys since last sync
        const isForceDelta = forceSync && !!lastSyncTs && initialSyncCompleted && !options?._retryFullSync;
        const skipHeavyPreWork = isDeltaFastPath || isForceDelta;
        const now = Date.now(); // needed for _lastClientSync and cloud cleanup

        if (isDeltaFastPath) {
          logCritical(`[DELTA FAST-PATH] Direct fetch, skipping all pre-work, since ${lastSyncTs}`);
        }
        if (isForceDelta) {
          logCritical(`🚀 [FORCE DELTA] Pull-refresh with delta since ${lastSyncTs} — skip heavy pre-work`);
        }

        // === PRE-WORK: flush + cleanup + ensureClient (skipped in delta fast-path & force delta) ===
        if (!skipHeavyPreWork) {
          // �🛡️ КРИТИЧНО: Перед загрузкой из облака — СНАЧАЛА отправляем pending изменения!
          // Иначе локальные изменения будут затёрты при скачивании старых данных с сервера
          // 🛡️ Перед загрузкой из облака — отправляем pending изменения
          // Иначе локальные изменения будут затёрты при скачивании старых данных с сервера
          const pendingCount = cloud.getPendingCount?.() || 0;

          // v9.4: Skip flush for fresh client syncs (no previous sync for this client)
          // Pending items are from old client or empty-data system writes (CRS=0, cascade empty)
          // They will be recomputed after real data is downloaded — flushing is wasteful
          const hasPreviousSync = cloud._lastClientSync?.clientId === client_id;
          const shouldFlush = hasPreviousSync && (pendingCount > 0 || _uploadInProgress);

          if (shouldFlush) {
            logCritical(`🔄 [SYNC] Flushing ${pendingCount} pending items (uploadInProgress: ${_uploadInProgress}) BEFORE download...`);
            const flushed = await cloud.flushPendingQueue(30000); // 🔄 v5: 30s (was 8s — too short for throttled network)
            if (!flushed) {
              if (forceSync) {
                logCritical('⚠️ [FORCE SYNC] Queue flush timeout — proceeding with extra guards');
              } else {
                logCritical('⚠️ [SYNC] Queue flush timeout — aborting download to avoid overwrite');
                return;
              }
            }
          } else if (pendingCount > 0) {
            logCritical(`⏭️ [SYNC] Skip flush for fresh client sync (${pendingCount} pending items from previous context)`);
          }

          // 🧹 Очистка невалидных продуктов перед синхронизацией (локальные)
          cloud.cleanupProducts();

          // 🧹 Очистка невалидных продуктов в ОБЛАКЕ (с дедупликацией, не чаще раз в 5 минут)
          if (!cloud._lastCloudCleanup || (now - cloud._lastCloudCleanup) > 300000) {
            cloud._lastCloudCleanup = now;
            cloud.cleanupCloudProducts().catch(e => console.warn('[CLOUD CLEANUP] Error:', e));
          }

          // Проверяем что клиент существует (без автосоздания)
          const _exists = await cloud.ensureClient(client_id);
          logCritical(`🔍 [SYNC DEBUG] ensureClient result: ${_exists}, client_id: ${client_id}`);
          if (!_exists) {
            log('client bootstrap skipped (no such client)', client_id);
            return;
          }
        } else if (isForceDelta) {
          // 🚀 Minimal flush for force delta: only if there are pending items
          const pendingCount = cloud.getPendingCount?.() || 0;
          if (pendingCount > 0) {
            logCritical(`🔄 [FORCE DELTA] Flushing ${pendingCount} pending items before delta fetch...`);
            await cloud.flushPendingQueue(5000);
          }
        }

        if (!skipHeavyPreWork) {
          // === FULL SYNC PATH: meta check + Phase A (only when no last_sync_ts) ===

          // Проверяем, действительно ли нужна синхронизация
          const { data: metaData, error: metaError } = await YandexAPI.from('client_kv_store')
            .select('k,updated_at')
            .eq('client_id', client_id)
            .order('updated_at', { ascending: false })
            .limit(5);

          logCritical(`🔍 [SYNC DEBUG] meta query result: rows=${metaData?.length}, error=${metaError?.message || 'none'}`);

          if (metaError) {
            // Graceful degradation для сетевых ошибок
            if (metaError.isNetworkFailure) {
              console.warn('[HEYS.cloud] 📴 clientSync: сеть недоступна, работаем с локальными данными');
              cloud._lastClientSync = { clientId: client_id, ts: now };
              // Помечаем sync как завершённый чтобы разблокировать сохранение
              if (!initialSyncCompleted) {
                initialSyncCompleted = true;
                logCritical('✅ [OFFLINE] Sync пропущен (сеть), локальные данные активны');
              }
              return { success: true, status: 'offline' };
            }
            err('client bootstrap meta check', metaError);
            throw new Error('Sync meta check failed: ' + (metaError.message || metaError));
          }

          // Проверяем, изменились ли данные с последней синхронизации
          // 🔄 При force=true (pull-to-refresh) — пропускаем эту проверку
          const lastSyncTime = cloud._lastClientSync?.ts || 0;
          const hasUpdates = (metaData || []).some(row =>
            new Date(row.updated_at).getTime() > lastSyncTime
          );

          logCritical(`🔍 [SYNC DEBUG] hasUpdates=${hasUpdates}, forceSync=${forceSync}, lastSyncTime=${lastSyncTime}, lastClientId=${cloud._lastClientSync?.clientId}`);

          if (!forceSync && !hasUpdates && cloud._lastClientSync?.clientId === client_id) {
            log('client bootstrap skipped (no updates)', client_id);
            cloud._lastClientSync.ts = now; // Обновляем timestamp для throttling
            return { success: true, status: 'no-changes', keys: 0, skipped: true };
          }

          if (forceSync) {
            log('🔄 [FORCE SYNC] Pull-to-refresh — загружаем данные принудительно');
          }

          // 🚀 ФАЗА A: Быстрая загрузка 5 критичных ключей — разблокируем UI не дожидаясь полного sync
          // Выполняется только при первой синхронизации (initialSyncCompleted === false)
          if (!initialSyncCompleted) {
            try {
              const today = new Date().toISOString().slice(0, 10);
              const criticalBaseKeys = [
                'heys_profile', 'heys_norms', 'heys_products',
                'heys_hr_zones', `heys_dayv2_${today}`,
                // Stage 2 expansion: настройки UI которые нужны до первого рендера —
                // toggle советов / звука / прочитанные подсказки. Один RPC, тот же
                // round-trip, не добавляет latency. Закрывает race когда тосты вылезали
                // с дефолтным toastsEnabled=true до прихода реального флага из cloud.
                'heys_advice_settings', 'heys_advice_read_today'
              ];
              const criticalScopedKeys = criticalBaseKeys.map(bk => `heys_${client_id}_${bk.slice('heys_'.length)}`);
              const allCriticalKeys = [...criticalBaseKeys, ...criticalScopedKeys];

              const { data: phaseAData, error: phaseAError } = await YandexAPI.from('client_kv_store')
                .select('k,v,updated_at')
                .eq('client_id', client_id)
                .in('k', allCriticalKeys);

              if (!phaseAError && phaseAData && phaseAData.length > 0) {
                muteMirror = true;
                const lsPhaseA = global.localStorage;
                phaseAData.forEach(row => {
                  if (row.v == null) return;
                  const pKey = scopeKeyForClientStorage(row.k, client_id);
                  const normalizedSyncKey = normalizeKeyForSupabase(row.k, client_id);
                  // 🛡️ v65 FIX: skip foreign-scoped keys in Phase A too
                  if (isForeignClientScopedKey(pKey, client_id)) return;
                  // 🛡️ P2: write-time isolation guard
                  if (!assertSyncWriteOwnership(pKey, client_id, 'phase-a')) return;
                  if (normalizedSyncKey && cloud.getSyncStatus(normalizedSyncKey) === 'pending') {
                    logCritical(`🛡️ [PHASE A] Skip pending local mutation for ${normalizedSyncKey}`);
                    return;
                  }
                  // 🛡️ Anti-empty-profile guard: симметрично с saveClientKey (~9893).
                  // Если cloud row для profile-ключа пустой объект, а local LS уже
                  // содержит валидный профиль — не клобберим. Cloud мог отдать {}
                  // из-за past corruption / partial state; local здесь авторитетен.
                  const isProfileKey = row.k === 'heys_profile' || /^heys_[0-9a-f-]+_profile$/i.test(row.k || '');
                  if (isProfileKey) {
                    const v = row.v;
                    const isValidCloudProfile = v && typeof v === 'object' &&
                      (v.age || v.weight || v.height || v.firstName || v.profileCompleted === true);
                    if (!isValidCloudProfile) {
                      try {
                        const existingRaw = lsPhaseA.getItem(pKey);
                        if (existingRaw) {
                          const decompressFn = global.HEYS?.store?.decompress;
                          const existing = decompressFn ? decompressFn(existingRaw) : JSON.parse(existingRaw);
                          if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) {
                            logCritical(`🛡️ [PHASE A] BLOCKED empty profile from cloud (${pKey}); local has ${Object.keys(existing).length} fields`);
                            return;
                          }
                        }
                      } catch (_) { /* fall through — пишем как есть */ }
                    }
                  }
                  try { lsPhaseA.setItem(pKey, JSON.stringify(row.v)); } catch (_) { }
                });
                muteMirror = false;

                // 🔓 Разблокируем UI — критичные данные готовы
                initialSyncCompleted = true;
                cloud._syncCompletedAt = Date.now(); // ⏱️ Grace period: не пере-загружаем products
                cloud._productsFingerprint = null; // 🔄 Delta-sync: сбрасываем чтобы первый реальный изменение прошло
                cancelFailsafeTimer();
                if (global.HEYS?.store?.flushMemory) global.HEYS.store.flushMemory();
                // 🆕 PERF v9.2: Фаза A завершена — первый sync done
                window.__heysPerfMark && window.__heysPerfMark('heysSyncCompleted: phaseA dispatch');
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                  window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
                    detail: { clientId: client_id, phaseA: true }
                  }));
                }
                console.info(`[HEYS.sync] ✅ Фаза A: ${phaseAData.length} критичных ключей загружено, UI разблокирован`);
              }
            } catch (phaseAErr) {
              muteMirror = false;
              console.warn('[HEYS.sync] ⚠️ Фаза A не удалась, продолжаем полный sync:', phaseAErr?.message || phaseAErr);
            }
          }
        } // end if (!skipHeavyPreWork) — full sync path

        // Теперь загружаем полные данные только если есть обновления
        // 🚀 Delta Sync: если есть last_sync_ts — загружаем только изменения
        // 🚀 PERF: Force sync also uses delta — fetches only changed keys since last sync
        const deltaSince = lastSyncTs || null;
        const isDeltaSync = !!deltaSince;

        if (isDeltaSync) {
          logCritical(`🚀 [DELTA SYNC] Loading only changes since ${deltaSince}`);
        }

        // 📦 PAGINATED FETCH — YC API Gateway limit ~3.5MB per response
        // Для некоторых клиентов 350 записей с большими JSON уже дают 502,
        // поэтому держим более консервативный размер страницы.
        // Загружаем порциями по 250 записей, чтобы оставить запас по размеру ответа.
        // 🚀 Delta Sync: при наличии since — фильтруем по updated_at на сервере
        log('🔄 [CLIENT_SYNC] Loading data for client (paginated):', client_id);
        const PAGE_SIZE = 250;
        let allData = [];
        let pageOffset = 0;
        let fetchError = null;
        let paginatedFetchPages = 0;

        // 🚀 SPECULATIVE PREFETCH: check if HTML-time prefetch matches current request
        // If prefetch was fired at +0.0s and matches clientId+since → reuse data, save ~1s
        let usedPrefetch = false;
        if (isDeltaSync && typeof window !== 'undefined' && window.__heysPrefetch
          && window.__heysPrefetch.clientId === client_id
          && window.__heysPrefetch.since === deltaSince) {
          try {
            const prefetchResult = await window.__heysPrefetch.promise;
            if (prefetchResult && prefetchResult.ok && Array.isArray(prefetchResult.data)) {
              allData = prefetchResult.data;
              usedPrefetch = true;
              logCritical(`🚀 [PREFETCH HIT] Used pre-fetched delta data: ${allData.length} keys (saved ~1s)`);
            } else {
              logCritical(`⚠️ [PREFETCH MISS] Prefetch failed: ${prefetchResult?.error || 'unknown'}, falling back`);
            }
          } catch (e) {
            logCritical(`⚠️ [PREFETCH MISS] Error: ${e.message}, falling back`);
          }
          window.__heysPrefetch = null; // clear to prevent reuse
        }

        if (!usedPrefetch) {
          // Helper: одна страница + per-page retry на 502 (та же логика что и раньше).
          // ORDER BY k.asc обеспечивает детерминированный mapping offset→row при
          // параллельных запросах (PG без ORDER BY не гарантирует стабильность).
          const fetchPage = async (offset) => {
            const filters = { 'eq.client_id': client_id };
            if (deltaSince) filters['gt.updated_at'] = deltaSince;
            const reqOpts = {
              select: 'k,v,updated_at',
              filters,
              order: 'k.asc',
              limit: PAGE_SIZE,
              offset
            };
            let res = await YandexAPI.rest('client_kv_store', reqOpts);
            // 🔧 v63 FIX #10: per-page retry — single retry after 2s on server error.
            if (res.error && !res.error.isNetworkFailure) {
              logCritical(`⚠️ [SYNC] Page offset=${offset} failed: ${res.error.message}, retrying in 2s`);
              await new Promise(r => setTimeout(r, 2000));
              res = await YandexAPI.rest('client_kv_store', reqOpts);
            }
            return res;
          };

          // 🚀 Stage 2: параллельная пагинация. Раньше 4 страницы по ~250 записей
          // тянулись последовательно (4 RTT). Теперь:
          //   1) Первая страница sequential — отделяет «маленьких» клиентов
          //      (1 страница) от «больших» без лишних запросов.
          //   2) Если первая страница full — fan-out по FAN_OUT страниц параллельно.
          //   3) Останавливаемся на первой неполной странице или ошибке.
          // Для 778 записей это 1 + 1 = 2 RTT вместо 4. Под VPN ~−1с к full sync.
          const FAN_OUT = 4;
          const firstRes = await fetchPage(0);
          if (firstRes.error) {
            fetchError = firstRes.error;
          } else {
            const firstRows = firstRes.data || [];
            allData = allData.concat(firstRows);
            paginatedFetchPages += 1;
            if (isDebugSync()) {
              logCritical(`🔍 [SYNC PAGINATED] page offset=0, rows=${firstRows.length}, total=${allData.length}`);
            }
            if (firstRows.length >= PAGE_SIZE) {
              let nextOffset = PAGE_SIZE;
              let done = false;
              while (!done) {
                const offsets = [];
                for (let i = 0; i < FAN_OUT; i++) offsets.push(nextOffset + i * PAGE_SIZE);
                const results = await Promise.all(offsets.map(fetchPage));
                for (let i = 0; i < results.length; i++) {
                  const r = results[i];
                  if (r.error) {
                    fetchError = r.error;
                    done = true;
                    break;
                  }
                  const rows = r.data || [];
                  allData = allData.concat(rows);
                  paginatedFetchPages += 1;
                  if (isDebugSync()) {
                    logCritical(`🔍 [SYNC PAGINATED] page offset=${offsets[i]}, rows=${rows.length}, total=${allData.length}`);
                  }
                  // Останавливаемся на первой неполной странице.
                  // Остальные параллельные запросы из этой пачки уже отработали —
                  // их данные могут быть лишними (если там были записи), но не теряются:
                  // сервер вернул, мы их concat'нули, просто следующая итерация не пойдёт.
                  if (rows.length < PAGE_SIZE) {
                    done = true;
                    break;
                  }
                }
                if (!done) nextOffset += FAN_OUT * PAGE_SIZE;
              }
            }
          }
        }

        if (!usedPrefetch && (paginatedFetchPages > 1 || isDebugSync())) {
          logCritical(`🔍 [SYNC PAGINATED] fetched ${paginatedFetchPages} page(s), total=${allData.length}${isDeltaSync ? ' (DELTA)' : ' (FULL)'}`);
        }

        const data = allData;
        const error = fetchError;

        logCritical(`🔍 [SYNC DEBUG] main data query: rows=${data?.length}, error=${error?.message || 'none'}, isNetworkFailure=${error?.isNetworkFailure}${isDeltaSync ? ' (DELTA)' : ' (FULL)'}`);

        if (error) {
          // Graceful degradation
          if (error.isNetworkFailure) {
            console.warn('[HEYS.cloud] 📴 clientSync data: сеть недоступна');
            cloud._lastClientSync = { clientId: client_id, ts: now };
            if (!initialSyncCompleted) {
              initialSyncCompleted = true;
              logCritical('✅ [OFFLINE] Sync пропущен (сеть), локальные данные активны');
            }
            return { success: true, status: 'offline' };
          }
          err('client bootstrap select', error);
          throw new Error('Sync data fetch failed: ' + (error.message || error));
        }

        // ════════════════════════════════════════════════════════════════
        // 🚀 FORCE DELTA ZERO-CHANGE: No keys changed since last sync
        // Pull-to-refresh completes in ~200ms instead of ~4000ms
        // ════════════════════════════════════════════════════════════════
        const deltaKeyCount = data?.length || 0;
        const _forceDeltaFetchDone = performance.now(); // timing reference for fast paths
        if (isForceDelta && deltaKeyCount === 0) {
          // 🔧 v68 FIX: Если delta вернул 0 записей, проверяем есть ли
          // данные клиента в localStorage. Если нет (например, после switchClient
          // который очистил ключи старого клиента) — fallback на полный sync.
          const clientPrefix = 'heys_' + client_id + '_';
          let hasClientData = false;
          for (let _ci = 0; _ci < ls.length; _ci++) {
            const _ck = ls.key(_ci);
            if (_ck && _ck.startsWith(clientPrefix) && _ck.includes('dayv2_')) {
              hasClientData = true;
              break;
            }
          }
          if (!hasClientData) {
            logCritical('⚠️ [FORCE DELTA] 0 changes but no client data in localStorage — clearing lastSyncTs for full re-sync');
            try { ls.removeItem(lastSyncKey); } catch (_) { }
            // Recursive call with fresh state — will take full sync path
            return cloud.bootstrapClientSync(client_id, { ...options, _retryFullSync: true });
          }

          muteMirror = false;
          cloud._lastClientSync = { clientId: client_id, ts: now };
          cloud._syncCompletedAt = Date.now();

          try { ls.setItem(lastSyncKey, new Date().toISOString()); } catch (_) { }

          if (global.HEYS?.store?.flushMemory) global.HEYS.store.flushMemory();

          const zeroDuration = Math.round(_forceDeltaFetchDone - (cloud._syncStartPerf || _forceDeltaFetchDone));
          logCritical(`✅ [FORCE DELTA] No changes since last sync — done in ${zeroDuration}ms`);

          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
              detail: { clientId: client_id, phase: 'full', forceDelta: true, keys: 0 }
            }));
          }

          // Shared products: fire and forget
          if (_sharedProductsPromise) {
            _sharedProductsPromise.catch(() => { });
            _sharedProductsPromise = null;
          }

          return { success: true, status: 'no-changes', keys: 0, durationMs: zeroDuration, forceDelta: true };
        }

        // ════════════════════════════════════════════════════════════════
        // 🚀 DELTA LIGHT PATH: при delta sync с <= 10 ключами — пропускаем
        // ВСЮ тяжёлую обработку (dedup, diagnostics, cleanup, deleted sync).
        // Сохраняет ~0.8s из post-fetch processing.
        // ════════════════════════════════════════════════════════════════
        if (isDeltaSync && deltaKeyCount <= 10 && !forceSync) {
          const lightStart = performance.now();
          logCritical(`🚀 [DELTA LIGHT] ${deltaKeyCount} keys — fast processing, skip heavy ops`);

          // Простая запись в LS без dedup/merge (delta не даёт дубликатов)
          muteMirror = true;
          const lightCloudGarbage = createCloudGarbageCollector();
          let lightKeysWritten = 0;
          const lightSyncedKeys = [];
          let lightRows = mergeProductsRpcTailRawClientRows(Array.isArray(data) ? data.slice() : [], client_id);
          lightRows = mergeOverlayRpcTailRawClientRows(lightRows, client_id);
          lightRows.forEach(row => {
            try {
              if (isSensitiveSessionStorageKey(row?.k)) {
                recordCloudGarbageCandidate(lightCloudGarbage, 'sensitive', row.k);
                return;
              }
              const key = scopeKeyForClientStorage(row.k, client_id);
              const normalizedSyncKey = normalizeKeyForSupabase(row.k, client_id);
              if (isForeignClientScopedKey(key, client_id)) {
                recordCloudGarbageCandidate(lightCloudGarbage, 'foreign', row.k);
                return;
              }
              // 🛡️ P2: write-time isolation guard
              if (!assertSyncWriteOwnership(key, client_id, 'delta-light')) return;
              if (normalizedSyncKey && cloud.getSyncStatus(normalizedSyncKey) === 'pending') {
                logCritical(`🛡️ [DELTA LIGHT] Skip pending local mutation for ${normalizedSyncKey}`);
                return;
              }

              const __decompDelta = decompressCloudRowValue(row.v, row.k);
              if (!__decompDelta.ok) {
                return; // skip this row — would write garbage to localStorage
              }
              let valueToStore = __decompDelta.value;
              // Пропускаем null dayv2
              if (key.includes('dayv2_') && (valueToStore == null || valueToStore === 'null')) return;

              // 🛡️ Anti-empty-profile guard (симметрично с Phase A ~6410 и saveClientKey ~9893):
              // если cloud отдал {} для profile-ключа, а local LS уже содержит валидный
              // профиль — не клобберим.
              const isProfileKey = row.k === 'heys_profile' || /^heys_[0-9a-f-]+_profile$/i.test(row.k || '');
              if (isProfileKey) {
                const isValidCloudProfile = valueToStore && typeof valueToStore === 'object' &&
                  (valueToStore.age || valueToStore.weight || valueToStore.height ||
                   valueToStore.firstName || valueToStore.profileCompleted === true);
                if (!isValidCloudProfile) {
                  try {
                    const existingRaw = ls.getItem(key);
                    if (existingRaw) {
                      const decompressFn = global.HEYS?.store?.decompress;
                      const existing = decompressFn ? decompressFn(existingRaw) : JSON.parse(existingRaw);
                      if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) {
                        logCritical(`🛡️ [DELTA LIGHT] BLOCKED empty profile from cloud (${key}); local has ${Object.keys(existing).length} fields`);
                        return;
                      }
                    }
                  } catch (_) { /* fall through */ }
                }
              }

              ls.setItem(key, JSON.stringify(valueToStore));
              logProductsCloudWrite('delta-light', key, valueToStore);
              lightSyncedKeys.push(row.k);
              lightKeysWritten++;
            } catch (_) { }
          });
          muteMirror = false;
          scheduleCloudGarbageCleanup(client_id, lightCloudGarbage, 'delta-light');

          // Инвалидируем кэш
          if (global.HEYS?.store?.invalidate && lightSyncedKeys.length > 0) {
            lightSyncedKeys.forEach(k => global.HEYS.store.invalidate(k));
          }
          if (global.HEYS?.store?.flushMemory) global.HEYS.store.flushMemory();

          // Отмечаем sync как завершённый
          if (!initialSyncCompleted) {
            initialSyncCompleted = true;
            cancelFailsafeTimer();
          }
          cloud._lastClientSync = { clientId: client_id, ts: now };
          cloud._syncCompletedAt = Date.now();
          cloud._productsFingerprint = null;

          // Сохраняем timestamp для следующего delta sync
          try { ls.setItem(`heys_${client_id}_last_sync_ts`, new Date().toISOString()); } catch (_) { }

          const lightDuration = Math.round(performance.now() - lightStart);
          logCritical(`✅ [DELTA LIGHT DONE] client=${client_id.slice(0, 8)} keys=${lightKeysWritten} ms=${lightDuration}`);

          // Уведомляем UI НЕМЕДЛЕННО (без 300ms задержки)
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('heysSyncCompleted', { detail: { clientId: client_id, loaded: lightKeysWritten, viaYandex: true, phase: 'full' } }));
          }

          // Shared products: НЕ ждём — fire and forget
          // Cleanup, diagnostics, deleted sync — defer на 3s
          setTimeout(() => {
            try { maybeCleanupDuplicateKeys(); } catch (_) { }
            if (isDeltaFastPath) {
              try { cloud.cleanupProducts(); } catch (_) { }
            }
          }, 3000);

          // 🧹 Deleted products sync — defer на 5s
          setTimeout(() => {
            if (global.HEYS?.deletedProducts?.exportForSync) {
              try {
                const deletedListKey = `heys_${client_id}_deleted_products`;
                YandexAPI.from('client_kv_store')
                  .select('v')
                  .eq('client_id', client_id)
                  .eq('k', deletedListKey)
                  .then(({ data: cloudDeleted }) => {
                    const deletedRow = Array.isArray(cloudDeleted) ? cloudDeleted[0] : cloudDeleted;
                    if (deletedRow?.v) {
                      global.HEYS.deletedProducts.importFromSync(deletedRow.v);
                    }
                    const localExport = global.HEYS.deletedProducts.exportForSync();
                    if (Object.keys(localExport.entries).length > 0) {
                      clientUpsertQueue.push({
                        client_id: client_id,
                        k: deletedListKey,
                        v: localExport,
                        updated_at: new Date().toISOString()
                      });
                      scheduleClientPush();
                    }
                  }).catch(() => { });
              } catch (_) { }
            }
          }, 5000);

          _syncInProgress = null;
          return { success: true, status: 'updated', keys: lightKeysWritten, durationMs: lightDuration, deltaLight: true }; // 🚀 Early return
        }
        // ════════════════════════════════════════════════════════════════

        // Компактная статистика вместо 81 строки логов
        const stats = { DAY: 0, PRODUCTS: 0, PROFILE: 0, NORMS: 0, OTHER: 0 };
        (data || []).forEach(row => {
          if (row.k === 'heys_products') stats.PRODUCTS++;
          else if (row.k.includes('dayv2_')) stats.DAY++;
          else if (row.k.includes('_profile')) stats.PROFILE++;
          else if (row.k.includes('_norms')) stats.NORMS++;
          else stats.OTHER++;
        });
        const summary = Object.entries(stats).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(', ');
        log(`✅ [CLIENT_SYNC] Loaded ${data?.length || 0} keys (${summary})`);

        // ⏱️ TIMING: засекаем время обработки
        const syncStartTime = performance.now();

        const isSyncDetailLogsEnabled = () =>
          global.__heysLogControl?.isEnabled?.('sync-detail') === true ||
          global.localStorage.getItem('heys_debug_sync') === 'true';
        const extractDayv2Date = (value) => {
          const match = String(value || '').match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
          return match ? match[1] : null;
        };
        const isDayv2MetaKey = (value) => /(^|_)dayv2_date$/.test(String(value || ''));
        const uniqSorted = (values) => Array.from(new Set((values || []).filter(Boolean))).sort();
        const formatListForSyncLog = (values, options = {}) => {
          const items = Array.isArray(values) ? values.filter(Boolean) : [];
          const maxItems = options.maxItems || 8;
          if (items.length === 0) return '(empty)';
          if (isSyncDetailLogsEnabled() || items.length <= maxItems) return items.join(', ');
          const headCount = Math.max(1, Math.floor(maxItems / 2));
          const tailCount = Math.max(1, maxItems - headCount);
          return `${items.slice(0, headCount).join(', ')}, …, ${items.slice(-tailCount).join(', ')}`;
        };

        muteMirror = true;
        // ❌ КРИТИЧНО: НЕ ОЧИЩАЕМ ВСЁ ПРОСТРАНСТВО КЛИЕНТА
        // clearNamespace стирал все локальные данные, включая продукты!
        // Теперь просто перезаписываем только те ключи, что пришли с сервера

        let dataForDedup = mergeProductsRpcTailRawClientRows(Array.isArray(data) ? data.slice() : [], client_id);
        dataForDedup = mergeOverlayRpcTailRawClientRows(dataForDedup, client_id);

        // 🔄 ФАЗ 1: ДЕДУПЛИКАЦИЯ — если несколько ключей в БД превращаются в один scoped key,
        // берём самый свежий по updated_at (поле БД, не JSON)
        const keyGroups = new Map(); // scopedKey → [{ row, updated_at_ts }]
        const fullSyncCloudGarbage = createCloudGarbageCollector();
        /** Сколько inbound-строк отфильтровано до группировки (диагностика «dayv2 после дедупа (0)»). */
        const dedupIngress = { sensitive: 0, foreign: 0, doubleScoped: 0, quoted: 0, accepted: 0 };

        dataForDedup.forEach(row => {
          if (isSensitiveSessionStorageKey(row?.k)) {
            dedupIngress.sensitive++;
            recordCloudGarbageCandidate(fullSyncCloudGarbage, 'sensitive', row.k);
            return;
          }
          let key = scopeKeyForClientStorage(row.k, client_id);

          if (isForeignClientScopedKey(key, client_id)) {
            dedupIngress.foreign++;
            recordCloudGarbageCandidate(fullSyncCloudGarbage, 'foreign', row.k);
            return;
          }

          // 🔒 ФИЛЬТРАЦИЯ: пропускаем проблемные ключи
          // 1. Ключи с двумя или более ВЛОЖЕННЫМИ client-scope префиксами
          //    (баг двойного clientId: heys_uuid1_uuid2_dayv2_...) — но НЕ ключи
          //    с UUID в суффиксе (last_grams_<productId>, insights_feedback_<clientId>, xp_cache)
          const { strippedClientIds: _nestedScopes } = stripClientScopePrefixes(row.k);
          if (_nestedScopes.length >= 2) {
            dedupIngress.doubleScoped++;
            recordCloudGarbageCandidate(fullSyncCloudGarbage, 'doubleScoped', row.k);
            return;
          }

          // 2. Ключи с кавычками в имени (баг сериализации)
          if (key.includes('"')) {
            dedupIngress.quoted++;
            recordCloudGarbageCandidate(fullSyncCloudGarbage, 'quoted', row.k);
            return;
          }

          // Группируем по scoped key
          dedupIngress.accepted++;
          if (!keyGroups.has(key)) {
            keyGroups.set(key, []);
          }
          // Парсим updated_at в timestamp для сравнения
          const ts = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          keyGroups.get(key).push({ row, updated_at_ts: ts, originalKey: row.k });
        });

        scheduleCloudGarbageCleanup(client_id, fullSyncCloudGarbage, 'full-sync');

        // Для каждой группы выбираем самый свежий по updated_at
        /**
         * Count valid products by name in a stored value.
         * @param {Array<Object>|any} value
         * @returns {number}
         */
        const getValidProductsCount = (value) => {
          if (!Array.isArray(value)) return 0;
          let count = 0;
          for (const p of value) {
            if (p && typeof p.name === 'string' && p.name.trim().length > 0) count++;
          }
          return count;
        };

        /**
         * Choose the best products row among duplicates by size, then by updated_at.
         * @param {Array<Object>} group
         * @param {string} scopedKey
         * @returns {Object}
         */
        const chooseBestProductsRow = (group, scopedKey) => {
          const scored = group.map(item => ({
            ...item,
            productsCount: getValidProductsCount(item?.row?.v)
          }));
          const maxCount = Math.max(...scored.map(item => item.productsCount));
          const hasLarge = maxCount > 1;
          const hasTiny = scored.some(item => item.productsCount <= 1);

          let candidates = scored;
          if (hasLarge) {
            candidates = scored.filter(item => item.productsCount === maxCount);
          }

          candidates.sort((a, b) => b.updated_at_ts - a.updated_at_ts);
          const winner = candidates[0];

          if (hasLarge && hasTiny) {
            const sizes = scored.map(item => `${item.originalKey}(${item.productsCount})`).join(', ');
            logCritical(`🛡️ [DEDUP PRODUCTS] ${scopedKey}: chose ${winner.originalKey}(${winner.productsCount}) over tiny versions: ${sizes}`);
          }

          return winner;
        };

        const chooseBestDayRow = (group, scopedKey) => {
          const scored = group.map(item => ({
            ...item,
            dayStats: getDayDataSyncScore(item?.row?.v)
          }));

          const latestByUpdatedAt = [...scored].sort((a, b) => b.updated_at_ts - a.updated_at_ts)[0];
          scored.sort((a, b) => {
            if (b.dayStats.score !== a.dayStats.score) return b.dayStats.score - a.dayStats.score;
            return b.updated_at_ts - a.updated_at_ts;
          });

          const winner = scored[0];

          if (winner && latestByUpdatedAt && winner.originalKey !== latestByUpdatedAt.originalKey && winner.dayStats.score > latestByUpdatedAt.dayStats.score) {
            logCritical(
              `🛡️ [DEDUP DAYV2] ${scopedKey}: chose richer '${winner.originalKey}' ` +
              `(${winner.dayStats.totalItems} items, kcal=${winner.dayStats.savedEatenKcal}) over newer '${latestByUpdatedAt.originalKey}' ` +
              `(${latestByUpdatedAt.dayStats.totalItems} items, kcal=${latestByUpdatedAt.dayStats.savedEatenKcal})`
            );
          }

          return winner;
        };

        // Для каждой группы выбираем самый свежий по updated_at
        const deduped = [];
        let dayv2DedupDropped = [];
        keyGroups.forEach((group, scopedKey) => {
          // 🔍 DEBUG: Логируем products ключи
          if (scopedKey.includes('_products') && !scopedKey.includes('_backup')) {
            logCritical(`📦 [DEDUP PRODUCTS] scopedKey: "${scopedKey}" has ${group.length} versions: ${group.map(g => `"${g.originalKey}" (${Array.isArray(g.row.v) ? g.row.v.length : 'not array'})`).join(', ')}`);
          }

          if (group.length === 1) {
            deduped.push({ scopedKey, row: group[0].row });
          } else {
            if (scopedKey.includes('_products') && !scopedKey.includes('_backup')) {
              const winner = chooseBestProductsRow(group, scopedKey);
              const loser = group.find(item => item !== winner) || group[0];
              logCritical(`🔀 [DEDUP] Key '${scopedKey}' has ${group.length} versions in DB. Using '${winner.originalKey}' (${new Date(winner.updated_at_ts).toISOString()}) over '${loser.originalKey}' (${new Date(loser.updated_at_ts).toISOString()})`);
              deduped.push({ scopedKey, row: winner.row });
            } else if (scopedKey.includes('dayv2_') && !isDayv2MetaKey(scopedKey)) {
              const winner = chooseBestDayRow(group, scopedKey);
              const losers = group
                .filter(item => item.originalKey !== winner.originalKey)
                .sort((a, b) => b.updated_at_ts - a.updated_at_ts);
              const loser = losers[0] || group[0];
              logCritical(`🔀 [DEDUP] Key '${scopedKey}' has ${group.length} versions in DB. Using '${winner.originalKey}' (${new Date(winner.updated_at_ts).toISOString()}) over '${loser.originalKey}' (${new Date(loser.updated_at_ts).toISOString()})`);
              deduped.push({ scopedKey, row: winner.row });
              const droppedDate = extractDayv2Date(scopedKey);
              if (droppedDate) dayv2DedupDropped.push(droppedDate);
            } else {
              // Сортируем по updated_at DESC и берём первый (самый свежий)
              group.sort((a, b) => b.updated_at_ts - a.updated_at_ts);
              const winner = group[0];
              const loser = group[1];
              logCritical(`🔀 [DEDUP] Key '${scopedKey}' has ${group.length} versions in DB. Using '${winner.originalKey}' (${new Date(winner.updated_at_ts).toISOString()}) over '${loser.originalKey}' (${new Date(loser.updated_at_ts).toISOString()})`);
              deduped.push({ scopedKey, row: winner.row });
              // Трекаем отброшенные dayv2 дубли для [HEYS.sinhron]
              if (scopedKey.includes('dayv2_') && !isDayv2MetaKey(scopedKey)) {
                const droppedDate = extractDayv2Date(scopedKey);
                if (droppedDate) dayv2DedupDropped.push(droppedDate);
              }
            }
          }
        });

        if (dayv2DedupDropped.length > 0) {
          const uniqueDroppedDays = uniqSorted(dayv2DedupDropped);
          window.console.warn('[HEYS.sinhron] 🔀 dayv2 дедупликация: ' + uniqueDroppedDays.length + ' дублей отброшено:', formatListForSyncLog(uniqueDroppedDays));
        }
        const dayv2AfterDedup = uniqSorted(deduped
          .filter(d => d.scopedKey.includes('dayv2_') && !isDayv2MetaKey(d.scopedKey))
          .map(d => extractDayv2Date(d.scopedKey)));

        let dayv2ScopedGroups = 0;
        keyGroups.forEach((_, scopedKey) => {
          if (scopedKey.includes('dayv2_') && !isDayv2MetaKey(scopedKey) && extractDayv2Date(scopedKey)) {
            dayv2ScopedGroups++;
          }
        });
        let rawDayRowsInPayload = 0;
        for (let _ri = 0; _ri < dataForDedup.length; _ri++) {
          const _scoped = scopeKeyForClientStorage(dataForDedup[_ri]?.k, client_id);
          if (!_scoped.includes('dayv2_') || isDayv2MetaKey(_scoped)) continue;
          if (extractDayv2Date(_scoped)) rawDayRowsInPayload++;
        }

        if (dayv2AfterDedup.length === 0) {
          if (dataForDedup.length === 0) {
            window.console.info('[HEYS.sinhron] 📦 dayv2 после дедупа (0): (empty) — inbound 0 rows (light/no-op sync)');
          } else if (rawDayRowsInPayload === 0) {
            window.console.info(
              '[HEYS.sinhron] 📦 dayv2 после дедупа (0): (empty) — нет dayv2-ключей с датой во входе (rows=' +
                dataForDedup.length +
                ', coarseDayLikeRows=' +
                stats.DAY +
                ')'
            );
          } else {
            window.console.warn('[HEYS.sinhron] ⚠️ dayv2 после дедупа (0) при rawDayRowsInPayload>0 — проверьте foreign/doubleScoped/ingress', {
              clientId: String(client_id || '').slice(0, 8),
              dbRows: data?.length || 0,
              mergedRows: dataForDedup.length,
              coarseDayLikeRows: stats.DAY,
              rawDayRowsInPayload,
              dayv2ScopedGroups,
              dedupedRows: deduped.length,
              ingressSkips: {
                sensitive: dedupIngress.sensitive,
                foreign: dedupIngress.foreign,
                doubleScoped: dedupIngress.doubleScoped,
                quoted: dedupIngress.quoted,
                accepted: dedupIngress.accepted
              },
              cloudGarbage: {
                foreign: fullSyncCloudGarbage.foreign.size,
                doubleScoped: fullSyncCloudGarbage.doubleScoped.size,
                quoted: fullSyncCloudGarbage.quoted.size,
                sensitive: fullSyncCloudGarbage.sensitive.size
              },
              detailLogs: isSyncDetailLogsEnabled() ? 'on (heys_debug_sync / __heysLogControl)' : 'off'
            });
          }
        } else {
          window.console.info('[HEYS.sinhron] 📦 dayv2 после дедупа (' + dayv2AfterDedup.length + '):', formatListForSyncLog(dayv2AfterDedup));
        }

        deduped.sort((a, b) => {
          const aDate = getDateFromDayKey(a.scopedKey);
          const bDate = getDateFromDayKey(b.scopedKey);
          const aHasDate = aDate instanceof Date && !Number.isNaN(aDate.getTime());
          const bHasDate = bDate instanceof Date && !Number.isNaN(bDate.getTime());
          if (aHasDate && bHasDate) return bDate.getTime() - aDate.getTime();
          if (aHasDate) return 1;
          if (bHasDate) return -1;
          return String(a.scopedKey || '').localeCompare(String(b.scopedKey || ''));
        });

        const dedupedForPhase2 = mergeOverlayRpcTailDeduped(
          mergeProductsRpcTailDeduped(deduped, client_id),
          client_id
        );

        log(`📊 [DEDUP] ${data?.length || 0} DB keys → ${dedupedForPhase2.length} unique scoped keys`);

        // ⏱️ TIMING: Отслеживаем время обработки 
        let keyProcessingStart = performance.now();
        let keysProcessed = 0;
        let productsUpdated = false;
        let latestProducts = null;
        // 🆕 v5.0: Snapshot of products BEFORE applying cloud-sync.
        // Used by UI to cascade historical MealItems updates correctly.
        let previousProducts = null;
        // 🚀 PERF: Collect dayv2 writes and dispatch ONE event after loop
        const batchedDayV2Writes = [];
        const forceWrittenDayV2 = [];
        const forceWrittenDates = []; // 🚀 PERF: Collect dates for batch event dispatch
        const skippedDayMirrorKeys = [];

        // 🔄 ФАЗ 2: ОБРАБОТКА дедуплицированных ключей
        // ⚡ PERF R23: Chunked processing — yield to browser every 20 keys
        // Prevents 90+ consecutive long tasks from React scheduler during heavy sync
        const SYNC_DEDUP_CHUNK = 20;
        for (let _ci = 0; _ci < dedupedForPhase2.length; _ci += SYNC_DEDUP_CHUNK) {
          if (_ci > 0) await new Promise(r => setTimeout(r, 0));
          const _chunk = dedupedForPhase2.slice(_ci, Math.min(_ci + SYNC_DEDUP_CHUNK, dedupedForPhase2.length));
          _chunk.forEach(({ scopedKey, row }) => {
            try {
              let key = scopedKey;

              // 🛡️ P2: write-time isolation guard — covers ALL full-sync write branches
              if (!assertSyncWriteOwnership(key, client_id, 'full-sync')) return;

              //  FIX 2025-12-26: Декомпрессируем row.v если это сжатая строка
              // Данные в БД могут быть сохранены как сжатые строки "¤Z¤[{..." — нужно декодировать
              const Store = global.HEYS?.store;
              if (typeof row.v === 'string' && row.v.startsWith('¤Z¤')) {
                try {
                  if (Store && typeof Store.decompress === 'function') {
                    row.v = Store.decompress(row.v);
                  }
                } catch (decompErr) {
                  logCritical(`⚠️ [DECOMPRESS] Failed for ${key}: ${decompErr.message}`);
                }
              }

              // Конфликт: сравнить версии и объединить если нужно
              let local = null;
              try { local = JSON.parse(ls.getItem(key)); } catch (e) { }

              // Для данных дня используем MERGE вместо "last write wins"
              if (key.includes('dayv2_')) {
                // �️ v64 FIX: НЕ записываем null/undefined из cloud
                if (row.v == null || row.v === 'null') {
                  logCritical(`🛡️ [BOOTSTRAP PHASE2] SKIP NULL dayv2: ${key}`);
                  return; // skip — null data corrupts getDayData
                }

                const backupResolution = maybeRestoreDayV2FromBackup(key, row.v, 'bootstrap-phase2');
                if (backupResolution.restored) {
                  row.v = backupResolution.value;
                  clientUpsertQueue.push({
                    client_id: client_id,
                    k: normalizeKeyForSupabase(row.k, client_id),
                    v: row.v,
                    updated_at: new Date().toISOString()
                  });
                  scheduleClientPush();
                }

                // �🔒 КРИТИЧНО: Перечитываем localStorage свежим для dayv2!
                // Проблема: `local` был прочитан в начале цикла, а store.set() мог записать позже
                try { local = JSON.parse(ls.getItem(key)); } catch (e) { local = null; }

                // 🔒 КРИТИЧНО: Проверка на блокировку cloud sync во время локального редактирования
                // Если HEYS.Day.isBlockingCloudUpdates() = true, НЕ затираем localStorage!
                // Это предотвращает race condition когда sync читает старые данные до flush
                // ⚠️ НО! При forceSync (pull-to-refresh) ИГНОРИРУЕМ блокировку — пользователь явно хочет обновить
                if (!forceSync && typeof global.HEYS?.Day?.isBlockingCloudUpdates === 'function' && global.HEYS.Day.isBlockingCloudUpdates()) {
                  const remaining = (global.HEYS.Day.getBlockUntil?.() || 0) - Date.now();
                  log(`🔒 [SYNC BLOCKED] Skipping ${key} — local edit in progress (${remaining}ms remaining)`);
                  window.console.info('[HEYS.sinhron] 🔒 BLOCKED ' + key + ' — local edit, remaining ' + remaining + 'ms');
                  return; // Пропускаем этот ключ, НЕ затираем localStorage
                }

                const remoteUpdatedAt = row.v?.updatedAt || 0;
                const localUpdatedAt = local?.updatedAt || 0;

                // � Диагностика: логируем решения по dayv2 для сегодня
                const _syncDayDate = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
                const _isTodaySync = _syncDayDate && _syncDayDate[1] === new Date().toISOString().slice(0, 10);
                if (_isTodaySync) {
                  const _rMeals = Array.isArray(row.v?.meals) ? row.v.meals.length : 0;
                  const _lMeals = Array.isArray(local?.meals) ? local.meals.length : 0;
                  const _rKcal = row.v?.savedEatenKcal || 0;
                  const _lKcal = local?.savedEatenKcal || 0;
                  window.console.info('[HEYS.sinhron] 📊 dayv2 СЕГОДНЯ: remote=' + _rMeals + 'm/' + _rKcal + 'kcal (updAt=' + remoteUpdatedAt + ') local=' + _lMeals + 'm/' + _lKcal + 'kcal (updAt=' + localUpdatedAt + ') force=' + forceSync);
                }

                // �🛡️ ЗАЩИТА: Не перезаписываем meaningful локальные данные пустым remote
                const localMeaningful = isMeaningfulDayData(local);
                const remoteMeaningful = isMeaningfulDayData(row.v);
                if (localMeaningful && !remoteMeaningful) {
                  logCritical(`🛡️ [DAYV2] KEEP LOCAL: meaningful local, empty remote for ${key}`);
                  window.console.info('[HEYS.sinhron] 🛡️ KEEP_LOCAL (empty remote) ' + key);
                  if (_isTodaySync) window.console.info('[HEYS.sinhron] 📊 dayv2 СЕГОДНЯ → KEEP_LOCAL (remote пустой)');
                  const pushObj = {
                    client_id: client_id,
                    k: normalizeKeyForSupabase(row.k, client_id),
                    v: local,
                    updated_at: new Date().toISOString()
                  };
                  clientUpsertQueue.push(pushObj);
                  scheduleClientPush();
                  return;
                }

                // 🛡️ ЗАЩИТА: Если local имеет БОЛЬШЕ meals — не затираем (race condition)
                if (!forceSync) {
                  const localMealsCount = Array.isArray(local?.meals) ? local.meals.length : 0;
                  const remoteMealsCount = Array.isArray(row.v?.meals) ? row.v.meals.length : 0;
                  if (localMealsCount > remoteMealsCount) {
                    logCritical(`🛡️ [DAYV2] KEEP LOCAL: local has MORE meals (${localMealsCount} > ${remoteMealsCount}) for ${key}`);
                    window.console.info('[HEYS.sinhron] 🛡️ KEEP_LOCAL (more meals ' + localMealsCount + '>' + remoteMealsCount + ') ' + key);
                    if (_isTodaySync) window.console.info('[HEYS.sinhron] 📊 dayv2 СЕГОДНЯ → KEEP_LOCAL (local больше meals ' + localMealsCount + '>' + remoteMealsCount + ')');
                    const pushObj = {
                      client_id: client_id,
                      k: normalizeKeyForSupabase(row.k, client_id),
                      v: local,
                      updated_at: new Date().toISOString()
                    };
                    clientUpsertQueue.push(pushObj);
                    scheduleClientPush();
                    return;
                  }
                }

                // 🔍 ДИАГНОСТИКА: логируем состояние для отладки race conditions (ОТКЛЮЧЕНО - слишком много логов)
                // logCritical(`📅 [SYNC dayv2] key=${key} | local: ${local?.meals?.length || 0} meals, updatedAt=${localUpdatedAt} | remote: ${row.v?.meals?.length || 0} meals, updatedAt=${remoteUpdatedAt} | forceSync=${forceSync}`);

                // 🔄 FORCE MODE (pull-to-refresh): ВСЕГДА применять облачные данные
                // При force берём remote как базу, remote items ПОБЕЖДАЮТ при конфликте
                if (forceSync && row.v) {
                  // local уже перечитан выше (свежие данные из localStorage)
                  // 🔇 PERF: Отключено — слишком много логов на 256 ключей
                  // logCritical(`🔄 [FORCE SYNC] Processing day | key: ${key}`);
                  // logCritical(`   📦 local: ${local?.meals?.length || 0} meals, updatedAt: ${local?.updatedAt}`);
                  // logCritical(`   ☁️ remote: ${row.v.meals?.length || 0} meals, updatedAt: ${row.v?.updatedAt}`);

                  let valueToSave;
                  // ✅ Даже в force-режиме не перезаписываем meaningful локальные данные пустым remote
                  if (localMeaningful && !remoteMeaningful) {
                    valueToSave = local;
                    if (_isTodaySync) window.console.info('[HEYS.sinhron] 📊 dayv2 СЕГОДНЯ FORCE → KEEP_LOCAL (remote пустой, local meaningful)');
                    const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
                    if (dateMatch) {
                      const dayKey = `heys_dayv2_${dateMatch[1]}`;
                      local.updatedAt = Date.now();
                      const upsertObj = {
                        client_id: client_id,
                        k: dayKey,
                        v: local,
                        updated_at: new Date().toISOString()
                      };
                      clientUpsertQueue.push(upsertObj);
                      scheduleClientPush();
                    }
                  } else if (local && local.meals?.length > 0) {
                    // 🔄 ЗАЩИТА: Если local БОЛЬШЕ данных чем remote — это race condition!
                    // Remote ещё не получил последние изменения. Сохраняем local как есть.
                    // ⚠️ Условие: local больше данных ИЛИ local новее (не И!) — защищаем от потери любых данных
                    const localHasMore = local.meals.length > (row.v.meals?.length || 0);
                    const localIsNewer = (local.updatedAt || 0) > (row.v.updatedAt || 0);

                    // 🔇 PERF: Отключено
                    // logCritical(`   🔍 CHECK: localHasMore=${localHasMore} (${local.meals.length} > ${row.v.meals?.length || 0}), localIsNewer=${localIsNewer} (${local.updatedAt} > ${row.v.updatedAt})`);

                    if (localHasMore || localIsNewer) {
                      // 🔇 PERF: Отключено
                      // logCritical(`🛡️ [FORCE SYNC] PROTECTED! Local wins: hasMore=${localHasMore}, isNewer=${localIsNewer}. Keeping local.`);
                      valueToSave = local;
                      if (_isTodaySync) window.console.info('[HEYS.sinhron] 📊 dayv2 СЕГОДНЯ FORCE → KEEP_LOCAL (hasMore=' + localHasMore + ', isNewer=' + localIsNewer + ')');

                      // 🔄 Отправляем local в облако чтобы следующий sync получил актуальные данные
                      const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
                      if (dateMatch) {
                        const dayKey = `heys_dayv2_${dateMatch[1]}`;
                        local.updatedAt = Date.now(); // Обновляем timestamp
                        const upsertObj = {
                          client_id: client_id,
                          k: dayKey,
                          v: local,
                          updated_at: new Date().toISOString()
                        };
                        clientUpsertQueue.push(upsertObj);
                        scheduleClientPush();
                        // 🔇 PERF: Отключено
                        // logCritical(`☁️ [FORCE SYNC] Queued local data upload to cloud for ${dayKey}`);
                      }
                    } else {
                      // Есть локальные данные — merge с preferRemote чтобы удаления из облака применились
                      const merged = mergeDayData(local, row.v, { forceKeepAll: true, preferRemote: true });
                      valueToSave = merged || row.v; // Если merge вернул null — берём remote
                      if (_isTodaySync) window.console.info('[HEYS.sinhron] 📊 dayv2 СЕГОДНЯ FORCE → MERGE (meals=' + (valueToSave?.meals?.length || 0) + ')');
                    }
                  } else {
                    // Нет локальных данных — просто берём remote
                    valueToSave = row.v;
                    if (_isTodaySync) window.console.info('[HEYS.sinhron] 📊 dayv2 СЕГОДНЯ FORCE → ACCEPT_REMOTE (нет local, meals=' + (valueToSave?.meals?.length || 0) + ')');
                  }

                  // 🔇 PERF: Отключено
                  // logCritical(`🔄 [FORCE SYNC] Saving ${valueToSave.meals?.length || 0} meals to localStorage | key: ${key}`);

                  // 🚀 PERF: Skip write if local data is identical to resolved value
                  // Common case: pull-refresh with delta returns keys that haven't actually changed for us
                  if (local && valueToSave === local) {
                    // valueToSave was set to local (protection path) — no write needed
                    return;
                  }
                  if (local && valueToSave && local !== valueToSave) {
                    const lmCount = local.meals?.length || 0;
                    const smCount = valueToSave.meals?.length || 0;
                    if (lmCount === smCount && local.updatedAt && local.updatedAt === valueToSave.updatedAt) {
                      // Same meals count + same updatedAt = identical data, skip write
                      return;
                    }
                  }

                  // 🧷 Backup перед возможной перезаписью dayv2
                  backupDayV2BeforeOverwrite(key, valueToSave, 'force-sync');
                  const wroteDay = writeDayKeyWithQuotaGuard(key, valueToSave, {
                    preserveRecentDuringHydration: true,
                    nowTs: now
                  });
                  if (!wroteDay) {
                    skippedDayMirrorKeys.push(key);
                    return;
                  }
                  const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
                  if (dateMatch) {
                    const mealsCount = valueToSave?.meals?.length || 0;
                    forceWrittenDayV2.push(`${dateMatch[1]}(${mealsCount}m)`);
                    forceWrittenDates.push(dateMatch[1]);
                    if (isSyncDetailLogsEnabled()) {
                      window.console.info('[HEYS.sinhron] ✅ FORCE_WRITE ' + key + ' meals=' + mealsCount);
                    }
                    // 🚀 PERF: Individual event dispatch removed — batch event after loop
                    // (was: N individual heys:day-updated dispatches → cascade re-renders)
                  }
                  return; // Готово
                }

                // Если есть локальные изменения И облачные изменения — нужен merge
                if (local && localUpdatedAt > 0 && remoteUpdatedAt > 0) {
                  // MERGE: объединяем данные вместо перезаписи
                  const merged = mergeDayData(local, row.v);
                  if (merged) {
                    // 🔇 PERF: Отключено
                    // logCritical(`🔀 [MERGE] Day conflict resolved | key: ${key} | local: ${new Date(localUpdatedAt).toLocaleTimeString()} | remote: ${new Date(remoteUpdatedAt).toLocaleTimeString()}`);
                    const wroteMergedDay = writeDayKeyWithQuotaGuard(key, merged, {
                      preserveRecentDuringHydration: true,
                      nowTs: now
                    });
                    if (!wroteMergedDay) {
                      skippedDayMirrorKeys.push(key);
                      return;
                    }
                    window.console.info('[HEYS.sinhron] ✅ MERGE ' + key + ' meals=' + (merged?.meals?.length || 0));
                    if (_isTodaySync) window.console.info('[HEYS.sinhron] 📊 dayv2 СЕГОДНЯ → MERGE (meals=' + (merged?.meals?.length || 0) + ' kcal=' + (merged?.savedEatenKcal || 0) + ')');

                    // Уведомляем UI об обновлении данных дня (для pull-to-refresh)
                    const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
                    if (dateMatch) {
                      window.dispatchEvent(new CustomEvent('heys:day-updated', { detail: { date: dateMatch[1], source: 'merge' } }));
                      // 🔇 PERF: Отключено
                      // logCritical(`📅 [EVENT] heys:day-updated dispatched for ${dateMatch[1]} (merge)`);
                    }

                    // Отправляем merged версию обратно в облако через очередь (гарантия доставки)
                    // Используем нормализованный ключ (без embedded client_id)
                    const mergedUpsertObj = {
                      user_id: user.id,
                      client_id: client_id,
                      k: normalizeKeyForSupabase(row.k, client_id),
                      v: merged,
                      updated_at: (new Date()).toISOString(),
                    };
                    clientUpsertQueue.push(mergedUpsertObj);
                    scheduleClientPush();
                    return; // Уже сохранили merged
                  }
                }

                // Нет конфликта — просто берём более свежую версию
                if (localUpdatedAt > remoteUpdatedAt) {
                  log('conflict: keep local (by updatedAt)', key, localUpdatedAt, '>', remoteUpdatedAt);
                  window.console.info('[HEYS.sinhron] 🛡️ KEEP_LOCAL (newer ' + localUpdatedAt + '>' + remoteUpdatedAt + ') ' + key);
                  if (_isTodaySync) window.console.info('[HEYS.sinhron] 📊 dayv2 СЕГОДНЯ → KEEP_LOCAL (newer)');
                  return;
                }
                if (_isTodaySync) window.console.info('[HEYS.sinhron] 📊 dayv2 СЕГОДНЯ → ACCEPT_REMOTE (cloud→localStorage)');
              } else {
                // Остальные ключи: сравниваем по revision И updatedAt
                const remoteRev = row.v && row.v.revision ? row.v.revision : 0;
                const localRev = local && local.revision ? local.revision : 0;
                const remoteUpdatedAt = row.v?.updatedAt || 0;
                const localUpdatedAt = local?.updatedAt || 0;

                // Если локальная версия новее по revision ИЛИ updatedAt — не затираем
                if (localRev > remoteRev || localUpdatedAt > remoteUpdatedAt) {
                  log('conflict: keep local (by revision/updatedAt)', key,
                    `localRev=${localRev} remoteRev=${remoteRev}`,
                    `localUpdatedAt=${localUpdatedAt} remoteUpdatedAt=${remoteUpdatedAt}`);
                  return;
                }

                // 🛡️ ЗАЩИТА ПРОФИЛЯ: Не затираем заполненный профиль дефолтными значениями
                if (key.includes('_profile')) {
                  const remoteIsDefault = row.v &&
                    (row.v.weight === 70 && row.v.height === 175 && row.v.age === 30) &&
                    (!row.v.updatedAt || row.v.updatedAt === 0);
                  const localHasData = local &&
                    (local.weight !== 70 || local.height !== 175 || local.age !== 30 ||
                      local.firstName || local.lastName || (local.updatedAt && local.updatedAt > 0));

                  if (remoteIsDefault && localHasData) {
                    logCritical(`⚠️ [PROFILE] BLOCKED: Refusing to overwrite filled profile with default values`);
                    logCritical(`  Local: weight=${local.weight}, height=${local.height}, age=${local.age}, updatedAt=${local.updatedAt}`);
                    logCritical(`  Remote: weight=${row.v?.weight}, height=${row.v?.height}, age=${row.v?.age}, updatedAt=${row.v?.updatedAt}`);
                    return; // Пропускаем сохранение
                  }
                }

                // 🛡️ ЗАЩИТА GAMIFICATION: XP должен только расти, не сбрасываться
                // FIX v2.0: Ищем game данные во ВСЕХ вариантах ключа (legacy, разные clientId)
                if (key.includes('_game') && !key.includes('_gamification')) {
                  const remoteTotalXP = row.v?.totalXP || 0;
                  let localTotalXP = local?.totalXP || 0;
                  let bestLocalGame = local;

                  // 🔍 Ищем game данные во всех вариантах ключа
                  if (localTotalXP === 0) {
                    try {
                      const clientPrefix = client_id ? `heys_${client_id}_` : null;

                      // 1. Прямой ключ heys_game (legacy без clientId)
                      // ⚠️ Используем ТОЛЬКО если client_id неизвестен — иначе риск чужих данных
                      if (!clientPrefix) {
                        const legacyGame = tryParse(ls.getItem('heys_game'));
                        if (legacyGame?.totalXP > localTotalXP) {
                          localTotalXP = legacyGame.totalXP;
                          bestLocalGame = legacyGame;
                          logCritical(`🎮 [GAME] Found legacy heys_game with XP: ${localTotalXP}`);
                        }
                      }

                      // 2. Поиск по ключам *_game только в рамках текущего клиента
                      for (let i = 0; i < ls.length; i++) {
                        const k = ls.key(i);
                        if (!k) continue;
                        if (clientPrefix && !k.startsWith(clientPrefix)) continue;
                        if (!clientPrefix && k === 'heys_game') continue;
                        if (k.endsWith('_game') && !k.includes('_gamification')) {
                          const gameData = tryParse(ls.getItem(k));
                          if (gameData?.totalXP > localTotalXP) {
                            localTotalXP = gameData.totalXP;
                            bestLocalGame = gameData;
                            logCritical(`🎮 [GAME] Found better game data in ${k}: XP=${localTotalXP}`);
                          }
                        }
                      }
                    } catch (e) { }
                  }

                  logCritical(`🎮 [GAME SYNC] local XP=${localTotalXP}, remote XP=${remoteTotalXP}, key=${key}`);

                  // Если локальный XP больше — сохраняем локальные данные И отправляем в облако
                  if (localTotalXP > remoteTotalXP) {
                    logCritical(`🎮 [GAME] BLOCKED: Keeping local XP (${localTotalXP}) > remote (${remoteTotalXP})`);

                    // Отправляем локальные данные в облако чтобы синхронизировать
                    if (bestLocalGame && user?.id) {
                      const gameUpsertObj = {
                        user_id: user.id,
                        client_id: client_id,
                        k: normalizeKeyForSupabase(row.k, client_id),
                        v: bestLocalGame,
                        updated_at: (new Date()).toISOString(),
                      };
                      clientUpsertQueue.push(gameUpsertObj);
                      scheduleClientPush();
                      logCritical(`🎮 [GAME] Queued local game data to cloud (XP: ${localTotalXP})`);
                    }
                    return;
                  }

                  // Если remote XP больше — берём remote, но мержим achievements
                  if (remoteTotalXP > localTotalXP) {
                    const localAchievements = bestLocalGame?.unlockedAchievements || [];
                    const remoteAchievements = row.v?.unlockedAchievements || [];
                    const mergedAchievements = [...new Set([...remoteAchievements, ...localAchievements])];

                    row.v = {
                      ...row.v,
                      unlockedAchievements: mergedAchievements,
                      // Сохраняем максимальные stats
                      stats: {
                        ...row.v?.stats,
                        bestStreak: Math.max(row.v?.stats?.bestStreak || 0, bestLocalGame?.stats?.bestStreak || 0),
                        perfectDays: Math.max(row.v?.stats?.perfectDays || 0, bestLocalGame?.stats?.perfectDays || 0),
                        totalProducts: Math.max(row.v?.stats?.totalProducts || 0, bestLocalGame?.stats?.totalProducts || 0),
                        totalWater: Math.max(row.v?.stats?.totalWater || 0, bestLocalGame?.stats?.totalWater || 0),
                        totalTrainings: Math.max(row.v?.stats?.totalTrainings || 0, bestLocalGame?.stats?.totalTrainings || 0)
                      }
                    };
                    logCritical(`🎮 [GAME] MERGED: XP ${localTotalXP} → ${remoteTotalXP}, achievements: ${mergedAchievements.length}`);
                  }

                  // Если оба равны нулю — ничего не делаем, пусть remote запишется
                  if (remoteTotalXP === 0 && localTotalXP === 0) {
                    logCritical(`🎮 [GAME] Both XP=0, accepting remote (may be fresh start)`);
                  }
                }

                // 🛡️ ЗАЩИТА WIDGET LAYOUT: Не затираем локальный layout облачным с более старым updatedAt
                // Widget layout — критичные данные, потеря = сброс настроек пользователя
                // Проверяем ТОЛЬКО основной layout, НЕ meta (widget_layout_meta_v1)
                if (key.includes('widget_layout_v1') && !key.includes('_meta_')) {
                  // Извлекаем updatedAt из обоих источников
                  // Новый формат: { widgets: [...], updatedAt: number }
                  // Старый формат: прямой массив (нет updatedAt)
                  const remoteHasUpdatedAt = row.v && typeof row.v.updatedAt === 'number';
                  const localHasUpdatedAt = local && typeof local.updatedAt === 'number';

                  // Количество виджетов (для логирования)
                  const remoteWidgetCount = row.v?.widgets?.length || (Array.isArray(row.v) ? row.v.length : 0);
                  const localWidgetCount = local?.widgets?.length || (Array.isArray(local) ? local.length : 0);

                  // Если локальный layout новее — НЕ затираем
                  if (localHasUpdatedAt && remoteHasUpdatedAt && local.updatedAt >= row.v.updatedAt) {
                    logCritical(`🧩 [WIDGET LAYOUT] KEEP LOCAL: local.updatedAt (${local.updatedAt}) >= remote.updatedAt (${row.v.updatedAt})`);
                    logCritical(`   Local: ${localWidgetCount} widgets, Remote: ${remoteWidgetCount} widgets`);
                    return; // Пропускаем сохранение — локальные данные актуальнее
                  }

                  // Если локальный имеет updatedAt, а remote — нет (старый формат в облаке)
                  if (localHasUpdatedAt && !remoteHasUpdatedAt) {
                    logCritical(`🧩 [WIDGET LAYOUT] KEEP LOCAL: local has updatedAt (${local.updatedAt}), remote is legacy format`);
                    logCritical(`   Local: ${localWidgetCount} widgets, Remote: ${remoteWidgetCount} widgets`);
                    // Отправим локальные в облако чтобы обновить формат
                    const upsertObj = {
                      user_id: user.id,
                      client_id: client_id,
                      k: normalizeKeyForSupabase(row.k, client_id),
                      v: local, // Отправляем локальные данные в новом формате
                      updated_at: (new Date()).toISOString(),
                    };
                    clientUpsertQueue.push(upsertObj);
                    scheduleClientPush();
                    return; // Пропускаем сохранение remote
                  }

                  // Если оба без updatedAt (старый формат) — не трогаем, пусть будет как есть
                  // Это позволит избежать потери данных при миграции
                  if (!localHasUpdatedAt && !remoteHasUpdatedAt && localWidgetCount > 0) {
                    logCritical(`🧩 [WIDGET LAYOUT] KEEP LOCAL: both legacy format, preserving ${localWidgetCount} local widgets`);
                    return;
                  }

                  // 🛡️ КРИТИЧНО: Если локальный layout имеет данные с updatedAt, а remote пустой или без данных — KEEP LOCAL!
                  // Это предотвращает затирание данных пустым ответом из облака
                  if (localHasUpdatedAt && localWidgetCount > 0 && remoteWidgetCount === 0) {
                    logCritical(`🧩 [WIDGET LAYOUT] KEEP LOCAL: local has ${localWidgetCount} widgets with updatedAt, remote is EMPTY`);
                    // Отправим локальные в облако чтобы восстановить данные
                    const upsertObj = {
                      user_id: user.id,
                      client_id: client_id,
                      k: normalizeKeyForSupabase(row.k, client_id),
                      v: local, // Отправляем локальные данные
                      updated_at: (new Date()).toISOString(),
                    };
                    clientUpsertQueue.push(upsertObj);
                    scheduleClientPush();
                    return; // Пропускаем сохранение пустого remote
                  }

                  logCritical(`🧩 [WIDGET LAYOUT] ACCEPTING REMOTE: ${remoteWidgetCount} widgets (updatedAt: ${row.v?.updatedAt || 'none'})`);
                }
              }

              // ⛔ Phase-ε READ-side: overlay_v2 — direct passthrough.
              // Overlay row schema is {id, shared_origin_id, overrides, in_my_list, _custom?} —
              // НЕТ top-level name, поэтому legacy-фильтр `p.name` всегда уничтожал бы их.
              // Имя приходит из shared-каталога при merge во view, поэтому здесь не валидируем.
              // Tombstone-фильтрация делается в OverlayStore.toMergedView, не здесь.
              if (key.includes('_products_overlay_v2') && !key.includes('_products_pre_overlay_') && !key.includes('_overlay_v2_rpc_tail')) {
                try {
                  if (Array.isArray(row.v)) {
                    // Self-heal guard: пока OVERLAY GUARD ещё в коде (Шаг 5 плана его уберёт),
                    // дублируем skip-логику здесь чтобы applyCloudSnapshot не получил dirty
                    // cloud data до того как self-heal upload долетит. Удалить вместе с
                    // OVERLAY GUARD после стабилизации.
                    try {
                      const _healMarker = global.localStorage.getItem('heys_overlay_self_healed_at');
                      if (_healMarker) {
                        const _parts = _healMarker.split(':');
                        const _healedCount = parseInt(_parts[0], 10);
                        const _healedAt = parseInt(_parts[1], 10);
                        const _healFresh = (Date.now() - _healedAt) < 300000; // 5 min
                        if (_healFresh && _healedCount > 0 && _healedCount < row.v.length) {
                          logCritical(`⏭️ [OVERLAY-V2 PULL] Skipped: local self-healed to ${_healedCount}, cloud=${row.v.length} (stale)`);
                          return;
                        }
                      }
                    } catch (_) { /* noop */ }
                    // Канонический путь: applyCloudSnapshot делает dedup TypeA по
                    // shared_origin_id, фильтрует tombstones, сохраняет pending-local
                    // customs, и пишет через writeRaw(skipCloudSync:true) чтобы не было
                    // round-trip cloud → LS → cloud.
                    if (global.HEYS && global.HEYS.OverlayStore
                        && typeof global.HEYS.OverlayStore.applyCloudSnapshot === 'function') {
                      const _r = global.HEYS.OverlayStore.applyCloudSnapshot(row.v, { source: 'bootstrap-paginated' });
                      logCritical(`✅ [OVERLAY-V2 PULL] applyCloudSnapshot: ${JSON.stringify(_r)} key=…${key.slice(-50)}`);
                    } else {
                      // Fallback: OverlayStore ещё не загружен (очень ранний boot).
                      ls.setItem(key, JSON.stringify(row.v));
                      logCritical(`✅ [OVERLAY-V2 PULL] Saved ${row.v.length} rows to LS (fallback): ${key.slice(-50)}`);
                    }
                  }
                } catch (e) { /* noop */ }
                return;
              }

              // ЗАЩИТА И MERGE: Умное объединение продуктов (не затираем локальные)
              if (key.includes('_products') && !key.includes('_products_backup') && !key.includes('_hidden_products') && !key.includes('_favorite_products') && !key.includes('_deleted_products') && !key.includes('_products_overlay_v2') && !key.includes('_products_pre_overlay_')) {
                // ⛔ Phase-ε READ-side: legacy heys_<cid>_products is dead-data when overlay-canonical.
                // Symmetric to push-side skip at line ~9517 (cloud-push skipped). Облачный legacy-снимок
                // может быть stale stub (1 row или 150-row), который через merge → setAll(allowShrink:true)
                // затирает overlay merged-view в памяти. Источник истины — heys_products_overlay_v2.
                //
                // Точный сигнал "overlay активен как источник истины" = flag ON AND (status='success' OR
                // overlay LS уже содержит хотя бы 1 строку). Второе условие закрывает race на первом
                // bootstrap-sync после PIN-restore: cloud heys_products приходит ДО того как
                // runOverlayMigrationOnce успел поставить status='success', но overlay LS уже мог быть
                // populated через [OVERLAY-V2 PULL] handler в этой же sync-итерации.
                const _flagOn = global.HEYS && global.HEYS.flags
                  && global.HEYS.flags.isEnabled && global.HEYS.flags.isEnabled('overlay_products_v2');
                let _overlayHasRows = false;
                if (_flagOn) {
                  try {
                    const _store = global.HEYS && global.HEYS.OverlayStore;
                    if (_store && typeof _store.readRaw === 'function') {
                      const _rows = _store.readRaw();
                      _overlayHasRows = Array.isArray(_rows) && _rows.length > 0;
                    }
                  } catch (_) { /* noop */ }
                }
                const _statusSuccess = global.localStorage.getItem('heys_overlay_migration_status') === 'success';
                const _overlayCanonical = _flagOn && (_statusSuccess || _overlayHasRows);
                if (_overlayCanonical) {
                  logCritical(`⏭️ [PRODUCTS PULL] Skipped legacy ${key.slice(-50)} (${Array.isArray(row.v) ? row.v.length : '?'} rows): overlay-canonical (status=${_statusSuccess ? 'success' : 'pending'}, overlayRows=${_overlayHasRows ? '>0' : '0'})`);
                  return;
                }

                let remoteProducts;
                // 🔇 PERF: Отключено — много логов
                // console.log('📦 [PRODUCTS DEBUG] Processing products key:', key, 'raw row.k:', row.k, 'row.v length:', Array.isArray(row.v) ? row.v.length : 'not array');

                // Читаем актуальное локальное значение по scoped ключу
                let currentLocal = null;
                try {
                  const rawLocal = ls.getItem(key);
                  if (rawLocal) {
                    const parsed = tryParse(rawLocal);
                    // Фильтруем невалидные продукты (без name)
                    currentLocal = Array.isArray(parsed)
                      ? parsed.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0)
                      : null;
                  }
                } catch (e) { }

                // 🆕 v5.0: Keep snapshot of previous products for downstream cascade
                // Only capture once per sync cycle.
                if (!previousProducts && Array.isArray(currentLocal) && currentLocal.length > 0) {
                  previousProducts = currentLocal;
                }

                // 🛡️ КРИТИЧНО: Фильтруем невалидные продукты из облака ПЕРЕД любой обработкой
                remoteProducts = row.v;
                if (Array.isArray(row.v)) {
                  const before = row.v.length;
                  remoteProducts = row.v.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0);
                  if (remoteProducts.length !== before) {
                    logCritical(`🧹 [CLOUD PRODUCTS] Pre-filtered ${before - remoteProducts.length} invalid (${before} → ${remoteProducts.length})`);
                  }
                }

                // КРИТИЧЕСКАЯ ЗАЩИТА: НЕ ЗАТИРАЕМ непустые продукты пустым массивом
                if (Array.isArray(remoteProducts) && remoteProducts.length === 0) {
                  if (Array.isArray(currentLocal) && currentLocal.length > 0) {
                    log(`⚠️ [PRODUCTS] BLOCKED: Refusing to overwrite ${currentLocal.length} local products with empty cloud array`);
                    // 🔄 Отправляем локальные продукты в облако чтобы заменить мусор
                    logCritical(`🔄 [CLOUD RECOVERY] Pushing ${currentLocal.length} local products to replace cloud garbage`);
                    const recoveryUpsertObj = {
                      user_id: user.id,
                      client_id: client_id,
                      k: normalizeKeyForSupabase(row.k, client_id),
                      v: currentLocal,
                      updated_at: new Date().toISOString(),
                    };
                    clientUpsertQueue.push(recoveryUpsertObj);
                    scheduleClientPush();
                    return; // Пропускаем сохранение
                  } else {
                    // Оба пусты - пытаемся восстановить из backup
                    const backupKey = key.replace('_products', '_products_backup');
                    const backupRaw = ls.getItem(backupKey);
                    if (backupRaw) {
                      try {
                        const backupData = tryParse(backupRaw);
                        if (Array.isArray(backupData) && backupData.length > 0) {
                          log(`✅ [RECOVERY] Restored ${backupData.length} products from backup`);
                          if (global.HEYS?.products?.setAll) {
                            global.HEYS.products.setAll(backupData, { source: 'cloud-recovery', skipNotify: true, skipCloud: true });
                            productsUpdated = true;
                            latestProducts = backupData;
                            // If we restored from backup, previousProducts may be empty; fallback to in-memory snapshot.
                            if (!previousProducts) previousProducts = currentLocal || global.HEYS?.products?.getAll?.() || null;
                          } else {
                            ls.setItem(key, JSON.stringify(backupData));
                          }
                          muteMirror = false;
                          setTimeout(() => cloud.saveClientKey(client_id, 'heys_products', backupData), 500);
                          muteMirror = true;
                          return;
                        }
                      } catch (e) { }
                    }
                  }
                }

                // 🔀 MERGE: Объединяем локальные и облачные продукты (уже отфильтрованные!)
                // Это решает проблему: новый продукт добавлен локально, но облако ещё не обновилось
                if (Array.isArray(currentLocal) && currentLocal.length > 0 && Array.isArray(remoteProducts) && remoteProducts.length > 0) {
                  let merged = mergeProductsData(currentLocal, remoteProducts);

                  // 🛡️ v4.8.10: Финальная tombstone-фильтрация merged результата ПЕРЕД setAll
                  // mergeProductsData фильтрует через HEYS.deletedProducts, но эта система может потерять данные
                  // при очистке localStorage. Дублируем проверку через heys_deleted_ids (Store, выживает в облаке).
                  const _tsForMerge = (typeof global !== 'undefined' ? global : window)?.HEYS?.store?.get?.('heys_deleted_ids') || [];
                  if (Array.isArray(_tsForMerge) && _tsForMerge.length > 0) {
                    const _tsIds = new Set(_tsForMerge.map(t => t.id).filter(Boolean));
                    const _tsNames = new Set(_tsForMerge.map(t => (t.name || '').trim().toLowerCase()).filter(Boolean));
                    const beforeLen = merged.length;
                    merged = merged.filter(p => {
                      if (!p) return false;
                      if (p.id && _tsIds.has(p.id)) return false;
                      if (p.name && _tsNames.has(String(p.name).trim().toLowerCase())) return false;
                      return true;
                    });
                    if (merged.length < beforeLen) {
                      logCritical(`🪦 [MERGE TOMBSTONE] Removed ${beforeLen - merged.length} tombstoned product(s) from merge result (${beforeLen}→${merged.length})`);
                    }
                  }

                  // 🔧 ИСПРАВЛЕНИЕ: Подсчитываем уникальные локальные продукты для корректного сравнения
                  // (т.к. mergeProductsData делает дедупликацию внутри, сравнение с raw currentLocal некорректно)
                  const localUniqueCount = new Set(currentLocal.filter(p => p && p.name).map(p => String(p.name).trim().toLowerCase())).size;

                  // 🛡️ ЗАЩИТА: Проверяем потерю УНИКАЛЬНЫХ продуктов (не дублей)
                  // Если уникальных локальных больше чем merged — значит sync "опоздал" и пытается удалить новые продукты
                  // 🔧 FIX v4.8.9: Если все "лишние" локальные — это tombstoned продукты, разрешаем merge.
                  // Иначе синхронизация навечно блокируется и удалённые продукты воскресают.
                  const _tombstonesSync = (typeof global !== 'undefined' ? global : window)?.HEYS?.store?.get?.('heys_deleted_ids') || [];
                  const _tombstoneIdsSync = new Set(Array.isArray(_tombstonesSync) ? _tombstonesSync.map(t => t.id).filter(Boolean) : []);
                  const _tombstoneNamesSync = new Set(Array.isArray(_tombstonesSync) ? _tombstonesSync.map(t => (t.name || '').trim().toLowerCase()).filter(Boolean) : []);
                  const _localWithoutTombstoned = currentLocal.filter(p => {
                    if (!p) return false;
                    if (p.id && _tombstoneIdsSync.has(p.id)) return false;
                    if (p.name && _tombstoneNamesSync.has(String(p.name).trim().toLowerCase())) return false;
                    return true;
                  });
                  const localEffectiveCount = new Set(_localWithoutTombstoned.filter(p => p && p.name).map(p => String(p.name).trim().toLowerCase())).size;

                  if (localEffectiveCount > merged.length) {
                    logCritical(`⚠️ [PRODUCTS SYNC] BLOCKED: localEffective (${localEffectiveCount}, was ${localUniqueCount} before tombstone) > merged (${merged.length}). Keeping local.`);
                    // Отправляем локальные в облако чтобы синхронизировать (после дедупликации)
                    // Используем merged как источник — он содержит все уникальные продукты
                    const localDeduped = [];
                    const seenNames = new Set();
                    for (const p of currentLocal) {
                      if (!p || !p.name) continue;
                      const key = String(p.name).trim().toLowerCase();
                      if (!seenNames.has(key)) {
                        seenNames.add(key);
                        localDeduped.push(p);
                      }
                    }
                    const localUpsertObj = {
                      user_id: user.id,
                      client_id: client_id,
                      k: normalizeKeyForSupabase(row.k, client_id),
                      v: localDeduped, // Отправляем дедуплицированные!
                      updated_at: (new Date()).toISOString(),
                    };
                    clientUpsertQueue.push(localUpsertObj);
                    scheduleClientPush();
                    // Сохраняем дедуплицированные локально
                    // 🛡️ v4.8.1: Проверяем что не перезаписываем больший набор
                    const memoryNow = global.HEYS?.products?.getAll?.()?.length || 0;
                    if (localDeduped.length < memoryNow) {
                      // v4.8.2: Разрешаем дедупликацию если разница <= 5%
                      const shrinkPct = ((memoryNow - localDeduped.length) / memoryNow) * 100;
                      if (shrinkPct > 5) {
                        log(`⚠️ [PRODUCTS] Skip setAll: localDeduped (${localDeduped.length}) significantly < memory (${memoryNow}), ${shrinkPct.toFixed(1)}%`);
                        return;
                      }
                      log(`🧹 [PRODUCTS] Allowing dedup shrink: ${memoryNow} → ${localDeduped.length} (−${shrinkPct.toFixed(1)}%)`);
                    }
                    if (global.HEYS?.products?.setAll) {
                      global.HEYS.products.setAll(localDeduped, { source: 'cloud-sync', skipNotify: true, skipCloud: true, allowShrink: true });
                      productsUpdated = true;
                      latestProducts = localDeduped;
                      if (!previousProducts) previousProducts = currentLocal || global.HEYS?.products?.getAll?.() || null;
                    } else {
                      ls.setItem(key, JSON.stringify(localDeduped));
                    }
                    return;
                  }

                  // Если дедупликация убрала дубли — это OK, сохраняем merged
                  if (currentLocal.length > merged.length && localUniqueCount === merged.length) {
                    log(`🧹 [PRODUCTS] Deduplication cleaned ${currentLocal.length - merged.length} duplicates`);
                  }

                  // Если merge добавил новые продукты — сохраняем и синхронизируем обратно в облако
                  if (merged.length > remoteProducts.length) {
                    logCritical(`📦 [PRODUCTS MERGE] ${currentLocal.length} local + ${remoteProducts.length} remote → ${merged.length} merged`);
                    if (global.HEYS?.products?.setAll) {
                      global.HEYS.products.setAll(merged, { source: 'cloud-sync', skipNotify: true, skipCloud: true, allowShrink: true });
                      productsUpdated = true;
                      latestProducts = merged;
                      if (!previousProducts) previousProducts = currentLocal || global.HEYS?.products?.getAll?.() || null;
                    } else {
                      ls.setItem(key, JSON.stringify(merged));
                    }

                    // Отправляем merged версию обратно в облако
                    const mergedUpsertObj = {
                      user_id: user.id,
                      client_id: client_id,
                      k: normalizeKeyForSupabase(row.k, client_id),
                      v: merged,
                      updated_at: (new Date()).toISOString(),
                    };
                    clientUpsertQueue.push(mergedUpsertObj);
                    scheduleClientPush();
                    return; // Уже обработали products
                  }

                  // Если merged.length === remoteProducts.length (нет изменений) — сохраняем merged
                  // Это безопасно т.к. merged уже включает все локальные продукты
                  // 🛡️ v4.8.1: Дополнительная проверка на память — могли добавить продукты после чтения
                  // NOTE: когда overlay_products_v2 включён, getAll() возвращает 360+ (shared+custom),
                  // а не per-client продукты. Используем currentLocal как per-client baseline.
                  const _overlayOnForMem = global.HEYS?.flags?.isEnabled?.('overlay_products_v2');
                  const memoryCount = _overlayOnForMem
                    ? currentLocal.length
                    : (global.HEYS?.products?.getAll?.()?.length || 0);
                  if (merged.length === remoteProducts.length && merged.length === currentLocal.length && merged.length >= memoryCount) {
                    if (global.HEYS?.products?.setAll) {
                      global.HEYS.products.setAll(merged, { source: 'cloud-sync', skipNotify: true, skipCloud: true, allowShrink: true });
                      productsUpdated = true;
                      latestProducts = merged;
                      if (!previousProducts) previousProducts = currentLocal || global.HEYS?.products?.getAll?.() || null;
                    } else {
                      ls.setItem(key, JSON.stringify(merged));
                    }
                    return; // Данные одинаковые, нет смысла обновлять облако
                  }

                  // Fallback: сохраняем merged и синхронизируем
                  // 🛡️ v4.8.1: Проверяем что merged не меньше текущего количества в памяти
                  // Это предотвращает race condition когда новые продукты добавлены между чтением и merge
                  // NOTE: когда overlay включён, getAll() возвращает 360+ (shared+overlay merged view).
                  // Per-client products sync работает только с per-client списком → используем currentLocal.
                  const currentInMemory = global.HEYS?.flags?.isEnabled?.('overlay_products_v2')
                    ? currentLocal.length
                    : (global.HEYS?.products?.getAll?.()?.length || 0);
                  if (merged.length < currentInMemory) {
                    // v4.8.2: Разрешаем уменьшение если это дедупликация (разница <= 5%)
                    const shrinkPct = ((currentInMemory - merged.length) / currentInMemory) * 100;
                    if (shrinkPct > 5) {
                      log(`⚠️ [PRODUCTS] Skipping setAll: merged (${merged.length}) significantly < memory (${currentInMemory}), ${shrinkPct.toFixed(1)}%`);
                      return;
                    }
                    log(`🧹 [PRODUCTS] Allowing merge shrink: ${currentInMemory} → ${merged.length} (−${shrinkPct.toFixed(1)}%, dedup)`);
                  }

                  if (global.HEYS?.products?.setAll) {
                    global.HEYS.products.setAll(merged, { source: 'cloud-sync', skipNotify: true, skipCloud: true, allowShrink: true });
                    productsUpdated = true;
                    latestProducts = merged;
                    if (!previousProducts) previousProducts = currentLocal || global.HEYS?.products?.getAll?.() || null;
                  } else {
                    ls.setItem(key, JSON.stringify(merged));
                  }
                  return;
                }
              }

              // 🔄 Миграция: конвертируем устаревшие поля тренировок (quality/feelAfter → mood/wellbeing/stress)
              if (key.includes('dayv2_') && row.v?.trainings?.length) {
                let migrated = false;
                row.v.trainings = row.v.trainings.map(t => {
                  // Если есть старые поля — мигрируем их значения в новые
                  if (t.quality !== undefined || t.feelAfter !== undefined) {
                    migrated = true;
                    const { quality, feelAfter, ...rest } = t;
                    return {
                      ...rest,
                      // Конвертируем: quality → mood, feelAfter → wellbeing
                      // Если новые поля уже есть — приоритет им
                      mood: rest.mood ?? quality ?? 5,
                      wellbeing: rest.wellbeing ?? feelAfter ?? 5,
                      stress: rest.stress ?? 5  // дефолт для stress (нейтральное значение)
                    };
                  }
                  return t;
                });
                if (migrated) {
                  log(`  🔄 Migrated training fields for ${key}`);
                }
              }

              // 🔄 Миграция: добавляем inline данные к старым MealItems (если нет kcal100)
              // Это гарантирует что калории считаются даже если продукт удалён из базы
              if (key.includes('dayv2_') && row.v?.meals?.length) {
                // Получаем продукты для поиска
                let productsForMigration = null;
                try {
                  // Пытаемся получить из HEYS.store (актуальные данные)
                  if (global.HEYS?.store?.get) {
                    productsForMigration = global.HEYS.store.get('heys_products', []);
                  }
                  // Fallback: читаем из localStorage по scoped key.
                  // Используем decompress — голый JSON.parse молча падает на
                  // сжатых ¤Z¤ данных и миграция нутриентов пропускается.
                  if (!productsForMigration || productsForMigration.length === 0) {
                    const scopedProductsKey = key.replace(/dayv2_.*/, 'products');
                    const rawProducts = ls.getItem(scopedProductsKey);
                    if (rawProducts) {
                      productsForMigration = global.HEYS?.store?.decompress
                        ? global.HEYS.store.decompress(rawProducts)
                        : JSON.parse(rawProducts);
                    }
                  }
                } catch (e) { productsForMigration = []; }

                if (Array.isArray(productsForMigration) && productsForMigration.length > 0) {
                  // Создаём индексы продуктов по ID и по названию
                  const productsById = new Map();
                  const productsByName = new Map();
                  productsForMigration.forEach(p => {
                    if (p && p.id) productsById.set(String(p.id), p);
                    if (p && p.name) {
                      const name = String(p.name).trim();
                      if (name) productsByName.set(name, p);
                    }
                  });

                  let itemsMigrated = 0;
                  row.v.meals = row.v.meals.map(meal => {
                    if (!meal || !Array.isArray(meal.items)) return meal;

                    const migratedItems = meal.items.map(item => {
                      // Если уже есть inline kcal100 — пропускаем
                      if (item.kcal100 !== undefined) return item;

                      // Ищем продукт сначала по названию, потом по product_id
                      const itemName = String(item.name || '').trim();
                      let product = itemName ? productsByName.get(itemName) : null;
                      if (!product) {
                        const productId = String(item.product_id || item.id || '');
                        product = productId ? productsById.get(productId) : null;
                      }

                      if (product && product.kcal100 !== undefined) {
                        itemsMigrated++;
                        return {
                          ...item,
                          kcal100: product.kcal100,
                          protein100: product.protein100,
                          fat100: product.fat100,
                          simple100: product.simple100,
                          complex100: product.complex100,
                          badFat100: product.badFat100,
                          goodFat100: product.goodFat100,
                          trans100: product.trans100,
                          fiber100: product.fiber100,
                          gi: product.gi ?? product.gi100,
                          harm: product.harm ?? product.harm100
                        };
                      }
                      return item;
                    });

                    return { ...meal, items: migratedItems };
                  });

                  if (itemsMigrated > 0) {
                    logCritical(`  🔄 [MIGRATION] Added inline data to ${itemsMigrated} items in ${key}`);

                    // 🔄 Сохраняем мигрированные данные обратно в облако
                    const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
                    if (dateMatch) {
                      const dayKey = `heys_dayv2_${dateMatch[1]}`;
                      row.v.updatedAt = Date.now();
                      const migrationUpsertObj = {
                        client_id: client_id,
                        k: dayKey,
                        v: row.v,
                        updated_at: new Date().toISOString()
                      };
                      clientUpsertQueue.push(migrationUpsertObj);
                      scheduleClientPush();
                    }
                  }
                }
              }

              // Для products используем отфильтрованные данные (уже обработаны выше)
              // Если дошли сюда — значит merge не произошёл (local пуст)
              // Используем remoteProducts которые уже отфильтрованы
              let valueToSave = row.v;

              // 🛡️ v64 FIX: НЕ записываем null/undefined dayv2 в localStorage
              // Cloud может вернуть row.v = null → JSON.stringify(null) = "null" → getDayData ломается
              if (key.includes('dayv2_') && (valueToSave == null || valueToSave === 'null')) {
                logCritical(`🛡️ [BOOTSTRAP] SKIP NULL dayv2: ${key}`);
                return; // skip — null data corrupts getDayData
              }

              if (key.includes('_products') && !key.includes('_products_backup') && !key.includes('_hidden_products') && !key.includes('_favorite_products') && !key.includes('_deleted_products')) {
                // remoteProducts уже отфильтрован выше — используем его
                // Если он пустой и мы дошли сюда — значит recovery уже запущен выше
                // Но на всякий случай проверим ещё раз
                if (typeof remoteProducts !== 'undefined') {
                  valueToSave = remoteProducts;
                  if (valueToSave.length === 0) {
                    // Не сохраняем пустой массив — recovery уже запущен
                    log(`⚠️ [PRODUCTS] Skipping save of 0 products (recovery should handle this)`);
                    return;
                  }

                  // 🛡️ КРИТИЧНО: Проверяем локальные продукты ПЕРЕД перезаписью
                  // Если локальных БОЛЬШЕ чем remote — это значит:
                  // 1. Пользователь восстановил продукты из штампов
                  // 2. Но они не успели отправиться в облако (network error)
                  // 3. Cloud sync пытается затереть их старыми данными из облака
                  // РЕШЕНИЕ: НЕ перезаписываем, отправляем локальные в облако
                  let currentLocalProducts = null;
                  try {
                    const rawLocal = ls.getItem(key);
                    if (rawLocal) {
                      const parsed = tryParse(rawLocal);
                      currentLocalProducts = Array.isArray(parsed)
                        ? parsed.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0)
                        : null;
                    }
                  } catch (e) { }

                  if (Array.isArray(currentLocalProducts) && currentLocalProducts.length > valueToSave.length) {
                    logCritical(`🛡️ [PRODUCTS FALLBACK] BLOCKED: local (${currentLocalProducts.length}) > remote (${valueToSave.length}). Keeping local, pushing to cloud.`);
                    // Отправляем локальные в облако
                    const pushObj = {
                      client_id: client_id,
                      k: normalizeKeyForSupabase(row.k, client_id),
                      v: currentLocalProducts,
                      updated_at: new Date().toISOString()
                    };
                    clientUpsertQueue.push(pushObj);
                    scheduleClientPush();
                    return; // НЕ перезаписываем localStorage
                  }
                }
              }

              if (key.includes('_products') && !key.includes('_products_backup') && !key.includes('_hidden_products') && !key.includes('_favorite_products') && !key.includes('_deleted_products') && global.HEYS?.products?.setAll) {
                // �️ КРИТИЧНО: Если products уже обновлены в этом sync цикле — ПРОПУСКАЕМ
                // Это защита от случая когда в БД несколько записей с products (разные row.k)
                // которые все мапятся на один scoped key
                if (productsUpdated) {
                  return;
                }

                // 🛡️ BACKUP GUARD: если remote слишком мал, а backup больше — используем backup
                if (Array.isArray(valueToSave) && valueToSave.length <= 1) {
                  const backupSnapshot = global.HEYS?.utils?.lsGet?.('heys_products_backup', null);
                  const backupData = Array.isArray(backupSnapshot?.data)
                    ? backupSnapshot.data.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0)
                    : null;

                  if (Array.isArray(backupData) && backupData.length > valueToSave.length) {
                    logCritical(`🛡️ [PRODUCTS BACKUP] BLOCKED: remote (${valueToSave.length}) too small, restoring backup (${backupData.length})`);
                    global.HEYS.products.setAll(backupData, { source: 'backup-guard', skipNotify: true, skipCloud: true });
                    productsUpdated = true;
                    latestProducts = backupData;

                    const pushObj = {
                      client_id: client_id,
                      k: normalizeKeyForSupabase(row.k, client_id),
                      v: backupData,
                      updated_at: new Date().toISOString()
                    };
                    clientUpsertQueue.push(pushObj);
                    scheduleClientPush();
                    return;
                  }
                }

                // 🛡️ ДОП. ЗАЩИТА: не перезаписываем, если in-memory база больше remote
                // v60 FIX: Проверяем ОБА источника — memory И localStorage напрямую!
                if (Array.isArray(valueToSave)) {
                  const inMemoryProducts = global.HEYS?.products?.getAll?.() || [];

                  // Проверяем localStorage напрямую (может быть новее чем memory cache)
                  let localStorageProducts = [];
                  try {
                    const rawLocal = ls.getItem(key);
                    if (rawLocal) {
                      const parsed = tryParse(rawLocal);
                      if (Array.isArray(parsed)) {
                        localStorageProducts = parsed.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0);
                      }
                    }
                  } catch (e) { /* ignore */ }

                  // Берём МАКСИМУМ из обоих источников
                  const currentMax = Math.max(inMemoryProducts.length, localStorageProducts.length);

                  if (currentMax > valueToSave.length) {
                    logCritical(`🛡️ [PRODUCTS] BLOCKED: local max (${currentMax}) > remote (${valueToSave.length}). Memory: ${inMemoryProducts.length}, localStorage: ${localStorageProducts.length}`);
                    // Используем тот источник который больше
                    const bestLocal = inMemoryProducts.length >= localStorageProducts.length ? inMemoryProducts : localStorageProducts;
                    const pushObj = {
                      client_id: client_id,
                      k: normalizeKeyForSupabase(row.k, client_id),
                      v: bestLocal,
                      updated_at: new Date().toISOString()
                    };
                    clientUpsertQueue.push(pushObj);
                    scheduleClientPush();
                    return;
                  }
                }

                // v4.8.5: DEBUG - что записываем в setAll после merge
                const setAllIron = valueToSave.filter(p => p && p.iron && +p.iron > 0).length;
                const setAllTs = valueToSave.filter(p => p && p.updatedAt).length;
                logCritical(`📝 [SETALL DEBUG] About to call setAll with ${valueToSave.length} products: withIron=${setAllIron}, withTimestamp=${setAllTs}`);

                global.HEYS.products.setAll(valueToSave, { source: 'cloud-sync', skipNotify: true, skipCloud: true });
                productsUpdated = true;
                latestProducts = valueToSave;
              } else {
                // 🛡️ v60 FIX: ЗАЩИТА DAYV2 — не перезаписываем локальные данные старыми из cloud
                if (key.includes('dayv2_')) {
                  const incomingUpdatedAt = valueToSave?.updatedAt || 0;
                  try {
                    const existingRaw = ls.getItem(key);
                    if (existingRaw) {
                      const existing = tryParse(existingRaw);
                      const existingUpdatedAt = existing?.updatedAt || 0;

                      if (existingUpdatedAt > incomingUpdatedAt) {
                        logCritical(`🛡️ [DAYV2] BLOCKED localStorage overwrite: local (${existingUpdatedAt}) > remote (${incomingUpdatedAt}) for ${key}`);
                        // Не перезаписываем! Локальные данные новее.
                        // Push локальные данные обратно в cloud чтобы синхронизировать
                        const pushObj = {
                          client_id: client_id,
                          k: normalizeKeyForSupabase(row.k, client_id),
                          v: existing,
                          updated_at: new Date().toISOString()
                        };
                        clientUpsertQueue.push(pushObj);
                        scheduleClientPush();
                        return; // Пропускаем запись
                      }
                    }
                  } catch (e) { /* ignore parse errors */ }
                }

                // 🛡️ Anti-empty-profile guard (симметрично с Phase A ~6410, delta-light ~6699,
                // saveClientKey ~9893): не клобберим валидный local профиль пустым из cloud.
                const _isProfileKeyHeavy = row.k === 'heys_profile' || /^heys_[0-9a-f-]+_profile$/i.test(row.k || '');
                if (_isProfileKeyHeavy) {
                  const _isValidCloudProfile = valueToSave && typeof valueToSave === 'object' &&
                    (valueToSave.age || valueToSave.weight || valueToSave.height ||
                     valueToSave.firstName || valueToSave.profileCompleted === true);
                  if (!_isValidCloudProfile) {
                    try {
                      const _existingRaw = ls.getItem(key);
                      if (_existingRaw) {
                        const _decompressFn = global.HEYS?.store?.decompress;
                        const _existing = _decompressFn ? _decompressFn(_existingRaw) : JSON.parse(_existingRaw);
                        if (_existing && typeof _existing === 'object' && Object.keys(_existing).length > 0) {
                          logCritical(`🛡️ [FULL SYNC] BLOCKED empty profile from cloud (${key}); local has ${Object.keys(_existing).length} fields`);
                          return;
                        }
                      }
                    } catch (_) { /* fall through */ }
                  }
                }

                // 🧷 Backup перед возможной перезаписью dayv2
                if (key.includes('dayv2_')) {
                  backupDayV2BeforeOverwrite(key, valueToSave, 'cloud-sync');
                  // 🚀 PERF: Defer dayv2 write to batch — prevents N individual re-renders
                  batchedDayV2Writes.push({ key, valueToSave });
                } else {
                  ls.setItem(key, JSON.stringify(valueToSave));
                  log(`  ✅ Saved to localStorage: ${key}`);
                }
              }

              // � PERF: dayv2 event dispatch moved to batch block after forEach

              // 🧩 Dispatch event for widget_layout updates (для виджетов)
              if (key.includes('widget_layout')) {
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                  // 🔇 PERF: Отключено
                  // logCritical(`🧩 [EVENT] heys:widget-layout-updated dispatched (cloud-sync)`);
                  window.dispatchEvent(new CustomEvent('heys:widget-layout-updated', {
                    detail: { layout: valueToSave, source: 'cloud-sync' }
                  }));
                }
              }

              // Уведомляем приложение об обновлении продуктов — после цикла (батч)

              // 🚀 PERF: duplicate dayv2 event dispatch removed (consolidated in batch block)
            } catch (e) { }
          });
        } // end SYNC_DEDUP_CHUNK for-loop (R23)

        // 🚀 PERF: Batch process all dayv2 writes at once — prevents skeleton flicker
        if (forceWrittenDayV2.length > 0) {
          window.console.info('[HEYS.sinhron] ✅ FORCE_WRITE dayv2 (' + forceWrittenDayV2.length + '):', formatListForSyncLog(forceWrittenDayV2));
        }

        // 🚀 PERF: Force-written dayv2 dates — dispatch ONE batch event instead of N individual
        if (forceWrittenDates.length > 0) {
          cloud._syncCompletedAt = cloud._syncCompletedAt || Date.now();
          // 1. Today fires immediately so the visible day page is always fresh
          const _today = new Date().toISOString().slice(0, 10);
          if (forceWrittenDates.includes(_today)) {
            window.dispatchEvent(new CustomEvent('heys:day-updated', {
              detail: { date: _today, source: 'force-sync', forceReload: true }
            }));
          }
          // 2. Full historical batch is deferred ~300 ms so React can render the post-switch
          //    UI (profile, today, products) before being hit with 100+ historical dates at once.
          //    Days are already in localStorage so non-visible history stays consistent.
          const _frozenDates = forceWrittenDates.slice();
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('heys:day-updated', {
              detail: {
                dates: _frozenDates,
                date: _frozenDates[_frozenDates.length - 1],
                source: 'force-sync',
                forceReload: true,
                batch: true
              }
            }));
            log('📅 [EVENT] heys:day-updated BATCH dispatched (deferred) for ' + _frozenDates.length + ' force-written dates');
          }, 300);
        }

        if (batchedDayV2Writes.length > 0) {
          // 📊 Логируем сегодняшний dayv2 перед batch write
          const _bwToday = new Date().toISOString().slice(0, 10);
          batchedDayV2Writes.forEach(({ key: bwKey, valueToSave: bwVal }) => {
            if (bwKey.includes('dayv2_' + _bwToday)) {
              const _bwMeals = Array.isArray(bwVal?.meals) ? bwVal.meals.length : 0;
              const _bwKcal = bwVal?.savedEatenKcal || 0;
              const _bwMealNames = Array.isArray(bwVal?.meals) ? bwVal.meals.map(m => m.name + '(' + (m.items?.length || 0) + ')').join(', ') : 'none';
              window.console.info('[HEYS.sinhron] 📝 BATCH_WRITE dayv2 СЕГОДНЯ: meals=' + _bwMeals + ' kcal=' + _bwKcal + ' [' + _bwMealNames + ']');
            }
          });
          const updatedDates = [];
          // ⚡ PERF: Chunked writes — yield to browser every CHUNK_SIZE writes
          const CHUNK_SIZE = 15;
          const writeChunk = (startIdx) => {
            const end = Math.min(startIdx + CHUNK_SIZE, batchedDayV2Writes.length);
            for (let i = startIdx; i < end; i++) {
              const { key, valueToSave } = batchedDayV2Writes[i];
              const wroteDay = writeDayKeyWithQuotaGuard(key, valueToSave, {
                preserveRecentDuringHydration: true,
                nowTs: now
              });
              if (!wroteDay) {
                skippedDayMirrorKeys.push(key);
                continue;
              }
              if (global.HEYS?.store?.invalidate) {
                global.HEYS.store.invalidate(key);
              }
              const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
              if (dateMatch) updatedDates.push(dateMatch[1]);
            }
            return end;
          };
          // Write first chunk synchronously (today + recent days — most critical)
          let cursor = writeChunk(0);
          // Remaining chunks deferred via setTimeout(0) to yield main thread
          const writeRemaining = () => {
            return new Promise(resolve => {
              const step = () => {
                if (cursor >= batchedDayV2Writes.length) { resolve(); return; }
                cursor = writeChunk(cursor);
                setTimeout(step, 0);
              };
              if (cursor >= batchedDayV2Writes.length) { resolve(); return; }
              setTimeout(step, 0);
            });
          };
          await writeRemaining();
          window.console.info(
            '[HEYS.sinhron] ✅ BATCH WRITE ' + batchedDayV2Writes.length + ' dayv2 records (chunked):',
            updatedDates.length > 0
              ? formatListForSyncLog(updatedDates)
              : '(none mirrored locally — quota guard / skipped writes; see dayv2 quota warnings above)'
          );
          // � FIX v65: Помечаем sync завершённым ДО heys:day-updated, чтобы cascade pre-sync guard
          // не блокировал recompute: когда renderCard вызывается из day-updated обработчика,
          // _cascadeSyncDone=true → cache MISS → computeCascadeState с реальной историей → CRS ≠ null → bar settling
          cloud._syncCompletedAt = cloud._syncCompletedAt || Date.now();
          // �🔔 Dispatch ONE batched event instead of N individual events
          if (updatedDates.length > 0) {
            window.dispatchEvent(new CustomEvent('heys:day-updated', {
              detail: { dates: updatedDates, date: updatedDates[updatedDates.length - 1], source: 'cloud-sync', batch: true }
            }));
            log('📅 [EVENT] heys:day-updated BATCH dispatched for ' + updatedDates.length + ' dates (cloud-sync)');
          }
        }

        // 🧹 Legacy/nested client-scope ключи убираются в switchClient, не в sync.

        if (skippedDayMirrorKeys.length > 0) {
          window.console.warn('[HEYS.sinhron] ⚠️ dayv2 оставлены только в cloud из-за quota (' + skippedDayMirrorKeys.length + '):', skippedDayMirrorKeys.join(', '));
        }

        if (productsUpdated && Array.isArray(latestProducts)) {
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            // boot_optimized_v1 / S4: bump content-version counter so React useMemo
            // dependents (prodRec.findAlternative et al.) invalidate even when the
            // products array reference is reused across overlay/HOT-sync writes.
            try {
              window.HEYS = window.HEYS || {};
              window.HEYS.products = window.HEYS.products || {};
              window.HEYS.products.contentVersion = (window.HEYS.products.contentVersion || 0) + 1;
            } catch (_) { /* noop */ }
            window.dispatchEvent(new CustomEvent('heys:products-updated', {
              detail: { products: latestProducts, previousProducts, count: latestProducts.length, source: 'cloud-sync' }
            }));
            window.dispatchEvent(new CustomEvent('heysProductsUpdated', {
              detail: { products: latestProducts, previousProducts, count: latestProducts.length, source: 'cloud-sync' }
            }));
          }
        }

        muteMirror = false;
        cloud._lastClientSync = { clientId: client_id, ts: now };

        const syncDuration = Math.round(performance.now() - syncStartTime);

        try { maybeCleanupDuplicateKeys(); } catch (_) { }

        // ── [HEYS.sinhron] ИТОГ: состояние dayv2 в localStorage ПОСЛЕ синхронизации ──
        if (shouldRunDeepSyncDiagnostics()) {
          const postSyncDayKeys = [];
          const postSyncDateCount = {};
          const postSyncDuplicateDetails = [];
          for (let lsi = 0; lsi < ls.length; lsi++) {
            const lsk = ls.key(lsi);
            if (lsk && lsk.includes('dayv2_') && !lsk.includes('dayv2_backup_') && lsk.includes(client_id)) {
              const psdm = lsk.match(/(\d{4}-\d{2}-\d{2})/);
              if (psdm) {
                const dateStr = psdm[1];
                try {
                  const _rawItog = ls.getItem(lsk);
                  const dayVal = tryParse(_rawItog);
                  const meals = dayVal?.meals?.length || 0;
                  postSyncDayKeys.push(dateStr + '(' + meals + 'm)');
                  postSyncDateCount[dateStr] = (postSyncDateCount[dateStr] || 0) + 1;
                  if (postSyncDateCount[dateStr] > 1) {
                    postSyncDuplicateDetails.push(lsk + ' meals=' + meals);
                  }
                } catch (_e) {
                  postSyncDayKeys.push(dateStr + '(err)');
                }
              }
            }
          }
          postSyncDayKeys.sort();
          window.console.info('[HEYS.sinhron] 🏁 ИТОГ: dayv2 в localStorage ПОСЛЕ синхронизации (' + postSyncDayKeys.length + '):', formatListForSyncLog(postSyncDayKeys));
          // 📊 Детальный лог для сегодня: meals, kcal, dayTot
          const _postToday = new Date().toISOString().slice(0, 10);
          const _postTodayKey = 'heys_' + client_id + '_dayv2_' + _postToday;
          try {
            const _ptRaw = ls.getItem(_postTodayKey);
            if (_ptRaw) {
              const _ptVal = tryParse(_ptRaw);
              const _ptMeals = Array.isArray(_ptVal?.meals) ? _ptVal.meals.length : 0;
              const _ptKcal = _ptVal?.savedEatenKcal || 0;
              const _ptDayTot = _ptVal?.dayTot;
              const _ptHasDayTot = _ptDayTot && Object.keys(_ptDayTot).length > 0;
              const _ptMealNames = Array.isArray(_ptVal?.meals) ? _ptVal.meals.map(m => m.name + '(' + (m.items?.length || 0) + ')').join(', ') : '-';
              window.console.info('[HEYS.sinhron] 📊 СЕГОДНЯ (' + _postToday + ') ИТОГ: meals=' + _ptMeals + ' kcal=' + _ptKcal + ' hasDayTot=' + _ptHasDayTot + ' [' + _ptMealNames + ']');
              if (!_ptHasDayTot && _ptMeals > 0) {
                window.console.warn('[HEYS.sinhron] ⚠️ СЕГОДНЯ: есть meals=' + _ptMeals + ' но dayTot ПУСТОЙ — UI может показать неверные данные до пересчёта');
              }
            } else {
              window.console.warn('[HEYS.sinhron] ⚠️ СЕГОДНЯ (' + _postToday + '): ключ dayv2 НЕ НАЙДЕН в localStorage');
            }
          } catch (_) { }
          if (postSyncDuplicateDetails.length > 0) {
            window.console.warn('[HEYS.sinhron] 🐛 ДУБЛИКАТЫ dayv2 в localStorage (' + postSyncDuplicateDetails.length + '):', postSyncDuplicateDetails.join(' | '));
            // Также логируем ВСЕ ключи с дублирующимися датами
            const dupDates = Object.entries(postSyncDateCount).filter(([, c]) => c > 1).map(([d]) => d);
            for (const dd of dupDates) {
              const allKeysForDate = [];
              for (let lsi = 0; lsi < ls.length; lsi++) {
                const lsk = ls.key(lsi);
                if (lsk && lsk.includes('dayv2_' + dd) && lsk.includes(client_id)) {
                  try {
                    const dv = JSON.parse(ls.getItem(lsk));
                    allKeysForDate.push(lsk + ' meals=' + (dv?.meals?.length || 0) + ' updatedAt=' + (dv?.updatedAt || 0));
                  } catch (_) {
                    allKeysForDate.push(lsk + ' (parse error)');
                  }
                }
              }
              window.console.warn('[HEYS.sinhron] 🐛 Дата ' + dd + ' ключи:', allKeysForDate.join(' | '));
            }
          }
        }
        // ───────────────────────────────────────────────────────────────────────

        // 🧹 Очистка старых backup-ключей dayv2 (старше 24ч)
        try {
          const backupMaxAge = 24 * 60 * 60 * 1000; // 24ч
          const backupKeysToRemove = [];
          for (let lsi = 0; lsi < ls.length; lsi++) {
            const lsk = ls.key(lsi);
            if (lsk && lsk.includes('dayv2_backup_') && lsk.includes(client_id)) {
              try {
                const bv = JSON.parse(ls.getItem(lsk));
                if (bv?.ts && (Date.now() - bv.ts) > backupMaxAge) {
                  backupKeysToRemove.push(lsk);
                }
              } catch (_) { backupKeysToRemove.push(lsk); }
            }
          }
          if (backupKeysToRemove.length > 0) {
            backupKeysToRemove.forEach(k => ls.removeItem(k));
            window.console.info('[HEYS.sinhron] 🧹 Удалено ' + backupKeysToRemove.length + ' старых backup dayv2 ключей');
          }
        } catch (_) { }

        // 🛡️ v64 FIX: Очистка "null" значений dayv2 из localStorage
        // Cloud иногда возвращает row.v = null → JSON.stringify(null) = "null" → getDayData ломается
        try {
          const nullKeysToRemove = [];
          for (let lsi = 0; lsi < ls.length; lsi++) {
            const lsk = ls.key(lsi);
            if (lsk && lsk.includes('dayv2_') && !lsk.includes('dayv2_backup_') && lsk.includes(client_id)) {
              const rawVal = ls.getItem(lsk);
              if (rawVal === 'null' || rawVal === 'undefined' || rawVal === '') {
                nullKeysToRemove.push(lsk);
              }
            }
          }
          if (nullKeysToRemove.length > 0) {
            nullKeysToRemove.forEach(k => ls.removeItem(k));
            window.console.info('[HEYS.sinhron] 🧹 Удалено ' + nullKeysToRemove.length + ' dayv2 ключей с null/undefined/empty значением:', nullKeysToRemove.join(', '));
          }
        } catch (_) { }

        // 🚨 Критический лог: первая синхронизация завершена
        if (!initialSyncCompleted) {
          console.info(`[HEYS.sync] ✅ Синхронизация завершена: ${data?.length || 0} ключей для клиента ${client_id.slice(0, 8)}***`);
        }

        logCritical(`✅ [SYNC DONE] client=${client_id.slice(0, 8)} keys=${data?.length || 0} ms=${syncDuration} force=${!!forceSync}`);
        addSyncLogEntry('download_ok', { n: data?.length || 0, ms: syncDuration, mode: isForceDelta ? 'forceDelta' : isDeltaFastPath ? 'deltaFast' : 'full', via: 'rpc', force: !!forceSync });

        // 🚨 Разрешаем сохранение после первого sync
        initialSyncCompleted = true;
        cloud._syncCompletedAt = Date.now(); // ⏱️ Grace period: 10 сек без re-upload products
        cloud._productsFingerprint = null; // 🔄 Delta-sync: сбрасываем чтобы первый реальный изменение прошло
        cancelFailsafeTimer(); // Отменяем failsafe — sync успешен

        // 🧹 Deferred cleanup: при delta/forceDelta cleanup был пропущен — делаем после sync
        if (isDeltaFastPath || isForceDelta) {
          setTimeout(() => {
            try { cloud.cleanupProducts(); } catch (_) { }
          }, 2000);
        }

        // 🔄 КРИТИЧНО: Инвалидируем memory-кэш Store после прямой записи в localStorage
        // Иначе lsGet() вернёт устаревшие данные из кэша при pull-to-refresh
        if (global.HEYS?.store?.flushMemory) {
          global.HEYS.store.flushMemory();
        }

        // 🧹 Однократная очистка облака от невалидных продуктов (после первой синхронизации)
        if (!cloud._cloudCleanupDone) {
          cloud._cloudCleanupDone = true;
          setTimeout(() => {
            cloud.cleanupCloudProducts().then(result => {
              if (result.cleaned > 0) {
                logCritical(`☁️ [AUTO CLOUD CLEANUP] Cleaned ${result.cleaned} invalid products from cloud`);
              }
            }).catch(e => {
              console.error('[AUTO CLOUD CLEANUP] Error:', e);
            });
          }, 2000); // Задержка 2 сек чтобы не блокировать UI
        }

        const runNonCriticalPostSyncTail = async () => {
          // � v6: Shared products теперь грузятся ПАРАЛЛЕЛЬНО с sync (см. начало _syncInProgress)
          // Для client switch НЕ блокируем возврат в gate/shell: shared products и deleted sync
          // не критичны для отображения нового клиента.
          if (_sharedProductsPromise) {
            await _sharedProductsPromise;
            _sharedProductsPromise = null;
          }

          // 🆕 v4.8.0: Синхронизация игнор-листа удалённых продуктов с облаком
          // Это предотвращает "воскрешение" удалённых продуктов на других устройствах
          if (global.HEYS?.deletedProducts?.exportForSync) {
            const deletedListKey = `heys_${client_id}_deleted_products`;
            try {
              // Пробуем загрузить из облака
              const { data: cloudDeleted, error: deletedError } = await YandexAPI.from('client_kv_store')
                .select('v')
                .eq('client_id', client_id)
                .eq('k', deletedListKey);

              const deletedRow = Array.isArray(cloudDeleted) ? cloudDeleted[0] : cloudDeleted;
              if (!deletedError && deletedRow?.v) {
                // Мержим облачные с локальными
                const imported = global.HEYS.deletedProducts.importFromSync(deletedRow.v);
                if (imported > 0) {
                  logCritical(`☁️ [DELETED SYNC] Merged ${imported} deleted products from cloud`);
                }
              }

              // Отправляем локальный список в облако
              const localExport = global.HEYS.deletedProducts.exportForSync();
              if (Object.keys(localExport.entries).length > 0) {
                const upsertObj = {
                  client_id: client_id,
                  k: deletedListKey,
                  v: localExport,
                  updated_at: new Date().toISOString()
                };
                clientUpsertQueue.push(upsertObj);
                scheduleClientPush();
                logCritical(`☁️ [DELETED SYNC] Queued ${Object.keys(localExport.entries).length / 2} deleted products for cloud sync`);
              }
            } catch (e) {
              console.warn('[DELETED SYNC] Error:', e);
            }
          }
        };

        if (options?.deferNonCriticalTail) {
          logCritical(`[HEYS.sync] ⏭️ Deferring non-critical post-sync tail for ${client_id?.slice(0, 8)}...`);
          setTimeout(() => {
            runNonCriticalPostSyncTail().catch((tailErr) => {
              console.warn('[HEYS.sync] ⚠️ Deferred post-sync tail failed:', tailErr?.message || tailErr);
            });
          }, 0);
        } else {
          await runNonCriticalPostSyncTail();
        }

        // Уведомляем приложение о завершении синхронизации (для обновления stepsGoal и т.д.)
        // ВСЕГДА отправляем событие — дедупликация на стороне получателя (проверка clientId)
        // v6.0: phase:'full' — Adaptive Render Gate отличает полный sync от Phase A
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('heysSyncCompleted', { detail: { clientId: client_id, phase: 'full' } }));
        }

        // 🚀 Delta Sync: сохраняем timestamp для следующего delta sync
        try {
          ls.setItem(`heys_${client_id}_last_sync_ts`, new Date().toISOString());
        } catch (_) { }

        return { success: true, status: 'updated', keys: data?.length || 0, durationMs: syncDuration, force: !!forceSync };
      } catch (e) {
        // Критический лог ошибки синхронизации (всегда видим)
        logCritical('❌ Ошибка синхронизации:', e.message || e);
        err('❌ [CLIENT_SYNC] Exception:', e);
        muteMirror = false;
        // Пробрасываем ошибку чтобы внешний .catch() мог её обработать
        throw e;
      } finally {
        // Сбрасываем флаг sync in progress
        _syncInProgress = null;
      }
    })(); // end of IIFE

    return _syncInProgress;
  };

  cloud.getCurrentClientId = function () {
    try {
      const raw = global.localStorage.getItem('heys_client_current');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      // уже строка без JSON
      return global.localStorage.getItem('heys_client_current');
    }
  };

  cloud.isAuthenticated = function () {
    if (status !== CONNECTION_STATUS.ONLINE) return false;
    if (user) return true;
    // PIN / phone session: cloudUser is null but Yandex REST + fetchDays still work.
    // Without this, useSmartPrefetch never pulls nearby days and the diary feels "empty offline".
    if (_pinAuthClientId != null) return true;
    return false;
  };

  let _fetchDaysBackoffUntil = 0;
  const _fetchDaysInFlight = new Map();

  // Parallel fetchDays (bootstrap + prefetch + stats) used different inflight keys → N UI events.
  // Coalesce notifications within a short window so DayTab does one heavy apply per burst.
  let _fetchDaysNotifyTimer = null;
  let _fetchDaysNotifyClientId = null;
  const _fetchDaysNotifyDates = new Set();
  const flushFetchDaysUiNotify = () => {
    if (_fetchDaysNotifyTimer) {
      clearTimeout(_fetchDaysNotifyTimer);
      _fetchDaysNotifyTimer = null;
    }
    if (_fetchDaysNotifyDates.size === 0) return;
    const uniqueDates = [..._fetchDaysNotifyDates].sort();
    _fetchDaysNotifyDates.clear();
    const cid = _fetchDaysNotifyClientId;
    _fetchDaysNotifyClientId = null;
    log(`[fetchDays] Notifying UI about ${uniqueDates.length} updated days (coalesced from parallel fetches)`);
    global.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: {
        date: uniqueDates[0] || null,
        dates: uniqueDates,
        batch: true,
        source: 'fetchDays',
        forceReload: true,
        clientId: cid || undefined
      }
    }));
  };
  const scheduleFetchDaysUiNotify = (clientId, uniqueDates) => {
    if (!Array.isArray(uniqueDates) || uniqueDates.length === 0) return;
    const cId = clientId || null;
    if (_fetchDaysNotifyClientId && cId && _fetchDaysNotifyClientId !== cId) {
      flushFetchDaysUiNotify();
    }
    _fetchDaysNotifyClientId = cId || _fetchDaysNotifyClientId;
    uniqueDates.forEach((d) => {
      if (d) _fetchDaysNotifyDates.add(String(d));
    });
    if (_fetchDaysNotifyTimer) return;
    _fetchDaysNotifyTimer = setTimeout(() => {
      _fetchDaysNotifyTimer = null;
      flushFetchDaysUiNotify();
    }, 140);
  };

  cloud.fetchDays = async function (dates) {
    // YandexAPI не требует client/user — работает через API Gateway
    if (!Array.isArray(dates) || dates.length === 0) return [];
    const clientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
    if (!clientId) return [];
    if (typeof cloud.isSyncPaused === 'function' && cloud.isSyncPaused()) return [];

    const stableDates = [...new Set(dates.filter(Boolean).map(String))].sort();
    const inflightKey = `${clientId}:${stableDates.join('|')}`;
    if (_fetchDaysInFlight.has(inflightKey)) {
      return _fetchDaysInFlight.get(inflightKey);
    }
    const runFetchDays = async () => {
      const now = Date.now();
      if (_fetchDaysBackoffUntil > now) {
        log(`[fetchDays] backoff active (${_fetchDaysBackoffUntil - now}ms), skip`);
        return [];
      }

      // 🔧 FIX: Ключи в базе могут быть как нормализованные, так и scoped (c clientId)
      const dayKeys = stableDates.map((d) => `heys_dayv2_${d}`);
      const scopedDayKeys = stableDates.map((d) => `heys_${clientId}_dayv2_${d}`);
      const keysToFetch = [...new Set([...dayKeys, ...scopedDayKeys])];
      const CHUNK_SIZE = 10;
      const MAX_RETRIES = 2;
      const chunks = [];
      for (let i = 0; i < keysToFetch.length; i += CHUNK_SIZE) {
        chunks.push(keysToFetch.slice(i, i + CHUNK_SIZE));
      }

      const mergedData = [];
      const isRetryableError = (error) => {
        const status = Number(error?.status || error?.code || 0);
        if (status === 429 || status === 502 || status === 503 || status === 504) return true;
        const msg = String(error?.message || '').toLowerCase();
        return msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('gateway') || msg.includes('timeout');
      };

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunkKeys = chunks[ci];
        let attempt = 0;
        let chunkDone = false;
        while (!chunkDone && attempt <= MAX_RETRIES) {
          const { data, error } = await YandexAPI.from('client_kv_store')
            .select('k,v,updated_at')
            .eq('client_id', clientId)
            .in('k', chunkKeys);
          if (!error) {
            if (Array.isArray(data) && data.length > 0) mergedData.push(...data);
            chunkDone = true;
            break;
          }
          attempt += 1;
          if (!isRetryableError(error) || attempt > MAX_RETRIES) {
            err('fetchDays select', error);
            if (isRetryableError(error)) {
              const cooldownMs = 3500 + Math.floor(Math.random() * 1500);
              _fetchDaysBackoffUntil = Date.now() + cooldownMs;
              console.warn('[HEYS.sync] fetchDays backoff armed', { cooldownMs, chunks: chunks.length, failedChunk: ci + 1 });
            }
            chunkDone = true;
            break;
          }
          const retryDelayMs = Math.min(1800, 400 * attempt + Math.floor(Math.random() * 220));
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }

      const data = mergedData;
      const ls = global.localStorage;
      muteMirror = true;

      // 🔧 v3.19.1: Собираем даты для batch-события (вместо 11 отдельных)
      const updatedDates = [];

      (data || []).forEach((row) => {
        try {
          const originalKey = row.k || '';
          const isDayKey = originalKey.includes('dayv2_');

          // 🔧 FIX: Формируем ключ в формате scoped(k) — heys_{clientId}_...
          // Ключи из базы приходят как "heys_dayv2_2025-12-24" (нормализованные, без clientId)
          // Store.get использует scoped() который добавляет clientId: "heys_{clientId}_dayv2_..."
          const targetKey = clientId ? scopeKeyForClientStorage(originalKey, clientId) : originalKey;

          let localVal = null;
          try {
            localVal = JSON.parse(ls.getItem(targetKey));
          } catch (e2) { }

          // Не затираем непустые дни пустыми ответами ИЛИ данными с меньшим количеством meals
          if (isDayKey) {
            // 🔍 DEBUG: Перечитываем localStorage СЕЙЧАС (не из кэша выше!)
            // Это критично для race condition — localVal мог устареть
            let freshLocalVal = null;
            try {
              freshLocalVal = JSON.parse(ls.getItem(targetKey));
            } catch (e2) { }

            const localMeaningful = isMeaningfulDayData(freshLocalVal);
            const remoteMeaningful = isMeaningfulDayData(row.v);

            // 🛡️ ЗАЩИТА 0: meaningful локальные данные не затираем пустым remote
            if (localMeaningful && !remoteMeaningful) {
              logCritical(`🛡️ [fetchDays] KEEP LOCAL: meaningful local, empty remote for ${targetKey}`);
              return;
            }

            const remoteMealsCount = Array.isArray(row.v?.meals) ? row.v.meals.length : 0;
            const localMealsCount = Array.isArray(freshLocalVal?.meals) ? freshLocalVal.meals.length : 0;
            const remoteHasMeals = remoteMealsCount > 0;
            const localHasMeals = localMealsCount > 0;

            // � v4.7.1: Debug логи отключены

            // 🛡️ ЗАЩИТА 1: Не затираем непустые данные пустыми
            if (!remoteHasMeals && localHasMeals) {
              logCritical(`🛡️ [fetchDays] PROTECTED: Not overwriting local (${localMealsCount} meals) with empty remote`);
              return;
            }

            // 🛡️ ЗАЩИТА 2: Не затираем если local имеет БОЛЬШЕ meals (race condition)
            if (localMealsCount > remoteMealsCount) {
              logCritical(`🛡️ [fetchDays] PROTECTED: Local has MORE meals (${localMealsCount} > ${remoteMealsCount}), keeping local`);
              return;
            }

            // 🛡️ ЗАЩИТА 3: Если одинаковое количество meals — сравниваем по timestamp
            const remoteUpdated = new Date(row.updated_at || 0).getTime();
            const localUpdated = freshLocalVal?.updatedAt || 0;
            if (localUpdated > remoteUpdated) {
              logCritical(`🛡️ [fetchDays] PROTECTED: Local is newer (${localUpdated} > ${remoteUpdated}), keeping local`);
              return;
            }
          }

          // 🔧 FIX 2025-12-26: Декомпрессия данных из cloud
          let valueToStore = row.v;
          if (typeof row.v === 'string' && row.v.startsWith('¤Z¤')) {
            const Store = global.HEYS?.store;
            if (Store && typeof Store.decompress === 'function') {
              valueToStore = Store.decompress(row.v);
              log(`🔧 [fetchDays] Decompressed ${targetKey} from cloud`);
            }
          }

          // 🧷 Backup перед возможной перезаписью dayv2
          if (isDayKey) {
            backupDayV2BeforeOverwrite(targetKey, valueToStore, 'fetchDays');
          }
          const wroteDay = isDayKey
            ? writeDayKeyWithQuotaGuard(targetKey, valueToStore, { preserveRecentDuringHydration: false })
            : safeSetItem(targetKey, JSON.stringify(valueToStore));
          if (!wroteDay) {
            return;
          }

          // 🔧 FIX: Инвалидируем memory кэш Store чтобы следующий lsGet прочитал новые данные
          // Без этого Store.get возвращает старый кэш, игнорируя прямую запись в localStorage
          if (global.HEYS?.store?.invalidate) {
            global.HEYS.store.invalidate(targetKey);
          }

          // 🔧 v3.19.1: Собираем даты вместо отправки отдельных событий
          if (isDayKey && row.v?.date) {
            updatedDates.push(row.v.date);
          }
        } catch (e3) {
          // игнорируем отдельные ошибки записи
        }
      });

      // 🔧 v3.19.1: Отправляем ОДНО batch-событие вместо N отдельных
      // Это значительно уменьшает логи и улучшает производительность
      if (updatedDates.length > 0) {
        // Убираем дубликаты (на случай если API вернул повторяющиеся строки)
        const uniqueDates = [...new Set(updatedDates)];
        log(`[fetchDays] Notifying UI about ${uniqueDates.length} updated days (from ${data?.length || 0} rows)`);
        scheduleFetchDaysUiNotify(clientId, uniqueDates);
      }

      muteMirror = false;
      return data || [];
    };
    const promise = runFetchDays().catch((e) => {
      muteMirror = false;
      err('fetchDays exception', e);
      return [];
    }).finally(() => {
      _fetchDaysInFlight.delete(inflightKey);
    });
    _fetchDaysInFlight.set(inflightKey, promise);
    return promise;
  };

  cloud.shouldSyncClient = function (client_id, maxAgeMs) {
    if (!client_id) return false;
    const rec = cloud._lastClientSync;
    if (!rec || rec.clientId !== client_id) return true;
    return (Date.now() - rec.ts) > (maxAgeMs || 4000);
  };

  // 🔐 Флаг _rpcOnlyMode объявлен выше в секции PIN-авторизации (строка ~99)
  // Функции для совместимости со старым кодом (но используют основную переменную)
  cloud.setRpcOnlyMode = function (enabled) {
    _rpcOnlyMode = enabled;
    if (enabled && _pinAuthClientId) {
      log('🔐 RPC mode enabled for PIN auth client');
    }
  };
  cloud.isRpcOnlyMode = function () { return _rpcOnlyMode; };

  /**
   * 🔐 Определяет, это PIN-авторизация клиента (НЕ куратор)
   * - PIN auth: _pinAuthClientId установлен, user === null
   * - Куратор: user !== null (есть cloudUser после signIn)
   * Используется для UI — показывать ли список клиентов в dropdown
   */
  cloud.isPinAuthClient = function () {
    return _pinAuthClientId != null && user === null;
  };

  // Дебаунсинг для клиентских данных
  /** @type {number} */
  let _clientUpload413BackoffUntil = 0;
  let clientUpsertQueue = loadPendingQueue(PENDING_CLIENT_QUEUE_KEY);
  let clientUpsertInFlightQueue = loadPendingQueue(PENDING_CLIENT_INFLIGHT_QUEUE_KEY);
  const restoredClientQueueState = restorePersistentQueueState({
    queue: clientUpsertQueue,
    inFlightQueue: clientUpsertInFlightQueue,
    compactQueue: (items) => compactPendingQueue(items, PENDING_CLIENT_QUEUE_KEY),
  });
  clientUpsertQueue = restoredClientQueueState.queue;
  clientUpsertInFlightQueue = [];
  if (restoredClientQueueState.restoredCount > 0) {
    savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
    savePendingQueue(PENDING_CLIENT_INFLIGHT_QUEUE_KEY, clientUpsertInFlightQueue);
    logCritical(`♻️ [SYNC] Restored ${restoredClientQueueState.restoredCount} in-flight client item(s) after reload`);
  }
  // v72: Rows merged into clientUpsertQueue never went through enqueueClientSave — без notify +
  // scheduleClientPush UI и RPC upload стартуют только после случайного data-saved / syncClient.
  try {
    if (clientUpsertQueue.length > 0) {
      queueMicrotask(() => {
        try {
          notifyPendingChange();
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            scheduleClientPush();
          }
        } catch (_) { }
      });
    }
  } catch (_) { }
  let clientUpsertTimer = null;
  /** Debounced cloud enqueue for high-churn cascade DCS history (one upload per burst). */
  const CASCADE_DCS_ENQUEUE_DEBOUNCE_MS = 380;
  const _cascadeDcsEnqueueTimers = new Map();
  const _cascadeDcsEnqueueLatest = new Map();
  let _uploadInProgress = false;  // 🔄 Флаг: данные в процессе отправки (in-flight)
  let _uploadLogTimer = null;
  let _uploadLogBufferedTotal = 0;
  let _uploadLogBufferedBatches = 0;
  const UPLOAD_SUMMARY_LOG_MIN_ITEMS = 5;
  const UPLOAD_SUMMARY_LOG_MIN_BATCHES = 3;
  const UPLOAD_SUMMARY_BUFFER_MS = 2500;

  function flushBufferedUploadLog() {
    if (_uploadLogTimer) {
      clearTimeout(_uploadLogTimer);
      _uploadLogTimer = null;
    }
    if (_uploadLogBufferedTotal <= 0) return;
    const suffix = _uploadLogBufferedBatches > 1 ? ` (${_uploadLogBufferedBatches} батча)` : '';
    logCritical(`[SYNC] ✅ Сохранено в облако: ${_uploadLogBufferedTotal} записей${suffix}`);
    _uploadLogBufferedTotal = 0;
    _uploadLogBufferedBatches = 0;
  }

  function logUploadSummaryBuffered(savedCount) {
    if (!(savedCount > 0)) return;
    _uploadLogBufferedTotal += savedCount;
    _uploadLogBufferedBatches += 1;

    if (savedCount >= UPLOAD_SUMMARY_LOG_MIN_ITEMS || _uploadLogBufferedTotal >= 10) {
      flushBufferedUploadLog();
      return;
    }

    if (_uploadLogTimer) return;
    _uploadLogTimer = setTimeout(() => flushBufferedUploadLog(), UPLOAD_SUMMARY_BUFFER_MS);
  }

  function resetBufferedUploadLog() {
    if (_uploadLogTimer) {
      clearTimeout(_uploadLogTimer);
      _uploadLogTimer = null;
    }
    _uploadLogBufferedTotal = 0;
    _uploadLogBufferedBatches = 0;
  }

  let _uploadInFlightCount = 0;   // 🔄 Кол-во записей в in-flight запросе

  function persistClientQueueDurabilityState() {
    savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
    savePendingQueue(PENDING_CLIENT_INFLIGHT_QUEUE_KEY, clientUpsertInFlightQueue);
  }

  function setClientInFlightBatch(batch) {
    clientUpsertInFlightQueue = compactPendingQueue(
      (Array.isArray(batch) ? batch : []).map((item) => (item && typeof item === 'object') ? { ...item } : item),
      PENDING_CLIENT_QUEUE_KEY,
    );
    persistClientQueueDurabilityState();
    notifyPendingChange();
  }

  function clearClientInFlightBatch(options = {}) {
    clientUpsertInFlightQueue = [];
    savePendingQueue(PENDING_CLIENT_INFLIGHT_QUEUE_KEY, clientUpsertInFlightQueue);
    if (options.notify !== false) {
      notifyPendingChange();
    }
  }

  function requeueClientInFlightBatch(batch, reason) {
    if (isLogoutSuppressionActive()) {
      clearClientInFlightBatch();
      return;
    }
    clientUpsertQueue = requeueInFlightBatch({
      queue: clientUpsertQueue,
      batch: Array.isArray(batch) && batch.length ? batch : clientUpsertInFlightQueue,
      compactQueue: (items) => compactPendingQueue(items, PENDING_CLIENT_QUEUE_KEY),
    });
    clientUpsertInFlightQueue = [];
    persistClientQueueDurabilityState();
    notifyPendingChange();
    if (reason) {
      logCritical(`♻️ [SYNC] Re-queued in-flight client batch (${reason})`);
    }
  }

  /**
   * 🔄 v=34: Выделенная функция upload — используется как с debounce, так и immediately
   * @param {Array} batch - массив items для отправки
   * @returns {Promise<void>}
   */
  async function doClientUpload(batch) {
    if (isLogoutSuppressionActive()) {
      clearClientInFlightBatch({ notify: false });
      _uploadInProgress = false;
      _uploadInFlightCount = 0;
      notifyPendingChange();
      notifySyncCompletedIfDrained();
      return;
    }

    if (!batch.length) {
      clearClientInFlightBatch({ notify: false });
      _uploadInProgress = false;
      _uploadInFlightCount = 0;
      notifySyncCompletedIfDrained();
      return;
    }

    // 🚀 PERF: Serialize uploads — prevent concurrent network congestion & timeouts
    if (_uploadInProgress) {
      clientUpsertQueue = requeueInFlightBatch({
        queue: clientUpsertQueue,
        batch,
        compactQueue: (items) => compactPendingQueue(items, PENDING_CLIENT_QUEUE_KEY),
      });
      persistClientQueueDurabilityState();
      notifyPendingChange();
      console.info('[HEYS.sync] ⏳ Upload serialized: ' + batch.length + ' items re-queued (in-flight: ' + _uploadInFlightCount + ')');
      // Schedule retry after current upload finishes
      scheduleClientPush();
      return;
    }

    // �️ v61 FIX: Исключаем heys_game из обычного sync
    // Gamification модуль синхронизирует свои данные сам с проверкой XP
    const gamificationKeys = ['heys_game', 'heys_gamification', 'heys_sound_settings'];
    const filteredBatch = batch.filter(item => {
      const normalizedKey = item.k?.replace(/^heys_[0-9a-f-]+_/, 'heys_');
      return !gamificationKeys.includes(normalizedKey)
        && !gamificationKeys.includes(item.k)
        && !isLocalOnlyStorageKey(item.k)
        && !isLocalOnlyStorageKey(getPendingQueueLocalStorageKey(item));
    });

    // Если отфильтровали всё — выходим
    if (!filteredBatch.length) {
      clearClientInFlightBatch();
      _uploadInProgress = false;
      _uploadInFlightCount = 0;
      notifySyncCompletedIfDrained();
      return;
    }

    // 🔄 Помечаем что данные "в полёте"
    _uploadInProgress = true;
    _uploadInFlightCount = filteredBatch.length;
    const _uploadStartTs = Date.now();
    // One progress ceiling update per upload attempt (not on every pending-change).
    try {
      updateSyncProgressTotal();
    } catch (_) { /* noop */ }

    // [SYNC] лог — всегда видим в консоли без флага
    const _syncKeys = filteredBatch.map(item => {
      const k = item.k || '';
      return k.replace(/^heys_[0-9a-f]{8}-[0-9a-f-]+_/, 'heys_');
    });
    const _syncKeySummary = Object.entries(
      _syncKeys.reduce((acc, k) => { acc[k] = (acc[k] || 0) + 1; return acc; }, {})
    ).map(([k, n]) => n > 1 ? `${k}×${n}` : k).join(', ');
    addSyncLogEntry('upload_start', { n: filteredBatch.length, keys: _syncKeySummary });
    logCritical(`[SYNC] → отправка ${filteredBatch.length} записей: ${_syncKeySummary}`);

    // 🔬 [HEYS.day-trace] 6c/8 batch upload — dayv2 keys leaving for cloud RIGHT NOW.
    try {
      for (const item of filteredBatch) {
        const k = item && item.k;
        if (typeof k === 'string' && /heys_(?:[0-9a-f-]+_)?dayv2_\d{4}-\d{2}-\d{2}/.test(k)) {
          const v = item && item.v;
          const _meals = (v && Array.isArray(v.meals)) ? v.meals : [];
          const _totalItems = _meals.reduce((acc, m) => acc + ((m && Array.isArray(m.items)) ? m.items.length : 0), 0);
          console.info('[HEYS.day-trace] 6c/8 batch upload outbound', {
            key: k,
            mealsCount: _meals.length,
            totalItems: _totalItems,
            updatedAt: v && v.updatedAt,
            sourceId: v && v._sourceId,
          });
        }
      }
    } catch (_) { /* noop */ }

    // 🔐 v=54 FIX: После миграции на Yandex API — ВСЕГДА используем RPC режим!
    // _rpcOnlyMode = true устанавливается для ВСЕХ (и клиент PIN, и куратор)
    // Supabase SDK удалён — нет смысла проверять client/user для legacy branch
    const canSync = _rpcOnlyMode; // Simplified: только RPC режим работает
    // 🔇 v4.7.1: Debug лог отключён
    if (!canSync) {
      // Вернуть в очередь
      console.warn('⚠️ [UPLOAD] canSync=false, returning batch to queue');
      requeueClientInFlightBatch(filteredBatch, 'sync-disabled');
      _uploadInProgress = false;
      _uploadInFlightCount = 0;
      notifySyncCompletedIfDrained();
      return;
    }

    // Не пытаемся отправить если нет сети — данные уже в localStorage
    if (!navigator.onLine) {
      // Вернуть в очередь для повторной отправки когда сеть появится
      requeueClientInFlightBatch(filteredBatch, 'offline');
      _uploadInProgress = false;
      _uploadInFlightCount = 0;
      incrementRetry();
      // Запланировать повторную попытку с exponential backoff
      scheduleClientPush();
      notifySyncCompletedIfDrained();
      return;
    }

    // Удаляем дубликаты по комбинации client_id+k, оставляя последние значения
    const uniqueBatch = [];
    const seenKeys = new Set();
    for (let i = filteredBatch.length - 1; i >= 0; i--) {
      const item = filteredBatch[i];
      const key = `${item.client_id}:${item.k}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueBatch.unshift(item);
      }
    }

    const _hydratePairs = uniqueBatch.map((orig) => ({ orig, hydrated: hydratePendingQueueItem(orig) }));
    const _failedHydrate = _hydratePairs.filter((p) => !p.hydrated).map((p) => p.orig);
    if (_failedHydrate.length) {
      logQuotaThrottled(
        'client-upload-hydrate-miss',
        `⚠️ [SYNC] Re-queued ${_failedHydrate.length} client item(s) — ref hydrate miss (value not in localStorage yet)`,
      );
      clientUpsertQueue = compactPendingQueue([..._failedHydrate, ...clientUpsertQueue], PENDING_CLIENT_QUEUE_KEY);
      persistClientQueueDurabilityState();
      notifyPendingChange();
    }
    const hydratedBatch = _hydratePairs.filter((p) => p.hydrated).map((p) => p.hydrated);

    if (!hydratedBatch.length) {
      clearClientInFlightBatch({ notify: false });
      _uploadInProgress = false;
      _uploadInFlightCount = 0;
      if (_failedHydrate.length) scheduleClientPush();
      notifySyncCompletedIfDrained();
      return;
    }

    try {
      // ═══════════════════════════════════════════════════════════════
      // 🔐 v=54 FIX: ВСЕГДА используем RPC режим (Yandex API)
      // После миграции на Yandex API — Supabase SDK удалён
      // Условие "&& !user" убрано т.к. куратор тоже имеет user но нужен RPC
      // ═══════════════════════════════════════════════════════════════
      if (_rpcOnlyMode) {
        // Группируем по client_id
        const byClientId = {};
        hydratedBatch.forEach(item => {
          const cid = item.client_id;
          if (!byClientId[cid]) byClientId[cid] = [];
          byClientId[cid].push({ k: item.k, v: item.v, updated_at: item.updated_at });
        });

        // 🔇 v4.7.1: Debug лог отключён

        // Сохраняем каждый клиент отдельно
        let totalSaved = 0;
        let anyError = null;
        let isAuthError = false; // 🔧 v58 FIX: отслеживаем auth ошибки
        for (const [clientId, items] of Object.entries(byClientId)) {
          const result = await cloud.saveClientViaRPC(clientId, items);
          if (isLogoutSuppressionActive()) {
            clearClientInFlightBatch({ notify: false });
            _uploadInProgress = false;
            _uploadInFlightCount = 0;
            persistClientQueueDurabilityState();
            notifyPendingChange();
            notifySyncCompletedIfDrained();
            return;
          }
          if (result.success) {
            totalSaved += result.saved || items.length;
          } else {
            anyError = result.error;
            // 🔧 v58 FIX: Проверяем auth ошибку — НЕ retry в этом случае!
            if (anyError === 'No auth token available' || anyError === 'No session token') {
              isAuthError = true;
            }
            // Вернуть в очередь
            items.forEach(item => clientUpsertQueue.push({ ...item, client_id: clientId }));
          }
        }

        if (anyError) {
          logCritical(`[SYNC] ❌ Ошибка отправки: ${anyError}`);
          addSyncLogEntry('upload_error', { keys: _syncKeySummary, err: String(anyError).slice(0, 80), auth: isAuthError });
          if (/413|payload too large|request entity too large/i.test(String(anyError))) {
            _clientUpload413BackoffUntil = Date.now() + 45000;
            try {
              if (global.HEYS?.debug?.bumpSmoothnessCounter) global.HEYS.debug.bumpSmoothnessCounter('client_upload_413');
            } catch (_) { /* noop */ }
            logCritical(`🧊 [SYNC] 413 backoff: delaying client push ~45s to avoid RPC retry storm`);
          }
          incrementRetry();
          clearClientInFlightBatch({ notify: false });
          persistClientQueueDurabilityState();
          notifyPendingChange();

          // 🔧 v58 FIX: При auth ошибке НЕ планируем retry — бесполезно без токена!
          // Данные останутся в очереди и отправятся когда появится токен (после логина)
          if (isAuthError) {
            console.warn('⚠️ [UPLOAD] Auth error, NOT retrying — waiting for login');
          } else if (shouldScheduleRetryAfterRpcError({
            isAuthError,
            retryAttempt,
            maxRetryAttempts: MAX_RETRY_ATTEMPTS,
          })) {
            scheduleClientPush();
          } else {
            console.warn('⚠️ [UPLOAD] Max retries reached, data saved locally');
          }
        } else {
          resetRetry();
          _clientUpload413BackoffUntil = 0;
          logUploadSummaryBuffered(totalSaved);
          addSyncLogEntry('upload_ok', { n: totalSaved, keys: _syncKeySummary, ms: Date.now() - (_uploadStartTs || 0) });
          clearClientInFlightBatch({ notify: false });
        }

        persistClientQueueDurabilityState();
        notifyPendingChange();

        // 🔄 Сбрасываем флаг и уведомляем о завершении
        _uploadInProgress = false;
        _uploadInFlightCount = 0;
        // 🚀 PERF: Drain remaining queued items (from serialized uploads)
        if (clientUpsertQueue.length > 0) {
          scheduleClientPush();
        }
        notifySyncCompletedIfDrained();
        // 🔧 v72: PIN/RPC path never hit curator upsert branch — без этого useCloudSyncStatus
        // не получает второй сигнал после heysSyncCompleted (download) и залипает на
        // «Сохранил локально» / syncingStart + data-saved skip.
        try {
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            queueMicrotask(() => {
              try {
                window.dispatchEvent(new CustomEvent('heys:data-uploaded', {
                  detail: {
                    saved: totalSaved || 0,
                    viaRpc: true,
                    hadError: !!anyError,
                  }
                }));
              } catch (_) { }
            });
          }
        } catch (_) { }

        syncProgressDone += hydratedBatch.length;
        if (syncProgressTotal < syncProgressDone) {
          syncProgressTotal = syncProgressDone;
        }
        notifySyncProgress(syncProgressTotal, syncProgressDone);

        return;
      }

      // ═══════════════════════════════════════════════════════════════
      // ОБЫЧНЫЙ РЕЖИМ: через Supabase session (куратор)
      // ═══════════════════════════════════════════════════════════════
      // 🔐 Если нет user — нельзя сохранять в обычном режиме
      if (!user) {
        log('⚠️ [SAVE] No user session, returning items to queue');
        requeueClientInFlightBatch(hydratedBatch, 'missing-user-session');
        _uploadInProgress = false;
        _uploadInFlightCount = 0;
        notifySyncCompletedIfDrained();
        return;
      }

      const promises = hydratedBatch.map(item => {
        // Добавляем user_id если его нет (таблица требует NOT NULL)
        const itemWithUser = item.user_id ? item : { ...item, user_id: user.id };

        // Primary key = (client_id, k) — изменено 2025-12-26 (убрали user_id)
        return cloud.upsert('client_kv_store', itemWithUser, 'client_id,k')
          .then(() => ({ success: true, item: itemWithUser }))
          .catch(err => {
            console.error('[DEBUG] Upsert error:', err?.message || err, 'for key:', itemWithUser?.k);
            return { success: false, item: itemWithUser, error: err };
          });
      });

      const results = await Promise.all(promises);
      const failedItems = results.filter(r => !r.success).map(r => r.item);
      const successItems = results.filter(r => r.success).map(r => r.item);

      // Обработка неудачных
      if (failedItems.length > 0) {
        // Вернуть в очередь
        clientUpsertQueue.push(...failedItems);
        incrementRetry();
        clearClientInFlightBatch({ notify: false });
        persistClientQueueDurabilityState();
        notifyPendingChange();

        const authError = results.find(r => !r.success && isAuthError(r.error))?.error;
        if (authError) {
          handleAuthFailure(authError);
          _uploadInProgress = false;
          _uploadInFlightCount = 0;
          notifySyncCompletedIfDrained();
          return;
        }

        // Запланировать повторную попытку
        scheduleClientPush();
      } else {
        // Полный успех — сбрасываем retry счётчик
        resetRetry();
        clearClientInFlightBatch({ notify: false });
      }

      // Критический лог: данные отправлены в облако (только успешные)
      if (successItems.length > 0) {
        const types = {};
        const otherKeys = []; // DEBUG: какие ключи попадают в "other"
        successItems.forEach(item => {
          const t = item.k.includes('dayv2_') ? 'day' :
            item.k.includes('products') ? 'products' :
              item.k.includes('profile') ? 'profile' : 'other';
          types[t] = (types[t] || 0) + 1;
          if (t === 'other') otherKeys.push(item.k);
        });
        const summary = Object.entries(types).map(([k, v]) => `${k}:${v}`).join(' ');
        logCritical('☁️ Сохранено в облако:', summary);
        // DEBUG: показываем какие ключи попадают в "other"
        if (otherKeys.length > 0) {
          logCritical('  └ other keys:', otherKeys.join(', '));
        }

        // Уведомляем о завершении UPLOAD (НЕ heysSyncCompleted — то для initial download!)
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('heys:data-uploaded', { detail: { saved: successItems.length } }));
        }
      }

      // Обновляем персистентную очередь (если были ошибки, failedItems уже там)
      persistClientQueueDurabilityState();
      notifyPendingChange();
    } catch (e) {
      if (isLogoutSuppressionActive()) {
        clearClientInFlightBatch({ notify: false });
        _uploadInProgress = false;
        _uploadInFlightCount = 0;
        persistClientQueueDurabilityState();
        notifyPendingChange();
        notifySyncCompletedIfDrained();
        return;
      }
      // При ошибке — вернуть в очередь и увеличить retry
      clientUpsertQueue.push(...uniqueBatch);
      incrementRetry();
      clearClientInFlightBatch({ notify: false });
      persistClientQueueDurabilityState();
      notifyPendingChange();
      logCritical('❌ Ошибка сохранения в облако:', e.message || e);
      addSyncLogEntry('upload_error', { keys: _syncKeySummary, err: String(e?.message || e).slice(0, 80) });

      // Авторизационные ошибки — требуем вход
      if (isAuthError(e)) {
        handleAuthFailure(e);
        _uploadInProgress = false;
        _uploadInFlightCount = 0;
        notifySyncCompletedIfDrained();
        return;
      }

      // Уведомляем об ошибке с временем до retry (exponential backoff)
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        const retryIn = Math.min(5, Math.ceil(getRetryDelay() / 1000)); // секунд до retry
        notifySyncError(e, retryIn);
      }

      // Запланировать повторную попытку
      scheduleClientPush();
    }

    // Прогресс и завершение
    syncProgressDone += uniqueBatch.length;
    if (syncProgressTotal < syncProgressDone) {
      syncProgressTotal = syncProgressDone;
    }
    notifySyncProgress(syncProgressTotal, syncProgressDone);

    // 🔄 Сбрасываем флаг "в полёте" ПЕРЕД уведомлением о завершении
    _uploadInProgress = false;
    _uploadInFlightCount = 0;

    // 🚀 PERF: Drain remaining queued items (from serialized uploads)
    if (clientUpsertQueue.length > 0) {
      scheduleClientPush();
    }

    notifySyncCompletedIfDrained();
  }

  /**
   * 🔄 v=34: Немедленный upload без debounce — для flush перед sync
   * @returns {Promise<void>}
   */
  async function doImmediateClientUpload() {
    // Отменяем существующий таймер если есть
    if (clientUpsertTimer) {
      clearTimeout(clientUpsertTimer);
      clientUpsertTimer = null;
    }

    if (_uploadInProgress) {
      return;
    }

    // Забираем всю очередь
    const batch = clientUpsertQueue.splice(0, clientUpsertQueue.length);
    if (!batch.length) {
      persistClientQueueDurabilityState();
      notifyPendingChange();
      return;
    }

    setClientInFlightBatch(batch);

    // Выполняем upload
    await doClientUpload(batch);
  }

  /**
   * Debounced upload — стандартный способ с 500ms задержкой
   */
  function scheduleClientPush(opts) {
    if (isLogoutSuppressionActive()) return;
    if (clientUpsertTimer) return;

    // Сохраняем очередь в localStorage для персистентности
    persistClientQueueDurabilityState();
    // enqueueClientSave уже вызвал notifyPendingChange — не дублируем
    if (!opts || !opts.__fromEnqueue) {
      notifyPendingChange();
    }

    let delay = navigator.onLine ? 500 : getRetryDelay();
    if (_clientUpload413BackoffUntil > Date.now()) {
      delay = Math.max(delay, Math.min(120000, _clientUpload413BackoffUntil - Date.now()));
    }
    // Curator path: stretch debounce when the whole queue is non-critical burst keys (advice/cascade/debug).
    try {
      if (!_pinAuthClientId && Array.isArray(clientUpsertQueue) && clientUpsertQueue.length > 0) {
        const _runtimePure = global.HEYS?.syncQueueRuntimePure;
        const _isCrit = _runtimePure && typeof _runtimePure.isCriticalSyncKey === 'function'
          ? _runtimePure.isCriticalSyncKey.bind(_runtimePure)
          : () => true;
        const onlyBurst = clientUpsertQueue.every((it) => {
          if (!it || !it.k || !it.client_id) return false;
          const nk = normalizeKeyForSupabase(it.k, it.client_id);
          if (!nk || _isCrit(nk)) return false;
          return nk.includes('advice_') || nk.includes('cascade_') || nk.includes('_debug') || nk.includes('feedback');
        });
        if (onlyBurst) delay = Math.max(delay, 950);
      }
    } catch (_) { }

    clientUpsertTimer = setTimeout(async () => {
      if (_uploadInProgress) {
        clientUpsertTimer = null;
        return;
      }

      const batch = clientUpsertQueue.splice(0, clientUpsertQueue.length);
      clientUpsertTimer = null;
      if (!batch.length) {
        persistClientQueueDurabilityState();
        notifyPendingChange();
        return;
      }

      setClientInFlightBatch(batch);
      await doClientUpload(batch);
    }, delay);
  }

  // Функция для проверки статуса синхронизации
  cloud.getSyncStatus = function (key) {
    const snapshot = getPendingQueuesSnapshot();
    const queue = [];
    const inFlightQueue = [];

    if (Array.isArray(clientUpsertQueue)) queue.push(...clientUpsertQueue);
    if (Array.isArray(clientUpsertInFlightQueue)) inFlightQueue.push(...clientUpsertInFlightQueue);
    if (!snapshot.isClientOnlyMode) {
      if (Array.isArray(upsertQueue)) queue.push(...upsertQueue);
      if (Array.isArray(upsertInFlightQueue)) inFlightQueue.push(...upsertInFlightQueue);
    }

    return getSyncStatusForKey({
      key,
      queue,
      inFlightQueue,
    });
  };

  // Функция для ожидания завершения синхронизации
  cloud.waitForSync = function (key, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkSync = () => {
        if (cloud.getSyncStatus(key) === 'synced' || (Date.now() - startTime) > timeout) {
          resolve(cloud.getSyncStatus(key));
        } else {
          setTimeout(checkSync, 100);
        }
      };
      checkSync();
    });
  };

  function enqueueClientUpsertForUpload(upsertObj, normalizedKey, k, client_id, waitingForSync) {
    // 🔬 [HEYS.day-trace] 6a/8 cloud queue enqueue — dayv2 key entering pending upload queue.
    try {
      if (typeof normalizedKey === 'string' && /^heys_dayv2_\d{4}-\d{2}-\d{2}/.test(normalizedKey)) {
        const v = upsertObj && upsertObj.v;
        const _meals = (v && Array.isArray(v.meals)) ? v.meals : [];
        const _totalItems = _meals.reduce((acc, m) => acc + ((m && Array.isArray(m.items)) ? m.items.length : 0), 0);
        const _sz = (function () { try { return JSON.stringify(v).length; } catch (_) { return -1; } })();
        console.info('[HEYS.day-trace] 6a/8 cloud queue enqueue', {
          key: normalizedKey,
          rawKey: k,
          mealsCount: _meals.length,
          totalItems: _totalItems,
          updatedAt: v && v.updatedAt,
          sourceId: v && v._sourceId,
          sizeChars: _sz,
          waitingForSync,
        });
      }
    } catch (_) { /* noop */ }
    const enqueueResult = enqueueClientSave({
      queue: clientUpsertQueue,
      item: upsertObj,
      normalizedKey,
      waitingForSync,
      isOnline: navigator.onLine,
      uploadInProgress: !!_uploadInProgress,
      pendingQueueStorageKey: PENDING_CLIENT_QUEUE_KEY,
      persistQueue: (queue) => savePendingQueue(PENDING_CLIENT_QUEUE_KEY, queue),
      notifyPendingChange,
      scheduleClientPush,
      doImmediateClientUpload: () => {
        console.info('[HEYS.sync] ⚡ Immediate upload', { key: k, client: client_id?.slice(0, 8) });
        return doImmediateClientUpload();
      },
      onImmediateUploadError: (e) => {
        console.warn('[HEYS.sync] ⚠️ Immediate upload failed', e?.message || e);
      },
    });
    if (enqueueResult.shouldImmediate) {
      log(`[HEYS.sync] Immediate upload path selected for '${normalizedKey}'`);
    }
  }

  /**
   * Запись в localStorage минуя interceptSetItem → saveClientKey (без постановки в sync-очередь).
   * Нужна для batch-cascade после cloud-sync: дни уже пришли с сервера, каскад лишь выравнивает meal items
   * под каталог продуктов — повторный upload десятков dayv2 создаёт «52 несохранённых» и лаги UI.
   */
  cloud.writeLocalKvWithoutMirror = function (key, value) {
    if (typeof key !== 'string' || !key) return;
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      const setFn = originalSetItem || global.localStorage.setItem.bind(global.localStorage);
      setFn(key, serialized);
      if (global.HEYS?.store?.invalidate) {
        try { global.HEYS.store.invalidate(key); } catch (_) { /* noop */ }
      }
    } catch (e) {
      console.warn('[HEYS.sync] writeLocalKvWithoutMirror failed:', key, e && e.message ? e.message : e);
    }
  };

  // Поддерживает старую сигнатуру saveClientKey(k, v) — в этом случае client_id берётся из HEYS.currentClientId.
  cloud.saveClientKey = function (...args) {
    let client_id, k, value;

    // 🔄 ИЗМЕНЕНО: Вместо полной блокировки — добавляем в очередь
    // Данные будут отправлены когда sync завершится или по таймауту
    const waitingForSync = !initialSyncCompleted;

    if (args.length === 3) {
      client_id = args[0];
      k = args[1];
      value = args[2];
    } else if (args.length === 2) {
      k = args[0];
      value = args[1];

      // 🔧 v68 FIX: Извлекаем client_id из ЛЮБОГО scoped ключа (heys_{uuid}_...),
      // не только из dayv2. Старый код проверял только _dayv2_, что позволяло
      // profile/norms/hr_zones использовать currentClientId, рискуя контаминацией
      // при race conditions во время client switch.
      if (k && k.startsWith('heys_')) {
        const scopeId = getLeadingClientScopeId(k);
        if (scopeId) {
          client_id = scopeId;
        }
      }

      // Для обычных ключей (heys_profile, heys_products и т.д.) используем текущего клиента
      if (!client_id && window.HEYS && window.HEYS.currentClientId) {
        client_id = window.HEYS.currentClientId;
      }

      // Если все еще нет client_id, но есть user - создаем дефолтный client_id для этого пользователя
      if (!client_id && user && user.id) {
        // Создаем предсказуемый но валидный UUID на основе user.id
        // Берем первые 8 символов user.id и добавляем фиксированный суффикс для получения валидного UUID
        const userIdShort = user.id.replace(/-/g, '').substring(0, 8);
        client_id = `00000000-0000-4000-8000-${userIdShort}0000`.substring(0, 36);
      }
    } else {
      return;
    }

    if (!client_id) {
      return;
    }

    if (isLogoutSuppressionActive()) {
      return;
    }

    if (cloud._switchClientInProgress) {
      // 🔧 v72: Defer (last-write-wins per client_id+k) and replay in switchClient finally — lossless vs drop.
      try {
        if (!cloud._deferredSaveClientKeyMap || typeof cloud._deferredSaveClientKeyMap.set !== 'function') {
          cloud._deferredSaveClientKeyMap = new Map();
        }
        const dedupeKey = String(client_id || '') + '\u0000' + String(k || '');
        cloud._deferredSaveClientKeyMap.set(dedupeKey, { client_id, k, value });
        bumpSmoothnessCounter('deferred_save_switch_queue');
      } catch (_) { }
      logCritical(`🛡️ [SAVE DEFERRED] switchClient in progress — queued replay. key='${k}' target='${(client_id || '').slice(0, 8)}'`);
      return;
    }

    if (isForeignClientScopedKey(k, client_id)) {
      logCritical(`🛡️ [SAVE BLOCKED] Foreign scoped key does not match target client: key='${k}' target='${client_id}'`);
      return;
    }

    if (isLocalOnlyStorageKey(k)) {
      return;
    }

    if (isSensitiveSessionStorageKey(k)) {
      return;
    }

    // 🚫 Не сохраняем backup-ключи в cloud
    if (String(k || '').includes('_backup')) {
      return;
    }

    // НЕ сохраняем в Supabase, если используется дефолтный client_id (пользователь еще не выбрал клиента)
    if (client_id && client_id.startsWith('00000000-')) {
      // 🔧 FIX: Всегда логируем блокировку (раньше только в DEV mode)
      const isProducts = k && (k.includes('products') || k === 'heys_products');
      if (isProducts) {
        console.warn(`[HEYS] 🚨 PRODUCTS SYNC BLOCKED: default client_id! client_id=${client_id}`);
      }
      log(`⚠️ [SAVE BLOCKED] Skipping save for key '${k}' - default client_id (user hasn't selected client yet)`);
      return; // Тихий пропуск сохранения до выбора реального клиента
    }

    // 🔐 PIN-авторизация: работаем без user
    const isPinAuth = _pinAuthClientId && _pinAuthClientId === client_id;
    if (!user && !isPinAuth) {
      // � FIX: Явный warning для products — это критический путь синхронизации
      const isProducts = k && (k.includes('products') || k === 'heys_products');
      if (isProducts) {
        console.warn(`[HEYS] 🚨 PRODUCTS SYNC BLOCKED: No auth! user=${!!user}, isPinAuth=${isPinAuth}, _pinAuthClientId=${_pinAuthClientId?.slice(0, 8)}, client_id=${client_id?.slice(0, 8)}`);
      }
      // �🔍 DEBUG: Логируем когда сохранение блокируется
      log(`🚫 [SAVE BLOCKED] No auth for key '${k}': user=${!!user}, _pinAuthClientId=${_pinAuthClientId}, client_id=${client_id}, isPinAuth=${isPinAuth}`);

      // 🔥 INSTANT FEEDBACK: Если нет авторизации, это критическая ошибка сохранения
      if (global.dispatchEvent) {
        global.dispatchEvent(new CustomEvent('heys:sync-error', {
          detail: {
            error: 'auth_required',
            persistent: true
          }
        }));
      }
      return;
    }

    // После stale-block у products даём короткий cooldown, чтобы не гонять один и тот же
    // тяжёлый payload по кругу и не нагружать main thread.
    if ((k === 'heys_products' || (k && k.includes('products'))) && _productsSaveBlockedUntil > Date.now()) {
      return;
    }

    // Для дней проверяем что это объект, для остальных ключей пропускаем любые типы
    if (k && k.includes('dayv2_') && !k.includes('backup') && !k.includes('date')) {
      if (typeof value !== 'object' || value === null) {
        return;
      }
      // 🚨 ЗАЩИТА ОТ HMR: НЕ сохраняем день без updatedAt (признак что это HMR-сброс, а не реальное изменение)
      // Если есть updatedAt — это реальное изменение пользователем, разрешаем сохранение (даже пустого дня)
      if (!value.updatedAt && !value.schemaVersion) {
        log(`🚫 [SAVE BLOCKED] Refused to save day without updatedAt (HMR protection) - key: ${k}`);
        return;
      }

      // 🚨 КРИТИЧЕСКАЯ ЗАЩИТА: НЕ сохраняем ПУСТОЙ день в облако НИКОГДА
      // Это предотвращает перезапись реальных данных пустым днём при выборе даты в календаре
      // v59 FIX: Блокируем всегда, не только до sync — иначе при выборе старой даты затираем облако
      const hasRealData = isMeaningfulDayData(value);
      if (!hasRealData) {
        log(`🚫 [SAVE BLOCKED] Empty day not saved to cloud - key: ${k}`);
        return;
      }
    }

    // 🔄 НОРМАЛИЗАЦИЯ КЛЮЧА: Убираем client_id из ключа перед сохранением в Supabase
    // В localStorage используются scoped ключи (heys_{clientId}_dayv2_...),
    // но в Supabase client_id хранится отдельно в колонке, поэтому ключ должен быть heys_dayv2_...
    let normalizedKey = client_id ? normalizeKeyForSupabase(k, client_id) : k;

    // 🔬 [HEYS.day-trace] 6b/8 cloud.saveClientKey path (rare for dayv2; usually interceptor catches first).
    try {
      if (typeof normalizedKey === 'string' && /^heys_dayv2_\d{4}-\d{2}-\d{2}/.test(normalizedKey)) {
        const _meals = (value && Array.isArray(value.meals)) ? value.meals : [];
        const _totalItems = _meals.reduce((acc, m) => acc + ((m && Array.isArray(m.items)) ? m.items.length : 0), 0);
        console.info('[HEYS.day-trace] 6b/8 saveClientKey direct', {
          key: normalizedKey,
          mealsCount: _meals.length,
          totalItems: _totalItems,
          updatedAt: value && value.updatedAt,
        });
      }
    } catch (_) { /* noop */ }

    // ──────────────────────────────────────────────────────────────────
    // Phase ε: skip cloud upload of legacy heys_products when overlay is canonical.
    // Overlay key heys_products_overlay_v2 (~30 KB) carries authoritative state;
    // legacy snapshot (~80–700 KB) is dead weight on the wire and the only
    // remaining 413-trigger for the products payload.
    // Local LS write of heys_<cid>_products is still allowed (kept as a
    // fallback read source if anything still calls _origGetAll).
    // Gated on: flag overlay_products_v2 ON + migration_status === 'success'.
    // ──────────────────────────────────────────────────────────────────
    // Gate: flag overlay_products_v2 ON AND (migration_status=success OR overlay LS has rows).
    // Второе условие закрывает гонку на свежих устройствах после PIN-restore.
    if (normalizedKey === 'heys_products'
        && global.HEYS && global.HEYS.flags
        && global.HEYS.flags.isEnabled && global.HEYS.flags.isEnabled('overlay_products_v2')) {
      let __pushOverlayHasRows = false;
      try {
        const __store = global.HEYS && global.HEYS.OverlayStore;
        if (__store && typeof __store.readRaw === 'function') {
          const __rows = __store.readRaw();
          __pushOverlayHasRows = Array.isArray(__rows) && __rows.length > 0;
        }
      } catch (_) { /* noop */ }
      const __pushStatusOk = global.localStorage.getItem('heys_overlay_migration_status') === 'success';
      if (__pushStatusOk || __pushOverlayHasRows) {
        try {
          console.info('[HEYS.products] cloud-push skipped {key: legacy heys_products, reason: overlay-canonical}');
        } catch (_) { /* noop */ }
        return;
      }
    }

    const upsertObj = {
      user_id: user?.id || null, // 🔐 PIN auth: user может быть null
      client_id: client_id,
      k: normalizedKey,
      v: value,
      updated_at: (new Date()).toISOString(),
    };

    // 🛡️ v4.8.3 / v4.9.x: НЕ сохраняем products в облако ДО завершения initial sync
    // При старте React useEffect([products]) может отправить stale localStorage в cloud,
    // перезатирая обогащённые данные. Sync сам загрузит актуальную версию.
    // FUNDAMENTAL FIX: вместо silent drop — планируем retry после закрытия окна,
    // который перечитает СВЕЖИЙ localStorage (с merged cloud + user-правки) и пере-вызовет save.
    if (waitingForSync && k && (k.includes('products') || k === 'heys_products')) {
      log(`⏳ [SAVE DEFERRED] Products save during initial sync — scheduled retry after sync window`);
      scheduleProductsPostWindowRetry(client_id);
      return;
    }
    // После завершения initial sync даём окну стабилизации остыть (20s):
    // React-эффекты часто пытаются тут же повторно записать тот же heys_products.
    // FUNDAMENTAL FIX: тоже планируем retry — реальные user-правки в этом окне не теряем.
    if ((k === 'heys_products' || normalizedKey === 'heys_products') && cloud._syncCompletedAt) {
      const ageAfterSync = Date.now() - cloud._syncCompletedAt;
      if (ageAfterSync >= 0 && ageAfterSync < 20000) {
        scheduleProductsPostWindowRetry(client_id);
        return;
      }
    }
    // v4.8.3: Timestamp check для products — блокируем если сохраняемая версия СТАРЕЕ текущей
    // React useEffect с debounce может попытаться сохранить stale state ПОСЛЕ того как sync загрузил свежую версию
    if ((k === 'heys_products' || normalizedKey === 'heys_products') && Array.isArray(value) && value.length > 0) {
      // Быстрый дедуп: если fingerprint не менялся, не гоняем тяжёлый upload и очередь.
      const _fpArr = value.map(p => (p?.name || '') + (p?.updatedAt || '')).join('|');
      let _fpHash = 0;
      for (let _ci = 0; _ci < _fpArr.length; _ci++) {
        _fpHash = ((_fpHash << 5) - _fpHash + _fpArr.charCodeAt(_ci)) | 0;
      }
      const _incomingFingerprint = value.length + ':' + Math.abs(_fpHash);
      if (cloud._productsFingerprint && cloud._productsFingerprint === _incomingFingerprint) {
        return;
      }

      // v4.8.6: ПЕРВИЧНАЯ защита — качественная проверка ДО попыток чтения localStorage
      const savingWithIron = value.filter(p => p && p.iron && +p.iron > 0).length;
      if (isDebugSync()) {
        const savingWithTs = value.filter(p => p && p.updatedAt).length;
        logCritical(`🔍 [SAVE DEBUG] Products to save: total=${value.length}, withIron=${savingWithIron}, withTimestamp=${savingWithTs}`);
      }

      // v4.9.x FUNDAMENTAL FIX: УБРАН абсолютный порог `savingWithIron < 50`.
      // Он был ложным эвристиком: для пользователей с каталогом без iron-данных
      // он блокировал ВСЕ сохранения навсегда (cooldown 25s регенерируется на каждой попытке).
      // Регрессия теперь определяется относительно текущего localStorage:
      //   - shrink-protection в HEYS.products.setAll (heys_core_v12.js) ловит сжатие массива,
      //   - relative iron-degrade check ниже ловит стирание микронутриентов,
      //   - timestamp-check ниже ловит stale React state,
      //   - empty-array check ниже ловит пустые массивы.
      // Это покрывает реальные регрессии без false positives.

      try {
        const currentKey = client_id ? `heys_${client_id}_products` : 'heys_products';
        const currentRaw = localStorage.getItem(currentKey);

        if (currentRaw) {
          const current = JSON.parse(currentRaw);
          if (Array.isArray(current) && current.length > 0) {
            const currentWithIron = current.filter(p => p && p.iron && +p.iron > 0).length;
            if (isDebugSync()) {
              const currentWithTs = current.filter(p => p && p.updatedAt).length;
              logCritical(`🔍 [SAVE DEBUG] Current localStorage: total=${current.length}, withIron=${currentWithIron}, withTimestamp=${currentWithTs}`);
            }

            // Находим самый свежий updatedAt в обеих версиях
            const getMaxTimestamp = (arr) => {
              let max = 0;
              for (const p of arr) {
                if (p && p.updatedAt) {
                  const ts = typeof p.updatedAt === 'number' ? p.updatedAt : new Date(p.updatedAt).getTime();
                  if (ts > max) max = ts;
                }
              }
              return max;
            };

            const savingMaxTs = getMaxTimestamp(value);
            const currentMaxTs = getMaxTimestamp(current);
            const delta = currentMaxTs - savingMaxTs;

            if (isDebugSync()) {
              logCritical(`🔍 [TIMESTAMP CHECK] savingMaxTs=${savingMaxTs} (${new Date(savingMaxTs).toISOString()})`);
              logCritical(`🔍 [TIMESTAMP CHECK] currentMaxTs=${currentMaxTs} (${new Date(currentMaxTs).toISOString()})`);
              logCritical(`🔍 [TIMESTAMP CHECK] delta=${delta}ms (${Math.round(delta / 1000)}s), threshold=30000ms`);
            }

            // Если сохраняемая версия старее текущей на >30 секунд — блокируем (это stale state)
            if (currentMaxTs > 0 && savingMaxTs > 0 && delta > 30000) {
              _productsSaveBlockedUntil = Date.now() + 25000;
              logCriticalThrottled('save-blocked-stale-ts', 20000, `🚨 [SAVE BLOCKED] Stale products: saving timestamp ${new Date(savingMaxTs).toISOString()} vs current ${new Date(currentMaxTs).toISOString()}`);
              logCriticalThrottled('save-blocked-stale-ts-reason', 20000, `   React state outdated (delta ${Math.round(delta / 1000)}s), current localStorage is fresher`);
              logCriticalThrottled('save-blocked-stale-ts-refuse', 20000, `   Refusing to overwrite ${currentWithIron} products with iron with stale version (${savingWithIron} products with iron)`);
              return;
            }

            // v4.8.5: Дополнительная защита на основе КАЧЕСТВА данных (если прошли первичную проверку)
            // Если сохраняемая версия имеет ЗНАЧИТЕЛЬНО меньше микронутриентов — блокируем
            if (currentWithIron >= 100 && savingWithIron < currentWithIron * 0.5) {
              _productsSaveBlockedUntil = Date.now() + 25000;
              logCriticalThrottled('save-blocked-quality-degrade', 20000, `🚨 [SAVE BLOCKED] Quality degradation: current has ${currentWithIron} products with iron, saving only ${savingWithIron}`);
              logCriticalThrottled('save-blocked-quality-degrade-reason', 20000, '   This looks like stale React state without micronutrients. Blocking save.');
              return;
            }
          }
        }
      } catch (e) {
        // Ignore parsing errors, allow save to proceed
      }
    }

    // �🚨 КРИТИЧЕСКАЯ ЗАЩИТА: НЕ сохраняем пустые массивы продуктов в Supabase
    if (k && (k.includes('products') || k === 'heys_products') && Array.isArray(value) && value.length === 0) {
      log(`🚫 [SAVE BLOCKED] Refused to save empty products array to Supabase (key: ${normalizedKey})`);
      return; // Блокируем затирание реальных данных пустым массивом
    }

    // � v5.1: DELTA-SYNC: пропускаем upload products если данные не изменились
    // Вычисляем быстрый fingerprint: длина + djb2-hash имён и timestamps
    if (k === 'heys_products' && Array.isArray(value) && value.length > 0) {
      const _fpArr = value.map(p => (p?.name || '') + (p?.updatedAt || '')).join('|');
      let _fpHash = 0;
      for (let _ci = 0; _ci < _fpArr.length; _ci++) {
        _fpHash = ((_fpHash << 5) - _fpHash + _fpArr.charCodeAt(_ci)) | 0;
      }
      const _fingerprint = value.length + ':' + Math.abs(_fpHash);
      if (cloud._productsFingerprint === _fingerprint) {
        if (isDebugSync()) {
          console.info('[HEYS.sync] 🔄 Delta-sync: products не изменились (fingerprint=' + _fingerprint + '), upload пропущен');
        }
        return;
      }
      cloud._productsFingerprint = _fingerprint;
      if (isDebugSync()) {
        console.info('[HEYS.sync] 🔄 Delta-sync: products изменились (new fingerprint=' + _fingerprint + '), upload разрешён');
      }
    }

    // �🚨 КРИТИЧЕСКАЯ ЗАЩИТА: Фильтруем невалидные продукты перед сохранением
    if (k === 'heys_products' && Array.isArray(value)) {
      const validProducts = value.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0);
      if (validProducts.length !== value.length) {
        logCritical(`🧹 [SAVE FILTER] Filtered ${value.length - validProducts.length} invalid products before save (${value.length} → ${validProducts.length})`);
        value = validProducts;
        upsertObj.v = validProducts;
      }
      // Если после фильтрации массив пуст — не сохраняем
      if (validProducts.length === 0) {
        log(`🚫 [SAVE BLOCKED] All products invalid, refusing to save empty array`);
        return;
      }
    }

    // 🚨 КРИТИЧЕСКАЯ ЗАЩИТА: НЕ сохраняем "пустой" профиль (без ключевых полей)
    // Это защита от HMR-перезагрузок, когда компонент ремонтируется с дефолтными значениями
    if (k.includes('profile') && !k.includes('backup')) {
      const isValidProfile = value && typeof value === 'object' &&
        (value.age || value.weight || value.height || value.firstName);
      if (!isValidProfile) {
        log(`🚫 [SAVE BLOCKED] Refused to save empty/invalid profile to Supabase (key: ${k})`);
        return;
      }
    }

    // Логирование сохранения
    const dataType = k === 'heys_products' ? '📦 PRODUCTS' :
      k.includes('dayv2_') ? '📅 DAY' :
        k.includes('_profile') ? '👤 PROFILE' : '📝 OTHER';
    const itemsCount = Array.isArray(value) ? value.length : 'N/A';

    // 🔍 Диагностика: логируем сохранение данных дня с шагами (только значимые)
    // 🔇 v4.8.2: Отключено — слишком много логов при обычном использовании
    // if (k.includes('dayv2_') && value && value.steps > 0) {
    //   logCritical(`📅 [DAY SAVE] Saving day ${k} with steps: ${value.steps} | updatedAt: ${value.updatedAt}`);
    // }

    // Логируем если добавляем в очередь до завершения sync
    if (waitingForSync) {
      log(`⏳ [QUEUED] Waiting for sync, queuing: ${k}`);
    }

    log(`💾 [SAVE] ${dataType} | key: ${k} | items: ${itemsCount} | client: ${client_id.substring(0, 8)}...`);

    // 🛡️ GRACE PERIOD v4: Сразу после sync не отправляем ЛЮБЫЕ ключи обратно в облако
    // v3: НЕ push в очередь вообще — иначе savePendingQueue персистирует и на следующем входе
    // flushPendingQueue отправит 405KB обратно (бесконечный цикл mirror)
    // v4: Исключение для profileCompleted — регистрационный профиль ДОЛЖЕН попасть в облако,
    //     иначе при signOut → re-login данные теряются и модалка регистрации повторяется
    const _graceAge = cloud._syncCompletedAt ? (Date.now() - cloud._syncCompletedAt) : Infinity;
    const _inGracePeriod = _graceAge < 10000;
    const _isProfileCompleted = normalizedKey === 'heys_profile' && value && typeof value === 'object' && value.profileCompleted === true;
    const _isWidgetLayout = normalizedKey && normalizedKey.includes('widget_layout');
    const _isDefaultTabSync = shouldBypassGraceForDefaultTabSync(normalizedKey, value);
    // v5: dayv2 ключи полностью исключены из grace period.
    // Mirror-loop защита уже обеспечена muteMirror (true во время sync download)
    // и dedup check в interceptSetItem. persistDayData вызывается только из
    // пользовательских действий, а не из React re-render после cloud sync.
    const _isDayV2Data = normalizedKey && normalizedKey.includes('dayv2_') && !normalizedKey.includes('date');
    const _isProducts = normalizedKey === 'heys_products' || k === 'heys_products' || (k && k.includes('products'));
    if (_inGracePeriod && !_isProfileCompleted && !_isWidgetLayout && !_isDayV2Data && !_isDefaultTabSync) {
      // FUNDAMENTAL FIX: для products — не теряем write молча, ставим retry после grace period
      if (_isProducts) {
        scheduleProductsPostWindowRetry(client_id);
      }
      return;
    }
    if (_inGracePeriod && (_isProfileCompleted || _isWidgetLayout || _isDefaultTabSync)) {
      const bypassReason = _isWidgetLayout
        ? 'widget_layout'
        : (_isProfileCompleted ? 'profileCompleted' : 'defaultTab');
      if (isDebugSync()) {
        console.info('[HEYS.sync] 🔓 Grace period bypassed for', bypassReason, 'save');
      }
    }
    if (_inGracePeriod && _isDayV2Data) {
      pushSyncTrace('GRACE_PERIOD_BYPASS_dayv2', { key: normalizedKey, graceAge: Math.round(_graceAge), updatedAt: value?.updatedAt });
    }

    // Диагностика: логируем добавление dayv2 в upload queue с caller
    if (normalizedKey && normalizedKey.includes('dayv2_') && !normalizedKey.includes('date')) {
      if (isDebugSync()) {
        const callerLine = (new Error().stack || '').split('\n')[2] || '?';
        console.info('[HEYS.sync] [IND] saveClientKey: dayv2 enqueue key=' + normalizedKey + ' updatedAt=' + (upsertObj.v && upsertObj.v.updatedAt) + ' caller=' + callerLine.trim());
      }
    }

    const isCascadeDcsKey = normalizedKey && /cascade_dcs_/i.test(String(normalizedKey));
    if (isCascadeDcsKey) {
      const slotKey = `${client_id}:${normalizedKey}`;
      _cascadeDcsEnqueueLatest.set(slotKey, { upsertObj, normalizedKey, waitingForSync, client_id, k });
      const prevT = _cascadeDcsEnqueueTimers.get(slotKey);
      if (prevT) clearTimeout(prevT);
      const tid = setTimeout(() => {
        _cascadeDcsEnqueueTimers.delete(slotKey);
        const payload = _cascadeDcsEnqueueLatest.get(slotKey);
        _cascadeDcsEnqueueLatest.delete(slotKey);
        if (!payload) return;
        payload.upsertObj.updated_at = new Date().toISOString();
        enqueueClientUpsertForUpload(
          payload.upsertObj,
          payload.normalizedKey,
          payload.k,
          payload.client_id,
          payload.waitingForSync,
        );
      }, CASCADE_DCS_ENQUEUE_DEBOUNCE_MS);
      _cascadeDcsEnqueueTimers.set(slotKey, tid);
      return;
    }

    enqueueClientUpsertForUpload(upsertObj, normalizedKey, k, client_id, waitingForSync);
  };

  // Функция только проверяет существование клиента (больше НЕ создаём автоматически)
  // 🔐 Для PIN-авторизации: проверяем только по id (без curator_id)
  cloud.ensureClient = async function (clientId) {
    if (!clientId) return false;

    // 🔐 PIN-авторизация: клиент уже проверен через verify_client_pin
    const isPinAuth = _pinAuthClientId && _pinAuthClientId === clientId;
    if (isPinAuth) {
      return true;
    }

    // 🔐 Curator-авторизация: куратор уже аутентифицирован с JWT
    // clients таблица убрана из REST API — проверяем через кэш или доверяем JWT
    if (user) {
      // Если есть кэшированный список клиентов — проверяем в нём
      const cachedClients = window.HEYS?.curatorClients;
      if (cachedClients && Array.isArray(cachedClients)) {
        const found = cachedClients.some(c => c.id === clientId);
        if (found) return true;
      }
      // Куратор авторизован — доверяем что clientId валиден
      // Backend сам проверит права доступа при upsert
      return true;
    }

    // Нет авторизации
    return false;
  };

  // Функция для отправки данных в client_kv_store
  // 🔐 Поддерживает PIN-авторизацию (без user)
  cloud.upsert = async function (tableName, obj, conflictKey) {
    const isPinAuth = _pinAuthClientId && obj.client_id === _pinAuthClientId;

    if (!user && !isPinAuth) {
      throw new Error('User not available');
    }

    try {
      // Если это client_kv_store, проверяем что клиент существует; иначе пропускаем
      if (tableName === 'client_kv_store' && obj.client_id) {
        const _exists = await cloud.ensureClient(obj.client_id);
        if (!_exists) {
          // Убрано избыточное логирование skip upsert (client not found)
          return { skipped: true, reason: 'client_not_found' };
        }
      }

      const { error } = await YandexAPI.from(tableName)
        .upsert(obj, { onConflict: conflictKey || 'client_id,k' });

      if (error) {
        throw error;
      } else {
        return { success: true };
      }
    } catch (e) {
      throw e;
    }
  };

  // очередь upsert'ов
  let upsertQueue = loadPendingQueue(PENDING_QUEUE_KEY);
  let upsertInFlightQueue = loadPendingQueue(PENDING_USER_INFLIGHT_QUEUE_KEY);
  const restoredUserQueueState = restorePersistentQueueState({
    queue: upsertQueue,
    inFlightQueue: upsertInFlightQueue,
    compactQueue: (items) => compactPendingQueue(items, PENDING_QUEUE_KEY),
  });
  upsertQueue = restoredUserQueueState.queue;
  upsertInFlightQueue = [];
  if (restoredUserQueueState.restoredCount > 0) {
    savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
    savePendingQueue(PENDING_USER_INFLIGHT_QUEUE_KEY, upsertInFlightQueue);
    logCritical(`♻️ [SYNC] Restored ${restoredUserQueueState.restoredCount} in-flight user item(s) after reload`);
  }
  try {
    if (upsertQueue.length > 0) {
      queueMicrotask(() => {
        try {
          notifyPendingChange();
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            schedulePush();
          }
        } catch (_) { }
      });
    }
  } catch (_) { }
  let upsertTimer = null;
  let _userUploadInProgress = false;
  let _userUploadInFlightCount = 0;

  function persistUserQueueDurabilityState() {
    savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
    savePendingQueue(PENDING_USER_INFLIGHT_QUEUE_KEY, upsertInFlightQueue);
  }

  function setUserInFlightBatch(batch) {
    upsertInFlightQueue = compactPendingQueue(
      (Array.isArray(batch) ? batch : []).map((item) => (item && typeof item === 'object') ? { ...item } : item),
      PENDING_QUEUE_KEY,
    );
    persistUserQueueDurabilityState();
    notifyPendingChange();
  }

  function clearUserInFlightBatch(options = {}) {
    upsertInFlightQueue = [];
    savePendingQueue(PENDING_USER_INFLIGHT_QUEUE_KEY, upsertInFlightQueue);
    if (options.notify !== false) {
      notifyPendingChange();
    }
  }

  function requeueUserInFlightBatch(batch, reason) {
    if (isLogoutSuppressionActive()) {
      clearUserInFlightBatch();
      return;
    }
    upsertQueue = requeueInFlightBatch({
      queue: upsertQueue,
      batch: Array.isArray(batch) && batch.length ? batch : upsertInFlightQueue,
      compactQueue: (items) => compactPendingQueue(items, PENDING_QUEUE_KEY),
    });
    upsertInFlightQueue = [];
    persistUserQueueDurabilityState();
    notifyPendingChange();
    if (reason) {
      if (reason === 'no-client-id') {
        logQuotaThrottled('requeue-user-no-client', `♻️ [SYNC] Re-queued in-flight user batch (${reason})`);
      } else {
        logCritical(`♻️ [SYNC] Re-queued in-flight user batch (${reason})`);
      }
    }
  }

  async function doUserUpload(batch) {
    if (isLogoutSuppressionActive()) {
      clearUserInFlightBatch({ notify: false });
      persistUserQueueDurabilityState();
      notifyPendingChange();
      _userUploadInProgress = false;
      _userUploadInFlightCount = 0;
      notifySyncCompletedIfDrained();
      return;
    }

    if (!batch.length) {
      clearUserInFlightBatch({ notify: false });
      _userUploadInProgress = false;
      _userUploadInFlightCount = 0;
      notifySyncCompletedIfDrained();
      return;
    }

    if (_userUploadInProgress) {
      upsertQueue = requeueInFlightBatch({
        queue: upsertQueue,
        batch,
        compactQueue: (items) => compactPendingQueue(items, PENDING_QUEUE_KEY),
      });
      persistUserQueueDurabilityState();
      notifyPendingChange();
      schedulePush();
      return;
    }

    _userUploadInProgress = true;
    _userUploadInFlightCount = batch.length;
    try {
      updateSyncProgressTotal();
    } catch (_) { /* noop */ }

    // YandexAPI mode: Supabase `client` is always null; user + YandexAPI are sufficient.
    if (!user) {
      requeueUserInFlightBatch(batch, 'missing-auth-context');
      _userUploadInProgress = false;
      _userUploadInFlightCount = 0;
      notifySyncCompletedIfDrained();
      return;
    }

    if (!navigator.onLine) {
      requeueUserInFlightBatch(batch, 'offline');
      _userUploadInProgress = false;
      _userUploadInFlightCount = 0;
      incrementRetry();
      schedulePush();
      notifySyncCompletedIfDrained();
      return;
    }

    const uniqueBatch = [];
    const seenKeys = new Set();
    for (let i = batch.length - 1; i >= 0; i--) {
      const item = batch[i];
      const key = `${item.user_id}:${item.k}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueBatch.unshift(item);
      }
    }

    const _uHydratePairs = uniqueBatch.map((orig) => ({ orig, hydrated: hydratePendingQueueItem(orig) }));
    const _uFailedHydrate = _uHydratePairs.filter((p) => !p.hydrated).map((p) => p.orig);
    if (_uFailedHydrate.length) {
      logQuotaThrottled(
        'user-upload-hydrate-miss',
        `⚠️ [SYNC] Re-queued ${_uFailedHydrate.length} user item(s) — ref hydrate miss`,
      );
      upsertQueue = compactPendingQueue([..._uFailedHydrate, ...upsertQueue], PENDING_QUEUE_KEY);
      persistUserQueueDurabilityState();
      notifyPendingChange();
    }
    const hydratedBatch = _uHydratePairs.filter((p) => p.hydrated).map((p) => p.hydrated);

    if (!hydratedBatch.length) {
      clearUserInFlightBatch({ notify: false });
      persistUserQueueDurabilityState();
      notifyPendingChange();
      _userUploadInProgress = false;
      _userUploadInFlightCount = 0;
      if (_uFailedHydrate.length) schedulePush();
      notifySyncCompletedIfDrained();
      return;
    }

    try {
      // heys-api-rest: kv_store снят с whitelist — REST upsert всегда 404.
      // User-level очередь отправляем в client_kv_store через batchSaveKV (как clientUpsertQueue), если есть clientId.
      const rpcClientId = (typeof cloud.getCurrentClientId === 'function' && cloud.getCurrentClientId())
        || global.HEYS?.currentClientId
        || _activeSyncClientId;
      if (user && rpcClientId) {
        const rpcItems = hydratedBatch.map((item) => ({
          k: item.k,
          v: item.v,
          updated_at: item.updated_at || new Date().toISOString(),
        }));
        const rpcResult = await cloud.saveClientViaRPC(rpcClientId, rpcItems);
        if (isLogoutSuppressionActive()) {
          clearUserInFlightBatch({ notify: false });
          persistUserQueueDurabilityState();
          notifyPendingChange();
          _userUploadInProgress = false;
          _userUploadInFlightCount = 0;
          notifySyncCompletedIfDrained();
          return;
        }
        if (!rpcResult.success) {
          requeueUserInFlightBatch(hydratedBatch, 'rpc-user-queue-error');
          incrementRetry();
          _userUploadInProgress = false;
          _userUploadInFlightCount = 0;
          if (isAuthError({ message: rpcResult.error })) {
            handleAuthFailure({ message: rpcResult.error });
            notifySyncCompletedIfDrained();
            return;
          }
          notifySyncError({ message: rpcResult.error }, Math.min(5, Math.ceil(getRetryDelay() / 1000)));
          err('user-queue rpc save', rpcResult.error);
          schedulePush();
          notifySyncCompletedIfDrained();
          return;
        }
        resetRetry();
        clearUserInFlightBatch({ notify: false });
        persistUserQueueDurabilityState();
        notifyPendingChange();
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('heys:data-uploaded', { detail: { saved: hydratedBatch.length } }));
        }
      } else {
        // Без выбранного клиента REST kv_store тоже недоступен — не спамим 404, ждём clientId.
        logQuotaThrottled(
          'user-upload-no-client',
          '⚠️ [SYNC] user-queue: нет heys_client_current — откладываем до выбора клиента',
        );
        requeueUserInFlightBatch(hydratedBatch, 'no-client-id');
        _userUploadInProgress = false;
        _userUploadInFlightCount = 0;
        _deferUserPushBackoffMs = USER_QUEUE_NO_CLIENT_BACKOFF_MIN_MS;
        scheduleUserQueueRetryWhenNoClient();
        notifySyncCompletedIfDrained();
        return;
      }
    } catch (e) {
      if (isLogoutSuppressionActive()) {
        clearUserInFlightBatch({ notify: false });
        persistUserQueueDurabilityState();
        notifyPendingChange();
        _userUploadInProgress = false;
        _userUploadInFlightCount = 0;
        notifySyncCompletedIfDrained();
        return;
      }
      requeueUserInFlightBatch(hydratedBatch, 'bulk-upsert-exception');
      incrementRetry();
      _userUploadInProgress = false;
      _userUploadInFlightCount = 0;
      if (isAuthError(e)) {
        handleAuthFailure(e);
        notifySyncCompletedIfDrained();
        return;
      }
      notifySyncError(e, Math.min(5, Math.ceil(getRetryDelay() / 1000)));
      err('bulk upsert exception', e);
      schedulePush();
      notifySyncCompletedIfDrained();
      return;
    }

    syncProgressDone += hydratedBatch.length;
    if (syncProgressTotal < syncProgressDone) {
      syncProgressTotal = syncProgressDone;
    }
    notifySyncProgress(syncProgressTotal, syncProgressDone);

    _userUploadInProgress = false;
    _userUploadInFlightCount = 0;

    if (upsertQueue.length > 0) {
      schedulePush();
    }

    notifySyncCompletedIfDrained();
  }

  async function doImmediateUserUpload() {
    if (upsertTimer) {
      clearTimeout(upsertTimer);
      upsertTimer = null;
    }

    if (_userUploadInProgress) {
      return;
    }

    const batch = upsertQueue.splice(0, upsertQueue.length);
    if (!batch.length) {
      persistUserQueueDurabilityState();
      notifyPendingChange();
      return;
    }

    setUserInFlightBatch(batch);
    await doUserUpload(batch);
  }

  function schedulePush() {
    if (isLogoutSuppressionActive()) return;
    if (upsertTimer) return;

    clearDeferredUserPushNoClientTimer();
    _deferUserPushBackoffMs = USER_QUEUE_NO_CLIENT_BACKOFF_MIN_MS;

    persistUserQueueDurabilityState();
    notifyPendingChange();

    const delay = navigator.onLine ? 300 : getRetryDelay();

    upsertTimer = setTimeout(async () => {
      if (_userUploadInProgress) {
        upsertTimer = null;
        return;
      }

      const batch = upsertQueue.splice(0, upsertQueue.length);
      upsertTimer = null;
      if (!batch.length) {
        persistUserQueueDurabilityState();
        notifyPendingChange();
        return;
      }

      setUserInFlightBatch(batch);
      await doUserUpload(batch);
    }, delay);
  }

  cloud.saveKey = function (k, v) {
    if (isLogoutSuppressionActive()) return;
    if (!user || !k) return;

    if (isLocalOnlyStorageKey(k)) return;
    if (isSensitiveSessionStorageKey(k)) return;

    // 🛡️ GRACE PERIOD v3: Skip re-upload of data just downloaded from cloud
    const _skGrace = cloud._syncCompletedAt ? (Date.now() - cloud._syncCompletedAt) : Infinity;
    if (_skGrace < 10000) return;

    // Получаем client_id для client-level данных (products, days)
    const clientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;

    // 🔄 НОРМАЛИЗАЦИЯ КЛЮЧА: Убираем client_id из ключа перед сохранением в Supabase
    // В localStorage используются scoped ключи (heys_{clientId}_products), 
    // но в Supabase client_id хранится отдельно в колонке, поэтому ключ должен быть heys_products
    let normalizedKey = clientId ? normalizeKeyForSupabase(k, clientId) : k;

    // Если есть client_id — используем clientUpsertQueue (сохранение в client_kv_store)
    if (clientId) {
      const clientUpsertObj = {
        user_id: user.id,
        client_id: clientId,
        k: normalizedKey,
        v: v,
        updated_at: (new Date()).toISOString(),
      };
      clientUpsertQueue.push(clientUpsertObj);
      scheduleClientPush();
      return;
    }

    // Fallback на user-level queue (kv_store) для данных без client_id
    const upsertObj = {
      user_id: user.id,
      k: normalizedKey,
      v: v,
      updated_at: (new Date()).toISOString(),
    };
    upsertQueue.push(upsertObj);
    schedulePush();
  };

  cloud.deleteKey = function (k) {
    // можно делать через .delete(), или ставить пометку
  };

  cloud.clearAll = function () {
    clearNamespace();
  };

  // утилиты для компонентов
  cloud.lsGet = typeof global.HEYS !== 'undefined' && global.HEYS.lsGet
    ? global.HEYS.lsGet
    : function (k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };

  cloud.lsSet = typeof global.HEYS !== 'undefined' && global.HEYS.lsSet
    ? global.HEYS.lsSet
    : function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

  // Экспорт для совместимости с тестами
  HEYS.SupabaseConnection = {
    connect: cloud.signIn,
    disconnect: cloud.signOut,
    isConnected: function () { return status === 'online'; },
    getStatus: function () { return status; },
    getUser: function () { return user; },
    sync: cloud.pushAll,
    client: function () { return client; }
  };

  // Когда сеть возвращается — сбрасываем retry и пробуем отправить накопленные данные
  global.addEventListener('online', function () {
    addSyncLogEntry('online', { pending: cloud.getPendingCount() });
    resetRetry(); // Сбрасываем exponential backoff

    const pendingBefore = cloud.getPendingCount();

    if (clientUpsertQueue.length > 0) {
      scheduleClientPush();
    }
    if (upsertQueue.length > 0) {
      schedulePush();
    }
    notifyPendingChange();

    // Уведомляем UI что сеть вернулась и синхронизация начнётся
    if (pendingBefore > 0) {
      global.dispatchEvent(new CustomEvent('heys:network-restored', {
        detail: { pendingCount: pendingBefore }
      }));
    }

    requestForegroundAutoSync('network-restored', { minGapMs: 0 }).catch(() => { });
    startForegroundAutoSyncLoop();
  });

  // Когда сеть пропадает — логируем
  global.addEventListener('offline', function () {
    addSyncLogEntry('offline', { pending: cloud.getPendingCount() });
    stopForegroundAutoSyncLoop();
  });

  /** Принудительный retry синхронизации */
  cloud.retrySync = function () {
    if (isLogoutSuppressionActive()) return false;
    if (!navigator.onLine) return false;

    resetRetry(); // Сбрасываем exponential backoff

    // Запускаем синхронизацию обеих очередей
    if (clientUpsertQueue.length > 0) {
      if (clientUpsertTimer) clearTimeout(clientUpsertTimer);
      clientUpsertTimer = null;
      scheduleClientPush();
    }
    if (upsertQueue.length > 0) {
      if (upsertTimer) clearTimeout(upsertTimer);
      upsertTimer = null;
      schedulePush();
    }

    return true;
  };

  // Алиасы для внешних вызовов
  cloud.sync = cloud.retrySync;
  cloud.pushAll = cloud.retrySync;

  function dropAllPendingSyncState(reason = 'reset') {
    if (clientUpsertTimer) {
      clearTimeout(clientUpsertTimer);
      clientUpsertTimer = null;
    }
    if (upsertTimer) {
      clearTimeout(upsertTimer);
      upsertTimer = null;
    }
    clearDeferredUserPushNoClientTimer();
    resetBufferedUploadLog();

    clientUpsertQueue = [];
    clientUpsertInFlightQueue = [];
    upsertQueue = [];
    upsertInFlightQueue = [];

    _uploadInProgress = false;
    _uploadInFlightCount = 0;
    _userUploadInProgress = false;
    _userUploadInFlightCount = 0;

    syncProgressTotal = 0;
    syncProgressDone = 0;
    retryAttempt = 0;

    persistClientQueueDurabilityState();
    persistUserQueueDurabilityState();
    notifyPendingChange();
    notifySyncCompletedIfDrained();

    if (reason) {
      logCritical(`🧹 [SYNC] Cleared pending sync state (${reason})`);
    }
  }

  // Near-real-time cross-device sync for active devices.
  // While the page is visible we periodically run a lightweight forced delta sync,
  // ═══════════════════════════════════════════════════════════════════
  // 🔄 Foreground hot-sync v1.1 with granular feature flags & auto-safety.
  //
  // KILL SWITCH (all hot-sync):
  //   localStorage.setItem('heys_disable_hot_sync', '1')
  //   Re-enable: localStorage.removeItem('heys_disable_hot_sync')
  //
  // GRANULAR FLAGS (each new optimisation can be turned off independently):
  //   localStorage.setItem('heys_disable_markers', '1')   — skip change markers, always pull
  //   localStorage.setItem('heys_disable_batch', '1')      — skip batch RPC, use legacy N×getKV
  //   localStorage.setItem('heys_disable_screen_aware', '1')— only sync today, ignore active day
  //
  // SAFE MODE (force legacy-only path, same as disabling markers+batch):
  //   HEYS.cloud.hotSync.safeMode()
  //   HEYS.cloud.hotSync.normalMode()
  //
  // AUTO-SAFETY: if >5 consecutive hot-sync errors → auto-enters safe mode
  //              until the next successful sync or manual normalMode().
  //
  // Console API: HEYS.cloud.hotSync.disable() / .enable() / .status() / .safeMode() / .normalMode()
  // ═══════════════════════════════════════════════════════════════════
  // and we also sync immediately when the tab/window becomes active again.
  const FOREGROUND_AUTO_SYNC_INTERVAL_ACTIVE_MS = 12000;
  const FOREGROUND_AUTO_SYNC_INTERVAL_IDLE_MS = 18000;
  const FOREGROUND_AUTO_SYNC_INTERVAL_LOW_END_MS = 25000;
  const FOREGROUND_AUTO_SYNC_MIN_GAP_MS = 8000;
  const FOREGROUND_AUTO_SYNC_FALLBACK_COOLDOWN_MS = 15000;
  const FOREGROUND_AUTO_SYNC_EXTENDED_EVERY = 3;
  const HOT_SYNC_AUTO_SAFE_THRESHOLD = 5; // consecutive errors to trigger auto-safe mode
  let foregroundAutoSyncTimer = null;
  let foregroundAutoSyncInFlight = false;
  let foregroundAutoSyncLastAt = 0;
  let foregroundAutoSyncTick = 0;
  let foregroundAutoSyncAuthFailCount = 0;
  let _hotSyncConsecutiveErrors = 0;
  let _hotSyncAutoSafeMode = false; // true if auto-degraded due to errors

  function isHotSyncDisabled() {
    try {
      return global.localStorage.getItem('heys_disable_hot_sync') === '1';
    } catch (_) { return false; }
  }

  function _isFeatureDisabled(flag) {
    try { return global.localStorage.getItem(flag) === '1'; } catch (_) { return false; }
  }

  function isMarkersDisabled() {
    return _hotSyncAutoSafeMode || _isFeatureDisabled('heys_disable_markers');
  }

  function isBatchDisabled() {
    return _hotSyncAutoSafeMode || _isFeatureDisabled('heys_disable_batch');
  }

  function isScreenAwareDisabled() {
    return _isFeatureDisabled('heys_disable_screen_aware');
  }

  function getForegroundAutoSyncClientId() {
    return typeof cloud.getCurrentClientId === 'function' ? cloud.getCurrentClientId() : null;
  }

  const HOT_SYNC_HISTORY_LIMIT = 25;
  const HOT_SYNC_HEARTBEAT_EVERY = 10;
  const HOT_SYNC_SUPPLEMENT_PROFILE_FIELDS = new Set([
    'plannedSupplements',
    'supplementSettings',
    'supplementHistory',
    'customSupplements',
    'supplementUserFlags'
  ]);
  let foregroundAutoSyncIdleStreak = 0;
  let foregroundAutoSyncLastFallbackAt = 0;
  const foregroundHotSyncHistory = [];

  function getForegroundAutoSyncIntervalMs() {
    let interval = foregroundAutoSyncIdleStreak >= 5
      ? FOREGROUND_AUTO_SYNC_INTERVAL_IDLE_MS
      : FOREGROUND_AUTO_SYNC_INTERVAL_ACTIVE_MS;
    try {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection?.saveData) interval = Math.max(interval, FOREGROUND_AUTO_SYNC_INTERVAL_LOW_END_MS);
      const effectiveType = String(connection?.effectiveType || '');
      if (effectiveType === '2g' || effectiveType === '3g' || effectiveType === 'slow-2g') {
        interval = Math.max(interval, FOREGROUND_AUTO_SYNC_INTERVAL_LOW_END_MS);
      }
      const deviceMemory = Number(navigator.deviceMemory || 0);
      if (Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4) {
        interval = Math.max(interval, FOREGROUND_AUTO_SYNC_INTERVAL_LOW_END_MS);
      }
    } catch (_) { }
    return interval;
  }

  function getChangedTopLevelKeys(previousValue, nextValue) {
    const prev = previousValue && typeof previousValue === 'object' && !Array.isArray(previousValue)
      ? previousValue
      : {};
    const next = nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue)
      ? nextValue
      : {};

    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    const changed = [];
    keys.forEach((key) => {
      try {
        if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
          changed.push(key);
        }
      } catch (_) {
        changed.push(key);
      }
    });
    return changed;
  }

  function dispatchForegroundHotSyncProfileEvents(clientId, baseKey, previousValue, nextValue, source) {
    if (typeof window === 'undefined' || !window.dispatchEvent) return;

    // heys_norms — fire heys:norms-updated so UserTab refreshes its React state
    // and its 300ms debounced auto-save doesn't clobber the freshly-synced cloud
    // value (same class of bug as supplements profile clobber).
    if (baseKey === 'heys_norms') {
      window.dispatchEvent(new CustomEvent('heys:norms-updated', {
        detail: { clientId, source: source || 'hot-sync' }
      }));
      return;
    }

    // heys_hr_zones — same pattern.
    if (baseKey === 'heys_hr_zones') {
      window.dispatchEvent(new CustomEvent('heys:hr-zones-updated', {
        detail: { clientId, source: source || 'hot-sync' }
      }));
      return;
    }

    if (baseKey !== 'heys_profile') return;

    const changedFields = getChangedTopLevelKeys(previousValue, nextValue);
    const detail = {
      clientId,
      field: changedFields.length === 1 ? changedFields[0] : null,
      fields: changedFields,
      source,
    };

    window.dispatchEvent(new CustomEvent('heys:profile-updated', { detail }));

    if (!changedFields.length || changedFields.some((field) => HOT_SYNC_SUPPLEMENT_PROFILE_FIELDS.has(field))) {
      window.dispatchEvent(new CustomEvent('heys:supplements-updated', { detail }));
    }
  }

  function rememberForegroundHotSyncRun(entry) {
    foregroundHotSyncHistory.unshift(entry);
    if (foregroundHotSyncHistory.length > HOT_SYNC_HISTORY_LIMIT) {
      foregroundHotSyncHistory.length = HOT_SYNC_HISTORY_LIMIT;
    }
    cloud._lastForegroundHotSync = entry;
  }

  function dispatchForegroundHotSyncCompleted(clientId, reason, hotSync) {
    if (!global.dispatchEvent) return;
    try {
      global.dispatchEvent(new CustomEvent('heysSyncCompleted', {
        detail: {
          clientId,
          phase: 'hot',
          reason,
          mode: hotSync?.mode || 'unknown',
          updated: hotSync?.updated || 0,
          fetchedKeyCount: hotSync?.fetchedKeyCount || 0,
          markerScopes: Array.isArray(hotSync?.markerScopes) ? hotSync.markerScopes : [],
          source: 'foreground-hot-sync'
        }
      }));
    } catch (_) { }
  }

  async function maybeRunForegroundFullFallback(clientId, reason) {
    const now = Date.now();
    if ((now - foregroundAutoSyncLastFallbackAt) < FOREGROUND_AUTO_SYNC_FALLBACK_COOLDOWN_MS) {
      return false;
    }
    foregroundAutoSyncLastFallbackAt = now;
    await cloud.syncClient(clientId, { force: true, silent: true });
    return true;
  }

  function canRunForegroundAutoSync(clientId) {
    if (isHotSyncDisabled()) { console.info('[HEYS.sync] 🔇 hot-sync disabled via flag'); return false; }
    if (!clientId) { console.info('[HEYS.sync] 🔇 hot-sync skip: no clientId'); return false; }
    if (cloud._switchClientInProgress) { console.info('[HEYS.sync] 🔇 hot-sync skip: switchClient in progress'); return false; }
    try {
      const qUntil = Number(cloud._hotSyncQuietUntilMs) || 0;
      if (qUntil > 0 && Date.now() < qUntil) {
        console.info('[HEYS.sync] 🔇 hot-sync skip: post-switch cooldown');
        return false;
      }
    } catch (_) { /* noop */ }
    if (!navigator.onLine) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    const isPinAuth = _pinAuthClientId && _pinAuthClientId === clientId;
    let hasCuratorTok = false;
    try {
      const cs = global.localStorage.getItem('heys_curator_session');
      if (cs && cs.length > 10) hasCuratorTok = true;
    } catch (_) { /* noop */ }
    return Boolean(isPinAuth || user || hasCuratorTok);
  }

  function getForegroundHotSyncKeys(reason) {
    const today = new Date().toISOString().slice(0, 10);
    const allClientKeys = Array.isArray(CLIENT_SPECIFIC_KEYS) ? CLIENT_SPECIFIC_KEYS.slice() : [];

    // Screen-awareness: include actively viewed day if different from today.
    // Can be disabled: localStorage.setItem('heys_disable_screen_aware', '1')
    const activeDayKeys = [`heys_dayv2_${today}`];
    if (!isScreenAwareDisabled()) {
      try {
        const activeDate = global.HEYS?.DayUI?.getActiveDate?.() ||
          global.HEYS?.store?.get?.('heys_active_day_date');
        if (activeDate && typeof activeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(activeDate) && activeDate !== today) {
          activeDayKeys.push(`heys_dayv2_${activeDate}`);
        }
      } catch (_) { /* no active date available — use today only */ }
    }

    // Include dynamic client keys currently present in storage
    // (e.g. heys_milestone_* and future prefixed keys).
    const dynamicPrefixedKeys = [];
    try {
      const ls = global.localStorage;
      for (let i = 0; i < ls.length; i += 1) {
        const rawKey = ls.key(i);
        const baseKey = stripClientScopePrefixes(String(rawKey || '')).key;
        if (!baseKey) continue;
        if (baseKey.includes(CLIENT_KEY_PATTERNS.DAY_V2)) continue;
        if (!isOurKey(baseKey)) continue;
        if (needsClientStorage(baseKey) || needsClientStorage(rawKey)) {
          dynamicPrefixedKeys.push(baseKey);
        }
      }
    } catch (_) { /* ignore storage enumeration issues */ }

    // Hidden/background reasons keep minimal pull.
    if (reason === 'marker-scope') {
      return Array.from(new Set([...allClientKeys, ...activeDayKeys, ...dynamicPrefixedKeys]));
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return Array.from(new Set(['heys_profile', ...activeDayKeys]));
    }

    // Foreground visible mode: full client-specific set for cross-browser freshness.
    return Array.from(new Set([...allClientKeys, ...activeDayKeys, ...dynamicPrefixedKeys]));
  }

  function getScopedClientStorageKey(clientId, baseKey) {
    if (!baseKey) return baseKey;
    const normalized = scopeKeyForClientStorage(baseKey, clientId);
    if (isForeignClientScopedKey(normalized, clientId)) return null;
    return normalized;
  }

  function applyForegroundHotSyncValue(clientId, baseKey, value, source = 'foreground-hot-sync') {
    if (!clientId || !baseKey || value == null) return false;
    if (isSensitiveSessionStorageKey(baseKey)) return false;

    // Overlay key — канонический real-time канал sync продуктов между устройствами.
    // Без этой ветки удаление продукта на телефоне не попадёт на планшет до полного
    // bootstrap (overlay key не было в HOT-sync ранее). applyCloudSnapshot делает
    // dedup TypeA, фильтрует tombstones, сохраняет pending-local customs.
    if (baseKey === 'heys_products_overlay_v2' || baseKey.endsWith('_products_overlay_v2')) {
      try {
        if (global.HEYS && global.HEYS.OverlayStore
            && typeof global.HEYS.OverlayStore.applyCloudSnapshot === 'function'
            && Array.isArray(value)) {
          const _r = global.HEYS.OverlayStore.applyCloudSnapshot(value, { source: 'hot-sync-overlay' });
          try { logCritical(`[HOT-sync overlay] applyCloudSnapshot: ${JSON.stringify(_r)}`); } catch (_) {}
          return true;
        }
      } catch (_) { /* noop */ }
      return false;
    }

    // Overlay v2 RPC tail shards: ignore in HOT-sync (no LS persistence).
    // Tails are only meaningful when reassembled in download paths via
    // mergeOverlayRpcTailRawClientRows / mergeOverlayRpcTailDeduped.
    // applyCloudSnapshot's pendingLocalTypeA preserves local TypeA when
    // a partial main shard arrives, so HOT-sync stays consistent without
    // tail handling. Full reassembly happens on next bootstrap/full sync.
    if (isOverlayTailRpcKey(baseKey)) {
      return true; // mark handled — don't write to LS as garbage key
    }

    // Phase ε: drop incoming HOT-sync of legacy heys_products when overlay is canonical.
    // Cloud copy of this key is no longer being pushed by us; whatever sits in cloud is
    // either stale (older device on older code) or our own retained pre-cutover snapshot.
    // Applying it would clobber overlay-driven local state with old data.
    // EXCEPTION: before dropping, upsert any incoming custom products that are missing
    // from the local overlay — handles cross-device sync of user-added custom products.
    // Gate: flag overlay_products_v2 ON AND (migration_status=success OR overlay LS has rows).
    // Второе условие защищает свежие устройства от первого HOT-sync до миграции.
    let __hotOverlayHasRows = false;
    if (baseKey === 'heys_products'
        && global.HEYS && global.HEYS.flags
        && global.HEYS.flags.isEnabled && global.HEYS.flags.isEnabled('overlay_products_v2')) {
      try {
        const __store = global.HEYS && global.HEYS.OverlayStore;
        if (__store && typeof __store.readRaw === 'function') {
          const __rows = __store.readRaw();
          __hotOverlayHasRows = Array.isArray(__rows) && __rows.length > 0;
        }
      } catch (_) { /* noop */ }
    }
    if (baseKey === 'heys_products'
        && global.HEYS && global.HEYS.flags
        && global.HEYS.flags.isEnabled && global.HEYS.flags.isEnabled('overlay_products_v2')
        && (global.localStorage.getItem('heys_overlay_migration_status') === 'success' || __hotOverlayHasRows)) {
      try {
        const incomingArr = Array.isArray(value) ? value : null;
        if (incomingArr && incomingArr.length > 0 && global.HEYS.OverlayStore) {
          // Shared catalog may not be loaded yet when HOT-sync fires at pageshow.
          // Use it to exclude shared products when available; otherwise include all
          // products missing from the overlay (worst case: a shared product gets a
          // _custom row temporarily — harmless, overlay getById returns it with full data).
          const sharedById = (global.HEYS.cloud && global.HEYS.cloud.getSharedIndex)
            ? global.HEYS.cloud.getSharedIndex()
            : null;
          const prevRows = global.HEYS.OverlayStore.readRaw() || [];
          const prevIds = new Set(prevRows.map(r => String(r && r.id != null ? r.id : '')).filter(Boolean));
          const newCustom = incomingArr.filter(p => {
            if (!p || p.id == null || !p.name) return false;
            if (prevIds.has(String(p.id))) return false;                          // already in overlay
            if (sharedById && sharedById.size > 0
                && sharedById.has(String(p.id))) return false;                    // shared — skip
            return true;                                                          // new product from another device
          });
          if (newCustom.length > 0) {
            const newRows = newCustom.map(p => Object.assign({}, p, { _custom: true }));
            global.HEYS.OverlayStore.writeRaw(prevRows.concat(newRows));
            console.info('[HEYS.products] hot-sync Phase-ε: upserted ' + newCustom.length + ' product(s) from other device',
              newCustom.map(p => p.name));
          } else {
            console.info('[HEYS.products] hot-sync skipped {key: legacy heys_products, reason: overlay-canonical}');
          }
        }
      } catch (_) { /* noop */ }
      return false;
    }

    const scopedKey = getScopedClientStorageKey(clientId, baseKey);
    if (!scopedKey) return false;

    // 🛟 Decompress cloud-stored compressed values BEFORE serialize/write.
    // Otherwise '¤Z¤...' string lands in localStorage as JSON-quoted string.
    const __decompHot = decompressCloudRowValue(value, baseKey);
    if (!__decompHot.ok) {
      return false; // skip — better than corrupting localStorage with the compressed string
    }
    value = __decompHot.value;

    let serialized = null;
    try {
      serialized = JSON.stringify(value);
    } catch (_) {
      return false;
    }

    try {
      if (!assertSyncWriteOwnership(scopedKey, clientId, source)) return false;
      const currentRaw = global.localStorage.getItem(scopedKey);
      const previousValue = currentRaw ? tryParse(currentRaw) : null;
      if (currentRaw === serialized) return false;

      // HOT sync products anti-shrink + nutrient-completeness guard.
      // Block legitimate cloud → local overwrite when local has MORE data
      // (length OR more iron-bearing rows). Mirrors the dayv2/widget_layout pattern.
      // The dual-write-via-interceptor will still keep overlay in sync; this
      // protects orphan-recovered local state from being clobbered by stale cloud.
      try {
        const isProductsKey = (typeof baseKey === 'string' && /^heys_.*products$/.test(baseKey) && !/(_hidden_products|_favorite_products|_deleted_products|_rpc_tail)/.test(baseKey))
          || (typeof scopedKey === 'string' && /^heys_.*products$/.test(scopedKey) && !/(_hidden_products|_favorite_products|_deleted_products|_rpc_tail)/.test(scopedKey));
        if (isProductsKey) {
          let localArr = null;
          try {
            const parsed = currentRaw ? JSON.parse(currentRaw) : null;
            if (Array.isArray(parsed)) localArr = parsed;
          } catch (_) { /* noop */ }
          const incomingArr = Array.isArray(value) ? value : null;
          if (localArr && incomingArr) {
            const localLen = localArr.length;
            const incomingLen = incomingArr.length;
            const localWithIron = localArr.filter(p => p && Number(p.iron) > 0).length;
            const incomingWithIron = incomingArr.filter(p => p && Number(p.iron) > 0).length;
            // Block if (a) cloud shrinks AND loses nutrients, OR (b) length equal but cloud loses
            // significant nutrient data. The latter catches stale-cloud overwrites that match length
            // but have iron=1 vs local iron=200+ (race seen in production logs 2026-04-25).
            const significantIronLoss = localWithIron > 0 && incomingWithIron < (localWithIron / 2);
            if ((localLen > incomingLen && localWithIron > incomingWithIron) || significantIronLoss) {
              console.warn('[HEYS.products] hot-sync BLOCK overwrite-shrink', {
                source,
                localLen, incomingLen,
                localWithIron, incomingWithIron,
                reason: localLen > incomingLen ? 'shrink-with-nutrient-loss' : 'iron-cliff',
              });
              return false;
            }
          }
        }
      } catch (_) { /* noop */ }

      // 🛡️ FIX: Protect widget_layout from hot-sync race condition.
      // Hot-sync can fetch stale cloud data before doImmediateClientUpload completes.
      // Without this check, stale cloud data overwrites fresh local settings.
      if (baseKey.includes('widget_layout') && !baseKey.includes('_meta_')) {
        try {
          const localObj = currentRaw ? JSON.parse(currentRaw) : null;
          const localUp = localObj?.updatedAt;
          const remoteUp = value?.updatedAt;
          if (typeof localUp === 'number' && typeof remoteUp === 'number' && localUp >= remoteUp) {
            return false; // local is newer — don't overwrite
          }
        } catch (_) { /* parse error — proceed normally */ }
      }

      if (baseKey.includes('dayv2_') && !/(^|_)dayv2_date$/.test(scopedKey)) {
        // 🛡️ FIX: Protect dayv2 from hot-sync overwrite with stale cloud data.
        // Hot-sync can receive cloud data that is older than the fresh local add
        // (product was added locally but not yet uploaded). Without this check,
        // the stale cloud version overwrites localStorage, making the product disappear.
        // Mirrors the widget_layout protection above.
        try {
          const localObj = currentRaw ? JSON.parse(currentRaw) : null;
          const localUp = localObj?.updatedAt;
          const remoteUp = value?.updatedAt;
          if (typeof localUp === 'number' && typeof remoteUp === 'number' && localUp > remoteUp) {
            logCritical(`🛡️ [DAYV2 HOT] BLOCKED overwrite (local ${localUp} > remote ${remoteUp}): ${scopedKey}`);
            return false; // local is newer — don't overwrite
          }
        } catch (_) { /* parse error — proceed normally */ }
        const wroteDay = writeDayKeyWithQuotaGuard(scopedKey, value, {
          preserveRecentDuringHydration: true,
          nowTs: Date.now()
        });
        if (!wroteDay) return false;
      } else {
        global.localStorage.setItem(scopedKey, serialized);
      }

      if (global.HEYS?.store?.invalidate) {
        global.HEYS.store.invalidate(scopedKey);
      }

      dispatchForegroundHotSyncProfileEvents(clientId, baseKey, previousValue, value, source);

      if (baseKey.includes('widget_layout') && typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:widget-layout-updated', {
          detail: { layout: value, source }
        }));
      }

      if (baseKey.includes('dayv2_') && typeof window !== 'undefined' && window.dispatchEvent) {
        const dateMatch = baseKey.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
        const updatedDate = dateMatch ? dateMatch[1] : value?.date;
        if (updatedDate) {
          window.dispatchEvent(new CustomEvent('heys:day-updated', {
            detail: { date: updatedDate, source, forceReload: true }
          }));
        }
      }

      if (baseKey === 'heys_products' && typeof window !== 'undefined' && window.dispatchEvent && Array.isArray(value)) {
        const detail = {
          products: value,
          count: value.length,
          source
        };
        // boot_optimized_v1 / S4: bump content-version counter (see plan).
        try {
          window.HEYS = window.HEYS || {};
          window.HEYS.products = window.HEYS.products || {};
          window.HEYS.products.contentVersion = (window.HEYS.products.contentVersion || 0) + 1;
        } catch (_) { /* noop */ }
        // Defer event dispatch out of the HOT sync message handler so that synchronous
        // listeners (orphanProducts.recalculate, normalizePersonalProducts, etc.) don't
        // block the main thread inside the message handler. Products are already written
        // to localStorage — listeners reading HEYS.products.getAll() see fresh data.
        setTimeout(function () {
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('heys:products-updated', { detail }));
            window.dispatchEvent(new CustomEvent('heysProductsUpdated', { detail }));
          }
        }, 0);
      }

      if (baseKey.startsWith('heys_planning_') && typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:planning-updated', {
          detail: { key: baseKey, source }
        }));
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  // Phase 1b: change markers state
  let _lastMarkerCheckTs = null; // ISO string of last successful marker check

  /**
   * Phase 1b: derive which keys need pulling based on changed scopes.
   * Returns null if markers are unavailable (fallback to full key set).
   */
  function _getKeysForChangedScopes(markers, allKeys) {
    if (!markers || typeof markers !== 'object') return null;
    const changedScopes = Object.keys(markers);
    if (changedScopes.length === 0) return []; // nothing changed → skip pull

    const needed = [];
    let hasUnknownScope = false;
    for (const key of allKeys) {
      // Map key → scope and check if that scope changed
      if (key.includes('widget_layout') && changedScopes.includes('widgets')) {
        needed.push(key);
      } else if (key === 'heys_products' && changedScopes.includes('products')) {
        needed.push(key);
      } else if (key.startsWith('heys_planning_') && changedScopes.includes('planning')) {
        needed.push(key);
      } else if (key === 'heys_profile' && changedScopes.includes('profile')) {
        needed.push(key);
      } else if (key === 'heys_norms' && changedScopes.includes('norms')) {
        needed.push(key);
      } else if (key === 'heys_hr_zones' && changedScopes.includes('hr_zones')) {
        needed.push(key);
      } else if ((key === 'heys_game' || key.startsWith('heys_milestone_') || key === 'heys_best_streak') && changedScopes.includes('game')) {
        needed.push(key);
      } else if (key.startsWith('heys_advice_') && changedScopes.includes('advice')) {
        needed.push(key);
      } else if (key.includes('dayv2_')) {
        const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
        if (dateMatch && changedScopes.includes('day:' + dateMatch[1])) {
          needed.push(key);
        }
      }
    }
    for (const scope of changedScopes) {
      if (
        scope === 'widgets' ||
        scope === 'products' ||
        scope === 'planning' ||
        scope === 'profile' ||
        scope === 'norms' ||
        scope === 'hr_zones' ||
        scope === 'game' ||
        scope === 'advice' ||
        scope.startsWith('day:')
      ) {
        continue;
      }
      hasUnknownScope = true;
      break;
    }
    if (hasUnknownScope) {
      return allKeys;
    }
    return needed;
  }

  async function runForegroundHotKeySync(clientId, reason) {
    const YandexAPI = global.HEYS?.YandexAPI;
    if (!YandexAPI) {
      return { success: false, updated: 0, failed: 0, reason: 'no_api', mode: 'no-api', fetchedKeys: [], fetchedKeyCount: 0, markerScopes: [] };
    }

    foregroundAutoSyncTick += 1;
    const allKeys = getForegroundHotSyncKeys(reason);
    const markerAwareKeys = Array.from(new Set([...allKeys, ...getForegroundHotSyncKeys('marker-scope')]));
    let markerScopes = [];

    // Detect auth mode: session_token (PIN client) vs curator JWT
    const hasSessionToken = !!(
      (typeof HEYS !== 'undefined' && HEYS.auth?.getSessionToken?.()) ||
      global.localStorage.getItem('heys_session_token')
    );
    const hasCuratorSession = (() => {
      try {
        const storedToken = global.localStorage.getItem('heys_supabase_auth_token');
        if (!storedToken) return false;
        const parsed = JSON.parse(storedToken);
        return !!(parsed && parsed.user && parsed.access_token);
      } catch (_) {
        return false;
      }
    })();
    const isCuratorLike = !!(user || hasCuratorSession);
    const isCuratorMode = !hasSessionToken && isCuratorLike;

    // Phase 1b: check change markers before pulling data
    // Can be disabled: localStorage.setItem('heys_disable_markers', '1')
    let keysToFetch = allKeys;
    if (!isMarkersDisabled()) {
      try {
        let markerResult = null;

        if (hasSessionToken && typeof YandexAPI.getChangeMarkers === 'function') {
          markerResult = await YandexAPI.getChangeMarkers(_lastMarkerCheckTs);
        } else if (isCuratorMode && typeof YandexAPI.getChangeMarkersByCurator === 'function') {
          markerResult = await YandexAPI.getChangeMarkersByCurator(clientId, _lastMarkerCheckTs);
        }

        if (markerResult && !markerResult.error && markerResult.data) {
          markerScopes = Object.keys(markerResult.data || {});
          // Важно: marker-check не должен терять day/profile updates только потому,
          // что текущий visible tick использует сокращённый набор fast keys.
          // Иначе change marker может быть "съеден" как markers-skip до следующего
          // extended tick и UI так и не увидит актуальный day/profile update.
          const changedKeys = _getKeysForChangedScopes(markerResult.data, markerAwareKeys);
          if (changedKeys !== null) {
            _lastMarkerCheckTs = new Date().toISOString();
            if (changedKeys.length === 0) {
              // Nothing changed — skip pull entirely
              return { success: true, updated: 0, failed: 0, authMissing: false, mode: 'markers-skip', fetchedKeys: [], fetchedKeyCount: 0, markerScopes };
            }
            keysToFetch = changedKeys;
          }
        } else if (markerResult?.error === 'No session token') {
          // PIN / legacy: no session. Curator uses Supabase JWT — marker API may still say "No session token".
          if (!isCuratorMode) {
            return { success: false, updated: 0, failed: 0, authMissing: true, mode: 'no-auth', fetchedKeys: [], fetchedKeyCount: 0, markerScopes };
          }
        }
        // If markers returned error → fallback to full key set (keysToFetch unchanged)
      } catch (_) {
        // Markers unavailable → fallback to full pull
      }
    }

    // Phase 1a: single batch read instead of N individual getKV calls
    // Can be disabled: localStorage.setItem('heys_disable_batch', '1')
    if (!isBatchDisabled()) {
      try {
        let batchResult = null;

        if (hasSessionToken && typeof YandexAPI.getKVBatch === 'function') {
          batchResult = await YandexAPI.getKVBatch(clientId, keysToFetch);
        } else if (isCuratorMode && typeof YandexAPI.getKVBatchByCurator === 'function') {
          batchResult = await YandexAPI.getKVBatchByCurator(clientId, keysToFetch);
        }

        if (batchResult?.error === 'No session token') {
          if (!isCuratorMode) {
            return { success: false, updated: 0, failed: 0, authMissing: true, mode: 'no-auth', fetchedKeys: keysToFetch, fetchedKeyCount: keysToFetch.length, markerScopes };
          }
        }

        if (batchResult && !batchResult.error && Array.isArray(batchResult.data)) {
          let updated = 0;
          for (const item of batchResult.data) {
            if (item.v != null && applyForegroundHotSyncValue(clientId, item.k, item.v)) {
              updated += 1;
            }
          }

          if (updated > 0) {
            cloud._syncCompletedAt = Date.now();
            if (global.HEYS?.store?.flushMemory) {
              global.HEYS.store.flushMemory();
            }
            console.info(`[HEYS.sync] ✅ Foreground hot-sync applied ${updated} key(s) via ${isCuratorMode ? 'curator REST' : 'batch RPC'} (${reason})`);
          }

          return {
            success: true,
            updated,
            failed: 0,
            authMissing: false,
            mode: isCuratorMode ? 'curator-batch' : 'session-batch',
            fetchedKeys: keysToFetch,
            fetchedKeyCount: keysToFetch.length,
            markerScopes,
          };
        }

        // Batch returned error (e.g. function not deployed yet) — fallback
        if (batchResult) {
          console.info('[HEYS.sync] ⚠️ Batch hot-sync unavailable, fallback to legacy');
        }
      } catch (e) {
        console.info('[HEYS.sync] ⚠️ Batch hot-sync failed, fallback to legacy:', e?.message);
      }
    }

    // Legacy fallback: N individual getKV calls (works only with session_token)
    // For curator without session — use getAllKVByCurator as final fallback
    if (isCuratorMode && typeof YandexAPI.getAllKVByCurator === 'function') {
      return _runForegroundHotKeySyncCurator(clientId, keysToFetch, reason, markerScopes);
    }
    return _runForegroundHotKeySyncLegacy(clientId, keysToFetch, markerScopes);
  }

  async function _runForegroundHotKeySyncLegacy(clientId, keys, markerScopes = []) {
    const YandexAPI = global.HEYS?.YandexAPI;
    if (!YandexAPI || typeof YandexAPI.getKV !== 'function') {
      return { success: false, updated: 0, failed: 0, reason: 'no_getkv', mode: 'no-getkv', fetchedKeys: keys, fetchedKeyCount: keys.length, markerScopes };
    }

    // PERF NEW-13: progressive hydration с soft 3s budget.
    // Раньше: await Promise.allSettled(...) ждал САМЫЙ МЕДЛЕННЫЙ ключ.
    // На Slow 4G один тайм-аут (12-22с) → весь foreground залипал на это время.
    // Теперь: каждый ключ применяется через applyForegroundHotSyncValue ПО МЕРЕ ПРИХОДА;
    // агрегат возвращается через 3с budget или после всех — что раньше. Поздние ответы
    // продолжают применяться (side effect), но не блокируют await.
    const SOFT_BUDGET_MS = 3000;
    let updated = 0;
    let failed = 0;
    let authMissing = false;
    let returnedEarly = false;
    let lateArrivals = 0;

    const handleResult = (key, result) => {
      if (result.status !== 'fulfilled') {
        if (!returnedEarly) failed += 1; else lateArrivals += 1;
        return;
      }
      const payload = result.value || {};
      if (payload.error) {
        if (payload.error === 'No session token' && !returnedEarly) authMissing = true;
        if (!returnedEarly) failed += 1; else lateArrivals += 1;
        return;
      }
      if (payload.data == null) return;
      const applied = applyForegroundHotSyncValue(clientId, key, payload.data);
      if (applied) {
        if (!returnedEarly) updated += 1;
        else lateArrivals += 1;
      }
    };

    const tasks = keys.map((key) =>
      YandexAPI.getKV(clientId, key)
        .then((value) => handleResult(key, { status: 'fulfilled', value }))
        .catch((reason) => handleResult(key, { status: 'rejected', reason }))
    );

    await Promise.race([
      Promise.allSettled(tasks),
      new Promise((resolve) => setTimeout(resolve, SOFT_BUDGET_MS)),
    ]);
    returnedEarly = true;

    // Поздние ответы продолжают применяться в фоне (через handleResult выше).
    // Логируем количество для наблюдения и при необходимости флашим память.
    Promise.allSettled(tasks).then(() => {
      if (lateArrivals > 0) {
        console.info(`[HEYS.sync] 🐢 hot-sync late arrivals: ${lateArrivals} key(s) applied after ${SOFT_BUDGET_MS}ms budget`);
        if (global.HEYS?.store?.flushMemory) {
          try { global.HEYS.store.flushMemory(); } catch (_) { /* noop */ }
        }
      }
    });

    if (updated > 0) {
      cloud._syncCompletedAt = Date.now();
      // НЕ обновляем last_sync_ts: hot-sync тянет только несколько ключей,
      // а last_sync_ts используется delta-sync как точка отсчёта для ВСЕХ ключей.
      // Перезапись приведёт к потере изменений в ключах вне hot-sync списка.
      if (global.HEYS?.store?.flushMemory) {
        global.HEYS.store.flushMemory();
      }
      console.info(`[HEYS.sync] ✅ Foreground hot-sync applied ${updated} key(s) (${reason})`);
    }

    return {
      success: !authMissing,
      updated,
      failed,
      authMissing,
      mode: 'legacy-getkv',
      fetchedKeys: keys,
      fetchedKeyCount: keys.length,
      markerScopes,
    };
  }

  /**
   * Curator fallback for legacy hot-sync: uses getAllKVByCurator with targeted keys.
   * Called when curator has no session_token and batch/markers also failed.
   */
  async function _runForegroundHotKeySyncCurator(clientId, keys, reason, markerScopes = []) {
    const YandexAPI = global.HEYS?.YandexAPI;
    if (!YandexAPI || typeof YandexAPI.getAllKVByCurator !== 'function') {
      return { success: false, updated: 0, failed: 0, reason: 'no_curator_api', mode: 'no-curator-api', fetchedKeys: keys, fetchedKeyCount: keys.length, markerScopes };
    }

    try {
      const result = await YandexAPI.getAllKVByCurator(clientId, { keys });
      if (result.error) {
        return { success: false, updated: 0, failed: 0, authMissing: false, mode: 'curator-rest-error', fetchedKeys: keys, fetchedKeyCount: keys.length, markerScopes };
      }

      let updated = 0;
      const rows = Array.isArray(result.data) ? result.data : [];
      for (const row of rows) {
        if (row.v != null && row.k && applyForegroundHotSyncValue(clientId, row.k, row.v)) {
          updated += 1;
        }
      }

      if (updated > 0) {
        cloud._syncCompletedAt = Date.now();
        if (global.HEYS?.store?.flushMemory) {
          global.HEYS.store.flushMemory();
        }
        console.info(`[HEYS.sync] ✅ Foreground hot-sync applied ${updated} key(s) via curator REST fallback (${reason})`);
      }

      return {
        success: true,
        updated,
        failed: 0,
        authMissing: false,
        mode: 'curator-rest-fallback',
        fetchedKeys: keys,
        fetchedKeyCount: keys.length,
        markerScopes,
      };
    } catch (e) {
      console.warn('[HEYS.sync] ⚠️ Curator hot-sync fallback failed:', e?.message);
      return { success: false, updated: 0, failed: 0, authMissing: false, mode: 'curator-rest-exception', fetchedKeys: keys, fetchedKeyCount: keys.length, markerScopes };
    }
  }

  async function requestForegroundAutoSync(reason, options = {}) {
    const clientId = options.clientId || getForegroundAutoSyncClientId();
    if (!canRunForegroundAutoSync(clientId)) return false;
    if (foregroundAutoSyncInFlight) {
      console.info('[HEYS.sync] 🔇 hot-sync skip: in-flight');
      return false;
    }

    const now = Date.now();
    const minGapMs = Number.isFinite(options.minGapMs) ? options.minGapMs : FOREGROUND_AUTO_SYNC_MIN_GAP_MS;
    if ((now - foregroundAutoSyncLastAt) < minGapMs) return false;

    // Backpressure: не тянем hot-sync пока очередь синка перегружена (снижает шторм UI + RPC)
    const BACKPRESSURE_SKIP_REASONS = new Set(['visible-interval', 'local-write', 'window-focus', 'pageshow']);
    if (BACKPRESSURE_SKIP_REASONS.has(String(reason || ''))) {
      try {
        const snapBp = getPendingQueuesSnapshot();
        const deepQueue = (snapBp.queueLen || 0) + (snapBp.inFlight || 0) > 45;
        const heavyUpload = !!snapBp.uploadInProgress && (snapBp.queueLen || 0) > 15;
        if (deepQueue || heavyUpload) {
          console.info('[HEYS.sync] 🔇 hot-sync skip: queue backpressure', {
            reason,
            total: snapBp.totalCount,
            q: snapBp.queueLen,
            inflight: snapBp.inFlight,
            upload: !!snapBp.uploadInProgress
          });
          return false;
        }
      } catch (_) { /* noop */ }
    }

    foregroundAutoSyncInFlight = true;
    foregroundAutoSyncLastAt = now;

    try {
      const __hotSyncT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      console.info('[HEYS.sync] ⚡ Foreground auto-sync:', reason, clientId.slice(0, 8));
      const hotSync = await runForegroundHotKeySync(clientId, reason);
      const __hotSyncWallMs = (typeof performance !== 'undefined' && performance.now) ? (performance.now() - __hotSyncT0) : 0;
      const hotSyncTrace = {
        ts: now,
        clientId: clientId.slice(0, 8),
        reason,
        mode: hotSync.mode || 'unknown',
        success: !!hotSync.success,
        updated: hotSync.updated || 0,
        failed: hotSync.failed || 0,
        authMissing: !!hotSync.authMissing,
        fetchedKeyCount: hotSync.fetchedKeyCount || 0,
        fetchedKeys: Array.isArray(hotSync.fetchedKeys) ? hotSync.fetchedKeys.slice(0, 8) : [],
        markerScopes: Array.isArray(hotSync.markerScopes) ? hotSync.markerScopes.slice(0, 8) : [],
      };
      rememberForegroundHotSyncRun(hotSyncTrace);

      try {
        const perf = window.HEYS && window.HEYS.perf;
        if (perf && typeof perf.commitTraceEnabled === 'function' && perf.commitTraceEnabled()) {
          const fk = Array.isArray(hotSync.fetchedKeys) ? hotSync.fetchedKeys.slice(0, 12) : [];
          console.info('[HEYS.sync] perf hot-sync finished', {
            reason,
            wallMs: Math.round(__hotSyncWallMs * 10) / 10,
            updated: hotSync.updated || 0,
            fetchedKeyCount: hotSync.fetchedKeyCount || 0,
            keys: fk,
            success: !!hotSync.success
          });
          if (hotSync.updated > 0 && typeof perf.markCommitHint === 'function') {
            perf.markCommitHint('hot-sync:updated', {
              reason,
              wallMs: Math.round(__hotSyncWallMs * 10) / 10,
              updated: hotSync.updated,
              keys: fk
            });
          }
        }
      } catch (_) { /* noop */ }

      if (hotSync.updated > 0) {
        foregroundAutoSyncIdleStreak = 0;
        logCriticalThrottled(
          `hot-updated:${String(reason || 'unknown')}`,
          12000,
          `⚡ [HOT] ${reason}: mode=${hotSyncTrace.mode} updated=${hotSyncTrace.updated}/${hotSyncTrace.fetchedKeyCount}` +
          (hotSyncTrace.fetchedKeys.length ? ` keys=${hotSyncTrace.fetchedKeys.join(', ')}` : '') +
          (hotSyncTrace.markerScopes.length ? ` scopes=${hotSyncTrace.markerScopes.join(', ')}` : '')
        );
        // Метка времени для подавления UI-индикатора реактивных сохранений
        try { window.__heysHotSyncLastWriteAt = Date.now(); } catch (_) { }
        dispatchForegroundHotSyncCompleted(clientId, reason, hotSync);
      } else if (hotSync.success) {
        foregroundAutoSyncIdleStreak += 1;
        if ((foregroundAutoSyncIdleStreak % HOT_SYNC_HEARTBEAT_EVERY) === 0) {
          console.info(
            `[HEYS.sync] 💓 Hot-sync alive: idle=${foregroundAutoSyncIdleStreak} ` +
            `mode=${hotSyncTrace.mode} keys=${hotSyncTrace.fetchedKeyCount} client=${hotSyncTrace.clientId}`
          );
        }
      } else {
        foregroundAutoSyncIdleStreak = 0;
      }

      if (hotSync.authMissing) {
        foregroundAutoSyncAuthFailCount += 1;
        logCriticalThrottled(`hot-auth-missing:${String(reason || 'unknown')}`, 15000, `⏸️ [HOT] ${reason}: auth missing, mode=${hotSyncTrace.mode}`);
        if (foregroundAutoSyncAuthFailCount >= 3) {
          console.warn('[HEYS.sync] ⏸️ Foreground auto-sync paused: no session token');
          stopForegroundAutoSyncLoop();
        }
        return false;
      }
      foregroundAutoSyncAuthFailCount = 0;

      // Auto-safety: track consecutive errors
      if (hotSync.success) {
        if (_hotSyncConsecutiveErrors > 0) {
          _hotSyncConsecutiveErrors = 0;
          if (_hotSyncAutoSafeMode) {
            _hotSyncAutoSafeMode = false;
            console.info('[HEYS.sync] ✅ Auto-safe mode cleared — sync healthy again');
          }
        }
      } else {
        _hotSyncConsecutiveErrors += 1;
        if (_hotSyncConsecutiveErrors >= HOT_SYNC_AUTO_SAFE_THRESHOLD && !_hotSyncAutoSafeMode) {
          _hotSyncAutoSafeMode = true;
          console.warn(`[HEYS.sync] 🛡️ Auto-safe mode ON: ${_hotSyncConsecutiveErrors} consecutive failures — degrading to legacy sync`);
        }
      }

      if (hotSync.success || hotSync.updated > 0) {
        return true;
      }

      // Fallback: if lightweight key-sync is unavailable (e.g. no session token),
      // try the existing full sync path.
      await maybeRunForegroundFullFallback(clientId, reason + ':hot-failed');
      return false;
    } catch (e) {
      console.warn('[HEYS.sync] ⚠️ Foreground auto-sync failed:', reason, e?.message || e);
      // Auto-safety: count exception as consecutive error
      _hotSyncConsecutiveErrors += 1;
      if (_hotSyncConsecutiveErrors >= HOT_SYNC_AUTO_SAFE_THRESHOLD && !_hotSyncAutoSafeMode) {
        _hotSyncAutoSafeMode = true;
        console.warn(`[HEYS.sync] 🛡️ Auto-safe mode ON: ${_hotSyncConsecutiveErrors} consecutive failures — degrading to legacy sync`);
      }
      try {
        await maybeRunForegroundFullFallback(clientId, reason + ':exception');
      } catch (_) { }
      return false;
    } finally {
      foregroundAutoSyncInFlight = false;
    }
  }

  function stopForegroundAutoSyncLoop() {
    if (!foregroundAutoSyncTimer) return;
    clearTimeout(foregroundAutoSyncTimer);
    foregroundAutoSyncTimer = null;
  }

  function startForegroundAutoSyncLoop() {
    if (foregroundAutoSyncTimer) return;
    if (isHotSyncDisabled()) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const scheduleNext = () => {
      if (foregroundAutoSyncTimer) clearTimeout(foregroundAutoSyncTimer);
      const intervalMs = getForegroundAutoSyncIntervalMs();
      foregroundAutoSyncTimer = setTimeout(() => {
        requestForegroundAutoSync('visible-interval', {
          minGapMs: Math.max(FOREGROUND_AUTO_SYNC_MIN_GAP_MS, intervalMs - 250)
        }).catch(() => { }).finally(() => {
          if (foregroundAutoSyncTimer) scheduleNext();
        });
      }, intervalMs);
    };
    console.info('[HEYS.sync] 🔄 Hot-sync loop started (adaptive interval)');
    scheduleNext();
  }

  function handleForegroundAutoSyncVisibility() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      stopForegroundAutoSyncLoop();
      return;
    }
    startForegroundAutoSyncLoop();
    requestForegroundAutoSync('visibility-visible', { minGapMs: 5000 }).catch(() => { });
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', handleForegroundAutoSyncVisibility);
    if (document.visibilityState !== 'hidden') {
      startForegroundAutoSyncLoop();
    }
  }

  if (global.addEventListener) {
    global.addEventListener('focus', function () {
      requestForegroundAutoSync('window-focus', { minGapMs: 5000 }).catch(() => { });
      startForegroundAutoSyncLoop();
    });
    global.addEventListener('pageshow', function () {
      requestForegroundAutoSync('pageshow', { minGapMs: 5000 }).catch(() => { });
      startForegroundAutoSyncLoop();
    });
    global.addEventListener('beforeunload', function () {
      stopForegroundAutoSyncLoop();
    });
  }

  // Console API for hot-sync management
  cloud.hotSync = {
    disable: function () {
      global.localStorage.setItem('heys_disable_hot_sync', '1');
      stopForegroundAutoSyncLoop();
      console.info('[HEYS.sync] 🛑 Hot-sync disabled. Re-enable: HEYS.cloud.hotSync.enable()');
    },
    enable: function () {
      global.localStorage.removeItem('heys_disable_hot_sync');
      _hotSyncAutoSafeMode = false;
      _hotSyncConsecutiveErrors = 0;
      startForegroundAutoSyncLoop();
      console.info('[HEYS.sync] ✅ Hot-sync re-enabled');
    },
    safeMode: function () {
      global.localStorage.setItem('heys_disable_markers', '1');
      global.localStorage.setItem('heys_disable_batch', '1');
      _hotSyncAutoSafeMode = false; // manual safe mode overrides auto
      console.info('[HEYS.sync] 🛡️ Safe mode ON — markers & batch disabled, using legacy N×getKV. Undo: HEYS.cloud.hotSync.normalMode()');
    },
    normalMode: function () {
      global.localStorage.removeItem('heys_disable_markers');
      global.localStorage.removeItem('heys_disable_batch');
      global.localStorage.removeItem('heys_disable_screen_aware');
      _hotSyncAutoSafeMode = false;
      _hotSyncConsecutiveErrors = 0;
      console.info('[HEYS.sync] ✅ Normal mode — all optimizations re-enabled');
    },
    status: function () {
      const disabled = isHotSyncDisabled();
      const running = !!foregroundAutoSyncTimer;
      const info = {
        disabled,
        running,
        tick: foregroundAutoSyncTick,
        lastAt: foregroundAutoSyncLastAt,
        idleStreak: foregroundAutoSyncIdleStreak,
        authFails: foregroundAutoSyncAuthFailCount,
        features: {
          markers: !isMarkersDisabled(),
          batch: !isBatchDisabled(),
          screenAware: !isScreenAwareDisabled()
        },
        autoSafeMode: _hotSyncAutoSafeMode,
        consecutiveErrors: _hotSyncConsecutiveErrors,
        lastRun: foregroundHotSyncHistory[0] || null
      };
      console.info('[HEYS.sync] Hot-sync status:', info);
      return info;
    },
    history: function (limit = 10) {
      const normalizedLimit = Math.max(1, Math.min(HOT_SYNC_HISTORY_LIMIT, Number(limit) || 10));
      const history = foregroundHotSyncHistory.slice(0, normalizedLimit);
      console.info('[HEYS.sync] Hot-sync history:', history);
      return history;
    }
  };

  const DUPLICATE_CLEANUP_MIN_GAP_MS = 5 * 60 * 1000;
  let _lastDuplicateCleanupAt = 0;

  function shouldRunDeepSyncDiagnostics() {
    try {
      if (global.DEV?.isDev?.()) return true;
      return global.localStorage.getItem('heys_sync_deep_diagnostics') === '1';
    } catch (_) {
      return false;
    }
  }

  function maybeCleanupDuplicateKeys(force = false) {
    const now = Date.now();
    if (!force && (now - _lastDuplicateCleanupAt) < DUPLICATE_CLEANUP_MIN_GAP_MS) {
      return 0;
    }
    _lastDuplicateCleanupAt = now;
    return cleanupDuplicateKeys();
  }

  /** Очистить дублирующиеся ключи (двойной clientId, старые форматы) */
  function cleanupDuplicateKeys() {
    const keysToRemove = [];
    const currentClientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;

    for (let i = 0; i < global.localStorage.length; i++) {
      const key = global.localStorage.key(i);
      if (!key) continue;

      // 1. Удаляем ключи с двойным clientId (bug): clientId_clientId_...
      if (key.match(/[a-f0-9-]{36}_[a-f0-9-]{36}_/)) {
        keysToRemove.push(key);
        continue;
      }

      // 2. Удаляем старый формат _heys_products (должен быть _products)
      if (key.includes('_heys_products')) {
        keysToRemove.push(key);
        continue;
      }

      // 3. Удаляем products_backup если есть products
      if (key.includes('_products_backup') && currentClientId && key.includes(currentClientId)) {
        const normalKey = key.replace('_products_backup', '_products');
        if (global.localStorage.getItem(normalKey)) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      keysToRemove.forEach(k => global.localStorage.removeItem(k));
      log(`🧹 Очищено ${keysToRemove.length} дублирующихся ключей`);
    }

    return keysToRemove.length;
  }

  /** Диагностика localStorage — показывает топ-10 ключей по размеру */
  cloud.diagnoseStorage = function () {
    const items = [];
    let total = 0;

    for (let key in global.localStorage) {
      if (global.localStorage.hasOwnProperty(key)) {
        const value = global.localStorage.getItem(key) || '';
        const sizeKB = (value.length * 2) / 1024;
        total += sizeKB;
        items.push({ key, sizeKB: sizeKB.toFixed(2), chars: value.length });
      }
    }

    items.sort((a, b) => parseFloat(b.sizeKB) - parseFloat(a.sizeKB));

    console.log('📊 localStorage диагностика:');
    console.log(`Общий размер: ${(total / 1024).toFixed(2)} MB`);
    console.log('Топ-10 по размеру:');
    console.table(items.slice(0, 10));

    return { totalMB: (total / 1024).toFixed(2), items: items.slice(0, 20) };
  };

  /** Очистить все данные текущего клиента (кроме профиля и auth) */
  cloud.clearClientData = function (keepDays = 30) {
    const clientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
    const prefix = clientId ? clientId + '_' : '';
    let cleaned = 0;

    const keysToRemove = [];
    for (let i = 0; i < global.localStorage.length; i++) {
      const key = global.localStorage.key(i);
      if (key && key.startsWith('heys_') && key.includes(prefix) && key.includes('dayv2_')) {
        const match = key.match(/dayv2_(\d{4}-\d{2}-\d{2})/);
        if (match) {
          const date = new Date(match[1]);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - keepDays);
          if (date < cutoff) {
            keysToRemove.push(key);
          }
        }
      }
    }

    keysToRemove.forEach(k => {
      global.localStorage.removeItem(k);
      cleaned++;
    });

    console.log(`🧹 Очищено ${cleaned} записей старше ${keepDays} дней`);
    cloud.diagnoseStorage();
    return cleaned;
  };

  /** Очистить дублирующиеся ключи вручную */
  cloud.cleanupDuplicates = function () {
    return maybeCleanupDuplicateKeys(true);
  };

  /** Удалить продукты других клиентов (освобождает много места) */
  cloud.cleanupOtherClientsProducts = function () {
    const currentClientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
    if (!currentClientId) {
      console.log('❌ Нет текущего клиента');
      return 0;
    }

    const keysToRemove = [];
    for (let i = 0; i < global.localStorage.length; i++) {
      const key = global.localStorage.key(i);
      if (key && key.includes('_products') && !key.includes(currentClientId)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(k => global.localStorage.removeItem(k));
    console.log(`🧹 Удалено ${keysToRemove.length} ключей продуктов других клиентов`);
    cloud.diagnoseStorage();
    return keysToRemove.length;
  };

  /**
   * Безопасное переключение клиента:
   * 1. Синхронизирует данные старого клиента в облако
   * 2. Ждёт завершения
   * 3. Очищает данные старого клиента из localStorage
   * 4. Загружает данные нового клиента
   */
  cloud.switchClient = async function (newClientId, _oldClientIdHint) {
    if (!newClientId) {
      console.error('[HEYS.sync] ❌ Не указан ID нового клиента');
      return false;
    }

    // 🔧 v65 FIX: Shell/GateFlow пишут heys_client_current ДО вызова switchClient,
    // поэтому getCurrentClientId() уже возвращает newClientId.
    // Принимаем _oldClientIdHint чтобы знать реальный предыдущий client.
    const oldClientId = (_oldClientIdHint && _oldClientIdHint !== newClientId)
      ? _oldClientIdHint
      : (cloud.getCurrentClientId ? cloud.getCurrentClientId() : null);

    const emitSwitchStage = function (stage, extra) {
      try {
        global.dispatchEvent(new CustomEvent('heys:client-switch-stage', {
          detail: {
            stage,
            clientId: newClientId,
            oldClientId,
            ...(extra || {})
          }
        }));
      } catch (_) { }
    };

    // Если тот же клиент — ничего не делаем
    if (oldClientId === newClientId) {
      log('Клиент уже выбран:', newClientId);
      // Gate/shell set _switchClientInProgress=true before switchClient; we never enter try/finally below.
      try { cloud._switchClientInProgress = false; } catch (_) { }
      try { cloud._flushDeferredWritesAfterSwitch(newClientId, oldClientId); } catch (_) { }
      emitSwitchStage('done');
      return true;
    }

    // 🔧 v63 FIX #1: Ставим флаг чтобы React useEffect не запускал параллельный syncClient
    cloud._switchClientInProgress = true;

    console.info(`[HEYS.sync] 🔄 Переключение клиента: ${oldClientId?.substring(0, 8) || 'нет'} → ${newClientId.substring(0, 8)}`);

    // 1. Сначала синхронизируем текущие данные в облако (если есть pending)
    const _pendingBeforeSwitch = oldClientId ? cloud.getPendingCount() : 0;
    if (_pendingBeforeSwitch > 0) {
      emitSwitchStage('saving', { pendingCount: _pendingBeforeSwitch });
      log('⏳ Ожидаем синхронизацию старого клиента...');

      // 🔧 v63 FIX #3: Используем flushPendingQueue вместо ручного polling.
      // flushPendingQueue делает немедленный upload и ждёт queue-drained event.
      try {
        const flushed = await cloud.flushPendingQueue(8000); // 8 сек таймаут
        if (flushed) {
          log('✅ Синхронизация старого клиента завершена');
        } else {
          logCritical('⚠️ [SWITCH] Flush timeout — ' + cloud.getPendingCount() + ' items still pending');
        }
      } catch (e) {
        logCritical('⚠️ Не удалось дождаться синхронизации, но продолжаем переключение');
      }
    }

    // 🔧 v67 FIX: Lightweight profile basics capture for post-sync contamination check.
    // Берём только scoped профиль старого клиента, иначе при ранней смене
    // heys_client_current можно случайно прочитать глобальный payload уже нового клиента.
    let _oldProfileBasics = null;
    if (oldClientId && oldClientId !== newClientId) {
      try {
        const _opRaw = global.localStorage.getItem('heys_' + oldClientId + '_profile');
        if (_opRaw) {
          const _parsedBasics = extractProfileBasics(_opRaw);
          if (_parsedBasics) {
            _oldProfileBasics = _parsedBasics;
            logCritical('🔍 [SWITCH] Captured old profile: ' + _oldProfileBasics.g + ' ' + _oldProfileBasics.w + 'кг ' + _oldProfileBasics.h + 'см');
          } else {
            let _op = tryParse(_opRaw);
            if (typeof _op === 'string') { try { _op = JSON.parse(_op); } catch (_) { _op = null; } }
            logCritical('🔍 [SWITCH] Old profile found but missing w/h/g: ' + (typeof _op) + ' keys=' + (_op && typeof _op === 'object' ? Object.keys(_op).join(',') : 'null'));
          }
        } else {
          logCritical('🔍 [SWITCH] Old profile NOT found in localStorage (scoped=' + ('heys_' + oldClientId + '_profile') + ')');
        }
      } catch (_) { logCritical('🔍 [SWITCH] Old profile capture error: ' + _); }
    }

    // 2. Сохраняем новый clientId ДО синхронизации (иначе bootstrapClientSync может пропустить)
    //    Но не очищаем старые данные, пока не убедимся что sync прошёл успешно.
    global.localStorage.setItem('heys_client_current', JSON.stringify(newClientId));

    // 🔧 v69 FIX: Устанавливаем currentClientId внутри switchClient.
    // Gate flow теперь НЕ меняет его до завершения switchClient, чтобы не было race condition.
    // Но scoped storage (Store.get/set, nsKey) нуждается в актуальном currentClientId
    // для корректной записи данных нового клиента.
    if (global.HEYS) {
      global.HEYS.currentClientId = newClientId;
    }

    // 🔧 v68 FIX: НЕ удаляем last_sync_ts — delta fast-path позволяет быстро
    // подгрузить только изменённые записи вместо полного sync 250+ ключей.
    // forceSync: true уже обеспечивает перезапись local данных из cloud.
    // initialSyncCompleted НЕ сбрасываем — избегаем cascade dots на каждом switch.

    // 3. Синхронизируем данные нового клиента из облака
    // 🔧 v70 FIX: Очищаем кэш дней ПЕРЕД загрузкой нового клиента,
    // чтобы виджеты/getDayData не вернули данные предыдущего клиента из DAYS_CACHE.
    if (global.HEYS?.dayUtils?.clearDaysCache) {
      global.HEYS.dayUtils.clearDaysCache();
      log('🧹 [SWITCH] DAYS_CACHE cleared before loading new client');
    }
    emitSwitchStage('loading', { pendingCount: _pendingBeforeSwitch });
    log('📥 Загружаем данные нового клиента...');
    let _switchUsedCuratorPath = false;
    try {
      // Проверяем есть ли сессия куратора (токен в localStorage)
      // ⚠️ Не полагаемся на переменную `user` — она может быть не синхронизирована!
      let hasCuratorSession = false;
      try {
        const storedToken = global.localStorage.getItem('heys_supabase_auth_token');
        if (storedToken) {
          const parsed = JSON.parse(storedToken);
          hasCuratorSession = !!(parsed?.user && parsed?.access_token);
        }
      } catch (_) { }

      // 🔍 DEBUG: Логируем какой путь выбран
      log(`🔍 [switchClient] user=${!!user}, hasCuratorSession=${hasCuratorSession}, → ${(user || hasCuratorSession) ? 'CURATOR path' : 'PIN path'}`);
      try {
        const hasSessionToken = typeof HEYS !== 'undefined' && HEYS.auth?.getSessionToken
          ? !!HEYS.auth.getSessionToken()
          : !!localStorage.getItem('heys_session_token');
        logCritical(`🔍 [switchClient] hasSessionToken=${hasSessionToken}, pinAuthClient=${!!localStorage.getItem('heys_pin_auth_client')}`);
      } catch (_) { }

      // Если есть Supabase user (куратор) — используем обычную синхронизацию
      // Если нет (вход по PIN) — используем RPC и включаем RPC-режим для сохранений
      // 🔐 v=37 FIX: После миграции на Yandex API ВСЕГДА используем RPC режим!
      if (user || hasCuratorSession) {
        // Куратор — если user ещё не установлен, восстанавливаем из токена
        if (!user && hasCuratorSession) {
          try {
            const storedToken = global.localStorage.getItem('heys_supabase_auth_token');
            const parsed = JSON.parse(storedToken);
            user = parsed.user;
            status = CONNECTION_STATUS.ONLINE;
            logCritical('🔄 [SWITCH] Восстановлен user из токена:', user.email);
          } catch (_) { }
        }
        // 🔐 v=37 FIX: После миграции на Yandex API ВСЕГДА RPC режим!
        _rpcOnlyMode = true;
        // Debug: console.log('🔐 [SWITCH] RPC mode ENABLED for curator (Yandex API)');
        _pinAuthClientId = null; // Очищаем PIN auth
        log('🔐 [SWITCH] CURATOR path: _pinAuthClientId = null');
        try { global.localStorage.removeItem('heys_pin_auth_client'); } catch (_) { }
        // 🚀 PERF v7.0: Use syncClient for dedup — prevents double sync
        // when DayTabWithCloudSync also calls syncClient on client change
        _switchUsedCuratorPath = true;
        await cloud.syncClient(newClientId, { force: true, deferNonCriticalTail: true });
      } else {
        logCritical('🔐 [SWITCH] Нет Supabase сессии — используем RPC sync');
        _rpcOnlyMode = true; // Клиент по PIN — RPC режим для сохранений
        _pinAuthClientId = newClientId; // 🔐 Сохраняем client_id для проверки в saveClientKey
        log(`🔐 [SWITCH] PIN path: _pinAuthClientId = "${newClientId}"`);
        // 🔐 Сохраняем флаг PIN auth в localStorage для восстановления после перезагрузки
        try { global.localStorage.setItem('heys_pin_auth_client', newClientId); } catch (_) { }
        // 🚀 v58 FIX: Use syncClient for dedup — same pattern as curator path (L6948)
        // Previously called syncClientViaRPC directly, bypassing _syncInFlight dedup.
        // This caused double sync when cloud.init PIN restore also calls syncClient.
        const rpcResult = await cloud.syncClient(newClientId, { force: true, deferNonCriticalTail: true });
        if (!rpcResult?.success) {
          throw new Error(rpcResult?.error || 'RPC sync failed');
        }
      }
      // ✅ Sync завершён — теперь безопасно чистить старые данные

      if (oldClientId && oldClientId !== newClientId) {
        const keysToRemove = [];
        for (let i = 0; i < global.localStorage.length; i++) {
          const key = global.localStorage.key(i);
          if (key && key.includes(oldClientId)) {
            // Не удаляем глобальные ключи
            if (!key.includes('heys_client_current') && !key.includes('heys_user')) {
              keysToRemove.push(key);
            }
          }
        }
        keysToRemove.forEach(k => global.localStorage.removeItem(k));
        log(`🧹 Очищено ${keysToRemove.length} ключей старого клиента`);
      }

      // Также удаляем дубликаты и данные других клиентов
      maybeCleanupDuplicateKeys(true);

      // 🔧 v71 FIX: purge any residual foreign client-scoped keys.
      // Previous cleanup removed oldClientId + products, but third-party
      // scoped keys (or stale leftovers) could remain and trigger post-switch
      // anomaly telemetry.
      const foreignScopedKeys = [];
      let foreignDayKeysPurged = 0;
      let foreignOtherKeysPurged = 0;
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (!key || !key.startsWith('heys_')) continue;
        if (key === 'heys_client_current' || isSensitiveSessionStorageKey(key)) continue;
        const leadId = getLeadingClientScopeId(key);
        if (leadId && leadId !== newClientId) {
          foreignScopedKeys.push(key);
          if (key.includes('dayv2_')) foreignDayKeysPurged++;
          else foreignOtherKeysPurged++;
        }
      }
      if (foreignScopedKeys.length > 0) {
        const foreignSample = foreignScopedKeys.slice(0, 5).join(', ');
        foreignScopedKeys.forEach(k => global.localStorage.removeItem(k));
        logCritical(
          `🧹 [SWITCH] Purged residual foreign keys: total=${foreignScopedKeys.length} ` +
          `(day=${foreignDayKeysPurged}, other=${foreignOtherKeysPurged})` +
          (foreignSample ? ` | sample=${foreignSample}` : '')
        );
      }

      // 🔧 v69 FIX: Purge pending upsert queue от записей чужих клиентов.
      // Если flush timeout не успел вытолкнуть данные старого клиента,
      // они остаются в очереди и уйдут под контекстом нового клиента.
      if (clientUpsertQueue && clientUpsertQueue.length > 0) {
        const beforeLen = clientUpsertQueue.length;
        for (let qi = clientUpsertQueue.length - 1; qi >= 0; qi--) {
          const item = clientUpsertQueue[qi];
          if (item && item.client_id && item.client_id !== newClientId) {
            clientUpsertQueue.splice(qi, 1);
          }
        }
        const purged = beforeLen - clientUpsertQueue.length;
        if (purged > 0) {
          logCritical(`🧹 [SWITCH] Purged ${purged} stale items from pending queue (old client)`);
        }
      }

      // Удаляем продукты ВСЕХ других клиентов (не только старого)
      const otherProductKeys = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (key && key.includes('_products') && !key.includes(newClientId)) {
          otherProductKeys.push(key);
        }
      }
      otherProductKeys.forEach(k => global.localStorage.removeItem(k));
      if (otherProductKeys.length > 0) {
        log(`🧹 Удалено ${otherProductKeys.length} ключей продуктов других клиентов`);
      }

      log('✅ Переключение завершено успешно');

      // 🔧 v67 FIX: Финальный flush memory cache после всех cleanup,
      // чтобы React-компоненты перечитали данные из чистого localStorage.
      if (global.HEYS?.store?.flushMemory) {
        global.HEYS.store.flushMemory();
      }

      // 📊 Диагностика: что осталось в localStorage после switch + cleanup
      {
        let _dNewCount = 0, _dOldCount = 0, _dOtherCount = 0;
        const _newPfx = 'heys_' + newClientId + '_dayv2_';
        const _oldPfx = oldClientId ? 'heys_' + oldClientId + '_dayv2_' : null;
        for (let i = 0; i < global.localStorage.length; i++) {
          const _k = global.localStorage.key(i);
          if (!_k || !_k.includes('dayv2_')) continue;
          if (_k.startsWith(_newPfx)) _dNewCount++;
          else if (_oldPfx && _k.startsWith(_oldPfx)) _dOldCount++;
          else if (_k.includes('dayv2_')) _dOtherCount++;
        }
        const _profKey = 'heys_' + newClientId + '_profile';
        const _profRaw = global.localStorage.getItem(_profKey);
        let _profInfo = 'отсутствует';
        if (_profRaw) {
          try {
            const _p = tryParse(_profRaw);
            _profInfo = _p ? (_p.name || '?') + ' ' + (_p.gender || '?') + ' ' + (_p.weight || '?') + 'кг ' + (_p.height || '?') + 'см' : 'parse error';
          } catch (_) { _profInfo = 'error'; }
        }
        logCritical(`📊 [SWITCH ИТОГ] dayv2: new=${_dNewCount} old=${_dOldCount} other=${_dOtherCount} | profile: ${_profInfo} | currentClientId=${(global.HEYS?.currentClientId || '').substring(0, 8)}`);

        // 🔧 v67 FIX: Profile contamination diagnostics.
        // NOTE: automatic deletion turned out to be too risky: two clients can
        // temporarily have the same profile payload (historical contamination or
        // genuinely similar data), and local code cannot reliably determine which
        // profile is canonical. Keep the profile intact and only log suspicion.
        if (_oldProfileBasics && _profRaw) {
          try {
            let _np = tryParse(_profRaw);
            if (typeof _np === 'string') { try { _np = JSON.parse(_np); } catch (_) { _np = null; } }
            const _nw = Number(_np?.weight), _nh = Number(_np?.height), _ng = String(_np?.gender || '');
            logCritical('🔍 [CONTAM CHECK] old={' + _oldProfileBasics.w + ',' + _oldProfileBasics.h + ',' + _oldProfileBasics.g + '} new={' + _nw + ',' + _nh + ',' + _ng + '} match=' + (_nw === _oldProfileBasics.w && _nh === _oldProfileBasics.h && _ng === _oldProfileBasics.g));
            if (_np &&
              _nw === _oldProfileBasics.w &&
              _nh === _oldProfileBasics.h &&
              _ng === _oldProfileBasics.g) {
              logCritical('⚠️ [CONTAMINATION] Профиль нового клиента совпадает со старым (' + _oldProfileBasics.g + ' ' + _oldProfileBasics.w + 'кг ' + _oldProfileBasics.h + 'см). Авто-удаление отключено: сохраняем профиль и только логируем подозрительное совпадение, чтобы избежать ложных срабатываний.');
              _profInfo += ' → ПОДОЗРИТЕЛЬНОЕ СОВПАДЕНИЕ (без авто-удаления)';
            }
          } catch (_e) { logCritical('🔍 [CONTAM CHECK] error: ' + _e); }
        } else {
          logCritical('🔍 [CONTAM CHECK] skipped: oldBasics=' + !!_oldProfileBasics + ' profRaw=' + !!_profRaw);
        }
      }

      // �️ P4: Post-switch anomaly detection — surface residual cross-client data
      detectPostSwitchAnomalies(newClientId, oldClientId);

      // �🚀 FIX: Регистрируем cooldown чтобы sync effects useEffect не запускал дублирующий sync
      // v58+: switchClient использует cloud.syncClient() — _syncLastCompleted выставляется автоматически.
      // Cooldown ниже — дополнительная страховка от race с React useEffect после client switch.
      _syncLastCompleted[newClientId] = Date.now();

      // Показываем итоговый размер storage
      const sizeMB = getStorageSize();
      log(`📊 Размер localStorage: ${sizeMB.toFixed(2)} MB`);

      // Событие heysSyncCompleted уже отправлено внутри bootstrapClientSync/syncClientViaRPC

      // 🔔 Уведомляем компоненты о смене клиента (для RationTab и др.)
      window.dispatchEvent(new Event('heys:auth-changed'));

      emitSwitchStage('done');

      return true;
    } catch (e) {
      logCritical('❌ Ошибка загрузки данных нового клиента:', e);
      emitSwitchStage('error', { error: e?.message || String(e) });
      // 🔁 v59 FIX J: Do NOT rollback client_current on sync failure.
      // PIN auth already succeeded — client is valid. Rolling back creates
      // inconsistency: client_current → old, but _pinAuthClientId → new.
      // Keep new clientId active — bootstrapClientSync will load data on retry.
      // Old behavior rolled back to oldClientId, breaking subsequent sync attempts.
      logCritical('⚠️ [SWITCH] Sync failed but auth valid — keeping client_current =', newClientId?.slice(0, 8));
      return false;
    } finally {
      // 🔧 v63 FIX #1: Снимаем флаг после завершения (успех или ошибка)
      cloud._switchClientInProgress = false;
      try {
        cloud._flushDeferredWritesAfterSwitch(newClientId, oldClientId);
      } catch (_) { }
      // Dedupe pending client rows (same client_id + k) after burst merges / deferred replay
      try {
        if (Array.isArray(clientUpsertQueue) && clientUpsertQueue.length > 1) {
          const beforeDedup = clientUpsertQueue.length;
          compactPendingQueue(clientUpsertQueue, PENDING_CLIENT_QUEUE_KEY, { mutate: true });
          persistClientQueueDurabilityState();
          if (clientUpsertQueue.length < beforeDedup) {
            logCritical(`🧹 [SWITCH] Deduped client upload queue: ${beforeDedup} → ${clientUpsertQueue.length} rows`);
          }
        }
      } catch (_) { /* noop */ }
      // Pause foreground hot-sync briefly so curator switch + upload tail does not stack with HOT pulls
      try {
        cloud._hotSyncQuietUntilMs = Date.now() + (_switchUsedCuratorPath ? 18000 : 2200);
      } catch (_) { /* noop */ }
    }
  };

  // Убрано избыточное логирование utils lsSet wrapped

  // ═══════════════════════════════════════════════════════════════════
  // 📷 PHOTO STORAGE — делегировано в heys_storage_photos_v1.js
  // ═══════════════════════════════════════════════════════════════════
  if (HEYS.StoragePhotos && typeof HEYS.StoragePhotos.attachToCloud === 'function') {
    HEYS.StoragePhotos.attachToCloud(cloud);
  } else if (HEYS.StoragePhotos) {
    cloud.uploadPhoto = HEYS.StoragePhotos.uploadPhoto || cloud.uploadPhoto;
    cloud.uploadPendingPhotos = HEYS.StoragePhotos.uploadPendingPhotos || cloud.uploadPendingPhotos;
    cloud.deletePhoto = HEYS.StoragePhotos.deletePhoto || cloud.deletePhoto;
    cloud.getPendingPhotos = HEYS.StoragePhotos.getPendingPhotos || cloud.getPendingPhotos;
  } else {
    cloud.uploadPhoto = cloud.uploadPhoto || (async function () { return null; });
    cloud.uploadPendingPhotos = cloud.uploadPendingPhotos || (async function () { });
    cloud.deletePhoto = cloud.deletePhoto || (async function () { return false; });
  }

  // 🔐 Beforeunload: предупреждение если есть несохранённые данные
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('beforeunload', (e) => {
      if (global.HEYS?._isLoggingOut) {
        return;
      }

      const snapshot = getPendingQueuesSnapshot();
      if (snapshot.totalCount === 0 && !snapshot.uploadInProgress) {
        return;
      }

      const pendingItems = [];
      if (Array.isArray(clientUpsertQueue)) pendingItems.push(...clientUpsertQueue);
      if (Array.isArray(clientUpsertInFlightQueue)) pendingItems.push(...clientUpsertInFlightQueue);
      if (!snapshot.isClientOnlyMode) {
        if (Array.isArray(upsertQueue)) pendingItems.push(...upsertQueue);
        if (Array.isArray(upsertInFlightQueue)) pendingItems.push(...upsertInFlightQueue);
      }

      if ((clientUpsertQueue && clientUpsertQueue.length > 0) || (clientUpsertInFlightQueue && clientUpsertInFlightQueue.length > 0)) {
        logCritical(`⚠️ [BEFOREUNLOAD] ${clientUpsertQueue.length + clientUpsertInFlightQueue.length} unsaved client item(s)!`);
        persistClientQueueDurabilityState();
      }

      if (!snapshot.isClientOnlyMode && ((upsertQueue && upsertQueue.length > 0) || (upsertInFlightQueue && upsertInFlightQueue.length > 0))) {
        logCritical(`⚠️ [BEFOREUNLOAD] ${upsertQueue.length + upsertInFlightQueue.length} unsaved user item(s)!`);
        persistUserQueueDurabilityState();
      }

      const hasCriticalData = pendingItems.some(item =>
        item.k?.includes('products') || item.k?.includes('dayv2_')
      );
      if (hasCriticalData) {
        e.preventDefault();
        e.returnValue = 'У вас есть несохранённые данные. Покинуть страницу?';
        return e.returnValue;
      }
    });
  }

  // === Shared Products API (v3.18.0) ===

  // 🔧 v3.19.0: Кэш shared products для доступа из утилит (orphan check и др.)
  let _sharedProductsCache = [];
  let _sharedProductsCacheTime = 0;
  const SHARED_PRODUCTS_CACHE_TTL = 5 * 60 * 1000; // 5 минут
  const SHARED_PRODUCTS_LS_KEY = 'heys_shared_products_cache_v1';
  const SHARED_PRODUCTS_LS_TTL = 30 * 60 * 1000; // 30 минут для localStorage

  /**
   * Получить shared products из кэша (синхронно)
   * @returns {Array} Массив продуктов или пустой массив
   */
  // 🛟 Phase α: shared products id-index для overlay merged view.
  // Инвалидируется автоматически при перезаписи _sharedProductsCache.
  let _sharedIndexCache = null;
  let _sharedIndexCacheLen = -1;

  function _invalidateSharedIndex() {
    _sharedIndexCache = null;
    _sharedIndexCacheLen = -1;
    // Notify listeners (OverlayStore subscribes).
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:shared-products-updated'));
      }
    } catch (_) { /* noop */ }
  }

  cloud.getSharedIndex = function () {
    const arr = cloud.getCachedSharedProducts();
    // Cheap dirty-check: rebuild if cache was reassigned (length changed) or first call.
    if (_sharedIndexCache && _sharedIndexCacheLen === arr.length) return _sharedIndexCache;
    const map = new Map();
    for (const p of arr) {
      if (p && p.id != null) map.set(String(p.id), p);
    }
    _sharedIndexCache = map;
    _sharedIndexCacheLen = arr.length;
    return map;
  };

  cloud.getCachedSharedProducts = function () {
    // 🚀 Если memory cache пустой — попробовать восстановить из localStorage
    if ((!_sharedProductsCache || _sharedProductsCache.length === 0)) {
      try {
        const cached = global.localStorage.getItem(SHARED_PRODUCTS_LS_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.ts && (Date.now() - parsed.ts) < SHARED_PRODUCTS_LS_TTL && Array.isArray(parsed.data)) {
            _sharedProductsCache = parsed.data;
            _sharedProductsCacheTime = parsed.ts;
            _invalidateSharedIndex();
            logCritical(`📦 [SHARED PRODUCTS] Restored ${parsed.data.length} products from localStorage cache`);
          }
        }
      } catch (_) { }
    }
    return _sharedProductsCache || [];
  };

  /**
   * Получить все продукты из общей базы (для таблицы)
   * @param {Object} options - { limit, excludeBlocklist }
   * @returns {Promise<{data: Array, error: any}>}
   */
  cloud.getAllSharedProducts = async function (options = {}) {
    const { limit = 500, excludeBlocklist = true } = options;

    try {
      const normalizeSharedProduct = (p) => {
        if (!p || typeof p !== 'object') return p;
        if (HEYS.models?.normalizeExtendedProduct) {
          return HEYS.models.normalizeExtendedProduct(p);
        }
        return p;
      };

      let data = null;
      let error = null;

      if (YandexAPI?.rpc) {
        const rpcResult = await YandexAPI.rpc('get_shared_products', {
          p_search: null,
          p_limit: limit,
          p_offset: 0
        });
        data = rpcResult?.data;
        error = rpcResult?.error;
      }

      if (error || !Array.isArray(data)) {
        // 🔄 v3.21.0: Используем shared_products (таблица) вместо shared_products_public (VIEW)
        // VIEW был удалён из API — использовал auth.uid() который не работает в Yandex Cloud
        const restResult = await YandexAPI.from('shared_products')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        data = restResult?.data;
        error = restResult?.error;
      }

      if (error) {
        err('[SHARED PRODUCTS] Get all error:', error);
        return { data: null, error };
      }

      // Фильтрация blocklist на клиенте (если нужно)
      let filtered = (data || []).map(normalizeSharedProduct);
      if (excludeBlocklist && user) {
        const blocklist = await cloud.getBlocklist();
        const blocklistSet = new Set(blocklist.map(id => id));
        filtered = filtered.filter(p => !blocklistSet.has(p.id));
      }

      const backfillSharedHarm = async (items) => {
        if (!Array.isArray(items) || !items.length) return items;
        if (!HEYS?.Harm?.calculateHarmScore) return items;

        const lsGet = global.U?.lsGet || cloud.lsGet;
        const lsSet = global.U?.lsSet || cloud.lsSet;
        const cacheKey = 'heys_shared_harm_backfill_v1';

        try {
          const alreadyDone = lsGet ? lsGet(cacheKey, false) : false;
          if (alreadyDone) return items;

          const updates = [];
          const updatedItems = items.map((p) => {
            if (!p || typeof p !== 'object') return p;
            const harmVal = Number.isFinite(p.harm) ? p.harm : null;
            const harmScoreVal = Number.isFinite(p.harmScore) ? p.harmScore : null;
            if (harmVal != null || harmScoreVal != null) return p;

            const computed = HEYS.Harm.calculateHarmScore(p);
            if (!Number.isFinite(computed)) return p;

            if (p.id) {
              updates.push({ id: p.id, harm: computed });
            }

            return { ...p, harm: computed, harmScore: computed };
          });

          if (updates.length > 0 && YandexAPI?.from) {
            const { error: upsertError } = await YandexAPI.from('shared_products')
              .upsert(updates, { onConflict: 'id' });
            if (upsertError) {
              err('[SHARED PRODUCTS] Harm backfill upsert error:', upsertError);
            } else if (lsSet) {
              lsSet(cacheKey, true);
            }
          } else if (lsSet) {
            lsSet(cacheKey, true);
          }

          return updatedItems;
        } catch (e) {
          err('[SHARED PRODUCTS] Harm backfill error:', e);
          return items;
        }
      };

      filtered = await backfillSharedHarm(filtered);

      // 🔧 v3.19.0: Сохраняем в кэш для orphan check и других утилит
      _sharedProductsCache = filtered;
      _sharedProductsCacheTime = Date.now();
      _invalidateSharedIndex();
      log(`[SHARED PRODUCTS] Loaded ${filtered.length} products total, cached`);

      try {
        if (typeof global !== 'undefined' && global.HEYS?.orphanProducts?.recalculate) {
          global.HEYS.orphanProducts.recalculate();
        }
      } catch (_) { /* ignore */ }

      // 🚀 Сохраняем в localStorage для быстрого восстановления при следующей загрузке
      try {
        if (getStorageSize() < 3.8) {
          const cachedPayload = JSON.stringify({
            ts: Date.now(),
            data: filtered
          });
          const cached = safeSetItem(SHARED_PRODUCTS_LS_KEY, cachedPayload, {
            allowRecoverableCacheDrop: true
          });
          if (!cached) {
            log('[SHARED PRODUCTS] localStorage cache skipped — quota guard rejected recoverable write');
          }
        } else {
          global.localStorage.removeItem(SHARED_PRODUCTS_LS_KEY);
          log('[SHARED PRODUCTS] localStorage cache skipped — storage near limit');
        }
      } catch (_) { /* localStorage может быть переполнен */ }

      return { data: filtered, error: null };
    } catch (e) {
      err('[SHARED PRODUCTS] Unexpected error:', e);
      return { data: null, error: e.message };
    }
  };

  /**
   * Поиск продуктов в общей базе (через таблицу shared_products)
   * @param {string} query - Поисковый запрос
   * @param {Object} options - { limit, excludeBlocklist }
   * @returns {Promise<{data: Array, error: any}>}
   */
  cloud.searchSharedProducts = async function (query, options = {}) {
    const { limit = 50, excludeBlocklist = true, fingerprint = null } = options;
    const normQuery = (HEYS?.models?.normalizeProductName
      ? HEYS.models.normalizeProductName(query)
      : (query || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));

    try {
      // Внутренний helper: выполнить запрос по name_norm через ilike
      const fetchByName = async (nameQ) => {
        const q = (nameQ || '').toString().trim();
        if (!q) return [];
        const { data, error } = await YandexAPI.rest('shared_products', {
          select: '*',
          filters: { 'ilike.name_norm': `%${q}%` },
          order: 'created_at.desc',
          limit
        });
        if (error) throw error;
        return data || [];
      };

      // Строим фильтры для YandexAPI.rest()
      const filters = {};

      // Поиск по fingerprint (точное совпадение) ИЛИ по названию
      if (fingerprint) {
        filters['eq.fingerprint'] = fingerprint;
      } else if (normQuery) {
        filters['ilike.name_norm'] = `%${normQuery}%`;
      }

      // 🔄 v3.21.0: Используем shared_products вместо shared_products_public (VIEW удалён)
      let data;
      let error;
      ({ data, error } = await YandexAPI.rest('shared_products', {
        select: '*',
        filters,
        order: 'created_at.desc',
        limit
      }));

      if (error) {
        err('[SHARED PRODUCTS] Search error:', error);
        return { data: null, error };
      }

      // 🆕 Fallback для базовых опечаток (пример: "сава" → "савоярди")
      // Если точный ILIKE по подстроке дал мало результатов, пробуем более широкий префикс.
      // Это дешёвый server-side хак, чтобы покрывать 1-символьные расхождения в конце.
      if (!fingerprint && normQuery && Array.isArray(data)) {
        const baseCount = data.length;
        // Триггерим fallback только когда результатов действительно мало
        if (baseCount < 3 && normQuery.length >= 4) {
          const prefix3 = normQuery.slice(0, 3);
          if (prefix3 && prefix3.length === 3 && prefix3 !== normQuery) {
            try {
              const fallbackData = await fetchByName(prefix3);
              if (fallbackData && fallbackData.length) {
                const byId = new Map();
                (data || []).forEach(p => {
                  const key = p?.id || p?.fingerprint || p?.name;
                  if (key) byId.set(key, p);
                });
                fallbackData.forEach(p => {
                  const key = p?.id || p?.fingerprint || p?.name;
                  if (key && !byId.has(key)) byId.set(key, p);
                });
                data = Array.from(byId.values()).slice(0, limit);
              }
            } catch (e) {
              // Fallback errors should not break primary search
            }
          }
        }
      }

      // Фильтрация blocklist на клиенте (если нужно)
      let filtered = data || [];
      if (excludeBlocklist && user) {
        const blocklist = await cloud.getBlocklist();
        const blocklistSet = new Set(blocklist.map(id => id));
        filtered = filtered.filter(p => !blocklistSet.has(p.id));
      }

      log(`[SHARED PRODUCTS] Found ${filtered.length} products for "${query}"`);
      return { data: filtered, error: null };
    } catch (e) {
      err('[SHARED PRODUCTS] Unexpected error:', e);
      return { data: null, error: e.message };
    }
  };

  /**
   * Публикация продукта в общую базу
   * @param {Object} product - Объект продукта
   * @returns {Promise<{data: any, error: any, status: string}>}
   */
  cloud.publishToShared = async function (product) {
    if (!user) {
      try {
        const token = localStorage.getItem('heys_curator_session');
        if (token && HEYS?.YandexAPI?.verifyCuratorToken) {
          const verifyResult = await HEYS.YandexAPI.verifyCuratorToken(token);
          if (verifyResult?.data?.valid && verifyResult.data.user) {
            user = verifyResult.data.user;
          }
        }
      } catch (e) {
        err('[SHARED PRODUCTS] JWT verify failed:', e);
      }
    }

    if (!user) {
      return { data: null, error: 'Not authenticated', status: 'error' };
    }

    try {
      // Вычисляем fingerprint
      const fingerprint = await HEYS.models.computeProductFingerprint(product);
      const name_norm = HEYS.models.normalizeProductName(product.name);

      // 🔐 P3: Для куратора используем user.id напрямую (JWT auth)
      // Куратор НЕ имеет session_token — он авторизован через JWT
      const curatorId = user?.id;

      if (!curatorId) {
        console.error('[SHARED] ❌ No curator ID (user.id)');
        return { data: null, error: 'Not authenticated as curator', status: 'error' };
      }

      // 🔐 P3: Используем RPC вместо REST (REST теперь read-only)
      const productData = {
        name: product.name,
        fingerprint,
        simple100: product.simple100 || 0,
        complex100: product.complex100 || 0,
        protein100: product.protein100 || 0,
        badFat100: product.badFat100 ?? product.badfat100 ?? 0,
        goodFat100: product.goodFat100 ?? product.goodfat100 ?? 0,
        trans100: product.trans100 || 0,
        fiber100: product.fiber100 || 0,
        gi: product.gi ?? null,
        harm: product.harm ?? product.harmScore ?? null,
        category: product.category ?? null,
        portions: product.portions || null,
        description: product.description || null,
        // Extended fields (v4.4.0)
        sodium100: product.sodium100 ?? null,
        omega3_100: product.omega3_100 ?? null,
        omega6_100: product.omega6_100 ?? null,
        nova_group: product.nova_group ?? product.novaGroup ?? null,
        additives: product.additives ?? null,
        nutrient_density: product.nutrient_density ?? product.nutrientDensity ?? null,
        is_organic: product.is_organic ?? product.isOrganic ?? false,
        is_whole_grain: product.is_whole_grain ?? product.isWholeGrain ?? false,
        is_fermented: product.is_fermented ?? product.isFermented ?? false,
        is_raw: product.is_raw ?? product.isRaw ?? false,
        // Vitamins
        vitamin_a: product.vitamin_a ?? product.vitaminA ?? null,
        vitamin_c: product.vitamin_c ?? product.vitaminC ?? null,
        vitamin_d: product.vitamin_d ?? product.vitaminD ?? null,
        vitamin_e: product.vitamin_e ?? product.vitaminE ?? null,
        vitamin_k: product.vitamin_k ?? product.vitaminK ?? null,
        vitamin_b1: product.vitamin_b1 ?? product.vitaminB1 ?? null,
        vitamin_b2: product.vitamin_b2 ?? product.vitaminB2 ?? null,
        vitamin_b3: product.vitamin_b3 ?? product.vitaminB3 ?? null,
        vitamin_b6: product.vitamin_b6 ?? product.vitaminB6 ?? null,
        vitamin_b9: product.vitamin_b9 ?? product.vitaminB9 ?? null,
        vitamin_b12: product.vitamin_b12 ?? product.vitaminB12 ?? null,
        // Minerals
        calcium: product.calcium ?? null,
        iron: product.iron ?? null,
        magnesium: product.magnesium ?? null,
        phosphorus: product.phosphorus ?? null,
        potassium: product.potassium ?? null,
        zinc: product.zinc ?? null,
        selenium: product.selenium ?? null,
        iodine: product.iodine ?? null
      };
      console.info('[baza] 📤 publishToShared (supabase) vitamins:', {
        vitamin_b6: productData.vitamin_b6, vitamin_b12: productData.vitamin_b12,
        potassium: productData.potassium, calcium: productData.calcium,
        sodium100: productData.sodium100
      });

      const { data, error } = await YandexAPI.rpc('publish_shared_product_by_curator', {
        p_curator_id: curatorId,
        p_product_data: productData
      });

      if (error) {
        err('[SHARED PRODUCTS] Publish error:', error);
        return { data: null, error, status: 'error' };
      }

      // Обрабатываем результат RPC
      if (data?.success === false) {
        return { data: null, error: data.error, status: 'error', message: data.message };
      }

      const status = data?.status || 'published';
      log('[SHARED PRODUCTS] Result:', status, product.name);

      // 🔧 v3.22.0: Инвалидируем кэш shared products после успешной публикации
      if (status === 'published') {
        _sharedProductsCacheTime = 0;

        // Добавляем продукт в локальный кэш немедленно (чтобы не ждать re-fetch)
        const newSharedProduct = {
          ...product,
          ...productData,
          id: data?.id,
          created_at: new Date().toISOString()
        };
        _sharedProductsCache = [newSharedProduct, ..._sharedProductsCache];
        _invalidateSharedIndex();
      }

      return {
        data: { id: data?.id },
        error: null,
        status,
        message: data?.message
      };
    } catch (e) {
      err('[SHARED PRODUCTS] Unexpected error:', e);
      return { data: null, error: e.message, status: 'error' };
    }
  };

  /**
   * Удаление продукта из общей базы (только куратор или автор)
   * @param {string} productId - UUID продукта в shared_products
   * @returns {Promise<{success: boolean, error: any}>}
   */
  cloud.deleteSharedProduct = async function (productId) {
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      // Удаляем продукт (RLS проверит права: только автор или куратор)
      const { error } = await YandexAPI.from('shared_products')
        .delete()
        .eq('id', productId);

      if (error) {
        console.error('[SHARED] ❌ Delete error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, error: null };
    } catch (e) {
      console.error('[SHARED] ❌ Unexpected error:', e);
      return { success: false, error: e.message };
    }
  };

  /**
   * Создание pending-заявки для PIN-клиента (🔐 P1: session-версия)
   * @param {string} clientId - ID клиента (ignored, используется session_token)
   * @param {Object} product - Объект продукта
   * @returns {Promise<{data: any, error: any, status: string}>}
   */
  cloud.createPendingProduct = async function (clientId, product) {
    try {
      // 🔐 P1: Используем session_token вместо client_id
      // 🔧 FIX: Используем HEYS.Auth.getSessionToken() или HEYS.utils.lsGet (который делает JSON.parse)
      const sessionToken = (typeof HEYS !== 'undefined' && HEYS.Auth?.getSessionToken?.())
        || HEYS.utils?.lsGet?.('heys_session_token', null)
        || (() => { try { return JSON.parse(localStorage.getItem('heys_session_token')); } catch { return null; } })();
      if (!sessionToken) {
        return { data: null, error: 'No session token', status: 'error', message: 'Нет активной сессии PIN-клиента' };
      }

      // 🔍 Вычисляем fingerprint и name_norm на клиенте (нужны серверу для дедупа)
      let fingerprint = null;
      let nameNorm = null;
      try {
        if (HEYS?.models?.computeProductFingerprint) {
          fingerprint = await HEYS.models.computeProductFingerprint(product);
        }
      } catch (_) { /* fallback to null — сервер сам резолвит */ }
      try {
        if (HEYS?.models?.normalizeProductName) {
          nameNorm = HEYS.models.normalizeProductName(product?.name || '');
        }
      } catch (_) { /* fallback to null */ }

      const { data, error } = await YandexAPI.rpc('create_pending_product_by_session', {
        p_session_token: sessionToken,
        p_name: product.name,
        p_product_data: product,
        p_fingerprint: fingerprint,
        p_name_norm: nameNorm
      });

      if (error) {
        err('[SHARED PRODUCTS] Pending create error:', error);
        return { data: null, error, status: 'error', message: (error && error.message) || String(error) };
      }

      log('[SHARED PRODUCTS] Pending created:', data);
      return {
        data,
        error: null,
        status: data?.status || 'pending',
        message: data?.message || ''
      };
    } catch (e) {
      err('[SHARED PRODUCTS] Unexpected error:', e);
      return { data: null, error: e.message, status: 'error', message: e.message };
    }
  };

  /**
   * Получить pending-заявки куратора
   * @returns {Promise<{data: Array, error: any}>}
   */
  cloud.getPendingProducts = async function () {
    if (!user) {
      return { data: null, error: 'Not authenticated' };
    }

    try {
      const { data, error } = await YandexAPI.rest('shared_products_pending', {
        select: '*',
        filters: {
          'eq.curator_id': user.id,
          'eq.status': 'pending'
        },
        order: 'created_at.desc'
      });

      if (error) {
        err('[SHARED PRODUCTS] Get pending error:', error);
        return { data: null, error };
      }

      log(`[SHARED PRODUCTS] Found ${data?.length || 0} pending products`);
      return { data, error: null };
    } catch (e) {
      err('[SHARED PRODUCTS] Unexpected error:', e);
      return { data: null, error: e.message };
    }
  };

  /**
   * Подтвердить pending-заявку
   * @param {string} pendingId - ID заявки
   * @param {Object} productData - Данные продукта из заявки
   * @returns {Promise<{data: any, error: any, status: string}>}
   */
  cloud.approvePendingProduct = async function (pendingId, productData) {
    if (!user) {
      return { data: null, error: 'Not authenticated', status: 'error' };
    }

    try {
      // 1. Публикуем продукт в shared
      const publishResult = await cloud.publishToShared(productData);

      if (publishResult.error && publishResult.status !== 'exists') {
        return publishResult;
      }

      // 2. Обновляем статус заявки
      // 🛡 Race-prevention: фильтр status='pending' гарантирует что approve не сработает
      // повторно если другой куратор уже обработал эту заявку.
      const { data: updateData, error: updateError } = await YandexAPI.rest('shared_products_pending', {
        method: 'PATCH',
        filters: { 'eq.id': pendingId, 'eq.status': 'pending' },
        data: {
          status: 'approved',
          moderated_at: new Date().toISOString(),
          moderated_by: user.id
        },
        select: '*'
      });

      if (updateError) {
        err('[SHARED PRODUCTS] Approve update error:', updateError);
        return { data: null, error: updateError, status: 'error' };
      }

      // 0 строк обновлено → заявка уже была approved/rejected другим куратором
      const updatedRows = Array.isArray(updateData) ? updateData.length : (updateData ? 1 : 0);
      if (updatedRows === 0) {
        log('[SHARED PRODUCTS] Approve race: pending already moderated:', pendingId);
        return {
          data: null,
          error: { message: 'already_moderated' },
          status: 'race',
          message: 'Заявка уже обработана другим куратором'
        };
      }

      log('[SHARED PRODUCTS] Approved pending:', pendingId);
      return {
        data: publishResult.data,
        error: null,
        status: 'approved',
        existing: publishResult.status === 'exists'
      };
    } catch (e) {
      err('[SHARED PRODUCTS] Unexpected error:', e);
      return { data: null, error: e.message, status: 'error' };
    }
  };

  /**
   * Отклонить pending-заявку
   * @param {string} pendingId - ID заявки
   * @param {string} reason - Причина отклонения
   * @returns {Promise<{data: any, error: any}>}
   */
  cloud.rejectPendingProduct = async function (pendingId, reason = '') {
    if (!user) {
      return { data: null, error: 'Not authenticated' };
    }

    try {
      // 🛡 Race-prevention: фильтр status='pending' гарантирует что reject не сработает
      // повторно если другой куратор уже обработал эту заявку.
      const { data, error } = await YandexAPI.rest('shared_products_pending', {
        method: 'PATCH',
        filters: { 'eq.id': pendingId, 'eq.status': 'pending' },
        data: {
          status: 'rejected',
          reject_reason: reason,
          moderated_at: new Date().toISOString(),
          moderated_by: user.id
        },
        select: '*',
        limit: 1
      });

      if (error) {
        err('[SHARED PRODUCTS] Reject error:', error);
        return { data: null, error };
      }

      // 0 строк обновлено → уже была обработана
      const updatedRows = Array.isArray(data) ? data.length : (data ? 1 : 0);
      if (updatedRows === 0) {
        log('[SHARED PRODUCTS] Reject race: pending already moderated:', pendingId);
        return {
          data: null,
          error: { message: 'already_moderated' },
          status: 'race',
          message: 'Заявка уже обработана другим куратором'
        };
      }

      log('[SHARED PRODUCTS] Rejected pending:', pendingId);
      return { data, error: null };
    } catch (e) {
      err('[SHARED PRODUCTS] Unexpected error:', e);
      return { data: null, error: e.message };
    }
  };

  /**
   * Получить blocklist текущего куратора
   * @returns {Promise<Array<string>>} - Массив ID заблокированных продуктов
   */
  cloud.getBlocklist = async function () {
    if (!user) return [];

    try {
      const { data, error } = await YandexAPI.rest('shared_products_blocklist', {
        select: 'product_id',
        filters: { 'eq.curator_id': user.id }
      });

      if (error) {
        err('[SHARED PRODUCTS] Get blocklist error:', error);
        return [];
      }

      return (data || []).map(row => row.product_id);
    } catch (e) {
      err('[SHARED PRODUCTS] Unexpected error:', e);
      return [];
    }
  };

  /**
   * Добавить продукт в blocklist
   * @param {string} productId - ID продукта
   * @returns {Promise<{data: any, error: any}>}
   */
  cloud.blockProduct = async function (productId) {
    if (!user) {
      return { data: null, error: 'Not authenticated' };
    }

    try {
      const { data, error } = await YandexAPI.rest('shared_products_blocklist', {
        method: 'POST',
        data: {
          curator_id: user.id,
          product_id: productId
        },
        select: '*',
        limit: 1
      });

      if (error) {
        err('[SHARED PRODUCTS] Block error:', error);
        return { data: null, error };
      }

      log('[SHARED PRODUCTS] Blocked product:', productId);
      return { data, error: null };
    } catch (e) {
      err('[SHARED PRODUCTS] Unexpected error:', e);
      return { data: null, error: e.message };
    }
  };

  /**
   * Убрать продукт из blocklist
   * @param {string} productId - ID продукта
   * @returns {Promise<{data: any, error: any}>}
   */
  cloud.unblockProduct = async function (productId) {
    if (!user) {
      return { data: null, error: 'Not authenticated' };
    }

    try {
      const { error } = await YandexAPI.rest('shared_products_blocklist', {
        method: 'DELETE',
        filters: {
          'eq.curator_id': user.id,
          'eq.product_id': productId
        }
      });

      if (error) {
        err('[SHARED PRODUCTS] Unblock error:', error);
        return { data: null, error };
      }

      log('[SHARED PRODUCTS] Unblocked product:', productId);
      return { data: true, error: null };
    } catch (e) {
      err('[SHARED PRODUCTS] Unexpected error:', e);
      return { data: null, error: e.message };
    }
  };

})(window);
