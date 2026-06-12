// fingers-validators.test.js — Phase 1 / step 3 part 2: S1–S8 + homed V_*.
// Источник правил: METHODOLOGY ч.9 + IMPLEMENTATION_MAP «Заметки целостности».
// Off-live-path: модуль не на боевом пути.

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
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  ev('heys_fingers_validators_v1.js');
};

const V = () => globalThis.HEYS.Fingers.validators;

// Базовый атом для S1/S2/S5
const makeAtom = (over = {}) => ({
  id: 'fs_test',
  quality: 'finger_strength',
  modality: 'fingerboard',
  doseShape: 'hang',
  loadModel: 'rm_margin',
  gripId: 'openhand4',
  fatigueCost: 'moderate',
  tissueLoad: 'moderate',
  gates: { minLevel: 'intermediate', minAge: 16, dangerLevel: 'low', prerequisites: [] },
  sourceIds: ['test'], doseConfidence: 'B',
  ...over
});

describe('S1 — age/level gate (fail-closed)', () => {
  beforeAll(setupOnce);

  it('ok: профиль удовлетворяет minAge/minLevel', () => {
    const r = V().S1_ageLevelGate(makeAtom(), { age: 18, level: 'intermediate' });
    expect(r[0].level).toBe('ok');
    expect(r[0].code).toBe('S1.pass');
  });

  it('fail-closed: возраст отсутствует → error S1.age_missing', () => {
    const r = V().S1_ageLevelGate(makeAtom(), { age: null, level: 'intermediate' });
    expect(r[0].level).toBe('error');
    expect(r[0].code).toBe('S1.age_missing');
  });

  it('fail-closed: NaN age → error', () => {
    const r = V().S1_ageLevelGate(makeAtom(), { age: NaN, level: 'intermediate' });
    expect(r[0].level).toBe('error');
  });

  it('error: возраст ниже порога', () => {
    const r = V().S1_ageLevelGate(makeAtom(), { age: 14, level: 'intermediate' });
    expect(r[0].code).toBe('S1.under_min_age');
  });

  it('error: уровень ниже порога', () => {
    const r = V().S1_ageLevelGate(makeAtom(), { age: 25, level: 'beginner' });
    expect(r[0].code).toBe('S1.under_min_level');
  });

  it('fail-closed: профиля нет → error', () => {
    const r = V().S1_ageLevelGate(makeAtom(), null);
    expect(r[0].level).toBe('error');
    expect(r[0].code).toBe('S1.no_profile');
  });
});

