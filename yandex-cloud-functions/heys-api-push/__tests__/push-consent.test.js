const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  LIVE_PUSH_CONSENT_SQL,
  clientHasLivePushConsent,
  pushConsentMissingResponse,
} = require('../push-consent');

describe('push-consent predicate', () => {
  it('exports the exact live-consent SQL from the prompt', () => {
    assert.match(LIVE_PUSH_CONSENT_SQL, /consent_type = 'push_notifications'/);
    assert.match(LIVE_PUSH_CONSENT_SQL, /granted = true/);
    assert.match(LIVE_PUSH_CONSENT_SQL, /revoked_at IS NULL/);
  });

  it('returns 403 push_consent_missing', () => {
    assert.deepEqual(pushConsentMissingResponse(), {
      statusCode: 403,
      body: { error: 'push_consent_missing' },
    });
  });

  it('treats missing client id as no consent', async () => {
    assert.equal(await clientHasLivePushConsent({ query: async () => ({ rows: [] }) }, null), false);
  });

  it('reads EXISTS result from the queryable', async () => {
    const queryable = {
      async query(sql, params) {
        assert.equal(params[0], 'client-1');
        assert.match(sql, /push_notifications/);
        return { rows: [{ ok: true }] };
      },
    };
    assert.equal(await clientHasLivePushConsent(queryable, 'client-1'), true);
  });

  it('treats false EXISTS as missing consent', async () => {
    const queryable = {
      async query() {
        return { rows: [{ ok: false }] };
      },
    };
    assert.equal(await clientHasLivePushConsent(queryable, 'client-1'), false);
  });
});
