import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

import { cleanupTestClients, captureCleanupBaseline, type CleanupBaseline } from './helpers/test-cleanup';
import { seedMorningCheckinFixture, type MorningFixture } from './helpers/morning-checkin-fixture';
import { getNamedPinCredentials, hasNamedPinCredentials, loginWithHeysPin } from './helpers/pin-auth';

const TEST_CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const STABLE_FRAME_BUDGET_MS = 3_000;
const STEP_TRANSITION_BUDGET_MS = 2_000;
const OFFLINE_RESUME_BUDGET_MS = 20_000;

type ProbeSnapshot = {
    syncAt: number | null;
    firstStableStepAt: number | null;
    blankFrames: Array<{ at: number; stepId: string | null; title: string; content: string }>;
    savingSeen: boolean;
    statuses: Array<{ at: number; detail: any }>;
    completes: number;
};

const E2E_LOCAL_PROFILE = {
    firstName: 'E2E TestAlex', lastName: 'Test', gender: 'Женский', age: 30,
    height: 165, weight: 60, birthDate: '1995-01-01', birthDay: 1,
    birthMonth: 1, birthYear: 1995, profileCompleted: true, desktopAllowed: true,
    defaultTab: 'diary', stepsGoal: 10000, sleepHours: 8, baseWeight: 60,
    weightGoal: 60, subscriptionStatus: 'active', updatedAt: 1,
};

async function installProbe(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
        const probe = {
            syncAt: null as number | null,
            firstStableStepAt: null as number | null,
            blankFrames: [] as Array<{ at: number; stepId: string | null; title: string; content: string }>,
            savingSeen: false,
            statuses: [] as Array<{ at: number; detail: any }>,
            completes: 0,
        };
        (window as any).__heysMorningE2E = probe;
        window.addEventListener('heysSyncCompleted', () => {
            if (probe.syncAt === null) probe.syncAt = performance.now();
        });
        window.addEventListener('heys:morning-checkin-status', (event: Event) => {
            probe.statuses.push({ at: performance.now(), detail: (event as CustomEvent).detail || null });
        });
        window.addEventListener('heys:checkin-complete', (event: Event) => {
            if ((event as CustomEvent).detail?.type === 'morning') probe.completes += 1;
        });
        let pendingFrame = 0;
        const inspectFrame = () => {
            pendingFrame = 0;
            const modal = document.querySelector<HTMLElement>('[data-heys-step-modal="true"]');
            if (!modal) return;
            const stepId = modal.dataset.heysStepId || null;
            const title = modal.querySelector<HTMLElement>('.mc-header-title')?.innerText?.trim() || '';
            const content = modal.querySelector<HTMLElement>('.mc-step-content')?.innerText?.trim() || '';
            if (modal.dataset.heysSaving === 'true') probe.savingSeen = true;
            if (stepId && title && content && probe.firstStableStepAt === null) {
                probe.firstStableStepAt = performance.now();
            }
            if (!stepId || !title || !content) {
                probe.blankFrames.push({ at: performance.now(), stepId, title, content });
            }
        };
        const inspect = () => {
            const modal = document.querySelector<HTMLElement>('[data-heys-step-modal="true"]');
            if (modal?.dataset.heysSaving === 'true') probe.savingSeen = true;
            if (pendingFrame) return;
            pendingFrame = requestAnimationFrame(inspectFrame);
        };
        const startObserver = () => {
            if (!document.documentElement) return;
            new MutationObserver(inspect).observe(document.documentElement, {
                childList: true, subtree: true, attributes: true, characterData: true,
            });
            inspect();
        };
        if (document.documentElement) startObserver();
        else window.addEventListener('DOMContentLoaded', startObserver, { once: true });
    });
}

async function seedLocalFixtureNamespace(context: BrowserContext): Promise<void> {
    await context.addInitScript(({ clientId, profile }) => {
        const fixtureProfile = { ...profile, _sourceClientId: clientId };
        const serialized = JSON.stringify(fixtureProfile);
        localStorage.setItem(`heys_${clientId}_profile`, serialized);
        // This browser context is created only for the fixed E2E client. Seeding
        // the compatibility key prevents anonymous boot from queueing an empty
        // profile before PIN establishes the scoped namespace.
        localStorage.setItem('heys_profile', serialized);
    }, { clientId: TEST_CLIENT_ID, profile: E2E_LOCAL_PROFILE });
}

