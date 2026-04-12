/**
 * HEYS.auth.createClientWithPin + resetClientPin — RPC shape, validation, dispatch.
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

describe('HEYS.auth createClientWithPin / resetClientPin', () => {
    let mockStorage;
    let rpc;

    beforeEach(() => {
        mockStorage = createMockStorage();
        Object.defineProperty(window, 'localStorage', {
            value: mockStorage,
            writable: true,
            configurable: true,
        });

        rpc = vi.fn();
        window.HEYS = { YandexAPI: { rpc } };
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

    describe('createClientWithPin', () => {
        it('rejects invalid_phone before RPC', async () => {
            const r = await window.HEYS.auth.createClientWithPin({
                name: 'Test',
                phone: 'bad',
                pin: '1234',
            });
            expect(r).toEqual({ ok: false, error: 'invalid_phone' });
            expect(rpc).not.toHaveBeenCalled();
        });

        it('rejects invalid_pin before RPC', async () => {
            const r = await window.HEYS.auth.createClientWithPin({
                name: 'Test',
                phone: '+7 999 111-22-33',
                pin: '12',
            });
            expect(r).toEqual({ ok: false, error: 'invalid_pin' });
            expect(rpc).not.toHaveBeenCalled();
        });

        it('returns api_not_ready without YandexAPI', async () => {
            delete window.HEYS.YandexAPI;
            const r = await window.HEYS.auth.createClientWithPin({
                name: 'Test',
                phone: '+7 999 111-22-33',
                pin: '1234',
            });
            expect(r).toEqual({ ok: false, error: 'api_not_ready' });
        });

        it('calls create_client_with_pin with normalized phone, salt and pin_hash', async () => {
            rpc.mockResolvedValue({
                data: { client_id: 'new-client-1' },
                error: null,
            });

            const r = await window.HEYS.auth.createClientWithPin({
                name: '  Ann  ',
                phone: '+7 999 111-22-33',
                pin: '5678',
            });

            expect(r.ok).toBe(true);
            expect(r.clientId).toBe('new-client-1');
            expect(r.phone).toBe('79991112233');
            expect(r.pin).toBe('5678');
            expect(rpc).toHaveBeenCalledTimes(1);
            const [fn, params] = rpc.mock.calls[0];
            expect(fn).toBe('create_client_with_pin');
            expect(params.p_name).toBe('Ann');
            expect(params.p_phone).toBe('79991112233');
            expect(params.p_pin_salt).toMatch(/^[a-f0-9]{32}$/);
            expect(params.p_pin_hash).toMatch(/^[a-f0-9]{64}$/);
            expect(window.dispatchEvent).toHaveBeenCalled();
        });

        it('extracts clientId from array-shaped response', async () => {
            rpc.mockResolvedValue({
                data: [{ id: 'from-array' }],
                error: null,
            });
            const r = await window.HEYS.auth.createClientWithPin({
                name: 'X',
                phone: '+7 999 111-22-33',
                pin: '1234',
            });
            expect(r.clientId).toBe('from-array');
        });

        it('maps RPC error to server_error', async () => {
            rpc.mockResolvedValue({
                data: null,
                error: { message: 'duplicate_phone' },
            });
            const r = await window.HEYS.auth.createClientWithPin({
                name: 'X',
                phone: '+7 999 111-22-33',
                pin: '1234',
            });
            expect(r).toEqual({
                ok: false,
                error: 'server_error',
                message: 'duplicate_phone',
            });
        });
    });

    describe('resetClientPin', () => {
        it('rejects missing_client_id', async () => {
            const r = await window.HEYS.auth.resetClientPin({ clientId: '', newPin: '1234' });
            expect(r).toEqual({ ok: false, error: 'missing_client_id' });
            expect(rpc).not.toHaveBeenCalled();
        });

        it('rejects invalid_pin', async () => {
            const r = await window.HEYS.auth.resetClientPin({ clientId: 'c1', newPin: '99' });
            expect(r).toEqual({ ok: false, error: 'invalid_pin' });
            expect(rpc).not.toHaveBeenCalled();
        });

        it('returns api_not_ready without YandexAPI', async () => {
            delete window.HEYS.YandexAPI;
            const r = await window.HEYS.auth.resetClientPin({ clientId: 'c1', newPin: '1234' });
            expect(r).toEqual({ ok: false, error: 'api_not_ready' });
        });

        it('calls reset_client_pin with client id, salt and hash', async () => {
            rpc.mockResolvedValue({ data: { ok: true }, error: null });

            const r = await window.HEYS.auth.resetClientPin({
                clientId: 'client-uuid-9',
                newPin: '9876',
            });

            expect(r).toEqual({ ok: true });
            expect(rpc).toHaveBeenCalledTimes(1);
            const [fn, params] = rpc.mock.calls[0];
            expect(fn).toBe('reset_client_pin');
            expect(params.p_client_id).toBe('client-uuid-9');
            expect(params.p_pin_salt).toMatch(/^[a-f0-9]{32}$/);
            expect(params.p_pin_hash).toMatch(/^[a-f0-9]{64}$/);
        });

        it('maps RPC error to server_error', async () => {
            rpc.mockResolvedValue({
                data: null,
                error: { message: 'forbidden' },
            });
            const r = await window.HEYS.auth.resetClientPin({
                clientId: 'c1',
                newPin: '1234',
            });
            expect(r).toEqual({
                ok: false,
                error: 'server_error',
                message: 'forbidden',
            });
        });
    });
});
