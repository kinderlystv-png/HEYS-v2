#!/usr/bin/env node
/**
 * push-agent.mjs — non-interactive push helper for coding agents.
 *
 * This keeps the normal pre-push guards intact, but avoids the common loop:
 * git push -> whats-new rejection -> manual follow-up -> git push again.
 *
 * Usage:
 *   pnpm push:agent -- --confirm-push --title="..." --item-title="..." --item-description="..."
 *   pnpm push:agent -- --confirm-push --title="..." --items='[{"type":"fix","title":"...","description":"..."}]'
 *   pnpm push:agent -- --dry-run --title="..." --item-title="..." --item-description="..."
 *   pnpm push:agent -- --confirm-push --title="..." --item-title="..." --item-description="..."
 *   pnpm push:agent -- --confirm-push --remote=origin --branch=main ...
 *   pnpm push:agent -- --status
 *   pnpm push:agent -- --print-command
 *   pnpm push:agent -- --confirm-push --no-push ...
 *   pnpm push:agent -- --confirm-push --no-watch ...
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PREPARE_RELEASE = path.join(__dirname, 'prepare-release.mjs');
const RELEASE_META_PATH_RE = /^apps\/web\/public\/whats-new(?:\.json|\/)/;
const DEFAULT_DEPLOY_WORKFLOW = 'Deploy to Yandex Cloud';

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

function assertMutatingRunConfirmed() {
  if (hasFlag('--dry-run') || hasFlag('--status') || hasFlag('--print-command')) return;
  if (hasFlag('--confirm-push')) return;

  writeError('push-agent requires explicit --confirm-push for mutating runs.');
  writeError('This helper can create a whats-new follow-up commit and run git push.');
  writeError('Preview only: pnpm push:agent -- --dry-run --no-push --title="..." --item-title="..." --item-description="..."');
  writeError('Template: pnpm push:agent -- --print-command');
  process.exit(2);
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

function runGh(ghArgs, options = {}) {
  return run('gh', ghArgs, options);
}

function checkWhatsNew() {
  return runNode(PREPARE_RELEASE, ['--check']);
}

function getGitOutput(gitArgs) {
  const result = runGit(gitArgs, { stdio: 'pipe' });
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

function getStagedFiles() {
  const out = getGitOutput(['diff', '--cached', '--name-only']);
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getNonReleaseMetaStagedFiles(files = getStagedFiles()) {
  return files.filter((file) => !RELEASE_META_PATH_RE.test(file));
}

function getStatusShortLines(statusText) {
  return String(statusText || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function getWorkingTreeStatusLines() {
  return getStatusShortLines(getGitOutput(['status', '--short']));
}

function buildItemsJson() {
  return buildItemsJsonFromOptions({
    items: getOption('--items'),
    itemTitle: getOption('--item-title'),
    itemDescription: getOption('--item-description'),
    itemType: getOption('--item-type') || 'fix',
  });
}

// Improvement D: auto-собрать whats-new entry из непокрытых commit messages.
// Считает коммиты с последнего deployed-build (через build-meta.json) или
// HEAD~N если нет deployed. Группирует по type: feat/fix берёт первое
// user-facing описание для item-title, остальные собирает в description.
//
// Возвращает {title, items, source} либо null если auto-detect не сработал.
function tryAutoFromCommits() {
  try {
    // Простейший range: коммиты в HEAD которых нет в origin/main (т.е. для push'a).
    let range = 'origin/main..HEAD';
    let commits;
    try {
      commits = getGitOutput(['log', range, '--pretty=format:%s|%h']).split('\n').filter(Boolean);
    } catch {
      // Fallback на HEAD~20
      try {
        commits = getGitOutput(['log', '-20', '--pretty=format:%s|%h']).split('\n').filter(Boolean);
        range = 'HEAD~20..HEAD';
      } catch { return null; }
    }
    if (commits.length === 0) return null;

    // Парсим commit messages (conventional commits).
    const parsed = commits.map(line => {
      const [subject, hash] = line.split('|');
      const m = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject || '');
      if (!m) return { type: 'chore', scope: null, subject: subject || '', hash, raw: subject };
      return { type: m[1], scope: m[2] || null, breaking: !!m[3], subject: m[4], hash, raw: subject };
    });

    // User-facing types: feat, fix, perf. Остальные (chore/docs/test/refactor) — technical.
    const userFacing = parsed.filter(c => ['feat', 'fix', 'perf'].includes(c.type));
    // Skip release/whats-new коммиты сами.
    const meaningful = parsed.filter(c => c.type !== 'chore' || !/release/i.test(c.scope || ''));

    if (meaningful.length === 0) return null;

    // Strategy: если есть feat/fix — берём первый как item, остальные user-facing — bullet'ы.
    // Если только chore/docs/test — single technical entry.
    let title, items;
    if (userFacing.length > 0) {
      const primary = userFacing[0];
      title = humanizeCommit(primary);
      const description = userFacing.length > 1
        ? userFacing.map(c => '• ' + humanizeCommit(c)).join('\n')
        : (primary.subject + (primary.scope ? ` (зона: ${primary.scope})` : ''));
      items = [{
        type: primary.type,
        title,
        description,
      }];
    } else {
      // Technical-only batch.
      title = 'Технические улучшения';
      items = [{
        type: 'improvement',
        title: 'Улучшили внутренние процессы',
        description: meaningful.slice(0, 5).map(c => '• ' + (c.scope ? `[${c.scope}] ` : '') + c.subject).join('\n'),
      }];
    }

    return {
      title,
      items: JSON.stringify(items),
      source: `auto-from-commits: ${parsed.length} коммитов (${range})`,
      meaningful,
    };
  } catch (e) {
    return null;
  }
}

function humanizeCommit(c) {
  // Перевести conventional commit subject в человеко-читаемый.
  // Просто берём subject, scope добавляем в скобки.
  const scopePart = c.scope ? ` (${c.scope})` : '';
  return c.subject + scopePart;
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
  writeError(`  ${buildSuggestedCommand()}`);
  writeError(
    '  pnpm push:agent -- --confirm-push --title="..." --items=\'[{"type":"fix","title":"...","description":"..."}]\'',
  );
  writeError(
    '  pnpm push:agent -- --dry-run --title="..." --item-title="..." --item-description="..."',
  );
  writeError('');
  writeError('Copy guidance: apps/web/WHATS_NEW_COPY.md');
  process.exit(2);
}

function buildPrepareReleaseAutoArgs(title, itemsJson, options = {}) {
  const args = ['--auto', '--allow-user-facing-auto'];
  if (options.range) args.push(`--range=${options.range}`);
  args.push(`--covered-commits=${options.coveredCommits || 'auto'}`);
  args.push(`--title=${title}`, `--items=${itemsJson}`);
  return args;
}

function buildSuggestedCommand() {
  const hash = getGitOutput(['rev-parse', '--short=8', 'HEAD']) || '<hash>';
  return (
    `pnpm push:agent -- --confirm-push --title="Короткий пользовательский заголовок" ` +
    `--item-title="Что стало работать корректнее" ` +
    `--item-description="Что изменилось для пользователя. Target commit: ${hash}."`
  );
}

function printSuggestedCommandAndExit() {
  writeLine('Suggested non-interactive command:');
  writeLine(buildSuggestedCommand());
  writeLine('');
  writeLine('Copy guidance: apps/web/WHATS_NEW_COPY.md');
  process.exit(0);
}

function getPushTarget() {
  return {
    remote: getOption('--remote') || 'origin',
    branch: getOption('--branch') || getGitOutput(['branch', '--show-current']) || 'main',
  };
}

function getDeployWatchConfig() {
  return {
    workflow: getOption('--workflow') || DEFAULT_DEPLOY_WORKFLOW,
    waitSeconds: Number(getOption('--watch-wait-seconds') || 5),
    lookupAttempts: Number(getOption('--watch-lookup-attempts') || 6),
    intervalSeconds: Number(getOption('--watch-interval') || 20),
  };
}

function shouldWatchDeploy(branch) {
  if (hasFlag('--no-watch') || hasFlag('--no-push') || hasFlag('--dry-run')) return false;
  if (hasFlag('--watch')) return true;
  return branch === 'main';
}

function sleepSeconds(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  if (safeSeconds <= 0) return;
  run('sleep', [String(safeSeconds)], { stdio: 'ignore' });
}

function parseJsonArray(text) {
  try {
    const parsed = JSON.parse(String(text || ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findDeployRunForHead({ workflow, branch, headSha }) {
  const result = runGh(
    [
      'run',
      'list',
      `--workflow=${workflow}`,
      `--branch=${branch}`,
      '--limit',
      '10',
      '--json',
      'databaseId,headSha,status,conclusion,url',
    ],
    { stdio: 'pipe' },
  );
  if (result.status !== 0) return null;

  const runs = parseJsonArray(result.stdout);
  return runs.find((runItem) => {
    const runHead = String(runItem?.headSha || '');
    return runHead && (runHead === headSha || runHead.startsWith(headSha));
  }) || null;
}

function waitForDeploy({ branch, headSha }) {
  if (!shouldWatchDeploy(branch)) return;

  const { workflow, waitSeconds, lookupAttempts, intervalSeconds } = getDeployWatchConfig();
  writeLine('');
  writeLine(`Watching "${workflow}" deploy for ${branch}@${headSha.slice(0, 8)}...`);

  sleepSeconds(waitSeconds);

  let runItem = null;
  for (let attempt = 1; attempt <= lookupAttempts; attempt += 1) {
    runItem = findDeployRunForHead({ workflow, branch, headSha });
    if (runItem) break;
    if (attempt < lookupAttempts) sleepSeconds(waitSeconds);
  }

  if (!runItem) {
    writeError(`Could not find "${workflow}" run for ${branch}@${headSha.slice(0, 8)}.`);
    writeError(`Check manually: gh run list --workflow="${workflow}" --branch=${branch} --limit 5`);
    process.exit(1);
  }

  writeLine(`Deploy run: ${runItem.url || `#${runItem.databaseId}`}`);
  const watch = runGh(
    [
      'run',
      'watch',
      String(runItem.databaseId),
      '--exit-status',
      '--interval',
      String(intervalSeconds),
      '--compact',
    ],
    { mutates: true },
  );
  if (watch.status !== 0) process.exit(watch.status || 1);
  writeLine('Deploy is green.');
}

function printStatusAndExit() {
  const targetHash = getGitOutput(['rev-parse', '--short=8', 'HEAD']) || '<unknown>';
  const { remote, branch } = getPushTarget();
  const stagedFiles = getStagedFiles();
  const nonReleaseMeta = getNonReleaseMetaStagedFiles(stagedFiles);
  const dirtyLines = getWorkingTreeStatusLines();

  writeLine('Agent push status');
  writeLine(`  target hash: ${targetHash}`);
  writeLine(`  push target: ${remote} ${branch}`);
  writeLine(`  staged files: ${stagedFiles.length}`);
  writeLine(`  staged non-release files: ${nonReleaseMeta.length}`);
  writeLine(`  uncommitted files: ${dirtyLines.length}`);

  if (nonReleaseMeta.length > 0) {
    writeLine('');
    writeLine('Staged non-release files:');
    nonReleaseMeta.forEach((file) => writeLine(`  - ${file}`));
  }

  if (dirtyLines.length > 0) {
    writeLine('');
    writeLine('Uncommitted files present; only committed changes will be pushed:');
    dirtyLines.slice(0, 20).forEach((line) => writeLine(`  ${line}`));
    if (dirtyLines.length > 20) writeLine(`  ...and ${dirtyLines.length - 20} more`);
  }

  writeLine('');
  writeLine('Whats New check:');
  const check = checkWhatsNew();
  if (check.status === 0) {
    writeLine('  ok');
  } else {
    writeLine('  not ready');
    writeLine(`  suggested command: ${buildSuggestedCommand()}`);
  }
  process.exit(0);
}

function assertReleaseCommitStagingIsClean() {
  const nonReleaseMeta = getNonReleaseMetaStagedFiles();
  if (nonReleaseMeta.length === 0) return;

  writeError('Refusing to create a Whats New follow-up commit while non-release files are staged.');
  writeError('Unstage or commit these files first:');
  nonReleaseMeta.forEach((file) => writeError(`  - ${file}`));
  writeError('');
  writeError('Release follow-up commits may contain only apps/web/public/whats-new* files.');
  process.exit(2);
}

function ensureReleaseEntry() {
  writeLine('Checking Whats New...');
  const check = checkWhatsNew();
  if (check.status === 0) {
    writeLine('Whats New is already current.');
    return;
  }

  assertReleaseCommitStagingIsClean();

  let title = getOption('--title');
  let itemsJson = buildItemsJson();

  // Improvement D: если ни --title ни --items не заданы, пробуем auto-build
  // из commit messages в push-range.
  if (!title && !itemsJson) {
    const auto = tryAutoFromCommits();
    if (auto) {
      writeLine(`📝 Auto whats-new entry из commit messages:`);
      writeLine(`   source: ${auto.source}`);
      writeLine(`   title: ${auto.title}`);
      title = auto.title;
      itemsJson = auto.items;
    }
  }

  if (!title || !itemsJson) {
    printUsageAndExit();
  }

  writeLine('Creating explicit Whats New entry...');
  const autoArgs = buildPrepareReleaseAutoArgs(title, itemsJson, {
    range: getOption('--range'),
    coveredCommits: getOption('--covered-commits'),
  });
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
  assertReleaseCommitStagingIsClean();

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
  const dirtyLines = getWorkingTreeStatusLines();
  if (dirtyLines.length > 0) {
    writeLine('');
    writeLine('Warning: uncommitted files remain in the working tree and will not be pushed:');
    dirtyLines.slice(0, 20).forEach((line) => writeLine(`  ${line}`));
    if (dirtyLines.length > 20) writeLine(`  ...and ${dirtyLines.length - 20} more`);
    writeLine('');
  }

  const { remote, branch } = getPushTarget();
  const headSha = getGitOutput(['rev-parse', 'HEAD']);
  const result = runGit(['push', remote, branch], { mutates: true });
  if (result.status !== 0) process.exit(result.status || 1);
  waitForDeploy({ branch, headSha });
}

function main() {
  if (hasFlag('--status')) {
    printStatusAndExit();
  }
  if (hasFlag('--print-command')) {
    printSuggestedCommandAndExit();
  }
  assertMutatingRunConfirmed();
  ensureReleaseEntry();
  push();
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main();
}

export {
  buildItemsJsonFromOptions,
  buildPrepareReleaseAutoArgs,
  buildSuggestedCommand,
  assertMutatingRunConfirmed,
  getDeployWatchConfig,
  getNonReleaseMetaStagedFiles,
  getStatusShortLines,
  shouldWatchDeploy,
  parseCliArgs,
};
