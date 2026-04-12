/**
 * HEYS.auth session helpers: getSessionToken (migration), clearSessionToken,
 * hasSession, logout (revoke_session + local cleanup).
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
    eval(fs.readFileSync(authPath, 'utf8'));
}

describe('HEYS.auth session + logout', () => {
    let mockStorage;
    let rpc;

    beforeEach(() => {
        mockStorage = createMockStorage();
        Object.defineProperty(window, 'localStorage', {
            value: mockStorage,
            writable: true,
            configurable: true,
        });

        rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
        window.HEYS = {
            YandexAPI: { rpc },
        };

        loadAuthModule();
        vi.spyOn(window, 'dispatchEvent');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        Object.defineProperty(window, 'localStorage', {
            value: originalLocalStorage,
            writable: true,
            configurable: true,
        });
        window.HEYS = originalHEYS;
    });

    it('getSessionToken migrates namespaced token to global key', () => {
        mockStorage._store.heys_pin_auth_client = 'client-abc';
        mockStorage._store['heys_client-abc_session_token'] = JSON.stringify('migrated-token');

        const token = window.HEYS.auth.getSessionToken();

        expect(token).toBe('migrated-token');
        expect(mockStorage.setItem).toHaveBeenCalledWith(
            'heys_session_token',
            JSON.stringify('migrated-token'),
        );
        expect(mockStorage.removeItem).toHaveBeenCalledWith('heys_client-abc_session_token');
    });

    it('clearSessionToken removes global session key', () => {
        mockStorage._store.heys_session_token = JSON.stringify('tok');
        window.HEYS.auth.clearSessionToken();
        expect(mockStorage.removeItem).toHaveBeenCalledWith('heys_session_token');
    });

    it('hasSession reflects getSessionToken', () => {
        expect(window.HEYS.auth.hasSession()).toBe(false);
        mockStorage._store.heys_session_token = JSON.stringify('x');
        expect(window.HEYS.auth.hasSession()).toBe(true);
    });

    it('logout calls revoke_session then clears local keys and dispatches event', async () => {
        mockStorage._store.heys_session_token = JSON.stringify('sess-revoke');
        mockStorage._store.heys_client_current = 'client-1';

        const result = await window.HEYS.auth.logout();

        expect(result).toEqual({ ok: true });
        expect(rpc).toHaveBeenCalledWith('revoke_session', { p_session_token: 'sess-revoke' });
        expect(mockStorage.removeItem).toHaveBeenCalledWith('heys_session_token');
        expect(mockStorage.removeItem).toHaveBeenCalledWith('heys_client_current');
        expect(window.dispatchEvent).toHaveBeenCalled();
    });

    it('logout skips RPC when no session token but still dispatches', async () => {
        await window.HEYS.auth.logout();
        expect(rpc).not.toHaveBeenCalled();
        expect(window.dispatchEvent).toHaveBeenCalled();
    });

    it('logout clears local session even if revoke_session throws', async () => {
        mockStorage._store.heys_session_token = JSON.stringify('sess-1');
        rpc.mockRejectedValue(new Error('network'));

        const result = await window.HEYS.auth.logout();

        expect(result).toEqual({ ok: true });
        expect(mockStorage.removeItem).toHaveBeenCalledWith('heys_session_token');
        expect(window.dispatchEvent).toHaveBeenCalled();
    });
});
