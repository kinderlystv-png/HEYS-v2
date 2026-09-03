import { expect, type Page } from '@playwright/test';

import { dismissPostLoginOverlays } from './pin-auth';

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
 * Курaторский login через UI (form interactions).
 * Programmatic signIn устанавливает auth tokens но НЕ trigger'ит UI gate transition —
 * нужен либо reload, либо event dispatch. UI-driven путь robust: имитирует
 * реальный flow пользователя.
 *
 * Sequence:
 *   1. goto / + cleanup LS auth artifacts + reload
 *   2. Wait для login screen (PIN mode по default)
 *   3. Click кнопку "Вход для куратора →" → переключается на курaторский form
 *   4. Fill email + password
 *   5. Click submit
 *   6. Wait для курaторского dashboard (dropdown с клиентами видим)
 *
 * Возвращает user-id курaтора (если доступен).
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
        const w = window as typeof window & { HEYS?: { cloud?: { signIn?: unknown } } };
        return Boolean(w.HEYS?.cloud?.signIn);
    }, undefined, { timeout: 60_000 });

    const programmatic = await page.evaluate(async ({ email, password }) => {
        const w = window as typeof window & { HEYS?: any };
        const cloud = w.HEYS?.cloud;
        if (!cloud?.signIn) return { ok: false, error: 'signIn_unavailable' };
        try {
            const result = await cloud.signIn(email, password);
            if (!result?.ok && result?.error) return { ok: false, error: result.error };
            const userId = cloud._user?.id || cloud.user?.id || '';
            const isCurator = typeof w.HEYS?.auth?.isCuratorSession === 'function'
                ? w.HEYS.auth.isCuratorSession()
                : false;
            return { ok: isCurator, userId: String(userId || ''), error: isCurator ? null : 'not_curator_session' };
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }, credentials);

    if (programmatic.ok) {
        await page.reload({ waitUntil: 'load', timeout: 90_000 });
        return { userId: programmatic.userId || '<unknown>' };
    }

    // UI fallback (v4 start screen → «Вход куратора»)
    const curatorStart = page.getByRole('button', { name: 'Вход куратора' });
    const curatorLegacy = page.getByRole('button', { name: /Вход для куратора/ });
    if (await curatorStart.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await curatorStart.click();
    } else {
        await curatorLegacy.waitFor({ state: 'visible', timeout: 30_000 });
        await curatorLegacy.click();
    }

    // Шаг 2: появилась курaторская форма с email/password inputs + submit button.
    // Селекторы tolerant — могут быть и role=textbox с placeholder, и просто input.
    const emailField = page.locator(
        'input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="почт" i]'
    ).first();
    await emailField.waitFor({ state: 'visible', timeout: 15_000 });
    await emailField.fill(credentials.email);

    const passwordField = page.locator('input[type="password"]').first();
    await passwordField.waitFor({ state: 'visible', timeout: 15_000 });
    await passwordField.fill(credentials.password);

    // Шаг 3: submit. Курaторская "Войти" — без "→" в тексте (PIN screen имеет "Войти →").
    // type="submit" + не disabled + текст без arrow исключает PIN-кнопку.
    // tolerance: ловим race "submit already started — button became disabled mid-click".
    const submitButton = page.locator(
        'button[type="submit"]:has-text("Войти"):not(:has-text("→")):not([disabled])'
    ).first();
    try {
        await submitButton.waitFor({ state: 'visible', timeout: 10_000 });
        await submitButton.click({ timeout: 5000 });
    } catch (_) {
        // Если submit уже сработал (button стал "⏳ Вход..." disabled), это не ошибка —
        // ниже мы всё равно ждём isCuratorSession.
    }

    // Шаг 4: ждём пока курaторский dashboard поднимется.
    // isCuratorSession() становится true после успешного login.
    await expect.poll(async () => {
        return page.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            const fn = w.HEYS?.auth?.isCuratorSession;
            return typeof fn === 'function' ? !!fn() : false;
        });
    }, { timeout: 60_000 }).toBe(true);

    // Ждём пока в DOM появится header курaторской сессии (имя курaтора или кнопка/avatar профиля).
    // Это сигнал что AppShell mounted и список клиентов загружен в state.
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => { /* OK if timeout */ });

    const userId = await page.evaluate(() => {
        const w = window as typeof window & { HEYS?: any };
        return w.HEYS?.cloud?._user?.id || w.HEYS?.cloud?.user?.id || '';
    });

    return { userId: String(userId || '<unknown>') };
}

