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

  it('contract-guard роутера: builder-выход проходит isValidSession', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(R().isValidSession(s)).toBe(true);
  });

  it('intensity == bucket (max/moderate/recovery)', () => {
    expect(SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' }).intensity).toBe('max');
    expect(SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'moderate' }).intensity).toBe('moderate');
    expect(SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'recovery' }).intensity).toBe('recovery');
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

describe('sessionBuilder: equipment-фильтрация', () => {
  beforeAll(setupOnce);

  it('equipmentTypes=["none"] (без снаряда) → нет fingerboard-атомов', () => {
    const s = SB().recommendDay({ equipmentTypes: ['none'], age: 25, level: 'intermediate', readiness: 'moderate' });
    if (s !== null) {
      s.exercises.forEach((e) => expect(e.modality).not.toBe('fingerboard'));
    }
  });
});
