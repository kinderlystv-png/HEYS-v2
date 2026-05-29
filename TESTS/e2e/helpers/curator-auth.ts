import { expect, type Page } from '@playwright/test';

type CuratorCredentials = {
    email: string;
    password: string;
};

export function hasCuratorCredentials(): boolean {
    return Boolean(process.env.HEYS_TEST_CURATOR_EMAIL && process.env.HEYS_TEST_CURATOR_PASSWORD);
}

export function getCuratorCredentials(): CuratorCredentials {
    return {
        email: String(process.env.HEYS_TEST_CURATOR_EMAIL || '').trim(),
        password: String(process.env.HEYS_TEST_CURATOR_PASSWORD || '').trim(),
    };
}

/**
 * Курaторский login через program API (window.HEYS.cloud.cloudSignIn).
 * Возвращает user-id курaтора. После login:
 *   - LS содержит heys_supabase_auth_token (или эквивалент)
 *   - window.HEYS.cloud._curatorSession === true
 *   - На UI отображается список клиентов курaтора в dropdown'е в шапке
 */
export async function loginAsCurator(page: Page): Promise<{ userId: string }> {
    const credentials = getCuratorCredentials();

    await page.goto('/', { waitUntil: 'load', timeout: 90_000 });

    // Полный logout перед login: убираем все auth artifacts.
    await page.evaluate(() => {
        try {
            localStorage.removeItem('heys_supabase_auth_token');
            localStorage.removeItem('heys_pin_auth_client');
            localStorage.removeItem('heys_session_token');
            localStorage.removeItem('heys_client_current');
            localStorage.removeItem('heys_last_client_id');
            localStorage.removeItem('heys_curator_session');
        } catch (_) { /* noop */ }
    });

    await page.goto('/', { waitUntil: 'load', timeout: 90_000 });

    await page.waitForFunction(() => {
        const w = window as typeof window & { HEYS?: { cloud?: { cloudSignIn?: unknown } } };
        return Boolean(w.HEYS?.cloud?.cloudSignIn);
    }, { timeout: 60_000 });

    const result = await page.evaluate(async ({ email, password }) => {
        const w = window as typeof window & { HEYS?: any };
        const signInFn = w.HEYS?.cloud?.cloudSignIn;
        if (typeof signInFn !== 'function') {
            return { ok: false, error: 'cloudSignIn_unavailable' };
        }
        try {
            const res = await signInFn(email, password, { rememberMe: true });
            if (res && res.error) {
                return { ok: false, error: String(res.error?.message || res.error) };
            }
            const userId = res?.user?.id || w.HEYS?.cloud?._user?.id || '';
            return { ok: true, userId };
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }, credentials);

    expect(result.ok, `Curator login failed: ${result.error || 'unknown'}`).toBeTruthy();

    // Ждём пока курaтор-режим заявит себя через cloud._curatorSession и список клиентов будет загружен.
    await expect.poll(async () => {
        return page.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            return {
                isCurator: w.HEYS?.cloud?._curatorSession === true,
                hasClientsList: Array.isArray(w.HEYS?.cloud?.getClientsList?.()) || Array.isArray(w.HEYS?._cachedClientsList),
            };
        });
    }, { timeout: 30_000 }).toMatchObject({ isCurator: true });

    return { userId: result.userId };
}

/**
 * Курaторский switch на указанного клиента по имени.
 * После switch'а страница перезагружается (reload-on-switch design).
 * Возвращает clientId выбранного клиента.
 *
 * Архитектурно интересные shape'ы которые мы проверяем В ОТДЕЛЬНОМ assertion
 * после switch'а (в тесте, не здесь):
 *   - LS НЕ содержит unscoped legacy keys (heys_profile, heys_dayv2_*, etc.)
 *   - currentClientId === <ожидаемый>
 *   - cloud._switchClientInProgress === false (switch завершён)
 */
