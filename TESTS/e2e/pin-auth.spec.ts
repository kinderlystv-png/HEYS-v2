import { expect, test } from '@playwright/test';

import { expectDashboardReady, hasHeysPinCredentials, loginWithHeysPin } from './helpers/pin-auth';

test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
});

test.describe('HEYS local PIN auth smoke', () => {
    test.skip(!hasHeysPinCredentials(), 'Set E2E PIN in .env.local (HEYS_TEST_PIN_E2E_ALEX or HEYS_TEST_PHONE/PIN)');

    test('logs in via local env credentials and restores PIN session', async ({ page }) => {
        const clientId = await loginWithHeysPin(page);

        expect(clientId).toBeTruthy();

        await expectDashboardReady(page);

        await expect
            .poll(async () => {
                return page.evaluate(() => ({
                    pinAuthClient: localStorage.getItem('heys_pin_auth_client'),
                    currentClientId: window.HEYS?.currentClientId || null,
                }));
            })
            .toMatchObject({
                pinAuthClient: clientId,
                currentClientId: clientId,
            });
    });
});
