// fingers-profile-store.test.js — shared Fingers profile resolver.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

function boot(initialProfile = {}) {
  const store = new Map([['heys_profile', initialProfile]]);
  globalThis.window = globalThis;
  globalThis.HEYS = globalThis.window.HEYS = {
    utils: {
      lsGet: (key, fallback) => store.has(key) ? store.get(key) : fallback,
      lsSet: (key, value) => { store.set(key, value); return true; }
    }
  };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(FINGERS_DIR, 'heys_fingers_profile_store_v1.js'), 'utf8'));
  return { store, Fingers: globalThis.HEYS.Fingers };
}

describe('Fingers profile store', () => {
  beforeEach(() => {
    delete globalThis.HEYS;
    delete globalThis.window;
  });

  it('merges global profile fields with fingerboardProfile', () => {
    const { Fingers } = boot({
      birthDate: '1996-04-20',
      weight: 72.5,
      fingerboardProfile: {
        level: 'advanced',
        completedPrerequisites: ['base_>=1y', 'base_>=1y', 'strength_base'],
        goal: 'strength'
      }
    });

    const profile = Fingers.getProfile();
    expect(profile.level).toBe('advanced');
    expect(profile.bodyWeightKg).toBe(72.5);
    expect(profile.completedPrerequisites).toEqual(['base_>=1y', 'strength_base']);
    expect(profile.goal).toBe('strength');
    expect(profile.age).toBeGreaterThan(0);
  });

  it('saveProfilePatch writes only fingerboardProfile and preserves global fields', () => {
    const { store, Fingers } = boot({
      name: 'Client',
      age: 31,
      weight: 68,
      fingerboardProfile: { goal: 'endurance' }
    });

    expect(Fingers.saveProfilePatch({
      level: 'elite',
      completedPrerequisites: ['base_>=2y', '', 'base_>=2y']
    })).toBe(true);

    const saved = store.get('heys_profile');
    expect(saved.name).toBe('Client');
    expect(saved.age).toBe(31);
    expect(saved.weight).toBe(68);
    expect(saved.fingerboardProfile).toEqual({
      goal: 'endurance',
      level: 'elite',
      completedPrerequisites: ['base_>=2y']
    });
  });

  it('reads fresh profile state on every getProfile call', () => {
    const { store, Fingers } = boot({
      fingerboardProfile: { level: 'beginner' }
    });

    expect(Fingers.getProfile().level).toBe('beginner');
    store.set('heys_profile', { fingerboardProfile: { level: 'intermediate' } });
    expect(Fingers.getProfile().level).toBe('intermediate');
  });

  it('normalizes unknown level to null and missing prerequisites to []', () => {
    const { Fingers } = boot({
      fingerboardProfile: { level: 'pro', completedPrerequisites: 'base_>=2y' }
    });

    expect(Fingers.getProfile().level).toBeNull();
    expect(Fingers.getProfile().completedPrerequisites).toEqual([]);
  });

  it('normalizes readinessOverride and skinStatus enums', () => {
    const { store, Fingers } = boot({
      fingerboardProfile: {
        readinessOverride: 'max',
        skinStatus: 'flapper'
      }
    });

    expect(Fingers.getProfile().readinessOverride).toBe('max');
    expect(Fingers.getProfile().skinStatus).toBe('flapper');

    expect(Fingers.saveProfilePatch({
      readinessOverride: 'too-hard',
      skinStatus: 'unknown'
    })).toBe(true);

    const saved = store.get('heys_profile').fingerboardProfile;
    expect(saved.readinessOverride).toBeNull();
    expect(saved.skinStatus).toBeNull();
    expect(Fingers.getProfile().readinessOverride).toBeNull();
    expect(Fingers.getProfile().skinStatus).toBeNull();
  });
});
