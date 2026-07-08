import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const stepModalSource = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
const profileStepSource = fs.readFileSync(path.resolve(__dirname, '../heys_profile_step_v1.js'), 'utf8');
const morningCheckinSource = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');
const appMorningCheckinSource = fs.readFileSync(path.resolve(__dirname, '../heys_app_morning_checkin_v1.js'), 'utf8');
const runtimeEffectsSource = fs.readFileSync(path.resolve(__dirname, '../heys_app_runtime_effects_v1.js'), 'utf8');
const consentsSource = fs.readFileSync(path.resolve(__dirname, '../heys_consents_v1.js'), 'utf8');
const appOnboardingSource = fs.readFileSync(path.resolve(__dirname, '../heys_app_onboarding_v1.js'), 'utf8');
const uiOnboardingSource = fs.readFileSync(path.resolve(__dirname, '../heys_ui_onboarding_v1.js'), 'utf8');
const userTabSource = fs.readFileSync(path.resolve(__dirname, '../heys_user_tab_impl_v1.js'), 'utf8');
const legacyUserSource = fs.readFileSync(path.resolve(__dirname, '../heys_user_v12.js'), 'utf8');

describe('first login onboarding guardrails', () => {
  it('waits for async step saves before moving forward', () => {
    expect(stepModalSource).toContain('await result');
    expect(stepModalSource).toContain('await saveStepConfig');
    expect(stepModalSource).toContain('await completionResult');
    expect(stepModalSource).toContain('Сохраняю...');
    expect(profileStepSource).toContain('return syncCurrentClientName(fullName,');
    expect(profileStepSource).toContain('profile_sync_timeout');
    expect(profileStepSource).toContain('return HEYS.cloud.flushPendingQueue(10000)');
    expect(morningCheckinSource).toContain('checkin_sync_timeout');
  });

  it('does not allow first-login check-in skip or close-through', () => {
    expect(profileStepSource).not.toContain('Пока пропустить и ознакомиться с приложением');
    expect(profileStepSource).not.toContain('heys_morning_checkin_done');
    expect(morningCheckinSource).toContain('Завершите первый вход');
    expect(morningCheckinSource).toContain('обязательный чек-ин');
  });

  it('keeps registration blocked until required consents are valid', () => {
    expect(runtimeEffectsSource).toContain('Consent check failed — keeping consent form closed');
    expect(runtimeEffectsSource).toContain('setConsentCheckError && setConsentCheckError(checkError)');
    expect(runtimeEffectsSource).toContain('needsConsent: false');
    expect(runtimeEffectsSource).toContain('checkError: true');
    expect(runtimeEffectsSource).not.toContain('Promise.resolve({ valid: true, missing: [], outdated: [], mustBlock: false, ageConfirmed: true })');
    expect(runtimeEffectsSource).not.toContain('versioned failed for PIN session — blocking client flow');
    expect(runtimeEffectsSource).toContain('effectiveConsentValid');
    expect(runtimeEffectsSource).toContain('HEYS._consentsValid = effectiveConsentValid');
    expect(consentsSource).toContain('heys:consents-ready');
    expect(appMorningCheckinSource).toContain('heys:consents-state-changed');
    expect(morningCheckinSource).toContain('HEYS._consentsValid !== true');
    expect(morningCheckinSource).toContain('defer registration/check-in');
  });

  it('treats PIN consent API failures as load errors, not missing consents', async () => {
    const previousHEYS = window.HEYS;
    const previousLocalStorageGetItem = window.localStorage.getItem;
    const previousAddEventListener = window.addEventListener;
    const previousRemoveEventListener = window.removeEventListener;
    const previousDispatchEvent = window.dispatchEvent;
    const previousCustomEvent = window.CustomEvent;
    const calls = [];
    let cleanupEffect = null;
    const state = {
      needsConsent: null,
      checkingConsent: null,
      consentCheckError: null,
      mustBlockReconsent: null,
    };

    window.CustomEvent = class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
    window.localStorage.getItem = (key) => (key === 'heys_pin_auth_client' ? 'client-1' : null);
    window.addEventListener = () => {};
    window.removeEventListener = () => {};
    window.dispatchEvent = (event) => {
      calls.push(event);
      return true;
    };
    window.HEYS = {
      cloud: { isPinAuthClient: () => true },
      Consents: {
        api: {
          checkRequiredVersioned: async () => ({ error: 'API not ready' }),
        },
      },
    };

    try {
      // eslint-disable-next-line no-eval
      (0, eval)(runtimeEffectsSource);
      window.HEYS.AppRuntimeEffects.useConsentCheck({
        React: {
          useEffect: (fn) => {
            cleanupEffect = fn();
          },
        },
        clientId: 'client-1',
        cloudUser: null,
        setNeedsConsent: (value) => { state.needsConsent = value; },
        setCheckingConsent: (value) => { state.checkingConsent = value; },
        setOutdatedTypes: () => {},
        setGraceExpiresAt: () => {},
        setMustBlockReconsent: (value) => { state.mustBlockReconsent = value; },
        setNeedsAgeGate: () => {},
        setConsentCheckError: (value) => { state.consentCheckError = value; },
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(state.needsConsent).toBe(false);
      expect(state.checkingConsent).toBe(false);
      expect(state.mustBlockReconsent).toBe(false);
      expect(state.consentCheckError).toEqual(expect.objectContaining({
        source: 'consent-check-error',
        message: 'API not ready',
      }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'heys:consents-state-changed',
          detail: expect.objectContaining({
            needsConsent: false,
            checkError: true,
          }),
        }),
      ]));
    } finally {
      if (typeof cleanupEffect === 'function') cleanupEffect();
      window.HEYS = previousHEYS;
      window.localStorage.getItem = previousLocalStorageGetItem;
      window.addEventListener = previousAddEventListener;
      window.removeEventListener = previousRemoveEventListener;
      window.dispatchEvent = previousDispatchEvent;
      window.CustomEvent = previousCustomEvent;
    }
  });

  it('does not show legal consent gates inside the public landing demo', () => {
    expect(runtimeEffectsSource).toContain('window.__HEYS_DEMO_MODE__ && window.__HEYS_DEMO_MODE__.enabled');
    expect(runtimeEffectsSource).toContain("source: 'demo-mode'");
    expect(runtimeEffectsSource).toContain('HEYS._consentsValid = true');
  });

  it('keeps the outdated onboarding tour disabled until it is updated', () => {
    expect(appOnboardingSource).toContain('const ONBOARDING_TOUR_ENABLED = false');
    expect(appOnboardingSource).toContain("reason: 'disabled'");
    expect(appOnboardingSource).toContain('isEnabled: () => ONBOARDING_TOUR_ENABLED');
    expect(uiOnboardingSource).toContain('const ONBOARDING_TOUR_ENABLED = false');
    expect(uiOnboardingSource).toContain('return false;');
    expect(uiOnboardingSource).toContain('isEnabled()');
    expect(userTabSource).not.toContain('OnboardingTour.start({ force: true })');
    expect(userTabSource).not.toContain('Запустить обучение заново');
    expect(legacyUserSource).not.toContain('OnboardingTour.start({ force: true })');
    expect(legacyUserSource).not.toContain('Запустить обучение заново');
  });
});

describe('first login profile identity', () => {
  it('collects first and last name separately and syncs full name to curator clients', () => {
    expect(profileStepSource).toContain('Имя *');
    expect(profileStepSource).toContain('Фамилия');
    expect(profileStepSource).toContain('const lastName = profile.lastName || pendingNameParts.lastName ||');
    expect(profileStepSource).toContain('profile.lastName = lastName');
    expect(profileStepSource).toContain('profile.displayName = fullName');
    expect(profileStepSource).toContain('p_name: cleanName');
    expect(profileStepSource).toContain("syncCurrentClientName(fullName, 'profile-personal', { syncCloud: true })");
    expect(profileStepSource).toContain("syncCurrentClientName(fullName, 'profile-wizard', { syncCloud: true })");
    expect(profileStepSource).toContain('name: fullName');
    expect(userTabSource).toContain('HEYS.utils.buildFullName');
    expect(legacyUserSource).toContain('HEYS.utils.buildFullName');
  });
});
