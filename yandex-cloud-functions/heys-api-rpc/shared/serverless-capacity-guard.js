'use strict';

const DEFAULT_ADMISSION_LIMIT = 4;
const DEFAULT_RETRY_AFTER_SECONDS = 2;

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createServerlessCapacityGuard(options = {}) {
  const functionName = String(options.functionName || 'heys-api');
  const admissionLimit = readPositiveInt(
    options.admissionLimit ?? process.env.HEYS_INSTANCE_ADMISSION_LIMIT,
    DEFAULT_ADMISSION_LIMIT,
  );
  const retryAfterSeconds = readPositiveInt(
    options.retryAfterSeconds ?? process.env.HEYS_OVERLOAD_RETRY_AFTER_SECONDS,
    DEFAULT_RETRY_AFTER_SECONDS,
  );
  let active = 0;

  function tryEnter() {
    if (active >= admissionLimit) {
      return {
        ok: false,
        response: {
          statusCode: 429,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Retry-After': String(retryAfterSeconds),
            'X-HEYS-Overload': 'instance-soft-limit',
          },
          body: JSON.stringify({
            error: 'server_busy',
            retry_after_seconds: retryAfterSeconds,
          }),
        },
      };
    }

    active += 1;
    let released = false;
    return {
      ok: true,
      release() {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
      },
    };
  }

  function withCorsHeaders(response, corsHeaders = {}) {
    if (!response || typeof response !== 'object') return response;
    return {
      ...response,
      headers: {
        ...(corsHeaders || {}),
        ...(response.headers || {}),
      },
    };
  }

  return {
    functionName,
    admissionLimit,
    retryAfterSeconds,
    tryEnter,
    withCorsHeaders,
    debugState: () => ({ active, admissionLimit, retryAfterSeconds }),
  };
}

module.exports = {
  DEFAULT_ADMISSION_LIMIT,
  DEFAULT_RETRY_AFTER_SECONDS,
  createServerlessCapacityGuard,
  readPositiveInt,
};
