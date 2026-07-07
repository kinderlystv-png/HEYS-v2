// heys_sync_queue_runtime_pure_v1.js
// Pure runtime helpers for client sync queue: enqueue, flush orchestration, retry decisions.
// Load before heys_storage_supabase_v1.js (boot-core bundle).
(function (global) {
    'use strict';

    const HEYS = (global.HEYS = global.HEYS || {});

    function isCriticalSyncKey(normalizedKey) {
        if (!normalizedKey) return false;
        return (
            normalizedKey.includes('dayv2_') ||
            normalizedKey === 'heys_profile' ||
            normalizedKey === 'heys_norms' ||
            normalizedKey === 'heys_hr_zones' ||
            normalizedKey === 'heys_products' ||
            normalizedKey === 'heys_products_overlay_v2' ||
            normalizedKey === 'heys_client_current' ||
            normalizedKey === 'heys_subscription_status' ||
            normalizedKey.startsWith('heys_planning_') ||
            normalizedKey.includes('widget_layout')
        );
    }

    function shouldScheduleRetryAfterRpcError(params) {
        const isAuthError = !!params?.isAuthError;
        const retryAttempt = Number(params?.retryAttempt || 0);
        const maxRetryAttempts = Number(params?.maxRetryAttempts || 0);
        if (isAuthError) return false;
        return retryAttempt < maxRetryAttempts;
    }

    function restorePersistentQueueState(params) {
        const queue = Array.isArray(params?.queue) ? params.queue : [];
        const inFlightQueue = Array.isArray(params?.inFlightQueue) ? params.inFlightQueue : [];
        const compactQueue = typeof params?.compactQueue === 'function'
            ? params.compactQueue
            : (items) => items;

        if (inFlightQueue.length === 0) {
            return { queue: queue.slice(), restoredCount: 0 };
        }

        const restoredQueue = compactQueue([...inFlightQueue, ...queue]);
        return {
            queue: Array.isArray(restoredQueue) ? restoredQueue : [...inFlightQueue, ...queue],
            restoredCount: inFlightQueue.length,
        };
    }

    function requeueInFlightBatch(params) {
        const queue = Array.isArray(params?.queue) ? params.queue : [];
        const batch = Array.isArray(params?.batch) ? params.batch : [];
        const compactQueue = typeof params?.compactQueue === 'function'
            ? params.compactQueue
            : (items) => items;

        if (batch.length === 0) {
            return queue.slice();
        }

        const mergedQueue = compactQueue([...batch, ...queue]);
        return Array.isArray(mergedQueue) ? mergedQueue : [...batch, ...queue];
    }

    // L3 (2026-06-03): pull-side revision gate decision (pure).
    // Decides whether an incoming cloud value should be applied based on the server
    // revision it carries vs the highest revision this client has already applied for
    // the key. This is ADDITIVE and conservative:
    //   * remoteRevision absent / non-positive (old DB row, deploy-lag) → return true
    //     by default ("no revision info" → defer to the caller's legacy updatedAt /
    //     pending guards).
    //   * requireRemoteRevision=true + localRevision known + remoteRevision absent →
    //     return false. This is the post-rollout ceiling: once a client has already
    //     applied a server revision for a key, a later legacy/no-revision pull cannot
    //     overwrite that key.
    //   * localRevision unknown (never applied this key) → return true (apply).
    //   * otherwise apply ONLY when remoteRevision > localRevision.
    // It NEVER forces an apply past a legacy guard — callers still run their
    // pending-local-edit protections after this returns true. Its only new effect is
    // to SKIP re-applying a revision we have already seen (remote <= local).
    function shouldApplyByRevision(params) {
        const remote = Number(params && params.remoteRevision);
        const local = Number(params && params.localRevision);
        if (!Number.isFinite(remote) || remote <= 0) {
            return !(params && params.requireRemoteRevision && Number.isFinite(local) && local > 0);
        }
        if (!Number.isFinite(local) || local <= 0) return true;
        return remote > local;
    }

    function stripRootDayMergeMeta(day) {
        if (!day || typeof day !== 'object') return day;
        const {
            updatedAt,
            _sourceId,
            _mergedAt,
            _writerCid,
            _h,
            ...rest
        } = day;
        return rest;
    }

    function areDayv2MergeValuesEquivalent(localDay, remoteDay) {
        if (!localDay || !remoteDay || typeof localDay !== 'object' || typeof remoteDay !== 'object') {
            return false;
        }
        try {
            const ch = global.HEYS && global.HEYS.contentHash;
            if (ch && typeof ch.hashDay === 'function') {
                return ch.hashDay(localDay) === ch.hashDay(remoteDay);
            }
        } catch (_) { /* fallback below */ }

        try {
            const dayUtils = global.HEYS && global.HEYS.dayUtils;
            if (dayUtils && typeof dayUtils.isSameDayHydratedContent === 'function'
                && dayUtils.isSameDayHydratedContent(localDay, remoteDay)) {
                return true;
            }
        } catch (_) { /* fallback below */ }

        try {
            return JSON.stringify(stripRootDayMergeMeta(localDay)) === JSON.stringify(stripRootDayMergeMeta(remoteDay));
        } catch (_) {
            return false;
        }
    }

    function getStalledUploadRecoveryDecision(params) {
        const now = Number(params?.now || Date.now());
        const uploadStartedAt = Number(params?.uploadStartedAt || 0);
        const minAgeMs = Math.max(1000, Number(params?.minAgeMs || 60000));
        const inFlightCount = Number(params?.inFlightCount || 0);

        if (!params?.uploadInProgress) {
            return { recover: false, reason: 'not_uploading', ageMs: 0 };
        }
        if (!(inFlightCount > 0)) {
            return { recover: false, reason: 'no_inflight', ageMs: 0 };
        }
        if (params?.online === false) {
            return { recover: false, reason: 'offline', ageMs: 0 };
        }
        if (params?.switchInProgress) {
            return { recover: false, reason: 'switch_in_progress', ageMs: 0 };
        }
        if (params?.logoutSuppressed) {
            return { recover: false, reason: 'logout_suppressed', ageMs: 0 };
        }
        if (!(uploadStartedAt > 0)) {
            return { recover: false, reason: 'missing_started_at', ageMs: 0 };
        }

        const ageMs = Math.max(0, now - uploadStartedAt);
        if (ageMs < minAgeMs) {
            return { recover: false, reason: 'too_young', ageMs, waitMs: minAgeMs - ageMs };
        }
        return { recover: true, reason: 'stalled_upload', ageMs, inFlightCount };
    }

    function getSyncStatusForKey(params) {
        const key = String(params?.key || '');
        if (!key) return 'synced';

        const queue = Array.isArray(params?.queue) ? params.queue : [];
        const inFlightQueue = Array.isArray(params?.inFlightQueue) ? params.inFlightQueue : [];
        const hasKey = (items) => items.some((item) => item && item.k === key);

        return (hasKey(queue) || hasKey(inFlightQueue)) ? 'pending' : 'synced';
    }

    function enqueueClientSave(params) {
        const queue = params?.queue;
        if (!Array.isArray(queue) || !params?.item) {
            return { queueLength: Array.isArray(queue) ? queue.length : 0, shouldImmediate: false };
        }

        queue.push(params.item);

        // 🚀 PERF: collapse duplicate (client_id,k) rows immediately so bursts
        // (e.g. cascade DCS history) do not inflate queue depth / pending-change churn.
        const pq = global.HEYS && global.HEYS.pendingQueuePure;
        const psk = params.pendingQueueStorageKey;
        if (psk && pq && typeof pq.compactPendingQueue === 'function') {
            pq.compactPendingQueue(queue, psk, { mutate: true });
        }

        const _pushTrace = typeof global.HEYS?.debug?.getSyncTraceBuffer === 'function'
            ? global.HEYS.debug._pushSyncTrace || null : null;
        const _key = params.item?.k || params.normalizedKey || '';
        const _syncTraceVerbose = !!(
            global.HEYS?.debug?.syncTrace === true ||
            (typeof global.localStorage !== 'undefined' && global.localStorage?.getItem('heys_debug_sync_trace') === 'true')
        );
        if (_syncTraceVerbose && _key.includes('dayv2_')) {
            const _v = params.item?.v;
            const _mCnt = Array.isArray(_v?.meals) ? _v.meals.length : '?';
            const _iCnt = Array.isArray(_v?.meals) ? _v.meals.reduce((s, m) => s + (m.items?.length || 0), 0) : '?';
            const _msg = { key: _key, qLen: queue.length, meals: _mCnt, items: _iCnt, updatedAt: _v?.updatedAt, online: !!params.isOnline, waitSync: !!params.waitingForSync };
            (global.console || console).info('[HEYS.syncTrace] ENQUEUE_dayv2', _msg);
        }

        if (typeof params.persistQueue === 'function') params.persistQueue(queue);
        if (typeof params.notifyPendingChange === 'function') params.notifyPendingChange();
        if (typeof params.scheduleClientPush === 'function') {
            params.scheduleClientPush({ __fromEnqueue: true });
        }

        const shouldImmediate =
            isCriticalSyncKey(params.normalizedKey) &&
            !!params.isOnline &&
            !params.waitingForSync &&
            !params.uploadInProgress;

        if (shouldImmediate && typeof params.doImmediateClientUpload === 'function') {
            try {
                const maybePromise = params.doImmediateClientUpload();
                if (maybePromise && typeof maybePromise.catch === 'function') {
                    maybePromise.catch((e) => {
                        if (typeof params.onImmediateUploadError === 'function') {
                            params.onImmediateUploadError(e);
                        }
                    });
                }
            } catch (e) {
                if (typeof params.onImmediateUploadError === 'function') {
                    params.onImmediateUploadError(e);
                }
            }
        }

        return { queueLength: queue.length, shouldImmediate };
    }

    async function flushPendingQueueCore(params) {
        const timeoutMs = Number(params?.timeoutMs || 5000);
        const getSnapshot = params?.getSnapshot;
        if (typeof getSnapshot !== 'function') return false;

        const snapshotBefore = getSnapshot();
        const totalBefore = snapshotBefore.queueLen + snapshotBefore.inFlight;
        if (typeof params?.onLog === 'function') {
            params.onLog('check', { ...snapshotBefore, totalBefore });
        }

        if (snapshotBefore.queueLen === 0 && !snapshotBefore.uploadInProgress) {
            if (typeof params?.onLog === 'function') {
                params.onLog('noop', { after: 0, elapsedMs: 0 });
            }
            return true;
        }

        if (snapshotBefore.queueLen > 0 && typeof params?.doImmediateClientUpload === 'function') {
            try {
                await params.doImmediateClientUpload();
                if (typeof params?.onLog === 'function') params.onLog('immediate-upload-done', null);
            } catch (e) {
                if (typeof params?.onLog === 'function') params.onLog('immediate-upload-failed', { error: String(e?.message || e) });
            }
        }

        const snapshotAfterImmediate = getSnapshot();
        if (snapshotAfterImmediate.queueLen === 0 && !snapshotAfterImmediate.uploadInProgress) {
            if (typeof params?.onLog === 'function') {
                params.onLog('done', { after: 0, elapsedMs: 0 });
            }
            return true;
        }

        const addQueueDrainedListener = params?.addQueueDrainedListener;
        const removeQueueDrainedListener = params?.removeQueueDrainedListener;
        const getPendingCount = params?.getPendingCount;
        const setTimer = params?.setTimer || ((fn, ms) => setTimeout(fn, ms));
        const clearTimer = params?.clearTimer || ((id) => clearTimeout(id));
        const now = params?.now || (() => Date.now());

        return new Promise((resolve) => {
            const start = now();
            let timeoutId = null;

            const cleanup = () => {
                if (timeoutId) clearTimer(timeoutId);
                if (typeof removeQueueDrainedListener === 'function') {
                    removeQueueDrainedListener(handler);
                }
            };

            const handler = () => {
                const snapshot = getSnapshot();
                if (snapshot.uploadInProgress) {
                    if (typeof params?.onLog === 'function') params.onLog('queue-drained-but-uploading', snapshot);
                    return;
                }
                cleanup();
                if (typeof params?.onLog === 'function') {
                    params.onLog('done', { after: 0, elapsedMs: now() - start });
                }
                resolve(true);
            };

            timeoutId = setTimer(() => {
                cleanup();
                const stillPending =
                    typeof getPendingCount === 'function'
                        ? getPendingCount()
                        : getSnapshot().queueLen + getSnapshot().inFlight;
                if (typeof params?.onLog === 'function') {
                    params.onLog('timeout', { stillPending, elapsedMs: now() - start });
                }
                resolve(false);
            }, timeoutMs);

            if (typeof addQueueDrainedListener === 'function') {
                addQueueDrainedListener(handler);
            }
        });
    }

    HEYS.syncQueueRuntimePure = {
        isCriticalSyncKey,
        shouldScheduleRetryAfterRpcError,
        restorePersistentQueueState,
        requeueInFlightBatch,
        getSyncStatusForKey,
        shouldApplyByRevision,
        areDayv2MergeValuesEquivalent,
        getStalledUploadRecoveryDecision,
        enqueueClientSave,
        flushPendingQueueCore,
    };
})(typeof window !== 'undefined' ? window : globalThis);
