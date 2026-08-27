/**
 * Adaptive thresholds: SWR background compute must not crash when profile
 * is missing. Widget health-trend and analyzeNutritionQuality used to call
 * get() without a profile; the sync path defaulted to {}, the SWR path did not.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function read(relPath) {
    return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function evalModule(relPath) {
    // eslint-disable-next-line no-new-func
    new Function('window', read(relPath))(global);
}

function makeDays(n, start = '2026-08-01') {
    const origin = new Date(`${start}T12:00:00`);
    return Array.from({ length: n }, (_, i) => {
        const d = new Date(origin);
        d.setDate(origin.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return {
            date: `${yyyy}-${mm}-${dd}`,
            dayTot: { kcal: 1800 },
            savedEatenKcal: 1800,
            meals: [
                { time: '08:00', items: [] },
                { time: '13:00', items: [] },
                { time: '19:30', items: [] },
            ],
        };
    });
}

describe('пороги: SWR не падает без профиля', () => {
    let store;

    beforeEach(() => {
        store = {};
        global.window = global;
        global.HEYS = {
            InsightsPI: {
                stats: {
                    calculatePercentile(arr, p) {
                        if (!arr?.length) return 0;
                        const sorted = [...arr].sort((a, b) => a - b);
                        const idx = Math.min(
                            sorted.length - 1,
                            Math.max(0, Math.floor((p / 100) * (sorted.length - 1))),
                        );
                        return sorted[idx];
                    },
                    coefficientOfVariation() {
                        return 0.12;
                    },
                },
            },
            dayUtils: {
                lsGet(key) {
                    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
                },
                lsSet(key, value) {
                    store[key] = value;
                },
            },
        };
        evalModule('apps/web/insights/pi_thresholds.js');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('живой экспорт называется get', () => {
        expect(typeof global.HEYS.InsightsPI.thresholds.get).toBe('function');
    });

    it('частичный расчёт без профиля даёт конечный proteinPerMealG', () => {
        const days = makeDays(10);
        const result = global.HEYS.InsightsPI.thresholds.get(days, undefined, null);
        expect(result.meta.partial).toBe(true);
        expect(Number.isFinite(result.thresholds.proteinPerMealG)).toBe(true);
        expect(result.thresholds.proteinPerMealG).toBeGreaterThan(0);
    });

    it('SWR с протухшим кэшем и undefined profile не пишет Background compute failed', async () => {
        const days = makeDays(10);
        store.heys_adaptive_thresholds = {
            thresholds: {
                lateEatingHour: 21,
                idealMealGapMin: 260,
                proteinPerMealG: 28,
            },
            confidence: 0.375,
            daysUsed: 10,
            meta: {
                computedAt: new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString(),
                dateRange: { from: days[0].date, to: days[days.length - 1].date },
                snapshot: { goal: 'maintenance', weight: 70, avgKcal: 1800 },
                version: '2.0.0',
            },
        };

        const errors = [];
        const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
            errors.push(args.map(String).join(' '));
        });

        const stale = global.HEYS.InsightsPI.thresholds.get(days, undefined, null);
        expect(stale.thresholds.proteinPerMealG).toBe(28);

        await new Promise((resolve) => setTimeout(resolve, 20));

        const swrFails = errors.filter((line) => line.includes('Background compute failed'));
        expect(swrFails, swrFails.join('\n')).toEqual([]);
        expect(Number.isFinite(store.heys_adaptive_thresholds?.thresholds?.proteinPerMealG)).toBe(true);
        spy.mockRestore();
    });

    it('analyze передаёт profile в nutrition quality', () => {
        const src = read('apps/web/heys_predictive_insights_v1.js');
        expect(src.includes('analyzeNutritionQuality(days, pIndex, profile)')).toBe(true);
        expect(src.includes('analyzeNutritionQuality(days, pIndex),')).toBe(false);
    });

    it('what-if тоже передаёт profile в nutrition quality', () => {
        const src = read('apps/web/insights/pi_whatif.js');
        expect(src.includes('analyzeNutritionQuality?.(recentDays, pIndex, profile)')).toBe(true);
    });
});
