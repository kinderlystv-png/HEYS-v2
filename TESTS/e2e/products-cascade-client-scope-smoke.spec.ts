/**
 * PRODUCTS_AND_SEARCH.md — каскад при правке карточки: только dayv2 текущего клиента.
 * Инцидент 2026-08-23 · isDayv2KeyForCurrentClient в __collectCascadeDayKeys().
 */
import { expect, test } from '@playwright/test';

import {
    enterCuratorClientFromPanel,
    hasCuratorCredentials,
    loginAsCurator,
    switchCuratorToClient,
} from './helpers/curator-auth';
import { getNamedPinCredentials, hasNamedPinCredentials, loginWithHeysPin } from './helpers/pin-auth';
import { captureCleanupBaseline, cleanupTestClients, type CleanupBaseline } from './helpers/test-cleanup';

const ALEX_ID = process.env.HEYS_TEST_E2E_CLIENT_ALEX_ID || '11111111-1111-1111-1111-111111111111';
const POPL_ID = process.env.HEYS_TEST_E2E_CLIENT_POPL_ID || '22222222-2222-2222-2222-222222222222';
const ALEX_NAME = String(process.env.HEYS_TEST_E2E_CLIENT_ALEX_NAME || 'E2E-TestAlex').trim();
const POPL_NAME = String(process.env.HEYS_TEST_E2E_CLIENT_POPL_NAME || 'E2E-TestPopl').trim();

const PRODUCT_ID = 'e2e-cascade-scope-product';
const NAME_BEFORE = 'E2E Cascade Before';
const NAME_AFTER = 'E2E Cascade After';

type CascadeSeed = {
    ownScopedKey: string;
    legacyKey: string;
    foreignScopedKey: string;
    pollutionKey: string;
};

type CascadeRunResult = {
    ok: boolean;
    reason?: string;
    dayKeys?: string[];
    names?: Record<string, string | null>;
};

function dayPayload(productName: string) {
    return {
        meals: [
            {
                name: 'Завтрак',
                time: '08:00',
                items: [
                    {
                        product_id: PRODUCT_ID,
                        name: productName,
                        grams: 100,
                        kcal100: 120,
                        protein100: 10,
                        fat100: 5,
                        simple100: 3,
                    },
                ],
            },
        ],
        updatedAt: Date.now(),
    };
}

async function expectCascadeDebugReady(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(async () => {
        const w = window as typeof window & { HEYS?: { __loadPostboot3Ui?: () => Promise<unknown> } };
        if (typeof w.HEYS?.__loadPostboot3Ui === 'function') {
            await w.HEYS.__loadPostboot3Ui().catch(() => null);
        }
    });
    await expect.poll(async () => {
        return page.evaluate(() => {
            const w = window as typeof window & {
                HEYS?: {
                    currentClientId?: string;
                    dayUtils?: { isDayv2KeyForCurrentClient?: unknown };
                    debug?: { cascadeMealItemsOnProductUpdate?: unknown; collectCascadeDayKeys?: unknown };
                };
            };
            return Boolean(
                w.HEYS?.currentClientId
                && typeof w.HEYS.dayUtils?.isDayv2KeyForCurrentClient === 'function'
                && typeof w.HEYS.debug?.cascadeMealItemsOnProductUpdate === 'function'
                && typeof w.HEYS.debug?.collectCascadeDayKeys === 'function',
            );
        });
    }, { timeout: 90_000 }).toBe(true);
}

async function seedCascadeDays(page: import('@playwright/test').Page, clientId: string, otherClientId: string): Promise<CascadeSeed> {
    return page.evaluate(
        ({ cid, otherId, payload }) => {
            const w = window as typeof window & {
                HEYS?: { store?: { set?: (k: string, v: unknown) => void }; utils?: { lsSet?: (k: string, v: unknown) => void } };
            };
            const writeOwnDay = (key: string) => {
                if (w.HEYS?.store?.set) w.HEYS.store.set(key, payload);
                else if (w.HEYS?.utils?.lsSet) w.HEYS.utils.lsSet(key, payload);
                else localStorage.setItem(key, JSON.stringify(payload));
            };
            const writeForeignDay = (key: string) => {
                localStorage.setItem(key, JSON.stringify(payload));
            };
            const ownScopedKey = `heys_${cid}_dayv2_2026-08-20`;
            const legacyKey = `heys_dayv2_${'2026-08-21'}`;
            const foreignScopedKey = `heys_${otherId}_dayv2_2026-08-20`;
            const pollutionKey = `heys_${cid}_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb_dayv2_2026-08-22`;
            writeOwnDay(ownScopedKey);
            writeForeignDay(legacyKey);
            writeForeignDay(foreignScopedKey);
            writeForeignDay(pollutionKey);
            return { ownScopedKey, legacyKey, foreignScopedKey, pollutionKey };
        },
        { cid: clientId, otherId: otherClientId, payload: dayPayload(NAME_BEFORE) },
    );
}

