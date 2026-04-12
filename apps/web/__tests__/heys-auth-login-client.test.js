/**
 * Production-path tests for HEYS.auth.loginClient (verify_client_pin_v3).
 * Loads real heys_auth_v1.js IIFE with mocked localStorage, YandexAPI.rpc.
 * Uses default happy-dom environment (window + Event).
 */

import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalLocalStorage = window.localStorage;
const originalHEYS = window.HEYS;

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

describe('HEYS.auth.loginClient (verify_client_pin_v3)', () => {
    let mockStorage;
    let rpc;

    beforeEach(() => {
        vi.useFakeTimers();

        mockStorage = createMockStorage();
        Object.defineProperty(window, 'localStorage', {
            value: mockStorage,
            writable: true,
            configurable: true,
        });

        rpc = vi.fn();
        window.HEYS = {
            YandexAPI: { rpc },
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
        window.HEYS = originalHEYS;
    });

    async function flushLoginDelay() {
        await vi.advanceTimersByTimeAsync(900);
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
            _debug: { stage: 'verify_pin', rpc: 'verify_client_pin_v3' },
        });
        expect(rpc).toHaveBeenCalledWith('verify_client_pin_v3', {
            p_phone: '79991234567',
            p_pin: '1234',
        });
    });

    it('maps other RPC errors to invalid_credentials', async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { message: 'invalid_credentials', code: 401 },
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
        rpc.mockResolvedValue({
            data: { verify_client_pin_v3: { success: false, error: 'rate_limited' } },
            error: null,
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({ ok: false, error: 'rate_limited' });
    });

    it('returns invalid_credentials when success but missing client_id or session_token', async () => {
        rpc.mockResolvedValue({
            data: { verify_client_pin_v3: { success: true, client_id: null, session_token: 'tok' } },
            error: null,
        });
        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;
        expect(result).toMatchObject({
            ok: false,
            error: 'invalid_credentials',
            _debug: { hasClientId: false, hasSessionToken: true },
        });
    });

    it('on success persists session_token, pin client, optional name, clears supabase curator token, dispatches event', async () => {
        mockStorage.setItem('heys_supabase_auth_token', JSON.stringify({ access_token: 'x' }));

        rpc.mockResolvedValue({
            data: {
                verify_client_pin_v3: {
                    success: true,
                    client_id: 'client-uuid-1',
                    session_token: 'session-token-abc',
                    name: 'Иван',
                },
            },
            error: null,
        });

        const p = window.HEYS.auth.loginClient({ phone: '+7 999 123-45-67', pin: '1234' });
        await flushLoginDelay();
        const result = await p;

        expect(result).toEqual({
            ok: true,
            clientId: 'client-uuid-1',
            sessionToken: 'session-token-abc',
            clientName: 'Иван',
        });

        expect(mockStorage.removeItem).toHaveBeenCalledWith('heys_supabase_auth_token');
        expect(mockStorage.setItem).toHaveBeenCalledWith(
            'heys_session_token',
            JSON.stringify('session-token-abc'),
        );
        expect(mockStorage.setItem).toHaveBeenCalledWith('heys_pin_auth_client', 'client-uuid-1');
        expect(mockStorage.setItem).toHaveBeenCalledWith(
            'heys_pending_client_name',
            JSON.stringify('Иван'),
        );
        expect(window.dispatchEvent).toHaveBeenCalled();
        expect(window.HEYS.auth.getSessionToken()).toBe('session-token-abc');
    });

    it('rate limits locally after 10 failed RPC attempts (11th does not call RPC)', async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { message: 'invalid_credentials', code: 401 },
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
