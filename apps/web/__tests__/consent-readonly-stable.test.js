import fs from 'fs';
import path from 'path';

import { describe, expect, it, vi } from 'vitest';

const gateSource = fs.readFileSync(path.resolve(__dirname, '../heys_app_gate_flow_v1.js'), 'utf8');
const consentsSource = fs.readFileSync(path.resolve(__dirname, '../heys_consents_v1.js'), 'utf8');

function evalGateSource() {
  // eslint-disable-next-line no-eval
  (0, eval)(gateSource);
}

function buildGate(overrides = {}) {
  const previousHEYS = window.HEYS;
  const previousReact = window.React;
  const previousReadonly = window.__HEYS_READONLY_MODE__;

  window.__HEYS_READONLY_MODE__ = { enabled: true };
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
    evalGateSource();
    return window.HEYS.AppGateFlow.buildConsentGate({
      gate: null,
      desktopGate: null,
      cloudUser: null,
      clientId: 'client-1',
      needsConsent: true,
      checkingConsent: false,
      setNeedsConsent: () => {},
      setShowMorningCheckin: () => {},
      outdatedTypes: [{ type: 'health_data' }],
      mustBlockReconsent: true,
      ...overrides,
    });
  } finally {
    window.HEYS = previousHEYS;
    window.React = previousReact;
    window.__HEYS_READONLY_MODE__ = previousReadonly;
  }
}

function collectElements(node, output = []) {
  if (!node) return output;
  output.push(node);
  for (const child of node.children || []) collectElements(child, output);
  return output;
}

function renderConsentScreenWithAcceptedConsents() {
  const previousHEYS = window.HEYS;
  const previousReact = window.React;
  const previousReadonly = window.__HEYS_READONLY_MODE__;

  window.__HEYS_READONLY_MODE__ = { enabled: true };
  window.HEYS = {
    BlankScreenGuard: { reportVisibleFrame: () => {} },
    YandexAPI: {
      logConsentsBySession: vi.fn(),
      logConsents: vi.fn(),
    },
  };
  window.React = {
    useState: (initial) => {
      const value = typeof initial === 'function' ? initial() : initial;
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'user_agreement')) {
        return [{
          user_agreement: true,
          personal_data: true,
          health_data: true,
          marketing: false,
        }, () => {}];
      }
      return [value, () => {}];
    },
    useEffect: () => {},
    useCallback: (callback) => callback,
    useRef: (initial) => ({ current: initial }),
    createElement: (type, props, ...children) => {
      if (typeof type === 'function') {
        return type(props || {});
      }
      return { type, props: props || {}, children };
    },
  };

  try {
    // eslint-disable-next-line no-eval
    (0, eval)(consentsSource);
    return window.HEYS.Consents.ConsentScreen({
      clientId: 'client-1',
      phone: '+79001234567',
      outdatedTypes: [{ type: 'health_data' }],
      onComplete: vi.fn(),
      onCancel: vi.fn(),
      onError: vi.fn(),
    });
  } finally {
    window.HEYS = previousHEYS;
    window.React = previousReact;
    window.__HEYS_READONLY_MODE__ = previousReadonly;
  }
}

function collectText(node, output = []) {
  if (typeof node === 'string') output.push(node);
  if (!node || typeof node !== 'object') return output;
  for (const child of node.children || []) collectText(child, output);
  return output;
}

describe('consent readonly stable copy', () => {
  it('does not block app entry on ConsentScreen when readonly and consents are outdated', () => {
    const gate = buildGate();
    expect(gate?.type).not.toBe(window.HEYS?.Consents?.ConsentScreen);
  });

  it('still blocks entry on ConsentScreen outside readonly hosts', () => {
    const previousHEYS = window.HEYS;
    const previousReact = window.React;
    const previousReadonly = window.__HEYS_READONLY_MODE__;

    window.__HEYS_READONLY_MODE__ = { enabled: false };
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
      evalGateSource();
      const gate = window.HEYS.AppGateFlow.buildConsentGate({
        gate: null,
        desktopGate: null,
        cloudUser: null,
        clientId: 'client-1',
        needsConsent: false,
        checkingConsent: false,
        setNeedsConsent: () => {},
        setShowMorningCheckin: () => {},
        outdatedTypes: [{ type: 'health_data' }],
        mustBlockReconsent: false,
      });

      expect(gate).toBeTruthy();
      expect(gate.type).toBe(window.HEYS.Consents.ConsentScreen);
    } finally {
      window.HEYS = previousHEYS;
      window.React = previousReact;
      window.__HEYS_READONLY_MODE__ = previousReadonly;
    }
  });

  it('shows readonly banner on ConsentScreen', () => {
    const tree = renderConsentScreenWithAcceptedConsents();
    const banner = collectElements(tree).find(
      (node) => node.props?.['data-testid'] === 'consents-readonly-banner'
    );

    expect(banner).toBeTruthy();
    expect(collectText(banner).join(' ')).toContain('Согласия не сохраняются');
  });

  it('does not call log_consents RPC helpers when continuing in readonly', async () => {
    const previousHEYS = window.HEYS;
    const previousReact = window.React;
    const previousReadonly = window.__HEYS_READONLY_MODE__;
    const logConsentsBySession = vi.fn();
    const logConsents = vi.fn();
    const onComplete = vi.fn();

    window.__HEYS_READONLY_MODE__ = { enabled: true };
    window.HEYS = {
      BlankScreenGuard: { reportVisibleFrame: () => {} },
      YandexAPI: { logConsentsBySession, logConsents },
    };
    window.React = {
      useState: (initial) => {
        const value = typeof initial === 'function' ? initial() : initial;
        if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'user_agreement')) {
          return [{
            user_agreement: true,
            personal_data: true,
            health_data: true,
            marketing: false,
          }, () => {}];
        }
        return [value, () => {}];
      },
      useEffect: () => {},
      useCallback: (callback) => callback,
      useRef: (initial) => ({ current: initial }),
      createElement: (type, props, ...children) => {
        if (typeof type === 'function') {
          return type(props || {});
        }
        return { type, props: props || {}, children };
      },
    };

    try {
      // eslint-disable-next-line no-eval
      (0, eval)(consentsSource);
      const tree = window.HEYS.Consents.ConsentScreen({
        clientId: 'client-1',
        phone: '+79001234567',
        outdatedTypes: [{ type: 'health_data' }],
        onComplete,
        onCancel: vi.fn(),
        onError: vi.fn(),
      });

      const continueButton = collectElements(tree).find(
        (node) => node.type === 'button'
          && collectText(node).join(' ').includes('Продолжить')
          && typeof node.props?.onClick === 'function'
      );
      expect(continueButton).toBeTruthy();

      await continueButton.props.onClick({
        preventDefault: () => {},
        stopPropagation: () => {},
      });

      expect(logConsentsBySession).not.toHaveBeenCalled();
      expect(logConsents).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledOnce();
    } finally {
      window.HEYS = previousHEYS;
      window.React = previousReact;
      window.__HEYS_READONLY_MODE__ = previousReadonly;
    }
  });
});