async function currentStepId(page: Page): Promise<string> {
    const modal = page.locator('[data-heys-step-modal="true"]');
    await expect(modal).toBeVisible({ timeout: 30_000 });
    return (await modal.getAttribute('data-heys-step-id', { timeout: 30_000 })) || '';
}

async function readStartupDiagnostics(page: Page): Promise<Record<string, unknown>> {
    return page.evaluate(() => {
        const heys = (window as any).HEYS;
        const wrap = document.querySelector<HTMLElement>('.wrap');
        return {
            clientId: heys?.currentClientId || null,
            consentsChecked: heys?._consentsChecked ?? null,
            consentsValid: heys?._consentsValid ?? null,
            consentError: heys?._consentsCheckError || null,
            shouldShowMorningCheckin: heys?.shouldShowMorningCheckin?.() ?? null,
            hasMorningCheckin: typeof heys?.MorningCheckin === 'function',
            hasStepModal: typeof heys?.StepModal === 'function',
            modalStepId: document.querySelector<HTMLElement>('[data-heys-step-modal="true"]')?.dataset.heysStepId || null,
            wrapDisplay: wrap ? getComputedStyle(wrap).display : null,
            registrationInProgress: localStorage.getItem('heys_registration_in_progress'),
            currentClientStorage: localStorage.getItem('heys_client_current'),
            profile: heys?.utils?.lsGet?.('heys_profile', null) || null,
        };
    });
}

async function readProbe(page: Page): Promise<ProbeSnapshot> {
    return page.evaluate(() => ({ ...(window as any).__heysMorningE2E }));
}

async function readProgress(page: Page, fixture: MorningFixture): Promise<any> {
    return page.evaluate(({ dateKey, clientId }) => {
        return (window as any).HEYS?.MorningCheckinUtils?.readMorningProgress?.(dateKey, clientId) || null;
    }, { dateKey: fixture.today, clientId: TEST_CLIENT_ID });
}

async function readProgressDiagnostics(page: Page, fixture: MorningFixture): Promise<Record<string, unknown>> {
    return page.evaluate(({ dateKey, clientId }) => {
        const heys = (window as any).HEYS;
        const logicalKey = `heys_morning_checkin_progress_v1_${dateKey}`;
        const canonicalKey = `heys_${clientId}_morning_checkin_progress_v1_${dateKey}`;
        const legacyKey = `heys_${clientId}_${logicalKey}`;
        const decode = (key: string) => {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            try {
                return heys?.store?.decompress?.(raw) ?? JSON.parse(raw);
            } catch (error) {
                return { error: String(error), raw: raw.slice(0, 500) };
            }
        };
        return {
            currentClientId: heys?.currentClientId || null,
            logicalKey,
            canonicalKey,
            legacyKey,
            apiRead: heys?.MorningCheckinUtils?.readMorningProgress?.(dateKey, clientId) || null,
            storeRead: heys?.store?.readSafe?.(canonicalKey, null) || null,
            canonical: decode(canonicalKey),
            legacy: decode(legacyKey),
            pendingCount: heys?.cloud?.getPendingCount?.() ?? null,
            syncStatus: heys?.cloud?.getSyncStatus?.(logicalKey) || null,
            saveHistory: (heys?.cloud?._saveClientKeyHistory || [])
                .filter((row: any) => String(row?.key || row?.k || '').includes('morning_checkin_progress'))
                .slice(-12),
        };
    }, { dateKey: fixture.today, clientId: TEST_CLIENT_ID });
}

async function clickCurrentStep(page: Page, stepId: string, doubleTap: boolean): Promise<void> {
    if (stepId === 'yesterdayVerify') {
        await page.getByRole('button', { name: /Дозаполнить позже/ }).click({ timeout: 10_000 });
    }
    const headerPrimary = page.locator('.mc-header-btn--primary:visible');
    const customContinue = page.getByRole('button', { name: 'Продолжить', exact: true });
    const target = await headerPrimary.count() ? headerPrimary : customContinue;
    await expect(target).toBeVisible();
    if (doubleTap) await target.dblclick({ delay: 15, timeout: 10_000 });
    else await target.click({ timeout: 10_000 });
}

