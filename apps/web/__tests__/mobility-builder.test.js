// mobility-builder.test.js — mode_engine + routine_builder.
// Проверяет 7 режимов, purpose/autonomic, safety-first сборку и ручные правки.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(MOB_DIR, f), 'utf8')); };
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_session_v1.js'), 'utf8'));
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_validators_v1.js');
  ev('heys_mobility_atom_catalog_v1.js');
  ev('heys_mobility_mode_engine_v1.js');
  ev('heys_mobility_assessment_v1.js');
  ev('heys_mobility_routine_builder_v1.js');
};

const ME = () => globalThis.HEYS.Mobility.modeEngine;
const RB = () => globalThis.HEYS.Mobility.routineBuilder;

const profile = (over = {}) => Object.assign({
  age: 30,
  level: 'intermediate',
  populations: [],
  equipment: ['band', 'strap', 'foam_roll', 'ball', 'percussion', 'bolster']
}, over);
const atomIds = (session) => session.blocks.flatMap((b) => b.atoms.map((a) => a.id));
const atomAutonomics = (session) => session.blocks.flatMap((b) => b.atoms.map((a) => a.autonomic));

describe('mobility mode_engine', () => {
  beforeAll(setupOnce);

  it('экспортирует все 7 режимов', () => {
    expect(ME().MODE_IDS.sort()).toEqual([
      'anti_sedentary',
      'develop_mobility',
      'evening_relax',
      'morning_tonify',
      'post_workout',
      'pre_workout_ramp',
      'rehab'
    ]);
  });

  it('circadianAdjust утром даёт warn-политику end-range', () => {
    const r = ME().circadianAdjust('morning');
    expect(r.warmupMultiplier).toBeGreaterThan(1);
    expect(r.endRangePolicy).toBe('warn_without_full_warmup');
  });

  it('coldWaterAdvisory предупреждает после адаптивной силовой', () => {
    expect(ME().coldWaterAdvisory({ coldWaterPlanned: true, afterAdaptiveStrength: true }).code)
      .toBe('CWI.after_adaptive_strength');
  });

  it('periodizationAdvice в peak переводит в maintain', () => {
    const r = ME().periodizationAdvice({ phase: 'peak' });
    expect(r.focus).toBe('maintain');
    expect(r.avoidHighTissueLoad).toBe(true);
  });
});

