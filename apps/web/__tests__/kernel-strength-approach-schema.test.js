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
 * Шаги 2 и 3 протокола STRENGTH_BUILDER_REDESIGN_PROTOCOL_2026-08-09.md:
 * схема подхода (тип, довес, ступени дроп-сета) и тоннаж, который её понимает.
 * Всё аддитивно — отдельный набор тестов на то, что старые данные считаются
 * ровно как раньше, лежит в kernel-strength.test.js.
 */
describe('TrainingKernel.strength — схема подхода', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    it('пустой тип читается как рабочий подход', () => {
        const ks = loadKernel();
        expect(ks.approachType({ weightKg: '60', reps: 8 })).toBe('work');
        expect(ks.approachType({ type: '' })).toBe('work');
        expect(ks.approachType({ type: 'warmup' })).toBe('warmup');
        expect(ks.isWarmupApproach({ type: 'warmup' })).toBe(true);
    });

    it('ступени идут в порядке выполнения, основная первой', () => {
        const ks = loadKernel();
        const stages = ks.approachStages({
            weightKg: '75', reps: 8, done: true,
            drops: [{ weightKg: '60', reps: 6, done: false }],
        });
        expect(stages.map((s) => [s.weightKg, s.reps, s.isDrop])).toEqual([
            ['75', 8, false],
            ['60', 6, true],
        ]);
    });

    it('подход закрыт, только когда закрыты все его ступени', () => {
        const ks = loadKernel();
        const half = { weightKg: '75', reps: 8, done: true, drops: [{ weightKg: '60', reps: 6, done: false }] };
        const full = { weightKg: '75', reps: 8, done: true, drops: [{ weightKg: '60', reps: 6, done: true }] };
        expect(ks.isApproachDone(half)).toBe(false);
        expect(ks.isApproachDone(full)).toBe(true);
        expect(ks.isApproachDone({ weightKg: '60', reps: 8, done: true })).toBe(true);
    });

    it('нормализация не пишет type у рабочего подхода: пустое и есть значение', () => {
        const ks = loadKernel();
        const norm = ks.normalizeApproach({ weightKg: 60, reps: '8', done: 1 });
        expect(norm).toEqual({ weightKg: '60', reps: 8, done: true });
        expect('type' in norm).toBe(false);
        expect('drops' in norm).toBe(false);
    });

    it('нормализация отрезает ступени сверх предела читаемости', () => {
        const ks = loadKernel();
        const norm = ks.normalizeApproach({
            weightKg: '75', reps: 8, done: true,
            drops: [
                { weightKg: '60', reps: 6, done: true },
                { weightKg: '45', reps: 4, done: true },
                { weightKg: '30', reps: 2, done: true },
            ],
        });
        expect(norm.drops.length).toBe(ks.MAX_APPROACH_STAGES - 1);
        expect(norm.drops.map((d) => d.weightKg)).toEqual(['60', '45']);
    });
});

describe('TrainingKernel.strength — проверка подхода у писателей', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    it('вес каждой следующей ступени только ниже предыдущей', () => {
        const ks = loadKernel();
        const ok = ks.validateApproach({ weightKg: '75', reps: 8, drops: [{ weightKg: '60', reps: 6 }] });
        expect(ok.ok).toBe(true);
        const up = ks.validateApproach({ weightKg: '75', reps: 8, drops: [{ weightKg: '80', reps: 6 }] });
        expect(up.ok).toBe(false);
        expect(up.errors.join(' ')).toMatch(/ниже предыдущей/);
        const same = ks.validateApproach({ weightKg: '75', reps: 8, drops: [{ weightKg: '75', reps: 6 }] });
        expect(same.ok).toBe(false);
    });

    it('дроп внутри связки запрещён', () => {
        const ks = loadKernel();
        const res = ks.validateApproach(
            { weightKg: '75', reps: 8, drops: [{ weightKg: '60', reps: 6 }] },
            { inSuperset: true },
        );
        expect(res.ok).toBe(false);
        expect(res.errors.join(' ')).toMatch(/связки/);
    });

    it('сброс от неуказанного веса не принимается', () => {
        const ks = loadKernel();
        const res = ks.validateApproach({ weightKg: '', reps: 8, drops: [{ weightKg: '60', reps: 6 }] });
        expect(res.ok).toBe(false);
        expect(res.errors.join(' ')).toMatch(/основной ступени/);
    });

    it('больше трёх ступеней не принимается', () => {
        const ks = loadKernel();
        const res = ks.validateApproach({
            weightKg: '75', reps: 8,
            drops: [{ weightKg: '60', reps: 6 }, { weightKg: '45', reps: 4 }, { weightKg: '30', reps: 2 }],
        });
        expect(res.ok).toBe(false);
        expect(res.errors.join(' ')).toMatch(/Ступеней больше 3/);
    });

    it('неизвестный тип и кривой довес отклоняются', () => {
        const ks = loadKernel();
        expect(ks.validateApproach({ weightKg: '60', reps: 8, type: 'дроп' }).ok).toBe(false);
        expect(ks.validateApproach({ weightKg: '', reps: 8, extraWeightKg: -5 }).ok).toBe(false);
        expect(ks.validateApproach({ weightKg: '', reps: 8, extraWeightKg: 20 }).ok).toBe(true);
    });

    it('у времени и метров повторы не обязательны, а своя величина обязательна', () => {
        const ks = loadKernel();
        expect(ks.validateApproach({ weightKg: '', durationSec: 60 }, { unit: 'time' }).ok).toBe(true);
        expect(ks.validateApproach({ weightKg: '', reps: 0 }, { unit: 'time' }).ok).toBe(false);
        expect(ks.validateApproach({ weightKg: '40', distanceM: 30 }, { unit: 'distance' }).ok).toBe(true);
        expect(ks.validateApproach({ weightKg: '40' }, { unit: 'distance' }).ok).toBe(false);
    });
});

