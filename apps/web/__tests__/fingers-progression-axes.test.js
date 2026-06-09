// fingers-progression-axes.test.js — B3 / progression module + sessionBuilder hints.
//
// Покрывает:
//   1. detectPlateau: window/threshold/edge cases
//   2. nextAxis: per-quality policy (volume→edge→load для силы, →speed для power)
//   3. suggestProgression: action keep/switch/exhausted
//   4. sessionBuilder.__progressionHints (ADVISORY) — wiring через
//      opts.recordsByQuality + opts.currentAxes
//
// Контракт зафиксирован методологом 2026-06-09: оси по убыванию безопасности
// volume(1) < density(2) < edge(3) < load(4) < speed(5); window default 3
// сессий; переключение оси не снимает S4/danger/prereq.
// Не путать с Fingers.suggestProgression (B4, авто-вес по RPE) —
// это отдельный API под HEYS.Fingers.progression.*

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

function loadModule(name) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(FINGERS_DIR, name), 'utf8'));
}

beforeAll(() => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  loadModule('heys_fingers_progression_v1.js');
});

const P = () => globalThis.HEYS.Fingers.progression;

describe('progression.detectPlateau — window + threshold', () => {
  it('недостаточно данных (<window) → hasPlateau:false', () => {
    const r = P().detectPlateau({ series: [{ ts: 1, value: 10 }, { ts: 2, value: 11 }] });
    expect(r.hasPlateau).toBe(false);
    expect(r.reason).toMatch(/недостаточно/);
    expect(r.sessionsCount).toBe(2);
  });

  it('3 сессии с приростом >0% → не плато', () => {
    const r = P().detectPlateau({
      series: [{ ts: 1, value: 100 }, { ts: 2, value: 105 }, { ts: 3, value: 110 }]
    });
    expect(r.hasPlateau).toBe(false);
    expect(r.deltaPct).toBeCloseTo(10, 5);
  });

  it('3 сессии без прироста (одинаковые) → плато', () => {
    const r = P().detectPlateau({
      series: [{ ts: 1, value: 50 }, { ts: 2, value: 50 }, { ts: 3, value: 50 }]
    });
    expect(r.hasPlateau).toBe(true);
    expect(r.deltaPct).toBe(0);
  });

  it('3 сессии с регрессией → плато', () => {
    const r = P().detectPlateau({
      series: [{ ts: 1, value: 60 }, { ts: 2, value: 58 }, { ts: 3, value: 55 }]
    });
    expect(r.hasPlateau).toBe(true);
    expect(r.deltaPct).toBeLessThan(0);
  });

  it('тuning windowSessions=5 → нужны 5 сессий для проверки', () => {
    const r3 = P().detectPlateau({
      series: [{ ts: 1, value: 10 }, { ts: 2, value: 10 }, { ts: 3, value: 10 }],
      windowSessions: 5
    });
    expect(r3.hasPlateau).toBe(false);
    expect(r3.reason).toMatch(/недостаточно/);
    const r5 = P().detectPlateau({
      series: Array.from({ length: 5 }, (_, i) => ({ ts: i, value: 10 })),
      windowSessions: 5
    });
    expect(r5.hasPlateau).toBe(true);
    expect(r5.sessionsCount).toBe(5);
  });

  it('improvementThreshold=0.05 (5%) — прирост 3% считается плато', () => {
    const r = P().detectPlateau({
      series: [{ ts: 1, value: 100 }, { ts: 2, value: 101 }, { ts: 3, value: 103 }],
      improvementThreshold: 0.05
    });
    expect(r.hasPlateau).toBe(true);
    expect(r.deltaPct).toBeCloseTo(3, 5);
  });

  it('окно берётся из ПОСЛЕДНИХ N сессий (старая регрессия не учитывается)', () => {
    const r = P().detectPlateau({
      series: [
        { ts: 1, value: 100 },
        { ts: 2, value: 50 },
        { ts: 3, value: 60 },
        { ts: 4, value: 70 },
        { ts: 5, value: 80 }
      ]
    });
    expect(r.hasPlateau).toBe(false);
    expect(r.deltaPct).toBeCloseTo(33.33, 1);
  });

  it('series пустая → не плато, мало данных', () => {
    const r = P().detectPlateau({ series: [] });
    expect(r.hasPlateau).toBe(false);
    expect(r.sessionsCount).toBe(0);
  });

  it('first=0 → невалидно (защита от деления на 0)', () => {
    const r = P().detectPlateau({
      series: [{ ts: 1, value: 0 }, { ts: 2, value: 10 }, { ts: 3, value: 20 }]
    });
    expect(r.hasPlateau).toBe(false);
    expect(r.reason).toMatch(/невалидные/);
  });
});

