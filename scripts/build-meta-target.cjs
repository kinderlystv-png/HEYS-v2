'use strict';

// Shared contract for choosing the meaningful source commit recorded in
// build-meta.json. Generated follow-up commits may contain only these files.
const BUILD_ARTIFACT_ONLY_FILE_PATTERNS = [
  /^apps\/web\/public\/whats-new\.json$/,
  /^apps\/web\/public\/whats-new\//,
  /^apps\/web\/public\/build-meta\.json$/,
  /^apps\/web\/public\/version\.json$/,
  /^apps\/web\/public\/sw\.js$/,
  /^apps\/web\/index\.html$/,
  /^apps\/web\/bundle-manifest\.json$/,
  /^apps\/web\/public\/(?:bundle-manifest|lazy-manifest)\.json$/,
  /^apps\/web\/heys_(advice|day|day_meals)_bundle_v1\.js$/,
  /^apps\/web\/heys_pwa_module_v1\.js$/,
  /^apps\/web\/public\/.*\.bundle\..*\.js(\.gz)?$/,
  /^scripts\/prepare-release\.mjs$/,
  /^scripts\/release-prepare-and-commit\.mjs$/,
  /^\.github\/workflows\/whats-new-guard\.yml$/,
];

function isBuildArtifactOnlyFile(filePath) {
  return BUILD_ARTIFACT_ONLY_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

module.exports = {
  BUILD_ARTIFACT_ONLY_FILE_PATTERNS,
  isBuildArtifactOnlyFile,
};
