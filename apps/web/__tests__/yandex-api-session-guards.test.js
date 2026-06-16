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
const originalLocation = global.location;

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
  hasPinCookieSession = false,
  hostname = null,
  cloudUser = null,
} = {}) {
  global.window = global;
  if (hostname) {
    global.location = { hostname };
  } else {
    delete global.location;
  }
  global.localStorage = createMockStorage(storageSeed);
  global.fetch = vi.fn();
  global.__heysLogControl = { isEnabled: () => false };
  global.HEYS = {
    auth: {
      getSessionToken: vi.fn(() => sessionToken),
    },
    cloud: {
      isPinAuthClient: vi.fn(() => hasPinCookieSession),
      getUser: vi.fn(() => cloudUser),
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
    if (typeof originalLocation === 'undefined') {
      delete global.location;
    } else {
      global.location = originalLocation;
    }
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
      p_context_id: null,
    });
  });

  it('saveKV does not call network when no curator token, no session token, and no PIN cookie session', async () => {
    const api = loadYandexAPI();

    const result = await api.saveKV('ignored-client', 'heys_profile', { calories: 1800 });

    // PR-C cookie-only update: error message reflects all three auth paths
    // (curator JWT / LS session token / cookie session). buildSessionRpcParams
    // returns ok:false only when none of them are present.
    expect(result).toEqual({
      success: false,
      error: 'No auth token (neither curator nor session)',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('saveKV does not infer a cookie session from production hostname alone', async () => {
    const api = loadYandexAPI({ hostname: 'app.heyslab.ru' });

    const result = await api.saveKV('ignored-client', 'heys_profile', { calories: 1800 });

    expect(result).toEqual({
      success: false,
      error: 'No auth token (neither curator nor session)',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('saveKV uses cookie session RPC when the PIN cookie session hint exists', async () => {
    const api = loadYandexAPI({
      hostname: 'app.heyslab.ru',
      storageSeed: {
        heys_pin_cookie_session_hint: '1',
      },
    });
    global.fetch.mockResolvedValue(
      createJsonResponse({ success: true }),
    );

    const result = await api.saveKV('ignored-client', 'heys_profile', { calories: 1800 });

    expect(result).toEqual({ success: true });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/rpc?fn=upsert_client_kv_by_session');
    expect(JSON.parse(options.body)).toEqual({
      p_key: 'heys_profile',
      p_value: { calories: 1800 },
      p_context_id: null,
    });
  });

  it('reads legacy namespaced session token for protected KV RPC (one-shot, не мигрирует в LS)', async () => {
    // PR-C (d94ebfc9, 2026-05-20) умышленно убрал migration namespaced→global,
    // чтобы XSS-доступный LS-key не появлялся в JS снова. Legacy namespaced
    // токен читается из LS, удаляется (cleanup), и подставляется в body RPC
    // для одного запроса. Cookie carrier для post-PR-C сессий обходит этот
    // путь полностью.
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
    // Namespaced key consumed and removed — no migration to global LS key.
    expect(global.localStorage.removeItem).toHaveBeenCalledWith(
      'heys_client-42_session_token',
    );
    expect(global.localStorage.setItem).not.toHaveBeenCalledWith(
      'heys_session_token',
      expect.anything(),
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

  it('REST reads include cookie credentials for HttpOnly PIN sessions', async () => {
    const api = loadYandexAPI({ hasPinCookieSession: true });
    global.fetch.mockResolvedValue(
      createJsonResponse([{ k: 'heys_profile', v: { targetKcal: 1800 } }]),
    );

    const result = await api.rest('client_kv_store', {
      select: 'k,v',
      filters: {
        'eq.client_id': 'client-42',
        'eq.k': 'heys_profile',
      },
    });

    expect(result.error).toBeNull();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/rest/client_kv_store?');
    expect(options.credentials).toBe('include');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
    expect(options.headers).not.toHaveProperty('X-Session-Token');
    expect(options.headers).not.toHaveProperty('Authorization');
  });

  it('getCurrentClientBySession probes cookie-only session without a JS-readable token', async () => {
    const api = loadYandexAPI();
    global.fetch.mockResolvedValue(
      createJsonResponse({
        success: true,
        client_id: 'client-cookie-1',
        data: { name: 'Cookie Client' },
      }),
    );

    const result = await api.getCurrentClientBySession();

    expect(result).toEqual({
      data: {
        id: 'client-cookie-1',
        name: 'Cookie Client',
        raw: {
          success: true,
          client_id: 'client-cookie-1',
          data: { name: 'Cookie Client' },
        },
      },
      error: null,
    });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/rpc?fn=get_client_data_by_session');
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body)).toEqual({});
  });

  it('createPayment can use HttpOnly cookie-only PIN session on production host', async () => {
    const api = loadYandexAPI({
      hostname: 'app.heyslab.ru',
      storageSeed: { heys_pin_cookie_session_hint: '1' },
    });
    global.fetch.mockResolvedValue(
      createJsonResponse({
        paymentId: 'payment-cookie-1',
        confirmationUrl: 'https://yookassa.example/confirm',
      }),
    );

    const result = await api.createPayment(
      'client-cookie-1',
      'pro',
      'https://app.heyslab.ru/payment-result?clientId=client-cookie-1',
    );

    expect(result.error).toBeNull();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.heyslab.ru/payments/create');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(options.body)).toEqual({
      clientId: 'client-cookie-1',
      plan: 'pro',
      returnUrl: 'https://app.heyslab.ru/payment-result?clientId=client-cookie-1',
    });
  });

  it('getPaymentStatus can use HttpOnly cookie-only PIN session on production host', async () => {
    const api = loadYandexAPI({
      hostname: 'app.heyslab.ru',
      storageSeed: { heys_pin_cookie_session_hint: '1' },
    });
    global.fetch.mockResolvedValue(
      createJsonResponse({
        status: 'succeeded',
        paid: true,
        amount: 4990,
      }),
    );

    const result = await api.getPaymentStatus('payment-cookie-1', 'client-cookie-1');

    expect(result.error).toBeNull();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/payments/status?paymentId=payment-cookie-1&clientId=client-cookie-1');
    expect(options.method).toBe('GET');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('logConsentsBySession can use HttpOnly cookie-only PIN session', async () => {
    const api = loadYandexAPI({
      hostname: 'app.heyslab.ru',
      storageSeed: { heys_pin_cookie_session_hint: '1' },
    });
    global.fetch.mockResolvedValue(createJsonResponse({ success: true }));

    const result = await api.logConsentsBySession([
      { type: 'personal_data', version: '1.0', granted: true },
    ], 'test-agent');

    expect(result.error).toBeNull();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/rpc?fn=log_consents_by_session');
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body)).toEqual({
      p_consents: JSON.stringify([
        { type: 'personal_data', version: '1.0', granted: true },
      ]),
      p_ip: null,
      p_user_agent: 'test-agent',
    });
  });

  it('curator changelog client RPC can use HttpOnly cookie-only PIN session', async () => {
    const api = loadYandexAPI({
      hostname: 'app.heyslab.ru',
      storageSeed: { heys_pin_cookie_session_hint: '1' },
    });
    global.fetch.mockResolvedValue(createJsonResponse({
      ok: true,
      since: '2026-06-16T00:00:00.000Z',
      entries: [],
    }));

    const result = await api.getMyCuratorChangelogSince(null);

    expect(result).toEqual({
      ok: true,
      since: '2026-06-16T00:00:00.000Z',
      entries: [],
    });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/rpc?fn=get_my_curator_changelog_since');
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body)).toEqual({ p_since: null });
  });

  it('curator-only RPC can use HttpOnly curator cookie on production host', async () => {
    const api = loadYandexAPI({ hostname: 'app.heyslab.ru' });
    global.fetch.mockResolvedValue(createJsonResponse([]));

    const result = await api.rpc('get_curator_clients', {});

    expect(result).toEqual({ data: [], error: null });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/rpc?fn=get_curator_clients');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('saveKV keeps curator runtime context on curator RPC when JWT is cookie-only', async () => {
    const api = loadYandexAPI({
      hostname: 'app.heyslab.ru',
      cloudUser: { id: 'curator-cookie-1', role: 'curator' },
    });
    global.fetch.mockResolvedValue(createJsonResponse({ success: true, saved: 1 }));

    const result = await api.saveKV('client-42', 'heys_profile', { targetKcal: 1800 });

    expect(result).toEqual({ success: true });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/rpc?fn=batch_upsert_client_kv_by_curator');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(options.body)).toEqual({
      p_client_id: 'client-42',
      p_items: [{ k: 'heys_profile', v: { targetKcal: 1800 } }],
      p_context_id: null,
    });
  });

  it('/auth/clients can use HttpOnly curator cookie on production host', async () => {
    const api = loadYandexAPI({ hostname: 'app.heyslab.ru' });
    global.fetch.mockResolvedValue(createJsonResponse({ data: [] }));

    const result = await api.getClients();

    expect(result).toEqual({ data: [], error: null });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.heyslab.ru/auth/clients');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('curatorLogout clears HttpOnly curator cookie and local curator markers', async () => {
    const api = loadYandexAPI({
      storageSeed: {
        heys_curator_session: 'curator-jwt-local',
        heys_supabase_auth_token: JSON.stringify({ access_token: 'legacy-jwt' }),
      },
      hostname: 'app.heyslab.ru',
    });
    global.fetch.mockResolvedValue(createJsonResponse({ ok: true }));

    const result = await api.curatorLogout();

    expect(result).toEqual({ ok: true });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.heyslab.ru/auth/curator-logout');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: '{}',
    });
    expect(global.localStorage.removeItem).toHaveBeenCalledWith('heys_curator_session');
    expect(global.localStorage.removeItem).toHaveBeenCalledWith('heys_supabase_auth_token');
  });

  it('curatorLogin clears stale client HttpOnly cookie after successful login', async () => {
    const api = loadYandexAPI({
      hostname: 'app.heyslab.ru',
      storageSeed: { heys_pin_cookie_session_hint: '1' },
    });
    global.fetch
      .mockResolvedValueOnce(createJsonResponse({
        access_token: 'curator-jwt-new',
        expires_in: 86400,
        user: { id: 'curator-1', email: 'curator@example.test', role: 'curator' },
      }))
      .mockResolvedValueOnce(createJsonResponse({ ok: true, revoked: false }));

    const result = await api.curatorLogin('curator@example.test', 'secret');

    expect(result.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.heyslab.ru/auth/login');
    expect(global.fetch.mock.calls[0][1].credentials).toBe('include');
    expect(global.fetch.mock.calls[1][0]).toBe('https://api.heyslab.ru/auth/client-logout');
    expect(global.fetch.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: '{}',
    });
  });

  it('curatorLogin fails closed and rolls back curator cookie when stale client cookie cleanup fails', async () => {
    const api = loadYandexAPI({
      hostname: 'app.heyslab.ru',
      storageSeed: { heys_pin_cookie_session_hint: '1' },
    });
    global.fetch
      .mockResolvedValueOnce(createJsonResponse({
        access_token: 'curator-jwt-new',
        expires_in: 86400,
        user: { id: 'curator-1', email: 'curator@example.test', role: 'curator' },
      }))
      .mockResolvedValueOnce(createJsonResponse({ error: 'cleanup_failed' }, { ok: false, status: 500 }))
      .mockResolvedValueOnce(createJsonResponse({ ok: true }));

    const result = await api.curatorLogin('curator@example.test', 'secret');

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      code: 'ROLE_SWITCH_CLEANUP_FAILED',
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[1][0]).toBe('https://api.heyslab.ru/auth/client-logout');
    expect(global.fetch.mock.calls[2][0]).toBe('https://api.heyslab.ru/auth/curator-logout');
    expect(global.fetch.mock.calls[2][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: '{}',
    });
  });

  it('refundPayment can use HttpOnly curator cookie on production host', async () => {
    const api = loadYandexAPI({ hostname: 'app.heyslab.ru' });
    global.fetch.mockResolvedValue(createJsonResponse({
      refundId: 'refund-cookie-1',
      status: 'pending',
    }));

    const result = await api.refundPayment('payment-cookie-1');

    expect(result.error).toBeNull();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.heyslab.ru/payments/refund');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('REST reads include curator JWT when curator session exists', async () => {
    const api = loadYandexAPI({
      storageSeed: {
        heys_curator_session: 'curator-jwt-1',
      },
    });
    global.fetch.mockResolvedValue(
      createJsonResponse([{ k: 'heys_profile', v: { targetKcal: 1800 } }]),
    );

    const result = await api.getKVBatchByCurator('client-42', ['heys_profile']);

    expect(result.error).toBeNull();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/rest/client_kv_store?');
    expect(options.credentials).toBe('include');
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
