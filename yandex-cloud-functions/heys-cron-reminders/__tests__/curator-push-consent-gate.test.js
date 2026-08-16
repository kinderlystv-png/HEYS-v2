const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const CRON_PATH = path.join(ROOT, 'index.js');

function loadCron(webpush) {
  delete require.cache[CRON_PATH];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'web-push') return webpush;
    if (request === './shared/db-pool') return { getPool: () => ({ connect: async () => ({ release() {} }) }) };
    if (request === './shared/secrets') return { initSecrets: async () => {} };
    if (request === './shared/lockbox-client') return { getSecret: async () => null };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(CRON_PATH);
  } finally {
    Module._load = originalLoad;
  }
}

describe('curator push send gate', () => {
  it('skips send without live curator consent and traces push_consent_missing', async () => {
    const sent = [];
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args);
      originalWarn.apply(console, args);
    };
    const cron = loadCron({
      setVapidDetails() {},
      sendNotification: async (sub, payload) => {
        sent.push({ sub, payload });
        return {};
      },
    });
    const queries = [];
    const client = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (/curator_consents/.test(sql)) return { rows: [{ ok: false }] };
        if (/curator_push_subscriptions/.test(sql)) {
          return { rows: [{ id: 'sub-1', endpoint: 'https://example/ep', p256dh: 'k', auth: 'a' }] };
        }
        return { rows: [] };
      },
    };
    try {
      const result = await cron._test.sendToCurator(client, 'curator-1', { title: 't', body: 'b' });
      assert.equal(result.skipped, 'push_consent_missing');
      assert.equal(result.sent, 0);
      assert.equal(sent.length, 0);
      assert.equal(queries.some((q) => /curator_push_subscriptions/.test(q.sql)), false);
      assert.equal(
        warnings.some((args) => JSON.stringify(args).includes('push_consent_missing')),
        true,
      );
    } finally {
      console.warn = originalWarn;
      delete require.cache[CRON_PATH];
    }
  });

  it('sends when curator consent is live', async () => {
    const sent = [];
    const cron = loadCron({
      setVapidDetails() {},
      sendNotification: async (sub, payload) => {
        sent.push({ sub, payload });
        return {};
      },
    });
    const client = {
      async query(sql) {
        if (/curator_consents/.test(sql)) return { rows: [{ ok: true }] };
        if (/curator_push_subscriptions/.test(sql)) {
          return { rows: [{ id: 'sub-1', endpoint: 'https://example/ep', p256dh: 'k', auth: 'a' }] };
        }
        return { rows: [] };
      },
    };
    try {
      const result = await cron._test.sendToCurator(client, 'curator-1', { title: 't', body: 'b' });
      assert.equal(result.skipped, undefined);
      assert.equal(result.sent, 1);
      assert.equal(sent.length, 1);
    } finally {
      delete require.cache[CRON_PATH];
    }
  });

  it('does not hardcode a curator UUID in the send path', () => {
    const source = fs.readFileSync(CRON_PATH, 'utf8');
    assert.match(source, /curatorHasLivePushConsent/);
    assert.doesNotMatch(source, /d1118a83-aea1-4c3b-b7e5-0272f62ec63f/);
    assert.doesNotMatch(source, /6d4dbb32-fd9d-45b3-8e01-512595e2cb2c/);
  });
});
