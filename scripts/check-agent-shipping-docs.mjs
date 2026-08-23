#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FILES = {
  agents: 'AGENTS.md',
  claude: 'CLAUDE.md',
  runbook: 'docs/operations/AGENT_SHIPPING_RUNBOOK.md',
  package: 'package.json',
  ship: 'scripts/ship.mjs',
  pushAgent: 'scripts/push-agent.mjs',
  pushPreflight: 'scripts/push-preflight.mjs',
  integrateAgents: 'scripts/integrate-agents.mjs',
  stagingGuard: 'scripts/check-agent-staging.mjs',
  commitMsgHook: '.husky/commit-msg',
  preCommitHook: '.husky/pre-commit',
  prePushHook: '.husky/pre-push',
};

const REQUIRED_FILES = Object.values(FILES);

const PACKAGE_SCRIPT_CONTRACTS = {
  'agent:worktree': 'node scripts/agent-worktree.mjs',
  'agents:integrate': 'node scripts/integrate-agents.mjs',
  'bundle:legacy': 'node scripts/bundle-legacy.mjs',
  'bundle:legacy:auto': 'node scripts/auto-sync-legacy-bundles.mjs',
  'docs:shipping:check': 'node scripts/check-agent-shipping-docs.mjs',
  'lint:shared-cache': 'node scripts/lint-shared-cache-writes.mjs',
  'push:agent': 'node scripts/push-agent.mjs',
  'push:preflight': 'node scripts/push-preflight.mjs',
  'push:ready': 'node scripts/release-prepare-and-commit.mjs',
  'push:safe': 'node scripts/push-safe.mjs',
  ship: 'node scripts/ship.mjs',
};

const PNPM_BUILTINS = new Set([
  'add',
  'dlx',
  'exec',
  'install',
  'remove',
  'run',
  'test',
  'update',
]);

const COMMON_POLICIES = {
  'shipping-runbook-required': {
    id: 'shipping-runbook-required',
    path: FILES.runbook,
    before: ['staging', 'commit', 'production-build', 'integration', 'push', 'pr'],
    grantsPermission: false,
  },
  'commit-is-agent-discretion': {
    id: 'commit-is-agent-discretion',
    actions: ['staging', 'commit'],
    requiresDirectInstruction: false,
    since: '2026-08-09',
  },
  'commit-only-no-push': {
    id: 'commit-only-no-push',
    command: 'pnpm ship',
    requiredArgs: ['--no-push'],
    push: false,
  },
  'push-requires-grant': {
    id: 'push-requires-grant',
    taskApproval: false,
    allowedGrants: ['direct', 'session-wide-scoped'],
  },
  'hook-bypass-explicit-only': {
    id: 'hook-bypass-explicit-only',
    tokens: ['--no-verify', 'HUSKY=0'],
    requires: 'explicit-exact-operation',
  },
  'integration-never-push': {
    id: 'integration-never-push',
    command: 'pnpm agents:integrate',
    commits: true,
    push: false,
  },
};

const CODEX_MAIN_ONLY_POLICY = {
  id: 'codex-main-only',
  workBranch: 'main',
  pushTarget: 'origin/main',
  createBranches: false,
};

const POLICY_EXPECTATIONS = {
  [FILES.agents]: {
    ...COMMON_POLICIES,
    'codex-main-only': CODEX_MAIN_ONLY_POLICY,
    'agent-branch-source-only': {
      id: 'agent-branch-source-only',
      branches: ['codex/*'],
      generated: false,
      releaseArtifacts: false,
    },
  },
  [FILES.claude]: {
    ...COMMON_POLICIES,
    'agent-branch-source-only': {
      id: 'agent-branch-source-only',
      branches: ['claude/*'],
      generated: false,
      releaseArtifacts: false,
    },
  },
  [FILES.runbook]: {
    ...COMMON_POLICIES,
    'codex-main-only': CODEX_MAIN_ONLY_POLICY,
    'agent-branch-source-only': {
      id: 'agent-branch-source-only',
      branches: ['codex/*', 'claude/*'],
      generated: false,
      releaseArtifacts: false,
    },
  },
};

