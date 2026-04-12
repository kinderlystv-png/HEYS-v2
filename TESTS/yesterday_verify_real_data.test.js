import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

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

const clearStorageSafe = (storage) => {
    if (!storage) return;
    if (typeof storage.clear === 'function') {
        storage.clear();
        return;
    }
    if (typeof storage.removeItem !== 'function' || typeof storage.key !== 'function') {
        return;
    }
    const keys = [];
    const length = Number(storage.length) || 0;
    for (let i = 0; i < length; i += 1) {
        const key = storage.key(i);
        if (key) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
};

const createStorageMock = () => {
    const store = {};
    return {
        get length() {
            return Object.keys(store).length;
        },
        key: (index) => Object.keys(store)[index] ?? null,
        getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
        setItem: (key, value) => {
            store[key] = String(value);
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            Object.keys(store).forEach((key) => delete store[key]);
        },
    };
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

function bootstrapHeysForTest() {
    ensureWindow();
    yesterdayStepConfig = undefined;
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
}

function evalScript(relativePath) {
    const filePath = path.resolve(__dirname, relativePath);
    const source = fs.readFileSync(filePath, 'utf8');
    // Evaluate legacy IIFE scripts in current test runtime to avoid ESM cache coupling.
    eval(source);
}

beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
        value: createStorageMock(),
        writable: true,
        configurable: true
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
        value: createStorageMock(),
        writable: true,
        configurable: true
    });
    bootstrapHeysForTest();
    clearStorageSafe(localStorage);
    clearStorageSafe(sessionStorage);

    // Изоляция от мутаций глобального HEYS из других тестов в full-suite прогоне
    window.HEYS.utils = {
        lsGet: (key, fallback) => getLs(key, fallback),
        lsSet: (key, value) => setLs(key, value),
        getCurrentClientId: () => ''
    };
    window.HEYS.store = {
        get: (key, fallback) => getLs(key, fallback),
        set: (key, value) => setLs(key, value)
    };
    window.HEYS.dayUtils = {
        todayISO: () => '2026-03-11'
    };
    window.HEYS.ProfileSteps = {
        isProfileIncomplete: () => false
    };

    setLs('heys_profile', {
        weight: 70,
        height: 170,
        age: 30,
        gender: 'Мужской',
        activityLevel: 'moderate',
        deficitPctTarget: 0
    });
    setLs('heys_norms', {});

    evalScript('../apps/web/heys_yesterday_verify_v1.js');
    evalScript('../apps/web/heys_day_insights_data_v1.js');
});

afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
        value: originalSessionStorage,
        writable: true,
        configurable: true
    });
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
        expect(storedDay.yesterdayVerifyAction).toBe('confirm_real_data');
        expect(typeof storedDay.yesterdayVerifyAt).toBe('number');
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

    it('shows recent empty days even when no meaningful filled anchor exists yet', () => {
        setLs('heys_dayv2_2026-03-09', {
            date: '2026-03-09',
            meals: []
        });

        const pending = window.HEYS.YesterdayVerify.getPendingPastDays();

        expect(pending.totalPendingDays).toBe(2);
        expect(pending.missingDays.map((day) => day.date)).toEqual(['2026-03-09', '2026-03-10']);
        expect(window.HEYS.YesterdayVerify.shouldShow()).toBe(true);
    });

    it('treats default false flags as unverified and still asks about low-ratio days', () => {
        setLs('heys_dayv2_2026-03-09', {
            date: '2026-03-09',
            meals: [makeMeal({ kcal100: 1600 })]
        });

        setLs('heys_dayv2_2026-03-10', {
            date: '2026-03-10',
            meals: [makeMeal({ kcal100: 160 })],
            isFastingDay: false,
            isIncomplete: false,
            savedEatenKcal: 160,
            savedDisplayOptimum: 2000
        });

        const pending = window.HEYS.YesterdayVerify.getPendingPastDays();
        expect(pending.totalPendingDays).toBe(1);
        expect(pending.missingDays[0]).toMatchObject({
            date: '2026-03-10',
            hasBeenVerified: false
        });
        expect(window.HEYS.YesterdayVerify.shouldShow()).toBe(true);
    });

    it('marks clear-day decisions explicitly so they do not reappear as pending', () => {
        setLs('heys_dayv2_2026-03-09', {
            date: '2026-03-09',
            meals: [makeMeal({ kcal100: 1600 })]
        });

        setLs('heys_dayv2_2026-03-10', {
            date: '2026-03-10',
            meals: [makeMeal({ kcal100: 160 })],
            isFastingDay: false,
            isIncomplete: false,
            savedEatenKcal: 160,
            savedDisplayOptimum: 2000
        });

        yesterdayStepConfig.save({
            incompleteAction: 'clear_day',
            pendingDateKeys: ['2026-03-10'],
            quickFillByDate: {}
        });

        const storedDay = getLs('heys_dayv2_2026-03-10');
        expect(storedDay.meals).toEqual([]);
        expect(storedDay.yesterdayVerifyAction).toBe('clear_day');
        expect(typeof storedDay.yesterdayVerifyAt).toBe('number');

        const pendingAfter = window.HEYS.YesterdayVerify.getPendingPastDays();
        expect(pendingAfter.totalPendingDays).toBe(0);
    });

    it('does not show yesterday verify for brand-new users without any past day history', () => {
        const pending = window.HEYS.YesterdayVerify.getPendingPastDays();

        expect(pending.totalPendingDays).toBe(0);
        expect(pending.missingDays).toEqual([]);
        expect(window.HEYS.YesterdayVerify.shouldShow()).toBe(false);
    });
});
