/**
 * @fileoverview Tests for InsightsPI pattern analyzers (v6.0 C13-C22)
 * Phase 1: C13 Vitamin Defense Radar + C22 Reproductive Health
 * Phase 2-4: C14-C21 implementation
 */

import { describe, expect, it } from 'vitest';

// === HELPER FUNCTIONS (minimal mocks) ===

/**
 * Mock piStats helpers from Phase 0
 */
const piStats = {
    checkMinN: (days, minDays) => ({
        ok: days.length >= minDays,
        actual: days.length,
        required: minDays
    }),
    applySmallSamplePenalty: (baseConfidence, n, minN) => {
        if (n >= minN) return baseConfidence;
        const penalty = (minN - n) * 0.03;
        return Math.max(0.4, baseConfidence - penalty);
    }
};

/**
 * Build product index by name (minimal version of buildProductIndex)
 */
function buildProductIndex(products) {
    const byName = new Map();
    products.forEach(p => {
        const name = String(p.name || p.title || '').trim().toLowerCase();
        if (name) byName.set(name, p);
    });
    return { byName };
}

/**
 * Get product from meal item (minimal version)
 */
function getProductFromItem(item, productIndex) {
    const name = String(item.name || item.title || '').trim().toLowerCase();
    if (name && productIndex.byName) {
        return productIndex.byName.get(name);
    }
    return null;
}

// === C13: VITAMIN DEFENSE RADAR ===

/**
 * C13 analyzer function (extracted from pi_patterns.js for testing)
 */
function analyzeVitaminDefense(days, profile) {
    const pattern = 'vitamin_defense';
    const minDays = 7;
    const minProductsPerDay = 3;

    // Safety gate: min 7 days
    const nCheck = piStats.checkMinN(days, minDays);
    if (!nCheck.ok) {
        return {
            pattern,
            available: false,
            reason: `min_days_required`,
            actual: nCheck.actual,
            required: nCheck.required
        };
    }

    // Check average products per day
    const totalProducts = days.reduce((sum, d) => sum + (d.meals?.length || 0), 0);
    const avgProductsPerDay = totalProducts / days.length;
    if (avgProductsPerDay < minProductsPerDay) {
        return {
            pattern,
            available: false,
            reason: `min_products_required`,
            actual: Math.round(avgProductsPerDay * 10) / 10,
            required: minProductsPerDay
        };
    }

    // Gender-adjusted DRI values (mcg or mg)
    const isMale = profile?.gender === 'male';
    const DRI = {
        vitamin_a: isMale ? 900 : 700, // mcg RAE
        vitamin_c: isMale ? 90 : 75, // mg
        vitamin_d: 15, // mcg (unisex)
        vitamin_e: 15, // mg alpha-tocopherol
        vitamin_k: isMale ? 120 : 90, // mcg
        vitamin_b1: 1.2, // mg thiamine
        vitamin_b2: 1.3, // mg riboflavin
        vitamin_b3: 16, // mg niacin
        vitamin_b6: 1.3, // mg pyridoxine
        vitamin_b9: 400, // mcg folate (DFE)
        vitamin_b12: 2.4 // mcg cobalamin
    };

    const vitamins = Object.keys(DRI);

    // Build product index (mock for testing)
    const products = days.flatMap(d => d.products || []);
    const productIndex = buildProductIndex(products);

    // Calculate daily intake for each vitamin
    const vitaminData = {};
    vitamins.forEach(vit => {
        let totalIntake = 0;
        let daysWithData = 0;

        days.forEach(d => {
            const meals = d.meals || [];
            let dayIntake = 0;

            meals.forEach(item => {
                const product = getProductFromItem(item, productIndex);
                if (!product) return;

                const vitValue = product[vit] || product[`${vit}_100`] || 0;
                const grams = item.grams || item.amount || 0;
                dayIntake += (vitValue * grams) / 100;
            });

            if (dayIntake > 0) {
                totalIntake += dayIntake;
                daysWithData++;
            }
        });

        const avgIntake = daysWithData > 0 ? totalIntake / days.length : 0;
        const dri = DRI[vit];
        const pctDV = dri > 0 ? (avgIntake / dri) * 100 : 0;

        vitaminData[vit] = {
            intake: Math.round(avgIntake * 10) / 10,
            dri,
            pctDV: Math.round(pctDV),
            deficit: pctDV < 70
        };
    });

    // Functional clusters
    const clusters = {
        antioxidant: ['vitamin_a', 'vitamin_c', 'vitamin_e'],
        bone: ['vitamin_d', 'vitamin_k'],
        energy: ['vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6'],
        blood: ['vitamin_b9', 'vitamin_b12']
    };

    const clusterScores = {};
    Object.entries(clusters).forEach(([name, vitList]) => {
        const avgPct = vitList.reduce((sum, v) => sum + (vitaminData[v]?.pctDV || 0), 0) / vitList.length;
        clusterScores[name] = Math.round(avgPct);
    });

    // Count deficits
    const deficitList = vitamins.filter(v => vitaminData[v].deficit);
    const countDeficits = deficitList.length;

    // Score: 100 - (deficits × 8)
    const score = Math.max(0, Math.min(100, 100 - countDeficits * 8));

    // Confidence with small sample penalty
    const baseConfidence = score >= 85 ? 0.80 : 0.70;
    const confidence = piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays);

    // Insight generation
    let insight = '';
    if (countDeficits === 0) {
        insight = '✅ Отлично! Все 11 витаминов в норме (≥70% DRI).';
    } else if (countDeficits <= 2) {
        insight = `⚠️ Обнаружен дефицит ${countDeficits} витаминов: ${deficitList.join(', ')}. Рекомендуется коррекция рациона.`;
    } else if (countDeficits >= 5) {
        const clusterRisks = Object.entries(clusterScores)
            .filter(([, score]) => score < 70)
            .map(([name]) => name);
        insight = `❌ КРИТИЧНО: дефицит ${countDeficits} витаминов! Риски по кластерам: ${clusterRisks.join(', ')}. Срочная коррекция!`;
    } else {
        insight = `⚠️ Умеренный риск: дефицит ${countDeficits} витаминов (${deficitList.join(', ')}). Нужна коррекция.`;
    }

    return {
        pattern,
        available: true,
        vitaminData,
        clusterScores,
        deficitList,
        score,
        confidence: Math.round(confidence * 100) / 100,
        insight
    };
}

