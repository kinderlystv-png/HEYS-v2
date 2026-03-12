import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ensureWindow = () => {
    if (!globalThis.window) {
        globalThis.window = globalThis;
    }
    if (!window.HEYS) {
        window.HEYS = {};
    }
};

const setLs = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
};

const getLs = (key, fallback = null) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
};

const makeMeal = ({ kcal100, grams = 100, protein100 = 20, carbs100 = 20, fat100 = 10 }) => ({
    id: `meal_${kcal100}_${grams}`,
    name: 'Meal',
    items: [{
        id: `item_${kcal100}_${grams}`,
        name: 'Item',
        grams,
        kcal100,
        protein100,
        carbs100,
        fat100,
        simple100: 5,
        complex100: 15,
    }]
});

let yesterdayStepConfig;

beforeAll(async () => {
    ensureWindow();

    window.React = window.React || {};
    window.HEYS = {
        ...(window.HEYS || {}),
        StepModal: {
            registerStep: (id, config) => {
                if (id === 'yesterdayVerify') {
                    yesterdayStepConfig = config;
                }
            }
        },
        utils: {
            lsGet: (key, fallback) => getLs(key, fallback),
            lsSet: (key, value) => setLs(key, value),
            getCurrentClientId: () => ''
        },
        store: {
            get: (key, fallback) => getLs(key, fallback),
            set: (key, value) => setLs(key, value)
        },
        dayUtils: {
            todayISO: () => '2026-03-11'
        },
        ProfileSteps: {
            isProfileIncomplete: () => false
        }
    };

    await import('../apps/web/heys_yesterday_verify_v1.js');
    await import('../apps/web/heys_day_insights_data_v1.js');
});

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    setLs('heys_profile', {
        weight: 70,
        height: 170,
        age: 30,
        gender: 'Мужской',
        activityLevel: 'moderate',
        deficitPctTarget: 0
    });
    setLs('heys_norms', {});
});

describe('Yesterday verify real-data flow', () => {
    it('marks a <50% day as real data and removes it from pending check-in days', () => {
        setLs('heys_dayv2_2026-03-09', {
            date: '2026-03-09',
            meals: [makeMeal({ kcal100: 1600 })]
        });

        setLs('heys_dayv2_2026-03-10', {
            date: '2026-03-10',
            meals: [makeMeal({ kcal100: 400 })],
            estimatedDayFill: { version: 1 },
            savedEatenKcal: 400,
            savedDisplayOptimum: 2000
        });

        const pendingBefore = window.HEYS.YesterdayVerify.getPendingPastDays();
        expect(pendingBefore.totalPendingDays).toBe(1);
        expect(pendingBefore.missingDays[0]).toMatchObject({
            date: '2026-03-10'
        });
        expect(pendingBefore.missingDays[0].ratio).toBeLessThan(0.5);

        yesterdayStepConfig.save({
            incompleteAction: 'confirm_real_data',
            pendingDateKeys: ['2026-03-10'],
            quickFillByDate: {}
        });

        const storedDay = getLs('heys_dayv2_2026-03-10');
        expect(storedDay).toMatchObject({
            date: '2026-03-10',
            isFastingDay: true,
            isIncomplete: false
        });
        expect(storedDay.meals).toHaveLength(1);
        expect(storedDay.estimatedDayFill).toBeUndefined();
        expect(storedDay.savedEatenKcal).toBeUndefined();
        expect(storedDay.savedDisplayOptimum).toBeUndefined();
        expect(typeof storedDay.updatedAt).toBe('number');

        const pendingAfter = window.HEYS.YesterdayVerify.getPendingPastDays();
        expect(pendingAfter.totalPendingDays).toBe(0);
    });

    it('keeps a fasting-confirmed low-ratio day eligible for downstream analytics', () => {
        const shouldInclude = window.HEYS.weeklyCalc.shouldIncludeDay({
            day: {
                date: '2026-03-10',
                ratio: 0.22,
                kcal: 400,
                hasMeals: true,
                isFuture: false,
                isToday: false,
                isFastingDay: true,
                isIncomplete: false
            },
            nowDateStr: '2026-03-11',
            requireMeals: true,
            requireKcal: true,
            requireRatio: true
        });

        expect(shouldInclude).toBe(true);
    });
});
