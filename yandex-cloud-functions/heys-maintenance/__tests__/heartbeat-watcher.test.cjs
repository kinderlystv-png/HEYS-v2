'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { checkHeartbeats } = require('../index.js').__test;

test('stale heartbeat inside notification latch keeps incident open', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT task,[\s\S]*FROM maintenance_heartbeat/.test(sql)) {
        return {
          rows: [{ task: 'trial_queue', silent_h: 3, max_silence: '00:15:00' }],
        };
      }
      if (/record_ops_incident/.test(sql)) return { rows: [{ result: {} }] };
      if (/UPDATE maintenance_heartbeat/.test(sql)) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await checkHeartbeats(client);

  const recordCall = calls.find(({ sql }) => /record_ops_incident/.test(sql));
  assert.ok(recordCall);
  assert.deepEqual(JSON.parse(recordCall.params[4]).stale, [
    { task: 'trial_queue', silent_h: 3, max_silence: '00:15:00' },
  ]);
  assert.equal(calls.some(({ sql }) => /resolve_ops_incident/.test(sql)), false);
  assert.equal(calls.some(({ sql }) => /claim_ops_incident_notification/.test(sql)), false);
});

test('no stale heartbeat resolves the existing incident', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT task,[\s\S]*FROM maintenance_heartbeat/.test(sql)) return { rows: [] };
      if (/resolve_ops_incident/.test(sql)) return { rows: [{ resolve_ops_incident: true }] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await checkHeartbeats(client);

  assert.equal(calls.some(({ sql }) => /resolve_ops_incident/.test(sql)), true);
  assert.equal(calls.some(({ sql }) => /record_ops_incident/.test(sql)), false);
  assert.equal(calls.some(({ sql }) => /UPDATE maintenance_heartbeat/.test(sql)), false);
});