async function runCascadeRename(page: import('@playwright/test').Page, keys: CascadeSeed): Promise<CascadeRunResult> {
    return page.evaluate(
        ({ productId, before, after, trackKeys, ownKey, foreignKeys }) => {
            const w = window as typeof window & {
                HEYS?: {
                    store?: { get?: (k: string, fb: unknown) => unknown };
                    debug?: {
                        cascadeMealItemsOnProductUpdate?: (oldP: object, newP: object) => void;
                        collectCascadeDayKeys?: () => string[];
                    };
                };
            };
            const cascade = w.HEYS?.debug?.cascadeMealItemsOnProductUpdate;
            const collect = w.HEYS?.debug?.collectCascadeDayKeys;
            if (typeof cascade !== 'function' || typeof collect !== 'function') {
                return { ok: false, reason: 'debug_cascade_missing' };
            }

            const dayKeys = collect();
            cascade(
                { id: productId, name: before, kcal100: 120, protein100: 10, fat100: 5, simple100: 3 },
                { id: productId, name: after, kcal100: 120, protein100: 10, fat100: 5, simple100: 3 },
            );

            const readOwnName = (key: string) => {
                try {
                    if (w.HEYS?.store?.get) {
                        const day = w.HEYS.store.get(key, null) as { meals?: { items?: { name?: string }[] }[] } | null;
                        if (day?.meals?.[0]?.items?.[0]?.name) return day.meals[0].items[0].name;
                    }
                    const raw = localStorage.getItem(key);
                    if (!raw) return null;
                    const day = JSON.parse(raw) as { meals?: { items?: { name?: string }[] }[] };
                    return day?.meals?.[0]?.items?.[0]?.name ?? null;
                } catch {
                    return null;
                }
            };

            const readRawLsName = (key: string) => {
                try {
                    const raw = localStorage.getItem(key);
                    if (!raw) return null;
                    const day = JSON.parse(raw) as { meals?: { items?: { name?: string }[] }[] };
                    return day?.meals?.[0]?.items?.[0]?.name ?? null;
                } catch {
                    return null;
                }
            };

            const names: Record<string, string | null> = {};
            for (const key of trackKeys as string[]) {
                if (key === ownKey) names[key] = readOwnName(key);
                else if ((foreignKeys as string[]).includes(key)) names[key] = readRawLsName(key);
                else names[key] = readOwnName(key);
            }

            return { ok: true, dayKeys, names };
        },
        {
            productId: PRODUCT_ID,
            before: NAME_BEFORE,
            after: NAME_AFTER,
            trackKeys: [keys.ownScopedKey, keys.legacyKey, keys.foreignScopedKey, keys.pollutionKey],
            ownKey: keys.ownScopedKey,
            foreignKeys: [keys.legacyKey, keys.foreignScopedKey, keys.pollutionKey],
        },
    );
}

test.describe('Products · cascade client-scope smoke', () => {
    let cleanupBaseline: CleanupBaseline;

    test.beforeAll(() => {
        cleanupBaseline = captureCleanupBaseline([ALEX_ID, POPL_ID]);
    });

    test.afterAll(() => {
        cleanupTestClients(cleanupBaseline);
    });

    test('PIN Alex — rename cascades only scoped + legacy own dayv2', async ({ page }) => {
        test.skip(!hasNamedPinCredentials('E2E_ALEX'), 'E2E PIN credentials required (.env.local)');

        const clientId = await loginWithHeysPin(page, getNamedPinCredentials('E2E_ALEX'));
        expect(clientId.toLowerCase()).toBe(ALEX_ID.toLowerCase());
        await expectCascadeDebugReady(page);

        const keys = await seedCascadeDays(page, clientId, POPL_ID);
        const result = await runCascadeRename(page, keys);

        expect(result.ok, JSON.stringify(result)).toBe(true);
        expect(result.dayKeys).toContain(keys.ownScopedKey);
        expect(result.dayKeys).not.toContain(keys.foreignScopedKey);
        expect(result.dayKeys).not.toContain(keys.pollutionKey);
        expect(result.names?.[keys.ownScopedKey]).toBe(NAME_AFTER);
        expect(result.names?.[keys.foreignScopedKey]).toBe(NAME_BEFORE);
        expect(result.names?.[keys.pollutionKey]).toBe(NAME_BEFORE);
    });

    test('Curator switch — cascade scoped per active client (Alex → Popl)', async ({ page }) => {
        test.skip(!hasCuratorCredentials(), 'Curator credentials required (.env.local)');
        test.skip(!ALEX_NAME || !POPL_NAME, 'HEYS_TEST_E2E_CLIENT_*_NAME required');

        await loginAsCurator(page);
        const alexId = await enterCuratorClientFromPanel(page, ALEX_NAME);
        expect(alexId.toLowerCase()).toBe(ALEX_ID.toLowerCase());
        await expectCascadeDebugReady(page);

        const alexKeys = await seedCascadeDays(page, alexId, POPL_ID);
        let result = await runCascadeRename(page, alexKeys);
        expect(result.ok, JSON.stringify(result)).toBe(true);
        expect(result.names?.[alexKeys.ownScopedKey]).toBe(NAME_AFTER);
        expect(result.names?.[alexKeys.foreignScopedKey]).toBe(NAME_BEFORE);

        const poplId = await switchCuratorToClient(page, POPL_NAME).catch(async () => {
            await page.getByRole('button', { name: '←' }).click({ timeout: 10_000 });
            await page.waitForLoadState('load', { timeout: 60_000 });
            return enterCuratorClientFromPanel(page, POPL_NAME);
        });
        expect(poplId.toLowerCase()).toBe(POPL_ID.toLowerCase());
        await expectCascadeDebugReady(page);

        const poplKeys = await seedCascadeDays(page, poplId, alexId);
        result = await runCascadeRename(page, poplKeys);
        expect(result.ok, JSON.stringify(result)).toBe(true);
        expect(result.names?.[poplKeys.ownScopedKey]).toBe(NAME_AFTER);
        expect(result.names?.[poplKeys.foreignScopedKey]).toBe(NAME_BEFORE);
    });
});
