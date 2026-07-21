import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = globalThis.HEYS;
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalWindowHEYS = globalThis.window?.HEYS;
const originalWindowReact = globalThis.window?.React;
const originalWindowReactDOM = globalThis.window?.ReactDOM;

function loadMealModule() {
    globalThis.React = React;
    globalThis.ReactDOM = {};
    globalThis.HEYS = {
        analytics: { trackError: vi.fn() },
        dayComponents: {},
        dayUtils: {
            formatMealTime: (time) => time,
            timeToMinutes: (time) => {
                const [hours, minutes] = String(time || '').split(':').map(Number);
                return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
            },
            MEAL_TYPES: {
                lunch: { name: 'Обед' },
            },
        },
        models: {
            mealTotals: () => ({ kcal: 250 }),
        },
    };
    globalThis.window.HEYS = globalThis.HEYS;
    globalThis.window.React = React;
    globalThis.window.ReactDOM = globalThis.ReactDOM;

    const source = fs.readFileSync(path.resolve(__dirname, '../day/_meals.js'), 'utf8');
    eval(source);
    return globalThis.HEYS;
}

describe('meal card collapse', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 6, 20, 12, 10, 0));
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        globalThis.HEYS = originalHEYS;
        globalThis.React = originalReact;
        globalThis.ReactDOM = originalReactDOM;
        globalThis.window.HEYS = originalWindowHEYS;
        globalThis.window.React = originalWindowReact;
        globalThis.window.ReactDOM = originalWindowReactDOM;
    });

    it('collapses the whole current meal and auto-collapses it after the active window', async () => {
        const HEYS = loadMealModule();
        const meal = {
            id: 'meal-current',
            time: '12:00',
            mealType: 'lunch',
            items: [{ id: 'item-1', name: 'Продукт', grams: 100 }],
        };
        const day = { date: '2026-07-20', meals: [meal], trainings: [] };
        let expandState;

        const stableParams = {
            day,
            safeMeals: day.meals,
            products: [],
            pIndex: {},
            date: day.date,
            setDay: vi.fn(),
            isMobile: true,
            changeMealType: vi.fn(),
            updateMealTime: vi.fn(),
            changeMealMood: vi.fn(),
            changeMealWellbeing: vi.fn(),
            changeMealStress: vi.fn(),
            removeMeal: vi.fn(),
            openCopyMealModal: vi.fn(),
            openMoveMealModal: vi.fn(),
            saveAsPreset: vi.fn(),
            repeatYesterdayMeal: vi.fn(),
            openEditGramsModal: vi.fn(),
            openTimeEditor: vi.fn(),
            openMoodEditor: vi.fn(),
            setGrams: vi.fn(),
            removeItem: vi.fn(),
            moveItem: vi.fn(),
            copyItem: vi.fn(),
            isNewItem: vi.fn(() => false),
            optimum: 2000,
            setMealQualityPopup: vi.fn(),
            addProductToMeal: vi.fn(),
            prof: {},
            insulinWaveData: null,
        };

        function Harness({ currentMinute }) {
            expandState = HEYS.dayMealExpandState.useMealExpandState({ React, date: day.date });
            const display = HEYS.dayMealsDisplay.useMealsDisplay({
                ...stableParams,
                ...expandState,
                currentMinute,
            });
            return React.createElement('div', null, display.mealsUI);
        }

        const initialMinute = Math.floor(Date.now() / 60000);
        const view = render(React.createElement(Harness, { currentMinute: initialMinute }));
        expect(view.container.querySelector('.meal-collapsed-plaque')).toBeNull();

        await act(async () => {
            expandState.toggleMealExpand(0, day.meals, true);
            vi.runAllTimers();
        });

        expect(view.container.querySelector('.meal-with-number--collapsed')).not.toBeNull();
        expect(view.container.querySelector('.meal-collapsed-plaque')).not.toBeNull();

        await act(async () => {
            fireEvent.click(view.container.querySelector('.meal-collapsed-plaque'));
            vi.runAllTimers();
        });
        expect(view.container.querySelector('.meal-collapsed-plaque')).toBeNull();

        vi.setSystemTime(new Date(2026, 6, 20, 12, 21, 0));
        view.rerender(React.createElement(Harness, { currentMinute: initialMinute + 11 }));

        expect(view.container.querySelector('.meal-with-number--collapsed')).not.toBeNull();
        expect(view.container.querySelector('.meal-collapsed-plaque')).not.toBeNull();
    });
});