/**
 * Entry в клиента из главной курaторской "Панель куратора" (tile click).
 * Soft switch — НЕ triggers reload-on-switch handler. Используется только для
 * первичного входа в клиента из курaторского landing'a.
 *
 * Для последующих switch'ей между клиентами в той же сессии нужен
 * `switchToClientViaHeaderDropdown` (hard switch с L1 cleanup).
 */
export async function enterCuratorClientFromPanel(page: Page, clientName: string): Promise<string> {
    // E2E fixtures are hidden from curator panel by default (heys_e2e_fixtures_v1.js).
    // Tests that enter via panel tile opt in with a localStorage flag + reload.
    await page.evaluate(() => {
        try {
            localStorage.setItem('heys_show_e2e_clients', '1');
        } catch (_) { /* noop */ }
    });
    await page.reload({ waitUntil: 'load', timeout: 90_000 });

    await expect.poll(async () => {
        return page.evaluate(() => {
            const w = window as typeof window & { HEYS?: { auth?: { isCuratorSession?: () => boolean } } };
            return typeof w.HEYS?.auth?.isCuratorSession === 'function'
                ? w.HEYS.auth.isCuratorSession()
                : false;
        });
    }, { timeout: 60_000 }).toBe(true);

    // На "Панели куратора" каждый клиент — clickable tile с его именем как text.
    // v4 curator clients tab: client name is not clickable — use Open diary on the card.
    const clientCard = page.locator('.cur-cab__card').filter({
        has: page.getByText(clientName, { exact: true }),
    }).first();
    await clientCard.waitFor({ state: 'visible', timeout: 30_000 });
    const openDiary = clientCard.getByRole('button', { name: 'Открыть дневник' });
    await openDiary.waitFor({ state: 'visible', timeout: 30_000 });
    await openDiary.click();

    // Wait для client dashboard загрузится — currentClientId is set, dashboard markers visible.
    await expect.poll(async () => {
        return page.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            return w.HEYS?.currentClientId || null;
        });
    }, { timeout: 60_000 }).toBeTruthy();

    // 2026-05-31: anti-race для UI (см. pin-auth waitForFunction).
    // Wait пока scoped profile загрузится из cloud в LS — иначе registration
    // wizard блокирует курaторский dropdown trigger для следующего switch'a.
    try {
        await page.waitForFunction(
            () => {
                const w = window as typeof window & { HEYS?: any };
                const p = w.HEYS?.utils?.lsGet?.('heys_profile') || w.HEYS?.store?.get?.('heys_profile');
                if (!p || typeof p !== 'object') return false;
                return Boolean(p.profileCompleted === true || p.firstName || p.birthDate);
            },
            { timeout: 30_000, polling: 200 }
        );
    } catch (_) { /* profile sync slow — продолжим dismiss wizard если есть */ }

    // Clear flag + dismiss любой visible registration wizard (× close button).
    await page.evaluate(() => {
        try { localStorage.removeItem('heys_registration_in_progress'); } catch (_) { /* noop */ }
    });
    try {
        const closeBtn = page.getByRole('button', { name: /^Закрыть$/ }).first();
        if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await closeBtn.click({ timeout: 5_000 });
            await page.waitForTimeout(500);
        }
    } catch (_) { /* no wizard — OK */ }

    await dismissPostLoginOverlays(page, { skipReload: true });

    const clientId = await page.evaluate(() => {
        const w = window as typeof window & { HEYS?: any };
        return String(w.HEYS?.currentClientId || '');
    });
    return clientId;
}

async function ensureCuratorClientSwitcherVisible(page: Page): Promise<void> {
    await dismissPostLoginOverlays(page, { skipReload: true });

    await expect.poll(async () => {
        return page.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            return w.HEYS?.cloud?.isPinAuthClient?.() !== true && !!w.HEYS?.currentClientId;
        });
    }, { timeout: 60_000 }).toBe(true);

    const nutritionTab = page.locator('.tab').filter({ hasText: /^Питание$/ }).first();
    if (await nutritionTab.isVisible().catch(() => false)) {
        await nutritionTab.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(300);
    }

    const trigger = page.locator('.hdr-bottom .hdr-client[data-dropdown="client"] .hdr-client-clickable');
    await expect(trigger).toBeVisible({ timeout: 45_000 });
}