describe('progression.nextAxis — per-quality policy', () => {
  it('finger_strength: undefined → volume; volume → edge; edge → load; load → null/exhausted', () => {
    const fs0 = P().nextAxis('finger_strength', null);
    expect(fs0.nextAxis).toBe('volume');
    expect(fs0.exhausted).toBe(false);
    const fs1 = P().nextAxis('finger_strength', 'volume');
    expect(fs1.nextAxis).toBe('edge');
    const fs2 = P().nextAxis('finger_strength', 'edge');
    expect(fs2.nextAxis).toBe('load');
    const fs3 = P().nextAxis('finger_strength', 'load');
    expect(fs3.exhausted).toBe(true);
    expect(fs3.nextAxis).toBe(null);
  });

  it('power: volume → speed (минуем edge/density/load)', () => {
    const p1 = P().nextAxis('power', 'volume');
    expect(p1.nextAxis).toBe('speed');
    expect(p1.policy).toEqual(['volume', 'speed']);
    const p2 = P().nextAxis('power', 'speed');
    expect(p2.exhausted).toBe(true);
  });

  it('aerobic_base / anaerobic_capacity: volume → density', () => {
    expect(P().nextAxis('aerobic_base', 'volume').nextAxis).toBe('density');
    expect(P().nextAxis('anaerobic_capacity', 'volume').nextAxis).toBe('density');
    expect(P().nextAxis('aerobic_base', 'density').exhausted).toBe(true);
  });

  it('technique / antagonist / mobility / mental: только volume (нет edge/load)', () => {
    ['technique', 'antagonist', 'mobility', 'mental'].forEach((q) => {
      expect(P().nextAxis(q, 'volume').exhausted).toBe(true);
      expect(P().nextAxis(q, null).nextAxis).toBe('volume');
    });
  });

  it('неизвестное качество → default policy [volume]', () => {
    const r = P().nextAxis('unknown_quality', null);
    expect(r.nextAxis).toBe('volume');
    expect(r.policy).toEqual(['volume']);
  });

  it('currentAxis вне policy → fall through к первой policy-оси (volume)', () => {
    const r = P().nextAxis('finger_strength', 'density');
    expect(r.nextAxis).toBe('volume');
    expect(r.exhausted).toBe(false);
  });
});

describe('progression.suggestProgression — action keep/switch/exhausted', () => {
  it('прирост — action=keep, currentAxis сохраняется', () => {
    const r = P().suggestProgression({
      quality: 'finger_strength',
      currentAxis: 'volume',
      series: [{ ts: 1, value: 60 }, { ts: 2, value: 63 }, { ts: 3, value: 65 }]
    });
    expect(r.action).toBe('keep');
    expect(r.currentAxis).toBe('volume');
    expect(r.nextAxis).toBe(null);
    expect(r.plateau.hasPlateau).toBe(false);
  });

  it('плато на volume у finger_strength → action=switch, nextAxis=edge', () => {
    const r = P().suggestProgression({
      quality: 'finger_strength',
      currentAxis: 'volume',
      series: [{ ts: 1, value: 70 }, { ts: 2, value: 70 }, { ts: 3, value: 70 }]
    });
    expect(r.action).toBe('switch');
    expect(r.currentAxis).toBe('volume');
    expect(r.nextAxis).toBe('edge');
    expect(r.plateau.hasPlateau).toBe(true);
  });

  it('плато на load у finger_strength → action=exhausted (политика закончилась)', () => {
    const r = P().suggestProgression({
      quality: 'finger_strength',
      currentAxis: 'load',
      series: [{ ts: 1, value: 90 }, { ts: 2, value: 90 }, { ts: 3, value: 90 }]
    });
    expect(r.action).toBe('exhausted');
    expect(r.nextAxis).toBe(null);
    expect(r.plateau.hasPlateau).toBe(true);
  });

  it('плато на power volume → switch на speed', () => {
    const r = P().suggestProgression({
      quality: 'power',
      currentAxis: 'volume',
      series: [{ ts: 1, value: 5 }, { ts: 2, value: 5 }, { ts: 3, value: 5 }]
    });
    expect(r.action).toBe('switch');
    expect(r.nextAxis).toBe('speed');
  });

  it('плато без currentAxis → start с первой оси policy', () => {
    const r = P().suggestProgression({
      quality: 'finger_strength',
      series: [{ ts: 1, value: 60 }, { ts: 2, value: 60 }, { ts: 3, value: 60 }]
    });
    expect(r.action).toBe('switch');
    expect(r.nextAxis).toBe('volume');
  });
});

