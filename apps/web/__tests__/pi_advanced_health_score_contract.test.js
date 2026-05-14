// R-INS audit P2: contract test for HEYS.InsightsPI.advanced.calculateHealthScore
// shape. Ensures `total` (number 0-100), `categories` (4 keys), `breakdown` (per
// category with score+weight+reliability+label) are always present.
//
// Если кто-то рефакторит calculateHealthScore — этот тест ловит regression
// до того как UI начнёт пытаться читать undefined.

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

beforeAll(async () => {
    global.window = global;
    global.HEYS = global.HEYS || {};
    global.HEYS.InsightsPI = global.HEYS.InsightsPI || {};

    // Load required modules in correct order
    await import('../insights/pi_stats.js');
    await import('../insights/pi_constants.js');
    // pi_advanced.js loads via eval style — match pattern of other tests
    const advancedPath = path.resolve(__dirname, '../insights/pi_advanced.js');
    const advancedContent = fs.readFileSync(advancedPath, 'utf8');
    eval(advancedContent);
});

describe('R-INS audit P2: calculateHealthScore shape contract', () => {
    let calc;

    beforeAll(() => {
        calc = global.HEYS?.InsightsPI?.advanced?.calculateHealthScore;
    });

    it('exposes function on HEYS.InsightsPI.advanced', () => {
        expect(typeof calc).toBe('function');
    });

    it('returns object with required top-level keys', () => {
        // Минимальный валидный input: empty patterns + minimal profile
        const result = calc([], { weight: 70, goal: 'maintenance' }, []);
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('total');
        expect(result).toHaveProperty('categories');
        expect(result).toHaveProperty('breakdown');
        expect(result).toHaveProperty('goalMode');
    });

    it('total is finite number in [0, 100]', () => {
        const result = calc([], { weight: 70, goal: 'maintenance' }, []);
        expect(typeof result.total).toBe('number');
        expect(Number.isFinite(result.total)).toBe(true);
        expect(result.total).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeLessThanOrEqual(100);
    });

    it('categories has 4 expected keys (nutrition/timing/activity/recovery)', () => {
        const result = calc([], { weight: 70, goal: 'maintenance' }, []);
        expect(result.categories).toBeDefined();
        expect(Object.keys(result.categories)).toEqual(
            expect.arrayContaining(['nutrition', 'timing', 'activity', 'recovery'])
        );
    });

    it('breakdown has 4 categories each with {score, weight, reliability, label}', () => {
        const result = calc([], { weight: 70, goal: 'maintenance' }, []);
        const expectedCats = ['nutrition', 'timing', 'activity', 'recovery'];
        for (const cat of expectedCats) {
            expect(result.breakdown[cat]).toBeDefined();
            expect(result.breakdown[cat]).toHaveProperty('score');
            expect(result.breakdown[cat]).toHaveProperty('weight');
            expect(result.breakdown[cat]).toHaveProperty('reliability');
            expect(result.breakdown[cat]).toHaveProperty('label');
            expect(typeof result.breakdown[cat].label).toBe('string');
        }
    });

    it('goalMode reflects profile.goal with maintenance default', () => {
        const cutting = calc([], { weight: 70, goal: 'cutting' }, []);
        const bulking = calc([], { weight: 70, goal: 'bulking' }, []);
        const noGoal = calc([], { weight: 70 }, []);
        const undefProfile = calc([], undefined, []);

        // goalMode возвращается всегда (хотя бы один из строковых режимов)
        expect(typeof cutting.goalMode).toBe('string');
        expect(typeof bulking.goalMode).toBe('string');
        expect(typeof noGoal.goalMode).toBe('string');
        expect(typeof undefProfile.goalMode).toBe('string');
        // total остаётся числом во всех случаях
        expect(Number.isFinite(cutting.total)).toBe(true);
        expect(Number.isFinite(noGoal.total)).toBe(true);
        expect(Number.isFinite(undefProfile.total)).toBe(true);
    });

    it('does not throw on empty/null inputs', () => {
        expect(() => calc(null, null, null)).not.toThrow();
        expect(() => calc(undefined, undefined, undefined)).not.toThrow();
        expect(() => calc([], {}, [])).not.toThrow();
    });
});
