// @vitest-environment node

import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const modulePath = path.resolve(__dirname, '../heys_yandex_api_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const storageSource = fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8');

const originalWindow = global.window;
const originalLocalStorage = global.localStorage;
const originalFetch = global.fetch;
const originalHEYS = global.HEYS;
const originalYandexAPI = global.YandexAPI;
const originalLogControl = global.__heysLogControl;
const originalLocation = global.location;

function createMockStorage() {
  const store = {};
  return {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
  };
}

function createJsonResponse(body, { status = 200, retryAfter = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: vi.fn((name) => (name === 'Retry-After' ? retryAfter : null)),
    },
    json: vi.fn().mockResolvedValue(body),
  };
}

function loadYandexAPI({ sessionToken = null } = {}) {
  global.window = global;
  delete global.location;
  global.localStorage = createMockStorage();
  global.fetch = vi.fn();
  global.__heysLogControl = { isEnabled: () => false };
  global.HEYS = {
    auth: { getSessionToken: vi.fn(() => sessionToken) },
    cloud: {
      isPinAuthClient: vi.fn(() => false),
      getUser: vi.fn(() => null),
    },
  };
  delete global.YandexAPI;

  eval(moduleSource);
  return global.HEYS.YandexAPI;
}

async function resolveAllRequests(resolvers, expectedCount) {
  for (let index = 0; index < expectedCount; index += 1) {
    await vi.waitFor(() => expect(resolvers.length).toBeGreaterThan(index));
    resolvers[index](createJsonResponse({ success: true, items: [] }));
  }
}

describe('HEYS.YandexAPI shared request backpressure', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
    global.fetch = originalFetch;
    global.HEYS = originalHEYS;
    global.YandexAPI = originalYandexAPI;
    global.__heysLogControl = originalLogControl;
    if (typeof originalLocation === 'undefined') delete global.location;
    else global.location = originalLocation;
  });

  it('caps all simultaneous RPC attempts at three', async () => {
    const api = loadYandexAPI();
    const resolvers = [];
    global.fetch.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));

    const calls = Array.from({ length: 7 }, (_, index) => api.rpc(`read_${index}`, {}));

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(api._debug().requests).toMatchObject({ inFlight: 3, queued: 4, maxConcurrency: 3 });

    await resolveAllRequests(resolvers, 7);
    await Promise.all(calls);
    expect(global.fetch).toHaveBeenCalledTimes(7);
    expect(api._debug().requests).toMatchObject({ inFlight: 0, queued: 0 });
  });

  it('lets Phase A batch reads overtake queued normal requests', async () => {
    const api = loadYandexAPI({ sessionToken: 'session-123' });
    const resolvers = [];
    global.fetch.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));

    const normalCalls = Array.from({ length: 5 }, (_, index) => api.rpc(`normal_${index}`, {}));
    const phaseACall = api.getKVBatch('client-1', ['heys_profile', 'heys_dayv2_2026-07-22']);

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    resolvers[0](createJsonResponse({ success: true }));
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));

    expect(global.fetch.mock.calls[3][0]).toContain('/rpc?fn=batch_get_client_kv_by_session');

    await resolveAllRequests(resolvers, 6);
    await Promise.all([...normalCalls, phaseACall]);
  });

  it('honors Retry-After for 429 before sending the next attempt', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const api = loadYandexAPI();
    global.fetch
      .mockResolvedValueOnce(createJsonResponse({ error: 'quota' }, { status: 429, retryAfter: '2' }))
      .mockResolvedValueOnce(createJsonResponse({ success: true }));

    const call = api.rpc('normal_read', {});
    await vi.advanceTimersByTimeAsync(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(api._debug().requests.backoffReason).toBe('http_429');

    await vi.advanceTimersByTimeAsync(1999);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(call).resolves.toEqual({ data: { success: true }, error: null });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(api._debug().requests.backoffReason).toBeNull();
  });

  it('does not drain a queued startup burst after immediate network failures', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const api = loadYandexAPI();
    global.fetch
      .mockRejectedValueOnce(new Error('Load failed'))
      .mockRejectedValueOnce(new Error('Load failed'))
      .mockRejectedValueOnce(new Error('Load failed'))
      .mockResolvedValue(createJsonResponse({ success: true }));

    const calls = Array.from({ length: 8 }, (_, index) => api.rpc(`startup_${index}`, {}));
    await vi.advanceTimersByTimeAsync(0);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(api._debug().requests).toMatchObject({ queued: 5, backoffReason: 'network' });

    await vi.advanceTimersByTimeAsync(7999);
    expect(global.fetch).toHaveBeenCalledTimes(3);

    await vi.runAllTimersAsync();
    await expect(Promise.all(calls)).resolves.toHaveLength(8);
    expect(global.fetch).toHaveBeenCalledTimes(11);
    expect(api._debug().requests).toMatchObject({ inFlight: 0, queued: 0, backoffReason: null });
  });

  it('routes API recovery back into foreground sync when navigator stays online', () => {
    expect(moduleSource).toContain("new global.CustomEvent('heys:api-recovered'");
    expect(storageSource).toContain("addEventListener('heys:api-recovered'");
    expect(storageSource).toContain("requestForegroundAutoSync('api-recovered', { minGapMs: 0 })");
  });
});
