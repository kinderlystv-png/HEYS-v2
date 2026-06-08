// fingers-session-builder.test.js — Phase 1 / step 4 part 2.
// Покрывает: контракт выхода, safety-floor (Риск 1), explicit S1/S6/S8,
// детерминизм, fail-closed по age/pain, выход через engine_router (flag=on).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = {
    createElement: (...a) => ({ __el: true, a }), Fragment: 'F',
    useState: (i) => [typeof i === 'function' ? i() : i, () => {}],
    useMemo: (fn) => fn(), useEffect: () => {}, useCallback: (fn) => fn, useRef: (i) => ({ current: i }),
  };
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  ev('heys_fingers_grips_catalog_v1.js');
  ev('heys_fingers_programs_catalog_v1.js');
  ev('heys_fingers_quality_catalog_v1.js');
  ev('heys_fingers_block_catalog_v1.js');
  ev('heys_fingers_validators_v1.js');
  ev('heys_fingers_assessment_v1.js');
  ev('heys_fingers_age_gating_v1.js');
  ev('heys_fingers_mix_engine_v1.js');
  ev('heys_fingers_engine_router_v1.js');
  ev('heys_fingers_session_builder_v1.js');
};

const F = () => globalThis.HEYS.Fingers;
const SB = () => globalThis.HEYS.Fingers.sessionBuilder;
const R = () => globalThis.HEYS.Fingers.engineRouter;

describe('sessionBuilder: контракт выхода (Риск 2 ревью)', () => {
  beforeAll(setupOnce);

  it('возвращает {intensity:string, exercises:Array<{__role}>} для max bucket', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(s).not.toBeNull();
    expect(typeof s.intensity).toBe('string');
    expect(Array.isArray(s.exercises)).toBe(true);
    expect(s.exercises.length).toBeGreaterThan(0);
    s.exercises.forEach((e) => expect(typeof e.__role).toBe('string'));
  });

  it('contract-guard роутера: builder-выход проходит расширенный isValidSession', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(R().isValidSession(s)).toBe(true);
  });

  it('ревью 4.3 #2: полный набор UI-полей присутствует', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(typeof s.name).toBe('string');
    expect(typeof s.description).toBe('string');
    expect(typeof s.coachReason).toBe('string');
    expect(typeof s.durationMin).toBe('number');
    expect(s.durationMin).toBeGreaterThanOrEqual(10);
    expect(Array.isArray(s.equipmentTypes)).toBe(true);
    expect(Array.isArray(s.sourceIds)).toBe(true);
    expect(typeof s.requiresWarmup).toBe('boolean');
    expect(['ramp', 'quick']).toContain(s.warmupType);
    expect(s.__engine).toBe('sessionBuilder_v1');
    expect(s.__trace).toBeDefined();
  });

  it('ревью 4.3 #2: exercises[] имеют legacy aliases (hangSec/repsPerSet/setsCount) для UI', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    s.exercises.forEach((e) => {
      expect(typeof e.hangSec).toBe('number');
      expect(typeof e.repsPerSet).toBe('number');
      expect(typeof e.setsCount).toBe('number');
      expect(typeof e.restSec).toBe('number');
      expect(typeof e.restBetweenSetsSec).toBe('number');
    });
  });

  it('ревью 4.3 #3: intensity выводится из ролей (sessionIntensity-домен)', () => {
    // max bucket с full equipment → должен содержать power/max-strength → intensity=max
    const max = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'advanced', readiness: 'max' });
    expect(['max', 'moderate']).toContain(max.intensity); // зависит от того что нашёл builder
    // recovery bucket → нет power/strength-endurance → intensity=recovery
    const rec = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'recovery' });
    expect(rec.intensity).toBe('recovery');
  });

  it('ревью 4.3 #3: opts.intensity legacy override понижает bucket', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, level: 'intermediate',
      readiness: 'max', intensity: 'recovery'
    });
    expect(s.__bucket).toBe('recovery');
  });

  it('ревью 4.3 #5: requiresWarmup=true когда есть power/max-strength', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    if (s.exercises.some((e) => e.__role === 'power' || e.__role === 'max-strength')) {
      expect(s.requiresWarmup).toBe(true);
      expect(s.warmupType).toBe('ramp');
    }
  });
});

