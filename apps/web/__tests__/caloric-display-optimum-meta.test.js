import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const source = fs.readFileSync(path.resolve(__dirname, '../heys_day_caloric_display_state.js'), 'utf8');

function loadModule() {
    eval(source);
    return window.HEYS.dayCaloricDisplayState;
}

/**
 * Кэш нормы (`savedDisplayOptimum`) пишет только браузер и только пока клиент
 * держит день открытым. Рядом с ним обязан ложиться отпечаток происхождения:
 * без него коннектор куратора не отличает «клиент видел ровно это» от «клиент
 * видел это утром, а шаги приехали позже» — 07.08.2026 MCP отдал 1282 ккал при
 * 2209 на экране.
 */
describe('savedOptimumMeta', () => {
    let effects;

    beforeEach(() => {
        effects = [];
        window.HEYS = {};
        window.React = {
            useMemo: (fn) => fn(),
            useRef: (initial) => ({ current: initial }),
            useEffect: (fn) => effects.push(fn),
        };
    });

    afterEach(() => {
        window.HEYS = originalHEYS;
        window.React = originalReact;
    });

    /** Один прогон хука: возвращает то, что ушло в setDay (или null). */
    function runHook(params) {
        const { useCaloricDisplayState } = loadModule();
        let written = null;
        useCaloricDisplayState({
            React: window.React,
            setDay: (updater) => { written = updater({}); },
            r0: (x) => Math.round(+x || 0),
            ...params,
        });
        effects.forEach((fn) => fn());
        return written;
    }

    const DAY = {
        steps: 13320,
        trainings: [{ z: [18, 6, 50, 5] }],
        householdMin: 0,
        weightMorning: 52.9,
        savedDisplayOptimum: 0,
        savedEatenKcal: 0,
    };

    it('кладёт рядом с кэшем нормы, из чего она получена', () => {
        const written = runHook({
            day: DAY,
            optimum: 1841,
            eatenKcal: 1735,
            caloricDebt: { dailyBoost: 368, hasDebt: true },
            ndteBoostKcal: 185,
        });

        expect(written.savedDisplayOptimum).toBe(2209);
        expect(written.savedOptimumMeta).toMatchObject({
            optimum: 1841,
            // Долг и рефид сервер посчитать не может — переиспользует сохранённое.
            correction: 368,
            // NDTE считается по локальным часам браузера, серверу недоступен.
            ndte: 185,
            steps: 13320,
            trainingMin: 79,
            householdMin: 0,
            weight: 52.9,
        });
    });

    it('минуты быта берёт из householdActivities, как это делает TDEE', () => {
        const written = runHook({
            day: { ...DAY, householdMin: 0, householdActivities: [{ minutes: 20 }, { minutes: 25 }] },
            optimum: 1841,
            eatenKcal: 0,
            caloricDebt: null,
            ndteBoostKcal: 0,
        });

        expect(written.savedOptimumMeta.householdMin).toBe(45);
        expect(written.savedOptimumMeta.correction).toBe(0);
    });

    it('без надбавки за вчерашнюю тренировку пишет ноль, а не undefined', () => {
        const written = runHook({
            day: { ...DAY, trainings: [], steps: 0 },
            optimum: 1471,
            eatenKcal: 0,
            caloricDebt: null,
            ndteBoostKcal: undefined,
        });

        expect(written.savedOptimumMeta.ndte).toBe(0);
        expect(written.savedOptimumMeta.trainingMin).toBe(0);
    });
});
