// mobility-course-planner.test.js — slot-based course planner.

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
  const evk = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(WEB, '_kernel', f), 'utf8')); };
  evk('heys_kernel_dates_v1.js');
  evk('heys_kernel_periodization_v1.js');
  evk('heys_kernel_session_v1.js');
  evk('heys_kernel_catalog_v1.js');
  evk('heys_kernel_gate_v1.js');
  evk('heys_kernel_records_v1.js');
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_load_v1.js');
  ev('heys_mobility_validators_v1.js');
  ev('heys_mobility_atom_catalog_v1.js');
  ev('heys_mobility_assessment_v1.js');
  ev('heys_mobility_mode_engine_v1.js');
  ev('heys_mobility_routine_builder_v1.js');
  ev('heys_mobility_breath_runner_v1.js');
  ev('heys_mobility_routine_runner_v1.js');
  ev('heys_mobility_records_store_v1.js');
  ev('heys_mobility_course_planner_v1.js');
};

const M = () => globalThis.HEYS.Mobility;
const profile = (over = {}) => Object.assign({
  age: 30,
  level: 'intermediate',
  populations: [],
  equipment: ['band', 'strap', 'foam_roll', 'ball', 'percussion', 'bolster'],
  loadLevel: 3
}, over);

describe('mobility course planner', () => {
  beforeAll(setupOnce);

  it('строит posture course как слоты, а не фиксированный список упражнений', () => {
    const course = M().coursePlanner.buildCourse({
      goal: 'posture',
      startedAt: '2026-06-01',
      weeks: 4
    });

    expect(course.weeks).toHaveLength(4);
    expect(course.weeks.map((w) => w.phase)).toEqual(['accumulation', 'accumulation', 'intensification', 'deload']);
    expect(course.slots.map((s) => s.id)).toEqual(expect.arrayContaining(['neck_control', 'thoracic_mobility', 'scapular_control']));
    expect(course.slots.find((s) => s.id === 'scapular_control').atomIds.length).toBeGreaterThan(1);
  });

  it('currentWeek делегирует фазу в kernel periodization', () => {
    const course = M().coursePlanner.buildCourse({ goal: 'posture', startedAt: '2026-06-01', weeks: 4 });
    const current = M().coursePlanner.currentWeek(course, '2026-06-22');
    expect(current.week).toBe(4);
    expect(current.phase).toBe('deload');
    expect(current.volumeMultiplier).toBe(0.5);
  });

  it('daily session materializes через routineBuilder и сохраняет course/slot meta', () => {
    const course = M().coursePlanner.buildCourse({ goal: 'posture', startedAt: '2026-06-01', weeks: 4 });
    const built = M().coursePlanner.buildDailySession(course, profile(), {
      todayKey: '2026-06-08',
      randomSeed: 'course-day-1'
    });

    expect(built.ok).toBe(true);
    expect(built.session.mode).toBe('posture');
    expect(built.session.course).toMatchObject({ id: course.id, week: 2, phase: 'accumulation' });
    expect(built.session.blocks.some((b) => b.slotId === 'neck_control')).toBe(true);
    expect(built.session.blocks.every((b) => b.slotId)).toBe(true);
  });

  it('runner steps сохраняют slotId для feedback loop', () => {
    const course = M().coursePlanner.buildCourse({ goal: 'posture', startedAt: '2026-06-01', weeks: 4 });
    const built = M().coursePlanner.buildDailySession(course, profile(), {
      todayKey: '2026-06-08',
      randomSeed: 'course-day-slot'
    });
    const plan = M().routineRunner.buildRunPlan(built.session);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.every((s) => s.slotId)).toBe(true);
    expect(plan.steps.some((s) => s.slotId === 'neck_control')).toBe(true);
  });

  it('replaceWithinSlot меняет упражнение внутри того же слота', () => {
    const course = M().coursePlanner.buildCourse({ goal: 'posture' });
    const result = M().coursePlanner.replaceWithinSlot(course, 'scapular_control', 'act_wall_angels', {
      profile: profile(),
      buildContext: M().modeEngine.buildContext('posture', {})
    });

    expect(result.ok).toBe(true);
    expect(result.replacementAtomId).not.toBe('act_wall_angels');
    const slot = result.course.slots.find((s) => s.id === 'scapular_control');
    expect(slot.atomIds[0]).toBe(result.replacementAtomId);
    expect(result.course.substitutions[0]).toMatchObject({
      slotId: 'scapular_control',
      fromAtomId: 'act_wall_angels',
      toAtomId: result.replacementAtomId
    });
  });

  it('replaceWithinSlot не выбирает упражнение с отсутствующим инвентарём', () => {
    const course = M().coursePlanner.buildCourse({ goal: 'posture' });
    const result = M().coursePlanner.replaceWithinSlot(course, 'scapular_control', 'act_wall_angels', {
      profile: profile({ equipment: [] }),
      buildContext: M().modeEngine.buildContext('posture', {}),
      reason: 'manual_replace'
    });

    expect(result.ok).toBe(true);
    expect(result.replacementAtomId).not.toBe('act_band_pullapart');
    const atom = M().atomCatalog.getAtom(result.replacementAtomId);
    expect(atom.gates.equipment || []).toHaveLength(0);
  });

  it('replaceWithinSlot принимает equipment как отдельный context contract', () => {
    const course = M().coursePlanner.buildCourse({ goal: 'posture' });
    const result = M().coursePlanner.replaceWithinSlot(course, 'thoracic_mobility', 'mob_dynamic_thoracic_openbook', {
      profile: profile({ equipment: [] }),
      equipment: ['foam_roll'],
      buildContext: M().modeEngine.buildContext('posture', {}),
      reason: 'manual_replace'
    });

    expect(result.ok).toBe(true);
    expect(result.replacementAtomId).toBe('mob_thoracic_extension_foamroll');
  });
});

describe('mobility records store course fields', () => {
  beforeAll(setupOnce);

  it('сохраняет course, slotHistory и stepFeedback client-scoped', () => {
    const storage = M().recordsStore.createMemoryStorage();
    const course = M().coursePlanner.buildCourse({ goal: 'posture' });

    M().recordsStore.saveCourse('c1', course, storage);
    M().recordsStore.addSlotHistory('c1', { courseId: course.id, slotId: 'neck_control', atomId: 'act_deep_neck_flexor_nod' }, storage);
    M().recordsStore.addStepFeedback('c1', { courseId: course.id, slotId: 'neck_control', atomId: 'act_deep_neck_flexor_nod', effort: 'ok' }, storage);

    const c1 = M().recordsStore.load('c1', storage);
    const c2 = M().recordsStore.load('c2', storage);
    expect(c1.courses).toHaveLength(1);
    expect(c1.slotHistory).toHaveLength(1);
    expect(c1.stepFeedback).toHaveLength(1);
    expect(c2.courses).toHaveLength(0);
    expect(M().recordsStore.latestCourse('c1', storage).id).toBe(course.id);
  });
});
