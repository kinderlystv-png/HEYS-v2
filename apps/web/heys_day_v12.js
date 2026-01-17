// heys_day_v12.js — DayTab component proxy

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.DayTab) return;
  const DayTabImpl = HEYS.DayTabImpl;
  if (DayTabImpl && typeof DayTabImpl.createDayTab === 'function') {
    HEYS.DayTab = DayTabImpl.createDayTab({ React: global.React, HEYS });
    return;
  }
  window.__heysLog && window.__heysLog('[DAY] DayTabImpl missing, DayTab not registered');
})(window);
