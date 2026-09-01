// kernel-training-plan.test.js — «назначенное не считается сделанным».
//
// Куратор назначает тренировку записью в day.trainings — теми же полями, что у
// фактической. Пока предиката не было, любой счётчик читал план как факт: день
// с одним назначением давал тоннаж, счётчик силовых и накопленную нагрузку так,
// будто человек уже отработал. Критерий слоя 1 протокола
// CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09: день с назначенной тренировкой
// даёт ровно те же числа, что пустой день.

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const loadSrc = fs.readFileSync(path.resolve(__dirname, '../_kernel/heys_kernel_load_v1.js'), 'utf8');
const strengthSrc = fs.readFileSync(path.resolve(__dirname, '../_kernel/heys_kernel_strength_v1.js'), 'utf8');

/* eslint-disable no-eval */
const loadLoadKernel = () => { eval(loadSrc); return window.HEYS.TrainingKernel.load; };
const loadStrengthKernel = () => { eval(strengthSrc); return window.HEYS.TrainingKernel.strength; };
/* eslint-enable no-eval */

const strengthTraining = (extra) => Object.assign({
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: { exercises: [{ approaches: [{ weightKg: '60', reps: 10, done: true }] }] },
}, extra || {});

const cardioTraining = (extra) => Object.assign({ type: 'cardio', z: [30, 0, 0, 0] }, extra || {});

const ASSIGNED = { plan: { status: 'assigned' } };
const MOVED = { plan: { status: 'moved' } };

