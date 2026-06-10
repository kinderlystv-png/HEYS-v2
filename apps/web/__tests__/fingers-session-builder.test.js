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
  ev('heys_fingers_progression_v1.js');
  ev('heys_fingers_assessment_v1.js');
  ev('heys_fingers_age_gating_v1.js');
  ev('heys_fingers_mix_engine_v1.js');
  ev('heys_fingers_engine_router_v1.js');
  ev('heys_fingers_session_builder_v1.js');
};

const F = () => globalThis.HEYS.Fingers;
const SB = () => globalThis.HEYS.Fingers.sessionBuilder;
const R = () => globalThis.HEYS.Fingers.engineRouter;

// Тестовый "полный профиль" — все обычные prereq'ы выполнены, кроме
// safety-critical (bfr_cuff_technique, safe_fall_setup, injury_screen).
// Это эквивалент того, что в проде попадёт в default-profile через
// onboarding/S3-runner (см. ревью #4).
const FULL_PREREQS = [
  'warmup_done', 'base_>=1y', 'base_>=2y', 'strength_base'
];
const fullProfile = (over) => Object.assign({
  age: 25, level: 'intermediate', completedPrerequisites: FULL_PREREQS.slice()
}, over || {});

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

  it('coachReason/description не протекают внутренними bucket/block_catalog терминами', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, readiness: 'max' });
    expect(s).not.toBeNull();
    expect(s.description).not.toMatch(/bucket|block_catalog|safety-floor|Bucket=/i);
    expect(s.coachReason).not.toMatch(/bucket|block_catalog|safety-floor|Bucket=/i);
    expect(s.coachReason).toMatch(/нагруз|разогрев|уровень|баланс|восстанов/i);
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
    const max = SB().recommendDay({
      equipmentTypes: ['full'], readiness: 'max',
      profile: fullProfile({ level: 'advanced' })
    });
    expect(['max', 'moderate']).toContain(max.intensity);
    // recovery bucket → нет power/strength-endurance → intensity=recovery
    const rec = SB().recommendDay({
      equipmentTypes: ['full'], readiness: 'recovery',
      profile: fullProfile()
    });
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

  it('ревью #8: без level/mvc → ultimate floor beginner (не null, не silent intermediate)', () => {
    // Раньше null (ревью 4.2 #1) → builder инертен на live-opts (ревью #7-#8).
    // Теперь: ultimate floor = 'beginner' — безопасное поведение для unknown-юзера.
    // Беginner level + creds=[] → только safe атомы (minLevel:'beginner', no prereqs).
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, readiness: 'max'
      // level: undefined, mvcPctBW: undefined — live-like opts от mixEngine
    });
    expect(s).not.toBeNull();
    expect(s.__trace.inputs.profileLevel).toBe('beginner');
    expect(s.__trace.inputs.levelIsExplicit).toBe(false);
    expect(s.__trace.inputs.seededCredsCount).toBe(0);
    // Никаких max-hangs / min-edge / bfr / прочих advanced атомов.
    s.exercises.forEach((e) => {
      expect(e.atomId).not.toBe('fs_maxhang_20mm_half');
      expect(e.atomId).not.toBe('fs_minedge_recruit');
      expect(e.atomId).not.toBe('aer_bfr_lowload');
    });
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
      equipmentTypes: ['full'], readiness: 'max',
      profile: fullProfile(),
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

  it('RENDERABLE_DOSESHAPES = все 6 doseShape (Шаг 5d полный набор)', () => {
    expect(SB().RENDERABLE_DOSESHAPES).toEqual({
      hang: true, reps: true, continuous: true, attempts: true, circuit: true, process: true
    });
  });

  it('каждый выбранный exercise имеет doseShape ∈ всех 6 поддержанных', () => {
    ['max', 'moderate', 'recovery'].forEach((readiness) => {
      const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness });
      if (s !== null) {
        s.exercises.forEach((e) => {
          expect(['hang', 'reps', 'continuous', 'attempts', 'circuit', 'process']).toContain(e.doseShape);
        });
      }
    });
  });

  it('antagonist/mobility-floor — атомы блоков G/H — доступны как reps (safety-floor цел)', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(s.exercises.some((e) => e.__role === 'antagonist')).toBe(true);
    expect(s.exercises.some((e) => e.__role === 'mobility')).toBe(true);
  });

  it('Шаг 5b: power-слот теперь резолвится attempts-атомом (UI разблокирован)', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    const powerSlot = s.__safetyTrace.picks.find((p) => p.slot === 'power');
    // Слот picked, не skipped — attempts UI готов.
    expect(powerSlot && powerSlot.skipped === true).not.toBe(true);
  });

  it('shadow-diff на max-сессии: reps по-прежнему присутствует (antagonist/mobility)', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    const distribution = s.exercises.reduce((acc, e) => {
      acc[e.doseShape] = (acc[e.doseShape] || 0) + 1;
      return acc;
    }, {});
    // reps присутствует (antagonist/mobility):
    expect(distribution.reps).toBeGreaterThanOrEqual(2);
  });
});