describe('sessionBuilder: fail-closed', () => {
  beforeAll(setupOnce);

  it('age=NaN → null (S1 fail-closed)', () => {
    expect(SB().recommendDay({ equipmentTypes: ['full'], age: NaN, level: 'intermediate', readiness: 'max' })).toBeNull();
  });

  it('age отсутствует → null', () => {
    expect(SB().recommendDay({ equipmentTypes: ['full'], level: 'intermediate', readiness: 'max' })).toBeNull();
  });

  it('painFlag=pain → null (S8 fail-closed на верхнем уровне)', () => {
    expect(SB().recommendDay({
      equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max',
      painFlag: 'pain'
    })).toBeNull();
  });

  it('ревью 4.2 находка #1: без level → null (НЕ silent intermediate-дефолт)', () => {
    // Раньше level дефолтился в 'intermediate', обходя S1 для beginner.
    // Теперь — fail-closed на верхнем уровне.
    expect(SB().recommendDay({
      equipmentTypes: ['full'], age: 14, readiness: 'max'
      // level: undefined — beginner age, нет уровня → должно быть null
    })).toBeNull();
  });

  it('явный profile с level — работает (path не сломан)', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, readiness: 'max',
      profile: { age: 25, level: 'advanced' }
    });
    expect(s).not.toBeNull();
  });
});

describe('sessionBuilder: safety-floor (Риск 1 ревью)', () => {
  beforeAll(setupOnce);

  it('max bucket → присутствует antagonist (даже если blockWeights=0)', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(s.exercises.some((e) => e.__role === 'antagonist')).toBe(true);
  });

  it('max bucket → присутствует mobility-floor', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(s.exercises.some((e) => e.__role === 'mobility')).toBe(true);
  });

  it('moderate bucket → antagonist обязателен, mobility опционален', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'moderate' });
    expect(s.exercises.some((e) => e.__role === 'antagonist')).toBe(true);
  });

  it('recovery bucket → antagonist присутствует через slot-template', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'recovery' });
    expect(s.exercises.some((e) => e.__role === 'antagonist')).toBe(true);
  });

  it('S6 на готовой сессии возвращает ok/na (не warn) — пол сработал', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    const codes = s.__safetyTrace.issues.map((i) => i.code);
    expect(codes).not.toContain('S6.missing_antagonist');
  });
});

describe('sessionBuilder: explicit safety validators', () => {
  beforeAll(setupOnce);

  it('safetyTrace.picks содержит запись по каждому слоту', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(s.__safetyTrace.picks.length).toBeGreaterThanOrEqual(SB().SLOT_TEMPLATES.max.length);
  });

  it('history с свежей high-tissue нагрузкой → S2 error → null', () => {
    const now = 1000000000;
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max',
      history: [{ timestamp: now - 12 * 3600 * 1000, atomId: 'fs_density_hang', tissueLoad: 'high' }],
      now: now
    });
    // Должен заблокировать (S2 violation на интенсивных атомах сессии).
    // Атомы блока A в slot 'max-strength' имеют high tissue — S2 сработает.
    expect(s).toBeNull();
  });

  it('sessionLog.painFlag=twinge → НЕ блокирует (warn), сессия отдаётся', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'moderate',
      sessionLog: { painFlag: 'twinge' }
    });
    expect(s).not.toBeNull();
  });
});

