#!/usr/bin/env node
/**
 * Fail-fast guard for a broken local toolchain before hooks call lint-staged /
 * vitest / bundle sync. Incident 2026-08-23: missing lint-staged, vitest,
 * esbuild and mass-deleted packages/* blocked commit/push with opaque errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

/** Packages pre-commit / pre-push must resolve via pnpm exec or node_modules/.bin */
export const REQUIRED_RUNTIME_PACKAGES = [
  'lint-staged',
  'vitest',
  '@commitlint/cli',
  '@vitejs/plugin-react',
  'esbuild',
];

export const WORKSPACE_MANIFEST_GLOBS = ['packages/*/package.json', 'apps/*/package.json'];

function packageJsonPath(packageName) {
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/');
    return path.join('node_modules', scope, name, 'package.json');
  }
  return path.join('node_modules', packageName, 'package.json');
}

function binShimPath(rootDir, binName) {
  const binDir = path.join(rootDir, 'node_modules', '.bin');
  if (process.platform === 'win32') {
    const cmd = path.join(binDir, `${binName}.cmd`);
    if (fs.existsSync(cmd)) return cmd;
  }
  return path.join(binDir, binName);
}

export function assertWorkspaceRuntime({
  rootDir = ROOT_DIR,
  env = process.env,
  requiredPackages = REQUIRED_RUNTIME_PACKAGES,
} = {}) {
  if (env.HEYS_SKIP_WORKSPACE_RUNTIME === '1') {
    return { ok: true, skipped: true, missingPackages: [], missingBins: [] };
  }

  const missingPackages = requiredPackages.filter(
    (name) => !fs.existsSync(path.join(rootDir, packageJsonPath(name))),
  );

  const missingBins = ['lint-staged', 'vitest'].filter((name) => {
    const shim = binShimPath(rootDir, name);
    return !fs.existsSync(shim);
  });

  if (missingPackages.length === 0 && missingBins.length === 0) {
    return { ok: true, missingPackages: [], missingBins: [] };
  }

  return { ok: false, missingPackages, missingBins };
}

function printFailure({ missingPackages, missingBins }) {
  process.stderr.write('[workspace-runtime] Local toolchain is incomplete.\n');
  if (missingPackages.length) {
    process.stderr.write('[workspace-runtime] Missing node_modules packages:\n');
    missingPackages.forEach((name) => process.stderr.write(`  - ${name}\n`));
  }
  if (missingBins.length) {
    process.stderr.write('[workspace-runtime] Missing node_modules/.bin shims:\n');
    missingBins.forEach((name) => process.stderr.write(`  - ${name}\n`));
  }
  process.stderr.write('[workspace-runtime] Fix:\n');
  process.stderr.write('  1) Stop dev:local if it holds rollup/esbuild locks (ports 3001/4001).\n');
  process.stderr.write('  2) pnpm install\n');
  process.stderr.write('  3) If packages/* were deleted locally: git restore packages/ apps/\n');
  process.stderr.write('[workspace-runtime] Override (you know runtime is fine): HEYS_SKIP_WORKSPACE_RUNTIME=1\n');
}

function main() {
  const result = assertWorkspaceRuntime();
  if (result.ok) {
    if (!result.skipped) process.stdout.write('[workspace-runtime] OK\n');
    return 0;
  }
  printFailure(result);
  return 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  process.exit(main());
}