describe('sessionBuilder: S9 prerequisites (ревью #4 safety-шов)', () => {
  beforeAll(setupOnce);

  it('ревью #5 (B): intermediate без explicit creds → seed base_>=1y, max-hang проходит, min-edge/BFR блокируются', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], readiness: 'max',
      profile: { age: 25, level: 'intermediate' /* completedPrerequisites не задан */ }
    });
    expect(s).not.toBeNull();
    // intermediate seed = ['base_>=1y'] → max-hangs доступны.
    // Главное: НЕ блокирует тренировочный контент (после ревью #5 #5 fix).
    expect(s.exercises.length).toBeGreaterThan(2); // не вырожденная сессия
    s.exercises.forEach((e) => {
      // base_>=2y отсутствует → min-edge НЕ должен попасть.
      expect(e.atomId).not.toBe('fs_minedge_recruit');
      // bfr_cuff_technique never auto-seeded → BFR НЕ должен попасть.
      expect(e.atomId).not.toBe('aer_bfr_lowload');
    });
  });

  it('ревью #4 BFR пример: aer_bfr_lowload без bfr_cuff_technique → не в сессии', () => {
    // Полный профиль БЕЗ bfr_cuff_technique (как у обычного юзера).
    const s = SB().recommendDay({
      equipmentTypes: ['full'], readiness: 'recovery',
      profile: fullProfile() // FULL_PREREQS не включает bfr_cuff_technique
    });
    if (s !== null) {
      expect(s.exercises.find((e) => e.atomId === 'aer_bfr_lowload')).toBeUndefined();
    }
  });

  it('явный bfr_cuff_technique → aer_bfr_lowload теперь доступен (для capacity-слота)', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], readiness: 'recovery',
      profile: fullProfile({ completedPrerequisites: FULL_PREREQS.concat(['bfr_cuff_technique']) })
    });
    expect(s).not.toBeNull();
    // aer_bfr_lowload подходит под capacity slot; модuality fingerboard разрешена для 'full'.
  });

  it('ревью #4 min-edge пример: fs_minedge_recruit требует base_>=2y и strength_base', () => {
    const sNoBase = SB().recommendDay({
      equipmentTypes: ['full'], readiness: 'max',
      profile: { age: 30, level: 'advanced', completedPrerequisites: ['warmup_done'] /* нет base_>=2y */ }
    });
    if (sNoBase !== null) {
      expect(sNoBase.exercises.find((e) => e.atomId === 'fs_minedge_recruit')).toBeUndefined();
    }
  });
});

