import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalDEV = window.DEV;
const originalLocalStorage = window.localStorage;

const modulePath = path.resolve(__dirname, '../heys_app_auth_init_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

function createMockStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: vi.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach((key) => delete store[key]); }),
    _store: store,
  };
}

function loadAppAuthInit() {
  eval(moduleSource);
  return window.HEYS.AppAuthInit;
}

async function flushPromises() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

describe('HEYS.AppAuthInit session restore', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.navigator, 'onLine', {
      value: true,
      configurable: true,
    });
    window.DEV = { log: vi.fn(), warn: vi.fn() };
    window.HEYS = {
      products: { getAll: vi.fn(() => []) },
      YandexAPI: {
        verifyCuratorToken: vi.fn().mockResolvedValue({
          data: {
            valid: true,
            user: { id: 'curator-1', email: 'curator@example.com', role: 'curator' },
          },
          error: null,
        }),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    window.HEYS = originalHEYS;
    window.DEV = originalDEV;
  });

  it('restores cookie-only curator sessions into the cloud auth runtime', async () => {
    const setAuthUser = vi.fn();
    const setCloudUser = vi.fn();
    const setStatus = vi.fn();
    const setIsInitializing = vi.fn();
    const cloud = { setAuthUser };
    const appAuthInit = loadAppAuthInit();

    appAuthInit.runAuthInit({
      U: { lsGet: vi.fn((_, fallback) => fallback) },
      cloud,
      setProducts: vi.fn(),
      setClients: vi.fn(),
      setClientsSource: vi.fn(),
      setClientId: vi.fn(),
      setSyncVer: vi.fn((fn) => fn(0)),
      setEmail: vi.fn(),
      setCloudUser,
      setStatus,
      setIsInitializing,
    });

    await flushPromises();

    const restoredUser = { id: 'curator-1', email: 'curator@example.com', role: 'curator' };
    expect(window.HEYS.YandexAPI.verifyCuratorToken).toHaveBeenCalledWith();
    expect(setCloudUser).toHaveBeenCalledWith(restoredUser);
    expect(setAuthUser).toHaveBeenCalledWith(restoredUser);
    expect(setStatus).toHaveBeenCalledWith('online');
    expect(setIsInitializing).toHaveBeenCalledWith(false);
  });

  it('clears invalid cookie-only PIN sessions before falling back to login', async () => {
    window.HEYS.YandexAPI.getCurrentClientBySession = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 401, message: 'invalid_session' },
    });
    window.HEYS.YandexAPI.clientLogout = vi.fn().mockResolvedValue({ ok: true });
    window.HEYS.YandexAPI.verifyCuratorToken = vi.fn().mockResolvedValue({
      data: { valid: false },
      error: { code: 400, message: 'Token required' },
    });

    const setStatus = vi.fn();
    const setClientId = vi.fn();
    const setIsInitializing = vi.fn();
    const appAuthInit = loadAppAuthInit();

    appAuthInit.runAuthInit({
      U: { lsGet: vi.fn((_, fallback) => fallback) },
      cloud: {},
      setProducts: vi.fn(),
      setClients: vi.fn(),
      setClientsSource: vi.fn(),
      setClientId,
      setSyncVer: vi.fn((fn) => fn(0)),
      setEmail: vi.fn(),
      setCloudUser: vi.fn(),
      setStatus,
      setIsInitializing,
    });

    await flushPromises();

    expect(window.HEYS.YandexAPI.getCurrentClientBySession).toHaveBeenCalledWith();
    await vi.waitFor(() => {
      expect(window.HEYS.YandexAPI.clientLogout).toHaveBeenCalledWith();
    });
    expect(storage.removeItem).toHaveBeenCalledWith('heys_pin_auth_client');
    expect(storage.removeItem).toHaveBeenCalledWith('heys_client_current');
    expect(setClientId).toHaveBeenCalledWith(null);
    expect(setStatus).toHaveBeenCalledWith('offline');
    expect(setIsInitializing).toHaveBeenCalledWith(false);
  });
});
