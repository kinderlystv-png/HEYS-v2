/**
 * @fileoverview Tests for heys_storage_registry_v1.js (Phase 1 + Phase 2a shadow audit).
 *
 * Phase 1 surface:
 *  - register/match/list/analyze/isNeverTouch
 *  - HEYS.diagnostics.storageAudit (read-only snapshot)
 *
 * Phase 2a:
 *  - runAuditOnce — shadow mode (no LS mutations beyond audit-log/pending markers)
 *  - 6h gate, version invalidation, test-env short-circuit, lock fallback
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REGISTRY_SRC = readFileSync(
  resolve(__dirname, '../heys_storage_registry_v1.js'),
  'utf8'
);

// Minimal Store shim — registry checks HEYS.store.set existence at audit entry
// (not at IIFE) since the C3 5th-audit fix moved the strict check there.
function makeStoreShim() {
  return {
    set: (k, v) => { /* noop for tests; LS used directly */ },
    get: (k, d) => d,
  };
}

// Self-contained localStorage shim — other test files in this suite replace
// globalThis.localStorage with a non-conforming mock (no .clear()). We install
// our own at start of every test for hermetic isolation.
function makeLocalStorageShim() {
  let store = Object.create(null);
  const shim = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { store = Object.create(null); },
    key(i) {
      const keys = Object.keys(store);
      return i < keys.length ? keys[i] : null;
    },
    get length() { return Object.keys(store).length; },
  };
  return shim;
}

let _savedLocalStorage = null;
let _savedNavigatorLocks = null;

/** Build a featureFlags shim with a fixed set of enabled flags. */
function makeFlagsShim(enabledFlags = []) {
  const set = new Set(enabledFlags);
  return {
    isEnabled: (name) => set.has(name),
    enable: (name) => set.add(name),
    disable: (name) => set.delete(name),
  };
}

function loadRegistry({ asTest = true, enforceMode = false } = {}) {
  // Reset relevant state on globalThis.
  delete globalThis.HEYS;
  globalThis.HEYS = { store: makeStoreShim() };
  if (enforceMode) {
    // Wire featureFlags shim so _isEnforceMode() returns true inside the registry.
    globalThis.HEYS.featureFlags = makeFlagsShim(['storage_audit_enforce']);
  }
  if (asTest) globalThis.__HEYS_TEST_MODE = true;
  else delete globalThis.__HEYS_TEST_MODE;
  // Execute IIFE in current realm.
  // eslint-disable-next-line no-new-func
  new Function('global', REGISTRY_SRC)(globalThis);
  return globalThis.HEYS;
}

beforeEach(() => {
  _savedLocalStorage = globalThis.localStorage;
  // Install hermetic localStorage shim.
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeLocalStorageShim(),
    configurable: true,
    writable: true,
  });
  // Avoid navigator.locks unless explicitly tested — full suite may have a
  // mock that doesn't return falsy on ifAvailable. We always pass bypassLock.
  if (globalThis.navigator) {
    _savedNavigatorLocks = globalThis.navigator.locks;
    try { delete globalThis.navigator.locks; } catch (_) { /* noop */ }
  }
});

afterEach(() => {
  delete globalThis.HEYS;
  delete globalThis.__HEYS_TEST_MODE;
  if (_savedLocalStorage !== null) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: _savedLocalStorage,
      configurable: true,
      writable: true,
    });
    _savedLocalStorage = null;
  }
  if (_savedNavigatorLocks !== undefined && globalThis.navigator) {
    try { globalThis.navigator.locks = _savedNavigatorLocks; } catch (_) { /* noop */ }
    _savedNavigatorLocks = null;
  }
});

