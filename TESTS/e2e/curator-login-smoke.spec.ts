import { expect, test } from '@playwright/test';

import { hasCuratorCredentials, loginAsCurator } from './helpers/curator-auth';

test.describe('Curator login smoke', () => {
    test.skip(!hasCuratorCredentials(), 'Set HEYS_TEST_CURATOR_EMAIL and HEYS_TEST_CURATOR_PASSWORD in .env.local');

    test('logs in via curator form and reaches curator session', async ({ page }) => {
        const curator = await loginAsCurator(page);
        expect(curator.userId).toBeTruthy();

        await expect
            .poll(async () =>
                page.evaluate(() => {
                    const w = window as typeof window & { HEYS?: { auth?: { isCuratorSession?: () => boolean } } };
                    return typeof w.HEYS?.auth?.isCuratorSession === 'function'
                        ? w.HEYS.auth.isCuratorSession()
                        : false;
                })
            )
            .toBe(true);
    });
});