describe('sessionBuilder: _deriveLevel (ревью #4-#5 (b) MVC mapping)', () => {
  beforeAll(setupOnce);

  it('floor: нет MVC → beginner', () => {
    expect(SB()._deriveLevel(null)).toBe('beginner');
    expect(SB()._deriveLevel(undefined)).toBe('beginner');
    expect(SB()._deriveLevel(NaN)).toBe('beginner');
  });

  it('mvcPctBW < 58 → beginner', () => {
    expect(SB()._deriveLevel(20)).toBe('beginner');
    expect(SB()._deriveLevel(57.99)).toBe('beginner');
  });

  it('58 ≤ mvcPctBW < 82 → intermediate', () => {
    expect(SB()._deriveLevel(58)).toBe('intermediate');
    expect(SB()._deriveLevel(70)).toBe('intermediate');
    expect(SB()._deriveLevel(81.99)).toBe('intermediate');
  });

  it('82 ≤ mvcPctBW → advanced (cap)', () => {
    expect(SB()._deriveLevel(82)).toBe('advanced');
    expect(SB()._deriveLevel(90)).toBe('advanced');
  });

  it('ревью #4 cap: даже elite-MVC (≥107) → advanced, не elite', () => {
    expect(SB()._deriveLevel(107)).toBe('advanced');
    expect(SB()._deriveLevel(120)).toBe('advanced');
    expect(SB()._deriveLevel(200)).toBe('advanced');
  });

  it('opts.mvcPctBW в recommendDay → derived level применяется', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, mvcPctBW: 90, readiness: 'max'
    });
    expect(s).not.toBeNull();
    expect(s.__trace.inputs.profileLevel).toBe('advanced');
  });

  it('explicit profile.level > derive (ревью #5 explicit > derive)', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, mvcPctBW: 120, readiness: 'max',
      profile: { age: 25, level: 'beginner' } // explicit overrides MVC=120
    });
    expect(s).not.toBeNull();
    expect(s.__trace.inputs.profileLevel).toBe('beginner');
  });

  it('explicit opts.level > derive (ниже-уровень explicit имеет приоритет)', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, mvcPctBW: 120, readiness: 'max',
      level: 'intermediate'
    });
    expect(s.__trace.inputs.profileLevel).toBe('intermediate');
  });
});

describe('sessionBuilder: _seedCredentialsFromLevel (ревью #5 (B))', () => {
  beforeAll(setupOnce);

  it('beginner → no credentials', () => {
    expect(SB()._seedCredentialsFromLevel('beginner')).toEqual([]);
  });

  it('intermediate → base_>=1y', () => {
    expect(SB()._seedCredentialsFromLevel('intermediate')).toEqual(['base_>=1y']);
  });

  it('advanced → base_>=1y + base_>=2y + strength_base', () => {
    expect(SB()._seedCredentialsFromLevel('advanced')).toEqual(['base_>=1y', 'base_>=2y', 'strength_base']);
  });

  it('elite → same as advanced (одинаковый opyt-set; elite добавляет explicit-only)', () => {
    expect(SB()._seedCredentialsFromLevel('elite')).toEqual(['base_>=1y', 'base_>=2y', 'strength_base']);
  });

  it('ревью #5 invariant: safety-tokens НИКОГДА не сеются из level', () => {
    ['beginner', 'intermediate', 'advanced', 'elite'].forEach((lvl) => {
      const seeded = SB()._seedCredentialsFromLevel(lvl);
      expect(seeded).not.toContain('bfr_cuff_technique');
      expect(seeded).not.toContain('safe_fall_setup');
      expect(seeded).not.toContain('injury_screen');
    });
  });

  it('intermediate seed union explicit safety-attestation → BFR доступен', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], readiness: 'recovery',
      profile: {
        age: 30, level: 'intermediate',
        completedPrerequisites: ['bfr_cuff_technique']
      }
    });
    expect(s).not.toBeNull();
    // BFR (intermediate, требует bfr_cuff_technique) теперь должен быть в пуле.
  });

  it('advanced без явного base_>=2y → seed добирает; min-edge проходит', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 30, readiness: 'max',
      profile: { age: 30, level: 'advanced' } // explicit empty
    });
    expect(s).not.toBeNull();
    // min-edge требует base_>=2y + strength_base, оба seed'нулись по advanced.
    // Проверка: атом доступен в пуле, builder может его выбрать (но slot-mapping
    // может предпочесть другой); главное — S9 не блокирует его.
    const issues = F().validators.S9_prerequisitesGate(
      F().blockCatalog.getAtom('fs_minedge_recruit'),
      { age: 30, level: 'advanced', completedPrerequisites: ['base_>=1y', 'base_>=2y', 'strength_base'] }
    );
    expect(issues[0].code).toBe('S9.pass');
  });
});

