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
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2).filter((arg) => arg !== '--'));
const verbose = args.has('--verbose');
let testsWillRunOnPush = false;

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
  return result.status || 0;
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
    status: result.status || 0,
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
  writeLine('7) Vitest pre-push cache');

  const statusArgs = ['scripts/pre-push-vitest-cache.mjs', '--status'];
  const status = runCaptured('node', statusArgs);
  printCapturedOutput(status);
  if (status.status !== 0) return failures + 1;

  const isMiss = /\bmiss\b/i.test(`${status.stdout}\n${status.stderr}`);
  if (args.has('--skip-tests') && isMiss) {
    testsWillRunOnPush = true;
    return failures;
  }

  if (!isMiss) return failures;

  const runStatus = run('node', ['scripts/pre-push-vitest-cache.mjs', '--run-if-needed']);
  if (runStatus !== 0) return failures + 1;
  return failures;
}

function main() {
  writeLine('HEYS push preflight');
  writeLine('===================');
  writeLine('');
  printGitContext();

  let failures = 0;
  const gates = [
    ['1) What\'s New gate', 'pnpm', ['prepare-release:check']],
    [
      '2) direct localStorage writes',
      'node',
      ['scripts/lint-direct-localstorage-writes.mjs', '--ref=HEAD'],
      { compactSuccess: true },
    ],
    [
      '3) unscoped client writes',
      'node',
      ['scripts/lint-unscoped-client-writes.mjs', '--ref=HEAD'],
      { compactSuccess: true },
    ],
    [
      '4) raw sessionStorage.clear guard',
      'node',
      ['scripts/lint-raw-session-clear.mjs', '--ref=HEAD'],
      { compactSuccess: true },
    ],
    ['5) bundle size budget', 'node', ['scripts/lint-bundle-size.mjs', '--ref=HEAD']],
    ['6) legacy bundles match HEAD', 'node', ['scripts/verify-legacy-bundles.mjs', '--ref=HEAD']],
  ];

  for (const [label, command, commandArgs, options] of gates) {
    if (!runGate(label, command, commandArgs, options || {})) failures += 1;
  }

  writeLine('');
  writeLine('Info: React.startTransition counter is optional diagnostics, not a blocking pre-push gate.');
  runGate('   React.startTransition counter', 'node', ['scripts/lint-react-start-transition.mjs'], {
    compactSuccess: true,
  });

  failures = runTestsIfNeeded({ failures });

  writeLine('');
  if (failures === 0) {
    if (testsWillRunOnPush) {
      writeLine('OK: blocking gates are green, but Vitest was not warmed because --skip-tests was used.');
      writeLine('Next git push will still run full apps/web Vitest unless the cache is warmed first.');
      return;
    }
    writeLine('OK: local preflight is green. Next git push should only repeat fast gates and skip Vitest if source is unchanged.');
    return;
  }

  writeError(`FAILED: ${failures} blocking gate(s) would stop git push.`);
  writeError('Common fix for release text: pnpm push:agent -- --print-command');
  process.exit(1);
}

main();
