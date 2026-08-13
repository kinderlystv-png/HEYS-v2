'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const test = require('node:test');

const {
  fetchTelegramWithDnsFallback,
} = require('../shared/telegram-fetch');

test('Telegram API transport uses one TLS-verified request with DNS fallback', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let primaryCalls = 0;
  t.mock.method(global, 'fetch', async () => {
    primaryCalls += 1;
    throw new Error('bare fetch must not be used for Telegram API');
  });

  const requestCalls = [];
  const requestBody = [];
  let selectedAddresses = [];
  const fakeRequest = (options, onResponse) => {
    requestCalls.push(options);
    const request = new EventEmitter();
    request.write = (chunk) => requestBody.push(String(chunk));
    request.destroy = (error) => request.emit('error', error);
    request.end = () => {
      options.lookup('api.telegram.org', { all: true }, (error, addresses) => {
        if (error) {
          request.emit('error', error);
          return;
        }
        selectedAddresses = addresses;
        const response = Readable.from([
          JSON.stringify({ ok: true, result: { message_id: 1 } }),
        ]);
        response.statusCode = 200;
        onResponse(response);
      });
    };
    return request;
  };
  const fakeLookup = (_hostname, options, callback) => {
    assert.deepEqual(options, { all: true, verbatim: true });
    callback(null, [{ address: '149.154.166.110', family: 4 }]);
  };

  const payload = JSON.stringify({ chat_id: 123456, text: 'hello' });
  const response = await fetchTelegramWithDnsFallback(
    'https://api.telegram.org/bottest-token/sendMessage',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    },
    100,
    fakeRequest,
    fakeLookup,
  );

  assert.equal(primaryCalls, 0);
  assert.equal(requestCalls.length, 1);
  assert.equal(requestCalls[0].hostname, 'api.telegram.org');
  assert.equal(requestCalls[0].servername, 'api.telegram.org');
  assert.equal(requestCalls[0].rejectUnauthorized, true);
  assert.equal(requestCalls[0].autoSelectFamily, true);
  assert.equal(requestCalls[0].autoSelectFamilyAttemptTimeout, 250);
  assert.equal(requestCalls[0].path, '/bottest-token/sendMessage');
  assert.equal(requestBody.join(''), payload);
  assert.deepEqual(selectedAddresses, [
    { address: '149.154.166.110', family: 4 },
    { address: '149.154.167.220', family: 4 },
  ]);
  assert.deepEqual(await response.json(), { ok: true, result: { message_id: 1 } });
});

test('Telegram fallback rejects non-telegram hosts', async () => {
  await assert.rejects(
    fetchTelegramWithDnsFallback('https://example.com/bot/sendMessage'),
    /only supports https:\/\/api\.telegram\.org/,
  );
});