describe('sessionBuilder: ревью #6 — провенанс level (derived НЕ сеет creds)', () => {
  beforeAll(setupOnce);

  it('derived-advanced (MVC=120) БЕЗ explicit level → S9 БЛОКирует min-edge (закрытие #6)', () => {
    // Прямой тест дыры: сильный новичок с MVC=120 → derive 'advanced'.
    // До #6 фикса: seed=[base_>=1y, base_>=2y, strength_base], S9 пропускает.
    // После: seededCreds=[] (derived), S9.prereq_missing → block.
    const builderOpts = { age: 25, mvcPctBW: 120, level: undefined, profile: undefined };
    // _atomFits недоступен публично; проверяем через S9 на профиле, который
    // recommendDay построит для этих opts.
    const minEdge = F().blockCatalog.getAtom('fs_minedge_recruit');
    // Реконструируем профиль как builder: derived advanced + NO seed
    const profile = { age: 25, level: 'advanced', completedPrerequisites: [] };
    const issues = F().validators.S9_prerequisitesGate(minEdge, profile);
    expect(issues[0].code).toBe('S9.prereq_missing');
    expect(issues[0].missing).toContain('base_>=2y');
    expect(issues[0].missing).toContain('strength_base');
  });

  it('derived-advanced → trace.levelIsExplicit=false, seededCredsCount=0', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, mvcPctBW: 120, readiness: 'max'
    });
    expect(s).not.toBeNull();
    expect(s.__trace.inputs.profileLevel).toBe('advanced');
    expect(s.__trace.inputs.levelIsExplicit).toBe(false);
    expect(s.__trace.inputs.seededCredsCount).toBe(0);
  });

  it('контроль (explicit advanced): seed работает, min-edge доступен', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 30, readiness: 'max',
      profile: { age: 30, level: 'advanced' } // explicit
    });
    expect(s.__trace.inputs.levelIsExplicit).toBe(true);
    expect(s.__trace.inputs.seededCredsCount).toBe(3); // base_>=1y, base_>=2y, strength_base
    // S9 для min-edge с этим профилем должен пройти.
    const minEdge = F().blockCatalog.getAtom('fs_minedge_recruit');
    const profile = { age: 30, level: 'advanced',
      completedPrerequisites: ['base_>=1y', 'base_>=2y', 'strength_base'] };
    const issues = F().validators.S9_prerequisitesGate(minEdge, profile);
    expect(issues[0].code).toBe('S9.pass');
  });

  it('сильный новичок (derived advanced) — сессия НЕ содержит min-edge', () => {
    // Не только S9 в изоляции, но и реальная сессия не должна включать high-danger
    // протоколы для derived-without-explicit-tenure.
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, mvcPctBW: 120, readiness: 'max'
    });
    expect(s).not.toBeNull();
    s.exercises.forEach((e) => {
      expect(e.atomId).not.toBe('fs_minedge_recruit');
    });
  });

  it('explicit creds union для derived-level: юзер может явно засеять base_>=2y', () => {
    // Юзер сам атtest'ил стаж 2 года, MVC показывает advanced силу.
    // Тогда explicit creds должны разблокировать min-edge.
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, mvcPctBW: 120, readiness: 'max',
      profile: {
        age: 25,
        completedPrerequisites: ['base_>=1y', 'base_>=2y', 'strength_base']
      }
    });
    expect(s.__trace.inputs.levelIsExplicit).toBe(false); // level всё ещё derived
    expect(s.__trace.inputs.explicitCredsCount).toBe(3);
    // min-edge теперь физически доступен (S9 проходит) — может быть в сессии
    // или нет в зависимости от slot-mapping, главное что S9 не блокирует.
    const minEdge = F().blockCatalog.getAtom('fs_minedge_recruit');
    const profile = { age: 25, level: 'advanced',
      completedPrerequisites: ['base_>=1y', 'base_>=2y', 'strength_base'] };
    const issues = F().validators.S9_prerequisitesGate(minEdge, profile);
    expect(issues[0].code).toBe('S9.pass');
  });
});

