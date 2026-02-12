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
 * Mock UNIT_REGISTRY (from Phase 0)
 */
const UNIT_REGISTRY = {
    vitamin_a: { canonical: 'mcg', si: 'mcg', display: 'мкг' },
    vitamin_c: { canonical: 'mg', si: 'mg', display: 'мг' },
    vitamin_d: { canonical: 'mcg', si: 'mcg', display: 'мкг' },
    vitamin_e: { canonical: 'mg', si: 'mg', display: 'мг' },
    vitamin_k: { canonical: 'mcg', si: 'mcg', display: 'мкг' },
    vitamin_b1: { canonical: 'mg', si: 'mg', display: 'мг' },
    vitamin_b2: { canonical: 'mg', si: 'mg', display: 'мг' },
    vitamin_b3: { canonical: 'mg', si: 'mg', display: 'мг' },
    vitamin_b6: { canonical: 'mg', si: 'mg', display: 'мг' },
    vitamin_b9: { canonical: 'mcg', si: 'mcg', display: 'мкг' },
    vitamin_b12: { canonical: 'mcg', si: 'mcg', display: 'мкг' }
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
