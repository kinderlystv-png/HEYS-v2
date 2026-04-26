// heys_planning_gantt_migration_v1.js — idempotent backfill of progress/isMilestone for tasks
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const SCHEMA_VERSION_KEY = 'heys_planning_gantt_schema_v_v1';
    const SCHEMA_VERSION = '2';

    function lsGet(key, fallback) {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
                return HEYS.utils.lsGet(key, fallback);
            }
        } catch (e) { /* noop */ }
        return fallback;
    }

    function lsSet(key, value) {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
                HEYS.utils.lsSet(key, value);
            }
        } catch (e) { /* noop */ }
    }

    function clampProgress(value, status) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.max(0, Math.min(100, Math.round(value)));
        }
        return status === 'done' ? 100 : 0;
    }

    function migrateAndStamp(opts) {
        const respectFlag = !(opts && opts.force === true);
        if (respectFlag && lsGet(SCHEMA_VERSION_KEY, null) === SCHEMA_VERSION) {
            return { ok: true, alreadyDone: true };
        }

        const Store = HEYS.Planning && HEYS.Planning.Store;
        if (!Store || typeof Store.getTasks !== 'function' || typeof Store.saveTasks !== 'function') {
            return { ok: false, reason: 'store_unavailable' };
        }

        const tasks = Store.getTasks();
        let changed = 0;
        const migrated = tasks.map((t) => {
            const hasProgress = typeof t.progress === 'number' && Number.isFinite(t.progress);
            const hasMilestone = t.isMilestone === true || t.isMilestone === false;
            if (hasProgress && hasMilestone) return t;
            changed += 1;
            return {
                ...t,
                progress: hasProgress ? clampProgress(t.progress, t.status) : clampProgress(undefined, t.status),
                isMilestone: t.isMilestone === true,
            };
        });

        if (changed > 0) Store.saveTasks(migrated);
        lsSet(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
        return { ok: true, migrated: changed, total: tasks.length };
    }

    let pendingTimer = 0;
    function scheduleMigration(opts) {
        if (pendingTimer) {
            window.clearTimeout(pendingTimer);
            pendingTimer = 0;
        }
        pendingTimer = window.setTimeout(() => {
            pendingTimer = 0;
            try { migrateAndStamp(opts); } catch (e) { console.warn('[gantt-migration]', e); }
        }, 1000);
    }

    function attachCloudSyncWatcher() {
        if (typeof window === 'undefined' || !window.addEventListener) return;
        // Cloud may overwrite tasks with un-migrated rows. Re-run migration ignoring
        // the schema flag — the migration itself is idempotent (no-op when fields are set).
        window.addEventListener('heys:planning-updated', () => scheduleMigration({ force: true }));
    }

    HEYS.PlanningGanttMigration = {
        run: migrateAndStamp,
        schedule: scheduleMigration,
        SCHEMA_VERSION,
        SCHEMA_VERSION_KEY,
    };

    attachCloudSyncWatcher();
})();