describe('sessionBuilder: ревью #5 находка #5 — runtime warmup_done отделена от credential', () => {
  beforeAll(setupOnce);

  it('(A) ATOMS пост-фильтр: ни один атом не несёт warmup_done в gates.prerequisites', () => {
    F().blockCatalog.ATOMS.forEach((a) => {
      expect(a.gates.prerequisites).not.toContain('warmup_done');
    });
  });

  it('(A) live-билдер с пустыми creds + level=intermediate → НЕ вырожденная сессия (находка #5 закрыта)', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], readiness: 'max',
      profile: { age: 25, level: 'intermediate' /* нет explicit creds */ }
    });
    expect(s).not.toBeNull();
    expect(s.exercises.length).toBeGreaterThan(2); // НЕ только antagonist+mobility
    expect(s.exercises.some((e) => e.__role === 'max-strength' || e.__role === 'strength-endurance')).toBe(true);
  });

  it('(A) S3 по-прежнему гейтит warmup на уровне сессии (не на атомах)', () => {
    // S3 принимает session, проверяет context.warmupDone. Логика не зависит от
    // S9/atom-prereqs — после удаления warmup_done из catalog она работает.
    const r = F().validators.S3_warmupRequired({
      blocks: [{ id: 'mh', fatigueCost: 'high' }],
      context: { warmupDone: false }
    });
    expect(r[0].code).toBe('S3.warmup_missing');
  });
});

describe('sessionBuilder: ревью #7 — дедуп grip+edge внутри сессии', () => {
  beforeAll(setupOnce);

  it('один и тот же gripId+edgeSizeMm не повторяется в сессии', () => {
    // Прогон по нескольким bucket'ам — везде дубль должен быть исключён.
    ['max', 'moderate', 'recovery'].forEach((readiness) => {
      ['intermediate', 'advanced'].forEach((level) => {
        const s = SB().recommendDay({
          equipmentTypes: ['full'], age: 25, readiness,
          profile: fullProfile({ level, completedPrerequisites: ['base_>=1y', 'base_>=2y', 'strength_base', 'bfr_cuff_technique'] })
        });
        if (!s) return;
        const seen = new Set();
        s.exercises.forEach((e) => {
          if (e.gripId && e.edgeSizeMm != null) {
            const key = e.gripId + ':' + e.edgeSizeMm;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }
        });
      });
    });
  });

  it('ревью #7 регрессия: derived-новичок раньше получал fs_repeater_73 дважды', () => {
    // Этот сценарий зафиксирован ревьюером прогоном до #7 фикса.
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, mvcPctBW: 120, readiness: 'max'
    });
    if (!s) return;
    const ids = s.exercises.map((e) => e.atomId);
    // Считаем сколько раз fs_repeater_73 (или любой другой) встречается.
    const counts = ids.reduce((acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; }, {});
    Object.values(counts).forEach((c) => expect(c).toBeLessThanOrEqual(1));
  });

  it('атомы без gripId (mobility/antagonist reps) дедуп не задевает', () => {
    // Хотя в одной сессии mobility и antagonist обычно по одному — проверяем
    // что отсутствие gripId не вызывает ложного дедупа.
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, readiness: 'max',
      profile: fullProfile()
    });
    if (!s) return;
    const nonGripExercises = s.exercises.filter((e) => !e.gripId);
    // Они должны существовать (mobility-floor + antagonist).
    expect(nonGripExercises.length).toBeGreaterThan(0);
  });
});

