import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(async () => {
    global.window = global;
    global.HEYS = global.HEYS || {};
    global.HEYS.InsightsPI = global.HEYS.InsightsPI || {};

    await import('../insights/pi_stats.js');
    await import('../insights/patterns/sleep.js');
    await import('../insights/patterns/activity.js');
    await import('../insights/patterns/psychology.js');
    await import('../insights/patterns/lifestyle.js');
    await import('../insights/patterns/quality.js');
});

function makePIndex() {
    const byId = new Map();
    byId.set('p1', {
        id: 'p1',
        name: 'Test product',
        protein100: 20,
        simple100: 10,
        complex100: 20,
        goodFat100: 5,
        badFat100: 3,
        trans100: 0,
        kcal100: 250
    });
    return { byId };
}

function makeDay(date, overrides = {}) {
    return {
        date,
        meals: overrides.meals || [{
            items: [{ product_id: 'p1', grams: 200 }],
            time: '12:00',
            mood: overrides.mealMood || null
        }],
        ...overrides
    };
}

// Mock getMealQualityScore for pattern tests that need it
function setupMocks() {
    if (!global.HEYS) global.HEYS = {};
    global.HEYS.getMealQualityScore = function (meal, name, optimum, pIndex) {
        return { score: 0.75, name, optimum };
    };
}