async function waitForTransition(page: Page, previousStepId: string): Promise<string | null> {
    await expect.poll(async () => {
        const modal = page.locator('[data-heys-step-modal="true"]');
        if (!await modal.count()) return '__closed__';
        return await modal.getAttribute('data-heys-step-id');
    }, { timeout: 30_000 }).not.toBe(previousStepId);
    const modal = page.locator('[data-heys-step-modal="true"]');
    return await modal.count() ? await modal.getAttribute('data-heys-step-id') : null;
}

async function reopen(context: BrowserContext, page: Page, offline: boolean): Promise<Page> {
    await page.close();
    const next = await context.newPage();
    await next.goto('/', { waitUntil: 'load', timeout: 90_000 });
    if (offline) {
        await expect(next.locator('[data-heys-step-modal="true"]')).toBeVisible({ timeout: OFFLINE_RESUME_BUDGET_MS });
    } else {
        await expect(next.locator('[data-heys-step-modal="true"]')).toBeVisible();
    }
    return next;
}

async function waitForOfflineShell(page: Page): Promise<void> {
    await page.evaluate(async () => {
        if (!('serviceWorker' in navigator) || !('caches' in window)) {
            throw new Error('Offline reload requires Service Worker and Cache Storage');
        }
        const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
            return Promise.race([
                promise,
                new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), timeoutMs)),
            ]);
        };
        // HEYS deliberately skips SW registration on localhost for normal dev.
        // This dedicated context opts in directly so the E2E can exercise the
        // production offline shell without changing local developer behavior.
        const existing = await navigator.serviceWorker.getRegistration('/');
        if (!existing) {
            await withTimeout(
                navigator.serviceWorker.register('/sw.js'),
                20_000,
                'Service Worker registration timed out',
            );
        }
        await withTimeout(
            navigator.serviceWorker.ready,
            20_000,
            'Service Worker readiness timed out',
        );
        if (!navigator.serviceWorker.controller) {
            await withTimeout(new Promise<void>((resolve) => {
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    resolve();
                }, { once: true });
            }), 20_000, 'Service Worker did not take control');
        }
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
            if (await caches.match('/index.html')) return;
            await new Promise((resolve) => window.setTimeout(resolve, 100));
        }
        throw new Error('Service Worker did not precache the offline app shell');
    });
}