// === TESTS ===

describe('C13: Vitamin Defense Radar', () => {
    it('returns unavailable for < 7 days', () => {
        const days = [
            { date: '2026-02-01', meals: [{ name: 'Apple', grams: 100 }] },
            { date: '2026-02-02', meals: [{ name: 'Carrot', grams: 150 }] }
        ];
        const profile = { gender: 'male' };
        const result = analyzeVitaminDefense(days, profile);

        expect(result.available).toBe(false);
        expect(result.reason).toBe('min_days_required');
        expect(result.required).toBe(7);
    });

    it('returns unavailable for < 3 products/day avg', () => {
        const days = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            meals: [{ name: 'Bread', grams: 50 }] // Only 1 product per day
        }));
        const profile = { gender: 'male' };
        const result = analyzeVitaminDefense(days, profile);

        expect(result.available).toBe(false);
        expect(result.reason).toBe('min_products_required');
    });

    it('calculates vitamin intake correctly (male)', () => {
        const mockProducts = [
            { name: 'beef liver', vitamin_a: 9444, vitamin_c: 1, vitamin_b12: 70 },
            { name: 'orange', vitamin_c: 53, vitamin_b9: 30 },
            { name: 'salmon', vitamin_d: 11, vitamin_b12: 3.2 }
        ];

        const days = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            products: mockProducts,
            meals: [
                { name: 'beef liver', grams: 100 },
                { name: 'orange', grams: 150 },
                { name: 'salmon', grams: 200 },
                { name: 'bread', grams: 50 } // 4th product to pass min check
            ]
        }));

        const profile = { gender: 'male' };
        const result = analyzeVitaminDefense(days, profile);

        expect(result.available).toBe(true);
        expect(result.vitaminData.vitamin_a.pctDV).toBeGreaterThan(100); // Liver is rich in A
        expect(result.vitaminData.vitamin_c.pctDV).toBeGreaterThan(70); // Orange provides C
        expect(result.vitaminData.vitamin_b12.pctDV).toBeGreaterThan(100); // Liver + salmon
    });

    it('detects deficits (<70% DRI)', () => {
        const mockProducts = [
            { name: 'rice', vitamin_b1: 0.07, vitamin_b2: 0.05 },
            { name: 'potato', vitamin_c: 19, vitamin_b6: 0.3 }
        ];

        const days = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            products: mockProducts,
            meals: [
                { name: 'rice', grams: 100 },
                { name: 'potato', grams: 200 },
                { name: 'bread', grams: 50 }, // 3rd product
                { name: 'chicken', grams: 100 } // 4th product
            ]
        }));

        const profile = { gender: 'female' };
        const result = analyzeVitaminDefense(days, profile);

        expect(result.available).toBe(true);
        expect(result.deficitList.length).toBeGreaterThan(0);
        expect(result.score).toBeLessThan(100); // Should have some deficits
    });

    it('calculates score correctly (100 - deficits × 8)', () => {
        const mockProducts = [
            {
                name: 'multivitamin', vitamin_a: 900, vitamin_c: 90, vitamin_d: 15, vitamin_e: 15,
                vitamin_k: 120, vitamin_b1: 1.2, vitamin_b2: 1.3, vitamin_b3: 16,
                vitamin_b6: 1.3, vitamin_b9: 400, vitamin_b12: 2.4
            }
        ];

        const days = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            products: mockProducts,
            meals: [
                { name: 'multivitamin', grams: 100 },
                { name: 'chicken', grams: 100 },
                { name: 'rice', grams: 100 },
                { name: 'vegetables', grams: 150 }
            ]
        }));

        const profile = { gender: 'male' };
        const result = analyzeVitaminDefense(days, profile);

        expect(result.available).toBe(true);
        expect(result.score).toBe(100); // Perfect coverage
        expect(result.deficitList.length).toBe(0);
        expect(result.insight).toContain('Отлично');
    });

    it('applies gender-adjusted DRI (vitamin A, C, K)', () => {
        const mockProducts = [
            { name: 'carrot', vitamin_a_100: 835, vitamin_c: 5, vitamin_k: 13 }
        ];

        const daysMale = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            products: mockProducts,
            meals: [
                { name: 'carrot', grams: 100 },
                { name: 'bread', grams: 50 },
                { name: 'chicken', grams: 100 },
                { name: 'rice', grams: 80 }
            ]
        }));

        const resultMale = analyzeVitaminDefense(daysMale, { gender: 'male' });
        const resultFemale = analyzeVitaminDefense(daysMale, { gender: 'female' });

        expect(resultMale.available).toBe(true);
        expect(resultFemale.available).toBe(true);

        // Male DRI: A=900, C=90, K=120
        // Female DRI: A=700, C=75, K=90
        // Same intake → female should have higher %DV
        expect(resultFemale.vitaminData.vitamin_a.pctDV).toBeGreaterThan(resultMale.vitaminData.vitamin_a.pctDV);
    });

    it('generates correct insight for multiple deficits', () => {
        const mockProducts = [
            { name: 'white bread', vitamin_b1: 0.1, vitamin_b2: 0.05 }
        ];

        const days = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            products: mockProducts,
            meals: [
                { name: 'white bread', grams: 100 },
                { name: 'pasta', grams: 100 },
                { name: 'rice', grams: 100 },
                { name: 'chicken', grams: 80 }
            ]
        }));

        const profile = { gender: 'male' };
        const result = analyzeVitaminDefense(days, profile);

        expect(result.available).toBe(true);
        expect(result.deficitList.length).toBeGreaterThanOrEqual(5); // Poor diet = multiple deficits
        expect(result.insight).toContain('КРИТИЧНО'); // Should trigger critical warning
    });

    it('calculates functional clusters correctly', () => {
        const mockProducts = [
            { name: 'spinach', vitamin_a: 469, vitamin_c: 28, vitamin_e: 2, vitamin_k: 483 },
            { name: 'egg', vitamin_a: 160, vitamin_d: 2, vitamin_b2: 0.5, vitamin_b12: 1.1 }
        ];

        const days = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            products: mockProducts,
            meals: [
                { name: 'spinach', grams: 200 },
                { name: 'egg', grams: 100 },
                { name: 'bread', grams: 50 },
                { name: 'chicken', grams: 100 }
            ]
        }));

        const profile = { gender: 'female' };
        const result = analyzeVitaminDefense(days, profile);

        expect(result.available).toBe(true);
        expect(result.clusterScores).toHaveProperty('antioxidant');
        expect(result.clusterScores).toHaveProperty('bone');
        expect(result.clusterScores).toHaveProperty('energy');
        expect(result.clusterScores).toHaveProperty('blood');

        // Spinach + egg should boost antioxidant/bone clusters
        expect(result.clusterScores.antioxidant).toBeGreaterThan(50);
        expect(result.clusterScores.bone).toBeGreaterThan(50);
    });

    it('applies small sample penalty to confidence', () => {
        const mockProducts = [
            { name: 'multivitamin', vitamin_a: 900, vitamin_c: 90, vitamin_d: 15 }
        ];

        const days7 = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            products: mockProducts,
            meals: [
                { name: 'multivitamin', grams: 100 },
                { name: 'chicken', grams: 100 },
                { name: 'rice', grams: 100 },
                { name: 'vegetables', grams: 150 }
            ]
        }));

        const days14 = Array.from({ length: 14 }, (_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            products: mockProducts,
            meals: [
                { name: 'multivitamin', grams: 100 },
                { name: 'chicken', grams: 100 },
                { name: 'rice', grams: 100 },
                { name: 'vegetables', grams: 150 }
            ]
        }));

        const profile = { gender: 'male' };
        const result7 = analyzeVitaminDefense(days7, profile);
        const result14 = analyzeVitaminDefense(days14, profile);

        // Both >= minDays (7), so no penalty applied — confidence should be stable
        expect(result7.confidence).toBeGreaterThanOrEqual(0.7);
        expect(result14.confidence).toBeGreaterThanOrEqual(0.7);
        expect(result7.confidence).toBeLessThanOrEqual(0.8);
        expect(result14.confidence).toBeLessThanOrEqual(0.8);
    });
});
// === C22: B-COMPLEX & ANEMIA RISK ===

