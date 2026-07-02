import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const YESTERDAY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_yesterday_verify_v1.js'), 'utf8');

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalDEV = window.DEV;

function loadYesterdayVerify() {
    // eslint-disable-next-line no-eval
    (0, eval)(YESTERDAY_SRC);
}

function filledDay(date) {
    return {
        date,
        meals: [
            {
                items: [
                    {
                        id: `item-${date}`,
                        product_id: `product-${date}`,
                        grams: 100,
                        kcal100: 2200,
                        protein100: 100,
                        carbs100: 200,
                        fat100: 80,
                    },
                ],
            },
        ],
    };
}

describe('YesterdayVerify scoped day scan', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.HEYS = {
            currentClientId: 'client-1',
            utils: {
                getCurrentClientId: () => 'client-1',
            },
            dayUtils: {
                todayISO: () => '2026-07-02',
            },
            StepModal: {
                registerStep: vi.fn(),
            },
        };
        window.React = {};
        window.DEV = {};
    });

    afterEach(() => {
        vi.restoreAllMocks();
        window.localStorage.clear();
        window.HEYS = originalHEYS;
        window.React = originalReact;
        window.DEV = originalDEV;
    });

    it('keeps legacy unscoped days for true legacy sessions', () => {
        window.HEYS.currentClientId = '';
        window.HEYS.utils.getCurrentClientId = () => '';
        window.localStorage.setItem('heys_dayv2_2026-04-02', JSON.stringify(filledDay('2026-04-02')));

        loadYesterdayVerify();

        expect(window.HEYS.YesterdayVerify.getPendingPastDays().totalPendingDays).toBeGreaterThan(0);
    });

    it('ignores unscoped legacy days once current client has scoped storage', () => {
        window.localStorage.setItem('heys_client-1_profile', JSON.stringify({ firstName: 'Анна' }));
        window.localStorage.setItem('heys_dayv2_2026-04-02', JSON.stringify(filledDay('2026-04-02')));

        loadYesterdayVerify();

        expect(window.HEYS.YesterdayVerify.getPendingPastDays()).toMatchObject({
            missingDays: [],
            totalPendingDays: 0,
        });
        expect(window.HEYS.YesterdayVerify.getDayReviewInfo('2026-04-02')).toMatchObject({
            hasStoredDay: false,
            isMissingData: true,
        });
    });
});
