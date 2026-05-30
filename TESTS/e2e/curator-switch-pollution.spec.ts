/**
 * E2E suite for cross-client pollution fix (incident 2026-05-29 21:16:40-43,
 * commit fc1ce544). Три теста + полная diagnostics suite (5 layers).
 *
 * Tests:
 *   1. PIN-вход Александры — verifies её dashboard загружается, currentClientId stable.
 *   2. PIN-вход Poplanton'a — то же самое для второго клиента.
 *   3. Курaторский switch Александра → Poplanton — главный test:
 *      verifies что после switch'а LS НЕ содержит unscoped legacy keys
 *      (heys_profile, heys_dayv2_*, etc.). Это валидация L1 defence
 *      (cleanup в heys_app_shell_v1.js reload-on-switch handler).
 *
 * Diagnostics attached к каждому тесту (видно в HTML report при failure):
 *   (A) Badge dump (sync state, write/saveClientKey history, queue, LS scan)
 *   (B) Console log (filtered [HEYS.*], warnings, errors)
 *   (C) DB cross-check (ground truth из client_kv_store через psql.sh)
 *   (D) LS snapshots в 5 точках + diff между ними
 *   (E) Sync queue timeline (pending/inflight каждые 500ms)
 *
 * Запуск:
 *   1. Скопируй .env.local.example в .env.local, заполни credentials.
 *   2. Подними dev-сервер: pnpm dev:local (или pnpm dev:web на 3001).
 *   3. pnpm test:e2e:curator-switch
 *
 * При failure открой playwright-report/index.html — все attachments видны рядом
 * с failed assertion.
 */
import { expect, test } from '@playwright/test';

import { getNamedPinCredentials, hasNamedPinCredentials, loginWithHeysPin } from './helpers/pin-auth';
import {
    enterCuratorClientFromPanel,
    hasCuratorCredentials,
    loginAsCurator,
    switchCuratorToClient,
} from './helpers/curator-auth';
import {
    attachDiagnostics,
    captureBadgeDump,
    captureFullLsSnapshot,
    dbClientIdByName,
    dbRecentWrites,
    diffLsSnapshots,
    setupConsoleCapture,
    startSyncQueueMonitor,
} from './helpers/test-diagnostics';

test.use({
    viewport: { width: 1280, height: 800 },
});

