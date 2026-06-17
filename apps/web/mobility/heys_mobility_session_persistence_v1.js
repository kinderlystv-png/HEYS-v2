// heys_mobility_session_persistence_v1.js — thin wrapper over kernel activeSession.
//
// Active guided mobility sessions use the same local-only snapshot engine as
// fingers. The domain owns only the key suffix and stale threshold; debounce,
// client-scoped keys, boot detection and unload flushing stay in the kernel.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.persistence && Mobility.persistence.__registered) return;

  const TK = HEYS.TrainingKernel;
  if (!TK || !TK.activeSession || typeof TK.activeSession.create !== 'function') {
    console.warn('[Mobility.persistence] HEYS.TrainingKernel.activeSession is unavailable');
    return;
  }

  const store = TK.activeSession.create({
    keySuffix: 'routine_active_session',
    staleMs: 24 * 60 * 60 * 1000,
    debounceMs: 250
  });
  store.__registered = true;

  Mobility.persistence = store;
})(typeof window !== 'undefined' ? window : globalThis);