describe('mobility routine_builder', () => {
  beforeAll(setupOnce);

  it('строит pre_workout_ramp как tonify/prep без safety errors', () => {
    const r = RB().buildSession('pre_workout_ramp', profile(), {});
    expect(r.ok).toBe(true);
    expect(r.session.purpose).toBe('prep');
    expect(r.session.autonomic).toBe('tonify');
    expect(atomIds(r.session)).toEqual(expect.arrayContaining(['wu_pulse_raise']));
    expect(r.issues.some((i) => i.level === 'error')).toBe(false);
  });

  it('вечерний relax не подмешивает tonify-атомы', () => {
    const r = RB().buildSession('evening_relax', profile(), {});
    expect(r.ok).toBe(true);
    expect(atomAutonomics(r.session)).not.toContain('tonify');
    expect(atomIds(r.session)).toEqual(expect.arrayContaining(['breath_cyclic_sigh', 'flex_relax_supine_comfort']));
  });

  it('develop_mobility выбирает develop-атомы и проходит S3 через full warmup context', () => {
    const r = RB().buildSession('develop_mobility', profile(), {});
    expect(r.ok).toBe(true);
    expect(atomIds(r.session)).toEqual(expect.arrayContaining(['flex_static_hamstring', 'flex_pnf_hamstring_hr']));
    expect(r.issues.some((i) => i.code === 'S3.no_warmup')).toBe(false);
  });

  it('гипермобильному пользователю develop-статика/PNF блокируются, но F остаётся доступен', () => {
    const r = RB().buildSession('develop_mobility', profile({ populations: ['hypermobile'] }), {});
    expect(r.ok).toBe(true);
    expect(atomIds(r.session)).toContain('loadmob_nordic_eccentric');
    expect(atomIds(r.session)).not.toContain('flex_static_hamstring');
    expect(r.trace.some((t) => t.slot === 'static_develop' && t.reason === 'no_safe_candidate')).toBe(true);
  });

  it('нет инвентаря → builder не автоподбирает atom с equipment gate', () => {
    const r = RB().buildSession('pre_workout_ramp', profile({ equipment: [] }), {});
    expect(r.ok).toBe(true);
    expect(atomIds(r.session)).not.toContain('act_band_pullapart');
    expect(atomIds(r.session)).not.toContain('act_band_lateral_walk');
  });

  it('pre_workout не принимает ручную перкуссию из-за pre_power contraind', () => {
    const r = RB().buildSession('pre_workout_ramp', profile(), { extraAtomIds: ['smr_percussion_calf'] });
    expect(atomIds(r.session)).not.toContain('smr_percussion_calf');
    expect(r.trace.some((t) => t.picked === 'smr_percussion_calf' && t.reason === 'blocked_by_safety')).toBe(true);
  });

  it('ручное удаление исключает атом из автоподбора', () => {
    const r = RB().buildSession('morning_tonify', profile(), { removeAtomIds: ['wu_locomotor'] });
    expect(r.ok).toBe(true);
    expect(atomIds(r.session)).not.toContain('wu_locomotor');
    expect(atomIds(r.session)).toContain('wu_pulse_raise');
  });

  it('ручная замена атома проходит через совместимость режима и safety', () => {
    const r = RB().buildSession('pre_workout_ramp', profile(), { replaceAtoms: { activate: 'act_glute_bridge' } });
    expect(r.ok).toBe(true);
    expect(atomIds(r.session)).toContain('act_glute_bridge');
    expect(atomIds(r.session)).not.toContain('act_band_pullapart');
  });

  it('runSession вызывается всегда: painFlags делают session not ok', () => {
    const r = RB().buildSession('anti_sedentary', profile(), { painFlags: [{ level: 'pain', zone: 'hip' }] });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'S2.pain_stop')).toBe(true);
  });

  it('modeEngine.buildSession делегирует в routineBuilder', () => {
    const r = ME().buildSession('anti_sedentary', profile(), {});
    expect(r.ok).toBe(true);
    expect(r.session.mode).toBe('anti_sedentary');
  });

  it('assessment active/passive gap поднимает F-блок в develop-сессии', () => {
    const r = RB().buildSession('develop_mobility', profile(), {
      screens: [{ testId: 'shoulder_er', measure: 90, activeROM: 55, passiveROM: 85 }]
    });
    expect(r.ok).toBe(true);
    expect(r.session.assessment.leadingLimiter.type).toBe('control');
    expect(r.session.assessment.blockWeights.F).toBeGreaterThan(0);
    expect(r.session.blocks[0].atoms[0].block).toBe('F');
    expect(r.trace.some((t) => t.slot === 'assessment_priority' && t.reason === 'limiter_block_weights')).toBe(true);
  });

  it('desk-популяция даёт акцент на грудной/тазобедренный mobility snack', () => {
    const r = RB().buildSession('anti_sedentary', profile({ populations: ['desk'] }), {});
    expect(r.ok).toBe(true);
    expect(atomIds(r.session)).toContain('mob_dynamic_thoracic_openbook');
    expect(r.session.reasons).toContain('population_desk_thoracic_hip');
  });

  it('peak/key-load периодизация убирает high tissue F-атомы из автоподбора и manual extra', () => {
    const r = RB().buildSession('develop_mobility', profile(), {
      phase: 'peak',
      keyLoadWithinHours: 24,
      extraAtomIds: ['loadmob_nordic_eccentric']
    });
    expect(r.ok).toBe(true);
    expect(r.session.periodization.focus).toBe('maintain');
    expect(atomIds(r.session)).not.toContain('loadmob_nordic_eccentric');
    expect(atomIds(r.session)).not.toContain('loadmob_cossack_loaded_hold');
    expect(atomIds(r.session)).toContain('loadmob_pails_rails_hip');
    expect(r.trace.some((t) => t.picked === 'loadmob_nordic_eccentric' && t.reason === 'blocked_by_periodization')).toBe(true);
  });

  it('cold-water advisory попадает в session.advisories', () => {
    const r = RB().buildSession('post_workout', profile(), {
      coldWaterPlanned: true,
      afterAdaptiveStrength: true
    });
    expect(r.ok).toBe(true);
    expect(r.session.advisories.some((a) => a.code === 'CWI.after_adaptive_strength')).toBe(true);
  });
});
