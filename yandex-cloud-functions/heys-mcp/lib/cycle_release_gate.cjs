'use strict';

/**
 * Cycle tracking is out of release (CYCLE_TRACKING_IN_RELEASE=false on web).
 * Owner exception 2026-08-12: keep cycle for spouse account only.
 * Keep list in sync with apps/web/heys_health_features_v1.js
 */
const CYCLE_TRACKING_EXCEPTION_CLIENT_IDS = Object.freeze([
  '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc', // Александра
]);

function normalizeClientId(clientId) {
  return String(clientId || '').trim().toLowerCase();
}

function isCycleTrackingExceptionClient(clientId) {
  const id = normalizeClientId(clientId);
  if (!id) return false;
  return CYCLE_TRACKING_EXCEPTION_CLIENT_IDS.includes(id);
}

function isCycleFeatureAvailableForClient(clientId) {
  return isCycleTrackingExceptionClient(clientId);
}

module.exports = {
  CYCLE_TRACKING_EXCEPTION_CLIENT_IDS,
  isCycleTrackingExceptionClient,
  isCycleFeatureAvailableForClient,
};
