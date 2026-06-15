// fingers-assessment.test.js — Phase 1 / step 3 part 3: scoring лимитера §3.2.
// Источник: CONSTRUCTOR_SPEC §3.2 (алгоритм), §3.5 (бенчмарки 🟠).
// Off-live-path: модуль не на боевом пути.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');
const KERNEL_DIR = path.resolve(__dirname, '..', '_kernel');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_assess_v1.js'), 'utf8'));
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  ev('heys_fingers_assessment_v1.js');
};

const A = () => globalThis.HEYS.Fingers.assessment;

const createStorageMock = () => {
  const store = {};
  return {
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
};

const setupRecords = () => {
  globalThis.localStorage = createStorageMock();
  globalThis.window.localStorage = globalThis.localStorage;
  globalThis.HEYS.utils = {
    lsGet: (key, dflt) => {
      try {
        const raw = globalThis.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : dflt;
      } catch (_) { return dflt; }
    },
    lsSet: (key, value) => {
      globalThis.localStorage.setItem(key, JSON.stringify(value));
    },
  };
  const src = fs.readFileSync(path.join(FINGERS_DIR, 'heys_fingers_records_store_v1.js'), 'utf8');
  // eslint-disable-next-line no-eval
  eval(src);
};

describe('BENCHMARKS — таблица §3.5 (только finger_strength имеет числа)', () => {
  beforeAll(setupOnce);

  it('finger_strength: beginner=null, intermediate/advanced/elite — числа в порядке возрастания', () => {
    const fs = A().BENCHMARKS.finger_strength;
    expect(fs.beginner).toBeNull();
    expect(fs.intermediate).toBeLessThan(fs.advanced);
    expect(fs.advanced).toBeLessThan(fs.elite);
  });

  it('finger_strength thresholds = Berta 2025 sex-neutral weighted means', () => {
    expect(A().BENCHMARKS.finger_strength.intermediate).toBe(70);
    expect(A().BENCHMARKS.finger_strength.advanced).toBe(87);
    expect(A().BENCHMARKS.finger_strength.elite).toBe(102);
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
    // Berta intermediate benchmark = 70, score = 40 → (70-40)/70 ≈ 0.43
    const d = A().computeDeficit('finger_strength', 'intermediate', 40);
    expect(d).toBeCloseTo((70 - 40) / 70, 2);
  });

  it('score ≥ benchmark → deficit = 0 (clamp)', () => {
    expect(A().computeDeficit('finger_strength', 'intermediate', 70)).toBe(0);
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
      { finger_strength: 40 }, // ниже Berta benchmark 70
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
    // elite benchmark fs = 102. score 90 → deficit ≈ 0.118, * prior 1.5 = 0.176
    // flag technique 0.15 * prior 0.8 = 0.12
    const r = A().assess(
      { finger_strength: 90 },
      { technique: 0.15 },
      'elite'
    );
    expect(r.leadingLimiter).toBe('finger_strength');
  });
});

describe('intermediate worked example — реалистичный сценарий', () => {
  beforeAll(setupOnce);

  it('средний скалолаз, слабая выносливость предплечий, средний-сильный fs', () => {
    // intermediate: fs benchmark = 70, score 68 → deficit ≈ 0.03 (×1.0 = 0.03)
    // aerobic_base benchmark null → 0
    // technique flag 0.3 (×1.2 = 0.36) ← это лидер
    // mental flag 0.1 (×1.1 = 0.11)
    const r = A().assess(
      { finger_strength: 68 },
      { technique: 0.3, mental: 0.1 },
      'intermediate'
    );
    expect(r.leadingLimiter).toBe('technique');
    expect(r.blockWeights.technique).toBeGreaterThan(r.blockWeights.finger_strength);
  });
});

describe('assessment battery — full limiter audit data model', () => {
  beforeAll(setupOnce);

  it('TEST_BATTERY covers physical tests and skill marker checklists', () => {
    expect(A().TEST_BATTERY.maxHang20mmHalf.quality).toBe('finger_strength');
    expect(A().TEST_BATTERY.criticalForce.quality).toBe('aerobic_base');
    expect(A().TEST_BATTERY.wPrime.quality).toBe('anaerobic_capacity');
    expect(A().TEST_BATTERY.techniqueMarkers.flagKey).toBe('technique');
    expect(A().TEST_BATTERY.mobilityMarkers.flagKey).toBe('mobility');
  });

  it('scoresFromBattery maps numeric tests and checklist markers', () => {
    const mapped = A().scoresFromBattery({
      maxHang20mmHalf: { score: 40, testedAt: '2026-01-01T00:00:00.000Z' },
      criticalForce: { score: 42 },
      techniqueMarkers: { markers: 3 },
      mentalMarkers: { markers: 1, maxMarkers: 2 }
    });

    expect(mapped.testScores.finger_strength).toBe(40);
    expect(mapped.testScores.aerobic_base).toBe(42);
    expect(mapped.skillFlags.technique).toBeCloseTo(3 / 5);
    expect(mapped.skillFlags.mental).toBeCloseTo(1 / 2);
    expect(mapped.normalized.maxHang20mmHalf.quality).toBe('finger_strength');
  });

  it('assessBattery preserves old assess result shape and adds battery context', () => {
    const r = A().assessBattery({
      maxHang20mmHalf: { score: 40 },
      techniqueMarkers: { markers: 1 }
    }, 'intermediate');

    expect(r.leadingLimiter).toBe('finger_strength');
    expect(r.battery.maxHang20mmHalf.score).toBe(40);
    expect(r.testScores.finger_strength).toBe(40);
    expect(r.skillFlags.technique).toBeCloseTo(0.2);
  });

  it('dueTests marks missing and stale tests as due using per-test cadence', () => {
    const now = Date.parse('2026-06-10T00:00:00.000Z');
    const due = A().dueTests({
      maxHang20mmHalf: { score: 70, testedAt: '2026-05-20T00:00:00.000Z' },
      techniqueMarkers: { markers: 1, testedAt: '2026-04-01T00:00:00.000Z' }
    }, now);
    const byId = Object.fromEntries(due.map((d) => [d.id, d]));

    expect(byId.maxHang20mmHalf.due).toBe(false);
    expect(byId.techniqueMarkers.due).toBe(true);
    expect(byId.criticalForce.due).toBe(true);
  });
});

describe('assessment battery — records-store persistence', () => {
  const CLIENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const CLIENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeAll(setupOnce);
  beforeEach(() => {
    setupRecords();
    globalThis.HEYS.currentClientId = CLIENT_A;
  });

  it('saveAssessmentBattery stores normalized partial battery in records_v1', () => {
    const R = globalThis.HEYS.Fingers.records;
    const stored = R.saveAssessmentBattery({
      maxHang20mmHalf: { score: 55, testedAt: '2026-06-01T00:00:00.000Z' },
      techniqueMarkers: { markers: 2, maxMarkers: 5 },
    }, { source: 'settings' });

    expect(stored.maxHang20mmHalf.quality).toBe('finger_strength');
    expect(stored.maxHang20mmHalf.score).toBe(55);
    expect(stored.techniqueMarkers.markers).toBe(2);
    expect(stored.techniqueMarkers.source).toBe('settings');
    expect(R.loadAssessmentBattery().maxHang20mmHalf.score).toBe(55);
  });

  it('assessment battery stays client-scoped through the existing records key', () => {
    const R = globalThis.HEYS.Fingers.records;
    R.saveAssessmentBattery({ maxHang20mmHalf: { score: 55 } });

    globalThis.HEYS.currentClientId = CLIENT_B;
    expect(R.loadAssessmentBattery()).toEqual({});
    R.saveAssessmentBattery({ maxHang20mmHalf: { score: 80 } });

    globalThis.HEYS.currentClientId = CLIENT_A;
    expect(R.loadAssessmentBattery().maxHang20mmHalf.score).toBe(55);
    globalThis.HEYS.currentClientId = CLIENT_B;
    expect(R.loadAssessmentBattery().maxHang20mmHalf.score).toBe(80);
  });

  it('assessLatestBattery reuses assessment.assessBattery on saved records', () => {
    const R = globalThis.HEYS.Fingers.records;
    R.saveAssessmentBattery({
      maxHang20mmHalf: { score: 40 },
      techniqueMarkers: { markers: 1, maxMarkers: 5 },
    });
    const result = R.assessLatestBattery('intermediate');
    expect(result.leadingLimiter).toBe('finger_strength');
    expect(result.battery.maxHang20mmHalf.score).toBe(40);
  });
});
