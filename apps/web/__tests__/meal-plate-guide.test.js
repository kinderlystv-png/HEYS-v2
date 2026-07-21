import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
        Paywall: {
            canWriteSync: vi.fn(() => true),
            showBlockedToast: vi.fn(),
        },
        ConfirmModal: {
            show: vi.fn(),
            hide: vi.fn(),
        },
        MealStep: {
            showAddMeal: vi.fn(),
        },
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

    const source = fs.readFileSync(path.resolve(__dirname, '../day/_meals.js'), 'utf8');
    eval(source);
    return globalThis.HEYS;
}

function renderHandlersHarness(HEYS) {
    const deps = {
        setDay: vi.fn(),
        expandOnlyMeal: vi.fn(),
        date: '2026-07-20',
        products: [],
        day: { date: '2026-07-20', meals: [], trainings: [] },
        prof: {},
        pIndex: {},
        getProductFromItem: vi.fn(() => null),
        isMobile: true,
        openTimePickerForNewMeal: vi.fn(),
        scrollToDiaryHeading: vi.fn(),
        lastLoadedUpdatedAtRef: { current: 0 },
        blockCloudUpdatesUntilRef: { current: 0 },
        newItemIds: new Set(),
        setNewItemIds: vi.fn(),
    };
    let handlers;

    function Harness() {
        handlers = HEYS.dayMealHandlers.createMealHandlers(deps);
        return null;
    }

    render(React.createElement(Harness));
    return { deps, getHandlers: () => handlers };
}

describe('meal plate guide', () => {
    beforeEach(() => {
        vi.useFakeTimers();
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

    it('contains six variants and avoids an immediate repeat', () => {
        const HEYS = loadMealModule();
        const guide = HEYS.mealPlateGuide;

        expect(guide.variants).toHaveLength(6);
        expect(new Set(guide.variants.map((variant) => variant.id)).size).toBe(6);

        const first = guide.chooseVariant(-1, 0.01);
        const next = guide.chooseVariant(first.index, 0.01);
        expect(first.index).toBe(0);
        expect(next.index).toBe(1);
    });

    it('does not start meal creation until the guide primary action', async () => {
        const HEYS = loadMealModule();
        const { deps, getHandlers } = renderHandlersHarness(HEYS);

        await act(async () => {
            getHandlers().addMeal();
        });

        expect(HEYS.ConfirmModal.show).toHaveBeenCalledTimes(1);
        expect(HEYS.MealStep.showAddMeal).not.toHaveBeenCalled();
        expect(deps.setDay).not.toHaveBeenCalled();

        const modalOptions = HEYS.ConfirmModal.show.mock.calls[0][0];
        expect(modalOptions.text.props.variant).toBeTruthy();
        render(modalOptions.text);

        expect(screen.getByText('Это — важно.')).toBeTruthy();
        expect(screen.getByText(/овощи\s+и фрукты/)).toBeTruthy();
        expect(screen.getByText('белок')).toBeTruthy();
        expect(screen.getByText('крупы')).toBeTruthy();
        expect(screen.getByText('Сердце')).toBeTruthy();
        expect(screen.getByText('Сахар крови')).toBeTruthy();
        expect(screen.getByText('Мозг')).toBeTruthy();
        expect(screen.getByText('Кишечник')).toBeTruthy();
        expect(screen.queryByText('По принципам средиземноморского рациона')).toBeNull();
        expect(screen.queryByText('Ориентир, а не строгое правило.')).toBeNull();
        expect(screen.queryByText('Потенциальные эффекты')).toBeNull();
        expect(screen.queryByRole('button', { name: /пример/i })).toBeNull();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Создать приём' }));
        });

        expect(document.querySelector('.meal-plate-guide--slide-left')).toBeTruthy();
        expect(HEYS.ConfirmModal.hide).not.toHaveBeenCalled();

        await act(async () => {
            vi.runAllTimers();
        });

        expect(HEYS.ConfirmModal.hide).toHaveBeenCalledTimes(1);
        expect(HEYS.MealStep.showAddMeal).toHaveBeenCalledTimes(1);
        expect(HEYS.MealStep.showAddMeal.mock.invocationCallOrder[0])
            .toBeLessThan(HEYS.ConfirmModal.hide.mock.invocationCallOrder[0]);
        expect(HEYS.MealStep.showAddMeal.mock.calls[0][0].initialSlideInDirection).toBe('from-right');
        expect(deps.setDay).not.toHaveBeenCalled();
    });

    it('cancels without creating a meal and lets technical entry points bypass the guide', async () => {
        const HEYS = loadMealModule();
        const { deps, getHandlers } = renderHandlersHarness(HEYS);

        await act(async () => {
            getHandlers().addMeal();
        });
        const modalOptions = HEYS.ConfirmModal.show.mock.calls[0][0];

        await act(async () => {
            modalOptions.text.props.onCancel();
            vi.runAllTimers();
        });

        expect(HEYS.ConfirmModal.hide).toHaveBeenCalledTimes(1);
        expect(HEYS.MealStep.showAddMeal).not.toHaveBeenCalled();
        expect(deps.setDay).not.toHaveBeenCalled();

        await act(async () => {
            getHandlers().addMeal({ skipPlateGuide: true });
        });

        expect(HEYS.ConfirmModal.show).toHaveBeenCalledTimes(1);
        expect(HEYS.MealStep.showAddMeal).toHaveBeenCalledTimes(1);
    });
});