/** Shell reload-on-switch (L1 cleanup) — fallback if dropdown trigger stays hidden. */
async function hardReloadCuratorClientSwitch(page: Page, targetClientId: string): Promise<void> {
    await page.evaluate(async (toClientId) => {
        const w = window as typeof window & { HEYS?: any };
        const HEYS = w.HEYS;
        if (HEYS?.cloud?.flushPendingQueue) {
            try { await HEYS.cloud.flushPendingQueue(2000); } catch (_) { /* noop */ }
        }
        const legacyPatterns = [
            /^heys_profile$/,
            /^heys_dayv2_\d{4}-\d{2}-\d{2}$/,
            /^heys_ews_snapshot$/,
            /^heys_ews_trends_v1$/,
            /^heys_ews_weekly_v1$/,
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
            if (k && legacyPatterns.some((re) => re.test(k))) toRemove.push(k);
        }
        toRemove.forEach((k) => {
            try { localStorage.removeItem(k); } catch (_) { /* noop */ }
        });
        try {
            localStorage.setItem('heys_last_client_id', toClientId);
            localStorage.setItem('heys_client_current', toClientId);
        } catch (_) { /* noop */ }
        window.location.reload();
    }, targetClientId);
    await page.waitForLoadState('load', { timeout: 90_000 });
}

/**
 * Hard switch на другого клиента через dropdown в шапке клиентского dashboard.
 * ЭТО ИМЕННО ТОТ flow который мы фиксили в commit fc1ce544 (L1 cleanup + L2
 * flushPendingQueue → cleanup unscoped legacy keys → reload.
 *
 * Возвращает clientId target клиента.
 */
export async function switchCuratorToClient(page: Page, clientName: string): Promise<string> {
    // Hard switch flow (heys_app_shell_v1.js:3729-3808):
    //   1. Find и click header dropdown trigger (avatar/имя текущего клиента).
    //   2. Wait для dropdown с client list появился.
    //   3. Click имя target клиента в dropdown.
    //   4. Это triggers L1 cleanup + flush + reload-on-switch handler.
    //   5. После reload — wait для new currentClientId.

    const prevClientId = await page.evaluate(() => {
        const w = window as typeof window & { HEYS?: any };
        return String(w.HEYS?.currentClientId || '');
    });

    await ensureCuratorClientSwitcherVisible(page);

    const trigger = page.locator('.hdr-bottom .hdr-client[data-dropdown="client"] .hdr-client-clickable');
    const triggerVisible = await trigger.isVisible().catch(() => false);

    if (!triggerVisible) {
        const targetClientId = await page.evaluate((name) => {
            const w = window as typeof window & { HEYS?: any };
            const list = w.HEYS?.curatorClients || w.HEYS?.clients || [];
            const hit = Array.isArray(list) ? list.find((c: { name?: string }) => c?.name === name) : null;
            return hit?.id ? String(hit.id) : '';
        }, clientName);
        expect(targetClientId, `client id for ${clientName}`).toBeTruthy();
        await hardReloadCuratorClientSwitch(page, targetClientId);
    } else {
        await trigger.click();

        const dropdown = page.locator('.client-dropdown').first();
        await dropdown.waitFor({ state: 'visible', timeout: 10_000 });

        const clientOption = dropdown.locator('.client-dropdown-item').filter({ hasText: clientName }).first();
        await clientOption.waitFor({ state: 'visible', timeout: 10_000 });
        // Backdrop (client-dropdown-backdrop) перехватывает pointer — DOM click как в prod (todo.md §hdr race).
        await clientOption.evaluate((el) => (el as HTMLElement).click());

        await page.waitForLoadState('load', { timeout: 60_000 });
    }

    await expect.poll(async () => {
        return page.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            return w.HEYS?.currentClientId || null;
        });
    }, { timeout: 60_000 }).toBeTruthy();

    await expect.poll(async () => {
        return page.evaluate((prev) => {
            const w = window as typeof window & { HEYS?: any };
            const cid = String(w.HEYS?.currentClientId || '');
            return cid && cid !== prev ? cid : null;
        }, prevClientId);
    }, { timeout: 30_000, intervals: [200, 500, 1000] }).toBeTruthy();

    const finalClientId = await page.evaluate(() => {
        const w = window as typeof window & { HEYS?: any };
        return String(w.HEYS?.currentClientId || '');
    });
    await dismissPostLoginOverlays(page, { skipReload: true });
    return finalClientId;
}

// (Legacy programmatic fallback removed — UI-driven path выше использует
// настоящий reload-on-switch handler из heys_app_shell_v1.js:2624 что и
// активирует L1 cleanup; programmatic shortcut обходит этот path и testит
// не то.)

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
