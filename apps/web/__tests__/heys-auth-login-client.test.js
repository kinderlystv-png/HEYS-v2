/**
 * Production-path tests for HEYS.auth.loginClient (login_client_v1 + onetime PIN).
 * Loads real heys_auth_v1.js IIFE with mocked localStorage, YandexAPI.rpc.
 * Uses default happy-dom environment (window + Event).
 */

import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalLocalStorage = window.localStorage;
const originalHEYS = window.HEYS;
const originalLocation = window.location;

function createMockStorage() {
    const store = {};
    return {
        getItem: vi.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
        setItem: vi.fn((key, value) => {
            store[key] = String(value);
        }),
        removeItem: vi.fn((key) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            Object.keys(store).forEach((k) => {
                delete store[k];
            });
        }),
        _store: store,
    };
}

function loadAuthModule() {
    const authPath = path.resolve(__dirname, '../heys_auth_v1.js');
    const source = fs.readFileSync(authPath, 'utf8');
    eval(source);
}

describe('HEYS.auth.loginClient (login_client_v1 + onetime PIN)', () => {
    let mockStorage;
    let rpc;
    let curatorLogout;
    let clientLogout;

    beforeEach(() => {
        vi.useFakeTimers();

        mockStorage = createMockStorage();
        Object.defineProperty(window, 'localStorage', {
            value: mockStorage,
            writable: true,
            configurable: true,
        });

        // Тест проверяет production-поведение setSessionToken (PR-C cookie-only).
        // happy-dom по умолчанию ставит hostname=localhost — это активирует
        // dev-fallback в setSessionToken и ломает контракт. Стабим на prod-host.
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, hostname: 'app.heyslab.ru' },
            writable: true,
            configurable: true,
        });

        rpc = vi.fn();
        curatorLogout = vi.fn().mockResolvedValue({ ok: true });
        clientLogout = vi.fn().mockResolvedValue({ ok: true });
        window.HEYS = {
            YandexAPI: { rpc, curatorLogout, clientLogout },
        };

        loadAuthModule();
        vi.spyOn(window, 'dispatchEvent');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        Object.defineProperty(window, 'localStorage', {
            value: originalLocalStorage,
            writable: true,
            configurable: true,
        });
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
            configurable: true,
        });
        window.HEYS = originalHEYS;
    });

    async function flushLoginDelay() {
        await vi.advanceTimersByTimeAsync(900);
    }

    function mockLoginNotConfigured() {
        rpc.mockResolvedValueOnce({
            data: { login_client_v1: { success: false, error: 'access_code_not_set' } },
            error: null,
        });
    }

    function mockTrustedLogin(row = {}) {
        rpc.mockResolvedValueOnce({
            data: {
                login_client_v1: {
                    success: true,
                    client_id: 'client-uuid-1',
                    session_token: 'session-token-abc',
                    name: 'Иван',
                    ...row,
                },
            },
            error: null,
        });
    }

    function mockOnetimeLogin(row = {}) {
        mockLoginNotConfigured();
        rpc.mockResolvedValueOnce({
            data: {
                verify_client_onetime_pin: {
                    success: true,
                    client_id: 'client-uuid-1',
                    session_token: 'session-token-abc',
                    needs_access_code: false,
                    name: 'Иван',
                    ...row,
                },
            },
            error: null,
        });
    }


    it('returns invalid_phone before RPC', async () => {
        const p = window.HEYS.auth.loginClient({ phone: '123', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toEqual({ ok: false, error: 'invalid_phone' });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('returns invalid_pin before RPC', async () => {
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '12' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toEqual({ ok: false, error: 'invalid_pin' });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('returns api_not_ready when YandexAPI is missing', async () => {
        delete window.HEYS.YandexAPI;
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result.ok).toBe(false);
        expect(result.error).toBe('api_not_ready');
    });

    it('returns api_not_ready when role-switch cleanup API is incomplete', async () => {
        window.HEYS.YandexAPI = { rpc };
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({
            ok: false,
            error: 'api_not_ready',
            _debug: { stage: 'role_switch_cleanup_api' },
        });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('maps RPC error rate_limited to rate_limited', async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { message: 'rate_limited', code: 429 },
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({
            ok: false,
            error: 'rate_limited',
            _debug: { stage: 'login_client_v1', rpc: 'login_client_v1' },
        });
        expect(rpc).toHaveBeenCalledWith('login_client_v1', expect.objectContaining({
            p_phone: '79991234567',
        }));
    });

    it('maps other RPC errors to invalid_credentials', async () => {
        mockLoginNotConfigured();
        rpc.mockResolvedValueOnce({
            data: { verify_client_onetime_pin: { success: false, error: 'invalid_credentials' } },
            error: null,
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({
            ok: false,
            error: 'invalid_credentials',
        });
    });

    it('maps server vRow.error rate_limited to rate_limited', async () => {
        mockLoginNotConfigured();
        rpc.mockResolvedValueOnce({
            data: { verify_client_onetime_pin: { success: false, error: 'rate_limited' } },
            error: null,
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({ ok: false, error: 'rate_limited' });
    });

    it('returns session_not_issued (not invalid_credentials) when success but missing client_id or session_token', async () => {
        mockTrustedLogin({ client_id: null, session_token: 'tok' });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({
            ok: false,
            error: 'session_not_issued',
            _debug: { hasClientId: false, hasSessionToken: true },
        });
    });

    // Экран показывает «PIN не подошёл» только на invalid_credentials. Любой
    // другой серверный код обязан доехать до экрана вместе с текстом сервера —
    // иначе клиент решит, что забыл код (инцидент 2026-08-11).
    it('passes pin_login_disabled through with the server message', async () => {
        mockLoginNotConfigured();
        rpc.mockResolvedValueOnce({
            data: {
                verify_client_onetime_pin: {
                    success: false,
                    error: 'pin_login_disabled',
                    message: 'Вход по PIN временно отключён. Куратор откроет доступ после обновления входа.',
                },
            },
            error: null,
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({
            ok: false,
            error: 'pin_login_disabled',
            serverError: 'pin_login_disabled',
            serverMessage: 'Вход по PIN временно отключён. Куратор откроет доступ после обновления входа.',
        });
    });

    it('maps server pin_rate_limited to rate_limited and keeps the server message', async () => {
        rpc.mockResolvedValueOnce({
            data: {
                login_client_v1: {
                    success: false,
                    error: 'pin_rate_limited',
                    message: 'Слишком много попыток. Попробуйте позже или напишите куратору.',
                },
            },
            error: null,
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({
            ok: false,
            error: 'rate_limited',
            serverError: 'pin_rate_limited',
            serverMessage: 'Слишком много попыток. Попробуйте позже или напишите куратору.',
        });
    });

    it('does not collapse an unknown server code into invalid_credentials', async () => {
        mockLoginNotConfigured();
        rpc.mockResolvedValueOnce({
            data: {
                verify_client_onetime_pin: {
                    success: false,
                    error: 'client_archived',
                    message: 'Доступ закрыт куратором.',
                },
            },
            error: null,
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({
            ok: false,
            error: 'client_archived',
            serverMessage: 'Доступ закрыт куратором.',
        });
    });

    it('still reports invalid_credentials when the server gives no reason at all', async () => {
        mockLoginNotConfigured();
        rpc.mockResolvedValueOnce({
            data: { verify_client_onetime_pin: { success: false } },
            error: null,
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({ ok: false, error: 'invalid_credentials' });
    });

    it('maps a transport failure to network_error, not invalid_credentials', async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { message: 'Failed to fetch', code: 'NETWORK_ERROR' },
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({ ok: false, error: 'network_error' });
    });

    it('passes an HTTP-level server code and its message through', async () => {
        rpc.mockResolvedValue({
            data: null,
            error: {
                message: 'pin_login_disabled',
                code: 403,
                raw: { error: 'pin_login_disabled', message: 'Вход по PIN временно отключён.' },
            },
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({
            ok: false,
            error: 'pin_login_disabled',
            serverMessage: 'Вход по PIN временно отключён.',
        });
    });

    it('on success persists pin client + name, clears curator tokens, dispatches event, does NOT write session_token to LS (PR-C cookie-only)', async () => {
        mockStorage.setItem('heys_supabase_auth_token', JSON.stringify({ access_token: 'x' }));
        mockStorage.setItem('heys_curator_session', 'curator-jwt-stale');

        mockTrustedLogin();

        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;

        expect(result).toMatchObject({
            ok: true,
            clientId: 'client-uuid-1',
            sessionToken: 'session-token-abc',
            clientName: 'Иван',
            phone: '79991234567',
        });

        expect(mockStorage.removeItem).toHaveBeenCalledWith('heys_supabase_auth_token');
        expect(mockStorage.removeItem).toHaveBeenCalledWith('heys_curator_session');
        expect(curatorLogout).toHaveBeenCalledTimes(1);
        expect(mockStorage.setItem).toHaveBeenCalledWith('heys_pin_auth_client', 'client-uuid-1');
        expect(mockStorage.setItem).toHaveBeenCalledWith('heys_pin_cookie_session_hint', '1');
        expect(mockStorage.setItem).toHaveBeenCalledWith(
            'heys_pending_client_name',
            JSON.stringify('Иван'),
        );
        expect(window.dispatchEvent).toHaveBeenCalled();

        // PR-C (d94ebfc9, 2026-05-20): setSessionToken — no-op. Токен живёт в
        // HttpOnly cookie heys_session_token, JS его не пишет и не читает.
        expect(mockStorage.setItem).not.toHaveBeenCalledWith(
            'heys_session_token',
            expect.anything(),
        );
        expect(window.HEYS.auth.getSessionToken()).toBe(null);
    });

    it('fails closed and rolls back PIN cookie when stale curator cookie cleanup fails', async () => {
        curatorLogout.mockResolvedValueOnce({
            ok: false,
            error: { message: 'cleanup_failed' },
        });
        mockTrustedLogin();
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;

        expect(result).toMatchObject({
            ok: false,
            error: 'role_switch_cleanup_failed',
            _debug: { stage: 'clear_curator_cookie' },
        });
        expect(curatorLogout).toHaveBeenCalledTimes(1);
        expect(clientLogout).toHaveBeenCalledTimes(1);
        expect(mockStorage.setItem).not.toHaveBeenCalledWith('heys_pin_auth_client', 'client-uuid-1');
    });

    // Локальный счётчик наказывает только за реально неверный код. Иначе
    // падение бэкенда запирало бы человека в его же браузере после десяти
    // попыток, хотя он ни разу не ошибся.
    async function attemptTimes(times) {
        for (let i = 0; i < times; i++) {
            const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
            await flushLoginDelay();
            await p;
        }
    }

    it('does not lock the browser after 10 network failures', async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { message: 'Failed to fetch', code: 'NETWORK_ERROR' },
        });

        await attemptTimes(10);
        rpc.mockClear();

        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;

        expect(result).toMatchObject({ ok: false, error: 'network_error' });
        expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('does not lock the browser while PIN login is disabled server-side', async () => {
        let call = 0;
        rpc.mockImplementation(() => {
            call += 1;
            if (call % 2 === 1) {
                return Promise.resolve({
                    data: { login_client_v1: { success: false, error: 'access_code_not_set' } },
                    error: null,
                });
            }
            return Promise.resolve({
                data: {
                    verify_client_onetime_pin: {
                        success: false,
                        error: 'pin_login_disabled',
                        message: 'Вход по PIN временно отключён.',
                    },
                },
                error: null,
            });
        });

        await attemptTimes(10);
        rpc.mockClear();

        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;

        expect(result).toMatchObject({ ok: false, error: 'pin_login_disabled' });
        expect(rpc).toHaveBeenCalledTimes(2);
    });

    it('does not lock the browser when the server fails to issue a session', async () => {
        rpc.mockResolvedValue({
            data: { login_client_v1: { success: true, client_id: null, session_token: null } },
            error: null,
        });

        await attemptTimes(10);
        rpc.mockClear();

        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;

        expect(result).toMatchObject({ ok: false, error: 'session_not_issued' });
        expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('keeps the exception text out of the response and out of the counter', async () => {
        rpc.mockRejectedValue(new Error('boom: internal detail'));

        await attemptTimes(10);
        rpc.mockClear();

        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;

        expect(result).toMatchObject({ ok: false, error: 'exception' });
        expect(result.message).toBeUndefined();
        expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('rate limits locally after 10 failed RPC attempts (11th does not call RPC)', async () => {
        let call = 0;
        rpc.mockImplementation(() => {
            call += 1;
            if (call % 2 === 1) {
                return Promise.resolve({
                    data: { login_client_v1: { success: false, error: 'access_code_required' } },
                    error: null,
                });
            }
            return Promise.resolve({
                data: null,
                error: { message: 'invalid_access_code', code: 401 },
            });
        });

        const phone = '+7 999 123-45-67';
        for (let i = 0; i < 10; i++) {
            const p = window.HEYS.auth.loginClient({ phone, pin: '1234' });
            await flushLoginDelay();
            await p;
        }

        rpc.mockClear();

        const p11 = window.HEYS.auth.loginClient({ phone, pin: '1234' });
        await flushLoginDelay();
        const r11 = await p11;

        expect(r11).toMatchObject({ ok: false, error: 'rate_limited' });
        expect(r11.retryAfterMs).toBeGreaterThan(0);
        expect(rpc).not.toHaveBeenCalled();
    });
});
