/**
 * Allowed Web Push delivery hosts for POST /push/subscribe.
 * Legal basis: docs/release/ocenka-pravovogo-rezhima.md — FCM + Apple only.
 */
const ALLOWED_PUSH_ENDPOINT_HOSTS = new Set([
  'fcm.googleapis.com',
  'web.push.apple.com',
]);

function parsePushEndpointHost(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.trim()) {
    return { ok: false, reason: 'push_endpoint_invalid_url' };
  }
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') {
      return { ok: false, reason: 'push_endpoint_not_https' };
    }
    return { ok: true, host: url.hostname.toLowerCase() };
  } catch {
    return { ok: false, reason: 'push_endpoint_invalid_url' };
  }
}

function validatePushSubscribeEndpoint(endpoint) {
  const parsed = parsePushEndpointHost(endpoint);
  if (!parsed.ok) return parsed;
  if (!ALLOWED_PUSH_ENDPOINT_HOSTS.has(parsed.host)) {
    return { ok: false, reason: 'push_endpoint_host_not_allowed', host: parsed.host };
  }
  return { ok: true, host: parsed.host };
}

module.exports = {
  ALLOWED_PUSH_ENDPOINT_HOSTS,
  parsePushEndpointHost,
  validatePushSubscribeEndpoint,
};
