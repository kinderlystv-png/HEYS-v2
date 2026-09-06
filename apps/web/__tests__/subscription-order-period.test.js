/**
 * Subscription order period — projected (before pay) vs confirmed (after pay).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBS_SOURCE = fs.readFileSync(path.join(WEB_DIR, 'heys_subscriptions_v1.js'), 'utf8');
const PAYMENTS_MODULE = path.resolve(WEB_DIR, '../../yandex-cloud-functions/heys-api-payments/index.js');

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';

function createMockStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: vi.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    _store: store,
  };
}

function loadSubscriptions() {
  // eslint-disable-next-line no-eval
  eval(SUBS_SOURCE);
  return window.HEYS.Subscriptions;
}

describe('subscription order period · server computeProjectedPeriodEnd', () => {
  it('matches calendar month: Jan 31 + 1 month → Feb 28 (not +30 days)', async () => {
    const { computeProjectedPeriodEnd } = await import(PAYMENTS_MODULE);
    const ref = new Date('2026-01-31T12:00:00.000Z');
    const end = computeProjectedPeriodEnd(null, ref);
    expect(end.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('extends from active subscription end when renewing early', async () => {
    const { computeProjectedPeriodEnd } = await import(PAYMENTS_MODULE);
    const ref = new Date('2026-03-10T10:00:00.000Z');
    const currentEnd = new Date('2026-04-15T10:00:00.000Z');
    const end = computeProjectedPeriodEnd(currentEnd, ref);
    expect(end.toISOString().slice(0, 10)).toBe('2026-05-15');
  });
});

describe('subscription order period · resolveOrderPeriodLine', () => {
  let Subs;

  beforeEach(() => {
    window.HEYS = {};
    Subs = loadSubscriptions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
  });

  it('prefers confirmed_period_end over projected when period_kind is confirmed', () => {
    const line = Subs.resolveOrderPeriodLine({
      period_kind: 'confirmed',
      confirmed_period_end: '2026-10-05T00:00:00.000Z',
      projected_period_end: '2026-09-01T00:00:00.000Z',
    });
    expect(line.period_kind).toBe('confirmed');
    expect(line.date).toBe('2026-10-05T00:00:00.000Z');
  });

  it('uses projected_period_end before payment', () => {
    const line = Subs.resolveOrderPeriodLine({
      period_kind: 'estimate',
      projected_period_end: '2026-10-05T00:00:00.000Z',
    });
    expect(line.period_kind).toBe('estimate');
    expect(line.date).toBe('2026-10-05T00:00:00.000Z');
  });
});

describe('subscription order period · PaymentScreen before payment', () => {
  const originalFetch = global.fetch;
  const originalReact = window.React;
  const originalReactDOM = window.ReactDOM;

  beforeEach(() => {
    window.HEYS = { config: { prices: { pro: 7990 } } };
    window.React = React;
    window.ReactDOM = {
      createRoot: (node) => ({
        render: (tree) => render(tree, { container: node }),
        unmount: () => {},
      }),
    };
    Object.defineProperty(window, 'localStorage', {
      value: createMockStorage({ heys_session_token: 'test-token' }),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.React = originalReact;
    window.ReactDOM = originalReactDOM;
    delete window.HEYS;
    vi.restoreAllMocks();
  });

  it('renders projected period from server order-preview', async () => {
    const Subs = loadSubscriptions();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        period_kind: 'estimate',
        projected_period_end: '2026-10-05T00:00:00.000Z',
      }),
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = window.ReactDOM.createRoot(host);
    root.render(React.createElement(Subs.PaymentScreen, {
      clientId: CLIENT_ID,
      plan: 'pro',
      embedded: true,
    }));

    await waitFor(() => {
      expect(screen.getByText(/до 5 октября/i)).toBeTruthy();
    });
    expect(screen.getByText(/до 5 октября/i).className).toBe('paywall-order-period');
    expect(global.fetch).toHaveBeenCalled();
    const calledUrl = String(global.fetch.mock.calls[0][0]);
    expect(calledUrl).toContain('/payments/order-preview');
    host.remove();
  });
});

describe('subscription order period · PaymentSuccessScreen after payment', () => {
  beforeEach(() => {
    window.HEYS = { config: { prices: { pro: 7990 } } };
    window.React = React;
  });

  afterEach(() => {
    delete window.HEYS;
  });

  it('renders confirmed period_end from server, not client math', () => {
    const Subs = loadSubscriptions();
    render(React.createElement(Subs.PaymentSuccessScreen, {
      plan: 'pro',
      confirmed_period_end: '2026-10-05T00:00:00.000Z',
      period_kind: 'confirmed',
      onContinue: () => {},
      embedded: true,
    }));

    expect(screen.getByText(/До 5 октября/i)).toBeTruthy();
    expect(screen.getByText(/7\s*990\s*₽/)).toBeTruthy();
  });
});

describe('subscription order period · checkPendingPayment after payment', () => {
  beforeEach(() => {
    window.HEYS = {};
    Object.defineProperty(window, 'localStorage', {
      value: createMockStorage({
        heys_pending_payment: JSON.stringify({
          paymentId: 'pay-1',
          clientId: CLIENT_ID,
          plan: 'pro',
          createdAt: Date.now(),
        }),
      }),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    delete window.HEYS;
    vi.restoreAllMocks();
  });

  it('returns confirmed_period_end when payment status is completed', async () => {
    const Subs = loadSubscriptions();
    window.HEYS.YandexAPI = {
      getPaymentStatus: vi.fn().mockResolvedValue({
        data: {
          status: 'completed',
          paid: true,
          confirmed_period_end: '2026-10-05T00:00:00.000Z',
          period_kind: 'confirmed',
        },
        error: null,
      }),
    };

    const result = await Subs.checkPendingPayment();
    expect(result.success).toBe(true);
    expect(result.period_kind).toBe('confirmed');
    expect(result.confirmed_period_end).toBe('2026-10-05T00:00:00.000Z');
  });
});
