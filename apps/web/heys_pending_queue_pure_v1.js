// heys_pending_queue_pure_v1.js — dedup identity + compact for pending sync queues (single source of truth)
// Load before heys_storage_supabase_v1.js (boot-core bundle).
(function (global) {
    'use strict';

    const HEYS = (global.HEYS = global.HEYS || {});

    const PENDING_CLIENT_QUEUE_KEY = 'heys_pending_client_sync_queue';

    function getPendingQueueIdentity(item, storageKey, fallbackIndex) {
        if (!item || typeof item !== 'object') return `__pending_invalid_${fallbackIndex}`;
        const normalizedKey = String(item.k || '');
        if (!normalizedKey) return `__pending_missing_key_${fallbackIndex}`;
        if (storageKey === PENDING_CLIENT_QUEUE_KEY || item.client_id) {
            return `${item.client_id || ''}:${normalizedKey}`;
        }
        return `${item.user_id || ''}:${normalizedKey}`;
    }

    function compactPendingQueue(queue, storageKey, options = {}) {
        if (!Array.isArray(queue) || queue.length <= 1) return Array.isArray(queue) ? queue : [];

        const dedupedReverse = [];
        const seen = new Set();

        for (let i = queue.length - 1; i >= 0; i--) {
            const item = queue[i];
            const identity = getPendingQueueIdentity(item, storageKey, i);
            if (seen.has(identity)) continue;
            seen.add(identity);
            dedupedReverse.push(item);
        }

        const compacted = dedupedReverse.reverse();
        if (options.mutate && Array.isArray(queue)) {
            queue.splice(0, queue.length, ...compacted);
            return queue;
        }

        return compacted;
    }

    HEYS.pendingQueuePure = {
        PENDING_CLIENT_QUEUE_KEY,
        getPendingQueueIdentity,
        compactPendingQueue,
    };
})(typeof window !== 'undefined' ? window : globalThis);
