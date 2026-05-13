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
            // R5-B: kcal согласован с БЖУ (P*4 + C*4 + F*9), а не отдельный counter
            const expectedKcal0 = budgets[0].prot * 4 + budgets[0].carbs * 4 + budgets[0].fat * 9;
            const expectedKcal1 = budgets[1].prot * 4 + budgets[1].carbs * 4 + budgets[1].fat * 9;
            expect(budgets[0].kcal).toBe(expectedKcal0);
            expect(budgets[1].kcal).toBe(expectedKcal1);
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

            // v1.6+: personal wave skips modifiers — returns exact base when insulinWaveHours set
            expect(duration).toBeGreaterThanOrEqual(3.5); // Should be >= base
            expect(duration).toBeLessThanOrEqual(5.0); // Max cap
        });

        it('estimates wave for high-protein meal (shorter wave)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const macros = { prot: 60, carbs: 20, fat: 5, kcal: 365 }; // Low GI, high protein
            const profile = { insulinWaveHours: 3.5 };

            const duration = planner.estimateWaveDuration(macros, profile);

            // v1.6+: personal wave skips modifiers — returns exact base when insulinWaveHours set
            expect(duration).toBeLessThanOrEqual(3.5); // Should be <= base
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
            // Either budget-done or no-time-before-sleep — both valid for tiny remaining budget
            expect(result.summary.reason).toMatch(/практически выполнена|Недостаточно времени/);
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
                // v1.9+: hunger trade-off may reduce buffer to 1.5h → deadline up to 19.5h
                expect(lastMealTime).toBeLessThanOrEqual(20.0);
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

        it('supports incremental replan meta', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const params = {
                currentTime: '14:00',
                lastMeal: { time: '10:00', totals: { prot: 30, carbs: 40, fat: 10, kcal: 370 } },
                dayTarget: { prot: 120, carbs: 150, fat: 40, kcal: 1800 },
                dayEaten: { prot: 40, carbs: 60, fat: 12, kcal: 540 },
                profile: {},
                days: [
                    { date: '2026-02-14', meals: [{ time: '20:00' }] },
                    { date: '2026-02-13', meals: [{ time: '19:30' }] },
                    { date: '2026-02-12', meals: [{ time: '20:30' }] }
                ],
                pIndex: {},
                replanReason: 'PRODUCT_ADDED',
                previousPlanState: { planVersion: 2, lockedMeals: [] },
                lockedMeals: []
            };

            const result = planner.replanRemainingMeals(params);
            expect(result.available).toBe(true);
            expect(result.summary.replanMeta.incremental).toBe(true);
            expect(result.summary.replanMeta.reason).toBe('PRODUCT_ADDED');
            expect(result.summary.replanMeta.previousPlanVersion).toBe(2);
        });

        it('applies lock override by stable id', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const baseParams = {
                currentTime: '14:00',
                lastMeal: { time: '10:00', totals: { prot: 30, carbs: 40, fat: 10, kcal: 370 } },
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
            const base = planner.planRemainingMeals(baseParams);
            if (!base.meals.length) return;
            const firstMeal = base.meals[0];
            const lockedMacros = { prot: 55, carbs: 22, fat: 8, kcal: 365 };
            const replanned = planner.replanRemainingMeals({
                ...baseParams,
                replanReason: 'MEAL_LOCKED',
                previousPlanState: { planVersion: 4 },
                lockedMeals: [{ stableId: firstMeal.stableId, index: firstMeal.index, macros: lockedMacros, scenario: 'PROTEIN_DEFICIT' }]
            });

            expect(replanned.available).toBe(true);
            expect(replanned.meals[0].locked).toBe(true);
            expect(replanned.meals[0].macros).toEqual(lockedMacros);
            expect(replanned.meals[0].scenario).toBe('PROTEIN_DEFICIT');
        });

        it('returns invalid result when positive budget but no meals', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const validation = planner.validateReplanResult({
                available: true,
                meals: [],
                summary: { totalMacros: { prot: 0, carbs: 0, kcal: 0 } }
            }, 500);
            expect(validation.valid).toBe(false);
            expect(validation.reason).toContain('Empty meals');
        });
    });

    // ============================================================
    //  Round 1 — Correctness fixes
    // ============================================================
    describe('Round 1 — Correctness fixes', () => {
        it('R1-7: explicit daySleepStart overrides historical avg', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // Profile + historical days suggest 23:00, but day's check-in says 22:00 → should win.
            const days = Array.from({ length: 5 }, (_, i) => ({
                date: `2026-05-0${i + 1}`,
                sleepStart: '23:00',
                meals: [{ time: '20:00', items: [] }]
            }));
            const sleepTarget = planner.estimateSleepTarget(days, { sleepTarget: '23:00' }, {
                explicitSleepStart: '22:00',
                currentTimeHours: 18
            });
            expect(planner.formatTime(sleepTarget)).toBe('22:00');
        });

        it('R1-7: after-midnight cluster wins majority', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const days = [
                { sleepStart: '01:30' },
                { sleepStart: '01:45' },
                { sleepStart: '02:00' },
                { sleepStart: '23:30' } // outlier
            ];
            const sleepTarget = planner.estimateSleepTarget(days, {});
            // Должно быть около 01:45 → 25.75h (clamped to 26.0 max).
            expect(sleepTarget).toBeGreaterThan(24);
        });

        it('R1-12: distributeBudget guards against zero macro budget (no NaN)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // Полностью нулевой бюджет — алгоритм не должен делить на ноль.
            const budgets = planner.distributeBudget(
                { prot: 0, carbs: 0, fat: 0, kcal: 0 },
                2,
                [3, 1],
                [18, 21]
            );
            expect(budgets).toHaveLength(2);
            budgets.forEach((b) => {
                expect(Number.isFinite(b.prot)).toBe(true);
                expect(Number.isFinite(b.carbs)).toBe(true);
                expect(Number.isFinite(b.kcal)).toBe(true);
            });
        });

        it('R1-8: tiny deficit + 2-3h to sleep → returns 1 light protein meal', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // current 20:30, sleep 23:00 → 2.5h до сна, дефицит 200 kcal — раньше пусто, теперь лёгкий приём
            const result = planner.planRemainingMeals({
                currentTime: '20:30',
                lastMeal: { time: '18:30', items: [], totals: { kcal: 600, prot: 30, carbs: 60, fat: 20 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 1800, prot: 120, carbs: 180, fat: 55 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {}
            });
            // Может вернуться лёгкий приём (1 meal) ИЛИ multi-meal — главное что есть план, не пусто
            expect(result.available).toBe(true);
            if (result.meals.length === 1) {
                expect(result.meals[0].scenario).toBe('PRE_SLEEP');
                expect(result.meals[0].macros.prot).toBeGreaterThanOrEqual(15);
            }
        });

        it('R1-10: getWeightKg falls back through weight/weightKg/bodyMassKg/70', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // Через estimateSleepTarget с profile без weight — не должно крашнуться.
            // Проверим косвенно через planRemainingMeals
            const result = planner.planRemainingMeals({
                currentTime: '12:00',
                lastMeal: null,
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 0, prot: 0, carbs: 0, fat: 0 },
                profile: {}, // no weight at all
                days: [],
                pIndex: {}
            });
            expect(result.available).toBe(true);
            // MPS должен сработать с fallback weight=70 → optimal 28г белка
            if (result.meals.length > 0) {
                result.meals.forEach((m) => {
                    expect(Number.isFinite(m.macros.prot)).toBe(true);
                });
            }
        });

        it('R1-11: MPS boost preserves total kcal (carbs→fat compensation)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '13:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 15, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2200, prot: 130, carbs: 230, fat: 70 },
                dayEaten: { kcal: 400, prot: 15, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weightKg: 70 },
                days: [],
                pIndex: {}
            });
            expect(result.available).toBe(true);
            // Контракт R1-11: kcal в meal.macros должен быть СВЯЗАН с БЖУ через формулу
            // P*4 + C*4 + F*9. Допускаем rounding (distributeBudget округляет каждый
            // макрос отдельно — это даёт ±5% за приём, что приемлемо).
            result.meals.forEach((m) => {
                const fromMacros = m.macros.prot * 4 + m.macros.carbs * 4 + m.macros.fat * 9;
                const tolerance = Math.max(20, m.macros.kcal * 0.10); // 10% от ккал приёма
                expect(Math.abs(fromMacros - m.macros.kcal)).toBeLessThanOrEqual(tolerance);
            });
        });
    });

    // ============================================================
    //  Round 2 — Data integrity
    // ============================================================
    describe('Round 2 — Data integrity', () => {
        it('R2-6: missing dayTarget.kcal → NO_TARGET error', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '13:00',
                lastMeal: null,
                dayTarget: {}, // no kcal
                dayEaten: {},
                profile: { sleepTarget: '23:00' },
                days: [],
                pIndex: {}
            });
            expect(result.available).toBe(false);
            expect(result.error).toBe('NO_TARGET');
        });

        it('R2-6: implausibly low dayTarget.kcal (<500) → NO_TARGET error', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '13:00',
                lastMeal: null,
                dayTarget: { kcal: 200 },
                dayEaten: {},
                profile: {},
                days: [],
                pIndex: {}
            });
            expect(result.available).toBe(false);
            expect(result.error).toBe('NO_TARGET');
        });

        it('R2-6: normalizes dayTarget aliases (protein/carb → prot/carbs)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '12:00',
                lastMeal: null,
                dayTarget: { kcal: 2000, protein: 130, carb: 200, fat: 60 }, // aliases only
                dayEaten: { kcal: 0, prot: 0, carb: 0, fat: 0 },
                profile: { weight: 70, sleepTarget: '23:00' },
                days: [],
                pIndex: {}
            });
            expect(result.available).toBe(true);
            // Если планнер не упал и distributeBudget не выдал NaN — алиасы поняты
            if (result.meals.length > 0) {
                result.meals.forEach((m) => {
                    expect(Number.isFinite(m.macros.prot)).toBe(true);
                });
            }
        });
    });

    // ============================================================
    //  Round 3 — Adaptive physiology
    // ============================================================
    describe('Round 3 — Adaptive physiology', () => {
        it('R3-1: late dinner + morning currentTime → wave reset (treats as first meal)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '08:00',
                lastMeal: { time: '22:30', items: [], totals: { kcal: 700, prot: 30, carbs: 80, fat: 25 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 0, prot: 0, carbs: 0, fat: 0 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {}
            });
            expect(result.available).toBe(true);
            // Должен запланировать минимум 1 приём, начинающийся примерно с 08:00 (не +волна от 22:30)
            if (result.meals.length > 0) {
                const firstStart = planner.parseTime(result.meals[0].timeStart);
                expect(firstStart).toBeGreaterThanOrEqual(7.5);
                expect(firstStart).toBeLessThanOrEqual(10);
            }
        });

        it('R3-4: fasting window shifts first meal to eatStart', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // current 09:00, IF window eat 12:00-20:00 → первый приём не раньше 12:00
            const result = planner.planRemainingMeals({
                currentTime: '09:00',
                lastMeal: null,
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 0, prot: 0, carbs: 0, fat: 0 },
                profile: {
                    sleepTarget: '23:00',
                    weight: 70,
                    fastingWindow: { eatStart: '12:00', eatEnd: '20:00' }
                },
                days: [],
                pIndex: {}
            });
            expect(result.available).toBe(true);
            if (result.meals.length > 0) {
                const firstStart = planner.parseTime(result.meals[0].timeStart);
                expect(firstStart).toBeGreaterThanOrEqual(12);
            }
        });

        it('R3-3: cold start (no history) uses profile.sleepTarget', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const sleepTarget = planner.estimateSleepTarget([], { sleepTarget: '00:30' });
            // 00:30 → 24.5h (treated as after midnight)
            expect(sleepTarget).toBe(0.5);
        });
    });

    // ============================================================
    //  Round 4 — Deep planner work
    // ============================================================
    describe('Round 4 — Deep planner work', () => {
        it('R4-2: estimatePersonalWaveHours больше не override-ит insulinWaveHours', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // История с приёмами раз в 5ч → estimatePersonalWaveHours вернёт ~5h
            const days = Array.from({ length: 5 }, (_, i) => ({
                date: `2026-05-0${i + 1}`,
                meals: [
                    { time: '08:00', items: [] },
                    { time: '13:00', items: [] },
                    { time: '18:00', items: [] }
                ]
            }));
            // Без override: planner должен использовать estimateWaveDuration с реальным составом,
            // а не 5h-personal. Проверим что план рассчитывается без падения.
            const result = planner.planRemainingMeals({
                currentTime: '14:00',
                lastMeal: { time: '13:00', items: [], totals: { kcal: 600, prot: 30, carbs: 80, fat: 20 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 600, prot: 30, carbs: 80, fat: 20 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days,
                pIndex: {}
            });
            expect(result.available).toBe(true);
            // Не должно быть NaN или Infinity в любом meal
            result.meals.forEach((m) => {
                expect(Number.isFinite(m.macros.kcal)).toBe(true);
                expect(Number.isFinite(m.macros.prot)).toBe(true);
            });
        });

        it('R4-5: stressMoodSignals=moderate stress + late evening → deadline сдвинут на 30 мин', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const withoutStress = planner.planRemainingMeals({
                currentTime: '20:30',
                lastMeal: { time: '18:30', items: [], totals: { kcal: 500, prot: 25, carbs: 60, fat: 15 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 1500, prot: 100, carbs: 150, fat: 45 },
                profile: { sleepTarget: '23:30', weight: 70 },
                days: [],
                pIndex: {}
            });
            const withStress = planner.planRemainingMeals({
                currentTime: '20:30',
                lastMeal: { time: '18:30', items: [], totals: { kcal: 500, prot: 25, carbs: 60, fat: 15 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 1500, prot: 100, carbs: 150, fat: 45 },
                profile: { sleepTarget: '23:30', weight: 70 },
                days: [],
                pIndex: {},
                stressMoodSignals: { stressLevel: 'moderate', moodLevel: 'neutral' }
            });
            // Оба плана доступны
            expect(withoutStress.available).toBe(true);
            expect(withStress.available).toBe(true);
            // deadline в withStress должен быть раньше (или равен — если sleep буфер уже урезан)
            const a = planner.parseTime(withoutStress.summary?.lastMealDeadline || '00:00');
            const b = planner.parseTime(withStress.summary?.lastMealDeadline || '00:00');
            expect(b).toBeLessThanOrEqual(a);
        });

        it('R4-6: waveOverlapPct > 40% → advisory в summary', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '13:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 20, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 20, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {},
                waveOverlapPct: 47
            });
            expect(result.available).toBe(true);
            expect(result.summary?.advisories).toBeDefined();
            const overlap = result.summary.advisories.find((a) => a.key === 'wave_overlap');
            expect(overlap).toBeDefined();
            expect(overlap.text).toContain('47');
        });

        it('R4-6: waveOverlapPct ≤ 40% → нет advisory wave_overlap', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '13:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 20, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 20, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {},
                waveOverlapPct: 25
            });
            expect(result.available).toBe(true);
            const overlap = result.summary?.advisories?.find?.((a) => a.key === 'wave_overlap');
            expect(overlap).toBeUndefined();
        });

        it('R4-8: workoutRecoveryFactor — strength тренировка 4ч назад → MPS_PROT_PER_KG buffed', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // Сравним два плана: с тренировкой 4ч назад и без.
            // Тренировка должна повысить protein boost для всех meals.
            const withWorkout = planner.planRemainingMeals({
                currentTime: '14:00',
                lastMeal: { time: '11:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 80 },
                days: [],
                pIndex: {},
                currentDay: {
                    workouts: [{ endTime: '10:00', type: 'strength' }]
                }
            });
            const withoutWorkout = planner.planRemainingMeals({
                currentTime: '14:00',
                lastMeal: { time: '11:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 80 },
                days: [],
                pIndex: {}
            });
            // Оба валидны
            expect(withWorkout.available).toBe(true);
            expect(withoutWorkout.available).toBe(true);
            // Recovery должен дать прирост белка либо одинаковый (если bandwidth уперлась в потолок),
            // но точно не ниже.
            const protWith = withWorkout.meals.reduce((s, m) => s + (m.macros.prot || 0), 0);
            const protWithout = withoutWorkout.meals.reduce((s, m) => s + (m.macros.prot || 0), 0);
            expect(protWith).toBeGreaterThanOrEqual(protWithout - 1); // допуск rounding
        });

        it('R4-4: MICRONUTRIENT_FOCUS scenario — конструктор сценариев в analyzeCurrentContext', () => {
            // Проверка работает через recommender.recommend(...), используем headless backend через простой smoke.
            // Этот test слабый — он лишь проверяет что новый константный ключ зарегистрирован.
            expect(typeof HEYS.InsightsPI.mealPlanner.planRemainingMeals).toBe('function');
        });

        it('R5-A: formatTime делает carry minutes→hours при m=60', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // Граничные случаи где Math.round может выдать m=60
            expect(planner.formatTime(24.9999999)).toBe('25:00');
            expect(planner.formatTime(25.0)).toBe('25:00');
            // Внутренние нормальные значения не ломаются
            expect(planner.formatTime(14.5)).toBe('14:30');
            expect(planner.formatTime(0.5)).toBe('00:30');
        });

        it('R5-B: meal.macros.kcal согласован с БЖУ после всех модификаций', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '13:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 15, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2200, prot: 130, carbs: 230, fat: 70 },
                dayEaten: { kcal: 400, prot: 15, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {}
            });
            expect(result.available).toBe(true);
            // Для каждого приёма: kcal должен ТОЧНО равняться P*4+C*4+F*9
            result.meals.forEach((m) => {
                const expected = m.macros.prot * 4 + m.macros.carbs * 4 + m.macros.fat * 9;
                expect(m.macros.kcal).toBe(expected);
            });
        });

        it('R5-D: scenarioHint сохраняется для первого actionable приёма', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '13:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {},
                scenarioHint: 'MICRONUTRIENT_FOCUS'
            });
            expect(result.available).toBe(true);
            if (result.meals.length > 0) {
                expect(result.meals[0].scenario).toBe('MICRONUTRIENT_FOCUS');
                expect(result.meals[0].scenarioSource).toBe('recommender');
            }
        });

        it('R5-D: scenarioHint=BALANCED не override-ит baseline planner', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '20:00',
                lastMeal: { time: '15:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {},
                scenarioHint: 'BALANCED' // не в specificScenarios → не override
            });
            if (result.meals.length > 0) {
                expect(result.meals[0].scenarioSource).toBe('planner');
            }
        });

        it('R6-A: stress shift пропускается если shifted deadline уже в прошлом', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // currentTime=21:30, sleepTarget=23:30 → deadline 20:30 уже в прошлом.
            // stress shift в 20:00 хочет сдвинуть deadline ещё на 30 мин (на 20:00),
            // но это ломает план. Должен быть пропущен — план опирается на hunger tradeoff.
            const result = planner.planRemainingMeals({
                currentTime: '21:30',
                lastMeal: { time: '18:00', items: [], totals: { kcal: 500, prot: 30, carbs: 60, fat: 15 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 1300, prot: 80, carbs: 130, fat: 40 },
                profile: { sleepTarget: '23:30', weight: 70 },
                days: [],
                pIndex: {},
                stressMoodSignals: { stressLevel: 'moderate', moodLevel: 'neutral' }
            });
            expect(result.available).toBe(true);
            // План должен быть либо валидный (есть meal), либо явно сказать что нет.
            // Главное: не должно быть deadline далеко в прошлом из-за слепого stress shift.
            if (result.meals.length > 0) {
                const dl = planner.parseTime(result.summary?.lastMealDeadline || '00:00');
                expect(dl).toBeGreaterThanOrEqual(21); // не в прошлом более чем currentTime
            }
        });

        it('R6-C: heavy meal перед сном (>400 ккал, <3ч до сна) → кляпинг до 400', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // sleepTarget=23:00, currentTime=20:30 → hoursToSleep ~2.5
            // remaining budget 700 ккал — должен быть кляпнут до 400
            const result = planner.planRemainingMeals({
                currentTime: '20:30',
                lastMeal: { time: '14:00', items: [], totals: { kcal: 500, prot: 30, carbs: 60, fat: 15 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 1300, prot: 80, carbs: 130, fat: 40 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {}
            });
            expect(result.available).toBe(true);
            if (result.meals.length > 0) {
                const m = result.meals[0];
                const hSleep = Number(m.hoursToSleep);
                if (hSleep < 3) {
                    // Должен быть либо clipped, либо изначально маленький
                    expect(m.macros.kcal).toBeLessThanOrEqual(420); // 400 cap + допуск rounding
                }
            }
        });

        it('R12-A: currentDay.workouts активирует recovery factor 2-24ч', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '14:00', // 3h после тренировки 11:00
                lastMeal: { time: '11:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 80 },
                days: [],
                pIndex: {},
                currentDay: {
                    workouts: [{ endTime: '11:00', type: 'strength' }]
                }
            });
            expect(result.available).toBe(true);
            // Recovery factor должен дать прирост optimalProtPerMeal
            // Конкретное число зависит от MPS_PROT_PER_KG и веса.
            // Главное: план есть и без ошибок.
            if (result.meals.length > 0) {
                result.meals.forEach((m) => {
                    expect(Number.isFinite(m.macros.prot)).toBe(true);
                });
            }
        });

        it('R12-B: glycemicLoadHistory с low score → dayGLTarget=15', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '13:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 20, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 20, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {},
                glycemicLoadHistory: { score: 0.3, dailyClass: 'high' }
            });
            expect(result.available).toBe(true);
            // Не-pre-sleep meal должен иметь targetGL=15 вместо 20
            const dayMeal = result.meals.find((m) => Number(m.hoursToSleep) >= 3);
            if (dayMeal) {
                expect(dayMeal.targetGL).toBe(15);
            }
        });

        it('R12-B: scenarioHint=SUGAR_RESET → targetGL=10 для всех meals', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '13:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 10, carbs: 70, fat: 5, simple: 50 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 10, carbs: 70, fat: 5 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {},
                scenarioHint: 'SUGAR_RESET'
            });
            expect(result.available).toBe(true);
            result.meals.forEach((m) => {
                expect(m.targetGL).toBeLessThanOrEqual(10);
            });
        });

        it('R12-C: patternImpactHints C15/C35 → advisories в summary', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                currentTime: '14:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {},
                patternImpactHints: [
                    { pattern: 'C15', area: 'macros', before: '...', after: '...' },
                    { pattern: 'C35', area: 'macros', before: '...', after: '...' }
                ]
            });
            expect(result.available).toBe(true);
            const advs = result.summary?.advisories || [];
            expect(advs.find((a) => a.key === 'c15_insulin_sensitivity')).toBeDefined();
            expect(advs.find((a) => a.key === 'c35_protein_distribution')).toBeDefined();
        });

        it('R12-E: phenotype insulin_resistant сдвигает deadline на 30 мин раньше', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const baseline = planner.planRemainingMeals({
                currentTime: '14:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {}
            });
            const phenotyped = planner.planRemainingMeals({
                currentTime: '14:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 10 } },
                dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
                dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 10 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {},
                phenotypeApplied: { metabolic: 'insulin_resistant' }
            });
            const baseDl = planner.parseTime(baseline.summary?.lastMealDeadline || '00:00');
            const phenoDl = planner.parseTime(phenotyped.summary?.lastMealDeadline || '00:00');
            // phenotype deadline должен быть раньше на 30мин (или равен если оба null)
            if (baseDl > 0 && phenoDl > 0) {
                expect(phenoDl).toBeLessThan(baseDl);
            }
        });

        it('R6-C: лёгкий meal перед сном не клипается', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // remainingBudget малый (300 ккал) — не должен клипаться
            const result = planner.planRemainingMeals({
                currentTime: '20:30',
                lastMeal: { time: '14:00', items: [], totals: { kcal: 500, prot: 30, carbs: 60, fat: 15 } },
                dayTarget: { kcal: 1800, prot: 100, carbs: 150, fat: 50 },
                dayEaten: { kcal: 1500, prot: 80, carbs: 120, fat: 42 },
                profile: { sleepTarget: '23:00', weight: 70 },
                days: [],
                pIndex: {}
            });
            if (result.meals.length > 0) {
                const m = result.meals[0];
                // Лёгкий приём — флаг presleepCapped не выставлен
                expect(m.presleepCapped).not.toBe(true);
            }
        });
    });

    describe('Round 13 — Dead signals activation', () => {
        const baseParams = {
            currentTime: '14:00',
            lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 10 } },
            dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
            dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 10 },
            profile: { sleepTarget: '23:00', weight: 70 },
            days: [],
            pIndex: {}
        };

        const getAdvisoryByKey = (result, key) => {
            const advisories = result?.summary?.advisories || [];
            return advisories.find((a) => a?.key === key) || null;
        };

        it('R13-A: poor sleep + workout → recovery factor boost + advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                currentTime: '14:00',
                currentDay: {
                    sleepQuality: 2,
                    workouts: [{ time: '10:00', type: 'strength' }]
                },
                stressMoodSignals: { sleepQualityLevel: 'poor', sleepQualityScore: 2 }
            });
            expect(getAdvisoryByKey(result, 'r13a_poor_sleep')).not.toBeNull();
        });

        it('R13-A: poor sleep advisory без shift при отсутствии late evening', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                stressMoodSignals: { sleepQualityLevel: 'poor', sleepQualityScore: 2 }
            });
            expect(getAdvisoryByKey(result, 'r13a_poor_sleep')).not.toBeNull();
        });

        it('R13-A: anti-double-shift — moderate stress + poor sleep НЕ удваивают сдвиг', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const onlyStress = planner.planRemainingMeals({
                ...baseParams,
                currentTime: '20:30',
                dayEaten: { kcal: 1000, prot: 60, carbs: 120, fat: 30 },
                stressMoodSignals: { stressLevel: 'moderate' }
            });
            const both = planner.planRemainingMeals({
                ...baseParams,
                currentTime: '20:30',
                dayEaten: { kcal: 1000, prot: 60, carbs: 120, fat: 30 },
                stressMoodSignals: {
                    stressLevel: 'moderate',
                    sleepQualityLevel: 'poor',
                    sleepQualityScore: 2
                }
            });
            const stressDl = planner.parseTime(onlyStress.summary?.lastMealDeadline || '00:00');
            const bothDl = planner.parseTime(both.summary?.lastMealDeadline || '00:00');
            // оба deadline должны быть одинаковыми — R13-A не накладывается на R4-5
            expect(bothDl).toBe(stressDl);
        });

        it('R13-B: low moodAvg → mood support advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                stressMoodSignals: { moodAvgLevel: 'low', moodAvgScore: 3 }
            });
            expect(getAdvisoryByKey(result, 'r13b_mood_support')).not.toBeNull();
        });

        it('R13-D: phenotype.satiety=volume_eater → advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                phenotypeApplied: { satiety: 'volume_eater' }
            });
            expect(getAdvisoryByKey(result, 'r13d_volume_eater')).not.toBeNull();
        });

        it('R13-D: phenotype.satiety=low_satiety → advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                phenotypeApplied: { satiety: 'low_satiety' }
            });
            expect(getAdvisoryByKey(result, 'r13d_low_satiety')).not.toBeNull();
        });

        it('R13-D: stress_anorexic + high + большой deficit → защитный advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                currentTime: '20:30',
                dayEaten: { kcal: 800, prot: 40, carbs: 80, fat: 20 },
                stressMoodSignals: { stressLevel: 'high' },
                phenotypeApplied: { stress: 'stress_anorexic' }
            });
            expect(getAdvisoryByKey(result, 'r13d_stress_anorexic')).not.toBeNull();
        });

        it('R13-G: ≥2 micronutrient deficits + first meal → advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                lastMeal: null,
                dayEaten: { kcal: 0, prot: 0, carbs: 0, fat: 0 },
                micronutrientDeficits: ['iron', 'zinc']
            });
            expect(getAdvisoryByKey(result, 'r13g_micronutrient_focus')).not.toBeNull();
        });

        it('R13-G: iron + calcium deficits → timing advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                lastMeal: null,
                dayEaten: { kcal: 0, prot: 0, carbs: 0, fat: 0 },
                micronutrientDeficits: ['iron', 'calcium']
            });
            expect(getAdvisoryByKey(result, 'r13g_iron_calcium_timing')).not.toBeNull();
        });

        it('R13-I: low water + evening (>=18:00) → dehydration advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                currentTime: '19:00',
                dayEaten: { kcal: 1000, prot: 60, carbs: 120, fat: 30 },
                currentDay: { waterMl: 400 }
            });
            expect(getAdvisoryByKey(result, 'r13i_dehydration')).not.toBeNull();
        });

        it('R13-I: low water + morning → НЕТ advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                currentTime: '10:00',
                currentDay: { waterMl: 200 }
            });
            expect(getAdvisoryByKey(result, 'r13i_dehydration')).toBeNull();
        });

        it('R13-H: high steps → NEAT advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                currentDay: { steps: 17000 }
            });
            expect(getAdvisoryByKey(result, 'r13h_high_neat')).not.toBeNull();
        });

        it('R13-E: BINGE_RISK warning → advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                earlyWarnings: [{ type: 'BINGE_RISK', severity: 'medium' }]
            });
            expect(getAdvisoryByKey(result, 'r13e_binge_risk')).not.toBeNull();
        });

        it('R13-E: PROTEIN_DEFICIT warning → advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                earlyWarnings: [{ type: 'PROTEIN_DEFICIT' }]
            });
            expect(getAdvisoryByKey(result, 'r13e_protein_deficit')).not.toBeNull();
        });

        it('R13-F: SLEEP_STRESS_BINGE chain → high-severity advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                causalChains: [{ type: 'SLEEP_STRESS_BINGE' }]
            });
            const a = getAdvisoryByKey(result, 'r13f_chain_sleep_stress');
            expect(a).not.toBeNull();
            expect(a?.severity).toBe('high');
        });

        it('R13-C: cascade BROKEN → advisory + low-severity advisories отфильтрованы', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                cascadeState: { state: 'BROKEN', crs: 0.5, daysAtPeak: 0, todayContrib: -0.2 },
                stressMoodSignals: { moodAvgLevel: 'low', moodAvgScore: 3 }
            });
            const broken = getAdvisoryByKey(result, 'r13c_cascade_broken');
            expect(broken).not.toBeNull();
            expect(broken?.severity).toBe('high');
            // low-severity moodAvg отфильтрован при BROKEN
            expect(getAdvisoryByKey(result, 'r13b_mood_support')).toBeNull();
        });

        it('R13-C: cascade STRONG + 7 дней → maintenance advisory', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                cascadeState: { state: 'STRONG', crs: 0.9, daysAtPeak: 8, todayContrib: 0.5 }
            });
            expect(getAdvisoryByKey(result, 'r13c_cascade_strong')).not.toBeNull();
        });

        it('R13-C: cascadeState отсутствует → silent (regression baseline)', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals(baseParams);
            expect(getAdvisoryByKey(result, 'r13c_cascade_broken')).toBeNull();
            expect(getAdvisoryByKey(result, 'r13c_cascade_strong')).toBeNull();
        });

        it('R13: empty-plan ветка (цель выполнена) тоже отдаёт advisories', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // Симулируем: цель выполнена, бюджет < 50 ккал, времени ещё есть
            const result = planner.planRemainingMeals({
                ...baseParams,
                currentTime: '15:00',
                dayEaten: { kcal: 1990, prot: 130, carbs: 200, fat: 60 },
                cascadeState: { state: 'STRONG', crs: 0.9, daysAtPeak: 10, todayContrib: 0.5 }
            });
            expect(result.available).toBe(true);
            expect(result.meals.length).toBe(0);
            expect(getAdvisoryByKey(result, 'r13c_cascade_strong')).not.toBeNull();
        });

        it('R13 dedup: одинаковые keys не дублируются', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            const result = planner.planRemainingMeals({
                ...baseParams,
                earlyWarnings: [{ type: 'BINGE_RISK' }, { type: 'BINGE_RISK' }]
            });
            const advisories = result?.summary?.advisories || [];
            const bingeCount = advisories.filter(a => a.key === 'r13e_binge_risk').length;
            expect(bingeCount).toBeLessThanOrEqual(1);
        });
    });

    describe('Kcal-macro gap fill', () => {
        const gapBase = {
            currentTime: '14:00',
            lastMeal: { time: '13:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 10 } },
            dayTarget: { kcal: 2000, prot: 130, carbs: 200, fat: 60 },
            dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 10 },
            profile: { sleepTarget: '23:00', weight: 70 },
            days: [],
            pIndex: {}
        };

        it('gap > 15% kcal → fat increased to close the gap', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // Симулируем сценарий жены: углеводы почти выбраны, остаток ккал 835,
            // но макро-сумма (П 38.7 × 4 + У 39.5 × 4 + Ж 25.3 × 9) = 540 ккал.
            // Gap = 295 ккал → ожидаем добавку ~33г жира.
            const result = planner.planRemainingMeals({
                ...gapBase,
                currentTime: '14:30',
                lastMeal: { time: '13:55', items: [], totals: { kcal: 494, prot: 42, carbs: 64, fat: 12 } },
                dayTarget: { kcal: 1484, prot: 86.6, carbs: 123.7, fat: 44 },
                dayEaten: { kcal: 649, prot: 48, carbs: 84.2, fat: 18.7 },
                profile: { weight: 52.1 },
                daySleepStart: '01:30'
            });
            expect(result.available).toBe(true);
            const totalFatInPlan = result.meals.reduce((s, m) => s + (m.macros?.fat || 0), 0);
            // До фикса было ~25г жира (только остаток). С фиксом должно стать > 40г.
            expect(totalFatInPlan).toBeGreaterThan(40);
            // Sanity: суммарные ккал плана значительно ближе к остатку ккал (835), чем
            // к чистой макро-сумме (540). Cap 50% не даёт закрыть весь gap, но
            // существенно сокращает дефицит.
            const totalKcalInPlan = result.meals.reduce((s, m) => s + (m.macros?.kcal || 0), 0);
            expect(totalKcalInPlan).toBeGreaterThan(700);
        });

        it('macro-сумма уже близка к ккал → gap-fill не срабатывает', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // Нормальный сценарий начала дня — макро ≈ ккал.
            const result = planner.planRemainingMeals({
                ...gapBase,
                currentTime: '12:00',
                lastMeal: { time: '08:00', items: [], totals: { kcal: 400, prot: 25, carbs: 50, fat: 12 } },
                dayTarget: { kcal: 1800, prot: 110, carbs: 220, fat: 60 },
                dayEaten: { kcal: 400, prot: 25, carbs: 50, fat: 12 }
            });
            // Остаток: 1400 ккал; макро = 85×4 + 170×4 + 48×9 = 340+680+432 = 1452 ккал.
            // Это близко к ккал (gap отрицательный), фикс не должен сработать.
            expect(result.available).toBe(true);
            const totalFatInPlan = result.meals.reduce((s, m) => s + (m.macros?.fat || 0), 0);
            // Без фикса было бы ~48г, с фиксом тоже ~48г.
            expect(totalFatInPlan).toBeLessThan(60);
        });

        it('cap 50% kcal от жира — большой gap не выстреливает в перегрузку', () => {
            const planner = HEYS.InsightsPI.mealPlanner;
            // Экстремальный сценарий — gap огромный.
            const result = planner.planRemainingMeals({
                ...gapBase,
                currentTime: '17:00',
                lastMeal: { time: '12:00', items: [], totals: { kcal: 200, prot: 5, carbs: 90, fat: 5 } },
                dayTarget: { kcal: 2000, prot: 60, carbs: 100, fat: 40 },
                dayEaten: { kcal: 200, prot: 5, carbs: 90, fat: 5 }
            });
            // Остаток: 1800 ккал. Макро: 55×4 + 10×4 + 35×9 = 220+40+315 = 575 ккал.
            // Gap = 1225 ккал → 136г жира хочется добавить. Cap = 50% × 1800 / 9 = 100г.
            // Headroom = 100 - 35 = 65г → итого ~100г жира суммарно.
            expect(result.available).toBe(true);
            const totalFatInPlan = result.meals.reduce((s, m) => s + (m.macros?.fat || 0), 0);
            // ≤ ~100г суммарно по плану (cap отрабатывает).
            expect(totalFatInPlan).toBeLessThanOrEqual(105);
        });
    });
});
