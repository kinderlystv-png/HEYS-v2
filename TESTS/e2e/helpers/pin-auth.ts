import { expect, type Page } from '@playwright/test';

type HeysPinCredentials = {
    phone: string;
    pin: string;
    accessCode?: string;
};

type LoginResult = {
    ok: boolean;
    clientId?: string;
    error?: string;
    message?: string;
    debug?: unknown;
};

function normalizePhone(input: string): string {
    const digits = String(input || '').replace(/\D/g, '');
    const normalized = digits.length === 10 ? `7${digits}` : digits;

    if (!/^7\d{10}$/.test(normalized)) {
        throw new Error(
            'HEYS_TEST_PHONE must contain a Russian phone in 10-digit format or start with 7.'
        );
    }

    return normalized;
}

function normalizePin(input: string): string {
    const pin = String(input || '').trim();

    if (!/^\d{4}$/.test(pin)) {
        throw new Error('HEYS_TEST_PIN must be exactly 4 digits.');
    }

    return pin;
}

export function hasHeysPinCredentials(): boolean {
    if (process.env.HEYS_TEST_PHONE && process.env.HEYS_TEST_PIN) return true;
    return hasNamedPinCredentials('E2E_ALEX');
}

export function getHeysPinCredentials(): HeysPinCredentials {
    if (process.env.HEYS_TEST_PHONE && process.env.HEYS_TEST_PIN) {
        return {
            phone: normalizePhone(process.env.HEYS_TEST_PHONE || ''),
            pin: normalizePin(process.env.HEYS_TEST_PIN || ''),
            accessCode: process.env.HEYS_TEST_ACCESS_CODE || process.env.HEYS_TEST_PIN,
        };
    }
    return getNamedPinCredentials('E2E_ALEX');
}

// 2026-05-29: explicit-credentials helpers для multi-client e2e (Александра + Poplanton).
// Используется в curator-switch-pollution.spec.ts.
export function hasNamedPinCredentials(prefix: string): boolean {
    return Boolean(process.env[`HEYS_TEST_PHONE_${prefix}`] && process.env[`HEYS_TEST_PIN_${prefix}`]);
}

export function getNamedPinCredentials(prefix: string): HeysPinCredentials {
    const pin = normalizePin(process.env[`HEYS_TEST_PIN_${prefix}`] || '');
    const accessCode = process.env[`HEYS_TEST_ACCESS_CODE_${prefix}`] || pin;
    return {
        phone: normalizePhone(process.env[`HEYS_TEST_PHONE_${prefix}`] || ''),
        pin,
        accessCode: normalizePin(accessCode),
    };
}

/** Подписывает обязательные согласия access-кодом (fallback, если DB-fixture устарел). */
export async function ensureE2eConsentsSigned(page: Page, accessCode: string): Promise<void> {
    const dashboardReady = dashboardMealButton(page);
    if (await dashboardReady.isVisible().catch(() => false)) return;

    await page.waitForFunction(
        () => Boolean((window as typeof window & { HEYS?: { Consents?: { api?: { signConsentsWithAccessCode?: unknown } } } }).HEYS?.Consents?.api?.signConsentsWithAccessCode),
        { timeout: 90_000 }
    );

    const result = await page.evaluate(async (code) => {
        const w = window as typeof window & { HEYS?: any };
        const api = w.HEYS?.Consents?.api;
        const versions = w.HEYS?.Consents?.VERSIONS || {
            user_agreement: '1.11',
            personal_data: '1.0',
        };
        if (!api?.signConsentsWithAccessCode) {
            return { ok: false, error: 'consents_api_missing' };
        }
        try {
            const check = await api.checkRequired('');
            if (check?.valid) return { ok: true, already: true };
        } catch (_) {
            // continue to sign attempt
        }

        const docPaths: Record<string, string> = {
            user_agreement: `/docs/v${versions.user_agreement}/user-agreement.md`,
            personal_data: `/docs/v${versions.personal_data}/personal-data-consent.md`,
        };
        const normalize = (text: string) => String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
        const signList = [];
        for (const type of ['user_agreement', 'personal_data'] as const) {
            const path = docPaths[type];
            const response = await fetch(path);
            if (!response.ok) {
                return { ok: false, error: `doc_fetch_failed:${type}:${response.status}` };
            }
            signList.push({
                type,
                granted: true,
                version: versions[type],
                signature_method: 'pin_confirm',
                document_text: normalize(await response.text()),
            });
        }
        const signed = await api.signConsentsWithAccessCode(signList, code);
        if (!signed?.success) {
            return { ok: false, error: signed?.error || 'sign_failed' };
        }
        const clientId = w.HEYS?.currentClientId || localStorage.getItem('heys_pin_auth_client');
        if (clientId && api.saveLocal) api.saveLocal(clientId, signList);
        return { ok: true };
    }, accessCode);

    expect(result.ok, result.error || 'E2E consent sign failed').toBeTruthy();

    if (result.already) return;

    try {
        await page.reload({ waitUntil: 'load', timeout: 90_000 });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('interrupted')) throw err;
        await page.waitForLoadState('load', { timeout: 90_000 });
    }
}

