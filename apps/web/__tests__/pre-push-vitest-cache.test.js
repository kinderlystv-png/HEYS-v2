import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/pre-push-vitest-cache.mjs');
const scriptUrl = pathToFileURL(SCRIPT_PATH).href;

const {
  attachWorkspaceRuntime,
  detachWorkspaceRuntime,
  getCliOption,
  getDirtyAppsWebSourcesFromPorcelain,
  getMissingVitestRuntimeMessage,
  isAppsWebTestSource,
  isFilesystemReparsePoint,
  resolveVitestExecutable,
  safeRemovePath,
  sanitizeCacheRef,
  selectRelevantTests,
} = await import('../../../scripts/pre-push-vitest-cache.mjs');

function mkdirp(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeFile(target, content) {
  mkdirp(path.dirname(target));
  fs.writeFileSync(target, content);
}

function buildLinkedWorkspaceSandbox() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-prepush-ws-'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-prepush-temp-'));
  const checkoutDir = path.join(tempRoot, 'checkout');

  writeFile(path.join(workspace, 'packages', 'core', 'package.json'), '{"name":"@heys/core"}');
  writeFile(path.join(workspace, 'packages', 'api', 'package.json'), '{"name":"@heys/api"}');
  writeFile(path.join(workspace, 'scripts', 'eslint-rules', 'index.js'), 'module.exports = {};');

  mkdirp(path.join(workspace, 'node_modules', '@heys'));
  mkdirp(path.join(workspace, 'apps', 'web', 'node_modules', '@heys'));
  fs.symlinkSync(
    path.join(workspace, 'scripts', 'eslint-rules'),
    path.join(workspace, 'node_modules', '@heys', 'eslint-plugin'),
    'junction',
  );
  fs.symlinkSync(
    path.join(workspace, 'packages', 'core'),
    path.join(workspace, 'apps', 'web', 'node_modules', '@heys', 'core'),
    'junction',
  );
  fs.symlinkSync(
    path.join(workspace, 'packages', 'api'),
    path.join(workspace, 'apps', 'web', 'node_modules', '@heys', 'api'),
    'junction',
  );
  mkdirp(path.join(workspace, 'node_modules', '.bin'));
  writeFile(path.join(workspace, 'node_modules', '.bin', 'vitest.cmd'), '@echo off\n');

  mkdirp(checkoutDir);
  mkdirp(path.join(checkoutDir, 'apps', 'web'));
  const vitest = path.join(workspace, 'node_modules', '.bin', 'vitest.cmd');
  const attach = attachWorkspaceRuntime(checkoutDir, vitest);
  expect(attach.ok).toBe(true);

  const countPackageManifests = () =>
    ['core', 'api'].filter((pkg) =>
      fs.existsSync(path.join(workspace, 'packages', pkg, 'package.json')),
    ).length;

  return {
    workspace,
    tempRoot,
    checkoutDir,
    countPackageManifests,
    cleanup() {
      try {
        fs.rmSync(workspace, { recursive: true, force: true });
      } catch {
        // workspace may already be partially deleted by the unsafe path under test
      }
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // temp may already be gone
      }
    },
  };
}

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
    const vitestName = process.platform === 'win32' ? 'vitest.cmd' : 'vitest';
    const runtime = path.join(path.resolve('/runtime'), 'node_modules', '.bin', vitestName);
    const resolved = resolveVitestExecutable({
      roots: ['/clean-worktree', '/runtime'],
      existsSync: (candidate) => candidate === runtime,
    });
    expect(resolved).toBe(runtime);
  });

  it('attaches the existing workspace runtime only inside the disposable checkout', () => {
    const links = [];
    const checkoutDir = path.resolve('/tmp/clean-checkout');
    const runtimeNodeModules = path.resolve('/runtime/node_modules');
    const checkoutNodeModules = path.join(checkoutDir, 'node_modules');
    const result = attachWorkspaceRuntime(
      checkoutDir,
      path.join(runtimeNodeModules, '.bin', 'vitest'),
      {
        existsSync: (candidate) => candidate === runtimeNodeModules,
        symlinkSync: (...args) => links.push(args),
        platform: 'darwin',
      },
    );

    expect(result).toMatchObject({
      ok: true,
      runtimeNodeModules,
      checkoutNodeModules,
      created: true,
    });
    expect(links).toEqual([[runtimeNodeModules, checkoutNodeModules, 'dir']]);
  });

  it('reports the exact missing runtime before Vitest starts', () => {
    const missingRuntime = path.resolve('/missing/node_modules');
    const result = attachWorkspaceRuntime(
      path.resolve('/tmp/clean-checkout'),
      path.join(missingRuntime, '.bin', 'vitest'),
      {
        existsSync: () => false,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: `resolved workspace runtime is missing: ${missingRuntime}`,
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

  it('detects Windows junctions as detachable reparse points', () => {
    const sandbox = buildLinkedWorkspaceSandbox();
    try {
      const checkoutNm = path.join(sandbox.checkoutDir, 'node_modules');
      expect(isFilesystemReparsePoint(checkoutNm)).toBe(true);
    } finally {
      detachWorkspaceRuntime(sandbox.checkoutDir);
      safeRemovePath(sandbox.tempRoot);
      sandbox.cleanup();
    }
  });

  it('recursive rmSync follows junction chains into package sources inside the deleted tree', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-prepush-unsafe-'));
    const packagesCore = path.join(tempRoot, 'packages', 'core');
    const linkedNm = path.join(tempRoot, 'linked-nm');
    const checkoutNm = path.join(tempRoot, 'checkout', 'node_modules');

    writeFile(path.join(packagesCore, 'package.json'), '{"name":"@heys/core"}');
    mkdirp(path.join(linkedNm, '@heys'));
    fs.symlinkSync(packagesCore, path.join(linkedNm, '@heys', 'core'), 'junction');
    mkdirp(path.join(tempRoot, 'checkout'));
    fs.symlinkSync(linkedNm, checkoutNm, 'junction');

    fs.rmSync(tempRoot, { recursive: true, force: true });
    expect(fs.existsSync(path.join(packagesCore, 'package.json'))).toBe(false);
  });

  it('safeRemovePath deletes temp checkout without touching linked workspace packages', () => {
    const sandbox = buildLinkedWorkspaceSandbox();
    try {
      expect(sandbox.countPackageManifests()).toBe(2);
      safeRemovePath(sandbox.tempRoot);
      expect(fs.existsSync(sandbox.tempRoot)).toBe(false);
      expect(sandbox.countPackageManifests()).toBe(2);
      expect(fs.existsSync(path.join(sandbox.workspace, 'node_modules'))).toBe(true);
    } finally {
      sandbox.cleanup();
    }
  });

  it('detachWorkspaceRuntime plus safeRemovePath matches pre-push cleanup contract', () => {
    const sandbox = buildLinkedWorkspaceSandbox();
    try {
      detachWorkspaceRuntime(sandbox.checkoutDir);
      safeRemovePath(sandbox.tempRoot);
      expect(sandbox.countPackageManifests()).toBe(2);
      expect(fs.existsSync(path.join(sandbox.checkoutDir, 'node_modules'))).toBe(false);
    } finally {
      sandbox.cleanup();
    }
  });
});
