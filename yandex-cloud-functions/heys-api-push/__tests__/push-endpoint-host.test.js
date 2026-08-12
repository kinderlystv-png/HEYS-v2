// node --test __tests__/push-endpoint-host.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validatePushSubscribeEndpoint,
  parsePushEndpointHost,
} = require('../push-endpoint-host');

describe('validatePushSubscribeEndpoint', () => {
  it('accepts Google FCM endpoints', () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
    assert.deepEqual(validatePushSubscribeEndpoint(endpoint), {
      ok: true,
      host: 'fcm.googleapis.com',
    });
  });

  it('accepts Apple Web Push endpoints', () => {
    const endpoint = 'https://web.push.apple.com/abc123';
    assert.deepEqual(validatePushSubscribeEndpoint(endpoint), {
      ok: true,
      host: 'web.push.apple.com',
    });
  });

  it('rejects Mozilla push with host reason', () => {
    const endpoint = 'https://updates.push.services.mozilla.com/wpush/v2/abc';
    assert.deepEqual(validatePushSubscribeEndpoint(endpoint), {
      ok: false,
      reason: 'push_endpoint_host_not_allowed',
      host: 'updates.push.services.mozilla.com',
    });
  });

  it('rejects non-https endpoints', () => {
    assert.equal(
      validatePushSubscribeEndpoint('http://fcm.googleapis.com/fcm/send/x').reason,
      'push_endpoint_not_https',
    );
  });

  it('rejects malformed URLs', () => {
    assert.equal(parsePushEndpointHost('not-a-url').reason, 'push_endpoint_invalid_url');
  });
});
