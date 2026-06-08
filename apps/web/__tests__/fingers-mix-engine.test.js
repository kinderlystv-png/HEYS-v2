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
    expect(E()._slotTemplateFor('max')).toEqual(['power', 'max-strength', 'strength-endurance', 'antagonist']);
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

describe('mixEngine Phase 2a: MVC auto-dosing (step 4)', () => {
  beforeAll(setupOnce);

  it('max-strength вес подставляется под 90% MVC, помечен __mvcDosed', () => {
    const Fg = F();
    const origRecords = Fg.records;
    const origBW = Fg.getBodyWeight;
    Fg.records = { getMVC: () => ({ type: 'weight', mvcKg: 80 }) };
    Fg.getBodyWeight = () => ({ kg: 70, source: 'profile' });
    try {
      const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
      const ms = p.exercises.find((e) => e.__role === 'max-strength');
      expect(ms).toBeTruthy();
      // 80*0.9 - 70 = 2.0 кг; ≤ 110% MVC (88-70=18) — без клампа
      expect(ms.addedWeightKg).toBe(2);
      expect(ms.__mvcDosed).toBe(true);
    } finally {
      Fg.records = origRecords;
      Fg.getBodyWeight = origBW;
    }
  });

  it('нет MVC → каталожный вес сохранён + флаг __needsMvc', () => {
    const Fg = F();
    const origRecords = Fg.records;
    Fg.records = { getMVC: () => null };
    try {
      const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
      const ms = p.exercises.find((e) => e.__role === 'max-strength');
      expect(ms.__needsMvc).toBe(true);
      expect(ms.__mvcDosed).toBeUndefined();
      // вес не дозируется (min-edge max-протоколы вообще bodyweight) — главное,
      // что движок не перетёр его и не пометил как dosed.
      expect(typeof ms.addedWeightKg).toBe('number');
    } finally {
      Fg.records = origRecords;
    }
  });

  it('нет records вообще → Phase 1 поведение (без флагов дозирования)', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    const ms = p.exercises.find((e) => e.__role === 'max-strength');
    expect(ms.__mvcDosed).toBeUndefined();
    expect(ms.__needsMvc).toBeUndefined();
  });
});

describe('mixEngine Phase 2a: RPE history-bias (step 5)', () => {
  beforeAll(setupOnce);

  it('хват с 2+ недавними hard деприоритизируется (анкор уступает)', () => {
    const Fg = F();
    const origFb = Fg.lastGripFeedback;
    Fg.lastGripFeedback = (gripId) => (gripId === 'halfcrimp' ? { rpe: ['hard', 'hard'], daysAgo: 1 } : { rpe: ['ok'], daysAgo: 5 });
    try {
      const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
      const ms = p.exercises.find((e) => e.__role === 'max-strength');
      // обычно анкор = halfcrimp; при недавних hard движок берёт другой хват
      expect(ms.gripId).not.toBe('halfcrimp');
    } finally {
      Fg.lastGripFeedback = origFb;
    }
  });

  it('старый hard (>2 дней) не штрафует — анкор half-crimp остаётся', () => {
    const Fg = F();
    const origFb = Fg.lastGripFeedback;
    Fg.lastGripFeedback = () => ({ rpe: ['hard', 'hard'], daysAgo: 7 });
    try {
      const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
      const ms = p.exercises.find((e) => e.__role === 'max-strength');
      expect(ms.gripId).toBe('halfcrimp');
    } finally {
      Fg.lastGripFeedback = origFb;
    }
  });
});

describe('mixEngine Phase 2a: MAV volume (step 8)', () => {
  beforeAll(setupOnce);

  it('recovery → объём не-антагонист блоков урезан, антагонист не тронут', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'recovery' });
    const cap = p.exercises.find((e) => e.__role === 'capacity');
    const ant = p.exercises.find((e) => e.__role === 'antagonist');
    // nelson_density_hangs: setsCount 5 → round(5*0.7)=4
    expect(cap.setsCount).toBeLessThan(5);
    expect(cap.setsCount).toBeGreaterThanOrEqual(1);
    // antagonist_bands: setsCount 3 — не трогаем
    if (ant) expect(ant.setsCount).toBe(3);
  });

  it('ни один хват не превышает MAV (5 рабочих сетов)', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    const byGrip = {};
    p.exercises.filter((e) => e.__role !== 'antagonist').forEach((e) => {
      byGrip[e.gripId] = (byGrip[e.gripId] || 0) + e.setsCount;
    });
    Object.values(byGrip).forEach((n) => expect(n).toBeLessThanOrEqual(5));
  });
});

describe('mixEngine Phase 2b: power slot (RFD recruitment_pulls)', () => {
  beforeAll(setupOnce);

  it('block tier + max → power-блок (recruitment_pulls) первым', () => {
    const p = E().recommendDay({ equipmentTypes: ['block'], intensity: 'all', age: 25, readiness: 'max' });
    expect(p).toBeTruthy();
    const rs = p.exercises.map((e) => e.__role);
    expect(rs[0]).toBe('power');
    const power = p.exercises.find((e) => e.__role === 'power');
    expect(power.__fromProgram).toBe('recruitment_pulls');
  });

  it('full tier → power-слот пуст (recruitment_pulls только block)', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    expect(p.exercises.every((e) => e.__role !== 'power')).toBe(true);
  });

  it('17 лет → нет power-блока (recruitment_pulls 18+)', () => {
    const p = E().recommendDay({ equipmentTypes: ['block'], intensity: 'all', age: 17, readiness: 'max' });
    expect(p.exercises.every((e) => e.__role !== 'power')).toBe(true);
  });
});

