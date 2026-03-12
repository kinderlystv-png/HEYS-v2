import { expect, test } from '@playwright/test';

import { hasHeysPinCredentials, loginWithHeysPin } from './helpers/pin-auth';

test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
});

test.describe('HEYS local PIN auth smoke', () => {
    test.skip(!hasHeysPinCredentials(), 'Set HEYS_TEST_PHONE and HEYS_TEST_PIN in .env.local');

    test('logs in via local env credentials and restores PIN session', async ({ page }) => {
        const clientId = await loginWithHeysPin(page);

        expect(clientId).toBeTruthy();

        await expect(page.getByRole('button', { name: '➕ Добавить приём пищи' })).toBeVisible();

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