describe('storage registry — Phase 1 surface', () => {
  it('exposes register/match/list/analyze/isNeverTouch', () => {
    const HEYS = loadRegistry();
    expect(HEYS.storageRegistry).toBeDefined();
    expect(typeof HEYS.storageRegistry.register).toBe('function');
    expect(typeof HEYS.storageRegistry.match).toBe('function');
    expect(typeof HEYS.storageRegistry.list).toBe('function');
    expect(typeof HEYS.storageRegistry.analyze).toBe('function');
    expect(typeof HEYS.storageRegistry.isNeverTouch).toBe('function');
  });

  it('pre-registers expected built-in policies', () => {
    const HEYS = loadRegistry();
    const list = HEYS.storageRegistry.list();
    const names = list.map(p => p.name);
    expect(names).toContain('insights_feedback');
    expect(names).toContain('hidden_products');
    expect(names).toContain('advice_trace_day');
    expect(names).toContain('perf_log');
    expect(names).toContain('products_pre_overlay_snapshot');
    expect(names).toContain('fingers_active_session');
    expect(names).toContain('dayv2');
    expect(names).toContain('test_large_fixture');
    expect(names).toContain('audit_log');
    expect(names).toContain('audit_pending');
    expect(names).toContain('products_legacy_global');
    expect(list.length).toBeGreaterThanOrEqual(20);
  });

  it('match() classifies known prefixes correctly', () => {
    const HEYS = loadRegistry();
    const cid = '12345678-aaaa-bbbb-cccc-1234567890ab';
    expect(HEYS.storageRegistry.match(`heys_${cid}_insights_feedback_breakfast`)?.name)
      .toBe('insights_feedback');
    expect(HEYS.storageRegistry.match(`heys_${cid}_dayv2_2026-04-26`)?.name)
      .toBe('dayv2');
    expect(HEYS.storageRegistry.match(`heys_${cid}_perf_log`)?.name).toBe('perf_log');
    expect(HEYS.storageRegistry.match('test_large')?.name).toBe('test_large_fixture');
    expect(HEYS.storageRegistry.match(`heys_products_pre_overlay_${Date.now()}`)?.name)
      .toBe('products_pre_overlay_snapshot');
    expect(HEYS.storageRegistry.match('heys_products')?.name).toBe('products_legacy_global');
    expect(HEYS.storageRegistry.match('heys_finger_active_session')?.name).toBe('fingers_active_session');
    expect(HEYS.storageRegistry.match(`heys_${cid}_finger_active_session`)?.name).toBe('fingers_active_session');
    expect(HEYS.storageRegistry.match('fingers.resume.snoozedUntil')?.name).toBe('fingers_active_session');
    expect(HEYS.storageRegistry.match('completely_unknown_key')).toBeNull();
  });

  it('isNeverTouch() refuses auth keys regardless of policy match', () => {
    const HEYS = loadRegistry();
    expect(HEYS.storageRegistry.isNeverTouch('heys_supabase_auth_token')).toBe(true);
    expect(HEYS.storageRegistry.isNeverTouch('heys_pin_auth_client')).toBe(true);
    expect(HEYS.storageRegistry.isNeverTouch('sb-auth-token')).toBe(true);
    expect(HEYS.storageRegistry.isNeverTouch('heys_clients')).toBe(false);
  });

  it('analyze() flags oversize keys', () => {
    const HEYS = loadRegistry();
    const key = 'heys_12345678-aaaa-bbbb-cccc-1234567890ab_insights_feedback_default';
    const big = 'X'.repeat(100 * 1024); // 100 KB > 96 KB cap
    const result = HEYS.storageRegistry.analyze(key, big);
    expect(result.policy?.name).toBe('insights_feedback');
    expect(result.violations.some(v => v.kind === 'oversize')).toBe(true);
  });

  it('analyze() flags forbidden keys (maxSize=0)', () => {
    const HEYS = loadRegistry();
    const result = HEYS.storageRegistry.analyze('test_large', 'any-content');
    expect(result.policy?.name).toBe('test_large_fixture');
    expect(result.violations.some(v => v.kind === 'forbidden')).toBe(true);
  });

  it('analyze() returns neverTouch:true for auth keys', () => {
    const HEYS = loadRegistry();
    const result = HEYS.storageRegistry.analyze('heys_supabase_auth_token', 'token-data');
    expect(result.neverTouch).toBe(true);
  });

  it('register() supports exact string + regex patterns', () => {
    const HEYS = loadRegistry();
    HEYS.storageRegistry.register('test_exact', {
      pattern: 'exact_name',
      scope: 'global', maxSize: 1024, maxAge: 0,
      cloudSync: 'never', pruneStrategy: 'wipe',
      description: 'test',
    });
    expect(HEYS.storageRegistry.match('exact_name')?.name).toBe('test_exact');
    // Exact-string registration is anchored ^...$ — suffix should NOT match.
    expect(HEYS.storageRegistry.match('exact_name_suffix')?.name).not.toBe('test_exact');
  });
});

