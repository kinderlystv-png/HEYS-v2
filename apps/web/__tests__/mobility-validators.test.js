// mobility-validators.test.js — Safety S1–S9 + R1 + equipment gate (режим мобильности).
// Источник правил: METHODOLOGY ч.9 / §11.2, CONSTRUCTOR_SPEC §1.6/§3.2. Fail-closed.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(MOB_DIR, f), 'utf8')); };
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_validators_v1.js');
  ev('heys_mobility_atom_catalog_v1.js');
};

const V = () => globalThis.HEYS.Mobility.validators;

const atom = (over = {}) => Object.assign({
  id: 'a_test', block: 'D', axis: 'passive_flex', purpose: 'develop', autonomic: 'neutral',
  energySystem: null, modality: 'bodyweight', doseShape: 'hold',
  dose: { holdSec: 30, intensity: 'develop' }, jointRegion: 'hip',
  loadModel: 'amplitude', loadValue: 0.8,
  gates: { minLevel: 'beginner', minAge: 0, populationGate: [], contraind: [], equipment: [], prerequisites: [] },
  sourceIds: ['x'], doseConfidence: 'B'
}, over);

describe('S1 — age/level gate (fail-closed)', () => {
  beforeAll(setupOnce);
  it('ok', () => {
    const r = V().S1_ageLevelGate(atom(), { age: 30, level: 'beginner' });
    expect(r[0].level).toBe('ok'); expect(r[0].code).toBe('S1.pass');
  });
  it('нет профиля → error', () => {
    expect(V().S1_ageLevelGate(atom(), null)[0].code).toBe('S1.no_profile');
  });
  it('возраст отсутствует → error', () => {
    expect(V().S1_ageLevelGate(atom(), { age: null, level: 'beginner' })[0].code).toBe('S1.age_missing');
  });
  it('gates.minAge не число → error', () => {
    const a = atom({ gates: { minLevel: 'beginner', minAge: null, populationGate: [], contraind: [], equipment: [], prerequisites: [] } });
    expect(V().S1_ageLevelGate(a, { age: 20, level: 'beginner' })[0].code).toBe('S1.atom_minAge_invalid');
  });
  it('возраст ниже порога → error', () => {
    const a = atom({ gates: { minLevel: 'intermediate', minAge: 16, populationGate: [], contraind: [], equipment: [], prerequisites: [] } });
    expect(V().S1_ageLevelGate(a, { age: 14, level: 'advanced' })[0].code).toBe('S1.under_min_age');
  });
  it('уровень ниже порога → error', () => {
    const a = atom({ gates: { minLevel: 'intermediate', minAge: 0, populationGate: [], contraind: [], equipment: [], prerequisites: [] } });
    expect(V().S1_ageLevelGate(a, { age: 30, level: 'beginner' })[0].code).toBe('S1.under_min_level');
  });
});

describe('S2 — pain stop', () => {
  beforeAll(setupOnce);
  it('pain → error', () => {
    expect(V().S2_painStop({ level: 'pain', zone: 'hip' })[0].code).toBe('S2.pain_stop');
  });
  it('discomfort → ok', () => {
    expect(V().S2_painStop({ painFlags: [{ level: 'discomfort', zone: 'hip' }] })[0].level).toBe('ok');
  });
  it('нет флагов → ok', () => {
    expect(V().S2_painStop({})[0].code).toBe('S2.none');
  });
});

describe('S3 — разминка перед интенсивным', () => {
  beforeAll(setupOnce);
  it('интенсивный без разминки → error', () => {
    const s = { blocks: [{ atoms: [atom({ fatigueCost: 'high' })] }], warmupCompleted: false };
    expect(V().S3_warmupRequired(s)[0].code).toBe('S3.no_warmup');
  });
  it('end-range (develop hold) без разминки → error', () => {
    const s = { blocks: [{ atoms: [atom()] }] };
    expect(V().S3_warmupRequired(s)[0].code).toBe('S3.no_warmup');
  });
  it('с разминкой → pass', () => {
    const s = { blocks: [{ atoms: [atom()] }], warmupCompleted: true };
    expect(V().S3_warmupRequired(s)[0].level).toBe('ok');
  });
  it('лёгкий атом без разминки → pass', () => {
    const light = atom({ doseShape: 'cars', purpose: 'regulate', dose: { reps: [2, 3] } });
    expect(V().S3_warmupRequired({ blocks: [{ atoms: [light] }] })[0].level).toBe('ok');
  });
});