describe('S2 — tissue freshness 48/72ч по gripGroup', () => {
  beforeAll(setupOnce);

  it('na: tissueLoad не high/max — не применим', () => {
    const r = V().S2_tissueFreshness(makeAtom({ tissueLoad: 'low' }), [], Date.now());
    expect(r[0].code).toBe('S2.na');
  });

  it('ok: high-tissue, история пустая → допускаем', () => {
    const r = V().S2_tissueFreshness(makeAtom({ tissueLoad: 'high' }), [], Date.now());
    expect(r[0].level).toBe('ok');
  });

  it('error: high-tissue нагрузка 24ч назад → блок', () => {
    const now = Date.now();
    const r = V().S2_tissueFreshness(
      makeAtom({ tissueLoad: 'high' }),
      [{ timestamp: now - 24 * 3600 * 1000, atomId: 'prev', tissueLoad: 'high' }],
      now
    );
    expect(r[0].code).toBe('S2.fresh_tissue_violation');
    expect(r[0].hoursAgo).toBeCloseTo(24, 0);
  });

  it('ok: high-tissue нагрузка 72ч назад → за окном', () => {
    const now = Date.now();
    const r = V().S2_tissueFreshness(
      makeAtom({ tissueLoad: 'high' }),
      [{ timestamp: now - 72 * 3600 * 1000, atomId: 'prev', tissueLoad: 'high' }],
      now
    );
    expect(r[0].code).toBe('S2.pass');
  });

  it('error: max-tissue нагрузка 60ч назад → блок по 72ч окну', () => {
    const now = Date.now();
    const r = V().S2_tissueFreshness(
      makeAtom({ tissueLoad: 'high', gripId: 'halfcrimp' }),
      [{ timestamp: now - 60 * 3600 * 1000, atomId: 'prev', tissueLoad: 'max', gripId: 'halfcrimp' }],
      now
    );
    expect(r[0].code).toBe('S2.fresh_tissue_violation');
    expect(r[0].windowHours).toBe(72);
  });

  it('ok: high-tissue нагрузка 60ч назад → за 48ч окном', () => {
    const now = Date.now();
    const r = V().S2_tissueFreshness(
      makeAtom({ tissueLoad: 'high', gripId: 'halfcrimp' }),
      [{ timestamp: now - 60 * 3600 * 1000, atomId: 'prev', tissueLoad: 'high', gripId: 'halfcrimp' }],
      now
    );
    expect(r[0].code).toBe('S2.pass');
  });

  it('ok: явная другая gripGroup в истории не блокирует текущий хват', () => {
    const now = Date.now();
    const r = V().S2_tissueFreshness(
      makeAtom({ tissueLoad: 'max', gripId: 'halfcrimp' }),
      [{ timestamp: now - 12 * 3600 * 1000, atomId: 'prev', tissueLoad: 'high', gripGroup: 'open_drag' }],
      now
    );
    expect(r[0].code).toBe('S2.pass');
  });

  it('error: совместимые crimp-хваты считаются одной gripGroup', () => {
    const now = Date.now();
    const r = V().S2_tissueFreshness(
      makeAtom({ tissueLoad: 'high', gripId: 'fullcrimp' }),
      [{ timestamp: now - 24 * 3600 * 1000, atomId: 'prev', tissueLoad: 'high', gripId: 'halfcrimp' }],
      now
    );
    expect(r[0].code).toBe('S2.fresh_tissue_violation');
    expect(r[0].gripGroup).toBe('crimp');
  });

  it('нит ревью: now=0 (Unix epoch) — легитимное значение, не падает в Date.now()', () => {
    // С now=0 история с timestamp=1ч (то есть 1970-01-01 01:00) попадает в окно
    // [now-48ч, now] = [-48ч, 0], где -48ч = -172800000. timestamp 3600000 > 0,
    // значит ВНЕ окна → S2.pass. Главное: не упало в Date.now() (где сейчас 2026).
    const r = V().S2_tissueFreshness(
      makeAtom({ tissueLoad: 'high' }),
      [{ timestamp: 3600000, atomId: 'prev', tissueLoad: 'high' }],
      0
    );
    expect(r[0].code).toBe('S2.pass'); // если бы упало в Date.now()=2026, было бы вне окна тем более; но если бы now=0→falsy→Date.now(), история с ts=3600000 (1970) была бы давно вне 48ч окна → тоже pass. Тогда отличить через окно с now=0:
  });

  it('нит ревью: now=0 — событие в окне 24ч (timestamp -24ч от 0)', () => {
    // С now=0 и timestamp=-86400000 (24ч назад): попадает в окно [-48ч, 0] → нарушение.
    // Если бы баг с || был жив (now=0→Date.now()=2026), timestamp -86400000 был бы
    // ~56 лет назад → вне окна → S2.pass. Отличие явное.
    const r = V().S2_tissueFreshness(
      makeAtom({ tissueLoad: 'high' }),
      [{ timestamp: -24 * 3600 * 1000, atomId: 'prev', tissueLoad: 'high' }],
      0
    );
    expect(r[0].code).toBe('S2.fresh_tissue_violation');
  });
});

