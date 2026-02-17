/**
 * Tests for HEYS Predictive Insights — Feedback Loop v1.0
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

describe('Feedback Loop', () => {
    let HEYS;

    beforeEach(() => {
        // Setup global HEYS object
        global.HEYS = {
            InsightsPI: {},
            dayUtils: {
                lsGet: vi.fn().mockReturnValue([]),
                lsSet: vi.fn()
            }
        };

        // Load the module
        const feedbackPath = path.join(__dirname, '../insights/pi_feedback_loop.js');
        loadScriptAsModule(feedbackPath);
        HEYS = global.HEYS;
    });

    it('stores recommendation and returns ID', () => {
        const recommendation = { timing: { ideal: '13:00-14:00' }, macros: { protein: 30 } };
        const profile = { id: 'client_123' };

        const recId = HEYS.InsightsPI.feedbackLoop.storeRecommendation(recommendation, 'meal', profile);

        expect(recId).toMatch(/^rec_meal_\d+_\d+$/);
        expect(HEYS.dayUtils.lsSet).toHaveBeenCalled();
    });

    it('marks recommendation as followed', () => {
        const recommendation = { timing: { ideal: '13:00-14:00' } };
        const profile = { id: 'client_123' };

        const recId = HEYS.InsightsPI.feedbackLoop.storeRecommendation(recommendation, 'meal', profile);

        // Mock getHistory to return stored recommendation
        HEYS.dayUtils.lsGet.mockReturnValue([{
            id: recId,
            type: 'meal',
            recommendation,
            followed: null
        }]);

        HEYS.InsightsPI.feedbackLoop.markFollowed(recId, true, profile);

        expect(HEYS.dayUtils.lsSet).toHaveBeenCalled();
    });

    it('submits outcome feedback', () => {
        const recommendation = { timing: { ideal: '13:00-14:00' } };
        const profile = { id: 'client_123' };

        const recId = HEYS.InsightsPI.feedbackLoop.storeRecommendation(recommendation, 'meal', profile);

        // Mock getHistory to return stored recommendation
        HEYS.dayUtils.lsGet.mockReturnValue([{
            id: recId,
            type: 'meal',
            recommendation,
            followed: true
        }]);

        const outcome = { satiety: 5, energy: 4, mood: 4 };
        HEYS.InsightsPI.feedbackLoop.submitFeedback(recId, outcome, profile);

        expect(HEYS.dayUtils.lsSet).toHaveBeenCalled();
    });

    it('analyzes outcomes correctly', () => {
        const profile = { id: 'client_123' };

        // Mock history with mixed outcomes
        HEYS.dayUtils.lsGet.mockReturnValue([
            {
                id: 'rec1',
                timestamp: new Date().toISOString(),
                followed: true,
                outcome: { satiety: 5, energy: 5, mood: 4 }
            },
            {
                id: 'rec2',
                timestamp: new Date().toISOString(),
                followed: true,
                outcome: { satiety: 3, energy: 3, mood: 3 }
            },
            {
                id: 'rec3',
                timestamp: new Date().toISOString(),
                followed: false
            }
        ]);

        const analysis = HEYS.InsightsPI.feedbackLoop.analyzeOutcomes(profile, 7);

        expect(analysis.total).toBe(3);
        expect(analysis.followed).toBe(2);
        expect(analysis.withFeedback).toBe(2);
        expect(analysis.positiveOutcomes).toBe(1);
        expect(analysis.avgSatiety).toBeCloseTo(4.0, 1);
    });

    it('stores recommendation with productIds in suggestions', () => {
        const recommendation = {
            timing: { ideal: '13:00-14:00' },
            macros: { protein: 30, carbs: 40, kcal: 350 },
            suggestions: [
                {
                    product: 'Творог',
                    productId: 123,
                    grams: 200,
                    reason: 'Высокое содержание белка'
                },
                {
                    product: 'Банан',
                    productId: 456,
                    grams: 150,
                    reason: 'Быстрые углеводы'
                }
            ]
        };
        const profile = { id: 'client_123' };

        const recId = HEYS.InsightsPI.feedbackLoop.storeRecommendation(recommendation, 'meal', profile);

        expect(recId).toMatch(/^rec_meal_\d+_\d+$/);

        // Verify stored data includes productId
        const lastCall = HEYS.dayUtils.lsSet.mock.calls[HEYS.dayUtils.lsSet.mock.calls.length - 1];
        const storedData = lastCall[1];

        expect(storedData[0].recommendation.suggestions).toHaveLength(2);
        expect(storedData[0].recommendation.suggestions[0].productId).toBe(123);
        expect(storedData[0].recommendation.suggestions[1].productId).toBe(456);
    });

    it('handles suggestions without productId gracefully', () => {
        const recommendation = {
            timing: { ideal: '13:00-14:00' },
            suggestions: [
                {
                    product: 'Овсянка',
                    grams: 100,
                    reason: 'Медленные углеводы'
                }
            ]
        };
        const profile = { id: 'client_123' };

        const recId = HEYS.InsightsPI.feedbackLoop.storeRecommendation(recommendation, 'meal', profile);

        expect(recId).toMatch(/^rec_meal_\d+_\d+$/);
        expect(HEYS.dayUtils.lsSet).toHaveBeenCalled();
    });
});
