// fingers-mix-engine.test.js — role-based mix engine.
// Покрывает: slot-шаблоны по bucket, roleOf, grip-balance (нет дублей grip+edge),
// обязательный antagonist-closer, и safety-инварианты (bucket режет goal,
// recovery/rest → нет max, pain → нет max, age fail-closed, under-18 → нет max).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  // Модули движка/каталогов не используют React, но шим безопаснее.
  globalThis.React = globalThis.window.React = {
    createElement: (...a) => ({ __el: true, a }), Fragment: 'F',
    useState: (i) => [typeof i === 'function' ? i() : i, () => {}],
    useMemo: (fn) => fn(), useEffect: () => {}, useCallback: (fn) => fn, useRef: (i) => ({ current: i }),
  };
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  ev('heys_fingers_grips_catalog_v1.js');
  ev('heys_fingers_programs_catalog_v1.js');
  ev('heys_fingers_age_gating_v1.js');
  ev('heys_fingers_mix_engine_v1.js');
};

const F = () => globalThis.HEYS.Fingers;
const E = () => globalThis.HEYS.Fingers.mixEngine;
const roles = (p) => (p.exercises || []).map((e) => e.__role);

describe('mixEngine: roleOf + slot templates', () => {
  beforeAll(setupOnce);

  it('slot-шаблоны по bucket', () => {
    expect(E()._slotTemplateFor('max')).toEqual(['max-strength', 'strength-endurance', 'antagonist']);
    expect(E()._slotTemplateFor('moderate')).toEqual(['strength-endurance', 'capacity', 'antagonist']);
    expect(E()._slotTemplateFor('recovery')).toEqual(['capacity', 'antagonist']);
  });

  it('roleOf: явный role → спец antagonist → по intensity', () => {
    const r = (id) => E()._roleOf(F().getProgramById(id));
    expect(r('horst_max_hangs')).toBe('max-strength');
    expect(r('repeaters_7_3')).toBe('strength-endurance');
    expect(r('antagonist_bands')).toBe('antagonist');
    expect(r('cf_test')).toBe('test');
    expect(r('sub_cf_capacity')).toBe('capacity');
    expect(r('abrahangs_daily')).toBe('connective');
  });
});

describe('mixEngine: max bucket сборка', () => {
  beforeAll(setupOnce);

  it('возвращает валидную __generated программу', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    expect(p).toBeTruthy();
    expect(p.__generated).toBe(true);
    expect(p.exercises.length).toBeGreaterThan(0);
    expect(p.intensity).toBe('max');
    expect(typeof p.coachReason).toBe('string');
  });

  it('есть max-strength, antagonist — последний', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    const rs = roles(p);
    expect(rs).toContain('max-strength');
    expect(rs[rs.length - 1]).toBe('antagonist');
  });

  it('grip-balance: нет двух упражнений на одном grip+edge', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    const keys = p.exercises.map((e) => e.gripId + '_' + e.edgeSizeMm);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('max-strength anchor — half-crimp при наличии', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    const ms = p.exercises.find((e) => e.__role === 'max-strength');
    expect(ms && ms.gripId).toBe('halfcrimp');
  });

  it('cf_test (excludeFromMix) никогда не попадает в микс', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    expect(p.exercises.every((e) => e.__fromProgram !== 'cf_test')).toBe(true);
  });
});

describe('mixEngine: safety — bucket режет goal', () => {
  beforeAll(setupOnce);

  it('readiness recovery → нет max-слота, intensity recovery', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'recovery' });
    expect(p.intensity).toBe('recovery');
    expect(p.exercises.every((e) => e.__role !== 'max-strength')).toBe(true);
  });

  it('readiness rest → ceiling recovery (нет max)', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'rest' });
    expect(p.intensity).toBe('recovery');
    expect(p.exercises.every((e) => e.__role !== 'max-strength')).toBe(true);
  });

  it('goal=max при readiness=recovery → bucket recovery (safety сильнее цели)', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'max', age: 25, readiness: 'recovery' });
    expect(p.intensity).toBe('recovery');
    expect(p.exercises.every((e) => e.__role !== 'max-strength')).toBe(true);
  });
});

describe('mixEngine: antagonist-closer', () => {
  beforeAll(setupOnce);

  it('antagonist включён даже при выборе только tier none и стоит последним', () => {
    const p = E().recommendDay({ equipmentTypes: ['none'], intensity: 'all', age: 25, readiness: 'moderate' });
    expect(p).toBeTruthy();
    const rs = roles(p);
    expect(rs).toContain('antagonist');
    expect(rs[rs.length - 1]).toBe('antagonist');
  });
});

describe('mixEngine: age + pain gates', () => {
  beforeAll(setupOnce);

  it('возраст не указан → null (fail-closed)', () => {
    expect(E().recommendDay({ equipmentTypes: ['full'], age: null, readiness: 'max' })).toBeNull();
    expect(E().recommendDay({ equipmentTypes: ['full'], age: NaN, readiness: 'max' })).toBeNull();
  });

  it('17 лет (no-max) → нет max-strength даже при readiness max', () => {
    const p = E().recommendDay({ equipmentTypes: ['full', 'none'], intensity: 'all', age: 17, readiness: 'max' });
    expect(p).toBeTruthy();
    expect(p.exercises.every((e) => e.__role !== 'max-strength')).toBe(true);
  });

  it('боль → потолок moderate (нет max-слота)', () => {
    const Fg = F();
    const origPain = Fg.recentFingerPain;
    const origGate = Fg.painGate;
    Fg.recentFingerPain = () => ({ hasPain: true });
    Fg.painGate = { filterGripsForPain: (grips) => grips.filter((g) => g.id !== 'fullcrimp' && g.id !== 'mono') };
    try {
      const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'max', age: 25, readiness: 'max' });
      expect(p).toBeTruthy();
      expect(p.intensity).not.toBe('max');
      expect(p.exercises.every((e) => e.__role !== 'max-strength')).toBe(true);
    } finally {
      Fg.recentFingerPain = origPain;
      Fg.painGate = origGate;
    }
  });
});
