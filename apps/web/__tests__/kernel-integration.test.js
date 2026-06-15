// kernel-integration.test.js — ПРОД-ПОРЯДОК: общие kernel-модули грузятся ПЕРЕД
// доменными (как в бандлере), поэтому домены реально идут по kernel-пути (а не по
// локальному fallback). Закрывает слепое пятно «тесты грузят без kernel».

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');
const evf = (dir, f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(WEB, dir, f), 'utf8')); };

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  // KERNEL FIRST (как бандлер)
  evf('_kernel', 'heys_kernel_stats_v1.js');
  evf('_kernel', 'heys_kernel_dates_v1.js');
  evf('_kernel', 'heys_kernel_calendar_v1.js');
  evf('_kernel', 'heys_kernel_periodization_v1.js');
  evf('_kernel', 'heys_kernel_progression_v1.js');
  evf('_kernel', 'heys_kernel_session_v1.js');
  evf('_kernel', 'heys_kernel_runner_v1.js');
  evf('_kernel', 'heys_kernel_router_v1.js');
  evf('_kernel', 'heys_kernel_assess_v1.js');
  evf('_kernel', 'heys_kernel_catalog_v1.js');
  evf('_kernel', 'heys_kernel_gate_v1.js');
  evf('_kernel', 'heys_kernel_records_v1.js');
  evf('_kernel', 'heys_kernel_onboarding_v1.js');
  evf('_kernel', 'heys_kernel_sports_v1.js');
  globalThis.localStorage = globalThis.HEYS.TrainingKernel.records.createMemoryStorage();
  globalThis.window.localStorage = globalThis.localStorage;
  // mobility домен
  evf('mobility', 'heys_mobility_axis_catalog_v1.js');
  evf('mobility', 'heys_mobility_sport_config_v1.js');
  evf('mobility', 'heys_mobility_atom_catalog_v1.js');
  evf('mobility', 'heys_mobility_validators_v1.js');
  evf('mobility', 'heys_mobility_readiness_v1.js');
  evf('mobility', 'heys_mobility_assessment_v1.js');
  evf('mobility', 'heys_mobility_onboarding_v1.js');
  evf('mobility', 'heys_mobility_records_store_v1.js');
  evf('mobility', 'heys_mobility_mode_engine_v1.js');
  evf('mobility', 'heys_mobility_calendar_v1.js');
  // fingers домен
  evf('fingers', 'heys_fingers_programs_catalog_v1.js');
  evf('fingers', 'heys_fingers_grips_catalog_v1.js');
  evf('fingers', 'heys_fingers_boards_catalog_v1.js');
  evf('fingers', 'heys_fingers_quality_catalog_v1.js');
  evf('fingers', 'heys_fingers_sport_config_v1.js');
  evf('fingers', 'heys_fingers_validators_v1.js');
  evf('fingers', 'heys_fingers_assessment_v1.js');
  evf('fingers', 'heys_fingers_readiness_v1.js');
  evf('fingers', 'heys_fingers_records_store_v1.js');
  evf('fingers', 'heys_fingers_periodization_engine_v1.js');
  evf('fingers', 'heys_fingers_calendar_v1.js');
};

const M = () => globalThis.HEYS.Mobility;
const F = () => globalThis.HEYS.Fingers;

