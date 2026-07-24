#!/usr/bin/env node
/**
 * push-preflight.mjs - non-mutating mirror of the HEYS pre-push gates.
 *
 * Runs the predictable local blockers before `git push`, without creating
 * commits and without pushing. When tests pass, it warms the same source-SHA
 * cache used by `.husky/pre-push`, so the following push can skip Vitest.
 * Blocking gates mirror `.husky/pre-push` and inspect committed `HEAD`, not
 * unrelated dirty worktree files from parallel agents.
 *
 * Usage:
 *   pnpm push:preflight
 *   pnpm push:preflight -- --skip-tests
 *   pnpm push:preflight -- --diagnostics
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isGeneratedFile, isReleaseFile } from './legacy-bundle-config.mjs';
import { getChangedFilesBetween } from './pre-push-vitest-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2).filter((arg) => arg !== '--'));
const verbose = args.has('--verbose');
const REF = getCliOption('--ref') || 'HEAD';
const BASE_REF = getCliOption('--base') || process.env.HEYS_PUSH_BASE_REF || '';

function getCliOption(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : '';
}

function writeLine(text = '') {
  process.stdout.write(`${text}\n`);
}

function writeError(text = '') {
  process.stderr.write(`${text}\n`);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || ROOT_DIR,
    stdio: options.stdio || 'inherit',
    encoding: options.encoding || 'utf8',
    shell: false,
    env: process.env,
  });
  return Number.isInteger(result.status) ? result.status : 1;
}

function runCaptured(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || ROOT_DIR,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
    env: process.env,
  });
  return {
    status: Number.isInteger(result.status) ? result.status : 1,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function printGitContext() {
  const branch = runCaptured('git', ['status', '--short', '--branch']);
  if (branch.stdout) writeLine(branch.stdout);
  if (branch.stderr) writeError(branch.stderr);
}

function printCapturedOutput(result) {
  if (result.stdout) writeLine(result.stdout);
  if (result.stderr) writeError(result.stderr);
}

function summarizeCapturedOutput(result) {
  const lines = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preferred = [...lines]
    .reverse()
    .find((line) => /\b(?:OK|passed|found|counter)\b/i.test(line));
  return preferred || lines.at(-1) || 'completed';
}

function runGate(label, command, commandArgs, options = {}) {
  writeLine('');
  writeLine(label);
  if (options.compactSuccess && !verbose) {
    const result = runCaptured(command, commandArgs, options);
    if (result.status === 0) {
      writeLine(`   OK: ${summarizeCapturedOutput(result)}`);
      return true;
    }
    printCapturedOutput(result);
    writeError(`   FAILED: ${command} ${commandArgs.join(' ')}`);
    return false;
  }

  const status = run(command, commandArgs, options);
  if (status === 0) {
    writeLine('   OK');
    return true;
  }
  writeError(`   FAILED: ${command} ${commandArgs.join(' ')}`);
  return false;
}

function runTestsIfNeeded({ failures }) {
  writeLine('');
  writeLine(args.has('--full') ? '7) Full Vitest preflight' : '7) Relevant Vitest tests');

  const testArgs = ['scripts/pre-push-vitest-cache.mjs', '--run-if-needed', `--ref=${REF}`];
  if (BASE_REF) testArgs.push(`--base=${BASE_REF}`);
  if (args.has('--full')) testArgs.push('--full');
  if (args.has('--skip-tests')) testArgs.push('--skip-tests');
  const runStatus = run('node', testArgs);
  if (runStatus !== 0) return failures + 1;
  return failures;
}

function runScopeGate() {
  const range = getChangedFilesBetween({ baseRef: BASE_REF, ref: REF });
  if (!range.ok) {
    writeError(`Cannot resolve outgoing range ${range.baseRef}..${range.ref}.`);
    writeError(`Next command: git fetch origin ${range.baseRef.replace(/^origin\//, '')}`);
    return false;
  }
  const forbidden = range.files.filter((file) => isGeneratedFile(file) || isReleaseFile(file));
  if (process.env.HEYS_INTEGRATION === '1' || process.env.HEYS_SHIP === '1') {
    writeLine(`   OK: explicit integration mode; ${range.files.length} outgoing file(s)`);
    return true;
  }
  if (forbidden.length === 0) {
    writeLine(`   OK: source-only range; ${range.files.length} outgoing file(s)`);
    return true;
  }
  writeError('   FAILED: source-only push contains generated/release files:');
  forbidden.forEach((file) => writeError(`     - ${file}`));
  writeError(
    '   Next command: create a source-only commit; let CI/integration rebuild generated artifacts.',
  );
  return false;
}

function runGitleaksGate() {
  const range = getChangedFilesBetween({ baseRef: BASE_REF, ref: REF });
  if (!range.ok) return false;
  if (range.files.length === 0) {
    writeLine(`2) Secret scan (${range.baseRef}..${range.ref})`);
    writeLine('   OK: no outgoing committed files');
    return true;
  }
  const version = runCaptured('gitleaks', ['version']);
  if (version.status !== 0) {
    writeError('   FAILED: gitleaks is not installed; secret scan was not started.');
    writeError('   Next command (macOS): brew install gitleaks');
    return false;
  }
  return runGate(
    `2) Secret scan (${range.baseRef}..${range.ref})`,
    'gitleaks',
    ['git', '--redact', '--no-banner', `--log-opts=${range.baseRef}..${range.ref}`, '.'],
    { compactSuccess: true },
  );
}

function runMigrationSafetyGate() {
  const range = getChangedFilesBetween({ baseRef: BASE_REF, ref: REF });
  if (!range.ok) return false;
  const migrationChanged = range.files.some(
    (file) =>
      file.startsWith('scripts/db/migrations/') ||
      file === 'scripts/db/migrate.mjs' ||
      file === 'scripts/db/migrate.test.mjs',
  );

  if (!migrationChanged) {
    writeLine('3) Migration safety');
    writeLine('   OK: no migration contract changes in outgoing range');
    return true;
  }

  return runGate(
    '3) Migration safety',
    process.execPath,
    ['--test', 'scripts/db/migrate.test.mjs'],
    { compactSuccess: true },
  );
}

function main() {
  writeLine('HEYS push preflight');
  writeLine('===================');
  writeLine('');
  printGitContext();

  let failures = 0;
  writeLine('');
  writeLine('1) Source-only scope');
  if (!runScopeGate()) failures += 1;
  if (!runGitleaksGate()) failures += 1;
  if (!runMigrationSafetyGate()) failures += 1;

  const gates = [
    [
      '4) direct localStorage writes',
      'node',
      ['scripts/lint-direct-localstorage-writes.mjs', '--ref=HEAD'],
      { compactSuccess: true },
    ],
    [
      '5) unscoped client writes',
      'node',
      ['scripts/lint-unscoped-client-writes.mjs', '--ref=HEAD'],
      { compactSuccess: true },
    ],
    [
      '6) raw sessionStorage.clear guard',
      'node',
      ['scripts/lint-raw-session-clear.mjs', '--ref=HEAD'],
      { compactSuccess: true },
    ],
  ];

  for (const [label, command, commandArgs, options] of gates) {
    if (!runGate(label, command, commandArgs, options || {})) failures += 1;
  }

  if (args.has('--diagnostics')) {
    writeLine('');
    writeLine('Diagnostics: React.startTransition counter is not a blocking pre-push gate.');
    runGate(
      '   React.startTransition counter',
      'node',
      ['scripts/lint-react-start-transition.mjs'],
      {
        compactSuccess: true,
      },
    );
  }

  failures = runTestsIfNeeded({ failures });

  writeLine('');
  if (failures === 0) {
    writeLine(
      args.has('--full')
        ? 'OK: local full preflight is green; CI will reuse the same source SHA as its deploy gate.'
        : 'OK: fast local scope/security/static/relevant-test gates are green; CI owns clean bundles and the full suite.',
    );
    return;
  }

  writeError(`FAILED: ${failures} blocking gate(s) would stop git push.`);
  writeError('Fix the single reported gate, then rerun: pnpm push:preflight');
  process.exit(1);
}

main();
