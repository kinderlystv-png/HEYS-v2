import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

function buildProductIndex(products) {
    const byId = new Map();
    const byName = new Map();

    for (const product of products) {
        if (!product) continue;
        if (product.id != null) byId.set(String(product.id).toLowerCase(), product);
        const name = String(product.name || '').trim().toLowerCase();
        if (name) byName.set(name, product);
    }

    return { byId, byName };
}

function getProductFromItem(item, idx) {
    if (!item || !idx) return null;

    const name = String(item.name || '').trim().toLowerCase();
    if (name && idx.byName?.has(name)) return idx.byName.get(name);

    if (item.product_id != null && idx.byId?.has(String(item.product_id).toLowerCase())) {
        return idx.byId.get(String(item.product_id).toLowerCase());
    }

    if (item.productId != null && idx.byId?.has(String(item.productId).toLowerCase())) {
        return idx.byId.get(String(item.productId).toLowerCase());
    }

    return item.kcal100 != null || item.protein100 != null ? item : null;
}

function round1(value) {
    return Math.round((+value || 0) * 10) / 10;
}

function scale(value, grams) {
    return round1(((+value || 0) * (+grams || 0)) / 100);
}

function mealTotals(meal, idx) {
    const totals = {
        kcal: 0,
        carbs: 0,
        simple: 0,
        complex: 0,
        prot: 0,
        fat: 0,
        bad: 0,
        good: 0,
        trans: 0,
        fiber: 0,
    };

    for (const item of meal.items || []) {
        const product = getProductFromItem(item, idx) || {};
        const grams = +item.grams || 0;
        totals.kcal += scale(product.kcal100, grams);
        totals.carbs += scale(product.carbs100, grams);
        totals.simple += scale(product.simple100, grams);
        totals.complex += scale(product.complex100, grams);
        totals.prot += scale(product.protein100, grams);
        totals.fat += scale(product.fat100, grams);
        totals.bad += scale(product.badFat100, grams);
        totals.good += scale(product.goodFat100, grams);
        totals.trans += scale(product.trans100, grams);
        totals.fiber += scale(product.fiber100, grams);
    }

    Object.keys(totals).forEach((key) => {
        totals[key] = round1(totals[key]);
    });

    return totals;
}

function loadMealOptimizer() {
    const filePath = path.resolve(process.cwd(), 'apps/web/heys_meal_optimizer_v1.js');
    const source = fs.readFileSync(filePath, 'utf8');

    const sandboxWindow = {
        HEYS: {
            utils: {},
            models: {
                getProductFromItem,
                mealTotals,
            },
        },
        addEventListener: () => { },
        removeEventListener: () => { },
    };

    const sandbox = {
        window: sandboxWindow,
        global: sandboxWindow,
        console,
        localStorage: {
            getItem: () => null,
            setItem: () => { },
            removeItem: () => { },
        },
        setTimeout,
        clearTimeout,
    };

    vm.runInNewContext(source, sandbox, { filename: 'heys_meal_optimizer_v1.js' });
    return sandboxWindow.HEYS.MealOptimizer;
}

describe('MealOptimizer protein distribution advice', () => {
    const products = [
        {
            id: 'coffee-milk',
            name: 'Кофе растворимый с молоком',
            kcal100: 34,
            protein100: 2,
            carbs100: 3,
            fat100: 1.5,
            simple100: 3,
            complex100: 0,
            badFat100: 0.8,
            goodFat100: 0.7,
            trans100: 0,
            fiber100: 0,
        },
        {
            id: 'salmon',
            name: 'Лосось слабосолёный',
            kcal100: 200,
            protein100: 22,
            carbs100: 0,
            fat100: 12,
            simple100: 0,
            complex100: 0,
            badFat100: 2,
            goodFat100: 10,
            trans100: 0,
            fiber100: 0,
        },
        {
            id: 'yogurt',
            name: 'Йогурт греческий',
            kcal100: 70,
            protein100: 10,
            carbs100: 4,
            fat100: 2,
            simple100: 4,
            complex100: 0,
            badFat100: 1,
            goodFat100: 1,
            trans100: 0,
            fiber100: 0,
        },
    ];

    const pIndex = buildProductIndex(products);
    const MealOptimizer = loadMealOptimizer();

    it('does not show protein distribution advice for a single low-protein coffee meal', () => {
        const breakfast = {
            id: 'meal-breakfast',
            time: '08:30',
            items: [{ name: 'Кофе растворимый с молоком', grams: 150 }],
        };

        const recommendations = MealOptimizer.getMealOptimization({
            meal: breakfast,
            mealTotals: mealTotals(breakfast, pIndex),
            dayData: { meals: [breakfast] },
            profile: {},
            products,
            pIndex,
            avgGI: 35,
        });

        expect(recommendations.some((rec) => rec.id === 'protein_distribution')).toBe(false);
    });

    it('shows protein distribution advice when current meal is overloaded and the day is uneven', () => {
        const breakfast = {
            id: 'meal-breakfast',
            time: '08:30',
            items: [{ name: 'Кофе растворимый с молоком', grams: 150 }],
        };
        const lunch = {
            id: 'meal-lunch',
            time: '13:00',
            items: [{ name: 'Лосось слабосолёный', grams: 210 }],
        };

        const recommendations = MealOptimizer.getMealOptimization({
            meal: lunch,
            mealTotals: mealTotals(lunch, pIndex),
            dayData: { meals: [breakfast, lunch] },
            profile: {},
            products,
            pIndex,
            avgGI: 10,
        });

        const proteinDistribution = recommendations.find((rec) => rec.id === 'protein_distribution');

        expect(proteinDistribution).toBeDefined();
        expect(proteinDistribution.reason).toContain('20-40г');
        expect(proteinDistribution.reason).toContain('разброс');
    });

    it('does not show protein distribution advice when protein is already fairly even across meals', () => {
        const breakfast = {
            id: 'meal-breakfast',
            time: '08:30',
            items: [{ name: 'Йогурт греческий', grams: 250 }],
        };
        const lunch = {
            id: 'meal-lunch',
            time: '13:00',
            items: [{ name: 'Лосось слабосолёный', grams: 190 }],
        };
        const dinner = {
            id: 'meal-dinner',
            time: '19:00',
            items: [{ name: 'Йогурт греческий', grams: 300 }],
        };

        const recommendations = MealOptimizer.getMealOptimization({
            meal: lunch,
            mealTotals: mealTotals(lunch, pIndex),
            dayData: { meals: [breakfast, lunch, dinner] },
            profile: {},
            products,
            pIndex,
            avgGI: 10,
        });

        expect(recommendations.some((rec) => rec.id === 'protein_distribution')).toBe(false);
    });
});