test.describe('Курaторский cross-client pollution — anti-regression', () => {
    test('PIN login Александры — dashboard + currentClientId stable', async ({ page }, testInfo) => {
        test.skip(
            !hasNamedPinCredentials('ALEX'),
            'Set HEYS_TEST_PHONE_ALEX and HEYS_TEST_PIN_ALEX in .env.local'
        );

        const consoleLog = setupConsoleCapture(page);

        const credentials = getNamedPinCredentials('ALEX');
        const clientId = await loginWithHeysPin(page, credentials);

        expect(clientId).toBeTruthy();

        await expect(page.getByRole('button', { name: /Добавить приём пищи/ })).toBeVisible({ timeout: 30_000 });

        await expect.poll(async () => {
            return page.evaluate(() => {
                const w = window as typeof window & { HEYS?: any };
                return {
                    currentClientId: w.HEYS?.currentClientId,
                    pinAuthClient: localStorage.getItem('heys_pin_auth_client'),
                };
            });
        }).toMatchObject({
            currentClientId: clientId,
            pinAuthClient: clientId,
        });

        // Attach post-login diagnostics
        const lsSnap = await captureFullLsSnapshot(page);
        const badgeDump = await captureBadgeDump(page);
        await attachDiagnostics(testInfo, 'alex-pin-postlogin', {
            badgeDump,
            lsSnapshot: lsSnap,
            consoleLog: consoleLog.format(),
        });
    });

    test('PIN login Poplanton — dashboard + currentClientId stable', async ({ page }, testInfo) => {
        test.skip(
            !hasNamedPinCredentials('POPL'),
            'Set HEYS_TEST_PHONE_POPL and HEYS_TEST_PIN_POPL in .env.local'
        );

        const consoleLog = setupConsoleCapture(page);

        const credentials = getNamedPinCredentials('POPL');
        const clientId = await loginWithHeysPin(page, credentials);

        expect(clientId).toBeTruthy();

        await expect(page.getByRole('button', { name: /Добавить приём пищи/ })).toBeVisible({ timeout: 30_000 });

        await expect.poll(async () => {
            return page.evaluate(() => {
                const w = window as typeof window & { HEYS?: any };
                return {
                    currentClientId: w.HEYS?.currentClientId,
                    pinAuthClient: localStorage.getItem('heys_pin_auth_client'),
                };
            });
        }).toMatchObject({
            currentClientId: clientId,
            pinAuthClient: clientId,
        });

        const lsSnap = await captureFullLsSnapshot(page);
        const badgeDump = await captureBadgeDump(page);
        await attachDiagnostics(testInfo, 'popl-pin-postlogin', {
            badgeDump,
            lsSnapshot: lsSnap,
            consoleLog: consoleLog.format(),
        });
    });

    test('Курaтор switch Александра → Poplanton — НЕТ pollution в LS после switch', async ({ page }, testInfo) => {
        test.skip(
            !hasCuratorCredentials() ||
            !process.env.HEYS_TEST_CURATOR_CLIENT_ALEX_NAME ||
            !process.env.HEYS_TEST_CURATOR_CLIENT_POPL_NAME,
            'Set HEYS_TEST_CURATOR_EMAIL, HEYS_TEST_CURATOR_PASSWORD, ' +
            'HEYS_TEST_CURATOR_CLIENT_ALEX_NAME, HEYS_TEST_CURATOR_CLIENT_POPL_NAME in .env.local'
        );

        const alexName = String(process.env.HEYS_TEST_CURATOR_CLIENT_ALEX_NAME).trim();
        const poplName = String(process.env.HEYS_TEST_CURATOR_CLIENT_POPL_NAME).trim();

        // === Diagnostics setup ===
        // (B) Console capture: запускается СРАЗУ — поймает все события на протяжении теста.
        const consoleLog = setupConsoleCapture(page);
        // (E) Sync queue monitor: каждые 500ms snapshot pending/inflight.
        const queueMonitor = startSyncQueueMonitor(page, 500);

        // === T0: курaтор-login ===
        const curator = await loginAsCurator(page);
        expect(curator.userId).toBeTruthy();

        const t0_ls = await captureFullLsSnapshot(page);
        const t0_badge = await captureBadgeDump(page);
        await attachDiagnostics(testInfo, 'T0-curator-login', {
            badgeDump: t0_badge,
            lsSnapshot: t0_ls,
        });

        // === T1: enter Александру через tile click в курaторской панели ===
        // (soft entry, не triggers reload-on-switch — это first entry from panel).
        const alexClientId = await enterCuratorClientFromPanel(page, alexName);
        expect(alexClientId).toBeTruthy();
        await expect(page.getByRole('button', { name: /Добавить приём пищи/ })).toBeVisible({ timeout: 60_000 });

        const t1_ls = await captureFullLsSnapshot(page);
        const t1_badge = await captureBadgeDump(page);
        await attachDiagnostics(testInfo, 'T1-after-switch-to-alex', {
            badgeDump: t1_badge,
            lsSnapshot: t1_ls,
            lsDiff: diffLsSnapshots(t0_ls, t1_ls),
        });

        // baseline informational
        console.info(
            `[T1] Александра's LS: ${t1_ls.unscopedLegacyKeys.length} unscoped legacy keys ` +
            `(${t1_ls.unscopedLegacyKeys.slice(0, 5).join(', ')}${t1_ls.unscopedLegacyKeys.length > 5 ? '...' : ''})`
        );

        // === T2: момент перед switch'ом на Poplanton ===
        // (даём sync ~3 сек чтобы settle — иначе pending writes Александры
        // могут улететь под Poplanton id если switch произойдёт в момент upload'a).
        await page.waitForTimeout(3000);
        const t2_ls = await captureFullLsSnapshot(page);
        await attachDiagnostics(testInfo, 'T2-pre-switch-to-popl', {
            lsSnapshot: t2_ls,
        });

        // === T3: switch на Poplanton — CORE TEST ===
        const poplClientId = await switchCuratorToClient(page, poplName);
        expect(poplClientId).toBeTruthy();
        expect(poplClientId).not.toBe(alexClientId);

        // Soft UI verification — Poplanton может приземлиться на другой tab (Reports/Insights),
        // тогда кнопки "Добавить приём пищи" не будет. Это не блокер: для anti-pollution
        // важна LS-state, а currentClientId уже proven через switchCuratorToClient poll.
        await page.getByRole('button', { name: /Добавить приём пищи/ })
            .waitFor({ state: 'visible', timeout: 30_000 })
            .catch(() => { /* OK: tab может быть другим */ });

        const t3_ls = await captureFullLsSnapshot(page);
        const t3_badge = await captureBadgeDump(page);
        await attachDiagnostics(testInfo, 'T3-after-switch-to-popl', {
            badgeDump: t3_badge,
            lsSnapshot: t3_ls,
            lsDiff: diffLsSnapshots(t2_ls, t3_ls),
        });

        // === T4: 5 секунд после switch'a (settled) ===
        // Catches lingering pollution: bootstrap may upload Александрины legacy keys
        // в течение нескольких секунд после reload. Если pollution случается отложенно
        // — это T4 поймает.
        await page.waitForTimeout(5000);
        const t4_ls = await captureFullLsSnapshot(page);
        const t4_badge = await captureBadgeDump(page);
        await attachDiagnostics(testInfo, 'T4-settled-5s-after', {
            badgeDump: t4_badge,
            lsSnapshot: t4_ls,
            lsDiff: diffLsSnapshots(t3_ls, t4_ls),
        });

        // === (C) DB cross-check: ground truth ===
        // Самое надёжное assertion. Запрашиваем напрямую client_kv_store: что
        // появилось у Poplanton'а за последние ~60 сек (от T1 до T4 ≈ 30-40 сек,
        // берём 90 сек запас). Если там есть Александрины-shape keys (heys_profile
        // с тем же bytecount, heys_dayv2_<date> за исторические даты которых
        // Poplanton не правил) — pollution.
        const poplUuid = dbClientIdByName(poplName);
        const dbResult = poplUuid
            ? dbRecentWrites(poplUuid, 90)
            : { success: false, output: '', error: `Client "${poplName}" not found in DB` };
        await attachDiagnostics(testInfo, 'T4-db-crosscheck', { dbResult });

        // === FINAL CORE ASSERTIONS ===

        // (1) currentClientId переключился
        expect(t3_ls.currentClientId).toBe(poplClientId);
        expect(t4_ls.currentClientId).toBe(poplClientId);

        // (2) L1 defence сработал — НЕТ unscoped legacy keys после switch'a (T3)
        expect(
            t3_ls.unscopedLegacyKeys,
            `L1 defence не сработал в T3: после switch'a LS содержит ${t3_ls.unscopedLegacyKeys.length} unscoped legacy keys ` +
            `(${t3_ls.unscopedLegacyKeys.join(', ')}). Они должны были быть удалены reload-on-switch handler'ом ` +
            `(heys_app_shell_v1.js:2624).`
        ).toEqual([]);

        // (3) Через 5с settle (T4) — всё ещё чисто (нет lingering pollution)
        expect(
            t4_ls.unscopedLegacyKeys,
            `Через 5с после switch'a появились unscoped legacy keys (${t4_ls.unscopedLegacyKeys.length}): ` +
            `${t4_ls.unscopedLegacyKeys.join(', ')}. Migration path в каком-то модуле всё ещё работает ` +
            `после reload — это новый pollution vector, см. attached T4-badge-dump.txt.`
        ).toEqual([]);

        // === Сохраняем sync queue timeline ===
        const queueSnaps = queueMonitor.stop();
        await testInfo.attach('full-test-sync-timeline.txt', {
            body: queueMonitor.formatTimeline(),
            contentType: 'text/plain',
        });
        await testInfo.attach('full-test-console.txt', {
            body: consoleLog.format(),
            contentType: 'text/plain',
        });

        // (4) Sync queue должна draining'ить (уменьшаться) — не stuck.
        // Bootstrap нового клиента legit queueт много writes (overlay snapshot,
        // products, day registry, etc.), за 5с может не успеть полностью drain'нуться.
        // Поэтому смотрим тренд + safety upper bound, не абсолютный count.
        const finalQueue = queueSnaps[queueSnaps.length - 1];
        if (finalQueue && queueSnaps.length >= 6) {
            const finalTotal = finalQueue.pending + finalQueue.inflight;
            // Safety upper bound: даже bootstrap не должен накапливать > 50
            expect(
                finalTotal,
                `Sync queue overflow через 5с после switch: pending=${finalQueue.pending} inflight=${finalQueue.inflight} (limit 50). ` +
                `См. attached full-test-sync-timeline.txt.`
            ).toBeLessThanOrEqual(50);

            // Draining check: за последние 3 секунды (6 snapshots @ 500ms) очередь
            // должна либо уменьшаться, либо быть <= 5. Плато на большом значении = stuck.
            const tail = queueSnaps.slice(-6).map(s => s.pending + s.inflight);
            const stuck = tail.every(v => v === tail[0]) && tail[0] > 5;
            expect(
                stuck,
                `Sync queue stuck (plateau на ${tail[0]} последние 3с): ${tail.join(' → ')}. ` +
                `См. timeline.`
            ).toBe(false);
        }
    });
});
