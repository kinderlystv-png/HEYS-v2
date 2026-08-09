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
 * Шаг 4 протокола STRENGTH_BUILDER_REDESIGN_PROTOCOL_2026-08-09.md: связки.
 * Раунд не хранится, а выводится из позиции — поэтому тесты стерегут именно
 * инварианты, на которых держится вывод: смежность участников, равенство
 * числа рабочих подходов и то, что писатели их не ломают.
 */
describe('TrainingKernel.strength — чтение связки', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    const ex = (name, ssGroup, approaches, restSec) => ({ name, ssGroup, approaches, restSec });
    const work = (w, r, done) => ({ weightKg: String(w), reps: r, done: !!done });
    const warmup = (w, r) => ({ weightKg: String(w), reps: r, done: true, type: 'warmup' });

    it('раунд k — это k-й рабочий подход у каждого участника', () => {
        const ks = loadKernel();
        const list = [
            ex('Жим', 1, [work(60, 8, true), work(60, 8)]),
            ex('Тяга', 1, [work(50, 10, true), work(50, 10)]),
        ];
        const rounds = ks.supersetRounds(list, 1);
        expect(rounds.length).toBe(2);
        expect(rounds[0]).toEqual([
            { exerciseIndex: 0, approachIndex: 0 },
            { exerciseIndex: 1, approachIndex: 0 },
        ]);
        expect(rounds[1][1]).toEqual({ exerciseIndex: 1, approachIndex: 1 });
    });

    it('разминка входит в связку, но не в раунды', () => {
        const ks = loadKernel();
        const list = [
            ex('Жим', 1, [warmup(40, 10), work(60, 8), work(60, 8)]),
            ex('Тяга', 1, [work(50, 10), work(50, 10)]),
        ];
        const rounds = ks.supersetRounds(list, 1);
        expect(rounds.length).toBe(2);
        // Первый раунд у жима — второй подход в списке: разминка пропущена.
        expect(rounds[0][0]).toEqual({ exerciseIndex: 0, approachIndex: 1 });
        const [group] = ks.supersetGroups(list);
        expect(group.roundCount).toBe(2);
        expect(group.warmupCount).toBe(1);
    });

    it('старая связка с неравным числом подходов остаётся без раундов', () => {
        const ks = loadKernel();
        const list = [
            ex('Жим', 1, [work(60, 8), work(60, 8), work(60, 8)]),
            ex('Тяга', 1, [work(50, 10)]),
        ];
        expect(ks.supersetRounds(list, 1)).toBeNull();
        const [group] = ks.supersetGroups(list);
        expect(group.balanced).toBe(false);
        expect(group.roundCount).toBe(0);
    });

    it('отдых связки — максимум из участников, а не значение первого', () => {
        const ks = loadKernel();
        const list = [
            ex('Жим', 1, [work(60, 8)], 60),
            ex('Тяга', 1, [work(50, 10)], 120),
        ];
        expect(ks.supersetRestSec(list, 1)).toBe(120);
        // Перетаскивание сделало первым участника с меньшим отдыхом — отдых
        // связки от этого не поехал.
        const swapped = ks.swapSupersetMembers(list, 0, 1);
        expect(ks.supersetRestSec(swapped, 1)).toBe(120);
    });

    it('несмежные участники видны как нарушение, но список не переставляется', () => {
        const ks = loadKernel();
        const list = [
            ex('Жим', 1, [work(60, 8)]),
            ex('Присед', 0, [work(100, 5)]),
            ex('Тяга', 1, [work(50, 10)]),
        ];
        const [group] = ks.supersetGroups(list);
        expect(group.adjacent).toBe(false);
        expect(ks.validateSupersetLayout(list).ok).toBe(false);
        expect(ks.validateSupersetLayout(list).errors.join(' ')).toMatch(/подряд/);
        // Чтение ничего не чинит: порядок остался прежним.
        expect(list.map((e) => e.name)).toEqual(['Жим', 'Присед', 'Тяга']);
    });

    it('связка из одного упражнения — нарушение', () => {
        const ks = loadKernel();
        const res = ks.validateSupersetLayout([ex('Жим', 1, [work(60, 8)])]);
        expect(res.ok).toBe(false);
        expect(res.errors.join(' ')).toMatch(/минимум два/);
    });
});

