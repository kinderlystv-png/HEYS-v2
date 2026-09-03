import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_AGENTS_PATH = path.join(ROOT_DIR, 'AGENTS.md');
const DEFAULT_CLAUDE_PATH = path.join(ROOT_DIR, 'CLAUDE.md');

const SHARED_SECTIONS = [
  {
    id: 'context-documentation-freshness',
    heading: 'Актуальность контекстной документации',
    stopBefore: /^Tone,/u,
  },
  { id: 'project-communication', heading: 'Project-specific communication' },
  { id: 'rustore-release-flow', heading: 'RuStore mobile release — проверенный flow' },
  { id: 'training-module-completeness', heading: 'Полнота модулей: релиз без MVP' },
  {
    id: 'training-mode-architecture',
    heading: 'Архитектура тренировочных режимов: общее ядро + контент домена',
  },
  {
    id: 'smoke-simulation-required',
    heading: 'Smoke-симуляция: не просить пользователя собирать условия',
  },
  { id: 'product-ui-invariants', heading: 'Product UI invariants' },
  { id: 'landing-copy', heading: 'Landing & user-facing copy' },
  {
    id: 'product-sync-architecture',
    heading: 'Architecture invariants (read first when touching products/sync)',
  },
  { id: 'shared-tree-writes', heading: 'Запись в общее дерево' },
  { id: 'diagnostics', heading: 'Diagnostics' },
];

const DISTRIBUTED_INVARIANTS = [
  {
    id: 'production-build-permission',
    label: 'production build requires a separate direct command',
    scopes: { agents: 'Execution autonomy', claude: 'Execution autonomy' },
    markers: [/production build \(`pnpm build`\)/u, /отдельн(?:ой|ую) прям(?:ой|ую) команд/u],
  },
  {
    id: 'commit-is-agent-discretion',
    label: 'staging and commit are the agent\'s call',
    scopes: { agents: 'Execution autonomy', claude: 'Execution autonomy' },
    markers: [
      /\*\*Commit — на усмотрение агента\*\*/u,
      /не требуют отдельной команды/u,
    ],
  },
  {
    id: 'git-deploy-fact-check',
    label: 'Git/deploy fact-check before answering',
    scopes: { agents: 'Execution autonomy', claude: 'Execution autonomy' },
    markers: [/\*\*Git\/deploy fact-check before answering\.\*\*/u],
  },
  {
    id: 'session-wide-push-grant',
    label: 'session-wide push grant',
    scopes: { agents: 'Execution autonomy', claude: 'Execution autonomy' },
    markers: [/\*\*Session-wide push grant\.\*\*/u],
  },
  {
    id: 'web-ui-dev-local',
    label: 'start or reuse dev:local after web/UI changes',
    scopes: { agents: 'Local dev', claude: 'Local dev' },
    markers: [/После web\/UI изменений агент запускает `pnpm dev:local`/u],
  },
  {
    id: 'bundle-status-and-manifest',
    label: 'check status and hash/manifest around scoped bundle builds',
    scopes: { agents: 'Web/UI local QA and coder handoff', claude: 'Local dev' },
    markers: [/status(?:,| и) hash\/manifest/u],
  },
  {
    id: 'final-source-generated-report',
    label: 'report source/generated files, checks, and parallel-change risk',
    scopes: { agents: 'Web/UI local QA and coder handoff', claude: 'Local dev' },
    markers: [/source\/generated файлы, проверки и риск/u],
  },
  {
    id: 'web-ui-implementation-protocol',
    label: 'implementation protocol for non-trivial web/UI work',
    scopes: { agents: 'Web/UI local QA and coder handoff', claude: 'Local dev' },
    markers: [/«Протокол реализации»/u],
  },
  {
    id: 'smoke-simulation-required-qa',
    label: 'smoke-simulate rare flows instead of asking the user to reproduce them',
    scopes: { agents: 'Web/UI local QA and coder handoff', claude: 'Local dev' },
    markers: [/Смоук-симуляция обязательна/u],
  },
  {
    id: 'policy-parity-command',
    label: 'run the agent policy parity command after shared policy changes',
    scopes: { agents: 'Shared policy with Claude', claude: 'Shared policy with Codex' },
    markers: [/`pnpm agents:policy:check`/u],
  },
];

function normalizeMarkdown(value) {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function getSection(markdown, heading, { stopBefore } = {}) {
  const lines = normalizeMarkdown(markdown).split('\n');
  const headingLine = `## ${heading}`;
  const starts = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === headingLine) starts.push(index);
  }

  if (starts.length !== 1) {
    return {
      error:
        starts.length === 0
          ? `missing section "${heading}"`
          : `section "${heading}" occurs ${starts.length} times`,
    };
  }

  const start = starts[0];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith('## ')) {
      end = index;
      break;
    }
  }

  if (stopBefore) {
    for (let index = start + 1; index < end; index += 1) {
      if (stopBefore.test(lines[index])) {
        end = index;
        break;
      }
    }
  }

  return { value: lines.slice(start, end).join('\n').trim() };
}

