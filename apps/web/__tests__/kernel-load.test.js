import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const source = fs.readFileSync(path.resolve(__dirname, '../_kernel/heys_kernel_load_v1.js'), 'utf8');

function loadKernel() {
    eval(source);
    return window.HEYS.TrainingKernel.load;
}

/**
 * Модель Банистера в проекте не существовала (проверено 2026-08-08) — обе
 * доменные readiness смотрели только на «была ли вчера тренировка». Здесь —
 * общая математика, домен-агностичная: сессия → нагрузка, ряд нагрузок →
 * тренированность/усталость/готовность.
 */
describe('TrainingKernel.load', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    describe('sessionLoad', () => {
        it('считает MET-минуты по зонам клиента, не по новой константе', () => {
            const tk = loadKernel();
            // 30 мин в зоне 1 (MET 2) + 20 мин в зоне 3 (MET 5) = 60 + 100 = 160.
            const load = tk.sessionLoad({ z: [30, 0, 20, 0] }, [2, 3, 5, 8]);
            expect(load).toBe(160);
        });

        it('без zoneMets падает на дефолт TDEE, не на произвольные числа', () => {
            const tk = loadKernel();
            expect(tk.sessionLoad({ z: [10, 0, 0, 0] })).toBe(10 * tk.DEFAULT_ZONE_METS[0]);
        });

        it('силовую тренировку не считает — у неё другие единицы', () => {
            const tk = loadKernel();
            expect(tk.sessionLoad({ type: 'strength', z: [0, 0, 0, 0] })).toBe(0);
        });
    });

    describe('fitnessFatigue', () => {
        it('на постоянной нагрузке CTL и ATL сходятся к этой нагрузке', () => {
            const tk = loadKernel();
            // Экспонента — асимптота, не точное равенство: за 200 дней при tau=42
            // остаток ≈ 100·exp(-200/42) ≈ 0.9, поэтому допуск, а не toBeCloseTo(·,0).
            const series = new Array(200).fill(100);
            const ff = tk.fitnessFatigue(series);
            expect(ff.ctl).toBeGreaterThan(99);
            expect(ff.atl).toBeGreaterThan(99.9);
            expect(Math.abs(ff.tsb)).toBeLessThan(1);
            expect(ff.confidence).toBe('high');
        });

        it('после серии высокой нагрузки усталость растёт быстрее тренированности', () => {
            const tk = loadKernel();
            // 60 дней лёгкой базы, потом неделя ударной нагрузки.
            const base = new Array(60).fill(50);
            const spike = new Array(7).fill(300);
            const ff = tk.fitnessFatigue([...base, ...spike]);
            expect(ff.atl).toBeGreaterThan(ff.ctl);
            // TSB отрицательный — классический признак свежего накопленного утомления.
            expect(ff.tsb).toBeLessThan(0);
        });

        it('после долгого отдыха после нагрузки TSB становится положительным (форма)', () => {
            const tk = loadKernel();
            const training = new Array(60).fill(100);
            const rest = new Array(14).fill(0);
            const ff = tk.fitnessFatigue([...training, ...rest]);
            // Усталость (короткая tau) успела спасть сильнее тренированности (длинная tau).
            expect(ff.tsb).toBeGreaterThan(0);
        });

        it('короткая история даёт low confidence, а не молчаливую точность', () => {
            const tk = loadKernel();
            const ff = tk.fitnessFatigue([100, 100, 100]);
            expect(ff.confidence).toBe('low');
            expect(ff.daysOfHistory).toBe(3);
        });

        it('пустой или отсутствующий ряд не падает', () => {
            const tk = loadKernel();
            expect(tk.fitnessFatigue([])).toMatchObject({ ctl: 0, atl: 0, tsb: 0, confidence: 'low' });
            expect(tk.fitnessFatigue(null)).toMatchObject({ ctl: 0, atl: 0, tsb: 0 });
        });

        it('tau настраивается через opts, не зашит намертво', () => {
            const tk = loadKernel();
            const series = new Array(30).fill(100);
            const shortTau = tk.fitnessFatigue(series, { ctlTau: 7, atlTau: 3 });
            // При коротком tau экспонента прогревается быстрее — confidence выше
            // на той же длине истории, чем со стандартным tau 42.
            expect(shortTau.confidence).toBe('high');
            expect(tk.fitnessFatigue(series).confidence).toBe('low');
        });
    });
});
