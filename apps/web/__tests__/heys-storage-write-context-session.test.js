import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalWindow = global.window;
const originalDocument = global.document;
const originalDispatchEvent = window.dispatchEvent;
const originalNavigatorOnlineDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

function loadStorageModule() {
  if (typeof window.addEventListener !== 'function') window.addEventListener = vi.fn();
  if (typeof window.removeEventListener !== 'function') window.removeEventListener = vi.fn();
  if (typeof global.addEventListener !== 'function') global.addEventListener = window.addEventListener;
  if (typeof global.removeEventListener !== 'function') global.removeEventListener = window.removeEventListener;
  for (const file of [
    '../heys_pending_queue_pure_v1.js',
    '../heys_sync_queue_runtime_pure_v1.js',
    '../heys_write_context_health_v1.js',
  ]) {
    eval(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
  }
  const storagePath = path.resolve(__dirname, '../heys_storage_supabase_v1.js');
  eval(fs.readFileSync(storagePath, 'utf8'));
}

function restoreDispatchEventPatch() {
  try {
    window.dispatchEvent = originalDispatchEvent;
    delete window.__heysDispatchPatched;
  } catch (_) { /* noop */ }
}

afterEach(() => {
  restoreDispatchEventPatch();
});

describe('HEYS.cloud write-context session expiry', () => {
  beforeEach(() => {
    global.window = originalWindow;
    global.document = originalWindow.document;
    restoreDispatchEventPatch();
    localStorage.clear();
    localStorage.setItem('heys_pin_auth_client', 'client-1');
    localStorage.setItem('heys_client_current', 'client-1');
    window.HEYS = {
      YandexAPI: {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 401,
            message: 'invalid_session',
            raw: { reason: 'missing_session_token' },
          },
        }),
      },
      auth: {
        logout: vi.fn().mockResolvedValue({ ok: true }),
      },
      cloud: {},
    };
    vi.spyOn(window, 'dispatchEvent');
    loadStorageModule();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreDispatchEventPatch();
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  it('dispatches session-expired when cookie-only PIN write-context issue returns invalid_session', async () => {
    window.HEYS.cloud.setPinAuthClient('client-1');

    const result = await window.HEYS.cloud._issueWriteContext('client-1');

    expect(result).toBe(null);
    expect(window.HEYS.YandexAPI.rpc).toHaveBeenCalledWith('issue_write_context_by_session', {});
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'heys:session-expired',
      detail: expect.objectContaining({
        source: 'write_context_issue',
      }),
    }));
    const sessionExpiredEvent = window.dispatchEvent.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === 'heys:session-expired');
    expect(sessionExpiredEvent.detail).toEqual(expect.objectContaining({
      source: 'write_context_issue',
      error: expect.stringContaining('invalid_session'),
    }));
  });

  it('exposes localStorage top keys and pending payload in quota diagnostics', () => {
    localStorage.setItem('heys_big_diag_key', 'x'.repeat(4096));
    localStorage.setItem('heys_pending_client_sync_queue', JSON.stringify([
      { k: 'heys_hunger_energy_status_events_v1', v: { payload: 'y'.repeat(512) } },
    ]));

    const diag = window.HEYS.cloud.getStorageQuotaDiag({ topN: 3 });

    expect(diag.totalSizeBytes).toBeGreaterThan(0);
    expect(diag.topKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'heys_big_diag_key', bytes: 8192 }),
    ]));
    expect(diag.pending.queue).toEqual(expect.arrayContaining([
      expect.objectContaining({ k: 'heys_hunger_energy_status_events_v1', vKind: 'object' }),
    ]));
  });
});

