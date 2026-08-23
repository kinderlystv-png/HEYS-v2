/**
 * PRODUCTS_AND_SEARCH.md — smoke: PIN login + dayv2 client scope (инцидент 23.08).
 */
import { expect, test } from '@playwright/test';

import { expectDashboardReady, getNamedPinCredentials, hasNamedPinCredentials, loginWithHeysPin } from './helpers/pin-auth';
import { captureCleanupBaseline, cleanupTestClients, type CleanupBaseline } from './helpers/test-cleanup';

const ALEX_ID = process.env.HEYS_TEST_E2E_CLIENT_ALEX_ID || '11111111-1111-1111-1111-111111111111';
const POPL_ID = process.env.HEYS_TEST_E2E_CLIENT_POPL_ID || '22222222-2222-2222-2222-222222222222';

test.describe('Products · client-scope dayv2 smoke', () => {
    let cleanupBaseline: CleanupBaseline;

    test.skip(!hasNamedPinCredentials('E2E_ALEX'), 'E2E PIN credentials required (.env.local)');

    test.beforeAll(() => {
        cleanupBaseline = captureCleanupBaseline([ALEX_ID, POPL_ID]);
    });

    test.afterAll(() => {
        cleanupTestClients(cleanupBaseline);
    });

    test('PIN E2E-TestAlex — dashboard and dayv2 filter rejects foreign keys', async ({ page }) => {
        const creds = getNamedPinCredentials('E2E_ALEX');
        const clientId = await loginWithHeysPin(page, creds);
        expect(clientId.toLowerCase()).toBe(ALEX_ID.toLowerCase());

        await expectDashboardReady(page);

        const scope = await page.evaluate((cid) => {
            const w = window as typeof window & { HEYS?: { dayUtils?: { isDayv2KeyForCurrentClient?: (k: string, id: string) => boolean } } };
            const fn = w.HEYS?.dayUtils?.isDayv2KeyForCurrentClient;
            if (typeof fn !== 'function') return { ok: false, reason: 'no_dayUtils' };
            const foreign = `heys_${'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}_dayv2_2026-08-23`;
            const own = `heys_${cid}_dayv2_2026-08-23`;
            const legacy = 'heys_dayv2_2026-08-23';
            return {
                ok: fn(own, cid) === true && fn(legacy, cid) === true && fn(foreign, cid) === false,
                own,
                foreign,
            };
        }, clientId);

        expect(scope.ok, JSON.stringify(scope)).toBe(true);
    });
});
