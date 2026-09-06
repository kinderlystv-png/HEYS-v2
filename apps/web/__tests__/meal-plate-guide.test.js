import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
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

// Лист выбора даты монтируется руками через ReactDOM, поэтому пустая заглушка
// `{}` (годилась, пока диалог был ConfirmModal) больше не работает: нужен
// настоящий createRoot. Сломанный рендерер подаётся явно — тестом fail-closed.
function loadMealModule({
    connection = { saveData: true, effectiveType: '4g' },
    ImageCtor = originalWindowImage,
    requestIdleCallback = originalRequestIdleCallback,
    reactDOM = { createRoot: ReactDOMClient.createRoot },
} = {}) {
    globalThis.React = React;
    globalThis.ReactDOM = reactDOM;
    globalThis.HEYS = {
        Paywall: {
            canWriteSync: vi.fn(() => true),
            showBlockedToast: vi.fn(),
        },
        Toast: {
            error: vi.fn(),
            success: vi.fn(),
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

    // Диалог даты переписан: вместо ConfirmModal со склонением к сегодня
    // («Перейти на сегодня» / «Всё-таки записать») — лист «На какой день
    // записать?» с двумя равными рядами и отдельной кнопкой действия. Правила
    // те же: до явного подтверждения приём не создаётся, а если лист поднять
    // нечем — не создаётся тем более.
    it('blocks meal creation on another date until the warning is explicitly confirmed', async () => {
        const HEYS = loadMealModule();
        const { getHandlers } = renderHandlersHarness(HEYS, { date: '2020-01-02' });

        let dismissed;
        await act(async () => {
            dismissed = getHandlers().addMeal({ skipPlateGuide: true });
        });

        const sheet = document.querySelector('.nutrition-v4-date-target-sheet');
        expect(sheet).toBeTruthy();
        expect(sheet.getAttribute('aria-label')).toBe('На какой день записать?');
        // Два равных ряда, а не «опасное» и «безопасное» действие.
        const rows = [...sheet.querySelectorAll('.nutrition-v4-sheet__row')];
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('2 января');
        expect(rows[0].textContent).toContain('открытый день');
        expect(rows[0].className).toContain('is-selected');
        expect(rows[1].textContent).toContain('Сегодня');
        expect(rows[1].className).not.toContain('is-selected');
        // Пока кнопку действия не нажали — приём не создан.
        expect(HEYS.MealStep.showAddMeal).not.toHaveBeenCalled();

        // Уход из листа без выбора тоже ничего не создаёт.
        await act(async () => {
            fireEvent.keyDown(document, { key: 'Escape' });
            expect(await dismissed).toBe(false);
        });
        expect(HEYS.MealStep.showAddMeal).not.toHaveBeenCalled();
        expect(document.querySelector('.nutrition-v4-date-target-sheet')).toBeNull();

        let confirmed;
        await act(async () => {
            confirmed = getHandlers().addMeal({ skipPlateGuide: true });
        });
        const cta = document.querySelector('.nutrition-v4-cta');
        expect(cta.textContent).toBe('Записать на 2 января');

        await act(async () => {
            fireEvent.click(cta);
            await confirmed;
        });

        expect(HEYS.MealStep.showAddMeal).toHaveBeenCalledTimes(1);
        expect(HEYS.MealStep.showAddMeal.mock.calls[0][0].dateKey).toBe('2020-01-02');
    });

    // Прежнее имя — «returns to today without creating a meal when the safe
    // action is chosen». Ряды теперь равны, поэтому «сегодня» это не отступление
    // от записи, а выбор дня: календарь переезжает на сегодня И приём пишется
    // туда же. Отказ от записи остался за уходом из листа (тест выше).
    it('switches to today and records there when the today row is chosen', async () => {
        const HEYS = loadMealModule();
        const { getHandlers } = renderHandlersHarness(HEYS, { date: '2020-01-02' });
        const setSelectedDate = vi.fn();
        globalThis.window.__heysSetSelectedDate = setSelectedDate;

        let pending;
        await act(async () => {
            pending = getHandlers().addMeal({ skipPlateGuide: true });
        });

        const rows = [...document.querySelectorAll('.nutrition-v4-sheet__row')];
        await act(async () => {
            fireEvent.click(rows[1]);
        });
        expect(rows[1].className).toContain('is-selected');
        expect(rows[0].className).not.toContain('is-selected');

        await act(async () => {
            fireEvent.click(document.querySelector('.nutrition-v4-cta'));
            await pending;
        });

        expect(setSelectedDate).toHaveBeenCalledWith(getTodayISO());
        expect(HEYS.MealStep.showAddMeal).toHaveBeenCalledTimes(1);
        expect(HEYS.MealStep.showAddMeal.mock.calls[0][0].dateKey).toBe(getTodayISO());
    });

    // Правило безопасности: дату подтвердить нечем — приём не создаётся, и
    // причина названа вслух. Проверяются оба отказа рендерера: его нет вовсе и
    // он падает на рендере (раньше второй случай выбрасывал исключение из
    // addMeal вместо тихого fail-closed с тостом).
    it('fails closed when the date cannot be confirmed', async () => {
        const HEYS = loadMealModule({ reactDOM: {} });
        const { getHandlers } = renderHandlersHarness(HEYS, { date: '2020-01-02' });

        await act(async () => {
            expect(await getHandlers().addMeal({ skipPlateGuide: true })).toBe(false);
        });

        expect(HEYS.MealStep.showAddMeal).not.toHaveBeenCalled();
        expect(HEYS.Toast.error).toHaveBeenCalledWith('Не удалось подтвердить дату — приём не создан');
        expect(document.querySelector('.nutrition-v4-date-target-sheet')).toBeNull();

        const throwingDOM = {
            createRoot: () => ({
                render: () => { throw new Error('renderer down'); },
                unmount: vi.fn(),
            }),
        };
        const brokenHEYS = loadMealModule({ reactDOM: throwingDOM });
        const broken = renderHandlersHarness(brokenHEYS, { date: '2020-01-02' });

        await act(async () => {
            expect(await broken.getHandlers().addMeal({ skipPlateGuide: true })).toBe(false);
        });

        expect(brokenHEYS.MealStep.showAddMeal).not.toHaveBeenCalled();
        expect(brokenHEYS.Toast.error).toHaveBeenCalledWith('Не удалось подтвердить дату — приём не создан');
        // Пустой хост не остаётся в DOM перехватывать клики.
        expect(document.getElementById('heys-meal-date-target-root')).toBeNull();
    });

    it('starts meal creation directly — the plate guide was removed 2026-08-13 (owner decision: shown every time, no "don\'t show again", pure annoyance)', async () => {
        const HEYS = loadMealModule();
        const { deps, getHandlers } = renderHandlersHarness(HEYS);

        await act(async () => {
            getHandlers().addMeal();
        });

        expect(HEYS.ConfirmModal.show).not.toHaveBeenCalled();
        expect(HEYS.MealStep.showAddMeal).toHaveBeenCalledTimes(1);
        expect(deps.setDay).not.toHaveBeenCalled();

        await act(async () => {
            getHandlers().addMeal({ skipPlateGuide: true });
        });

        expect(HEYS.ConfirmModal.show).not.toHaveBeenCalled();
        expect(HEYS.MealStep.showAddMeal).toHaveBeenCalledTimes(2);
    });
});
