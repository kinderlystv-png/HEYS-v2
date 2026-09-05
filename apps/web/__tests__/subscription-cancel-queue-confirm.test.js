/**
 * Polosa 6 · task 94 · очередь · отмена заявки
 * In-modal confirm replaces system confirm() for trial queue cancel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAYWALL_SOURCE = fs.readFileSync(path.join(WEB_DIR, 'heys_paywall_v1.js'), 'utf8');

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalReactDOM = window.ReactDOM;

function loadPaywall() {
  // eslint-disable-next-line no-eval
  eval(PAYWALL_SOURCE);
  return window.HEYS.Paywall;
}

function createTrialQueueMock(overrides = {}) {
  const getQueueStatus = vi.fn()
    .mockResolvedValueOnce({ status: 'queued', position: 3 })
    .mockResolvedValue({ status: 'not_in_queue' });

  return {
    getCapacity: vi.fn().mockResolvedValue({
      available_slots: 0,
      is_accepting: true,
      queue_length: 4,
    }),
    getQueueStatus: overrides.getQueueStatus || getQueueStatus,
    cancelQueue: vi.fn().mockResolvedValue({ success: true }),
    requestTrial: vi.fn(),
    claimOffer: vi.fn(),
    isOfferExpired: vi.fn(() => false),
    formatTimeRemaining: vi.fn(() => ''),
    ...overrides,
  };
}

function mountPaywallModal(trialQueue) {
  const Paywall = loadPaywall();
  return render(
    React.createElement(Paywall.PaywallModal, {
      onClose: vi.fn(),
      onSelectPlan: vi.fn(),
      reason: 'trial_ended',
    }),
    { container: document.body.appendChild(document.createElement('div')) },
  );
}

describe('subscription cancel queue confirm', () => {
  beforeEach(() => {
    window.HEYS = {
      support: {
        telegramHandle: '@heyslab_support_bot',
        telegramUrl: 'https://t.me/heyslab_support_bot',
        email: 'pay@heyslab.ru',
      },
      config: {
        paymentsEnabled: false,
        prices: { base: 490, pro: 7990, proPlus: 19990 },
      },
      TrialQueue: createTrialQueueMock(),
    };
    window.React = React;
    window.ReactDOM = {
      createRoot: (container) => ({
        render: (element) => render(element, { container }),
        unmount: () => cleanup(),
      }),
    };
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    window.HEYS = originalHEYS;
    window.React = originalReact;
    window.ReactDOM = originalReactDOM;
    vi.restoreAllMocks();
  });

  it('does not use system confirm() for cancel queue flow', () => {
    expect(PAYWALL_SOURCE).not.toContain("confirm('Отменить запрос на триал?')");
    expect(PAYWALL_SOURCE).toContain('Отменить заявку на пробный период?');
    expect(PAYWALL_SOURCE).toMatch(/className: 'btn'/);
    expect(PAYWALL_SOURCE).toMatch(/className: 'btnq'/);
    expect(PAYWALL_SOURCE).toContain('var(--v4-bad-text');
  });

  it('path B: «Оставить» closes confirm and keeps queue unchanged', async () => {
    const trialQueue = createTrialQueueMock();
    window.HEYS.TrialQueue = trialQueue;
    mountPaywallModal(trialQueue);

    await waitFor(() => {
      expect(screen.getByText('Заявка подана · вы 3-й в очереди')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Отменить заявку' }));
    });

    expect(screen.getByText('Отменить заявку на пробный период?')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Отменить заявку' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Оставить' })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Оставить' }));
    });

    expect(screen.queryByText('Отменить заявку на пробный период?')).toBeNull();
    expect(screen.getByText('Заявка подана · вы 3-й в очереди')).toBeTruthy();
    expect(trialQueue.cancelQueue).not.toHaveBeenCalled();
  });

  it('path A: confirm cancel calls cancelQueue and leaves queued state', async () => {
    const trialQueue = createTrialQueueMock();
    window.HEYS.TrialQueue = trialQueue;
    mountPaywallModal(trialQueue);

    await waitFor(() => {
      expect(screen.getByText('Заявка подана · вы 3-й в очереди')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Отменить заявку' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Отменить заявку' }));
    });

    await waitFor(() => {
      expect(trialQueue.cancelQueue).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByText('Заявка подана · вы 3-й в очереди')).toBeNull();
      expect(screen.getByText('Встать в очередь')).toBeTruthy();
    });
  });
});