describe('mixEngine Phase 2b: warmup-bookend', () => {
  beforeAll(setupOnce);

  it('max-день требует ramp-разогрев', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    expect(p.requiresWarmup).toBe(true);
    expect(p.warmupType).toBe('ramp');
  });

  it('recovery-день — короткий разогрев, не ramp', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'recovery' });
    expect(p.requiresWarmup).toBe(false);
    expect(p.warmupType).toBe('quick');
  });
});

describe('mixEngine Phase 2b: goal axis (goal предлагает, bucket режет)', () => {
  beforeAll(setupOnce);

  it('GOALS экспортированы для UI', () => {
    expect(E().GOALS.map((g) => g.id)).toEqual(['strength', 'endurance', 'recovery', 'maintenance']);
  });

  it('cappedGoalTemplate: strength×max — полный шаблон', () => {
    expect(E()._cappedGoalTemplate('strength', 'max'))
      .toEqual(['power', 'max-strength', 'strength-endurance', 'antagonist']);
  });

  it('cappedGoalTemplate: strength×recovery — падает в recovery-дефолт (safety)', () => {
    expect(E()._cappedGoalTemplate('strength', 'recovery')).toEqual(['capacity', 'antagonist']);
  });

  it('cappedGoalTemplate: endurance×max — endurance, без max-силы', () => {
    expect(E()._cappedGoalTemplate('endurance', 'max'))
      .toEqual(['strength-endurance', 'capacity', 'antagonist']);
  });

  it('goal=endurance при readiness max → нет max/power, intensity moderate, без ramp', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], goal: 'endurance', age: 25, readiness: 'max' });
    expect(p.exercises.every((e) => e.__role !== 'max-strength' && e.__role !== 'power')).toBe(true);
    expect(p.intensity).toBe('moderate');
    expect(p.requiresWarmup).toBe(false);
  });

  it('goal=strength при readiness max → есть max-strength', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], goal: 'strength', age: 25, readiness: 'max' });
    expect(p.exercises.some((e) => e.__role === 'max-strength')).toBe(true);
  });

  it('goal=strength при readiness recovery → safety режет: нет max, intensity recovery', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], goal: 'strength', age: 25, readiness: 'recovery' });
    expect(p.exercises.every((e) => e.__role !== 'max-strength' && e.__role !== 'power')).toBe(true);
    expect(p.intensity).toBe('recovery');
  });
});

// Базовая регрессия safety ПЕРЕД strangler-рефактором логики (Фаза 1 / Шаг 1).
// Фиксирует инварианты, ещё НЕ покрытые тестами выше: danger-budget по bucket,
// порядок энергосистем в слотах, age-gate 14 лет, идемпотентность пересборки.
// Все ассерты сверены с живым движком node-зондом (vitest в CI — источник истины).
describe('mixEngine: safety regression (pre-strangler baseline)', () => {
  beforeAll(setupOnce);

  it('danger-budget: сумма dangerCost слотов ≤ DANGER_BUDGET[bucket] (max)', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'max' });
    const t = p.__trace;
    const cap = t.constants.DANGER_BUDGET[t.resolution.bucket];
    const spent = t.slots.reduce((s, sl) => s + (sl.chosen ? sl.chosen.dangerCost : 0), 0);
    expect(t.resolution.bucket).toBe('max');
    expect(spent).toBeLessThanOrEqual(cap);
  });

  it('danger-budget: соблюдается и в recovery (cap жёстче)', () => {
    const p = E().recommendDay({ equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'recovery' });
    const t = p.__trace;
    const cap = t.constants.DANGER_BUDGET[t.resolution.bucket];
    const spent = t.slots.reduce((s, sl) => s + (sl.chosen ? sl.chosen.dangerCost : 0), 0);
    expect(t.resolution.bucket).toBe('recovery');
    expect(spent).toBeLessThanOrEqual(cap);
  });

  it('порядок энергосистем: power/max-strength раньше strength-endurance/capacity', () => {
    const p = E().recommendDay({ equipmentTypes: ['block'], intensity: 'all', age: 25, readiness: 'max' });
    const rs = roles(p);
    const hardMax = Math.max(rs.indexOf('power'), rs.indexOf('max-strength'));
    const endurIdx = ['strength-endurance', 'capacity'].map((r) => rs.indexOf(r)).filter((i) => i >= 0);
    const minEndur = endurIdx.length ? Math.min(...endurIdx) : Infinity;
    expect(hardMax === -1 || hardMax < minEndur).toBe(true);
  });

  it('age-gate 14 лет: ни одного addedWeightKg>0 и нет max-strength/power', () => {
    const p = E().recommendDay({ equipmentTypes: ['full', 'block'], intensity: 'all', age: 14, readiness: 'max' });
    if (p === null) return; // fail-closed тоже допустимо
    expect(p.exercises.every((e) => !(Number(e.addedWeightKg) > 0))).toBe(true);
    expect(p.exercises.every((e) => e.__role !== 'max-strength' && e.__role !== 'power')).toBe(true);
  });

  it('идемпотентность: два вызова с тем же входом → те же роли, bucket, intensity', () => {
    const opt = { equipmentTypes: ['full'], intensity: 'all', age: 25, readiness: 'moderate' };
    const a = E().recommendDay(opt);
    const b = E().recommendDay(opt);
    expect(roles(a)).toEqual(roles(b));
    expect(a.__trace.resolution.bucket).toBe(b.__trace.resolution.bucket);
    expect(a.intensity).toBe(b.intensity);
  });
});