describe('S3 — warmup required', () => {
  beforeAll(setupOnce);

  it('na: нет intensive-блоков', () => {
    const r = V().S3_warmupRequired({
      blocks: [{ id: 'easy', fatigueCost: 'low' }], context: { warmupDone: false }
    });
    expect(r[0].code).toBe('S3.na');
  });

  it('error: intensive-блок без warmup', () => {
    const r = V().S3_warmupRequired({
      blocks: [{ id: 'maxhang', fatigueCost: 'high' }], context: { warmupDone: false }
    });
    expect(r[0].code).toBe('S3.warmup_missing');
    expect(r[0].intensiveBlockIds).toContain('maxhang');
  });

  it('ok: intensive + warmup_done', () => {
    const r = V().S3_warmupRequired({
      blocks: [{ id: 'maxhang', fatigueCost: 'high' }], context: { warmupDone: true }
    });
    expect(r[0].code).toBe('S3.pass');
  });
});

describe('S4 — progression cap ≤10%/нед', () => {
  beforeAll(setupOnce);

  it('ok: рост 5%', () => {
    const r = V().S4_progressionCap(105, 100);
    expect(r[0].code).toBe('S4.pass');
    expect(r[0].ratio).toBeCloseTo(1.05);
  });

  it('warn: рост 15% > 10%', () => {
    const r = V().S4_progressionCap(115, 100);
    expect(r[0].level).toBe('warn');
    expect(r[0].code).toBe('S4.acute_overload');
  });

  it('na: нет trailing-базы (1-я неделя)', () => {
    const r = V().S4_progressionCap(100, 0);
    expect(r[0].code).toBe('S4.no_baseline');
  });
});

describe('S5 — open-hand first', () => {
  beforeAll(setupOnce);

  it('ok: открытый хват для beginner', () => {
    const r = V().S5_openhandFirst(makeAtom({ gripId: 'openhand4' }), { level: 'beginner' });
    expect(r[0].code).toBe('S5.pass');
  });

  it('warn: half-crimp для beginner', () => {
    const r = V().S5_openhandFirst(makeAtom({ gripId: 'halfcrimp' }), { level: 'beginner' });
    expect(r[0].code).toBe('S5.closed_grip_for_beginner');
  });

  it('ok: half-crimp для intermediate (не warn)', () => {
    const r = V().S5_openhandFirst(makeAtom({ gripId: 'halfcrimp' }), { level: 'intermediate' });
    expect(r[0].level).toBe('ok');
  });
});

describe('S6 — antagonist balance', () => {
  beforeAll(setupOnce);

  it('warn: тяжёлые тяги без antagonist', () => {
    const r = V().S6_antagonistBalance({
      sessions: [{ blocks: [{ quality: 'max_strength', fatigueCost: 'high' }] }]
    });
    expect(r[0].code).toBe('S6.missing_antagonist');
  });

  it('ok: тяги + antagonist в неделе', () => {
    const r = V().S6_antagonistBalance({
      sessions: [
        { blocks: [{ quality: 'max_strength', fatigueCost: 'high' }] },
        { blocks: [{ quality: 'antagonist', fatigueCost: 'low' }] }
      ]
    });
    expect(r[0].code).toBe('S6.pass');
  });

  it('na: нет тяжёлых тяг', () => {
    const r = V().S6_antagonistBalance({
      sessions: [{ blocks: [{ quality: 'aerobic_base', fatigueCost: 'low' }] }]
    });
    expect(r[0].code).toBe('S6.na');
  });
});

describe('S7 — deload required', () => {
  beforeAll(setupOnce);

  it('na: мезоцикл <4 недель', () => {
    const r = V().S7_deloadRequired({ weeks: [{ isDeload: false }, { isDeload: false }] });
    expect(r[0].code).toBe('S7.na');
  });

  it('warn: 4 недели без deload', () => {
    const r = V().S7_deloadRequired({
      weeks: [{ isDeload: false }, { isDeload: false }, { isDeload: false }, { isDeload: false }]
    });
    expect(r[0].code).toBe('S7.no_deload');
  });

  it('ok: 4 недели c deload', () => {
    const r = V().S7_deloadRequired({
      weeks: [{ isDeload: false }, { isDeload: false }, { isDeload: false }, { isDeload: true }]
    });
    expect(r[0].code).toBe('S7.pass');
  });
});