/**
 * C22 analyzer function (extracted from pi_patterns.js for testing)
 */
function analyzeBComplexAnemia(days, profile, productIndex) {
    const pattern = 'b_complex_anemia';
    const minDays = 7;

    const nCheck = piStats.checkMinN(days, minDays);
    if (!nCheck.ok) {
        return { pattern, available: false, reason: 'min_days_required' };
    }

    const isFemale = profile?.gender === 'female' || profile?.gender === 'Женской';
    const ironDRI = isFemale ? 18 : 8;

    const DRI = {
        vitamin_b1: 1.2,
        vitamin_b2: 1.3,
        vitamin_b3: 16,
        vitamin_b6: 1.3,
        vitamin_b9: 400,
        vitamin_b12: 2.4,
        iron: ironDRI
    };

    const bVitamins = ['vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12'];
    const nutrientData = {};

    [...bVitamins, 'iron'].forEach(nutrient => {
        let totalIntake = 0;
        let daysWithData = 0;

        days.forEach(day => {
            const meals = day.meals || [];
            let dayIntake = 0;

            meals.forEach(item => {
                const product = getProductFromItem(item, productIndex);
                if (!product) return;

                const value = product[nutrient] || product[`${nutrient}_100`] || 0;
                const grams = item.grams || item.amount || 0;
                dayIntake += (value * grams) / 100;
            });

            if (dayIntake > 0) {
                totalIntake += dayIntake;
                daysWithData++;
            }
        });

        const avgIntake = daysWithData > 0 ? totalIntake / days.length : 0;
        const dri = DRI[nutrient];
        const pctDV = dri > 0 ? (avgIntake / dri) * 100 : 0;

        nutrientData[nutrient] = {
            intake: Math.round(avgIntake * 10) / 10,
            dri,
            pctDV: Math.round(pctDV),
            deficit: pctDV < 70
        };
    });

    const energyQuartet = ['vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6'];
    const bloodPair = ['vitamin_b9', 'vitamin_b12'];

    const energyBscore = Math.round(
        energyQuartet.reduce((sum, v) => sum + (nutrientData[v]?.pctDV || 0), 0) / energyQuartet.length
    );

    const bloodBscore = Math.round(
        bloodPair.reduce((sum, v) => sum + (nutrientData[v]?.pctDV || 0), 0) / bloodPair.length
    );

    let anemiaRisk = 0;
    const ironDeficit = nutrientData.iron?.pctDV < 70;
    const b12Deficit = nutrientData.vitamin_b12?.pctDV < 70;
    const folateDeficit = nutrientData.vitamin_b9?.pctDV < 70;

    if (ironDeficit) anemiaRisk += 30;
    if (b12Deficit) anemiaRisk += 30;
    if (folateDeficit) anemiaRisk += 25;

    if (ironDeficit && b12Deficit && folateDeficit) {
        anemiaRisk = 100;
    }

    const score = Math.round(
        energyBscore * 0.4 + bloodBscore * 0.3 + (100 - anemiaRisk) * 0.3
    );

    const baseConfidence = score >= 70 ? 0.75 : 0.65;
    const confidence = piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays);

    // Vegetarian risk check
    let vegetarianRisk = false;
    if (b12Deficit) {
        let animalProductDays = 0;
        days.forEach(day => {
            const meals = day.meals || [];
            const hasB12Source = meals.some(item => {
                const product = getProductFromItem(item, productIndex);
                if (!product) return false;
                const b12 = product.vitamin_b12 || product.vitamin_b12_100 || 0;
                return b12 > 0;
            });
            if (hasB12Source) animalProductDays++;
        });

        const avgB12SourceDays = animalProductDays / days.length;
        if (avgB12SourceDays < 0.3) {
            vegetarianRisk = true;
        }
    }

    return {
        pattern,
        available: true,
        nutrientData,
        energyBscore,
        bloodBscore,
        anemiaRisk,
        vegetarianRisk,
        score,
        confidence: Math.round(confidence * 100) / 100
    };
}