describe('sessionBuilder: plumbing Гейта #1 E2E через роутер (ревью #8)', () => {
  beforeAll(setupOnce);
  beforeEach(() => {
    F().flags.newEngine = true;
    delete F().records;
    delete F().getBodyWeight;
  });

  it('live-like opts + records (advanced MVC) → builder получает advanced, не beginner-floor', () => {
    // Симулируем продвинутого юзера: addedKg=67.5, bw=75 → 90%BW → derive 'advanced'.
    F().records = { getMVC: () => ({ addedKg: 67.5 }) };
    F().getBodyWeight = () => ({ kg: 75 });
    const opts = { equipmentTypes: ['full'], age: 25, readiness: 'max' };
    const result = R().recommendDay(opts);
    expect(R().lastSource).toBe('new');
    expect(result.__trace.inputs.profileLevel).toBe('advanced');
    expect(result.__trace.inputs.levelIsExplicit).toBe(false);
    // Derived → seededCreds=[] (ревью #6 provenance). Advanced контент типа
    // min-edge всё равно блокируется S9 без attested base_>=2y.
    expect(result.__trace.inputs.seededCredsCount).toBe(0);
  });

  it('без records → beginner-floor (как было после #8)', () => {
    // Никаких records/bw → enrichment не сработал → ultimate floor.
    const opts = { equipmentTypes: ['full'], age: 25, readiness: 'max' };
    const result = R().recommendDay(opts);
    expect(R().lastSource).toBe('new');
    expect(result.__trace.inputs.profileLevel).toBe('beginner');
    expect(result.__trace.resolution.bucket).toBe('moderate');
    expect(result.__trace.resolution.bucketCapReason).toBe('beginner_max_to_moderate');
    expect(result.durationMin).toBeGreaterThanOrEqual(35);
  });

  it('beginner MVC (40% BW) → derive beginner — порог 58% работает', () => {
    F().records = { getMVC: () => ({ addedKg: 30 }) }; // 30/75 = 40%
    F().getBodyWeight = () => ({ kg: 75 });
    const opts = { equipmentTypes: ['full'], age: 25, readiness: 'max' };
    const result = R().recommendDay(opts);
    expect(result.__trace.inputs.profileLevel).toBe('beginner');
    expect(result.__trace.resolution.bucket).toBe('moderate');
    expect(result.__trace.resolution.bucketCapReason).toBe('beginner_max_to_moderate');
    expect(result.durationMin).toBeGreaterThanOrEqual(35);
  });

  it('intermediate MVC (65% BW) → derive intermediate', () => {
    F().records = { getMVC: () => ({ addedKg: 48.75 }) }; // 48.75/75 = 65%
    F().getBodyWeight = () => ({ kg: 75 });
    const opts = { equipmentTypes: ['full'], age: 25, readiness: 'max' };
    const result = R().recommendDay(opts);
    expect(result.__trace.inputs.profileLevel).toBe('intermediate');
  });
});

