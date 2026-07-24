import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'apps/web/heys_release_features_v1.js');
const HELPER_PATH = path.join(REPO_ROOT, 'scripts/release-features.mjs');
const PREPARE_RELEASE_PATH = path.join(REPO_ROOT, 'scripts/prepare-release.mjs');
const configSource = fs.readFileSync(CONFIG_PATH, 'utf8');

const { isWhatsNewEnabled, loadReleaseFeatures } = await import(pathToFileURL(HELPER_PATH).href);

describe('central release feature config', () => {
  it("keeps What's New fully disabled by default", () => {
    const config = loadReleaseFeatures();
    expect(config.whatsNewEnabled).toBe(false);
    expect(isWhatsNewEnabled(config)).toBe(false);
  });

  it('can be re-enabled by changing the single central boolean', () => {
    expect(configSource.match(/whatsNewEnabled\s*:/g)).toHaveLength(1);
    const enabledSource = configSource.replace('whatsNewEnabled: false', 'whatsNewEnabled: true');
    const enabledConfig = loadReleaseFeatures({ source: enabledSource, filename: CONFIG_PATH });
    expect(isWhatsNewEnabled(enabledConfig)).toBe(true);
  });

  it('makes prepare-release check a non-mutating success while disabled', () => {
    const before = fs.readFileSync(path.join(REPO_ROOT, 'apps/web/public/whats-new.json'), 'utf8');
    const result = spawnSync(process.execPath, [PREPARE_RELEASE_PATH, '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const after = fs.readFileSync(path.join(REPO_ROOT, 'apps/web/public/whats-new.json'), 'utf8');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("What's New disabled");
    expect(after).toBe(before);
  });
});
