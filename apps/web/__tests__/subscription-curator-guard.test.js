import fs from 'fs';
import path from 'path';

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalLocalStorage = window.localStorage;
const originalReact = window.React;
const originalReactDOM = window.ReactDOM;

const modulePath = path.resolve(__dirname, '../heys_subscription_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const subscriptionsModulePath = path.resolve(__dirname, '../heys_subscriptions_v1.js');
const subscriptionsModuleSource = fs.readFileSync(subscriptionsModulePath, 'utf8');
const paywallModulePath = path.resolve(__dirname, '../heys_paywall_v1.js');
const paywallModuleSource = fs.readFileSync(paywallModulePath, 'utf8');
const dayHandlersSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_day_handlers.js'), 'utf8');
const mealsSource = fs.readFileSync(path.resolve(__dirname, '../day/_meals.js'), 'utf8');
const dayTabRenderSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_tab_render_v1.js'), 'utf8');
const dayPageShellSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_page_shell.js'), 'utf8');
const yandexApiSource = fs.readFileSync(path.resolve(__dirname, '../heys_yandex_api_v1.js'), 'utf8');
const rpcGatewaySource = fs.readFileSync(
  path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/index.js'),
  'utf8',
);
const extendSubscriptionSql = fs.readFileSync(
  path.resolve(__dirname, '../../../database/2026-02-08_fix_extend_and_curator_clients.sql'),
  'utf8',
);

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
    window.ReactDOM = originalReactDOM;
    document.getElementById('heys-trial-banner-host')?.remove();
    document.getElementById('heys-welcome-host')?.remove();
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

    // 12 paywall-guarded write paths in day handlers + meals (was 11 before
    // repeatTodayMeal «Повторить сегодня» in day/_meals.js).
    expect(consumerSource.match(/if \(!HEYS\.Paywall\?\.canWriteSync\?\.\(\)\)/g)).toHaveLength(12);
    expect(mealsSource).toContain('const repeatTodayMeal = React.useCallback');
    expect(mealsSource).toMatch(/repeatTodayMeal[\s\S]{0,400}if \(!HEYS\.Paywall\?\.canWriteSync\?\.\(\)\)/);
    expect(consumerSource).not.toContain('if (HEYS.Paywall && !HEYS.Paywall.canWriteSync())');
    expect(dayTabRenderSource).toContain(
      "const isReadOnly = normalizedSubscriptionStatus === 'read_only'",
    );
    expect(dayTabRenderSource).not.toContain(
      'heysRef.Subscription?.canWriteStatus?.(subscriptionStatus) !== true',
    );
  });

  it('keeps legacy payment entry points closed while payments are disabled', () => {
    const paymentCta = paywallModuleSource.slice(
      paywallModuleSource.indexOf('const handleCTA = () =>'),
      paywallModuleSource.indexOf('// Если показываем PaymentScreen'),
    );
    const showPaywallSource = paywallModuleSource.slice(
      paywallModuleSource.indexOf('function showPaywall('),
      paywallModuleSource.indexOf('function hidePaywall('),
    );

    expect(paymentCta).toContain('paymentsEnabled && clientId');
    expect(showPaywallSource).toContain('HEYS.config?.paymentsEnabled !== true');
    expect(showPaywallSource).toContain('HEYS.Subscriptions.openCuratorContactModal()');
    expect(dayPageShellSource).toContain("HEYS.Paywall?.show?.('trial_expired')");
    expect(dayPageShellSource).not.toContain('HEYS.Paywall?.showPaywall?.');
  });

  it('keeps an active trial out of the app header and removes its early payment CTA', () => {
    window.React = React;
    window.ReactDOM = {
      createRoot: vi.fn(() => ({ render: vi.fn() })),
    };
    const subscriptions = loadSubscriptions();
    const futureTrialEnd = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();

    expect(subscriptions.TrialCountdownBanner({
      subscriptionStatus: 'trial',
      trialEndsAt: futureTrialEnd,
    })).toBeNull();
    expect(subscriptions.TrialCountdownBanner({
      subscriptionStatus: 'read_only',
      trialEndsAt: futureTrialEnd,
    })).not.toBeNull();

    subscriptions.mountTrialUI({
      clientId: null,
      subscriptionStatus: 'trial',
      trialEndsAt: futureTrialEnd,
    });
    expect(document.getElementById('heys-trial-banner-host')).toBeNull();

    subscriptions.mountTrialUI({
      clientId: null,
      subscriptionStatus: 'read_only',
      trialEndsAt: futureTrialEnd,
    });
    expect(document.getElementById('heys-trial-banner-host')).toBeNull();

    const subscriptionSectionSource = subscriptionsModuleSource.slice(
      subscriptionsModuleSource.indexOf('function SubscriptionSection('),
      subscriptionsModuleSource.indexOf('function showPaymentRequired('),
    );
    expect(subscriptionSectionSource).toContain("status?.status === 'read_only'");
    expect(subscriptionSectionSource).not.toContain("status?.status === 'trial' || status?.status === 'read_only'");
  });

  it('does not remount trial welcome after dismiss in the same session', () => {
    const render = vi.fn();
    window.React = React;
    window.ReactDOM = {
      createRoot: vi.fn(() => ({ render })),
    };
    const storage = createMockStorage({});
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });

    const clientId = '846F2B16-AAAA-BBBB-CCCC-DDDDEEEEFFFF';
    window.HEYS = {
      currentClientId: clientId.toLowerCase(),
      cloud: { isInitialSyncCompleted: () => true },
      store: {
        get: vi.fn(() => null),
        set: vi.fn(),
      },
    };

    const subscriptions = loadSubscriptions();
    const futureTrialEnd = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
    const opts = {
      clientId,
      clientName: 'пупсы qwe',
      subscriptionStatus: 'trial',
      trialEndsAt: futureTrialEnd,
    };

    subscriptions.mountTrialUI(opts);
    expect(document.getElementById('heys-welcome-host')).not.toBeNull();
    expect(render).toHaveBeenCalledTimes(1);

    const welcomeProps = render.mock.calls[0][0].props;
    welcomeProps.onClose();

    render.mockClear();
    subscriptions.mountTrialUI(opts);
    expect(document.getElementById('heys-welcome-host')).toBeNull();
    const welcomeRenders = render.mock.calls.filter(
      (call) => call[0]?.props?.onClose,
    );
    expect(welcomeRenders).toHaveLength(0);
    expect(storage.setItem).toHaveBeenCalledWith(
      `heys_first_login_${clientId.toLowerCase()}`,
      '1',
    );
  });

  it('does not mount trial welcome when profile already has onboarding markers', () => {
    const render = vi.fn();
    window.React = React;
    window.ReactDOM = {
      createRoot: vi.fn(() => ({ render })),
    };
    const storage = createMockStorage({});
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });

    const clientId = '846f2b16-aaaa-bbbb-cccc-ddddeeeeffff';
    window.HEYS = {
      currentClientId: clientId,
      cloud: { isInitialSyncCompleted: () => true },
      store: { get: vi.fn(() => null), set: vi.fn() },
      utils: {
        lsGet: vi.fn((key) => (key === 'heys_profile' ? { weight: 70, name: 'пупсы qwe' } : null)),
      },
    };

    const subscriptions = loadSubscriptions();
    subscriptions.mountTrialUI({
      clientId,
      clientName: 'пупсы qwe',
      subscriptionStatus: 'trial',
      trialEndsAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString(),
    });

    expect(document.getElementById('heys-welcome-host')).toBeNull();
    expect(render).not.toHaveBeenCalled();
  });

  it('registers payment_required after the canonical StepModal ready event', () => {
    window.React = React;
    loadSubscriptions();

    const registerStep = vi.fn();
    window.HEYS.StepModal = { registerStep };
    document.dispatchEvent(new CustomEvent('heys-stepmodal-ready'));

    expect(registerStep).toHaveBeenCalledOnce();
    expect(registerStep).toHaveBeenCalledWith(
      'payment_required',
      expect.objectContaining({
        canSkip: false,
        hideHeaderNext: true,
        component: expect.any(Function),
      }),
    );
    expect(registerStep.mock.calls[0][1].render).toBeUndefined();
    expect(subscriptionsModuleSource).not.toContain("window.addEventListener('heys:step-modal-ready'");
  });

  it('retires unsafe legacy trial extension and keeps the owned subscription path', () => {
    const webCuratorFunctions = yandexApiSource.slice(
      yandexApiSource.indexOf('const CURATOR_ONLY_FUNCTIONS = ['),
      yandexApiSource.indexOf('/**\n   * RPC вызов'),
    );
    const rpcCuratorFunctions = rpcGatewaySource.slice(
      rpcGatewaySource.indexOf('const CURATOR_ONLY_FUNCTIONS = ['),
      rpcGatewaySource.indexOf('// === P1-B: Curator audit middleware'),
    );
    const rpcTypeHints = rpcGatewaySource.slice(
      rpcGatewaySource.indexOf("'admin_extend_subscription':"),
      rpcGatewaySource.indexOf("'admin_cancel_subscription':"),
    );

    expect(webCuratorFunctions).toContain("'admin_extend_subscription'");
    expect(rpcCuratorFunctions).toContain("'admin_extend_subscription'");
    expect(webCuratorFunctions).not.toContain("'admin_extend_trial'");
    expect(rpcCuratorFunctions).not.toContain("'admin_extend_trial'");
    expect(rpcTypeHints).not.toContain("'admin_extend_trial':");
    expect(extendSubscriptionSql).toContain('v_client.curator_id != p_curator_id');
    expect(extendSubscriptionSql).toContain("'error', 'access_denied'");
    expect(extendSubscriptionSql).toContain('public.get_effective_subscription_status(p_client_id)');
    expect(extendSubscriptionSql).toContain('active_until = v_new_end_date');
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

  it('keeps scheduled start details and never starts a trial from the PIN session', async () => {
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
          status: 'trial_pending',
          trial_started_at: '2026-08-03T00:00:00.000Z',
          trial_ends_at: '2026-08-10T00:00:00.000Z',
        },
      },
      error: null,
    });
    window.HEYS = { currentClientId: clientId, YandexAPI: { rpc } };

    const subscription = loadSubscription();
    const details = await subscription.getStatusDetails(true);
    const activation = await subscription.activateTrialTimer();

    expect(details).toMatchObject({
      status: 'trial_pending',
      trial_started_at: '2026-08-03T00:00:00.000Z',
      trial_ends_at: '2026-08-10T00:00:00.000Z',
    });
    expect(subscription.canWriteStatus(details)).toBe(false);
    expect(activation).toEqual({ success: false, message: 'curator_activation_required' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith('activate_trial_timer_by_session', expect.anything());
  });
});
