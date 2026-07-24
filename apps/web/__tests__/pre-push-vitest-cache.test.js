import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/pre-push-vitest-cache.mjs');
const scriptUrl = pathToFileURL(SCRIPT_PATH).href;

const {
  attachWorkspaceRuntime,
  getCliOption,
  getDirtyAppsWebSourcesFromPorcelain,
  getMissingVitestRuntimeMessage,
  isAppsWebTestSource,
  resolveVitestExecutable,
  sanitizeCacheRef,
  selectRelevantTests,
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

  it('selects fast safety tests plus release-flow tests for gate changes', () => {
    const tests = selectRelevantTests([
      '.husky/pre-push',
      'scripts/push-agent.mjs',
      'apps/web/__tests__/custom-contract.test.js',
    ]);

    expect(tests).toContain('__tests__/heys-auth-session.test.js');
    expect(tests).toContain('__tests__/client-isolation.test.js');
    expect(tests).toContain('__tests__/push-agent.test.js');
    expect(tests).toContain('__tests__/whats-new-display.test.js');
    expect(tests).toContain('__tests__/custom-contract.test.js');
  });

  it('resolves Vitest from another linked worktree without installing dependencies again', () => {
    const runtime = path.resolve('/runtime/node_modules/.bin/vitest');
    const resolved = resolveVitestExecutable({
      roots: ['/clean-worktree', '/runtime'],
      existsSync: (candidate) => candidate === runtime,
    });
    expect(resolved).toBe(runtime);
  });

  it('attaches the existing workspace runtime only inside the disposable checkout', () => {
    const links = [];
    const result = attachWorkspaceRuntime(
      '/tmp/clean-checkout',
      '/runtime/node_modules/.bin/vitest',
      {
        existsSync: (candidate) => candidate === '/runtime/node_modules',
        symlinkSync: (...args) => links.push(args),
        platform: 'darwin',
      },
    );

    expect(result).toMatchObject({
      ok: true,
      runtimeNodeModules: '/runtime/node_modules',
      checkoutNodeModules: '/tmp/clean-checkout/node_modules',
      created: true,
    });
    expect(links).toEqual([['/runtime/node_modules', '/tmp/clean-checkout/node_modules', 'dir']]);
  });

  it('reports the exact missing runtime before Vitest starts', () => {
    const result = attachWorkspaceRuntime(
      '/tmp/clean-checkout',
      '/missing/node_modules/.bin/vitest',
      {
        existsSync: () => false,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: 'resolved workspace runtime is missing: /missing/node_modules',
    });
  });

  it('returns an empty runtime path when dependencies are genuinely absent', () => {
    expect(resolveVitestExecutable({ roots: ['/clean-worktree'], existsSync: () => false })).toBe(
      '',
    );
    expect(getMissingVitestRuntimeMessage()).toEqual([
      'Vitest was not started: executable node_modules/.bin/vitest is unavailable in this or any linked worktree.',
      'Install workspace dependencies once: pnpm install --frozen-lockfile',
    ]);
  });
});
