import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

const MAIN_SOURCE = fs.readFileSync(path.resolve(__dirname, '../heys_supplements_v1.js'), 'utf8');
const SCIENCE_SOURCE = fs.readFileSync(path.resolve(__dirname, '../heys_supplements_science_v1.js'), 'utf8');
const ADVICE_SOURCE = fs.readFileSync(path.resolve(__dirname, '../advice/_other.js'), 'utf8');
const CASCADE_SOURCE = fs.readFileSync(path.resolve(__dirname, '../heys_cascade_card_v1.js'), 'utf8');
const IW_CONFIG = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../config/insulin-wave-config.json'), 'utf8'));

function loadSupplementsRuntime() {
  const values = new Map();
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  const context = {
    console,
    localStorage: storage,
    sessionStorage: storage,
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    HEYS: {
      utils: {
        lsGet: (key, fallback) => values.has(key) ? JSON.parse(values.get(key)) : fallback,
        lsSet: (key, value) => values.set(key, JSON.stringify(value)),
      },
      models: { normalizeItemGrams: value => Number(value) || 0 },
    },
    addEventListener() {},
    dispatchEvent() {},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(MAIN_SOURCE, context);
  vm.runInContext(SCIENCE_SOURCE, context);
  return context.HEYS.Supplements;
}

describe('supplements evidence and safety contract', () => {
  it('does not auto-prescribe from profile, meals, or preset courses', () => {
    const supplements = loadSupplementsRuntime();

    expect(supplements.getSmartRecommendations({ gender: 'Женский', age: 70 }, { sleepHours: 4 })).toEqual([]);
    expect(supplements.getMealBasedAdvice([{ items: [{ name: 'кофе' }] }], ['iron'], [], {})).toEqual([]);
    expect(supplements.checkInteractions(['iron', 'calcium'])).toEqual({ synergies: [], conflicts: [] });
    expect(supplements.applyCourse('winter')).toBe(false);
    expect(Object.values(supplements.COURSES).every(course => course.enabled === false)).toBe(true);
    expect(ADVICE_SOURCE).toContain('const allowLegacySupplementAdvice = false');
    expect(ADVICE_SOURCE).toContain('Это отметка выполнения вашего плана, а не оценка эффективности добавок.');
  });

  it('requires a dose and applies reviewed upper limits with unit conversion', () => {
    const supplements = loadSupplementsRuntime();

    expect(supplements.getDoseSafetyStatus('vitD', {}).status).toBe('missing');
    expect(supplements.getDoseSafetyStatus('vitD', { dose: 4000, unit: 'МЕ' }).status).toBe('warning');
    expect(supplements.getDoseSafetyStatus('vitD', { dose: 5000, unit: 'МЕ' }).status).toBe('danger');
    expect(supplements.getDoseSafetyStatus('vitD', { dose: 100, unit: 'мкг' }).status).toBe('warning');
    expect(supplements.getDoseSafetyStatus('b6', { dose: 13, unit: 'мг' }).status).toBe('danger');
    expect(supplements.getDoseSafetyStatus('vitC', { dose: 1000, unit: 'мг' }).status).toBe('unverified');
  });

  it('keeps indication evidence traceable to reviewed sources', () => {
    const supplements = loadSupplementsRuntime();
    const { EVIDENCE_BY_INDICATION, EVIDENCE_SOURCES, EVIDENCE_REVIEWED_AT } = supplements.SCIENCE;

    for (const items of Object.values(EVIDENCE_BY_INDICATION)) {
      for (const item of items) {
        expect(item.reviewedAt).toBe(EVIDENCE_REVIEWED_AT);
        expect(item.sourceIds.length).toBeGreaterThan(0);
        for (const sourceId of item.sourceIds) {
          expect(EVIDENCE_SOURCES[sourceId]?.url).toMatch(/^https:\/\//);
        }
      }
    }
    expect(EVIDENCE_BY_INDICATION.bcaa[0].evidenceLevel).toBe('unsupported');
    expect(EVIDENCE_BY_INDICATION.biotin[0].limitations).toContain('анализы');
    expect(supplements.SCIENCE.MORNING_SUPPLEMENT_SCIENCE).toBeUndefined();
    expect(supplements.getSynergies).toBeUndefined();
  });

  it('does not let supplement checkmarks change the insulin-wave score', () => {
    const supplements = loadSupplementsRuntime();

    expect(supplements.getInsulinWaveBonus('2026-07-21')).toBe(0);
    expect(Object.values(IW_CONFIG.SUPPLEMENTS_BONUS).every(item => item.bonus === 0)).toBe(true);
    expect(CASCADE_SOURCE).toContain('supplements_all: 0');
    expect(CASCADE_SOURCE).toContain('confidenceMap.supplements = 0');
    expect(CASCADE_SOURCE).not.toContain('score += suppWeight');
    expect(CASCADE_SOURCE).not.toContain('estScore += clamp(suppRatio');
  });
});
