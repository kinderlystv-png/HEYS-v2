/**
 * Tests for HEYS Predictive Insights — Phenotype Classifier v1.0
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

describe('Phenotype Classifier & Multipliers', () => {
    let HEYS;

    beforeEach(() => {
        // Setup global HEYS object
        global.HEYS = {
            InsightsPI: {
                patterns: {
                    psychology: {}
                },
                calculations: {}
            },
            dayUtils: {}
        };

        // Load the phenotype module
        const phenotypePath = path.join(__dirname, '../insights/pi_phenotype.js');
        loadScriptAsModule(phenotypePath);
        HEYS = global.HEYS;
    });

    describe('Phenotype Multipliers', () => {
        it('applies insulin_resistant multipliers correctly', () => {
            const baseThresholds = {
                lateEatingHour: 21,
                proteinPerMealG: 25,
                carbPerMealG: 50
            };

            const phenotype = {
                metabolic: 'insulin_resistant',
                circadian: 'neutral',
                satiety: 'normal',
                stress: 'neutral'
            };

            const adjusted = HEYS.InsightsPI.phenotype.applyMultipliers(baseThresholds, phenotype);

            expect(adjusted.lateEatingHour).toBeLessThan(21); // 21 * 0.85 = 17.85
            expect(adjusted.proteinPerMealG).toBeGreaterThan(25); // 25 * 1.15 = 28.75
            expect(adjusted.carbPerMealG).toBeLessThan(50); // 50 * 0.85 = 42.5
        });

        it('applies evening_type multipliers correctly', () => {
            const baseThresholds = {
                lateEatingHour: 21,
                sleepVariabilityHours: 1
            };

            const phenotype = {
                metabolic: 'neutral',
                circadian: 'evening_type',
                satiety: 'normal',
                stress: 'neutral'
            };

            const adjusted = HEYS.InsightsPI.phenotype.applyMultipliers(baseThresholds, phenotype);

            expect(adjusted.lateEatingHour).toBeGreaterThan(21); // 21 * 1.1 = 23.1
            expect(adjusted.sleepVariabilityHours).toBeGreaterThan(1); // 1 * 1.15 = 1.15
        });

        it('applies low_satiety multipliers correctly', () => {
            const baseThresholds = {
                proteinPerMealG: 25,
                mealFrequency: 4
            };

            const phenotype = {
                metabolic: 'neutral',
                circadian: 'flexible',
                satiety: 'low_satiety',
                stress: 'neutral'
            };

            const adjusted = HEYS.InsightsPI.phenotype.applyMultipliers(baseThresholds, phenotype);

            expect(adjusted.proteinPerMealG).toBeGreaterThan(25); // 25 * 1.2 = 30
            expect(adjusted.mealFrequency).toBeGreaterThan(4); // 4 * 1.2 = 4.8
        });

        it('applies stress_eater multipliers correctly', () => {
            const baseThresholds = {
                stressEatingThreshold: 0.3
            };

            const phenotype = {
                metabolic: 'neutral',
                circadian: 'flexible',
                satiety: 'normal',
                stress: 'stress_eater'
            };

            const adjusted = HEYS.InsightsPI.phenotype.applyMultipliers(baseThresholds, phenotype);

            expect(adjusted.stressEatingThreshold).toBeGreaterThan(0.3); // 0.3 * 1.3 = 0.39
        });

        it('handles multiple phenotypes (combined multipliers)', () => {
            const baseThresholds = {
                lateEatingHour: 21,
                proteinPerMealG: 25
            };

            const phenotype = {
                metabolic: 'insulin_resistant',
                circadian: 'morning_type',
                satiety: 'low_satiety',
                stress: 'neutral'
            };

            const adjusted = HEYS.InsightsPI.phenotype.applyMultipliers(baseThresholds, phenotype);

            // lateEatingHour: 21 * 0.85 (insulin_resistant) * 0.95 (morning_type) = 16.96
            expect(adjusted.lateEatingHour).toBeLessThan(18);

            // proteinPerMealG: 25 * 1.15 (insulin_resistant) * 1.2 (low_satiety) = 34.5
            expect(adjusted.proteinPerMealG).toBeGreaterThan(30);
        });

        it('returns unchanged thresholds for neutral phenotype', () => {
            const baseThresholds = {
                lateEatingHour: 21,
                proteinPerMealG: 25
            };

            const phenotype = {
                metabolic: 'neutral',
                circadian: 'neutral',
                satiety: 'normal',
                stress: 'neutral'
            };

            const adjusted = HEYS.InsightsPI.phenotype.applyMultipliers(baseThresholds, phenotype);

            expect(adjusted.lateEatingHour).toBe(21);
            expect(adjusted.proteinPerMealG).toBe(25);
        });

        it('handles missing phenotype gracefully', () => {
            const baseThresholds = {
                lateEatingHour: 21,
                proteinPerMealG: 25
            };

            const adjusted = HEYS.InsightsPI.phenotype.applyMultipliers(baseThresholds, null);

            expect(adjusted.lateEatingHour).toBe(21);
            expect(adjusted.proteinPerMealG).toBe(25);
        });

        it('handles undefined thresholds in base', () => {
            const baseThresholds = {
                lateEatingHour: 21
            };

            const phenotype = {
                metabolic: 'insulin_resistant',
                circadian: 'neutral',
                satiety: 'normal',
                stress: 'neutral'
            };

            const adjusted = HEYS.InsightsPI.phenotype.applyMultipliers(baseThresholds, phenotype);

            expect(adjusted.lateEatingHour).toBeLessThan(21);
            expect(adjusted.proteinPerMealG).toBeUndefined();
        });
    });

    describe('Auto-Detection', () => {
        beforeEach(() => {
            // Mock patterns and calculations
            HEYS.InsightsPI.patterns.psychology.analyzeStressEating = vi.fn();
            HEYS.InsightsPI.patterns.psychology.analyzeMoodFood = vi.fn();
            HEYS.InsightsPI.calculations.calculateItemKcal = vi.fn().mockReturnValue(400);
        });

        it('returns null for insufficient data (<30 days)', () => {
            const days = new Array(20).fill({
                date: '2026-02-01',
                meals: [{ time: '08:00', items: [] }],
                weight: 70,
                wellbeing: { energy: 75 }
            });

            const result = HEYS.InsightsPI.phenotype.autoDetect(days, {}, {});

            expect(result).toBeNull();
        });

        it('detects morning_type from meal timing (early meals)', () => {
            const days = new Array(30).fill(null).map((_, i) => ({
                date: `2026-02-${String(i + 1).padStart(2, '0')}`,
                meals: [
                    { time: '07:00', items: [{ product_id: 1, gramm: 100 }] },
                    { time: '12:00', items: [{ product_id: 2, gramm: 150 }] },
                    { time: '18:00', items: [{ product_id: 3, gramm: 120 }] }
                ],
                weight: 70,
                dayTot: { carb: 150 },
                wellbeing: { energy: 75 }
            }));

            const result = HEYS.InsightsPI.phenotype.autoDetect(days, {}, {});

            expect(result).not.toBeNull();
            expect(result.circadian).toBe('morning_type');
            expect(result.confidence.circadian).toBeGreaterThan(0.6);
        });

        it('detects evening_type from meal timing (late meals)', () => {
            const days = new Array(30).fill(null).map((_, i) => ({
                date: `2026-02-${String(i + 1).padStart(2, '0')}`,
                meals: [
                    { time: '11:00', items: [{ product_id: 1, gramm: 100 }] },
                    { time: '15:00', items: [{ product_id: 2, gramm: 150 }] },
                    { time: '22:00', items: [{ product_id: 3, gramm: 120 }] }
                ],
                weight: 70,
                dayTot: { carb: 150 },
                wellbeing: { energy: 75 }
            }));

            const result = HEYS.InsightsPI.phenotype.autoDetect(days, {}, {});

            expect(result).not.toBeNull();
            expect(result.circadian).toBe('evening_type');
            expect(result.confidence.circadian).toBeGreaterThan(0.6);
        });

        it('detects low_satiety from meal frequency (many small meals)', () => {
            const days = new Array(30).fill(null).map((_, i) => ({
                date: `2026-02-${String(i + 1).padStart(2, '0')}`,
                meals: [
                    { time: '08:00', items: [{ product_id: 1, gramm: 50 }] },
                    { time: '10:30', items: [{ product_id: 2, gramm: 50 }] },
                    { time: '13:00', items: [{ product_id: 3, gramm: 50 }] },
                    { time: '16:00', items: [{ product_id: 4, gramm: 50 }] },
                    { time: '19:00', items: [{ product_id: 5, gramm: 50 }] },
                    { time: '21:00', items: [{ product_id: 6, gramm: 50 }] }
                ],
                weight: 70,
                dayTot: { carb: 150 },
                wellbeing: { energy: 75 }
            }));

            HEYS.InsightsPI.calculations.calculateItemKcal.mockReturnValue(200);

            const result = HEYS.InsightsPI.phenotype.autoDetect(days, {}, {});

            expect(result).not.toBeNull();
            expect(result.satiety).toBe('low_satiety');
            expect(result.confidence.satiety).toBeGreaterThan(0.6);
        });

        it('detects high_satiety from meal frequency (few large meals)', () => {
            const days = new Array(30).fill(null).map((_, i) => ({
                date: `2026-02-${String(i + 1).padStart(2, '0')}`,
                meals: [
                    { time: '10:00', items: [{ product_id: 1, gramm: 300 }] },
                    { time: '18:00', items: [{ product_id: 2, gramm: 300 }] }
                ],
                weight: 70,
                dayTot: { carb: 150 },
                wellbeing: { energy: 75 }
            }));

            HEYS.InsightsPI.calculations.calculateItemKcal.mockReturnValue(800);

            const result = HEYS.InsightsPI.phenotype.autoDetect(days, {}, {});

            expect(result).not.toBeNull();
            expect(result.satiety).toBe('high_satiety');
            expect(result.confidence.satiety).toBeGreaterThan(0.6);
        });

        it('detects stress_eater from pattern correlation', () => {
            const days = new Array(30).fill(null).map((_, i) => ({
                date: `2026-02-${String(i + 1).padStart(2, '0')}`,
                meals: [{ time: '08:00', items: [{ product_id: 1, gramm: 100 }] }],
                weight: 70,
                dayTot: { carb: 150 },
                wellbeing: { energy: 75, stress: 6 }
            }));

            HEYS.InsightsPI.patterns.psychology.analyzeStressEating.mockReturnValue({
                correlation: 0.45,
                confidence: 0.75
            });

            const result = HEYS.InsightsPI.phenotype.autoDetect(days, {}, {});

            expect(result).not.toBeNull();
            expect(result.stress).toBe('stress_eater');
            expect(result.confidence.stress).toBeGreaterThan(0.4);
        });
    });

    describe('Phenotype Taxonomy', () => {
        it('exports correct phenotype categories', () => {
            const phenotypes = HEYS.InsightsPI.phenotype.PHENOTYPES;

            expect(phenotypes.metabolic).toContain('insulin_sensitive');
            expect(phenotypes.metabolic).toContain('insulin_resistant');
            expect(phenotypes.circadian).toContain('morning_type');
            expect(phenotypes.circadian).toContain('evening_type');
            expect(phenotypes.satiety).toContain('high_satiety');
            expect(phenotypes.satiety).toContain('low_satiety');
            expect(phenotypes.stress).toContain('stress_eater');
            expect(phenotypes.stress).toContain('neutral');
        });

        it('all multipliers reference valid phenotypes', () => {
            const phenotypes = HEYS.InsightsPI.phenotype.PHENOTYPES;
            const multipliers = HEYS.InsightsPI.phenotype.PHENOTYPE_MULTIPLIERS;

            for (const [_thresholdKey, multiplierMap] of Object.entries(multipliers)) {
                for (const phenotypeKey of Object.keys(multiplierMap)) {
                    const isValid = Object.values(phenotypes).some(category =>
                        category.includes(phenotypeKey)
                    );
                    expect(isValid).toBe(true);
                }
            }
        });
    });
});
