const test = require('node:test');
const assert = require('node:assert/strict');

const { extractBearerToken, extractCuratorJwt } = require('../shared/auth-helpers');

test('extractBearerToken prefers Authorization bearer over cookie session', () => {
  const token = extractBearerToken({
    headers: {
      Authorization: 'Bearer header-token-1234567890',
      cookie: 'heys_session_token=cookie-token-1234567890',
    },
  });

  assert.equal(token, 'header-token-1234567890');
});

test('extractBearerToken reads HttpOnly PIN session cookie when bearer is absent', () => {
  const token = extractBearerToken({
    headers: {
      cookie: 'other=1; heys_session_token=cookie-token-1234567890; theme=dark',
    },
  });

  assert.equal(token, 'cookie-token-1234567890');
});

test('extractBearerToken decodes URL-encoded cookie session token', () => {
  const token = extractBearerToken({
    headers: {
      Cookie: `heys_session_token=${encodeURIComponent('cookie.token/1234567890')}`,
    },
  });

  assert.equal(token, 'cookie.token/1234567890');
});

test('extractBearerToken rejects malformed cookie session values', () => {
  const token = extractBearerToken({
    headers: {
      cookie: 'heys_session_token=bad token',
    },
  });

  assert.equal(token, null);
});

test('extractCuratorJwt reads HttpOnly curator cookie when bearer is absent', () => {
  const token = extractCuratorJwt({
    headers: {
      cookie: `heys_session_token=session-token-1234567890; heys_curator_jwt=${encodeURIComponent('header.payload.signature')}`,
    },
  });

  assert.equal(token, 'header.payload.signature');
});

test('extractCuratorJwt prefers Authorization bearer over curator cookie', () => {
  const token = extractCuratorJwt({
    headers: {
      authorization: 'Bearer curator-header.jwt.sig',
      cookie: 'heys_curator_jwt=curator-cookie.jwt.sig',
    },
  });

  assert.equal(token, 'curator-header.jwt.sig');
});
