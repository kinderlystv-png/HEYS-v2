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

test('cycle unavailable for regular profiles', () => {
  assert.equal(gate.isCycleFeatureAvailable(null), false);
  assert.equal(gate.isCycleFeatureAvailable({ cycleTrackingEnabled: true }), false);
});

test('supplements and measurements available for regular profiles', () => {
  assert.equal(gate.isSupplementsFeatureAvailable(null), true);
  assert.equal(gate.isSupplementsFeatureAvailable({ supplementsTrackingEnabled: true }), true);
  assert.equal(gate.isMeasurementsFeatureAvailable(null), true);
  assert.equal(gate.isMeasurementsFeatureAvailable({ measurementsTrackingEnabled: true }), true);
});

test('internalAccount keeps cycle and measurements available', () => {
  const profile = { internalAccount: true, cycleTrackingEnabled: true };
  assert.equal(gate.isCycleFeatureAvailable(profile), true);
  assert.equal(gate.isMeasurementsFeatureAvailable(profile), true);
  assert.equal(gate.isSupplementsFeatureAvailable(profile), true);
  assert.equal(gate.isCycleFeatureAvailableForClient('any-client-id', profile), true);
});
