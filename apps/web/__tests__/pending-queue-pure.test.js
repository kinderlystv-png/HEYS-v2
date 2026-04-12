/**
 * HEYS.pendingQueuePure — dedup / identity for client pending queue (production module).
 */

import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

const originalHEYS = global.HEYS;

function loadPureModule() {
    const srcPath = path.resolve(__dirname, '../heys_pending_queue_pure_v1.js');
    eval(fs.readFileSync(srcPath, 'utf8'));
}

describe('HEYS.pendingQueuePure', () => {
    afterEach(() => {
        global.HEYS = originalHEYS;
    });

    it('getPendingQueueIdentity uses client_id + k for client queue key', () => {
        global.HEYS = {};
        loadPureModule();
        const { getPendingQueueIdentity, PENDING_CLIENT_QUEUE_KEY } = global.HEYS.pendingQueuePure;
        expect(
            getPendingQueueIdentity({ client_id: 'c1', k: 'heys_dayv2_2026-01-01' }, PENDING_CLIENT_QUEUE_KEY, 0),
        ).toBe('c1:heys_dayv2_2026-01-01');
    });

    it('compactPendingQueue keeps last write per identity (client queue)', () => {
        global.HEYS = {};
        loadPureModule();
        const { compactPendingQueue, PENDING_CLIENT_QUEUE_KEY } = global.HEYS.pendingQueuePure;

        const q = [
            { client_id: 'c1', k: 'heys_products', v: { a: 1 } },
            { client_id: 'c1', k: 'heys_products', v: { a: 2 } },
            { client_id: 'c1', k: 'heys_profile', v: { name: 'x' } },
        ];

        const out = compactPendingQueue(q, PENDING_CLIENT_QUEUE_KEY);
        expect(out).toHaveLength(2);
        expect(out[0].v).toEqual({ a: 2 });
        expect(out[1].k).toBe('heys_profile');
    });

    it('compactPendingQueue uses user_id for non-client queue key', () => {
        global.HEYS = {};
        loadPureModule();
        const { compactPendingQueue } = global.HEYS.pendingQueuePure;

        const key = 'heys_pending_sync_queue';
        const q = [
            { user_id: 'u1', k: 'heys_norms', v: 1 },
            { user_id: 'u1', k: 'heys_norms', v: 2 },
        ];
        const out = compactPendingQueue(q, key);
        expect(out).toHaveLength(1);
        expect(out[0].v).toBe(2);
    });

    it('mutate option splices queue in place', () => {
        global.HEYS = {};
        loadPureModule();
        const { compactPendingQueue, PENDING_CLIENT_QUEUE_KEY } = global.HEYS.pendingQueuePure;

        const q = [
            { client_id: 'c1', k: 'k1', v: 1 },
            { client_id: 'c1', k: 'k1', v: 2 },
        ];
        const ret = compactPendingQueue(q, PENDING_CLIENT_QUEUE_KEY, { mutate: true });
        expect(ret).toBe(q);
        expect(q).toHaveLength(1);
        expect(q[0].v).toBe(2);
    });
});
