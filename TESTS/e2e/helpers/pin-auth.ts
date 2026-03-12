import { expect, type Page } from '@playwright/test';

type HeysPinCredentials = {
    phone: string;
    pin: string;
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
    return Boolean(process.env.HEYS_TEST_PHONE && process.env.HEYS_TEST_PIN);
}

export function getHeysPinCredentials(): HeysPinCredentials {
    return {
        phone: normalizePhone(process.env.HEYS_TEST_PHONE || ''),
        pin: normalizePin(process.env.HEYS_TEST_PIN || ''),
    };
}

export async function loginWithHeysPin(page: Page): Promise<string> {
    const credentials = getHeysPinCredentials();

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

    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
        const heysWindow = window as typeof window & {
            HEYS?: {
                auth?: { loginClient?: unknown };
                cloud?: unknown;
            };
        };

        return Boolean(heysWindow.HEYS?.auth?.loginClient && heysWindow.HEYS?.cloud);
    });

    const loginResult = await page.evaluate(async ({ phone, pin }) => {
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

        const result = await auth.loginClient({ phone, pin });

        if (!result?.ok || !result.clientId) {
            return {
                ok: false,
                error: result?.error || 'login_failed',
                message: result?.message,
                debug: result?._debug,
            } satisfies LoginResult;
        }

        try {
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
        } catch (error) {
            return {
                ok: false,
                error: 'post_login_setup_failed',
                message: error instanceof Error ? error.message : String(error),
            } satisfies LoginResult;
        }

        return {
            ok: true,
            clientId: result.clientId,
        } satisfies LoginResult;
    }, credentials);

    expect(loginResult.ok, loginResult.message || loginResult.error || 'PIN login failed').toBeTruthy();
    expect(loginResult.clientId, 'PIN login did not return a clientId').toBeTruthy();

    await page.reload({ waitUntil: 'domcontentloaded' });

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

    return loginResult.clientId as string;
}
