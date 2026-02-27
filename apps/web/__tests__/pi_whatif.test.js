/**
 * Tests for HEYS Predictive Insights — What-If Scenarios v1.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadScriptAsModule(scriptPath) {
    const code = fs.readFileSync(scriptPath, 'utf-8');
    const wrappedCode = `(function() { ${code} })()`;
    eval(wrappedCode);
}

describe('What-If Scenarios', () => {
    let HEYS;

    beforeEach(() => {
        // Setup global HEYS object with mocks
        global.HEYS = {
            InsightsPI: {
                patterns: {
                    lifestyle: {
                        analyzeProteinSatiety: vi.fn().mockReturnValue({ correlation: 0.65 }),
                        analyzeSleepWeight: vi.fn().mockReturnValue({ correlation: 0.55 })
                    },
                    timing: {
                        analyzeMealTiming: vi.fn().mockReturnValue({ score: 0.70 }),
                        analyzeWaveOverlap: vi.fn().mockReturnValue({ score: 0.60 }),
                        analyzeLateEating: vi.fn().mockReturnValue({ score: 0.50 })
                    },
                    quality: {
                        analyzeSleepQuality: vi.fn().mockReturnValue({ overall: 0.75 })
                    },
                    activity: {
                        analyzeStepsWeight: vi.fn().mockReturnValue({ correlation: 0.45 })
                    }
                }
            },
            dayUtils: {}
        };

        // Load the whatif module
        const whatifPath = path.join(__dirname, '../insights/pi_whatif.js');
        loadScriptAsModule(whatifPath);
        HEYS = global.HEYS;
    });

    const makeDays = (count) => {
        return new Array(count).fill(null).map((_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            meals: [
                { time: '08:00', items: [{ product_id: 1, gramm: 100 }] },
                { time: '13:00', items: [{ product_id: 2, gramm: 150 }] },
                { time: '19:00', items: [{ product_id: 3, gramm: 120 }] }
            ],
            sleepHours: 7.5,
            steps: 6000,
            weight: 70
        }));
    };

    describe('Simulation API', () => {
        it('simulates ADD_PROTEIN action', () => {
            const days = makeDays(14);
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.ADD_PROTEIN,
                { proteinGrams: 30, mealIndex: 0 },
                days,
                profile,
                pIndex
            );

            expect(result.available).toBe(true);
            expect(result.actionType).toBe('add_protein');
            expect(result.actionParams.proteinGrams).toBe(30);
            expect(result.baseline).toBeDefined();
            expect(result.predicted).toBeDefined();
            expect(result.impact).toBeDefined();
            expect(result.healthScoreChange).toBeDefined();
        });

        it('predicts pattern improvements for ADD_PROTEIN', () => {
            const days = makeDays(14);
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.ADD_PROTEIN,
                { proteinGrams: 30, mealIndex: 0 },
                days,
                profile,
                pIndex
            );

            // protein_satiety should improve
            const proteinImpact = result.impact.find(i => i.pattern === 'protein_satiety');
            expect(proteinImpact).toBeDefined();
            expect(proteinImpact.delta).toBeGreaterThan(0);
        });

        it('simulates SKIP_LATE_MEAL action', () => {
            const days = makeDays(14);
            days[days.length - 1].meals.push({ time: '22:00', items: [{ product_id: 4, gramm: 80 }] });

            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.SKIP_LATE_MEAL,
                {},
                days,
                profile,
                pIndex
            );

            expect(result.available).toBe(true);
            expect(result.actionType).toBe('skip_late_meal');

            // late_eating pattern should improve
            const lateEatingImpact = result.impact.find(i => i.pattern === 'late_eating');
            expect(lateEatingImpact).toBeDefined();
            expect(lateEatingImpact.delta).toBeGreaterThan(0);
        });

        it('simulates INCREASE_SLEEP action', () => {
            const days = makeDays(14);
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.INCREASE_SLEEP,
                { sleepIncrease: 1 },
                days,
                profile,
                pIndex
            );

            expect(result.available).toBe(true);

            // sleep_weight pattern should improve
            const sleepImpact = result.impact.find(i => i.pattern === 'sleep_weight');
            expect(sleepImpact).toBeDefined();
            expect(sleepImpact.delta).toBeGreaterThan(0);
        });

        it('simulates INCREASE_STEPS action', () => {
            const days = makeDays(14);
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.INCREASE_STEPS,
                { stepsIncrease: 3000 },
                days,
                profile,
                pIndex
            );

            expect(result.available).toBe(true);

            // steps_weight pattern should improve
            const stepsImpact = result.impact.find(i => i.pattern === 'steps_weight');
            expect(stepsImpact).toBeDefined();
            expect(stepsImpact.delta).toBeGreaterThan(0);
        });

        it('returns error for insufficient data', () => {
            const days = makeDays(5); // < 7 days
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.ADD_PROTEIN,
                { proteinGrams: 30, mealIndex: 0 },
                days,
                profile,
                pIndex
            );

            expect(result.available).toBe(false);
            expect(result.error).toContain('at least 7 days');
        });

        it('returns error for unknown action type', () => {
            const days = makeDays(14);
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                'INVALID_ACTION',
                {},
                days,
                profile,
                pIndex
            );

            expect(result.available).toBe(false);
            expect(result.error).toContain('Unknown action type');
        });
    });

    describe('Impact Calculation', () => {
        it('calculates delta and percent change correctly', () => {
            const days = makeDays(14);
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.ADD_PROTEIN,
                { proteinGrams: 30, mealIndex: 0 },
                days,
                profile,
                pIndex
            );

            result.impact.forEach(impact => {
                expect(impact).toHaveProperty('pattern');
                expect(impact).toHaveProperty('baseline');
                expect(impact).toHaveProperty('predicted');
                expect(impact).toHaveProperty('delta');
                expect(impact).toHaveProperty('percentChange');
                expect(impact).toHaveProperty('significance');

                // Delta should be predicted - baseline
                const expectedDelta = impact.predicted - impact.baseline;
                expect(Math.abs(impact.delta - expectedDelta)).toBeLessThan(0.01);
            });
        });

        it('identifies side benefits correctly', () => {
            const days = makeDays(14);
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.ADD_PROTEIN,
                { proteinGrams: 30, mealIndex: 0 },
                days,
                profile,
                pIndex
            );

            expect(result.sideBenefits).toBeDefined();
            expect(Array.isArray(result.sideBenefits)).toBe(true);

            // All side benefits should have positive improvement
            result.sideBenefits.forEach(benefit => {
                expect(benefit).toHaveProperty('pattern');
                expect(benefit).toHaveProperty('improvement');
                // v3.6+: format is '+N баллов'
                expect(benefit.improvement).toMatch(/^\+\d+ баллов$/);
            });
        });

        it('calculates health score change', () => {
            const days = makeDays(14);
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.SKIP_LATE_MEAL,
                {},
                days,
                profile,
                pIndex
            );

            expect(result.healthScoreChange).toBeDefined();
            expect(result.healthScoreChange).toHaveProperty('delta');
            expect(result.healthScoreChange).toHaveProperty('percent');
            expect(typeof result.healthScoreChange.delta).toBe('number');
            expect(typeof result.healthScoreChange.percent).toBe('number');
        });
    });

    describe('Practical Tips Generation', () => {
        it('generates practical tips for ADD_PROTEIN', () => {
            const days = makeDays(14);
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.ADD_PROTEIN,
                { proteinGrams: 30, mealIndex: 0 },
                days,
                profile,
                pIndex
            );

            expect(result.practicalTips).toBeDefined();
            expect(Array.isArray(result.practicalTips)).toBe(true);
            expect(result.practicalTips.length).toBeGreaterThan(0);
            expect(result.practicalTips.join(' ')).toContain('30г белка');
        });

        it('generates practical tips for SKIP_LATE_MEAL', () => {
            const days = makeDays(14);
            const profile = { optimum: 2000 };
            const pIndex = { byId: new Map() };

            const result = HEYS.InsightsPI.whatif.simulate(
                HEYS.InsightsPI.whatif.ACTION_TYPES.SKIP_LATE_MEAL,
                {},
                days,
                profile,
                pIndex
            );

            expect(result.practicalTips).toBeDefined();
            expect(result.practicalTips.some(tip => tip.includes('20:00'))).toBe(true);
        });
    });

    describe('Action Types Export', () => {
        it('exports all action types', () => {
            const actionTypes = HEYS.InsightsPI.whatif.ACTION_TYPES;

            expect(actionTypes.ADD_PROTEIN).toBe('add_protein');
            expect(actionTypes.INCREASE_MEAL_GAP).toBe('increase_meal_gap');
            expect(actionTypes.SKIP_LATE_MEAL).toBe('skip_late_meal');
            expect(actionTypes.INCREASE_SLEEP).toBe('increase_sleep');
            expect(actionTypes.INCREASE_STEPS).toBe('increase_steps');
        });
    });
});
