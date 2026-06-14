// kernel-gate.test.js — общий каркас валидаторов: Issue + S1 level/age gate.

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
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_gate_v1.js'), 'utf8'));
};

const G = () => globalThis.HEYS.TrainingKernel.gate;
const atom = (minLevel, minAge) => ({ id: 'a', gates: { minLevel: minLevel, minAge: minAge } });
const LO3 = { beginner: 0, intermediate: 1, advanced: 2 };
const LO4 = { beginner: 0, intermediate: 1, advanced: 2, elite: 3 };

describe('kernel gate', () => {
  beforeAll(setupOnce);

  it('Issue-конструкторы', () => {
    expect(G().ok('c', 'm').level).toBe('ok');
    expect(G().warn('c', 'm').level).toBe('warn');
    expect(G().err('c', 'm').level).toBe('error');
  });

  it('S1 fail-closed: нет профиля / возраста / minAge', () => {
    expect(G().levelAgeGate(atom('beginner', 0), null, LO3)[0].code).toBe('S1.no_profile');
    expect(G().levelAgeGate(atom('beginner', 0), { age: null, level: 'beginner' }, LO3)[0].code).toBe('S1.age_missing');
    expect(G().levelAgeGate(atom('beginner', null), { age: 20, level: 'beginner' }, LO3)[0].code).toBe('S1.atom_minAge_invalid');
  });

  it('S1 пороги возраста/уровня', () => {
    expect(G().levelAgeGate(atom('intermediate', 16), { age: 14, level: 'advanced' }, LO3)[0].code).toBe('S1.under_min_age');
    expect(G().levelAgeGate(atom('advanced', 0), { age: 30, level: 'beginner' }, LO3)[0].code).toBe('S1.under_min_level');
    expect(G().levelAgeGate(atom('beginner', 0), { age: 30, level: 'beginner' }, LO3)[0].code).toBe('S1.pass');
  });

  it('набор уровней инъектируется (3 vs 4 c elite)', () => {
    // 'elite' неизвестен в LO3 → профиль-уровень невалиден
    expect(G().levelAgeGate(atom('beginner', 0), { age: 30, level: 'elite' }, LO3)[0].code).toBe('S1.profile_level_missing');
    // в LO4 'elite' валиден
    expect(G().levelAgeGate(atom('beginner', 0), { age: 30, level: 'elite' }, LO4)[0].code).toBe('S1.pass');
  });

  it('runRules flattens issue arrays and nonOk drops ok issues', () => {
    const issues = G().runRules([
      () => G().ok('A.ok', 'ok'),
      () => [G().warn('B.warn', 'warn'), G().err('C.err', 'err')]
    ]);
    expect(issues.map((i) => i.code)).toEqual(['A.ok', 'B.warn', 'C.err']);
    expect(G().nonOk(issues).map((i) => i.code)).toEqual(['B.warn', 'C.err']);
  });

  it('runRules converts validator exceptions into fail-closed error', () => {
    const issues = G().runRules([() => { throw new Error('boom'); }]);
    expect(issues[0]).toMatchObject({ level: 'error', code: 'validator.exception' });
  });

  it('equipmentGate checks atom.gates.equipment against profile equipment', () => {
    const a = { id: 'eq-a', gates: { equipment: ['band', 'strap'] } };
    expect(G().equipmentGate(a, { equipment: ['band'] })[0]).toMatchObject({
      level: 'warn',
      code: 'E.equipment_missing',
      atomId: 'eq-a',
      missing: ['strap']
    });
    expect(G().equipmentGate(a, { equipment: ['band', 'strap'] })[0]).toMatchObject({
      level: 'ok',
      code: 'E.pass',
      atomId: 'eq-a'
    });
  });

  it('warmupRequired uses domain hooks without changing domain codes', () => {
    const fingersSession = { blocks: [{ id: 'maxhang', fatigueCost: 'high' }], context: { warmupDone: false } };
    const fingers = G().warmupRequired(fingersSession, {
      invalid: (s) => !s || !Array.isArray(s.blocks),
      invalidMsg: 'сессия без blocks',
      missingCode: 'S3.warmup_missing',
      missingMsg: 'intensive-блок(и) без warmup_done — сессия невалидна',
      missingExtra: (intensive) => ({ intensiveBlockIds: intensive.map((b) => b.id) })
    });
    expect(fingers[0]).toMatchObject({
      level: 'error',
      code: 'S3.warmup_missing',
      intensiveBlockIds: ['maxhang']
    });

    const mobilitySession = { warmupCompleted: false, blocks: [{ atoms: [{ id: 'hip', fatigueCost: 'high' }] }] };
    const mobility = G().warmupRequired(mobilitySession, {
      items: (s) => s.blocks.flatMap((b) => b.atoms || []),
      isIntensive: (a) => a.fatigueCost === 'high',
      warmupDone: (s) => s.warmupCompleted === true,
      emptyCode: 'S3.pass',
      missingCode: 'S3.no_warmup',
      missingMsg: 'интенсивный/end-range/баллистический блок без разминки',
      missingExtra: (intensive) => ({ atomId: intensive[0].id })
    });
    expect(mobility[0]).toMatchObject({ level: 'error', code: 'S3.no_warmup', atomId: 'hip' });
  });

  it('prerequisitesGate fail-closes missing prerequisite tokens', () => {
    const a = { id: 'pre-a', gates: { prerequisites: ['warmup_done', 'base_>=2y'] } };
    expect(G().prerequisitesGate(a, null)[0]).toMatchObject({
      level: 'error',
      code: 'S9.no_profile',
      atomId: 'pre-a'
    });
    expect(G().prerequisitesGate(a, { completedPrerequisites: ['warmup_done'] })[0]).toMatchObject({
      level: 'error',
      code: 'S9.prereq_missing',
      atomId: 'pre-a',
      missing: ['base_>=2y']
    });
    expect(G().prerequisitesGate(a, { completedPrerequisites: ['warmup_done', 'base_>=2y'] })[0].code).toBe('S9.pass');
  });
});
