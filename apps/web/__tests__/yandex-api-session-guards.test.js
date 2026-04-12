// @vitest-environment node

import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalWindow = global.window;
const originalLocalStorage = global.localStorage;
const originalFetch = global.fetch;
const originalHEYS = global.HEYS;
const originalYandexAPI = global.YandexAPI;
const originalLogControl = global.__heysLogControl;

const modulePath = path.resolve(__dirname, '../heys_yandex_api_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

function createMockStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    _store: store,
  };
}

function createJsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function loadYandexAPI({
  storageSeed = {},
  sessionToken = null,
} = {}) {
  global.window = global;
  global.localStorage = createMockStorage(storageSeed);
  global.fetch = vi.fn();
  global.__heysLogControl = { isEnabled: () => false };
  global.HEYS = {
    auth: {
      getSessionToken: vi.fn(() => sessionToken),
    },
  };
  delete global.YandexAPI;

  eval(moduleSource);

  return global.HEYS.YandexAPI;
}

describe('HEYS.YandexAPI session-safe access', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
    global.fetch = originalFetch;
    global.HEYS = originalHEYS;
    global.YandexAPI = originalYandexAPI;
    global.__heysLogControl = originalLogControl;
  });

  it('saveKV sends p_session_token via session-safe RPC when token exists', async () => {
    const api = loadYandexAPI({ sessionToken: 'session-123' });
    global.fetch.mockResolvedValue(
      createJsonResponse({ success: true }),
    );

    const result = await api.saveKV('ignored-client', 'heys_profile', { calories: 1800 });

    expect(result).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/rpc?fn=upsert_client_kv_by_session');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
    });

    expect(JSON.parse(options.body)).toEqual({
      p_session_token: 'session-123',
      p_key: 'heys_profile',
      p_value: { calories: 1800 },
    });
  });

  it('saveKV does not call network when session token is missing', async () => {
    const api = loadYandexAPI();

    const result = await api.saveKV('ignored-client', 'heys_profile', { calories: 1800 });

    expect(result).toEqual({ success: false, error: 'No session token' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('migrates namespaced session token before protected KV RPC', async () => {
    const api = loadYandexAPI({
      storageSeed: {
        heys_pin_auth_client: 'client-42',
        'heys_client-42_session_token': '"namespaced-token"',
      },
    });
    global.fetch.mockResolvedValue(
      createJsonResponse({ success: true }),
    );

    const result = await api.saveKV('ignored-client', 'heys_dayv2_2026-04-12', { meals: [] });

    expect(result).toEqual({ success: true });
    expect(global.localStorage.setItem).toHaveBeenCalledWith(
      'heys_session_token',
      '"namespaced-token"',
    );
    expect(global.localStorage.removeItem).toHaveBeenCalledWith(
      'heys_client-42_session_token',
    );

    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body).p_session_token).toBe('namespaced-token');
  });

  it('getAllKV falls back to curator JWT path when no session token exists', async () => {
    const api = loadYandexAPI({
      storageSeed: {
        heys_curator_session: 'curator-jwt-1',
      },
    });
    global.fetch.mockResolvedValue(
      createJsonResponse({
        data: [{ k: 'heys_profile', v: { targetKcal: 1800 } }],
      }),
    );

    const result = await api.getAllKV('client-42');

    expect(result).toEqual({
      data: [{ k: 'heys_profile', v: { targetKcal: 1800 } }],
      error: null,
      delta: false,
    });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.heyslab.ru/auth/clients/client-42/kv');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer curator-jwt-1',
    });
  });

  it('preserves auth error from curator fallback instead of masking it as network error', async () => {
    const api = loadYandexAPI({
      storageSeed: {
        heys_curator_session: 'curator-jwt-1',
      },
    });
    global.fetch.mockResolvedValue(
      createJsonResponse(
        { error: 'Unauthorized' },
        { ok: false, status: 401 },
      ),
    );

    const result = await api.getAllKV('client-42');

    expect(result).toEqual({
      data: [],
      error: 'Unauthorized',
    });
  });
});