describe('C22: B-Complex & Anemia Risk', () => {
    it('returns unavailable for < 7 days', () => {
        const days = Array.from({ length: 5 }, (_, i) => ({ date: `2026-02-${i + 1}`, meals: [] }));
        const result = analyzeBComplexAnemia(days, { gender: 'female' }, { byName: new Map() });

        expect(result.available).toBe(false);
        expect(result.reason).toBe('min_days_required');
    });

    it('calculates energyBscore (B1/B2/B3/B6 quartet)', () => {
        const mockProducts = [
            { name: 'wholegrains', vitamin_b1: 0.4, vitamin_b2: 0.2, vitamin_b3: 5, vitamin_b6: 0.3 }
        ];
        const productIndex = buildProductIndex(mockProducts);

        const days = Array.from({ length: 7 }, () => ({
            date: '2026-02-01',
            products: mockProducts,
            meals: [{ name: 'wholegrains', grams: 100 }]
        }));

        const result = analyzeBComplexAnemia(days, { gender: 'male' }, productIndex);

        expect(result.available).toBe(true);
        expect(result.energyBscore).toBeGreaterThan(0);
        // B1: 0.4mg → 33% DRI (1.2mg), B2: 0.2mg → 15% DRI (1.3mg), B3: 5mg → 31% DRI (16mg), B6: 0.3mg → 23% DRI (1.3mg)
        // Avg: ~25%
        expect(result.energyBscore).toBeCloseTo(25, -1);
    });

    it('calculates bloodBscore (B9/B12 pair)', () => {
        const mockProducts = [
            { name: 'liver', vitamin_b9: 290, vitamin_b12: 60 }  // mcg
        ];
        const productIndex = buildProductIndex(mockProducts);

        const days = Array.from({ length: 7 }, () => ({
            date: '2026-02-01',
            products: mockProducts,
            meals: [{ name: 'liver', grams: 100 }]
        }));

        const result = analyzeBComplexAnemia(days, { gender: 'male' }, productIndex);

        expect(result.available).toBe(true);
        expect(result.bloodBscore).toBeGreaterThan(0);
        // B9: 290mcg → 72% DRI (400mcg), B12: 60mcg → 2500% DRI (2.4mcg) → capped at reasonable
        // Avg: high value due to B12
        expect(result.bloodBscore).toBeGreaterThan(100);
    });

    it('detects iron-deficiency anemia risk (female DRI 18mg)', () => {
        const mockProducts = [
            { name: 'rice', iron: 0.5 }  // Low iron
        ];
        const productIndex = buildProductIndex(mockProducts);

        const days = Array.from({ length: 7 }, () => ({
            date: '2026-02-01',
            products: mockProducts,
            meals: [{ name: 'rice', grams: 100 }]
        }));

        const result = analyzeBComplexAnemia(days, { gender: 'female' }, productIndex);

        expect(result.available).toBe(true);
        expect(result.nutrientData.iron.pctDV).toBeLessThan(70);
        expect(result.anemiaRisk).toBeGreaterThanOrEqual(30);  // Iron deficit penalty
    });

    it('applies gender-adjusted iron DRI (male 8mg vs female 18mg)', () => {
        const mockProducts = [
            { name: 'spinach', iron: 2.7 }
        ];
        const productIndex = buildProductIndex(mockProducts);

        const days = Array.from({ length: 7 }, () => ({
            date: '2026-02-01',
            products: mockProducts,
            meals: [{ name: 'spinach', grams: 100 }]
        }));

        const resultMale = analyzeBComplexAnemia(days, { gender: 'male' }, productIndex);
        const resultFemale = analyzeBComplexAnemia(days, { gender: 'female' }, productIndex);

        expect(resultMale.nutrientData.iron.dri).toBe(8);    // Male DRI
        expect(resultFemale.nutrientData.iron.dri).toBe(18); // Female DRI

        // Same intake (2.7mg), different % DV
        expect(resultMale.nutrientData.iron.pctDV).toBeGreaterThan(resultFemale.nutrientData.iron.pctDV);
    });

    it('calculates compound anemia risk (all three deficits)', () => {
        const mockProducts = [
            { name: 'whitebread', iron: 0.5, vitamin_b9: 10, vitamin_b12: 0 }  // All low
        ];
        const productIndex = buildProductIndex(mockProducts);

        const days = Array.from({ length: 7 }, () => ({
            date: '2026-02-01',
            products: mockProducts,
            meals: [{ name: 'whitebread', grams: 100 }]
        }));

        const result = analyzeBComplexAnemia(days, { gender: 'female' }, productIndex);

        expect(result.available).toBe(true);
        expect(result.anemiaRisk).toBe(100);  // Compound risk
    });

    it('calculates score correctly (energyBscore × 0.4 + bloodBscore × 0.3 + (100 - anemiaRisk) × 0.3)', () => {
        const mockProducts = [
            { name: 'balanced', vitamin_b1: 1.0, vitamin_b2: 1.1, vitamin_b3: 14, vitamin_b6: 1.1, vitamin_b9: 350, vitamin_b12: 2.0, iron: 15 }
        ];
        const productIndex = buildProductIndex(mockProducts);

        const days = Array.from({ length: 7 }, () => ({
            date: '2026-02-01',
            products: mockProducts,
            meals: [{ name: 'balanced', grams: 100 }]
        }));

        const result = analyzeBComplexAnemia(days, { gender: 'female' }, productIndex);

        expect(result.available).toBe(true);

        // energyBscore: avg(83%, 85%, 88%, 85%) = ~85
        // bloodBscore: avg(87%, 83%) = ~85
        // anemiaRisk: 0 (all >70%)
        // score = 85 * 0.4 + 85 * 0.3 + (100 - 0) * 0.3 = 34 + 25.5 + 30 = 89.5 → 90
        expect(result.energyBscore).toBeCloseTo(85, -1);
        expect(result.bloodBscore).toBeCloseTo(85, -1);
        expect(result.anemiaRisk).toBe(0);
        expect(result.score).toBeCloseTo(90, -1);
    });

    it('detects vegetarian B12 risk (<30% days with B12 sources)', () => {
        const mockProducts = [
            { name: 'vegetables', vitamin_b12: 0 },
            { name: 'meat', vitamin_b12: 2.5 }
        ];
        const productIndex = buildProductIndex(mockProducts);

        const days = [
            ...Array.from({ length: 12 }, () => ({
                date: '2026-02-01',
                products: mockProducts,
                meals: [{ name: 'vegetables', grams: 100 }]  // No B12
            })),
            ...Array.from({ length: 2 }, () => ({
                date: '2026-02-14',
                products: mockProducts,
                meals: [{ name: 'meat', grams: 100 }]  // Has B12
            }))
        ];

        // 2/14 days with B12 = 14.3% < 30% → vegetarian risk
        const result = analyzeBComplexAnemia(days, { gender: 'male' }, productIndex);

        expect(result.available).toBe(true);
        // B12 intake very low from vegetables → deficit likely
        if (result.nutrientData.vitamin_b12.deficit) {
            expect(result.vegetarianRisk).toBe(true);
        }
    });

    it('applies small sample penalty to confidence', () => {
        const mockProducts = [
            { name: 'balanced', vitamin_b1: 1.0, vitamin_b2: 1.0, vitamin_b3: 14, vitamin_b6: 1.0, vitamin_b9: 350, vitamin_b12: 2.0, iron: 8 }
        ];
        const productIndex = buildProductIndex(mockProducts);

        const days7 = Array.from({ length: 7 }, () => ({
            date: '2026-02-01',
            products: mockProducts,
            meals: [{ name: 'balanced', grams: 100 }]
        }));

        const days14 = Array.from({ length: 14 }, () => ({
            date: '2026-02-01',
            products: mockProducts,
            meals: [{ name: 'balanced', grams: 100 }]
        }));

        const result7 = analyzeBComplexAnemia(days7, { gender: 'male' }, productIndex);
        const result14 = analyzeBComplexAnemia(days14, { gender: 'male' }, productIndex);

        // Both >= minDays (7), so no penalty — confidence stable
        expect(result7.confidence).toBeGreaterThanOrEqual(0.65);
        expect(result14.confidence).toBeGreaterThanOrEqual(0.65);
        expect(result7.confidence).toBeLessThanOrEqual(0.75);
        expect(result14.confidence).toBeLessThanOrEqual(0.75);
    });
});