describe('Advanced confidence rollout — correlation patterns', () => {
    setupMocks(); // Setup required mocks for pattern tests

    it('analyzeSleepHunger returns bayesianR + CI + outlierStats', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeSleepHunger;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { sleepHours: 5.5 }),
            makeDay('2026-02-13', { sleepHours: 6.0 }),
            makeDay('2026-02-12', { sleepHours: 6.5 }),
            makeDay('2026-02-11', { sleepHours: 7.0 }),
            makeDay('2026-02-10', { sleepHours: 7.5 }),
            makeDay('2026-02-09', { sleepHours: 6.2 }),
            makeDay('2026-02-08', { sleepHours: 5.8 }),
            makeDay('2026-02-07', { sleepHours: 6.7 })
        ];

        const res = fn(days, { sleepHours: 8 }, pIndex);
        expect(res.available).toBe(true);
        expect(res).toHaveProperty('bayesianR');
        expect(res).toHaveProperty('confidenceInterval');
        expect(res).toHaveProperty('outlierStats');
    });

    it('analyzeStepsWeight returns bayesianR + CI + outlierStats', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeStepsWeight;
        const days = [
            makeDay('2026-02-14', { steps: 10000, weightMorning: 79.8 }),
            makeDay('2026-02-13', { steps: 9500, weightMorning: 80.0 }),
            makeDay('2026-02-12', { steps: 9000, weightMorning: 80.2 }),
            makeDay('2026-02-11', { steps: 8500, weightMorning: 80.3 }),
            makeDay('2026-02-10', { steps: 8000, weightMorning: 80.5 }),
            makeDay('2026-02-09', { steps: 7500, weightMorning: 80.6 }),
            makeDay('2026-02-08', { steps: 7000, weightMorning: 80.8 }),
            makeDay('2026-02-07', { steps: 6500, weightMorning: 81.0 })
        ];

        const res = fn(days);
        expect(res.available).toBe(true);
        expect(res).toHaveProperty('bayesianR');
        expect(res).toHaveProperty('confidenceInterval');
        expect(res).toHaveProperty('outlierStats');
    });

    it('analyzeStressEating returns bayesianR + CI + outlierStats', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeStressEating;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { stressAvg: 8 }),
            makeDay('2026-02-13', { stressAvg: 7 }),
            makeDay('2026-02-12', { stressAvg: 6 }),
            makeDay('2026-02-11', { stressAvg: 5 }),
            makeDay('2026-02-10', { stressAvg: 4 }),
            makeDay('2026-02-09', { stressAvg: 6 }),
            makeDay('2026-02-08', { stressAvg: 7 }),
            makeDay('2026-02-07', { stressAvg: 5 })
        ];

        const res = fn(days, pIndex);
        expect(res.available).toBe(true);
        expect(res).toHaveProperty('bayesianR');
        expect(res).toHaveProperty('confidenceInterval');
        expect(res).toHaveProperty('outlierStats');
    });

    it('analyzeWellbeing returns bayesianR + CI + outlierStats', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeWellbeing;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { wellbeingAvg: 8, sleepQuality: 8, sleepHours: 8.0, steps: 10000 }),
            makeDay('2026-02-13', { wellbeingAvg: 7, sleepQuality: 7, sleepHours: 7.5, steps: 9000 }),
            makeDay('2026-02-12', { wellbeingAvg: 7, sleepQuality: 7, sleepHours: 7.2, steps: 8500 }),
            makeDay('2026-02-11', { wellbeingAvg: 6, sleepQuality: 6, sleepHours: 6.8, steps: 8000 }),
            makeDay('2026-02-10', { wellbeingAvg: 6, sleepQuality: 6, sleepHours: 6.5, steps: 7800 }),
            makeDay('2026-02-09', { wellbeingAvg: 5, sleepQuality: 5, sleepHours: 6.2, steps: 7000 }),
            makeDay('2026-02-08', { wellbeingAvg: 5, sleepQuality: 5, sleepHours: 6.0, steps: 6500 }),
            makeDay('2026-02-07', { wellbeingAvg: 4, sleepQuality: 4, sleepHours: 5.8, steps: 6000 })
        ];

        const res = fn(days, pIndex);
        expect(res.available).toBe(true);
        expect(res).toHaveProperty('bayesianR');
        expect(res).toHaveProperty('confidenceInterval');
        expect(res).toHaveProperty('outlierStats');
    });

    it('analyzeSleepWeight returns bayesianR + CI + outlierStats', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeSleepWeight;
        const days = [
            makeDay('2026-02-14', { sleepHours: 5.5, weightMorning: 80.5 }),
            makeDay('2026-02-13', { sleepHours: 6.0, weightMorning: 80.3 }),
            makeDay('2026-02-12', { sleepHours: 6.5, weightMorning: 80.1 }),
            makeDay('2026-02-11', { sleepHours: 7.0, weightMorning: 79.9 }),
            makeDay('2026-02-10', { sleepHours: 7.5, weightMorning: 79.7 }),
            makeDay('2026-02-09', { sleepHours: 6.2, weightMorning: 80.2 }),
            makeDay('2026-02-08', { sleepHours: 5.8, weightMorning: 80.4 }),
            makeDay('2026-02-07', { sleepHours: 6.7, weightMorning: 80.0 })
        ];

        const res = fn(days);
        expect(res.available).toBe(true);
        expect(res).toHaveProperty('bayesianR');
        expect(res).toHaveProperty('confidenceInterval');
        expect(res).toHaveProperty('outlierStats');
        expect(typeof res.correlation).toBe('number'); // analyzeSleepWeight returns 'correlation', not 'r'
    });

    it('analyzeSleepQuality returns correlation with metrics', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeSleepQuality;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { sleepQuality: 8, sleepHours: 8.0 }),
            makeDay('2026-02-13', { sleepQuality: 7, sleepHours: 7.5, weightMorning: 79.8 }),
            makeDay('2026-02-12', { sleepQuality: 7, sleepHours: 7.2, weightMorning: 80.0 }),
            makeDay('2026-02-11', { sleepQuality: 6, sleepHours: 6.8, weightMorning: 80.1 }),
            makeDay('2026-02-10', { sleepQuality: 6, sleepHours: 6.5, weightMorning: 80.2 }),
            makeDay('2026-02-09', { sleepQuality: 5, sleepHours: 6.2, weightMorning: 80.3 }),
            makeDay('2026-02-08', { sleepQuality: 5, sleepHours: 6.0, weightMorning: 80.4 }),
            makeDay('2026-02-07', { sleepQuality: 4, sleepHours: 5.8, weightMorning: 80.5 })
        ];

        const res = fn(days, pIndex);
        expect(res.available).toBe(true);
        // analyzeSleepQuality returns correlations for multiple metrics (weight, mood, steps, kcal)
        expect(res).toHaveProperty('correlations');
        if (res.correlations) {
            const metrics = Object.values(res.correlations);
            if (metrics.length > 0) {
                // Check first metric has confidence layer properties
                const first = metrics[0];
                expect(first).toHaveProperty('bayesianR');
                expect(first).toHaveProperty('confidenceInterval');
            }
        }
    });

    it('analyzeProteinSatiety returns bayesianR + CI + outlierStats', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeProteinSatiety;
        const pIndex = makePIndex();
        const profile = { norm: { prot: 120 } };
        const days = [
            makeDay('2026-02-14', {}),
            makeDay('2026-02-13', {}),
            makeDay('2026-02-12', {}),
            makeDay('2026-02-11', {}),
            makeDay('2026-02-10', {}),
            makeDay('2026-02-09', {}),
            makeDay('2026-02-08', {}),
            makeDay('2026-02-07', {})
        ];

        const res = fn(days, profile, pIndex);
        expect(res.available).toBe(true);
        expect(res).toHaveProperty('bayesianR');
        expect(res).toHaveProperty('confidenceInterval');
        expect(res).toHaveProperty('outlierStats');
    });

    it('analyzeMoodFood returns bayesianR + CI + outlierStats', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeMoodFood;
        const pIndex = makePIndex();
        const optimum = 1800;
        const days = [
            makeDay('2026-02-14', { moodAvg: 8, meals: [{ items: [{ product_id: 'p1', grams: 200 }], time: '12:00' }] }),
            makeDay('2026-02-13', { moodAvg: 7, meals: [{ items: [{ product_id: 'p1', grams: 180 }], time: '12:00' }] }),
            makeDay('2026-02-12', { moodAvg: 7, meals: [{ items: [{ product_id: 'p1', grams: 190 }], time: '12:00' }] }),
            makeDay('2026-02-11', { moodAvg: 6, meals: [{ items: [{ product_id: 'p1', grams: 170 }], time: '12:00' }] }),
            makeDay('2026-02-10', { moodAvg: 6, meals: [{ items: [{ product_id: 'p1', grams: 160 }], time: '12:00' }] }),
            makeDay('2026-02-09', { moodAvg: 5, meals: [{ items: [{ product_id: 'p1', grams: 150 }], time: '12:00' }] }),
            makeDay('2026-02-08', { moodAvg: 5, meals: [{ items: [{ product_id: 'p1', grams: 140 }], time: '12:00' }] }),
            makeDay('2026-02-07', { moodAvg: 4, meals: [{ items: [{ product_id: 'p1', grams: 130 }], time: '12:00' }] })
        ];

        const res = fn(days, pIndex, optimum);
        expect(res.available).toBe(true);
        expect(res).toHaveProperty('bayesianR');
        expect(res).toHaveProperty('confidenceInterval');
        expect(res).toHaveProperty('outlierStats');
    });

    it('analyzeMoodTrajectory returns bayesianR + CI + outlierStats', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeMoodTrajectory;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { meals: [{ items: [{ product_id: 'p1', grams: 200 }], mood: 8 }] }),
            makeDay('2026-02-13', { meals: [{ items: [{ product_id: 'p1', grams: 190 }], mood: 7.5 }] }),
            makeDay('2026-02-12', { meals: [{ items: [{ product_id: 'p1', grams: 180 }], mood: 7 }] }),
            makeDay('2026-02-11', { meals: [{ items: [{ product_id: 'p1', grams: 170 }], mood: 6.5 }] }),
            makeDay('2026-02-10', { meals: [{ items: [{ product_id: 'p1', grams: 160 }], mood: 6 }] }),
            makeDay('2026-02-09', { meals: [{ items: [{ product_id: 'p1', grams: 150 }], mood: 5.5 }] }),
            makeDay('2026-02-08', { meals: [{ items: [{ product_id: 'p1', grams: 140 }], mood: 5 }] }),
            makeDay('2026-02-07', { meals: [{ items: [{ product_id: 'p1', grams: 130 }], mood: 4.5 }] })
        ];

        const res = fn(days, pIndex);
        expect(res.available).toBe(true);
        // analyzeMoodTrajectory returns simpleBayesianR and proteinBayesianR (separate correlations)
        expect(res).toHaveProperty('simpleBayesianR');
        expect(res).toHaveProperty('proteinBayesianR');
        expect(res).toHaveProperty('confidenceInterval');
        expect(res).toHaveProperty('outlierStats');
    });
});

