'use strict';

const CONTRACT_VERSION = 1;
const UUID_SCOPE_RE = /^heys_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_(.+)$/i;
const DAY_KEY_RE = /^heys_dayv2_(\d{4}-\d{2}-\d{2})$/i;
const CHECKIN_KEY_RE = /^heys_morning_checkin_progress_v1_(\d{4}-\d{2}-\d{2})$/i;
const PLANNING_KEY_RE = /^heys_planning_(projects|tasks|slots|links_v1|chrono_activities|chrono_entries|chrono_snapshots|chrono_tombstones_v1|checklists_v1|checklist_tombstones_v1|goals_v1|entity_tombstones_v1|goal_map_records_v1)$/i;
const CHECKIN_STATUSES = new Set([
  'planned',
  'saved_local',
  'synced',
  'skipped',
  'data_present',
  'missing',
  'open',
  'closed',
  'completed',
  'failed_sync',
  'editing',
  'pending',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKey(key) {
  const raw = String(key || '');
  const scoped = raw.match(UUID_SCOPE_RE);
  return scoped ? `heys_${scoped[1]}` : raw;
}

function classifyCriticalKey(key) {
  const normalizedKey = normalizeKey(key);
  if (normalizedKey === 'heys_profile') {
    return { id: 'profile', version: CONTRACT_VERSION, normalizedKey };
  }
  const day = normalizedKey.match(DAY_KEY_RE);
  if (day) {
    return { id: 'day', version: CONTRACT_VERSION, normalizedKey, dateKey: day[1] };
  }
  if (PLANNING_KEY_RE.test(normalizedKey)) {
    return { id: 'planning', version: CONTRACT_VERSION, normalizedKey };
  }
  const checkin = normalizedKey.match(CHECKIN_KEY_RE);
  if (checkin) {
    return { id: 'checkin', version: CONTRACT_VERSION, normalizedKey, dateKey: checkin[1] };
  }
  return null;
}

function payloadVersion(value, contract) {
  if (!isPlainObject(value)) return null;
  if (value._schemaVersion !== undefined) return Number(value._schemaVersion);
  if (contract.id === 'checkin' && value.version !== undefined) return Number(value.version);
  return null;
}

function meaningfulObjectKeys(value) {
  if (!isPlainObject(value)) return [];
  return Object.keys(value).filter((key) => (
    key !== '_schemaVersion'
    && key !== '_writerCid'
    && key !== 'updatedAt'
    && key !== 'savedAt'
  ));
}

function hasMeaningfulValue(value, contract) {
  if (contract.id === 'planning') return Array.isArray(value) && value.length > 0;
  if (!isPlainObject(value)) return false;
  if (contract.id === 'day') {
    return meaningfulObjectKeys(value).some((key) => key !== 'date');
  }
  return meaningfulObjectKeys(value).length > 0;
}

function pushError(errors, code, path, message) {
  errors.push({ code, path, message });
}

function validateProfile(value, errors) {
  if (!isPlainObject(value)) {
    pushError(errors, 'invalid_type', '$', 'profile must be an object');
    return;
  }
  for (const field of ['firstName', 'lastName', 'gender', 'birthDate']) {
    if (value[field] !== undefined && value[field] !== null && typeof value[field] !== 'string') {
      pushError(errors, 'invalid_field_type', `$.${field}`, `${field} must be a string`);
    }
  }
  for (const field of ['age', 'height', 'weight', 'birthYear']) {
    if (value[field] !== undefined && value[field] !== null && value[field] !== ''
        && !Number.isFinite(Number(value[field]))) {
      pushError(errors, 'invalid_field_type', `$.${field}`, `${field} must be numeric`);
    }
  }
}

function validateTombstoneMap(value, field, errors) {
  const fieldPath = `$.${field}`;
  if (!isPlainObject(value)) {
    pushError(errors, 'invalid_field_type', fieldPath, `${field} must be an object map`);
    return;
  }
  for (const [entityId, timestamp] of Object.entries(value)) {
    if (!entityId.trim()) {
      pushError(errors, 'invalid_tombstone_id', fieldPath, `${field} keys must be non-empty entity IDs`);
      continue;
    }
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
      pushError(
        errors,
        'invalid_tombstone_timestamp',
        `${fieldPath}.${entityId}`,
        `${field} values must be finite positive timestamps`,
      );
    }
  }
}

function validateDay(value, contract, errors) {
  if (!isPlainObject(value)) {
    pushError(errors, 'invalid_type', '$', 'day payload must be an object');
    return;
  }
  if (value.date !== undefined && value.date !== contract.dateKey) {
    pushError(errors, 'date_mismatch', '$.date', 'day date must match the storage key');
  }
  for (const field of ['meals', 'trainings', 'householdActivities', 'deletedMealItemIds']) {
    if (value[field] !== undefined && !Array.isArray(value[field])) {
      pushError(errors, 'invalid_field_type', `$.${field}`, `${field} must be an array`);
    }
  }
  for (const field of ['deletedMealIds', 'deletedItemIds']) {
    if (value[field] !== undefined) validateTombstoneMap(value[field], field, errors);
  }
  for (const [index, meal] of (Array.isArray(value.meals) ? value.meals : []).entries()) {
    if (!isPlainObject(meal)) {
      pushError(errors, 'invalid_item_type', `$.meals[${index}]`, 'meal must be an object');
      continue;
    }
    if (meal.items !== undefined && !Array.isArray(meal.items)) {
      pushError(errors, 'invalid_field_type', `$.meals[${index}].items`, 'meal.items must be an array');
    }
  }
}

function validatePlanning(value, contract, errors) {
  if (!Array.isArray(value)) {
    pushError(errors, 'invalid_type', '$', `${contract.normalizedKey} must be an array`);
    return;
  }
  const tombstones = /tombstones_v1$/i.test(contract.normalizedKey);
  value.forEach((item, index) => {
    const valid = tombstones
      ? (typeof item === 'string' || isPlainObject(item))
      : isPlainObject(item);
    if (!valid) {
      pushError(errors, 'invalid_item_type', `$[${index}]`, tombstones
        ? 'planning tombstone must be a string or object'
        : 'planning record must be an object');
    }
  });
}

function validateCheckin(value, contract, errors) {
  if (!isPlainObject(value)) {
    pushError(errors, 'invalid_type', '$', 'check-in progress must be an object');
    return;
  }
  if (value.dateKey !== undefined && value.dateKey !== contract.dateKey) {
    pushError(errors, 'date_mismatch', '$.dateKey', 'check-in date must match the storage key');
  }
  if (value.flowId !== undefined && typeof value.flowId !== 'string') {
    pushError(errors, 'invalid_field_type', '$.flowId', 'flowId must be a string');
  }
  if (value.plannedStepIds !== undefined
      && (!Array.isArray(value.plannedStepIds) || value.plannedStepIds.some((id) => typeof id !== 'string'))) {
    pushError(errors, 'invalid_field_type', '$.plannedStepIds', 'plannedStepIds must be an array of strings');
  }
  if (value.steps !== undefined && !isPlainObject(value.steps)) {
    pushError(errors, 'invalid_field_type', '$.steps', 'steps must be an object');
    return;
  }
  for (const [stepId, row] of Object.entries(isPlainObject(value.steps) ? value.steps : {})) {
    if (!isPlainObject(row)) {
      pushError(errors, 'invalid_item_type', `$.steps.${stepId}`, 'step state must be an object');
      continue;
    }
    if (row.status !== undefined && !CHECKIN_STATUSES.has(String(row.status))) {
      pushError(errors, 'invalid_status', `$.steps.${stepId}.status`, 'unsupported check-in step status');
    }
  }
}

function validateCriticalKvPayload(key, value, options = {}) {
  const contract = classifyCriticalKey(key);
  if (!contract) {
    return { ok: true, critical: false, contract: null, version: null, legacy: false, errors: [] };
  }

  const errors = [];
  const declaredVersion = payloadVersion(value, contract);
  if (declaredVersion !== null && declaredVersion !== CONTRACT_VERSION) {
    pushError(errors, 'unsupported_version', '$._schemaVersion', `supported version is ${CONTRACT_VERSION}`);
  }

  if (contract.id === 'profile') validateProfile(value, errors);
  if (contract.id === 'day') validateDay(value, contract, errors);
  if (contract.id === 'planning') validatePlanning(value, contract, errors);
  if (contract.id === 'checkin') validateCheckin(value, contract, errors);

  if (options.mode === 'write' && options.allowDestructive !== true
      && hasMeaningfulValue(options.currentValue, contract)
      && !hasMeaningfulValue(value, contract)) {
    pushError(errors, 'destructive_empty', '$', 'empty payload cannot replace populated critical data');
  }

  return {
    ok: errors.length === 0,
    critical: true,
    contract: contract.id,
    version: CONTRACT_VERSION,
    declaredVersion,
    legacy: declaredVersion === null,
    normalizedKey: contract.normalizedKey,
    errors,
  };
}

function normalizeCriticalKvPayloadForRead(key, value, fallback = null) {
  const result = validateCriticalKvPayload(key, value, { mode: 'read' });
  return result.ok
    ? { ...result, value }
    : { ...result, value: fallback };
}

module.exports = {
  CONTRACT_VERSION,
  classifyCriticalKey,
  normalizeKey,
  validateCriticalKvPayload,
  normalizeCriticalKvPayloadForRead,
};