type DismissOverlaysOptions = {
    /** Curator client entry: seed LS but avoid reload that drops in-client shell. */
    skipReload?: boolean;
};

/** Закрывает post-login блокеры (optional offer, чек-ин, curator changelog). */
export async function dismissPostLoginOverlays(page: Page, options: DismissOverlaysOptions = {}): Promise<void> {
    const { skipReload = false } = options;
    const seeded = await page.evaluate(() => {
        const w = window as typeof window & { HEYS?: any };
        const clientId = w.HEYS?.currentClientId || localStorage.getItem('heys_pin_auth_client');
        const utils = w.HEYS?.MorningCheckinUtils;
        if (!clientId || !utils?.readDayV2ScopedFirst) return { ok: false, reason: 'no_utils' };
        const today = w.HEYS?.dayUtils?.todayISO?.() || new Date().toISOString().slice(0, 10);
        const existing = utils.readDayV2ScopedFirst(today, {}) || {};
        const day = {
            ...existing,
            date: today,
            meals: Array.isArray(existing.meals) ? existing.meals : [],
            weightMorning: existing.weightMorning || 60,
            sleepStart: existing.sleepStart || '23:00',
            sleepEnd: existing.sleepEnd || '07:00',
            sleepQuality: existing.sleepQuality || 3,
            moodMorning: existing.moodMorning || 3,
            updatedAt: Date.now(),
        };
        if (utils.writeDayV2Scoped) utils.writeDayV2Scoped(today, day);
        const profile = utils.readProfileForceRawScoped?.(clientId) || {};
        const nextProfile = {
            ...profile,
            stepsGoal: profile.stepsGoal || 10000,
            stepsGoalConfirmedDate: today,
            optionalFeatureConsentsOfferedAt: profile.optionalFeatureConsentsOfferedAt || Date.now(),
            measurementsTrackingEnabled: profile.measurementsTrackingEnabled ?? false,
            supplementsTrackingEnabled: profile.supplementsTrackingEnabled ?? false,
            profileCompleted: profile.profileCompleted ?? true,
            updatedAt: Date.now(),
        };
        if (w.HEYS?.store?.set) w.HEYS.store.set('heys_profile', nextProfile);
        else if (w.HEYS?.utils?.lsSet) w.HEYS.utils.lsSet('heys_profile', nextProfile);
        if (clientId) w.HEYS._optionalFeatureOfferDoneClientId = clientId;
        try {
            sessionStorage.setItem(`heys_morning_checkin_done_${clientId}_${today}`, 'true');
            sessionStorage.setItem('heys_curator_review_snoozed_until_ts', String(Date.now() + 86_400_000));
            sessionStorage.setItem('heys_curator_review_show_count_v1', '99');
        } catch (_) {
            // noop
        }
        return { ok: true, today };
    });

    if (seeded.ok && !skipReload) {
        try {
            await page.reload({ waitUntil: 'load', timeout: 90_000 });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!message.includes('interrupted')) throw err;
            await page.waitForLoadState('load', { timeout: 90_000 });
        }
    }

    const curatorSwitcher = page.locator('.hdr-bottom .hdr-client[data-dropdown="client"] .hdr-client-clickable');

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        if (await curatorSwitcher.isVisible().catch(() => false)) return;

        const dashboard = dashboardMealButton(page);
        if (await dashboard.isVisible().catch(() => false)) return;

        const targets = [
            page.getByRole('button', { name: 'На главную' }),
            page.getByRole('button', { name: 'Повторить' }),
            page.getByRole('dialog', { name: /обновил ваш дневник/i }).getByRole('button', { name: 'Понятно' }),
            page.getByRole('dialog', { name: /обновил ваш дневник/i }).getByRole('button', { name: 'Позже' }),
            page.getByRole('button', { name: 'Заполню позже' }),
            page.getByRole('button', { name: 'Не взвешивался' }),
            page.getByRole('button', { name: 'Готово' }),
            page.getByRole('button', { name: 'Пропустить' }),
            page.getByRole('button', { name: 'Дальше', exact: true }),
            page.getByRole('button', { name: 'Продолжить', exact: true }),
        ];

        let clicked = false;
        for (const locator of targets) {
            const btn = locator.first();
            if (await btn.isVisible().catch(() => false)) {
                await btn.click({ timeout: 5000 }).catch(() => {});
                clicked = true;
                await page.waitForTimeout(400);
                break;
            }
        }
        if (!clicked) await page.waitForTimeout(500);
    }
}

