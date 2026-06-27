import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const planningStoreSource = fs.readFileSync(path.resolve(__dirname, '../heys_planning_store_v1.js'), 'utf8');
const storageSource = fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8');

const originalHEYS = window.HEYS;
const originalReact = window.React;

function installReactStub() {
    window.React = {
        useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
        useEffect: () => undefined,
        useCallback: (fn) => fn,
        useMemo: (fn) => fn(),
    };
}

function installHeys({ syncStatus = 'synced' } = {}) {
    const saveClientKey = vi.fn();
    window.HEYS = {
        currentClientId: 'client-1',
        utils: {
            lsGet: (key, fallback) => {
                const raw = window.localStorage.getItem(key);
                return raw == null ? fallback : JSON.parse(raw);
            },
            lsSet: (key, value) => {
                window.localStorage.setItem(key, JSON.stringify(value));
            },
        },
        cloud: {
            getClientId: () => 'client-1',
            getSyncStatus: vi.fn(() => syncStatus),
            saveClientKey,
        },
    };
    return { saveClientKey };
}

function loadPlanningStore() {
    // eslint-disable-next-line no-eval
    (0, eval)(planningStoreSource);
    return window.HEYS.Planning.Store;
}

describe('planning sync-aware persistence', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        window.localStorage.clear();
        window.localStorage.setItem('heys_client_current', 'client-1');
        installReactStub();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        window.localStorage.clear();
        window.HEYS = originalHEYS;
        window.React = originalReact;
    });

    it('explicitly enqueues completed chrono entries while keeping active timer local-only', () => {
        const { saveClientKey } = installHeys();
        const Store = loadPlanningStore();

        const activity = Store.addChronoActivity({ name: 'Reading', emoji: 'R' });
        saveClientKey.mockClear();

        const entry = Store.addChronoEntry({ activityId: activity.id, minutes: 25 });
        expect(entry).toBeTruthy();
        expect(saveClientKey).toHaveBeenCalledWith(
            'heys_planning_chrono_entries',
            expect.arrayContaining([expect.objectContaining({ id: entry.id, minutes: 25 })]),
        );

        saveClientKey.mockClear();
        const timer = Store.startChronoTimer({ activityId: activity.id, plannedMinutes: 20 });
        expect(timer).toBeTruthy();
        expect(saveClientKey).not.toHaveBeenCalled();

        const parity = Store.getPlanningSyncParitySnapshot();
        const timerRow = parity.keys.find((row) => row.key === 'heys_planning_chrono_timer');
        expect(timerRow.class).toBe('localOnly');
        expect(window.HEYS.Planning.Constants.STORAGE_CLASSES).toMatchObject({
            criticalClientKeys: expect.arrayContaining(['heys_planning_chrono_entries']),
            localOnlyKeys: expect.arrayContaining(['heys_planning_chrono_timer']),
            mergeableArrayKeys: expect.arrayContaining(['heys_planning_chrono_entries']),
        });
    });

    it('can enqueue a merge rescue when local-only planning records survive cloud merge', () => {
        const { saveClientKey } = installHeys({ syncStatus: 'synced' });
        const Store = loadPlanningStore();
        const merged = [{ id: 'local-entry', activityId: 'a1', minutes: 10, date: '2026-06-27' }];

        const didQueue = Store.enqueuePlanningMergeRescue('heys_planning_chrono_entries', merged, {
            reason: 'test-rescue',
        });

        expect(didQueue).toBe(true);
        expect(saveClientKey).toHaveBeenCalledWith('heys_planning_chrono_entries', merged);
    });

    it('keeps the storage hot-sync merge rescue wired before idempotent return', () => {
        const rescueIdx = storageSource.indexOf('enqueuePlanningMergeRescue(baseKey, mergedArr');
        const idempotentIdx = storageSource.indexOf('if (currentRaw === reserialized) return false; // idempotent no-op; rescue above handles local-only parity');

        expect(rescueIdx).toBeGreaterThan(0);
        expect(idempotentIdx).toBeGreaterThan(rescueIdx);
    });
});
