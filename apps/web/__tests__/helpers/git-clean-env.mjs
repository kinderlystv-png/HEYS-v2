const GIT_ENV_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
];

/** Strip hook-injected git env so temp fixture repos stay isolated. */
export function cleanGitEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of GIT_ENV_VARS) delete env[key];
  return env;
}
