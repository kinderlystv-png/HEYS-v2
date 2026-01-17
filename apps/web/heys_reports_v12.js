// heys_reports_v12.js — proxy to ReportsTabImpl

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  if (HEYS.ReportsTabImpl && typeof HEYS.ReportsTabImpl.createReportsTab === 'function') {
    HEYS.ReportsTab = HEYS.ReportsTabImpl.createReportsTab();
    return;
  }
})(window);
