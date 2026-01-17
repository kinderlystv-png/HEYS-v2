// heys_app_v12.js — Main app entry, React root, tab navigation, Supabase integration

(function () {
  const HEYS = window.HEYS = window.HEYS || {};
  const startEntry = HEYS.AppEntry && HEYS.AppEntry.start;
  if (typeof startEntry === 'function') {
    startEntry();
    return;
  }
  window.__heysLog && window.__heysLog('[APP] AppEntry missing, start skipped');
})();