const HOOK_CONTRACTS = {
  [FILES.commitMsgHook]: ['pnpm exec commitlint --edit'],
  [FILES.preCommitHook]: [
    'scripts/check-workspace-runtime.mjs',
    'pnpm exec lint-staged',
    'scripts/check-agent-staging.mjs --print-mode',
    'scripts/check-staged-hygiene.mjs',
    'scripts/check-agent-staging.mjs --mode=',
    'scripts/auto-sync-legacy-bundles.mjs --mode=agent-check',
    'scripts/auto-sync-legacy-bundles.mjs --mode=integration',
    'scripts/lint-lazy-chunk-constant-access.mjs',
    'scripts/check-pricing-sync.cjs',
    'scripts/lint-sync-merge-cjs-mirror.mjs --staged',
    'scripts/lint-heys-mcp-web-mirror.mjs --staged',
    'scripts/lint-direct-localstorage-writes.mjs --auto-fix',
    'scripts/lint-raw-session-clear.mjs --auto-fix',
  ],
  [FILES.prePushHook]: [
    'HEYS_PUSH_AGENT_PRECHECKED_HEAD',
    'scripts/push-preflight.mjs --base="$base_ref" --ref=HEAD',
  ],
};

const RUNBOOK_HOOK_TERMS = [
  'workspace runtime',
  'staged-hygiene',
  'multi-zone',
  'Commitlint',
  'lint-staged',
  'source-only',
  'agent-check',
  'integration',
  'lazy-chunk',
  'pricing',
  'CommonJS mirror',
  'heys-mcp web-mirror',
  'allowlist auto-fixes',
  'push:preflight',
  'Gitleaks',
  'migration',
  'direct-localStorage',
  'unscoped-client-write',
  'raw-session-clear',
  'relevant Vitest',
];

function normalizeLineEndings(value) {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function lineNumber(text, offset) {
  return text.slice(0, Math.max(0, offset)).split('\n').length;
}

function addFailure(failures, { file, invariant, message, fix, line }) {
  failures.push({ file, invariant, message, fix, line });
}

function getText(state, file) {
  return state.files.get(file) || '';
}

function stripPolicyMarkers(text) {
  return text.replace(/^<!-- POLICY .+ -->\n?/gm, '');
}

function parsePolicyMarkers(text, file, failures) {
  const markers = new Map();
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    if (!line.includes('<!-- POLICY ')) return;
    const match = line.match(/^<!-- POLICY (.+) -->$/);
    if (!match) {
      addFailure(failures, {
        file,
        line: index + 1,
        invariant: 'policy-marker-json',
        message: 'POLICY marker must occupy one line and contain JSON.',
        fix: 'Restore the marker as <!-- POLICY {...} -->.',
      });
      return;
    }

    try {
      const parsed = JSON.parse(match[1]);
      if (!parsed.id || typeof parsed.id !== 'string') {
        throw new Error('missing string id');
      }
      const current = markers.get(parsed.id) || [];
      current.push({ value: parsed, line: index + 1 });
      markers.set(parsed.id, current);
    } catch (error) {
      addFailure(failures, {
        file,
        line: index + 1,
        invariant: 'policy-marker-json',
        message: `Invalid POLICY JSON: ${error.message}.`,
        fix: 'Use valid single-line JSON and keep the required policy id.',
      });
    }
  });

  return markers;
}

function validateRequiredFiles(state, failures) {
  for (const file of REQUIRED_FILES) {
    if (state.files.has(file)) continue;
    addFailure(failures, {
      file,
      invariant: 'repository-file-exists',
      message: 'Required shipping contract file is missing.',
      fix: `Restore ${file} or update the checker contract intentionally.`,
    });
  }
}

function validatePolicyMarkers(state, failures) {
  for (const [file, expectedById] of Object.entries(POLICY_EXPECTATIONS)) {
    const markers = parsePolicyMarkers(getText(state, file), file, failures);

    for (const [id, expected] of Object.entries(expectedById)) {
      const found = markers.get(id) || [];
      if (found.length !== 1) {
        addFailure(failures, {
          file,
          invariant: id,
          message: `Expected exactly one POLICY marker; found ${found.length}.`,
          fix: `Restore the canonical ${id} marker from ${FILES.runbook}.`,
        });
        continue;
      }
      if (!isDeepStrictEqual(found[0].value, expected)) {
        addFailure(failures, {
          file,
          line: found[0].line,
          invariant: id,
          message: 'POLICY marker differs from the checked shipping invariant.',
          fix: `Align the marker with the real behavior, then update docs and checker together.`,
        });
      }
    }
  }
}

