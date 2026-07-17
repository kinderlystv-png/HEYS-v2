const test = require('node:test');
const assert = require('node:assert/strict');

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
