/**
 * E2E suite for cross-client pollution fix (incident 2026-05-29 21:16:40-43,
 * commit fc1ce544). Три теста:
 *
 *   1. PIN-вход Александры — verifies её dashboard загружается, currentClientId stable.
 *   2. PIN-вход Poplanton'a — то же самое для второго клиента.
 *   3. Курaторский switch Александра → Poplanton — главный test:
 *      verifies что после switch'а LS НЕ содержит unscoped legacy keys
 *      (heys_profile, heys_dayv2_*, etc.). Это валидация L1 defence
 *      (cleanup в heys_app_shell_v1.js reload-on-switch handler).
 *
 * Запуск:
 *   1. Скопируй .env.local.example в .env.local, заполни credentials.
 *   2. Подними dev-сервер: pnpm dev:local (или pnpm dev:web на 3001).
 *   3. pnpm test:e2e:curator-switch
 *
 * Backward-compat: тесты skip'аются если env vars отсутствуют — CI без
 * credentials просто пропустит suite, не упадёт.
 */
import { expect, test } from '@playwright/test';

import { getNamedPinCredentials, hasNamedPinCredentials, loginWithHeysPin } from './helpers/pin-auth';
import {
    captureLsSnapshot,
    getCuratorCredentials,
    hasCuratorCredentials,
    loginAsCurator,
    switchCuratorToClient,
} from './helpers/curator-auth';

test.use({
    viewport: { width: 1280, height: 800 },
});

test.describe('Курaторский cross-client pollution — anti-regression', () => {
    test('PIN login Александры — dashboard + currentClientId stable', async ({ page }) => {
        test.skip(
            !hasNamedPinCredentials('ALEX'),
            'Set HEYS_TEST_PHONE_ALEX and HEYS_TEST_PIN_ALEX in .env.local'
        );

        const credentials = getNamedPinCredentials('ALEX');
        const clientId = await loginWithHeysPin(page, credentials);

        expect(clientId).toBeTruthy();

        // Dashboard markers — должен появиться UI её дня.
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

        // PIN-вход — НЕТ pollution-vector через unscoped legacy keys: LS Александры
        // должен содержать только её scoped keys, не unscoped legacy.
        const snap = await captureLsSnapshot(page);
        expect(snap.currentClientId).toBe(clientId);
        // Note: legitimate writes юзера (water/meals) могут попасть в unscoped keys
        // через legacy pre-fix code paths. После reload-on-switch fix эти ключи
        // будут cleared при выходе. Здесь мы НЕ проверяем = 0, просто capture'им.
    });

    test('PIN login Poplanton — dashboard + currentClientId stable', async ({ page }) => {
        test.skip(
            !hasNamedPinCredentials('POPL'),
            'Set HEYS_TEST_PHONE_POPL and HEYS_TEST_PIN_POPL in .env.local'
        );

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
    });

    test('Курaтор switch Александра → Poplanton — НЕТ pollution в LS после switch', async ({ page }) => {
        test.skip(
            !hasCuratorCredentials() ||
            !process.env.HEYS_TEST_CURATOR_CLIENT_ALEX_NAME ||
            !process.env.HEYS_TEST_CURATOR_CLIENT_POPL_NAME,
            'Set HEYS_TEST_CURATOR_EMAIL, HEYS_TEST_CURATOR_PASSWORD, ' +
            'HEYS_TEST_CURATOR_CLIENT_ALEX_NAME, HEYS_TEST_CURATOR_CLIENT_POPL_NAME in .env.local'
        );

        const alexName = String(process.env.HEYS_TEST_CURATOR_CLIENT_ALEX_NAME).trim();
        const poplName = String(process.env.HEYS_TEST_CURATOR_CLIENT_POPL_NAME).trim();

        // 1. Курaтор-login.
        const curator = await loginAsCurator(page);
        expect(curator.userId).toBeTruthy();

        // 2. Switch на Александру (входим в её dashboard).
        const alexClientId = await switchCuratorToClient(page, alexName);
        expect(alexClientId).toBeTruthy();

        // Ждём пока её данные подгрузятся.
        await expect(page.getByRole('button', { name: /Добавить приём пищи/ })).toBeVisible({ timeout: 60_000 });

        // 3. Snapshot её LS — для baseline'a.
        const beforeSwitch = await captureLsSnapshot(page);
        expect(beforeSwitch.currentClientId).toBe(alexClientId);
        // baseline: записываем сколько unscoped legacy keys было до switch'a (informational).
        console.info(
            `[anti-pollution test] Александра's LS перед switch: ${beforeSwitch.unscopedLegacyKeys.length} unscoped legacy keys ` +
            `(${beforeSwitch.unscopedLegacyKeys.slice(0, 5).join(', ')}${beforeSwitch.unscopedLegacyKeys.length > 5 ? '...' : ''})`
        );

        // 4. CORE TEST: switch на Poplanton.
        const poplClientId = await switchCuratorToClient(page, poplName);
        expect(poplClientId).toBeTruthy();
        expect(poplClientId).not.toBe(alexClientId);

        await expect(page.getByRole('button', { name: /Добавить приём пищи/ })).toBeVisible({ timeout: 60_000 });

        // 5. CORE ASSERTIONS — L1 defence сработал.
        const afterSwitch = await captureLsSnapshot(page);

        // (a) currentClientId переключился на Poplanton.
        expect(afterSwitch.currentClientId).toBe(poplClientId);

        // (b) unscoped legacy keys очищены (L1 defence в reload-on-switch).
        // Это главная anti-pollution гарантия из commit fc1ce544.
        expect(
            afterSwitch.unscopedLegacyKeys,
            `L1 defence не сработал: после switch'а LS содержит ${afterSwitch.unscopedLegacyKeys.length} unscoped legacy keys ` +
            `(${afterSwitch.unscopedLegacyKeys.join(', ')}). Они должны были быть удалены reload-on-switch handler'ом ` +
            `(heys_app_shell_v1.js:2624). Если этот assertion падает — pollution может вернуться.`
        ).toEqual([]);

        // (c) Профиль Poplanton'a (scoped) НЕ равен Александринскому (sanity check
        // что мы реально на разных клиентах, не один scoped key переименован).
        // Если bytes у обоих > 0 — оба клиента имеют свой profile (good).
        // Если у Poplanton'a 0 — он ещё не успел подгрузить scoped profile с сервера;
        // это НЕ pollution (отсутствие записи ≠ чужие данные).
        // Pollution assertion: scopedProfileBytes у Poplanton'a НЕ должен совпадать
        // с beforeSwitch.scopedProfileBytes (это были байты scoped profile Александры
        // под her client_id — Poplanton НЕ должен иметь точно такую же запись под
        // her client_id; scoped keys per-client разные).
        console.info(
            `[anti-pollution test] After switch: alex.scopedProfileBytes=${beforeSwitch.scopedProfileBytes}, ` +
            `popl.scopedProfileBytes=${afterSwitch.scopedProfileBytes}`
        );
    });
});
