// heys_storage_registry_v1.js
// Phase 1: foundation for localStorage management system (see plan structured-mixing-stallman.md).
//
// Single source of truth for storage policies:
//   - Pattern → scope, maxSize, maxAge, cloudSync, pruneStrategy.
//   - Built-in registry of 25+ known prefixes used across HEYS.
//   - Exposes HEYS.storageRegistry (register, match, analyze, list).
//   - Exposes HEYS.diagnostics.storageAudit({ redact }) — read-only inspection.
//   - Exposes HEYS.diagnostics.runStorageAuditNow() — no-op until Phase 2a.
//
// IMPORTANT: Phase 1 is READ-ONLY. The registry classifies and reports; it does
// NOT mutate localStorage. Phase 2a wires the boot audit in shadow mode; Phase 2b
// flips to enforce. Cloud-merge for user-state keys lands in Phase 5.
//
// Boot-order: this file MUST load AFTER heys_storage_layer_v1.js. Phase 1 only
// does a soft warn if Store missing (read-only registry doesn't need it).
// Phase 2a's runStorageAuditOnce should do the strict check via HEYS.__onStoreReady.
//
// Open items for later phases (carried from 5th-audit pass):
//   C1: Phase 3 lint must grep originalSetItem(/setFn(, not just localStorage.setItem.
//       Actual bypass site count: ~237 across project, ~42 in named files.
//   C2: Phase 5 _mergeAndPrune cloud endpoint not specified. Reuse
//       cloud.saveClientKey/getClientKey, OR demote Phase 5 to design spike.
//   H4: pruneFn needed for non-array shapes (advice_trace_day_v1, dayv2_*,
//       advice_pending_outcomes_v1). Otherwise mark policy 'manual'.
//   M2: _default → per-client migration must abort on collision (don't merge
//       across clients).
//   L1: _measureLsBytes is O(N×K). Phase 4 quota meter should use delta
//       arithmetic in Store.set, not a full loop every 50 writes.

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  // ─────────────────────────────────────────────────────────────────────
  // Boot-order check (soft).
  //
  // Phase 1 is read-only and does NOT call Store.set, so a strict throw
  // here would brick the app on edge-case bundle ordering for no benefit.
  // We log a warn — the strict assertion belongs in runStorageAuditOnce
  // (Phase 2a entry), where the audit actually needs Store. See plan
  // C3 / fix block re: HEYS.__onStoreReady pattern.
  // ─────────────────────────────────────────────────────────────────────
  const _isTestEnv = (
    (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') ||
    global.__HEYS_TEST_MODE === true
  );
  if (!_isTestEnv && (!HEYS.store || typeof HEYS.store.set !== 'function')) {
    console.warn('[HEYS.storageRegistry] Loaded before Store. Phase 1 is read-only so this is non-fatal, but bundle order should be verified.');
  }

  // Idempotent module load guard.
  if (HEYS.storageRegistry && HEYS.storageRegistry._version === 1) {
    return;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Constants.
  // ─────────────────────────────────────────────────────────────────────
  const KB = 1024;
  const MB = 1024 * KB;
  const DAY_MS = 86400 * 1000;
  const HEYS_BUDGET_BYTES = 4.5 * MB;       // mirror MAX_STORAGE_MB in storage_supabase
  const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;

  // Hard never-touch allowlist (regardless of any other policy match).
  // Auth keys: deleting them logs the user out.
  // 🪦 F11 (plan 2026-05-24): tombstone key — агрессивный cleanup при quota-exceeded
  // не должен сносить heys_deleted_ids: без него mergeProductsData не отфильтрует
  // «воскрешённые» удалённые продукты, и они вернутся из облака при первом sync.
  const NEVER_TOUCH = [
    /^heys_supabase_auth_token$/,
    /^heys_pin_auth_client$/,
    /^heys_session_token$/,
    /^sb-/,
    /^heys_deleted_ids$/,
  ];

  function isNeverTouch(key) {
    for (const re of NEVER_TOUCH) {
      if (re.test(key)) return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Registry storage.
  // ─────────────────────────────────────────────────────────────────────
  const _policies = [];          // Array of { name, pattern, ...policy }
  const _testingDisabled = { value: false };

  /**
   * Register a storage policy.
   * @param {string} name - identifier for this policy (e.g. 'insights_feedback')
   * @param {object} policy - {
   *   pattern: RegExp | string,        // exact string is matched as-is
   *   scope: 'per-client' | 'global' | 'per-date',
   *   maxSize: number,                  // bytes; 0 = forbidden, undefined = unbounded
   *   maxAge: number,                   // ms; 0 = no TTL
   *   cloudSync: 'merge' | 'mirror' | 'local-only' | 'never',
   *   pruneStrategy: 'sliding-window' | 'oldest-first' | 'wipe' | 'wipe-by-age' | 'manual',
   *   pruneFn?: (rawValue, key) => any,
   *   schemaVersion?: string,
   *   description: string,
   *   bootstrapBypass?: boolean,        // direct localStorage.setItem before Store loaded
   * }
   */
  function register(name, policy) {
    if (!name || typeof name !== 'string') {
      throw new Error('storageRegistry.register: name required');
    }
    if (!policy || (!policy.pattern && policy.pattern !== '')) {
      throw new Error('storageRegistry.register: policy.pattern required');
    }
    const pat = policy.pattern instanceof RegExp
      ? policy.pattern
      : new RegExp('^' + String(policy.pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
    const entry = Object.assign({}, policy, { name, pattern: pat });
    _policies.push(entry);
    return entry;
  }

  /**
   * Find the first matching policy for a key (in registration order).
   * Returns null if no match.
   */
  function match(key) {
    if (typeof key !== 'string') return null;
    for (const p of _policies) {
      if (p.pattern.test(key)) return p;
    }
    return null;
  }

  /**
   * List all registered policies (read-only snapshot).
   */
  function list() {
    return _policies.map(p => ({
      name: p.name,
      pattern: String(p.pattern),
      scope: p.scope,
      maxSize: p.maxSize,
      maxAge: p.maxAge,
      cloudSync: p.cloudSync,
      pruneStrategy: p.pruneStrategy,
      schemaVersion: p.schemaVersion || null,
      description: p.description || '',
    }));
  }

  /**
   * Analyze a single key/value pair against its policy.
   * Returns { key, sizeBytes, policy, violations: [...] }.
   * Phase 1 is read-only — no mutation.
   */
  function analyze(key, rawValue) {
    const policy = match(key);
    const sizeBytes = (rawValue == null) ? 0 : (key.length + String(rawValue).length) * 2;
    const violations = [];

    if (isNeverTouch(key)) {
      return { key, sizeBytes, policy, neverTouch: true, violations };
    }
    if (!policy) {
      return { key, sizeBytes, policy: null, violations };
    }
    if (typeof policy.maxSize === 'number' && policy.maxSize > 0 && sizeBytes > policy.maxSize) {
      violations.push({ kind: 'oversize', sizeBytes, maxSize: policy.maxSize });
    }
    if (typeof policy.maxSize === 'number' && policy.maxSize === 0) {
      violations.push({ kind: 'forbidden', sizeBytes });
    }
    return { key, sizeBytes, policy, violations };
  }

  /**
   * Test-environment helper: short-circuit any Phase 2+ mutating audit.
   * In Phase 1 this is a documented hook used only by future audit code.
   */
  function disableForTesting() {
    _testingDisabled.value = true;
  }
  function isDisabledForTesting() {
    return _testingDisabled.value === true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Built-in policies — compiled from audit (plan structured-mixing-stallman.md).
  //
  // Order matters: more specific patterns first, generic last.
  // ─────────────────────────────────────────────────────────────────────

  // Audit infra (registered first so any later writes are correctly classified).
  register('audit_log', {
    pattern: /^heys_storage_audit_log_v1$/,
    scope: 'global', maxSize: 16 * KB, maxAge: 30 * DAY_MS,
    cloudSync: 'never', pruneStrategy: 'sliding-window',
    description: 'Forensic log of audit decisions (capped 30 entries).',
  });
  register('audit_pending', {
    pattern: /^heys_storage_audit_pending_v1$/,
    scope: 'global', maxSize: 32 * KB, maxAge: 7 * DAY_MS,
    cloudSync: 'never', pruneStrategy: 'sliding-window',
    description: 'Phase 2a shadow-mode proposed deletions (until enforce flip).',
  });
  register('audit_recycle', {
    pattern: /^heys_storage_audit_recycle_v1$/,
    scope: 'global', maxSize: 64 * KB, maxAge: 1 * DAY_MS,
    cloudSync: 'never', pruneStrategy: 'sliding-window',
    description: 'Last-N compressed copies of deletions for emergency restore.',
  });
  register('audit_markers', {
    pattern: /^heys_storage_audit_(last|version|cleanup_active)$/,
    scope: 'global', maxSize: 256, maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'manual',
    bootstrapBypass: true,
    description: 'Audit run-state markers (boot gate, version, cleanup advisory flag).',
  });

  // Insights / feedback (the 970KB offender).
  register('insights_feedback', {
    pattern: /^heys_[a-f0-9-]{36}_insights_feedback_/,
    scope: 'per-client', maxSize: 96 * KB, maxAge: 365 * DAY_MS,
    cloudSync: 'merge', pruneStrategy: 'sliding-window',
    schemaVersion: 'v1.2',
    description: 'PI meal-rec feedback (cloud-merged ML weights). Phase 5: cloud-merge before truncate.',
  });

  // Hidden products: per-client soft-removal list.
  register('hidden_products', {
    pattern: /^heys_[a-f0-9-]{36}_hidden_products$/,
    scope: 'per-client', maxSize: 50 * KB, maxAge: 0,
    cloudSync: 'merge', pruneStrategy: 'sliding-window',
    description: 'Per-client dismissed product IDs (cloud-merged Set).',
  });

  // Advice subsystem.
  register('advice_trace_day', {
    pattern: /^heys_[a-f0-9-]{36}_advice_trace_day_v1$/,
    scope: 'per-client', maxSize: 32 * KB, maxAge: 7 * DAY_MS,
    cloudSync: 'local-only', pruneStrategy: 'oldest-first',
    description: 'Daily debug buffer for advice subsystem (local-only).',
  });
  register('advice_pending_outcomes', {
    pattern: /^heys_[a-f0-9-]{36}_advice_pending_outcomes_v1$/,
    scope: 'per-client', maxSize: 32 * KB, maxAge: 30 * DAY_MS,
    cloudSync: 'mirror', pruneStrategy: 'oldest-first',
    description: 'Pending outcomes queue (existing 240/72h cap).',
  });

  // Perf debug log.
  register('perf_log', {
    pattern: /^heys_[a-f0-9-]{36}_perf_log$/,
    scope: 'per-client', maxSize: 16 * KB, maxAge: 1 * DAY_MS,
    cloudSync: 'local-only', pruneStrategy: 'wipe',
    description: 'Opt-in perf debug log; should be sessionStorage but persists today.',
  });

  // Products legacy + overlay.
  register('products_pre_overlay_snapshot', {
    pattern: /^heys_products_pre_overlay_\d+$/,
    scope: 'global', /* maxSize unbounded — rely on age */ maxAge: 90 * DAY_MS,
    cloudSync: 'never', pruneStrategy: 'wipe-by-age',
    description: 'Pre-migration snapshot (90-day TTL, then wipe).',
  });

  // Planning Gantt v2 — UI prefs (zoom level, toolbar toggles, collapsed groups, view position,
  // schema migration version flag). Local-only; users can re-set on each device. Scope is global
  // by design — UI taste is shared across PIN clients on the same device.
  register('planning_gantt_prefs', {
    pattern: /^heys_planning_gantt_(zoom|toggles|groups_collapsed|view_pos|schema_v)_v1$/,
    scope: 'global', maxSize: 8 * KB, maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'manual',
    description: 'Gantt v2 UI prefs (zoom, toggles, collapsed groups, view position, schema flag).',
  });
  register('fingers_active_session', {
    pattern: /^(heys_finger_active_session|heys_[a-f0-9-]{36}_finger_active_session|fingers\.resume\.snoozedUntil)$/,
    scope: 'global', maxSize: 16 * KB, maxAge: 1 * DAY_MS,
    cloudSync: 'never', pruneStrategy: 'manual',
    description: 'Fingers active timer recovery snapshot/snooze. Local-only; never cloud-synced.',
  });
  register('drums_finger_active_session', {
    pattern: /^(heys_drums_finger_active_session|heys_[a-f0-9-]{36}_drums_finger_active_session)$/,
    scope: 'global', maxSize: 16 * KB, maxAge: 1 * DAY_MS,
    cloudSync: 'never', pruneStrategy: 'manual',
    description: 'Drums finger-control active session recovery snapshot. Local-only; never cloud-synced.',
  });
  register('products_overlay', {
    pattern: /^heys_[a-f0-9-]{36}_heys_products_overlay_v2$/,
    scope: 'per-client', /* maxSize unbounded */ maxAge: 0,
    cloudSync: 'mirror', pruneStrategy: 'manual',
    description: 'Per-client overlay store (canonical post-Phase ε).',
  });
  register('products_legacy', {
    pattern: /^heys_[a-f0-9-]{36}_products$/,
    scope: 'per-client', /* maxSize unbounded */ maxAge: 0,
    cloudSync: 'mirror', pruneStrategy: 'manual',
    description: 'Legacy denormalized products list (dual-written until Phase ε).',
  });
  register('products_legacy_global', {
    pattern: /^heys_products$/,
    scope: 'global', /* maxSize unbounded */ maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'manual',
    description: 'Unscoped legacy products list (interceptor writes; rarely populated).',
  });
  register('overlay_markers', {
    pattern: /^heys_overlay_(migrated_at|migration_status|migration_version|migration_aborted|user_notified|health|phase_alpha_perf|migration_lock)$/,
    scope: 'global', maxSize: 8 * KB, maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'manual',
    bootstrapBypass: true,
    description: 'Overlay migration / health markers.',
  });

  // Day data (per-date).
  register('dayv2', {
    pattern: /^heys_[a-f0-9-]{36}_dayv2_\d{4}-\d{2}-\d{2}$/,
    scope: 'per-date', maxSize: 32 * KB, maxAge: 90 * DAY_MS,
    cloudSync: 'mirror', pruneStrategy: 'oldest-first',
    description: 'Per-date day data (existing 60-day cleanup; align to 90d here).',
  });

  // Tombstones.
  register('deleted_ids', {
    pattern: /^heys_[a-f0-9-]{36}_deleted_ids$/,
    scope: 'per-client', maxSize: 64 * KB, maxAge: 365 * DAY_MS,
    cloudSync: 'mirror', pruneStrategy: 'sliding-window',
    description: 'Hard-deleted product IDs (legacy bucket).',
  });
  register('removed_from_my_list', {
    pattern: /^heys_[a-f0-9-]{36}_removed_from_my_list$/,
    scope: 'per-client', maxSize: 64 * KB, maxAge: 365 * DAY_MS,
    cloudSync: 'mirror', pruneStrategy: 'sliding-window',
    description: 'Soft-removed products (Phase β/γ split bucket).',
  });

  // Telemetry.
  register('recovery_telemetry', {
    pattern: /^heys_recovery_telemetry$/,
    scope: 'global', maxSize: 16 * KB, maxAge: 30 * DAY_MS,
    cloudSync: 'never', pruneStrategy: 'sliding-window',
    description: 'Local telemetry for orphan-recovery decisions.',
  });

  // Logs / preferences (small, never auto-wiped).
  register('log_preferences', {
    pattern: /^heys_log_(groups_v1|verbose)$/,
    scope: 'global', maxSize: 4 * KB, maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'manual',
    bootstrapBypass: true,
    description: 'Console log filter preferences.',
  });

  // Flags.
  register('feature_flags', {
    pattern: /^heys_flags_v1$/,
    scope: 'global', maxSize: 8 * KB, maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'manual',
    bootstrapBypass: true,
    description: 'Persisted feature flags.',
  });

  // Auth (NEVER-TOUCH allowlist also applies; documented here for completeness).
  register('auth_supabase', {
    pattern: /^heys_supabase_auth_token$/,
    scope: 'global', maxSize: 0, maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'manual',
    bootstrapBypass: true,
    description: 'Supabase session token. NEVER auto-touched (hard allowlist).',
  });
  register('auth_pin', {
    pattern: /^heys_pin_auth_client$/,
    scope: 'global', maxSize: 0, maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'manual',
    bootstrapBypass: true,
    description: 'PIN-auth client identity. NEVER auto-touched (hard allowlist).',
  });
  register('auth_sb_prefix', {
    pattern: /^sb-/,
    scope: 'global', maxSize: 0, maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'manual',
    bootstrapBypass: true,
    description: 'Supabase SDK keys. NEVER auto-touched (hard allowlist).',
  });

  // Client identity / current.
  register('clients_root', {
    pattern: /^heys_(clients|client_current|last_client_id)$/,
    scope: 'global', maxSize: 16 * KB, maxAge: 0,
    cloudSync: 'mirror', pruneStrategy: 'manual',
    bootstrapBypass: true,
    description: 'Client roster + currently-selected client.',
  });

  // Sound settings.
  register('sound_settings', {
    pattern: /^heys_sound_settings$/,
    scope: 'global', maxSize: 4 * KB, maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'manual',
    description: 'Sound preferences (global, no clientId).',
  });

  // What's-new modal seen-set.
  register('whats_new_seen', {
    pattern: /^heys_whats_new_seen_/,
    scope: 'per-client', maxSize: 8 * KB, maxAge: 365 * DAY_MS,
    cloudSync: 'never', pruneStrategy: 'sliding-window',
    description: 'Set of seen what-new release versions.',
  });

  // Test fixture: only the EXACT name is auto-wiped (Phase 2b+).
  register('test_large_fixture', {
    pattern: /^test_large$/,
    scope: 'global', maxSize: 0 /* forbidden */, maxAge: 0,
    cloudSync: 'never', pruneStrategy: 'wipe',
    description: 'Leftover dev fixture (e.g. widgets-layout-persistence test).',
  });

  // ─────────────────────────────────────────────────────────────────────
  // Phase 2a: shadow-mode boot audit.
  //
  // Iterates LS, classifies via registry, and for each key with a violation
  // (oversize / over-age / forbidden / wipe-by-age stale) writes a PROPOSAL
  // to `heys_storage_audit_pending_v1` instead of mutating LS.
  //
  // Gates:
  //   - test-env (NODE_ENV=test or __HEYS_TEST_MODE) → no-op
  //   - storageRegistry.disableForTesting() → no-op
  //   - 6h gate (heys_storage_audit_last) unless force or version mismatch
  //   - audit version mismatch (heys_storage_audit_version !== AUDIT_VERSION) → force
  //   - navigator.locks held by another tab → no-op (sibling tab is auditing)
  //
  // Idle: wraps body in requestIdleCallback({ timeout: 3000 }), fallback setTimeout(0).
  // Returns a Promise<{ skipped, reason?, decisions, snapshot }>.
  //
  // Phase 2a is shadow ONLY. Decisions are appended to the pending log; LS untouched.
  // ─────────────────────────────────────────────────────────────────────
  const AUDIT_VERSION = '1';
  const AUDIT_LOG_KEY = 'heys_storage_audit_log_v1';
  const AUDIT_PENDING_KEY = 'heys_storage_audit_pending_v1';
  const AUDIT_RECYCLE_KEY = 'heys_storage_audit_recycle_v1';
  const AUDIT_LAST_KEY = 'heys_storage_audit_last';
  const AUDIT_VERSION_KEY = 'heys_storage_audit_version';
  const CLEANUP_ACTIVE_KEY = 'heys_storage_cleanup_active';
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const CLEANUP_FLAG_TTL_MS = 5000;   // advisory flag freshness
  const AUDIT_LOG_MAX_ENTRIES = 30;
  const PENDING_MAX_ENTRIES = 100;
  const RECYCLE_MAX_ENTRIES = 50;
  const RECYCLE_ENTRY_MAX_VALUE_BYTES = 16 * KB; // per-entry value cap in recycle bin

  function _scheduleIdle(fn) {
    if (typeof global.requestIdleCallback === 'function') {
      try {
        return global.requestIdleCallback(fn, { timeout: 3000 });
      } catch (_) { /* noop */ }
    }
    return setTimeout(fn, 0);
  }

  async function _withLock(name, body) {
    // navigator.locks not always available (jsdom / older browsers): fall through.
    if (global.navigator && global.navigator.locks && typeof global.navigator.locks.request === 'function') {
      try {
        return await global.navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
          if (!lock) return { skipped: true, reason: 'lock-held' };
          return await body();
        });
      } catch (e) {
        return { skipped: true, reason: 'lock-error: ' + (e && e.message) };
      }
    }
    return await body();
  }

  function _appendCappedLog(key, entries, maxEntries) {
    if (!global.localStorage) return;
    let arr = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      }
    } catch (_) { /* noop */ }
    arr = arr.concat(entries).slice(-maxEntries);
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {
      // Last-ditch: drop half on quota exceeded.
      try {
        arr = arr.slice(-Math.floor(maxEntries / 2));
        localStorage.setItem(key, JSON.stringify(arr));
      } catch (_) { /* swallow — Phase 1 must not crash */ }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Phase 2b: enforce-mode helpers.
  // ─────────────────────────────────────────────────────────────────────

  /** Whether the enforce flag is enabled (post-burn-in flip). */
  function _isEnforceMode() {
    try {
      // HEYS.flags is an alias for HEYS.featureFlags (both are wired in heys_feature_flags_v1.js).
      const flags = HEYS.featureFlags || HEYS.flags;
      return !!(flags && typeof flags.isEnabled === 'function' && flags.isEnabled('storage_audit_enforce'));
    } catch (_) { return false; }
  }

  /**
   * Returns true if another tab is mid-cleanup (sync advisory flag).
   * Phase 4 safeSetItem integration reads this too.
   */
  function isCleanupActive() {
    if (!global.localStorage) return false;
    try {
      const ts = parseInt(localStorage.getItem(CLEANUP_ACTIVE_KEY) || '0', 10);
      return !!(ts && (Date.now() - ts) < CLEANUP_FLAG_TTL_MS);
    } catch (_) { return false; }
  }

  function _setCleanupFlag() {
    try { localStorage.setItem(CLEANUP_ACTIVE_KEY, String(Date.now())); } catch (_) { /* noop */ }
  }

  function _clearCleanupFlag() {
    try { localStorage.removeItem(CLEANUP_ACTIVE_KEY); } catch (_) { /* noop */ }
  }

  /**
   * Read recycle bin array (Phase 2b: 24h ring-buffer of deleted values).
   */
  function _readRecycleBin() {
    if (!global.localStorage) return [];
    try {
      const raw = localStorage.getItem(AUDIT_RECYCLE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  /**
   * Append entry to recycle bin. Stores the raw LS value (capped per-entry)
   * so restoreAuditDeletion can write it back.
   *
   * @param {{ ts, key, policy, action, sizeBytes, rawValue: string|null }} entry
   */
  function _appendToRecycleBin(entry) {
    if (!global.localStorage) return;
    const bin = _readRecycleBin();

    // Truncate value to per-entry budget to protect recycle bin total.
    let value = entry.rawValue || null;
    let valueTruncated = false;
    if (value && (value.length * 2) > RECYCLE_ENTRY_MAX_VALUE_BYTES) {
      value = null;
      valueTruncated = true;
    }

    const record = {
      ts: entry.ts || Date.now(),
      key: entry.key,
      policy: entry.policy,
      action: entry.action,
      sizeBytes: entry.sizeBytes,
      value,
      valueTruncated,
    };

    const updated = bin.concat([record]).slice(-RECYCLE_MAX_ENTRIES);
    try {
      localStorage.setItem(AUDIT_RECYCLE_KEY, JSON.stringify(updated));
    } catch (_) {
      // If quota hit, drop older half and retry.
      try {
        localStorage.setItem(AUDIT_RECYCLE_KEY, JSON.stringify(updated.slice(-Math.floor(RECYCLE_MAX_ENTRIES / 2))));
      } catch (__) { /* swallow */ }
    }
  }

  /**
   * Prune a JSON-array LS value to fit within maxSizeBytes.
   * Drops from the front (oldest-first semantics).
   * Returns the pruned JSON string, or null if the value is not a parseable array.
   */
  function _pruneArrayValue(rawValue, maxSizeBytes, key) {
    try {
      const arr = JSON.parse(rawValue);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      let pruned = arr;
      while (pruned.length > 1) {
        const serialized = JSON.stringify(pruned);
        const sizeBytes = (key.length + serialized.length) * 2;
        if (sizeBytes <= maxSizeBytes) return serialized;
        pruned = pruned.slice(1);
      }
      // One item left — return only if it fits.
      const serialized = JSON.stringify(pruned);
      return ((key.length + serialized.length) * 2) <= maxSizeBytes ? serialized : null;
    } catch (_) { return null; }
  }

  /**
   * Phase 2b: should this key be enforced now (not deferred to Phase 5)?
   * Keys with cloudSync:'merge' require cloud-merge before truncation (Phase 5).
   */
  function _enforceableNow(policy) {
    return policy.cloudSync !== 'merge';
  }

  function _classifyForStrategy(entry, policy, now) {
    // Returns { action, reason } or null if no proposal.
    if (!policy) return null;
    const strategy = policy.pruneStrategy;
    if (strategy === 'manual') return null;

    if (typeof policy.maxSize === 'number' && policy.maxSize === 0) {
      // Forbidden — propose wipe.
      return { action: 'wipe-proposed', reason: 'forbidden-policy' };
    }
    if (typeof policy.maxSize === 'number' && policy.maxSize > 0 && entry.sizeBytes > policy.maxSize) {
      if (strategy === 'wipe') return { action: 'wipe-proposed', reason: 'oversize+wipe' };
      if (strategy === 'oldest-first' || strategy === 'sliding-window') {
        return { action: 'prune-proposed', reason: 'oversize+' + strategy };
      }
    }
    // Wipe-by-age requires a parsed timestamp; we only do that for keys that
    // include a parseable date/timestamp pattern. For Phase 2a we surface a
    // proposal only when the policy itself is wipe-by-age AND the policy has maxAge.
    // The actual age comparison is best-effort: snapshot keys carry a numeric ts.
    if (strategy === 'wipe-by-age' && typeof policy.maxAge === 'number' && policy.maxAge > 0) {
      // Try parse trailing digits as ms-ts (heys_products_pre_overlay_<ts> style).
      const m = entry.rawKey.match(/(\d{10,})$/);
      if (m) {
        const ts = Number(m[1]);
        if (Number.isFinite(ts) && (now - ts) > policy.maxAge) {
          return { action: 'wipe-by-age-proposed', reason: 'age>maxAge', ageMs: now - ts };
        }
      }
      // dayv2 date pattern: YYYY-MM-DD
      const dm = entry.rawKey.match(/_dayv2_(\d{4})-(\d{2})-(\d{2})$/);
      if (dm) {
        const dt = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
        if (Number.isFinite(dt) && (now - dt) > policy.maxAge) {
          return { action: 'wipe-by-age-proposed', reason: 'date>maxAge', ageMs: now - dt };
        }
      }
    }
    return null;
  }

  /**
   * Phase 2a shadow audit. Read-only execution path.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.force=false]      Bypass 6h gate.
   * @param {boolean} [opts.bypassIdle=false] Skip requestIdleCallback (synchronous body).
   * @param {boolean} [opts.bypassLock=false] Skip navigator.locks (caller is responsible for serialization).
   * @returns {Promise<object>} { skipped, reason?, decisions, snapshot, version }.
   */
  async function runAuditOnce(opts) {
    opts = opts || {};

    // Test-env short-circuit.
    if (_isTestEnv && !opts.bypassIdle) {
      // Tests must opt-in via bypassIdle to invoke; default jsdom path is no-op.
      return { skipped: true, reason: 'test-env' };
    }
    if (isDisabledForTesting()) {
      return { skipped: true, reason: 'disabled-for-testing' };
    }
    if (!global.localStorage) {
      return { skipped: true, reason: 'no-localstorage' };
    }

    // Strict Store-readiness check belongs HERE (per 5th-audit C3), not at IIFE.
    if (!HEYS.store || typeof HEYS.store.set !== 'function') {
      return { skipped: true, reason: 'store-not-ready' };
    }

    // Version invalidation.
    let storedVersion = null;
    try { storedVersion = localStorage.getItem(AUDIT_VERSION_KEY); } catch (_) { /* noop */ }
    const versionMismatch = storedVersion !== AUDIT_VERSION;

    // 6h gate.
    let lastTs = 0;
    try { lastTs = parseInt(localStorage.getItem(AUDIT_LAST_KEY) || '0', 10) || 0; } catch (_) { /* noop */ }
    const now = Date.now();
    if (!opts.force && !versionMismatch && lastTs > 0 && (now - lastTs) < SIX_HOURS_MS) {
      return { skipped: true, reason: '6h-gate', lastTs };
    }

    const exec = async () => {
      // Acquire cross-tab lock. If held → another tab is auditing.
      const result = opts.bypassLock
        ? await _doAudit(now)
        : await _withLock('heys_storage_audit', () => _doAudit(now));

      if (result && result.skipped) return result;

      // Stamp markers on success.
      try {
        localStorage.setItem(AUDIT_LAST_KEY, String(now));
        localStorage.setItem(AUDIT_VERSION_KEY, AUDIT_VERSION);
      } catch (_) { /* noop */ }
      return result;
    };

    if (opts.bypassIdle) {
      return await exec();
    }
    return await new Promise((resolve) => {
      _scheduleIdle(() => {
        exec().then(resolve, (e) => resolve({ skipped: true, reason: 'audit-error: ' + (e && e.message) }));
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Phase 5 Block B: cloud-merge for cloudSync:'merge' keys.
  //
  // Called from _doAudit enforce mode instead of deferring these keys.
  // Fetches cloud copy, merges with local (policy-specific strategy),
  // writes back via HEYS.store.set (compressed). Aborts on network/parse
  // errors and leaves local untouched so no data is lost.
  // ─────────────────────────────────────────────────────────────────────
  const MERGE_TIMEOUT_MS = 5000;
  const FEEDBACK_MAX_HISTORY = 30;

  // Map policy.name → normalised cloud KV store key (post-stripClientScopePrefix).
  const CLOUD_KEYS_BY_POLICY = {
    insights_feedback: 'heys_insights_feedback',
    hidden_products: 'heys_hidden_products',
  };

  function _extractClientId(rawKey) {
    const m = rawKey.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    return m ? m[0] : null;
  }

  // Trim a single feedback record to scalar fields only (drops embedded products).
  function _trimFeedbackRecord(rec) {
    if (!rec || typeof rec !== 'object') return null;
    const out = {};
    const scalars = ['id', 'timestamp', 'schemaVersion', 'scenario', 'score', 'mealType', 'recommendation'];
    for (const f of scalars) {
      if (rec[f] !== undefined) out[f] = rec[f];
    }
    if (Array.isArray(rec.productIds)) {
      out.productIds = rec.productIds
        .map(p => (typeof p === 'string' ? p : (p && p.id ? String(p.id) : null)))
        .filter(Boolean);
    }
    return out.id ? out : null;
  }

  // Union by record.id; prefer higher schemaVersion, then later timestamp. Trim to MAX_HISTORY.
  function _mergeFeedback(local, cloud) {
    const SCHEMA_ORDER = ['v1.2', 'v1.1', 'v1.0'];
    function schemaRank(sv) {
      const idx = SCHEMA_ORDER.indexOf(sv);
      return idx >= 0 ? SCHEMA_ORDER.length - idx : 0;
    }
    const byId = new Map();
    for (const arr of [local, cloud]) {
      for (const raw of (Array.isArray(arr) ? arr : [])) {
        const rec = _trimFeedbackRecord(raw);
        if (!rec) continue;
        const existing = byId.get(rec.id);
        if (!existing) {
          byId.set(rec.id, rec);
        } else {
          const er = schemaRank(existing.schemaVersion);
          const nr = schemaRank(rec.schemaVersion);
          if (nr > er || (nr === er && (rec.timestamp || 0) > (existing.timestamp || 0))) {
            byId.set(rec.id, rec);
          }
        }
      }
    }
    return Array.from(byId.values())
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, FEEDBACK_MAX_HISTORY);
  }

  // Union of string IDs (Set semantics).
  function _mergeHiddenProducts(local, cloud) {
    const ids = new Set();
    for (const arr of [local, cloud]) {
      for (const item of (Array.isArray(arr) ? arr : [])) {
        if (typeof item === 'string' && item) ids.add(item);
      }
    }
    return Array.from(ids);
  }

  async function _mergeAndPrune(entry, policy, now) {
    const rawKey = entry.rawKey;
    const entrySize = entry.sizeBytes;

    const abortResult = (reason) => ({
      ts: now,
      key: rawKey,
      keyRedacted: rawKey.replace(UUID_RE, '<cid>'),
      policy: policy.name,
      sizeBytes: entrySize,
      action: 'merge-aborted',
      reason,
      mode: 'enforce',
      executed: false,
    });

    const clientId = _extractClientId(rawKey);
    if (!clientId) return abortResult('no-client-id');

    const cloudKey = CLOUD_KEYS_BY_POLICY[policy.name];
    if (!cloudKey) return abortResult('no-cloud-key-for-policy');

    // Read decompressed local value via Store.get.
    // Store.get's scoped() is idempotent: rawKey already contains the cid.
    let localArr = [];
    try {
      const v = HEYS.store && typeof HEYS.store.get === 'function'
        ? HEYS.store.get(rawKey, null)
        : null;
      if (Array.isArray(v)) localArr = v;
    } catch (_) { /* proceed with empty */ }

    // Fetch cloud value with 5s timeout.
    let cloudArr = null;
    let abortReason = null;
    const YandexAPI = (global.HEYS && global.HEYS.YandexAPI) || global.YandexAPI;
    if (!YandexAPI || typeof YandexAPI.from !== 'function') {
      abortReason = 'no-api';
    } else {
      try {
        const { data, error } = await Promise.race([
          YandexAPI.from('client_kv_store')
            .select('v')
            .eq('client_id', clientId)
            .eq('k', cloudKey),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), MERGE_TIMEOUT_MS)
          ),
        ]);
        if (error) {
          abortReason = 'cloud-error';
        } else if (!data) {
          abortReason = 'cloud-null-data';
        } else if (data.length === 0) {
          cloudArr = []; // No cloud record — local is authoritative.
        } else {
          const v = data[0] && data[0].v;
          if (!Array.isArray(v)) {
            abortReason = 'cloud-parse-failure';
          } else if (v.length === 0 && localArr.length > FEEDBACK_MAX_HISTORY) {
            // Suspicious zero: cloud empty but local has many records — don't trust.
            abortReason = 'suspicious-zero';
          } else {
            cloudArr = v;
          }
        }
      } catch (e) {
        abortReason = (e && e.message === 'timeout') ? 'cloud-timeout' : 'cloud-fetch-error';
      }
    }

    if (abortReason) {
      _appendCappedLog(AUDIT_LOG_KEY, [{
        ts: now,
        key: rawKey.replace(UUID_RE, '<cid>'),
        policy: policy.name,
        action: 'merge-aborted',
        reason: abortReason,
        mode: 'enforce',
      }], AUDIT_LOG_MAX_ENTRIES);
      return abortResult(abortReason);
    }

    // Merge using policy-specific strategy.
    const recordsBefore = localArr.length;
    const merged = (policy.name === 'hidden_products')
      ? _mergeHiddenProducts(localArr, cloudArr)
      : _mergeFeedback(localArr, cloudArr);
    const recordsAfter = merged.length;

    // Write back via Store.set — automatically compressed with ¤Z¤ prefix.
    let executed = false;
    try {
      if (HEYS.store && typeof HEYS.store.set === 'function') {
        HEYS.store.set(rawKey, merged);
        executed = true;
      }
    } catch (e) {
      console.warn('[HEYS.storageRegistry] _mergeAndPrune write failed', rawKey, e && e.message);
    }

    const action = executed ? 'merged' : 'merge-write-failed';
    _appendCappedLog(AUDIT_LOG_KEY, [{
      ts: now,
      key: rawKey.replace(UUID_RE, '<cid>'),
      policy: policy.name,
      action,
      recordsBefore,
      recordsAfter,
      cloudRecords: (cloudArr || []).length,
      mode: 'enforce',
    }], AUDIT_LOG_MAX_ENTRIES);

    return {
      ts: now,
      key: rawKey,
      keyRedacted: rawKey.replace(UUID_RE, '<cid>'),
      policy: policy.name,
      sizeBytes: executed ? (rawKey.length + JSON.stringify(merged).length) * 2 : entrySize,
      action,
      reason: 'cloud-merge+prune',
      recordsBefore,
      recordsAfter,
      mode: 'enforce',
      executed,
    };
  }

  async function _doAudit(now) {
    const enforcing = _isEnforceMode();
    const all = _readAllKeys();
    const decisions = [];
    const snapshot = {
      ts: now,
      totalBytes: 0,
      totalKeys: all.length,
      top10: [],
    };

    // Build sized list + total (before any enforcement).
    const sized = [];
    for (const e of all) {
      const sizeBytes = (e.key.length + (e.raw ? e.raw.length : 0)) * 2;
      snapshot.totalBytes += sizeBytes;
      sized.push({ rawKey: e.key, raw: e.raw, sizeBytes });
    }
    snapshot.top10 = sized
      .slice()
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 10)
      .map((s) => ({ key: s.rawKey.replace(UUID_RE, '<cid>'), sizeBytes: s.sizeBytes }));

    // Classify every key.
    const proposals = [];
    for (const entry of sized) {
      if (isNeverTouch(entry.rawKey)) continue;
      const policy = match(entry.rawKey);
      if (!policy) continue;
      const proposal = _classifyForStrategy(entry, policy, now);
      if (!proposal) continue;
      proposals.push({ entry, policy, proposal });
    }

    if (!enforcing) {
      // ── SHADOW mode: write proposals to pending log only ──
      for (const { entry, policy, proposal } of proposals) {
        decisions.push({
          ts: now,
          key: entry.rawKey,
          keyRedacted: entry.rawKey.replace(UUID_RE, '<cid>'),
          policy: policy.name,
          sizeBytes: entry.sizeBytes,
          action: proposal.action,
          reason: proposal.reason,
          ageMs: proposal.ageMs || null,
          mode: 'shadow',
        });
      }
      if (decisions.length) {
        _appendCappedLog(AUDIT_PENDING_KEY, decisions, PENDING_MAX_ENTRIES);
      }
    } else {
      // ── ENFORCE mode: actually delete / prune eligible keys ──
      // Set advisory sync flag so safeSetItem tiers can coordinate.
      _setCleanupFlag();
      try {
        for (const { entry, policy, proposal } of proposals) {
          // cloudSync:'merge' keys: cloud-merge before truncation (Phase 5 Block B).
          if (!_enforceableNow(policy)) {
            const mergeDecision = await _mergeAndPrune(entry, policy, now);
            decisions.push(mergeDecision);
            continue;
          }

          const action = proposal.action;
          let executed = false;
          let finalAction = action;
          let prunedToBytes = null;

          if (action === 'wipe-proposed' || action === 'wipe-by-age-proposed') {
            // Save raw value to recycle bin before deletion.
            _appendToRecycleBin({
              ts: now,
              key: entry.rawKey,
              policy: policy.name,
              action,
              sizeBytes: entry.sizeBytes,
              rawValue: entry.raw,
            });
            try {
              localStorage.removeItem(entry.rawKey);
              executed = true;
            } catch (e) {
              console.warn('[HEYS.storageRegistry] removeItem failed', entry.rawKey, e && e.message);
            }

          } else if (action === 'prune-proposed') {
            // Attempt array prune. Fall back to wipe if non-parseable.
            const maxSize = policy.maxSize;
            const pruned = (typeof maxSize === 'number' && maxSize > 0)
              ? _pruneArrayValue(entry.raw, maxSize, entry.rawKey)
              : null;

            if (pruned !== null) {
              // Save original to recycle bin before overwrite.
              _appendToRecycleBin({
                ts: now,
                key: entry.rawKey,
                policy: policy.name,
                action,
                sizeBytes: entry.sizeBytes,
                rawValue: entry.raw,
              });
              try {
                localStorage.setItem(entry.rawKey, pruned);
                prunedToBytes = (entry.rawKey.length + pruned.length) * 2;
                executed = true;
              } catch (e) {
                console.warn('[HEYS.storageRegistry] prune write failed', entry.rawKey, e && e.message);
              }
            } else {
              // Prune failed (non-array value) — degrade to wipe.
              finalAction = 'wipe-proposed';
              _appendToRecycleBin({
                ts: now,
                key: entry.rawKey,
                policy: policy.name,
                action: finalAction,
                sizeBytes: entry.sizeBytes,
                rawValue: entry.raw,
              });
              try {
                localStorage.removeItem(entry.rawKey);
                executed = true;
              } catch (e) {
                console.warn('[HEYS.storageRegistry] removeItem (prune-fallback) failed', entry.rawKey, e && e.message);
              }
            }
          }

          decisions.push({
            ts: now,
            key: entry.rawKey,
            keyRedacted: entry.rawKey.replace(UUID_RE, '<cid>'),
            policy: policy.name,
            sizeBytes: entry.sizeBytes,
            action: finalAction,
            reason: proposal.reason + (prunedToBytes ? '+pruned' : ''),
            ageMs: proposal.ageMs || null,
            mode: 'enforce',
            executed,
            prunedToBytes: prunedToBytes || undefined,
          });
        }
      } finally {
        _clearCleanupFlag();
      }
    }

    // Append snapshot to audit log (capped).
    _appendCappedLog(AUDIT_LOG_KEY, [{
      ts: now,
      kind: 'snapshot',
      totalBytes: snapshot.totalBytes,
      totalKeys: snapshot.totalKeys,
      top10: snapshot.top10,
      decisionsCount: decisions.length,
      mode: enforcing ? 'enforce' : 'shadow',
      version: AUDIT_VERSION,
    }], AUDIT_LOG_MAX_ENTRIES);

    return { skipped: false, decisions, snapshot, version: AUDIT_VERSION };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Public API.
  // ─────────────────────────────────────────────────────────────────────
  HEYS.storageRegistry = {
    _version: 1,
    register,
    match,
    list,
    analyze,
    isNeverTouch,
    disableForTesting,
    isDisabledForTesting,
    runAuditOnce,
    isCleanupActive,
    HEYS_BUDGET_BYTES,
    NEVER_TOUCH,
    AUDIT_VERSION,
    AUDIT_LOG_KEY,
    AUDIT_PENDING_KEY,
    AUDIT_RECYCLE_KEY,
    CLEANUP_ACTIVE_KEY,
    // Phase 5: manual merge trigger for a single key (e.g. from diagnostics console).
    mergeAndPruneKey: async function (rawKey) {
      const policy = match(rawKey);
      if (!policy || policy.cloudSync !== 'merge') {
        return { error: 'key not matched to a cloudSync:merge policy', key: rawKey };
      }
      const raw = global.localStorage ? localStorage.getItem(rawKey) : null;
      const sizeBytes = (rawKey.length + (raw ? raw.length : 0)) * 2;
      return _mergeAndPrune({ rawKey, raw, sizeBytes }, policy, Date.now());
    },
  };

  // ─────────────────────────────────────────────────────────────────────
  // Diagnostics surface — read-only inspection via devtools console.
  // Mirrors HEYS.diagnostics.overlay() pattern in heys_products_overlay_v1.js.
  // ─────────────────────────────────────────────────────────────────────
  HEYS.diagnostics = HEYS.diagnostics || {};

  function _redactKey(key, doRedact) {
    if (!doRedact) return key;
    return key.replace(UUID_RE, '<cid>');
  }

  function _measureLsBytes() {
    if (!global.localStorage) return 0;
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k == null) continue;
        const v = localStorage.getItem(k) || '';
        total += (k.length + v.length) * 2;
      }
    } catch (_) { /* noop */ }
    return total;
  }

  function _readAllKeys() {
    if (!global.localStorage) return [];
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k == null) continue;
        const v = localStorage.getItem(k);
        out.push({ key: k, raw: v });
      }
    } catch (_) { /* noop */ }
    return out;
  }

  /**
   * Build a snapshot of current localStorage state classified by registry policies.
   * Read-only. Safe to call any time.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.redact=true]   Replace UUIDs in keys with `<cid>`.
   * @param {number}  [opts.topN=20]       How many top-by-size keys to surface.
   */
  HEYS.diagnostics.storageAudit = function (opts) {
    const o = opts || {};
    const doRedact = o.redact !== false; // default true
    const topN = typeof o.topN === 'number' ? o.topN : 20;
    const all = _readAllKeys();

    const totalBytes = all.reduce((s, e) => s + (e.key.length + (e.raw ? e.raw.length : 0)) * 2, 0);
    const totalKeys = all.length;

    const classified = all.map((e) => {
      const result = analyze(e.key, e.raw);
      return {
        key: _redactKey(e.key, doRedact),
        rawKey: e.key,
        sizeBytes: result.sizeBytes,
        sizePercent: totalBytes ? +(100 * result.sizeBytes / totalBytes).toFixed(2) : 0,
        policy: result.policy ? result.policy.name : null,
        violations: result.violations,
        neverTouch: !!result.neverTouch,
      };
    });

    const topKeys = classified
      .slice()
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, topN)
      .map((c) => ({
        key: c.key,
        sizeBytes: c.sizeBytes,
        sizeKB: +(c.sizeBytes / KB).toFixed(1),
        sizePercent: c.sizePercent,
        policy: c.policy,
        violations: c.violations.length ? c.violations : undefined,
        neverTouch: c.neverTouch || undefined,
      }));

    const unknownKeys = classified
      .filter((c) => !c.policy && !c.neverTouch)
      .map((c) => ({ key: c.key, sizeKB: +(c.sizeBytes / KB).toFixed(1) }));

    const policyViolations = classified
      .filter((c) => c.violations && c.violations.length > 0)
      .map((c) => ({ key: c.key, sizeKB: +(c.sizeBytes / KB).toFixed(1), violations: c.violations }));

    let auditLog = [];
    try {
      const raw = global.localStorage && global.localStorage.getItem('heys_storage_audit_log_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) auditLog = parsed.slice(-5);
      }
    } catch (_) { /* noop */ }

    const browserUsage = (global.navigator && global.navigator.storage && global.navigator.storage.estimate)
      ? '(call await HEYS.diagnostics.browserStorageEstimate())'
      : null;

    const out = {
      totalBytes,
      totalKB: +(totalBytes / KB).toFixed(1),
      totalKeys,
      heysBudgetMB: +(HEYS_BUDGET_BYTES / MB).toFixed(1),
      heysBudgetUsagePercent: +(100 * totalBytes / HEYS_BUDGET_BYTES).toFixed(1),
      browserUsage,
      topKeys,
      unknownKeys,
      policyViolations,
      lastAuditAt: (global.localStorage && global.localStorage.getItem('heys_storage_audit_last')) || null,
      auditLog,
      registry: { policies: _policies.length, version: 1 },
    };
    try { console.table({
      totalKB: out.totalKB,
      totalKeys: out.totalKeys,
      heysBudgetMB: out.heysBudgetMB,
      heysBudgetUsagePercent: out.heysBudgetUsagePercent,
      unknownKeys: out.unknownKeys.length,
      policyViolations: out.policyViolations.length,
    }); } catch (_) { console.log(out); }
    return out;
  };

  /**
   * Return browser-level storage estimate (asynchronous).
   * Useful as a secondary safety net when HEYS budget is suspect.
   */
  HEYS.diagnostics.browserStorageEstimate = async function () {
    if (!(global.navigator && global.navigator.storage && global.navigator.storage.estimate)) {
      return { supported: false };
    }
    try {
      const est = await global.navigator.storage.estimate();
      return {
        supported: true,
        usageBytes: est.usage,
        quotaBytes: est.quota,
        usagePercent: est.quota ? +(100 * est.usage / est.quota).toFixed(2) : null,
      };
    } catch (e) {
      return { supported: false, error: String(e && e.message) };
    }
  };

  /**
   * Phase 2a: trigger a shadow audit on demand (bypasses 6h gate).
   * Returns { skipped, reason?, decisions, snapshot, version } — same shape
   * as runAuditOnce(). Logs decisions to heys_storage_audit_pending_v1.
   * No LS mutations beyond the audit-log/pending markers.
   */
  HEYS.diagnostics.runStorageAuditNow = async function (opts) {
    const o = Object.assign({ force: true, bypassIdle: true }, opts || {});
    const result = await runAuditOnce(o);
    try { console.info('[HEYS.storageRegistry] runStorageAuditNow:', result); } catch (_) { /* noop */ }
    return result;
  };

  /**
   * Inspect Phase 2a pending proposals (shadow-mode decisions) without running audit.
   */
  HEYS.diagnostics.storageAuditPending = function () {
    if (!global.localStorage) return [];
    try {
      const raw = localStorage.getItem(AUDIT_PENDING_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  };

  /**
   * Phase 2b: restore a key that was deleted by the enforce-mode audit.
   * Reads the most recent matching entry from the 24h recycle bin and writes
   * the raw value back to localStorage.
   *
   * @param {string} key - exact LS key to restore
   * @returns {{ restored: boolean, key?, sizeBytes?, ts?, reason? }}
   */
  HEYS.diagnostics.restoreAuditDeletion = function (key) {
    if (!key || !global.localStorage) {
      return { restored: false, reason: 'no-key' };
    }
    const bin = _readRecycleBin();
    // Find most recent entry for this exact key.
    const entry = bin.slice().reverse().find((e) => e.key === key);
    if (!entry) {
      return { restored: false, reason: 'not-in-recycle-bin' };
    }
    if (entry.value === null) {
      return { restored: false, reason: 'value-truncated-too-large', sizeBytes: entry.sizeBytes };
    }
    try {
      localStorage.setItem(key, entry.value);
      console.info('[HEYS.storageRegistry] Restored', key, '(' + Math.round(entry.sizeBytes / 1024) + ' KB) from recycle bin ts=' + new Date(entry.ts).toISOString());
      return { restored: true, key, sizeBytes: entry.sizeBytes, ts: entry.ts };
    } catch (e) {
      return { restored: false, reason: 'write-error: ' + (e && e.message) };
    }
  };

  /**
   * Inspect a single key's policy/classification.
   */
  HEYS.diagnostics.storagePolicy = function (key) {
    if (!key) return null;
    const raw = (global.localStorage && global.localStorage.getItem(key)) || null;
    const result = analyze(key, raw);
    const out = {
      key,
      policy: result.policy ? result.policy.name : null,
      sizeKB: +((result.sizeBytes || 0) / KB).toFixed(1),
      violations: result.violations,
      neverTouch: !!result.neverTouch,
    };
    console.table(out);
    return out;
  };

})(typeof window !== 'undefined' ? window : globalThis);
