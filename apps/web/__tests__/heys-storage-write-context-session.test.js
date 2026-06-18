import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;

function loadStorageModule() {
  for (const file of [
    '../heys_pending_queue_pure_v1.js',
    '../heys_sync_queue_runtime_pure_v1.js',
  ]) {
    eval(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
  }
  const storagePath = path.resolve(__dirname, '../heys_storage_supabase_v1.js');
  eval(fs.readFileSync(storagePath, 'utf8'));
}

describe('HEYS.cloud write-context session expiry', () => {
  beforeEach(() => {
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
    expect(storageSource).toMatch(/if \(isDayv2MergeKey\(it\.k\)\) \{\s+blockDayv2BatchFallback\(it\.k, result\.error\);\s+break;\s+\}\s+if \(isServerLacksMergeEndpoint/);
    expect(storageSource).toMatch(/if \(isDayv2MergeKey\(it\.k\)\) \{\s+blockDayv2BatchFallback\(it\.k, e\.message\);\s+break;\s+\}\s+console\.warn\('\[merge-save\] exception/);
  });
});
