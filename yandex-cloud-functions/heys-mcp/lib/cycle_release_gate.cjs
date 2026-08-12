'use strict';

/**
 * Optional health features (cycle, measurements, supplements) are out of release.
 * Profiles with internalAccount:true keep access (family / test accounts).
 *
 * Removing internalAccount from heys_profile (SQL/ops only — not exposed in MCP)
 * disables optional health features and exposes the profile to the next
 * purge_health_minimization_data_v1 run.
 *
 * Keep in sync with apps/web/heys_health_features_v1.js
 */
const OPTIONAL_HEALTH_FEATURES_IN_RELEASE = false;

function isInternalAccount(profile) {
  return !!(profile && profile.internalAccount === true);
}

function isOptionalHealthFeatureAvailable(profile) {
  if (OPTIONAL_HEALTH_FEATURES_IN_RELEASE === true) return true;
  return isInternalAccount(profile);
}

/** @deprecated prefer isOptionalHealthFeatureAvailable(profile) */
function isCycleFeatureAvailableForClient(_clientId, profile) {
  return isOptionalHealthFeatureAvailable(profile);
}

/** @deprecated prefer isInternalAccount(profile) */
function isCycleTrackingExceptionClient(_clientId, profile) {
  return isInternalAccount(profile);
}

module.exports = {
  OPTIONAL_HEALTH_FEATURES_IN_RELEASE,
  isInternalAccount,
  isOptionalHealthFeatureAvailable,
  isCycleFeatureAvailableForClient,
  isCycleTrackingExceptionClient,
};
