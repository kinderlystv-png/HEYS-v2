import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_app_gate_flow_v1.js'), 'utf8');

describe('consent gate flow', () => {
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
});
