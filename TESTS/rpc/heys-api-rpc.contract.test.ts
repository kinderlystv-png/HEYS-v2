// @vitest-environment node
/**
 * Phase 4 — RPC contract tests для heys-api-rpc.
 *
 * Direct fetch к prod RPC endpoint без UI. Verify whitelist + basic gates.
 *
 * Note: эти тесты бьют **prod** endpoint (read-only / negative paths).
 * Они safe потому что:
 *  - anon requests (no auth) → server отказывает
 *  - unknown fn → whitelist rejects
 *  - НЕ создаёт writes к client_kv_store
 *
 * Authenticated contract tests (Phase 4b) требуют PIN multi-step auth
 * reverse-engineering — отложены в TODO.
 */
import { describe, it, expect } from 'vitest';
import { config as loadEnv } from 'dotenv';
import { fetch as undiciFetch } from 'undici';

// vitest.setup.ts мокает global.fetch → не получаем реальные server responses.
// Используем undici fetch напрямую для real HTTP calls.
const realFetch: typeof undiciFetch = undiciFetch;

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const RPC_URL = process.env.HEYS_TEST_RPC_URL || 'https://api.heyslab.ru/rpc';
const RPC_GET_URL = (fn: string) => `${RPC_URL}?fn=${encodeURIComponent(fn)}`;

describe('RPC contract: /rpc whitelist + auth gates (anon-side)', () => {
    it('POST /rpc без fn → 400 "Missing function name"', async () => {
        const res = await realFetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
        const body = await res.json().catch(() => ({} as any));
        expect(body?.error || '').toMatch(/Missing function name|fn parameter/i);
    });

    it('POST /rpc?fn=<unknown> → 403 "not allowed"', async () => {
        const res = await realFetch(RPC_GET_URL('nonexistent_function_e2e_test_2026'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(403);
        const body = await res.json().catch(() => ({} as any));
        expect(body?.error || '').toMatch(/not allowed/i);
    });

    it('POST /rpc?fn=getKV без auth header → 4xx (не 200, не data leak)', async () => {
        const res = await realFetch(RPC_GET_URL('getKV'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: '11111111-1111-1111-1111-111111111111', k: 'heys_profile' }),
        });
        // Server должен отказать, либо вернуть error в body
        if (res.status === 200) {
            const body = await res.json().catch(() => ({} as any));
            expect(body?.error, 'anon getKV без auth должен вернуть error').toBeTruthy();
            expect(body?.v, 'anon getKV не должен возвращать data').toBeUndefined();
        } else {
            expect(res.status).toBeGreaterThanOrEqual(400);
            expect(res.status).toBeLessThan(500);
        }
    });

    it('GET /rpc → 405 Method not allowed', async () => {
        const res = await realFetch(RPC_URL, { method: 'GET' });
        expect(res.status).toBe(405);
        // Body может быть empty в gateway 405 response — status кода достаточно.
    });

    it.skip('TODO Phase 4b: authenticated contract — PIN multi-step auth flow', async () => {
        // Требует:
        //  1. POST /auth/login → SMS code (или PIN-based pre-auth для test creds?)
        //  2. POST /auth/verify → session_token
        //  3. POST /rpc?fn=getKV with Authorization: Bearer <token>
        //  4. Verify response schema { v, updated_at } | { error }
        //  5. Cross-client isolation: getKV для другого client_id → 403/empty
    });
});
