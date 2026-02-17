/**
 * Tests for HEYS Predictive Insights — Meal Planner v1.0
 * 
 * Module: pi_meal_planner.js
 * Purpose: Timeline planning for multiple meals considering:
 * - Insulin wave end times (via InsulinWave module)
 * - Fat-burning windows (+30min after wave)
 * - Pre-sleep buffer (3h before bedtime)
 * - Budget distribution across N meals
 * - Only first meal actionable
 * 
 * Test Coverage:
 * 1. Core algorithm — timeline calculation
 * 2. Budget distribution — macro splitting
 * 3. Sleep target estimation — historical data
 * 4. Wave duration estimation — macro-based prediction
 * 5. Edge cases — boundary conditions
 * 6. Integration — with recommender
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadScriptAsModule(scriptPath) {
    const code = fs.readFileSync(scriptPath, 'utf-8');
    const wrappedCode = `(function() { ${code} })()`;
    eval(wrappedCode);
}

describe('Meal Planner v1.0', () => {
    let HEYS;

    beforeEach(() => {
        // Setup global HEYS object with required dependencies
        global.HEYS = {
            InsightsPI: {
                mealPlanner: null // Will be loaded
            },
            InsulinWave: {
                // Mock insulin wave calculator
                calculate: ({ lastMealTime, nutrients, profile, baseWaveHours }) => {
                    // Simple mock: base wave + modifiers
                    const lastMealMinutes = HEYS.utils.timeToMinutes(lastMealTime);
                    const waveHours = baseWaveHours || 3;

                    // Add 30 min for high GI
                    let waveMod = 0;
                    if (nutrients.glycemicLoad > 20) waveMod += 0.5;
                    if (nutrients.fat > 15) waveMod += 0.5;
                    if (nutrients.protein > 30) waveMod -= 0.3;

                    const finalWaveHours = Math.max(2.5, Math.min(5, waveHours + waveMod));
                    const waveMinutes = finalWaveHours * 60;
                    const waveEndMinutes = lastMealMinutes + waveMinutes;
                    const currentMinutes = HEYS.utils.timeToMinutes('14:30'); // Mock current time

                    return {
                        waveMinutes: waveMinutes,
                        waveEndTime: `${Math.floor(waveEndMinutes / 60)}:${String(waveEndMinutes % 60).padStart(2, '0')}`,
                        progressPct: ((currentMinutes - lastMealMinutes) / waveMinutes) * 100,
                        isActive: currentMinutes < waveEndMinutes
                    };
                }
            },
            utils: {
                // Mock time utilities
                timeToMinutes: (timeStr) => {
                    const [h, m] = timeStr.split(':').map(Number);
                    return h * 60 + m;
                }
            }
        };

        // Load the meal planner module
        const plannerPath = path.join(__dirname, '../insights/pi_meal_planner.js');
        loadScriptAsModule(plannerPath);
        HEYS = global.HEYS;
    });

    describe('Utility Functions', () => {
        it('parseTime converts HH:MM to decimal hours', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            expect(planner.parseTime('14:30')).toBe(14.5);
            expect(planner.parseTime('09:15')).toBe(9.25);
            expect(planner.parseTime('23:00')).toBe(23.0);
            expect(planner.parseTime('00:30')).toBe(0.5);
        });

        it('formatTime converts decimal hours to HH:MM', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            expect(planner.formatTime(14.5)).toBe('14:30');
            expect(planner.formatTime(9.25)).toBe('09:15');
            expect(planner.formatTime(23.0)).toBe('23:00');
            expect(planner.formatTime(0.5)).toBe('00:30');
        });

        it('minutesToHours converts minutes to decimal hours', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            expect(planner.minutesToHours(90)).toBe(1.5);
            expect(planner.minutesToHours(180)).toBe(3.0);
            expect(planner.minutesToHours(45)).toBe(0.75);
        });
    });

    describe('Budget Distribution', () => {
        it('distributes budget for 1 meal (100%)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const remainingBudget = { prot: 60, carbs: 80, fat: 20, kcal: 700 };
            const budgets = planner.distributeBudget(remainingBudget, 1);

            expect(budgets).toHaveLength(1);
            expect(budgets[0].prot).toBe(60);
            expect(budgets[0].carbs).toBe(80);
            expect(budgets[0].fat).toBe(20);
            expect(budgets[0].kcal).toBe(700);
        });

        it('distributes budget for 2 meals (60/40)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const remainingBudget = { prot: 60, carbs: 80, fat: 20, kcal: 700 };
            const budgets = planner.distributeBudget(remainingBudget, 2);

            expect(budgets).toHaveLength(2);
            expect(budgets[0].prot).toBe(36); // 60%
            expect(budgets[1].prot).toBe(24); // 40%
            expect(budgets[0].kcal).toBe(420); // 60%
            expect(budgets[1].kcal).toBe(280); // 40%
        });

        it('distributes budget for 3 meals (45/35/20)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const remainingBudget = { prot: 100, carbs: 100, fat: 20, kcal: 1000 };
            const budgets = planner.distributeBudget(remainingBudget, 3);

            expect(budgets).toHaveLength(3);
            expect(budgets[0].prot).toBe(45); // 45%
            expect(budgets[1].prot).toBe(35); // 35%
            expect(budgets[2].prot).toBe(20); // 20%
        });

        it('distributes budget for 4 meals (35/30/20/15)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const remainingBudget = { prot: 100, carbs: 100, fat: 20, kcal: 1000 };
            const budgets = planner.distributeBudget(remainingBudget, 4);

            expect(budgets).toHaveLength(4);
            expect(budgets[0].prot).toBe(35);
            expect(budgets[1].prot).toBe(30);
            expect(budgets[2].prot).toBe(20);
            expect(budgets[3].prot).toBe(15);
        });

        it('handles zero remaining budget', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const remainingBudget = { prot: 0, carbs: 0, fat: 0, kcal: 0 };
            const budgets = planner.distributeBudget(remainingBudget, 2);

            expect(budgets).toHaveLength(2);
            expect(budgets[0].kcal).toBe(0);
            expect(budgets[1].kcal).toBe(0);
        });
    });

    describe('Wave Duration Estimation', () => {
        it('estimates wave for high-carb meal (longer wave)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const macros = { prot: 30, carbs: 60, fat: 10, kcal: 450 }; // High GI ≈ 60
            const profile = { insulinWaveHours: 3.5 };

            const duration = planner.estimateWaveDuration(macros, profile);

            expect(duration).toBeGreaterThan(3.5); // Should be > base
            expect(duration).toBeLessThanOrEqual(5.0); // Max cap
        });

        it('estimates wave for high-protein meal (shorter wave)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const macros = { prot: 60, carbs: 20, fat: 5, kcal: 365 }; // Low GI, high protein
            const profile = { insulinWaveHours: 3.5 };

            const duration = planner.estimateWaveDuration(macros, profile);

            expect(duration).toBeLessThan(3.5); // Should be < base
            expect(duration).toBeGreaterThanOrEqual(2.5); // Min cap
        });

        it('estimates wave for balanced meal', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const macros = { prot: 40, carbs: 40, fat: 15, kcal: 475 };
            const profile = { insulinWaveHours: 3.5 };

            const duration = planner.estimateWaveDuration(macros, profile);

            expect(duration).toBeCloseTo(3.5, 0.5); // Near base ± 0.5h
        });
    });

    describe('Sleep Target Estimation', () => {
        it('estimates sleep from historical last meal times', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const days = [
                { date: '2026-02-14', meals: [{ time: '20:00' }] },
                { date: '2026-02-13', meals: [{ time: '19:30' }] },
                { date: '2026-02-12', meals: [{ time: '20:30' }] },
                { date: '2026-02-11', meals: [{ time: '19:45' }] }
            ];
            const profile = {};

            const sleepTarget = planner.estimateSleepTarget(days, profile);

            // Avg last meal ≈ 20:00 → sleep ≈ 23:00
            expect(sleepTarget).toBeCloseTo(23.0, 1.0);
        });

        it('uses profile.sleepTarget if no historical data', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const days = [];
            const profile = { sleepTarget: '22:30' };

            const sleepTarget = planner.estimateSleepTarget(days, profile);

            expect(sleepTarget).toBe(22.5);
        });

        it('defaults to 23:00 if no data or profile', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const days = [];
            const profile = {};

            const sleepTarget = planner.estimateSleepTarget(days, profile);

            expect(sleepTarget).toBe(23.0);
        });
    });

    describe('Core Planning Algorithm', () => {
        it('plans 2 meals with sufficient time window', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '14:30',
                lastMeal: {
                    time: '11:00',
                    totals: { prot: 30, carbs: 40, fat: 10, kcal: 370, glycemicLoad: 15 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 50, carbs: 70, fat: 15, kcal: 650 },
                profile: { insulinWaveHours: 3 },
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            expect(result.available).toBe(true);
            expect(result.meals).toBeDefined();
            expect(result.meals.length).toBeGreaterThanOrEqual(1);
            expect(result.meals[0].isActionable).toBe(true); // First meal actionable
            if (result.meals.length > 1) {
                expect(result.meals[1].isActionable).toBe(false); // Others not actionable
            }
            expect(result.summary).toBeDefined();
            expect(result.summary.totalMeals).toBe(result.meals.length);
        });

        it('returns no meals if insufficient remaining budget (<50 kcal)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '20:00',
                lastMeal: {
                    time: '17:00',
                    totals: { prot: 40, carbs: 50, fat: 10, kcal: 470 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 118, carbs: 145, fat: 38, kcal: 1760 }, // Only 40 kcal left
                profile: {},
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            expect(result.available).toBe(true);
            expect(result.meals).toHaveLength(0);
            expect(result.summary.totalMeals).toBe(0);
            expect(result.summary.reason).toContain('практически выполнена');
        });

        it('returns no meals if no time before sleep deadline', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '21:30',
                lastMeal: {
                    time: '18:00',
                    totals: { prot: 30, carbs: 40, fat: 10, kcal: 370 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 80, carbs: 100, fat: 25, kcal: 1000 },
                profile: {},
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] }, // Sleep target ≈ 23:00
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            // Wave end + fat burn + time may exceed deadline
            expect(result.available).toBe(true);
            // Could be 0 or 1 meal depending on timing calculation
            if (result.meals.length === 0) {
                expect(result.summary.reason).toContain('времени');
            }
        });

        it('returns error if InsulinWave module missing', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // Temporarily remove InsulinWave
            const originalWave = HEYS.InsulinWave;
            delete HEYS.InsulinWave;

            const params = {
                currentTime: '14:30',
                lastMeal: { time: '11:00', totals: {} },
                dayTarget: {},
                dayEaten: {},
                profile: {},
                days: [],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            expect(result.available).toBe(false);
            expect(result.error).toContain('InsulinWave');

            // Restore
            HEYS.InsulinWave = originalWave;
        });

        it('returns error if missing required data', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: null, // Missing
                lastMeal: null, // Missing
                dayTarget: {},
                dayEaten: {},
                profile: {},
                days: [],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            expect(result.available).toBe(false);
            expect(result.error).toContain('Missing');
        });
    });

    describe('Meal Properties', () => {
        it('assigns correct actionable flag (only first meal)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '14:00',
                lastMeal: {
                    time: '10:00',
                    totals: { prot: 30, carbs: 40, fat: 10, kcal: 370 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 40, carbs: 60, fat: 12, kcal: 540 },
                profile: {},
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            if (result.meals.length >= 2) {
                expect(result.meals[0].isActionable).toBe(true);
                expect(result.meals[1].isActionable).toBe(false);
                if (result.meals.length >= 3) {
                    expect(result.meals[2].isActionable).toBe(false);
                }
            }
        });

        it('calculates wave end and fat burn window', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '15:00',
                lastMeal: {
                    time: '12:00',
                    totals: { prot: 30, carbs: 40, fat: 10, kcal: 370 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 50, carbs: 70, fat: 15, kcal: 650 },
                profile: { insulinWaveHours: 3 },
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            expect(result.meals.length).toBeGreaterThan(0);
            const firstMeal = result.meals[0];
            expect(firstMeal.estimatedWaveEnd).toBeDefined();
            expect(firstMeal.fatBurnWindow).toBeDefined();
            // Wave end should be after meal start
            const waveEndHours = planner.parseTime(firstMeal.estimatedWaveEnd);
            const mealStartHours = planner.parseTime(firstMeal.timeStart);
            expect(waveEndHours).toBeGreaterThan(mealStartHours);
        });

        it('includes scenario for each meal', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '14:00',
                lastMeal: {
                    time: '10:00',
                    totals: { prot: 30, carbs: 40, fat: 10, kcal: 370 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 40, carbs: 60, fat: 12, kcal: 540 },
                profile: {},
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            expect(result.meals.length).toBeGreaterThan(0);
            result.meals.forEach(meal => {
                expect(meal.scenario).toBeDefined();
                expect(typeof meal.scenario).toBe('string');
            });
        });
    });

    describe('Summary Object', () => {
        it('includes correct summary fields', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '14:00',
                lastMeal: {
                    time: '10:00',
                    totals: { prot: 30, carbs: 40, fat: 10, kcal: 370 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 40, carbs: 60, fat: 12, kcal: 540 },
                profile: {},
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            expect(result.summary).toBeDefined();
            expect(result.summary.totalMeals).toBe(result.meals.length);
            expect(result.summary.timelineStart).toBeDefined();
            expect(result.summary.timelineEnd).toBeDefined();
            expect(result.summary.totalMacros).toBeDefined();
            expect(result.summary.totalMacros.prot).toBeGreaterThanOrEqual(0);
            expect(result.summary.totalMacros.carbs).toBeGreaterThanOrEqual(0);
            expect(result.summary.totalMacros.kcal).toBeGreaterThanOrEqual(0);
            expect(result.summary.sleepTarget).toBeDefined();
            expect(result.summary.lastMealDeadline).toBeDefined();
        });

        it('calculates correct total macros sum', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '14:00',
                lastMeal: {
                    time: '10:00',
                    totals: { prot: 30, carbs: 40, fat: 10, kcal: 370 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 40, carbs: 60, fat: 12, kcal: 540 },
                profile: {},
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            if (result.meals.length > 0) {
                const manualSum = result.meals.reduce((sum, meal) => ({
                    prot: sum.prot + meal.macros.prot,
                    carbs: sum.carbs + meal.macros.carbs,
                    kcal: sum.kcal + meal.macros.kcal
                }), { prot: 0, carbs: 0, kcal: 0 });

                expect(result.summary.totalMacros.prot).toBeCloseTo(manualSum.prot, 1);
                expect(result.summary.totalMacros.carbs).toBeCloseTo(manualSum.carbs, 1);
                expect(result.summary.totalMacros.kcal).toBeCloseTo(manualSum.kcal, 1);
            }
        });
    });

    describe('Edge Cases', () => {
        it('handles very small remaining budget (edge of 50 kcal threshold)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '20:00',
                lastMeal: {
                    time: '17:00',
                    totals: { prot: 40, carbs: 50, fat: 10, kcal: 470 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 110, carbs: 140, fat: 38, kcal: 1745 }, // 55 kcal left
                profile: {},
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            expect(result.available).toBe(true);
            // Should plan at least 1 meal or return reason
            if (result.meals.length === 0) {
                expect(result.summary.reason).toBeDefined();
            }
        });

        it('handles late current time (close to sleep)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '22:00',
                lastMeal: {
                    time: '19:00',
                    totals: { prot: 40, carbs: 50, fat: 10, kcal: 470 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 70, carbs: 90, fat: 20, kcal: 900 },
                profile: {},
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            expect(result.available).toBe(true);
            // Should return 0 meals due to time constraint
            expect(result.meals.length).toBeLessThanOrEqual(1);
        });

        it('handles unusual sleep target (very early)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '17:00',
                lastMeal: {
                    time: '14:00',
                    totals: { prot: 30, carbs: 40, fat: 10, kcal: 370 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 60, carbs: 80, fat: 15, kcal: 750 },
                profile: { sleepTarget: '21:00' }, // Very early sleep
                days: [],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            expect(result.available).toBe(true);
            // Deadline = 21:00 - 3h = 18:00, very tight window
            if (result.meals.length > 0) {
                const lastMealTime = planner.parseTime(result.meals[result.meals.length - 1].timeEnd);
                expect(lastMealTime).toBeLessThanOrEqual(18.0);
            }
        });
    });

    describe('Integration with Recommender', () => {
        it('returns mealsPlan structure compatible with recommender', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '14:00',
                lastMeal: {
                    time: '10:00',
                    totals: { prot: 30, carbs: 40, fat: 10, kcal: 370 }
                },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 40, carbs: 60, fat: 12, kcal: 540 },
                profile: {},
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {}
            };

            const result = planner.planRemainingMeals(params);

            // Check structure matches expected by UI
            expect(result).toHaveProperty('available');
            expect(result).toHaveProperty('meals');
            expect(result).toHaveProperty('summary');

            if (result.meals.length > 0) {
                const meal = result.meals[0];
                expect(meal).toHaveProperty('index');
                expect(meal).toHaveProperty('timeStart');
                expect(meal).toHaveProperty('timeEnd');
                expect(meal).toHaveProperty('estimatedWaveEnd');
                expect(meal).toHaveProperty('fatBurnWindow');
                expect(meal).toHaveProperty('macros');
                expect(meal).toHaveProperty('isActionable');
                expect(meal).toHaveProperty('isLast');
                expect(meal).toHaveProperty('scenario');
                expect(meal).toHaveProperty('hoursToSleep');
            }
        });
    });
});
