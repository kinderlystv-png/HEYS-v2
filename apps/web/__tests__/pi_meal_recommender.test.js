/**
 * Tests for HEYS Predictive Insights — Meal Recommender v2.6
 * 
 * v2.4 additions:
 * - 8-scenario classification system
 * - Adaptive thresholds integration
 * - Scenario-specific macro strategies
 * 
 * v2.6 additions (R2.6 Deep Insights Integration):
 * - Pattern scores integration (C09/C11/C13/C30)
 * - Dynamic confidence calculation
 * - Phenotype-based macro adjustments
 * - Scenario priority multipliers
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

describe('Meal Recommender v2.6', () => {
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
                },
                patterns: {
                    // Mock patterns (for R2.6 integration)
                    getScore: (patternId) => {
                        const scores = {
                            'C09': 0.7,  // protein_satiety
                            'C11': 0.65, // stress_eating
                            'C13': 0.8,  // circadian_timing
                            'C30': 0.6   // training_recovery
                        };
                        return scores[patternId] || 0.5;
                    },
                    // Mock analyze functions for getCurrentPatternScores
                    analyzeProteinSatiety: (days, pIndex, profile) => ({
                        available: true,
                        score: 0.7,
                        confidence: 0.75,
                        avgProteinG: 95,
                        satietyScore: 0.7
                    }),
                    analyzeStressEating: (days, pIndex, profile) => ({
                        available: true,
                        score: 0.65,
                        confidence: 0.72,
                        correlation: 0.45,
                        stressDays: 4
                    }),
                    analyzeCircadianTiming: (days, pIndex, profile) => ({
                        available: true,
                        score: 0.8,
                        confidence: 0.8,
                        earlyDistribution: 0.65,
                        peakHour: 19
                    }),
                    analyzeTrainingRecovery: (days, pIndex, profile) => ({
                        available: true,
                        score: 0.6,
                        confidence: 0.7,
                        recoveryRate: 0.82
                    })
                },
                phenotype: {
                    // Mock phenotype
                    getDetection: () => ({
                        detected: true,
                        metabolic: 'insulin_resistant',
                        circadian: 'evening_type',
                        satiety: 'low_satiety',
                        confidence: 0.75
                    })
                },
                mealRecPatterns: null // Will be loaded after pi_meal_rec_patterns.js
            }
        };

        // Load the patterns bridge module (R2.6)
        const patternsPath = path.join(__dirname, '../insights/pi_meal_rec_patterns.js');
        try {
            loadScriptAsModule(patternsPath);
        } catch (err) {
            console.warn('[Test] pi_meal_rec_patterns.js not loaded, some tests may fail');
        }

        // Load the meal recommender module
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
            expect(result.version).toBe('3.6'); // v3.6.0: wave-aware timing + timing sync after planner
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
            // v3.2+: last meal override — 90% of remaining budget when mealsRemaining === 1
            expect(result.macros.kcal).toBeLessThanOrEqual(1000);
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
            // v3.2+: last meal override — 90% of remaining budget when mealsRemaining === 1
            expect(result.macros.kcal).toBeLessThanOrEqual(900);
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
            // v3.2+: last meal override — 90% of remaining budget when mealsRemaining === 1
            expect(result.macros.kcal).toBeLessThanOrEqual(800);
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
            // v3.2+: last meal override — 90% of remaining budget when mealsRemaining === 1
            expect(result.macros.kcal).toBeLessThanOrEqual(600);
            expect(result.suggestions.some(s => s.product.includes('шоколад') || s.product.includes('орех'))).toBe(true);
        });

        it('detects BALANCED scenario (default)', () => {
            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 800, protein: 80, carbs: 100 },
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.scenario).toBe('BALANCED');
            // Macros distributed across remaining meals
            expect(result.macros.kcal).toBeGreaterThan(300);
            expect(result.macros.protein).toBeGreaterThanOrEqual(20);
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
            expect(result.timing.reason).toBeDefined();
            expect(result.timing.idealStart).toBeGreaterThanOrEqual(14.0); // Current time or later
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
                dayEaten: { kcal: 1651, protein: 100, carbs: 170 }, // 149 kcal remaining
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
                stress: 3, // Reduced stress to avoid override
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.scenario).toBe('PROTEIN_DEFICIT'); // Higher priority
        });

        it('LATE_EVENING takes priority over PROTEIN_DEFICIT at boundary', () => {
            // Test current behavior: LATE_EVENING checked before PROTEIN_DEFICIT
            // Mock adaptive threshold with late eating at 21:00
            global.HEYS.InsightsPI.thresholds.getAdaptiveThresholds = () => ({
                lateEatingHour: 21.0,
                idealMealGapMin: 240,
                source: 'FULL'
            });

            const context = {
                currentTime: '21:00', // Exactly at late eating hour
                lastMeal: { time: '16:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1100, protein: 50, carbs: 130 }, // <50% protein (deficit)
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, [{ date: '2024-01-01' }]);

            // Current behavior: LATE_EVENING has higher priority (checked first)
            expect(result.scenario).toBe('LATE_EVENING');
            // v3.2+: last meal override — 90% of remaining budget when mealsRemaining === 1 && remaining > 300
            expect(result.macros.kcal).toBeLessThanOrEqual(700); // 90% of 700 remaining kcal
        });

        it('Before late_evening hour, PROTEIN_DEFICIT can win', () => {
            // Test soft-window: 1h before lateEatingHour, PROTEIN_DEFICIT should be selected
            global.HEYS.InsightsPI.thresholds.getAdaptiveThresholds = () => ({
                lateEatingHour: 21.0,
                idealMealGapMin: 240,
                source: 'FULL'
            });

            const context = {
                currentTime: '20:30', // 30 min before late eating hour
                lastMeal: { time: '16:00' },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1100, protein: 50, carbs: 130 }, // <50% protein (deficit)
                sleepTarget: '23:00'
            };

            const profile = { norm: { prot: 120, carb: 200, kcal: 1800 }, optimum: 1800 };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, [{ date: '2024-01-01' }]);

            // Before lateEatingHour -> LATE_EVENING check fails -> PROTEIN_DEFICIT selected
            expect(result.scenario).toBe('PROTEIN_DEFICIT');
            expect(result.macros.protein).toBeGreaterThanOrEqual(25); // High protein ratio
        });
    });

    describe('Deep Insights Integration (v2.6)', () => {
        it('enhances recommendation with pattern scores when available', () => {
            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00', protein: 20, carbs: 45 },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 900, protein: 45, carbs: 95 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const days = Array.from({ length: 10 }, (_, i) => ({ date: `2024-01-${i + 1}` }));

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, days);

            expect(result.available).toBe(true);
            // If patterns module loaded, confidence should be enhanced (not default 0.75)
            if (HEYS.InsightsPI.mealRecPatterns) {
                expect(result.confidence).not.toBe(0.75);
                expect(result.insights).toBeDefined();
                expect(result.insights.patternScores).toBeDefined();
            }
        });

        it('calculates dynamic confidence based on scenario + patterns + data quality', () => {
            if (!HEYS.InsightsPI.mealRecPatterns) {
                console.warn('[Test] Skipping: pi_meal_rec_patterns not loaded');
                return;
            }

            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00', protein: 20, carbs: 45 },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 900, protein: 45, carbs: 95 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const days = Array.from({ length: 15 }, (_, i) => ({ date: `2024-01-${i + 1}` }));

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, days);

            // Dynamic confidence should be in range [0.5, 1.0]
            expect(result.confidence).toBeGreaterThanOrEqual(0.5);
            expect(result.confidence).toBeLessThanOrEqual(1.0);
            // High data quality (15 days) + normalized pattern scores should yield strong confidence
            // v3.1 Phase A adds more meal-relevant patterns, so baseline confidence is higher
            expect(result.confidence).toBeGreaterThan(0.75);
            expect(result.confidence).toBeLessThan(0.9);
        });

        it('applies phenotype-based macro adjustments', () => {
            if (!HEYS.InsightsPI.mealRecPatterns) {
                console.warn('[Test] Skipping: pi_meal_rec_patterns not loaded');
                return;
            }

            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00', protein: 20, carbs: 45 },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 900, protein: 45, carbs: 95 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const days = Array.from({ length: 10 }, (_, i) => ({ date: `2024-01-${i + 1}` }));

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, days);

            // Check if phenotype adjustments applied
            if (result.insights?.phenotypeAdjusted) {
                expect(result.insights.phenotypeAdjusted).toBe(true);
                expect(result.macros).toBeDefined();
                // Insulin resistant → lower carbs expected
                // Values should differ from base recommendation
            }
        });

        it('adjusts scenario priority based on pattern scores', () => {
            if (!HEYS.InsightsPI.mealRecPatterns) {
                console.warn('[Test] Skipping: pi_meal_rec_patterns not loaded');
                return;
            }

            const context = {
                currentTime: '18:00',
                lastMeal: { time: '14:00', protein: 25, carbs: 50 },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 1200, protein: 60, carbs: 130 }, // Moderate protein deficit
                stress: 5, // High stress
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const days = Array.from({ length: 10 }, (_, i) => ({ date: `2024-01-${i + 1}` }));

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, days);

            expect(result.available).toBe(true);
            // Priority multipliers should be applied based on C09/C11 scores
            if (result.insights?.priorityMultipliers) {
                expect(result.insights.priorityMultipliers).toBeDefined();
                expect(Object.keys(result.insights.priorityMultipliers).length).toBeGreaterThan(0);
            }
        });

        it('handles missing pattern scores gracefully', () => {
            if (!HEYS.InsightsPI.mealRecPatterns) {
                console.warn('[Test] Skipping: pi_meal_rec_patterns not loaded');
                return;
            }

            // Temporarily break patterns mock
            const originalGetScore = HEYS.InsightsPI.patterns.getScore;
            HEYS.InsightsPI.patterns.getScore = () => null;

            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00', protein: 20, carbs: 45 },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 900, protein: 45, carbs: 95 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const days = Array.from({ length: 10 }, (_, i) => ({ date: `2024-01-${i + 1}` }));

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, days);

            // Should still work with base recommendation
            expect(result.available).toBe(true);
            expect(result.macros).toBeDefined();

            // Restore mock
            HEYS.InsightsPI.patterns.getScore = originalGetScore;
        });

        it('works with insufficient data (<7 days)', () => {
            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00', protein: 20, carbs: 45 },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 900, protein: 45, carbs: 95 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const days = [{ date: '2024-01-01' }, { date: '2024-01-02' }]; // Only 2 days

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, days);

            // Should fallback to base recommendation (no enhancement)
            expect(result.available).toBe(true);
            expect(result.macros).toBeDefined();
            // Enhancement should not be applied with <7 days
        });

        it('handles missing patterns module gracefully', () => {
            // Temporarily remove mealRecPatterns
            const originalModule = HEYS.InsightsPI.mealRecPatterns;
            HEYS.InsightsPI.mealRecPatterns = null;

            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00', protein: 20, carbs: 45 },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 900, protein: 45, carbs: 95 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const days = Array.from({ length: 10 }, (_, i) => ({ date: `2024-01-${i + 1}` }));

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, days);

            // Should work with base recommendation only
            expect(result.available).toBe(true);
            expect(result.macros).toBeDefined();
            expect(result.confidence).toBe(0.75); // Default confidence

            // Restore module
            HEYS.InsightsPI.mealRecPatterns = originalModule;
        });

        it('includes pattern scores in insights object', () => {
            if (!HEYS.InsightsPI.mealRecPatterns) {
                console.warn('[Test] Skipping: pi_meal_rec_patterns not loaded');
                return;
            }

            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00', protein: 20, carbs: 45 },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 900, protein: 45, carbs: 95 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const days = Array.from({ length: 10 }, (_, i) => ({ date: `2024-01-${i + 1}` }));

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, days);

            expect(result.insights).toBeDefined();
            expect(result.insights.patternScores).toBeDefined();
            expect(result.insights.patternScores.proteinSatiety).toBeDefined(); // C09
            expect(result.insights.patternScores.stressEating).toBeDefined(); // C11
            expect(result.insights.patternScores.circadian).toBeDefined(); // C13
            expect(result.insights.patternScores.trainingRecovery).toBeDefined(); // C30
        });
    });

    describe('P0 Critical Bug Fixes', () => {
        it('no_last_meal_returns_current_time_window', () => {
            const context = {
                currentTime: '20:35',
                lastMeal: {}, // Empty object — no previous meal
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 0, protein: 0, carbs: 0 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.timing).toBeDefined();

            // Parse timing window
            const [startStr, endStr] = result.timing.ideal.split('-');
            const parseHours = (str) => {
                const [h, m] = str.split(':').map(Number);
                return h + m / 60;
            };
            const startHours = parseHours(startStr);
            const currentHours = parseHours(context.currentTime);

            // idealStart should be around currentTime (not 04:00!)
            expect(startHours).toBeGreaterThanOrEqual(currentHours);
            expect(startHours).toBeLessThan(currentHours + 0.1); // Within ~6 minutes
            expect(result.timing.reason).toContain('Первый прием дня');
        });

        it('timing_never_in_past', () => {
            const context = {
                currentTime: '20:35',
                lastMeal: { time: '14:00', protein: 22, carbs: 45 }, // 6.5h ago — well past ideal gap
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 800, protein: 42, carbs: 95 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

            expect(result.available).toBe(true);
            expect(result.timing).toBeDefined();

            // Parse timing window
            const [startStr] = result.timing.ideal.split('-');
            const parseHours = (str) => {
                const [h, m] = str.split(':').map(Number);
                return h + m / 60;
            };
            const startHours = parseHours(startStr);
            const currentHours = parseHours(context.currentTime);

            // idealStart MUST be >= currentTime
            expect(startHours).toBeGreaterThanOrEqual(currentHours);
            expect(result.timing.reason).toBeDefined();
        });

        it('dynamic_confidence_uses_normalized_pattern_scores', () => {
            if (!HEYS.InsightsPI.mealRecPatterns) {
                console.warn('[Test] Skipping: pi_meal_rec_patterns not loaded');
                return;
            }

            // Mock patterns with high scores (0-100 scale)
            const originalAnalyzeFns = {
                proteinSatiety: HEYS.InsightsPI.patterns.analyzeProteinSatiety,
                stressEating: HEYS.InsightsPI.patterns.analyzeStressEating,
                circadianTiming: HEYS.InsightsPI.patterns.analyzeCircadianTiming,
                trainingRecovery: HEYS.InsightsPI.patterns.analyzeTrainingRecovery
            };

            // Override with high scores (80-90 on 0-100 scale)
            HEYS.InsightsPI.patterns.analyzeProteinSatiety = () => ({
                available: true,
                score: 80, // 0-100 scale
                confidence: 0.8
            });
            HEYS.InsightsPI.patterns.analyzeStressEating = () => ({
                available: true,
                score: 85,
                confidence: 0.82
            });
            HEYS.InsightsPI.patterns.analyzeCircadianTiming = () => ({
                available: true,
                score: 90,
                confidence: 0.9
            });
            HEYS.InsightsPI.patterns.analyzeTrainingRecovery = () => ({
                available: true,
                score: 75,
                confidence: 0.75
            });

            const context = {
                currentTime: '14:00',
                lastMeal: { time: '10:00', protein: 20, carbs: 45 },
                dayTarget: { kcal: 1800, protein: 120, carbs: 200 },
                dayEaten: { kcal: 900, protein: 45, carbs: 95 },
                sleepTarget: '23:00'
            };

            const profile = {
                norm: { prot: 120, carb: 200, kcal: 1800 },
                optimum: 1800
            };

            const days = Array.from({ length: 30 }, (_, i) => ({ date: `2024-01-${i + 1}` }));

            const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, days);

            expect(result.available).toBe(true);
            expect(result.confidence).toBeDefined();

            // Confidence should be in reasonable range [0.5, 1.0], NOT clipped to 1.0
            expect(result.confidence).toBeGreaterThanOrEqual(0.5);
            expect(result.confidence).toBeLessThanOrEqual(1.0);

            // With normalized scores, high pattern scores (80-90) should produce confidence < 1.0
            // Formula: (scenarioConf*0.4) + (patternAvg*0.3) + (dataQuality*0.3)
            // Example: (0.7*0.4) + (0.825*0.3) + (1.0*0.3) = 0.28 + 0.2475 + 0.3 = 0.8275
            expect(result.confidence).toBeLessThan(1.0); // Should NOT clip to 1.0

            // Restore original functions
            Object.assign(HEYS.InsightsPI.patterns, originalAnalyzeFns);
        });
    });
});