describe('S8 — pain stop', () => {
  beforeAll(setupOnce);

  it('error: painFlag=pain → block', () => {
    const r = V().S8_painStop({ painFlag: 'pain', painLocation: 'finger' });
    expect(r[0].level).toBe('error');
    expect(r[0].code).toBe('S8.pain_stop');
    expect(r[0].painLocation).toBe('finger');
  });

  it('warn: twinge', () => {
    const r = V().S8_painStop({ painFlag: 'twinge', painLocation: 'elbow' });
    expect(r[0].level).toBe('warn');
  });

  it('ok: none', () => {
    const r = V().S8_painStop({ painFlag: 'none' });
    expect(r[0].code).toBe('S8.pass');
  });
});

describe('S9 — prerequisites gate (ревью #4 safety-шов)', () => {
  beforeAll(setupOnce);

  it('na: атом без prereq → ok', () => {
    const r = V().S9_prerequisitesGate(makeAtom({ gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: [] } }), { age: 25, level: 'intermediate' });
    expect(r[0].code).toBe('S9.na');
  });

  it('fail-closed: профиль null → error', () => {
    const r = V().S9_prerequisitesGate(makeAtom({ gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: ['warmup_done'] } }), null);
    expect(r[0].code).toBe('S9.no_profile');
  });

  it('error: prereq не выполнен → S9.prereq_missing с list', () => {
    const r = V().S9_prerequisitesGate(
      makeAtom({ gates: { minLevel: 'intermediate', minAge: 18, dangerLevel: 'moderate', prerequisites: ['bfr_cuff_technique', 'warmup_done'] } }),
      { age: 30, level: 'advanced', completedPrerequisites: ['warmup_done'] }
    );
    expect(r[0].level).toBe('error');
    expect(r[0].code).toBe('S9.prereq_missing');
    expect(r[0].missing).toEqual(['bfr_cuff_technique']);
  });

  it('ok: все prereq выполнены', () => {
    const r = V().S9_prerequisitesGate(
      makeAtom({ gates: { minLevel: 'intermediate', minAge: 18, dangerLevel: 'moderate', prerequisites: ['bfr_cuff_technique', 'warmup_done'] } }),
      { age: 30, level: 'advanced', completedPrerequisites: ['warmup_done', 'bfr_cuff_technique'] }
    );
    expect(r[0].code).toBe('S9.pass');
  });

  it('default completedPrerequisites=undefined → строгий fail-closed', () => {
    const r = V().S9_prerequisitesGate(
      makeAtom({ gates: { minLevel: 'beginner', minAge: 0, dangerLevel: 'low', prerequisites: ['safe_fall_setup'] } }),
      { age: 30, level: 'advanced' /* completedPrerequisites не задан */ }
    );
    expect(r[0].code).toBe('S9.prereq_missing');
    expect(r[0].missing).toEqual(['safe_fall_setup']);
  });
});

describe('V_blockHomogeneity', () => {
  beforeAll(setupOnce);

  it('warn: атомы разных quality', () => {
    const r = V().V_blockHomogeneity({
      id: 'mixed',
      exercises: [
        { quality: 'finger_strength', fatigueCost: 'moderate' },
        { quality: 'aerobic_base', fatigueCost: 'low' }
      ]
    });
    expect(r.some((i) => i.code === 'V.block.mixed_quality')).toBe(true);
  });

  it('ok: однородный блок', () => {
    const r = V().V_blockHomogeneity({
      id: 'A',
      exercises: [
        { quality: 'finger_strength', fatigueCost: 'high' },
        { quality: 'finger_strength', fatigueCost: 'high' }
      ]
    });
    expect(r[0].code).toBe('V.block.pass');
  });
});

