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
const originalWindowImage = globalThis.window?.Image;
const originalRequestIdleCallback = globalThis.window?.requestIdleCallback;
const originalSetSelectedDate = globalThis.window?.__heysSetSelectedDate;
const originalNavigatorConnectionDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'connection');

function getTodayISO() {
    const date = new Date();
    if (date.getHours() < 3) date.setDate(date.getDate() - 1);
    return date.getFullYear()
        + '-' + String(date.getMonth() + 1).padStart(2, '0')
        + '-' + String(date.getDate()).padStart(2, '0');
}

function setNavigatorConnection(connection) {
    Object.defineProperty(globalThis.navigator, 'connection', {
        configurable: true,
        value: connection,
    });
}

function loadMealModule({
    connection = { saveData: true, effectiveType: '4g' },
    ImageCtor = originalWindowImage,
    requestIdleCallback = originalRequestIdleCallback,
} = {}) {
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
    globalThis.window.Image = ImageCtor;
    globalThis.window.requestIdleCallback = requestIdleCallback;
    setNavigatorConnection(connection);

    const source = fs.readFileSync(path.resolve(__dirname, '../day/_meals.js'), 'utf8');
    eval(source);
    return globalThis.HEYS;
}

function renderHandlersHarness(HEYS, { date = getTodayISO() } = {}) {
    const deps = {
        setDay: vi.fn(),
        expandOnlyMeal: vi.fn(),
        date,
        products: [],
        day: { date, meals: [], trainings: [] },
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

function createImageHarness({ deferred = false } = {}) {
    const images = [];
    let resolveDecode;
    const pendingDecode = deferred
        ? new Promise((resolve) => { resolveDecode = resolve; })
        : Promise.resolve();

    class TestImage {
        constructor() {
            this.fetchPriority = '';
            this.decode = vi.fn(() => pendingDecode);
            images.push(this);
        }
    }

    return {
        ImageCtor: TestImage,
        images,
        resolveDecode: () => resolveDecode?.(),
    };
}

describe('meal plate guide', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
        globalThis.HEYS = originalHEYS;
        globalThis.React = originalReact;
        globalThis.ReactDOM = originalReactDOM;
        globalThis.window.HEYS = originalWindowHEYS;
        globalThis.window.React = originalWindowReact;
        globalThis.window.ReactDOM = originalWindowReactDOM;
        globalThis.window.Image = originalWindowImage;
        globalThis.window.requestIdleCallback = originalRequestIdleCallback;
        globalThis.window.__heysSetSelectedDate = originalSetSelectedDate;
        if (originalNavigatorConnectionDescriptor) {
            Object.defineProperty(globalThis.navigator, 'connection', originalNavigatorConnectionDescriptor);
        } else {
            delete globalThis.navigator.connection;
        }
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

    it('prepares the next responsive image only after load and an idle callback', async () => {
        const idleCallbacks = [];
        const requestIdleCallback = vi.fn((callback) => {
            idleCallbacks.push(callback);
            return idleCallbacks.length;
        });
        const imageHarness = createImageHarness();
        vi.spyOn(Math, 'random').mockReturnValue(0.01);
        const HEYS = loadMealModule({
            connection: { saveData: false, effectiveType: '4g' },
            ImageCtor: imageHarness.ImageCtor,
            requestIdleCallback,
        });

        if (requestIdleCallback.mock.calls.length === 0) {
            window.dispatchEvent(new Event('load'));
        }

        expect(requestIdleCallback).toHaveBeenCalledTimes(1);
        expect(imageHarness.images).toHaveLength(0);

        idleCallbacks.shift()({ didTimeout: false, timeRemaining: () => 20 });
        await Promise.resolve();
        await Promise.resolve();

        expect(imageHarness.images).toHaveLength(1);
        expect(HEYS.mealPlateGuide.getPreparedVariant()).toBeTruthy();
        expect(imageHarness.images[0].decoding).toBe('async');
        expect(imageHarness.images[0].fetchPriority).toBe('low');
        expect(imageHarness.images[0].src).toBe(HEYS.mealPlateGuide.getPreparedVariant().src);
        expect(imageHarness.images[0].srcset).toBe(HEYS.mealPlateGuide.getPreparedVariant().srcSet);
        expect(imageHarness.images[0].sizes).toBe('(max-width: 620px) 310px, 340px');
        expect(imageHarness.images[0].decode).toHaveBeenCalledTimes(1);
    });

    it('uses the prepared variant while it is decoding and schedules a non-repeating successor', async () => {
        const idleCallbacks = [];
        const requestIdleCallback = vi.fn((callback) => {
            idleCallbacks.push(callback);
            return idleCallbacks.length;
        });
        const imageHarness = createImageHarness({ deferred: true });
        const HEYS = loadMealModule({
            connection: { saveData: true, effectiveType: '4g' },
            ImageCtor: imageHarness.ImageCtor,
            requestIdleCallback,
        });
        setNavigatorConnection({ saveData: false, effectiveType: '4g' });
        vi.spyOn(Math, 'random').mockReturnValue(0.01);

        const preloadPromise = HEYS.mealPlateGuide.prepareNextVariant();
        const preparedVariant = HEYS.mealPlateGuide.getPreparedVariant();
        expect(preparedVariant.id).toBe('balanced-plate');

        HEYS.mealPlateGuide.show({ onContinue: vi.fn() });

        const modalOptions = HEYS.ConfirmModal.show.mock.calls[0][0];
        expect(modalOptions.text.props.variant).toBe(preparedVariant);
        expect(imageHarness.images).toHaveLength(1);
        expect(requestIdleCallback).toHaveBeenCalledTimes(1);

        imageHarness.resolveDecode();
        await preloadPromise;
        idleCallbacks.shift()({ didTimeout: false, timeRemaining: () => 20 });
        await Promise.resolve();
        await Promise.resolve();

        expect(HEYS.mealPlateGuide.getPreparedVariant().id).toBe('plate-chicken-quinoa');
    });

    it('deduplicates repeated preparation calls', async () => {
        const imageHarness = createImageHarness({ deferred: true });
        const HEYS = loadMealModule({
            connection: { saveData: true, effectiveType: '4g' },
            ImageCtor: imageHarness.ImageCtor,
        });
        setNavigatorConnection({ saveData: false, effectiveType: '4g' });

        const first = HEYS.mealPlateGuide.prepareNextVariant();
        const second = HEYS.mealPlateGuide.prepareNextVariant();
        await Promise.resolve();

        expect(second).toBe(first);
        expect(imageHarness.images).toHaveLength(1);
        expect(imageHarness.images[0].decode).toHaveBeenCalledTimes(1);

        imageHarness.resolveDecode();
        await first;
    });

    it('does not preload in data-saver or 2g modes', async () => {
        const requestIdleCallback = vi.fn();
        const imageHarness = createImageHarness();
        const HEYS = loadMealModule({
            connection: { saveData: true, effectiveType: '4g' },
            ImageCtor: imageHarness.ImageCtor,
            requestIdleCallback,
        });

        expect(HEYS.mealPlateGuide.schedulePreparation()).toBe(false);
        expect(await HEYS.mealPlateGuide.prepareNextVariant()).toBeNull();

        setNavigatorConnection({ saveData: false, effectiveType: '2g' });
        expect(HEYS.mealPlateGuide.schedulePreparation()).toBe(false);
        expect(await HEYS.mealPlateGuide.prepareNextVariant()).toBeNull();

        setNavigatorConnection({ saveData: false, effectiveType: 'slow-2g' });
        expect(HEYS.mealPlateGuide.schedulePreparation()).toBe(false);
        expect(await HEYS.mealPlateGuide.prepareNextVariant()).toBeNull();

        expect(requestIdleCallback).not.toHaveBeenCalled();
        expect(imageHarness.images).toHaveLength(0);
    });

    it('blocks meal creation on another date until the warning is explicitly confirmed', async () => {
        const HEYS = loadMealModule();
        const { getHandlers } = renderHandlersHarness(HEYS, { date: '2020-01-02' });
        HEYS.ConfirmModal.show.mockResolvedValueOnce('confirm');

        await act(async () => {
            await getHandlers().addMeal({ skipPlateGuide: true });
        });

        expect(HEYS.ConfirmModal.show).toHaveBeenCalledTimes(1);
        const modalOptions = HEYS.ConfirmModal.show.mock.calls[0][0];
        expect(modalOptions.title).toBe('Выбрана другая дата');
        expect(modalOptions.defaultActionValue).toBe('today');
        expect(modalOptions.cancelActionValue).toBe('today');
        expect(modalOptions.actions[0]).toMatchObject({ value: 'today', isDefault: true, isCancel: true });
        expect(modalOptions.actions[1]).toMatchObject({ value: 'confirm', style: 'warning' });
        expect(modalOptions.actions[1].label).toContain('2 января');

        render(modalOptions.text);
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.getByText('НЕ СЕГОДНЯ')).toBeTruthy();
        expect(screen.getByText('Четверг, 2 января')).toBeTruthy();
        expect(screen.getByText('Точно записать новый приём на эту дату?')).toBeTruthy();
        expect(HEYS.MealStep.showAddMeal).toHaveBeenCalledTimes(1);
    });

    it('returns to today without creating a meal when the safe action is chosen', async () => {
        const HEYS = loadMealModule();
        const { getHandlers } = renderHandlersHarness(HEYS, { date: '2020-01-02' });
        const setSelectedDate = vi.fn();
        globalThis.window.__heysSetSelectedDate = setSelectedDate;
        HEYS.ConfirmModal.show.mockResolvedValueOnce('today');

        await act(async () => {
            await getHandlers().addMeal({ skipPlateGuide: true });
        });

        expect(setSelectedDate).toHaveBeenCalledWith(getTodayISO());
        expect(HEYS.MealStep.showAddMeal).not.toHaveBeenCalled();
    });

    it('fails closed when the date cannot be confirmed', async () => {
        const HEYS = loadMealModule();
        const { getHandlers } = renderHandlersHarness(HEYS, { date: '2020-01-02' });
        HEYS.ConfirmModal.show = undefined;

        await act(async () => {
            await getHandlers().addMeal({ skipPlateGuide: true });
        });

        expect(HEYS.MealStep.showAddMeal).not.toHaveBeenCalled();
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
