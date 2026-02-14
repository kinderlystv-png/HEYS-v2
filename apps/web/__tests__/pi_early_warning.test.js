import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(async () => {
    global.window = global;
    global.HEYS = global.HEYS || {};
    global.HEYS.InsightsPI = global.HEYS.InsightsPI || {};
    global.HEYS.InsightsPI.calculations = global.HEYS.InsightsPI.calculations || {};
    global.HEYS.Status = global.HEYS.Status || {};

    // Mock calculateHealthScore
    global.HEYS.InsightsPI.calculations.calculateHealthScore = function (day, profile, pIndex, days) {
        // Simple mock: return score based on day properties
        let score = 70;
        if (day.mockScore !== undefined) return { overall: day.mockScore };
        if (day.sleepHours >= 7) score += 10;
        if (day.meals && day.meals.length >= 3) score += 10;
        return { overall: score };
    };

    // Mock calculateItemKcal
    global.HEYS.InsightsPI.calculations.calculateItemKcal = function (item, pIndex) {
        if (!item || !item.grams) return 0;
        const prod = pIndex?.byId?.get?.(String(item.product_id || item.id).toLowerCase());
        if (!prod) return 100; // Default mock kcal
        const p = prod.protein100 || 0;
        const c = (prod.simple100 || 0) + (prod.complex100 || 0);
        const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0);
        return (p * 3 + c * 4 + f * 9) * item.grams / 100;
    };

    // Mock Status.calculate
    global.HEYS.Status.calculate = function (opts) {
        // Return cached statusScore if available
        if (opts.dayData?.statusScore !== undefined) {
            return { score: opts.dayData.statusScore };
        }
        if (opts.dayData?._statusCalculated) {
            return opts.dayData._statusCalculated;
        }
        // Default: calculate from factors
        return { score: 75 };
    };

    await import('../insights/pi_early_warning.js');
});

function makePIndex() {
    const byId = new Map();
    byId.set('p1', {
        id: 'p1',
        protein100: 20,
        simple100: 10,
        complex100: 20,
        goodFat100: 5,
        badFat100: 3,
        kcal100: 250
    });
    return { byId };
}

function makeDay(date, overrides = {}) {
    return {
        date,
        meals: [{ items: [{ product_id: 'p1', grams: 200 }], time: '12:00' }],
        ...overrides
    };
}