describe('kernel integration (прод-порядок: kernel → домены)', () => {
  beforeAll(setupOnce);

  it('kernel-модули активны', () => {
    const TK = globalThis.HEYS.TrainingKernel;
    expect(TK.stats && TK.dates && TK.calendar && TK.periodization && TK.progression && TK.session && TK.runner && TK.router && TK.assess && TK.catalog && TK.gate && TK.records && TK.onboarding && TK.sports).toBeTruthy();
  });

  it('оба домена регистрируют SPORT_CONFIG в kernel registry', () => {
    const sports = globalThis.HEYS.TrainingKernel.sports;
    expect(sports.get('mobility')).toMatchObject({ sportId: 'mobility', namespace: 'Mobility' });
    expect(sports.get('climbing-fingers')).toMatchObject({ sportId: 'climbing-fingers', namespace: 'Fingers' });
    expect(M().SPORT_CONFIG.qualityAxes.length).toBeGreaterThan(0);
    expect(F().SPORT_CONFIG.qualityAxes.length).toBe(9);
    expect(sports.list().map((cfg) => cfg.sportId)).toEqual(['climbing-fingers', 'mobility']);
  });

  it('mobility onboarding delegates profile normalization to kernel in prod-order', () => {
    const p = M().onboarding.normalizeProfile({
      age: '31',
      level: 'pro',
      populations: ['desk', 'desk', 'unknown'],
      equipment: ['band', 'rope'],
      goal: 'magic',
      acceptedDisclaimer: true
    });
    expect(p).toMatchObject({
      age: 31,
      level: 'beginner',
      populations: ['desk'],
      equipment: ['band'],
      goal: 'morning',
      acceptedDisclaimer: true
    });
  });

  it('доменные validators делегируют S1 в kernel (прод-порядок)', () => {
    const atom = (minLevel, minAge) => ({ id: 'a', gates: { minLevel: minLevel, minAge: minAge } });
    // fingers (4 уровня c elite)
    expect(F().validators.S1_ageLevelGate(atom('beginner', 0), { age: 30, level: 'beginner' })[0].code).toBe('S1.pass');
    expect(F().validators.S1_ageLevelGate(atom('beginner', 0), { age: null, level: 'beginner' })[0].code).toBe('S1.age_missing');
    expect(F().validators.S1_ageLevelGate(atom('elite', 0), { age: 30, level: 'advanced' })[0].code).toBe('S1.under_min_level');
    // mobility (3 уровня; 'elite' невалиден)
    expect(M().validators.S1_ageLevelGate(atom('beginner', 0), { age: 30, level: 'beginner' })[0].code).toBe('S1.pass');
    expect(M().validators.S1_ageLevelGate(atom('advanced', 0), { age: 30, level: 'beginner' })[0].code).toBe('S1.under_min_level');
    expect(M().validators.S1_ageLevelGate(atom('beginner', 0), { age: 30, level: 'elite' })[0].code).toBe('S1.profile_level_missing');
  });

  it('validator aggregators используют kernel rule-runner в prod-order', () => {
    expect(globalThis.HEYS.TrainingKernel.gate.runRules).toBeTypeOf('function');
    const mobAtom = {
      id: 'mob-a',
      jointRegion: 'hip',
      doseShape: 'hold',
      purpose: 'develop',
      gates: { minLevel: 'beginner', minAge: 0, populationGate: [], contraind: [], equipment: [] }
    };
    const mobIssues = M().validators.runAtom(mobAtom, { age: 30, level: 'beginner', populations: [], equipment: [] }, {
      painFlags: [{ level: 'pain', zone: 'hip' }]
    });
    expect(mobIssues.some((i) => i.code === 'S2.pain_stop')).toBe(true);

    const fingerIssues = F().validators.runAll({
      atom: {
        id: 'fs-a',
        gripId: 'halfcrimp',
        tissueLoad: 'low',
        gates: { minLevel: 'intermediate', minAge: 16, prerequisites: [] }
      }
    }, { age: 20, level: 'beginner' }, []);
    expect(fingerIssues.some((i) => i.code === 'S1.under_min_level')).toBe(true);
  });

  it('S3 warmup-required делегируется в kernel с доменными кодами', () => {
    const mobIssue = M().validators.S3_warmupRequired({
      blocks: [{ atoms: [{ id: 'hip-range', fatigueCost: 'high' }] }],
      warmupCompleted: false
    })[0];
    expect(mobIssue).toMatchObject({ level: 'error', code: 'S3.no_warmup', atomId: 'hip-range' });

    const fingerIssue = F().validators.S3_warmupRequired({
      blocks: [{ id: 'maxhang', fatigueCost: 'high' }],
      context: { warmupDone: false }
    })[0];
    expect(fingerIssue).toMatchObject({
      level: 'error',
      code: 'S3.warmup_missing',
      intensiveBlockIds: ['maxhang']
    });
  });

  it('простые token-gates валидаторов идут через kernel в prod-order', () => {
    const mob = M().validators.E_equipmentGate({
      id: 'mob-eq',
      gates: { equipment: ['foam_roll'] }
    }, { equipment: [] });
    expect(mob[0]).toMatchObject({
      level: 'warn',
      code: 'E.equipment_missing',
      atomId: 'mob-eq',
      missing: ['foam_roll']
    });

    const finger = F().validators.S9_prerequisitesGate({
      id: 'finger-pre',
      gates: { prerequisites: ['bfr_cuff_technique'] }
    }, { completedPrerequisites: [] });
    expect(finger[0]).toMatchObject({
      level: 'error',
      code: 'S9.prereq_missing',
      atomId: 'finger-pre',
      missing: ['bfr_cuff_technique']
    });
  });

  it('mobility readiness работает по kernel-stats', () => {
    const r = M().readiness.score({ stiffness: 4, soreness: 3, sleepQuality: 5, stress: 6, hrvToday: 50, hrvBaseline: 58, hrvMad: 4 });
    expect(r.score).toBe(47);
    expect(r.band).toBe('red');
  });

  it('mobility limiterAudit работает по kernel-assess', () => {
    const audit = M().assessment.limiterAudit([
      { testId: 'hamstring_slr', measure: 55, passiveROM: 80, activeROM: 60 },
      { testId: 'thoracic_rotation', measure: 20 }
    ]);
    expect(audit.leadingLimiter).toBeTruthy();
    expect(typeof audit.blockWeights).toBe('object');
  });

  it('mobility atom_catalog работает по kernel-index', () => {
    expect(M().atomCatalog.byBlock('A').length).toBeGreaterThan(0);
    expect(M().atomCatalog.getAtom('breath_cyclic_sigh')).toBeTruthy();
  });

  it('fingers readiness/assessment не падают по kernel-пути', () => {
    const a = F().assessment.assess({ finger_strength: 60 }, { technique: 0.5 }, 'advanced');
    expect(a.leadingLimiter).toBeTruthy();
    const today = { mood: 7, wellbeing: 8, stress: 3, sleepStart: '23:00', sleepEnd: '07:00' };
    const rd = F().readiness.assess(today, [today]);
    expect(typeof rd.score).toBe('number');
  });

  it('records storage работает через kernel у обоих доменов', () => {
    const storage = globalThis.HEYS.TrainingKernel.records.createMemoryStorage();
    M().recordsStore.addSession('mob-a', { ok: true, session: { mode: 'pause', blocks: [] } }, storage);
    expect(M().recordsStore.listSessions('mob-a', storage)).toHaveLength(1);
    expect(M().recordsStore.listSessions('mob-b', storage)).toHaveLength(0);

    globalThis.HEYS.currentClientId = 'finger-a';
    expect(F().records.__getKey()).toBe('heys_finger-a_fingers_records_v1');
    expect(F().records.updateIfPR('halfcrimp', 20, {
      type: 'weight',
      mvcKg: 70,
      bw: 70,
      testedAt: '2026-06-01T10:00:00Z'
    })).toBe(true);
    expect(F().records.getMvcHistory('halfcrimp', 20)).toHaveLength(1);
    globalThis.HEYS.currentClientId = 'finger-b';
    expect(F().records.getMvcHistory('halfcrimp', 20)).toHaveLength(0);
  });

  it('date helpers работают в prod-order календарях обоих доменов', () => {
    const plan = M().calendar.buildWeekPlan({}, { startDate: '2026-06-15T00:00:00.000Z' });
    expect(plan.days[0].date).toBe('2026-06-15');
    const period = F().periodization.buildPlan({ startedAt: '2026-06-01', weeks: 4 });
    expect(F().periodization.current(period, '2026-06-15').weekIdx).toBe(2);
  });

  it('periodization policy делегируется в kernel у обоих доменов', () => {
    expect(F().periodization.phaseForModel('linear', 3, 4)).toBe('deload');
    expect(F().periodization.energyFocusForPhase('dup')).toBe('undulating');
    const advice = M().modeEngine.periodizationAdvice({ phase: 'peak', keyLoadWithinHours: 24 });
    expect(advice).toMatchObject({ focus: 'maintain', avoidHighTissueLoad: true });
  });
});