describe('HEYS.cloud dayv2 merge-save fallback contract', () => {
  it('keeps dayv2 pending instead of falling back to unsafe batch upsert when merge-save fails', () => {
    const storageSource = fs.readFileSync(
      path.resolve(__dirname, '../heys_storage_supabase_v1.js'),
      'utf8',
    );

    expect(storageSource).toContain('const isDayv2MergeKey = (k) => /^heys_dayv2_\\d{4}-\\d{2}-\\d{2}$/.test(String(k || \'\'));');
    expect(storageSource).toContain('blockDayv2BatchFallback(it.k, result.error);');
    expect(storageSource).toContain('blockDayv2BatchFallback(it.k, e.message);');
    expect(storageSource).toContain('return { success: false, error: mergeAbortError, saved: mergeSavedCount };');
    expect(storageSource).toContain("console.warn('[merge-save] subscription_required for', it.k, '— dropping denied pending write');");
    expect(storageSource).toContain('subscription_rejected: subscriptionRejectedKeys');
    expect(storageSource).toContain('if (isDayv2MergeKey(it.k) && isSubscriptionRequiredError(result.error))');
    expect(storageSource).toContain('if (isDayv2MergeKey(it.k) && isSubscriptionRequiredError(e.message))');
  });
});

describe('HEYS.cloud 413 single-item fallback contract', () => {
  it('does not store array-shaped KV values as compressed scalar strings', () => {
    const storageSource = fs.readFileSync(
      path.resolve(__dirname, '../heys_storage_supabase_v1.js'),
      'utf8',
    );

    expect(storageSource).toContain('const canStoreCompressedScalar = !Array.isArray(it.v);');
    expect(storageSource).toContain("if (Store && typeof it.v === 'object' && it.v !== null && canStoreCompressedScalar)");
    expect(storageSource).toContain('const one = await YandexAPI.saveKV(clientId, it.k, value, it._ctx || null);');
    expect(storageSource).toContain('const sk = await YandexAPI.saveKV(clientId, it.k, it.v, it._ctx || null);');
    expect(storageSource).not.toContain('const canStoreCompressedScalar = !isProductsFamilyRpcKey(it.k) && !isOverlayFamilyRpcKey(it.k);');
  });
});

describe('HEYS.cloud write-context unavailable UX contract', () => {
  it('treats temporary write-context loss as a background retry instead of a blocking sync error', () => {
    const storageSource = fs.readFileSync(
      path.resolve(__dirname, '../heys_storage_supabase_v1.js'),
      'utf8',
    );
    const appHooksSource = fs.readFileSync(
      path.resolve(__dirname, '../heys_app_hooks_v1.js'),
      'utf8',
    );
    const writeContextHealthSource = fs.readFileSync(
      path.resolve(__dirname, '../heys_write_context_health_v1.js'),
      'utf8',
    );

    expect(storageSource).toContain("error: 'write_context_unavailable'");
    expect(storageSource).toContain('HEYS.WriteContextHealth.createUnavailableEventDetail({ reason, retryIn: 0 })');
    expect(writeContextHealthSource).toContain("KIND_TRANSIENT_SYNC = 'transient_sync'");
    expect(writeContextHealthSource).toContain("severity: 'background'");
    expect(writeContextHealthSource).toContain('transient: true');
    expect(writeContextHealthSource).toContain('background: true');
    expect(storageSource).toContain('function scheduleWriteContextRetry(clientId, reason)');
    expect(writeContextHealthSource).toContain("'_writeContextBackgroundRetryScheduled'");
    expect(writeContextHealthSource).toContain("'_writeContextBackgroundRetryAttempts'");
    expect(writeContextHealthSource).toContain("'write_context_retry_' + phase");
    expect(storageSource).toContain("HEYS.WriteContextHealth?.markRetryPhase?.('scheduled'");
    expect(storageSource).toContain("HEYS.WriteContextHealth?.markRetryPhase?.('attempt'");
    expect(storageSource).toContain("addSyncLogEntry(isWriteContextError ? 'upload_deferred' : 'upload_error'");
    expect(storageSource).toContain("scheduleWriteContextRetry(Object.keys(byClientId)[0], 'upload_write_context_unavailable')");
    expect(storageSource).toContain("cloud.ensureWriteContextFresh(null, { reason: 'online', retryPending: false })");
    expect(storageSource).toContain("cloud.ensureWriteContextFresh(null, { reason: 'visibility-visible', retryPending: false })");
    expect(storageSource).toContain("cloud.ensureWriteContextFresh(null, { reason: 'window-focus', retryPending: false })");
    expect(storageSource).toContain("cloud.ensureWriteContextFresh(null, { reason: 'pageshow', retryPending: false })");
    expect(storageSource).toContain('function recoverStalledClientUpload(reason, options = {})');
    expect(storageSource).toContain("recoverStalledClientUpload('flush'");
    expect(storageSource).toContain("recoverStalledClientUpload('online')");
    expect(storageSource).toContain("recoverStalledClientUpload('window-focus')");
    expect(storageSource).toContain('uploadRunId !== _clientUploadRunId');
    expect(storageSource).toContain('const WRITE_CONTEXT_ISSUE_TIMEOUT_MS = 15000;');
    expect(storageSource).toContain('cloud.getWriteContextDiag = function ()');
    expect(storageSource).toContain("phase: 'timeout'");
    expect(storageSource).toContain("phase: 'ready'");

    const branchStart = appHooksSource.indexOf('const isTransientWriteContext');
    const branchEnd = appHooksSource.indexOf('// 🔥 Если ошибка критическая', branchStart);
    const writeContextBranch = appHooksSource.slice(branchStart, branchEnd);
    expect(branchStart).toBeGreaterThan(-1);
    expect(writeContextBranch).toContain('enterBackgroundPendingSync();');
    expect(writeContextBranch).toContain('setRetryCountdown(0);');
    expect(writeContextBranch).not.toContain('Toast');
    expect(appHooksSource).toContain("const eventKind = e.detail?.kind || (isPersistent ? 'blocking_error' : 'sync_error')");
    expect(appHooksSource).toContain('window.HEYS.WriteContextHealth.isTransientUnavailable(e.detail)');
    expect(appHooksSource).toContain('const shouldUseBlockingSyncOverlay = useCallback');
    expect(appHooksSource).toContain('shouldUseBlockingSyncOverlay() && syncingStartRef.current');
  });
});

