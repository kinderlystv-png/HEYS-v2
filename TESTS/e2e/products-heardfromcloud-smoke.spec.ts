/**
 * OverlayStore heardFromCloud — smoke (PRODUCTS_AND_SEARCH.md, инцидент 2026-08-23).
 */
import { expect, test } from '@playwright/test';

import { expectDashboardReady, getNamedPinCredentials, hasNamedPinCredentials, loginWithHeysPin } from './helpers/pin-auth';

test.describe('Products · heardFromCloud smoke', () => {
    test.skip(!hasNamedPinCredentials('E2E_ALEX'), 'E2E PIN credentials required (.env.local)');

    test('PIN login — applyCloudSnapshot sets heardFromCloud, clear() resets', async ({ page }) => {
        await loginWithHeysPin(page, getNamedPinCredentials('E2E_ALEX'));

        const overlay = await page.evaluate(() => {
            const store = (window as typeof window & { HEYS?: { OverlayStore?: any } }).HEYS?.OverlayStore;
            if (!store?.hasHeardFromCloud || !store.applyCloudSnapshot || !store.clear) {
                return { ok: false, reason: 'overlay_api_missing' };
            }
            if (store.hasHeardFromCloud()) {
                return { ok: false, reason: 'heard_before_snapshot', heard: true };
            }
            store.applyCloudSnapshot([], { source: 'e2e-smoke-heardFromCloud' });
            const heardAfterCloud = store.hasHeardFromCloud();
            store.clear();
            const heardAfterClear = store.hasHeardFromCloud();
            return {
                ok: heardAfterCloud === true && heardAfterClear === false,
                heardAfterCloud,
                heardAfterClear,
            };
        });

        expect(overlay.ok, JSON.stringify(overlay)).toBe(true);
        await expectDashboardReady(page);
    });
});