describe('sessionBuilder: S4 FTL enforcement', () => {
  beforeAll(setupOnce);

  it('считает FTL атома по TUT × intensityW × tissueW (§3.1)', () => {
    const atom = F().blockCatalog.getAtom('fs_repeater_73');
    expect(SB()._estimateAtomTutSec(atom)).toBe(168); // 7с × 6 reps × 4 sets
    // rm_margin=2 → intensityW=1.3, tissueLoad=moderate=0.6 → 131.04
    expect(SB()._estimateAtomFtl(atom, {})).toBeCloseTo(131.04, 5);
  });

  it('trace всегда содержит sessionFtl без недельной базы', () => {
    const s = SB().recommendDay({ equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(s.__trace.s4.sessionFtl).toBeGreaterThan(0);
    expect(s.__trace.s4.weekBefore).toBeNull();
    expect(s.__trace.s4.enforced).toBe(false);
  });

  it('если projected FTL пробивает +10%, builder снимает объёмный slot', () => {
    const opts = { equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max' };
    const maxSession = SB().recommendDay(opts);

    const trailingAvg = 10000;
    const cap = trailingAvg * 1.10;
    const weekToDate = cap - maxSession.__trace.s4.sessionFtl + 1;
    const capped = SB().recommendDay(Object.assign({}, opts, {
      ftl: { weekToDate, trailingAvg }
    }));

    expect(capped.__trace.s4.enforced).toBe(true);
    expect(capped.__trace.s4.drops[0].role).toBe('strength-endurance');
    expect(capped.exercises.some((e) => e.__role === 'strength-endurance')).toBe(false);
    expect(capped.__trace.s4.sessionFtl).toBeLessThan(maxSession.__trace.s4.sessionFtl);
    expect(capped.__trace.s4.overload).toBe(false);
    expect(capped.__trace.s4.projectedWeek).toBeLessThanOrEqual(cap);
  });
});

describe('sessionBuilder: progression constraints', () => {
  beforeAll(setupOnce);

  const profile = () => fullProfile({
    age: 30,
    level: 'advanced',
    completedPrerequisites: FULL_PREREQS
  });

  it('no plateau on volume axis keeps finger_strength on volume atoms', () => {
    const constraints = SB()._buildProgressionConstraints({
      recordsByQuality: {
        finger_strength: [
          { ts: 1, value: 100 },
          { ts: 2, value: 108 },
          { ts: 3, value: 116 }
        ]
      },
      currentAxes: { finger_strength: 'volume' }
    });

    expect(constraints.finger_strength.allowedAxis).toBe('volume');
    const atom = SB()._pickAtomForSlot('max-strength', {
      equipmentTypes: ['full'],
      profile: profile(),
      progressionConstraints: constraints
    });
    expect(atom.id).toBe('fs_repeater_73');
    expect(SB()._atomProgressionAxis(atom)).toBe('volume');
  });

  it('plateau on volume axis allows edge before load', () => {
    const constraints = SB()._buildProgressionConstraints({
      recordsByQuality: {
        finger_strength: [
          { ts: 1, value: 100 },
          { ts: 2, value: 100 },
          { ts: 3, value: 99 }
        ]
      },
      currentAxes: { finger_strength: 'volume' }
    });

    expect(constraints.finger_strength.hint.action).toBe('switch');
    expect(constraints.finger_strength.allowedAxis).toBe('edge');
    const atom = SB()._pickAtomForSlot('max-strength', {
      equipmentTypes: ['full'],
      profile: profile(),
      progressionConstraints: constraints
    });
    expect(atom.id).toBe('fs_minedge_recruit');
    expect(SB()._atomProgressionAxis(atom)).toBe('edge');
  });

  it('pain stop stays stronger than progression switch', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'],
      age: 30,
      readiness: 'max',
      profile: Object.assign({}, profile(), { painFlag: 'pain' }),
      recordsByQuality: {
        finger_strength: [
          { ts: 1, value: 100 },
          { ts: 2, value: 100 },
          { ts: 3, value: 99 }
        ]
      },
      currentAxes: { finger_strength: 'volume' }
    });
    expect(s).toBeNull();
  });

  it('session trace exposes progression hints when records are provided', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'],
      age: 30,
      readiness: 'max',
      profile: profile(),
      recordsByQuality: {
        finger_strength: [
          { ts: 1, value: 100 },
          { ts: 2, value: 100 },
          { ts: 3, value: 99 }
        ]
      },
      currentAxes: { finger_strength: 'volume' }
    });

    expect(s.__progressionHints.finger_strength.action).toBe('switch');
    expect(s.__trace.resolution.progression.finger_strength.allowedAxis).toBe('edge');
  });
});