describe('TrainingKernel.strength — писатели связки', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    const ex = (name, ssGroup, approaches) => ({ name, ssGroup, approaches });
    const work = (w, r, done) => ({ weightKg: String(w), reps: r, done: !!done });

    it('«+ Подход» добавляет раунд целиком, а не одному участнику', () => {
        const ks = loadKernel();
        const list = [
            ex('Жим', 1, [work(60, 8, true)]),
            ex('Тяга', 1, [work(50, 10, true)]),
        ];
        const next = ks.addSupersetRound(list, 1);
        expect(next[0].approaches.length).toBe(2);
        expect(next[1].approaches.length).toBe(2);
        // Значения копируются с последнего рабочего, отметка — нет.
        expect(next[0].approaches[1]).toMatchObject({ weightKg: '60', reps: 8, done: false });
        expect(ks.supersetRounds(next, 1).length).toBe(2);
    });

    it('участник по ходу получает пустые подходы по числу раундов', () => {
        const ks = loadKernel();
        const list = [
            ex('Жим', 1, [work(60, 8, true), work(60, 8, true), work(60, 8, true)]),
            ex('Тяга', 1, [work(50, 10, true), work(50, 10, true), work(50, 10, true)]),
            ex('Разгибания', 0, [work(20, 15, true)]),
        ];
        const next = ks.addSupersetMember(list, 2, 1);
        const added = next.find((e) => e.name === 'Разгибания');
        expect(added.ssGroup).toBe(1);
        // Позиционная модель: заполненный подход должен попасть в третий раунд,
        // а не оказаться первым.
        expect(added.approaches.length).toBe(3);
        expect(added.approaches.every((a) => ks.isBlankApproach(a))).toBe(true);
        expect(ks.supersetRounds(next, 1).length).toBe(3);
        expect(ks.validateSupersetLayout(next).ok).toBe(true);
    });

    it('прочерк не идёт ни в счётчик подходов, ни в тоннаж', () => {
        const ks = loadKernel();
        const training = {
            type: 'strength',
            strengthEntryMode: 'workout_builder',
            workoutLog: {
                exercises: [{
                    approaches: [work(60, 8, true), { weightKg: '', reps: 0, done: false }],
                }],
            },
        };
        const agg = ks.trainingTonnage(training);
        expect(agg.totalApproaches).toBe(1);
        expect(agg.doneApproaches).toBe(1);
        expect(agg.totalVolume).toBe(60 * 8);
    });

    it('перетаскивание двигает связку целиком', () => {
        const ks = loadKernel();
        const list = [
            ex('Присед', 0, [work(100, 5)]),
            ex('Жим', 1, [work(60, 8)]),
            ex('Тяга', 1, [work(50, 10)]),
        ];
        const next = ks.moveSupersetGroup(list, 1, 0);
        expect(next.map((e) => e.name)).toEqual(['Жим', 'Тяга', 'Присед']);
        expect(ks.validateSupersetLayout(next).ok).toBe(true);
    });

    it('вставка внутрь чужой связки прилипает к её границе', () => {
        const ks = loadKernel();
        const list = [
            ex('Жим', 1, [work(60, 8)]),
            ex('Тяга', 1, [work(50, 10)]),
            ex('Присед', 0, [work(100, 5)]),
        ];
        // Точка вставки — между двумя участниками связки.
        const next = ks.insertRespectingGroups(list, 2, 1);
        expect(next.map((e) => e.name)).toEqual(['Присед', 'Жим', 'Тяга']);
        expect(ks.validateSupersetLayout(next).ok).toBe(true);
        // Связка осталась целой: перетаскиванием её не разорвать.
        expect(ks.supersetGroups(next)[0].adjacent).toBe(true);
    });

    it('перестановка внутри связки не трогает чужие упражнения', () => {
        const ks = loadKernel();
        const list = [
            ex('Жим', 1, [work(60, 8)]),
            ex('Тяга', 1, [work(50, 10)]),
            ex('Присед', 0, [work(100, 5)]),
        ];
        const next = ks.swapSupersetMembers(list, 0, 1);
        expect(next.map((e) => e.name)).toEqual(['Тяга', 'Жим', 'Присед']);
        // Упражнения из разных связок местами не меняются.
        expect(ks.swapSupersetMembers(list, 0, 2).map((e) => e.name)).toEqual(['Жим', 'Тяга', 'Присед']);
    });
});

describe('TrainingKernel.strength — режим порядка (блоки)', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    const ex = (name, ssGroup) => ({ name, ssGroup, approaches: [{ weightKg: '60', reps: 8, done: false }] });

    it('связка — один блок, а не несколько отдельных строк', () => {
        const ks = loadKernel();
        const list = [ex('Присед', 0), ex('Жим', 1), ex('Тяга', 1), ex('Разведение', 0)];
        const blocks = ks.orderBlocks(list);
        expect(blocks.length).toBe(3);
        expect(blocks[1].indexes).toEqual([1, 2]);
    });

    it('стрелка вниз двигает блок целиком, не разрывая связку', () => {
        const ks = loadKernel();
        const list = [ex('Присед', 0), ex('Жим', 1), ex('Тяга', 1), ex('Разведение', 0)];
        const next = ks.moveBlock(list, 0, 1); // блок 0 («Присед») — на шаг вниз
        expect(next.map((e) => e.name)).toEqual(['Жим', 'Тяга', 'Присед', 'Разведение']);
    });

    it('край списка не двигается дальше некуда', () => {
        const ks = loadKernel();
        const list = [ex('Присед', 0), ex('Жим', 0)];
        expect(ks.moveBlock(list, 0, -1).map((e) => e.name)).toEqual(['Присед', 'Жим']);
        expect(ks.moveBlock(list, 1, 1).map((e) => e.name)).toEqual(['Присед', 'Жим']);
    });
});