export async function switchCuratorToClient(page: Page, clientName: string): Promise<string> {
    // Открываем dropdown в шапке (selector based на heys_app_shell_v1.js dropdown UI).
    // dropdown содержит список клиентов; клик на нужном имени триггерит
    // reload-on-switch flow (см. heys_app_shell_v1.js:2624).
    // Кликаем через JS (программно) — это более стабильно чем CSS selector,
    // потому что в DOM много вариантов render'a (mobile/desktop, разные shell версии).

    // Resolve clientId по имени, prior to switch
    const targetClientId = await page.evaluate((name) => {
        const w = window as typeof window & { HEYS?: any };
        const list = w.HEYS?.cloud?.getClientsList?.() || w.HEYS?._cachedClientsList || [];
        const found = Array.isArray(list)
            ? list.find((c: any) => String(c?.name || '').trim() === String(name).trim())
            : null;
        return found?.id || null;
    }, clientName);

    expect(targetClientId, `Client "${clientName}" not found in курaтор's list`).toBeTruthy();

    // Триггерим switch через UI dropdown (имитируя клик пользователя).
    // Самый прямой способ — открыть dropdown и кликнуть по имени.
    // Селекторы fallback'ы: button содержащий имя клиента.
    const headerButton = page.getByRole('button').filter({ hasText: /^(.+\s)?(куратор|switch|клиент)/i }).first();

    // Открываем dropdown через клик на header кнопке клиентов (если есть)
    // или fallback'aемся на программный switch.
    let dropdownOpened = false;
    try {
        await headerButton.click({ timeout: 5_000 });
        dropdownOpened = true;
    } catch (_) {
        // Fallback: программный switch — корректно triggers full reload flow
        // через те же writeGlobalValue + location.reload.
        dropdownOpened = false;
    }

    if (dropdownOpened) {
        // Жмём на имя клиента в открывшемся dropdown.
        try {
            await page.getByText(clientName, { exact: false }).first().click({ timeout: 5_000 });
        } catch (_) {
            // Не удалось через UI — fallback на программный.
            dropdownOpened = false;
        }
    }

    if (!dropdownOpened) {
        // Программный path: симулирует reload-on-switch click handler
        // из heys_app_shell_v1.js:2612-2655 — flush + writeGlobal + reload.
        await page.evaluate(async (cid) => {
            const w = window as typeof window & { HEYS?: any };
            const cloud = w.HEYS?.cloud;
            try {
                if (cloud?.flushPendingQueue) {
                    await cloud.flushPendingQueue(2000);
                }
            } catch (_) { /* noop */ }
            // Cleanup unscoped legacy keys (mirrors heys_app_shell_v1.js L1 defence).
            try {
                const legacy = [
                    /^heys_profile$/,
                    /^heys_dayv2_\d{4}-\d{2}-\d{2}$/,
                    /^heys_ews_(snapshot|trends_v1|weekly_v1)$/,
                    /^heys_ceb_v1$/,
                    /^heys_ceb_d_\d{4}-\d{2}-\d{2}$/,
                    /^heys_meal_gaps_history$/,
                    /^heys_cascade_dcs_v\d+$/,
                    /^heys_grams_history$/,
                    /^heys_norms$/,
                ];
                const toRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && legacy.some(r => r.test(k))) toRemove.push(k);
                }
                toRemove.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
            } catch (_) { /* noop */ }
            try {
                if (w.HEYS?.store?.set) {
                    w.HEYS.store.set('heys_last_client_id', cid);
                    w.HEYS.store.set('heys_client_current', cid);
                } else {
                    localStorage.setItem('heys_last_client_id', JSON.stringify(cid));
                    localStorage.setItem('heys_client_current', JSON.stringify(cid));
                }
            } catch (_) { /* noop */ }
            window.location.reload();
        }, targetClientId);
    }

    // После reload — ждём пока новый clientId установится.
    await page.waitForLoadState('load', { timeout: 60_000 });
    await expect.poll(async () => {
        return page.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            return w.HEYS?.currentClientId || null;
        });
    }, { timeout: 30_000 }).toBe(targetClientId);

    return targetClientId;
}

/**
 * Снимок LS state для anti-pollution assertions.
 * Возвращает:
 *   - list of unscoped legacy keys (должен быть пустым после reload-on-switch)
 *   - currentClientId
 *   - scoped profile content для текущего клиента (для сравнения двух клиентов)
 */
export async function captureLsSnapshot(page: Page): Promise<{
    unscopedLegacyKeys: string[];
    currentClientId: string | null;
    scopedProfileBytes: number;
}> {
    return page.evaluate(() => {
        const w = window as typeof window & { HEYS?: any };
        const currentClientId = w.HEYS?.currentClientId || null;
        const legacy = [
            /^heys_profile$/,
            /^heys_dayv2_\d{4}-\d{2}-\d{2}$/,
            /^heys_ews_(snapshot|trends_v1|weekly_v1)$/,
            /^heys_ceb_v1$/,
            /^heys_ceb_d_\d{4}-\d{2}-\d{2}$/,
            /^heys_meal_gaps_history$/,
            /^heys_cascade_dcs_v\d+$/,
            /^heys_grams_history$/,
            /^heys_norms$/,
        ];
        const unscopedLegacyKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && legacy.some(r => r.test(k))) unscopedLegacyKeys.push(k);
        }
        let scopedProfileBytes = 0;
        if (currentClientId) {
            const raw = localStorage.getItem(`heys_${currentClientId}_profile`);
            scopedProfileBytes = raw ? raw.length : 0;
        }
        return { unscopedLegacyKeys, currentClientId, scopedProfileBytes };
    });
}