describe('S4 — population gate', () => {
  beforeAll(setupOnce);
  it('гипермобильный + ограниченный атом → error', () => {
    const a = atom({ gates: { minLevel: 'beginner', minAge: 0, populationGate: ['hypermobile'], contraind: [], equipment: [], prerequisites: [] } });
    expect(V().S4_populationGate(a, { populations: ['hypermobile'] })[0].code).toBe('S4.population_blocked');
  });
  it('нет популяции → pass', () => {
    const a = atom({ gates: { minLevel: 'beginner', minAge: 0, populationGate: ['hypermobile'], contraind: [], equipment: [], prerequisites: [] } });
    expect(V().S4_populationGate(a, { populations: [] })[0].level).toBe('ok');
  });
});

describe('S5 — PNF под контролем', () => {
  beforeAll(setupOnce);
  it('pnf + cardioFlag → warn', () => {
    const a = atom({ doseShape: 'pnf' });
    expect(V().S5_pnfControl(a, { cardioFlag: true })[0].code).toBe('S5.pnf_valsalva');
  });
  it('не pnf → na', () => {
    expect(V().S5_pnfControl(atom(), {})[0].code).toBe('S5.na');
  });
});

describe('S6 — противопоказания (gates.contraind)', () => {
  beforeAll(setupOnce);
  const withContra = (tokens, over = {}) => atom(Object.assign({
    gates: { minLevel: 'beginner', minAge: 0, populationGate: [], contraind: tokens, equipment: [], prerequisites: [] }
  }, over));
  it('pre_power перед мощностью → error', () => {
    const a = withContra(['pre_power'], { modality: 'percussion', doseShape: 'smr', jointRegion: 'ankle' });
    expect(V().S6_contraindication(a, { beforePower: true })[0].code).toBe('S6.pre_power');
  });
  it('острая травма зоны → error', () => {
    const a = withContra(['acute_injury'], { modality: 'foam_roll', doseShape: 'smr', jointRegion: 'hip' });
    expect(V().S6_contraindication(a, { acuteInjuryZone: 'hip' })[0].code).toBe('S6.over_injury');
  });
  it('общий матч состояния пользователя → error', () => {
    const a = withContra(['varicose']);
    expect(V().S6_contraindication(a, { contraindications: ['varicose'] })[0].code).toBe('S6.contraindicated');
  });
  it('нет contraind → na', () => {
    expect(V().S6_contraindication(atom(), {})[0].code).toBe('S6.na');
  });
});

describe('S7 — rehab gate', () => {
  beforeAll(setupOnce);
  it('rehab + активная боль → error', () => {
    expect(V().S7_rehabGate(atom(), { mode: 'rehab', activePain: true })[0].code).toBe('S7.rehab_pain');
  });
  it('rehab + высокая нагрузка → error', () => {
    expect(V().S7_rehabGate(atom({ tissueLoad: 'high' }), { mode: 'rehab' })[0].code).toBe('S7.rehab_too_intense');
  });
  it('не rehab → na', () => {
    expect(V().S7_rehabGate(atom(), { mode: 'morning_tonify' })[0].code).toBe('S7.na');
  });
});

describe('S8 — долгая статика перед мощностью', () => {
  beforeAll(setupOnce);
  it('pre_workout + hold>60 → warn', () => {
    const s = { mode: 'pre_workout_ramp', blocks: [{ atoms: [atom({ doseShape: 'hold', dose: { holdSec: 90 } })] }] };
    expect(V().S8_longStaticBeforePower(s)[0].code).toBe('S8.long_static_pre_power');
  });
  it('не предтренировочный → na', () => {
    expect(V().S8_longStaticBeforePower({ mode: 'evening_relax', blocks: [] })[0].code).toBe('S8.na');
  });
});

