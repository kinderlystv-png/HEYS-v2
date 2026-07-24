import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const RELEASE_FEATURES_PATH = path.join(ROOT_DIR, 'apps', 'web', 'heys_release_features_v1.js');

function loadReleaseFeatures({
  source = fs.readFileSync(RELEASE_FEATURES_PATH, 'utf8'),
  filename = RELEASE_FEATURES_PATH,
} = {}) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename });

  const config = sandbox.HEYS?.ReleaseFeatures;
  if (!config || typeof config.whatsNewEnabled !== 'boolean') {
    throw new Error(
      `Invalid release feature config in ${path.relative(ROOT_DIR, filename)}: ` +
        'expected boolean whatsNewEnabled',
    );
  }
  return Object.freeze({ whatsNewEnabled: config.whatsNewEnabled });
}

const releaseFeatures = loadReleaseFeatures();

function isWhatsNewEnabled(config = releaseFeatures) {
  return config?.whatsNewEnabled === true;
}

export { isWhatsNewEnabled, loadReleaseFeatures, RELEASE_FEATURES_PATH, releaseFeatures };