describe('TrainingKernel.strength — тоннаж по новой схеме', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    const training = (exercises) => ({
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        workoutLog: { exercises },
    });

    it('разминка не идёт ни в фактический тоннаж, ни в плановый', () => {
        const ks = loadKernel();
        const agg = ks.trainingTonnage(training([{
            approaches: [
                { type: 'warmup', weightKg: '40', reps: 10, done: true },
                { weightKg: '75', reps: 8, done: true },
            ],
        }]));
        expect(agg.totalVolume).toBe(75 * 8);
        expect(agg.plannedVolume).toBe(75 * 8);
        expect(agg.warmupApproaches).toBe(1);
        expect(agg.totalApproaches).toBe(2);
        expect(agg.maxWeight).toBe(75);
    });

    it('в тоннаж идут все ступени дропа: работа сделана вся', () => {
        const ks = loadKernel();
        // Пример из макета 5.1: 75×8 плюс сброс 60×6 = 960 кг.
        const agg = ks.trainingTonnage(training([{
            approaches: [{ weightKg: '75', reps: 8, done: true, drops: [{ weightKg: '60', reps: 6, done: true }] }],
        }]));
        expect(agg.totalVolume).toBe(960);
        expect(agg.doneApproaches).toBe(1);
        expect(agg.totalApproaches).toBe(1);
    });

    it('рекорд считается по основной ступени, а не по сброшенной', () => {
        const ks = loadKernel();
        const agg = ks.trainingTonnage(training([{
            approaches: [{ weightKg: '75', reps: 8, done: true, drops: [{ weightKg: '60', reps: 6, done: true }] }],
        }]));
        expect(agg.maxWeight).toBe(75);
    });

    it('незакрытая ступень оставляет весь подход вне фактического тоннажа', () => {
        const ks = loadKernel();
        const agg = ks.trainingTonnage(training([{
            approaches: [{ weightKg: '75', reps: 8, done: true, drops: [{ weightKg: '60', reps: 6, done: false }] }],
        }]));
        expect(agg.totalVolume).toBe(0);
        expect(agg.plannedVolume).toBe(960);
        expect(agg.doneApproaches).toBe(0);
    });

    it('свой вес считается по формуле (масса × коэффициент + довес) × повторы', () => {
        const ks = loadKernel();
        const t = training([{
            unit: 'bodyweight', bodyweightFactor: 1.0,
            approaches: [{ weightKg: '', reps: 10, done: true, extraWeightKg: 10 }],
        }]);
        const agg = ks.trainingTonnage(t, { bodyWeightKg: 70 });
        expect(agg.totalVolume).toBe((70 * 1.0 + 10) * 10);
        expect(agg.unmeasuredExercises).toBe(0);
    });

    it('без массы тела или коэффициента упражнение остаётся непосчитанным', () => {
        const ks = loadKernel();
        const t = training([{
            unit: 'bodyweight', bodyweightFactor: 0.64,
            approaches: [{ weightKg: '', reps: 15, done: true }],
        }]);
        expect(ks.trainingTonnage(t).totalVolume).toBe(0);
        expect(ks.trainingTonnage(t).unmeasuredExercises).toBe(1);

        const noFactor = training([{
            unit: 'bodyweight', bodyweightFactor: null,
            approaches: [{ weightKg: '', reps: 15, done: true }],
        }]);
        expect(ks.trainingTonnage(noFactor, { bodyWeightKg: 70 }).unmeasuredExercises).toBe(1);
    });

    it('время и метры копятся отдельно и не попадают в тоннаж', () => {
        const ks = loadKernel();
        const agg = ks.trainingTonnage(training([
            { unit: 'time', approaches: [{ weightKg: '', durationSec: 60, done: true }, { weightKg: '', durationSec: 45, done: false }] },
            { unit: 'distance', approaches: [{ weightKg: '40', distanceM: 30, done: true }] },
        ]), { bodyWeightKg: 70 });
        expect(agg.totalVolume).toBe(0);
        expect(agg.seconds).toBe(60);
        expect(agg.meters).toBe(30);
    });

    it('старая запись без единицы считается ровно как раньше', () => {
        const ks = loadKernel();
        const agg = ks.trainingTonnage(training([{
            approaches: [{ weightKg: '60', reps: 8, done: true }, { weightKg: '65', reps: 6, done: false }],
        }]));
        expect(agg.totalVolume).toBe(60 * 8);
        expect(agg.plannedVolume).toBe(60 * 8 + 65 * 6);
        expect(agg.maxWeight).toBe(60);
        expect(agg.unmeasuredExercises).toBe(0);
    });

    it('масса тела доезжает до дневного тоннажа', () => {
        const ks = loadKernel();
        const day = {
            trainings: [training([{
                unit: 'bodyweight', bodyweightFactor: 0.95,
                approaches: [{ weightKg: '', reps: 10, done: true }],
            }])],
        };
        expect(ks.dayTonnage(day)).toBe(0);
        expect(ks.dayTonnage(day, { bodyWeightKg: 80 })).toBe(80 * 0.95 * 10);
    });
});