describe('V_sessionOrder', () => {
  beforeAll(setupOnce);

  it('warn: endurance раньше power', () => {
    const r = V().V_sessionOrder({
      blocks: [{ quality: 'aerobic_base' }, { quality: 'power' }]
    });
    expect(r[0].code).toBe('V.order.reverse');
  });

  it('ok: power → endurance → antagonist', () => {
    const r = V().V_sessionOrder({
      blocks: [{ quality: 'power' }, { quality: 'anaerobic_capacity' }, { quality: 'antagonist' }]
    });
    expect(r[0].code).toBe('V.order.pass');
  });
});

describe('V_energySystemSequence (homed 6.3 для всех моделей)', () => {
  beforeAll(setupOnce);

  it('warn: aerobic → phosphagen (обратный порядок)', () => {
    const r = V().V_energySystemSequence({
      weeks: [{ primaryEnergySystem: 'aerobic' }, { primaryEnergySystem: 'phosphagen' }]
    });
    expect(r[0].code).toBe('V.es_seq.reverse');
  });

  it('ok: phosphagen → glycolytic → aerobic', () => {
    const r = V().V_energySystemSequence({
      weeks: [
        { primaryEnergySystem: 'phosphagen' },
        { primaryEnergySystem: 'glycolytic' },
        { primaryEnergySystem: 'aerobic' }
      ]
    });
    expect(r[0].code).toBe('V.es_seq.pass');
  });
});

describe('V_skillBalance', () => {
  beforeAll(setupOnce);

  it('warn: beginner недобирает skill-долю (нужно ≥60%, имеем 33%)', () => {
    const r = V().V_skillBalance({
      sessions: [{ blocks: [
        { quality: 'finger_strength', modality: 'fingerboard' },
        { quality: 'max_strength', modality: 'weights' },
        { quality: 'technique', modality: 'drill' }
      ] }]
    }, 'beginner');
    expect(r[0].code).toBe('V.skill.under_skill');
  });

  it('ok: intermediate, доля навыка достаточна', () => {
    const r = V().V_skillBalance({
      sessions: [{ blocks: [
        { quality: 'technique', modality: 'drill' },
        { quality: 'technique', modality: 'wall' },
        { quality: 'finger_strength', modality: 'fingerboard' }
      ] }]
    }, 'intermediate');
    expect(r[0].code).toBe('V.skill.pass');
  });
});

describe('V_ageModifier / V_skinStatus', () => {
  beforeAll(setupOnce);

  it('35+ даёт мягкий volumeMultiplier, не hard-error', () => {
    const r = V().V_ageModifier({ age: 45 });
    expect(r[0].code).toBe('V.age.35plus_modifier');
    expect(r[0].level).toBe('warn');
    expect(r[0].volumeMultiplier).toBeLessThan(1);
  });

  it('normal skin проходит без ограничения', () => {
    const r = V().V_skinStatus({ skinStatus: 'ok' });
    expect(r[0].code).toBe('V.skin.pass');
    expect(r[0].volumeMultiplier).toBe(1);
  });

  it('flapper даёт мягкий cap объёма', () => {
    const r = V().V_skinStatus({ skinStatus: 'flapper' });
    expect(r[0].code).toBe('V.skin.volume_cap');
    expect(r[0].level).toBe('warn');
    expect(r[0].volumeMultiplier).toBe(0.5);
  });
});

describe('runAll — оркестратор', () => {
  beforeAll(setupOnce);

  it('собирает issues по нескольким зонам', () => {
    const issues = V().runAll({
      atom: makeAtom({ gripId: 'halfcrimp' }),
      session: { blocks: [{ id: 'mh', fatigueCost: 'high' }], context: { warmupDone: false } },
      sessionLog: { painFlag: 'pain', painLocation: 'finger' }
    }, { age: 14, level: 'beginner' });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('S1.under_min_age');
    expect(codes).toContain('S3.warmup_missing');
    expect(codes).toContain('S5.closed_grip_for_beginner');
    expect(codes).toContain('S8.pain_stop');
  });
});