function extractMarkdownLinks(text) {
  const links = [];
  const regex = /!?\[[^\]]*]\(([^)]+)\)/g;
  let match;

  while ((match = regex.exec(text))) {
    let target = match[1].trim();
    if (target.startsWith('<')) {
      const closing = target.indexOf('>');
      target = closing === -1 ? target.slice(1) : target.slice(1, closing);
    } else {
      target = target.split(/\s+["']/)[0];
    }
    links.push({ target, offset: match.index });
  }
  return links;
}

function validateRunbookLinks(state, failures) {
  const text = getText(state, FILES.runbook);
  const runbookDir = path.dirname(path.resolve(state.rootDir, FILES.runbook));

  for (const { target, offset } of extractMarkdownLinks(text)) {
    if (
      !target ||
      target.startsWith('#') ||
      /^[a-z][a-z0-9+.-]*:/i.test(target) ||
      target.startsWith('//')
    ) {
      continue;
    }

    const targetPath = target.split('#')[0].split('?')[0];
    const resolved = path.resolve(runbookDir, targetPath);
    const relative = path.relative(state.rootDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      addFailure(failures, {
        file: FILES.runbook,
        line: lineNumber(text, offset),
        invariant: 'markdown-link-exists',
        message: `Local link escapes the repository: ${target}.`,
        fix: 'Point the link to a tracked file inside the repository.',
      });
      continue;
    }

    if (!state.pathExists(resolved)) {
      addFailure(failures, {
        file: FILES.runbook,
        line: lineNumber(text, offset),
        invariant: 'markdown-link-exists',
        message: `Local link target does not exist: ${target}.`,
        fix: 'Correct the relative link or restore the referenced file.',
      });
    }
  }
}

function parsePackageJson(state, failures) {
  const text = getText(state, FILES.package);
  try {
    return JSON.parse(text);
  } catch (error) {
    addFailure(failures, {
      file: FILES.package,
      invariant: 'package-json-valid',
      message: `Cannot parse package.json: ${error.message}.`,
      fix: 'Restore valid JSON before checking shipping documentation.',
    });
    return { scripts: {} };
  }
}

function validatePackageScripts(state, failures) {
  const pkg = parsePackageJson(state, failures);
  const scripts = pkg.scripts || {};

  for (const [name, expected] of Object.entries(PACKAGE_SCRIPT_CONTRACTS)) {
    if (scripts[name] !== expected) {
      addFailure(failures, {
        file: FILES.package,
        invariant: 'package-script-contract',
        message: `"${name}" must be "${expected}", found ${JSON.stringify(scripts[name])}.`,
        fix: 'If runtime behavior changed intentionally, update the runbook and checker together.',
      });
      continue;
    }

    const nodeEntrypoint = expected.match(/^node\s+(\S+)/)?.[1];
    if (nodeEntrypoint && !state.pathExists(path.resolve(state.rootDir, nodeEntrypoint))) {
      addFailure(failures, {
        file: FILES.package,
        invariant: 'package-script-entrypoint',
        message: `"${name}" points to missing file ${nodeEntrypoint}.`,
        fix: 'Restore the entrypoint or update the package command and documentation together.',
      });
    }
  }

  const runbook = stripPolicyMarkers(getText(state, FILES.runbook));
  const mentioned = new Set();
  const regex = /\bpnpm\s+([A-Za-z][A-Za-z0-9:_-]*)/g;
  let match;
  while ((match = regex.exec(runbook))) mentioned.add(match[1]);

  for (const name of mentioned) {
    if (PNPM_BUILTINS.has(name) || Object.hasOwn(scripts, name)) continue;
    addFailure(failures, {
      file: FILES.runbook,
      invariant: 'package-script-exists',
      message: `Runbook mentions unknown package command "pnpm ${name}".`,
      fix: `Correct the command or add the "${name}" package script.`,
    });
  }
}

function validateVisiblePolicyContracts(state, failures) {
  for (const file of [FILES.agents, FILES.claude]) {
    const text = stripPolicyMarkers(getText(state, file));
    const link = `[docs/operations/AGENT_SHIPPING_RUNBOOK.md](${FILES.runbook})`;
    if (!text.includes(link)) {
      addFailure(failures, {
        file,
        invariant: 'shipping-runbook-required',
        message: 'Required Markdown link to the shipping runbook is missing.',
        fix: `Add ${link} before the shipping instructions.`,
      });
    }
  }

  const runbook = stripPolicyMarkers(getText(state, FILES.runbook));
  const commitOnlyRow = runbook
    .split('\n')
    .find((line) => /^\|\s*Commit-only, one intended staged group\s*\|/.test(line));
  if (
    !commitOnlyRow ||
    !commitOnlyRow.includes('pnpm ship') ||
    !commitOnlyRow.includes('--no-push') ||
    !/\|\s*No\s*\|$/.test(commitOnlyRow)
  ) {
    addFailure(failures, {
      file: FILES.runbook,
      invariant: 'commit-only-no-push',
      message: 'Commit-only operation must use pnpm ship with --no-push and Push=No.',
      fix: 'Restore the commit-only row to `pnpm ship "<message>" --no-push` with Push set to No.',
    });
  }

  for (const file of [FILES.agents, FILES.claude, FILES.runbook]) {
    const text = stripPolicyMarkers(getText(state, file));
    for (const token of ['--no-verify', 'HUSKY=0']) {
      if (text.includes(token)) continue;
      addFailure(failures, {
        file,
        invariant: 'hook-bypass-explicit-only',
        message: `Required hook-bypass warning does not mention ${token}.`,
        fix: `Restore the explicit prohibition for ordinary ${token} use.`,
      });
    }
  }

  const branchTerms = {
    [FILES.agents]: ['codex/*', 'source-only'],
    [FILES.claude]: ['claude/*', 'source-only'],
    [FILES.runbook]: ['codex/*', 'claude/*', 'source-only'],
  };
  for (const [file, terms] of Object.entries(branchTerms)) {
    const text = stripPolicyMarkers(getText(state, file));
    for (const term of terms) {
      if (text.includes(term)) continue;
      addFailure(failures, {
        file,
        invariant: 'agent-branch-source-only',
        message: `Source-only branch rule is missing term "${term}".`,
        fix: 'Restore the branch-specific source-only rule.',
      });
    }
  }
}

function requireOrderedTerms(text, file, invariant, terms, failures) {
  let cursor = 0;
  for (const term of terms) {
    const index = text.indexOf(term, cursor);
    if (index !== -1) {
      cursor = index + term.length;
      continue;
    }
    addFailure(failures, {
      file,
      invariant,
      message: `Required ordered hook command is missing or moved: ${term}.`,
      fix: 'If the hook changed intentionally, update the runbook and checker contract together.',
    });
  }
}

function validateHooks(state, failures) {
  for (const [file, terms] of Object.entries(HOOK_CONTRACTS)) {
    requireOrderedTerms(getText(state, file), file, 'hook-contract-current', terms, failures);
  }

  const runbook = getText(state, FILES.runbook);
  for (const term of RUNBOOK_HOOK_TERMS) {
    if (runbook.includes(term)) continue;
    addFailure(failures, {
      file: FILES.runbook,
      invariant: 'hook-contract-documented',
      message: `Runbook no longer documents active hook term "${term}".`,
      fix: 'Restore the term or update the hook summary and checker after verifying the real hook.',
    });
  }
}

function validateShipSource(state, failures) {
  const source = getText(state, FILES.ship);
  const flagIndex = source.indexOf("noPush: args.includes('--no-push')");
  const guardIndex = source.indexOf('if (flags.noPush)');
  const pushIndex = source.indexOf("run('git', ['push'");

  if (flagIndex === -1 || guardIndex === -1 || pushIndex === -1 || guardIndex > pushIndex) {
    addFailure(failures, {
      file: FILES.ship,
      invariant: 'commit-only-no-push',
      message: 'ship.mjs must parse --no-push and return before git push.',
      fix: 'Restore the --no-push guard, or update the documented commit-only flow before changing it.',
    });
  }

  if (!source.includes('noVerify: false')) {
    addFailure(failures, {
      file: FILES.ship,
      invariant: 'hook-bypass-explicit-only',
      message: 'ship.mjs no longer declares noVerify as intentionally unsupported.',
      fix: 'Keep hook bypass disabled in ship.mjs or update the safety policy explicitly.',
    });
  }

  if (/args\.includes\(\s*['"]--no-verify['"]\s*\)/.test(source)) {
    addFailure(failures, {
      file: FILES.ship,
      invariant: 'hook-bypass-explicit-only',
      message: 'ship.mjs accepts --no-verify, contrary to the documented safety invariant.',
      fix: 'Remove ordinary --no-verify support; an intentional policy change requires separate review.',
    });
  }
}

function validatePushAgentSource(state, failures) {
  const source = getText(state, FILES.pushAgent);
  const confirmation = source.indexOf("hasFlag('--confirm-push')");
  const mainGuard = source.indexOf('assertMutatingRunConfirmed();');
  const release = source.indexOf('ensureReleaseEntry();', mainGuard);
  const push = source.indexOf('push();', mainGuard);

  if (
    confirmation === -1 ||
    mainGuard === -1 ||
    release === -1 ||
    push === -1 ||
    mainGuard > release ||
    mainGuard > push
  ) {
    addFailure(failures, {
      file: FILES.pushAgent,
      invariant: 'push-requires-grant',
      message: 'Mutating push-agent flow must require --confirm-push before release or push mutations.',
      fix: 'Restore the confirmation guard before ensureReleaseEntry() and push().',
    });
  }
}

function validateSourceOnlyGuards(state, failures) {
  const staging = getText(state, FILES.stagingGuard);
  const preflight = getText(state, FILES.pushPreflight);

  if (!staging.includes('Agent branches are source-only.')) {
    addFailure(failures, {
      file: FILES.stagingGuard,
      invariant: 'agent-branch-source-only',
      message: 'The staged-file guard no longer enforces the source-only agent-branch contract.',
      fix: 'Restore the source-only staged-file failure or update policy after an explicit review.',
    });
  }

  for (const term of [
    'isGeneratedFile(file) || isReleaseFile(file)',
    'source-only push contains generated/release files',
  ]) {
    if (preflight.includes(term)) continue;
    addFailure(failures, {
      file: FILES.pushPreflight,
      invariant: 'agent-branch-source-only',
      message: `Outgoing source-only gate is missing "${term}".`,
      fix: 'Restore generated/release filtering in push preflight.',
    });
  }
}

function validateIntegrationSource(state, failures) {
  const source = getText(state, FILES.integrateAgents);
  if (!source.includes('Integration complete. Push is intentionally not run.')) {
    addFailure(failures, {
      file: FILES.integrateAgents,
      invariant: 'integration-never-push',
      message: 'Integration script no longer states that push is intentionally omitted.',
      fix: 'Restore the no-push completion contract.',
    });
  }

  const forbiddenPushPatterns = [
    /\b(?:run|runRequired)\(\s*['"]git['"]\s*,\s*\[\s*['"]push['"]/,
    /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\([^)\n]*git\s+push/,
  ];
  if (forbiddenPushPatterns.some((pattern) => pattern.test(source))) {
    addFailure(failures, {
      file: FILES.integrateAgents,
      invariant: 'integration-never-push',
      message: 'Integration script contains a direct git push invocation.',
      fix: 'Remove push from agents:integrate; run push only through a separately granted flow.',
    });
  }
}

export function loadRepositoryState({ rootDir = ROOT_DIR } = {}) {
  const files = new Map();
  for (const file of REQUIRED_FILES) {
    const absolute = path.resolve(rootDir, file);
    if (existsSync(absolute)) files.set(file, normalizeLineEndings(readFileSync(absolute, 'utf8')));
  }
  return {
    rootDir,
    files,
    pathExists: (absolutePath) => existsSync(absolutePath),
  };
}

export function validateShippingDocumentation(state) {
  const failures = [];
  validateRequiredFiles(state, failures);
  validatePolicyMarkers(state, failures);
  validateRunbookLinks(state, failures);
  validatePackageScripts(state, failures);
  validateVisiblePolicyContracts(state, failures);
  validateHooks(state, failures);
  validateShipSource(state, failures);
  validatePushAgentSource(state, failures);
  validateSourceOnlyGuards(state, failures);
  validateIntegrationSource(state, failures);
  return { failures };
}

function printFailures(failures) {
  process.stderr.write(`Agent shipping documentation check failed (${failures.length}).\n`);
  for (const failure of failures) {
    const location = failure.line ? `${failure.file}:${failure.line}` : failure.file;
    process.stderr.write(`- ${location} [${failure.invariant}] ${failure.message}\n`);
    process.stderr.write(`  Fix: ${failure.fix}\n`);
  }
}

function main() {
  const result = validateShippingDocumentation(loadRepositoryState());
  if (result.failures.length > 0) {
    printFailures(result.failures);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Agent shipping documentation: OK\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main();