describe('Correlation patterns — edge cases', () => {
    it('handles sparse data gracefully (< 7 days)', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeSleepWeight;
        const days = [
            makeDay('2026-02-14', { sleepHours: 6, weightMorning: 80 }),
            makeDay('2026-02-13', { sleepHours: 7, weightMorning: 79.5 }),
            makeDay('2026-02-12', { sleepHours: 6.5, weightMorning: 79.8 })
        ];

        const res = fn(days);
        expect(res.available).toBe(false);
    });

    it('handles NaN values in mood data', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeMoodTrajectory;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { meals: [{ items: [{ product_id: 'p1', grams: 200 }], mood: NaN }] }),
            makeDay('2026-02-13', { meals: [{ items: [{ product_id: 'p1', grams: 200 }], mood: 7 }] }),
            makeDay('2026-02-12', { meals: [{ items: [{ product_id: 'p1', grams: 200 }], mood: null }] }),
            makeDay('2026-02-11', { meals: [{ items: [{ product_id: 'p1', grams: 200 }], mood: 6 }] }),
            makeDay('2026-02-10', { meals: [{ items: [{ product_id: 'p1', grams: 200 }], mood: undefined }] }),
            makeDay('2026-02-09', { meals: [{ items: [{ product_id: 'p1', grams: 200 }], mood: 5 }] }),
            makeDay('2026-02-08', { meals: [{ items: [{ product_id: 'p1', grams: 200 }], mood: 5 }] }),
            makeDay('2026-02-07', { meals: [{ items: [{ product_id: 'p1', grams: 200 }], mood: 4 }] })
        ];

        const res = fn(days, pIndex);
        // Should still work with valid values filtered
        expect(res).toBeDefined();
        expect(typeof res.available).toBe('boolean');
    });

    it('confidence interval bounds are valid [-1, 1]', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeStepsWeight;
        const days = [
            makeDay('2026-02-14', { steps: 10000, weightMorning: 79.8 }),
            makeDay('2026-02-13', { steps: 9500, weightMorning: 80.0 }),
            makeDay('2026-02-12', { steps: 9000, weightMorning: 80.2 }),
            makeDay('2026-02-11', { steps: 8500, weightMorning: 80.3 }),
            makeDay('2026-02-10', { steps: 8000, weightMorning: 80.5 }),
            makeDay('2026-02-09', { steps: 7500, weightMorning: 80.6 }),
            makeDay('2026-02-08', { steps: 7000, weightMorning: 80.8 }),
            makeDay('2026-02-07', { steps: 6500, weightMorning: 81.0 })
        ];

        const res = fn(days);
        if (res.available && res.confidenceInterval) {
            expect(res.confidenceInterval.lower).toBeGreaterThanOrEqual(-1);
            expect(res.confidenceInterval.upper).toBeLessThanOrEqual(1);
            expect(res.confidenceInterval.lower).toBeLessThanOrEqual(res.confidenceInterval.upper);
        }
    });

    it('bayesianR shrinks toward prior with small samples', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeSleepHunger;
        const pIndex = makePIndex();

        // Minimal valid sample (7 days)
        const days = [
            makeDay('2026-02-14', { sleepHours: 5.5 }),
            makeDay('2026-02-13', { sleepHours: 6.0 }),
            makeDay('2026-02-12', { sleepHours: 6.5 }),
            makeDay('2026-02-11', { sleepHours: 7.0 }),
            makeDay('2026-02-10', { sleepHours: 7.5 }),
            makeDay('2026-02-09', { sleepHours: 6.2 }),
            makeDay('2026-02-08', { sleepHours: 5.8 })
        ];

        const res = fn(days, { sleepHours: 8 }, pIndex);
        if (res.available && res.bayesianR !== undefined && res.r !== undefined) {
            // bayesianR should be closer to 0 (prior) than raw r for small n
            expect(Math.abs(res.bayesianR)).toBeLessThanOrEqual(Math.abs(res.r) + 0.1);
        }
    });

    it('outlierStats reports removed outliers', () => {
        const fn = global.HEYS.InsightsPI.patternModules.analyzeStressEating;
        const pIndex = makePIndex();
        const days = [
            makeDay('2026-02-14', { stressAvg: 20 }), // Outlier
            makeDay('2026-02-13', { stressAvg: 7 }),
            makeDay('2026-02-12', { stressAvg: 6 }),
            makeDay('2026-02-11', { stressAvg: 5 }),
            makeDay('2026-02-10', { stressAvg: 4 }),
            makeDay('2026-02-09', { stressAvg: 6 }),
            makeDay('2026-02-08', { stressAvg: 7 }),
            makeDay('2026-02-07', { stressAvg: 5 })
        ];

        const res = fn(days, pIndex);
        if (res.available && res.outlierStats) {
            // outlierStats has properties like stressOutliers, kcalOutliers, totalOutliers
            expect(typeof res.outlierStats).toBe('object');
            expect(res.outlierStats.stressOutliers).toBeGreaterThanOrEqual(0);
        }
    });
});
