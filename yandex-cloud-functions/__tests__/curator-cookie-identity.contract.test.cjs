const assert = require('assert');
const crypto = require('crypto');
const Module = require('module');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'curator-cookie-contract-secret';
process.env.ALLOW_LOCALHOST_ORIGINS = '1';
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'test-public-key';
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'test-private-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'web-push') {
    return {
      setVapidDetails() {},
    };
  }
  if (request === '@aws-sdk/client-s3') {
    return {
      S3Client: class S3Client {
        async send() { return {}; }
      },
      DeleteObjectCommand: class DeleteObjectCommand {},
      PutObjectCommand: class PutObjectCommand {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function base64Url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signCuratorJwt() {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64Url({
    sub: '11111111-1111-4111-8111-111111111111',
    role: 'curator',
    email: 'curator@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${header}.${payload}.${signature}`;
}

function eventFor(path, token) {
  return {
    httpMethod: 'POST',
    path,
    headers: {
      origin: 'https://app.heyslab.ru',
      ...(token ? { cookie: `heys_curator_jwt=${encodeURIComponent(token)}` } : {}),
    },
    body: '{}',
  };
}

const modules = [
  ['messages', '../heys-api-messages/index.js', '/messages/__identity_probe__'],
  ['photos', '../heys-api-photos/index.js', '/photos/__identity_probe__'],
  ['push', '../heys-api-push/index.js', '/push/__identity_probe__'],
];

for (const [name, modulePath, path] of modules) {
  test(`${name} accepts HttpOnly curator cookie before route dispatch`, async () => {
    const { handler } = require(modulePath);
    const token = signCuratorJwt();

    const missing = await handler(eventFor(path, null));
    assert.equal(missing.statusCode, 401);
    assert.match(String(missing.body), /missing_auth/);

    const accepted = await handler(eventFor(path, token));
    assert.equal(accepted.statusCode, 404);
    assert.match(String(accepted.body), /unknown_action/);
  });
}
