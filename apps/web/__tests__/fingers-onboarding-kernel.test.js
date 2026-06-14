// fingers-onboarding-kernel.test.js — Fingers onboarding uses kernel prefill helpers.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');

function storageMock(seed) {
  const store = Object.assign({}, seed || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store: store
  };
}

function boot(seed) {
  globalThis.window = globalThis;
  globalThis.localStorage = storageMock(seed);
  globalThis.window.localStorage = globalThis.localStorage;
  globalThis.HEYS = globalThis.window.HEYS = {
    currentClientId: 'c1',
    utils: {
      lsGet: (k, d) => {
        const raw = globalThis.localStorage.getItem(k);
        return raw ? JSON.parse(raw) : d;
      },
      lsSet: (k, v) => { globalThis.localStorage.setItem(k, JSON.stringify(v)); }
    }
  };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_onboarding_v1.js'), 'utf8'));
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, 'fingers', 'heys_fingers_onboarding_v1.js'), 'utf8'));
}

describe('fingers onboarding kernel path', () => {
  beforeEach(() => {
    delete globalThis.HEYS;
    delete globalThis.localStorage;
  });

  it('prefills age from global birthDate and normalizes legacy theme through kernel', () => {
    boot({
      heys_profile: JSON.stringify({
        birthDate: '2000-06-13',
        fingerboardProfile: { themeId: 'B', level: 'intermediate' }
      })
    });
    expect(globalThis.HEYS.TrainingKernel.onboarding).toBeTruthy();
    const state = globalThis.HEYS.Fingers.getOnboardingState();
    expect(state.profile.age).toBeGreaterThanOrEqual(25);
    expect(state.themeId).toBe('C');
    expect(state.profile.level).toBe('intermediate');
  });
});
