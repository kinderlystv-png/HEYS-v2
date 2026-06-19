// heys_write_context_health_v1.js
// Shared event/detail helpers for write-context recovery UX.
(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});

  const KIND_TRANSIENT_SYNC = 'transient_sync';
  const KIND_BLOCKING_ERROR = 'blocking_error';
  const KIND_AUTH_ERROR = 'auth_error';
  const KIND_BEST_EFFORT_ERROR = 'best_effort_error';

  function createUnavailableEventDetail(options) {
    const opts = options || {};
    return {
      error: 'write_context_unavailable',
      reason: opts.reason,
      retryIn: Number.isFinite(opts.retryIn) ? opts.retryIn : 0,
      persistent: false,
      kind: KIND_TRANSIENT_SYNC,
      severity: 'background',
      transient: true,
      background: true,
    };
  }

  function isTransientUnavailable(detail) {
    return !!detail
      && detail.error === 'write_context_unavailable'
      && (detail.kind === KIND_TRANSIENT_SYNC || detail.transient === true);
  }

  function markRetryPhase(phase, options) {
    const opts = options || {};
    const clientId = opts.clientId || null;
    const reason = opts.reason || 'retry-write-context';
    const counterKey = phase === 'scheduled'
      ? '_writeContextBackgroundRetryScheduled'
      : (phase === 'attempt' ? '_writeContextBackgroundRetryAttempts' : null);

    if (counterKey) {
      HEYS[counterKey] = (HEYS[counterKey] || 0) + 1;
    }

    HEYS._lastWriteContextBackgroundRetry = {
      at: Date.now(),
      phase,
      reason,
      clientId,
    };

    if (typeof opts.addSyncLogEntry === 'function') {
      opts.addSyncLogEntry('write_context_retry_' + phase, {
        reason,
        client: clientId ? String(clientId).slice(0, 8) : null,
      });
    }

    if (phase === 'attempt' && global.console && typeof global.console.info === 'function') {
      global.console.info('[HEYS.sync] write-context background retry', {
        reason,
        client: clientId ? String(clientId).slice(0, 8) : null,
      });
    }
  }

  HEYS.WriteContextHealth = {
    KIND_TRANSIENT_SYNC,
    KIND_BLOCKING_ERROR,
    KIND_AUTH_ERROR,
    KIND_BEST_EFFORT_ERROR,
    createUnavailableEventDetail,
    isTransientUnavailable,
    markRetryPhase,
  };
})(typeof window !== 'undefined' ? window : globalThis);