describe('storage registry — diagnostics surface', () => {
  it('storageAudit() returns a snapshot with topKeys + unknownKeys', () => {
    const HEYS = loadRegistry();
    localStorage.setItem('test_large', 'X'.repeat(8 * 1024));
    localStorage.setItem('totally_unknown_key', 'something');

    const snap = HEYS.diagnostics.storageAudit({ redact: true, topN: 5 });
    expect(snap.totalKeys).toBeGreaterThanOrEqual(2);
    expect(snap.topKeys.length).toBeGreaterThanOrEqual(2);
    expect(snap.unknownKeys.some(k => k.key === 'totally_unknown_key')).toBe(true);
    expect(snap.policyViolations.some(v => v.key === 'test_large')).toBe(true);
  });

  it('storageAudit() redacts UUIDs in keys by default', () => {
    const HEYS = loadRegistry();
    localStorage.setItem('heys_12345678-aaaa-bbbb-cccc-1234567890ab_perf_log', 'data');
    const snap = HEYS.diagnostics.storageAudit({ redact: true });
    const k = snap.topKeys.find(k => /perf_log/.test(k.key));
    expect(k?.key).toContain('<cid>');
    expect(k?.key).not.toContain('12345678-aaaa');
  });

  it('storagePolicy(key) returns policy info for a single key', () => {
    const HEYS = loadRegistry();
    localStorage.setItem('test_large', 'X'.repeat(2 * 1024));
    const out = HEYS.diagnostics.storagePolicy('test_large');
    expect(out.policy).toBe('test_large_fixture');
    expect(out.violations.some(v => v.kind === 'forbidden')).toBe(true);
  });
});

