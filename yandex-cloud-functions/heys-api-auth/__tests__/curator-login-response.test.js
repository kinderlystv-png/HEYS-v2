// node --test __tests__/curator-login-response.test.js

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-at-least-32-characters';
process.env.PG_PASSWORD = process.env.PG_PASSWORD || 'test-password';

const assert = require('node:assert/strict');
const test = require('node:test');
const { _test } = require('../index');

const curator = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'curator@example.test',
  name: 'Curator',
};

test('cookie-only browser login never exposes curator JWT in response body', () => {
  const body = _test.buildCuratorLoginBody('secret.curator.jwt', curator, true);

  assert.equal(body.access_token, undefined);
  assert.equal(body.token_type, undefined);
  assert.deepEqual(body.user, {
    id: curator.id,
    email: curator.email,
    role: 'curator',
    user_metadata: { name: curator.name },
  });
});

test('native login keeps explicit token contract for SecureStore exchange', () => {
  const body = _test.buildCuratorLoginBody('secret.curator.jwt', curator, false);

  assert.equal(body.access_token, 'secret.curator.jwt');
  assert.equal(body.token_type, 'bearer');
  assert.equal(body.user.id, curator.id);
});

test('production browser origin cannot opt out of cookie-only response', () => {
  assert.equal(
    _test.shouldUseCookieOnlyCuratorResponse('https://app.heyslab.ru', false),
    true
  );
  assert.equal(
    _test.shouldUseCookieOnlyCuratorResponse('not-a-valid-origin', false),
    true
  );
});

test('native and localhost flows retain explicit compatibility contract', () => {
  assert.equal(_test.shouldUseCookieOnlyCuratorResponse(null, false), false);
  assert.equal(
    _test.shouldUseCookieOnlyCuratorResponse('http://localhost:3001', false),
    false
  );
  assert.equal(
    _test.shouldUseCookieOnlyCuratorResponse('http://localhost:3001', true),
    true
  );
});
