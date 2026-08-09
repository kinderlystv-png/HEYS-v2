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
 * Правка куратора поверх начатой тренировки — слой 5
 * CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09.md, дизайн-хэндофф от 2026-08-09
 * («Правка куратора после старта», экраны 15a–15c).
 *
 * Правило, из которого следует всё остальное: предложение никогда не трогает
 * отмеченные подходы. Тесты стерегут именно его и три следствия — закрытый
 * подход неприкосновенен, незакрытые правятся (включая их число), начатое
 * упражнение нельзя убрать, — плюс тот же инвариант этажом выше для связки.
 */
describe('TrainingKernel.strength.applyPlanEdit', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    const ex = (id, name, approaches, ssGroup) => ({ id, name, approaches, ssGroup: ssGroup || 0 });
    const ap = (id, w, r, done) => ({ id, weightKg: String(w), reps: r, done: !!done });

    it('экран 15a: сбавляет вес в незакрытых подходах, закрытый оставляет как был', () => {
        const ks = loadKernel();
        // Разведение: первый подход сделан на 40, Артём предлагает оставшиеся по 35.
        const live = [ex('ex1', 'Разведение гантелей', [
            ap('a1', 40, 12, true), ap('a2', 40, 12, false), ap('a3', 40, 12, false),
        ])];
        const proposed = [ex('ex1', 'Разведение гантелей', [
            ap('a1', 40, 12, false), ap('a2', 35, 12, false), ap('a3', 35, 12, false),
        ])];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.ok).toBe(true);
        const aps = res.exercises[0].approaches;
        expect(aps.map((a) => a.weightKg)).toEqual(['40', '35', '35']);
        expect(aps[0].done).toBe(true);
        expect(res.applied.some((x) => x.reason === 'approaches_changed')).toBe(true);
    });

    it('закрытый подход не меняется даже когда правка целится ровно в него', () => {
        const ks = loadKernel();
        const live = [ex('ex1', 'Жим', [ap('a1', 80, 5, true), ap('a2', 80, 5, false)])];
        const proposed = [ex('ex1', 'Жим', [ap('a1', 60, 3, false), ap('a2', 60, 3, false)])];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.exercises[0].approaches[0]).toMatchObject({ weightKg: '80', reps: 5, done: true });
        expect(res.exercises[0].approaches[1]).toMatchObject({ weightKg: '60', reps: 3 });
    });

    it('незакрытые подходы правятся вместе с их числом — «не три, а пять»', () => {
        const ks = loadKernel();
        const live = [ex('ex1', 'Присед', [ap('a1', 80, 5, true), ap('a2', 80, 5, false), ap('a3', 80, 5, false)])];
        const proposed = [ex('ex1', 'Присед', [
            ap('a1', 80, 5, false), ap('a2', 70, 8, false), ap('a3', 70, 8, false),
            ap('a4', 70, 8, false), ap('a5', 70, 8, false),
        ])];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.exercises[0].approaches).toHaveLength(5);
        expect(res.exercises[0].approaches[0].done).toBe(true);
        expect(res.exercises[0].approaches.slice(1).every((a) => a.weightKg === '70')).toBe(true);
    });

    it('сократить правкой уже сделанное нельзя, и об этом сказано вслух', () => {
        const ks = loadKernel();
        const live = [ex('ex1', 'Присед', [ap('a1', 80, 5, true), ap('a2', 80, 5, true), ap('a3', 80, 5, true)])];
        const proposed = [ex('ex1', 'Присед', [ap('a1', 80, 5, false)])];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.exercises[0].approaches).toHaveLength(3);
        expect(res.rejected.some((r) => r.reason === 'done_approaches_kept')).toBe(true);
    });

    it('экран 15b: начатое упражнение остаётся в плане, даже если куратор его вычеркнул', () => {
        const ks = loadKernel();
        const live = [
            ex('ex1', 'Жим лёжа', [ap('a1', 75, 8, true)]),
            ex('ex2', 'Разведение гантелей', [ap('a2', 40, 12, true), ap('a3', 40, 12, false)]),
        ];
        // Артём убрал разведение целиком.
        const proposed = [ex('ex1', 'Жим лёжа', [ap('a1', 75, 8, false)])];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.exercises.map((e) => e.name)).toContain('Разведение гантелей');
        const kept = res.rejected.find((r) => r.reason === 'started_cannot_remove');
        expect(kept).toBeTruthy();
        expect(kept.name).toBe('Разведение гантелей');
    });

    it('нетронутое упражнение куратор убрать может — это обычная правка плана', () => {
        const ks = loadKernel();
        const live = [
            ex('ex1', 'Жим лёжа', [ap('a1', 75, 8, true)]),
            ex('ex2', 'Планка', [ap('a2', 0, 1, false)]),
        ];
        const proposed = [ex('ex1', 'Жим лёжа', [ap('a1', 75, 8, false)])];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.exercises.map((e) => e.name)).toEqual(['Жим лёжа']);
        expect(res.applied.some((a) => a.reason === 'removed' && a.name === 'Планка')).toBe(true);
    });

    it('новое упражнение добавляется', () => {
        const ks = loadKernel();
        const live = [ex('ex1', 'Жим лёжа', [ap('a1', 75, 8, true)])];
        const proposed = [
            ex('ex1', 'Жим лёжа', [ap('a1', 75, 8, false)]),
            ex('exNew', 'Тяга к груди на блоке', [ap('n1', 45, 12, false)]),
        ];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.exercises.map((e) => e.name)).toEqual(['Жим лёжа', 'Тяга к груди на блоке']);
        expect(res.applied.some((a) => a.reason === 'added')).toBe(true);
    });

    it('экран 15c: не начатая связка заменяется целиком', () => {
        const ks = loadKernel();
        const live = [
            ex('ex1', 'Подтягивания', [ap('a1', 0, 10, false), ap('a2', 0, 8, false)], 1),
            ex('ex2', 'Тяга блока', [ap('a3', 55, 12, false), ap('a4', 55, 12, false)], 1),
        ];
        const proposed = [
            ex('ex1', 'Тяга блока', [ap('a1', 55, 12, false), ap('a2', 55, 12, false)], 1),
            ex('exNew', 'Тяга гантели', [ap('n1', 30, 12, false), ap('n2', 30, 12, false)], 1),
        ];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.ok).toBe(true);
        expect(res.exercises.map((e) => e.name)).toEqual(['Тяга блока', 'Тяга гантели']);
    });

    it('экран 15c: у начатой связки состав заморожен, а веса в незакрытых клетках правятся', () => {
        const ks = loadKernel();
        const live = [
            ex('ex1', 'Подтягивания', [ap('a1', 0, 10, true), ap('a2', 0, 8, false), ap('a3', 0, 8, false)], 1),
            ex('ex2', 'Тяга блока', [ap('a4', 55, 12, true), ap('a5', 55, 12, false), ap('a6', 55, 12, false)], 1),
        ];
        // Артём пытается и подменить участника, и сбавить вес во второй тяге.
        const proposed = [
            ex('ex1', 'Подтягивания', [ap('a1', 0, 10, false), ap('a2', 0, 8, false), ap('a3', 0, 8, false)], 1),
            ex('exNew', 'Тяга гантели', [ap('n1', 30, 12, false), ap('n2', 30, 12, false), ap('n3', 30, 12, false)], 1),
            ex('ex2', 'Тяга блока', [ap('a4', 55, 12, false), ap('a5', 45, 12, false), ap('a6', 45, 12, false)], 1),
        ];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.ok).toBe(true);
        // Состав тот же — подменить участника начатой связки правка не может.
        expect(res.exercises.map((e) => e.name)).toEqual(['Подтягивания', 'Тяга блока']);
        expect(res.rejected.some((r) => r.reason === 'superset_composition_frozen')).toBe(true);
        // Но веса в незакрытых клетках легли, а закрытая осталась на 55.
        const tyaga = res.exercises[1].approaches;
        expect(tyaga.map((a) => a.weightKg)).toEqual(['55', '45', '45']);
        expect(tyaga[0].done).toBe(true);
    });

    it('число подходов у начатой связки не меняется — раунды должны сходиться', () => {
        const ks = loadKernel();
        const live = [
            ex('ex1', 'Подтягивания', [ap('a1', 0, 10, true), ap('a2', 0, 8, false)], 1),
            ex('ex2', 'Тяга блока', [ap('a3', 55, 12, true), ap('a4', 55, 12, false)], 1),
        ];
        const proposed = [
            ex('ex1', 'Подтягивания', [ap('a1', 0, 10, false), ap('a2', 0, 8, false), ap('a3', 0, 8, false)], 1),
            ex('ex2', 'Тяга блока', [ap('a4', 55, 12, false), ap('a5', 55, 12, false), ap('a6', 55, 12, false)], 1),
        ];

        const res = ks.applyPlanEdit(live, proposed);
        const rounds = ks.supersetRounds(res.exercises, 1);
        expect(rounds).toHaveLength(2);
        expect(res.exercises[0].approaches).toHaveLength(2);
        expect(res.exercises[1].approaches).toHaveLength(2);
    });

    it('начатая связка не разрывается, даже когда куратор её вычеркнул целиком', () => {
        const ks = loadKernel();
        const live = [
            ex('ex1', 'Подтягивания', [ap('a1', 0, 10, true)], 1),
            ex('ex2', 'Тяга блока', [ap('a2', 55, 12, true)], 1),
            ex('ex3', 'Планка', [ap('a3', 0, 60, false)]),
        ];
        const proposed = [ex('ex3', 'Планка', [ap('a3', 0, 60, false)])];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.ok).toBe(true);
        expect(ks.validateSupersetLayout(res.exercises).ok).toBe(true);
        const names = res.exercises.map((e) => e.name);
        expect(names.indexOf('Тяга блока')).toBe(names.indexOf('Подтягивания') + 1);
    });

    it('пустое предложение ничего не ломает: начатое остаётся, нетронутое уходит', () => {
        const ks = loadKernel();
        const live = [
            ex('ex1', 'Жим', [ap('a1', 75, 8, true)]),
            ex('ex2', 'Планка', [ap('a2', 0, 60, false)]),
        ];
        const res = ks.applyPlanEdit(live, []);
        expect(res.exercises.map((e) => e.name)).toEqual(['Жим']);
    });

    it('прочерк участника — не отметка: клетка остаётся правимой', () => {
        const ks = loadKernel();
        // Участник, добавленный по ходу: реальный пустой подход в прошедшем раунде.
        const live = [
            ex('ex1', 'Подтягивания', [ap('a1', 0, 10, true), ap('a2', 0, 8, false)], 1),
            ex('ex2', 'Тяга гантели', [{ id: 'b1', weightKg: '', reps: 0, done: false }, ap('b2', 30, 12, false)], 1),
        ];
        const proposed = [
            ex('ex1', 'Подтягивания', [ap('a1', 0, 10, false), ap('a2', 0, 8, false)], 1),
            ex('ex2', 'Тяга гантели', [{ id: 'b1', weightKg: '', reps: 0, done: false }, ap('b2', 25, 12, false)], 1),
        ];

        const res = ks.applyPlanEdit(live, proposed);
        expect(res.exercises[1].approaches[1].weightKg).toBe('25');
        expect(ks.isBlankApproach(res.exercises[1].approaches[0])).toBe(true);
    });
});
