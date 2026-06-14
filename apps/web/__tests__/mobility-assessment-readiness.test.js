// mobility-assessment-readiness.test.js — assessment/onboarding/readiness.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');
const KERNEL_DIR = path.resolve(__dirname, '..', '_kernel');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_onboarding_v1.js'), 'utf8'));
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(MOB_DIR, f), 'utf8')); };
  ev('heys_mobility_assessment_v1.js');
  ev('heys_mobility_onboarding_v1.js');
  ev('heys_mobility_readiness_v1.js');
};

const M = () => globalThis.HEYS.Mobility;

describe('mobility assessment', () => {
  beforeAll(setupOnce);

  it('scoreMeasurement считает deficit к норме', () => {
    const r = M().assessment.scoreMeasurement({ testId: 'ankle_dorsiflexion', measure: 10 });
    expect(r.ok).toBe(true);
    expect(r.deficit).toBeCloseTo(0.5);
  });

  it('limiterAudit выбирает ceiling и веса D/E/F при ROM-дефиците', () => {
    const audit = M().assessment.limiterAudit([{ testId: 'ankle_dorsiflexion', measure: 12 }]);
    expect(audit.leadingLimiter.type).toBe('ceiling');
    expect(audit.leadingLimiter.jointRegion).toBe('ankle');
    expect(audit.blockWeights.D).toBeGreaterThan(0);
  });

  it('active-passive gap классифицируется как control', () => {
    const r = M().assessment.scoreMeasurement({ testId: 'shoulder_er', measure: 90, activeROM: 55, passiveROM: 85 });
    expect(M().assessment.classifyLimiter(r).type).toBe('control');
  });

  it('retestDue срабатывает после 6 недель', () => {
    expect(M().assessment.retestDue('2026-01-01', '2026-02-20', 6)).toBe(true);
    expect(M().assessment.retestDue('2026-01-01', '2026-01-20', 6)).toBe(false);
  });
});

describe('mobility onboarding', () => {
  beforeAll(setupOnce);

  it('normalizeProfile чистит неизвестные enum значения', () => {
    const p = M().onboarding.normalizeProfile({
      age: 30,
      level: 'pro',
      populations: ['desk', 'unknown'],
      equipment: ['band', 'rope'],
      goal: 'magic'
    });
    expect(p.level).toBe('beginner');
    expect(p.populations).toEqual(['desk']);
    expect(p.equipment).toEqual(['band']);
    expect(p.goal).toBe('morning');
  });

  it('validateProfile fail-closed по возрасту и предупреждает гипермобильность', () => {
    const r = M().onboarding.validateProfile({ populations: ['hypermobile'], acceptedDisclaimer: true });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'onboarding.age_missing')).toBe(true);
    expect(r.issues.some((i) => i.code === 'onboarding.hypermobile_stability')).toBe(true);
  });

  it('recommendMode мапит цель на режим', () => {
    expect(M().onboarding.recommendMode({ goal: 'relax' }, {})).toBe('evening_relax');
    expect(M().onboarding.recommendMode({}, { timeOfDay: 'morning' })).toBe('morning_tonify');
  });

  it('recommendMode учитывает desk-популяцию без явной цели', () => {
    expect(M().onboarding.recommendMode({ populations: ['desk'] }, {})).toBe('anti_sedentary');
  });
});

describe('mobility readiness', () => {
  beforeAll(setupOnce);

  it('readiness red остаётся advisory и не блокирует', () => {
    const r = M().readiness.score({ stiffness: 10, soreness: 10, sleepQuality: 2, stress: 9, hrvToday: 40, hrvBaseline: 60, hrvMad: 5 });
    expect(r.band).toBe('red');
    expect(r.blocksSession).toBe(false);
  });

  it('hrvZ считает robust z-score', () => {
    expect(M().readiness.hrvZ(50, 60, 5)).toBeCloseTo(-1.349, 2);
  });
});
