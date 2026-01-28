// heys_day_global_exports_v1.js — DayTab global exports (HEYS.Day)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function useDayGlobalExportsEffect(deps) {
        const { React, flush, blockCloudUpdatesUntilRef, lastLoadedUpdatedAtRef, dayRef } = deps || {};

        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.requestFlush = flush;
            HEYS.Day.isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
            HEYS.Day.getBlockUntil = () => blockCloudUpdatesUntilRef.current;
            HEYS.Day.setBlockCloudUpdates = (until) => { blockCloudUpdatesUntilRef.current = until; };
            HEYS.Day.setLastLoadedUpdatedAt = (ts) => { lastLoadedUpdatedAtRef.current = ts; };
            HEYS.Day.getDay = () => dayRef?.current;

            return () => {
                if (HEYS.Day && HEYS.Day.requestFlush === flush) {
                    delete HEYS.Day.requestFlush;
                    delete HEYS.Day.isBlockingCloudUpdates;
                    delete HEYS.Day.getBlockUntil;
                    delete HEYS.Day.setBlockCloudUpdates;
                    delete HEYS.Day.setLastLoadedUpdatedAt;
                    delete HEYS.Day.getDay;
                }
            };
        }, [flush, dayRef]);
    }

    HEYS.dayGlobalExports = {
        useDayGlobalExportsEffect
    };
})(window);