test.describe('isolated morning check-in', () => {
    let baseline: CleanupBaseline;
    let fixture: MorningFixture;

    test.beforeAll(() => {
        const configuredId = process.env.HEYS_TEST_E2E_CLIENT_ALEX_ID || '';
        if (configuredId && configuredId !== TEST_CLIENT_ID) {
            throw new Error(`HEYS_TEST_E2E_CLIENT_ALEX_ID must be the dedicated fixture ${TEST_CLIENT_ID}`);
        }
        baseline = captureCleanupBaseline([TEST_CLIENT_ID]);
        if (!baseline.snapshotOk) throw new Error('Could not capture the isolated E2E client snapshot');
        fixture = seedMorningCheckinFixture(TEST_CLIENT_ID);
    });

    test.afterAll(() => cleanupTestClients(baseline));

    test('PIN → reload every step → offline queue → cloud read-back', async ({ context, page }, testInfo: TestInfo) => {
        test.skip(!hasNamedPinCredentials('E2E_ALEX'), 'Dedicated E2E-TestAlex PIN credentials are required');
        await installProbe(context);
        await seedLocalFixtureNamespace(context);
        const credentials = getNamedPinCredentials('E2E_ALEX');
        const clientId = await loginWithHeysPin(page, credentials);
        expect(clientId).toBe(TEST_CLIENT_ID);

        let activePage = page;
        try {
            await expect(activePage.locator('[data-heys-step-modal="true"]')).toBeVisible({ timeout: 30_000 });
        } catch (error) {
            await testInfo.attach('startup-diagnostics.json', {
                body: JSON.stringify(await readStartupDiagnostics(activePage), null, 2),
                contentType: 'application/json',
            });
            throw error;
        }
        await expect(activePage.getByRole('heading', { name: '🎂 Подтвердите возраст' })).toHaveCount(0);
        await expect.poll(async () => (await readProbe(activePage)).firstStableStepAt).not.toBeNull();
        const initialProbe = await readProbe(activePage);
        expect(initialProbe.syncAt, 'first stable frame must follow a completed cloud snapshot').not.toBeNull();
        expect(initialProbe.firstStableStepAt).not.toBeNull();
        const firstStableFrameMs = Math.round((initialProbe.firstStableStepAt || 0) - (initialProbe.syncAt || 0));
        expect(firstStableFrameMs).toBeGreaterThanOrEqual(0);
        expect(firstStableFrameMs).toBeLessThanOrEqual(STABLE_FRAME_BUDGET_MS);
        expect(initialProbe.blankFrames, 'modal must never expose a blank/intermediate step frame').toEqual([]);

        const transitionMeasurements: Array<{ stepId: string; elapsedMs: number; offline: boolean }> = [];
        const savedCounts = new Map<string, number>();
        const visited = new Set<string>();
        let sawYesterdayVerify = false;
        let offlineCovered = false;
        let completionEvents = 0;

        for (let index = 0; index < 24; index += 1) {
            const stepId = await currentStepId(activePage);
            expect(stepId, 'step must have a deterministic id').toBeTruthy();
            visited.add(stepId);

            if (stepId === 'yesterdayVerify') {
                sawYesterdayVerify = true;
                const before = await readProgress(activePage, fixture);
                await activePage.locator('.mc-header-btn--primary:visible').click();
                await expect(activePage.locator('[data-heys-step-modal="true"][data-heys-step-id="yesterdayVerify"]')).toBeVisible();
                const after = await readProgress(activePage, fixture);
                expect(after?.steps?.yesterdayVerify?.status || null).toBe(before?.steps?.yesterdayVerify?.status || null);
            }

            const makeOffline = !offlineCovered && stepId === 'sleepQuality';
            if (makeOffline) {
                await waitForOfflineShell(activePage);
                await context.setOffline(true);
                offlineCovered = true;
            }
            const startedAt = Date.now();
            await clickCurrentStep(activePage, stepId, stepId === 'weight');
            const nextStepId = await waitForTransition(activePage, stepId);
            const elapsedMs = Date.now() - startedAt;
            transitionMeasurements.push({ stepId, elapsedMs, offline: makeOffline });
            expect(elapsedMs).toBeLessThanOrEqual(STEP_TRANSITION_BUDGET_MS);

            const progress = await readProgress(activePage, fixture);
            const row = progress?.steps?.[stepId];
            if (!['saved_local', 'synced', 'skipped'].includes(row?.status)) {
                await testInfo.attach(`progress-${stepId}-diagnostics.json`, {
                    body: JSON.stringify(await readProgressDiagnostics(activePage, fixture), null, 2),
                    contentType: 'application/json',
                });
            }
            expect(['saved_local', 'synced', 'skipped']).toContain(row?.status);
            savedCounts.set(stepId, (savedCounts.get(stepId) || 0) + 1);
            expect(savedCounts.get(stepId), `${stepId} must be acknowledged exactly once`).toBe(1);

            const probe = await readProbe(activePage);
            expect(probe.savingSeen, `${stepId} must expose the saving state`).toBeTruthy();
            expect(probe.blankFrames, `${stepId} transition exposed an empty frame`).toEqual([]);
            completionEvents += probe.completes;

            if (!nextStepId) break;
            activePage = await reopen(context, activePage, makeOffline);
            expect(await currentStepId(activePage)).toBe(nextStepId);
            if (makeOffline) {
                const offlineProgress = await readProgress(activePage, fixture);
                expect(offlineProgress?.steps?.[stepId]?.status).toBe('saved_local');
                expect(offlineProgress?.steps?.[stepId]?.cloudPending).toBe(true);
                await context.setOffline(false);
                await expect.poll(async () => activePage.evaluate(({ dateKey, clientId, savedStepId }) => {
                    const heys = (window as any).HEYS;
                    const restoredProgress = heys?.MorningCheckinUtils?.readMorningProgress?.(dateKey, clientId);
                    return {
                        pending: heys?.cloud?.getPendingCount?.() ?? -1,
                        stepStatus: restoredProgress?.steps?.[savedStepId]?.status || null,
                    };
                }, { dateKey: fixture.today, clientId: TEST_CLIENT_ID, savedStepId: stepId }), {
                    timeout: 45_000,
                    intervals: [250, 500, 1_000],
                    message: 'network restore must automatically drain the queue and acknowledge the offline step',
                }).toEqual({ pending: 0, stepStatus: 'synced' });
            }
        }

        expect(sawYesterdayVerify, 'fixture must force the mandatory past-days decision').toBeTruthy();
        expect(offlineCovered, 'scenario must include an offline save/reload').toBeTruthy();
        expect(visited.size).toBeGreaterThanOrEqual(6);
        expect(completionEvents, 'morning flow must complete once').toBe(1);

        const cloudResult = await activePage.evaluate(async ({ clientId, dayKey, progressKey }) => {
            const heys = (window as any).HEYS;
            let drained = true;
            let flushPasses = 0;
            // The first drain acknowledges the data writes and intentionally
            // enqueues the final journal transition `saved_local → synced`.
            // Drain that acknowledgement too before cloud read-back.
            for (let pass = 0; pass < 4; pass += 1) {
                flushPasses = pass + 1;
                drained = (await heys.cloud.flushPendingQueue(30_000)) && drained;
                await new Promise((resolve) => window.setTimeout(resolve, 100));
                const local = heys.MorningCheckinUtils.readMorningProgress(dayKey.slice('heys_dayv2_'.length), clientId);
                if (heys.cloud.getPendingCount() === 0 && local?.steps?.__flow__?.status === 'synced') break;
            }
            const [day, progress] = await Promise.all([
                heys.YandexAPI.getKV(clientId, dayKey),
                heys.YandexAPI.getKV(clientId, progressKey),
            ]);
            return {
                drained,
                flushPasses,
                pending: heys.cloud.getPendingCount(),
                dayResponse: day,
                progressResponse: progress,
                day: day?.data || null,
                progress: progress?.data || null,
                localProgress: heys.MorningCheckinUtils.readMorningProgress(dayKey.slice('heys_dayv2_'.length), clientId),
                saveClientKeyHistory: (heys.cloud._saveClientKeyHistory || [])
                    .filter((row: any) => String(row?.k || '').includes('morning_checkin_progress'))
                    .slice(-20),
                writeHistory: (heys.cloud._writeHistory || [])
                    .filter((row: any) => String(row?.k || '').includes('morning_checkin_progress'))
                    .slice(-20),
            };
        }, { clientId: TEST_CLIENT_ID, dayKey: `heys_dayv2_${fixture.today}`, progressKey: fixture.progressKey });
        await testInfo.attach('morning-checkin-cloud-read-back.json', {
            body: JSON.stringify(cloudResult, null, 2),
            contentType: 'application/json',
        });
        expect(cloudResult.drained).toBe(true);
        expect(cloudResult.pending).toBe(0);
        expect(cloudResult.day?.date).toBe(fixture.today);
        expect(cloudResult.day?.weightMorning).toBeTruthy();
        expect(cloudResult.day?.sleepQuality).toBeTruthy();
        expect(cloudResult.progress?.steps?.__flow__?.status).toBe('synced');
        expect(cloudResult.localProgress?.steps?.__flow__?.status).toBe('synced');

        const uniqueSaved = Object.fromEntries(savedCounts.entries());
        expect(Object.values(uniqueSaved).every((count) => count === 1)).toBeTruthy();
        console.info('[morning-checkin-e2e] metrics', JSON.stringify({
            firstStableFrameMs,
            transitionMeasurements,
            visitedSteps: Array.from(visited),
            savedCounts: uniqueSaved,
        }));
        await testInfo.attach('morning-checkin-performance.json', {
            body: JSON.stringify({
                budgets: { stableFrameMs: STABLE_FRAME_BUDGET_MS, stepTransitionMs: STEP_TRANSITION_BUDGET_MS, offlineResumeMs: OFFLINE_RESUME_BUDGET_MS },
                firstStableFrameMs,
                transitionMeasurements,
                visitedSteps: Array.from(visited),
                savedCounts: uniqueSaved,
            }, null, 2),
            contentType: 'application/json',
        });
    });
});