describe('storage registry — Phase 2a shadow audit', () => {
  it('runAuditOnce() short-circuits in test-env by default', async () => {
    const HEYS = loadRegistry({ asTest: true });
    const r = await HEYS.storageRegistry.runAuditOnce();
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('test-env');
  });

  it('runAuditOnce({bypassIdle:true}) executes in test-env', async () => {
    const HEYS = loadRegistry({ asTest: true });
    localStorage.setItem('test_large', 'X'.repeat(4 * 1024));
    const r = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    expect(r.skipped).toBe(false);
    expect(Array.isArray(r.decisions)).toBe(true);
    expect(r.decisions.some(d => d.key === 'test_large' && d.action === 'wipe-proposed')).toBe(true);
    expect(r.snapshot.totalKeys).toBeGreaterThanOrEqual(1);
  });

  it('shadow mode does NOT mutate audited keys', async () => {
    const HEYS = loadRegistry({ asTest: true });
    const overSize = 'X'.repeat(100 * 1024);
    const cidKey = 'heys_12345678-aaaa-bbbb-cccc-1234567890ab_insights_feedback_default';
    localStorage.setItem(cidKey, overSize);

    const before = localStorage.getItem(cidKey);
    const r = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    const after = localStorage.getItem(cidKey);

    expect(before).toBe(after); // shadow: no mutation
    expect(r.decisions.some(d => d.key === cidKey && d.action === 'prune-proposed')).toBe(true);
  });

  it('writes proposals to heys_storage_audit_pending_v1', async () => {
    const HEYS = loadRegistry({ asTest: true });
    localStorage.setItem('test_large', 'X'.repeat(4 * 1024));
    await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    const pending = HEYS.diagnostics.storageAuditPending();
    expect(Array.isArray(pending)).toBe(true);
    expect(pending.some(d => d.key === 'test_large')).toBe(true);
  });

  it('writes a snapshot entry to heys_storage_audit_log_v1', async () => {
    const HEYS = loadRegistry({ asTest: true });
    localStorage.setItem('test_large', 'X'.repeat(2 * 1024));
    await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    const raw = localStorage.getItem('heys_storage_audit_log_v1');
    expect(raw).toBeTruthy();
    const log = JSON.parse(raw);
    expect(Array.isArray(log)).toBe(true);
    expect(log[log.length - 1].kind).toBe('snapshot');
    expect(log[log.length - 1].mode).toBe('shadow');
  });

  it('6h gate skips re-runs without force', async () => {
    const HEYS = loadRegistry({ asTest: true });
    localStorage.setItem('test_large', 'X'.repeat(2 * 1024));

    const r1 = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    expect(r1.skipped).toBe(false);

    const r2 = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    expect(r2.skipped).toBe(true);
    expect(r2.reason).toBe('6h-gate');
  });

  it('force:true bypasses 6h gate', async () => {
    const HEYS = loadRegistry({ asTest: true });
    localStorage.setItem('test_large', 'X'.repeat(2 * 1024));

    await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    const r2 = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true, force: true });
    expect(r2.skipped).toBe(false);
  });

  it('audit version mismatch invalidates 6h gate', async () => {
    const HEYS = loadRegistry({ asTest: true });
    localStorage.setItem('test_large', 'X'.repeat(2 * 1024));

    await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    // Simulate version bump: stored != current.
    localStorage.setItem('heys_storage_audit_version', 'old');

    const r2 = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    expect(r2.skipped).toBe(false);
  });

  it('disableForTesting() short-circuits even with bypassIdle', async () => {
    const HEYS = loadRegistry({ asTest: false }); // simulate prod-like
    HEYS.storageRegistry.disableForTesting();
    const r = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('disabled-for-testing');
  });

  it('proposes wipe-by-age for stale snapshot keys', async () => {
    const HEYS = loadRegistry({ asTest: true });
    // 91 days ago — past 90-day TTL.
    const stale = Date.now() - 91 * 86400 * 1000;
    const key = `heys_products_pre_overlay_${stale}`;
    localStorage.setItem(key, 'small');

    const r = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    expect(r.decisions.some(d => d.key === key && d.action === 'wipe-by-age-proposed')).toBe(true);
  });

  it('skips never-touch keys regardless of size', async () => {
    const HEYS = loadRegistry({ asTest: true });
    localStorage.setItem('heys_supabase_auth_token', 'X'.repeat(100 * 1024));
    const r = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    expect(r.decisions.some(d => d.key === 'heys_supabase_auth_token')).toBe(false);
  });

  it('runStorageAuditNow() forces a run + returns decisions', async () => {
    const HEYS = loadRegistry({ asTest: true });
    localStorage.setItem('test_large', 'X'.repeat(2 * 1024));
    const r = await HEYS.diagnostics.runStorageAuditNow({ bypassLock: true });
    expect(r.skipped).toBe(false);
    expect(r.decisions.some(d => d.key === 'test_large')).toBe(true);
  });
});

