/**
 * PRODUCTS_AND_SEARCH.md — каскад при правке карточки: только dayv2 текущего клиента.
 * Инцидент 2026-08-23 · isDayv2KeyForCurrentClient в __collectCascadeDayKeys().
 */
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

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
const LEGACY_DAY = '2026-08-21';

type CascadeSeed = {
    ownScopedKey: string;
    legacyKey: string;
    foreignScopedKey: string;
    pollutionKey: string;
};

type KeySnapshot = {
    prefix: string | null;
    length: number;
    rawJsonName: string | null;
    storeName: string | null;
};

type CascadeProbeTracks = {
    ownScoped: string;
    legacy: string;
    scopedLegacy: string;
    foreignScoped: string;
    pollution: string;
};

type CascadeProbeResult = {
    ok: boolean;
    reason?: string;
    dayKeys?: string[];
    tracks?: CascadeProbeTracks;
    before?: Record<keyof CascadeProbeTracks, KeySnapshot>;
    after?: Record<keyof CascadeProbeTracks, KeySnapshot>;
};

type CascadeStats = {
    updatedItems: number;
    updatedDays: number;
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

function parseCascadeConsole(lines: string[]): CascadeStats | null {
    const last = [...lines].reverse().find((line) => line.includes('[HEYS] Cascade update:'));
    if (!last) return null;
    const match = last.match(/Cascade update: (\d+) items in (\d+) days/);
    if (!match) return null;
    return { updatedItems: Number(match[1]), updatedDays: Number(match[2]) };
}

function attachCascadeConsoleCapture(page: Page): { lines: string[]; detach: () => void } {
    const lines: string[] = [];
    const onConsole = (msg: ConsoleMessage) => {
        const text = msg.text();
        if (text.includes('[HEYS] Cascade update:')) lines.push(text);
    };
    page.on('console', onConsole);
    return {
        lines,
        detach: () => page.off('console', onConsole),
    };
}

async function expectCascadeDebugReady(page: Page): Promise<void> {
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

async function seedCascadeDays(page: Page, clientId: string, otherClientId: string): Promise<CascadeSeed> {
    return page.evaluate(
        ({ cid, otherId, payload, legacyDay }) => {
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
            const legacyKey = `heys_dayv2_${legacyDay}`;
            const scopedLegacyKey = `heys_${cid}_dayv2_${legacyDay}`;
            const foreignScopedKey = `heys_${otherId}_dayv2_2026-08-20`;
            const pollutionKey = `heys_${cid}_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb_dayv2_2026-08-22`;
            localStorage.removeItem(scopedLegacyKey);
            localStorage.removeItem(legacyKey);
            writeOwnDay(ownScopedKey);
            writeForeignDay(legacyKey);
            writeForeignDay(foreignScopedKey);
            writeForeignDay(pollutionKey);
            return { ownScopedKey, legacyKey, foreignScopedKey, pollutionKey };
        },
        { cid: clientId, otherId: otherClientId, payload: dayPayload(NAME_BEFORE), legacyDay: LEGACY_DAY },
    );
}

async function runCascadeProbe(page: Page, keys: CascadeSeed, clientId: string): Promise<CascadeProbeResult> {
    return page.evaluate(
        ({ productId, beforeName, afterName, keys: seedKeys, cid, legacyDay }) => {
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

            const snapKey = (key: string): KeySnapshot => {
                const raw = localStorage.getItem(key);
                const prefix = raw ? raw.slice(0, 3) : null;
                const length = raw ? raw.length : 0;
                let rawJsonName: string | null = null;
                if (raw && raw.startsWith('{')) {
                    try {
                        const day = JSON.parse(raw) as { meals?: { items?: { name?: string }[] }[] };
                        rawJsonName = day?.meals?.[0]?.items?.[0]?.name ?? null;
                    } catch {
                        rawJsonName = null;
                    }
                }
                let storeName: string | null = null;
                try {
                    if (w.HEYS?.store?.get) {
                        const day = w.HEYS.store.get(key, null) as { meals?: { items?: { name?: string }[] }[] } | null;
                        storeName = day?.meals?.[0]?.items?.[0]?.name ?? null;
                    }
                } catch {
                    storeName = null;
                }
                return { prefix, length, rawJsonName, storeName };
            };

            const tracks: CascadeProbeTracks = {
                ownScoped: seedKeys.ownScopedKey,
                legacy: seedKeys.legacyKey,
                scopedLegacy: `heys_${cid}_dayv2_${legacyDay}`,
                foreignScoped: seedKeys.foreignScopedKey,
                pollution: seedKeys.pollutionKey,
            };

            const before: Record<keyof CascadeProbeTracks, KeySnapshot> = {
                ownScoped: snapKey(tracks.ownScoped),
                legacy: snapKey(tracks.legacy),
                scopedLegacy: snapKey(tracks.scopedLegacy),
                foreignScoped: snapKey(tracks.foreignScoped),
                pollution: snapKey(tracks.pollution),
            };

            const dayKeys = collect();
            cascade(
                { id: productId, name: beforeName, kcal100: 120, protein100: 10, fat100: 5, simple100: 3 },
                { id: productId, name: afterName, kcal100: 120, protein100: 10, fat100: 5, simple100: 3 },
            );

            const after: Record<keyof CascadeProbeTracks, KeySnapshot> = {
                ownScoped: snapKey(tracks.ownScoped),
                legacy: snapKey(tracks.legacy),
                scopedLegacy: snapKey(tracks.scopedLegacy),
                foreignScoped: snapKey(tracks.foreignScoped),
                pollution: snapKey(tracks.pollution),
            };

            return { ok: true, dayKeys, tracks, before, after };
        },
        {
            productId: PRODUCT_ID,
            beforeName: NAME_BEFORE,
            afterName: NAME_AFTER,
            keys,
            cid: clientId,
            legacyDay: LEGACY_DAY,
        },
    );
}

function deriveCascadeStatsFromProbe(probe: CascadeProbeResult): CascadeStats | null {
    if (!probe.before || !probe.after) return null;
    const tracks: (keyof CascadeProbeTracks)[] = ['ownScoped', 'legacy', 'scopedLegacy'];
    let updatedDays = 0;
    for (const track of tracks) {
        const was = probe.before[track].storeName ?? probe.before[track].rawJsonName;
        const now = probe.after[track].storeName ?? probe.after[track].rawJsonName;
        if (was === NAME_BEFORE && now === NAME_AFTER) updatedDays += 1;
    }
    if (updatedDays === 0) return null;
    return { updatedDays, updatedItems: updatedDays };
}

async function runCascadeWithStats(
    page: Page,
    keys: CascadeSeed,
    clientId: string,
): Promise<{ probe: CascadeProbeResult; stats: CascadeStats | null; cascadeLines: string[] }> {
    const capture = attachCascadeConsoleCapture(page);
    const consoleWait = page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('[HEYS] Cascade update:'),
        timeout: 15_000,
    }).catch(() => null);
    try {
        const probe = await runCascadeProbe(page, keys, clientId);
        let stats = parseCascadeConsole(capture.lines);
        if (!stats) {
            const evt = await consoleWait;
            if (evt) stats = parseCascadeConsole([evt.text()]);
        }
        stats = stats ?? deriveCascadeStatsFromProbe(probe);
        return { probe, stats, cascadeLines: capture.lines };
    } finally {
        capture.detach();
    }
}

