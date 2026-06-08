// heys_day_global_exports_v1.js — DayTab global exports (HEYS.Day)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    // 🛡️ Pending-mutation registry (incident 2026-06-08 curator add-item dropped):
    // блок-window истекал по таймеру (3с) или сбрасывался SKEW-защитой раньше чем
    // flush успевал записать LS+cloud (long-task 22с на курaторском Android Chrome).
    // Этот pending-флаг живёт пока flush явно не подтвердит запись → reconciler /
    // hot-sync / live-refresh могут уважать «есть несохранённая правка». Auto-expire
    // 30с — failure to flush никогда не должна навсегда заблокировать sync.
    const PENDING_MAX_AGE_MS = 30000;
    const _pendingDayMutations = new Map(); // date → { ts }

    function markPendingDayMutation(date) {
        if (!date) return;
        _pendingDayMutations.set(String(date), { ts: Date.now() });
    }

    function hasPendingDayMutation(date) {
        if (!date) return false;
        const entry = _pendingDayMutations.get(String(date));
        if (!entry) return false;
        if (Date.now() - entry.ts > PENDING_MAX_AGE_MS) {
            _pendingDayMutations.delete(String(date));
            return false;
        }
        return true;
    }

    function clearPendingDayMutation(date) {
        if (!date) return;
        _pendingDayMutations.delete(String(date));
    }

    function listPendingDayMutations() {
        const now = Date.now();
        const out = [];
        for (const [date, entry] of _pendingDayMutations) {
            const ageMs = now - entry.ts;
            if (ageMs > PENDING_MAX_AGE_MS) {
                _pendingDayMutations.delete(date);
                continue;
            }
            out.push({ date, ageMs });
        }
        return out;
    }

    // 🛡️ Block-window cap (incident 2026-06-08): handlers, передающие
    // `payload.updatedAt + 3000` от PIN-устройства с future-skewed clock, могли
    // ставить blockUntil на 10 минут в будущее. Если SKEW-clear не успевал
    // обнулить его до flush — flush попадал в bail-guard.
    // Любой легитимный edit-block ≤ 5с (handleAdd + 3000). Cap = 15с (запас на
    // markUndoWindow). Всё выше → cap к Date.now() + cap.
    const MAX_LEGIT_BLOCK_MS = 15000;
    function setBlockCloudUpdatesCapped(blockCloudUpdatesUntilRef, until) {
        const safeMax = Date.now() + MAX_LEGIT_BLOCK_MS;
        blockCloudUpdatesUntilRef.current = (typeof until === 'number' && until > safeMax) ? safeMax : until;
    }

    function useDayGlobalExportsEffect(deps) {
        const { React, flush, blockCloudUpdatesUntilRef, lastLoadedUpdatedAtRef, dayRef } = deps || {};

        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.requestFlush = flush;
            HEYS.Day.isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
            HEYS.Day.getBlockUntil = () => blockCloudUpdatesUntilRef.current;
            // 🛡️ Phase 3 (2026-06-08): setter одновременно cap'ает blockUntil И marks
            // pending для текущей открытой даты ЕСЛИ это arm (until > now+threshold).
            // Покрывает все user-edit handlers (handleAdd, removeItem, copyMeal,
            // edit-grams, time/mood pickers, trainings, addMealDirect, meal_rec_card)
            // без необходимости вручную помечать pending в каждом call-site.
            // Threshold +100ms отсеивает explicit clears (setBlockCloudUpdates(Date.now())
            // в modal-cancel paths) — они не должны mark pending.
            HEYS.Day.setBlockCloudUpdates = (until) => {
                setBlockCloudUpdatesCapped(blockCloudUpdatesUntilRef, until);
                if (typeof until === 'number' && until > Date.now() + 100) {
                    const _date = dayRef && dayRef.current && dayRef.current.date;
                    if (_date) markPendingDayMutation(_date);
                }
            };
            HEYS.Day.setLastLoadedUpdatedAt = (ts) => { lastLoadedUpdatedAtRef.current = ts; };
            HEYS.Day.getDay = () => dayRef?.current;

            // Pending mutation API
            HEYS.Day.markPendingMutation = markPendingDayMutation;
            HEYS.Day.hasPendingMutation = hasPendingDayMutation;
            HEYS.Day.clearPendingMutation = clearPendingDayMutation;
            HEYS.Day.listPendingMutations = listPendingDayMutations;

            return () => {
                if (HEYS.Day && HEYS.Day.requestFlush === flush) {
                    delete HEYS.Day.requestFlush;
                    delete HEYS.Day.isBlockingCloudUpdates;
                    delete HEYS.Day.getBlockUntil;
                    delete HEYS.Day.setBlockCloudUpdates;
                    delete HEYS.Day.setLastLoadedUpdatedAt;
                    delete HEYS.Day.getDay;
                    delete HEYS.Day.markPendingMutation;
                    delete HEYS.Day.hasPendingMutation;
                    delete HEYS.Day.clearPendingMutation;
                    delete HEYS.Day.listPendingMutations;
                }
            };
        }, [flush, dayRef]);
    }

    HEYS.dayGlobalExports = {
        useDayGlobalExportsEffect
    };
})(window);
