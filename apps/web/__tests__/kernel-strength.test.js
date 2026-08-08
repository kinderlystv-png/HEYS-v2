import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const source = fs.readFileSync(path.resolve(__dirname, '../_kernel/heys_kernel_strength_v1.js'), 'utf8');

function loadKernel() {
    eval(source);
    return window.HEYS.TrainingKernel.strength;
}

/**
 * Формула перенесена дословно из heys_day_trainings_v1.js (computeDayTotalTonnage,
 * countStrengthWorkoutsOnDay) — те функции читали localStorage напрямую и были
 * недоступны ни ядру, ни MCP. Здесь — чистые функции от блоба дня.
 */
describe('TrainingKernel.strength', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    const strengthTraining = (approaches) => ({
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        workoutLog: { exercises: [{ approaches }] },
    });

    it('считает тоннаж только по завершённым подходам', () => {
        const ks = loadKernel();
        const t = strengthTraining([
            { weightKg: '60', reps: 8, done: true },
            { weightKg: '60', reps: 8, done: false }, // не отмечен — не считается
            { weightKg: '65', reps: 6, done: true },
        ]);
        const agg = ks.trainingTonnage(t);
        expect(agg.totalVolume).toBe(60 * 8 + 65 * 6);
        expect(agg.maxWeight).toBe(65);
        expect(agg.doneApproaches).toBe(2);
        expect(agg.totalApproaches).toBe(3);
    });

    it('вес с запятой парсится как русский ввод (60,5)', () => {
        const ks = loadKernel();
        const t = strengthTraining([{ weightKg: '60,5', reps: 10, done: true }]);
        expect(ks.trainingTonnage(t).totalVolume).toBe(605);
    });

    it('не силовая или не workout_builder тренировка даёт нулевую сводку', () => {
        const ks = loadKernel();
        expect(ks.trainingTonnage({ type: 'cardio', z: [30, 0, 0, 0] }).totalVolume).toBe(0);
        expect(ks.trainingTonnage({ type: 'strength' }).totalVolume).toBe(0); // без strengthEntryMode
        expect(ks.trainingTonnage(null).totalVolume).toBe(0);
    });

    it('dayTonnage суммирует тоннаж всех силовых тренировок дня', () => {
        const ks = loadKernel();
        const day = {
            trainings: [
                strengthTraining([{ weightKg: '60', reps: 8, done: true }]),
                { type: 'cardio', z: [30, 0, 0, 0] },
                strengthTraining([{ weightKg: '40', reps: 10, done: true }]),
            ],
        };
        expect(ks.dayTonnage(day)).toBe(60 * 8 + 40 * 10);
        expect(ks.countStrengthWorkouts(day)).toBe(2);
    });

    it('день без тренировок не падает', () => {
        const ks = loadKernel();
        expect(ks.dayTonnage(null)).toBe(0);
        expect(ks.dayTonnage({})).toBe(0);
        expect(ks.countStrengthWorkouts({ trainings: [] })).toBe(0);
    });
});