describe('S9 — утренний end-range', () => {
  beforeAll(setupOnce);
  it('утро + end-range без разминки → warn', () => {
    expect(V().S9_morningEndRange(atom(), { timeOfDay: 'morning' })[0].code).toBe('S9.morning_cold_endrange');
  });
  it('утро + end-range + разминка → pass', () => {
    expect(V().S9_morningEndRange(atom(), { timeOfDay: 'morning', warmupCompleted: true })[0].level).toBe('ok');
  });
});

describe('R1 — когерентность вектора', () => {
  beforeAll(setupOnce);
  it('tonify+relax на блоках → warn', () => {
    const s = { blocks: [{ autonomic: 'tonify' }, { autonomic: 'relax' }] };
    expect(V().R1_autonomicCoherence(s)[0].code).toBe('R1.mixed_vector');
  });
  it('вектор на АТОМАХ (блок без autonomic) → warn', () => {
    const s = { blocks: [{ atoms: [{ autonomic: 'tonify' }, { autonomic: 'relax' }] }] };
    expect(V().R1_autonomicCoherence(s)[0].code).toBe('R1.mixed_vector');
  });
  it('один вектор → pass', () => {
    expect(V().R1_autonomicCoherence({ blocks: [{ autonomic: 'relax' }] })[0].level).toBe('ok');
  });
});

describe('S2 в агрегаторах (runAtom/runSession)', () => {
  beforeAll(setupOnce);
  it('runSession ловит боль из context.painFlags', () => {
    const s = { mode: 'evening_relax', warmupCompleted: true, blocks: [{ autonomic: 'relax', atoms: [atom({ purpose: 'regulate', doseShape: 'breath', dose: {} })] }] };
    const issues = V().runSession(s, {}, { painFlags: [{ level: 'pain', zone: 'hip' }] });
    expect(issues.some((i) => i.code === 'S2.pain_stop')).toBe(true);
  });
  it('runAtom ловит боль по зоне атома', () => {
    const issues = V().runAtom(atom({ jointRegion: 'hip' }), { age: 30, level: 'beginner' }, { painFlags: [{ level: 'pain', zone: 'hip' }] });
    expect(issues.some((i) => i.code === 'S2.pain_stop')).toBe(true);
  });
  it('runAtom: боль в ДРУГОЙ зоне не блокирует атом', () => {
    const issues = V().runAtom(atom({ jointRegion: 'shoulder' }), { age: 30, level: 'beginner' }, { painFlags: [{ level: 'pain', zone: 'hip' }] });
    expect(issues.some((i) => i.code === 'S2.pain_stop')).toBe(false);
  });
});

describe('E — equipment gate', () => {
  beforeAll(setupOnce);
  it('нет инвентаря → warn', () => {
    const a = atom({ gates: { minLevel: 'beginner', minAge: 0, populationGate: [], contraind: [], equipment: ['foam_roll'], prerequisites: [] } });
    expect(V().E_equipmentGate(a, { equipment: [] })[0].code).toBe('E.equipment_missing');
  });
  it('инвентарь есть → pass', () => {
    const a = atom({ gates: { minLevel: 'beginner', minAge: 0, populationGate: [], contraind: [], equipment: ['foam_roll'], prerequisites: [] } });
    expect(V().E_equipmentGate(a, { equipment: ['foam_roll'] })[0].level).toBe('ok');
  });
});

describe('runAtom / runSession агрегаторы', () => {
  beforeAll(setupOnce);
  it('runAtom возвращает только non-ok', () => {
    const issues = V().runAtom(atom(), { age: null, level: 'beginner' }, {});
    expect(issues.some((i) => i.code === 'S1.age_missing')).toBe(true);
    expect(issues.every((i) => i.level !== 'ok')).toBe(true);
  });
  it('runSession чистой сессии → пусто', () => {
    const s = { mode: 'evening_relax', warmupCompleted: true, blocks: [{ autonomic: 'relax', atoms: [atom({ purpose: 'regulate', doseShape: 'breath', dose: {} })] }] };
    expect(V().runSession(s, {}, {}).length).toBe(0);
  });
});
