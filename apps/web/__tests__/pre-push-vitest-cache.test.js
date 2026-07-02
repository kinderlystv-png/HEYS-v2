import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/pre-push-vitest-cache.mjs');
const scriptUrl = pathToFileURL(SCRIPT_PATH).href;

const {
  getCliOption,
  getDirtyAppsWebSourcesFromPorcelain,
  isAppsWebTestSource,
  sanitizeCacheRef,
} = await import(scriptUrl);

describe('pre-push Vitest cache helpers', () => {
  it('parses --ref options without depending on process argv', () => {
    expect(getCliOption('--ref', ['node', 'script', '--ref=HEAD'])).toBe('HEAD');
    expect(getCliOption('--ref', ['node', 'script'])).toBe('');
  });

  it('keeps ref cache file names filesystem-safe', () => {
    expect(sanitizeCacheRef('HEAD')).toBe('HEAD');
    expect(sanitizeCacheRef('origin/main')).toBe('origin-main');
    expect(sanitizeCacheRef('feature/a b')).toBe('feature-a-b');
  });

  it('tracks only apps/web JS and TS source files for the test cache', () => {
    expect(isAppsWebTestSource('apps/web/heys_core_v12.js')).toBe(true);
    expect(isAppsWebTestSource('apps/web/src/App.tsx')).toBe(true);
    expect(isAppsWebTestSource('apps/web/scripts/bundle-day-core.mjs')).toBe(true);

    expect(isAppsWebTestSource('apps/web/public/boot-app.bundle.js')).toBe(false);
    expect(isAppsWebTestSource('apps/web/styles/app.css')).toBe(false);
    expect(isAppsWebTestSource('apps/landing/src/page.tsx')).toBe(false);
  });

  it('extracts dirty apps/web JS and TS files from porcelain status', () => {
    const dirty = getDirtyAppsWebSourcesFromPorcelain(`
 M apps/web/heys_core_v12.js
 M apps/web/public/boot-app.bundle.abc.js
 M apps/web/styles/app.css
R  apps/web/old.ts -> apps/web/src/new.ts
?? apps/web/src/new-helper.mjs
 M apps/landing/src/page.tsx
`);

    expect(dirty).toEqual([
      'apps/web/heys_core_v12.js',
      'apps/web/src/new.ts',
      'apps/web/src/new-helper.mjs',
    ]);
  });
});