describe('storage registry — Phase 2b enforce mode', () => {
  it('enforce mode deletes forbidden key (test_large)', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    localStorage.setItem('test_large', 'forbidden-content');

    const r = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    expect(r.skipped).toBe(false);
    // Key should be gone.
    expect(localStorage.getItem('test_large')).toBeNull();
    // Decision marked as executed.
    const d = r.decisions.find(d => d.key === 'test_large');
    expect(d).toBeDefined();
    expect(d.mode).toBe('enforce');
    expect(d.executed).toBe(true);
  });

  it('audit log mode field is enforce in enforce mode', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    localStorage.setItem('test_large', 'x');
    await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    const raw = localStorage.getItem('heys_storage_audit_log_v1');
    const log = JSON.parse(raw);
    expect(log[log.length - 1].mode).toBe('enforce');
  });

  it('enforce mode saves deleted value to recycle bin', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    const original = 'important-content-' + 'X'.repeat(100);
    localStorage.setItem('test_large', original);

    await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });

    const binRaw = localStorage.getItem('heys_storage_audit_recycle_v1');
    expect(binRaw).toBeTruthy();
    const bin = JSON.parse(binRaw);
    const entry = bin.find(e => e.key === 'test_large');
    expect(entry).toBeDefined();
    expect(entry.value).toBe(original);
    expect(entry.valueTruncated).toBe(false);
  });

  it('restoreAuditDeletion() restores key from recycle bin', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    const original = 'restore-test-value';
    localStorage.setItem('test_large', original);

    await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    expect(localStorage.getItem('test_large')).toBeNull(); // deleted

    const result = HEYS.diagnostics.restoreAuditDeletion('test_large');
    expect(result.restored).toBe(true);
    expect(localStorage.getItem('test_large')).toBe(original); // restored
  });

  it('restoreAuditDeletion() returns not-in-recycle-bin for unknown key', () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    const result = HEYS.diagnostics.restoreAuditDeletion('totally_unknown_key');
    expect(result.restored).toBe(false);
    expect(result.reason).toBe('not-in-recycle-bin');
  });

  it('cleanup advisory flag is cleared after enforce run', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    localStorage.setItem('test_large', 'x');
    await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    // Flag should not be active (was set during run, cleared in finally block).
    expect(HEYS.storageRegistry.isCleanupActive()).toBe(false);
  });

  it('shadow mode does NOT delete key even when enforce flag missing', async () => {
    // enforceMode: false → shadow mode by default
    const HEYS = loadRegistry({ asTest: true, enforceMode: false });
    localStorage.setItem('test_large', 'shadow-no-delete');
    const r = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });
    expect(localStorage.getItem('test_large')).toBe('shadow-no-delete'); // untouched
    expect(r.decisions.some(d => d.key === 'test_large' && d.mode === 'shadow')).toBe(true);
  });

  it('cloudSync:merge keys go through _mergeAndPrune (Phase 5 Block B)', async () => {
    // In test env there is no YandexAPI, so _mergeAndPrune aborts with no-api.
    // The key must survive (abort = leave local untouched).
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    const cidKey = 'heys_12345678-aaaa-bbbb-cccc-1234567890ab_insights_feedback_default';
    const bigValue = 'X'.repeat(100 * 1024);
    localStorage.setItem(cidKey, bigValue);

    const r = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });

    // Key must survive — merge aborted (no-api in test env).
    expect(localStorage.getItem(cidKey)).toBe(bigValue);

    const d = r.decisions.find(d => d.key === cidKey);
    expect(d).toBeDefined();
    expect(d.action).toBe('merge-aborted');
    expect(d.reason).toBe('no-api');
    expect(d.executed).toBe(false);
    expect(d.mode).toBe('enforce');
  });

  it('enforce mode prunes oversize array value (oldest-first strategy)', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    const cidKey = 'heys_12345678-aaaa-bbbb-cccc-1234567890ab_advice_trace_day_v1';
    // advice_trace_day: maxSize 32KB, oldest-first. Build oversize array.
    const items = Array.from({ length: 500 }, (_, i) => ({ i, data: 'X'.repeat(200) }));
    const raw = JSON.stringify(items);
    localStorage.setItem(cidKey, raw);

    const r = await HEYS.storageRegistry.runAuditOnce({ bypassIdle: true, bypassLock: true });

    const d = r.decisions.find(d => d.key === cidKey);
    expect(d).toBeDefined();
    expect(d.executed).toBe(true);
    expect(d.action).toBe('prune-proposed');

    // Remaining value must be smaller than 32KB.
    const remaining = localStorage.getItem(cidKey);
    expect(remaining).not.toBeNull();
    const remainingBytes = (cidKey.length + remaining.length) * 2;
    expect(remainingBytes).toBeLessThanOrEqual(32 * 1024);
    // Should still be a valid array (oldest items dropped).
    const arr = JSON.parse(remaining);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 Block B — _mergeAndPrune cloud-merge paths.
// Uses HEYS.storageRegistry.mergeAndPruneKey (public wrapper) to drive
// _mergeAndPrune via the stored registry reference, so all abort paths and
// merge semantics are covered without calling _doAudit.
// ─────────────────────────────────────────────────────────────────────────────

const CID = '12345678-aaaa-bbbb-cccc-1234567890ab';
const FEEDBACK_KEY = `heys_${CID}_insights_feedback_${CID}`;
const HIDDEN_KEY = `heys_${CID}_hidden_products`;

function makeFeedbackRecord(id, ts, sv = 'v1.2') {
  return { id, timestamp: ts, schemaVersion: sv, scenario: 'test', score: 0.5, mealType: 'lunch', productIds: ['p1'] };
}

/** Wire a mock YandexAPI that returns the given cloud value for any select query. */
function wireYandexAPI(cloudValue) {
  const mockResult = { data: cloudValue !== null ? [{ v: cloudValue }] : [], error: null };
  globalThis.YandexAPI = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve(mockResult),
        }),
      }),
    }),
  };
}

