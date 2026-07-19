import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const runtimeEffectsSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_runtime_effects_v1.js'),
  'utf8',
);

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const LEGAL_VERSIONS = {
  required: ['user_agreement', 'personal_data', 'health_data'],
  user_agreement: '1.6',
  personal_data: '1.5',
  health_data: '1.3',
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('offline consent validation cache', () => {
  it('resumes an authenticated client offline only from a version-matched scoped proof', () => {
    const previousHEYS = window.HEYS;
    const events = [];
    const state = { needsConsent: null, checkingConsent: null, error: null };
    let cleanup = null;

    localStorage.setItem('heys_pin_auth_client', CLIENT_ID);
    localStorage.setItem(`heys_${CLIENT_ID}_consent_validation_v1`, JSON.stringify({
      version: 1,
      clientId: CLIENT_ID,
      requiredVersions: {
        user_agreement: '1.6',
        personal_data: '1.5',
        health_data: '1.3',
      },
      validatedAt: Date.now(),
    }));
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    window.addEventListener('heys:consents-state-changed', (event) => events.push(event.detail), { once: true });
    window.HEYS = {
      LegalVersions: LEGAL_VERSIONS,
      cloud: { isPinAuthClient: () => true },
      Consents: { api: { checkRequiredVersioned: vi.fn() } },
    };

    try {
      // eslint-disable-next-line no-eval
      (0, eval)(runtimeEffectsSource);
      window.HEYS.AppRuntimeEffects.useConsentCheck({
        React: { useEffect: (effect) => { cleanup = effect(); } },
        clientId: CLIENT_ID,
        cloudUser: null,
        setNeedsConsent: (value) => { state.needsConsent = value; },
        setCheckingConsent: (value) => { state.checkingConsent = value; },
        setOutdatedTypes: () => {},
        setGraceExpiresAt: () => {},
        setMustBlockReconsent: () => {},
        setNeedsAgeGate: () => {},
        setConsentCheckError: (value) => { state.error = value; },
      });

      expect(window.HEYS.Consents.api.checkRequiredVersioned).not.toHaveBeenCalled();
      expect(window.HEYS._consentsChecked).toBe(true);
      expect(window.HEYS._consentsValid).toBe(true);
      expect(state).toEqual({ needsConsent: false, checkingConsent: false, error: null });
      expect(events).toContainEqual({
        valid: true,
        needsConsent: false,
        source: 'offline-consent-cache',
      });
    } finally {
      if (typeof cleanup === 'function') cleanup();
      window.HEYS = previousHEYS;
    }
  });

  it('keeps an authenticated screen unblocked during online revalidation', async () => {
    const previousHEYS = window.HEYS;
    const state = { needsConsent: null, checkingConsent: null, error: null };
    let cleanup = null;
    let resolveCheck;
    const pendingCheck = new Promise((resolve) => { resolveCheck = resolve; });

    localStorage.setItem('heys_pin_auth_client', CLIENT_ID);
    localStorage.setItem(`heys_${CLIENT_ID}_consent_validation_v1`, JSON.stringify({
      version: 1,
      clientId: CLIENT_ID,
      requiredVersions: {
        user_agreement: '1.6',
        personal_data: '1.5',
        health_data: '1.3',
      },
      validatedAt: Date.now(),
    }));
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    window.HEYS = {
      LegalVersions: LEGAL_VERSIONS,
      cloud: { isPinAuthClient: () => true },
      Consents: { api: { checkRequiredVersioned: vi.fn(() => pendingCheck) } },
    };

    try {
      // eslint-disable-next-line no-eval
      (0, eval)(runtimeEffectsSource);
      window.HEYS.AppRuntimeEffects.useConsentCheck({
        React: { useEffect: (effect) => { cleanup = effect(); } },
        clientId: CLIENT_ID,
        cloudUser: null,
        setNeedsConsent: (value) => { state.needsConsent = value; },
        setCheckingConsent: (value) => { state.checkingConsent = value; },
        setOutdatedTypes: () => {},
        setGraceExpiresAt: () => {},
        setMustBlockReconsent: () => {},
        setNeedsAgeGate: () => {},
        setConsentCheckError: (value) => { state.error = value; },
      });

      expect(window.HEYS.Consents.api.checkRequiredVersioned).toHaveBeenCalledOnce();
      expect(window.HEYS._consentsValid).toBe(true);
      expect(state).toEqual({ needsConsent: false, checkingConsent: false, error: null });

      resolveCheck({ valid: true, outdated: [], mustBlock: false, ageConfirmed: true });
      await Promise.resolve();
      expect(state).toEqual({ needsConsent: false, checkingConsent: false, error: null });
    } finally {
      if (typeof cleanup === 'function') cleanup();
      window.HEYS = previousHEYS;
    }
  });
});