/** Кнопка «добавить запись» на дашборде (виджеты FAB + v4 CTA + legacy meal-fab). */
export function dashboardMealButton(page: Page) {
    return page.locator('.widgets-quick-fab, #nutrition-v4-cta, .meal-fab').first();
}

export async function expectDashboardReady(page: Page, timeout = 60_000): Promise<void> {
    await expect(dashboardMealButton(page)).toBeVisible({ timeout });
}

export async function loginWithHeysPin(page: Page, overrideCredentials?: HeysPinCredentials): Promise<string> {
    const credentials = overrideCredentials || getHeysPinCredentials();

    await page.goto('/');

    await page.evaluate(() => {
        try {
            localStorage.removeItem('heys_supabase_auth_token');
            localStorage.removeItem('heys_pin_auth_client');
            localStorage.removeItem('heys_session_token');
            localStorage.removeItem('heys_client_current');
            localStorage.removeItem('heys_last_client_id');
        } catch (_) {
            // noop
        }
    });

    try {
        await page.goto('/', { waitUntil: 'load', timeout: 90_000 });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('interrupted')) throw err;
        await page.waitForLoadState('load', { timeout: 90_000 });
    }

    await page.waitForFunction(() => {
        const heysWindow = window as typeof window & {
            HEYS?: {
                auth?: { loginClient?: unknown };
                cloud?: unknown;
            };
        };

        return Boolean(heysWindow.HEYS?.auth?.loginClient && heysWindow.HEYS?.cloud);
    });

    const loginResult = await page.evaluate(async ({ phone, pin, accessCode }) => {
        const heysWindow = window as typeof window & {
            HEYS?: any;
            __heysPreAuth?: {
                mode: string;
                clientId: string;
                timestamp: number;
            };
        };

        const auth = heysWindow.HEYS?.auth;
        const cloud = heysWindow.HEYS?.cloud;

        if (!auth?.loginClient) {
            return {
                ok: false,
                error: 'auth_not_ready',
                message: 'window.HEYS.auth.loginClient is unavailable',
            } satisfies LoginResult;
        }

        async function completeLogin(result: { clientId: string }) {
            if (cloud?.switchClient) {
                await cloud.switchClient(result.clientId);
            }

            const normalizedPhone = auth.normalizePhone ? auth.normalizePhone(phone) : phone;
            localStorage.setItem('heys_client_phone', JSON.stringify(normalizedPhone));

            heysWindow.__heysPreAuth = {
                mode: 'client',
                clientId: result.clientId,
                timestamp: Date.now(),
            };

            window.dispatchEvent(
                new CustomEvent('heys-auth-ready', {
                    detail: {
                        mode: 'client',
                        clientId: result.clientId,
                    },
                })
            );

            return {
                ok: true,
                clientId: result.clientId,
            } satisfies LoginResult;
        }

        let result = await auth.loginClient({ phone, pin });

        if (result?.error === 'needs_access_code_setup' && auth.setClientAccessCode) {
            const setup = await auth.setClientAccessCode({
                accessCode: accessCode || pin,
                sessionToken: result.sessionToken,
                clientId: result.clientId,
                phone,
            });
            if (!setup?.ok) {
                return {
                    ok: false,
                    error: setup?.error || 'access_code_setup_failed',
                    message: setup?.message,
                } satisfies LoginResult;
            }
            result = await auth.loginClient({ phone, pin });
        }

        if (!result?.ok || !result.clientId) {
            return {
                ok: false,
                error: result?.error || 'login_failed',
                message: result?.message,
                debug: result?._debug,
            } satisfies LoginResult;
        }

        try {
            return await completeLogin({ clientId: result.clientId });
        } catch (error) {
            return {
                ok: false,
                error: 'post_login_setup_failed',
                message: error instanceof Error ? error.message : String(error),
            } satisfies LoginResult;
        }
    }, credentials);

    expect(loginResult.ok, loginResult.message || loginResult.error || 'PIN login failed').toBeTruthy();
    expect(loginResult.clientId, 'PIN login did not return a clientId').toBeTruthy();

    // Post-login the shell may navigate on its own; tolerate races with `goto('/')`.
    try {
        await page.goto('/', { waitUntil: 'load', timeout: 90_000 });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('interrupted')) throw err;
        await page.waitForLoadState('load', { timeout: 90_000 });
    }

    await expect
        .poll(async () => {
            return page.evaluate(() => {
                const heysWindow = window as typeof window & { HEYS?: { currentClientId?: string | null } };

                return {
                    pinAuthClient: localStorage.getItem('heys_pin_auth_client'),
                    sessionToken: localStorage.getItem('heys_session_token'),
                    currentClientId: heysWindow.HEYS?.currentClientId || null,
                };
            });
        })
        .toMatchObject({
            pinAuthClient: loginResult.clientId,
            currentClientId: loginResult.clientId,
        });

    await expect
        .poll(async () => {
            return page.evaluate(() => Boolean(localStorage.getItem('heys_session_token')));
        })
        .toBeTruthy();

    await ensureE2eConsentsSigned(page, credentials.accessCode || credentials.pin);

    // 2026-05-31: anti-race для UI assertions сразу после login.
    // Если cloud-sync ещё не подгрузил scoped profile (heys_<cid>_profile),
    // profile_step.isProfileIncomplete() видит {} → ставит
    // heys_registration_in_progress=true → app рендерит registration wizard
    // вместо dashboard. Ждём пока profile реально появится с realname/completed
    // флагом, потом гарантируем что флаг чист (на случай если уже был установлен
    // до того как sync завершился).
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
        await page.evaluate(() => {
            try { localStorage.removeItem('heys_registration_in_progress'); } catch (_) { /* noop */ }
        });
    } catch (_) {
        // Не блокируем return — caller сам decides поведение для empty profile case.
    }

    await dismissPostLoginOverlays(page);

    return loginResult.clientId as string;
}