describe('Early Warning System', () => {
    it('returns unavailable when insufficient data (< 7 days)', () => {
        const detect = global.HEYS.InsightsPI.earlyWarning.detect;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14'),
            makeDay('2026-02-13'),
            makeDay('2026-02-12')
        ];

        const result = detect(days, { optimum: 2000 }, pIndex);
        expect(result.available).toBe(false);
        expect(result.reason).toBe('insufficient_data');
    });

    it('detects Health Score decline (3 days consecutive)', () => {
        const detect = global.HEYS.InsightsPI.earlyWarning.detect;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { mockScore: 50 }),
            makeDay('2026-02-13', { mockScore: 55 }),
            makeDay('2026-02-12', { mockScore: 60 }),
            makeDay('2026-02-11', { mockScore: 65 }),
            makeDay('2026-02-10', { mockScore: 70 }),
            makeDay('2026-02-09', { mockScore: 75 }),
            makeDay('2026-02-08', { mockScore: 80 })
        ];

        const result = detect(days, { optimum: 2000 }, pIndex);
        expect(result.available).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);

        const scoreWarning = result.warnings.find(w => w.type === 'HEALTH_SCORE_DECLINE');
        expect(scoreWarning).toBeDefined();
        expect(scoreWarning.days).toBe(3);
        expect(scoreWarning.currentScore).toBeLessThan(scoreWarning.previousScore);
    });

    it('detects sleep debt (3+ days < 7 hours)', () => {
        const detect = global.HEYS.InsightsPI.earlyWarning.detect;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { sleepHours: 5.5 }),
            makeDay('2026-02-13', { sleepHours: 6.0 }),
            makeDay('2026-02-12', { sleepHours: 6.5 }),
            makeDay('2026-02-11', { sleepHours: 8.0 }),
            makeDay('2026-02-10', { sleepHours: 8.0 }),
            makeDay('2026-02-09', { sleepHours: 7.5 }),
            makeDay('2026-02-08', { sleepHours: 7.5 })
        ];

        const result = detect(days, { optimum: 2000, sleepHours: 8 }, pIndex);
        expect(result.available).toBe(true);

        const sleepWarning = result.warnings.find(w => w.type === 'SLEEP_DEBT');
        expect(sleepWarning).toBeDefined();
        expect(sleepWarning.days).toBe(3);
        expect(sleepWarning.avgSleep).toBeLessThan(7);
        expect(sleepWarning.totalDeficit).toBeGreaterThan(0);
    });

    it('detects caloric debt (2+ days significant undereating)', () => {
        const detect = global.HEYS.InsightsPI.earlyWarning.detect;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { savedEatenKcal: 1000 }), // 1000 kcal deficit
            makeDay('2026-02-13', { savedEatenKcal: 1200 }), // 800 kcal deficit
            makeDay('2026-02-12', { savedEatenKcal: 1900 }), // Normal
            makeDay('2026-02-11', { savedEatenKcal: 2000 }), // Normal
            makeDay('2026-02-10', { savedEatenKcal: 1950 }), // Normal
            makeDay('2026-02-09', { savedEatenKcal: 2050 }), // Normal
            makeDay('2026-02-08', { savedEatenKcal: 2000 })  // Normal
        ];

        const result = detect(days, { optimum: 2000 }, pIndex);
        expect(result.available).toBe(true);

        const caloricWarning = result.warnings.find(w => w.type === 'CALORIC_DEBT');
        expect(caloricWarning).toBeDefined();
        expect(caloricWarning.days).toBe(2);
        expect(caloricWarning.totalDebt).toBeGreaterThan(1500);
    });

    it('returns no warnings when everything is fine', () => {
        const detect = global.HEYS.InsightsPI.earlyWarning.detect;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { mockScore: 80, sleepHours: 8, savedEatenKcal: 2000 }),
            makeDay('2026-02-13', { mockScore: 82, sleepHours: 7.5, savedEatenKcal: 1950 }),
            makeDay('2026-02-12', { mockScore: 81, sleepHours: 8, savedEatenKcal: 2050 }),
            makeDay('2026-02-11', { mockScore: 83, sleepHours: 7.8, savedEatenKcal: 2000 }),
            makeDay('2026-02-10', { mockScore: 80, sleepHours: 8, savedEatenKcal: 1980 }),
            makeDay('2026-02-09', { mockScore: 82, sleepHours: 7.5, savedEatenKcal: 2020 }),
            makeDay('2026-02-08', { mockScore: 81, sleepHours: 8, savedEatenKcal: 2000 })
        ];

        const result = detect(days, { optimum: 2000, sleepHours: 8 }, pIndex);
        expect(result.available).toBe(true);
        expect(result.count).toBe(0);
        expect(result.warnings.length).toBe(0);
        expect(result.summary).toContain('✅');
    });

    it('sorts warnings by severity (high > medium > low)', () => {
        const detect = global.HEYS.InsightsPI.earlyWarning.detect;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { mockScore: 40, sleepHours: 5, savedEatenKcal: 800 }), // Multiple high severity
            makeDay('2026-02-13', { mockScore: 45, sleepHours: 5.5, savedEatenKcal: 900 }),
            makeDay('2026-02-12', { mockScore: 50, sleepHours: 6, savedEatenKcal: 1000 }),
            makeDay('2026-02-11', { mockScore: 80, sleepHours: 8, savedEatenKcal: 2000 }),
            makeDay('2026-02-10', { mockScore: 85, sleepHours: 8, savedEatenKcal: 2000 }),
            makeDay('2026-02-09', { mockScore: 85, sleepHours: 8, savedEatenKcal: 2000 }),
            makeDay('2026-02-08', { mockScore: 85, sleepHours: 8, savedEatenKcal: 2000 })
        ];

        const result = detect(days, { optimum: 2000, sleepHours: 8 }, pIndex);
        expect(result.available).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);

        // Check severity ordering
        for (let i = 1; i < result.warnings.length; i++) {
            const prevSeverity = result.warnings[i - 1].severity;
            const currSeverity = result.warnings[i].severity;

            const order = { high: 0, medium: 1, low: 2 };
            expect(order[prevSeverity]).toBeLessThanOrEqual(order[currSeverity]);
        }
    });

    it('provides actionable messages and details', () => {
        const detect = global.HEYS.InsightsPI.earlyWarning.detect;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { sleepHours: 5.5 }),
            makeDay('2026-02-13', { sleepHours: 6.0 }),
            makeDay('2026-02-12', { sleepHours: 6.5 }),
            makeDay('2026-02-11', { sleepHours: 8.0 }),
            makeDay('2026-02-10', { sleepHours: 8.0 }),
            makeDay('2026-02-09', { sleepHours: 7.5 }),
            makeDay('2026-02-08', { sleepHours: 7.5 })
        ];

        const result = detect(days, { optimum: 2000, sleepHours: 8 }, pIndex);
        const sleepWarning = result.warnings.find(w => w.type === 'SLEEP_DEBT');

        if (sleepWarning) {
            expect(sleepWarning.message).toBeDefined();
            expect(sleepWarning.detail).toBeDefined();
            expect(sleepWarning.action).toBeDefined();
            expect(sleepWarning.actionable).toBe(true);
        }
    });

    it('detects critical pattern degradation when provided', () => {
        const detect = global.HEYS.InsightsPI.earlyWarning.detect;
        const pIndex = makePIndex();
        const days = Array.from({ length: 7 }, (_, i) =>
            makeDay(`2026-02-${String(14 - i).padStart(2, '0')}`)
        );

        const previousPatterns = {
            meal_timing: { available: true, score: 80, pattern: 'meal_timing', insight: 'Good timing' },
            wave_overlap: { available: true, score: 70, pattern: 'wave_overlap', insight: 'No overlaps' }
        };

        const currentPatterns = {
            meal_timing: { available: true, score: 55, pattern: 'meal_timing', insight: 'Timing issues' }, // -31% degradation
            wave_overlap: { available: true, score: 68, pattern: 'wave_overlap', insight: 'Minor overlap' } // -3% (no warning)
        };

        const result = detect(days, { optimum: 2000 }, pIndex, {
            previousPatterns,
            currentPatterns
        });

        expect(result.available).toBe(true);
        const patternWarning = result.warnings.find(w => w.type === 'CRITICAL_PATTERN_DEGRADATION');
        expect(patternWarning).toBeDefined();
        expect(patternWarning.pattern).toBe('meal_timing');
        expect(patternWarning.relativeChange).toBeLessThan(-20);
    });

    it('detects Status Score decline (3 days consecutive drop)', () => {
        const detect = global.HEYS.InsightsPI.earlyWarning.detect;
        const pIndex = makePIndex();
        // Days sorted OLDEST to NEWEST (as documented)
        const days = [
            makeDay('2026-02-08', { statusScore: 77 }),    // Day 1 (oldest)
            makeDay('2026-02-09', { statusScore: 76 }),
            makeDay('2026-02-10', { statusScore: 78 }),
            makeDay('2026-02-11', { statusScore: 75 }),
            makeDay('2026-02-12', { statusScore: 70 }),    // Start of decline
            makeDay('2026-02-13', { statusScore: 62 }),    // Continues  
            makeDay('2026-02-14', { statusScore: 55 })     // Day 7 (newest) - 15 point total drop
        ];

        const result = detect(days, { optimum: 2000 }, pIndex);
        expect(result.available).toBe(true);

        const statusWarning = result.warnings.find(w => w.type === 'STATUS_SCORE_DECLINE');
        expect(statusWarning).toBeDefined();
        expect(statusWarning.days).toBe(3);
        expect(statusWarning.startScore).toBe(70);
        expect(statusWarning.endScore).toBe(55);
        expect(statusWarning.totalDrop).toBeGreaterThanOrEqual(10);
        expect(statusWarning.severity).toMatch(/high|medium/);
    });

    it('does not warn on Status Score decline if drop is too small', () => {
        const detect = global.HEYS.InsightsPI.earlyWarning.detect;
        const pIndex = makePIndex();
        // Days sorted OLDEST to NEWEST
        const days = [
            makeDay('2026-02-08', { statusScore: 80 }),    // Day 1 (oldest)
            makeDay('2026-02-09', { statusScore: 79 }),
            makeDay('2026-02-10', { statusScore: 81 }),
            makeDay('2026-02-11', { statusScore: 80 }),
            makeDay('2026-02-12', { statusScore: 78 }),    // Slight decline
            makeDay('2026-02-13', { statusScore: 76 }),    // Continues
            makeDay('2026-02-14', { statusScore: 73 })     // Day 7 (newest) - only 5 point drop
        ];

        const result = detect(days, { optimum: 2000 }, pIndex);
        expect(result.available).toBe(true);

        const statusWarning = result.warnings.find(w => w.type === 'STATUS_SCORE_DECLINE');
        expect(statusWarning).toBeUndefined(); // Should NOT warn for small decline
    });
});