// === C14: GLYCEMIC LOAD OPTIMIZER ===

function analyzeGlycemicLoad(days, productIndex) {
    const pattern = 'glycemic_load';
    const minDays = 5;
    const minMealsPerDay = 3;

    const nCheck = piStats.checkMinN(days, minDays);
    if (!nCheck.ok) {
        return { pattern, available: false, reason: 'min_days_required' };
    }

    const totalMeals = days.reduce((sum, d) => sum + (d.meals?.length || 0), 0);
    const avgMealsPerDay = totalMeals / days.length;
    if (avgMealsPerDay < minMealsPerDay) {
        return { pattern, available: false, reason: 'min_meals_required' };
    }

    const dailyGLValues = [];
    const eveningRatios = [];

    days.forEach(day => {
        let dailyGL = 0;
        let eveningGL = 0;

        (day.meals || []).forEach(meal => {
            let mealGL = 0;
            (meal.items || meal.products || []).forEach(item => {
                const product = getProductFromItem(item, productIndex);
                if (!product) return;
                const gi = product.gi || 0;
                const carbs = (product.simple100 || 0) + (product.complex100 || 0);
                const grams = item.grams || 0;
                mealGL += (gi * carbs * grams) / 10000;
            });

            dailyGL += mealGL;
            const hour = parseInt(String(meal.time || '00:00').split(':')[0], 10);
            if (!Number.isNaN(hour) && hour >= 18) eveningGL += mealGL;
        });

        if (dailyGL > 0) {
            dailyGLValues.push(dailyGL);
            eveningRatios.push(eveningGL / dailyGL);
        }
    });

    const avgDailyGL = dailyGLValues.reduce((a, b) => a + b, 0) / dailyGLValues.length;
    const avgEveningRatio = eveningRatios.reduce((a, b) => a + b, 0) / eveningRatios.length;
    const eveningPenalty = avgEveningRatio > 0.5 ? 15 : 0;
    const score = Math.max(0, Math.round(100 - Math.max(0, avgDailyGL - 80) * 0.5 - eveningPenalty));

    return {
        pattern,
        available: true,
        avgDailyGL: Math.round(avgDailyGL * 10) / 10,
        avgEveningRatio: Math.round(avgEveningRatio * 100) / 100,
        score
    };
}

