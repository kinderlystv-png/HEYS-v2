import { afterEach, describe, expect, it, vi } from 'vitest';

function createLogoutSyncRuntime() {
    let logoutSuppressionUntil = 0;
    let clientUpsertQueue = [{ k: 'heys_cascade_dcs_v9' }];
    let clientUpsertInFlightQueue = [{ k: 'heys_meal_gaps_history' }];
    let upsertQueue = [{ k: 'heys_theme' }];
    let upsertInFlightQueue = [{ k: 'heys_profile' }];
    let clientUpsertTimer = 101;
    let upsertTimer = 202;
    let uploadInProgress = true;
    let uploadInFlightCount = 2;
    let userUploadInProgress = true;
    let userUploadInFlightCount = 1;
    let retryAttempt = 4;
    let syncProgressTotal = 9;
    let syncProgressDone = 7;

    const clearTimeoutSpy = vi.fn();
    const notifyPendingChange = vi.fn();
    const notifySyncCompletedIfDrained = vi.fn();
    const persistClientQueueDurabilityState = vi.fn();
    const persistUserQueueDurabilityState = vi.fn();
    const clearDeferredUserPushNoClientTimer = vi.fn();
    const resetBufferedUploadLog = vi.fn();

    const isLogoutSuppressionActive = () => Date.now() < logoutSuppressionUntil;
    const armLogoutSuppression = (ms = 5000) => {
        logoutSuppressionUntil = Date.now() + ms;
    };

    const dropAllPendingSyncState = () => {
        if (clientUpsertTimer) {
            clearTimeoutSpy(clientUpsertTimer);
            clientUpsertTimer = null;
        }
        if (upsertTimer) {
            clearTimeoutSpy(upsertTimer);
            upsertTimer = null;
        }
        clearDeferredUserPushNoClientTimer();
        resetBufferedUploadLog();

        clientUpsertQueue = [];
        clientUpsertInFlightQueue = [];
        upsertQueue = [];
        upsertInFlightQueue = [];

        uploadInProgress = false;
        uploadInFlightCount = 0;
        userUploadInProgress = false;
        userUploadInFlightCount = 0;

        retryAttempt = 0;
        syncProgressTotal = 0;
        syncProgressDone = 0;

        persistClientQueueDurabilityState();
        persistUserQueueDurabilityState();
        notifyPendingChange();
        notifySyncCompletedIfDrained();
    };

    const shouldMirrorWrite = () => !isLogoutSuppressionActive();

    return {
        armLogoutSuppression,
        isLogoutSuppressionActive,
        dropAllPendingSyncState,
        shouldMirrorWrite,
        getState: () => ({
            clientUpsertQueue,
            clientUpsertInFlightQueue,
            upsertQueue,
            upsertInFlightQueue,
            clientUpsertTimer,
            upsertTimer,
            uploadInProgress,
            uploadInFlightCount,
            userUploadInProgress,
            userUploadInFlightCount,
            retryAttempt,
            syncProgressTotal,
            syncProgressDone,
        }),
        spies: {
            clearTimeoutSpy,
            notifyPendingChange,
            notifySyncCompletedIfDrained,
            persistClientQueueDurabilityState,
            persistUserQueueDurabilityState,
            clearDeferredUserPushNoClientTimer,
            resetBufferedUploadLog,
        }
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('logout sync guards', () => {
    it('clears pending queues, timers and retry state on sign-out reset', () => {
        const runtime = createLogoutSyncRuntime();

        runtime.dropAllPendingSyncState();
        const state = runtime.getState();

        expect(state.clientUpsertQueue).toHaveLength(0);
        expect(state.clientUpsertInFlightQueue).toHaveLength(0);
        expect(state.upsertQueue).toHaveLength(0);
        expect(state.upsertInFlightQueue).toHaveLength(0);
        expect(state.clientUpsertTimer).toBeNull();
        expect(state.upsertTimer).toBeNull();
        expect(state.uploadInProgress).toBe(false);
        expect(state.uploadInFlightCount).toBe(0);
        expect(state.userUploadInProgress).toBe(false);
        expect(state.userUploadInFlightCount).toBe(0);
        expect(state.retryAttempt).toBe(0);
        expect(state.syncProgressTotal).toBe(0);
        expect(state.syncProgressDone).toBe(0);

        expect(runtime.spies.clearTimeoutSpy).toHaveBeenCalledTimes(2);
        expect(runtime.spies.clearDeferredUserPushNoClientTimer).toHaveBeenCalledTimes(1);
        expect(runtime.spies.resetBufferedUploadLog).toHaveBeenCalledTimes(1);
        expect(runtime.spies.persistClientQueueDurabilityState).toHaveBeenCalledTimes(1);
        expect(runtime.spies.persistUserQueueDurabilityState).toHaveBeenCalledTimes(1);
        expect(runtime.spies.notifyPendingChange).toHaveBeenCalledTimes(1);
        expect(runtime.spies.notifySyncCompletedIfDrained).toHaveBeenCalledTimes(1);
    });

    it('blocks new mirrored writes during logout suppression window', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-23T12:00:00.000Z'));

        const runtime = createLogoutSyncRuntime();
        expect(runtime.shouldMirrorWrite()).toBe(true);

        runtime.armLogoutSuppression(5000);
        expect(runtime.isLogoutSuppressionActive()).toBe(true);
        expect(runtime.shouldMirrorWrite()).toBe(false);

        vi.advanceTimersByTime(5001);
        expect(runtime.isLogoutSuppressionActive()).toBe(false);
        expect(runtime.shouldMirrorWrite()).toBe(true);
    });
});