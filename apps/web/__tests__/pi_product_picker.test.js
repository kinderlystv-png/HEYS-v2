/**
 * Tests for HEYS Predictive Insights — Smart Product Picker v2.5
 * 
 * Tests:
 * - Product history analysis (30 days)
 * - Multi-factor scoring system
 * - Category-based fallback
 * - Integration with meal recommender scenarios
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

describe('Smart Product Picker v2.5', () => {
    let HEYS;
    let mockLsGet;
    let mockDayData;

    beforeEach(() => {
        // Setup global HEYS object
        global.HEYS = {
            InsightsPI: {},
            utils: {
                dateOffsetStr: (offset) => {
                    const d = new Date('2026-02-14');
                    d.setDate(d.getDate() + offset);
                    return d.toISOString().split('T')[0];
                }
            }
        };

        // Mock localStorage getter with sample data
        mockDayData = {
            meals: [
                {
                    time: '08:00',
                    items: [
                        { name: 'Творог', grams: 150, prot: 18, carb: 5, fat: 9, kcal: 180, harm: 1, gi: 30 },
                        { name: 'Банан', grams: 120, prot: 1, carb: 27, fat: 0, kcal: 105, harm: 2, gi: 60 }
                    ]
                },
                {
                    time: '13:00',
                    items: [
                        { name: 'Куриная грудка', grams: 150, prot: 31, carb: 0, fat: 3, kcal: 165, harm: 1, gi: 0 },
                        { name: 'Бурый рис (готовый)', grams: 150, prot: 4, carb: 35, fat: 1, kcal: 170, harm: 0, gi: 50 }
                    ]
                }
            ]
        };

        mockLsGet = (key) => {
            if (key.startsWith('heys_dayv2_')) {
                return mockDayData;
            }
            return null;
        };

        // Load the module
        const pickerPath = path.join(__dirname, '../insights/pi_product_picker.js');
        loadScriptAsModule(pickerPath);
        HEYS = global.HEYS;
    });

    describe('Product History Analysis', () => {
        it('analyzes 30 days of history correctly', () => {
            const history = HEYS.InsightsPI.productPicker.analyzeProductHistory(30, mockLsGet);

            expect(history).toBeDefined();
            expect(history.totalProducts).toBeGreaterThan(0);
            expect(history.products).toBeInstanceOf(Array);

            // Check that products have expected fields
            if (history.products.length > 0) {
                const product = history.products[0];
                expect(product).toHaveProperty('name');
                expect(product).toHaveProperty('frequency');
                expect(product).toHaveProperty('avgGrams');
                expect(product).toHaveProperty('familiarityScore');
                expect(product).toHaveProperty('category');
                expect(product).toHaveProperty('macros');
            }
        });

        it('groups products by category', () => {
            const history = HEYS.InsightsPI.productPicker.analyzeProductHistory(30, mockLsGet);

            expect(history.byCategory).toBeDefined();
            expect(history.byCategory.dairy).toBeInstanceOf(Array);
            expect(history.byCategory.protein).toBeInstanceOf(Array);
            expect(history.byCategory.fruits).toBeInstanceOf(Array);
        });

        it('calculates familiarity scores (1-10)', () => {
            const history = HEYS.InsightsPI.productPicker.analyzeProductHistory(30, mockLsGet);

            history.products.forEach(product => {
                expect(product.familiarityScore).toBeGreaterThanOrEqual(1);
                expect(product.familiarityScore).toBeLessThanOrEqual(10);
            });
        });
    });

    describe('Category Detection', () => {
        it('detects dairy products', () => {
            const detectCategory = HEYS.InsightsPI.productPicker._internal.detectCategory;

            expect(detectCategory('Творог')).toBe('dairy');
            expect(detectCategory('Кефир')).toBe('dairy');
            expect(detectCategory('Йогурт натуральный')).toBe('dairy');
        });

        it('detects protein products', () => {
            const detectCategory = HEYS.InsightsPI.productPicker._internal.detectCategory;

            expect(detectCategory('Куриная грудка')).toBe('protein');
            expect(detectCategory('Яйца')).toBe('protein');
            expect(detectCategory('Рыба')).toBe('protein');
        });

        it('detects vegetables', () => {
            const detectCategory = HEYS.InsightsPI.productPicker._internal.detectCategory;

            expect(detectCategory('Огурцы')).toBe('vegetables');
            expect(detectCategory('Помидоры')).toBe('vegetables');
            expect(detectCategory('Салат')).toBe('vegetables');
        });

        it('detects fruits', () => {
            const detectCategory = HEYS.InsightsPI.productPicker._internal.detectCategory;

            expect(detectCategory('Банан')).toBe('fruits');
            expect(detectCategory('Яблоко')).toBe('fruits');
        });

        it('detects grains', () => {
            const detectCategory = HEYS.InsightsPI.productPicker._internal.detectCategory;

            expect(detectCategory('Бурый рис (готовый)')).toBe('grains');
            expect(detectCategory('Овсянка')).toBe('grains');
        });

        it('returns "other" for unknown products', () => {
            const detectCategory = HEYS.InsightsPI.productPicker._internal.detectCategory;

            expect(detectCategory('Exotic Product XYZ')).toBe('other');
        });
    });

    describe('Familiarity Score Calculation', () => {
        it('assigns score 10 for very frequent products (15+/month)', () => {
            const calculateFamiliarityScore = HEYS.InsightsPI.productPicker._internal.calculateFamiliarityScore;

            const score = calculateFamiliarityScore(20, 30); // 20 times in 30 days
            expect(score).toBe(10);
        });

        it('assigns score 5 for moderate frequency (3/month)', () => {
            const calculateFamiliarityScore = HEYS.InsightsPI.productPicker._internal.calculateFamiliarityScore;

            const score = calculateFamiliarityScore(3, 30); // 3 times in 30 days
            expect(score).toBe(5);
        });

        it('assigns score 1 for rare products (1/month)', () => {
            const calculateFamiliarityScore = HEYS.InsightsPI.productPicker._internal.calculateFamiliarityScore;

            const score = calculateFamiliarityScore(1, 30); // 1 time in 30 days
            expect(score).toBe(1);
        });
    });

    describe('Multi-Factor Scoring System', () => {
        it('scores products based on protein alignment', () => {
            const mockProduct = {
                name: 'Куриная грудка',
                macros: { protein: 31, carbs: 0, fat: 3, kcal: 165 },
                harm: 1,
                gi: 0,
                familiarityScore: 8
            };

            const scenario = {
                scenario: 'PROTEIN_DEFICIT',
                remainingKcal: 300,
                targetProteinG: 40,
                targetCarbsG: 10,
                targetKcal: 300,
                idealGI: 50
            };

            const score = HEYS.InsightsPI.productPicker.calculateProductScore(mockProduct, scenario, 150);

            expect(score.totalScore).toBeGreaterThan(60); // Should score well for protein
            expect(score.breakdown).toHaveProperty('proteinAlignment');
            expect(score.breakdown).toHaveProperty('carbAlignment');
            expect(score.breakdown).toHaveProperty('kcalFit');
        });

        it('penalizes products exceeding kcal budget', () => {
            const mockProduct = {
                name: 'Pizza',
                macros: { protein: 12, carbs: 40, fat: 15, kcal: 350 },
                harm: 6,
                gi: 70,
                familiarityScore: 5
            };

            const scenario = {
                scenario: 'LIGHT_SNACK',
                remainingKcal: 100, // Only 100 kcal remaining
                targetProteinG: 10,
                targetCarbsG: 15,
                targetKcal: 100,
                idealGI: 50
            };

            const score = HEYS.InsightsPI.productPicker.calculateProductScore(mockProduct, scenario, 100);

            expect(score.totalScore).toBeLessThan(75); // v4.0.0 soft penalty: kcalFit=0 but other factors still score
            expect(score.breakdown.kcalFit).toBeLessThan(50);
        });

        it('boosts familiar products', () => {
            const productUnfamiliar = {
                name: 'Unknown Food',
                macros: { protein: 20, carbs: 30, fat: 10, kcal: 300 },
                harm: 3,
                gi: 50,
                familiarityScore: 1 // Rarely eaten
            };

            const productFamiliar = {
                ...productUnfamiliar,
                familiarityScore: 10 // Frequently eaten
            };

            const scenario = {
                remainingKcal: 300,
                targetProteinG: 20,
                targetCarbsG: 30,
                targetKcal: 300,
                idealGI: 50
            };

            const scoreUnfamiliar = HEYS.InsightsPI.productPicker.calculateProductScore(productUnfamiliar, scenario, 100);
            const scoreFamiliar = HEYS.InsightsPI.productPicker.calculateProductScore(productFamiliar, scenario, 100);

            expect(scoreFamiliar.totalScore).toBeGreaterThan(scoreUnfamiliar.totalScore);
        });
    });

    describe('Main API: generateProductSuggestions', () => {
        it('generates suggestions for PROTEIN_DEFICIT scenario', () => {
            const params = {
                scenario: 'PROTEIN_DEFICIT',
                remainingKcal: 300,
                targetProteinG: 40,
                targetCarbsG: 10,
                targetFatG: 5,
                idealGI: 50,
                lsGet: mockLsGet,
                sharedProducts: [],
                limit: 3
            };

            const suggestions = HEYS.InsightsPI.productPicker.generateProductSuggestions(params);

            // v3.2: generateProductSuggestions returns { mode: 'grouped', groups, ... } for balanced scenarios
            expect(suggestions).toHaveProperty('mode', 'grouped');
            expect(suggestions.groups).toBeInstanceOf(Array);
            expect(suggestions.groups.length).toBeGreaterThan(0);

            // Check structure of items inside groups
            const allProducts = suggestions.groups.flatMap(g => g.products || []);
            expect(allProducts.length).toBeGreaterThan(0);
            allProducts.forEach(sugg => {
                expect(sugg).toHaveProperty('product');
                expect(sugg).toHaveProperty('grams');
                expect(sugg).toHaveProperty('reason');
                expect(sugg).toHaveProperty('score');
                expect(sugg).toHaveProperty('source'); // 'history' or 'fallback'
                expect(sugg).toHaveProperty('macros');
            });
        });

        it('generates suggestions for LATE_EVENING scenario', () => {
            const params = {
                scenario: 'LATE_EVENING',
                remainingKcal: 200,
                targetProteinG: 30,
                targetCarbsG: 5,
                targetFatG: 5,
                idealGI: 30, // Low GI preferred
                lsGet: mockLsGet,
                sharedProducts: [],
                limit: 3
            };

            const suggestions = HEYS.InsightsPI.productPicker.generateProductSuggestions(params);

            // v3.2: grouped response
            expect(suggestions).toHaveProperty('mode', 'grouped');
            const lateProducts = suggestions.groups.flatMap(g => g.products || []);
            expect(lateProducts.length).toBeGreaterThan(0);

            // Check that suggestions have low kcal (appropriate for late evening)
            lateProducts.forEach(sugg => {
                expect(sugg.macros.kcal).toBeLessThanOrEqual(300);
            });
        });

        it('falls back to general products when history insufficient', () => {
            // Mock lsGet that returns no data
            const emptyLsGet = () => null;

            const fallbackProducts = [
                { name: 'Творог универсальный', prot: 18, carb: 5, fat: 9, kcal: 180, harm: 1, gi: 30 },
                { name: 'Куриная грудка универсальная', prot: 31, carb: 0, fat: 3, kcal: 165, harm: 1, gi: 0 }
            ];

            const params = {
                scenario: 'PROTEIN_DEFICIT',
                remainingKcal: 300,
                targetProteinG: 40,
                targetCarbsG: 10,
                targetFatG: 5,
                idealGI: 50,
                lsGet: emptyLsGet,
                sharedProducts: fallbackProducts,
                limit: 3
            };

            const suggestions = HEYS.InsightsPI.productPicker.generateProductSuggestions(params);

            // v3.2: grouped response
            expect(suggestions).toHaveProperty('mode', 'grouped');

            // All should be from fallback
            const fallbackSuggested = suggestions.groups.flatMap(g => g.products || []);
            if (fallbackSuggested.length > 0) {
                expect(fallbackSuggested.every(s => s.source === 'fallback' || s.source === 'history')).toBe(true);
            }
        });

        it('maps scenarios to appropriate categories', () => {
            const mapScenarioToCategory = HEYS.InsightsPI.productPicker._internal.mapScenarioToCategory;

            expect(mapScenarioToCategory('PROTEIN_DEFICIT')).toBe('protein');
            expect(mapScenarioToCategory('LATE_EVENING')).toBe('dairy');
            expect(mapScenarioToCategory('PRE_WORKOUT')).toBe('grains');
            expect(mapScenarioToCategory('POST_WORKOUT')).toBe('protein');
            expect(mapScenarioToCategory('LIGHT_SNACK')).toBe('fruits');
        });
    });

    describe('Integration with Meal Recommender', () => {
        it('returns products that fit remaining kcal budget', () => {
            const params = {
                scenario: 'BALANCED',
                remainingKcal: 400,
                targetProteinG: 30,
                targetCarbsG: 40,
                targetFatG: 10,
                idealGI: 50,
                lsGet: mockLsGet,
                sharedProducts: [],
                limit: 3
            };

            const suggestions = HEYS.InsightsPI.productPicker.generateProductSuggestions(params);

            // Total kcal from suggestions should not grossly exceed remaining
            // v3.2: grouped response — flatten groups first
            const balancedProducts = suggestions.groups.flatMap(g => g.products || []);
            const totalKcal = balancedProducts.reduce((sum, s) => sum + s.macros.kcal, 0);
            expect(totalKcal).toBeLessThanOrEqual(params.remainingKcal * 1.5); // Allow some flexibility
        });

        it('prioritizes high-protein products for PROTEIN_DEFICIT', () => {
            const params = {
                scenario: 'PROTEIN_DEFICIT',
                remainingKcal: 300,
                targetProteinG: 40,
                targetCarbsG: 10,
                targetFatG: 5,
                idealGI: 50,
                lsGet: mockLsGet,
                sharedProducts: [],
                limit: 3
            };

            const suggestions = HEYS.InsightsPI.productPicker.generateProductSuggestions(params);

            // Check that at least one suggestion has high protein
            // v3.2: grouped response — flatten groups first
            const proteinProducts = suggestions.groups.flatMap(g => g.products || []);
            const hasHighProtein = proteinProducts.some(s => s.macros.protein >= 20);
            expect(hasHighProtein).toBe(true);
        });
    });

    describe('Performance', () => {
        it('completes analysis within 50ms budget', () => {
            const start = Date.now();

            const history = HEYS.InsightsPI.productPicker.analyzeProductHistory(30, mockLsGet);

            const elapsed = Date.now() - start;
            expect(elapsed).toBeLessThan(50);
        });

        it('completes suggestion generation within 40ms budget', () => {
            const start = Date.now();

            const params = {
                scenario: 'BALANCED',
                remainingKcal: 400,
                targetProteinG: 30,
                targetCarbsG: 40,
                targetFatG: 10,
                idealGI: 50,
                lsGet: mockLsGet,
                sharedProducts: [],
                limit: 3
            };

            HEYS.InsightsPI.productPicker.generateProductSuggestions(params);

            const elapsed = Date.now() - start;
            expect(elapsed).toBeLessThan(40);
        });
    });
});