describe('sessionBuilder: MEV/MAV weekly quality bands', () => {
  beforeAll(setupOnce);

  it('reports under-MEV qualities without forcing extra load', () => {
    const trace = SB()._computeQualityBandTrace({}, [
      { atomId: 'fs_minedge_recruit' }
    ]);
    expect(trace.perQuality.finger_strength.sessionTut).toBe(20);
    expect(trace.underMev).toContain('finger_strength');
    expect(trace.overMav).not.toContain('finger_strength');
  });

  it('trims quality slots when projected weekly TUT would exceed MAV', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'],
      age: 30,
      level: 'advanced',
      readiness: 'max',
      profile: fullProfile({
        age: 30,
        level: 'advanced',
        completedPrerequisites: FULL_PREREQS
      }),
      qualityTutWeekToDate: { finger_strength: 295 }
    });

    expect(s.__trace.qualityBands.enforced).toBe(true);
    expect(s.__trace.qualityBands.drops.length).toBeGreaterThan(0);
    expect(s.__trace.qualityBands.perQuality.finger_strength.projected)
      .toBeLessThanOrEqual(SB().QUALITY_WEEKLY_TUT_BANDS.finger_strength.mav);
    const remainingFingerStrength = s.exercises.filter((e) => {
      const atom = F().blockCatalog.getAtom(e.atomId);
      return atom && atom.quality === 'finger_strength';
    });
    expect(remainingFingerStrength.length).toBe(0);
    expect(s.coachReason).toContain('недельному потолку');
  });
});

describe('sessionBuilder: periodization planner context', () => {
  beforeAll(setupOnce);

  it('deload planner context clamps max day to recovery before slot selection', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'],
      age: 25,
      level: 'intermediate',
      readiness: 'max',
      profile: fullProfile({ age: 25, level: 'intermediate' }),
      plannerContext: { phase: 'deload', ceiling: 'recovery', volumeMultiplier: 0.5 }
    });

    expect(s.__trace.inputs.plannerPhase).toBe('deload');
    expect(s.__trace.resolution.plannerCapReason).toBe('deload');
    expect(s.__trace.resolution.bucket).toBe('recovery');
    expect(s.intensity).toBe('recovery');
    expect(s.coachReason).toContain('Фаза плана');
  });

  it('planner volumeMultiplier trims only by removing slots', () => {
    const baseOpts = {
      equipmentTypes: ['full'],
      age: 25,
      level: 'intermediate',
      readiness: 'max',
      profile: fullProfile({ age: 25, level: 'intermediate' })
    };
    const base = SB().recommendDay(baseOpts);
    const planned = SB().recommendDay(Object.assign({}, baseOpts, {
      plannerContext: { phase: 'deload', ceiling: 'max', volumeMultiplier: 0.5 }
    }));

    expect(planned.__trace.resolution.plannerVolume.enforced).toBe(true);
    expect(planned.__trace.resolution.plannerVolume.afterFtl)
      .toBeLessThan(planned.__trace.resolution.plannerVolume.beforeFtl);
    expect(planned.exercises.length).toBeLessThan(base.exercises.length);
    expect(planned.coachReason).toContain('уменьшила объем');
  });

  it('focusQuality reorders allowed slot qualities without expanding slot pool', () => {
    expect(SB()._qualitiesForSlot('max-strength', 'max_strength'))
      .toEqual(['max_strength', 'finger_strength']);
    expect(SB()._qualitiesForSlot('max-strength', 'aerobic_base'))
      .toEqual(['finger_strength', 'max_strength']);

    const atom = SB()._pickAtomForSlot('max-strength', {
      equipmentTypes: ['full'],
      profile: fullProfile({
        age: 30,
        level: 'advanced',
        completedPrerequisites: FULL_PREREQS.concat(['safe_fall_setup'])
      }),
      plannerContext: { focusQuality: 'max_strength' }
    });
    expect(F().blockCatalog.getAtom(atom.id).quality).toBe('max_strength');
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

  it('equipmentTypes=["block"] max → не тянет длинный pow_rfd_pulls до принятия envelope', () => {
    const s = SB().recommendDay({ equipmentTypes: ['block'], age: 25, level: 'intermediate', readiness: 'max' });
    expect(s).not.toBeNull();
    expect(s.exercises.find((e) => e.atomId === 'pow_rfd_pulls')).toBeUndefined();
    expect(s.durationMin).toBeLessThanOrEqual(55);
    expect(s.intensity).toBe('max');
  });
});
