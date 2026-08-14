/**
 * Quota meter in heys_storage_layer_v1.js: 95% emergency audit must call
 * runAuditOnce / runStorageAuditNow, not the phantom runStorageAuditOnce.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LAYER_SRC = readFileSync(
  resolve(__dirname, '../heys_storage_layer_v1.js'),
  'utf8',
);

function makeLocalStorageShim() {
  let store = Object.create(null);
  return {
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
}

let _savedLocalStorage = null;

function loadLayer() {
  delete globalThis.HEYS;
  globalThis.HEYS = { currentClientId: '' };
  new Function('window', 'global', LAYER_SRC)(globalThis, globalThis);
  return globalThis.HEYS;
}

beforeEach(() => {
  _savedLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeLocalStorageShim(),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  delete globalThis.HEYS;
  if (_savedLocalStorage !== null) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: _savedLocalStorage,
      configurable: true,
      writable: true,
    });
    _savedLocalStorage = null;
  }
});

describe('storage layer quota meter', () => {
  it('does not call the phantom runStorageAuditOnce API', () => {
    expect(LAYER_SRC).not.toContain('runStorageAuditOnce');
    expect(LAYER_SRC).toContain('runAuditOnce');
    expect(LAYER_SRC).toContain('runStorageAuditNow');
  });

  it('triggers runStorageAuditNow at 95% budget, then recoverable cleanup if still full', async () => {
    const HEYS = loadLayer();
    const runNow = vi.fn(async () => ({ skipped: false, decisions: [] }));
    const cleanupRecoverableStorage = vi.fn(() => {
      localStorage.removeItem('pad');
    });
    const cleanupStorage = vi.fn();
    HEYS.diagnostics = { runStorageAuditNow: runNow };
    HEYS.storageRegistry = { runAuditOnce: vi.fn() };
    HEYS.cloud = { cleanupRecoverableStorage, cleanupStorage };

    localStorage.setItem('pad', 'x'.repeat(2.2 * 1024 * 1024));

    for (let i = 0; i < 50; i++) {
      HEYS.store.set(`heys_quota_probe_${i}`, i);
    }

    expect(runNow).toHaveBeenCalledTimes(1);
    expect(runNow.mock.calls[0][0]).toMatchObject({
      force: true,
      bypassIdle: true,
    });
    expect(HEYS.storageRegistry.runAuditOnce).not.toHaveBeenCalled();

    await Promise.resolve();
    await Promise.resolve();

    expect(cleanupRecoverableStorage).toHaveBeenCalled();
    expect(cleanupStorage).toHaveBeenCalledWith(30);
  });
});
