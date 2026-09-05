#!/usr/bin/env node
/**
 * Agent source-only commit with an isolated git index.
 *
 *   HEYS_COMMIT_SOURCE_ONLY=1 node scripts/git-commit-isolated.mjs -F msg.txt -- path1 path2
 *   pnpm git:commit:isolated -F msg.txt -- path1 path2
 *
 * Replaces `git commit -F … -- <paths>` which still picks up foreign staging on
 * the shared index.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { commitWithIsolatedIndex, normalizeExplicitPaths, resolveRepoRoot } from './lib/git-isolated-index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function usage() {
  process.stderr.write(
    'Usage: node scripts/git-commit-isolated.mjs (-F <msg-file> | -m <subject> [-m <body>]) -- <paths…>\n' +
      '   or: pnpm git:commit:isolated -F <msg-file> -- <paths…>\n',
  );
}

function parseArgs(argv) {
  const dashDash = argv.indexOf('--');
  const commitArgv = dashDash === -1 ? argv : argv.slice(0, dashDash);
  const paths = dashDash === -1 ? [] : argv.slice(dashDash + 1);

  if (commitArgv.length === 0 || paths.length === 0) {
    usage();
    process.exit(1);
  }

  const commitArgs = [];
  for (let i = 0; i < commitArgv.length; i += 1) {
    const arg = commitArgv[i];
    if (arg === '-F' || arg === '--file') {
      const file = commitArgv[i + 1];
      if (!file) {
        process.stderr.write('[git-commit-isolated] -F requires a message file path.\n');
        process.exit(1);
      }
      const abs = path.resolve(process.cwd(), file);
      if (!fs.existsSync(abs)) {
        process.stderr.write(`[git-commit-isolated] Message file not found: ${abs}\n`);
        process.exit(1);
      }
      commitArgs.push('-F', abs);
      i += 1;
      continue;
    }
    if (arg === '-m') {
      const msg = commitArgv[i + 1];
      if (!msg) {
        process.stderr.write('[git-commit-isolated] -m requires a message.\n');
        process.exit(1);
      }
      commitArgs.push('-m', msg);
      i += 1;
      continue;
    }
    process.stderr.write(`[git-commit-isolated] Unknown argument: ${arg}\n`);
    usage();
    process.exit(1);
  }

  if (commitArgs.length === 0) {
    usage();
    process.exit(1);
  }

  return { commitArgs, paths };
}

function main() {
  const { commitArgs, paths } = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot(ROOT_DIR);
  const normalized = normalizeExplicitPaths(paths, { repoRoot });

  if (process.env.HEYS_COMMIT_SOURCE_ONLY !== '1') {
    process.stderr.write(
      '[git-commit-isolated] Setting HEYS_COMMIT_SOURCE_ONLY=1 (source-only, no bundle rebuild in hook).\n',
    );
    process.env.HEYS_COMMIT_SOURCE_ONLY = '1';
  }

  process.stderr.write(
    `[git-commit-isolated] isolated index · paths=${normalized.length} (${normalized.join(', ')})\n`,
  );

  const { sha, staged } = commitWithIsolatedIndex({
    repoRoot,
    paths: normalized,
    commitArgs,
    env: process.env,
  });

  process.stderr.write(`[git-commit-isolated] ✅ ${sha.slice(0, 8)} · staged ${staged.length} file(s)\n`);
  process.stdout.write(`${sha}\n`);
}

const isDirectRun =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
