/**
 * Tests for HEYS Predictive Insights — Meal Recommender v1.0
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

describe('Meal Recommender', () => {
    let HEYS;

    beforeEach(() => {
        // Setup global HEYS object
        global.HEYS = {
            InsightsPI: {}
        };

        // Load the module
        const recommenderPath = path.join(__dirname, '../insights/pi_meal_recommender.js');
        loadScriptAsModule(recommenderPath);
        HEYS = global.HEYS;
    });

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
        expect(result.method).toBe('rule_based');
    });

    it('adjusts timing for pre-workout meal', () => {
        const context = {
            currentTime: '16:00',
            lastMeal: { time: '12:00', protein: 30, carbs: 50 },
            dayTarget: { kcal: 1800, protein: 120 },
            dayEaten: { kcal: 900, protein: 60 },
            training: { type: 'strength', time: '18:00' },
            sleepTarget: '23:00'
        };

        const profile = { norm: { prot: 120, kcal: 1800 }, optimum: 1800 };

        const result = HEYS.InsightsPI.mealRecommender.recommend(context, profile, {}, []);

        expect(result.available).toBe(true);
        expect(result.timing.reason).toContain('Pre-workout');
        expect(result.macros.protein).toBeGreaterThanOrEqual(30);
    });

    it('returns error for missing context', () => {
        const result = HEYS.InsightsPI.mealRecommender.recommend(null, {}, {}, []);

        expect(result.available).toBe(false);
        expect(result.error).toContain('Missing context');
    });
});
