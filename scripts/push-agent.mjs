#!/usr/bin/env node
/**
 * push-agent.mjs — non-interactive push helper for coding agents.
 *
 * This keeps the normal pre-push guards intact, but avoids the common loop:
 * git push -> whats-new rejection -> manual follow-up -> git push again.
 *
 * Usage:
 *   pnpm push:agent -- --title="..." --item-title="..." --item-description="..."
 *   pnpm push:agent -- --title="..." --items='[{"type":"fix","title":"...","description":"..."}]'
 *   pnpm push:agent -- --dry-run --title="..." --item-title="..." --item-description="..."
 *   pnpm push:agent -- --remote=origin --branch=main ...
 *   pnpm push:agent -- --no-push ...
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PREPARE_RELEASE = path.join(__dirname, 'prepare-release.mjs');

function normalizeArgs(argv) {
  return (Array.isArray(argv) ? argv : []).filter((arg) => arg !== '--');
}

function parseCliArgs(argv) {
  const parsedArgs = normalizeArgs(argv);
  const flags = new Set(parsedArgs.filter((arg) => arg.startsWith('--') && !arg.includes('=')));
  const options = new Map();
  for (const arg of parsedArgs) {
    if (!arg.startsWith('--') || !arg.includes('=')) continue;
    const index = arg.indexOf('=');
    options.set(arg.slice(0, index), arg.slice(index + 1));
  }
  return { raw: parsedArgs, flags, options };
}

const cli = parseCliArgs(process.argv.slice(2));

function writeLine(text = '') {
  process.stdout.write(`${text}\n`);
}

function writeError(text = '') {
  process.stderr.write(`${text}\n`);
}

function hasFlag(name) {
  return cli.flags.has(name);
}

function getOption(name) {
  return cli.options.get(name) || '';
}

function run(command, commandArgs, options = {}) {
  if (hasFlag('--dry-run') && options.mutates) {
    writeLine(`[dry-run] ${command} ${commandArgs.join(' ')}`);
    return { status: 0, stdout: '', stderr: '' };
  }
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT_DIR,
    stdio: options.stdio || 'inherit',
    encoding: options.encoding || 'utf8',
    shell: false,
    env: process.env,
  });
  return result;
}

function runNode(script, scriptArgs, options = {}) {
  return run(process.execPath, [script, ...scriptArgs], options);
}

function runGit(gitArgs, options = {}) {
  return run('git', gitArgs, options);
}

function checkWhatsNew() {
  return runNode(PREPARE_RELEASE, ['--check']);
}

function getGitOutput(gitArgs) {
  const result = runGit(gitArgs, { stdio: 'pipe' });
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

function buildItemsJson() {
  return buildItemsJsonFromOptions({
    items: getOption('--items'),
    itemTitle: getOption('--item-title'),
    itemDescription: getOption('--item-description'),
    itemType: getOption('--item-type') || 'fix',
  });
}

function buildItemsJsonFromOptions(options) {
  const explicitItems = options.items;
  if (explicitItems) {
    try {
      const parsed = JSON.parse(explicitItems);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('--items must be a non-empty JSON array');
      }
      return JSON.stringify(parsed);
    } catch (error) {
      writeError(`Invalid --items JSON: ${error.message}`);
      process.exit(2);
    }
  }

  const itemTitle = options.itemTitle;
  const itemDescription = options.itemDescription;
  const itemType = options.itemType || 'fix';
  if (!itemTitle || !itemDescription) return '';

  return JSON.stringify([
    {
      type: itemType,
      title: itemTitle,
      description: itemDescription,
    },
  ]);
}

function printUsageAndExit() {
  writeError('Whats New entry is required, but no explicit text was provided.');
  writeError('');
  writeError('Use one of:');
  writeError('  pnpm push:agent -- --title="..." --item-title="..." --item-description="..."');
  writeError(
    '  pnpm push:agent -- --title="..." --items=\'[{"type":"fix","title":"...","description":"..."}]\'',
  );
  writeError(
    '  pnpm push:agent -- --dry-run --title="..." --item-title="..." --item-description="..."',
  );
  writeError('');
  writeError('Copy guidance: apps/web/WHATS_NEW_COPY.md');
  process.exit(2);
}

function buildPrepareReleaseAutoArgs(title, itemsJson) {
  return ['--auto', '--allow-user-facing-auto', `--title=${title}`, `--items=${itemsJson}`];
}

function ensureReleaseEntry() {
  writeLine('Checking Whats New...');
  const check = checkWhatsNew();
  if (check.status === 0) {
    writeLine('Whats New is already current.');
    return;
  }

  const title = getOption('--title');
  const itemsJson = buildItemsJson();
  if (!title || !itemsJson) {
    printUsageAndExit();
  }

  writeLine('Creating explicit Whats New entry...');
  const autoArgs = buildPrepareReleaseAutoArgs(title, itemsJson);
  if (hasFlag('--dry-run')) {
    writeLine('[dry-run] Would create Whats New entry:');
    writeLine(`  title: ${title}`);
    writeLine(`  items: ${itemsJson}`);
    writeLine(`[dry-run] node ${path.relative(ROOT_DIR, PREPARE_RELEASE)} ${autoArgs.join(' ')}`);
    return;
  }

  const auto = runNode(PREPARE_RELEASE, autoArgs);
  if (auto.status !== 0) {
    writeError('prepare-release --auto failed.');
    process.exit(auto.status || 1);
  }

  const add = runGit(['add', '--', 'apps/web/public/whats-new.json', 'apps/web/public/whats-new'], {
    mutates: true,
  });
  if (add.status !== 0) process.exit(add.status || 1);

  const hasStaged = runGit(
    [
      'diff',
      '--cached',
      '--quiet',
      '--',
      'apps/web/public/whats-new.json',
      'apps/web/public/whats-new',
    ],
    {
      stdio: 'ignore',
    },
  );
  if (hasStaged.status === 1) {
    const targetHash = getGitOutput(['rev-parse', '--short=8', 'HEAD']) || 'current';
    const commit = runGit(['commit', '-m', `chore(release): add whats-new for ${targetHash}`], {
      mutates: true,
    });
    if (commit.status !== 0) process.exit(commit.status || 1);
  } else {
    writeLine('No new Whats New changes to commit.');
  }

  const recheck = checkWhatsNew();
  if (recheck.status !== 0) {
    writeError('Whats New is still not current after entry creation.');
    process.exit(recheck.status || 1);
  }
}

function push() {
  if (hasFlag('--no-push')) {
    writeLine('Prepared release entry. Push skipped because --no-push was provided.');
    return;
  }
  const remote = getOption('--remote') || 'origin';
  const branch = getOption('--branch') || getGitOutput(['branch', '--show-current']) || 'main';
  const result = runGit(['push', remote, branch], { mutates: true });
  if (result.status !== 0) process.exit(result.status || 1);
}

function main() {
  ensureReleaseEntry();
  push();
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main();
}

export { buildItemsJsonFromOptions, buildPrepareReleaseAutoArgs, parseCliArgs };