describe('назначенная тренировка не считается выполненной', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    describe('TK.load.isNotPerformedTraining — канонический предикат', () => {
        it('назначенное — да, начатое и выполненное — нет', () => {
            const tk = loadLoadKernel();
            expect(tk.isNotPerformedTraining({ plan: { status: 'assigned' } })).toBe(true);
            expect(tk.isNotPerformedTraining({ plan: { status: 'moved' } })).toBe(true);
            expect(tk.isNotPerformedTraining({ plan: { status: 'started' } })).toBe(false);
            expect(tk.isNotPerformedTraining({ plan: { status: 'done' } })).toBe(false);
        });

        it('обычная запись без поля plan — факт, а не план', () => {
            // Поля plan сегодня нет ни у одной записи в базе: предикат обязан
            // молчать на всей существующей истории.
            const tk = loadLoadKernel();
            expect(tk.isNotPerformedTraining(cardioTraining())).toBe(false);
            expect(tk.isNotPerformedTraining({ plan: null })).toBe(false);
            expect(tk.isNotPerformedTraining(null)).toBe(false);
            expect(tk.isNotPerformedTraining(undefined)).toBe(false);
        });
    });

    describe('sessionLoad', () => {
        it('назначенная кардио-сессия не даёт нагрузки, даже с минутами по зонам', () => {
            const tk = loadLoadKernel();
            expect(tk.sessionLoad(cardioTraining(ASSIGNED), [2, 3, 5, 8])).toBe(0);
        });

        it('та же сессия со статусом started считается как раньше', () => {
            const tk = loadLoadKernel();
            const started = cardioTraining({ plan: { status: 'started' } });
            expect(tk.sessionLoad(started, [2, 3, 5, 8])).toBe(60);
            expect(tk.sessionLoad(cardioTraining(), [2, 3, 5, 8])).toBe(60);
        });
    });

    describe('тоннаж и счётчик силовых', () => {
        it('день с назначенной силовой равен пустому дню', () => {
            const ks = loadStrengthKernel();
            const day = { trainings: [strengthTraining(ASSIGNED)] };
            expect(ks.dayTonnage(day)).toBe(0);
            expect(ks.countStrengthWorkouts(day)).toBe(0);
            expect(ks.dayTonnage({ trainings: [] })).toBe(0);
        });

        it('та же тренировка со статусом started и без plan считается как раньше', () => {
            const ks = loadStrengthKernel();
            const started = { trainings: [strengthTraining({ plan: { status: 'started' } })] };
            const plain = { trainings: [strengthTraining()] };
            expect(ks.dayTonnage(started)).toBe(600);
            expect(ks.countStrengthWorkouts(started)).toBe(1);
            expect(ks.dayTonnage(plain)).toBe(600);
            expect(ks.countStrengthWorkouts(plain)).toBe(1);
        });

        it('в смешанном дне отсеивается только назначенное', () => {
            const ks = loadStrengthKernel();
            const day = { trainings: [strengthTraining(ASSIGNED), strengthTraining()] };
            expect(ks.dayTonnage(day)).toBe(600);
            expect(ks.countStrengthWorkouts(day)).toBe(1);
        });

        it('trainingTonnage у назначенной по-прежнему отдаёт plannedVolume', () => {
            // Карточка назначенного показывает «~N кг объёма» именно через него —
            // фильтр в trainingTonnage обнулил бы подпись плана.
            const ks = loadStrengthKernel();
            const agg = ks.trainingTonnage(strengthTraining(ASSIGNED));
            expect(agg.plannedVolume).toBe(600);
        });
    });

    describe('пропущенная тренировка тоже не считается фактом', () => {
        // Решение владельца 2026-08-09: пропуск остаётся в дне как история
        // «назначено и не сделано» — куратор её видит, но нагрузки она не даёт.
        const SKIPPED = { plan: { status: 'skipped' } };

        it('предикат ловит skipped наравне с assigned', () => {
            const tk = loadLoadKernel();
            expect(tk.isNotPerformedTraining(strengthTraining(SKIPPED))).toBe(true);
            expect(tk.isNotPerformedTraining(strengthTraining({ plan: { status: 'started' } }))).toBe(false);
            expect(tk.isNotPerformedTraining(strengthTraining({ plan: { status: 'done' } }))).toBe(false);
        });

        it('пропущенная не даёт ни нагрузки, ни тоннажа, ни счётчика', () => {
            const tk = loadLoadKernel();
            const ks = loadStrengthKernel();
            expect(tk.sessionLoad(cardioTraining(SKIPPED), [2, 3, 5, 8])).toBe(0);
            const day = { trainings: [strengthTraining(SKIPPED)] };
            expect(ks.dayTonnage(day)).toBe(0);
            expect(ks.countStrengthWorkouts(day)).toBe(0);
        });

        it('фолбэк в модуле силовых знает про skipped так же, как ядро', () => {
            // Локальный фолбэк, отставший от ядра на один статус, — ровно тот
            // молчаливый разрыв, ради которого предикат сделан единственным.
            const ks = loadStrengthKernel();
            expect(ks.dayTonnage({ trainings: [strengthTraining(SKIPPED)] })).toBe(0);
        });

        it('перенесённая исходная запись не даёт нагрузку ни через ядро, ни через strength fallback', () => {
            const tk = loadLoadKernel();
            expect(tk.isNotPerformedTraining(strengthTraining(MOVED))).toBe(true);
            window.HEYS.TrainingKernel.load = null;
            const ks = loadStrengthKernel();
            expect(ks.dayTonnage({ trainings: [strengthTraining(MOVED)] })).toBe(0);
            expect(ks.countStrengthWorkouts({ trainings: [strengthTraining(MOVED)] })).toBe(0);
        });
    });

    describe('фолбэк предиката в модуле силовых', () => {
        it('работает и без модуля нагрузки, и через него (прод-порядок)', () => {
            // Выше модуль нагрузки не грузился вовсе — там отработал локальный
            // фолбэк. Здесь оба модуля в прод-порядке: результат обязан совпасть.
            const tk = loadLoadKernel();
            const ks = loadStrengthKernel();
            expect(tk.isNotPerformedTraining(strengthTraining(ASSIGNED))).toBe(true);
            const day = { trainings: [strengthTraining(ASSIGNED)] };
            expect(ks.dayTonnage(day)).toBe(0);
            expect(ks.countStrengthWorkouts(day)).toBe(0);
        });
    });
});
