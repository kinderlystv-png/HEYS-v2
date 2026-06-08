// fingers-assessment.test.js — Phase 1 / step 3 part 3: scoring лимитера §3.2.
// Источник: CONSTRUCTOR_SPEC §3.2 (алгоритм), §3.5 (бенчмарки 🟠).
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
  ev('heys_fingers_assessment_v1.js');
};

const A = () => globalThis.HEYS.Fingers.assessment;

describe('BENCHMARKS — таблица §3.5 (только finger_strength имеет числа)', () => {
  beforeAll(setupOnce);

  it('finger_strength: beginner=null, intermediate/advanced/elite — числа в порядке возрастания', () => {
    const fs = A().BENCHMARKS.finger_strength;
    expect(fs.beginner).toBeNull();
    expect(fs.intermediate).toBeLessThan(fs.advanced);
    expect(fs.advanced).toBeLessThan(fs.elite);
  });

  it('finger_strength.intermediate в диапазоне 49–67 (середина 58)', () => {
    expect(A().BENCHMARKS.finger_strength.intermediate).toBeGreaterThanOrEqual(49);
    expect(A().BENCHMARKS.finger_strength.intermediate).toBeLessThanOrEqual(67);
  });

  it('CF/aerobic_base и W′/anaerobic_capacity — null на всех уровнях (§3.5 нет нормативов)', () => {
    ['aerobic_base', 'anaerobic_capacity'].forEach((q) => {
      ['beginner', 'intermediate', 'advanced', 'elite'].forEach((lvl) => {
        expect(A().BENCHMARKS[q][lvl], `${q}.${lvl}`).toBeNull();
      });
    });
  });
});

describe('LEVEL_PRIOR — приоры уровня (§3.2 принцип)', () => {
  beforeAll(setupOnce);

  it('beginner: technique/mental выше 1.0, finger_strength ниже', () => {
    const p = A().LEVEL_PRIOR.beginner;
    expect(p.technique).toBeGreaterThan(1.0);
    expect(p.mental).toBeGreaterThan(1.0);
    expect(p.finger_strength).toBeLessThan(1.0);
  });

  it('elite: finger_strength выше 1.0, technique ниже', () => {
    const p = A().LEVEL_PRIOR.elite;
    expect(p.finger_strength).toBeGreaterThan(1.0);
    expect(p.technique).toBeLessThan(1.0);
  });

  it('intermediate: priors около 1.0 — нейтральный', () => {
    const p = A().LEVEL_PRIOR.intermediate;
    expect(p.finger_strength).toBeCloseTo(1.0);
    expect(p.max_strength).toBeCloseTo(1.0);
  });
});

describe('computeDeficit — §3.2 шаг 1', () => {
  beforeAll(setupOnce);

  it('score ниже benchmark → positive deficit', () => {
    // intermediate finger_strength benchmark = 58, score = 40 → (58-40)/58 ≈ 0.31
    const d = A().computeDeficit('finger_strength', 'intermediate', 40);
    expect(d).toBeCloseTo((58 - 40) / 58, 2);
  });

  it('score ≥ benchmark → deficit = 0 (clamp)', () => {
    expect(A().computeDeficit('finger_strength', 'intermediate', 60)).toBe(0);
    expect(A().computeDeficit('finger_strength', 'intermediate', 100)).toBe(0);
  });

  it('score = 0 → deficit = 1 (полный дефицит)', () => {
    expect(A().computeDeficit('finger_strength', 'intermediate', 0)).toBe(1);
  });

  it('clamp 0..1: отрицательный score → 1, не >1', () => {
    expect(A().computeDeficit('finger_strength', 'intermediate', -50)).toBe(1);
  });

  it('benchmark null (beginner finger_strength или aerobic_base) → 0 (нет данных)', () => {
    expect(A().computeDeficit('finger_strength', 'beginner', 30)).toBe(0);
    expect(A().computeDeficit('aerobic_base', 'intermediate', 50)).toBe(0);
  });

  it('score = null/undefined → 0 (нет теста)', () => {
    expect(A().computeDeficit('finger_strength', 'intermediate', null)).toBe(0);
    expect(A().computeDeficit('finger_strength', 'intermediate', undefined)).toBe(0);
  });
});