function expectDayKeysContainOnlyOwn(
    dayKeys: string[] | undefined,
    keys: CascadeSeed,
): void {
    expect(dayKeys).toContain(keys.ownScopedKey);
    expect(dayKeys).toContain(keys.legacyKey);
    expect(dayKeys).not.toContain(keys.foreignScopedKey);
    expect(dayKeys).not.toContain(keys.pollutionKey);
}

function expectForeignKeysUnchanged(after: CascadeProbeResult['after']): void {
    expect(after?.foreignScoped.rawJsonName).toBe(NAME_BEFORE);
    expect(after?.pollution.rawJsonName).toBe(NAME_BEFORE);
}

function expectLegacyCascadeContract(
    probe: CascadeProbeResult,
    stats: CascadeStats | null,
): void {
    const after = probe.after;
    expect(after, JSON.stringify(probe)).toBeTruthy();

    // Verdict: silent migration — read unscoped legacy, write scoped; raw LS row stays Before.
    expect(after!.scopedLegacy.storeName).toBe(NAME_AFTER);
    expect(after!.legacy.rawJsonName).toBe(NAME_BEFORE);

    expect(stats, 'cascade produced no observable renames (console line or probe diff)').toBeTruthy();
    expect(stats!.updatedDays).toBeGreaterThan(0);
    expect(stats!.updatedItems).toBeGreaterThan(0);
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
        await page.reload({ waitUntil: 'load' });
        await expectCascadeDebugReady(page);

        const { probe, stats } = await runCascadeWithStats(page, keys, clientId);

        expect(probe.ok, JSON.stringify(probe)).toBe(true);
        expectDayKeysContainOnlyOwn(probe.dayKeys, keys);
        expect(probe.after?.ownScoped.storeName).toBe(NAME_AFTER);
        expectForeignKeysUnchanged(probe.after);
        expectLegacyCascadeContract(probe, stats);
    });

    test('Curator switch — cascade scoped per active client (Alex → Popl)', async ({ page }) => {
        test.skip(!hasCuratorCredentials(), 'Curator credentials required (.env.local)');
        test.skip(!ALEX_NAME || !POPL_NAME, 'HEYS_TEST_E2E_CLIENT_*_NAME required');

        await loginAsCurator(page);
        const alexId = await enterCuratorClientFromPanel(page, ALEX_NAME);
        expect(alexId.toLowerCase()).toBe(ALEX_ID.toLowerCase());
        await expectCascadeDebugReady(page);

        const alexKeys = await seedCascadeDays(page, alexId, POPL_ID);
        let { probe, stats } = await runCascadeWithStats(page, alexKeys, alexId);
        expect(probe.ok, JSON.stringify(probe)).toBe(true);
        expectDayKeysContainOnlyOwn(probe.dayKeys, alexKeys);
        expect(probe.after?.ownScoped.storeName).toBe(NAME_AFTER);
        expectForeignKeysUnchanged(probe.after);
        expectLegacyCascadeContract(probe, stats);

        const poplId = await switchCuratorToClient(page, POPL_NAME);
        expect(poplId.toLowerCase()).toBe(POPL_ID.toLowerCase());
        await expectCascadeDebugReady(page);

        const poplKeys = await seedCascadeDays(page, poplId, alexId);
        ({ probe, stats } = await runCascadeWithStats(page, poplKeys, poplId));
        expect(probe.ok, JSON.stringify(probe)).toBe(true);
        expectDayKeysContainOnlyOwn(probe.dayKeys, poplKeys);
        expect(probe.after?.ownScoped.storeName).toBe(NAME_AFTER);
        expectForeignKeysUnchanged(probe.after);
        expectLegacyCascadeContract(probe, stats);
    });
});
