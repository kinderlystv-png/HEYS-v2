'use strict';

/**
 * Per-feature release gates for optional health features.
 * Profiles with internalAccount:true keep access (family / test accounts).
 *
 * Keep in sync with apps/web/heys_health_features_v1.js
 */
const CYCLE_TRACKING_IN_RELEASE = false;
const MEASUREMENTS_TRACKING_IN_RELEASE = true;
const SUPPLEMENTS_TRACKING_IN_RELEASE = true;

const OPTIONAL_HEALTH_FEATURES_IN_RELEASE = (
  CYCLE_TRACKING_IN_RELEASE
  && MEASUREMENTS_TRACKING_IN_RELEASE
  && SUPPLEMENTS_TRACKING_IN_RELEASE
);

function isInternalAccount(profile) {
  return !!(profile && profile.internalAccount === true);
}

function isFeatureInRelease(inReleaseFlag, profile) {
  if (inReleaseFlag === true) return true;
  return isInternalAccount(profile);
}

function isCycleFeatureAvailable(profile) {
  return isFeatureInRelease(CYCLE_TRACKING_IN_RELEASE, profile);
}

function isMeasurementsFeatureAvailable(profile) {
  return isFeatureInRelease(MEASUREMENTS_TRACKING_IN_RELEASE, profile);
}

function isSupplementsFeatureAvailable(profile) {
  return isFeatureInRelease(SUPPLEMENTS_TRACKING_IN_RELEASE, profile);
}

/** @deprecated prefer per-feature availability helpers */
function isOptionalHealthFeatureAvailable(profile) {
  if (OPTIONAL_HEALTH_FEATURES_IN_RELEASE === true) return true;
  return isInternalAccount(profile);
}

/** @deprecated prefer isCycleFeatureAvailable(profile) */
function isCycleFeatureAvailableForClient(_clientId, profile) {
  return isCycleFeatureAvailable(profile);
}

/** @deprecated prefer isInternalAccount(profile) */
function isCycleTrackingExceptionClient(_clientId, profile) {
  return isInternalAccount(profile);
}

module.exports = {
  CYCLE_TRACKING_IN_RELEASE,
  MEASUREMENTS_TRACKING_IN_RELEASE,
  SUPPLEMENTS_TRACKING_IN_RELEASE,
  OPTIONAL_HEALTH_FEATURES_IN_RELEASE,
  isInternalAccount,
  isFeatureInRelease,
  isCycleFeatureAvailable,
  isMeasurementsFeatureAvailable,
  isSupplementsFeatureAvailable,
  isOptionalHealthFeatureAvailable,
  isCycleFeatureAvailableForClient,
  isCycleTrackingExceptionClient,
};
