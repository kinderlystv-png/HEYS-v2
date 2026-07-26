import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sendTelegramAlert } from '../send-telegram-alert.mjs';

test('missing Telegram secrets fail closed', async () => {
  await assert.rejects(
    sendTelegramAlert({ token: '', chatId: '', text: 'alert', fetchImpl: async () => null }),
    /TELEGRAM_BOT_TOKEN is required/,
  );
});

test('Telegram ok:false fails even when HTTP is successful', async () => {
  await assert.rejects(
    sendTelegramAlert({
      token: 'test-token',
      chatId: 'test-chat',
      text: 'alert',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: false, description: 'Bad Request: chat not found' }),
      }),
    }),
    /Telegram API rejected alert: Bad Request: chat not found/,
  );
});

test('successful response returns delivery receipt', async () => {
  const result = await sendTelegramAlert({
    token: 'test-token',
    chatId: 'test-chat',
    text: 'alert',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    }),
  });

  assert.deepEqual(result, { ok: true, messageId: 42 });
});

test('health workflow keeps four daily runs and uses fail-closed sender', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/api-health-monitor.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /cron: "0 \*\/6 \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /- "yandex-cloud-functions\/\*\*"/);
  assert.match(workflow, /node scripts\/ci\/send-telegram-alert\.mjs/);
  const alertStep = workflow.slice(workflow.indexOf('- name: Send Telegram Alert on Failure'));
  assert.doesNotMatch(alertStep.split('- name: Summary')[0], /continue-on-error:/);
});
