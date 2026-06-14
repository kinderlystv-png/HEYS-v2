// node --test __tests__/mfa-totp.test.js

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-at-least-32-characters';
process.env.PG_PASSWORD = process.env.PG_PASSWORD || 'test-password';

const assert = require('node:assert/strict');
const test = require('node:test');
const { _test } = require('../index');

test('base32 encode/decode roundtrip keeps TOTP secret bytes', () => {
  const input = Buffer.from('hello-heys-mfa-secret');
  const encoded = _test.base32Encode(input);
  const decoded = _test.base32Decode(encoded);

  assert.equal(decoded.toString('utf8'), input.toString('utf8'));
});

test('TOTP accepts current and adjacent-window code only', () => {
  const secret = _test.createTotpSecret();
  const now = Date.UTC(2026, 5, 14, 12, 0, 0);
  const code = _test.generateTotpCode(secret, now);

  assert.equal(_test.verifyTotpCode(secret, code, now), true);
  assert.equal(_test.verifyTotpCode(secret, code, now + 30_000), true);
  assert.equal(_test.verifyTotpCode(secret, code, now + 90_000), false);
  assert.equal(_test.verifyTotpCode(secret, '000000', now), false);
});

test('MFA secret encryption roundtrips and uses random IV', () => {
  const secret = _test.createTotpSecret();
  const jwtSecret = process.env.JWT_SECRET;
  const first = _test.encryptMfaSecret(secret, jwtSecret);
  const second = _test.encryptMfaSecret(secret, jwtSecret);

  assert.notEqual(first, second);
  assert.equal(_test.decryptMfaSecret(first, jwtSecret), secret);
  assert.equal(_test.decryptMfaSecret(second, jwtSecret), secret);
});
