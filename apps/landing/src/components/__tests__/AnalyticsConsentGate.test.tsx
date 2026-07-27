// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/script', () => ({
  default: ({ id }: { id: string }) => <script data-testid={id} />,
}));

import AnalyticsConsentGate, {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_KEY,
} from '../AnalyticsConsentGate';

describe('AnalyticsConsentGate', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('does not render Yandex Metrica before an explicit opt-in', () => {
    render(<AnalyticsConsentGate ymId="12345" />);
    expect(screen.queryByTestId('yandex-metrika')).toBeNull();
  });

  it('renders Yandex Metrica only after the versioned granted decision', () => {
    render(<AnalyticsConsentGate ymId="12345" />);
    act(() => {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, 'granted');
      window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: 'granted' }));
    });
    expect(screen.getByTestId('yandex-metrika')).toBeTruthy();
  });

  it('keeps analytics disabled after an explicit rejection', () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, 'denied');
    render(<AnalyticsConsentGate ymId="12345" />);
    expect(screen.queryByTestId('yandex-metrika')).toBeNull();
  });
});
