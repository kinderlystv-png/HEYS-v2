import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalLocalStorage = window.localStorage;

const modulePath = path.resolve(__dirname, '../heys_subscription_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const subscriptionsModulePath = path.resolve(__dirname, '../heys_subscriptions_v1.js');
const subscriptionsModuleSource = fs.readFileSync(subscriptionsModulePath, 'utf8');

function createMockStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: vi.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    _store: store,
  };
}

function loadSubscription() {
  eval(moduleSource);
  return window.HEYS.Subscription;
}

function loadSubscriptions() {
  eval(subscriptionsModuleSource);
  return window.HEYS.Subscriptions;
}

describe('HEYS.Subscription curator guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    window.HEYS = originalHEYS;
  });

  beforeEach(() => {
    window.HEYS = {};
  });

  it('does not call session subscription RPC for curator sessions', async () => {
    const clientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    const storage = createMockStorage({
      heys_curator_session: 'curator.jwt.token',
      heys_client_current: JSON.stringify(clientId),
      heys_clients: JSON.stringify([
        { id: clientId, name: 'Client A', subscription_status: 'active' },
      ]),
      heys_supabase_auth_token: JSON.stringify({
        access_token: 'curator.jwt.token',
        user: { id: 'curator-1', email: 'curator@example.test' },
      }),
    });

    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });

    const rpc = vi.fn().mockResolvedValue({ error: { message: 'invalid_session' } });
    window.HEYS = {
      currentClientId: clientId,
      YandexAPI: { rpc },
    };

    const subscription = loadSubscription();
    const status = await subscription.getStatus(true);

    expect(status).toBe('active');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps the legacy Subscriptions module local for curator sessions', async () => {
    const clientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    const storage = createMockStorage({
      heys_curator_session: 'curator.jwt.token',
      heys_client_current: JSON.stringify(clientId),
      heys_clients: JSON.stringify([
        { id: clientId, name: 'Client A', subscription_status: 'active' },
      ]),
      heys_supabase_auth_token: JSON.stringify({
        access_token: 'curator.jwt.token',
        user: { id: 'curator-1', email: 'curator@example.test' },
      }),
    });

    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });

    const rpc = vi.fn().mockResolvedValue({ error: { message: 'invalid_session' } });
    window.HEYS = {
      currentClientId: clientId,
      YandexAPI: { rpc },
      utils: {
        lsGet: (key, fallback) => {
          const raw = storage.getItem(key);
          return raw ? JSON.parse(raw) : fallback;
        },
      },
    };

    const subscriptions = loadSubscriptions();
    const status = await subscriptions.getStatus(clientId);

    expect(status).toMatchObject({ success: true, status: 'active', source: 'local_curator' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