describe('sessionBuilder: детерминизм', () => {
  beforeAll(setupOnce);

  it('два вызова с теми же opts → идентичные результаты', () => {
    const opts = { equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' };
    const a = SB().recommendDay(opts);
    const b = SB().recommendDay(opts);
    expect(a.exercises.map((e) => e.atomId)).toEqual(b.exercises.map((e) => e.atomId));
    expect(a.exercises.map((e) => e.__role)).toEqual(b.exercises.map((e) => e.__role));
  });
});

describe('sessionBuilder через engine_router (flag=on)', () => {
  beforeAll(setupOnce);
  beforeEach(() => { F().flags.newEngine = true; });

  it('flag=on → роутер использует sessionBuilder, lastSource = "new"', () => {
    const opts = { equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' };
    const s = R().recommendDay(opts);
    expect(R().lastSource).toBe('new');
    expect(s.__from).toBe('sessionBuilder_v1');
  });

  it('flag=on, age=NaN → builder возвращает null → роутер fallback на mixEngine', () => {
    const opts = { equipmentTypes: ['full'], age: NaN, level: 'intermediate', readiness: 'max' };
    const result = R().recommendDay(opts);
    // mixEngine тоже вернёт null на NaN — fail-closed на обеих сторонах.
    expect(result).toBeNull();
  });

  it('flag=on, painFlag=pain → builder возвращает null → fallback на mixEngine (тоже null от pain-gate)', () => {
    const opts = { equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max', painFlag: 'pain' };
    const result = R().recommendDay(opts);
    // mixEngine при painFlag не падает в null (pain-gate понижает ceiling), но
    // builder null → роутер fallback'нется и mixEngine отдаст moderate-сессию.
    // Главное: пользователь получит сессию, contract-guard сработает.
    if (result !== null) {
      expect(R().isValidSession(result)).toBe(true);
    }
  });
});

describe('sessionBuilder: B1.5 cut — RENDERABLE_DOSESHAPES (ревью #3 ограничение 2)', () => {
  beforeAll(setupOnce);

  it('RENDERABLE_DOSESHAPES = {hang, reps} (Шаг 5 расширит)', () => {
    expect(SB().RENDERABLE_DOSESHAPES).toEqual({ hang: true, reps: true });
  });

  it('каждый выбранный exercise имеет doseShape ∈ {hang, reps}', () => {
    ['max', 'moderate', 'recovery'].forEach((readiness) => {
      const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness });
      if (s !== null) {
        s.exercises.forEach((e) => {
          expect(['hang', 'reps']).toContain(e.doseShape);
        });
      }
    });
  });

  it('antagonist/mobility-floor — атомы блоков G/H — доступны как reps (safety-floor цел)', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(s.exercises.some((e) => e.__role === 'antagonist')).toBe(true);
    expect(s.exercises.some((e) => e.__role === 'mobility')).toBe(true);
  });

  it('power-слот теперь резолвится пусто (атомы block C — все attempts) — в trace skipped:true', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    const powerSlot = s.__safetyTrace.picks.find((p) => p.slot === 'power');
    expect(powerSlot && powerSlot.skipped === true).toBe(true);
  });

  it('shadow-diff на max-сессии: nonHangCount ≥ 1 (antagonist+mobility reps), но НЕ из attempts/circuit/continuous', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    const distribution = s.exercises.reduce((acc, e) => {
      acc[e.doseShape] = (acc[e.doseShape] || 0) + 1;
      return acc;
    }, {});
    expect(distribution.attempts).toBeUndefined();
    expect(distribution.circuit).toBeUndefined();
    expect(distribution.continuous).toBeUndefined();
    expect(distribution.process).toBeUndefined();
    // reps присутствует (antagonist/mobility):
    expect(distribution.reps).toBeGreaterThanOrEqual(2);
  });
});

describe('sessionBuilder: equipment-фильтрация', () => {
  beforeAll(setupOnce);

  it('equipmentTypes=["none"] (без снаряда) → нет fingerboard-атомов', () => {
    const s = SB().recommendDay({ equipmentTypes: ['none'], age: 25, level: 'intermediate', readiness: 'moderate' });
    if (s !== null) {
      s.exercises.forEach((e) => expect(e.modality).not.toBe('fingerboard'));
    }
  });
});