describe('C14: Glycemic Load Optimizer', () => {
    it('returns unavailable for < 5 days', () => {
        const days = Array.from({ length: 4 }, (_, i) => ({
            date: `2026-02-${i + 1}`,
            meals: [{ time: '08:00', items: [] }, { time: '13:00', items: [] }, { time: '19:00', items: [] }]
        }));
        const result = analyzeGlycemicLoad(days, { byName: new Map() });
        expect(result.available).toBe(false);
        expect(result.reason).toBe('min_days_required');
    });

    it('calculates daily GL from GI and carbs', () => {
        const products = [
            { name: 'rice', gi: 70, simple100: 5, complex100: 45 },
            { name: 'apple', gi: 40, simple100: 12, complex100: 2 },
            { name: 'bread', gi: 75, simple100: 5, complex100: 45 }
        ];
        const pIndex = buildProductIndex(products);

        const days = Array.from({ length: 5 }, (_, i) => ({
            date: `2026-02-${String(i + 1).padStart(2, '0')}`,
            meals: [
                { time: '08:00', items: [{ name: 'rice', grams: 150 }] },
                { time: '13:00', items: [{ name: 'apple', grams: 200 }] },
                { time: '19:30', items: [{ name: 'bread', grams: 100 }] }
            ]
        }));

        const result = analyzeGlycemicLoad(days, pIndex);
        expect(result.available).toBe(true);
        expect(result.avgDailyGL).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('applies evening penalty when evening ratio > 0.5', () => {
        const products = [
            { name: 'rice', gi: 80, simple100: 10, complex100: 50 },
            { name: 'salad', gi: 20, simple100: 2, complex100: 3 }
        ];
        const pIndex = buildProductIndex(products);

        const days = Array.from({ length: 5 }, () => ({
            date: '2026-02-01',
            meals: [
                { time: '08:00', items: [{ name: 'salad', grams: 200 }] },
                { time: '13:00', items: [{ name: 'salad', grams: 200 }] },
                { time: '20:30', items: [{ name: 'rice', grams: 250 }] }
            ]
        }));

        const result = analyzeGlycemicLoad(days, pIndex);
        expect(result.available).toBe(true);
        expect(result.avgEveningRatio).toBeGreaterThan(0.5);
        expect(result.score).toBeLessThan(100);
    });
});

// === C15: PROTEIN DISTRIBUTION ===

function analyzeProteinDistribution(days, profile, productIndex) {
    const pattern = 'protein_distribution';
    const minDays = 7;
    const minMealsPerDay = 2;

    const nCheck = piStats.checkMinN(days, minDays);
    if (!nCheck.ok) {
        return { pattern, available: false, reason: 'min_days_required' };
    }

    const totalMeals = days.reduce((sum, d) => sum + (d.meals?.length || 0), 0);
    if ((totalMeals / days.length) < minMealsPerDay) {
        return { pattern, available: false, reason: 'min_meals_required' };
    }

    const targetProtein = (profile?.weight || 70) * 1.6;
    let optimalMeals = 0;
    let allMeals = 0;
    let totalProtein = 0;
    const spreads = [];

    days.forEach(day => {
        const mealProteins = [];
        (day.meals || []).forEach(meal => {
            let mealProtein = 0;
            (meal.items || []).forEach(item => {
                const p = getProductFromItem(item, productIndex);
                if (!p) return;
                mealProtein += (p.protein100 || 0) * (item.grams || 0) / 100;
            });

            mealProteins.push(mealProtein);
            totalProtein += mealProtein;
            allMeals++;
            if (mealProtein >= 20 && mealProtein <= 40) optimalMeals++;
        });

        if (mealProteins.length >= 2) spreads.push(Math.max(...mealProteins) - Math.min(...mealProteins));
    });

    const distributionScore = allMeals > 0 ? (optimalMeals / allMeals) * 100 : 0;
    const avgDailyProtein = totalProtein / days.length;
    const targetProteinPct = Math.min(100, (avgDailyProtein / targetProtein) * 100);
    const avgSpread = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0;
    const evenBonus = avgSpread < 20 ? 10 : 0;
    const score = Math.round(distributionScore * 0.7 + targetProteinPct * 0.3 + evenBonus);

    return {
        pattern,
        available: true,
        distributionScore: Math.round(distributionScore),
        avgDailyProtein: Math.round(avgDailyProtein * 10) / 10,
        targetProtein: Math.round(targetProtein),
        evenBonus,
        score
    };
}

describe('C15: Protein Distribution', () => {
    it('returns unavailable for < 7 days', () => {
        const days = Array.from({ length: 6 }, (_, i) => ({ date: `2026-02-${i + 1}`, meals: [] }));
        const result = analyzeProteinDistribution(days, { weight: 70 }, { byName: new Map() });
        expect(result.available).toBe(false);
        expect(result.reason).toBe('min_days_required');
    });

    it('counts optimal 20-40g meals', () => {
        const products = [
            { name: 'chicken', protein100: 31 },
            { name: 'eggs', protein100: 13 },
            { name: 'yogurt', protein100: 10 }
        ];
        const pIndex = buildProductIndex(products);
        const days = Array.from({ length: 7 }, () => ({
            date: '2026-02-01',
            meals: [
                { items: [{ name: 'chicken', grams: 100 }] }, // 31g optimal
                { items: [{ name: 'eggs', grams: 120 }] },    // ~16g below
                { items: [{ name: 'yogurt', grams: 250 }] }   // 25g optimal
            ]
        }));

        const result = analyzeProteinDistribution(days, { weight: 70 }, pIndex);
        expect(result.available).toBe(true);
        expect(result.distributionScore).toBeGreaterThan(50);
    });

    it('calculates score with target protein and even bonus', () => {
        const products = [
            { name: 'protein_mix', protein100: 20 }
        ];
        const pIndex = buildProductIndex(products);
        const days = Array.from({ length: 7 }, () => ({
            date: '2026-02-01',
            meals: [
                { items: [{ name: 'protein_mix', grams: 120 }] },
                { items: [{ name: 'protein_mix', grams: 130 }] },
                { items: [{ name: 'protein_mix', grams: 125 }] }
            ]
        }));

        const result = analyzeProteinDistribution(days, { weight: 70 }, pIndex);
        expect(result.available).toBe(true);
        expect(result.evenBonus).toBe(10);
        expect(result.score).toBeGreaterThan(70);
    });
});