function firstDifference(left, right) {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const maxLines = Math.max(leftLines.length, rightLines.length);

  for (let index = 0; index < maxLines; index += 1) {
    if (leftLines[index] !== rightLines[index]) {
      return {
        line: index + 1,
        left: leftLines[index] ?? '<missing>',
        right: rightLines[index] ?? '<missing>',
      };
    }
  }

  return null;
}

function comparePolicies({ agentsText, claudeText, agentsLabel, claudeLabel }) {
  const errors = [];

  for (const definition of SHARED_SECTIONS) {
    const agentsSection = getSection(agentsText, definition.heading, definition);
    const claudeSection = getSection(claudeText, definition.heading, definition);

    if (agentsSection.error || claudeSection.error) {
      errors.push(
        `[${definition.id}] Cannot compare ${agentsLabel} with ${claudeLabel}: ` +
          `${agentsLabel}: ${agentsSection.error ?? 'OK'}; ` +
          `${claudeLabel}: ${claudeSection.error ?? 'OK'}`,
      );
      continue;
    }

    if (agentsSection.value !== claudeSection.value) {
      const difference = firstDifference(agentsSection.value, claudeSection.value);
      errors.push(
        `[${definition.id}] Shared section "${definition.heading}" differs between ` +
          `${agentsLabel} and ${claudeLabel} at section line ${difference.line}:\n` +
          `  ${agentsLabel}: ${JSON.stringify(difference.left)}\n` +
          `  ${claudeLabel}: ${JSON.stringify(difference.right)}`,
      );
    }
  }

  for (const invariant of DISTRIBUTED_INVARIANTS) {
    const sources = [
      { key: 'agents', text: agentsText, label: agentsLabel },
      { key: 'claude', text: claudeText, label: claudeLabel },
    ];

    for (const source of sources) {
      const scopeHeading = invariant.scopes[source.key];
      const section = getSection(source.text, scopeHeading);

      if (section.error) {
        errors.push(
          `[${invariant.id}] Cannot verify "${invariant.label}" between ` +
            `${agentsLabel} and ${claudeLabel}: ${source.label}: ${section.error}`,
        );
        continue;
      }

      for (const marker of invariant.markers) {
        if (!marker.test(section.value)) {
          errors.push(
            `[${invariant.id}] Missing invariant "${invariant.label}" in ` +
              `${source.label} while comparing ${agentsLabel} with ${claudeLabel}. ` +
              `Required marker: ${marker}`,
          );
        }
      }
    }
  }

  return errors;
}

function readPolicy(filePath, ownLabel, peerLabel) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(
      `Cannot read ${ownLabel} while comparing it with ${peerLabel}: ${error.message}`,
    );
  }
}

function parseArguments(argv) {
  const positional = argv.filter((argument) => argument !== '--');

  if (positional.length !== 0 && positional.length !== 2) {
    throw new Error('Usage: node scripts/check-agent-policy-parity.mjs [AGENTS_PATH CLAUDE_PATH]');
  }

  const agentsPath = path.resolve(positional[0] ?? DEFAULT_AGENTS_PATH);
  const claudePath = path.resolve(positional[1] ?? DEFAULT_CLAUDE_PATH);
  return { agentsPath, claudePath };
}

function main() {
  const { agentsPath, claudePath } = parseArguments(process.argv.slice(2));
  const agentsRelative = path.relative(ROOT_DIR, agentsPath) || path.basename(agentsPath);
  const claudeRelative = path.relative(ROOT_DIR, claudePath) || path.basename(claudePath);
  const agentsLabel =
    agentsPath === DEFAULT_AGENTS_PATH ? 'AGENTS.md' : `AGENTS.md (${agentsRelative})`;
  const claudeLabel =
    claudePath === DEFAULT_CLAUDE_PATH ? 'CLAUDE.md' : `CLAUDE.md (${claudeRelative})`;
  const agentsText = readPolicy(agentsPath, agentsLabel, claudeLabel);
  const claudeText = readPolicy(claudePath, claudeLabel, agentsLabel);
  const errors = comparePolicies({ agentsText, claudeText, agentsLabel, claudeLabel });

  if (errors.length > 0) {
    console.error(
      `Agent policy parity check failed for ${agentsLabel} and ${claudeLabel}:\n` +
        errors.map((error) => `- ${error}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Agent policy parity OK: ${SHARED_SECTIONS.length} shared sections and ` +
      `${DISTRIBUTED_INVARIANTS.length} distributed invariants match in ` +
      `${agentsLabel} and ${claudeLabel}.`,
  );
}

try {
  main();
} catch (error) {
  console.error(`Agent policy parity check failed: ${error.message}`);
  process.exitCode = 1;
}