describe('HEYS.cloud write-context unavailable upload behavior', () => {
  beforeEach(() => {
    global.window = originalWindow;
    global.document = originalWindow.document;
    restoreDispatchEventPatch();
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('heys_pin_auth_client', 'client-1');
    localStorage.setItem('heys_client_current', 'client-1');
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => true,
    });
    window.HEYS = {
      currentClientId: 'client-1',
      YandexAPI: {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'temporary', message: 'temporary write-context miss' },
        }),
      },
      Toast: {
        error: vi.fn(),
      },
      cloud: {},
    };
    vi.spyOn(window, 'dispatchEvent');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loadStorageModule();
    window.HEYS.cloud.setPinAuthClient('client-1');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreDispatchEventPatch();
    localStorage.clear();
    if (originalNavigatorOnlineDescriptor) {
      Object.defineProperty(Navigator.prototype, 'onLine', originalNavigatorOnlineDescriptor);
    }
    window.HEYS = originalHEYS;
  });

  it('keeps a local save queued and emits a transient background event when write-context is temporarily unavailable', async () => {
    window.HEYS.cloud.saveClientKey('client-1', 'heys_wake_note', { text: 'local first' });

    expect(window.HEYS.cloud.getPendingCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(600);

    expect(window.HEYS.YandexAPI.rpc).toHaveBeenCalledWith('issue_write_context_by_session', {});
    expect(window.HEYS.cloud.getPendingCount()).toBe(1);
    expect(window.HEYS.Toast.error).not.toHaveBeenCalled();
    expect(window.HEYS._writeContextBackgroundRetryScheduled).toBe(1);

    const syncErrorEvent = window.dispatchEvent.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === 'heys:sync-error'
        && event.detail?.error === 'write_context_unavailable');
    expect(syncErrorEvent.detail).toEqual(expect.objectContaining({
      error: 'write_context_unavailable',
      persistent: false,
      kind: 'transient_sync',
      severity: 'background',
      transient: true,
      background: true,
    }));
  });
});