describe('progression — AXIS_RANK + POLICY constants', () => {
  it('AXIS_RANK по убыванию безопасности', () => {
    const rank = P().AXIS_RANK;
    expect(rank.volume).toBe(1);
    expect(rank.density).toBe(2);
    expect(rank.edge).toBe(3);
    expect(rank.load).toBe(4);
    expect(rank.speed).toBe(5);
  });

  it('POLICY: finger_strength = [volume, edge, load]', () => {
    expect(P().POLICY.finger_strength).toEqual(['volume', 'edge', 'load']);
  });

  it('POLICY: power = [volume, speed]', () => {
    expect(P().POLICY.power).toEqual(['volume', 'speed']);
  });

  it('POLICY: aerobic_base = [volume, density]', () => {
    expect(P().POLICY.aerobic_base).toEqual(['volume', 'density']);
  });
});

// ─── sessionBuilder integration ─────────────────────────────────────────────

describe('sessionBuilder.__progressionHints — ADVISORY wiring', () => {
  beforeAll(() => {
    loadModule('heys_fingers_quality_catalog_v1.js');
    loadModule('heys_fingers_grips_catalog_v1.js');
    loadModule('heys_fingers_block_catalog_v1.js');
    loadModule('heys_fingers_validators_v1.js');
    loadModule('heys_fingers_assessment_v1.js');
    loadModule('heys_fingers_age_gating_v1.js');
    loadModule('heys_fingers_session_builder_v1.js');
  });

  const SB = () => globalThis.HEYS.Fingers.sessionBuilder;

  it('без opts.recordsByQuality → __progressionHints=null', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max'
    });
    if (s !== null) {
      expect(s.__progressionHints).toBe(null);
    }
  });

  it('с opts.recordsByQuality + currentAxes → hints per встретившееся качество', () => {
    const series = [{ ts: 1, value: 60 }, { ts: 2, value: 60 }, { ts: 3, value: 60 }];
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max',
      recordsByQuality: {
        finger_strength: series
      },
      currentAxes: { finger_strength: 'volume' }
    });
    expect(s).not.toBeNull();
    expect(s.__progressionHints).not.toBeNull();
    expect(s.__progressionHints.finger_strength).toBeDefined();
    expect(s.__progressionHints.finger_strength.action).toBe('switch');
    expect(s.__progressionHints.finger_strength.nextAxis).toBe('edge');
  });

  it('hints собираются ТОЛЬКО для качеств, попавших в сессию (не для unknown)', () => {
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max',
      recordsByQuality: {
        unknown_quality: [{ ts: 1, value: 10 }, { ts: 2, value: 10 }, { ts: 3, value: 10 }]
      }
    });
    if (s !== null && s.__progressionHints) {
      expect(s.__progressionHints.unknown_quality).toBeUndefined();
    }
  });

  it('progressionWindow=5 пробрасывается в detectPlateau', () => {
    const series = [{ ts: 1, value: 60 }, { ts: 2, value: 60 }, { ts: 3, value: 60 }];
    const s = SB().recommendDay({
      equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max',
      recordsByQuality: { finger_strength: series },
      currentAxes: { finger_strength: 'volume' },
      progressionWindow: 5
    });
    expect(s).not.toBeNull();
    expect(s.__progressionHints.finger_strength.action).toBe('keep');
    expect(s.__progressionHints.finger_strength.plateau.reason).toMatch(/недостаточно/);
  });
});
