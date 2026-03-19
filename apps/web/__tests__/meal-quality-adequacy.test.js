import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

function round1(value) {
    return Math.round((+value || 0) * 10) / 10;
}

function scale(value, grams) {
    return round1(((+value || 0) * (+grams || 0)) / 100);
}

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

function mealTotals(meal, idx) {
    const totals = { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };

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

function loadMealScoring() {
    const filePath = path.resolve(process.cwd(), 'apps/web/day/_meal_quality.js');
    const source = fs.readFileSync(filePath, 'utf8');

    const sandboxWindow = {
        HEYS: {
            models: { mealTotals },
            dayUtils: {
                getProductFromItem,
                parseTime: (value) => {
                    if (!value || !String(value).includes(':')) return null;
                    const [hh, mm] = String(value).split(':').map(Number);
                    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
                    return { hh, mm };
                },
            },
        },
        React: {},
        ReactDOM: {},
    };

    const sandbox = {
        window: sandboxWindow,
        global: sandboxWindow,
        document: { body: {} },
        console,
    };

    vm.runInNewContext(source, sandbox, { filename: 'day/_meal_quality.js' });
    return sandboxWindow.HEYS.mealScoring;
}

describe('meal quality adequacy for main meals', () => {
    const products = [
        {
            id: 'coffee-milk',
            name: 'Кофе растворимый с молоком',
            kcal100: 51,
            protein100: 3,
            carbs100: 5,
            simple100: 5,
            complex100: 0,
            fat100: 3,
            badFat100: 1,
            goodFat100: 2,
            trans100: 0,
            fiber100: 0,
            gi: 30,
            harm: 0.4,
        },
        {
            id: 'eggs',
            name: 'Омлет из яиц',
            kcal100: 155,
            protein100: 13,
            carbs100: 1,
            simple100: 1,
            complex100: 0,
            fat100: 11,
            badFat100: 3,
            goodFat100: 8,
            trans100: 0,
            fiber100: 0,
            gi: 10,
            harm: 0.8,
        },
        {
            id: 'oats',
            name: 'Овсянка',
            kcal100: 88,
            protein100: 3,
            carbs100: 15,
            simple100: 1,
            complex100: 14,
            fat100: 1.5,
            badFat100: 0.3,
            goodFat100: 1.2,
            trans100: 0,
            fiber100: 2.5,
            gi: 45,
            harm: 0.3,
        },
        {
            id: 'berries',
            name: 'Ягоды',
            kcal100: 45,
            protein100: 1,
            carbs100: 8,
            simple100: 6,
            complex100: 2,
            fat100: 0.5,
            badFat100: 0,
            goodFat100: 0.5,
            trans100: 0,
            fiber100: 4,
            gi: 25,
            harm: 0.2,
        },
    ];

    const pIndex = buildProductIndex(products);
    const mealScoring = loadMealScoring();

    it('reduces score for coffee-only breakfast and marks it as weak breakfast', () => {
        const breakfast = {
            time: '08:30',
            items: [{ name: 'Кофе растворимый с молоком', grams: 100 }],
        };

        const quality = mealScoring.getMealQualityScore(breakfast, 'breakfast', 2000, pIndex, null);

        expect(quality.score).toBeLessThanOrEqual(72);
        expect(quality.roleAdequacy.penalty).toBeGreaterThan(0);
        expect(quality.roleAdequacy.ok).toBe(false);
        expect(quality.roleAdequacy.shortLabel).toContain('завтрак');
        expect(quality.beverageLikeRatio).toBeGreaterThanOrEqual(90);
        expect(quality.mealRoleStatus.kind).toBe('drink');
        expect(quality.mealRoleStatus.shortLabel).toBe('напиток');
        expect(quality.mealRoleStatus.coachLabel).toBe('Следующий шаг');
        expect(quality.mealRoleStatus.coachTitle).toContain('Добавь');
        expect(quality.mealRoleStatus.coachText).toMatch(/добавь|белка|клетчатки|сытость/i);
    });

    it('keeps a real breakfast noticeably higher than coffee-only breakfast', () => {
        const coffeeBreakfast = {
            time: '08:30',
            items: [{ name: 'Кофе растворимый с молоком', grams: 100 }],
        };

        const properBreakfast = {
            time: '08:30',
            items: [
                { name: 'Омлет из яиц', grams: 180 },
                { name: 'Овсянка', grams: 200 },
                { name: 'Ягоды', grams: 100 },
            ],
        };

        const weakQuality = mealScoring.getMealQualityScore(coffeeBreakfast, 'breakfast', 2000, pIndex, null);
        const properQuality = mealScoring.getMealQualityScore(properBreakfast, 'breakfast', 2000, pIndex, null);

        expect(properQuality.score).toBeGreaterThan(weakQuality.score + 12);
        expect(properQuality.roleAdequacy.penalty).toBe(0);
        expect(properQuality.roleAdequacy.ok).toBe(true);
        expect(properQuality.mealRoleStatus.kind).toBe('full');
        expect(properQuality.mealRoleStatus.shortLabel).toBe('полноценный приём');
        expect(properQuality.mealRoleStatus.coachLabel).toBe('Сильная база');
        expect(properQuality.mealRoleStatus.coachTitle).toBe('Так держать');
        expect(properQuality.mealRoleStatus.coachText).toContain('полноценного');
    });
});
