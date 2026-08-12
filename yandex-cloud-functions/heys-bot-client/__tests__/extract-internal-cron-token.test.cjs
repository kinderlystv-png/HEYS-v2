const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const MODULE_PATH = require.resolve('../index.js');

function load() {
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH).__test.extractInternalCronToken;
}

describe('extractInternalCronToken', () => {
  it('reads lowercase header', () => {
    const extract = load();
    assert.equal(
      extract({ headers: { 'x-internal-cron-token': 'abc' } }, {}),
      'abc',
    );
  });

  it('reads OpenAPI params when headers empty', () => {
    const extract = load();
    assert.equal(
      extract({ headers: {}, params: { 'X-Internal-Cron-Token': 'from-params' } }, {}),
      'from-params',
    );
  });

  it('reads multiValueHeaders', () => {
    const extract = load();
    assert.equal(
      extract(
        { headers: {}, multiValueHeaders: { 'x-internal-cron-token': ['mv'] } },
        {},
      ),
      'mv',
    );
  });

  it('falls back to body.cron_token', () => {
    const extract = load();
    assert.equal(extract({ headers: {} }, { cron_token: 'body-token' }), 'body-token');
  });
});
