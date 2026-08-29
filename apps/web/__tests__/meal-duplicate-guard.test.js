import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = globalThis.HEYS;
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalWindowHEYS = globalThis.window?.HEYS;

const SOURCE = fs.readFileSync(path.resolve(__dirname, '../day/_meals.js'), 'utf8');

function loadMealModule({ confirmResult = 'cancel', withConfirmModal = true } = {}) {
    globalThis.React = React;
    globalThis.ReactDOM = {};
    globalThis.HEYS = {
        Paywall: { canWriteSync: vi.fn(() => true), showBlockedToast: vi.fn() },
        ConfirmModal: withConfirmModal
            ? { show: vi.fn(async () => confirmResult), hide: vi.fn() }
            : undefined,
        MealStep: { showAddMeal: vi.fn() },
        dayUtils: {
            haptic: vi.fn(),
            lsGet: vi.fn(() => null),
            lsSet: vi.fn(),
            uid: vi.fn((prefix) => `${prefix}test`),
            timeToMinutes: vi.fn(() => null),
            getProductFromItem: vi.fn(() => null),
        },
        models: {},
    };
    globalThis.window.HEYS = globalThis.HEYS;
    globalThis.window.React = React;
    globalThis.window.ReactDOM = globalThis.ReactDOM;
    // eslint-disable-next-line no-eval
    eval(SOURCE);
    return globalThis.HEYS;
}

const ROLL = { id: 'it_1', product_id: 'p-roll', name: 'Куриный ПП рулет', grams: 160 };
const YOGURT = { id: 'it_2', product_id: 'p-yogurt', name: 'Йогурт греческий', grams: 100 };

function meal(time, items, id = 'm_prev') {
    return { id, name: 'Обед', time, items };
}

describe('meal duplicate guard', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        globalThis.HEYS = originalHEYS;
        globalThis.React = originalReact;
        globalThis.ReactDOM = originalReactDOM;
        globalThis.window.HEYS = originalWindowHEYS;
    });

    it('видит повтор того же состава рядом по времени', () => {
        const HEYS = loadMealModule();
        const existing = [meal('15:30', [{ ...ROLL }, { ...YOGURT }])];
        const twin = HEYS.mealDuplicateGuard.findDuplicate(existing, {
            id: 'm_new',
            time: '15:32',
            items: [{ ...ROLL, id: 'it_3' }, { ...YOGURT, id: 'it_4' }],
        });
        expect(twin?.id).toBe('m_prev');
    });

    it('за окном в десять минут повтором не считает', () => {
        const HEYS = loadMealModule();
        const existing = [meal('15:30', [{ ...ROLL }])];
        expect(HEYS.mealDuplicateGuard.findDuplicate(existing, {
            id: 'm_new', time: '15:55', items: [{ ...ROLL, id: 'it_3' }],
        })).toBeNull();
    });

    it('другая граммовка — добавка, а не повтор', () => {
        const HEYS = loadMealModule();
        const existing = [meal('15:30', [{ ...ROLL }])];
        expect(HEYS.mealDuplicateGuard.findDuplicate(existing, {
            id: 'm_new', time: '15:30', items: [{ ...ROLL, id: 'it_3', grams: 80 }],
        })).toBeNull();
    });

    it('новая позиция рядом со старой — не повтор', () => {
        const HEYS = loadMealModule();
        const existing = [meal('15:30', [{ ...ROLL }])];
        expect(HEYS.mealDuplicateGuard.findDuplicate(existing, {
            id: 'm_new',
            time: '15:30',
            items: [{ ...ROLL, id: 'it_3' }, { ...YOGURT, id: 'it_4' }],
        })).toBeNull();
    });

    it('приём без времени и пустой приём в сравнение не идут', () => {
        const HEYS = loadMealModule();
        expect(HEYS.mealDuplicateGuard.findDuplicate([meal('', [{ ...ROLL }])], {
            id: 'm_new', time: '15:30', items: [{ ...ROLL, id: 'it_3' }],
        })).toBeNull();
        expect(HEYS.mealDuplicateGuard.findDuplicate([meal('15:30', [])], {
            id: 'm_new', time: '15:30', items: [{ ...ROLL, id: 'it_3' }],
        })).toBeNull();
    });

    it('«Не записывать» отменяет запись, «Всё равно записать» пропускает', async () => {
        const cancelHEYS = loadMealModule({ confirmResult: 'cancel' });
        const existing = [meal('15:30', [{ ...ROLL }])];
        const twin = { id: 'm_new', time: '15:30', items: [{ ...ROLL, id: 'it_3' }] };
        await expect(cancelHEYS.mealDuplicateGuard.allowWrite(existing, twin)).resolves.toBe(false);
        expect(cancelHEYS.ConfirmModal.show).toHaveBeenCalledTimes(1);

        const okHEYS = loadMealModule({ confirmResult: 'confirm' });
        await expect(okHEYS.mealDuplicateGuard.allowWrite(existing, twin)).resolves.toBe(true);
    });

    it('без повтора ничего не спрашивает', async () => {
        const HEYS = loadMealModule();
        await expect(HEYS.mealDuplicateGuard.allowWrite([meal('15:30', [{ ...ROLL }])], {
            id: 'm_new', time: '15:30', items: [{ ...YOGURT, id: 'it_4' }],
        })).resolves.toBe(true);
        expect(HEYS.ConfirmModal.show).not.toHaveBeenCalled();
    });

    it('без модалки подтверждения запись не теряется', async () => {
        const HEYS = loadMealModule({ withConfirmModal: false });
        await expect(HEYS.mealDuplicateGuard.allowWrite([meal('15:30', [{ ...ROLL }])], {
            id: 'm_new', time: '15:30', items: [{ ...ROLL, id: 'it_3' }],
        })).resolves.toBe(true);
    });

    it('повтор и копирование спрашивают до записи', () => {
        // Гейт должен стоять в обоих путях, где приём приходит уже с составом.
        const guarded = SOURCE.match(/await allowMealWrite\(/g) || [];
        expect(guarded.length).toBe(2);
    });
});
