/**
 * Tests for HEYS Predictive Insights — Meal Recommender v2.4
 * 
 * v2.4 additions:
 * - 8-scenario classification system
 * - Adaptive thresholds integration
 * - Scenario-specific macro strategies
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

describe('Meal Recommender v2.4', () => {
    let HEYS;

    beforeEach(() => {
        // Setup global HEYS object with thresholds mock
        global.HEYS = {
            InsightsPI: {
                thresholds: {
                    // Mock adaptive thresholds
                    getAdaptiveThresholds: (days, profile, pIndex) => ({
                        lateEatingHour: 21.0,
                        idealMealGapMin: 240,
                        source: 'FULL',
                        confidence: 0.85
                    })
                }
            }
        };

        // Load the module
        const recommenderPath = path.join(__dirname, '../insights/pi_meal_recommender.js');
        loadScriptAsModule(recommenderPath);
        HEYS = global.HEYS;
    });

    describe('Core Functionality (backward compatibility)', () => {
        it('recommends next meal with valid context', () => {
            const context = {
                currentTime: '14:30',
                lastMeal: { time: '09:15', protein: 22, carbs: 45 },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 890, protein: 42, carbs: 95 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.timing).toBeDefined();
            expect(result.macros).toBeDefined();
            expect(result.suggestions).toBeDefined();
            expect(result.reasoning).toBeDefined();
            expect(result.method).toBe('context_engine');
            expect(result.version).toBe('2.4');
        });

        it('returns error for missing context', () => {
            const result = HEYS.InsightsPI.mealRecommender.recommend(null, {}, {}, []);

            expect(result.available).toBe(false);
            expect(result.error).toContain('Missing context');
        });
    });

    describe('Scenario-Based Classification (v2.4)', () => {
        it('detects GOAL_REACHED scenario (<50 kcal remaining)', () => {
            const context = {
                currentTime: '20:00',
                lastMeal: { time: '18:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1770, protein: 118, carbs: 195 }, // 30 kcal remaining
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.scenario).toBe('GOAL_REACHED');
            expect(result.macros.kcal).toBe(0);
            expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
            expect(result.suggestions[0].product).toBe('Вода');
        });

        it('detects LIGHT_SNACK scenario (50-150 kcal remaining)', () => {
            const context = {
                currentTime: '17:00',
                lastMeal: { time: '14:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1700, protein: 110, carbs: 180 }, // 100 kcal remaining
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.scenario).toBe('LIGHT_SNACK');
            expect(result.macros.kcal).toBeLessThanOrEqual(150);
            expect(result.suggestions.some(s => s.product.includes('Кефир') || s.product.includes('Яблоко'))).toBe(true);
        });

        it('detects LATE_EVENING scenario (>21:00)', () => {
            const context = {
                currentTime: '22:00',
                lastMeal: { time: '19:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1500, protein: 100, carbs: 160 },
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, [{ date: '2024-01-01' }]); // days for thresholds

            expect(result.available).toBe(true);
            expect(result.scenario).toBe('LATE_EVENING');
            expect(result.macros.kcal).toBeLessThanOrEqual(200);
            // High protein ratio for late evening (casein)
            const proteinRatio = result.macros.protein / (result.macros.protein + result.macros.carbs);
            expect(proteinRatio).toBeGreaterThan(0.5); // >50% protein
        });

        it('detects PRE_WORKOUT scenario (training in 1-2h)', () => {
            const context = {
                currentTime: '16:00',
                lastMeal: { time: '12:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 800, protein: 50, carbs: 90 },
                training: { type: 'strength', time: '18:00' },
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.scenario).toBe('PRE_WORKOUT');
            expect(result.macros.kcal).toBeLessThanOrEqual(300);
            // High carbs ratio for pre-workout energy
            const carbsRatio = result.macros.carbs / (result.macros.protein + result.macros.carbs);
            expect(carbsRatio).toBeGreaterThan(0.5); // >50% carbs
            expect(result.suggestions.some(s => s.product.includes('Банан'))).toBe(true);
        });

        it('detects POST_WORKOUT scenario (training was <2h ago)', () => {
            const context = {
                currentTime: '19:30',
                lastMeal: { time: '15:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 900, protein: 55, carbs: 110 },
                training: { type: 'strength', time: '18:00' },
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.scenario).toBe('POST_WORKOUT');
            expect(result.macros.kcal).toBeLessThanOrEqual(400);
            // High protein for recovery
            expect(result.macros.protein).toBeGreaterThanOrEqual(25);
            expect(result.suggestions.some(s => s.product.includes('Курин') || s.reason.includes('восстановлен'))).toBe(true);
        });

        it('detects PROTEIN_DEFICIT scenario (<80% protein)', () => {
            const context = {
                currentTime: '16:00',
                lastMeal: { time: '12:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1000, protein: 45, carbs: 120 }, // 37.5% protein, <80%
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.scenario).toBe('PROTEIN_DEFICIT');
            expect(result.macros.kcal).toBeLessThanOrEqual(300);
            // Very high protein ratio
            const proteinRatio = result.macros.protein / (result.macros.protein + result.macros.carbs);
            expect(proteinRatio).toBeGreaterThan(0.45); // >45% protein
            expect(result.suggestions.some(s => s.product.includes('Курин') || s.product.includes('Творог'))).toBe(true);
        });

        it('detects STRESS_EATING scenario (high stress)', () => {
            const context = {
                currentTime: '20:00',
                lastMeal: { time: '17:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1200, protein: 70, carbs: 140 },
                stress: 5, // High stress
                mood: 2, // Low mood
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.scenario).toBe('STRESS_EATING');
            expect(result.macros.kcal).toBeLessThanOrEqual(250);
            expect(result.suggestions.some(s => s.product.includes('шоколад') || s.product.includes('орех'))).toBe(true);
        });

        it('detects BALANCED scenario (default)', () => {
            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 600, protein: 40, carbs: 70 },
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.scenario).toBe('BALANCED');
            // Macros distributed across remaining meals
            expect(result.macros.kcal).toBeGreaterThan(300);
            expect(result.macros.protein).toBeGreaterThan(20);
        });
    });

    describe('Adaptive Thresholds Integration (v2.4)', () => {
        it('uses adaptive lateEatingHour from thresholds', () => {
            // Mock thresholds with late eating at 20:00
            global.HEYS.InsightsPI.thresholds.getAdaptiveThresholds = () => ({
                lateEatingHour: 20.0,
                idealMealGapMin: 240,
                source: 'FULL'
            });

            const context = {
                currentTime: '20:30', // After 20:00 threshold
                lastMeal: { time: '17:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1200, protein: 80, carbs: 140 },
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, [{ date: '2024-01-01' }]);

            expect(result.scenario).toBe('LATE_EVENING');
        });

        it('uses adaptive idealMealGapMin for timing', () => {
            // Mock adaptive gap of 3 hours
            global.HEYS.InsightsPI.thresholds.getAdaptiveThresholds = () => ({
                lateEatingHour: 21.0,
                idealMealGapMin: 180, // 3 hours
                source: 'FULL'
            });

            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00' }, // 4 hours ago
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 600, protein: 40, carbs: 70 },
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, [{ date: '2024-01-01' }]);

            expect(result.timing).toBeDefined();
            // Should recommend eating now since 4h > 3h gap
            expect(result.timing.reason).toContain('gap');
        });
    });

    describe('Edge Cases & Boundaries (v2.4)', () => {
        it('handles exactly 50 kcal remaining (LIGHT_SNACK boundary)', () => {
            const context = {
                currentTime: '18:00',
                lastMeal: { time: '14:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1750, protein: 115, carbs: 190 }, // exactly 50 kcal
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.scenario).toBe('LIGHT_SNACK');
            expect(result.macros.kcal).toBeLessThanOrEqual(150);
        });

        it('handles exactly 150 kcal remaining (LIGHT_SNACK upper boundary)', () => {
            const context = {
                currentTime: '19:00',
                lastMeal: { time: '16:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1650, protein: 100, carbs: 170 }, // exactly 150 kcal
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.scenario).toBe('LIGHT_SNACK');
            expect(result.macros.kcal).toBeLessThanOrEqual(150);
        });

        it('handles missing thresholds gracefully (fallback to defaults)', () => {
            // Remove thresholds module
            global.HEYS.InsightsPI.thresholds = undefined;

            const context = {
                currentTime: '21:30', // Should still detect late evening
                lastMeal: { time: '18:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1400, protein: 90, carbs: 150 },
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.scenario).toBe('LATE_EVENING');
        });
    });

    describe('Scenario Priority Order (v2.4)', () => {
        it('GOAL_REACHED overrides LATE_EVENING', () => {
            const context = {
                currentTime: '22:00', // Late
                lastMeal: { time: '19:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1780, protein: 119, carbs: 198 }, // <50 kcal remaining
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, [{ date: '2024-01-01' }]);

            expect(result.scenario).toBe('GOAL_REACHED'); // Higher priority
        });

        it('PRE_WORKOUT overrides LATE_EVENING', () => {
            const context = {
                currentTime: '21:00', // Late
                lastMeal: { time: '18:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1200, protein: 80, carbs: 140 },
                training: { type: 'strength', time: '22:00' }, // Training in 1h
                sleepTarget: '23:30'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, [{ date: '2024-01-01' }]);

            expect(result.scenario).toBe('PRE_WORKOUT'); // Higher priority
        });

        it('PROTEIN_DEFICIT overrides STRESS_EATING', () => {
            const context = {
                currentTime: '18:00',
                lastMeal: { time: '14:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1100, protein: 50, carbs: 130 }, // <50% protein
                stress: 5, // High stress
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.scenario).toBe('PROTEIN_DEFICIT'); // Higher priority
        });
    });
});
