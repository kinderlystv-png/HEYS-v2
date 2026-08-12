'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../lib/cycle_release_gate.cjs');

test('isInternalAccount is false without flag', () => {
  assert.equal(gate.isInternalAccount(null), false);
  assert.equal(gate.isInternalAccount({}), false);
  assert.equal(gate.isInternalAccount({ internalAccount: false }), false);
});

test('isInternalAccount is true when profile flag is set', () => {
  assert.equal(gate.isInternalAccount({ internalAccount: true }), true);
});

test('optional health features unavailable for regular profiles', () => {
  assert.equal(gate.isOptionalHealthFeatureAvailable(null), false);
  assert.equal(gate.isOptionalHealthFeatureAvailable({ cycleTrackingEnabled: true }), false);
});

test('optional health features available for internalAccount profiles', () => {
  const profile = { internalAccount: true, cycleTrackingEnabled: true };
  assert.equal(gate.isOptionalHealthFeatureAvailable(profile), true);
  assert.equal(gate.isCycleFeatureAvailableForClient('any-client-id', profile), true);
});
