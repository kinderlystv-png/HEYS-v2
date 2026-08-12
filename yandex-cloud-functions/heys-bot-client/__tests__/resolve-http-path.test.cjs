const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const MODULE_PATH = require.resolve('../index.js');

function load() {
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH).__test.resolveHttpPath;
}

describe('resolveHttpPath', () => {
  it('prefers event.path', () => {
    const resolveHttpPath = load();
    assert.equal(resolveHttpPath({ path: '/bot/send' }), '/bot/send');
  });

  it('falls back to x-serverless-gateway-path when path empty', () => {
    const resolveHttpPath = load();
    assert.equal(
      resolveHttpPath({
        path: '',
        headers: { 'x-serverless-gateway-path': '/bot/send' },
      }),
      '/bot/send',
    );
  });

  it('does not treat empty path as start-bot webhook by itself', () => {
    const resolveHttpPath = load();
    assert.equal(resolveHttpPath({ httpMethod: 'POST' }), '');
  });
});