describe('computeFlag — §3.2 шаг 2', () => {
  beforeAll(setupOnce);

  it('частичные маркеры → доля', () => {
    expect(A().computeFlag(3, 10)).toBeCloseTo(0.3);
  });

  it('0 маркеров → 0', () => {
    expect(A().computeFlag(0, 10)).toBe(0);
  });

  it('max=0 → 0 (защита от деления на 0)', () => {
    expect(A().computeFlag(5, 0)).toBe(0);
  });

  it('clamp при превышении', () => {
    expect(A().computeFlag(15, 10)).toBe(1);
  });
});

describe('assess — интеграция §3.2 (3–5 + Q-1.4-3)', () => {
  beforeAll(setupOnce);

  it('intermediate с низкой силой пальцев → leadingLimiter=finger_strength', () => {
    const r = A().assess(
      { finger_strength: 40 }, // ниже benchmark 58
      { technique: 0.1, mental: 0.1 },
      'intermediate'
    );
    expect(r.leadingLimiter).toBe('finger_strength');
    expect(r.stimulus.finger_strength).toBe('develop');
  });

  it('intermediate с сильным flag-technique → leadingLimiter=technique', () => {
    const r = A().assess(
      { finger_strength: 100 }, // выше benchmark → deficit 0
      { technique: 0.8, mental: 0.1 },
      'intermediate'
    );
    expect(r.leadingLimiter).toBe('technique');
  });

  it('beginner: technique-prior 1.5 доминирует над finger_strength', () => {
    // даже с одинаковыми сигналами beginner получит technique лидером
    const r = A().assess(
      { finger_strength: 20 }, // beginner benchmark null → deficit 0
      { technique: 0.4, mental: 0.2 },
      'beginner'
    );
    expect(r.leadingLimiter).toBe('technique');
  });

  it('blockWeights суммируются в 1.0', () => {
    const r = A().assess(
      { finger_strength: 30 },
      { technique: 0.5, mental: 0.3 },
      'intermediate'
    );
    const sum = Object.values(r.blockWeights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('stimulus: ведущий = develop, остальные = maintain (Q-1.4-3 гибрид)', () => {
    const r = A().assess(
      { finger_strength: 40 },
      { technique: 0.1 },
      'intermediate'
    );
    const developCount = Object.values(r.stimulus).filter((s) => s === 'develop').length;
    const maintainCount = Object.values(r.stimulus).filter((s) => s === 'maintain').length;
    expect(developCount).toBe(1);
    expect(maintainCount).toBe(A().ALL_QUALITIES.length - 1);
  });

  it('§3.2 оговорка: CF/aerobic_base без бенчмарка → deficit=0 на первом тесте', () => {
    const r = A().assess(
      { aerobic_base: 25 }, // даже с явно низким score
      {},
      'intermediate'
    );
    expect(r.deficits.aerobic_base).toBe(0);
  });

  it('пустые входы → leadingLimiter всё равно определён (нейтральный baseline)', () => {
    const r = A().assess({}, {}, 'intermediate');
    expect(r.leadingLimiter).not.toBeNull();
    expect(typeof r.maxLimiterScore).toBe('number');
  });

  it('неизвестный уровень → error, не crash', () => {
    const r = A().assess({}, {}, 'godlike');
    expect(r.error).toBe('assessment.level_unknown');
  });

  it('elite c небольшим дефицитом fs (prior 1.5) обгоняет средний technique-flag', () => {
    // elite benchmark fs = 107. score 95 → deficit ≈ 0.112, * prior 1.5 = 0.168
    // flag technique 0.15 * prior 0.8 = 0.12
    const r = A().assess(
      { finger_strength: 95 },
      { technique: 0.15 },
      'elite'
    );
    expect(r.leadingLimiter).toBe('finger_strength');
  });
});

describe('intermediate worked example — реалистичный сценарий', () => {
  beforeAll(setupOnce);

  it('средний скалолаз, слабая выносливость предплечий, средний-сильный fs', () => {
    // intermediate: fs benchmark = 58, score 55 → deficit ≈ 0.05 (×1.0 = 0.05)
    // aerobic_base benchmark null → 0
    // technique flag 0.3 (×1.2 = 0.36) ← это лидер
    // mental flag 0.1 (×1.1 = 0.11)
    const r = A().assess(
      { finger_strength: 55 },
      { technique: 0.3, mental: 0.1 },
      'intermediate'
    );
    expect(r.leadingLimiter).toBe('technique');
    expect(r.blockWeights.technique).toBeGreaterThan(r.blockWeights.finger_strength);
  });
});
