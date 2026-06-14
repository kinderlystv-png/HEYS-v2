// kernel-onboarding.test.js — profile/onboarding primitives.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KERNEL_DIR = path.resolve(__dirname, '..', '_kernel');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_onboarding_v1.js'), 'utf8'));
};

const O = () => globalThis.HEYS.TrainingKernel.onboarding;

describe('kernel onboarding', () => {
  beforeAll(setupOnce);

  it('uniqueKnown чистит неизвестные значения и сохраняет первый порядок', () => {
    expect(O().uniqueKnown(['desk', 'desk', 'unknown', 'older'], ['desk', 'older']))
      .toEqual(['desk', 'older']);
  });

  it('ageFromBirthDate считает возраст с учётом дня рождения', () => {
    expect(O().ageFromBirthDate('2000-06-15', { now: '2026-06-14T12:00:00Z' })).toBe(25);
    expect(O().ageFromBirthDate('2000-06-13', { now: '2026-06-14T12:00:00Z' })).toBe(26);
    expect(O().ageFromBirthDate('bad')).toBeNull();
  });

  it('normalizeProfile применяет schema для number/enum/list/boolean/passthrough', () => {
    const out = O().normalizeProfile({
      age: '30',
      level: 'pro',
      populations: ['desk', 'unknown', 'desk'],
      acceptedDisclaimer: true,
      note: 'ok'
    }, {
      fields: {
        age: { type: 'number', default: null },
        level: { type: 'enum', allowed: ['beginner', 'advanced'], default: 'beginner' },
        populations: { type: 'list', allowed: ['desk', 'older'] },
        acceptedDisclaimer: { type: 'boolean', default: false },
        note: { type: 'passthrough', default: '' }
      }
    });
    expect(out).toEqual({
      age: 30,
      level: 'beginner',
      populations: ['desk'],
      acceptedDisclaimer: true,
      note: 'ok'
    });
  });
});
