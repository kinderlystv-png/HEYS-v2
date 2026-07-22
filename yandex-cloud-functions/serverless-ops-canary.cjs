#!/usr/bin/env node
'use strict';

const DEFAULT_BASE_URL = 'https://api.heyslab.ru';

function parseRetryAfter(value, nowMs = Date.now()) {
  if (value == null || value === '') return null;
  if (/^\s*\d+(?:\.\d+)?\s*$/.test(String(value))) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
  }
  const dateMs = Date.parse(String(value));
  if (Number.isFinite(dateMs) && dateMs > nowMs) return Math.max(1, Math.ceil((dateMs - nowMs) / 1000));
  return null;
}

async function fetchProbe(name, url, options = {}, fetchImpl = fetch) {
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
    const overload = response.status === 429 || response.status === 503;
    const bodySummary = Array.isArray(body)
      ? { type: 'array', count: body.length }
      : (body && typeof body === 'object'
        ? { type: 'object', keys: Object.keys(body).slice(0, 12) }
        : { type: typeof body, preview: String(body || '').slice(0, 120) });
    return {
      name,
      ok: response.ok && !overload,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      overload,
      retryAfterSeconds: retryAfter,
      retryAfterValid: !overload || retryAfter !== null,
      bodySummary,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      overload: false,
      retryAfterSeconds: null,
      retryAfterValid: true,
      error: error.message,
    };
  }
}

async function runCanary({ baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch } = {}) {
  const normalizedBase = String(baseUrl).replace(/\/$/, '');
  const probes = await Promise.all([
    fetchProbe(
      'rpc',
      `${normalizedBase}/rpc?fn=get_shared_products`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://app.heyslab.ru' },
        body: JSON.stringify({ p_limit: 1 }),
      },
      fetchImpl,
    ),
    fetchProbe(
      'rest',
      `${normalizedBase}/rest/shared_products?limit=1`,
      { headers: { Origin: 'https://app.heyslab.ru' } },
      fetchImpl,
    ),
  ]);

  return {
    ok: probes.every((probe) => probe.ok && probe.retryAfterValid),
    checkedAt: new Date().toISOString(),
    baseUrl: normalizedBase,
    probes,
  };
}

function valueAfter(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

async function main(argv = process.argv.slice(2)) {
  const report = await runCanary({ baseUrl: valueAfter(argv, '--base-url', DEFAULT_BASE_URL) });
  console.log(JSON.stringify(report, null, 2));
  if (argv.includes('--strict') && !report.ok) process.exitCode = 1;
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Operational canary failed: ${error.message}`);
    process.exitCode = 2;
  });
}

module.exports = {
  DEFAULT_BASE_URL,
  fetchProbe,
  parseRetryAfter,
  runCanary,
};
