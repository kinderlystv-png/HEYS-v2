import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const runtimeEffectsSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_runtime_effects_v1.js'),
  'utf8',
);
const consentsSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_consents_v1.js'),
  'utf8',
);
const serviceWorkerSource = fs.readFileSync(
  path.resolve(__dirname, '../public/sw.js'),
  'utf8',
);

const LEGAL_DOC_URLS = [
  '/docs/v1.11/user-agreement.md',
  '/docs/v1.0/personal-data-consent.md',
  '/docs/v1.5/health-data-consent.md',
  '/docs/v1.4/marketing-consent.md',
  '/docs/v1.2/push-notifications-consent.md',
  '/docs/v1.2/speech-transcription-consent.md',
  '/docs/v1.0/supplements-consent.md',
  '/docs/v1.0/body-measurements-consent.md',
];

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const LEGAL_VERSIONS = {
  required: ['user_agreement', 'personal_data'],
  user_agreement: '1.6',
  personal_data: '1.6',
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function loadConsentsModule(heys = {}) {
  const previousHEYS = window.HEYS;
  const previousReact = window.React;
  window.HEYS = heys;
  window.React = {
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useCallback: (callback) => callback,
    useRef: (initial) => ({ current: initial }),
    useMemo: (factory) => factory(),
    createElement: () => null,
    Fragment: 'fragment',
  };

  try {
    // eslint-disable-next-line no-eval
    (0, eval)(consentsSource);
    return window.HEYS.Consents;
  } finally {
    window.HEYS = previousHEYS;
    window.React = previousReact;
  }
}

function loadFetchLegalMarkdown() {
  return loadConsentsModule().fetchLegalMarkdown;
}

describe('registration push timing', () => {
  it('keeps opt-in pending until the final registration step and consumes it once', async () => {
    const setEnabled = vi.fn().mockResolvedValue({ ok: true });
    const Consents = loadConsentsModule({ push: { setEnabled } });

    expect(Consents.setPendingRegistrationPushOptIn(CLIENT_ID, true)).toBe(true);
    expect(Consents.hasPendingRegistrationPushOptIn(CLIENT_ID)).toBe(true);
    expect(setEnabled).not.toHaveBeenCalled();

    await expect(Consents.completePendingRegistrationPushOptIn(CLIENT_ID)).resolves.toEqual({ ok: true });
    await expect(Consents.completePendingRegistrationPushOptIn(CLIENT_ID)).resolves.toEqual({
      ok: true,
      skipped: 'not_requested',
    });
    expect(setEnabled).toHaveBeenCalledTimes(1);
    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(Consents.hasPendingRegistrationPushOptIn(CLIENT_ID)).toBe(false);
  });

  it('does not invoke push directly from finishConsentFlow', () => {
    const start = consentsSource.indexOf('const finishConsentFlow');
    const end = consentsSource.indexOf('const persistConsentsOrRequestAccessCode', start);
    const finishBlock = consentsSource.slice(start, end);
    expect(finishBlock).toContain('setPendingRegistrationPushOptIn(clientId, notificationsOptIn)');
    expect(finishBlock).not.toContain('HEYS.push.setEnabled(true)');
  });
});

describe('offline legal document cache', () => {
  it('pre-caches every versioned consent document and serves markdown network-first', () => {
    LEGAL_DOC_URLS.forEach((url) => {
      expect(serviceWorkerSource).toContain(`'${url}'`);
      expect(fs.existsSync(path.resolve(__dirname, '../public', url.slice(1)))).toBe(true);
    });
    expect(serviceWorkerSource).toContain('return Promise.all([cssPrecache, legalPrecache]);');
    expect(serviceWorkerSource).toMatch(
      /if \(url\.pathname\.endsWith\('\.md'\)\) \{\s*event\.respondWith\(networkFirstNoStore\(request\)\)/,
    );
    expect(serviceWorkerSource).toContain('!LEGAL_DOC_URLS.includes(new URL(req.url).pathname)');
  });

  it('reads a legal document from Cache Storage when the network is unavailable', async () => {
    const previousCaches = window.caches;
    const markdown = '# Пользовательское соглашение\n\n**Версия:** 1.11';
    const cacheMatch = vi.fn(async () => ({
      ok: true,
      text: async () => markdown,
    }));
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { match: cacheMatch },
    });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    try {
      const fetchLegalMarkdown = loadFetchLegalMarkdown();
      await expect(fetchLegalMarkdown(LEGAL_DOC_URLS[0])).resolves.toBe(markdown);
      expect(cacheMatch).toHaveBeenCalledWith(LEGAL_DOC_URLS[0]);
    } finally {
      Object.defineProperty(window, 'caches', {
        configurable: true,
        value: previousCaches,
      });
    }
  });
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
        personal_data: '1.6',
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
        personal_data: '1.6',
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
