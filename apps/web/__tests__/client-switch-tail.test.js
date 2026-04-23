import { describe, expect, it, vi } from 'vitest';

/**
 * Реплика scheduling-логики из bootstrapClientSync после client switch.
 * Идея: non-critical tail (shared products / deleted sync) не должен держать
 * resolve критического пути, иначе gate остаётся на "Загружаю данные...".
 */
async function finalizeBootstrapSyncReplica({ deferNonCriticalTail, runNonCriticalPostSyncTail, onSyncCompleted }) {
    if (deferNonCriticalTail) {
        setTimeout(() => {
            runNonCriticalPostSyncTail().catch(() => { });
        }, 0);
    } else {
        await runNonCriticalPostSyncTail();
    }

    onSyncCompleted();
    return true;
}

describe('client switch non-critical tail scheduling', () => {
    it('resolves critical sync path before deferred tail completes', async () => {
        vi.useFakeTimers();

        const steps = [];
        let releaseTail;
        const tailGate = new Promise((resolve) => {
            releaseTail = resolve;
        });

        const runNonCriticalPostSyncTail = vi.fn(async () => {
            steps.push('tail:start');
            await tailGate;
            steps.push('tail:done');
        });

        const resultPromise = finalizeBootstrapSyncReplica({
            deferNonCriticalTail: true,
            runNonCriticalPostSyncTail,
            onSyncCompleted: () => steps.push('sync:completed')
        });

        await expect(resultPromise).resolves.toBe(true);
        expect(steps).toEqual(['sync:completed']);
        expect(runNonCriticalPostSyncTail).not.toHaveBeenCalled();

        await vi.runOnlyPendingTimersAsync();
        expect(steps).toEqual(['sync:completed', 'tail:start']);

        releaseTail();
        await Promise.resolve();
        expect(steps).toEqual(['sync:completed', 'tail:start', 'tail:done']);

        vi.useRealTimers();
    });

    it('waits for tail when deferral is disabled', async () => {
        vi.useFakeTimers();

        const steps = [];
        let releaseTail;
        const tailGate = new Promise((resolve) => {
            releaseTail = resolve;
        });

        const runNonCriticalPostSyncTail = vi.fn(async () => {
            steps.push('tail:start');
            await tailGate;
            steps.push('tail:done');
        });

        let resolved = false;
        const resultPromise = finalizeBootstrapSyncReplica({
            deferNonCriticalTail: false,
            runNonCriticalPostSyncTail,
            onSyncCompleted: () => steps.push('sync:completed')
        }).then((result) => {
            resolved = true;
            return result;
        });

        await Promise.resolve();
        expect(steps).toEqual(['tail:start']);
        expect(resolved).toBe(false);

        releaseTail();
        await expect(resultPromise).resolves.toBe(true);
        expect(steps).toEqual(['tail:start', 'tail:done', 'sync:completed']);

        vi.useRealTimers();
    });
});