function clearYandexAPI() {
  delete globalThis.YandexAPI;
  if (globalThis.HEYS) delete globalThis.HEYS.YandexAPI;
}

describe('Phase 5 Block B — _mergeAndPrune cloud-merge', () => {
  afterEach(() => clearYandexAPI());

  it('aborts with no-api when YandexAPI unavailable', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify([makeFeedbackRecord('r1', 1000)]));

    const result = await HEYS.storageRegistry.mergeAndPruneKey(FEEDBACK_KEY);
    expect(result.action).toBe('merge-aborted');
    expect(result.reason).toBe('no-api');
    expect(result.executed).toBe(false);
    // Local untouched.
    expect(localStorage.getItem(FEEDBACK_KEY)).not.toBeNull();
  });

  it('aborts with cloud-error when fetch returns an error', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify([makeFeedbackRecord('r1', 1000)]));
    globalThis.YandexAPI = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'Unauthorized' } }) }),
        }),
      }),
    };

    const result = await HEYS.storageRegistry.mergeAndPruneKey(FEEDBACK_KEY);
    expect(result.action).toBe('merge-aborted');
    expect(result.reason).toBe('cloud-error');
    expect(result.executed).toBe(false);
  });

  it('aborts with cloud-parse-failure when cloud v is not an array', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify([makeFeedbackRecord('r1', 1000)]));
    globalThis.YandexAPI = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => Promise.resolve({ data: [{ v: { not: 'an-array' } }], error: null }) }),
        }),
      }),
    };

    const result = await HEYS.storageRegistry.mergeAndPruneKey(FEEDBACK_KEY);
    expect(result.action).toBe('merge-aborted');
    expect(result.reason).toBe('cloud-parse-failure');
  });

  it('aborts with suspicious-zero when cloud returns [] but local has many records', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    // Local has 35 records (> FEEDBACK_MAX_HISTORY=30).
    const localRecs = Array.from({ length: 35 }, (_, i) => makeFeedbackRecord(`id_${i}`, i * 1000));
    globalThis.HEYS.store.get = (k, d) => (k === FEEDBACK_KEY ? localRecs : d);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(localRecs));
    // Cloud record exists but v is an empty array — suspicious (local has 35 records).
    globalThis.YandexAPI = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => Promise.resolve({ data: [{ v: [] }], error: null }) }),
        }),
      }),
    };

    const result = await HEYS.storageRegistry.mergeAndPruneKey(FEEDBACK_KEY);
    expect(result.action).toBe('merge-aborted');
    expect(result.reason).toBe('suspicious-zero');
    // Local untouched.
    expect(JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]').length).toBe(35);
  });

  it('merges feedback: union by id, prefer higher schemaVersion, trim to 30', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });

    const localRecs = [
      makeFeedbackRecord('shared_1', 2000, 'v1.0'), // will be overridden by cloud's v1.2
      makeFeedbackRecord('local_only', 3000, 'v1.2'),
    ];
    const cloudRecs = [
      makeFeedbackRecord('shared_1', 1000, 'v1.2'), // newer schema wins
      makeFeedbackRecord('cloud_only', 500, 'v1.2'),
    ];
    // Wire Store.get to return localRecs.
    globalThis.HEYS.store.get = (k, d) => (k === FEEDBACK_KEY ? localRecs : d);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(localRecs));
    wireYandexAPI(cloudRecs);

    let writtenKey = null;
    let writtenValue = null;
    globalThis.HEYS.store.set = (k, v) => { writtenKey = k; writtenValue = v; };

    const result = await HEYS.storageRegistry.mergeAndPruneKey(FEEDBACK_KEY);
    expect(result.action).toBe('merged');
    expect(result.executed).toBe(true);
    expect(writtenKey).toBe(FEEDBACK_KEY);

    const merged = writtenValue;
    expect(Array.isArray(merged)).toBe(true);
    // 3 unique IDs (shared_1 merged, local_only, cloud_only).
    expect(merged.length).toBe(3);
    // shared_1 should have schemaVersion v1.2 (from cloud).
    const shared = merged.find(r => r.id === 'shared_1');
    expect(shared?.schemaVersion).toBe('v1.2');
  });

  it('merged feedback is trimmed to FEEDBACK_MAX_HISTORY (30)', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });

    // 20 local + 20 cloud = 40 unique; should trim to 30.
    const localRecs = Array.from({ length: 20 }, (_, i) => makeFeedbackRecord(`loc_${i}`, (i + 100) * 1000));
    const cloudRecs = Array.from({ length: 20 }, (_, i) => makeFeedbackRecord(`cld_${i}`, i * 1000));
    globalThis.HEYS.store.get = (k, d) => (k === FEEDBACK_KEY ? localRecs : d);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(localRecs));
    wireYandexAPI(cloudRecs);

    let writtenValue = null;
    globalThis.HEYS.store.set = (k, v) => { writtenValue = v; };

    const result = await HEYS.storageRegistry.mergeAndPruneKey(FEEDBACK_KEY);
    expect(result.action).toBe('merged');
    expect(result.recordsBefore).toBe(20);
    expect(result.recordsAfter).toBe(30);
    expect(writtenValue.length).toBe(30);
  });

  it('merges hidden_products: union of ID strings', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });

    const localIds = ['prod_a', 'prod_b', 'prod_c'];
    const cloudIds = ['prod_b', 'prod_d']; // prod_b is duplicate
    globalThis.HEYS.store.get = (k, d) => (k === HIDDEN_KEY ? localIds : d);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(localIds));
    wireYandexAPI(cloudIds);

    let writtenValue = null;
    globalThis.HEYS.store.set = (k, v) => { writtenValue = v; };

    const result = await HEYS.storageRegistry.mergeAndPruneKey(HIDDEN_KEY);
    expect(result.action).toBe('merged');
    expect(Array.isArray(writtenValue)).toBe(true);
    // Union: prod_a, prod_b, prod_c, prod_d (4 unique).
    expect(writtenValue.length).toBe(4);
    expect(writtenValue).toContain('prod_a');
    expect(writtenValue).toContain('prod_d');
  });

  it('no-cloud-record (empty array) treats local as authoritative and still merges', async () => {
    // Cloud returns no rows (data: []) → cloudArr = [] → proceed with merge
    // Result: local records are preserved (union with empty cloud).
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    const localRecs = [makeFeedbackRecord('r1', 1000), makeFeedbackRecord('r2', 2000)];
    globalThis.HEYS.store.get = (k, d) => (k === FEEDBACK_KEY ? localRecs : d);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(localRecs));
    wireYandexAPI(null); // data: [] — no cloud record

    let writtenValue = null;
    globalThis.HEYS.store.set = (k, v) => { writtenValue = v; };

    const result = await HEYS.storageRegistry.mergeAndPruneKey(FEEDBACK_KEY);
    expect(result.action).toBe('merged');
    expect(writtenValue.length).toBe(2);
  });

  it('mergeAndPruneKey returns error for non-merge policy key', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    const result = await HEYS.storageRegistry.mergeAndPruneKey('test_large');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('cloudSync:merge');
  });

  it('merge decision is logged to heys_storage_audit_log_v1', async () => {
    const HEYS = loadRegistry({ asTest: true, enforceMode: true });
    const localRecs = [makeFeedbackRecord('r1', 1000)];
    globalThis.HEYS.store.get = (k, d) => (k === FEEDBACK_KEY ? localRecs : d);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(localRecs));
    wireYandexAPI([]);

    globalThis.HEYS.store.set = () => {};

    await HEYS.storageRegistry.mergeAndPruneKey(FEEDBACK_KEY);

    const rawLog = localStorage.getItem('heys_storage_audit_log_v1');
    expect(rawLog).toBeTruthy();
    const log = JSON.parse(rawLog);
    const entry = log.find(e => e.action === 'merged' || e.action === 'merge-aborted');
    expect(entry).toBeDefined();
    expect(entry.policy).toBe('insights_feedback');
  });
});
