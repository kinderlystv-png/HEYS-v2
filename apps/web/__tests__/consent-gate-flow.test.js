import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_app_gate_flow_v1.js'), 'utf8');

describe('consent gate flow', () => {
  it('keeps the app skeleton instead of rendering a separate gate while consent check is loading', () => {
    const previousHEYS = window.HEYS;
    const previousReact = window.React;

    window.HEYS = {
      Consents: {
        ConsentScreen: function ConsentScreen() {},
        ConsentOutdatedBanner: function ConsentOutdatedBanner() {},
      },
    };
    window.React = {
      createElement: (type, props) => ({ type, props }),
    };

    try {
      // eslint-disable-next-line no-eval
      (0, eval)(source);
      const gate = window.HEYS.AppGateFlow.buildConsentGate({
        gate: null,
        desktopGate: null,
        cloudUser: null,
        clientId: 'client-1',
        needsConsent: false,
        checkingConsent: true,
        setNeedsConsent: () => {},
        setCheckingConsent: () => {},
        setShowMorningCheckin: () => {},
        setConsentCheckError: () => {},
      });

      expect(gate).toBeNull();
    } finally {
      window.HEYS = previousHEYS;
      window.React = previousReact;
    }
  });

  it('blocks PIN clients when required consents are outdated', () => {
    const previousHEYS = window.HEYS;
    const previousReact = window.React;

    const elements = [];
    window.HEYS = {
      Consents: {
        ConsentScreen: function ConsentScreen() {},
        ConsentOutdatedBanner: function ConsentOutdatedBanner() {},
      },
    };
    window.React = {
      createElement: (type, props) => {
        const element = { type, props };
        elements.push(element);
        return element;
      },
    };

    try {
      // eslint-disable-next-line no-eval
      (0, eval)(source);
      const gate = window.HEYS.AppGateFlow.buildConsentGate({
        gate: null,
        desktopGate: null,
        cloudUser: null,
        clientId: 'client-1',
        needsConsent: false,
        checkingConsent: false,
        setNeedsConsent: () => {},
        setShowMorningCheckin: () => {},
        outdatedTypes: [{ type: 'user_agreement' }],
        graceExpiresAt: '2026-06-26T00:00:00Z',
        mustBlockReconsent: false,
      });

      expect(gate).toBeTruthy();
      expect(gate.type).toBe(window.HEYS.Consents.ConsentScreen);
      expect(gate.type).not.toBe(window.HEYS.Consents.ConsentOutdatedBanner);
      expect(gate.props.outdatedTypes).toEqual([{ type: 'user_agreement' }]);
      expect(elements.length).toBe(1);
    } finally {
      window.HEYS = previousHEYS;
      window.React = previousReact;
    }
  });

  it('does not let stale curator state bypass PIN consent gate', () => {
    const previousHEYS = window.HEYS;
    const previousReact = window.React;

    window.HEYS = {
      cloud: {
        isPinAuthClient: () => true,
      },
      Consents: {
        ConsentScreen: function ConsentScreen() {},
        ConsentOutdatedBanner: function ConsentOutdatedBanner() {},
      },
    };
    window.React = {
      createElement: (type, props) => ({ type, props }),
    };

    try {
      // eslint-disable-next-line no-eval
      (0, eval)(source);
      const gate = window.HEYS.AppGateFlow.buildConsentGate({
        gate: null,
        desktopGate: null,
        cloudUser: { id: 'stale-curator' },
        clientId: 'client-1',
        needsConsent: false,
        checkingConsent: false,
        setNeedsConsent: () => {},
        setShowMorningCheckin: () => {},
        outdatedTypes: [{ type: 'user_agreement' }],
        graceExpiresAt: '2026-06-28T00:00:00Z',
        mustBlockReconsent: false,
      });

      expect(gate).toBeTruthy();
      expect(gate.type).toBe(window.HEYS.Consents.ConsentScreen);
    } finally {
      window.HEYS = previousHEYS;
      window.React = previousReact;
    }
  });

  it('shows a load error instead of the consent form when consent check fails', () => {
    const previousHEYS = window.HEYS;
    const previousReact = window.React;

    window.HEYS = {
      Consents: {
        ConsentScreen: function ConsentScreen() {},
        ConsentOutdatedBanner: function ConsentOutdatedBanner() {},
      },
    };
    window.React = {
      createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    };

    try {
      // eslint-disable-next-line no-eval
      (0, eval)(source);
      const gate = window.HEYS.AppGateFlow.buildConsentGate({
        gate: null,
        desktopGate: null,
        cloudUser: null,
        clientId: 'client-1',
        needsConsent: false,
        checkingConsent: false,
        setNeedsConsent: () => {},
        setCheckingConsent: () => {},
        setShowMorningCheckin: () => {},
        consentCheckError: { message: 'API not ready' },
        setConsentCheckError: () => {},
      });

      expect(gate).toBeTruthy();
      expect(gate.type).toBe('div');
      expect(gate.props.role).toBe('alert');
      expect(gate.type).not.toBe(window.HEYS.Consents.ConsentScreen);
    } finally {
      window.HEYS = previousHEYS;
      window.React = previousReact;
    }
  });

  it.each([
    ['none', null, 'Куратор ещё не назначил дату начала пробной недели.'],
    ['trial_pending', '2026-08-03T00:00:00.000Z', 'Пробная неделя начнётся 3 августа.'],
  ])('blocks the main app before trial for %s', (status, trialStartedAt, expectedText) => {
    const previousHEYS = window.HEYS;
    const previousReact = window.React;
    const textNodes = [];

    window.HEYS = {
      cloud: { isPinAuthClient: () => true },
      utils: { lsGet: () => ({ profileCompleted: true }) },
      ProfileSteps: { isProfileIncomplete: () => false },
      Consents: {},
    };
    window.React = {
      createElement: (type, props, ...children) => {
        for (const child of children.flat(Infinity)) {
          if (typeof child === 'string') textNodes.push(child);
        }
        return { type, props: props || {}, children };
      },
    };

    try {
      // eslint-disable-next-line no-eval
      (0, eval)(source);
      const gate = window.HEYS.AppGateFlow.buildConsentGate({
        gate: null,
        desktopGate: null,
        cloudUser: null,
        clientId: 'client-1',
        needsConsent: false,
        checkingConsent: false,
        setNeedsConsent: () => {},
        setShowMorningCheckin: () => {},
        subscriptionState: {
          status,
          details: { status, trial_started_at: trialStartedAt },
          isLoading: false,
        },
      });

      expect(gate).toBeTruthy();
      expect(gate.props.key).toBe('subscription-waiting');
      expect(textNodes.join(' ')).toContain('Аккаунт готов');
      expect(textNodes.join(' ')).toContain(expectedText);
      expect(textNodes.join(' ')).toContain('Проверить доступ');
    } finally {
      window.HEYS = previousHEYS;
      window.React = previousReact;
    }
  });

  it('shows optional feature offer to existing PIN clients before the app', () => {
    const previousHEYS = window.HEYS;
    const previousReact = window.React;

    function OptionalFeatureOfferScreen() {}
    window.HEYS = {
      cloud: { isPinAuthClient: () => true },
      Consents: {
        OptionalFeatureOfferScreen,
        shouldOfferOptionalFeatures: () => true,
      },
    };
    window.React = {
      createElement: (type, props) => ({ type, props }),
    };

    try {
      // eslint-disable-next-line no-eval
      (0, eval)(source);
      const gate = window.HEYS.AppGateFlow.buildConsentGate({
        gate: null,
        desktopGate: null,
        cloudUser: null,
        clientId: 'client-1',
        needsConsent: false,
        checkingConsent: false,
        setNeedsConsent: () => {},
        setShowMorningCheckin: () => {},
      });

      expect(gate).toBeTruthy();
      expect(gate.type).toBe(OptionalFeatureOfferScreen);
      expect(gate.props.clientId).toBe('client-1');
    } finally {
      window.HEYS = previousHEYS;
      window.React = previousReact;
    }
  });
});
