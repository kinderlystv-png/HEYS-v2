import { expect, test } from '@playwright/test';

test.describe('write-context wake recovery', () => {
    test('creates a chrono activity after wake without red sync toast or lock overlay', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => {
            const w = window as typeof window & { HEYS?: any };
            return Boolean(
                w.HEYS?.Planning?.Store?.addChronoActivity &&
                w.HEYS?.cloud?.saveClientKey &&
                w.HEYS?.YandexAPI
            );
        });

        const result = await page.evaluate(async () => {
            const w = window as typeof window & { HEYS?: any };
            const clientId = '11111111-1111-4111-8111-111111111111';
            const rpcCalls: string[] = [];
            const syncErrors: any[] = [];
            let planningUpdated = false;

            const originalRpc = w.HEYS.YandexAPI.rpc;
            const onSyncError = (event: Event) => {
                syncErrors.push((event as CustomEvent).detail);
            };
            const onPlanningUpdated = () => {
                planningUpdated = true;
            };

            try {
                localStorage.setItem('heys_pin_auth_client', clientId);
                localStorage.setItem('heys_client_current', clientId);
                w.HEYS.currentClientId = clientId;
                w.HEYS.cloud.setPinAuthClient?.(clientId);
                w.HEYS.cloud._writeContext = null;

                w.HEYS.YandexAPI.rpc = async (fn: string, params?: unknown) => {
                    rpcCalls.push(String(fn));
                    if (String(fn).startsWith('issue_write_context')) {
                        return {
                            data: null,
                            error: {
                                code: 'temporary_write_context_miss',
                                message: 'temporary write-context miss',
                            },
                        };
                    }
                    return originalRpc ? originalRpc(fn, params) : { data: null, error: null };
                };

                window.addEventListener('heys:sync-error', onSyncError);
                window.addEventListener('heys:planning-updated', onPlanningUpdated);

                document.dispatchEvent(new Event('visibilitychange'));
                window.dispatchEvent(new Event('focus'));
                window.dispatchEvent(new Event('pageshow'));

                const activity = w.HEYS.Planning.Store.addChronoActivity({
                    name: 'Wake smoke ' + Date.now(),
                    emoji: 'T',
                });

                await new Promise((resolve) => setTimeout(resolve, 2400));

                const bodyText = document.body?.textContent || '';
                const redSyncToastVisible = Array.from(document.querySelectorAll('.heys-toast, [role="alert"]'))
                    .some((node) => (node.textContent || '').includes('Ошибка синхронизации'));
                const syncLockOverlayVisible = Boolean(document.querySelector('.sync-lock-overlay'));
                const activityStillLocal = w.HEYS.Planning.Store.getChronoActivities()
                    .some((item: any) => item && item.id === activity?.id);

                return {
                    activityOk: Boolean(activity?.id),
                    activityStillLocal,
                    planningUpdated,
                    pendingCount: w.HEYS.cloud.getPendingCount?.() || 0,
                    retryScheduled: w.HEYS._writeContextBackgroundRetryScheduled || 0,
                    retryAttempts: w.HEYS._writeContextBackgroundRetryAttempts || 0,
                    syncErrors,
                    rpcCalls,
                    redSyncToastVisible,
                    syncLockOverlayVisible,
                    bodyHasSyncError: bodyText.includes('Ошибка синхронизации'),
                };
            } finally {
                window.removeEventListener('heys:sync-error', onSyncError);
                window.removeEventListener('heys:planning-updated', onPlanningUpdated);
                w.HEYS.YandexAPI.rpc = originalRpc;
            }
        });

        expect(result.activityOk).toBeTruthy();
        expect(result.activityStillLocal).toBeTruthy();
        expect(result.planningUpdated).toBeTruthy();
        expect(result.pendingCount).toBeGreaterThan(0);
        expect(result.retryScheduled).toBeGreaterThan(0);
        expect(result.rpcCalls.some((fn) => fn.startsWith('issue_write_context'))).toBeTruthy();
        expect(result.syncErrors).toContainEqual(expect.objectContaining({
            error: 'write_context_unavailable',
            kind: 'transient_sync',
            severity: 'background',
            persistent: false,
        }));
        expect(result.redSyncToastVisible).toBeFalsy();
        expect(result.bodyHasSyncError).toBeFalsy();
        expect(result.syncLockOverlayVisible).toBeFalsy();
    });
});
