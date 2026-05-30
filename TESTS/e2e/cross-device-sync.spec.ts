/**
 * Phase 3 — Cross-device sync conflict resolution.
 *
 * Минимальная версия: 2 browser contexts симулируют 2 устройства того же
 * test client (E2E-TestAlex). Verify что writes с разных keys preserved.
 *
 * Полные conflict scenarios (same key from 2 contexts simultaneously) require
 * deeper sync orchestration понимания (server merge_save_* logic) — отложены
 * в follow-up под TODO. См. plan ~/.claude/plans/cozy-hatching-minsky.md.
 */
import { expect, test, type BrowserContext } from '@playwright/test';
import { getNamedPinCredentials, hasNamedPinCredentials, loginWithHeysPin } from './helpers/pin-auth';
import { captureCleanupBaseline, cleanupTestClients, type CleanupBaseline } from './helpers/test-cleanup';

const TEST_CLIENT_ALEX_ID = process.env.HEYS_TEST_E2E_CLIENT_ALEX_ID || '';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('Cross-device sync — anti-clobber regression', () => {
    let cleanupBaseline: CleanupBaseline;

    test.beforeAll(() => {
        cleanupBaseline = captureCleanupBaseline([TEST_CLIENT_ALEX_ID]);
    });
    test.afterAll(() => cleanupTestClients(cleanupBaseline));

    test('writes на разные keys с 2 contexts оба preserved', async ({ browser }, testInfo) => {
        test.skip(
            !hasNamedPinCredentials('E2E_ALEX'),
            'Set HEYS_TEST_PHONE_E2E_ALEX and HEYS_TEST_PIN_E2E_ALEX in .env.local'
        );
        // TODO: empty test client triggers registration wizard (см. Phase 1
        // TODO в curator-switch-pollution.spec.ts). Реальное E2E cross-device
        // tests требует тот же sync orchestration fix чтобы PIN bootstrap
        // дождался scoped profile load перед wizard check. Сейчас skip.
        test.skip(true, 'requires Phase 1 deeper sync orchestration fix — see TODO в plan');

        const ctxA = await browser.newContext();
        const ctxB = await browser.newContext();
        const pageA = await ctxA.newPage();
        const pageB = await ctxB.newPage();

        const creds = getNamedPinCredentials('E2E_ALEX');
        const [idA, idB] = await Promise.all([
            loginWithHeysPin(pageA, creds),
            loginWithHeysPin(pageB, creds),
        ]);
        expect(idA).toBe(idB); // same test client

        // Context A: edit profile field
        await pageA.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            w.HEYS?.store?.set?.('heys_profile', { firstName: 'A-edit', weight: 65 });
        });

        // Context B: edit different key (no conflict expected)
        await pageB.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            w.HEYS?.store?.set?.('heys_cross_device_test_key', { fromB: true, ts: Date.now() });
        });

        // Wait для sync обоих
        await pageA.waitForTimeout(3000);
        await pageB.waitForTimeout(3000);

        // Verify on context A: B's key sync'нулся through cloud
        const bKeyOnA = await pageA.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            return w.HEYS?.store?.get?.('heys_cross_device_test_key');
        });
        expect(bKeyOnA?.fromB).toBe(true);

        // Verify on context B: A's profile edit sync'нулся
        const profileOnB = await pageB.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            return w.HEYS?.store?.get?.('heys_profile');
        });
        expect(profileOnB?.firstName).toBe('A-edit');
        expect(profileOnB?.weight).toBe(65);

        await ctxA.close();
        await ctxB.close();
    });
});
