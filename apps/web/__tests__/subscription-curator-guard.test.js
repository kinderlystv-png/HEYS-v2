import fs from 'fs';
import path from 'path';

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalLocalStorage = window.localStorage;
const originalReact = window.React;

const modulePath = path.resolve(__dirname, '../heys_subscription_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const subscriptionsModulePath = path.resolve(__dirname, '../heys_subscriptions_v1.js');
const subscriptionsModuleSource = fs.readFileSync(subscriptionsModulePath, 'utf8');
const paywallModulePath = path.resolve(__dirname, '../heys_paywall_v1.js');
const paywallModuleSource = fs.readFileSync(paywallModulePath, 'utf8');
const dayHandlersSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_day_handlers.js'), 'utf8');
const mealsSource = fs.readFileSync(path.resolve(__dirname, '../day/_meals.js'), 'utf8');
const dayTabRenderSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_tab_render_v1.js'), 'utf8');

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

function loadPaywall() {
  eval(paywallModuleSource);
  return window.HEYS.Paywall;
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
    window.React = originalReact;
  });

  beforeEach(() => {
    window.HEYS = {};
  });

  it('does not call session subscription RPC for curator sessions', async () => {
    const clientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    const storage = createMockStorage({
      heys_curator_cookie_session_hint: '1',
      heys_client_current: JSON.stringify(clientId),
      heys_clients: JSON.stringify([
        { id: clientId, name: 'Client A', subscription_status: 'active' },
      ]),
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
      heys_curator_cookie_session_hint: '1',
      heys_client_current: JSON.stringify(clientId),
      heys_clients: JSON.stringify([
        { id: clientId, name: 'Client A', subscription_status: 'active' },
      ]),
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

  it('blocks write access for cached none and trial_pending statuses', () => {
    const storage = createMockStorage({
      heys_subscription_status: JSON.stringify({ status: 'none', ts: Date.now() }),
    });

    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });

    const subscription = loadSubscription();
    const paywall = loadPaywall();

    expect(subscription.canWrite('none')).toBe(false);
    expect(subscription.canWrite('trial_pending')).toBe(false);
    expect(subscription.canWrite('trial')).toBe(true);
    expect(subscription.canWrite('active')).toBe(true);
    expect(paywall.canWriteSync()).toBe(false);

    subscription.clearCache();
    storage._store.heys_subscription_status = JSON.stringify({ status: 'trial', ts: Date.now() });
    expect(paywall.canWriteSync()).toBe(true);
  });

  it.each([
    ['none', false],
    ['trial_pending', false],
    ['trial', true],
    ['active', true],
    ['read_only', false],
  ])('uses one access decision for status %s', async (status, expected) => {
    const storage = createMockStorage({
      heys_subscription_status: JSON.stringify({ status, ts: Date.now() }),
    });
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });

    const subscription = loadSubscription();
    subscription.getStatus = vi.fn().mockResolvedValue(status);
    const paywall = loadPaywall();
    const subscriptions = loadSubscriptions();

    expect(subscription.canWriteStatus(status)).toBe(expected);
    expect(subscription.canWrite(status)).toBe(expected);
    expect(subscription.getStatusMeta(status).canWrite).toBe(expected);
    expect(await paywall.canWrite()).toBe(expected);
    expect(paywall.canWriteSync()).toBe(expected);
    expect((await subscriptions.getStatus()).can_edit).toBe(expected);
    expect(await subscriptions.canEdit()).toBe(expected);
  });

  it.each([
    ['trial string', 'trial', true],
    ['status object', { status: 'active' }, true],
    ['subscription_status object', { subscription_status: 'trial' }, true],
    ['nested data', { data: { status: 'active' } }, true],
    ['RPC envelope', { get_subscription_status_by_session: { status: 'trial' } }, true],
    ['empty string', '', false],
    ['null', null, false],
    ['empty object', {}, false],
    ['malformed status', { status: 42 }, false],
    ['unknown status', { data: { subscription_status: 'loading' } }, false],
  ])('normalizes %s and stays fail-closed', async (_label, value, expected) => {
    const subscription = loadSubscription();
    subscription.getStatus = vi.fn().mockResolvedValue(value);
    subscription.getCachedStatus = vi.fn(() => value);
    subscription.getLocalStatus = vi.fn(() => null);
    const paywall = loadPaywall();

    expect(subscription.canWriteStatus(value)).toBe(expected);
    expect(subscription.getStatusMeta(value).canWrite).toBe(expected);
    expect(await paywall.canWrite()).toBe(expected);
    expect(paywall.canWriteSync()).toBe(expected);
  });

  it('blocks async and sync writes when Subscription is unavailable', async () => {
    const paywall = loadPaywall();

    expect(await paywall.canWrite()).toBe(false);
    expect(paywall.canWriteSync()).toBe(false);
  });

  it('blocks async writes when status refresh fails', async () => {
    const subscription = loadSubscription();
    subscription.getStatus = vi.fn().mockRejectedValue(new Error('status unavailable'));
    const paywall = loadPaywall();

    expect(await paywall.canWrite()).toBe(false);
  });

  it('starts useWriteAccess closed and opens only after a known active status arrives', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: createMockStorage(),
      writable: true,
      configurable: true,
    });
    window.React = React;
    const paywall = loadPaywall();
    const { result } = renderHook(() => paywall.useWriteAccess());

    expect(result.current).toMatchObject({ canWrite: false, isLoading: true });
    await waitFor(() => {
      expect(result.current).toMatchObject({ canWrite: false, isLoading: false });
    });

    const subscription = loadSubscription();
    subscription.getStatus = vi.fn().mockResolvedValue('active');
    await act(async () => {
      window.dispatchEvent(new CustomEvent('heys:subscription-changed', {
        detail: { status: 'active' },
      }));
    });
    await waitFor(() => {
      expect(result.current.canWrite).toBe(true);
    });
  });

  it('keeps writes fail-closed without showing a false trial-ended banner for unknown status', () => {
    const consumerSource = `${dayHandlersSource}\n${mealsSource}`;

    expect(consumerSource.match(/if \(!HEYS\.Paywall\?\.canWriteSync\?\.\(\)\)/g)).toHaveLength(9);
    expect(consumerSource).not.toContain('if (HEYS.Paywall && !HEYS.Paywall.canWriteSync())');
    expect(dayTabRenderSource).toContain(
      "const isReadOnly = normalizedSubscriptionStatus === 'read_only'",
    );
    expect(dayTabRenderSource).not.toContain(
      'heysRef.Subscription?.canWriteStatus?.(subscriptionStatus) !== true',
    );
  });

  it('blocks PIN write access when status cache is missing and local status is none', () => {
    const clientId = '73b65323-5974-4f60-835f-ace14252614f';
    const storage = createMockStorage({
      heys_pin_auth_client: clientId,
      heys_client_current: JSON.stringify(clientId),
      heys_profile: JSON.stringify({ name: 'Пупсик тестовый', subscription_status: 'none' }),
    });

    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });

    window.HEYS = { currentClientId: clientId };
    loadSubscription();
    const paywall = loadPaywall();

    expect(paywall.canWriteSync()).toBe(false);
  });

  it('unwraps session subscription RPC response and caches trial status', async () => {
    const clientId = '52e2575a-65b5-4998-ad7d-c83171f8087c';
    const storage = createMockStorage({
      heys_pin_auth_client: clientId,
      heys_client_current: JSON.stringify(clientId),
    });

    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });

    const rpc = vi.fn().mockResolvedValue({
      data: {
        get_subscription_status_by_session: {
          status: 'trial',
          trial_ends_at: '2026-06-28T10:48:48.855Z',
        },
      },
      error: null,
    });
    window.HEYS = {
      currentClientId: clientId,
      YandexAPI: { rpc },
    };

    const subscription = loadSubscription();
    const status = await subscription.getStatus(true);

    expect(status).toBe('trial');
    expect(subscription.getCachedStatus()).toBe('trial');
    expect(JSON.parse(storage._store.heys_subscription_status).status).toBe('trial');
  });
});
