const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  classifyCriticalKey,
  normalizeCriticalKvPayloadForRead,
  validateCriticalKvPayload,
} = require('../kv-payload-contracts');

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

test('classifies scoped and unscoped critical keys', () => {
  assert.equal(classifyCriticalKey('heys_profile').id, 'profile');
  assert.equal(classifyCriticalKey(`heys_${CLIENT_ID}_dayv2_2026-07-18`).id, 'day');
  assert.equal(classifyCriticalKey('heys_planning_tasks').id, 'planning');
  assert.equal(classifyCriticalKey('heys_morning_checkin_progress_v1_2026-07-18').id, 'checkin');
  assert.equal(classifyCriticalKey('heys_theme'), null);
});

test('accepts unversioned legacy profile and reports contract version 1', () => {
  const result = validateCriticalKvPayload('heys_profile', { firstName: 'Антон', weight: 82 }, { mode: 'read' });
  assert.equal(result.ok, true);
  assert.equal(result.legacy, true);
  assert.equal(result.version, 1);
});

test('rejects unknown explicit schema versions', () => {
  const result = validateCriticalKvPayload('heys_profile', { _schemaVersion: 2, firstName: 'Антон' }, { mode: 'write' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'unsupported_version');
});

test('validates day shape and date against the key', () => {
  assert.equal(validateCriticalKvPayload('heys_dayv2_2026-07-18', {
    date: '2026-07-18',
    meals: [{ id: 'meal-1', items: [] }],
    trainings: [],
  }, { mode: 'write' }).ok, true);

  const mismatch = validateCriticalKvPayload('heys_dayv2_2026-07-18', {
    date: '2026-07-17',
    meals: {},
  }, { mode: 'write' });
  assert.deepEqual(mismatch.errors.map((error) => error.code), ['date_mismatch', 'invalid_field_type']);
});

test('accepts canonical day tombstone maps used by outbound sync', () => {
  const payload = {
    date: '2026-07-21',
    meals: [{
      id: 'meal-1',
      items: [{ id: 'item-1', grams: 100, updatedAt: 4000 }],
    }],
    deletedMealIds: {},
    deletedItemIds: { 'item-old': 5000 },
    updatedAt: 6000,
  };
  const before = JSON.stringify(payload);
  const result = validateCriticalKvPayload('heys_dayv2_2026-07-21', payload, { mode: 'write' });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(JSON.stringify(payload), before);
});

test('validates canonical day tombstone map entries', () => {
  assert.equal(validateCriticalKvPayload('heys_dayv2_2026-07-21', {
    date: '2026-07-21',
    meals: [],
    deletedMealIds: { 'meal-old': 4500 },
    deletedItemIds: {},
  }, { mode: 'write' }).ok, true);

  const invalidMaps = [[], null, 'item-old', 5000];
  for (const deletedItemIds of invalidMaps) {
    const result = validateCriticalKvPayload('heys_dayv2_2026-07-21', {
      date: '2026-07-21', meals: [], deletedItemIds,
    }, { mode: 'write' });
    assert.equal(result.ok, false, JSON.stringify(deletedItemIds));
    assert.equal(result.errors[0].code, 'invalid_field_type');
    assert.equal(result.errors[0].path, '$.deletedItemIds');
  }

  const invalidTimestamps = ['not-a-timestamp', {}, Number.NaN, Number.POSITIVE_INFINITY, 0, -1];
  for (const timestamp of invalidTimestamps) {
    const result = validateCriticalKvPayload('heys_dayv2_2026-07-21', {
      date: '2026-07-21', meals: [], deletedItemIds: { 'item-old': timestamp },
    }, { mode: 'write' });
    assert.equal(result.ok, false, String(timestamp));
    assert.equal(result.errors[0].code, 'invalid_tombstone_timestamp');
    assert.equal(result.errors[0].path, '$.deletedItemIds.item-old');
  }

  const emptyId = validateCriticalKvPayload('heys_dayv2_2026-07-21', {
    date: '2026-07-21', meals: [], deletedMealIds: { '  ': 5000 },
  }, { mode: 'write' });
  assert.equal(emptyId.ok, false);
  assert.equal(emptyId.errors[0].code, 'invalid_tombstone_id');
  assert.equal(emptyId.errors[0].path, '$.deletedMealIds');
});

test('keeps array contracts for day collections and legacy deletedMealItemIds', () => {
  for (const field of ['meals', 'trainings', 'householdActivities', 'deletedMealItemIds']) {
    const result = validateCriticalKvPayload('heys_dayv2_2026-07-21', {
      date: '2026-07-21',
      meals: [],
      [field]: {},
    }, { mode: 'write' });
    assert.equal(result.ok, false, field);
    assert.equal(result.errors[0].code, 'invalid_field_type');
    assert.equal(result.errors[0].path, `$.${field}`);
  }
});

test('blocks destructive replacement of populated profile, day and planning payloads', () => {
  const cases = [
    ['heys_profile', {}, { firstName: 'Антон' }],
    ['heys_dayv2_2026-07-18', { date: '2026-07-18' }, { date: '2026-07-18', meals: [{ id: 'm1' }] }],
    ['heys_planning_tasks', [], [{ id: 'task-1', title: 'Проверить отчёт' }]],
  ];
  for (const [key, value, currentValue] of cases) {
    const result = validateCriticalKvPayload(key, value, { mode: 'write', currentValue });
    assert.equal(result.ok, false, key);
    assert.equal(result.errors.at(-1).code, 'destructive_empty', key);
  }
});

test('accepts planning records and rejects scalar items', () => {
  assert.equal(validateCriticalKvPayload('heys_planning_tasks', [{ id: 'task-1' }], { mode: 'write' }).ok, true);
  assert.equal(validateCriticalKvPayload('heys_planning_tasks', ['task-1'], { mode: 'write' }).ok, false);
  assert.equal(validateCriticalKvPayload('heys_planning_entity_tombstones_v1', ['task-1'], { mode: 'write' }).ok, true);
});

test('accepts current and legacy check-in ledgers but rejects unsupported statuses', () => {
  const current = {
    version: 1,
    dateKey: '2026-07-18',
    flowId: 'flow-1',
    plannedStepIds: ['weight'],
    steps: { weight: { status: 'saved_local' }, __flow__: { status: 'open' } },
  };
  assert.equal(validateCriticalKvPayload('heys_morning_checkin_progress_v1_2026-07-18', current, { mode: 'write' }).ok, true);
  assert.equal(validateCriticalKvPayload('heys_morning_checkin_progress_v1_2026-07-18', {
    ...current,
    steps: { weight: { status: 'editing' }, __flow__: { status: 'failed_sync' } },
  }, { mode: 'write' }).ok, true);
  assert.equal(validateCriticalKvPayload('heys_morning_checkin_progress_v1_2026-07-18', {
    ...current,
    version: undefined,
  }, { mode: 'read' }).legacy, true);

  const invalid = validateCriticalKvPayload('heys_morning_checkin_progress_v1_2026-07-18', {
    ...current,
    steps: { weight: { status: 'teleported' } },
  }, { mode: 'write' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors[0].code, 'invalid_status');
});

test('read compatibility returns a fallback only for incompatible critical payloads', () => {
  const compatible = normalizeCriticalKvPayloadForRead('heys_profile', { firstName: 'Антон' }, {});
  assert.equal(compatible.ok, true);
  assert.equal(compatible.value.firstName, 'Антон');

  const incompatible = normalizeCriticalKvPayloadForRead('heys_planning_tasks', { id: 'task-1' }, []);
  assert.equal(incompatible.ok, false);
  assert.deepEqual(incompatible.value, []);
});

test('RPC and REST deployment mirrors match the shared payload contract', () => {
  const shared = readFileSync(path.join(__dirname, '..', 'kv-payload-contracts.js'), 'utf8');
  const rpc = readFileSync(path.join(__dirname, '..', '..', 'heys-api-rpc', 'shared', 'kv-payload-contracts.js'), 'utf8');
  const rest = readFileSync(path.join(__dirname, '..', '..', 'heys-api-rest', 'shared', 'kv-payload-contracts.js'), 'utf8');
  assert.equal(rpc, shared);
  assert.equal(rest, shared);
});
