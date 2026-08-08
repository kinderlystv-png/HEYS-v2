import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const source = fs.readFileSync(path.resolve(__dirname, '../heys_day_caloric_debt_core_v1.js'), 'utf8');

function loadCore() {
    eval(source);
    return window.HEYS.dayCaloricDebtCore.computeDebtCore;
}

const fmtDate = (d) => d.toISOString().slice(0, 10);

/**
 * Ядро вынесено из React-хука, чтобы MCP считал норму тем же кодом, а не брал
 * протухший кэш отрисовки. Эти тесты пинят математику долга: без них перенос
 * держится только на чтении диффа, а внешний try/catch в хуке превращает любую
 * поломку в тихий null.
 */
describe('computeDebtCore', () => {
    beforeEach(() => { window.HEYS = {}; });
    afterEach(() => { window.HEYS = originalHEYS; });

    /** Три прошлых дня подряд с одинаковым съеденным. */
    function window3(kcal, extra = {}) {
        return ['2026-08-05', '2026-08-06', '2026-08-07'].map((date) => ({
            date, kcal, baseTarget: 2000, target: 2000, ...extra,
        }));
    }

    const BASE = {
        date: '2026-08-08',
        day: { deficitPct: -15, trainings: [] },
        prof: { deficitPctTarget: -15 },
        optimum: 2000,
        fmtDate,
    };

    it('считает надбавку за накопленный недобор', () => {
        const core = loadCore()({ ...BASE, sparklineData: window3(1500) });

        // 3 × (1500 − 2000) = −1500 долга, потолок MAX_DEBT тоже 1500.
        expect(core.cappedDebt).toBe(1500);
        expect(core.hasDebt).toBe(true);
        // Компенсируем 75% = 1125 за 3 дня (долг > 700) = 375/день, потолок 20% = 400.
        expect(core.dailyBoost).toBe(375);
        expect(core.dailyReduction).toBe(0);
    });

    it('надбавка упирается в потолок 20% от нормы', () => {
        const core = loadCore()({ ...BASE, optimum: 1000, sparklineData: window3(500) });
        // 1500 долга × 0.75 / 3 = 375, но 20% от 1000 = 200.
        expect(core.dailyBoost).toBe(200);
    });

    it('при переборе даёт мягкое снижение, а не штраф', () => {
        const core = loadCore()({ ...BASE, sparklineData: window3(2600) });

        expect(core.hasExcess).toBe(true);
        expect(core.dailyBoost).toBe(0);
        // 70% перебора закрывается активностью, остаток делится на дни и режется
        // потолком 10% от нормы.
        expect(core.dailyReduction).toBeGreaterThan(0);
        expect(core.dailyReduction).toBeLessThanOrEqual(200);
    });

    it('дни с неполными данными в окно не попадают', () => {
        // Меньше трети нормы — данные внесены не полностью, день не учитываем.
        const core = loadCore()({ ...BASE, sparklineData: window3(500) });
        expect(core).toBeNull();
    });

    it('голодание учитывается как есть, даже ниже порога', () => {
        const core = loadCore()({ ...BASE, sparklineData: window3(500, { isFastingDay: true }) });
        expect(core.pastDays).toHaveLength(3);
        expect(core.cappedDebt).toBe(1500);
    });

    it('норма с уже учтённым долгом не идёт в базу расчёта нового долга', () => {
        // target = savedDisplayOptimum, в котором сидит вчерашний долг. Если
        // ядро возьмёт его за базу, долг посчитается второй раз.
        // Числа подобраны так, чтобы ни одна ветка не упёрлась в потолок долга,
        // иначе разница спрячется за MAX_DEBT.
        const withDebtInTarget = window3(1800).map((d) => ({ ...d, target: 2200, baseTarget: 2000 }));
        const withoutBase = withDebtInTarget.map(({ baseTarget, ...rest }) => rest);

        const correct = loadCore()({ ...BASE, sparklineData: withDebtInTarget });
        const doubled = loadCore()({ ...BASE, sparklineData: withoutBase });

        expect(correct.cappedDebt).toBe(600);   // 3 × (1800 − 2000)
        expect(doubled.cappedDebt).toBe(1200);  // 3 × (1800 − 2200): долг посчитан дважды
        expect(doubled.dailyBoost).toBeGreaterThan(correct.dailyBoost);
    });

    it('без окна прошлых дней считать нечего', () => {
        expect(loadCore()({ ...BASE, sparklineData: [] })).toBeNull();
        expect(loadCore()({ ...BASE, optimum: 0, sparklineData: window3(1500) })).toBeNull();
    });
});
